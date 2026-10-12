import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, test } from 'vitest';
import { openDb, type Db } from '../src/db/index.js';
import { loadAllOverrides, loadOverrides, matchRecord, type HaOverride, type HaPair } from '../src/homeassistant/match.js';
import { seedReleases, type SeedRow } from './helpers.js';

const seed = seedReleases;

const ROWS: SeedRow[] = [
  { id: 1, title: 'Greatest Hits', artists: 'Melissa Manchester' },
  { id: 2, title: 'Greatest Hits', artists: 'Chicago' },
  { id: 3, title: 'Berio / Bartók', artists: 'Leonard Bernstein' },
  { id: 4, title: "Don't Cry Out Loud", artists: 'Melissa Manchester' },
  { id: 5, title: "Windham Hill '88", artists: 'Various' },
  { id: 6, title: 'Star Wars', artists: 'John Williams, London Symphony Orchestra' },
  { id: 7, title: 'Reckless', artists: 'Bryan Adams' },
  { id: 8, title: 'Chicago II', artists: 'Chicago' },
  { id: 9, title: 'Chicago VII', artists: 'Chicago' },
];

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
  seed(db, ROWS);
});

describe('matchRecord', () => {
  test('exact title and artist', () => {
    expect(matchRecord(db, { album: 'Reckless', artist: 'Bryan Adams' }, [])).toBe(7);
  });

  test('ignores case, punctuation and diacritics', () => {
    expect(matchRecord(db, { album: 'berio and bartok', artist: 'LEONARD BERNSTEIN' }, [])).toBe(3);
    expect(matchRecord(db, { album: 'Dont Cry Out Loud', artist: 'melissa manchester' }, [])).toBe(4);
    expect(matchRecord(db, { album: "Windham Hill '88", artist: 'Various' }, [])).toBe(5);
  });

  test('a shorter artist than Discogs still matches when the title is exact', () => {
    expect(matchRecord(db, { album: 'Star Wars', artist: 'John Williams' }, [])).toBe(6);
  });

  test('two releases with the same title are told apart by artist', () => {
    expect(matchRecord(db, { album: 'Greatest Hits', artist: 'Chicago' }, [])).toBe(2);
    expect(matchRecord(db, { album: 'Greatest Hits', artist: 'Melissa Manchester' }, [])).toBe(1);
  });

  test('the wrong artist for a shared title never matches', () => {
    expect(matchRecord(db, { album: 'Greatest Hits', artist: 'Bryan Adams' }, [])).toBeNull();
  });

  test('a different number in the title is a different record, never a match', () => {
    const numbered = openDb(':memory:');
    seedReleases(numbered, [
      { id: 10, title: 'Mahler Symphony No. 1', artists: 'Leonard Bernstein' },
      { id: 11, title: 'Chicago II', artists: 'Chicago' },
      { id: 12, title: 'Chicago VII', artists: 'Chicago' },
    ]);
    expect(matchRecord(numbered, { album: 'Mahler Symphony No 3', artist: 'Leonard Bernstein' }, [])).toBeNull();
    expect(matchRecord(numbered, { album: 'Mahler Symphony No 1', artist: 'Leonard Bernstein' }, [])).toBe(10);
    expect(matchRecord(numbered, { album: 'Chicago 2', artist: 'Chicago' }, [])).toBeNull(); // safe miss (an override covers it), never VII
    expect(matchRecord(numbered, { album: 'Chicago VII', artist: 'Chicago' }, [])).toBe(12);
    expect(matchRecord(numbered, { album: 'Chicago 3', artist: 'Chicago' }, [])).toBeNull();
  });

  test('a title that is not in the collection is a miss', () => {
    expect(matchRecord(db, { album: 'Atlas', artist: 'Sleeping at Last' }, [])).toBeNull();
  });

  test('a blank artist or album never throws and never matches', () => {
    expect(matchRecord(db, { album: 'Reckless', artist: '' }, [])).toBeNull();
    expect(matchRecord(db, { album: '', artist: '' }, [])).toBeNull();
  });

  test('releases removed by sync are ignored', () => {
    const fresh = openDb(':memory:');
    seed(fresh, [{ id: 7, title: 'Reckless', artists: 'Bryan Adams', removed: true }]);
    expect(matchRecord(fresh, { album: 'Reckless', artist: 'Bryan Adams' }, [])).toBeNull();
  });

  test('overrides win over fuzzy matching and compare normalised text', () => {
    const overrides: HaOverride[] = [{ album: 'Chicago 2', artist: 'Chicago', releaseId: 8 }];
    expect(matchRecord(db, { album: 'chicago 2', artist: 'CHICAGO' }, overrides)).toBe(8);
    expect(matchRecord(db, { album: 'Chicago 2', artist: 'Chicago' }, [])).not.toBe(9);
  });

  test('an override for a release that is gone falls through to a miss, not a crash', () => {
    const overrides: HaOverride[] = [{ album: 'Atlas', artist: 'Sleeping at Last', releaseId: 123456 }];
    expect(matchRecord(db, { album: 'Atlas', artist: 'Sleeping at Last' }, overrides)).toBeNull();
  });
});

