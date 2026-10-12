import { usePlayer } from '../player/PlayerProvider';
import { useNowSpinning } from './nowSpinning';

/**
 * Puts a record on the turntable: shows it full-screen while the server marks it as spinning and logs the play
 * (once per 10 minutes). `onMessage` fires once the server has answered ("Logged a play" / already logged), so
 * callers can toast and tidy up.
 */
export function useSpinNow(releaseId: number, onMessage: (message: string) => void): () => void {
  const player = usePlayer();
  const nowSpinning = useNowSpinning();
  return () => {
    player.stop(); // a preview from another record would otherwise take over the TV
    nowSpinning.setOpen(true);
    nowSpinning.set(releaseId).then(
      ({ playLogged }) => onMessage(playLogged ? 'Logged a play' : 'Spinning (play already logged)'),
      () => onMessage('Could not reach the server'),
    );
  };
}
