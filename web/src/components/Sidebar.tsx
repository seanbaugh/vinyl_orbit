import {
  Building2, CalendarRange, ChevronDown, ChevronRight, Disc3, LayoutDashboard, Library, Mic2, Package, Plus, Tags, Music4,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useCreateCrate, useFacets } from '../api/hooks';
import { SyncPanel } from './SyncPanel';

function Group({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="nav-group">
      <div className="nav-group-head">
        <button onClick={() => setOpen(!open)} aria-expanded={open} style={{ gap: 4, alignItems: 'center' }}>
          {title} {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {action}
      </div>
      {open && children}
    </div>
  );
}

function Link({ to, icon, label, count }: { to: string; icon: ReactNode; label: string; count?: number }) {
  const location = useLocation();
  const [path, query] = to.split('?');
  // Library links with a query (tags) are active only when the query matches.
  const active = location.pathname === path && (query ? location.search === `?${query}` : true);
  return (
    <NavLink to={to} end className={() => `nav-link${active ? ' active' : ''}`}>
      {icon}
      <span className="ellipsis">{label}</span>
      {count !== undefined && <span className="badge">{count}</span>}
    </NavLink>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: f } = useFacets();
  const createCrate = useCreateCrate();
  const navigate = useNavigate();

  const newCrate = () => {
    const name = window.prompt('New crate name');
    if (name?.trim()) createCrate.mutate({ name: name.trim() }, { onSuccess: (c) => navigate(`/crate/${c.id}`) });
  };

  return (
    <>
      <div className={`scrim${open ? ' open' : ''}`} onClick={onClose} />
      <aside className={`sidebar${open ? ' open' : ''}`} onClick={(e) => (e.target as HTMLElement).closest('a') && onClose()}>
        <div className="brand">
          <div className="brand-mark"><Disc3 size={20} /></div>
          <div className="wordmark">Vinyl <span>Orbit</span></div>
        </div>
        <nav className="nav">
          <Link to="/" icon={<LayoutDashboard />} label="Dashboard" />
          <Link to="/library" icon={<Library />} label="Library" count={f?.total} />

          <Group title="Browse">
            <Link to="/browse/artists" icon={<Mic2 />} label="Artists" count={f?.artists.length} />
            <Link to="/browse/labels" icon={<Building2 />} label="Labels" count={f?.labels.length} />
            <Link to="/browse/genres" icon={<Music4 />} label="Genres" count={f?.genres.length} />
            <Link to="/browse/styles" icon={<Tags />} label="Styles" count={f?.styles.length} />
            <Link to="/browse/formats" icon={<Disc3 />} label="Formats" count={f?.formats.length} />
            <Link to="/browse/decades" icon={<CalendarRange />} label="Decades" count={f?.decades.length} />
          </Group>

          <Group title="Crates" action={<button onClick={newCrate} title="New crate" aria-label="New crate"><Plus size={14} /></button>}>
            {f?.crates.length ? (
              f.crates.map((c) => <Link key={c.id} to={`/crate/${c.id}`} icon={<Package />} label={c.name} count={c.count} />)
            ) : (
              <div className="nav-link faint" style={{ fontSize: 12 }}>No crates yet</div>
            )}
          </Group>

          <Group title="Tags">
            {f?.tags.length ? (
              f.tags.map((t) => (
                <Link key={t.id} to={`/library?tag=${t.id}`} label={t.name} count={t.count}
                  icon={<span className="tag-dot" style={t.color ? { background: t.color } : undefined} />} />
              ))
            ) : (
              <div className="nav-link faint" style={{ fontSize: 12 }}>Add tags from a record</div>
            )}
          </Group>
        </nav>
        <SyncPanel />
      </aside>
    </>
  );
}
