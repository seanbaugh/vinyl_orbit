import type { PreviewCandidate, PreviewInfo, PreviewStatus } from '../api-types.js';
import type { Db } from '../db/index.js';
import type { ItunesAlbum, ItunesClient, ItunesSong } from './itunes.js';
import { ALBUM_THRESHOLD, mapTracks, pickFallback, scoreAlbums, searchTerm, type MatchInput } from './match.js';
import { normalizeArtist } from './normalize.js';

export class PreviewUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Apple Music lookup failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'PreviewUnavailableError';
  }
}

export interface PreviewService {
  get(releaseId: number): Promise<PreviewInfo | null>;
  candidates(releaseId: number): Promise<PreviewCandidate[] | null>;
  setAlbum(releaseId: number, appleAlbumId: number): Promise<PreviewInfo | null>;
  setNone(releaseId: number): Promise<PreviewInfo | null>;
  reset(releaseId: number): Promise<PreviewInfo | null>;
  /** Marks one cached preview as broken (e.g. its URL expired) so the next get re-maps it. */
  markFailed(releaseId: number, trackIdx: number): boolean;
}

const MAX_FALLBACK_SEARCHES = 5;
const MAX_CANDIDATES = 8;

type Mapped = Map<number, { song: ItunesSong; source: 'album' | 'search' }>;
interface MatchResult { status: PreviewStatus; album: ItunesAlbum | null; tracks: Mapped }

const artwork = (a: ItunesAlbum) => a.artworkUrl100?.replace('100x100', '300x300') ?? null;

