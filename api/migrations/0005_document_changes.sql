-- File séparée pour les modifications : conserve les annonces de nouveaux fichiers
-- déjà en attente et distingue les mises à jour successives d’un même document.
CREATE TABLE IF NOT EXISTS document_change_announcements (
  source_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  item_id TEXT NOT NULL,
  generation TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  url TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  lease_until INTEGER NOT NULL DEFAULT 0,
  next_attempt INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  PRIMARY KEY(source_id,revision,item_id,generation)
);
CREATE INDEX IF NOT EXISTS document_changes_due ON document_change_announcements(state,next_attempt);
