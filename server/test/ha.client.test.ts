import { expect, test } from 'vitest';
import { createHaClient } from '../src/homeassistant/client.js';

const TOKEN = 'secret-token-123';
type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

const state = (value: string, status = 200) =>
  new Response(JSON.stringify({ state: value }), { status, headers: { 'content-type': 'application/json' } });

function client(handler: Handler, timeoutMs?: number) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, auth: new Headers(init.headers).get('authorization') });
    return handler(url, init);
  }) as typeof fetch;
  return { calls, ha: createHaClient({ url: 'http://ha.local:8123/', token: TOKEN, fetch: fetchImpl, timeoutMs }) };
}

test('reads album and artist with the bearer token', async () => {
  const { ha, calls } = client((url) => state(url.endsWith('vinyl_album') ? 'Reckless' : 'Bryan Adams'));
  expect(await ha.readHelpers()).toEqual({ album: 'Reckless', artist: 'Bryan Adams' });
  expect(calls.map((c) => c.url).sort()).toEqual([
    'http://ha.local:8123/api/states/input_text.vinyl_album',
    'http://ha.local:8123/api/states/input_text.vinyl_artist',
  ]);
  expect(calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
});

test('an empty string is a valid empty value', async () => {
  const { ha } = client(() => state(''));
  expect(await ha.readHelpers()).toEqual({ album: '', artist: '' });
});

test('unavailable and unknown states are failed reads, not empty records', async () => {
  for (const bad of ['unavailable', 'unknown']) {
    const { ha } = client((url) => state(url.endsWith('vinyl_album') ? bad : 'x'));
    await expect(ha.readHelpers()).rejects.toThrow(bad);
  }
});

test('401, 404 and a thrown fetch all reject, without leaking the token', async () => {
  const handlers: Handler[] = [
    () => new Response('nope', { status: 401 }),
    () => new Response('nope', { status: 404 }),
    () => { throw new Error(`connect ECONNREFUSED while sending ${TOKEN}`); },
  ];
  for (const handler of handlers) {
    const { ha } = client(handler);
    const err = await ha.readHelpers().then(() => null, (e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String(err!.message)).not.toContain(TOKEN);
  }
});

test('a request that never answers is abandoned after the timeout', async () => {
  const { ha } = client((_url, init) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  }), 20);
  await expect(ha.readHelpers()).rejects.toThrow();
});
