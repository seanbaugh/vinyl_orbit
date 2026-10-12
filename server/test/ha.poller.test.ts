import { beforeEach, describe, expect, test } from 'vitest';
import { openDb, type Db } from '../src/db/index.js';
import type { HaOverride, HaPair } from '../src/homeassistant/match.js';
import { createHaPoller } from '../src/homeassistant/poller.js';
import { getNowSpinning, setNowSpinning } from '../src/repo/nowSpinning.js';
import { seedReleases } from './helpers.js';

const RECKLESS = { album: 'Reckless', artist: 'Bryan Adams' };
const STAR_WARS = { album: 'Star Wars', artist: 'John Williams' };
const EMPTY = { album: '', artist: '' };
const UNKNOWN = { album: 'Atlas', artist: 'Sleeping at Last' };
const T0 = new Date('2026-10-12T20:00:00.000Z');

let db: Db;
let clock: Date;
let logs: { level: 'info' | 'warn'; message: string }[];

beforeEach(() => {
  db = openDb(':memory:');
  seedReleases(db, [
    { id: 7, title: 'Reckless', artists: 'Bryan Adams' },
    { id: 6, title: 'Star Wars', artists: 'John Williams, London Symphony Orchestra' },
  ]);
  clock = T0;
  logs = [];
});

/** A poller whose reads come from a script; each tick consumes the next entry. */
function scripted(script: (HaPair | Error)[], overrides: HaOverride[] = []) {
  let i = 0;
  const poller = createHaPoller({
    db,
    read: async () => {
      const next = script[i++];
      if (next === undefined) throw new Error('script exhausted');
      if (next instanceof Error) throw next;
      return next;
    },
    overrides: () => overrides,
    now: () => clock,
    log: { info: (message) => logs.push({ level: 'info', message }), warn: (message) => logs.push({ level: 'warn', message }) },
  });
  const ticks = async (n: number) => { for (let k = 0; k < n; k++) await poller.tick(); };
  return { poller, ticks };
}

const plays = (id: number) => (db.prepare('SELECT count(*) AS n FROM plays WHERE release_id = ?').get(id) as { n: number }).n;
const state = () => getNowSpinning(db, clock);

describe('a tag tap', () => {
  test('a pair seen once does nothing; seen on two consecutive ticks it acts', async () => {
    const { ticks } = scripted([EMPTY, EMPTY, RECKLESS, RECKLESS]);
    await ticks(3);
    expect(state().releaseId).toBeNull();
    await ticks(1);
    expect(state()).toMatchObject({ releaseId: 7, source: 'tag', tap: 1 });
    expect(plays(7)).toBe(1);
  });

  test('a steady pair is not re-logged on later ticks', async () => {
    const { ticks } = scripted([EMPTY, EMPTY, RECKLESS, RECKLESS, RECKLESS, RECKLESS]);
    await ticks(6);
    expect(state().tap).toBe(1);
    expect(plays(7)).toBe(1);
  });

  test('tapping another record within ten minutes switches records; replaying the same one is not logged twice', async () => {
    const { ticks } = scripted([EMPTY, EMPTY, RECKLESS, RECKLESS, STAR_WARS, STAR_WARS, RECKLESS, RECKLESS]);
    await ticks(4);
    clock = new Date(T0.getTime() + 60_000);
    await ticks(2);
    expect(state()).toMatchObject({ releaseId: 6, tap: 2 });
    clock = new Date(T0.getTime() + 120_000);
    await ticks(2);
    expect(state()).toMatchObject({ releaseId: 7, tap: 3 });
    expect(plays(7)).toBe(1);
    expect(plays(6)).toBe(1);
  });

  test('a pair with no match changes nothing, logs no play and says so once', async () => {
    const { ticks } = scripted([EMPTY, EMPTY, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN]);
    await ticks(6);
    expect(state().releaseId).toBeNull();
    expect(db.prepare('SELECT count(*) AS n FROM plays').get()).toEqual({ n: 0 });
    expect(logs.filter((l) => l.level === 'info' && l.message.includes('Atlas'))).toHaveLength(1);
  });

  test('an override maps a pair that fuzzy matching cannot', async () => {
    const { ticks } = scripted([EMPTY, EMPTY, UNKNOWN, UNKNOWN], [{ ...UNKNOWN, releaseId: 6 }]);
    await ticks(4);
    expect(state()).toMatchObject({ releaseId: 6, source: 'tag' });
  });

  test('a tag tap overwrites a record chosen with Spin now', async () => {
    setNowSpinning(db, 6, 'manual', T0);
    const { ticks } = scripted([EMPTY, EMPTY, RECKLESS, RECKLESS]);
    await ticks(4);
    expect(state()).toMatchObject({ releaseId: 7, source: 'tag' });
  });
});

