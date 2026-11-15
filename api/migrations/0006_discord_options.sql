CREATE TABLE IF NOT EXISTS document_discord_options (
  source_id TEXT PRIMARY KEY,
  notify_new INTEGER NOT NULL DEFAULT 1,
  notify_updates INTEGER NOT NULL DEFAULT 1,
  notify_existing INTEGER NOT NULL DEFAULT 0,
  role_id TEXT NOT NULL DEFAULT ''
);
