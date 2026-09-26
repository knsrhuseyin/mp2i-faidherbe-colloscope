CREATE TABLE colloscope_data (
  id INTEGER PRIMARY KEY NOT NULL,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE login_attempts (
  ip_hash TEXT PRIMARY KEY NOT NULL,
  window_started INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
