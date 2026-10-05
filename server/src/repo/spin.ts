import type { ReleaseListItem, SpinOptions } from '../api-types.js';
import type { Db } from '../db/index.js';
import { likePattern, queryList } from './releases.js';

const DAY = 86_400_000;
/** A never-played record weighs like one that has sat for this many days. */
const NEVER_PLAYED_DAYS = 3650;
export const DEFAULT_SPIN_DAYS = 7;

export interface SpinPickQuery {
  /** Match any of these genres. */
  genres?: string[];
  /** Match any of these styles (moods). A record must satisfy both the genre and the style groups. */
  styles?: string[];
  format?: string;
  /** Skip records played within this many days (default 7). */
  days?: number;
  /** Only records that have never been played; overrides `days`. */
  neverPlayed?: boolean;
  /** Records already offered this session. */
  exclude?: number[];
}

/**
 * One random record matching the filters that has not been played recently, weighted toward whatever has sat
 * longest. `rand` returns [0, 1) and is injectable for tests.
 */
export function pickSpin(db: Db, q: SpinPickQuery, now: Date = new Date(), rand: () => number = Math.random): ReleaseListItem | null {
  const where = ['r.removed_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, ...p: unknown[]) => { where.push(clause); params.push(...p); };

  if (q.genres?.length) {
    add('EXISTS (SELECT 1 FROM json_each(r.genres_json) WHERE value IN (SELECT value FROM json_each(?)))', JSON.stringify(q.genres));
  }
  if (q.styles?.length) {
    add('EXISTS (SELECT 1 FROM json_each(r.styles_json) WHERE value IN (SELECT value FROM json_each(?)))', JSON.stringify(q.styles));
  }
  if (q.format) add("r.format_summary LIKE ? ESCAPE '\\'", likePattern(q.format));
  if (q.neverPlayed) {
    add('last_played_at IS NULL');
  } else {
    const cutoff = new Date(now.getTime() - (q.days ?? DEFAULT_SPIN_DAYS) * DAY).toISOString();
    add('(last_played_at IS NULL OR last_played_at < ?)', cutoff);
  }
  if (q.exclude?.length) add('r.id NOT IN (SELECT value FROM json_each(?))', JSON.stringify(q.exclude));

  const candidates = queryList(db, where, params, 'r.id');
  if (!candidates.length) return null;

  const weights = candidates.map((c) =>
    c.lastPlayedAt ? Math.max(1, (now.getTime() - Date.parse(c.lastPlayedAt)) / DAY) : NEVER_PLAYED_DAYS);
  let target = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    target -= weights[i];
    if (target < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** Genres (each with the styles used inside it) and formats available to the Pick-a-spin popup. */
export function getSpinOptions(db: Db): SpinOptions {
  const rows = db.prepare('SELECT genres_json, styles_json, format_summary FROM releases WHERE removed_at IS NULL')
    .all() as { genres_json: string; styles_json: string; format_summary: string }[];
  const genres = new Map<string, { count: number; styles: Map<string, number> }>();
  const formats = new Set<string>();
  for (const r of rows) {
    const styles = JSON.parse(r.styles_json) as string[];
    for (const g of JSON.parse(r.genres_json) as string[]) {
      const entry = genres.get(g) ?? { count: 0, styles: new Map() };
      entry.count++;
      for (const s of styles) entry.styles.set(s, (entry.styles.get(s) ?? 0) + 1);
      genres.set(g, entry);
    }
    if (r.format_summary) formats.add(r.format_summary);
  }
  const rank = <T extends { value: string; count: number }>(a: T, b: T) => b.count - a.count || a.value.localeCompare(b.value);
  return {
    genres: [...genres].map(([value, e]) => ({
      value, count: e.count,
      styles: [...e.styles].map(([v, count]) => ({ value: v, count })).sort(rank),
    })).sort(rank),
    formats: [...formats].sort(),
  };
}
