const KEY = 'vinyl-orbit.spinLog';

/** "Spin now" logs at most one play per record in this window. */
export const SPIN_LOG_WINDOW_MS = 600_000;

function read(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function shouldLogSpin(releaseId: number, now = Date.now()): boolean {
  const last = read()[releaseId];
  return typeof last !== 'number' || now - last >= SPIN_LOG_WINDOW_MS;
}

export function markSpinLogged(releaseId: number, now = Date.now()): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...read(), [releaseId]: now })); } catch { /* storage unavailable */ }
}
