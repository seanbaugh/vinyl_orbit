import { beforeEach, expect, test } from 'vitest';
import { openDb, type Db } from '../src/db/index.js';
import type { ItunesClient } from '../src/previews/itunes.js';
import { createPreviewService, PreviewUnavailableError } from '../src/previews/service.js';
import { applyDetail, getReleaseDetail, upsertBasic } from '../src/repo/releases.js';
import { collection, itunesFixture, release } from './helpers.js';

const IDS = [7455230, 30487525, 18809824, 9222236];
const NOW = '2026-10-03T12:00:00.000Z';
let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  upsertBasic(db, collection().releases.filter((i) => IDS.includes(i.id)), NOW);
  for (const id of IDS) applyDetail(db, release(id), NOW);
});

const results = (name: string) => (itunesFixture(name) as { results: Record<string, unknown>[] }).results;

function fakeItunes(opts: { empty?: boolean; fail?: boolean; delay?: number } = {}) {
  const calls = { searchAlbums: 0, lookupAlbum: 0, searchSongs: 0 };
  const wait = () => new Promise((r) => setTimeout(r, opts.delay ?? 0));
  const client: ItunesClient = {
    async searchAlbums(term) {
      calls.searchAlbums++;
      await wait();
      if (opts.fail) throw new Error('network down');
      if (opts.empty) return [];
      const name = term.includes('Star Wars') ? 'search-7455230' : term.includes('Sleeping At Last') ? 'search-30487525'
        : term.includes('Bareilles') ? 'search-18809824' : null;
      return (name ? results(name) : []) as never;
    },
    async lookupAlbum(id) {
      calls.lookupAlbum++;
      if (opts.fail) throw new Error('network down');
      try {
        const r = results(`lookup-${id}`);
        return { album: (r.find((x) => x.wrapperType === 'collection') ?? null) as never,
          songs: r.filter((x) => x.wrapperType === 'track') as never };
      } catch {
        return { album: null, songs: [] };
      }
    },
    async searchSongs(term) {
      calls.searchSongs++;
      if (opts.fail) throw new Error('network down');
      if (opts.empty) return [];
      return (term.includes('Sleeping At Last') ? results('song-four') : []) as never;
    },
  };
  return { client, calls };
}

const trackIdxs = (id: number) =>
  (db.prepare("SELECT idx FROM tracks WHERE release_id = ? AND type = 'track' ORDER BY idx").all(id) as { idx: number }[])
    .map((r) => r.idx);

test('auto-matches Star Wars and caches the result', async () => {
  const { client, calls } = fakeItunes();
  const svc = createPreviewService({ db, itunes: client });
  const info = (await svc.get(7455230))!;
  expect(info.status).toBe('auto');
  expect(info.album!.id).toBe(1375814280);
  expect(info.album!.artworkUrl).toContain('300x300');
  expect(Object.keys(info.tracks).map(Number).sort((a, b) => a - b)).toEqual(trackIdxs(7455230));
  const before = { ...calls };
  await svc.get(7455230);
  expect(calls).toEqual(before);
});

test('Four: single album found, both sides via fallback search', async () => {
  const { client, calls } = fakeItunes();
  const info = (await createPreviewService({ db, itunes: client }).get(30487525))!;
  expect(info.status).toBe('auto');
  expect(info.album!.name).toBe('Atlas: Four - Single');
  expect(Object.values(info.tracks).map((t) => t.source)).toEqual(['search', 'search']);
  expect(calls).toEqual({ searchAlbums: 1, lookupAlbum: 1, searchSongs: 2 });
});

test('nothing found → unmatched, fallback capped at 5', async () => {
  const { client, calls } = fakeItunes({ empty: true });
  const info = (await createPreviewService({ db, itunes: client }).get(9222236))!;
  expect(info).toMatchObject({ status: 'unmatched', album: null, tracks: {} });
  expect(calls.searchSongs).toBe(5);
});

test('manual album survives a Discogs title change by re-mapping only', async () => {
  const { client, calls } = fakeItunes();
  const svc = createPreviewService({ db, itunes: client });
  const info = (await svc.setAlbum(7455230, 1375814280))!;
  expect(info.status).toBe('manual');
  expect(Object.keys(info.tracks)).toHaveLength(16);
  const first = trackIdxs(7455230)[0];
  db.prepare('UPDATE tracks SET title = ? WHERE release_id = ? AND idx = ?').run('Main Title Theme', 7455230, first);
  const searchesBefore = calls.searchAlbums;
  const lookupsBefore = calls.lookupAlbum;
  const again = (await svc.get(7455230))!;
  expect(again.status).toBe('manual');
  expect(calls.searchAlbums).toBe(searchesBefore);
  expect(calls.lookupAlbum).toBe(lookupsBefore + 1);
});

