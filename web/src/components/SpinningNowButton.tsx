import { Disc3 } from 'lucide-react';
import { useEffect } from 'react';
import { useRelease } from '../api/hooks';
import { useNowSpinning } from '../lib/nowSpinning';
import { usePlayer } from '../player/PlayerProvider';

/** Something to show full-screen: a loaded preview or a record marked as spinning. */
function useHasSpinSource(): boolean {
  const player = usePlayer();
  const { releaseId } = useNowSpinning();
  return !!player.current || releaseId !== null;
}

/** Opens the full-screen Spinning now view; only offered while there is something to show. */
export function SpinningNowButton() {
  const { setOpen } = useNowSpinning();
  if (!useHasSpinSource()) return null;
  return (
    <button className="icon-btn" onClick={() => setOpen(true)} title="Spinning now (⌘⇧S)" aria-label="Spinning now">
      <Disc3 />
    </button>
  );
}

/** ⌘⇧S toggles the view (when there is something to show); it also closes itself once nothing is left to show. */
export function useSpinningNowShortcut(): void {
  const { open, setOpen, releaseId, clear } = useNowSpinning();
  const has = useHasSpinSource();

  // A marked record that can't be loaded (e.g. the library was reset) would leave an unclearable button.
  const markedError = useRelease(releaseId ?? 0).error;
  useEffect(() => { if (markedError && releaseId !== null) clear(); }, [markedError, releaseId, clear]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (has || open) setOpen(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [has, open, setOpen]);

  useEffect(() => {
    if (open && !has) setOpen(false);
  }, [open, has, setOpen]);
}
