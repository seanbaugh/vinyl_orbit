import { expect, test } from 'vitest';
import { loadConfig } from '../src/config.js';

test('defaults', () => {
  expect(loadConfig({})).toEqual({
    username: 'seanmikel',
    token: null,
    port: 3020,
    dataDir: './data',
    syncIntervalHours: 6,
    detailRefreshDays: 7,
    detailRefreshPerRun: 15,
    currency: 'USD',
  });
});

test('overrides', () => {
  const c = loadConfig({
    DISCOGS_USERNAME: 'x',
    DISCOGS_TOKEN: 'tok',
    PORT: '4000',
    DATA_DIR: '/data',
    SYNC_INTERVAL_HOURS: '0',
  });
  expect(c).toMatchObject({ username: 'x', token: 'tok', port: 4000, dataDir: '/data', syncIntervalHours: 0 });
});

test('empty token is null; non-numeric number throws', () => {
  expect(loadConfig({ DISCOGS_TOKEN: '' }).token).toBeNull();
  expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
});
