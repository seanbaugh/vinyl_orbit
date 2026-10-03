import { Library as LibraryIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ReleaseListItem, SortKey } from '@api/api-types';
import { useFacets, useReleases } from '../api/hooks';
import { AZRail } from '../components/AZRail';
import { CoverCard } from '../components/CoverCard';
import { CoverImage } from '../components/CoverImage';
import { ActiveFilters, FilterBar } from '../components/FilterBar';
import { fmtDate, fmtMoney } from '../lib/format';
import { formatClass } from '../lib/formats';
import { apiQuery, azKey, parseQuery, toSearchParams, type LibraryQuery } from '../lib/query';

export function Library() {
  const [sp, setSp] = useSearchParams();
  const q = useMemo(() => parseQuery(sp), [sp]);
  const { data: facets } = useFacets();
  const { data: items, isLoading, error } = useReleases(apiQuery(q));

  const update = (patch: Partial<LibraryQuery>) => setSp(toSearchParams({ ...q, ...patch }), { replace: true });

  const firstIds = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items ?? []) {
      const k = azKey(it, q.sort);
      if (k && !m.has(k)) m.set(k, it.id);
    }
    return m;
  }, [items, q.sort]);

  return (
    <div className="page">
      <div className="card toolbar">
        <h1><LibraryIcon size={16} className="accent" /> Library <span className="badge">{items?.length ?? '…'}</span></h1>
        <FilterBar q={q} facets={facets} onChange={update} />
      </div>
      <ActiveFilters q={q} facets={facets} onChange={update} />

      {error && <div className="banner">Couldn't load the library: {(error as Error).message}</div>}
      {isLoading && <div className="empty">Loading…</div>}
      {items && items.length === 0 && (
        <div className="card empty">
          {facets?.total === 0 ? 'Your collection is syncing from Discogs — check back in a few minutes.' : 'No records match these filters.'}
        </div>
      )}

      {items && items.length > 0 && (
        <div className="library-body">
          <div className="grow">
            {q.view === 'grid' && (
              <div className="grid" style={{ ['--size' as string]: `${q.size}px` }}>
                {items.map((it) => <CoverCard key={it.id} item={it} />)}
              </div>
            )}
            {q.view === 'list' && <ListView items={items} />}
            {q.view === 'table' && <TableView items={items} q={q} onSort={(sort) => update(
              sort === q.sort ? { order: q.order === 'desc' ? 'asc' : 'desc' } : { sort, order: 'asc' })} />}
          </div>
          {firstIds.size > 0 && <AZRail firstIds={firstIds} />}
        </div>
      )}
    </div>
  );
}

function ListView({ items }: { items: ReleaseListItem[] }) {
  const navigate = useNavigate();
  return (
    <div className="card">
      {items.map((it) => (
        <div key={it.id} className="list-row" data-id={it.id} role="link" tabIndex={0} style={{ cursor: 'pointer' }}
          onClick={() => navigate(`/release/${it.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/release/${it.id}`)}>
          <CoverImage src={it.coverUrl} alt={it.title} />
          <div className="grow">
            <div style={{ fontWeight: 600 }} className="ellipsis">{it.title}</div>
            <div className="muted ellipsis">{it.artists}{it.year ? ` · ${it.year}` : ''} <span className={formatClass(it.formatSummary)}>{it.formatSummary}</span></div>
          </div>
          <div className="row wrap" style={{ justifyContent: 'flex-end', maxWidth: '40%' }}>
            {it.tags.map((t) => <span key={t.id} className="chip">{t.name}</span>)}
            {it.playCount > 0 && <span className="chip">▶ {it.playCount}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

const COLUMNS: { label: string; sort?: SortKey; num?: boolean }[] = [
  { label: 'Artist', sort: 'artist' }, { label: 'Title', sort: 'title' }, { label: 'Year', sort: 'year', num: true },
  { label: 'Format' }, { label: 'Label' }, { label: 'Cat#' }, { label: 'Plays', sort: 'plays', num: true },
  { label: 'Last played', sort: 'played' }, { label: 'Value', sort: 'value', num: true },
];

function TableView({ items, q, onSort }: { items: ReleaseListItem[]; q: LibraryQuery; onSort: (s: SortKey) => void }) {
  const navigate = useNavigate();
  return (
    <div className="card table-wrap">
      <table className="data">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.label} className={c.num ? 'num' : ''} onClick={() => c.sort && onSort(c.sort)}
                aria-sort={c.sort === q.sort ? (q.order === 'desc' ? 'descending' : 'ascending') : undefined}>
                {c.label}{c.sort === q.sort ? (q.order === 'desc' ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} data-id={it.id} onClick={() => navigate(`/release/${it.id}`)}>
              <td className="clip" title={it.artists}>{it.artists}</td>
              <td className="clip" style={{ fontWeight: 600 }} title={it.title}>{it.title}</td>
              <td className="num">{it.year ?? '—'}</td>
              <td><span className={formatClass(it.formatSummary)}>{it.formatSummary}</span></td>
              <td className="clip">{it.labels[0]?.name ?? "—"}</td>
              <td className="muted">{it.labels[0]?.catno ?? ''}</td>
              <td className="num">{it.playCount || ''}</td>
              <td className="muted">{it.lastPlayedAt ? fmtDate(it.lastPlayedAt) : ''}</td>
              <td className="num">{fmtMoney(it.lowestPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
