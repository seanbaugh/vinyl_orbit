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
