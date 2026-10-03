import type { ItunesAlbum, ItunesSong } from './itunes.js';
import { albumSim, dice, normalizeAlbum, normalizeArtist, normalizeTrack } from './normalize.js';

export interface MatchInput {
  title: string;
  artists: string;
  year: number | null;
  isVarious: boolean;
  /** Discogs rows of type 'track', in order; idx is tracks.idx. */
  tracks: { idx: number; title: string }[];
}

export interface ScoredAlbum {
  album: ItunesAlbum;
  score: number;
}

export const ALBUM_THRESHOLD = 0.6;
const TRACK_THRESHOLD = 0.75;
const FALLBACK_TRACK_THRESHOLD = 0.8;
const FALLBACK_ARTIST_THRESHOLD = 0.5;

const yearOf = (a: ItunesAlbum) => (a.releaseDate ? Number(a.releaseDate.slice(0, 4)) || null : null);

export function searchTerm(input: MatchInput): string {
  return input.isVarious ? input.title : `${input.artists} ${input.title}`;
}

export function scoreAlbums(input: MatchInput, albums: ItunesAlbum[]): ScoredAlbum[] {
  const title = normalizeAlbum(input.title);
  const artists = normalizeArtist(input.artists);
  const count = input.tracks.length;

  const scored = albums.map((album) => {
    const titleSim = albumSim(title, normalizeAlbum(album.collectionName));
    const artistSim = albumSim(artists, normalizeArtist(album.artistName));
    const y = yearOf(album);
    const yearScore = input.year && y ? Math.max(0, 1 - Math.abs(input.year - y) / 10) : 0.5;
    const countScore = 1 - Math.min(1, Math.abs(count - (album.trackCount ?? 0)) / Math.max(count, 1));
    const score = input.isVarious
      ? 0.75 * titleSim + 0.15 * yearScore + 0.1 * countScore
      : 0.5 * titleSim + 0.25 * artistSim + 0.15 * yearScore + 0.1 * countScore;
    return { album, score, yearGap: input.year && y ? Math.abs(input.year - y) : Infinity };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.yearGap - b.yearGap)
    .map(({ album, score }) => ({ album, score }));
}

/** Greedy in Discogs order: best unused song by title similarity, ties broken by closeness in running order. */
export function mapTracks(tracks: MatchInput['tracks'], songs: ItunesSong[]): Map<number, ItunesSong> {
  const ordered = songs
    .filter((s) => s.previewUrl)
    .sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0))
    .map((song, ordinal) => ({ song, ordinal, title: normalizeTrack(song.trackName) }));
  const used = new Set<number>();
  const result = new Map<number, ItunesSong>();

  tracks.forEach((track, ordinal) => {
    const title = normalizeTrack(track.title);
    let best: { song: ItunesSong; sim: number; gap: number; ordinal: number } | null = null;
    for (const cand of ordered) {
      if (used.has(cand.ordinal)) continue;
      const sim = dice(title, cand.title);
      const gap = Math.abs(cand.ordinal - ordinal);
      if (!best || sim > best.sim || (sim === best.sim && gap < best.gap)) {
        best = { song: cand.song, sim, gap, ordinal: cand.ordinal };
      }
    }
    if (best && best.sim >= TRACK_THRESHOLD) {
      used.add(best.ordinal);
      result.set(track.idx, best.song);
    }
  });
  return result;
}

export function pickFallback(trackTitle: string, artists: string, songs: ItunesSong[]): ItunesSong | null {
  const title = normalizeTrack(trackTitle);
  const artist = normalizeArtist(artists);
  let best: { song: ItunesSong; sim: number } | null = null;
  for (const song of songs) {
    if (!song.previewUrl) continue;
    if (albumSim(artist, normalizeArtist(song.artistName)) < FALLBACK_ARTIST_THRESHOLD) continue;
    const sim = dice(title, normalizeTrack(song.trackName));
    if (sim >= FALLBACK_TRACK_THRESHOLD && (!best || sim > best.sim)) best = { song, sim };
  }
  return best?.song ?? null;
}
