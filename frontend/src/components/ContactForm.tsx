import { useState } from 'react';
import { ApiError } from '../api/client';
import { useUpdateContact } from '../api/hooks';
import type { Contact } from '../api/types';

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
  const [saved, setSaved] = useState(false);
  const update = useUpdateContact(contact.id);

  const err = update.error instanceof ApiError ? update.error : null;
  const fieldErrors = err?.fields ?? {};
  // anything that isn't a conflict or a per-field error is shown as a banner
  const banner = err && err.code !== 'VERSION_CONFLICT' && Object.keys(fieldErrors).length === 0 ? err.message : update.error && !err ? update.error.message : null;

  const submit = () => {
    setSaved(false);
    update.mutate(
      { version: base.version, ...values },
      {
        onSuccess: (c) => {
          setBase(c);
          setValues(toValues(c));
          setConflict(null);
          setSaved(true);
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

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {conflict && (
        <div className="box warn" role="alert">
          <strong>This contact was updated by someone else.</strong>
          <div>Latest values (v{conflict.version}):</div>
          <ul>
            {FIELDS.map(([f, label]) => {
              const latest = toValues(conflict)[f];
              return latest !== values[f] ? <li key={f}>{label}: {latest || '∅'}</li> : null;
            })}
          </ul>
          <button type="button" onClick={reload}>Reload latest</button>
          <div className="muted">Your unsaved edits stay visible until you reload.</div>
        </div>
      )}
      {FIELDS.map(([f, label]) => (
        <div className="field" key={f}>
          <label htmlFor={f}>{label}</label>
          <input id={f} value={values[f]} aria-invalid={Boolean(fieldErrors[f])} onChange={(e) => setValues({ ...values, [f]: e.target.value })} />
          {fieldErrors[f] && <span className="err">{fieldErrors[f]}</span>}
        </div>
      ))}
      {banner && <div className="box error" role="alert">{banner}</div>}
      {saved && <div className="box ok">Saved (v{base.version}).</div>}
      <div className="row">
        <button disabled={update.isPending || conflict !== null}>{update.isPending ? 'Saving…' : 'Save'}</button>
        <span className="muted">Version {base.version}</span>
      </div>
    </form>
  );
}
