# CRM Contact Workspace — Architecture & Build Spec

> This is the single source of truth for building the project end to end.
> Goal: **minimal, clean, and correct at the scale of millions of contacts.**
> If anything here conflicts with a "nicer" idea, follow this doc. Keep the code small.

---

## 0. Tech stack (fixed)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Fast dev, typed |
| Data fetching | TanStack Query v5 | Loading/error/refetch states for free |
| Routing | React Router v6 | List + detail pages |
| Styling | Plain CSS (one `styles.css`) | UI polish is not graded |
| Backend | Node 20 + Express 5 + TypeScript | Express 5 forwards async errors natively |
| DB access | `pg` + **Kysely** (query builder, no ORM) | Full SQL control (trigram, keyset, CTEs) with types |
| Validation | Zod | One schema for parsing + types |
| Database | PostgreSQL 16 (+ `pg_trgm`) | Unique constraints, trigram search, transactions |
| Tests | Vitest + Supertest, against a real Postgres test DB | The risky parts are SQL behaviour, so don't mock the DB |
| Local infra | docker-compose (Postgres only) | Reviewer needs zero DB setup |
| Repo | npm workspaces: `backend`, `frontend` | One `npm install` at root |

Not used on purpose: ORM, Redis, auth, state library (Redux/Zustand), UI kit, GraphQL.

---

## 1. System architecture

```mermaid
flowchart LR
  subgraph Browser
    UI["React SPA<br/>(Vite, TS)"]
    RQ["TanStack Query<br/>cache"]
    UI <--> RQ
  end

  subgraph Node["Backend — Express 5 (port 4000)"]
    R["Routes<br/>/api/*"]
    V["Zod validation"]
    S["Services<br/>(business rules)"]
    Repo["Repositories<br/>(Kysely SQL)"]
    E["Error middleware<br/>→ uniform JSON errors"]
    R --> V --> S --> Repo
    R -.throws.-> E
    S -.throws.-> E
  end

  subgraph Docker["docker-compose"]
    PG[("PostgreSQL 16<br/>db: crm, crm_test<br/>+ pg_trgm")]
  end

  RQ -- "HTTP JSON<br/>/api (Vite proxy in dev)" --> R
  Repo -- "pg pool" --> PG
```

- Dev: Vite runs on `5173` and proxies `/api` → `http://localhost:4000`, so **no CORS config needed**.
- All search / filter / sort / pagination happen **in Postgres**, never in Node or the browser.

---

## 2. Backend layering

```mermaid
flowchart TB
  A["routes.ts<br/>HTTP only: parse req → call service → send res"] --> B["schemas.ts (Zod)<br/>query/body/params validation + normalization"]
  A --> C["service.ts<br/>transactions, version check, diff, activity logging"]
  C --> D["repo.ts<br/>pure SQL via Kysely, no business logic"]
  D --> F[("Postgres")]
  C --> G["errors.ts<br/>AppError(code, status, details)"]
  G --> H["errorHandler middleware<br/>AppError → JSON; ZodError → 400; PG 23505 → 409 EMAIL_TAKEN; else 500"]
```

Rules:
- Routes never contain SQL. Repos never throw HTTP errors. Services own transactions.
- Every response key is **camelCase**; DB columns are **snake_case** (Kysely `CamelCasePlugin`).

---

## 3. Data model

```mermaid
erDiagram
  contacts ||--o{ contact_tags : has
  tags ||--o{ contact_tags : "assigned via"
  contacts ||--o{ contact_activities : logs

  contacts {
    bigint id PK
    text first_name "NOT NULL"
    text last_name "NOT NULL"
    text email "UNIQUE, lowercase, nullable"
    text phone "normalized, nullable"
    text company "nullable"
    text full_name "GENERATED lower(first||' '||last)"
    int version "optimistic lock"
    timestamptz created_at
    timestamptz updated_at
  }
  tags {
    bigint id PK
    text name "unique on lower(name)"
  }
  contact_tags {
    bigint contact_id PK,FK
    bigint tag_id PK,FK
  }
  contact_activities {
    bigint id PK
    bigint contact_id FK
    text type "CONTACT_UPDATED | TAG_ADDED | TAG_REMOVED"
    jsonb data
    timestamptz created_at
  }
```

