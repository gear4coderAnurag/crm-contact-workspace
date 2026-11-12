import { useState } from 'react';
import { useBulkTag } from '../api/hooks';
import { useToast } from './Toast';

type Props = { selectedIds: number[]; onDone: () => void };

export function BulkTagBar({ selectedIds, onDone }: Props) {
  const [name, setName] = useState('');
  const bulk = useBulkTag();
  const toast = useToast();

  if (selectedIds.length === 0) return null;

  const submit = () =>
    bulk.mutate(
      { contactIds: selectedIds, name: name.trim() },
      {
        onSuccess: (r) => {
          toast(`Tag "${r.tag.name}" added to ${r.added} contact${r.added === 1 ? '' : 's'}` + (r.skipped ? ` (${r.skipped} already had it)` : ''));
          setName('');
          onDone();
        },
      },
    );

  return (
    <div className="bulk-wrap">
      <div className="bulk">
        <strong>{selectedIds.length} selected</strong>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tag name" aria-label="Tag name" maxLength={50} onKeyDown={(e) => e.key === 'Enter' && name.trim() && submit()} />
        <button onClick={submit} disabled={!name.trim() || bulk.isPending}>{bulk.isPending ? 'Tagging…' : 'Add tag to selected'}</button>
        <button onClick={onDone}>Clear selection</button>
      </div>
      {bulk.error && <div className="box error" role="alert">{bulk.error.message}</div>}
    </div>
  );
}
