import { sql, type Kysely, type Transaction } from 'kysely';
import type { DB } from '../db.js';

export type Executor = Kysely<DB> | Transaction<DB>;
export type ContactRow = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
export type TagRow = { id: number; name: string };
export type ActivityRow = {
  id: number;
  contactId: number;
  type: 'CONTACT_UPDATED' | 'TAG_ADDED' | 'TAG_REMOVED';
  data: unknown;
  createdAt: Date;
};
export type ListParams = {
  like?: string;
  phoneLike?: string;
  company?: string;
  tagId?: number;
  sort: 'created_at' | 'name';
  order: 'asc' | 'desc';
  after?: { v: string; id: number };
  limit: number;
};
export type ListRow = ContactRow & { sortValue: string };

const cols = ['id', 'firstName', 'lastName', 'email', 'phone', 'company', 'version', 'createdAt', 'updatedAt'] as const;

export function list(db: Executor, p: ListParams): Promise<ListRow[]> {
  const byName = p.sort === 'name';
  // created_at as text keeps microsecond precision for the keyset cursor
  const sortExpr = byName ? sql`c.full_name` : sql`c.created_at`;
  const sortValue = byName ? sql<string>`c.full_name` : sql<string>`c.created_at::text`;
  let q = db
    .selectFrom('contacts as c')
    .select(cols.map((k) => `c.${k}` as const))
    .select(sortValue.as('sortValue'));

  if (p.like !== undefined) {
    const like = p.like;
    const phoneLike = p.phoneLike;
    q = q.where((eb) =>
      eb.or([
        sql<boolean>`c.full_name ILIKE ${like}`,
        sql<boolean>`c.email ILIKE ${like}`,
        ...(phoneLike ? [sql<boolean>`c.phone LIKE ${phoneLike}`] : []),
      ]),
    );
  }
  if (p.company !== undefined) q = q.where('c.company', '=', p.company);
  if (p.tagId !== undefined) {
    const tagId = p.tagId;
    q = q.where((eb) =>
      eb.exists(
        eb
          .selectFrom('contactTags as ct')
          .select(sql.lit(1).as('one'))
          .whereRef('ct.contactId', '=', 'c.id')
          .where('ct.tagId', '=', tagId),
      ),
    );
  }
  if (p.after) {
    const cast = byName ? sql`${p.after.v}::text` : sql`${p.after.v}::timestamptz`;
    q = q.where(
      p.order === 'asc'
        ? sql<boolean>`(${sortExpr}, c.id) > (${cast}, ${p.after.id}::bigint)`
        : sql<boolean>`(${sortExpr}, c.id) < (${cast}, ${p.after.id}::bigint)`,
    );
  }
  return q
    .orderBy(sortExpr, p.order)
    .orderBy('c.id', p.order)
    .limit(p.limit)
    .execute() as Promise<ListRow[]>;
}

export async function tagsByContact(db: Executor, contactIds: number[]): Promise<Map<number, TagRow[]>> {
  const map = new Map<number, TagRow[]>();
  if (contactIds.length === 0) return map;
  const rows = await db
    .selectFrom('contactTags as ct')
    .innerJoin('tags as t', 't.id', 'ct.tagId')
    .select(['ct.contactId', 't.id', 't.name'])
    .where('ct.contactId', 'in', contactIds)
    .orderBy('t.name')
    .execute();
  for (const r of rows) {
    const arr = map.get(r.contactId) ?? [];
    arr.push({ id: r.id, name: r.name });
    map.set(r.contactId, arr);
  }
  return map;
}

export function findById(db: Executor, id: number, forUpdate = false): Promise<ContactRow | undefined> {
  let q = db
    .selectFrom('contacts')
    .select([...cols])
    .where('id', '=', id);
  if (forUpdate) q = q.forUpdate();
  return q.executeTakeFirst();
}

export type ContactChanges = Partial<Pick<ContactRow, 'firstName' | 'lastName' | 'email' | 'phone' | 'company'>>;

export function update(db: Executor, id: number, changes: ContactChanges): Promise<ContactRow> {
  return db
    .updateTable('contacts')
    .set({ ...changes, version: sql`version + 1`, updatedAt: sql`now()` })
    .where('id', '=', id)
    .returning([...cols])
    .executeTakeFirstOrThrow();
}

export async function insertActivity(
  db: Executor,
  contactId: number,
  type: ActivityRow['type'],
  data: unknown,
): Promise<void> {
  await db
    .insertInto('contactActivities')
    .values({ contactId, type, data: JSON.stringify(data) })
    .execute();
}

export function listActivities(db: Executor, contactId: number, limit: number): Promise<ActivityRow[]> {
  return db
    .selectFrom('contactActivities')
    .select(['id', 'contactId', 'type', 'data', 'createdAt'])
    .where('contactId', '=', contactId)
    .orderBy('createdAt', 'desc')
    .orderBy('id', 'desc')
    .limit(limit)
    .execute();
}
