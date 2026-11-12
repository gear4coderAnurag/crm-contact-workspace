import { Link, useNavigate } from 'react-router-dom';
import type { Contact } from '../api/types';

type Props = { contacts: Contact[]; selected: Set<number>; onToggle: (id: number) => void; onToggleAll: () => void };

const HEAD = ['Name', 'Email', 'Phone', 'Company', 'Tags', 'Created'];

export function ContactTable({ contacts, selected, onToggle, onToggleAll }: Props) {
  const navigate = useNavigate();
  const all = contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th><input type="checkbox" checked={all} onChange={onToggleAll} aria-label="Select all on page" /></th>
            {HEAD.map((h) => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr
              key={c.id}
              className={selected.has(c.id) ? 'clickable selected' : 'clickable'}
              // the name link stays the keyboard path; the row click is a mouse convenience
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a, input, button')) return;
                navigate(`/contacts/${c.id}`);
              }}
            >
              <td className="cell-check"><input type="checkbox" checked={selected.has(c.id)} onChange={() => onToggle(c.id)} aria-label={`Select ${c.firstName} ${c.lastName}`} /></td>
              <td className="cell-name"><Link to={`/contacts/${c.id}`}>{c.firstName} {c.lastName}</Link></td>
              <td data-label="Email">{c.email ?? '—'}</td>
              <td data-label="Phone" className="nowrap">{c.phone ?? '—'}</td>
              <td data-label="Company">{c.company ?? '—'}</td>
              <td data-label="Tags">{c.tags.length === 0 && <span className="muted">—</span>}{c.tags.map((t) => <span key={t.id} className="chip">{t.name}</span>)}</td>
              <td data-label="Created" className="nowrap">{new Date(c.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContactTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="table-wrap" aria-busy="true" aria-label="Loading contacts">
      <table>
        <thead>
          <tr><th />{HEAD.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              {Array.from({ length: HEAD.length + 1 }, (_, j) => <td key={j}><span className="skel" /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