describe('Home Assistant clearing the helpers', () => {
  test('clears a record that came from a tag', async () => {
    const { ticks } = scripted([EMPTY, EMPTY, RECKLESS, RECKLESS, EMPTY, EMPTY]);
    await ticks(6);
    expect(state()).toMatchObject({ releaseId: null, tap: 1 });
  });

  test('leaves a record chosen with Spin now alone', async () => {
    const { ticks } = scripted([EMPTY, EMPTY, RECKLESS, RECKLESS, EMPTY, EMPTY]);
    await ticks(4);
    setNowSpinning(db, 6, 'manual', T0); // Spin now pressed after the tap
    await ticks(2);
    expect(state()).toMatchObject({ releaseId: 6, source: 'manual' });
  });
});

describe('the first confirmed read after the server starts', () => {
  test('helper matches the stored tag record: nothing changes', async () => {
    setNowSpinning(db, 7, 'tag', T0, { tap: true });
    const { ticks } = scripted([RECKLESS, RECKLESS]);
    await ticks(2);
    expect(state()).toMatchObject({ releaseId: 7, tap: 1 });
    expect(plays(7)).toBe(0);
  });

  test('helper differs from the stored record: the helper wins, with no play and no tap', async () => {
    setNowSpinning(db, 6, 'manual', T0);
    const { ticks } = scripted([RECKLESS, RECKLESS]);
    await ticks(2);
    expect(state()).toMatchObject({ releaseId: 7, source: 'tag', tap: 0 });
    expect(plays(7)).toBe(0);
  });

  test('helper present and nothing stored: set it, no play, no tap', async () => {
    const { ticks } = scripted([RECKLESS, RECKLESS]);
    await ticks(2);
    expect(state()).toMatchObject({ releaseId: 7, source: 'tag', tap: 0 });
    expect(plays(7)).toBe(0);
  });

  test('helper empty and a tag record stored: cleared (Home Assistant cleared it while the server was down)', async () => {
    setNowSpinning(db, 7, 'tag', T0, { tap: true });
    const { ticks } = scripted([EMPTY, EMPTY]);
    await ticks(2);
    expect(state().releaseId).toBeNull();
  });

  test('helper empty and a Spin now record stored: kept', async () => {
    setNowSpinning(db, 7, 'manual', T0);
    const { ticks } = scripted([EMPTY, EMPTY]);
    await ticks(2);
    expect(state()).toMatchObject({ releaseId: 7, source: 'manual' });
  });
});

describe('when Home Assistant cannot be read', () => {
  const down = () => new Error('Home Assistant input_text.vinyl_album is unavailable');

  test('one warning per outage, state untouched, one recovery message', async () => {
    const { ticks } = scripted([RECKLESS, RECKLESS, down(), down(), down(), RECKLESS]);
    await ticks(6);
    expect(state()).toMatchObject({ releaseId: 7 });
    expect(logs.filter((l) => l.level === 'warn')).toHaveLength(1);
    expect(logs.filter((l) => l.level === 'info' && /recover/i.test(l.message))).toHaveLength(1);
  });

  test('an unavailable helper never clears the record or logs a play', async () => {
    setNowSpinning(db, 7, 'tag', T0, { tap: true });
    const { ticks } = scripted([down(), down(), down()]);
    await ticks(3);
    expect(state()).toMatchObject({ releaseId: 7, source: 'tag' });
    expect(db.prepare('SELECT count(*) AS n FROM plays').get()).toEqual({ n: 0 });
  });

  test('a failed read between two good ones resets the stability count', async () => {
    const { ticks } = scripted([EMPTY, EMPTY, RECKLESS, down(), RECKLESS]);
    await ticks(5);
    expect(state().releaseId).toBeNull();
  });

  test('a poller that never reaches Home Assistant does not throw out of tick', async () => {
    const { poller } = scripted([down()]);
    await expect(poller.tick()).resolves.toBeUndefined();
  });
});
