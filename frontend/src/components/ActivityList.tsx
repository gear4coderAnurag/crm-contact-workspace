import { useActivities } from '../api/hooks';
import type { Activity } from '../api/types';
import { ErrorBox } from './ErrorBox';

const show = (v: unknown) => (v === null || v === '' ? '∅' : String(v));

function describe(a: Activity): string {
  if (a.type === 'TAG_ADDED') return `Tag added: ${a.data.tag}`;
  if (a.type === 'TAG_REMOVED') return `Tag removed: ${a.data.tag}`;
  return Object.entries(a.data.changed ?? {})
    .map(([f, c]) => `${f}: ${show(c.from)} → ${show(c.to)}`)
    .join('; ');
}

export function ActivityList({ contactId }: { contactId: number }) {
  const { data, error, isPending, refetch } = useActivities(contactId);
  if (isPending) return <p>Loading activity…</p>;
  if (error) return <ErrorBox error={error} onRetry={() => void refetch()} />;
  if (data.data.length === 0) return <p className="muted">No activity yet.</p>;
  return (
    <ul className="activity">
      {data.data.map((a) => (
        <li key={a.id}>
          <span className="muted">{new Date(a.createdAt).toLocaleString()}</span> — {describe(a)}
        </li>
      ))}
    </ul>
  );
}
