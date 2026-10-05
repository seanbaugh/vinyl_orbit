import type { Facet, SpinOptions } from '@api/api-types';
import type { SpinPickParams } from '../api/hooks';

export type SpinWindow = '7' | '30' | '90' | '365' | 'never';

export const DEFAULT_WINDOW: SpinWindow = '7';

export const WINDOW_LABELS: Record<SpinWindow, string> = {
  '7': '7 days', '30': '30 days', '90': '90 days', '365': 'a year', never: 'ever (never played only)',
};

export interface SpinFilters { genres: string[]; styles: string[]; format?: string; window: SpinWindow }

export function toPickParams(f: SpinFilters, exclude: number[]): SpinPickParams {
  return {
    ...(f.genres.length ? { genre: f.genres } : {}),
    ...(f.styles.length ? { style: f.styles } : {}),
    ...(f.format ? { format: f.format } : {}),
    ...(f.window === 'never' ? { neverPlayed: true } : { days: Number(f.window), neverPlayed: false }),
    exclude,
  };
}

/** Adds `value` to the list, or removes it if already there. */
export const toggle = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/** Discogs styles stand in for mood: the styles used inside the chosen genres, or the most common ones overall. */
export function moodChoices(options: SpinOptions, genres: string[], limit = 14): Facet[] {
  const totals = new Map<string, number>();
  for (const g of options.genres) {
    if (genres.length && !genres.includes(g.value)) continue;
    for (const s of g.styles) totals.set(s.value, Math.max(totals.get(s.value) ?? 0, s.count));
  }
  return [...totals].map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, limit);
}

/** The chosen moods that still apply after the genre choice changed. */
export function keepAvailableMoods(options: SpinOptions, genres: string[], styles: string[]): string[] {
  const available = new Set(moodChoices(options, genres, Infinity).map((m) => m.value));
  return styles.filter((s) => available.has(s));
}

const KINDS = ['LP', 'CD', '7"', 'Cassette'];

/** Broad format kinds present in the collection (the server matches them as a substring of the format summary). */
export function formatChoices(options: SpinOptions): string[] {
  return KINDS.filter((k) => options.formats.some((f) => f.toLowerCase().includes(k.toLowerCase())));
}
