// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NowSpinningProvider, useNowSpinning } from './nowSpinning';

type ServerState = { releaseId: number | null; source: string | null; updatedAt: string | null; tap: number; tapAgeMs: number | null };
const EMPTY: ServerState = { releaseId: null, source: null, updatedAt: null, tap: 0, tapAgeMs: null };

let server: ServerState;
let playLogged: boolean;
let calls: { method: string; path: string; body: unknown }[];
let qc: QueryClient;
let api!: ReturnType<typeof useNowSpinning>;
const Probe = () => { api = useNowSpinning(); return null; };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  server = { ...EMPTY };
  playLogged = true;
  calls = [];
  localStorage.clear();
  vi.stubGlobal('fetch', async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, path, body: init.body ? JSON.parse(init.body as string) : undefined });
    if (path !== '/api/now-spinning') return json({}, 404);
    if (method === 'PUT') {
      server = { ...server, releaseId: (calls.at(-1)!.body as { releaseId: number }).releaseId, source: 'manual' };
      return json({ ...server, playLogged });
    }
    if (method === 'DELETE') { server = { ...server, releaseId: null, source: null }; return new Response(null, { status: 204 }); }
    return json(server);
  });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const mount = () => render(<QueryClientProvider client={qc}><NowSpinningProvider><Probe /></NowSpinningProvider></QueryClientProvider>);
const loaded = () => waitFor(() => expect(api.tap).not.toBeNull());

test('before the first load nothing is known; afterwards the server state is exposed', async () => {
  server = { releaseId: 9, source: 'tag', updatedAt: 'x', tap: 4, tapAgeMs: 1500 };
  mount();
  expect(api.releaseId).toBeNull();
  expect(api.tap).toBeNull();
  await loaded();
  expect(api).toMatchObject({ releaseId: 9, tap: 4, tapAgeMs: 1500 });
});

test('set() sends PUT, shows the record at once, resolves with playLogged and refreshes that release', async () => {
  mount();
  await loaded();
  const refresh = vi.spyOn(qc, 'invalidateQueries');
  let result: { playLogged: boolean } | undefined;
  await act(async () => { result = await api.set(42); });
  expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ path: '/api/now-spinning', body: { releaseId: 42 } });
  expect(result).toEqual({ playLogged: true });
  await waitFor(() => expect(api.releaseId).toBe(42));
  expect(refresh).toHaveBeenCalledWith({ queryKey: ['release', 42] });
});

test('set() reports when the server skipped the play as a repeat', async () => {
  playLogged = false;
  mount();
  await loaded();
  let result: { playLogged: boolean } | undefined;
  await act(async () => { result = await api.set(42); });
  expect(result).toEqual({ playLogged: false });
});

test('clear() sends DELETE and the record goes away', async () => {
  server = { releaseId: 9, source: 'manual', updatedAt: 'x', tap: 0, tapAgeMs: null };
  mount();
  await waitFor(() => expect(api.releaseId).toBe(9));
  await act(async () => { api.clear(); });
  await waitFor(() => expect(api.releaseId).toBeNull());
  expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
});

test('a change on the server shows up on the next refetch', async () => {
  mount();
  await loaded();
  server = { releaseId: 7, source: 'tag', updatedAt: 'x', tap: 1, tapAgeMs: 200 };
  await act(async () => { await qc.invalidateQueries({ queryKey: ['nowSpinning'] }); });
  await waitFor(() => expect(api).toMatchObject({ releaseId: 7, tap: 1, tapAgeMs: 200 }));
});

test('a record the server no longer has reads as nothing spinning and does not loop', async () => {
  server = { ...EMPTY, tap: 2 };
  mount();
  await loaded();
  expect(api.releaseId).toBeNull();
  await new Promise((r) => setTimeout(r, 50));
  expect(calls.filter((c) => c.method === 'GET')).toHaveLength(1);
});

test('the old localStorage marker is ignored', async () => {
  localStorage.setItem('vinyl-orbit.nowSpinning', '9');
  mount();
  await loaded();
  expect(api.releaseId).toBeNull();
  await act(async () => { await api.set(5); });
  expect(localStorage.getItem('vinyl-orbit.nowSpinning')).toBe('9');
});
