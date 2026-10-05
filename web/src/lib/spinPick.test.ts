import { expect, test } from 'vitest';
import type { SpinOptions } from '@api/api-types';
import { DEFAULT_WINDOW, formatChoices, moodChoices, toPickParams } from './spinPick';

const options: SpinOptions = {
  genres: [
    { value: 'Rock', count: 3, styles: [{ value: 'Prog Rock', count: 2 }, { value: 'Synth-pop', count: 1 }] },
    { value: 'Jazz', count: 2, styles: [{ value: 'Cool Jazz', count: 2 }, { value: 'Synth-pop', count: 1 }] },
  ],
  formats: ['2×LP', 'CD', 'Cassette, Album'],
};

test('defaults to a 7 day window', () => {
  expect(DEFAULT_WINDOW).toBe('7');
  expect(toPickParams({ window: DEFAULT_WINDOW }, [])).toEqual({ days: 7, neverPlayed: false, exclude: [] });
});

test('"never" means never played; blank filters are left out', () => {
  expect(toPickParams({ window: 'never', genre: 'Rock', style: '', format: 'LP' }, [4, 5]))
    .toEqual({ genre: 'Rock', format: 'LP', neverPlayed: true, exclude: [4, 5] });
});

test('moods are the styles inside the chosen genre, or the most common overall when no genre is chosen', () => {
  expect(moodChoices(options, 'Jazz').map((s) => s.value)).toEqual(['Cool Jazz', 'Synth-pop']);
  expect(moodChoices(options, undefined).map((s) => s.value)).toEqual(['Cool Jazz', 'Prog Rock', 'Synth-pop']);
  expect(moodChoices(options, undefined, 2)).toHaveLength(2);
  expect(moodChoices(options, 'Nope')).toEqual([]);
});

test('format choices only offer kinds the collection actually has', () => {
  expect(formatChoices(options)).toEqual(['LP', 'CD', 'Cassette']);
});
