import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useClearNowSpinning, useNowSpinningState, useSetNowSpinning } from '../api/hooks';

export interface NowSpinningApi {
  /** The record on the turntable (from the server: a tag tap or Spin now), or null. */
  releaseId: number | null;
  /** Counts tag taps on the server; null until the first load. A change means a fresh tap. */
  tap: number | null;
  /** How long ago the last tap was, by the server's clock; null until loaded or if there has been none. */
  tapAgeMs: number | null;
  /** Marks the record as spinning on the server, which logs the play. playLogged is false for a repeat within 10 minutes. */
  set(id: number): Promise<{ playLogged: boolean }>;
  clear(): void;
  /** Whether the full-screen Spinning now view is showing. */
  open: boolean;
  setOpen(open: boolean): void;
}

const NowSpinningContext = createContext<NowSpinningApi | null>(null);

/** The marked record lives on the server, so every screen showing Vinyl Orbit follows it. */
export function NowSpinningProvider({ children }: { children: ReactNode }) {
  const state = useNowSpinningState().data;
  const setMutation = useSetNowSpinning();
  const clearMutation = useClearNowSpinning();
  const [open, setOpen] = useState(false);

  const { mutateAsync } = setMutation;
  const { mutate: clearMutate } = clearMutation;
  const set = useCallback(async (id: number) => {
    const { playLogged } = await mutateAsync(id);
    return { playLogged };
  }, [mutateAsync]);
  const clear = useCallback(() => clearMutate(), [clearMutate]);

  const releaseId = state?.releaseId ?? null;
  const tap = state?.tap ?? null;
  const tapAgeMs = state?.tapAgeMs ?? null;
  const api = useMemo(
    () => ({ releaseId, tap, tapAgeMs, set, clear, open, setOpen }),
    [releaseId, tap, tapAgeMs, set, clear, open],
  );
  return <NowSpinningContext.Provider value={api}>{children}</NowSpinningContext.Provider>;
}

export function useNowSpinning(): NowSpinningApi {
  const ctx = useContext(NowSpinningContext);
  if (!ctx) throw new Error('useNowSpinning outside NowSpinningProvider');
  return ctx;
}
