import { expect, test } from 'vitest';
import { USER_AGENT } from '../src/discogs/client.js';
import { RateLimiter } from '../src/discogs/rateLimiter.js';
import { createItunesClient, ItunesError } from '../src/previews/itunes.js';
import { itunesFixture } from './helpers.js';

const noWait = new RateLimiter(0);
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function stub(responses: Response[]) {
  const calls: { url: string; headers: Headers }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: new Headers(init?.headers) });
    const r = responses.shift();
    if (!r) throw new Error('no more responses');
    return r;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test('searchAlbums URL, headers and parsing', async () => {
  const { fn, calls } = stub([ok(itunesFixture('search-7455230'))]);
  const it = createItunesClient({ country: 'US', fetch: fn, limiter: noWait });
  const albums = await it.searchAlbums('John Williams Star Wars');
  expect(calls[0].url).toBe('https://itunes.apple.com/search?term=John%20Williams%20Star%20Wars&entity=album&country=US&limit=10');
  expect(calls[0].headers.get('User-Agent')).toBe(USER_AGENT);
  expect(albums).toHaveLength(10);
  expect(albums[0].collectionId).toBe(1375814280);
});

test('lookupAlbum splits the collection from its songs', async () => {
  const { fn, calls } = stub([ok(itunesFixture('lookup-1375814280'))]);
  const it = createItunesClient({ country: 'US', fetch: fn, limiter: noWait });
  const { album, songs } = await it.lookupAlbum(1375814280);
  expect(calls[0].url).toBe('https://itunes.apple.com/lookup?id=1375814280&entity=song&country=US');
  expect(album?.collectionName).toMatch(/^Star Wars: A New Hope/);
  expect(songs).toHaveLength(16);
  expect(songs.every((s) => s.previewUrl)).toBe(true);
});

test('searchSongs uses entity=song limit=5', async () => {
  const { fn, calls } = stub([ok(itunesFixture('song-four'))]);
  const it = createItunesClient({ country: 'GB', fetch: fn, limiter: noWait });
  const songs = await it.searchSongs('Sleeping At Last Four');
  expect(calls[0].url).toBe('https://itunes.apple.com/search?term=Sleeping%20At%20Last%20Four&entity=song&country=GB&limit=5');
  expect(songs[0].trackName).toBe('Four');
});

test('empty results', async () => {
  const empty = () => ok({ resultCount: 0, results: [] });
  const it = createItunesClient({ country: 'US', fetch: stub([empty(), empty()]).fn, limiter: noWait });
  expect(await it.searchAlbums('nothing')).toEqual([]);
  expect(await it.lookupAlbum(1)).toEqual({ album: null, songs: [] });
});

test('retries 429 then fails with ItunesError on 500', async () => {
  const slept: number[] = [];
  const tooMany = () => new Response('{}', { status: 429, headers: { 'Retry-After': '1' } });
  const it = createItunesClient({
    country: 'US', limiter: noWait, sleep: async (ms) => { slept.push(ms); },
    fetch: stub([tooMany(), tooMany(), ok({ resultCount: 0, results: [] }), new Response('x', { status: 500 })]).fn,
  });
  await expect(it.searchAlbums('x')).resolves.toEqual([]);
  expect(slept).toEqual([1000, 1000]);
  const err = await it.searchAlbums('y').catch((e) => e);
  expect(err).toBeInstanceOf(ItunesError);
  expect(err.status).toBe(500);
});
