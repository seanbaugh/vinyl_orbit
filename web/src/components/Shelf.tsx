import type { ReactNode } from 'react';
import type { ReleaseListItem } from '@api/api-types';
import { CoverCard } from './CoverCard';

interface Props {
  title: string;
  icon: ReactNode;
  items: ReleaseListItem[];
  action?: ReactNode;
  empty?: string;
}

export function Shelf({ title, icon, items, action, empty }: Props) {
  if (!items.length && !empty) return null;
  return (
    <section className="card shelf">
      <div className="shelf-head">
        {icon}
        <h2>{title}</h2>
        <span className="badge" style={{ marginLeft: 0 }}>{items.length}</span>
        <div style={{ marginLeft: 'auto' }}>{action}</div>
      </div>
      {items.length ? (
        <div className="shelf-row">
          {items.map((it) => <CoverCard key={it.id} item={it} />)}
        </div>
      ) : (
        <div className="muted">{empty}</div>
      )}
    </section>
  );
}
