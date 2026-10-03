import { expect, test } from 'vitest';
import { createDiscogsClient, DiscogsError } from '../src/discogs/client.js';
import { RateLimiter } from '../src/discogs/rateLimiter.js';

const noWait = new RateLimiter(0);

function stubFetch(responses: Response[]) {
  const calls: { url: string; headers: Headers }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: new Headers(init?.headers) });
    const r = responses.shift();
    if (!r) throw new Error('no more responses');
    return r;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const tooMany = () => new Response('{}', { status: 429, headers: { 'Retry-After': '1' } });

test('collection page URL and headers without token', async () => {
  const { fn, calls } = stubFetch([ok({ pagination: { page: 2, pages: 2, items: 1 }, releases: [] })]);
  const client = createDiscogsClient({ username: 'seanmikel', token: null, fetch: fn, limiter: noWait });
  await client.getCollectionPage(2);
  expect(calls[0].url).toBe(
    'https://api.discogs.com/users/seanmikel/collection/folders/0/releases?page=2&per_page=100&sort=added&sort_order=desc',
  );
  expect(calls[0].headers.get('User-Agent')).toBe('VinylOrbit/1.0 +https://github.com/seanmikel/vinyl-orbit');
  expect(calls[0].headers.get('Authorization')).toBeNull();
});

test('token adds Authorization header; release URL has currency', async () => {
  const { fn, calls } = stubFetch([ok({ id: 1 })]);
  const client = createDiscogsClient({ username: 'u', token: 'abc', fetch: fn, limiter: noWait });
  await client.getRelease(1, 'USD');
  expect(calls[0].url).toBe('https://api.discogs.com/releases/1?curr_abbr=USD');
  expect(calls[0].headers.get('Authorization')).toBe('Discogs token=abc');
});

test('retries 429 honouring Retry-After', async () => {
  const slept: number[] = [];
  const { fn } = stubFetch([tooMany(), tooMany(), ok({ id: 7 })]);
  const client = createDiscogsClient({
    username: 'u', token: null, fetch: fn, limiter: noWait, sleep: async (ms) => { slept.push(ms); },
  });
  await expect(client.getRelease(7, 'USD')).resolves.toEqual({ id: 7 });
  expect(slept).toEqual([1000, 1000]);
});

test('gives up after 5 retries', async () => {
  const { fn } = stubFetch(Array.from({ length: 6 }, tooMany));
  const client = createDiscogsClient({ username: 'u', token: null, fetch: fn, limiter: noWait, sleep: async () => {} });
  const err = await client.getRelease(7, 'USD').catch((e) => e);
  expect(err).toBeInstanceOf(DiscogsError);
  expect(err.status).toBe(429);
});

test('404 rejects without retry', async () => {
  const { fn, calls } = stubFetch([new Response('{"message":"Release not found."}', { status: 404 })]);
  const client = createDiscogsClient({ username: 'u', token: null, fetch: fn, limiter: noWait, sleep: async () => {} });
  const err = await client.getRelease(1, 'USD').catch((e) => e);
  expect(err).toBeInstanceOf(DiscogsError);
  expect(err.status).toBe(404);
  expect(calls).toHaveLength(1);
});
