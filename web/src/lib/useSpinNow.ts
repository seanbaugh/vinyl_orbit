import { useAddPlay } from '../api/hooks';
import { usePlayer } from '../player/PlayerProvider';
import { useNowSpinning } from './nowSpinning';
import { markSpinLogged, shouldLogSpin } from './spinLog';

/**
 * Puts a record on the turntable: shows it full-screen and logs the play once per 10 minutes.
 * `onMessage` fires once the outcome is known ("Logged a play" / already logged), so callers can toast and tidy up.
 */
export function useSpinNow(releaseId: number, onMessage: (message: string) => void): () => void {
  const player = usePlayer();
  const nowSpinning = useNowSpinning();
  const addPlay = useAddPlay(releaseId);
  return () => {
    player.stop(); // a preview from another record would otherwise take over the TV
    nowSpinning.set(releaseId);
    if (shouldLogSpin(releaseId)) {
      addPlay.mutate({}, { onSuccess: () => { markSpinLogged(releaseId); onMessage('Logged a play'); } });
    } else {
      onMessage('Spinning (play already logged)');
    }
    nowSpinning.setOpen(true);
  };
}
