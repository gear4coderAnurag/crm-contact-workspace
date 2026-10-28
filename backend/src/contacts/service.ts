import { db } from '../db.js';
import { AppError, notFound } from '../errors.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import type { z } from 'zod';
import type { listQuery, PatchBody } from './schemas.js';
import * as repo from './repo.js';

export type Tag = repo.TagRow;
export type Contact = repo.ContactRow & { tags: Tag[] };

const withTags = (rows: repo.ContactRow[], tags: Map<number, Tag[]>): Contact[] =>
  rows.map((r) => ({ ...r, tags: tags.get(r.id) ?? [] }));

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

export async function list(query: z.infer<typeof listQuery>) {
  const { sort, limit } = query;
  const order = query.order ?? (sort === 'name' ? 'asc' : 'desc');
  const after = query.cursor ? decodeCursor(query.cursor, sort, order) : undefined;

  let like: string | undefined;
  let phoneLike: string | undefined;
  if (query.q) {
    like = `%${escapeLike(query.q.toLowerCase())}%`;
    const digits = query.q.replace(/\D/g, '');
    if (digits.length >= 2) phoneLike = `%${digits}%`;
  }

  const rows = await repo.list(db, { like, phoneLike, company: query.company, tagId: query.tagId, sort, order, after, limit: limit + 1 });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ s: sort, o: order, v: last.sortValue, id: last.id }) : null;
  const tags = await repo.tagsByContact(db, page.map((r) => r.id));
  // sortValue is cursor plumbing, not part of the Contact shape
  return { data: withTags(page.map(({ sortValue: _s, ...c }) => c), tags), nextCursor };
}

export async function get(id: number, exec: repo.Executor = db): Promise<Contact> {
  const row = await repo.findById(exec, id);
  if (!row) throw notFound('Contact');
  const tags = await repo.tagsByContact(exec, [id]);
  return withTags([row], tags)[0]!;
}

export async function listActivities(id: number, limit: number) {
  if (!(await repo.findById(db, id))) throw notFound('Contact');
  return { data: await repo.listActivities(db, id, limit) };
}

const FIELDS = ['firstName', 'lastName', 'email', 'phone', 'company'] as const;

export function update(id: number, body: PatchBody): Promise<Contact> {
  return db.transaction().execute(async (trx) => {
    const row = await repo.findById(trx, id, true);
    if (!row) throw notFound('Contact');
    if (row.version !== body.version) {
      throw new AppError('VERSION_CONFLICT', 409, 'Contact was modified by someone else', {
        current: await get(id, trx),
      });
    }

    const changes: repo.ContactChanges = {};
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of FIELDS) {
      const to = body[f];
      if (to !== undefined && to !== row[f]) {
        Object.assign(changes, { [f]: to });
        changed[f] = { from: row[f], to };
      }
    }
    if (Object.keys(changes).length === 0) return get(id, trx);

    await repo.update(trx, id, changes);
    await repo.insertActivity(trx, id, 'CONTACT_UPDATED', { changed });
    return get(id, trx);
  });
}
