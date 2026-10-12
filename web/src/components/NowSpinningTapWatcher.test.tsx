// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NowSpinningProvider, useNowSpinning } from '../lib/nowSpinning';
import { PlayerProvider, usePlayer } from '../player/PlayerProvider';
import { fakeServer } from '../test/fakeNowSpinning';
import { NowSpinningTapWatcher } from './NowSpinningTapWatcher';
import { useSpinningNowShortcut } from './SpinningNowButton';

vi.mock('../api/hooks', async () => ({
  useRelease: () => ({ data: undefined }),
  ...(await import('../test/fakeNowSpinning')).fakeNowSpinningHooks,
}));

class FakeAudio extends EventTarget {
  src = ''; currentTime = 0; duration = 30; paused = true;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
}

const clip = { releaseId: 99, trackIdx: 1, title: 'T', artists: 'A', releaseTitle: 'Other', coverUrl: null, previewUrl: 'https://x/u' };

function setup() {
  const h = {} as { player: ReturnType<typeof usePlayer>; ns: ReturnType<typeof useNowSpinning> };
  const Probe = () => { h.player = usePlayer(); h.ns = useNowSpinning(); useSpinningNowShortcut(); return null; };
  render(
    <PlayerProvider createAudio={() => new FakeAudio() as unknown as HTMLAudioElement}>
      <NowSpinningProvider><Probe /><NowSpinningTapWatcher /></NowSpinningProvider>
    </PlayerProvider>,
  );
  return h;
}

const push = (next: Parameters<typeof fakeServer.push>[0]) => act(() => { fakeServer.push(next); });

afterEach(cleanup);
beforeEach(() => fakeServer.reset());

test('the first load never opens the view, even for a tap that just happened', () => {
  fakeServer.push({ releaseId: 7, source: 'tag', tap: 5, tapAgeMs: 1000 });
  const h = setup();
  expect(h.ns.open).toBe(false);
});

test('a fresh tap after the first load stops any preview and opens the view', async () => {
  fakeServer.push({ releaseId: 7, source: 'tag', tap: 5, tapAgeMs: 90_000 });
  const h = setup();
  await act(async () => h.player.play([clip], 0));
  expect(h.player.state.status).not.toBe('idle');
  push({ releaseId: 6, tap: 6, tapAgeMs: 30_000 });
  expect(h.ns.open).toBe(true);
  expect(h.player.state.status).toBe('idle');
});

test('a tap that is already stale when it is noticed (a throttled tab waking up) does not open the view', () => {
  fakeServer.push({ releaseId: 7, source: 'tag', tap: 5, tapAgeMs: 90_000 });
  const h = setup();
  push({ releaseId: 6, tap: 6, tapAgeMs: 130_000 });
  expect(h.ns.open).toBe(false);
});

test('later polls with the same tap do not reopen a view the user closed', () => {
  const h = setup();
  push({ releaseId: 6, tap: 1, tapAgeMs: 1000 });
  expect(h.ns.open).toBe(true);
  act(() => h.ns.setOpen(false));
  push({ tapAgeMs: 5000 });
  push({ tapAgeMs: 9000 });
  expect(h.ns.open).toBe(false);
});

test('when the server clears the record the view closes', () => {
  const h = setup();
  push({ releaseId: 6, tap: 1, tapAgeMs: 1000 });
  expect(h.ns.open).toBe(true);
  push({ releaseId: null, source: null });
  expect(h.ns.open).toBe(false);
});

test('when the server clears the record but a preview is loaded, the view stays open', async () => {
  const h = setup();
  push({ releaseId: 6, tap: 1, tapAgeMs: 1000 });
  await act(async () => h.player.play([clip], 0));
  act(() => h.ns.setOpen(true));
  push({ releaseId: null, source: null });
  expect(h.ns.open).toBe(true);
});
