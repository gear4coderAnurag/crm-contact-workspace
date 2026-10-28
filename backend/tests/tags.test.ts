import { describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { api, makeContact } from './helpers.js';

const links = () => db.selectFrom('contactTags').selectAll().execute();
const activities = (type: 'TAG_ADDED' | 'TAG_REMOVED') =>
  db.selectFrom('contactActivities').selectAll().where('type', '=', type).execute();

describe('bulk tagging', () => {
  it('is idempotent: no duplicate links, one TAG_ADDED per contact, unknown ids skipped', async () => {
    const [a, b] = [await makeContact(), await makeContact()];
    const body = { contactIds: [a, b, 9999], name: 'VIP' };

    const first = await api().post('/api/contacts/bulk/tags').send(body);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ tag: { name: 'VIP' }, added: 2, skipped: 1 });

    const second = await api().post('/api/contacts/bulk/tags').send({ ...body, name: ' vip ' });
    expect(second.body).toMatchObject({ tag: first.body.tag, added: 0, skipped: 3 });

    expect(await links()).toHaveLength(2);
    expect(await activities('TAG_ADDED')).toHaveLength(2);
    expect(await db.selectFrom('tags').selectAll().execute()).toHaveLength(1);
  });

  it('does not bump contact version', async () => {
    const id = await makeContact();
    await api().post('/api/contacts/bulk/tags').send({ contactIds: [id], name: 'Lead' });
    expect((await api().get(`/api/contacts/${id}`)).body.version).toBe(1);
  });

  it('validates body', async () => {
    const post = (b: unknown) => api().post('/api/contacts/bulk/tags').send(b as object);
    expect((await post({ contactIds: [], name: 'x' })).status).toBe(400);
    expect((await post({ contactIds: [1, 1], name: 'x' })).status).toBe(400);
    expect((await post({ contactIds: [1], name: '' })).body.error.details.fields.name).toBeTruthy();
    expect((await post({ contactIds: Array.from({ length: 1001 }, (_, i) => i + 1), name: 'x' })).status).toBe(400);
  });
});

describe('single tag add/remove', () => {
  it('201 then 200 when already assigned; activity only once; appears on contact', async () => {
    const id = await makeContact();
    const first = await api().post(`/api/contacts/${id}/tags`).send({ name: 'Partner' });
    expect(first.status).toBe(201);
    const again = await api().post(`/api/contacts/${id}/tags`).send({ name: 'PARTNER' });
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);

    expect(await activities('TAG_ADDED')).toHaveLength(1);
    expect((await api().get(`/api/contacts/${id}`)).body.tags).toEqual([first.body]);
    const acts = await api().get(`/api/contacts/${id}/activities`);
    expect(acts.body.data[0]).toMatchObject({ type: 'TAG_ADDED', data: { tag: 'Partner' } });
  });

  it('delete is idempotent; TAG_REMOVED only when a row was removed', async () => {
    const id = await makeContact();
    const tag = (await api().post(`/api/contacts/${id}/tags`).send({ name: 'Lead' })).body;
    expect((await api().delete(`/api/contacts/${id}/tags/${tag.id}`)).status).toBe(204);
    expect((await api().delete(`/api/contacts/${id}/tags/${tag.id}`)).status).toBe(204);
    expect(await activities('TAG_REMOVED')).toHaveLength(1);
    expect(await links()).toHaveLength(0);
  });

  it('404 for missing contact / tag', async () => {
    const id = await makeContact();
    expect((await api().post('/api/contacts/999/tags').send({ name: 'x' })).status).toBe(404);
    expect((await api().delete(`/api/contacts/${id}/tags/999`)).status).toBe(404);
    expect((await api().delete('/api/contacts/999/tags/1')).status).toBe(404);
    expect((await api().post(`/api/contacts/${id}/tags`).send({ name: ' ' })).status).toBe(400);
  });
});

describe('/tags and /companies', () => {
  it('lists tags sorted by name and companies by prefix', async () => {
    await makeContact({ company: 'Acme' });
    await makeContact({ company: 'Acme' });
    await makeContact({ company: 'Apex' });
    await makeContact({ company: 'Globex' });
    const id = await makeContact();
    for (const name of ['b', 'A']) await api().post(`/api/contacts/${id}/tags`).send({ name });

    expect((await api().get('/api/tags')).body.data.map((t: { name: string }) => t.name)).toEqual(['A', 'b']);
    expect((await api().get('/api/companies?q=a')).body.data).toEqual(['Acme', 'Apex']);
    expect((await api().get('/api/companies')).body.data).toEqual(['Acme', 'Apex', 'Globex']);
  });
});
