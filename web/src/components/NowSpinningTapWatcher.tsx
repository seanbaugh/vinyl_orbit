import { useEffect, useRef } from 'react';
import { useNowSpinning } from '../lib/nowSpinning';
import { usePlayer } from '../player/PlayerProvider';

/** A tap older than this when we notice it (a throttled background tab waking up) is not worth opening the view for. */
export const FRESH_TAP_MS = 120_000;

/**
 * Opens the full-screen Spinning now view when someone taps an NFC tag. The first load only sets the baseline,
 * so reloading the page never pops the view open for something that was already spinning.
 */
export function NowSpinningTapWatcher(): null {
  const { tap, tapAgeMs, setOpen } = useNowSpinning();
  const player = usePlayer();
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (tap === null) return;
    const previous = seen.current;
    seen.current = tap;
    if (previous !== null && tap > previous && tapAgeMs !== null && tapAgeMs < FRESH_TAP_MS) {
      player.stop(); // a preview from another record would otherwise take over the TV
      setOpen(true);
    }
  }, [tap, tapAgeMs, setOpen, player]);

  return null;
}
