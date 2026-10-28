import { afterAll, beforeAll, beforeEach } from 'vitest';
import { pool } from '../src/db.js';
import { migrate } from '../src/scripts/migrate.js';

beforeAll(async () => {
  await migrate();
});

beforeEach(async () => {
  await pool.query('TRUNCATE contacts, tags RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});
