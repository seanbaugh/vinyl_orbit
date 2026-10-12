import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Db } from '../src/db/index.js';
import type { CollectionPage, DiscogsRelease } from '../src/discogs/types.js';

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));

export const collection = (): CollectionPage => JSON.parse(readFileSync(dir + 'collection.json', 'utf8'));
export const release = (id: number): DiscogsRelease => JSON.parse(readFileSync(`${dir}release-${id}.json`, 'utf8'));
export const RELEASE_IDS = [7455230, 30487525, 9222236, 14093800];

export const itunesFixture = (name: string): unknown =>
  JSON.parse(readFileSync(`${dir}itunes/${name}.json`, 'utf8'));

export interface SeedRow { id: number; title: string; artists: string; removed?: boolean }

/** Inserts minimal release rows (only the NOT NULL columns) for tests that need titles and artists, not full detail. */
export function seedReleases(db: Db, rows: SeedRow[]): void {
  const insert = db.prepare(`INSERT INTO releases (id, instance_ids, title, artists_display, artists_json, labels_json,
    formats_json, format_summary, genres_json, styles_json, date_added, basic_synced_at, removed_at)
    VALUES (?, '[]', ?, ?, '[]', '[]', '[]', 'LP', '[]', '[]', 'x', 'x', ?)`);
  for (const r of rows) insert.run(r.id, r.title, r.artists, r.removed ? 'x' : null);
}
