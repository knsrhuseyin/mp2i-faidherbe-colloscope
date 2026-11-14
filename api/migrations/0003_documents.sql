CREATE TABLE IF NOT EXISTS document_access (
  id INTEGER PRIMARY KEY CHECK(id=1),
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  version TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS document_sources (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL,
  root_url TEXT NOT NULL,
  revision TEXT NOT NULL,
  generation TEXT NOT NULL DEFAULT '',
  synced_at TEXT,
  attempted_at TEXT,
  error TEXT,
  item_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS document_items (
  source_id TEXT NOT NULL,
  generation TEXT NOT NULL,
  id TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER,
  modified_at TEXT,
  url TEXT NOT NULL,
  path TEXT NOT NULL,
  search_text TEXT NOT NULL,
  PRIMARY KEY(source_id,generation,id)
);
CREATE INDEX IF NOT EXISTS document_parent ON document_items(source_id,generation,parent_id);
CREATE INDEX IF NOT EXISTS document_name ON document_items(source_id,generation,name);
