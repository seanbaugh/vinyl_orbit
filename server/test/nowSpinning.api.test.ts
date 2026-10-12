import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { beforeEach, expect, test } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDb, type Db } from '../src/db/index.js';
import { upsertBasic } from '../src/repo/releases.js';
import { collection } from './helpers.js';

const ID = 7455230;
let db: Db;
let app: FastifyInstance;

beforeEach(async () => {
  db = openDb(':memory:');
  upsertBasic(db, collection().releases, new Date().toISOString());
  app = buildApp({
    db, dataDir: mkdtempSync(join(tmpdir(), 'vo-ns-')),
    scheduler: {} as never, previews: {} as never,
  });
  await app.ready();
});

const call = async (method: 'GET' | 'PUT' | 'DELETE', payload?: object) => {
  const r = await app.inject({ method, url: '/api/now-spinning', payload });
  return { status: r.statusCode, body: r.body ? r.json() : null };
};
const playCount = () => (db.prepare('SELECT count(*) AS n FROM plays WHERE release_id = ?').get(ID) as { n: number }).n;

test('GET on a fresh library reports nothing spinning', async () => {
  const r = await call('GET');
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ releaseId: null, source: null, updatedAt: null, tap: 0, tapAgeMs: null });
});

test('PUT marks the release as spinning manually and logs a play', async () => {
  const r = await call('PUT', { releaseId: ID });
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ releaseId: ID, source: 'manual', playLogged: true });
  expect((await call('GET')).body).toMatchObject({ releaseId: ID, source: 'manual' });
  expect(playCount()).toBe(1);
});

test('a second PUT inside ten minutes does not log another play', async () => {
  await call('PUT', { releaseId: ID });
  const r = await call('PUT', { releaseId: ID });
  expect(r.body).toMatchObject({ releaseId: ID, playLogged: false });
  expect(playCount()).toBe(1);
});

test('PUT for a release that is not in the library is a 404', async () => {
  expect((await call('PUT', { releaseId: 999_999_999 })).status).toBe(404);
});

test('PUT with a bad body is a 400', async () => {
  expect((await call('PUT', { releaseId: 'nope' })).status).toBe(400);
  expect((await call('PUT', {})).status).toBe(400);
});

test('DELETE clears it', async () => {
  await call('PUT', { releaseId: ID });
  expect((await call('DELETE')).status).toBe(204);
  expect((await call('GET')).body.releaseId).toBeNull();
});

test('a release removed by sync reads as nothing spinning', async () => {
  await call('PUT', { releaseId: ID });
  db.prepare('UPDATE releases SET removed_at = ? WHERE id = ?').run(new Date().toISOString(), ID);
  expect((await call('GET')).body.releaseId).toBeNull();
});
