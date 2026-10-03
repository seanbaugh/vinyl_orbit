import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { createDiscogsClient } from './discogs/client.js';
import { createScheduler } from './sync/scheduler.js';
import { runSync } from './sync/sync.js';

const config = loadConfig();
const db = openDb(join(config.dataDir, 'library.db'));
const client = createDiscogsClient({ username: config.username, token: config.token });

const scheduler = createScheduler(
  async (full, onProgress) => {
    const result = await runSync({ db, client, config, onProgress }, { full });
    app.log.info({ ...result, errors: result.errors.length }, 'sync complete');
    for (const e of result.errors.slice(0, 20)) app.log.warn(e);
    return result;
  },
  { intervalHours: config.syncIntervalHours, db },
);

// server/dist/main.js (or server/src/main.ts in dev) → <repo>/web/dist
const webDist = resolve(fileURLToPath(import.meta.url), '../../../web/dist');
const app = buildApp({ db, scheduler, dataDir: config.dataDir, webDist, logger: true });

await app.listen({ host: '0.0.0.0', port: config.port });
app.log.info(`Vinyl Orbit syncing Discogs user "${config.username}" every ${config.syncIntervalHours}h`);
scheduler.start();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    scheduler.stop();
    await app.close();
    db.close();
    process.exit(0);
  });
}
