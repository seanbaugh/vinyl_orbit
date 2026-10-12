import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Db } from '../db/index.js';
import { albumSim, normalizeAlbum, normalizeArtist } from '../previews/normalize.js';

export interface HaPair { album: string; artist: string }
export interface HaOverride { album: string; artist: string; releaseId: number }

/** Best candidate must reach this score... */
export const MATCH_THRESHOLD = 0.75;
/** ...and beat the runner-up by this much, otherwise it is a miss rather than a guess. */
export const MATCH_MARGIN = 0.1;

const isOverride = (o: unknown): o is HaOverride => {
  const x = o as Partial<HaOverride> | null;
  return !!x && typeof x.album === 'string' && typeof x.artist === 'string'
    && Number.isInteger(x.releaseId) && (x.releaseId as number) > 0;
};

/** Reads a JSON list of `{ album, artist, releaseId }`. A missing or broken file means no overrides. */
export function loadOverrides(file: string): HaOverride[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(isOverride) : [];
  } catch {
    return [];
  }
}

const DEFAULTS_FILE = fileURLToPath(new URL('./overrides.default.json', import.meta.url));

/** The user's own override file (read fresh each call, so edits need no restart) ahead of the shipped defaults. */
export function loadAllOverrides(userFile: string): HaOverride[] {
  return [...loadOverrides(userFile), ...loadOverrides(DEFAULTS_FILE)];
}

const key = (p: HaPair) => `${normalizeAlbum(p.album)}|${normalizeArtist(p.artist)}`;

/** Maps the album/artist text Home Assistant holds for a tag to a release id in the collection, or null. */
export function matchRecord(db: Db, pair: HaPair, overrides: HaOverride[]): number | null {
  const album = normalizeAlbum(pair.album);
  const artist = normalizeArtist(pair.artist);
  if (!album || !artist) return null;
  const live = (id: number) => db.prepare('SELECT 1 FROM releases WHERE id = ? AND removed_at IS NULL').get(id) !== undefined;

  const wanted = key(pair);
  const override = overrides.find((o) => key(o) === wanted);
  if (override) return live(override.releaseId) ? override.releaseId : null;

  const rows = db.prepare('SELECT id, title, artists_display FROM releases WHERE removed_at IS NULL')
    .all() as { id: number; title: string; artists_display: string }[];
  const scored = rows
    .map((r) => ({
      id: r.id,
      score: 0.6 * albumSim(album, normalizeAlbum(r.title)) + 0.4 * albumSim(artist, normalizeArtist(r.artists_display)),
    }))
    .sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  if (!best || best.score < MATCH_THRESHOLD) return null;
  if (next && best.score - next.score < MATCH_MARGIN) return null;
  return best.id;
}
