import { Pause, Play, SkipBack, SkipForward, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  const marked = useRelease(releaseId ?? 0).data;

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

const IDLE_MS = 3000;

/** Full-screen, TV-friendly view: big cover beside a spinning record or CD. Mirror the Mac to an Apple TV to show it. */
export function SpinningNow({ onClose }: { onClose: () => void }) {
  const src = useSpinSource();
  return src ? <Overlay src={src} onClose={onClose} /> : null;
}

function Overlay({ src, onClose }: { src: SpinSource; onClose: () => void }) {
  const player = usePlayer();
  const { clear } = useNowSpinning();
  const [idle, setIdle] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => rootRef.current?.focus({ preventScroll: true }), []);
  const isPreview = src.kind === 'preview';
  const playing = player.state.status === 'playing' || player.state.status === 'loading';

  // Latest values for the long-lived listeners below.
  const live = useRef({ onClose, player, isPreview });
  live.current = { onClose, player, isPreview };

  // Fullscreen + wake lock while the view is up; both are best-effort (Safari, plain HTTP, or a refusal).
  useEffect(() => {
    let entered = false;
    const onChange = () => {
      if (document.fullscreenElement) entered = true;
      else if (entered) live.current.onClose(); // the browser left fullscreen (e.g. Esc): close with it
    };
    document.addEventListener('fullscreenchange', onChange);
    try { document.documentElement.requestFullscreen?.()?.catch(() => {}); } catch { /* unsupported */ }

    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock?.request('screen').then((l) => { if (cancelled) void l.release(); else lock = l; }, () => {});

    return () => {
      cancelled = true;
      document.removeEventListener('fullscreenchange', onChange);
      void lock?.release();
      if (document.fullscreenElement) void document.exitFullscreen?.()?.catch?.(() => {});
    };
  }, []);

  // Keys, plus controls that fade after a few quiet seconds.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), IDLE_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      const { onClose: close, player: p, isPreview: preview } = live.current;
      if (e.key === 'Escape') close();
      else if (preview && e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); p.toggle(); }
      else if (preview && e.key === 'ArrowRight') p.next();
      else if (preview && e.key === 'ArrowLeft') p.prev();
      wake();
    };
    wake();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
    };
  }, []);

  return (
    <div ref={rootRef} tabIndex={-1} className={`spinning-now${idle ? ' idle' : ''}`} role="dialog" aria-label="Spinning now">
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
      <div className="spinning-now-controls">
        {isPreview ? (
          <>
            <button className="icon-btn" onClick={player.prev} aria-label="Previous"><SkipBack /></button>
            <button className="icon-btn" onClick={player.toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause /> : <Play />}</button>
            <button className="icon-btn" onClick={player.next} aria-label="Next"><SkipForward /></button>
          </>
        ) : (
          <button className="icon-btn" onClick={() => { clear(); onClose(); }} aria-label="Stop"><Square /></button>
        )}
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
      </div>
    </div>
  );
}
