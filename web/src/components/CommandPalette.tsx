import { Building2, Mic2, Music, NotebookPen } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearch } from '../api/hooks';
import { CoverImage } from './CoverImage';

interface Item { key: string; group: string; label: ReactNode; sub?: string; icon: ReactNode; to: string }

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const { data } = useSearch(debounced);
  const navigate = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 150);
    return () => clearTimeout(t);
  }, [text]);

  const items = useMemo<Item[]>(() => {
    if (!data || debounced.trim().length < 2) return [];
    return [
      ...data.releases.map((r) => ({ key: `r${r.id}`, group: 'Records', label: r.title, sub: `${r.artists}${r.year ? ` · ${r.year}` : ''}`,
        icon: <CoverImage src={r.coverUrl} alt="" />, to: `/release/${r.id}` })),
      ...data.artists.map((a) => ({ key: `a${a.value}`, group: 'Artists', label: a.value, sub: `${a.count} record${a.count > 1 ? 's' : ''}`,
        icon: <Mic2 size={16} />, to: `/library?artist=${encodeURIComponent(a.value)}` })),
      ...data.labels.map((l) => ({ key: `l${l.value}`, group: 'Labels', label: l.value, sub: `${l.count} record${l.count > 1 ? 's' : ''}`,
        icon: <Building2 size={16} />, to: `/library?label=${encodeURIComponent(l.value)}` })),
      ...data.tracks.map((t, i) => ({ key: `t${i}`, group: 'Tracks', label: `${t.position} · ${t.title}`, sub: t.releaseTitle,
        icon: <Music size={16} />, to: `/release/${t.releaseId}` })),
      ...data.notes.map((n) => ({ key: `n${n.releaseId}`, group: 'Notes', label: n.releaseTitle, sub: n.snippet,
        icon: <NotebookPen size={16} />, to: `/release/${n.releaseId}?tab=notes` })),
    ];
  }, [data, debounced]);

  useEffect(() => setActive(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    navigate(item.to);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') go(items[active]);
  };

  let lastGroup = '';
  return (
    <div className="palette-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card palette" role="dialog" aria-modal="true" aria-label="Search">
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
          placeholder="Search records, artists, labels, tracks, notes…" aria-label="Search" />
        <div className="palette-results" ref={listRef}>
          {debounced.trim().length < 2 && <div className="muted" style={{ padding: 12 }}>Type at least two characters.</div>}
          {debounced.trim().length >= 2 && data && !items.length && <div className="muted" style={{ padding: 12 }}>No matches.</div>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? <div className="palette-group">{item.group}</div> : null;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {header}
                <div className={`palette-item${i === active ? ' active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(item)}>
                  <span style={{ width: 34, display: 'grid', placeItems: 'center' }} className="muted">{item.icon}</span>
                  <div className="grow">
                    <div className="ellipsis">{item.label}</div>
                    {item.sub && <div className="muted ellipsis" style={{ fontSize: 12 }}>{item.sub}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
