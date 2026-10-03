import { expect, test } from 'vitest';
import { initialPlayerState, playerReducer, type QueueItem } from './queue';

const item = (n: number): QueueItem => ({
  releaseId: 1, trackIdx: n, title: `T${n}`, artists: 'A', releaseTitle: 'R', coverUrl: null, previewUrl: `u${n}`,
});
const items = [item(0), item(1), item(2)];
const playing = (index: number) => ({ ...playerReducer(initialPlayerState, { type: 'play', items, start: index }), status: 'playing' as const });

test('play starts loading at the chosen index', () => {
  const s = playerReducer(initialPlayerState, { type: 'play', items, start: 1 });
  expect(s).toMatchObject({ index: 1, status: 'loading' });
  expect(s.queue).toHaveLength(3);
});

test('next advances; next/ended/error on the last item closes the player', () => {
  expect(playerReducer(playing(0), { type: 'next' })).toMatchObject({ index: 1, status: 'loading' });
  for (const type of ['next', 'ended', 'error'] as const) {
    expect(playerReducer(playing(2), { type })).toEqual(initialPlayerState);
  }
});

test('prev restarts after 3 s, otherwise goes back (not below 0)', () => {
  const s = playing(1);
  expect(playerReducer(s, { type: 'prev', currentTime: 5 })).toMatchObject({ index: 1, restart: s.restart + 1 });
  expect(playerReducer(s, { type: 'prev', currentTime: 1 })).toMatchObject({ index: 0, status: 'loading' });
  expect(playerReducer(playing(0), { type: 'prev', currentTime: 1 })).toMatchObject({ index: 0 });
});

test('toggle and media events', () => {
  expect(playerReducer(playing(0), { type: 'toggle' }).status).toBe('paused');
  expect(playerReducer({ ...playing(0), status: 'paused' }, { type: 'toggle' }).status).toBe('loading');
  expect(playerReducer({ ...playing(0), status: 'loading' }, { type: 'playing' }).status).toBe('playing');
  expect(playerReducer(playing(0), { type: 'paused' }).status).toBe('paused');
  expect(playerReducer(playing(0), { type: 'stop' })).toEqual(initialPlayerState);
  expect(playerReducer(initialPlayerState, { type: 'toggle' })).toEqual(initialPlayerState);
});