### `backend/migrations/001_init.sql`

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE contacts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name  TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 100),
  last_name   TEXT NOT NULL CHECK (length(last_name)  BETWEEN 1 AND 100),
  email       TEXT UNIQUE,  -- NULLs are distinct in PG → "unique when present"
  phone       TEXT,
  company     TEXT,
  full_name   TEXT GENERATED ALWAYS AS (lower(first_name || ' ' || last_name)) STORED,
  version     INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tags (
  id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50)
);
CREATE UNIQUE INDEX uq_tags_name_lower ON tags (lower(name));

CREATE TABLE contact_tags (
  contact_id BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id     BIGINT NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

CREATE TABLE contact_activities (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id  BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('CONTACT_UPDATED','TAG_ADDED','TAG_REMOVED')),
  data        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keyset pagination / sort
CREATE INDEX idx_contacts_created ON contacts (created_at, id);
CREATE INDEX idx_contacts_name    ON contacts (full_name, id);

-- Substring search (ILIKE '%q%')
CREATE INDEX idx_contacts_name_trgm  ON contacts USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_contacts_email_trgm ON contacts USING gin (email     gin_trgm_ops);
CREATE INDEX idx_contacts_phone_trgm ON contacts USING gin (phone     gin_trgm_ops);

-- Filters
CREATE INDEX idx_contacts_company ON contacts (company);
CREATE INDEX idx_contact_tags_tag ON contact_tags (tag_id, contact_id);

-- Activity feed
CREATE INDEX idx_activity_contact ON contact_activities (contact_id, created_at DESC, id DESC);
```

Migrations are plain `.sql` files applied in filename order by a ~30-line `src/scripts/migrate.ts`
that records applied files in a `schema_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)` table.

### Normalization rules (in Zod, before hitting the DB)
- `email`: trim → lowercase → must be a valid email, max 254. Empty string → `null`.
- `phone`: strip spaces, `-`, `(`, `)`, `.` → must match `^\+?[0-9]{7,15}$`. Empty string → `null`.
- `firstName`, `lastName`: trim, 1–100 chars. `company`: trim, max 200, empty → `null`.
- Tag `name`: trim, 1–50 chars. Tags are matched case-insensitively (`VIP` == `vip`).

---

## 4. API contract

Base path: `/api`. All bodies JSON. IDs are numbers in JSON.

| Method | Path | Body / Query | Success |
|---|---|---|---|
| GET | `/health` | – | `200 {ok:true}` |
| GET | `/contacts` | query below | `200 {data: Contact[], nextCursor: string\|null}` |
| GET | `/contacts/:id` | – | `200 Contact` |
| PATCH | `/contacts/:id` | `{version, firstName?, lastName?, email?, phone?, company?}` | `200 Contact` |
| GET | `/contacts/:id/activities` | `?limit=20` (max 100) | `200 {data: Activity[]}` |
| POST | `/contacts/:id/tags` | `{name}` | `201 Tag` (or `200` if already assigned, no activity) |
| DELETE | `/contacts/:id/tags/:tagId` | – | `204` (idempotent; activity only if it actually removed) |
| POST | `/contacts/bulk/tags` | `{contactIds: number[] (1..1000, unique), name}` | `200 {tag, added, skipped}` |
| GET | `/tags` | – | `200 {data: Tag[]}` (sorted by name) |
| GET | `/companies` | `?q=` (prefix, max 20) | `200 {data: string[]}` — for the company filter input |

### `GET /contacts` query params

| Param | Type | Notes |
|---|---|---|
| `q` | string, 2–100 chars | Matches name OR email OR phone (substring, case-insensitive) |
| `company` | string | Exact match |
| `tagId` | number | Contacts having this tag |
| `sort` | `created_at` \| `name` | default `created_at` |
| `order` | `asc` \| `desc` | default `desc` for created_at, `asc` for name |
| `limit` | 1–100 | default 20 |
| `cursor` | opaque string | from previous `nextCursor` |

**No total count** (COUNT(*) on millions of rows is slow). UI shows Prev / Next only.

### Types

```ts
type Tag = { id: number; name: string };
type Contact = {
  id: number; firstName: string; lastName: string;
  email: string | null; phone: string | null; company: string | null;
  tags: Tag[]; version: number; createdAt: string; updatedAt: string;
};
type Activity = {
  id: number; contactId: number;
  type: 'CONTACT_UPDATED' | 'TAG_ADDED' | 'TAG_REMOVED';
  data: { changed?: Record<string, { from: unknown; to: unknown }>; tag?: string };
  createdAt: string;
};
```

### Error shape (every non-2xx)

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "Contact was modified by someone else", "details": {} } }
```

