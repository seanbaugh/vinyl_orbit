import { ArrowDownWideNarrow, ArrowUpNarrowWide, Filter, LayoutGrid, List, Search, Table2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Facets, SortKey } from '@api/api-types';
import { SORTS, type LibraryQuery, type View } from '../lib/query';

interface Props {
  q: LibraryQuery;
  facets: Facets | undefined;
  onChange: (patch: Partial<LibraryQuery>) => void;
}

type FilterKey = 'genre' | 'style' | 'format' | 'decade' | 'label' | 'tag' | 'crate';

/** Toolbar controls: search-within, sort, filters popover, view toggle, size slider. */
export function FilterBar({ q, facets, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(q.q ?? '');
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => setText(q.q ?? ''), [q.q]);
  useEffect(() => {
    const t = setTimeout(() => { if ((q.q ?? '') !== text) onChange({ q: text || undefined }); }, 250);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!popRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const options: Record<FilterKey, { label: string; values: { value: string; label: string }[] }> = {
    genre: { label: 'Genre', values: (facets?.genres ?? []).map((f) => ({ value: f.value, label: `${f.value} (${f.count})` })) },
    style: { label: 'Style', values: (facets?.styles ?? []).map((f) => ({ value: f.value, label: `${f.value} (${f.count})` })) },
    format: { label: 'Format', values: (facets?.formats ?? []).map((f) => ({ value: f.value, label: `${f.value} (${f.count})` })) },
    decade: { label: 'Decade', values: [...(facets?.decades ?? [])].sort((a, b) => a.value.localeCompare(b.value))
      .map((f) => ({ value: f.value, label: `${f.value}s (${f.count})` })) },
    label: { label: 'Label', values: (facets?.labels ?? []).map((f) => ({ value: f.value, label: `${f.value} (${f.count})` })) },
    tag: { label: 'Tag', values: (facets?.tags ?? []).map((t) => ({ value: String(t.id), label: `${t.name} (${t.count ?? 0})` })) },
    crate: { label: 'Crate', values: (facets?.crates ?? []).map((c) => ({ value: String(c.id), label: `${c.name} (${c.count})` })) },
  };
  const numeric = (k: FilterKey) => k === 'decade' || k === 'tag' || k === 'crate';
  const setFilter = (k: FilterKey, v: string) => onChange({ [k]: v === '' ? undefined : numeric(k) ? Number(v) : v });

  const activeCount = (Object.keys(options) as FilterKey[]).filter((k) => q[k] !== undefined).length + (q.artist ? 1 : 0);

  return (
    <>
      <label className="row input" style={{ width: 200, gap: 6 }}>
        <Search size={14} className="muted" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter…" aria-label="Filter library"
          style={{ border: 0, background: 'transparent', outline: 'none', width: '100%' }} />
      </label>
      <select className="select" value={q.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })} aria-label="Sort by">
        {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <button className="icon-btn" style={{ borderRadius: 8 }} onClick={() => onChange({ order: q.order === 'desc' ? 'asc' : 'desc' })}
        title={q.order === 'desc' ? 'Descending' : 'Ascending'} aria-label="Toggle sort order">
        {q.order === 'desc' ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
      </button>
      <div ref={popRef} style={{ position: 'relative' }}>
        <button className={`btn${activeCount ? ' chip-accent' : ''}`} onClick={() => setOpen(!open)}>
          <Filter /> Filters{activeCount ? ` · ${activeCount}` : ''}
        </button>
        {open && (
          <div className="popover filters-pop" style={{ top: 42, left: 0 }}>
            {(Object.keys(options) as FilterKey[]).map((k) => (
              <label key={k}>
                {options[k].label}
                <select className="select" value={q[k] === undefined ? '' : String(q[k])} onChange={(e) => setFilter(k, e.target.value)}>
                  <option value="">Any</option>
                  {options[k].values.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            ))}
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => onChange({ genre: undefined, style: undefined, format: undefined,
                decade: undefined, label: undefined, tag: undefined, crate: undefined, artist: undefined })}>Clear all</button>
            </div>
          </div>
        )}
      </div>
      <div style={{ flex: 1 }} />
      {q.view === 'grid' && (
        <input type="range" min={120} max={280} step={10} value={q.size} aria-label="Cover size"
          onChange={(e) => onChange({ size: Number(e.target.value) })} style={{ width: 110, accentColor: 'var(--accent)' }} />
      )}
      <div className="seg" role="group" aria-label="View">
        {([['grid', LayoutGrid], ['list', List], ['table', Table2]] as [View, typeof List][]).map(([v, Icon]) => (
          <button key={v} className={q.view === v ? 'active' : ''} onClick={() => onChange({ view: v })} aria-label={`${v} view`}>
            <Icon />
          </button>
        ))}
      </div>
    </>
  );
}

/** Removable chips for the active filters. */
export function ActiveFilters({ q, facets, onChange }: Props) {
  const chips: { key: keyof LibraryQuery; label: string }[] = [];
  if (q.artist) chips.push({ key: 'artist', label: `Artist: ${q.artist}` });
  if (q.genre) chips.push({ key: 'genre', label: `Genre: ${q.genre}` });
  if (q.style) chips.push({ key: 'style', label: `Style: ${q.style}` });
  if (q.format) chips.push({ key: 'format', label: `Format: ${q.format}` });
  if (q.decade !== undefined) chips.push({ key: 'decade', label: `${q.decade}s` });
  if (q.label) chips.push({ key: 'label', label: `Label: ${q.label}` });
  if (q.tag !== undefined) chips.push({ key: 'tag', label: `Tag: ${facets?.tags.find((t) => t.id === q.tag)?.name ?? q.tag}` });
  if (q.crate !== undefined) chips.push({ key: 'crate', label: `Crate: ${facets?.crates.find((c) => c.id === q.crate)?.name ?? q.crate}` });
  if (!chips.length) return null;
  return (
    <div className="row wrap">
      {chips.map((c) => (
        <span key={c.key} className="chip chip-accent">
          {c.label}
          <button onClick={() => onChange({ [c.key]: undefined })} aria-label={`Remove ${c.label}`}><X /></button>
        </span>
      ))}
    </div>
  );
}
