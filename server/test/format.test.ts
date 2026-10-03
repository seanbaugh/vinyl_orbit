import { expect, test } from 'vitest';
import { artistsDisplay, cleanArtistName, decadeOf, formatSummary } from '../src/lib/format.js';
import type { DiscogsArtist } from '../src/discogs/types.js';

const artist = (name: string, anv = '', join = ''): DiscogsArtist => ({ name, anv, join, role: '', tracks: '', id: 1 });

test('cleanArtistName strips Discogs disambiguation suffix', () => {
  expect(cleanArtistName('John Williams (4)')).toBe('John Williams');
  expect(cleanArtistName('Chicago (2)')).toBe('Chicago');
  expect(cleanArtistName('Sly & The Family Stone')).toBe('Sly & The Family Stone');
});

test('artistsDisplay prefers ANV and honours joins', () => {
  expect(artistsDisplay([
    artist('John Williams (4)', '', ','),
    artist('London Symphony Orchestra', 'The London Symphony Orchestra'),
  ])).toBe('John Williams, The London Symphony Orchestra');
  expect(artistsDisplay([artist('Simon', '', '&'), artist('Garfunkel')])).toBe('Simon & Garfunkel');
});

test('formatSummary', () => {
  expect(formatSummary([{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Album'] }])).toBe('LP');
  expect(formatSummary([{ name: 'Vinyl', qty: '2', descriptions: ['LP', 'Album'] }])).toBe('2×LP');
  expect(formatSummary([{ name: 'Vinyl', qty: '1', descriptions: ['7"', '45 RPM', 'Single'] }])).toBe('7"');
  expect(formatSummary([{ name: 'Vinyl', qty: '2', descriptions: ['12"', '45 RPM', 'Album'] }])).toBe('2×12"');
  expect(formatSummary([{ name: 'CD', qty: '2', descriptions: ['Album'] }])).toBe('2×CD');
  expect(formatSummary([
    { name: 'Vinyl', qty: '3', descriptions: ['LP'] },
    { name: 'Box Set', qty: '1', descriptions: ['Compilation'] },
  ])).toBe('3×LP + Box');
});

test('decadeOf', () => {
  expect(decadeOf(1977)).toBe(1970);
  expect(decadeOf(0)).toBeNull();
  expect(decadeOf(null)).toBeNull();
});
