// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NowSpinningProvider, useNowSpinning } from '../lib/nowSpinning';
import { PlayerProvider } from '../player/PlayerProvider';

const hooks = vi.hoisted(() => ({
  pick: vi.fn(),
  addPlay: vi.fn(),
}));
vi.mock('../api/hooks', () => ({
  useSpinOptions: () => ({
    data: {
      genres: [
        { value: 'Rock', count: 3, styles: [{ value: 'Prog Rock', count: 2 }] },
        { value: 'Jazz', count: 2, styles: [{ value: 'Cool Jazz', count: 2 }] },
      ],
      formats: ['LP', 'CD'],
    },
  }),
  useSpinPick: () => ({
    isPending: false, error: null,
    mutate: (params: unknown, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess(hooks.pick(params)),
  }),
  useAddPlay: () => ({ mutate: (body: unknown, opts?: { onSuccess?: () => void }) => { hooks.addPlay(body); opts?.onSuccess?.(); } }),
}));
import { SpinPicker } from './SpinPicker';

class FakeAudio extends EventTarget {
  src = ''; currentTime = 0; duration = 30; paused = true;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
}

const release = (id: number, over = {}) => ({
  id, title: `Album ${id}`, artists: 'Some Band', year: 1977, formatSummary: 'LP', genres: ['Rock'], styles: ['Prog Rock'],
  labels: [], coverUrl: null, dateAdded: '2020-01-01', lowestPrice: null, playCount: 0, lastPlayedAt: null, tags: [],
  copies: 1, removed: false, ...over,
});

function setup() {
  const h = {} as { ns: ReturnType<typeof useNowSpinning> };
  const Probe = () => { h.ns = useNowSpinning(); return null; };
  render(
    <PlayerProvider createAudio={() => new FakeAudio() as unknown as HTMLAudioElement}>
      <NowSpinningProvider><Probe /><SpinPicker /></NowSpinningProvider>
    </PlayerProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pick a spin' }));
  return h;
}

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  hooks.pick.mockReset();
  hooks.addPlay.mockReset();
});

test('offers genre, mood (styles of the chosen genre) and a 7 day default window', () => {
  setup();
  expect((screen.getByLabelText('Skip records played in the last') as HTMLSelectElement).value).toBe('7');
  fireEvent.click(screen.getByRole('button', { name: 'Jazz' }));
  expect(screen.getByRole('button', { name: 'Cool Jazz' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Prog Rock' })).toBeNull();
});

test('sends the chosen filters, shows the suggestion and spins it', () => {
  hooks.pick.mockReturnValue(release(5, { lastPlayedAt: new Date(Date.now() - 40 * 86_400_000).toISOString() }));
  const h = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Rock' }));
  fireEvent.click(screen.getByRole('button', { name: 'Prog Rock' }));
  fireEvent.click(screen.getByRole('button', { name: 'LP' }));
  fireEvent.change(screen.getByLabelText('Skip records played in the last'), { target: { value: '30' } });
  fireEvent.click(screen.getByRole('button', { name: /Pick one/ }));
  expect(hooks.pick).toHaveBeenCalledWith({ genre: 'Rock', style: 'Prog Rock', format: 'LP', days: 30, neverPlayed: false, exclude: [] });
  expect(screen.getByText('Album 5')).toBeTruthy();
  expect(screen.getByText(/Last played 1 month ago/)).toBeTruthy();

  act(() => { fireEvent.click(screen.getByRole('button', { name: /Spin now/ })); });
  expect(h.ns.releaseId).toBe(5);
  expect(h.ns.open).toBe(true);
  expect(hooks.addPlay).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status').textContent).toBe('Logged a play');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('Pick another excludes what was already shown, and says so when the pool runs out', () => {
  hooks.pick.mockReturnValueOnce(release(1)).mockReturnValueOnce(release(2)).mockReturnValueOnce(null);
  setup();
  fireEvent.click(screen.getByRole('button', { name: /Pick one/ }));
  fireEvent.click(screen.getByRole('button', { name: /Pick another/ }));
  expect(hooks.pick).toHaveBeenLastCalledWith(expect.objectContaining({ exclude: [1] }));
  expect(screen.getByText('Album 2')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Pick another/ }));
  expect(hooks.pick).toHaveBeenLastCalledWith(expect.objectContaining({ exclude: [1, 2] }));
  expect(screen.getByRole('status').textContent).toMatch(/every record that fits/);
});

test('explains when nothing fits, and Escape closes the popup', () => {
  hooks.pick.mockReturnValue(null);
  setup();
  fireEvent.click(screen.getByRole('button', { name: /Pick one/ }));
  expect(screen.getByRole('status').textContent).toMatch(/Nothing fits/);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
