// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NowSpinningProvider, useNowSpinning } from '../lib/nowSpinning';
import { PlayerProvider, usePlayer } from '../player/PlayerProvider';
const useReleaseMock = vi.hoisted(() => vi.fn());
vi.mock('../api/hooks', () => ({ useRelease: useReleaseMock }));
import { SpinningNowButton, useSpinningNowShortcut } from './SpinningNowButton';

class FakeAudio extends EventTarget {
  src = ''; currentTime = 0; duration = 30; paused = true;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
}

const clip = { releaseId: 1, trackIdx: 1, title: 'T', artists: 'A', releaseTitle: 'R', coverUrl: null, previewUrl: 'https://x/u' };

function setup() {
  const h = {} as { player: ReturnType<typeof usePlayer>; ns: ReturnType<typeof useNowSpinning> };
  const Probe = () => { h.player = usePlayer(); h.ns = useNowSpinning(); useSpinningNowShortcut(); return null; };
  const view = render(
    <PlayerProvider createAudio={() => new FakeAudio() as unknown as HTMLAudioElement}>
      <NowSpinningProvider><Probe /><SpinningNowButton /></NowSpinningProvider>
    </PlayerProvider>,
  );
  return { h, view };
}

const chord = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, shiftKey: true })); });

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  useReleaseMock.mockReset();
  useReleaseMock.mockReturnValue({ data: undefined });
});

test('hidden with no source', () => {
  expect(setup().view.queryByRole('button', { name: /Spinning now/ })).toBeNull();
});

test('visible when a preview is loaded', async () => {
  const { h, view } = setup();
  await act(async () => h.player.play([clip], 0));
  expect(view.getByRole('button', { name: /Spinning now/ })).toBeTruthy();
});

test('visible when a record is marked, and click opens the overlay', () => {
  const { h, view } = setup();
  act(() => h.ns.set(3));
  act(() => { view.getByRole('button', { name: /Spinning now/ }).click(); });
  expect(h.ns.open).toBe(true);
});

test('⌘⇧S toggles the overlay only when a source exists', () => {
  const { h } = setup();
  chord();
  expect(h.ns.open).toBe(false);
  act(() => h.ns.set(3));
  chord();
  expect(h.ns.open).toBe(true);
  chord();
  expect(h.ns.open).toBe(false);
});

test('the overlay closes when the last source goes away', async () => {
  const { h } = setup();
  await act(async () => h.player.play([clip], 0));
  act(() => h.ns.setOpen(true));
  expect(h.ns.open).toBe(true);
  await act(async () => h.player.stop());
  expect(h.ns.open).toBe(false);
});

test('a marked record that cannot be loaded is cleared so the button does not get stuck', () => {
  useReleaseMock.mockReturnValue({ data: undefined, error: new Error('404') });
  const { h, view } = setup();
  act(() => h.ns.set(3));
  expect(h.ns.releaseId).toBeNull();
  expect(view.queryByRole('button', { name: /Spinning now/ })).toBeNull();
});
