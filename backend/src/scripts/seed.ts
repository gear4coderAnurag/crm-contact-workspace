import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

const file = fileURLToPath(new URL('../../seed/seed.sql', import.meta.url));

try {
  const t = Date.now();
  await pool.query(readFileSync(file, 'utf8'));
  const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM contacts');
  console.log(`seeded ${rows[0]?.n} contacts in ${Date.now() - t}ms`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
