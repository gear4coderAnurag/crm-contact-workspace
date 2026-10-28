import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { api, makeContact } from './helpers.js';

type Row = { id: number; firstName: string; lastName: string };

async function walk(query: string): Promise<Row[]> {
  const all: Row[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const res: { status: number; body: { data: Row[]; nextCursor: string | null } } = await api().get(
      `/api/contacts?limit=3&${query}${cursor ? `&cursor=${cursor}` : ''}`,
    );
    expect(res.status).toBe(200);
    all.push(...res.body.data);
    cursor = res.body.nextCursor;
    if (!cursor) return all;
  }
  throw new Error('pagination did not terminate');
}

describe('GET /api/contacts keyset pagination', () => {
  it('visits every id exactly once in correct order, both sorts and orders', async () => {
    // identical created_at + identical names + microsecond-distinct timestamps
    const ids: number[] = [];
    for (let i = 0; i < 10; i++) {
      ids.push(await makeContact({ firstName: i % 2 ? 'Sam' : 'Sue', lastName: 'Same', createdAt: '2024-05-01T10:00:00Z' }));
    }
    for (let i = 0; i < 4; i++) {
      await db
        .insertInto('contacts')
        .values({ firstName: 'Micro', lastName: `M${i}`, createdAt: new Date('2024-06-01T10:00:00Z') })
        .execute();
    }
    // distinct microsecond offsets that a JS Date would truncate
    await sql`UPDATE contacts SET created_at = created_at + (id * interval '1 microsecond') WHERE first_name = 'Micro'`.execute(db);
    const total = 14;

    for (const [sort, order] of [['created_at', 'desc'], ['created_at', 'asc'], ['name', 'asc'], ['name', 'desc']] as const) {
      const rows = await walk(`sort=${sort}&order=${order}`);
      expect(rows.map((r) => r.id).sort((a, b) => a - b), `${sort} ${order}`).toEqual(
        (await db.selectFrom('contacts').select('id').orderBy('id').execute()).map((r) => r.id),
      );
      expect(rows).toHaveLength(total);
      // order matches a single unpaginated query
      const expected = await api().get(`/api/contacts?limit=100&sort=${sort}&order=${order}`);
      expect(rows.map((r) => r.id)).toEqual(expected.body.data.map((r: Row) => r.id));
    }
  });

  it('defaults: created_at desc / name asc; last page has null cursor', async () => {
    const a = await makeContact({ firstName: 'Zed', createdAt: '2024-01-01T00:00:00Z' });
    const b = await makeContact({ firstName: 'Amy', createdAt: '2024-02-01T00:00:00Z' });
    expect((await api().get('/api/contacts')).body).toEqual({ data: expect.any(Array), nextCursor: null });
    expect((await api().get('/api/contacts')).body.data.map((r: Row) => r.id)).toEqual([b, a]);
    expect((await api().get('/api/contacts?sort=name')).body.data.map((r: Row) => r.id)).toEqual([b, a]);
  });
});

describe('GET /api/contacts search + filters', () => {
  it('q matches name, email and phone (substring, case-insensitive)', async () => {
    const n = await makeContact({ firstName: 'Rahul', lastName: 'Sharma' });
    const e = await makeContact({ firstName: 'Zed', email: 'rahulx@example.com' });
    const p = await makeContact({ firstName: 'Yan', phone: '+919876543210' });
    await makeContact({ firstName: 'Other' });
    const ids = async (q: string) => (await api().get(`/api/contacts?q=${encodeURIComponent(q)}&sort=name`)).body.data.map((r: Row) => r.id).sort();

    expect(await ids('RAHUL')).toEqual([n, e].sort());
    expect(await ids('sharma')).toEqual([n]);
    expect(await ids('98765')).toEqual([p]);
    expect(await ids('+9198')).toEqual([p]);
    expect(await ids('%_')).toEqual([]); // LIKE wildcards are escaped
  });

  it('company + tag filters combine', async () => {
    const a = await makeContact({ company: 'Acme' });
    const b = await makeContact({ company: 'Acme' });
    const c = await makeContact({ company: 'Globex' });
    const tag = await db.insertInto('tags').values({ name: 'VIP' }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('contactTags').values([{ contactId: a, tagId: tag.id }, { contactId: c, tagId: tag.id }]).execute();

    const get = async (qs: string) => (await api().get(`/api/contacts?${qs}`)).body.data;
    expect((await get('company=Acme')).map((r: Row) => r.id).sort()).toEqual([a, b].sort());
    expect((await get(`tagId=${tag.id}`)).map((r: Row) => r.id).sort()).toEqual([a, c].sort());
    const both = await get(`company=Acme&tagId=${tag.id}`);
    expect(both.map((r: Row) => r.id)).toEqual([a]);
    expect(both[0].tags).toEqual([{ id: tag.id, name: 'VIP' }]);
  });
});

describe('GET /api/contacts validation', () => {
  it.each([
    ['q=a', 'q'],
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['limit=abc', 'limit'],
    ['sort=email', 'sort'],
    ['tagId=x', 'tagId'],
    ['cursor=garbage', 'cursor'],
  ])('%s -> 400 on %s', async (qs, field) => {
    const res = await api().get(`/api/contacts?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields[field]).toBeTruthy();
  });

  it('cursor from another sort is rejected', async () => {
    for (let i = 0; i < 3; i++) await makeContact({ firstName: `N${i}` });
    const first = await api().get('/api/contacts?limit=1&sort=name');
    const res = await api().get(`/api/contacts?limit=1&sort=created_at&cursor=${first.body.nextCursor}`);
    expect(res.status).toBe(400);
  });
});
