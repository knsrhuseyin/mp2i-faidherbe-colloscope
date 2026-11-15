import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const webhook =
  "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_1234567890";
let outbound = 0,
  status = 200;
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
    outboundService: async (request) => {
      assert.equal(request.url, webhook + "?wait=true");
      assert.equal(request.method, "POST");
      assert.deepEqual((await request.json()).allowed_mentions, { parse: [] });
      outbound++;
      return new Response("{}", {
        status,
        headers: status === 302 ? { location: "https://unexpected.invalid/" } : {},
      });
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
  const configured = await call(
    "/api/admin/documents/discord",
    { id: "english", enabled: true, webhook },
    token,
  );
  assert.equal(configured.status, 200);
  const test = await call("/api/admin/documents/discord/test", { id: "english" }, token);
  assert.equal(test.status, 200, await test.text());
  assert.equal(outbound, 1);
  // Redirects must be rejected without following them or leaking the webhook body.
  status = 302;
  const redirect = await call("/api/admin/documents/discord/test", { id: "english" }, token);
  assert.equal(redirect.status, 502);
  assert.match((await redirect.json()).error, /Redirection/);
  assert.equal(outbound, 2);
  // Le cron réel traite aussi les mises à jour avec leur propre identité.
  status = 200;
  await call(
    "/api/admin/documents/source",
    { id: "english", root_url: "https://drive.google.com/drive/folders/RuntimeFolder1234" },
    token,
  );
  const source = await db.prepare("SELECT * FROM document_sources WHERE id='english'").first();
  await db
    .prepare("UPDATE document_sources SET generation='runtime-current' WHERE id='english'")
    .run();
  await db
    .prepare(
      `INSERT INTO document_items(source_id,generation,id,parent_id,name,kind,mime,url,path,search_text)
    VALUES('english','runtime-current','RuntimeFile12345','','Cours.pdf','file','application/pdf','https://drive.google.com/file/d/RuntimeFile12345/view','','cours')`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO document_change_announcements(source_id,revision,item_id,generation,name,path,url,created_at)
    VALUES('english',?,'RuntimeFile12345','runtime-update','Cours.pdf','','https://drive.google.com/file/d/RuntimeFile12345/view',?)`,
    )
    .bind(source.revision, new Date().toISOString())
    .run();
  const runtimeWorker = await mf.getWorker();
  await runtimeWorker.scheduled({ scheduledTime: Date.now(), cron: "* * * * *" });
  assert.equal(
    (await db.prepare("SELECT state FROM document_change_announcements").first()).state,
    "sent",
  );
  assert.equal(outbound, 3);
  console.log(
    "Workers runtime tests passed: concurrent login limits, conflicting saves, Discord delivery and redirect rejection, with no external network access.",
  );
} finally {
  await mf.dispose();
}
