import { Package, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCrate, useDeleteCrate, useReleases, useRemoveFromCrate, useUpdateCrate } from '../api/hooks';
import { CoverCard } from '../components/CoverCard';

export function CratePage() {
  const id = Number(useParams().id);
  const { data: crate, error } = useCrate(id);
  const { data: items } = useReleases({ crate: id });
  const update = useUpdateCrate(id);
  const del = useDeleteCrate();
  const remove = useRemoveFromCrate();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  useEffect(() => {
    if (crate) { setName(crate.name); setDesc(crate.description); }
  }, [crate]);

  if (error) return <div className="empty">Crate not found.</div>;
  if (!crate) return <div className="empty">Loading…</div>;

  const commit = () => {
    if (name.trim() && (name !== crate.name || desc !== crate.description)) update.mutate({ name: name.trim(), description: desc });
  };

  return (
    <div className="page">
      <div className="card card-pad" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div className="brand-mark" style={{ width: 44, height: 44 }}><Package size={22} /></div>
        <div className="grow" style={{ display: 'grid', gap: 4 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} aria-label="Crate name"
            style={{ fontSize: 22, fontWeight: 700, border: 0, background: 'transparent', padding: 0, outline: 'none' }} />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={commit} placeholder="Add a description…"
            aria-label="Crate description" className="muted" style={{ border: 0, background: 'transparent', padding: 0, outline: 'none' }} />
        </div>
        <button className="btn btn-sm" onClick={() => {
          if (window.confirm(`Delete the crate "${crate.name}"? The records stay in your collection.`)) {
            del.mutate(id, { onSuccess: () => navigate('/') });
          }
        }}><Trash2 /> Delete crate</button>
      </div>

      {items && items.length === 0 && (
        <div className="card empty">This crate is empty. Use “Add to crate” on any record page.</div>
      )}
      <div className="grid" style={{ ['--size' as string]: '170px' }}>
        {items?.map((it) => (
          <div key={it.id} style={{ position: 'relative' }}>
            <CoverCard item={it} />
            <button className="icon-btn" style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28 }}
              title="Remove from crate" aria-label={`Remove ${it.title} from crate`}
              onClick={() => remove.mutate({ crateId: id, releaseId: it.id })}><X /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
