import { expect, test } from 'vitest';
import { artistsDisplay } from '../src/lib/format.js';
import type { ItunesAlbum, ItunesSong } from '../src/previews/itunes.js';
import {
  ALBUM_THRESHOLD, mapTracks, pickFallback, scoreAlbums, searchTerm, type MatchInput,
} from '../src/previews/match.js';
import { itunesFixture, release } from './helpers.js';

const results = (name: string) => (itunesFixture(name) as { results: Record<string, unknown>[] }).results;
const albums = (name: string) => results(name) as unknown as ItunesAlbum[];
const songs = (name: string) => results(name).filter((r) => r.wrapperType === 'track') as unknown as ItunesSong[];

function input(id: number): MatchInput {
  const r = release(id);
  return {
    title: r.title,
    artists: artistsDisplay(r.artists),
    year: r.year || null,
    isVarious: false,
    tracks: r.tracklist.map((t, idx) => ({ idx, title: t.title, type: t.type_ }))
      .filter((t) => t.type === 'track').map(({ idx, title }) => ({ idx, title })),
  };
}

test('Star Wars LP picks A New Hope over The Empire Strikes Back', () => {
  const scored = scoreAlbums(input(7455230), albums('search-7455230'));
  expect(scored[0].album.collectionId).toBe(1375814280);
  expect(scored[0].score).toBeGreaterThanOrEqual(ALBUM_THRESHOLD);
  const empire = scored.find((s) => s.album.collectionId === 1375815586)!;
  expect(empire.score).toBeLessThan(scored[0].score);
  for (let i = 1; i < scored.length; i++) expect(scored[i].score).toBeLessThanOrEqual(scored[i - 1].score);
});

test('Star Wars tracks all map', () => {
  const inp = input(7455230);
  const map = mapTracks(inp.tracks, songs('lookup-1375814280'));
  expect(map.size).toBe(16);
  const desert = inp.tracks.find((t) => t.title === 'The Desert And The Robot Auction')!;
  expect(map.get(desert.idx)!.trackName).toBe('The Desert and the Robot Auction');
});

test('Amidst the Chaos live LP accepts the studio album', () => {
  const scored = scoreAlbums(input(18809824), albums('search-18809824'));
  expect(scored[0].album.collectionId).toBe(1452354896);
  expect(scored[0].score).toBeGreaterThanOrEqual(ALBUM_THRESHOLD);
});

test('Four: matches the "Atlas: Four" single; fallback tells both sides apart', () => {
  const scored = scoreAlbums(input(30487525), albums('search-30487525'));
  expect(scored[0].album.collectionName).toBe('Atlas: Four - Single');
  expect(scored[0].score).toBeGreaterThanOrEqual(ALBUM_THRESHOLD);
  const s = songs('song-four');
  expect(pickFallback('Four', 'Sleeping At Last', s)!.trackName).toBe('Four');
  expect(pickFallback('Four (Instrumental)', 'Sleeping At Last', s)!.trackName).toBe('Four (Instrumental)');
  expect(pickFallback('Atlas', 'Sleeping At Last', s)).toBeNull();
  expect(pickFallback('Four', 'Somebody Else Entirely', s)).toBeNull();
});

test('mapTracks never reuses a song, skips songs without previews, handles empty input', () => {
  const song = (trackId: number, trackName: string, previewUrl?: string) =>
    ({ trackId, trackName, artistName: 'X', collectionId: 1, trackNumber: trackId, previewUrl }) as ItunesSong;
  const map = mapTracks([{ idx: 0, title: 'Intro' }, { idx: 1, title: 'Intro' }], [song(1, 'Intro', 'u')]);
  expect([...map.keys()]).toEqual([0]);
  expect(mapTracks([{ idx: 0, title: 'Intro' }], [song(1, 'Intro')]).size).toBe(0);
  expect(mapTracks([{ idx: 0, title: 'Intro' }], []).size).toBe(0);
  expect(scoreAlbums(input(7455230), [])).toEqual([]);
});

test('duplicate titles map by order', () => {
  const song = (trackId: number, trackName: string) =>
    ({ trackId, trackName, artistName: 'X', collectionId: 1, trackNumber: trackId, previewUrl: `u${trackId}` }) as ItunesSong;
  const map = mapTracks([{ idx: 3, title: 'Interlude' }, { idx: 9, title: 'Interlude' }], [song(1, 'Interlude'), song(2, 'Interlude')]);
  expect(map.get(3)!.trackId).toBe(1);
  expect(map.get(9)!.trackId).toBe(2);
});

test('searchTerm omits Various artists', () => {
  expect(searchTerm({ ...input(7455230), isVarious: true })).toBe('Star Wars');
  expect(searchTerm(input(7455230))).toBe('John Williams, The London Symphony Orchestra Star Wars');
});
