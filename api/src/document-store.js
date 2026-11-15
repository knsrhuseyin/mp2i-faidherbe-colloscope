/**
 * Initialisation idempotente des tables de dates et d’annonces du catalogue.
 * Les anciennes entrées servent de référence pour ne pas annoncer tout l’historique.
 */
// Idempotent bootstrap also supports deployments where SQL migrations are applied later.
export const DOCUMENT_UPDATES_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS document_dates(source_id TEXT NOT NULL,generation TEXT NOT NULL,item_id TEXT NOT NULL,published_at TEXT,PRIMARY KEY(source_id,generation,item_id))`,
  `CREATE TABLE IF NOT EXISTS document_seen(source_id TEXT NOT NULL,revision TEXT NOT NULL,item_id TEXT NOT NULL,first_seen_at TEXT,PRIMARY KEY(source_id,revision,item_id))`,
  `CREATE TABLE IF NOT EXISTS document_discord(source_id TEXT PRIMARY KEY,webhook TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,last_sent_at TEXT,last_error TEXT)`,
  `CREATE TABLE IF NOT EXISTS document_discord_options(source_id TEXT PRIMARY KEY,notify_new INTEGER NOT NULL DEFAULT 1,notify_updates INTEGER NOT NULL DEFAULT 1,notify_existing INTEGER NOT NULL DEFAULT 0,role_id TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS document_announcements(source_id TEXT NOT NULL,revision TEXT NOT NULL,item_id TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',lease_until INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,sent_at TEXT,PRIMARY KEY(source_id,revision,item_id))`,
  `CREATE INDEX IF NOT EXISTS document_announcements_due ON document_announcements(state,next_attempt)`,
  // Une mise à jour possède sa propre génération : deux changements successifs
  // restent distincts, même si une ancienne annonce est encore en cours d’envoi.
  `CREATE TABLE IF NOT EXISTS document_change_announcements(source_id TEXT NOT NULL,revision TEXT NOT NULL,item_id TEXT NOT NULL,generation TEXT NOT NULL,name TEXT NOT NULL,path TEXT NOT NULL,url TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',lease_until INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,sent_at TEXT,PRIMARY KEY(source_id,revision,item_id,generation))`,
  `CREATE INDEX IF NOT EXISTS document_changes_due ON document_change_announcements(state,next_attempt)`,
];
const ready = new WeakMap();
export function ensureDocumentUpdates(env) {
  if (!ready.has(env.DB)) {
    const promise = (async () => {
      for (const sql of DOCUMENT_UPDATES_SCHEMA) await env.DB.prepare(sql).run();
      // The current catalogue is the baseline, never a batch of new-file announcements.
      await env.DB.prepare(
        `INSERT OR IGNORE INTO document_seen(source_id,revision,item_id,first_seen_at)
        SELECT i.source_id,s.revision,i.id,NULL FROM document_items i JOIN document_sources s ON s.id=i.source_id AND s.generation=i.generation`,
      ).run();
    })().catch((error) => {
      ready.delete(env.DB);
      throw error;
    });
    ready.set(env.DB, promise);
  }
  return ready.get(env.DB);
}
