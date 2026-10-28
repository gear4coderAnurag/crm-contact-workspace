import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db.js';

export const api = () => request(createApp());

type NewContact = {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  createdAt?: string;
};

export async function makeContact(c: NewContact = {}): Promise<number> {
  const row = await db
    .insertInto('contacts')
    .values({
      firstName: c.firstName ?? 'Ada',
      lastName: c.lastName ?? 'Lovelace',
      email: c.email ?? null,
      phone: c.phone ?? null,
      company: c.company ?? null,
      ...(c.createdAt ? { createdAt: new Date(c.createdAt) } : {}),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}