test('auto match re-runs when a title changes', async () => {
  const { client, calls } = fakeItunes();
  const svc = createPreviewService({ db, itunes: client });
  await svc.get(7455230);
  db.prepare('UPDATE tracks SET title = ? WHERE release_id = ? AND idx = ?').run('Renamed', 7455230, trackIdxs(7455230)[0]);
  await svc.get(7455230);
  expect(calls.searchAlbums).toBe(2);
});

test('none, then reset', async () => {
  const { client, calls } = fakeItunes();
  const svc = createPreviewService({ db, itunes: client });
  expect(await svc.setNone(7455230)).toMatchObject({ status: 'none', album: null, tracks: {} });
  const before = { ...calls };
  expect((await svc.get(7455230))!.status).toBe('none');
  expect(calls).toEqual(before);
  expect((await svc.reset(7455230))!.status).toBe('auto');
});

test('candidates', async () => {
  const c = (await createPreviewService({ db, itunes: fakeItunes().client }).candidates(7455230))!;
  expect(c.length).toBeLessThanOrEqual(8);
  expect(c[0]).toMatchObject({ id: 1375814280, year: 1977 });
  for (let i = 1; i < c.length; i++) expect(c[i].score).toBeLessThanOrEqual(c[i - 1].score);
});

test('unknown release → null', async () => {
  const svc = createPreviewService({ db, itunes: fakeItunes().client });
  expect(await svc.get(1)).toBeNull();
  expect(await svc.candidates(1)).toBeNull();
});

test('Apple failure → PreviewUnavailableError and nothing cached', async () => {
  const svc = createPreviewService({ db, itunes: fakeItunes({ fail: true }).client });
  await expect(svc.get(7455230)).rejects.toBeInstanceOf(PreviewUnavailableError);
  expect(db.prepare('SELECT count(*) AS n FROM preview_matches').get()).toEqual({ n: 0 });
});

test('concurrent first requests share one matching run', async () => {
  const { client, calls } = fakeItunes({ delay: 20 });
  const svc = createPreviewService({ db, itunes: client });
  const [a, b] = await Promise.all([svc.get(7455230), svc.get(7455230)]);
  expect(calls.searchAlbums).toBe(1);
  expect(a).toEqual(b);
});

test('Discogs sync leaves preview data alone', async () => {
  const svc = createPreviewService({ db, itunes: fakeItunes().client });
  await svc.get(7455230);
  const snapshot = () => db.prepare('SELECT * FROM preview_tracks ORDER BY track_idx').all();
  const before = snapshot();
  upsertBasic(db, collection().releases.filter((i) => IDS.includes(i.id)), NOW);
  applyDetail(db, release(7455230), NOW);
  expect(snapshot()).toEqual(before);
});

test('track rows carry their idx', () => {
  expect(typeof getReleaseDetail(db, 7455230)!.sides[0].tracks[0].idx).toBe('number');
});

test('final: a record opened before its tracklist syncs is not cached as unmatched', async () => {
  const { client } = fakeItunes();
  const svc = createPreviewService({ db, itunes: client });
  db.prepare('DELETE FROM tracks WHERE release_id = 7455230').run();
  const early = (await svc.get(7455230))!;
  expect(early.status).toBe('unmatched');
  expect(db.prepare('SELECT count(*) AS n FROM preview_matches WHERE release_id = 7455230').get()).toEqual({ n: 0 });
  applyDetail(db, release(7455230), NOW);
  expect((await svc.get(7455230))!.status).toBe('auto');
});

test('final: an unmatched row older than the latest detail sync is retried', async () => {
  const svc = createPreviewService({ db, itunes: fakeItunes({ empty: true }).client });
  expect((await svc.get(7455230))!.status).toBe('unmatched');
  db.prepare("UPDATE preview_matches SET matched_at = '2000-01-01T00:00:00.000Z' WHERE release_id = 7455230").run();
  const { client, calls } = fakeItunes();
  const svc2 = createPreviewService({ db, itunes: client });
  expect((await svc2.get(7455230))!.status).toBe('auto');
  expect(calls.searchAlbums).toBe(1);
});

test('final: a preview reported as failed is re-mapped on the next get', async () => {
  const { client, calls } = fakeItunes();
  const svc = createPreviewService({ db, itunes: client });
  const info = (await svc.get(7455230))!;
  const idx = Number(Object.keys(info.tracks)[0]);
  expect(svc.markFailed(7455230, idx)).toBe(true);
  expect(svc.markFailed(7455230, 99999)).toBe(false);
  await svc.get(7455230);
  expect(calls.searchAlbums).toBe(2);
});
