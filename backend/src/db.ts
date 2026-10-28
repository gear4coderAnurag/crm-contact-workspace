import pg from 'pg';
import { CamelCasePlugin, Generated, Kysely, PostgresDialect } from 'kysely';
import { config } from './config.js';

export interface DB {
  contacts: {
    id: Generated<number>;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    fullName: Generated<string>;
    version: Generated<number>;
    createdAt: Generated<Date>;
    updatedAt: Generated<Date>;
  };
  tags: { id: Generated<number>; name: string };
  contactTags: { contactId: number; tagId: number };
  contactActivities: {
    id: Generated<number>;
    contactId: number;
    type: 'CONTACT_UPDATED' | 'TAG_ADDED' | 'TAG_REMOVED';
    data: unknown;
    createdAt: Generated<Date>;
  };
}

// bigint ids come back as strings by default; ids stay well below 2^53
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool }),
  plugins: [new CamelCasePlugin()],
});