describe('loadOverrides', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vo-ov-'));

  test('a missing file is normal and gives no overrides', () => {
    expect(loadOverrides(join(dir, 'nope.json'))).toEqual([]);
  });

  test('invalid JSON or the wrong shape gives no overrides and does not throw', () => {
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{nope');
    expect(loadOverrides(bad)).toEqual([]);
    writeFileSync(bad, JSON.stringify({ album: 'x' }));
    expect(loadOverrides(bad)).toEqual([]);
  });

  test('loadAllOverrides puts the user file ahead of the shipped defaults, and works without a user file', () => {
    const file = join(dir, 'mine.json');
    writeFileSync(file, JSON.stringify([{ album: 'The End', artist: 'Cody Fry', releaseId: 28449781 }]));
    const merged = loadAllOverrides(file);
    expect(merged[0]).toEqual({ album: 'The End', artist: 'Cody Fry', releaseId: 28449781 });
    expect(merged.length).toBeGreaterThan(1);
    expect(merged.some((o) => o.album === 'Amadeus')).toBe(true);
    expect(loadAllOverrides(join(dir, 'absent.json')).some((o) => o.album === 'Amadeus')).toBe(true);
    // matchRecord takes the first override that matches, so the user's entry beats the shipped one
    const real = openDb(':memory:');
    seedReleases(real, [{ id: 28449781, title: 'The End', artists: 'Cody Fry' }, { id: 28322470, title: 'The End', artists: 'Cody Fry' }]);
    expect(matchRecord(real, { album: 'The End', artist: 'Cody Fry' }, merged)).toBe(28449781);
  });

  test('reads valid entries and skips malformed ones', () => {
    const file = join(dir, 'ok.json');
    writeFileSync(file, JSON.stringify([
      { album: 'Atlas', artist: 'Sleeping at Last', releaseId: 5 },
      { album: 'Space' },
    ]));
    expect(loadOverrides(file)).toEqual([{ album: 'Atlas', artist: 'Sleeping at Last', releaseId: 5 }]);
  });
});

