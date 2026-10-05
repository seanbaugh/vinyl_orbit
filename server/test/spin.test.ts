import { beforeEach, expect, test } from 'vitest';
import { openDb, type Db } from '../src/db/index.js';
import { upsertBasic } from '../src/repo/releases.js';
import { getSpinOptions, pickSpin } from '../src/repo/spin.js';
import { collection } from './helpers.js';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const items = collection().releases;
let db: Db;
let ids: number[];

const setup = (id: number, genres: string[], styles: string[], format?: string) => {
  db.prepare('UPDATE releases SET genres_json = ?, styles_json = ? WHERE id = ?').run(JSON.stringify(genres), JSON.stringify(styles), id);
  if (format) db.prepare('UPDATE releases SET format_summary = ? WHERE id = ?').run(format, id);
};
const play = (id: number, at: string) => db.prepare('INSERT INTO plays (release_id, played_at) VALUES (?, ?)').run(id, at);

beforeEach(() => {
  db = openDb(':memory:');
  upsertBasic(db, items, NOW.toISOString());
  ids = items.slice(0, 4).map((i) => i.id).sort((a, b) => a - b);
  db.prepare('UPDATE releases SET removed_at = ? WHERE id NOT IN (SELECT value FROM json_each(?))')
    .run(NOW.toISOString(), JSON.stringify(ids));
  setup(ids[0], ['Rock'], ['Prog Rock'], 'LP');
  setup(ids[1], ['Rock', 'Pop'], ['Synth-pop'], 'CD');
  setup(ids[2], ['Jazz'], ['Cool Jazz'], 'LP');
  setup(ids[3], ['Rock'], ['Prog Rock'], 'LP');
});

test('returns null when nothing matches', () => {
  expect(pickSpin(db, { genres: ['Classical'] }, NOW)).toBeNull();
});

test('only picks records from the chosen genre, style and format', () => {
  for (let i = 0; i < 20; i++) {
    expect(pickSpin(db, { genres: ['Rock'] }, NOW, Math.random)!.genres).toContain('Rock');
    expect(pickSpin(db, { styles: ['Cool Jazz'] }, NOW)!.id).toBe(ids[2]);
    expect(pickSpin(db, { genres: ['Rock'], format: 'CD' }, NOW)!.id).toBe(ids[1]);
  }
});

test('several genres or moods match any of them; genre and mood together must both match', () => {
  const seen = (q: object) => {
    const out = new Set<number>();
    for (let i = 0; i < 200; i++) out.add(pickSpin(db, q, NOW, () => i / 200)!.id);
    return [...out].sort((a, b) => a - b);
  };
  expect(seen({ genres: ['Jazz', 'Pop'] })).toEqual([ids[1], ids[2]]);
  expect(seen({ styles: ['Cool Jazz', 'Synth-pop'] })).toEqual([ids[1], ids[2]]);
  expect(seen({ genres: ['Rock', 'Jazz'], styles: ['Cool Jazz', 'Synth-pop'] })).toEqual([ids[1], ids[2]]);
  expect(pickSpin(db, { genres: ['Jazz'], styles: ['Prog Rock', 'Synth-pop'] }, NOW)).toBeNull();
});

test('skips records played within the window (default 7 days) but not older plays', () => {
  play(ids[0], daysAgo(3));
  play(ids[1], daysAgo(8));
  play(ids[2], daysAgo(1));
  play(ids[3], daysAgo(6));
  expect(pickSpin(db, {}, NOW)!.id).toBe(ids[1]);
  expect(pickSpin(db, { days: 2 }, NOW, () => 0.99)).not.toBeNull();
  expect(pickSpin(db, { days: 30 }, NOW)).toBeNull();
});

test('never-played-only ignores anything that has ever been played', () => {
  play(ids[0], daysAgo(900));
  play(ids[1], daysAgo(900));
  play(ids[2], daysAgo(900));
  expect(pickSpin(db, { neverPlayed: true }, NOW)!.id).toBe(ids[3]);
});

test('records already shown are excluded', () => {
  const rest = pickSpin(db, { exclude: [ids[0], ids[1], ids[2]] }, NOW)!;
  expect(rest.id).toBe(ids[3]);
  expect(pickSpin(db, { exclude: ids }, NOW)).toBeNull();
});

test('removed records are never picked', () => {
  db.prepare('UPDATE releases SET removed_at = ? WHERE id != ?').run(NOW.toISOString(), ids[0]);
  expect(pickSpin(db, {}, NOW)!.id).toBe(ids[0]);
});

test('the longer a record has sat, the more likely it is (never played most of all)', () => {
  play(ids[0], daysAgo(10));
  play(ids[1], daysAgo(400));
  play(ids[2], daysAgo(40));
  // ids[3] is never played → heaviest, so it owns the top of the range; ids[0] the bottom.
  expect(pickSpin(db, {}, NOW, () => 0.999)!.id).toBe(ids[3]);
  expect(pickSpin(db, {}, NOW, () => 0)!.id).toBe(ids[0]);
});

test('spin options list genres with their styles, most common first', () => {
  const o = getSpinOptions(db);
  expect(o.genres[0]).toEqual({ value: 'Rock', count: 3, styles: [{ value: 'Prog Rock', count: 2 }, { value: 'Synth-pop', count: 1 }] });
  expect(o.genres.map((g) => g.value)).toEqual(['Rock', 'Jazz', 'Pop']);
  expect(o.formats).toEqual(expect.arrayContaining(['LP', 'CD']));
});
