import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SyncProgress, SyncResult } from '../api-types.js';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import type { DiscogsClient } from '../discogs/client.js';
import {
  applyDetail, imagesMissingLocal, markRemoved, releasesNeedingDetail, setImageLocalPath, upsertBasic,
} from '../repo/releases.js';

export type { SyncProgress, SyncResult };

export interface SyncDeps {
  db: Db;
  client: DiscogsClient;
  config: Config;
  now?: () => Date;
  onProgress?: (p: SyncProgress) => void;
}

const IMAGE_CONCURRENCY = 4;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function runSync(deps: SyncDeps, opts: { full: boolean }): Promise<SyncResult> {
  const { db, client, config } = deps;
  const now = () => (deps.now ? deps.now() : new Date()).toISOString();
  const progress = deps.onProgress ?? (() => {});
  const result: SyncResult = { added: 0, removed: 0, detailed: 0, imagesSaved: 0, errors: [] };

  // 1. Collection pass
  const before = new Set((db.prepare('SELECT id FROM releases').all() as { id: number }[]).map((r) => r.id));
  const seen: number[] = [];
  let collectionOk = true;
  progress({ phase: 'collection', done: 0, total: 0 });
  try {
    for (let page = 1, pages = 1; page <= pages; page++) {
      const res = await client.getCollectionPage(page);
      pages = res.pagination.pages;
      upsertBasic(db, res.releases, now());
      seen.push(...res.releases.map((r) => r.basic_information.id));
      progress({ phase: 'collection', done: seen.length, total: res.pagination.items });
    }
  } catch (e) {
    collectionOk = false;
    result.errors.push(`Collection: ${errMsg(e)}`);
  }
  if (collectionOk) {
    result.removed = markRemoved(db, seen, now());
    result.added = new Set(seen.filter((id) => !before.has(id))).size;
  }

  // 2. Release details
  const ids = releasesNeedingDetail(db, {
    refreshDays: config.detailRefreshDays,
    staleLimit: opts.full ? null : config.detailRefreshPerRun,
    now: now(),
  });
  progress({ phase: 'details', done: 0, total: ids.length });
  for (const [i, id] of ids.entries()) {
    try {
      applyDetail(db, await client.getRelease(id, config.currency), now());
      result.detailed++;
    } catch (e) {
      result.errors.push(`Release ${id}: ${errMsg(e)}`);
    }
    progress({ phase: 'details', done: i + 1, total: ids.length });
  }

  // 3. Image cache
  const images = imagesMissingLocal(db);
  let done = 0;
  progress({ phase: 'images', done: 0, total: images.length });
  const queue = [...images];
  await Promise.all(Array.from({ length: IMAGE_CONCURRENCY }, async () => {
    for (let img = queue.shift(); img; img = queue.shift()) {
      const rel = join('images', String(img.releaseId), `${img.idx}.jpg`);
      try {
        const buf = await client.downloadImage(img.remoteUrl);
        await mkdir(join(config.dataDir, 'images', String(img.releaseId)), { recursive: true });
        await writeFile(join(config.dataDir, rel), buf);
        setImageLocalPath(db, img.releaseId, img.idx, rel);
        result.imagesSaved++;
      } catch (e) {
        result.errors.push(`Image ${img.releaseId}/${img.idx}: ${errMsg(e)}`);
      }
      progress({ phase: 'images', done: ++done, total: images.length });
    }
  }));

  progress({ phase: 'done', done: 1, total: 1 });
  return result;
}
