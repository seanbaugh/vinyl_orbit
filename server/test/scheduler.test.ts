import { expect, test } from 'vitest';
import { openDb } from '../src/db/index.js';
import { createScheduler } from '../src/sync/scheduler.js';
import type { SyncResult } from '../src/sync/sync.js';

const result: SyncResult = { added: 1, removed: 0, detailed: 1, imagesSaved: 1, errors: [] };

test('single-flight: concurrent triggers run once', async () => {
  const db = openDb(':memory:');
  let calls = 0;
  let finish!: () => void;
  const sched = createScheduler(() => {
    calls++;
    return new Promise<SyncResult>((resolve) => { finish = () => resolve(result); });
  }, { intervalHours: 0, db });

  expect(sched.trigger(true).running).toBe(true);
  expect(sched.trigger(true).running).toBe(true);
  expect(calls).toBe(1);
  finish();
  await new Promise((r) => setTimeout(r, 0));
  const status = sched.status();
  expect(status.running).toBe(false);
  expect(status.lastCompletedAt).not.toBeNull();
  expect(status.lastResult).toEqual(result);
  const row = db.prepare("SELECT value FROM sync_state WHERE key = 'last_completed_at'").get() as { value: string };
  expect(row.value).toBe(status.lastCompletedAt);
});

test('a rejected run records lastError and persists across schedulers', async () => {
  const db = openDb(':memory:');
  const sched = createScheduler(async () => { throw new Error('Discogs down'); }, { intervalHours: 0, db });
  sched.trigger(false);
  await new Promise((r) => setTimeout(r, 0));
  expect(sched.status().lastError).toBe('Discogs down');
  expect(sched.status().progress.phase).toBe('error');
  const again = createScheduler(async () => result, { intervalHours: 0, db });
  expect(again.status().lastError).toBe('Discogs down');
});

test('progress updates are visible while running', async () => {
  const db = openDb(':memory:');
  let finish!: () => void;
  const sched = createScheduler((_full, onProgress) => {
    onProgress({ phase: 'details', done: 2, total: 10 });
    return new Promise<SyncResult>((resolve) => { finish = () => resolve(result); });
  }, { intervalHours: 0, db });
  sched.trigger(true);
  expect(sched.status().progress).toEqual({ phase: 'details', done: 2, total: 10 });
  finish();
});
