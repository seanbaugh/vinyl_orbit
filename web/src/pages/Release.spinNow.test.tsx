// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NowSpinningProvider, useNowSpinning } from '../lib/nowSpinning';
import { PlayerProvider, usePlayer } from '../player/PlayerProvider';
import { Release } from './Release';

const mutate = vi.hoisted(() => vi.fn());
vi.mock('../components/TagEditor', () => ({ TagEditor: () => null }));
vi.mock('../components/CrateMenu', () => ({ CrateMenu: () => null }));
vi.mock('../api/hooks', () => ({
  useRelease: () => ({
    data: {
      id: 1, title: 'Rel', artists: 'Art', coverUrl: null, formatSummary: 'LP', year: null, country: null, copies: 1,
      removed: false, labels: [], genres: [], styles: [], tags: [], crates: [], images: [], sides: [], plays: [],
      lowestPrice: null, numForSale: null, communityRating: null, communityVotes: null, have: null, want: null,
      playCount: 0, lastPlayedAt: null, detailSyncedAt: null, discogsUrl: '#',
    },
  }),
  useAddPlay: () => ({ mutate }),
  usePreviews: () => ({ data: undefined }),
  useDeletePlay: () => ({ mutate: vi.fn() }),
  useSaveNote: () => ({ mutate: vi.fn() }),
}));

class FakeAudio extends EventTarget {
  src = ''; currentTime = 0; duration = 30; paused = true;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
}

function setup() {
  const h = {} as { player: ReturnType<typeof usePlayer>; ns: ReturnType<typeof useNowSpinning> };
  const Probe = () => { h.player = usePlayer(); h.ns = useNowSpinning(); return null; };
  const view = render(
    <PlayerProvider createAudio={() => new FakeAudio() as unknown as HTMLAudioElement}>
      <NowSpinningProvider>
        <Probe />
        <MemoryRouter initialEntries={['/release/1']}><Routes><Route path="/release/:id" element={<Release />} /></Routes></MemoryRouter>
      </NowSpinningProvider>
    </PlayerProvider>,
  );
  return { h, view };
}

const spin = (view: ReturnType<typeof setup>['view']) => act(() => { view.getByRole('button', { name: /Spin now/ }).click(); });

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  mutate.mockReset();
  mutate.mockImplementation((_body: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
});

test('Spin now marks the record, logs one play and opens the overlay', () => {
  const { h, view } = setup();
  spin(view);
  expect(h.ns.releaseId).toBe(1);
  expect(h.ns.open).toBe(true);
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(view.getByRole('status').textContent).toBe('Logged a play');
});

test('a second click within 10 minutes does not log another play', () => {
  const { view } = setup();
  spin(view);
  spin(view);
  expect(mutate).toHaveBeenCalledTimes(1);
});

test('stops a preview from another record', async () => {
  const { h, view } = setup();
  await act(async () => h.player.play([{ releaseId: 99, trackIdx: 1, title: 'T', artists: 'A', releaseTitle: 'Other', coverUrl: null, previewUrl: 'https://x/u' }], 0));
  expect(h.player.state.status).not.toBe('idle');
  spin(view);
  expect(h.player.state.status).toBe('idle');
});
