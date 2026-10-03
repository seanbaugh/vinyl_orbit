import { expect, test } from 'vitest';
import {
  albumSim, containment, dice, normalizeAlbum, normalizeArtist, normalizeTrack, tokens,
} from '../src/previews/normalize.js';

test('normalizeAlbum drops all decorations', () => {
  expect(normalizeAlbum('Star Wars: A New Hope (Original Motion Picture Score)')).toBe('star wars a new hope');
  expect(normalizeAlbum('Atlas: Two - Single')).toBe('atlas two');
  expect(normalizeAlbum('Abbey Road [Super Deluxe Edition]')).toBe('abbey road');
});

test('normalizeTrack drops only version decorations', () => {
  expect(normalizeTrack('Four (Instrumental)')).toBe('four instrumental');
  expect(normalizeTrack('Let It Be - Remastered 2009')).toBe('let it be');
  expect(normalizeTrack('Smile (Live From The Hollywood Bowl)')).toBe('smile');
  expect(normalizeTrack("Princess Leia's Theme")).toBe('princess leias theme');
  expect(normalizeTrack('Café del Mar (feat. Someone)')).toBe('cafe del mar');
  expect(normalizeTrack('Hey Jude feat. Somebody Else')).toBe('hey jude');
});

test('normalizeArtist', () => {
  expect(normalizeArtist('Simon & Garfunkel')).toBe('simon and garfunkel');
  expect(normalizeArtist('John Williams, The London Symphony Orchestra')).toBe('john williams the london symphony orchestra');
});

test('tokens ignore stopwords', () => {
  expect([...tokens('the desert and the robot auction')]).toEqual(['desert', 'robot', 'auction']);
});

test('similarities', () => {
  expect(dice('star wars', 'star wars')).toBe(1);
  expect(dice(normalizeTrack('Four'), normalizeTrack('Four (Instrumental)'))).toBeCloseTo(2 / 3);
  expect(containment('star wars', 'star wars a new hope')).toBe(1);
  expect(albumSim('the desert and the robot auction', 'desert robot auction')).toBe(1);
  expect(albumSim('star wars', 'star wars empire strikes back')).toBeLessThan(albumSim('star wars', 'star wars new hope'));
});

test('titles that normalise to nothing never match', () => {
  for (const s of ['—', '???', '( )', '']) {
    expect(dice(normalizeTrack(s), 'anything')).toBe(0);
    expect(albumSim(normalizeAlbum(s), 'anything')).toBe(0);
  }
  expect(dice('', '')).toBe(0);
  expect(containment('', '')).toBe(0);
});
