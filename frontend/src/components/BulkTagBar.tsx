import { useState } from 'react';
import { useBulkTag } from '../api/hooks';

type Props = { selectedIds: number[]; onDone: () => void };

export function BulkTagBar({ selectedIds, onDone }: Props) {
  const [name, setName] = useState('');
  const [result, setResult] = useState('');
  const bulk = useBulkTag();

  if (selectedIds.length === 0) return result ? <div className="box ok">{result}</div> : null;

  const submit = () =>
    bulk.mutate(
      { contactIds: selectedIds, name: name.trim() },
      {
        onSuccess: (r) => {
          setResult(`Tagged "${r.tag.name}": ${r.added} added, ${r.skipped} already tagged or skipped.`);
          setName('');
          onDone();
        },
      },
    );

  return (
    <>
      <div className="bulk">
        <strong>{selectedIds.length} selected</strong>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tag name" maxLength={50} onKeyDown={(e) => e.key === 'Enter' && name.trim() && submit()} />
        <button onClick={submit} disabled={!name.trim() || bulk.isPending}>{bulk.isPending ? 'Tagging…' : 'Add tag to selected'}</button>
        <button onClick={onDone}>Clear selection</button>
      </div>
      {bulk.error && <div className="box error" role="alert">{bulk.error.message}</div>}
    </>
  );
}
