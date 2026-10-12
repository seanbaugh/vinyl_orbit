import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { createDiscogsClient } from './discogs/client.js';
import { createHaClient } from './homeassistant/client.js';
import { loadAllOverrides } from './homeassistant/match.js';
import { createHaPoller } from './homeassistant/poller.js';
import { createItunesClient } from './previews/itunes.js';
import { createPreviewService } from './previews/service.js';
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
const previews = createPreviewService({ db, itunes: createItunesClient({ country: config.previewCountry }) });
const app = buildApp({ db, scheduler, previews, dataDir: config.dataDir, webDist, logger: true });

await app.listen({ host: '0.0.0.0', port: config.port });
app.log.info(`Vinyl Orbit syncing Discogs user "${config.username}" every ${config.syncIntervalHours}h`);
scheduler.start();

// Optional: follow the NFC tag taps that Home Assistant already handles (read-only).
const haPoller = config.haUrl && config.haToken
  ? createHaPoller({
      db,
      read: createHaClient({ url: config.haUrl, token: config.haToken }).readHelpers,
      overrides: () => loadAllOverrides(join(config.dataDir, 'ha-overrides.json')),
      now: () => new Date(),
      log: { info: (m) => app.log.info(m), warn: (m) => app.log.warn(m) },
    })
  : null;
if (haPoller) {
  haPoller.start(config.haPollSeconds * 1000);
  app.log.info(`Home Assistant now-spinning enabled (${config.haUrl}, every ${config.haPollSeconds}s)`);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    scheduler.stop();
    haPoller?.stop();
    await app.close();
    db.close();
    process.exit(0);
  });
}
