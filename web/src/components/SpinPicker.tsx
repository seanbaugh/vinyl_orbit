import { Dices, Disc3, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReleaseListItem } from '@api/api-types';
import { useSpinOptions, useSpinPick } from '../api/hooks';
import { fmtRelative } from '../lib/format';
import {
  DEFAULT_WINDOW, formatChoices, moodChoices, toPickParams, WINDOW_LABELS, type SpinFilters, type SpinWindow,
} from '../lib/spinPick';
import { useSpinNow } from '../lib/useSpinNow';
import { CoverImage } from './CoverImage';

/** Top-bar button that suggests a random record you haven't played in a while. */
export function SpinPicker() {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)} title="Pick a spin" aria-label="Pick a spin"><Dices /></button>
      {open && <SpinPickerDialog onClose={() => setOpen(false)} onToast={setToast} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

const Chip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button type="button" className={`chip${active ? ' chip-accent' : ''}`} aria-pressed={active} onClick={onClick}>{label}</button>
);

function SpinPickerDialog({ onClose, onToast }: { onClose: () => void; onToast: (message: string) => void }) {
  const { data: options, isLoading, error } = useSpinOptions();
  const picker = useSpinPick();
  const [filters, setFilters] = useState<SpinFilters>({ window: DEFAULT_WINDOW });
  const [shown, setShown] = useState<number[]>([]);
  const [pick, setPick] = useState<ReleaseListItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const set = (patch: Partial<SpinFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const draw = (exclude: number[]) =>
    picker.mutate(toPickParams(filters, exclude), {
      onSuccess: (release) => {
        if (release) {
          setPick(release);
          setShown([...exclude, release.id]);
          setMessage(null);
        } else {
          setPick(null);
          setShown([]);
          setMessage(exclude.length
            ? "That's every record that fits. Loosen the filters to see more."
            : "Nothing fits those filters. Try a shorter “skip” window, or fewer filters.");
        }
      },
    });

  const moods = options ? moodChoices(options, filters.genre) : [];
  const formats = options ? formatChoices(options) : [];

  return (
    <div className="palette-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card spin-picker" role="dialog" aria-label="Pick a spin">
        <div className="row">
          <h2 className="grow" style={{ margin: 0, fontSize: 18 }}>Pick a spin</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
        </div>

        {pick ? (
          <PickResult key={pick.id} release={pick} busy={picker.isPending}
            onAnother={() => draw(shown)} onChange={() => setPick(null)}
            onSpun={(m) => { onToast(m); onClose(); }} />
        ) : (
          <>
            {isLoading && <div className="muted">Loading your collection…</div>}
            {error && <div className="sync-error">{(error as Error).message}</div>}
            {options && (
              <>
                <div>
                  <div className="section-title">Genre</div>
                  <div className="row wrap">
                    <Chip label="Any" active={!filters.genre} onClick={() => set({ genre: undefined, style: undefined })} />
                    {options.genres.map((g) => (
                      <Chip key={g.value} label={g.value} active={filters.genre === g.value}
                        onClick={() => set({ genre: g.value, style: undefined })} />
                    ))}
                  </div>
                </div>
                {moods.length > 0 && (
                  <div>
                    <div className="section-title">Mood <span className="muted">(by Discogs style)</span></div>
                    <div className="row wrap">
                      <Chip label="Any" active={!filters.style} onClick={() => set({ style: undefined })} />
                      {moods.map((s) => (
                        <Chip key={s.value} label={s.value} active={filters.style === s.value} onClick={() => set({ style: s.value })} />
                      ))}
                    </div>
                  </div>
                )}
                {formats.length > 1 && (
                  <div>
                    <div className="section-title">Format</div>
                    <div className="row wrap">
                      <Chip label="Any" active={!filters.format} onClick={() => set({ format: undefined })} />
                      {formats.map((f) => <Chip key={f} label={f} active={filters.format === f} onClick={() => set({ format: f })} />)}
                    </div>
                  </div>
                )}
                <label className="row">
                  <span className="section-title" style={{ margin: 0 }}>Skip records played in the last</span>
                  <select className="select" value={filters.window} aria-label="Skip records played in the last"
                    onChange={(e) => set({ window: e.target.value as SpinWindow })}>
                    {(Object.keys(WINDOW_LABELS) as SpinWindow[]).map((w) => <option key={w} value={w}>{WINDOW_LABELS[w]}</option>)}
                  </select>
                </label>
                {(message || picker.error) && (
                  <div className={picker.error ? 'sync-error' : 'muted'} role="status">{message ?? (picker.error as Error).message}</div>
                )}
                <div className="actions" style={{ margin: 0 }}>
                  <button className="btn btn-primary" disabled={picker.isPending} onClick={() => draw([])}>
                    <Dices /> {picker.isPending ? 'Picking…' : 'Pick one'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PickResult({ release, busy, onAnother, onChange, onSpun }: {
  release: ReleaseListItem; busy: boolean; onAnother: () => void; onChange: () => void; onSpun: (message: string) => void;
}) {
  const spinNow = useSpinNow(release.id, onSpun);
  const tags = [...release.genres, ...release.styles];
  return (
    <div className="spin-pick-result">
      <CoverImage src={release.coverUrl} alt={release.title} />
      <div style={{ minWidth: 0 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          {release.lastPlayedAt ? `Last played ${fmtRelative(release.lastPlayedAt)}` : 'Never played'}
        </div>
        <h3 style={{ margin: '2px 0' }}>{release.title}</h3>
        <div>{release.artists}{release.year ? ` · ${release.year}` : ''}</div>
        <div className="row wrap" style={{ margin: '8px 0' }}>
          {tags.slice(0, 6).map((t) => <span key={t} className="chip">{t}</span>)}
        </div>
        <div className="actions" style={{ margin: 0 }}>
          <button className="btn btn-primary" onClick={spinNow}><Disc3 /> Spin now</button>
          <button className="btn" disabled={busy} onClick={onAnother}><RefreshCw /> Pick another</button>
          <button className="btn btn-ghost" onClick={onChange}><SlidersHorizontal /> Change filters</button>
        </div>
      </div>
    </div>
  );
}
