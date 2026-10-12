import type { Db } from '../db/index.js';
import type { NowSpinningSource, NowSpinningState, Play } from '../api-types.js';
import { addPlay } from './user.js';

export type { NowSpinningSource, NowSpinningState };

/** A record logged by Spin now or a tag tap is not logged again inside this window. */
export const PLAY_DEDUPE_MS = 600_000;

interface Row {
  release_id: number | null;
  source: NowSpinningSource | null;
  updated_at: string | null;
  tap: number;
  tap_at: string | null;
}

export function getNowSpinning(db: Db, now: Date): NowSpinningState {
  const row = db.prepare('SELECT release_id, source, updated_at, tap, tap_at FROM now_spinning WHERE id = 1').get() as Row;
  const live = row.release_id !== null
    && db.prepare('SELECT 1 FROM releases WHERE id = ? AND removed_at IS NULL').get(row.release_id) !== undefined;
  return {
    releaseId: live ? row.release_id : null,
    source: live ? row.source : null,
    updatedAt: live ? row.updated_at : null,
    tap: row.tap,
    tapAgeMs: row.tap_at ? now.getTime() - new Date(row.tap_at).getTime() : null,
  };
}

export function setNowSpinning(
  db: Db, releaseId: number, source: NowSpinningSource, now: Date, opts: { tap?: boolean } = {},
): void {
  const iso = now.toISOString();
  if (opts.tap) {
    db.prepare('UPDATE now_spinning SET release_id = ?, source = ?, updated_at = ?, tap = tap + 1, tap_at = ? WHERE id = 1')
      .run(releaseId, source, iso, iso);
  } else {
    db.prepare('UPDATE now_spinning SET release_id = ?, source = ?, updated_at = ? WHERE id = 1').run(releaseId, source, iso);
  }
}

export function clearNowSpinning(db: Db): void {
  db.prepare('UPDATE now_spinning SET release_id = NULL, source = NULL, updated_at = NULL WHERE id = 1').run();
}

/** Logs a play unless this release already has one inside the window. played_at is stored as UTC ISO text. */
export function logPlayIfNew(db: Db, releaseId: number, now: Date, windowMs = PLAY_DEDUPE_MS): Play | null {
  const since = new Date(now.getTime() - windowMs).toISOString();
  const recent = db.prepare('SELECT 1 FROM plays WHERE release_id = ? AND played_at >= ?').get(releaseId, since);
  return recent ? null : addPlay(db, releaseId, now.toISOString());
}
