// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SPIN_LOG_WINDOW_MS, markSpinLogged, shouldLogSpin } from './spinLog';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

test('true when never logged', () => {
  expect(shouldLogSpin(1, 1_000)).toBe(true);
});

test('false within 10 minutes of markSpinLogged', () => {
  markSpinLogged(1, 1_000);
  expect(shouldLogSpin(1, 1_000 + SPIN_LOG_WINDOW_MS - 1)).toBe(false);
});

test('true at exactly 10 minutes', () => {
  markSpinLogged(1, 1_000);
  expect(shouldLogSpin(1, 1_000 + SPIN_LOG_WINDOW_MS)).toBe(true);
});

test('is per release', () => {
  markSpinLogged(1, 1_000);
  expect(shouldLogSpin(2, 1_001)).toBe(true);
});

test('true and no throw when localStorage throws or holds invalid JSON', () => {
  localStorage.setItem('vinyl-orbit.spinLog', '{nope');
  expect(shouldLogSpin(1, 1)).toBe(true);
  expect(() => markSpinLogged(1, 1)).not.toThrow();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  expect(shouldLogSpin(1, 1)).toBe(true);
  expect(() => markSpinLogged(1, 1)).not.toThrow();
});
