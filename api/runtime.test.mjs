import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

let outbound = 0;
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: [
      "src/index.js",
      ...readdirSync("src")
        .filter((name) => name.endsWith(".js") && name !== "index.js")
        .map((name) => "src/" + name),
      "../front/theme-core.mjs",
      "../front/manifest-core.mjs",
    ].map((path) => ({ type: "ESModule", path: resolve(path) })),
    modulesRoot: resolve(".."),
    compatibilityDate: "2026-09-26",
    cf: false,
    d1Databases: ["DB"],
    bindings: {
      ADMIN_PASSWORD: "runtime-test-password",
      SESSION_SECRET: "runtime-test-secret-never-deployed",
    },
    outboundService: async () => {
      outbound++;
      throw new Error("The colloscope must not call Discord");
    },
  }),
);
try {
  const db = await mf.getD1Database("DB");
  for (const file of [
    "0001_initial.sql",
    "0002_push.sql",
    "0003_documents.sql",
    "0004_document_updates.sql",
  ]) {
    for (const statement of readFileSync(new URL("./migrations/" + file, import.meta.url), "utf8")
      .split(";")
      .filter((s) => s.trim())) {
      await db.prepare(statement).run();
    }
  }
  const call = (path, body, token) =>
    mf.dispatchFetch("https://local.test" + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "192.0.2.1",
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(body),
    });
  const login = await call("/api/admin/login", { password: "runtime-test-password" });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const attempts = await Promise.all(
    Array.from({ length: 20 }, () => call("/api/admin/login", { password: "wrong" })),
  );
  assert.equal(attempts.filter((response) => response.status === 401).length, 5);
  assert.equal(attempts.filter((response) => response.status === 429).length, 15);
  const planning = await (await mf.dispatchFetch("https://local.test/api/colloscope")).json();
  const initial = await call(
    "/api/admin/colloscope",
    { ...planning.data, expected_updated_at: null },
    token,
  );
  assert.equal(initial.status, 200);
  const version = (await initial.json()).updated_at;
  const saves = await Promise.all(
    ["A", "B"].map((title) =>
      call(
        "/api/admin/colloscope",
        { ...planning.data, title, expected_updated_at: version },
        token,
      ),
    ),
  );
  assert.deepEqual(saves.map((response) => response.status).sort(), [200, 409]);
  for (const path of [
    "/api/admin/documents/discord",
    "/api/documents/collector-config",
    "/api/documents/items",
  ]) {
    const response = await mf.dispatchFetch("https://local.test" + path, {
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(response.status, 410);
    assert.equal(
      (await response.json()).dashboard_url,
      "https://prepa-sync.knsr-family.com/documents",
    );
  }
  assert.equal(outbound, 0);
  const runtimeWorker = await mf.getWorker();
  await runtimeWorker.scheduled({ scheduledTime: Date.now(), cron: "* * * * *" });
  assert.equal(outbound, 0);
  console.log(
    "Workers runtime verified: login limits, concurrent planning saves, independent document links and no Discord sends.",
  );
} finally {
  await mf.dispose();
}
