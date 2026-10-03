import { useRelease } from '../api/hooks';
import { formatFamily } from '../lib/formats';
import { useNowSpinning } from '../lib/nowSpinning';
import { usePlayer } from '../player/PlayerProvider';
import { CoverDisc } from './CoverDisc';

export interface SpinSource {
  kind: 'preview' | 'marked';
  releaseId: number;
  coverUrl: string | null;
  discKind: 'vinyl' | 'cd';
  headline: string;
  subline: string;
  spinning: boolean;
  progress?: number;
  position?: { index: number; total: number };
}

/** What the full-screen view shows: the mini-player's track if one is loaded, else the record marked as spinning. */
export function useSpinSource(): SpinSource | null {
  const player = usePlayer();
  const { releaseId } = useNowSpinning();
  const current = player.current;
  const marked = useRelease(current ? 0 : releaseId ?? 0).data;

  if (current) {
    return {
      kind: 'preview', releaseId: current.releaseId, coverUrl: current.coverUrl, discKind: current.kind ?? 'vinyl',
      headline: current.title, subline: `${current.releaseTitle} — ${current.artists}`,
      spinning: player.state.status === 'playing', progress: player.progress,
      position: { index: player.state.index, total: player.state.queue.length },
    };
  }
  if (!marked) return null;
  return {
    kind: 'marked', releaseId: marked.id, coverUrl: marked.coverUrl,
    discKind: formatFamily(marked.formatSummary) === 'cd' ? 'cd' : 'vinyl',
    headline: 'Now spinning', subline: `${marked.title} — ${marked.artists}`, spinning: true,
  };
}

/** Full-screen, TV-friendly view: big cover beside a spinning record or CD. Mirror the Mac to an Apple TV to show it. */
export function SpinningNow({ onClose }: { onClose: () => void }) {
  const src = useSpinSource();
  if (!src) return null;

  return (
    <div className="spinning-now" role="dialog" aria-label="Spinning now">
      {src.coverUrl && <div className="spinning-now-bg" style={{ backgroundImage: `url(${JSON.stringify(src.coverUrl)})` }} aria-hidden="true" />}
      <div className="spinning-now-stage">
        <CoverDisc coverUrl={src.coverUrl} alt={src.subline} spinning={src.spinning} kind={src.discKind} />
      </div>
      <div className="spinning-now-meta" key={src.headline}>
        <h1>{src.headline}</h1>
        <p>{src.subline}</p>
        {src.position && (
          <>
            <div className="spinning-now-progress" aria-hidden="true"><div style={{ width: `${(src.progress ?? 0) * 100}%` }} /></div>
            <span className="spinning-now-count">{src.position.index + 1}/{src.position.total}</span>
          </>
        )}
      </div>
    </div>
  );
}
