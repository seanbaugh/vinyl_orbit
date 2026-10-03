import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createAutosaver } from './autosave';
import { localToday } from './format';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('final: flush saves pending text immediately (tab switch / navigation)', () => {
  const saved: string[] = [];
  const drafts: (string | null)[] = [];
  const a = createAutosaver({ initial: '', delay: 800, save: (t) => { saved.push(t); return Promise.resolve(); },
    draft: (t) => drafts.push(t) });
  a.change('hello');
  expect(drafts).toEqual(['hello']); // draft written on every change, not only on failure
  a.flush();
  expect(saved).toEqual(['hello']);
  vi.advanceTimersByTime(2000);
  expect(saved).toEqual(['hello']); // no duplicate save after flush
});

test('final: debounced save and no-op flush when nothing changed', () => {
  const saved: string[] = [];
  const a = createAutosaver({ initial: 'x', delay: 800, save: (t) => { saved.push(t); return Promise.resolve(); }, draft: () => {} });
  a.flush();
  expect(saved).toEqual([]);
  a.change('xy');
  vi.advanceTimersByTime(799);
  expect(saved).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(saved).toEqual(['xy']);
});

test('final: localToday uses the local calendar date, not UTC', () => {
  vi.setSystemTime(new Date(2026, 9, 3, 23, 30)); // 11:30pm local on Oct 3
  expect(localToday()).toBe('2026-10-03');
});
