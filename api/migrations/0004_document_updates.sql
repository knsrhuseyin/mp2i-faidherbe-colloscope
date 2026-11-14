CREATE TABLE IF NOT EXISTS document_dates(source_id TEXT NOT NULL,generation TEXT NOT NULL,item_id TEXT NOT NULL,published_at TEXT,PRIMARY KEY(source_id,generation,item_id));
CREATE TABLE IF NOT EXISTS document_seen(source_id TEXT NOT NULL,revision TEXT NOT NULL,item_id TEXT NOT NULL,first_seen_at TEXT,PRIMARY KEY(source_id,revision,item_id));
CREATE TABLE IF NOT EXISTS document_discord(source_id TEXT PRIMARY KEY,webhook TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,last_sent_at TEXT,last_error TEXT);
CREATE TABLE IF NOT EXISTS document_announcements(source_id TEXT NOT NULL,revision TEXT NOT NULL,item_id TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',lease_until INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,sent_at TEXT,PRIMARY KEY(source_id,revision,item_id));
CREATE INDEX IF NOT EXISTS document_announcements_due ON document_announcements(state,next_attempt);
