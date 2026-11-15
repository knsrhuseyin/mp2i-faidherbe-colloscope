import assert from "node:assert/strict";
import worker from "./src/index.js";

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("./migrations/0001_initial.sql", import.meta.url), "utf8"));
const database = {
  prepare(sql) {
    const stmt = sqlite.prepare(sql); let args = [];
    const q = {
      bind(...values) { args = values; return q; },
      async first() { return stmt.get(...args) || null; },
      async run() { return { meta: { changes: stmt.run(...args).changes } }; },
    };
    return q;
  },
  get colloscope() { return sqlite.prepare("SELECT * FROM colloscope_data WHERE id=1").get(); },
};
const env = {
  DB: database,
  ADMIN_PASSWORD: "mot-de-passe-de-test-uniquement",
  SESSION_SECRET: "test-secret-that-is-long-enough-and-never-deployed",
  ALLOWED_ORIGINS: "http://127.0.0.1:8080,https://test.pages.dev",
};

let expectedUpdatedAt = null;
function call(path, options = {}) {
  if (path === "/api/admin/colloscope" && options.body) {
    options = { ...options, body: JSON.stringify({ ...JSON.parse(options.body), expected_updated_at: expectedUpdatedAt }) };
  }
  return worker.fetch(new Request(`https://colloscope-api.test${path}`, {
    headers: { origin: "https://test.pages.dev", "cf-connecting-ip": "192.0.2.1", ...(options.headers || {}) },
    ...options,
  }), env);
}

const publicResponse = await call("/api/colloscope");
assert.equal(publicResponse.status, 200);
const initial = await publicResponse.json();
assert.ok(initial.data.slots.length >= 30, "Le colloscope initial doit contenir les créneaux attendus");

const forbidden = await worker.fetch(new Request("https://colloscope-api.test/api/colloscope", {
  headers: { origin: "https://evil.example" },
}), env);
assert.equal(forbidden.status, 403);

const unauthorizedSave = await call("/api/admin/colloscope", { method: "POST", body: JSON.stringify(initial.data) });
assert.equal(unauthorizedSave.status, 401);

const badLogin = await call("/api/admin/login", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "non" }),
});
assert.equal(badLogin.status, 401);

const login = await call("/api/admin/login", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "mot-de-passe-de-test-uniquement" }),
});
assert.equal(login.status, 200);
const { token } = await login.json();
assert.ok(token);

const session = await call("/api/admin/session", { headers: { authorization: `Bearer ${token}` } });
assert.deepEqual(await session.json(), { authenticated: true });

const changed = structuredClone(initial.data);
changed.title = "Colloscope modifié pendant le test";
changed.appearance = { default_theme: "sage", custom_themes: [], periods: [{ id: "noel", theme: "christmas", start: "2026-12-01", end: "2026-12-31", enabled: true }] };
const saved = await call("/api/admin/colloscope", {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify(changed),
});
assert.equal(saved.status, 200);
expectedUpdatedAt = (await saved.json()).updated_at;
assert.equal(JSON.parse(database.colloscope.json).title, changed.title);

assert.deepEqual(JSON.parse(database.colloscope.json).appearance, changed.appearance);
const reread = await call("/api/colloscope");
assert.deepEqual((await reread.json()).data.appearance, changed.appearance);
const legacy = structuredClone(changed); delete legacy.appearance;
await call("/api/admin/colloscope", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(legacy) });
expectedUpdatedAt = database.colloscope.updated_at;
assert.deepEqual(JSON.parse(database.colloscope.json).appearance, changed.appearance, "Legacy imports preserve appearance");
const invalidAppearance = structuredClone(changed); invalidAppearance.appearance.default_theme = "unknown";
const invalidSave = await call("/api/admin/colloscope", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(invalidAppearance) });
assert.equal(invalidSave.status, 400);
assert.deepEqual(JSON.parse(database.colloscope.json).appearance, changed.appearance);
const overlapping = structuredClone(changed);
overlapping.appearance.periods.push({ id: "collision", theme: "halloween", start: "2026-12-25", end: "2027-01-02", enabled: true });
const overlapSave = await call("/api/admin/colloscope", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(overlapping) });
assert.equal(overlapSave.status, 400);
assert.ok((await overlapSave.json()).error.includes("chevauchent"));
console.log("Tests API réussis.");

