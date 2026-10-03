import { expect, test } from 'vitest';
import { groupTracks, parseDuration, sideOf } from '../src/lib/tracks.js';
import type { TrackRow } from '../src/api-types.js';

const t = (position: string, duration: string): TrackRow =>
  ({ position, type: 'track', title: `Track ${position}`, duration, artists: '', credits: '' });
const h = (title: string): TrackRow =>
  ({ position: '', type: 'heading', title, duration: '', artists: '', credits: '' });

test('parseDuration', () => {
  expect(parseDuration('5:20')).toBe(320);
  expect(parseDuration('1:02:03')).toBe(3723);
  expect(parseDuration('')).toBeNull();
  expect(parseDuration('n/a')).toBeNull();
});

test('sideOf', () => {
  expect(sideOf('A1')).toBe('A');
  expect(sideOf('AA')).toBe('AA');
  expect(sideOf('B1a')).toBe('B');
  expect(sideOf('1-10')).toBe('Disc 1');
  expect(sideOf('3')).toBe('');
  expect(sideOf('')).toBe('');
});

test('headings attach to the following side; unknown durations give null total', () => {
  const g = groupTracks([h('Part One'), t('A1', ''), t('A2', ''), h('Part Two'), t('B6', '3:00'), t('B7', '')]);
  expect(g.map((x) => x.side)).toEqual(['A', 'B']);
  expect(g[0].tracks[0].type).toBe('heading');
  expect(g[1].tracks[0].title).toBe('Part Two');
  expect(g[0].totalSeconds).toBeNull();
  expect(g[1].totalSeconds).toBe(180);
});

test('CD disc positions group by disc', () => {
  expect(groupTracks([t('1-1', '1:00'), t('1-2', '1:00'), t('2-1', '2:00')]).map((x) => [x.side, x.totalSeconds]))
    .toEqual([['Disc 1', 120], ['Disc 2', 120]]);
});

test('numeric positions form a single untitled group', () => {
  const g = groupTracks([t('1', '1:00'), t('2', '1:00')]);
  expect(g).toHaveLength(1);
  expect(g[0].side).toBe('');
});