export function createPreviewService(deps: { db: Db; itunes: ItunesClient; now?: () => Date }): PreviewService {
  const { db, itunes } = deps;
  const now = () => (deps.now ? deps.now() : new Date()).toISOString();
  const inflight = new Map<number, Promise<PreviewInfo | null>>();

  function loadInput(id: number): MatchInput | null {
    const r = db.prepare('SELECT title, artists_display AS artists, year FROM releases WHERE id = ?').get(id) as
      { title: string; artists: string; year: number | null } | undefined;
    if (!r) return null;
    const tracks = db.prepare("SELECT idx, title FROM tracks WHERE release_id = ? AND type = 'track' ORDER BY idx")
      .all(id) as { idx: number; title: string }[];
    return { ...r, isVarious: normalizeArtist(r.artists) === 'various', tracks };
  }

  function read(id: number): PreviewInfo | null {
    const m = db.prepare('SELECT * FROM preview_matches WHERE release_id = ?').get(id) as Record<string, any> | undefined;
    if (!m) return null;
    const rows = db.prepare('SELECT * FROM preview_tracks WHERE release_id = ? ORDER BY track_idx').all(id) as Record<string, any>[];
    return {
      status: m.status,
      album: m.apple_album_id
        ? { id: m.apple_album_id, name: m.album_name, artist: m.album_artist, url: m.album_url, artworkUrl: m.artwork_url }
        : null,
      tracks: Object.fromEntries(rows.map((t) => [t.track_idx, { previewUrl: t.preview_url, url: t.track_url, source: t.source }])),
      matchedAt: m.matched_at,
    };
  }

  /** A stored preview is stale when its Discogs track title changed or the track disappeared. */
  function isStale(id: number): boolean {
    return !!db.prepare(`SELECT 1 FROM preview_tracks p
                         LEFT JOIN tracks t ON t.release_id = p.release_id AND t.idx = p.track_idx
                         WHERE p.release_id = ? AND (t.title IS NULL OR t.title != p.track_title) LIMIT 1`).get(id);
  }

  /** An 'unmatched' result recorded before the latest Discogs detail sync may have been based on an old tracklist. */
  function unmatchedOutdated(id: number): boolean {
    return !!db.prepare(`SELECT 1 FROM preview_matches m JOIN releases r ON r.id = m.release_id
                         WHERE m.release_id = ? AND r.detail_synced_at IS NOT NULL AND m.matched_at < r.detail_synced_at`).get(id);
  }

  function write(id: number, input: MatchInput, result: MatchResult): PreviewInfo {
    const titles = new Map(input.tracks.map((t) => [t.idx, t.title]));
    const a = result.album;
    db.transaction(() => {
      db.prepare(`INSERT OR REPLACE INTO preview_matches
                  (release_id, status, apple_album_id, album_name, album_artist, album_url, artwork_url, matched_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, result.status, a?.collectionId ?? null, a?.collectionName ?? null, a?.artistName ?? null,
          a?.collectionViewUrl ?? null, a ? artwork(a) : null, now());
      db.prepare('DELETE FROM preview_tracks WHERE release_id = ?').run(id);
      const ins = db.prepare(`INSERT INTO preview_tracks
                              (release_id, track_idx, track_title, preview_url, track_url, apple_track_id, source)
                              VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const [idx, { song, source }] of result.tracks) {
        ins.run(id, idx, titles.get(idx) ?? '', song.previewUrl!, song.trackViewUrl ?? null, song.trackId ?? null, source);
      }
    })();
    return read(id)!;
  }

  /** Maps tracks against an album's songs, then tries per-track song searches for what's left (capped). */
  async function mapWithFallback(input: MatchInput, songs: ItunesSong[]): Promise<Mapped> {
    const mapped: Mapped = new Map([...mapTracks(input.tracks, songs)].map(([idx, song]) => [idx, { song, source: 'album' as const }]));
    const missing = input.tracks.filter((t) => !mapped.has(t.idx)).slice(0, MAX_FALLBACK_SEARCHES);
    for (const t of missing) {
      const results = await itunes.searchSongs(input.isVarious ? t.title : `${input.artists} ${t.title}`);
      const song = pickFallback(t.title, input.artists, results);
      if (song && ![...mapped.values()].some((m) => m.song.trackId === song.trackId)) mapped.set(t.idx, { song, source: 'search' });
    }
    return mapped;
  }

  async function autoMatch(input: MatchInput): Promise<MatchResult> {
    const best = scoreAlbums(input, await itunes.searchAlbums(searchTerm(input)))[0];
    const album = best && best.score >= ALBUM_THRESHOLD ? best.album : null;
    const songs = album ? (await itunes.lookupAlbum(album.collectionId)).songs : [];
    const tracks = await mapWithFallback(input, songs);
    return tracks.size ? { status: 'auto', album, tracks } : { status: 'unmatched', album: null, tracks };
  }

  async function manualMatch(input: MatchInput, appleAlbumId: number): Promise<MatchResult> {
    const { album, songs } = await itunes.lookupAlbum(appleAlbumId);
    return { status: 'manual', album, tracks: await mapWithFallback(input, songs) };
  }

  /** Runs Apple lookups, converting any failure into PreviewUnavailableError (nothing is written on failure). */
  async function guarded<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw e instanceof PreviewUnavailableError ? e : new PreviewUnavailableError(e);
    }
  }

  async function resolve(id: number): Promise<PreviewInfo | null> {
    const input = loadInput(id);
    if (!input) return null;
    const existing = read(id);
    // No tracklist yet (detail sync pending): answer without caching, so a real match happens once tracks arrive.
    if (!input.tracks.length) return existing ?? { status: 'unmatched', album: null, tracks: {}, matchedAt: now() };
    if (existing?.status === 'none') return existing;
    if (existing?.status === 'unmatched' && !unmatchedOutdated(id)) return existing;
    if (existing && existing.status !== 'unmatched' && !isStale(id)) return existing;
    if (existing?.status === 'manual' && existing.album) {
      const albumId = existing.album.id;
      return write(id, input, await guarded(() => manualMatch(input, albumId)));
    }
    return write(id, input, await guarded(() => autoMatch(input)));
  }

  return {
    get(id) {
      const running = inflight.get(id);
      if (running) return running;
      const p = resolve(id).finally(() => inflight.delete(id));
      inflight.set(id, p);
      return p;
    },
    async candidates(id) {
      const input = loadInput(id);
      if (!input) return null;
      const scored = await guarded(async () => scoreAlbums(input, await itunes.searchAlbums(searchTerm(input))));
      return scored.slice(0, MAX_CANDIDATES).map(({ album, score }) => ({
        id: album.collectionId,
        name: album.collectionName,
        artist: album.artistName,
        year: album.releaseDate ? Number(album.releaseDate.slice(0, 4)) || null : null,
        trackCount: album.trackCount,
        artworkUrl: artwork(album),
        url: album.collectionViewUrl ?? null,
        score: Math.round(score * 100) / 100,
      }));
    },
    async setAlbum(id, appleAlbumId) {
      const input = loadInput(id);
      if (!input) return null;
      return write(id, input, await guarded(() => manualMatch(input, appleAlbumId)));
    },
    async setNone(id) {
      const input = loadInput(id);
      if (!input) return null;
      return write(id, input, { status: 'none', album: null, tracks: new Map() });
    },
    markFailed(id, trackIdx) {
      // An empty stored title never equals the Discogs title, so isStale() triggers a re-map.
      return db.prepare("UPDATE preview_tracks SET track_title = '' WHERE release_id = ? AND track_idx = ?").run(id, trackIdx).changes > 0;
    },
    async reset(id) {
      const input = loadInput(id);
      if (!input) return null;
      return write(id, input, await guarded(() => autoMatch(input)));
    },
  };
}
