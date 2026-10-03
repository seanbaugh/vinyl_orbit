import { Check, Package, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Crate } from '@api/api-types';
import { useAddToCrate, useCreateCrate, useFacets, useRemoveFromCrate } from '../api/hooks';

export function CrateMenu({ releaseId, inCrates }: { releaseId: number; inCrates: Crate[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: facets } = useFacets();
  const add = useAddToCrate(releaseId);
  const remove = useRemoveFromCrate(releaseId);
  const create = useCreateCrate();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const member = new Set(inCrates.map((c) => c.id));
  const toggle = (id: number) =>
    member.has(id) ? remove.mutate({ crateId: id, releaseId }) : add.mutate(id);
  const newCrate = () => {
    const name = window.prompt('New crate name');
    if (name?.trim()) create.mutate({ name: name.trim() }, { onSuccess: (c) => add.mutate(c.id) });
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Package /> {inCrates.length ? `In ${inCrates.length} crate${inCrates.length > 1 ? 's' : ''}` : 'Add to crate'}
      </button>
      {open && (
        <div className="popover" style={{ top: 42, left: 0, minWidth: 220, padding: 6 }}>
          {facets?.crates.map((c) => (
            <button key={c.id} className="palette-item" style={{ width: '100%', background: 'none', border: 0 }} onClick={() => toggle(c.id)}>
              <span style={{ width: 16 }}>{member.has(c.id) && <Check size={14} className="accent" />}</span>
              <span className="grow ellipsis" style={{ textAlign: 'left' }}>{c.name}</span>
              <span className="badge">{c.count}</span>
            </button>
          ))}
          <button className="palette-item" style={{ width: '100%', background: 'none', border: 0 }} onClick={newCrate}>
            <Plus size={14} /> <span>New crate…</span>
          </button>
        </div>
      )}
    </div>
  );
}
