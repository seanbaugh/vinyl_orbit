import { Ban, Check, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PreviewInfo } from '@api/api-types';
import { usePreviewCandidates, useResetPreviews, useSetPreviewAlbum } from '../api/hooks';

export function AlbumPicker({ releaseId, info, onClose }: { releaseId: number; info: PreviewInfo | undefined; onClose: () => void }) {
  const { data: candidates, isLoading, error } = usePreviewCandidates(releaseId, true);
  const setAlbum = useSetPreviewAlbum(releaseId);
  const reset = useResetPreviews(releaseId);
  const ref = useRef<HTMLDivElement>(null);
  const busy = setAlbum.isPending || reset.isPending;

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [onClose]);

  const done = { onSuccess: onClose };

  return (
    <div ref={ref} className="popover album-picker" role="dialog" aria-label="Choose the Apple Music album">
      <div className="section-title">Match previews to</div>
      {isLoading && <div className="muted" style={{ padding: 8 }}>Searching Apple Music…</div>}
      {busy && <div className="muted" style={{ padding: '0 8px 8px' }}>Matching tracks…</div>}
      {error && <div className="sync-error" style={{ padding: 8 }}>{(error as Error).message}</div>}
      {candidates?.length === 0 && <div className="muted" style={{ padding: 8 }}>Apple Music has nothing close to this record.</div>}
      <div className="album-picker-list">
        {candidates?.map((c) => {
          const selected = info?.album?.id === c.id;
          return (
            <button key={c.id} className={`palette-item${selected ? ' active' : ''}`} disabled={busy}
              onClick={() => setAlbum.mutate({ appleAlbumId: c.id }, done)}>
              {c.artworkUrl ? <img src={c.artworkUrl} alt="" className="picker-art" /> : <span className="picker-art" />}
              <span className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
                <span className="ellipsis" style={{ display: 'block' }}>{c.name}</span>
                <span className="muted ellipsis" style={{ display: 'block', fontSize: 12 }}>
                  {c.artist}{c.year ? ` · ${c.year}` : ''} · {c.trackCount} tracks
                </span>
              </span>
              {selected && <Check size={16} className="accent" />}
            </button>
          );
        })}
      </div>
      <div className="row" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setAlbum.mutate({ none: true }, done)}>
          <Ban /> No previews
        </button>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => reset.mutate(undefined, done)}>
          <RotateCcw /> Reset to automatic
        </button>
      </div>
      {(setAlbum.error || reset.error) && (
        <div className="sync-error" style={{ fontSize: 12 }}>{((setAlbum.error ?? reset.error) as Error).message}</div>
      )}
    </div>
  );
}
