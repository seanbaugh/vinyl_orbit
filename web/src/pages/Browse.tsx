import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Facet, Facets } from '@api/api-types';
import { useFacets } from '../api/hooks';

const FACETS: Record<string, { title: string; key: keyof Facets; param: string; cloud: boolean }> = {
  artists: { title: 'Artists', key: 'artists', param: 'artist', cloud: false },
  labels: { title: 'Labels', key: 'labels', param: 'label', cloud: false },
  genres: { title: 'Genres', key: 'genres', param: 'genre', cloud: true },
  styles: { title: 'Styles', key: 'styles', param: 'style', cloud: true },
  formats: { title: 'Formats', key: 'formats', param: 'format', cloud: true },
  decades: { title: 'Decades', key: 'decades', param: 'decade', cloud: true },
};

export function Browse() {
  const { facet = '' } = useParams();
  const cfg = FACETS[facet];
  const { data } = useFacets();
  const [filter, setFilter] = useState('');

  if (!cfg) return <div className="empty">Unknown category.</div>;
  let values = ((data?.[cfg.key] ?? []) as Facet[]).filter((f) => f.value.toLowerCase().includes(filter.toLowerCase()));
  if (cfg.key === 'decades') values = [...values].sort((a, b) => a.value.localeCompare(b.value));
  else if (!cfg.cloud) values = [...values].sort((a, b) => a.value.localeCompare(b.value));
  const max = Math.max(1, ...values.map((v) => v.count));
  const href = (v: string) => `/library?${cfg.param}=${encodeURIComponent(v)}`;
  const label = (v: string) => (cfg.key === 'decades' ? `${v}s` : v);

  return (
    <div className="page">
      <div className="card toolbar">
        <h1>{cfg.title} <span className="badge">{values.length}</span></h1>
        <label className="row input" style={{ width: 240, gap: 6, marginLeft: 'auto' }}>
          <Search size={14} className="muted" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${cfg.title.toLowerCase()}…`}
            aria-label={`Filter ${cfg.title}`} style={{ border: 0, background: 'transparent', outline: 'none', width: '100%' }} />
        </label>
      </div>
      {cfg.cloud ? (
        <div className="card card-pad row wrap" style={{ gap: 10 }}>
          {values.map((v) => (
            <Link key={v.value} to={href(v.value)} className="chip"
              style={{ fontSize: 12 + Math.round((v.count / max) * 8), height: 'auto', padding: '6px 14px' }}>
              {label(v.value)} <span className="muted">{v.count}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card">
          {values.map((v) => (
            <Link key={v.value} to={href(v.value)} className="list-row">
              <span className="grow ellipsis">{v.value}</span>
              <span className="badge">{v.count}</span>
            </Link>
          ))}
        </div>
      )}
      {!values.length && <div className="empty">Nothing here.</div>}
    </div>
  );
}
