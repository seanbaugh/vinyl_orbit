import type { DiscogsArtist, DiscogsFormat } from '../discogs/types.js';

export function cleanArtistName(name: string): string {
  return name.replace(/\s\(\d+\)$/, '');
}

export function artistsDisplay(artists: DiscogsArtist[]): string {
  let out = '';
  artists.forEach((a, i) => {
    out += a.anv || cleanArtistName(a.name);
    if (i < artists.length - 1) {
      const join = (a.join || ',').trim();
      out += join === ',' ? ', ' : ` ${join} `;
    }
  });
  return out.trim();
}

const SIZE_LABELS = ['LP', '7"', '10"', '12"', 'EP'];

export function formatSummary(formats: DiscogsFormat[]): string {
  return formats
    .map((f) => {
      const descs = f.descriptions ?? [];
      const label = SIZE_LABELS.find((l) => descs.includes(l)) ?? (f.name === 'Box Set' ? 'Box' : f.name);
      const qty = Number(f.qty) || 1;
      return qty > 1 ? `${qty}×${label}` : label;
    })
    .join(' + ');
}

export function decadeOf(year: number | null | undefined): number | null {
  if (!year) return null;
  return Math.floor(year / 10) * 10;
}
