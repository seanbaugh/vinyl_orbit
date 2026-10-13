import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { beforeEach, expect, test } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDb, type Db } from '../src/db/index.js';
import { seedReleases } from './helpers.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
let db: Db;
let app: FastifyInstance;
let dataDir: string;

const cache = (releaseId: number) => {
  mkdirSync(join(dataDir, 'images', String(releaseId)), { recursive: true });
  writeFileSync(join(dataDir, 'images', String(releaseId), '0.jpg'), JPEG);
  db.prepare('INSERT INTO images (release_id, idx, type, remote_url, local_path) VALUES (?, 0, ?, ?, ?)')
    .run(releaseId, 'primary', 'https://img.discogs.example/x.jpg', `images/${releaseId}/0.jpg`);
};

beforeEach(async () => {
  db = openDb(':memory:');
  dataDir = mkdtempSync(join(tmpdir(), 'vo-cover-'));
  seedReleases(db, [
    { id: 1, title: 'Reckless', artists: 'Bryan Adams' },
    { id: 2, title: 'Chicago II', artists: 'Chicago' },
    { id: 3, title: 'Caribou', artists: 'Elton John' },
  ]);
  cache(1);
  cache(2);
  app = buildApp({ db, dataDir, scheduler: {} as never, previews: {} as never });
  await app.ready();
});

const get = (album?: string, artist?: string) => {
  const q = new URLSearchParams();
  if (album !== undefined) q.set('album', album);
  if (artist !== undefined) q.set('artist', artist);
  return app.inject({ method: 'GET', url: `/api/cover?${q}` });
};

test('serves the cached cover of the record the album and artist text matches', async () => {
  const r = await get('Reckless', 'Bryan Adams');
  expect(r.statusCode).toBe(200);
  expect(r.headers['content-type']).toBe('image/jpeg');
  expect(r.rawPayload.equals(JPEG)).toBe(true);
});

test('a different number in the title is never a match', async () => {
  expect((await get('Chicago III', 'Chicago')).statusCode).toBe(404);
  expect((await get('Chicago II', 'Chicago')).statusCode).toBe(200);
});

test('a record that matches but has no cached cover is a 404, not a broken image', async () => {
  expect((await get('Caribou', 'Elton John')).statusCode).toBe(404);
});

test('text that matches nothing is a 404', async () => {
  expect((await get('Nonexistent Album', 'Nobody')).statusCode).toBe(404);
});

test('a missing album or artist is a 400', async () => {
  expect((await get(undefined, 'Bryan Adams')).statusCode).toBe(400);
  expect((await get('Reckless')).statusCode).toBe(400);
  expect((await get('', '')).statusCode).toBe(400);
});

test('a user override file maps text the matcher cannot to a release', async () => {
  writeFileSync(join(dataDir, 'ha-overrides.json'),
    JSON.stringify([{ album: 'The Chicago Two', artist: 'Chi', releaseId: 2 }]));
  expect((await get('The Chicago Two', 'Chi')).statusCode).toBe(200);
});
