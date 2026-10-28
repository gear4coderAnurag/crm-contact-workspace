import { describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { api, makeContact } from './helpers.js';

describe('PATCH /api/contacts/:id', () => {
  it('stale update -> 409 VERSION_CONFLICT, first write kept, current included', async () => {
    const id = await makeContact({ phone: '+919999999999' });
    const a = await api().patch(`/api/contacts/${id}`).send({ version: 1, phone: '+911111111111' });
    expect(a.status).toBe(200);
    expect(a.body.version).toBe(2);

    const b = await api().patch(`/api/contacts/${id}`).send({ version: 1, company: 'Acme' });
    expect(b.status).toBe(409);
    expect(b.body.error.code).toBe('VERSION_CONFLICT');
    expect(b.body.error.details.current.version).toBe(2);
    expect(b.body.error.details.current.phone).toBe('+911111111111');
    expect(b.body.error.details.current.tags).toEqual([]);

    const row = await db.selectFrom('contacts').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(row.company).toBeNull();
    expect(row.phone).toBe('+911111111111');
  });

  it('concurrent updates with the same version: exactly one wins', async () => {
    const id = await makeContact();
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) => api().patch(`/api/contacts/${id}`).send({ version: 1, company: `C${n}` })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it('email uniqueness is case-insensitive; NULL emails may repeat', async () => {
    const a = await makeContact({ email: 'a@x.com' });
    const b = await makeContact({ firstName: 'Bob' });
    await makeContact({ firstName: 'Cy' });
    await makeContact({ firstName: 'Di' }); // multiple NULL emails are fine

    const res = await api().patch(`/api/contacts/${b}`).send({ version: 1, email: 'A@X.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(res.body.error.details.fields.email).toBeTruthy();

    const ok = await api().patch(`/api/contacts/${b}`).send({ version: 1, email: ' B@X.com ' });
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe('b@x.com');
    expect(a).not.toBe(b);

    const cleared = await api().patch(`/api/contacts/${b}`).send({ version: 2, email: '' });
    expect(cleared.body.email).toBeNull();
  });

  it('normalizes phone and company', async () => {
    const id = await makeContact();
    const res = await api().patch(`/api/contacts/${id}`).send({ version: 1, phone: '+91 (98765)-432.10', company: '  Acme  ' });
    expect(res.body.phone).toBe('+919876543210');
    expect(res.body.company).toBe('Acme');
  });

  it('logs a diff activity; no-op update logs nothing and keeps version', async () => {
    const id = await makeContact({ company: 'Old' });
    const up = await api().patch(`/api/contacts/${id}`).send({ version: 1, company: 'New', firstName: 'Ada' });
    expect(up.body.version).toBe(2);

    const noop = await api().patch(`/api/contacts/${id}`).send({ version: 2, company: 'New' });
    expect(noop.status).toBe(200);
    expect(noop.body.version).toBe(2);

    const acts = await api().get(`/api/contacts/${id}/activities`);
    expect(acts.body.data).toHaveLength(1);
    expect(acts.body.data[0].type).toBe('CONTACT_UPDATED');
    expect(acts.body.data[0].data.changed).toEqual({ company: { from: 'Old', to: 'New' } });
  });

  it('validation: bad email/phone/empty patch/missing version -> 400 with fields', async () => {
    const id = await makeContact();
    const bad = await api().patch(`/api/contacts/${id}`).send({ version: 1, email: 'nope', phone: '12', firstName: '' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(bad.body.error.details.fields).sort()).toEqual(['email', 'firstName', 'phone']);

    expect((await api().patch(`/api/contacts/${id}`).send({ version: 1 })).status).toBe(400);
    expect((await api().patch(`/api/contacts/${id}`).send({ company: 'x' })).status).toBe(400);
  });

  it('404 for missing contact, 400 for bad id', async () => {
    expect((await api().patch('/api/contacts/999').send({ version: 1, company: 'x' })).body.error.code).toBe('NOT_FOUND');
    expect((await api().get('/api/contacts/abc')).status).toBe(400);
    expect((await api().get('/api/contacts/999/activities')).status).toBe(404);
  });
});
