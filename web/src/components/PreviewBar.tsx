import { ExternalLink, Music2, Pause, Play } from 'lucide-react';
import { useState } from 'react';
import type { PreviewInfo, ReleaseDetail } from '@api/api-types';
import { usePlayer } from '../player/PlayerProvider';
import { AlbumPicker } from './AlbumPicker';

interface Props {
  r: ReleaseDetail;
  info: PreviewInfo | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onPreviewAlbum: () => void;
}

export function PreviewBar({ r, info, loading, error, onRetry, onPreviewAlbum }: Props) {
  const [picking, setPicking] = useState(false);
  const player = usePlayer();
  const count = info ? Object.keys(info.tracks).length : 0;
  const thisPlaying = player.isPlayingRelease(r.id);
  const appleSearch = `https://music.apple.com/us/search?term=${encodeURIComponent(`${r.artists} ${r.title}`)}`;
  const change = (label: string) => (
    <button className="link-btn" onClick={() => setPicking(true)}>{label}</button>
  );

  let content;
  if (loading) {
    content = <span className="muted">Finding previews on Apple Music…</span>;
  } else if (error) {
    content = <><span className="muted">Previews unavailable right now ·</span> <button className="link-btn" onClick={onRetry}>Retry</button></>;
  } else if (!info || info.status === 'unmatched') {
    content = (
      <>
        <span className="muted">No previews found ·</span> {change('Choose album')} <span className="muted">·</span>
        <a className="link-btn" href={appleSearch} target="_blank" rel="noreferrer">Search Apple Music <ExternalLink size={12} /></a>
      </>
    );
  } else if (info.status === 'none') {
    content = <><span className="muted">Previews off ·</span> {change('Change')}</>;
  } else {
    content = (
      <>
        <span className="muted">Previews from Apple Music:</span>
        {info.album?.url
          ? <a className="link ellipsis" href={info.album.url} target="_blank" rel="noreferrer" style={{ fontWeight: 500 }}>{info.album.name}</a>
          : <span className="ellipsis" style={{ fontWeight: 500 }}>{info.album?.name ?? `${count} matched tracks`}</span>}
        <span className="muted">·</span> {change('Change')}
      </>
    );
  }

  return (
    <div className="preview-bar">
      <Music2 size={15} className="accent" style={{ flexShrink: 0 }} />
      <div className="row grow wrap" style={{ gap: 6, minWidth: 0 }}>{content}</div>
      {count > 0 && info?.status !== 'none' && (
        thisPlaying
          ? <button className="btn btn-sm" onClick={player.toggle}><Pause /> Pause</button>
          : <button className="btn btn-sm btn-primary" onClick={onPreviewAlbum}><Play /> Preview album</button>
      )}
      {picking && <AlbumPicker releaseId={r.id} info={info} onClose={() => setPicking(false)} />}
    </div>
  );
}
