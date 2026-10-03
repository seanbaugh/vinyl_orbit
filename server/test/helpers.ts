import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CollectionPage, DiscogsRelease } from '../src/discogs/types.js';

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));

export const collection = (): CollectionPage => JSON.parse(readFileSync(dir + 'collection.json', 'utf8'));
export const release = (id: number): DiscogsRelease => JSON.parse(readFileSync(`${dir}release-${id}.json`, 'utf8'));
export const RELEASE_IDS = [7455230, 30487525, 9222236, 14093800];

export const itunesFixture = (name: string): unknown =>
  JSON.parse(readFileSync(`${dir}itunes/${name}.json`, 'utf8'));
