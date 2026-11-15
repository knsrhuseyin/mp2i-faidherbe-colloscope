import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { ensureDocumentUpdates } from "./src/document-store.js";
import { ingest } from "./src/documents.js";
import {
  saveDiscord,
  discordSettings,
  dispatchDocumentAnnouncements,
  testDiscord,
} from "./src/document-discord.js";

// Vraie base SQLite : teste la comparaison et la publication atomiques, sans réseau.
const sqlite = new DatabaseSync(":memory:");
for (const file of ["0003_documents.sql", "0004_document_updates.sql"]) {
  sqlite.exec(readFileSync(new URL("./migrations/" + file, import.meta.url), "utf8"));
}
const DB = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    let args = [];
    const query = {
      bind(...values) {
        args = values;
        return query;
      },
      async first() {
        return statement.get(...args) || null;
      },
      async all() {
        return { results: statement.all(...args) };
      },
      async run() {
        return { meta: { changes: statement.run(...args).changes } };
      },
    };
    return query;
  },
  async batch(queries) {
    sqlite.exec("BEGIN");
    try {
      const results = await Promise.all(queries.map((query) => query.run()));
      sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
};
const env = { DB, SESSION_SECRET: "document-changes-test-only" };
await ensureDocumentUpdates(env);
// La migration explicite et le bootstrap automatique doivent être compatibles.
sqlite.exec(
  readFileSync(new URL("./migrations/0005_document_changes.sql", import.meta.url), "utf8"),
);
sqlite.exec(
  readFileSync(new URL("./migrations/0006_discord_options.sql", import.meta.url), "utf8"),
);
const hook =
  "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_1234567890";
const originalFetch = globalThis.fetch;
const messages = [];
let status = 200;
globalThis.fetch = async (url, options) => {
  assert.equal(url, hook + "?wait=true");
  assert.equal(options.redirect, "manual");
  messages.push(JSON.parse(options.body));
  return new Response("{}", { status, headers: { "retry-after": "1" } });
};
const count = (source, table = "document_change_announcements") =>
  sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE source_id=?`).get(source).n;
let sequence = 0;
async function snapshot(source, files, generation = "snapshot-" + ++sequence) {
  const base = { source, revision: "revision-" + source, generation };
  assert.deepEqual(await ingest(env, { ...base, items: files }), { ok: true });
  assert.deepEqual(
    await ingest(env, { ...base, items: [], complete: true, expected_count: files.length }),
    { ok: true },
  );
  return base;
}
try {
  for (const source of ["maths", "english", "physics"]) {
    const root =
      source !== "physics"
        ? "https://drive.google.com/drive/folders/ExampleFolder1234"
        : "https://nuage13.apps.education.fr/index.php/s/ExampleShare1234";
    sqlite
      .prepare("INSERT INTO document_sources(id,label,kind,root_url,revision) VALUES(?,?,?,?,?)")
      .run(source, source, source === "physics" ? "webdav" : "drive", root, "revision-" + source);
    await saveDiscord(env, { id: source, enabled: true, webhook: hook });
    const file = {
      id: "ExampleFile12345",
      parent_id: "",
      name: "Cours.pdf",
      kind: "file",
      mime: "application/pdf",
      size: 100,
      modified_at: "2026-11-15T10:00:00Z",
      path: "",
      url:
        source === "maths"
          ? "https://cahier-de-prepa.fr/mp2i-faidherbe/download?id=12345"
          : source === "english"
            ? "https://drive.google.com/file/d/ExampleFile12345/view"
            : root + "/download?path=%2F&files=cours.pdf",
    };
    await snapshot(source, [file]);
    assert.equal(count(source), 0, "Premier passage silencieux");
    await snapshot(source, [{ ...file, name: "Cours renommé.pdf", path: "Chapitre" }]);
    assert.equal(count(source), 0, "Renommage/déplacement seuls silencieux");
    await snapshot(source, [file]);
    assert.equal(count(source), 0, "Métadonnées inchangées silencieuses");

    const base = { source, revision: "revision-" + source, generation: "updated-" + source };
    const updated = { ...file, size: 200, modified_at: "2026-11-15T11:00:00Z" };
    await ingest(env, { ...base, items: [updated] });
    assert.equal(count(source), 0, "Un instantané incomplet ne produit aucune annonce");
    assert.equal(
      (await ingest(env, { ...base, items: [], complete: true, expected_count: 2 })).status,
      409,
    );
    await ingest(env, { ...base, items: [], complete: true, expected_count: 1 });
    await ingest(env, { ...base, items: [], complete: true, expected_count: 1 });
    assert.equal(count(source), 1, "Finalisation réessayée sans doublon");
    await snapshot(source, [updated]);
    assert.equal(count(source), 1, "Passage identique sans doublon");
    const before = messages.length;
    status = 429;
    await dispatchDocumentAnnouncements(env);
    assert.equal(messages.length, before + 1);
    status = 200;
    await dispatchDocumentAnnouncements(env, Date.now() + 61000);
    await dispatchDocumentAnnouncements(env, Date.now() + 120000);
    assert.equal(messages.length, before + 2, "Limitation Discord réessayée une fois");
    assert.match(messages.at(-1).embeds[0].title, /Fichier mis à jour/);
    assert.ok(
      messages
        .at(-1)
        .embeds[0].title.includes(
          { maths: "Mathématiques", english: "Anglais", physics: "Physique" }[source],
        ),
    );
    if (source === "maths") assert.equal(messages.at(-1).embeds[0].url, file.url);
    assert.deepEqual(messages.at(-1).allowed_mentions, { parse: [] });

    // Même taille, nouvelle date ; puis même date, nouvelle taille.
    const newer = { ...updated, modified_at: "2026-11-15T12:00:00Z" };
    await snapshot(source, [newer]);
    await snapshot(source, [{ ...newer, size: 300 }]);
    assert.equal(count(source), 3, "Deux changements successifs ont leurs propres annonces");
    await dispatchDocumentAnnouncements(env);
    assert.equal(messages.length, before + 4);
    const settings = (await discordSettings(env)).find((row) => row.id === source);
    assert.equal(settings.sent, 3);
    assert.equal(settings.pending, 0);

    await snapshot(source, [{ ...newer, size: null, modified_at: null }]);
    assert.equal(count(source), 3, "Une métadonnée manquante ne prouve pas un changement");
    await snapshot(source, [newer]);
    assert.equal(count(source), 3, "L’apparition d’une métadonnée ne crée pas de faux positif");
    await snapshot(source, [{ ...newer, size: 400 }]);
    await saveDiscord(env, { id: source, enabled: false });
    await snapshot(source, [{ ...newer, size: 500 }]);
    await saveDiscord(env, { id: source, enabled: true });
    await dispatchDocumentAnnouncements(env);
    assert.equal(messages.length, before + 4, "Pause/réactivation sans rattrapage historique");

    // Une réponse perdue conserve un état incertain, sans réémission automatique.
    await snapshot(source, [{ ...newer, size: 600 }]);
    const normalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("test network failure");
    };
    await dispatchDocumentAnnouncements(env);
    globalThis.fetch = normalFetch;
    await dispatchDocumentAnnouncements(env, Date.now() + 600000);
    assert.equal(messages.length, before + 4);
    assert.equal((await discordSettings(env)).find((row) => row.id === source).uncertain, 1);

    const fresh = { ...newer, id: "NewDocument12345" };
    await snapshot(source, [newer, fresh]);
    const updatesBefore = count(source);
    await snapshot(source, [newer, { ...fresh, size: 900 }]);
    assert.equal(
      count(source),
      updatesBefore,
      "Une nouveauté encore en attente inclut la version la plus récente",
    );
    const beforeFresh = messages.length;
    await dispatchDocumentAnnouncements(env);
    assert.ok(
      messages
        .slice(beforeFresh)
        .some((message) => /Nouveau fichier/.test(message.embeds[0].title)),
    );
    await saveDiscord(env, { id: source, enabled: false, remove: true });
  }
  // Une publication pendant l’envoi d’une ancienne version ne doit pas être
  // marquée envoyée par la réponse de cette ancienne requête Discord.
  await saveDiscord(env, { id: "english", enabled: true, webhook: hook });
  const concurrentFile = {
    id: "ConcurrentFile123",
    parent_id: "",
    name: "Concurrent.pdf",
    kind: "file",
    mime: "application/pdf",
    size: 10,
    modified_at: null,
    path: "",
    url: "https://drive.google.com/file/d/ConcurrentFile123/view",
  };
  await saveDiscord(env, { id: "english", enabled: false });
  await snapshot("english", [concurrentFile]);
  await saveDiscord(env, { id: "english", enabled: true });
  await snapshot("english", [{ ...concurrentFile, size: 20 }]);
  const normalFetch = globalThis.fetch;
  let publishedDuringSend = false;
  globalThis.fetch = async (...args) => {
    if (!publishedDuringSend) {
      publishedDuringSend = true;
      await snapshot("english", [{ ...concurrentFile, size: 30 }]);
    }
    return normalFetch(...args);
  };
  await dispatchDocumentAnnouncements(env);
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM document_change_announcements WHERE item_id=? AND state='pending'",
      )
      .get(concurrentFile.id).n,
    1,
  );
  globalThis.fetch = normalFetch;
  await dispatchDocumentAnnouncements(env);
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM document_change_announcements WHERE item_id=? AND state='sent'",
      )
      .get(concurrentFile.id).n,
    2,
  );

  const atomicBase = {
    source: "english",
    revision: "revision-english",
    generation: "atomic-failure",
  };
  await ingest(env, { ...atomicBase, items: [{ ...concurrentFile, size: 40 }] });
  const beforeFailure = count("english");
  sqlite.exec(
    "CREATE TRIGGER reject_publication BEFORE UPDATE ON document_sources BEGIN SELECT RAISE(ABORT,'simulated write failure'); END",
  );
  await assert.rejects(
    ingest(env, { ...atomicBase, items: [], complete: true, expected_count: 1 }),
    /simulated write failure/,
  );
  assert.equal(
    count("english"),
    beforeFailure,
    "Un échec de publication annule également les annonces préparées",
  );
  sqlite.exec("DROP TRIGGER reject_publication");
  await ingest(env, { ...atomicBase, items: [], complete: true, expected_count: 1 });
  assert.equal(count("english"), beforeFailure + 1);
  // Les options de l'admin filtrent la création ET la livraison sans rattrapage.
  await saveDiscord(env, { id: "english", enabled: false });
  const role = "123456789012345678";
  const optionsFile = { ...concurrentFile, id: "OptionsFile12345", size: 10 };
  await saveDiscord(env, {
    id: "maths",
    enabled: true,
    webhook: hook,
    notify_new: false,
    notify_updates: true,
    role_id: role,
  });
  const beforeOptions = messages.length;
  await snapshot("maths", [optionsFile]);
  await dispatchDocumentAnnouncements(env);
  assert.equal(messages.length, beforeOptions, "Nouveautés désactivées");
  await snapshot("maths", [{ ...optionsFile, size: 20 }]);
  await dispatchDocumentAnnouncements(env);
  assert.equal(messages.length, beforeOptions + 1);
  assert.match(messages.at(-1).embeds[0].title, /Fichier mis à jour/);
  assert.equal(messages.at(-1).content, `<@&${role}>`);
  assert.deepEqual(messages.at(-1).allowed_mentions, { parse: [], roles: [role] });
  await saveDiscord(env, {
    id: "maths",
    enabled: true,
    notify_new: true,
    notify_updates: false,
    role_id: "",
  });
  const extra = { ...optionsFile, id: "OptionsExtra1234" };
  await snapshot("maths", [{ ...optionsFile, size: 30 }, extra]);
  await dispatchDocumentAnnouncements(env);
  assert.equal(messages.length, beforeOptions + 2);
  assert.match(messages.at(-1).embeds[0].title, /Nouveau fichier/);
  assert.deepEqual(messages.at(-1).allowed_mentions, { parse: [] });
  await saveDiscord(env, { id: "maths", enabled: true, notify_updates: true });
  await snapshot("maths", [{ ...optionsFile, size: 30 }, extra]);
  await dispatchDocumentAnnouncements(env);
  assert.equal(messages.length, beforeOptions + 2, "Pas de rattrapage des modifications ignorées");
  await snapshot("maths", [{ ...optionsFile, size: 40 }, extra]);
  await saveDiscord(env, { id: "maths", enabled: true, notify_updates: false });
  await saveDiscord(env, { id: "maths", enabled: true, notify_updates: true });
  await dispatchDocumentAnnouncements(env);
  assert.equal(
    messages.length,
    beforeOptions + 2,
    "Les mises à jour en attente sont annulées à la pause",
  );
  await assert.rejects(
    saveDiscord(env, { id: "maths", enabled: true, role_id: "@everyone" }),
    /rôle Discord/,
  );
  await assert.rejects(
    saveDiscord(env, { id: "maths", enabled: true, notify_new: "false" }),
    /Options Discord/,
  );
  await saveDiscord(env, { id: "maths", enabled: false, remove: true });
  // Historique choisi explicitement, y compris quand aucun catalogue n'existe encore.
  sqlite
    .prepare("UPDATE document_sources SET generation='',synced_at=NULL WHERE id='physics'")
    .run();
  await saveDiscord(env, {
    id: "physics",
    enabled: true,
    webhook: hook,
    notify_existing: true,
    role_id: role,
  });
  assert.equal((await testDiscord(env, "physics", true)).status, 400);
  const historyFile = {
    ...optionsFile,
    id: "HistoryFile12345",
    url: "https://nuage13.apps.education.fr/index.php/s/ExampleShare1234/download?path=%2F&files=history.pdf",
  };
  const beforeHistory = messages.length;
  await snapshot("physics", [historyFile]);
  await dispatchDocumentAnnouncements(env);
  assert.equal(
    messages.length,
    beforeHistory + 1,
    "Premier catalogue annoncé uniquement sur demande",
  );
  const sentBeforeTest = (await discordSettings(env)).find((row) => row.id === "physics").sent;
  assert.deepEqual(await testDiscord(env, "physics", true), { ok: true });
  assert.match(messages.at(-1).embeds[0].title, /Test · Dernier fichier/);
  assert.equal(messages.at(-1).embeds[0].url, historyFile.url);
  assert.deepEqual(messages.at(-1).allowed_mentions, { parse: [], roles: [role] });
  assert.equal(
    (await discordSettings(env)).find((row) => row.id === "physics").sent,
    sentBeforeTest,
    "Le test ne modifie pas les files",
  );
  await saveDiscord(env, { id: "physics", enabled: true, notify_existing: true });
  await snapshot("physics", [historyFile]);
  await dispatchDocumentAnnouncements(env);
  assert.equal(
    messages.length,
    beforeHistory + 2,
    "Ni réenregistrement ni nouvelle collecte ne rejouent l'historique",
  );
  await saveDiscord(env, { id: "physics", enabled: false, remove: true });
  await saveDiscord(env, { id: "maths", enabled: true, webhook: hook, notify_existing: true });
  const beforeExisting = messages.length;
  await dispatchDocumentAnnouncements(env);
  assert.equal(
    messages.length,
    beforeExisting + 1,
    "Catalogue déjà publié inclus sur demande à la configuration",
  );
  console.log(
    "Document change tests passed: all subjects, admin options, role mentions, initial history, latest-file tests, atomic rollback, deduplication, retry, pause, concurrent updates and uncertain delivery without external network.",
  );
} finally {
  globalThis.fetch = originalFetch;
  sqlite.close();
}
