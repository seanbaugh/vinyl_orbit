import { expect, test } from 'vitest';
import type { ReleaseListItem } from '@api/api-types';
import { azKey, parseQuery, toSearchParams } from './query';

test('parseQuery fills defaults and coerces numbers', () => {
  expect(parseQuery(new URLSearchParams('genre=Rock&decade=1970&view=table'))).toEqual({
    genre: 'Rock', decade: 1970, view: 'table', size: 180, sort: 'artist', order: 'asc',
  });
});

test('parseQuery ignores invalid values', () => {
  const q = parseQuery(new URLSearchParams('sort=bogus&view=nope&decade=abc&size=9999'));
  expect(q).toMatchObject({ sort: 'artist', view: 'grid', size: 280 });
  expect(q.decade).toBeUndefined();
});

test('toSearchParams round-trips and omits defaults', () => {
  const sp = new URLSearchParams('genre=Rock&decade=1970&view=table&tag=3');
  expect(toSearchParams(parseQuery(sp)).toString()).toBe('genre=Rock&decade=1970&tag=3&view=table');
  expect(toSearchParams(parseQuery(new URLSearchParams(''))).toString()).toBe('');
});

const item = (artists: string, title: string) => ({ artists, title } as ReleaseListItem);

test('azKey ignores leading articles and buckets non-letters', () => {
  expect(azKey(item('The Beatles', 'x'), 'artist')).toBe('B');
  expect(azKey(item('x', '4 Way Street'), 'title')).toBe('#');
  expect(azKey(item('x', 'A Night at the Opera'), 'title')).toBe('N');
  expect(azKey(item('Ólafur Arnalds', 'x'), 'artist')).toBe('O');
  expect(azKey(item('x', 'x'), 'year')).toBe('');
});
