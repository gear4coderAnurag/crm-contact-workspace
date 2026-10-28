import { db } from '../db.js';
import { notFound } from '../errors.js';
import * as contactsRepo from '../contacts/repo.js';
import * as repo from './repo.js';

export const listTags = async () => ({ data: await repo.listTags(db) });

export const listCompanies = async (q: string) => ({ data: await repo.companiesByPrefix(db, q, 20) });

export function addTag(contactId: number, name: string) {
  return db.transaction().execute(async (trx) => {
    if (!(await contactsRepo.findById(trx, contactId))) throw notFound('Contact');
    const tag = await repo.upsertTag(trx, name);
    const added = await repo.addTagToContacts(trx, [contactId], tag);
    return { tag, created: added === 1 };
  });
}

export function removeTag(contactId: number, tagId: number) {
  return db.transaction().execute(async (trx) => {
    if (!(await contactsRepo.findById(trx, contactId))) throw notFound('Contact');
    const tag = await repo.findTag(trx, tagId);
    if (!tag) throw notFound('Tag');
    await repo.removeTagFromContact(trx, contactId, tag);
  });
}

export function bulkAddTag(contactIds: number[], name: string) {
  return db.transaction().execute(async (trx) => {
    const tag = await repo.upsertTag(trx, name);
    const added = await repo.addTagToContacts(trx, contactIds, tag);
    return { tag, added, skipped: contactIds.length - added };
  });
}
