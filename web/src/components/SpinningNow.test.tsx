// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NowSpinningProvider, useNowSpinning } from '../lib/nowSpinning';
import { PlayerProvider, usePlayer } from '../player/PlayerProvider';
import type { QueueItem } from '../player/queue';
import { SpinningNow } from './SpinningNow';

const useReleaseMock = vi.hoisted(() => vi.fn());
vi.mock('../api/hooks', () => ({ useRelease: useReleaseMock }));

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  duration = 30;
  paused = true;
  play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  pause = vi.fn(() => { this.paused = true; });
  fire(type: string) { this.dispatchEvent(new Event(type)); }
}

const item = (n: number, over: Partial<QueueItem> = {}): QueueItem => ({
  releaseId: 1, trackIdx: n, title: `Track ${n}`, artists: 'The Artist', releaseTitle: 'The Album',
  coverUrl: '/c.jpg', previewUrl: `https://x/u${n}`, kind: 'vinyl', ...over,
});

const marked = (over: Record<string, unknown> = {}) => ({
  data: { id: 5, title: 'Marked LP', artists: 'Marked Artist', coverUrl: '/m.jpg', formatSummary: 'LP', ...over },
});

function setup(onClose = vi.fn()) {
  const audio = new FakeAudio();
  const h = {} as { player: ReturnType<typeof usePlayer>; ns: ReturnType<typeof useNowSpinning> };
  const Probe = () => { h.player = usePlayer(); h.ns = useNowSpinning(); return null; };
  const view = render(
    <PlayerProvider createAudio={() => audio as unknown as HTMLAudioElement}>
      <NowSpinningProvider><Probe /><SpinningNow onClose={onClose} /></NowSpinningProvider>
    </PlayerProvider>,
  );
  return { audio, h, view, onClose };
}

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  useReleaseMock.mockReset();
  useReleaseMock.mockReturnValue({ data: undefined });
});

test('preview source shows track, album and artist', async () => {
  const { h, view } = setup();
  await act(async () => h.player.play([item(1), item(2)], 0));
  expect(view.getByRole('heading', { name: 'Track 1' })).toBeTruthy();
  expect(view.getByText('The Album — The Artist')).toBeTruthy();
  expect(view.getByText('1/2')).toBeTruthy();
});

test('CD item renders the silver disc, LP item the black record', async () => {
  const { h, view } = setup();
  await act(async () => h.player.play([item(1, { kind: 'cd' })], 0));
  expect(view.container.querySelector('.cover-disc.cd')).toBeTruthy();
  await act(async () => h.player.play([item(1, { kind: 'vinyl' })], 0));
  expect(view.container.querySelector('.cover-disc')).toBeTruthy();
  expect(view.container.querySelector('.cover-disc.cd')).toBeNull();
});

test('disc has the spinning class only while status is playing', async () => {
  const { h, audio, view } = setup();
  await act(async () => h.player.play([item(1)], 0));
  expect(view.container.querySelector('.cover-disc.spinning')).toBeNull(); // loading
  await act(async () => audio.fire('playing'));
  expect(view.container.querySelector('.cover-disc.spinning')).toBeTruthy();
  await act(async () => h.player.toggle());
  expect(view.container.querySelector('.cover-disc.spinning')).toBeNull(); // paused
});

test('marked record spins continuously and reads Now spinning', () => {
  useReleaseMock.mockReturnValue(marked());
  const { h, view } = setup();
  act(() => h.ns.set(5));
  expect(view.getByRole('heading', { name: 'Now spinning' })).toBeTruthy();
  expect(view.getByText('Marked LP — Marked Artist')).toBeTruthy();
  expect(view.container.querySelector('.cover-disc.spinning')).toBeTruthy();
});

test('marked CD renders the silver disc', () => {
  useReleaseMock.mockReturnValue(marked({ formatSummary: '2×CD' }));
  const { h, view } = setup();
  act(() => h.ns.set(5));
  expect(view.container.querySelector('.cover-disc.cd')).toBeTruthy();
});

test('preview source wins over the marked record', async () => {
  useReleaseMock.mockReturnValue(marked());
  const { h, view } = setup();
  act(() => h.ns.set(5));
  await act(async () => h.player.play([item(1)], 0));
  expect(view.getByRole('heading', { name: 'Track 1' })).toBeTruthy();
  expect(view.queryByText('Marked LP — Marked Artist')).toBeNull();
});

test('renders nothing with no source', () => {
  const { view } = setup();
  expect(view.container.querySelector('.spinning-now')).toBeNull();
});

test('renders nothing, without crashing, when the marked release fails to load', () => {
  useReleaseMock.mockReturnValue({ data: undefined, error: new Error('404') });
  const { h, view } = setup();
  act(() => h.ns.set(5));
  expect(view.container.querySelector('.spinning-now')).toBeNull();
});

test('null cover renders the placeholder', async () => {
  const { h, view } = setup();
  await act(async () => h.player.play([item(1, { coverUrl: null })], 0));
  expect(view.container.querySelector('.spinning-now .placeholder')).toBeTruthy();
});