describe('the 47 real tags against the real collection', () => {
  const fixtures = fileURLToPath(new URL('./fixtures/ha/', import.meta.url));
  const collection: { id: number; title: string; artistsDisplay: string }[] =
    JSON.parse(readFileSync(fixtures + 'collection.json', 'utf8'));
  const library: HaPair[] = JSON.parse(readFileSync(fixtures + 'tag-library.json', 'utf8'));
  const defaults = loadOverrides(fileURLToPath(new URL('../src/homeassistant/overrides.default.json', import.meta.url)));

  // Pinned by hand after reading every result against the collection (null = not owned on Discogs).
  const expected: Record<string, number | null> = {
    'Atlas — Sleeping at Last': 14093800, 'Space — Sleeping at Last': 27024483,
    'Gorecki Symphony No 3 — Henryk Gorecki': null, 'Shadowfax — Shadowfax': 4590939,
    'Southern Exposure — Alex de Grassi': 2846748, 'True Confessions — Bananarama': 15483583,
    'Reach the Beach — The Fixx': 6722014, '17 — Chicago': 3572135,
    "Windham Hill '88 — Various": 3031045, 'The Copland Album — Leonard Bernstein': 13153731,
    'Holst - The Planets — Previn, London Symphony Orchestra': 2313550, 'The End — Cody Fry': 28322470,
    'Autumn — George Winston': 2665273, 'Greatest Hits — Melissa Manchester': 6974193,
    'How to Keep a Fire Burning — Safari Room': null, 'Reckless — Bryan Adams': 1469334,
    'Firebird and Rite of Spring — Maazel, Tilson Thomas': null, 'Jupiter 8 — Paul Horn': 2974210,
    'Wind Dance — Scott Cossu': 31622086, 'A Chorus Line — Original Broadway Cast': 6102941,
    'Mahler Symphony No 1 — Bernstein': 5996289, 'Mahler Symphony No 2 — Bruno Walter': 3981515,
    'Caribou — Elton John': 11067069, 'Brother to Brother — Gino Vannelli': 1088088,
    'Blame It on Love — Rachael Sweet': 2620971, 'Chicago VII — Chicago': 941531,
    'Storm at Sunup — Gino Vannelli': 5876824, 'Opera Sauvage — Vangelis': 6649989,
    'Whitney — Whitney Houston': 29591491, 'Underneath the Colours — INXS': 5695560,
    'Christine McVie — Christine McVie': 888084, 'Something of Time — Nightnoise': 2103476,
    "Don't Cry Out Loud — Melissa Manchester": 12381910, 'Chicago 2 — Chicago': 448759,
    'Pauper in Paradise — Gino Vannelli': 1528502, 'Amadeus — Soundtrack': 2170959,
    'Firebird — London Symphony': 3958240, 'Greatest Hits — Chicago': 709484,
    'Star Wars — John Williams': 7455230, 'Gist of the Gemini — Gino Vannelli': 4274566,
    'Breaking Hearts — Elton John': 29237770, 'Remembrance Days — The Dream Academy': 1789560,
    'China — Vangelis': 13163451, 'Breakdown — Melissa Etheridge': 5700829,
    'Mahler Symphony No 5 — Karajan': 2189649, 'Berio and Bartók — Leonard Bernstein': 4156888,
    'Pictures at an Exhibition — Solti, Chicago Symphony Orchestra': 5732344,
  };
  const label = (p: HaPair) => `${p.album} — ${p.artist}`;

  let real: Db;
  beforeEach(() => {
    real = openDb(':memory:');
    seed(real, collection.map((r) => ({ id: r.id, title: r.title, artists: r.artistsDisplay })));
  });

  test('every tag in the library is pinned', () => {
    expect(library).toHaveLength(47);
    expect(library.map(label).sort()).toEqual(Object.keys(expected).sort());
  });

  test('with the shipped overrides every tag resolves to its pinned release (or to nothing)', () => {
    const actual = Object.fromEntries(library.map((p) => [label(p), matchRecord(real, p, defaults)]));
    expect(actual).toEqual(expected);
  });

  test('fuzzy matching alone never picks a wrong record: each result is the pinned one or a miss', () => {
    for (const p of library) {
      const got = matchRecord(real, p, []);
      expect(got === null || got === expected[label(p)], label(p)).toBe(true);
    }
  });

  test('the shipped overrides all point at releases that exist in the collection', () => {
    const ids = new Set(collection.map((r) => r.id));
    for (const o of defaults) expect(ids.has(o.releaseId), `${o.album} — ${o.artist}`).toBe(true);
  });
});
