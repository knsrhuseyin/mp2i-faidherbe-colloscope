import assert from "node:assert/strict";
import worker from "./src/index.js";

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    if (this.sql.includes("FROM colloscope_data")) return this.database.colloscope;
    if (this.sql.includes("FROM login_attempts")) return this.database.attempts.get(this.values[0]) || null;
    throw new Error(`Requête first() inconnue : ${this.sql}`);
  }

  async run() {
    if (this.sql.startsWith("INSERT INTO colloscope_data")) {
      this.database.colloscope = { json: this.values[1], updated_at: this.values[2] };
      return { success: true };
    }
    if (this.sql.startsWith("INSERT INTO login_attempts")) {
      this.database.attempts.set(this.values[0], {
        window_started: this.values[1], attempts: this.values[2],
      });
      return { success: true };
    }
    if (this.sql.startsWith("DELETE FROM login_attempts")) {
      this.database.attempts.delete(this.values[0]);
      return { success: true };
    }
    throw new Error(`Requête run() inconnue : ${this.sql}`);
  }
}

class FakeD1 {
  constructor() {
    this.colloscope = null;
    this.attempts = new Map();
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

const database = new FakeD1();
const env = {
  DB: database,
  ADMIN_PASSWORD: "mot-de-passe-de-test-uniquement",
  SESSION_SECRET: "test-secret-that-is-long-enough-and-never-deployed",
  ALLOWED_ORIGINS: "http://127.0.0.1:8080,https://test.pages.dev",
};

function call(path, options = {}) {
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
const saved = await call("/api/admin/colloscope", {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify(changed),
});
assert.equal(saved.status, 200);
assert.equal(JSON.parse(database.colloscope.json).title, changed.title);

console.log("Tests API réussis.");
