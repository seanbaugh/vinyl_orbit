import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const NOW_SPINNING_KEY = 'vinyl-orbit.nowSpinning';

export interface NowSpinningApi {
  /** The record the user marked as spinning on their turntable, or null. */
  releaseId: number | null;
  set(id: number): void;
  clear(): void;
  /** Whether the full-screen Spinning now view is showing. */
  open: boolean;
  setOpen(open: boolean): void;
}

const parseId = (raw: string | null): number | null => {
  const n = Number(raw);
  return raw !== null && Number.isInteger(n) && n > 0 ? n : null;
};

function readStored(): number | null {
  try { return parseId(localStorage.getItem(NOW_SPINNING_KEY)); } catch { return null; }
}

const NowSpinningContext = createContext<NowSpinningApi | null>(null);

/** The marked record lives in this browser only (you mirror from the device you control). */
export function NowSpinningProvider({ children }: { children: ReactNode }) {
  const [releaseId, setReleaseId] = useState<number | null>(readStored);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === NOW_SPINNING_KEY) setReleaseId(parseId(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const set = useCallback((id: number) => {
    setReleaseId(id);
    try { localStorage.setItem(NOW_SPINNING_KEY, String(id)); } catch { /* storage unavailable: keep it in memory */ }
  }, []);
  const clear = useCallback(() => {
    setReleaseId(null);
    try { localStorage.removeItem(NOW_SPINNING_KEY); } catch { /* storage unavailable */ }
  }, []);

  const api = useMemo(() => ({ releaseId, set, clear, open, setOpen }), [releaseId, set, clear, open]);
  return <NowSpinningContext.Provider value={api}>{children}</NowSpinningContext.Provider>;
}

export function useNowSpinning(): NowSpinningApi {
  const ctx = useContext(NowSpinningContext);
  if (!ctx) throw new Error('useNowSpinning outside NowSpinningProvider');
  return ctx;
}
