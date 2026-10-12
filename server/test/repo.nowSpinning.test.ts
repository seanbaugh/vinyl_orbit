import { beforeEach, expect, test } from 'vitest';
import { openDb, type Db } from '../src/db/index.js';
import {
  clearNowSpinning, getNowSpinning, logPlayIfNew, setNowSpinning,
} from '../src/repo/nowSpinning.js';
import { markRemoved, upsertBasic } from '../src/repo/releases.js';
import { collection } from './helpers.js';

const T0 = new Date('2026-10-12T20:00:00.000Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const ID = 7455230;
let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  upsertBasic(db, collection().releases, T0.toISOString());
});

test('a fresh database has nothing spinning', () => {
  expect(getNowSpinning(db, T0)).toEqual({
    releaseId: null, source: null, updatedAt: null, tap: 0, tapAgeMs: null,
  });
});

test('setNowSpinning stores the release and its source', () => {
  setNowSpinning(db, ID, 'manual', T0);
  expect(getNowSpinning(db, T0)).toMatchObject({
    releaseId: ID, source: 'manual', updatedAt: T0.toISOString(), tap: 0, tapAgeMs: null,
  });
});

test('a tap increments the counter and reports its age from the injected clock', () => {
  setNowSpinning(db, ID, 'tag', T0, { tap: true });
  setNowSpinning(db, ID, 'tag', at(1), { tap: true });
  const state = getNowSpinning(db, at(1.5));
  expect(state.tap).toBe(2);
  expect(state.tapAgeMs).toBe(30_000);
  expect(state.source).toBe('tag');
});

test('setting without tap leaves the counter alone', () => {
  setNowSpinning(db, ID, 'tag', T0, { tap: true });
  setNowSpinning(db, ID, 'manual', at(1));
  expect(getNowSpinning(db, at(2)).tap).toBe(1);
});

test('clearNowSpinning empties the record but keeps the tap counter', () => {
  setNowSpinning(db, ID, 'tag', T0, { tap: true });
  clearNowSpinning(db);
  expect(getNowSpinning(db, T0)).toMatchObject({ releaseId: null, source: null, tap: 1 });
});

test('a stored release that was removed by sync reads as nothing spinning', () => {
  setNowSpinning(db, ID, 'manual', T0);
  markRemoved(db, [], at(1).toISOString());
  expect(getNowSpinning(db, at(2)).releaseId).toBeNull();
});

test('a stored release id that does not exist reads as nothing spinning', () => {
  setNowSpinning(db, 999_999_999, 'manual', T0);
  expect(getNowSpinning(db, T0).releaseId).toBeNull();
});

test('logPlayIfNew logs once per ten-minute window', () => {
  expect(logPlayIfNew(db, ID, T0)).toMatchObject({ playedAt: T0.toISOString() });
  expect(logPlayIfNew(db, ID, at(9))).toBeNull();
  expect(logPlayIfNew(db, ID, at(11))).toMatchObject({ playedAt: at(11).toISOString() });
  expect(db.prepare('SELECT count(*) AS n FROM plays WHERE release_id = ?').get(ID)).toEqual({ n: 2 });
});

test('the dedupe window is per release', () => {
  const other = collection().releases.find((r) => r.id !== ID)!.id;
  expect(logPlayIfNew(db, ID, T0)).not.toBeNull();
  expect(logPlayIfNew(db, other, at(1))).not.toBeNull();
});
