import type { NowSpinningState } from '@api/api-types';
import { useSyncExternalStore } from 'react';

/**
 * An in-memory stand-in for the server's now-spinning state, for component tests that mock '../api/hooks':
 *
 *   vi.mock('../api/hooks', async () => ({ useRelease: ..., ...(await import('../test/fakeNowSpinning')).fakeNowSpinningHooks }));
 *
 * Call fakeServer.reset() in beforeEach. fakeServer.push() simulates a change made on the server (a tag tap).
 */
const EMPTY: NowSpinningState = { releaseId: null, source: null, updatedAt: null, tap: 0, tapAgeMs: null };

let state: NowSpinningState = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const fakeServer = {
  /** Release ids passed to set(), in order. */
  setCalls: [] as number[],
  clearCalls: 0,
  /** What set() reports as playLogged. */
  playLogged: true,
  /** Makes set() reject, as when the server cannot be reached. */
  failSet: false,
  get state() { return state; },
  reset() {
    state = EMPTY;
    this.setCalls = [];
    this.clearCalls = 0;
    this.playLogged = true;
    this.failSet = false;
    emit();
  },
  push(next: Partial<NowSpinningState>) {
    state = { ...state, ...next };
    emit();
  },
};

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const fakeNowSpinningHooks = {
  useNowSpinningState: () => ({ data: useSyncExternalStore(subscribe, () => state) }),
  useSetNowSpinning: () => ({
    mutateAsync: async (releaseId: number) => {
      fakeServer.setCalls.push(releaseId);
      if (fakeServer.failSet) throw new Error('offline');
      state = { ...state, releaseId, source: 'manual', updatedAt: 'now' };
      emit();
      return { ...state, playLogged: fakeServer.playLogged };
    },
  }),
  useClearNowSpinning: () => ({
    mutate: () => {
      fakeServer.clearCalls++;
      state = { ...state, releaseId: null, source: null, updatedAt: null };
      emit();
    },
  }),
};
