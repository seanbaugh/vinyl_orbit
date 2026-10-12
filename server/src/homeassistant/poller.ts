import type { Db } from '../db/index.js';
import { clearNowSpinning, getNowSpinning, logPlayIfNew, setNowSpinning } from '../repo/nowSpinning.js';
import { matchRecord, type HaOverride, type HaPair } from './match.js';

export interface HaPollerDeps {
  db: Db;
  read(): Promise<HaPair>;
  overrides(): HaOverride[];
  now(): Date;
  log: { info(message: string): void; warn(message: string): void };
}

export interface HaPoller {
  tick(): Promise<void>;
  start(intervalMs: number): void;
  stop(): void;
}

const keyOf = (p: HaPair) => JSON.stringify([p.album.trim(), p.artist.trim()]);
const isEmpty = (p: HaPair) => !p.album.trim() && !p.artist.trim();

/**
 * Turns what Home Assistant's helpers say into the server's now-spinning record. A pair is acted on only once the
 * same value has been read on two consecutive successful polls, so a read that straddles a tag change (album from
 * one tag, artist from the next) is never used. Home Assistant is only ever read.
 */
export function createHaPoller(deps: HaPollerDeps): HaPoller {
  const { db, log } = deps;
  let candidate: string | null = null; // value seen on the previous successful tick
  let acted: string | undefined; // value the poller last acted on; undefined until the first confirmed read
  let failing = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  function apply(pair: HaPair, first: boolean): void {
    const now = deps.now();
    if (isEmpty(pair)) {
      if (getNowSpinning(db, now).source === 'tag') clearNowSpinning(db);
      return;
    }
    const releaseId = matchRecord(db, pair, deps.overrides());
    if (releaseId === null) {
      log.info(`Home Assistant is showing "${pair.album}" by ${pair.artist}, which is not in the collection`);
      return;
    }
    if (first) {
      // Server (re)start: adopt what Home Assistant already shows. No play and no tap, so tabs do not pop open.
      const current = getNowSpinning(db, now);
      if (current.releaseId !== releaseId || current.source !== 'tag') setNowSpinning(db, releaseId, 'tag', now);
      return;
    }
    setNowSpinning(db, releaseId, 'tag', now, { tap: true });
    logPlayIfNew(db, releaseId, now);
  }

  async function tick(): Promise<void> {
    let pair: HaPair;
    try {
      pair = await deps.read();
    } catch (err) {
      candidate = null;
      if (!failing) {
        failing = true;
        log.warn(`Cannot read Home Assistant (will keep trying): ${(err as Error).message}`);
      }
      return;
    }
    if (failing) {
      failing = false;
      log.info('Home Assistant has recovered and is readable again');
    }
    const key = keyOf(pair);
    if (candidate !== key) {
      candidate = key;
      return;
    }
    if (acted === key) return;
    const first = acted === undefined;
    acted = key;
    apply(pair, first);
  }

  return {
    tick,
    start(intervalMs) {
      if (timer) return;
      const run = async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          await tick();
        } catch (err) {
          // Never let a bug here become an unhandled rejection: that would take the whole server down.
          log.warn(`Home Assistant poll failed: ${(err as Error).message}`);
        } finally {
          inFlight = false;
        }
      };
      void run();
      timer = setInterval(run, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
