import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Db } from '../db/index.js';
import { albumSim, normalizeAlbum, normalizeArtist } from '../previews/normalize.js';

export interface HaPair { album: string; artist: string }
/** What one poll of Home Assistant reads: the helpers, plus when the tag automation last ran (null if unknown). */
export interface HaReading extends HaPair { triggeredAt?: string | null }
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

const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const ROMAN = /^(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;

/** The numbers in a title: digits, plus upper-case Roman numerals of two or more letters ("VII"), so 2 equals II. */
function numbersIn(title: string): Set<number> {
  const numbers = new Set<number>();
  for (const digits of normalizeAlbum(title).match(/\d+/g) ?? []) numbers.add(Number(digits));
  const bare = title.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  for (const word of bare.match(/\b[IVXLC]{2,}\b/g) ?? []) {
    if (!ROMAN.test(word)) continue;
    let total = 0;
    for (let i = 0; i < word.length; i++) {
      const value = ROMAN_VALUES[word[i]];
      total += value < (ROMAN_VALUES[word[i + 1]] ?? 0) ? -value : value;
    }
    numbers.add(total);
  }
  return numbers;
}

const sameNumbers = (a: string, b: string) => {
  const x = numbersIn(a);
  const y = numbersIn(b);
  return x.size === y.size && [...x].every((n) => y.has(n));
};

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
    .filter((r) => sameNumbers(pair.album, r.title)) // "Symphony No 3" is never "Symphony No. 1"
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
