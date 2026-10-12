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
    previewCountry: 'US',
    haUrl: null,
    haToken: null,
    haPollSeconds: 5,
  });
});

test('Home Assistant settings', () => {
  const c = loadConfig({ HA_URL: ' http://192.168.1.214:8123 ', HA_TOKEN: ' tok ', HA_POLL_SECONDS: '10' });
  expect(c).toMatchObject({ haUrl: 'http://192.168.1.214:8123', haToken: 'tok', haPollSeconds: 10 });
});

test('empty Home Assistant settings are null, and the poll interval must be at least one second', () => {
  expect(loadConfig({ HA_URL: '', HA_TOKEN: '' })).toMatchObject({ haUrl: null, haToken: null });
  expect(() => loadConfig({ HA_POLL_SECONDS: '0' })).toThrow(/HA_POLL_SECONDS/);
  expect(() => loadConfig({ HA_POLL_SECONDS: 'x' })).toThrow(/HA_POLL_SECONDS/);
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

test('preview country override', () => {
  expect(loadConfig({ PREVIEW_COUNTRY: 'GB' }).previewCountry).toBe('GB');
});
