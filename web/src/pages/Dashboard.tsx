import { useQueryClient } from '@tanstack/react-query';
import { Clock, Disc3, DollarSign, Headphones, History, Music4, Shuffle, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboard } from '../api/hooks';
import { Shelf } from '../components/Shelf';
import { fmtMoney } from '../lib/format';

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Dashboard() {
  const { data: d, isLoading, error } = useDashboard();
  const qc = useQueryClient();

  if (isLoading) return <div className="empty">Loading…</div>;
  if (error || !d) return <div className="empty">Couldn't load the dashboard: {(error as Error)?.message}</div>;

  const s = d.stats;
  return (
    <div className="page">
      <h1 style={{ margin: '4px 4px 0', fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Sparkles size={18} className="accent" /> {greeting(new Date().getHours())}, <span className="accent">Sean</span>
      </h1>

      {s.records === 0 ? (
        <div className="card empty">Your collection is syncing from Discogs. Records will appear here in a few minutes.</div>
      ) : (
        <>
          <div className="stat-cards">
            <Link to="/library" className="card stat">
              <span className="label"><Disc3 /> Records</span>
              <span className="value">{s.records}</span>
              <span className="hint">in your collection</span>
            </Link>
            <Link to="/stats" className="card stat">
              <span className="label"><DollarSign /> Estimated value</span>
              <span className="value">{fmtMoney(s.estimatedValue, true)}</span>
              <span className="hint">lowest Discogs prices · {s.valuedCount} of {s.records} priced</span>
            </Link>
            <div className="card stat">
              <span className="label"><Headphones /> Plays this month</span>
              <span className="value">{s.playsThisMonth}</span>
              <span className="hint">log plays from any record page</span>
            </div>
            <Link to={s.topGenre ? `/library?genre=${encodeURIComponent(s.topGenre)}` : '/library'} className="card stat">
              <span className="label"><Music4 /> Top genre</span>
              <span className="value ellipsis" style={{ fontSize: 22 }}>{s.topGenre ?? '—'}</span>
              <span className="hint">most common in your collection</span>
            </Link>
          </div>

          <Shelf title="Recently Added" icon={<Clock />} items={d.recentlyAdded}
            action={<Link className="btn btn-sm" to="/library?sort=added&order=desc">View all</Link>} />
          <Shelf title="Pull Something" icon={<Shuffle />} items={d.pullSomething}
            action={
              <button className="btn btn-sm" onClick={() => qc.invalidateQueries({ queryKey: ['dashboard'] })}>
                <Shuffle /> Shuffle
              </button>
            } />
          <Shelf title="Recently Played" icon={<Headphones />} items={d.recentlyPlayed} />
          <Shelf title="Not Played in a While" icon={<History />} items={d.notPlayedInAWhile} />
        </>
      )}
    </div>
  );
}
