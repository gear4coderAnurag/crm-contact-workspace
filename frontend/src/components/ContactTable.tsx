import { Link } from 'react-router-dom';
import type { Contact } from '../api/types';

type Props = { contacts: Contact[]; selected: Set<number>; onToggle: (id: number) => void; onToggleAll: () => void };

export function ContactTable({ contacts, selected, onToggle, onToggleAll }: Props) {
  const all = contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  return (
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" checked={all} onChange={onToggleAll} aria-label="Select all on page" /></th>
          <th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Tags</th><th>Created</th>
        </tr>
      </thead>
      <tbody>
        {contacts.map((c) => (
          <tr key={c.id}>
            <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => onToggle(c.id)} aria-label={`Select ${c.firstName} ${c.lastName}`} /></td>
            <td><Link to={`/contacts/${c.id}`}>{c.firstName} {c.lastName}</Link></td>
            <td>{c.email ?? '—'}</td>
            <td>{c.phone ?? '—'}</td>
            <td>{c.company ?? '—'}</td>
            <td>{c.tags.map((t) => <span key={t.id} className="chip">{t.name}</span>)}</td>
            <td>{new Date(c.createdAt).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
