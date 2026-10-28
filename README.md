# CRM Contact Workspace

Contact list + detail app built to stay correct at millions of contacts: server-side search / filter / sort, keyset pagination, optimistic locking, idempotent bulk tagging. Spec: [ARCHITECTURE.md](ARCHITECTURE.md).

## How to run

Requires Node 20+ and either Docker or a local Postgres 16+.

### A. docker-compose (recommended)

```bash
npm install
npm run db:up        # docker compose up -d --wait  (Postgres 16, DBs: crm + crm_test)
npm run migrate
npm run seed         # ~200k contacts (10–60 s depending on the machine; mostly GIN index maintenance)
npm run dev          # API on :4000, UI on http://localhost:5173
npm test             # runs against crm_test
```

If port 5432 is already taken on your machine, pick another host port and point the app at it:

```bash
PG_PORT=5433 npm run db:up
export DATABASE_URL=postgres://crm:crm@localhost:5433/crm   # used by migrate / seed / dev / test
```

### B. Local Postgres (no Docker)

```bash
psql -c "CREATE USER crm WITH PASSWORD 'crm' CREATEDB" postgres
createdb -O crm crm && createdb -O crm crm_test
psql crm -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"      # needs a superuser if crm isn't one
psql crm_test -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"
npm install && npm run migrate && npm run seed && npm run dev
```

Config is env-only (`backend/.env.example`): `DATABASE_URL` (default `postgres://crm:crm@localhost:5432/crm`), `PORT` (4000). In tests the DB name is swapped to `crm_test` automatically (override with `TEST_DATABASE_URL`).

## Tech stack

React 18 + TS + Vite, TanStack Query v5, React Router v6, plain CSS · Node 20 + Express 5 + TS · `pg` + Kysely (no ORM) · Zod · PostgreSQL 16 + `pg_trgm` · Vitest + Supertest against a real Postgres · npm workspaces.

## Key technical decisions

| Decision | Why |
|---|---|
| Keyset pagination, no OFFSET, no total count | O(page) at any depth; `COUNT(*)` on millions of rows is slow. UI is Prev/Next only. |
| Cursor = base64url `{s, o, v, id}`, `created_at` kept as **text** | JS `Date` truncates microseconds, which silently skips/duplicates rows at page boundaries. `(created_at, id)` tuple compare gives a total order even with identical timestamps. Cursors are rejected if they don't match the query's sort/order. |
| Search in SQL with trigram GIN indexes | `ILIKE '%q%'` on name/email and `LIKE` on phone digits are index-assisted (BitmapOr). `q` needs ≥ 2 chars. LIKE wildcards in user input are escaped. |
| Optimistic locking via `version` | Detects lost updates without holding locks across requests. |
| Bulk tag = one CTE statement | Insert links `ON CONFLICT DO NOTHING` + log `TAG_ADDED` for exactly the rows inserted, atomically. Re-running is a no-op. |
| Tag add/remove doesn't bump `version` | They're commutative set operations; they can't overwrite someone else's edit. |
| Uniform error shape | Every non-2xx is `{error:{code,message,details}}`; the PG unique violation on `contacts_email_key` maps to `EMAIL_TAKEN`. |
| Layering | routes (parse → service → respond) · services (transactions, rules) · repos (SQL only). |

## Data model

`contacts` (unique nullable lowercase `email`, generated `full_name`, `version`), `tags` (unique on `lower(name)`), `contact_tags` (composite PK), `contact_activities` (`CONTACT_UPDATED | TAG_ADDED | TAG_REMOVED`, jsonb `data`). Full DDL and indexes: `backend/migrations/001_init.sql`; diagram in ARCHITECTURE.md §3.

## Concurrency approach

`PATCH /contacts/:id` runs in one transaction: `SELECT … FOR UPDATE` → compare `version` → 409 `VERSION_CONFLICT` (with the current contact incl. tags) if stale → diff → `UPDATE … version = version + 1` → activity row. An empty diff returns the current row with no version bump and no activity. The row lock serialises concurrent writers, so exactly one of N simultaneous PATCHes with the same version wins (covered by a test). The UI shows a conflict banner, keeps the user's edits visible, and offers **Reload latest**. Email races are settled by the DB unique constraint, not by a pre-check.

## Tests

`npm test` — 29 tests against the real `crm_test` DB (truncated between tests): stale update + concurrent writers, email uniqueness (case-insensitive, multiple NULLs), bulk-tag idempotency, keyset completeness over both sorts/orders with identical timestamps and sub-millisecond differences, search/filters, validation, activity diffs, cursor encoding.

Measured on the 200k seed (`EXPLAIN ANALYZE`): search + tag filter + keyset page ≈ 15 ms (BitmapOr over name/email trigram indexes); plain keyset page ≈ 0.07 ms (index-only scan); 3-way search ordered by `created_at` ≈ 0.16 ms.

## Decisions (where the spec was open)

- `compose` host port is `${PG_PORT:-5432}` so it can coexist with a Postgres already on 5432.
- `DELETE /contacts/:id/tags/:tagId` returns 404 for an unknown contact or tag, 204 otherwise (idempotent when the link is already gone).
- `/companies` is a case-insensitive prefix `ILIKE` over `DISTINCT company` (≈35 ms on 200k, seq scan); the company filter itself is an exact match and commits on pick / Enter / blur.
- Unknown JSON-body properties on PATCH are rejected (400) rather than ignored.
- Malformed JSON bodies and unknown routes use the same error shape (`VALIDATION_ERROR` / `NOT_FOUND`).
- `npm run build` only type-checks the backend (it runs via `tsx`); the frontend does a real Vite build.

## Known issues / incomplete

- No browser-level (e2e) tests; UI states were built to the §6 table and type-checked, backend behaviour is covered by tests.
- Seed takes 10–60 s rather than "a few seconds" because of GIN index maintenance on 200k inserts.
- `/companies` seq-scans; fine at 200k, needs a `companies` table or cache at scale.
- "Prev" after a hard reload on a deep page goes back to the first page (the cursor stack is in memory; the current cursor is in the URL).
- No auth, no contact create/delete (not in the spec).

## Scale considerations

- **Multi-tenant:** `account_id` on every table, leading column of every index, all queries scoped by it.
- **Search:** move to OpenSearch/Elasticsearch fed by an outbox/CDC stream once trigram on Postgres isn't enough.
- **Writes (millions/day):** partition `contact_activities` by month + retention; batch activity inserts.
- **Reads:** read replicas for list/search; short-TTL cache for `/tags`, `/companies`.
- **Bulk ops:** for "tag all 2M matching contacts" use an async job (queue + worker) with progress, not a request.
- **Indexes:** add composite indexes for hot filter+sort combos, e.g. `(company, created_at, id)`.
- **Counts:** approximate counts (`pg_class.reltuples`) or a separate async count endpoint.

## AI Usage

- TODO: tools used
- TODO: what was generated vs. written by hand
- TODO: how the output was verified
- TODO: what was changed or rejected
