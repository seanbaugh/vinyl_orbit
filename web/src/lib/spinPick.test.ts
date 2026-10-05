import { expect, test } from 'vitest';
import type { SpinOptions } from '@api/api-types';
import { DEFAULT_WINDOW, formatChoices, keepAvailableMoods, moodChoices, toggle, toPickParams } from './spinPick';

const options: SpinOptions = {
  genres: [
    { value: 'Rock', count: 3, styles: [{ value: 'Prog Rock', count: 2 }, { value: 'Synth-pop', count: 1 }] },
    { value: 'Jazz', count: 2, styles: [{ value: 'Cool Jazz', count: 2 }, { value: 'Synth-pop', count: 1 }] },
  ],
  formats: ['2×LP', 'CD', 'Cassette, Album'],
};

test('defaults to a 7 day window', () => {
  expect(DEFAULT_WINDOW).toBe('7');
  expect(toPickParams({ genres: [], styles: [], window: DEFAULT_WINDOW }, [])).toEqual({ days: 7, neverPlayed: false, exclude: [] });
});

test('"never" means never played; blank filters are left out', () => {
  expect(toPickParams({ window: 'never', genres: ['Rock', 'Jazz'], styles: ['Ambient'], format: 'LP' }, [4, 5]))
    .toEqual({ genre: ['Rock', 'Jazz'], style: ['Ambient'], format: 'LP', neverPlayed: true, exclude: [4, 5] });
});

test('moods are the styles inside the chosen genre, or the most common overall when no genre is chosen', () => {
  expect(moodChoices(options, ['Jazz']).map((s) => s.value)).toEqual(['Cool Jazz', 'Synth-pop']);
  expect(moodChoices(options, []).map((s) => s.value)).toEqual(['Cool Jazz', 'Prog Rock', 'Synth-pop']);
  expect(moodChoices(options, [], 2)).toHaveLength(2);
  expect(moodChoices(options, ['Nope'])).toEqual([]);
});

test('several genres offer the moods of all of them, each once', () => {
  expect(moodChoices(options, ['Rock', 'Jazz']).map((s) => s.value)).toEqual(['Cool Jazz', 'Prog Rock', 'Synth-pop']);
});

test('toggle adds and removes a value without mutating', () => {
  const list = ['a'];
  expect(toggle(list, 'b')).toEqual(['a', 'b']);
  expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
  expect(list).toEqual(['a']);
});

test('changing genres drops chosen moods that no longer apply', () => {
  expect(keepAvailableMoods(options, ['Jazz'], ['Cool Jazz', 'Prog Rock'])).toEqual(['Cool Jazz']);
  expect(keepAvailableMoods(options, [], ['Prog Rock'])).toEqual(['Prog Rock']);
});

test('format choices only offer kinds the collection actually has', () => {
  expect(formatChoices(options)).toEqual(['LP', 'CD', 'Cassette']);
});
