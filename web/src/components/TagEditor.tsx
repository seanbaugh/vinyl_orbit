import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Tag } from '@api/api-types';
import { useAddTag, useFacets, useRemoveTag } from '../api/hooks';

export function TagEditor({ releaseId, tags }: { releaseId: number; tags: Tag[] }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const { data: facets } = useFacets();
  const add = useAddTag(releaseId);
  const remove = useRemoveTag(releaseId);
  const listId = `tags-${releaseId}`;

  const submit = () => {
    const name = value.trim();
    if (name) add.mutate(name);
    setValue('');
    setAdding(false);
  };

  return (
    <div className="row wrap">
      {tags.map((t) => (
        <span key={t.id} className="chip chip-accent">
          <Link to={`/library?tag=${t.id}`}>{t.name}</Link>
          <button onClick={() => remove.mutate(t.id)} aria-label={`Remove tag ${t.name}`}><X /></button>
        </span>
      ))}
      {adding ? (
        <>
          <input className="input" style={{ height: 26, width: 160 }} autoFocus value={value} list={listId}
            placeholder="Tag name" aria-label="New tag"
            onChange={(e) => setValue(e.target.value)} onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') { setValue(''); setAdding(false); }
            }} />
          <datalist id={listId}>
            {facets?.tags.filter((t) => !tags.some((x) => x.id === t.id)).map((t) => <option key={t.id} value={t.name} />)}
          </datalist>
        </>
      ) : (
        <button className="chip" onClick={() => setAdding(true)}><Plus /> Tag</button>
      )}
    </div>
  );
}
