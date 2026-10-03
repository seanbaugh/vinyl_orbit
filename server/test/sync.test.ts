import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import type { Config } from '../src/config.js';
import { openDb, type Db } from '../src/db/index.js';
import { DiscogsError, type DiscogsClient } from '../src/discogs/client.js';
import type { CollectionItem } from '../src/discogs/types.js';
import { runSync } from '../src/sync/sync.js';
import { collection, release, RELEASE_IDS } from './helpers.js';

let db: Db;
let config: Config;

function fakeClient(items: CollectionItem[], opts: { failCollection?: boolean } = {}): DiscogsClient {
  return {
    async getCollectionPage(page) {
      if (opts.failCollection) throw new DiscogsError('boom', 500);
      const per = 50;
      return {
        pagination: { page, pages: Math.max(1, Math.ceil(items.length / per)), items: items.length },
        releases: items.slice((page - 1) * per, page * per),
      };
    },
    async getRelease(id) {
      if (!RELEASE_IDS.includes(id)) throw new DiscogsError('Release not found.', 404);
      return release(id);
    },
    async downloadImage() {
      return Buffer.from('jpg');
    },
  };
}

const all = collection().releases;
const fixtureOnly = all.filter((i) => RELEASE_IDS.includes(i.id));

beforeEach(() => {
  db = openDb(':memory:');
  config = {
    username: 'seanmikel', token: null, port: 3020, dataDir: mkdtempSync(join(tmpdir(), 'vo-sync-')),
    syncIntervalHours: 6, detailRefreshDays: 7, detailRefreshPerRun: 15, currency: 'USD',
  };
});

test('first run adds everything, fetches details, caches images, and survives 404s', async () => {
  const result = await runSync({ db, client: fakeClient(all), config }, { full: false });
  expect(result.added).toBe(all.length);
  expect(result.detailed).toBe(RELEASE_IDS.length);
  expect(result.errors.length).toBe(all.length - RELEASE_IDS.length);
  expect(existsSync(join(config.dataDir, 'images/7455230/0.jpg'))).toBe(true);
  expect(result.errors.some((e) => e.includes('30487525'))).toBe(false);
});

test('user data survives removal and reappearance', async () => {
  const client = fakeClient(fixtureOnly);
  await runSync({ db, client, config }, { full: false });
  db.prepare("INSERT INTO notes VALUES (7455230, 'great', '2026-10-03')").run();
  db.prepare("INSERT INTO plays (release_id, played_at) VALUES (7455230, '2026-10-03')").run();
  db.prepare("INSERT INTO tags (id, name) VALUES (1, 'Sunday')").run();
  db.prepare('INSERT INTO release_tags VALUES (7455230, 1)').run();

  const without = fixtureOnly.filter((i) => i.id !== 7455230);
  const r2 = await runSync({ db, client: fakeClient(without), config }, { full: false });
  expect(r2.removed).toBe(1);
  expect(db.prepare('SELECT removed_at FROM releases WHERE id = 7455230').get()).not.toEqual({ removed_at: null });
  for (const t of ['notes', 'plays', 'release_tags']) {
    expect(db.prepare(`SELECT count(*) AS n FROM ${t}`).get()).toEqual({ n: 1 });
  }

  await runSync({ db, client, config }, { full: false });
  expect(db.prepare('SELECT removed_at FROM releases WHERE id = 7455230').get()).toEqual({ removed_at: null });
  expect(db.prepare('SELECT body_md FROM notes WHERE release_id = 7455230').get()).toEqual({ body_md: 'great' });
});

test('a failed collection fetch removes nothing', async () => {
  await runSync({ db, client: fakeClient(fixtureOnly), config }, { full: false });
  const r = await runSync({ db, client: fakeClient(fixtureOnly, { failCollection: true }), config }, { full: false });
  expect(r.removed).toBe(0);
  expect(r.errors[0]).toMatch(/boom/);
  expect(db.prepare('SELECT count(*) AS n FROM releases WHERE removed_at IS NULL').get()).toEqual({ n: RELEASE_IDS.length });
});

test('scheduled runs refresh only detailRefreshPerRun stale releases; full runs refresh all', async () => {
  const start = new Date('2026-10-01T00:00:00Z');
  await runSync({ db, client: fakeClient(fixtureOnly), config, now: () => start }, { full: false });
  const later = () => new Date('2026-10-20T00:00:00Z');
  const limited = await runSync({ db, client: fakeClient(fixtureOnly), config: { ...config, detailRefreshPerRun: 1 }, now: later },
    { full: false });
  expect(limited.detailed).toBe(1);
  const full = await runSync({ db, client: fakeClient(fixtureOnly), config: { ...config, detailRefreshPerRun: 1 }, now: later },
    { full: true });
  expect(full.detailed).toBe(RELEASE_IDS.length - 1);
});

test('reports progress phases', async () => {
  const phases = new Set<string>();
  await runSync({ db, client: fakeClient(fixtureOnly), config, onProgress: (p) => phases.add(p.phase) }, { full: false });
  expect([...phases]).toEqual(['collection', 'details', 'images', 'done']);
});
