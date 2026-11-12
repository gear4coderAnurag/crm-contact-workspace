import { useState } from 'react';
import { useAddTag, useRemoveTag } from '../api/hooks';
import type { Tag } from '../api/types';
import { useToast } from './Toast';

export function TagEditor({ contactId, tags }: { contactId: number; tags: Tag[] }) {
  const [name, setName] = useState('');
  const add = useAddTag(contactId);
  const remove = useRemoveTag(contactId);
  const toast = useToast();
  const error = add.error ?? remove.error;

  return (
    <div>
      <div>
        {tags.length === 0 && <span className="muted">No tags yet. </span>}
        {tags.map((t) => (
          <span key={t.id} className="chip">
            {t.name}
            <button onClick={() => remove.mutate(t.id, { onSuccess: () => toast(`Tag "${t.name}" removed`) })}disabled={remove.isPending} aria-label={`Remove ${t.name}`}>×</button>
          </span>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add.mutate(name.trim(), {
            onSuccess: (tag) => {
              setName('');
              toast(`Tag "${tag.name}" added`);
            },
          });
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a tag" maxLength={50} />
        <button disabled={!name.trim() || add.isPending}>Add</button>
      </form>
      {error && <div className="box error" role="alert">{error.message}</div>}
    </div>
  );
}
