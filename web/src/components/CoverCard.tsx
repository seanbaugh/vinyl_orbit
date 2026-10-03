import type { ReleaseListItem } from '@api/api-types';
import { Link } from 'react-router-dom';
import { CoverImage } from './CoverImage';

export function CoverCard({ item, showMeta = true }: { item: ReleaseListItem; showMeta?: boolean }) {
  return (
    <Link to={`/release/${item.id}`} className="cover-card" data-id={item.id} title={`${item.artists} — ${item.title}`}>
      <CoverImage src={item.coverUrl} alt={`${item.artists} — ${item.title}`}>
        <span className="format-badge">{item.formatSummary}</span>
        {item.copies > 1 && <span className="copies-badge">×{item.copies}</span>}
      </CoverImage>
      {showMeta && (
        <div className="cover-meta">
          <div className="title ellipsis">{item.title}</div>
          <div className="sub ellipsis">{item.artists}{item.year ? ` · ${item.year}` : ''}</div>
        </div>
      )}
    </Link>
  );
}
