import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { openDb } from '../src/db/index.js';

const TABLES = [
  'releases', 'tracks', 'images', 'notes', 'tags', 'release_tags',
  'crates', 'crate_releases', 'plays', 'price_history', 'sync_state',
];

test('creates all tables', () => {
  const db = openDb(':memory:');
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
  for (const t of TABLES) expect(names).toContain(t);
});

test('opening the same file twice is idempotent', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'vo-')), 'nested', 'library.db');
  openDb(file).close();
  expect(() => openDb(file).close()).not.toThrow();
});

test('deleting a tag cascades its release_tags', () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO tags (id, name) VALUES (1, 'Sunday')").run();
  db.prepare('INSERT INTO release_tags (release_id, tag_id) VALUES (42, 1)').run();
  db.prepare('DELETE FROM tags WHERE id = 1').run();
  expect(db.prepare('SELECT count(*) AS n FROM release_tags').get()).toEqual({ n: 0 });
});
