import type { Db } from '../db/index.js';
import type { SyncProgress, SyncResult, SyncStatus } from '../api-types.js';

export type { SyncStatus };

export type SyncRunner = (full: boolean, onProgress: (p: SyncProgress) => void) => Promise<SyncResult>;

export interface Scheduler {
  start(): void;
  stop(): void;
  trigger(full: boolean): SyncStatus;
  status(): SyncStatus;
}

export function createScheduler(run: SyncRunner, opts: { intervalHours: number; db: Db }): Scheduler {
  const { db } = opts;
  const getState = (key: string) =>
    (db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;
  const setState = (key: string, value: string | null) => {
    if (value === null) db.prepare('DELETE FROM sync_state WHERE key = ?').run(key);
    else db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').run(key, value);
  };

  const lastResultJson = getState('last_result');
  const state: SyncStatus = {
    running: false,
    progress: { phase: 'idle', done: 0, total: 0 },
    lastCompletedAt: getState('last_completed_at'),
    lastError: getState('last_error'),
    lastResult: lastResultJson ? (JSON.parse(lastResultJson) as SyncResult) : null,
  };
  let timer: NodeJS.Timeout | null = null;

  const snapshot = (): SyncStatus => ({ ...state, progress: { ...state.progress } });

  function trigger(full: boolean): SyncStatus {
    if (state.running) return snapshot();
    state.running = true;
    state.progress = { phase: 'collection', done: 0, total: 0 };
    run(full, (p) => { state.progress = p; })
      .then((result) => {
        state.lastResult = result;
        state.lastCompletedAt = new Date().toISOString();
        // A failed collection pass (e.g. Discogs unreachable) is the run-level error;
        // per-release failures stay in lastResult.errors.
        state.lastError = result.errors.find((e) => e.startsWith('Collection:')) ?? null;
        state.progress = { phase: 'done', done: 1, total: 1 };
        setState('last_completed_at', state.lastCompletedAt);
        setState('last_result', JSON.stringify(result));
        setState('last_error', state.lastError);
      })
      .catch((e: unknown) => {
        state.lastError = e instanceof Error ? e.message : String(e);
        state.progress = { phase: 'error', done: 0, total: 0, message: state.lastError };
        setState('last_error', state.lastError);
      })
      .finally(() => { state.running = false; });
    return snapshot();
  }

  return {
    start() {
      trigger(false);
      if (opts.intervalHours > 0) {
        timer = setInterval(() => trigger(false), opts.intervalHours * 3_600_000);
        timer.unref();
      }
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    trigger,
    status: snapshot,
  };
}
