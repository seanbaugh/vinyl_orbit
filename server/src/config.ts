export interface Config {
  username: string;
  token: string | null;
  port: number;
  dataDir: string;
  syncIntervalHours: number;
  detailRefreshDays: number;
  detailRefreshPerRun: number;
  currency: string;
  previewCountry: string;
  /** Home Assistant base URL and long-lived token; the NFC now-spinning feature is on only when both are set. */
  haUrl: string | null;
  haToken: string | null;
  haPollSeconds: number;
}

type Env = Record<string, string | undefined>;

function str(env: Env, key: string, fallback: string): string {
  const v = env[key]?.trim();
  return v ? v : fallback;
}

function num(env: Env, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid ${key}: "${raw}" is not a non-negative number`);
  }
  return n;
}

function atLeastOne(env: Env, key: string, fallback: number): number {
  const n = num(env, key, fallback);
  if (n < 1) throw new Error(`Invalid ${key}: "${env[key]}" must be at least 1`);
  return n;
}

export function loadConfig(env: Env = process.env): Config {
  return {
    username: str(env, 'DISCOGS_USERNAME', 'seanmikel'),
    token: env.DISCOGS_TOKEN?.trim() || null,
    port: num(env, 'PORT', 3020),
    dataDir: str(env, 'DATA_DIR', './data'),
    syncIntervalHours: num(env, 'SYNC_INTERVAL_HOURS', 6),
    detailRefreshDays: num(env, 'DETAIL_REFRESH_DAYS', 7),
    detailRefreshPerRun: num(env, 'DETAIL_REFRESH_PER_RUN', 15),
    currency: str(env, 'CURRENCY', 'USD'),
    previewCountry: str(env, 'PREVIEW_COUNTRY', 'US'),
    haUrl: env.HA_URL?.trim() || null,
    haToken: env.HA_TOKEN?.trim() || null,
    haPollSeconds: atLeastOne(env, 'HA_POLL_SECONDS', 5),
  };
}