// ---------------------------------------------------------------- behaviours

const setFullscreenElement = (el: Element | null) =>
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => el });

function stubBrowser(over: { requestFullscreen?: () => Promise<void>; wakeLock?: unknown } = {}) {
  const release = vi.fn(() => Promise.resolve());
  const request = vi.fn(() => Promise.resolve({ release }));
  const requestFullscreen = vi.fn(over.requestFullscreen ?? (() => Promise.resolve()));
  const exitFullscreen = vi.fn(() => Promise.resolve());
  document.documentElement.requestFullscreen = requestFullscreen;
  document.exitFullscreen = exitFullscreen;
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: 'wakeLock' in over ? over.wakeLock : { request } });
  setFullscreenElement(null);
  return { release, request, requestFullscreen, exitFullscreen };
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

test('requests fullscreen and a wake lock on open', async () => {
  const b = stubBrowser();
  const { h } = setup();
  await act(async () => h.player.play([item(1)], 0));
  await flush();
  expect(b.requestFullscreen).toHaveBeenCalledTimes(1);
  expect(b.request).toHaveBeenCalledWith('screen');
});

test('does not request fullscreen while there is nothing to show', async () => {
  const b = stubBrowser();
  setup();
  await flush();
  expect(b.requestFullscreen).not.toHaveBeenCalled();
});

test('still renders when requestFullscreen rejects and wakeLock is undefined', async () => {
  stubBrowser({ requestFullscreen: () => Promise.reject(new Error('denied')), wakeLock: undefined });
  const { h, view } = setup();
  await act(async () => h.player.play([item(1)], 0));
  await flush();
  expect(view.getByRole('heading', { name: 'Track 1' })).toBeTruthy();
});

test('releases the wake lock and exits fullscreen on unmount', async () => {
  const b = stubBrowser();
  const { h, view } = setup();
  await act(async () => h.player.play([item(1)], 0));
  await flush();
  setFullscreenElement(document.documentElement);
  view.unmount();
  await flush();
  expect(b.release).toHaveBeenCalled();
  expect(b.exitFullscreen).toHaveBeenCalled();
});

test('closes when the browser leaves fullscreen', async () => {
  stubBrowser();
  const { h, onClose } = setup();
  await act(async () => h.player.play([item(1)], 0));
  setFullscreenElement(document.documentElement);
  act(() => { document.dispatchEvent(new Event('fullscreenchange')); });
  expect(onClose).not.toHaveBeenCalled();
  setFullscreenElement(null);
  act(() => { document.dispatchEvent(new Event('fullscreenchange')); });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('Escape and the Close button call onClose', async () => {
  stubBrowser();
  const { h, view, onClose } = setup();
  await act(async () => h.player.play([item(1)], 0));
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => { view.getByRole('button', { name: 'Close' }).click(); });
  expect(onClose).toHaveBeenCalledTimes(2);
});

test('Space toggles and arrows move between tracks for a preview', async () => {
  stubBrowser();
  const { h, audio } = setup();
  await act(async () => h.player.play([item(1), item(2)], 0));
  await act(async () => audio.fire('playing'));
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); });
  expect(h.player.state.status).toBe('paused');
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); });
  expect(h.player.state.index).toBe(1);
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); });
  expect(h.player.state.index).toBe(0);
});

test('Stop clears the marked record and closes', () => {
  stubBrowser();
  useReleaseMock.mockReturnValue(marked());
  const { h, view, onClose } = setup();
  act(() => h.ns.set(5));
  expect(view.queryByRole('button', { name: 'Next' })).toBeNull();
  act(() => { view.getByRole('button', { name: 'Stop' }).click(); });
  expect(h.ns.releaseId).toBeNull();
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('controls go idle after 3s and return on pointermove', async () => {
  stubBrowser();
  vi.useFakeTimers();
  try {
    const { h, view } = setup();
    await act(async () => h.player.play([item(1)], 0));
    const root = () => view.container.querySelector('.spinning-now')!;
    expect(root().classList.contains('idle')).toBe(false);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(root().classList.contains('idle')).toBe(true);
    act(() => { window.dispatchEvent(new Event('pointermove')); });
    expect(root().classList.contains('idle')).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('Space toggles even when the button that opened the overlay still has focus', async () => {
  stubBrowser();
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();
  const { h, audio } = setup();
  await act(async () => h.player.play([item(1)], 0));
  await act(async () => audio.fire('playing'));
  act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); });
  expect(h.player.state.status).toBe('paused');
  opener.remove();
});

test('keeps the marked record loaded while a preview plays, so the fallback is ready when it ends', async () => {
  useReleaseMock.mockReturnValue(marked());
  const { h } = setup();
  act(() => h.ns.set(5));
  await act(async () => h.player.play([item(1)], 0));
  expect(useReleaseMock).toHaveBeenLastCalledWith(5);
});
