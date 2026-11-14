CREATE TABLE IF NOT EXISTS push_devices (
  id TEXT PRIMARY KEY,
  subscription TEXT NOT NULL,
  group_id INTEGER NOT NULL,
  reminders TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS push_deliveries (
  device_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, event_key)
);
