export type FormatFamily = 'lp' | 'cd' | 'ep' | 'single' | 'cassette' | 'box' | 'other';

/** Colour family for a format summary like "2×LP", "CD", '7"' or "3×LP + Box". */
export function formatFamily(summary: string): FormatFamily {
  if (/\bBox\b/.test(summary)) return 'box';
  if (/Cassette/.test(summary)) return 'cassette';
  if (/(^|×|\s)7"/.test(summary)) return 'single';
  if (/\bEP\b|1[02]"/.test(summary)) return 'ep';
  if (/\bCD\b/.test(summary)) return 'cd';
  if (/\bLP\b/.test(summary)) return 'lp';
  return 'other';
}

/** Class name for a coloured format badge. */
export const formatClass = (summary: string) => `fmt fmt-${formatFamily(summary)}`;
