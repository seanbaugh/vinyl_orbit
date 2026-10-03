// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { PlayerProvider, usePlayer } from './PlayerProvider';
import type { QueueItem } from './queue';

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  duration = 30;
  paused = true;
  playImpl: () => Promise<void> = () => Promise.resolve();
  play = vi.fn(() => { this.paused = false; return this.playImpl(); });
  pause = vi.fn(() => { this.paused = true; });
  fire(type: string) { this.dispatchEvent(new Event(type)); }
}

const item = (n: number): QueueItem => ({
  releaseId: 1, trackIdx: n, title: `T${n}`, artists: 'A', releaseTitle: 'R', coverUrl: null, previewUrl: `https://x/u${n}`,
});

function setup() {
  const audio = new FakeAudio();
  let api!: ReturnType<typeof usePlayer>;
  const Probe = () => { api = usePlayer(); return null; };
  render(<PlayerProvider createAudio={() => audio as unknown as HTMLAudioElement}><Probe /></PlayerProvider>);
  return { audio, get api() { return api; } };
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

test('ended advances to the next clip', async () => {
  const t = setup();
  await act(async () => t.api.play([item(0), item(1)], 0));
  await flush();
  expect(t.audio.src).toBe('https://x/u0');
  t.audio.fire('playing');
  await act(async () => t.audio.fire('ended'));
  await flush();
  expect(t.audio.src).toBe('https://x/u1');
  expect(t.api.current?.trackIdx).toBe(1);
});

test('a late ended from a superseded clip does not advance the new queue', async () => {
  const t = setup();
  await act(async () => t.api.play([item(0), item(1)], 0));
  await flush();
  // Simulate the old clip's 'ended' arriving after a new queue started but before src switched.
  await act(async () => t.api.play([item(5), item(6)], 0));
  await act(async () => { t.audio.src = 'https://x/u0'; t.audio.fire('ended'); });
  await flush();
  expect(t.api.current?.trackIdx).toBe(5);
});

test('blocked autoplay leaves the player paused, not loading', async () => {
  const t = setup();
  t.audio.playImpl = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'));
  await act(async () => t.api.play([item(0)], 0));
  await flush();
  expect(t.api.state.status).toBe('paused');
});

test('isPlayingRelease / isCurrent', async () => {
  const t = setup();
  await act(async () => t.api.play([item(0), item(1)], 1));
  await flush();
  await act(async () => t.audio.fire('playing'));
  expect(t.api.isPlayingRelease(1)).toBe(true);
  expect(t.api.isPlayingRelease(2)).toBe(false);
  expect(t.api.isCurrent(1, 1)).toBe(true);
  expect(t.api.isCurrent(1, 0)).toBe(false);
});
