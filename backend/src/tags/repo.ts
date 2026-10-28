import { sql } from 'kysely';
import type { Executor, TagRow } from '../contacts/repo.js';

export function listTags(db: Executor): Promise<TagRow[]> {
  return db.selectFrom('tags').select(['id', 'name']).orderBy('name').orderBy('id').execute();
}

export function findTag(db: Executor, id: number): Promise<TagRow | undefined> {
  return db.selectFrom('tags').select(['id', 'name']).where('id', '=', id).executeTakeFirst();
}

// Case-insensitive upsert; the no-op DO UPDATE makes RETURNING yield the existing row.
export async function upsertTag(db: Executor, name: string): Promise<TagRow> {
  const { rows } = await sql<TagRow>`
    INSERT INTO tags (name) VALUES (${name})
    ON CONFLICT ((lower(name))) DO UPDATE SET name = tags.name
    RETURNING id, name`.execute(db);
  return rows[0]!;
}

// One statement: tag the contacts that exist and aren't tagged yet, and log TAG_ADDED for exactly those.
export async function addTagToContacts(db: Executor, contactIds: number[], tag: TagRow): Promise<number> {
  const { rows } = await sql<{ added: number }>`
    WITH added AS (
      INSERT INTO contact_tags (contact_id, tag_id)
      SELECT id, ${tag.id}::bigint FROM contacts WHERE id = ANY(${contactIds}::bigint[])
      ON CONFLICT DO NOTHING
      RETURNING contact_id
    ), logged AS (
      INSERT INTO contact_activities (contact_id, type, data)
      SELECT contact_id, 'TAG_ADDED', jsonb_build_object('tag', ${tag.name}::text) FROM added
    )
    SELECT count(*)::int AS added FROM added`.execute(db);
  return rows[0]!.added;
}

// Deletes the link and logs TAG_REMOVED only if a row was actually removed.
export async function removeTagFromContact(db: Executor, contactId: number, tag: TagRow): Promise<void> {
  await sql`
    WITH removed AS (
      DELETE FROM contact_tags WHERE contact_id = ${contactId}::bigint AND tag_id = ${tag.id}::bigint
      RETURNING contact_id
    )
    INSERT INTO contact_activities (contact_id, type, data)
    SELECT contact_id, 'TAG_REMOVED', jsonb_build_object('tag', ${tag.name}::text) FROM removed`.execute(db);
}

export async function companiesByPrefix(db: Executor, prefix: string, limit: number): Promise<string[]> {
  const like = `${prefix.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await db
    .selectFrom('contacts')
    .select('company')
    .distinct()
    .where(sql<boolean>`company ILIKE ${like}`)
    .orderBy('company')
    .limit(limit)
    .execute();
  return rows.flatMap((r) => (r.company === null ? [] : [r.company]));
}
