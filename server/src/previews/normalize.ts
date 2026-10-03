// Text normalisation and similarity for matching Discogs releases to Apple Music.

const STOPWORDS = new Set(['the', 'and', 'a', 'an', 'of']);
const VERSION_WORDS = /\b(remaster|remastered|mono|stereo|version|edit|mix|single|bonus|live|from|demo|feat|ft|featuring)\b/i;

function base(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\s(feat\.?|ft\.|featuring)\s.*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeAlbum(s: string): string {
  return base(s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s-\s.*$/, ''));
}

export function normalizeTrack(s: string): string {
  const stripped = s
    .replace(/\([^)]*\)|\[[^\]]*\]/g, (seg) => (VERSION_WORDS.test(seg) ? ' ' : seg))
    .replace(/\s-\s.*$/, (suffix) => (VERSION_WORDS.test(suffix) ? '' : suffix));
  return base(stripped);
}

export function normalizeArtist(s: string): string {
  return base(s);
}

export function tokens(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter((t) => t && !STOPWORDS.has(t)));
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

export function dice(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  return (2 * overlap(ta, tb)) / (ta.size + tb.size);
}

export function containment(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  return overlap(ta, tb) / Math.min(ta.size, tb.size);
}

export function albumSim(a: string, b: string): number {
  return 0.5 * dice(a, b) + 0.5 * containment(a, b);
}
