import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { encrypt, encode, decode } from "./src/web-push.js";
import { parisTime, eventsFor, pushRoute, dispatchReminders } from "./src/notifications.js";
import worker from "./src/index.js";
import data from "./src/default-data.js";

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("./migrations/0001_initial.sql", import.meta.url), "utf8"));
db.exec(readFileSync(new URL("./migrations/0002_push.sql", import.meta.url), "utf8"));
const DB = {
  prepare(sql) {
    let args = [];
    const statement = db.prepare(sql);
    const wrapper = {
      bind(...a) { args = a; return wrapper; },
      async first() { return statement.get(...args) || null; },
      async all() { return { results: statement.all(...args) }; },
      async run() { return { meta: { changes: statement.run(...args).changes } }; },
    };
    return wrapper;
  },
  async batch(statements) { return Promise.all(statements.map(s => s.run())); },
};
assert.equal(new Date(parisTime("2026-11-17", "17:00")).toISOString(), "2026-11-17T16:00:00.000Z");
assert.equal(new Date(parisTime("2026-09-22", "17:00")).toISOString(), "2026-09-22T15:00:00.000Z");
const peer = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/test", keys: {
  p256dh: encode(await crypto.subtle.exportKey("raw", peer.publicKey)), auth: encode(crypto.getRandomValues(new Uint8Array(16))),
} };
const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const env = { DB, VAPID_PUBLIC_KEY: encode(await crypto.subtle.exportKey("raw", vapid.publicKey)), VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey("jwk", vapid.privateKey)).d, VAPID_SUBJECT: "mailto:test@example.com" };
const payload = { title: "Collo · Français", body: "Colle à 17:00" };
const body = await encrypt(subscription, payload);
assert.equal(new DataView(body.buffer).getUint32(16), 4096);
assert.equal(body[20], 65);
const server = await crypto.subtle.importKey("raw", body.slice(21, 86), { name: "ECDH", namedCurve: "P-256" }, false, []);
const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: server }, peer.privateKey, 256);
async function hkdf(k, salt, info, bits) {
  return crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await crypto.subtle.importKey("raw", k, "HKDF", false, ["deriveBits"]), bits);
}
const te = new TextEncoder();
const info = new Uint8Array([...te.encode("WebPush: info\0"), ...decode(subscription.keys.p256dh), ...body.slice(21, 86)]);
const ikm = await hkdf(secret, decode(subscription.keys.auth), info, 256);
const cek = await hkdf(ikm, body.slice(0, 16), te.encode("Content-Encoding: aes128gcm\0"), 128);
const nonce = await hkdf(ikm, body.slice(0, 16), te.encode("Content-Encoding: nonce\0"), 96);
const clear = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), body.slice(86)));
assert.equal(clear.at(-1), 2);
assert.deepEqual(JSON.parse(new TextDecoder().decode(clear.slice(0, -1))), payload);

const id = "a".repeat(64);
const request = (path, value, device = id) => new Request("https://api.test/api/push/" + path, { method: "POST", headers: { authorization: "Bearer " + device }, body: JSON.stringify(value) });
assert.equal((await pushRoute(request("subscribe", {}), {}, data)).status, 503);
assert.equal((await pushRoute(request("subscribe", {}, "bad"), env, data)).status, 401);
assert.equal((await pushRoute(request("subscribe", { group: 14, reminders: [15, 60], subscription }), env, data)).ok, true);
await assert.rejects(pushRoute(request("subscribe", { group: 14, reminders: [-1], subscription }), env, data));
await assert.rejects(pushRoute(request("subscribe", { group: 14, reminders: [60], subscription: { ...subscription, endpoint: "https://127.0.0.1/private" } }), env, data));
await assert.rejects(pushRoute(request("subscribe", { group: 14, reminders: [60], subscription: { ...subscription, endpoint: "https://fcm.googleapis.com.evil.test/" } }), env, data));

const event = eventsFor(data, 14).find(e => e.starts > Date.parse("2026-11-16T00:00:00Z"));
assert.ok(event);
const now = event.starts - 3600000;
db.prepare("UPDATE push_devices SET updated_at=? WHERE id=?").run(now - 60000, id);
const originalFetch = globalThis.fetch;
const sent = [];
let fail = false;
globalThis.fetch = async (url, options) => {
  assert.equal(options.redirect, "manual", "Cloudflare Workers reject redirect:error; push redirects must not be followed");
  const jwt = options.headers.authorization.match(/t=([^,]+)/)[1];
  const [head, claims, signature] = jwt.split(".");
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, vapid.publicKey, decode(signature), te.encode(head + "." + claims)));
  assert.equal(JSON.parse(new TextDecoder().decode(decode(claims))).aud, new URL(url).origin);
  sent.push(url); return new Response(null, { status: fail ? 503 : 201 });
};
await dispatchReminders(env, data, now);
const count = sent.length;
assert.ok(count > 0);
await dispatchReminders(env, data, now + 60000);
assert.equal(sent.length, count, "No duplicate successful reminders");
db.exec("DELETE FROM push_deliveries"); fail = true;
await dispatchReminders(env, data, now); fail = false;
await dispatchReminders(env, data, now + 60000);
assert.ok(db.prepare("SELECT count(*) AS n FROM push_deliveries WHERE sent=1").get().n > 0, "Retry transient errors");
await pushRoute(request("unsubscribe", {}), env, data);
assert.equal(db.prepare("SELECT count(*) AS n FROM push_devices").get().n, 0);
const countAfter = sent.length;
await dispatchReminders(env, data, now + 120000);
assert.equal(sent.length, countAfter, "Unsubscribe stops reminders");
globalThis.fetch = originalFetch;
const config = await worker.fetch(new Request("https://api.test/api/push/config"), { DB });
assert.equal((await config.json()).enabled, false);
console.log("Tests push réussis : chiffrement, VAPID, Paris été/hiver, validation, SQL, rappels, reprise et désactivation.");
