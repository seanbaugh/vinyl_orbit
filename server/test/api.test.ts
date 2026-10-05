import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { beforeEach, expect, test } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDb, type Db } from '../src/db/index.js';
import { applyDetail, upsertBasic } from '../src/repo/releases.js';
import type { Scheduler, SyncStatus } from '../src/sync/scheduler.js';
import { PreviewUnavailableError, type PreviewService } from '../src/previews/service.js';
import type { PreviewInfo } from '../src/api-types.js';
import { collection, release, RELEASE_IDS } from './helpers.js';

let db: Db;
let app: FastifyInstance;
let triggered: boolean[];
let previewCalls: string[];
let previewMode: 'ok' | 'missing' | 'down';
const info: PreviewInfo = { status: 'auto', album: null, tracks: {}, matchedAt: 'x' };

const status: SyncStatus = {
  running: false, progress: { phase: 'idle', done: 0, total: 0 }, lastCompletedAt: null, lastError: null, lastResult: null,
};

beforeEach(async () => {
  db = openDb(':memory:');
  const now = new Date().toISOString();
  upsertBasic(db, collection().releases, now);
  for (const id of RELEASE_IDS) applyDetail(db, release(id), now);
  triggered = [];
  const scheduler: Scheduler = {
    start() {}, stop() {}, status: () => status,
    trigger: (full) => { triggered.push(full); return { ...status, running: true }; },
  };
  previewCalls = [];
  previewMode = 'ok';
  const respond = async (call: string) => {
    previewCalls.push(call);
    if (previewMode === 'down') throw new PreviewUnavailableError(new Error('x'));
    return previewMode === 'missing' ? null : info;
  };
  const previews: PreviewService = {
    get: (id) => respond(`get ${id}`),
    candidates: async (id) => { previewCalls.push(`candidates ${id}`); return [] as never; },
    setAlbum: (id, album) => respond(`setAlbum ${id} ${album}`),
    setNone: (id) => respond(`setNone ${id}`),
    reset: (id) => respond(`reset ${id}`),
    markFailed: (id, idx) => { previewCalls.push(`markFailed ${id} ${idx}`); return true; },
  };
  app = buildApp({ db, scheduler, previews, dataDir: mkdtempSync(join(tmpdir(), 'vo-api-')) });
  await app.ready();
});

const get = async (url: string) => {
  const r = await app.inject({ method: 'GET', url });
  return { status: r.statusCode, body: r.body ? r.json() : null };
};
const send = async (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) => {
  const r = await app.inject({ method, url, payload });
  return { status: r.statusCode, body: r.body ? r.json() : null };
};

test('health', async () => {
  expect(await get('/api/health')).toEqual({ status: 200, body: { ok: true } });
});

test('list releases with filters, and validation', async () => {
  const r = await get('/api/releases?genre=Classical&sort=year');
  expect(r.status).toBe(200);
  expect(r.body.map((x: any) => x.id)).toContain(7455230);
  expect((await get('/api/releases?decade=abc')).status).toBe(400);
  expect((await get('/api/releases?sort=bogus')).status).toBe(400);
});

test('release detail and 404', async () => {
  const r = await get('/api/releases/7455230');
  expect(r.body.sides[0].side).toBe('A');
  expect(r.body.discogsUrl).toBe('https://www.discogs.com/release/7455230');
  expect((await get('/api/releases/1')).status).toBe(404);
});

test('notes: save, then blank deletes', async () => {
  expect((await send('PUT', '/api/releases/7455230/note', { bodyMd: '**great**' })).status).toBe(200);
  expect((await get('/api/releases/7455230')).body.note.bodyMd).toBe('**great**');
  await send('PUT', '/api/releases/7455230/note', { bodyMd: '  ' });
  expect((await get('/api/releases/7455230')).body.note).toBeNull();
});

test('tags are case-insensitively unique', async () => {
  await send('POST', '/api/releases/7455230/tags', { name: 'Sunday' });
  const second = await send('POST', '/api/releases/7455230/tags', { name: 'sunday' });
  expect(second.body.name).toBe('Sunday');
  const facets = await get('/api/facets');
  expect(facets.body.tags).toEqual([{ id: second.body.id, name: 'Sunday', color: null, count: 1 }]);
  expect((await send('DELETE', `/api/releases/7455230/tags/${second.body.id}`)).status).toBe(204);
  expect((await get('/api/releases/7455230')).body.tags).toEqual([]);
  expect((await send('POST', '/api/releases/7455230/tags', { name: '' })).status).toBe(400);
});

test('crates', async () => {
  const crate = await send('POST', '/api/crates', { name: 'Sunday Morning', description: 'slow' });
  expect(crate.status).toBe(201);
  await send('POST', `/api/crates/${crate.body.id}/releases`, { releaseId: 7455230 });
  await send('POST', `/api/crates/${crate.body.id}/releases`, { releaseId: 7455230 });
  expect((await get(`/api/crates/${crate.body.id}`)).body.count).toBe(1);
  expect((await get(`/api/releases?crate=${crate.body.id}`)).body.map((x: any) => x.id)).toEqual([7455230]);
  await send('PATCH', `/api/crates/${crate.body.id}`, { name: 'Sunday' });
  expect((await get('/api/crates')).body[0].name).toBe('Sunday');
  expect((await send('DELETE', `/api/crates/${crate.body.id}/releases/7455230`)).status).toBe(204);
  expect((await send('DELETE', `/api/crates/${crate.body.id}`)).status).toBe(204);
  expect((await get(`/api/crates/${crate.body.id}`)).status).toBe(404);
});