| code | status | when | details |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod fails, bad cursor, empty PATCH | `{ fields: { email: "Invalid email" } }` |
| `NOT_FOUND` | 404 | contact/tag missing | – |
| `VERSION_CONFLICT` | 409 | stale `version` on PATCH | `{ current: Contact }` |
| `EMAIL_TAKEN` | 409 | PG unique violation `23505` on email | `{ fields: { email: "Already used by another contact" } }` |
| `INTERNAL` | 500 | anything else (log it, don't leak stack) | – |

---

## 5. Key flows

### 5.1 List with keyset pagination

```mermaid
sequenceDiagram
  participant UI as React (ContactList)
  participant API as Express
  participant DB as Postgres
  UI->>API: GET /api/contacts?q=ra&tagId=2&sort=name&limit=20&cursor=abc
  API->>API: Zod parse, decode cursor → {v:"rahul s", id:812}
  API->>DB: SELECT ... WHERE filters AND (full_name,id) > ($v,$id)<br/>ORDER BY full_name, id LIMIT 21
  DB-->>API: up to 21 rows
  API->>DB: SELECT contact_id, tag FROM contact_tags JOIN tags<br/>WHERE contact_id = ANY($pageIds)
  DB-->>API: tags for this page (1 query, no N+1)
  API-->>UI: {data: 20 rows, nextCursor: encode(last row) if 21st existed}
  Note over UI: Prev = UI keeps a stack of previous cursors
```

SQL shape (built with Kysely, conditions added only when present):

```sql
SELECT c.* FROM contacts c
WHERE  (c.full_name ILIKE $like OR c.email ILIKE $like OR c.phone LIKE $phoneLike)  -- if q
  AND  c.company = $company                                                     -- if company
  AND  EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = $tagId) -- if tagId
  AND  (c.created_at, c.id) < ($cv, $cid)                                       -- if cursor; '>' for asc
ORDER BY c.created_at DESC, c.id DESC
LIMIT $limit + 1;
```

- `$like` = `%` + escaped(lowercased q) + `%` (escape `\`, `%`, `_`).
- `$phoneLike`: digits of q only; skip the phone condition if q has < 2 digits.
- Cursor = base64url(JSON `{ s: sort, o: order, v: sortValue, id }`). Reject (400) if `s`/`o` don't match current query.
- `created_at` cursor value must keep full microsecond precision → select it as text (`c.created_at::text`) for the cursor, not a JS `Date` (JS Dates lose microseconds and break keyset).

### 5.2 Update with optimistic locking

```mermaid
sequenceDiagram
  participant A as User A
  participant B as User B
  participant API as Express
  participant DB as Postgres
  A->>API: GET /contacts/7  → version 3
  B->>API: GET /contacts/7  → version 3
  B->>API: PATCH /contacts/7 {version:3, phone:"..."}
  API->>DB: BEGIN, SELECT ... WHERE id=7 FOR UPDATE
  API->>DB: version matches → UPDATE ..., version=4, updated_at=now()
  API->>DB: INSERT activity CONTACT_UPDATED {changed:{phone:{from,to}}}, COMMIT
  API-->>B: 200 (version 4)
  A->>API: PATCH /contacts/7 {version:3, company:"..."}
  API->>DB: BEGIN, SELECT ... FOR UPDATE → version is 4 ≠ 3, ROLLBACK
  API-->>A: 409 VERSION_CONFLICT {current: contact v4}
  Note over A: UI shows conflict banner: "Updated by someone else"<br/>[Reload latest] (keeps A's unsaved edits visible for copy)
```

Service steps (one transaction):
1. `SELECT ... FOR UPDATE` → missing → 404.
2. `row.version !== body.version` → 409 with `current` (include tags).
3. Compute diff of provided fields vs row. **Empty diff → return current row, no version bump, no activity.**
4. `UPDATE contacts SET <changed>, version = version + 1, updated_at = now() WHERE id = $id RETURNING *`.
5. `INSERT INTO contact_activities (contact_id, type, data) VALUES ($id, 'CONTACT_UPDATED', {changed})`.
6. Commit. PG `23505` on `contacts_email_key` → 409 `EMAIL_TAKEN`.

### 5.3 Tags & bulk tagging

```mermaid
sequenceDiagram
  participant UI as React (BulkTagBar)
  participant API as Express
  participant DB as Postgres
  UI->>API: POST /contacts/bulk/tags {contactIds:[1,2,3], name:"VIP"}
  API->>DB: BEGIN
  API->>DB: upsert tag by lower(name) → tag_id
  API->>DB: WITH added AS (INSERT INTO contact_tags SELECT id,$tag FROM contacts<br/>WHERE id = ANY($ids) ON CONFLICT DO NOTHING RETURNING contact_id)<br/>INSERT INTO contact_activities SELECT contact_id,'TAG_ADDED',{tag} FROM added
  API->>DB: COMMIT
  API-->>UI: {tag, added: 2, skipped: 1}
  UI->>UI: invalidate ['contacts'] queries, clear selection
```

Tag upsert (case-insensitive):
```sql
INSERT INTO tags (name) VALUES ($name)
ON CONFLICT ((lower(name))) DO UPDATE SET name = tags.name
RETURNING id, name;
```

Decisions:
- Tag add/remove does **not** bump `version` — they're commutative set operations and can't overwrite another user's edit.
- Unknown contact IDs in bulk are silently skipped (counted in `skipped`).
- Single-contact add/remove use the same pattern and log `TAG_ADDED` / `TAG_REMOVED` only when a row actually changed.

---

## 6. Frontend architecture

```mermaid
flowchart TB
  App["App.tsx<br/>QueryClientProvider + Router"] --> L["/ → ContactListPage"]
  App --> D["/contacts/:id → ContactDetailPage"]

  L --> T["Toolbar: SearchInput (debounced 300ms),<br/>CompanyFilter, TagFilter, SortSelect"]
  L --> BT["BulkTagBar (visible when ≥1 selected)"]
  L --> TB["ContactTable (checkbox per row, tag chips)"]
  L --> P["Pager (Prev / Next, cursor stack)"]

  D --> F["ContactForm (edit, field errors, conflict banner)"]
  D --> TG["TagEditor (chips + add input)"]
  D --> AL["ActivityList"]

  subgraph data["src/api"]
    C["client.ts — fetch wrapper → throws ApiError{code,status,details}"]
    H["hooks.ts — useContacts, useContact, useUpdateContact,<br/>useAddTag, useRemoveTag, useBulkTag, useActivities, useTags"]
  end
  T & TB & P & BT & F & TG & AL --> H --> C
```

- **List state lives in the URL** (`?q=&company=&tagId=&sort=&order=&cursor=`) via `useSearchParams` → shareable, back button works. Changing any filter/sort resets the cursor stack.
- Selection (for bulk tag) is a `Set<number>` in component state, scoped to the current page.

### Required UI states

| State | Where | Behaviour |
|---|---|---|
| Loading | list, detail, activity | skeleton/“Loading…”; keep previous page visible while next loads (`placeholderData: keepPreviousData`) |
| No results | list | "No contacts match these filters" + Clear filters button |
| Invalid input | search (<2 chars), form | inline message; form shows per-field errors from `details.fields` |
| Backend failure | everywhere | error box with Retry (`refetch`); mutation errors as inline banner, form stays editable |
| Conflict (409) | ContactForm | banner: "This contact was updated by someone else." Show their latest values, button **Reload latest** (replaces form with `details.current`, new version) |
| Email taken | ContactForm | field error on email |

---

## 7. Folder structure

```
crm-contacts/
├── docker-compose.yml           # postgres:16, volume, mounts docker/init.sql
├── docker/init.sql              # CREATE DATABASE crm_test;
├── package.json                 # workspaces + root scripts
├── README.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example             # DATABASE_URL=postgres://crm:crm@localhost:5432/crm  PORT=4000
│   ├── migrations/001_init.sql
│   ├── seed/seed.sql
│   ├── src/
│   │   ├── index.ts             # starts server
│   │   ├── app.ts               # createApp() — used by tests too
│   │   ├── config.ts            # env with defaults matching compose
│   │   ├── db.ts                # pg Pool + Kysely instance + DB types
│   │   ├── errors.ts            # AppError + errorHandler
│   │   ├── lib/cursor.ts
│   │   ├── scripts/migrate.ts
│   │   ├── scripts/seed.ts      # runs seed/seed.sql
│   │   ├── contacts/{routes,service,repo,schemas}.ts
│   │   └── tags/{routes,service,repo,schemas}.ts
│   └── tests/
│       ├── setup.ts             # migrate crm_test, TRUNCATE between tests
│       ├── contacts.update.test.ts
│       ├── contacts.list.test.ts
│       ├── tags.test.ts
│       └── cursor.test.ts
└── frontend/
    ├── package.json, vite.config.ts (proxy /api), tsconfig.json, index.html
    └── src/
        ├── main.tsx, App.tsx, styles.css
        ├── api/{client,hooks,types}.ts
        ├── pages/{ContactListPage,ContactDetailPage}.tsx
        └── components/{SearchInput,CompanyFilter,TagFilter,SortSelect,ContactTable,
                        Pager,BulkTagBar,ContactForm,TagEditor,ActivityList,ErrorBox}.tsx
```

Root scripts: `npm run db:up`, `npm run migrate`, `npm run seed`, `npm run dev` (backend + frontend concurrently), `npm test`.

---

## 8. Seed data

`seed/seed.sql`, pure SQL with `generate_series` (≈200,000 contacts in a few seconds):
- First/last names picked from arrays of ~50 Indian + international names each; companies from ~40 names.
- Email: `lower(first.last.<n>@example.com)` (unique); ~5% of contacts with `NULL` email to prove "unique when present".
- Phone: `+91` + 10 digits derived from `n`; ~5% NULL.
- `created_at` spread over the last 2 years (random), so date sorting is meaningful; include some identical timestamps to exercise the `id` tie-breaker.
- Tags: `Lead, Customer, VIP, Prospect, Partner, Churned`; each contact gets 0–3 random tags.
- A few activity rows for the first ~50 contacts.
- End with `ANALYZE;` so the planner uses the indexes.
- Seed is idempotent: `TRUNCATE contacts, tags RESTART IDENTITY CASCADE` first.

---

## 9. Tests (highest-risk areas only)

| # | Test | Asserts |
|---|---|---|
| 1 | Stale update | two PATCHes with same version → second is 409, DB holds first write, `details.current.version` correct |
| 2 | Email uniqueness | PATCH to existing email → 409 `EMAIL_TAKEN`; email case-insensitive (`A@x.com` vs `a@x.com`); two NULL emails allowed |
| 3 | Bulk tag idempotency | run twice → no duplicate `contact_tags`, `TAG_ADDED` activity written once per contact; unknown IDs → skipped |
| 4 | Keyset completeness | insert rows with identical `created_at` and names; walk all pages both sorts/orders → every id exactly once, correct order |
| 5 | Filters + search | q matches name/email/phone; company + tag filter combined |
| 6 | Validation | bad email/phone/limit/cursor → 400 with field details |
| 7 | Activity | update logs changed fields diff; no-op update logs nothing and doesn't bump version |

Tests run against the `crm_test` DB from the same compose container.

---

## 10. Scale notes (README section, not implemented)

- **Multi-tenant:** `account_id` on every table, leading column of every index, all queries scoped by it.
- **Search:** move to OpenSearch/Elasticsearch fed by an outbox/CDC stream once trigram on PG isn't enough.
- **Writes (millions/day):** partition `contact_activities` by month + retention; batch activity inserts.
- **Reads:** read replicas for list/search; short-TTL cache for `/tags`, `/companies`.
- **Bulk ops:** for "tag all 2M matching contacts" use an async job (queue + worker) with progress, not a request.
- **Indexes:** add composite indexes for hot filter+sort combos, e.g. `(company, created_at, id)`.
- **Counts:** approximate counts (`pg_class.reltuples`) or a separate async count endpoint.

---

## 11. Build order (for the coding agent)

1. **Infra:** root workspace, docker-compose, `docker/init.sql`, backend skeleton, config, db, migrate script, migration 001. ✅ `npm run db:up && npm run migrate` works.
2. **Backend core:** errors + middleware, cursor lib, contacts list/detail/update, activities. ✅ tests 1, 2, 4–7 pass.
3. **Tags:** tags list, add/remove, bulk, companies endpoint. ✅ test 3 passes.
4. **Seed:** `seed.sql` + script. ✅ 200k rows; `EXPLAIN ANALYZE` of a search + keyset page shows index usage and runs in < 100 ms.
5. **Frontend:** api client/hooks → list page (search/filter/sort/pager/bulk) → detail page (form/conflict/tags/activity). ✅ every state in §6 reachable.
6. **README:** how to run, stack, key decisions, data model, concurrency approach, known issues, scale notes (§10), AI usage section (left for the author to fill in honestly).

### Definition of done
- [ ] `docker compose up -d && npm install && npm run migrate && npm run seed && npm run dev` works on a clean machine
- [ ] `npm test` green
- [ ] Search, 2 filters, 2 sorts, Prev/Next all server-side
- [ ] Edit contact; stale edit from a second tab shows the conflict banner
- [ ] Add/remove tag; bulk tag selected rows; activity list updates
- [ ] Loading / empty / invalid / error / conflict states all visible in UI
- [ ] No `any`, no SQL in routes, no business logic in repos
