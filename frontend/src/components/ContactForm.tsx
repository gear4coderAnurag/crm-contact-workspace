import { useState } from 'react';
import { ApiError } from '../api/client';
import { useUpdateContact } from '../api/hooks';
import type { Contact } from '../api/types';
import { useToast } from './Toast';

const FIELDS = [
  ['firstName', 'First name'],
  ['lastName', 'Last name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['company', 'Company'],
] as const;
type Field = (typeof FIELDS)[number][0];
type Values = Record<Field, string>;

const toValues = (c: Contact): Values => ({
  firstName: c.firstName,
  lastName: c.lastName,
  email: c.email ?? '',
  phone: c.phone ?? '',
  company: c.company ?? '',
});

export function ContactForm({ contact }: { contact: Contact }) {
  const [base, setBase] = useState(contact); // the server version the edits are based on
  const [values, setValues] = useState(toValues(contact));
  const [conflict, setConflict] = useState<Contact | null>(null);
  const update = useUpdateContact(contact.id);
  const toast = useToast();

  const err = update.error instanceof ApiError ? update.error : null;
  const fieldErrors = err?.fields ?? {};
  // anything that isn't a conflict or a per-field error is shown as a banner
  const banner = err && err.code !== 'VERSION_CONFLICT' && Object.keys(fieldErrors).length === 0 ? err.message : update.error && !err ? update.error.message : null;

  const submit = () => {
    update.mutate(
      { version: base.version, ...values },
      {
        onSuccess: (c) => {
          setBase(c);
          setValues(toValues(c));
          setConflict(null);
          toast(`Saved (version ${c.version})`);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') setConflict(e.details.current as Contact);
        },
      },
    );
  };

  const reload = () => {
    if (!conflict) return;
    setBase(conflict);
    setValues(toValues(conflict));
    setConflict(null);
    update.reset();
  };

  // fields the other user changed since we loaded the contact, and whether we edited them too
  const baseValues = toValues(base);
  const latest = conflict ? toValues(conflict) : null;
  const theirs = (f: Field) => latest !== null && latest[f] !== baseValues[f];
  const clash = (f: Field) => theirs(f) && values[f] !== baseValues[f] && values[f] !== latest?.[f];

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {conflict && (
        <div className="box warn" role="alert">
          <strong>This contact was updated by someone else.</strong>
          <div>
            They saved version {conflict.version}. Changed fields are highlighted below.
            {FIELDS.some(([f]) => clash(f)) && <> Fields marked <strong>both changed</strong> have edits from you and from them.</>}
          </div>
          <button type="button" onClick={reload}>Reload latest</button>
          <div className="muted">Your unsaved edits stay on screen until you reload.</div>
        </div>
      )}
      {FIELDS.map(([f, label]) => (
        <div className={theirs(f) ? 'field changed' : 'field'} key={f}>
          <label htmlFor={f}>{label}</label>
          <input id={f} value={values[f]} aria-invalid={Boolean(fieldErrors[f])} onChange={(e) => setValues({ ...values, [f]: e.target.value })} />
          {fieldErrors[f] && <span className="err">{fieldErrors[f]}</span>}
          {latest && theirs(f) && (
            <span className="theirs">
              {clash(f) && <strong>Both changed · </strong>}
              Now: {latest[f] || '(empty)'}
            </span>
          )}
        </div>
      ))}
      {banner && <div className="box error" role="alert">{banner}</div>}
      <div className="row">
        <button disabled={update.isPending || conflict !== null}>{update.isPending ? 'Saving…' : 'Save'}</button>
        <span className="muted">Version {base.version} · Created {new Date(base.createdAt).toLocaleString()} · Updated {new Date(base.updatedAt).toLocaleString()}</span>
      </div>
    </form>
  );
}