test('plays feed the dashboard', async () => {
  const play = await send('POST', '/api/releases/7455230/plays', {});
  expect(play.status).toBe(201);
  const dash = await get('/api/dashboard');
  expect(dash.body.stats.playsThisMonth).toBe(1);
  expect(dash.body.recentlyPlayed[0].id).toBe(7455230);
  expect(dash.body.recentlyAdded.length).toBeGreaterThan(0);
  expect((await send('DELETE', `/api/plays/${play.body.id}`)).status).toBe(204);
  expect((await get('/api/dashboard')).body.stats.playsThisMonth).toBe(0);
});

test('stats total value excludes unpriced releases', async () => {
  const prices = db.prepare('SELECT lowest_price AS p FROM releases WHERE lowest_price IS NOT NULL').all() as { p: number }[];
  const s = await get('/api/stats');
  expect(s.body.totalValue).toBeCloseTo(prices.reduce((a, b) => a + b.p, 0));
  expect(s.body.byGenre.length).toBeGreaterThan(0);
});

test('search treats special characters literally', async () => {
  for (const q of ['%', '_', "'", "Guns N' Roses"]) {
    const r = await get(`/api/search?q=${encodeURIComponent(q)}`);
    expect(r.status).toBe(200);
  }
  expect((await get('/api/search?q=%25')).body.releases).toEqual([]);
  const s = await get('/api/search?q=imperial');
  expect(s.body.tracks[0]).toMatchObject({ releaseId: 7455230, title: 'Imperial Attack' });
});

test('sync trigger and status', async () => {
  const r = await send('POST', '/api/sync', {});
  expect(r.body.running).toBe(true);
  expect(triggered).toEqual([true]);
  expect((await get('/api/sync/status')).body).toEqual(status);
});

test('final: play timestamps with offsets are normalised to UTC', async () => {
  const play = await send('POST', '/api/releases/7455230/plays', { playedAt: '2026-09-30T23:30:00-04:00' });
  expect(play.body.playedAt).toBe('2026-10-01T03:30:00.000Z');
});

test('preview routes', async () => {
  expect(await get('/api/releases/7455230/previews')).toEqual({ status: 200, body: info });
  expect((await get('/api/releases/7455230/previews/candidates')).body).toEqual([]);
  expect((await send('PUT', '/api/releases/7455230/previews', { appleAlbumId: 5 })).status).toBe(200);
  expect((await send('PUT', '/api/releases/7455230/previews', { none: true })).status).toBe(200);
  expect((await send('PUT', '/api/releases/7455230/previews', {})).status).toBe(400);
  expect((await send('DELETE', '/api/releases/7455230/previews')).status).toBe(200);
  expect(previewCalls).toEqual(['get 7455230', 'candidates 7455230', 'setAlbum 7455230 5', 'setNone 7455230', 'reset 7455230']);
});

test('preview routes: 404 and 502', async () => {
  previewMode = 'missing';
  expect((await get('/api/releases/1/previews')).status).toBe(404);
  previewMode = 'down';
  expect(await get('/api/releases/7455230/previews')).toEqual({ status: 502, body: { error: "Couldn't reach Apple Music. Try again." } });
});

test('final: report a failed preview', async () => {
  expect((await send('POST', '/api/releases/7455230/previews/3/failed', {})).status).toBe(204);
  expect(previewCalls).toContain('markFailed 7455230 3');
});

test('spin-pick suggests an unplayed record, honours filters and exclusions, and reports no match', async () => {
  const opts = await get('/api/spin-options');
  expect(opts.body.genres.length).toBeGreaterThan(0);
  const genre = opts.body.genres[0].value;

  const first = await get(`/api/spin-pick?genre=${encodeURIComponent(genre)}`);
  expect(first.status).toBe(200);
  expect(first.body.release.genres).toContain(genre);

  // A play today takes it out of the default 7-day window; excluding it works too.
  await send('POST', `/api/releases/${first.body.release.id}/plays`, {});
  const second = await get(`/api/spin-pick?exclude=${first.body.release.id}`);
  expect(second.body.release.id).not.toBe(first.body.release.id);
  const withinWindow = await get(`/api/spin-pick?neverPlayed=true`);
  expect(withinWindow.body.release.playCount).toBe(0);

  const two = opts.body.genres.slice(0, 2).map((g: { value: string }) => g.value);
  const many = await get(`/api/spin-pick?${two.map((g: string) => `genre=${encodeURIComponent(g)}`).join('&')}`);
  expect(many.body.release.genres.some((g: string) => two.includes(g))).toBe(true);
  expect((await get('/api/spin-pick?genre=Nope')).body).toEqual({ release: null });
  expect((await get('/api/spin-pick?genre=Nope&genre=Also%20Nope')).body).toEqual({ release: null });
  expect((await get('/api/spin-pick?days=abc')).status).toBe(400);
  expect((await get('/api/spin-pick?exclude=1;DROP')).status).toBe(400);
});
