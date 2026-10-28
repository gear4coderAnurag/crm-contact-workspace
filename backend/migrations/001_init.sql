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
