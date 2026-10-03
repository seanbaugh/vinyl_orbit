import { beforeEach, expect, test } from 'vitest';
import { openDb, type Db } from '../src/db/index.js';
import {
  applyDetail, getFacets, getReleaseDetail, imagesMissingLocal, likePattern, listReleases, markRemoved,
  releasesNeedingDetail, setImageLocalPath, upsertBasic,
} from '../src/repo/releases.js';
import { collection, release } from './helpers.js';

const NOW = '2026-10-03T12:00:00.000Z';
const items = collection().releases;
let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  upsertBasic(db, items, NOW);
});

const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

test('upsertBasic stores every collection item with derived display fields', () => {
  expect(count('SELECT count(*) AS n FROM releases')).toBe(items.length);
  const row = db.prepare('SELECT format_summary, artists_display FROM releases WHERE id = 7455230').get();
  expect(row).toEqual({ format_summary: '2×LP', artists_display: 'John Williams, The London Symphony Orchestra' });
});

test('the same release owned twice becomes one row with copies = 2', () => {
  const fresh = openDb(':memory:');
  const item = items.find((i) => i.id === 7455230)!;
  upsertBasic(fresh, [item, { ...item, instance_id: 999 }], NOW);
  expect(fresh.prepare('SELECT count(*) AS n, copies FROM releases').get()).toEqual({ n: 1, copies: 2 });
});

test('release without a cover has null coverUrl', () => {
  const r = db.prepare('SELECT cover_remote FROM releases WHERE id = 30487525').get() as { cover_remote: string | null };
  expect(r.cover_remote).toBeNull();
  expect(listReleases(db, {}).find((x) => x.id === 30487525)!.coverUrl).toBeNull();
});

test('markRemoved hides unseen releases until they reappear', () => {
  expect(markRemoved(db, [7455230], NOW)).toBe(items.length - 1);
  expect(listReleases(db, {})).toHaveLength(1);
  expect(listReleases(db, { includeRemoved: true })).toHaveLength(items.length);
  upsertBasic(db, items, NOW);
  expect(listReleases(db, {})).toHaveLength(items.length);
});

test('applyDetail stores tracks with headings, images and a price row', () => {
  const rel = release(14093800);
  applyDetail(db, rel, NOW);
  expect(count("SELECT count(*) AS n FROM tracks WHERE release_id = 14093800 AND type = 'heading'")).toBeGreaterThan(0);
  const detail = getReleaseDetail(db, 14093800)!;
  expect(detail.sides.map((s) => s.side).slice(0, 3)).toEqual(['A', 'B', 'C']);
  expect(detail.images).toHaveLength(rel.images!.length);
  expect(detail.priceHistory).toHaveLength(1);
  expect(detail.detailSyncedAt).toBe(NOW);
});

test('applyDetail on a release with no listings and no images', () => {
  applyDetail(db, release(30487525), NOW);
  const detail = getReleaseDetail(db, 30487525)!;
  expect(detail.lowestPrice).toBeNull();
  expect(detail.priceHistory[0].lowestPrice).toBeNull();
  expect(detail.images).toEqual([]);
});

test('applying detail twice on the same day keeps one price row', () => {
  applyDetail(db, release(7455230), NOW);
  applyDetail(db, release(7455230), NOW);
  expect(count('SELECT count(*) AS n FROM price_history WHERE release_id = 7455230')).toBe(1);
});

test('applyDetail keeps an existing local image path', () => {
  applyDetail(db, release(7455230), NOW);
  setImageLocalPath(db, 7455230, 0, 'images/7455230/0.jpg');
  applyDetail(db, release(7455230), NOW);
  expect(imagesMissingLocal(db).some((i) => i.releaseId === 7455230 && i.idx === 0)).toBe(false);
  expect(getReleaseDetail(db, 7455230)!.coverUrl).toBe('/images/7455230/0.jpg');
});

test('releasesNeedingDetail: new always, stale limited', () => {
  const all = releasesNeedingDetail(db, { refreshDays: 7, staleLimit: 0, now: NOW });
  expect(all).toHaveLength(items.length);
  applyDetail(db, release(7455230), NOW);
  const later = '2026-10-11T12:00:00.000Z';
  const limited = releasesNeedingDetail(db, { refreshDays: 7, staleLimit: 0, now: later });
  expect(limited).not.toContain(7455230);
  expect(limited).toHaveLength(items.length - 1);
  expect(releasesNeedingDetail(db, { refreshDays: 7, staleLimit: null, now: later })).toContain(7455230);
  expect(releasesNeedingDetail(db, { refreshDays: 7, staleLimit: null, now: NOW })).not.toContain(7455230);
});

test('listReleases filters and sorts', () => {
  expect(listReleases(db, { genre: 'Stage & Screen' }).map((r) => r.id)).toContain(7455230);
  const years = listReleases(db, { sort: 'year', order: 'asc' }).map((r) => r.year);
  const known = years.filter((y): y is number => y !== null);
  expect(known).toEqual([...known].sort((a, b) => a - b));
  expect(years.indexOf(null) === -1 || years.slice(years.indexOf(null)).every((y) => y === null)).toBe(true);
  expect(listReleases(db, { q: 'star wars' }).map((r) => r.id)).toContain(7455230);
  expect(listReleases(db, { decade: 1970 }).every((r) => r.year! >= 1970 && r.year! < 1980)).toBe(true);
});

test('likePattern escapes wildcards', () => {
  expect(likePattern('50%_off\\')).toBe('%50\\%\\_off\\\\%');
  expect(listReleases(db, { q: '%' })).toEqual([]);
  expect(listReleases(db, { q: "Guns N' Roses" })).toEqual([]);
});

test('getFacets counts non-removed releases', () => {
  const f = getFacets(db);
  expect(f.total).toBe(items.length);
  expect(f.formats.find((x) => x.value === '2×LP')).toBeTruthy();
  expect(f.genres[0].count).toBeGreaterThanOrEqual(f.genres[f.genres.length - 1].count);
  markRemoved(db, [7455230], NOW);
  expect(getFacets(db).total).toBe(1);
});

test('title sort ignores leading articles, matching the A–Z rail', () => {
  const fresh = openDb(':memory:');
  const base = items[0];
  const withTitle = (id: number, title: string) =>
    ({ ...base, id, basic_information: { ...base.basic_information, id, title } });
  upsertBasic(fresh, [withTitle(1, 'The Wall'), withTitle(2, 'Abbey Road'), withTitle(3, 'A Night at the Opera'), withTitle(4, 'Zenyatta')], NOW);
  expect(listReleases(fresh, { sort: 'title' }).map((r) => r.title))
    .toEqual(['Abbey Road', 'A Night at the Opera', 'The Wall', 'Zenyatta']);
});
