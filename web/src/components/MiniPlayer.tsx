import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePlayer } from '../player/PlayerProvider';
import { fmtSeconds } from '../lib/format';
import { CoverImage } from './CoverImage';

export function MiniPlayer() {
  const p = usePlayer();
  const c = p.current;
  if (!c) return null;
  const playing = p.state.status === 'playing' || p.state.status === 'loading';

  return (
    <div className="mini-player" role="region" aria-label="Preview player">
      <Link to={`/release/${c.releaseId}`} className="mini-cover" title={c.releaseTitle}>
        <CoverImage src={c.coverUrl} alt={c.releaseTitle} />
      </Link>
      <div className="mini-meta">
        <div className="mini-title ellipsis">{c.title}</div>
        <div className="mini-sub ellipsis">
          {c.artists} · <span className="faint">Apple Music preview · {p.state.index + 1}/{p.state.queue.length}</span>
        </div>
        <div className="mini-progress" role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(p.progress * 100)} tabIndex={0}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            p.seek((e.clientX - r.left) / r.width);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') p.seek(p.progress + 0.1);
            if (e.key === 'ArrowLeft') p.seek(p.progress - 0.1);
          }}>
          <div style={{ width: `${p.progress * 100}%` }} />
        </div>
      </div>
      <span className="mini-time faint">{p.duration ? fmtSeconds(p.progress * p.duration) : '0:00'}</span>
      <div className="mini-controls">
        <button className="icon-btn" onClick={p.prev} aria-label="Previous"><SkipBack /></button>
        <button className="icon-btn mini-play" onClick={p.toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause /> : <Play />}
        </button>
        <button className="icon-btn" onClick={p.next} aria-label="Next"><SkipForward /></button>
        <button className="icon-btn" onClick={p.stop} aria-label="Close player"><X /></button>
      </div>
    </div>
  );
}
