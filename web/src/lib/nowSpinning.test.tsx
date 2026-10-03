// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NOW_SPINNING_KEY, NowSpinningProvider, useNowSpinning } from './nowSpinning';

let api!: ReturnType<typeof useNowSpinning>;
const Probe = () => { api = useNowSpinning(); return null; };
const mount = () => render(<NowSpinningProvider><Probe /></NowSpinningProvider>);

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

test('starts null and set() persists the id', () => {
  mount();
  expect(api.releaseId).toBeNull();
  act(() => api.set(42));
  expect(api.releaseId).toBe(42);
  expect(localStorage.getItem(NOW_SPINNING_KEY)).toBe('42');
});

test('reads an existing id on mount', () => {
  localStorage.setItem(NOW_SPINNING_KEY, '9');
  mount();
  expect(api.releaseId).toBe(9);
});

test('clear() removes it', () => {
  localStorage.setItem(NOW_SPINNING_KEY, '9');
  mount();
  act(() => api.clear());
  expect(api.releaseId).toBeNull();
  expect(localStorage.getItem(NOW_SPINNING_KEY)).toBeNull();
});

test('updates when another tab changes storage', () => {
  mount();
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: NOW_SPINNING_KEY, newValue: '7' })); });
  expect(api.releaseId).toBe(7);
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: NOW_SPINNING_KEY, newValue: null })); });
  expect(api.releaseId).toBeNull();
});

test('works when localStorage throws', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  mount();
  act(() => api.set(5));
  expect(api.releaseId).toBe(5);
});

test('open defaults to false and setOpen toggles it', () => {
  mount();
  expect(api.open).toBe(false);
  act(() => api.setOpen(true));
  expect(api.open).toBe(true);
});
