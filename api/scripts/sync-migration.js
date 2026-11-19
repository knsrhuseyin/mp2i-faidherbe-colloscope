/** Temporary, body-signed migration bridge. No endpoint returns decrypted configuration. */
import original, { normaliseData } from "../src/index.js";
import { dispatchReminders } from "../src/notifications.js";
import defaults from "../src/default-data.js";
const enc = new TextEncoder();
const decode = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function allowed(request, env, text) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer /, ""),
    [kind, expiry, digest, signature, extra] = token.split(".");
  if (
    !env.LOCAL_COLLECTOR_SECRET ||
    kind !== "local" ||
    extra ||
    !/^\d{10}$/.test(expiry || "") ||
    Number(expiry) <= Date.now() / 1000 ||
    Number(expiry) > Date.now() / 1000 + 120 ||
    !/^\w{43}$/.test((signature || "").replace(/-/g, "_"))
  )
    return false;
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== hash) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.LOCAL_COLLECTOR_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    decode(signature),
    enc.encode(["POST", "/api/documents/export-sync", expiry, digest].join("\n")),
  );
}
async function unseal(env, id, value) {
  const [iv, data] = value.split(".");
  const key = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", enc.encode("collo-discord-v1:" + env.SESSION_SECRET)),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(iv), additionalData: enc.encode(id) },
      key,
      decode(data),
    ),
  );
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
export default {
  async scheduled(controller, env, ctx) {
    // During cutover only colloscope reminders run. Document announcements stay paused.
    ctx.waitUntil(
      (async () => {
        const row = await env.DB.prepare("SELECT json FROM colloscope_data WHERE id=1").first();
        await dispatchReminders(
          env,
          normaliseData(row?.json ? JSON.parse(row.json) : defaults),
          controller.scheduledTime,
        );
      })(),
    );
  },
  async fetch(request, env) {
    if (new URL(request.url).pathname !== "/api/documents/export-sync")
      return original.fetch(request, env);
    if (request.method !== "POST") return json({ error: "Méthode refusée." }, 405);
    let phase = "authorization";
    try {
      const length = Number(request.headers.get("content-length") || 0);
      if (length > 8192) return json({ error: "Demande trop volumineuse." }, 413);
      const text = await request.text();
      if (text.length > 8192) return json({ error: "Demande trop volumineuse." }, 413);
      if (!(await allowed(request, env, text)))
        return json({ error: "Migration non autorisée." }, 401);
      const input = JSON.parse(text);
      if (
        input.id !== "prepa-sync-independent-2026-11-19-v1" ||
        typeof input.transfer_key !== "string" ||
        !/^[A-Za-z0-9+/]{43}=$/.test(input.transfer_key)
      )
        return json({ error: "Configuration de migration invalide." }, 400);
      phase = "read-sources";
      const sources = (await env.DB.prepare("SELECT * FROM document_sources").all()).results;
      const discord = (
        await env.DB.prepare(
          "SELECT d.*,o.notify_new,o.notify_updates,o.notify_existing,o.role_id FROM document_discord d LEFT JOIN document_discord_options o ON o.source_id=d.source_id",
        ).all()
      ).results;
      phase = "decrypt-webhooks";
      for (const d of discord) d.webhook = await unseal(env, d.source_id, d.webhook);
      phase = "read-history";
      const items = (
        await env.DB.prepare(
          "SELECT i.*,d.published_at FROM document_items i JOIN document_sources s ON s.id=i.source_id AND s.generation=i.generation LEFT JOIN document_dates d ON d.source_id=i.source_id AND d.generation=i.generation AND d.item_id=i.id",
        ).all()
      ).results;
      const announcements = [
        ...(await env.DB.prepare("SELECT * FROM document_announcements").all()).results,
        ...(await env.DB.prepare("SELECT * FROM document_change_announcements").all()).results,
      ];
      phase = "encrypt-export";
      const clear = enc.encode(
        JSON.stringify({
          schema: 1,
          id: input.id,
          sources,
          discord,
          items,
          announcements,
          runtime: input.runtime,
        }),
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await crypto.subtle.importKey(
        "raw",
        decode(input.transfer_key),
        { name: "AES-GCM" },
        false,
        ["encrypt"],
      );
      const encrypted = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: enc.encode(input.id) },
          key,
          clear,
        ),
      );
      const encode = (bytes) => {
        const chunks = [];
        for (let i = 0; i < bytes.length; i += 32768)
          chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
        return btoa(chunks.join(""));
      };
      return json({
        ok: true,
        migration_id: input.id,
        iv: encode(iv),
        encrypted: encode(encrypted),
        documents: items.length,
        announcements: announcements.length,
      });
    } catch (error) {
      return json(
        {
          error: "Transfert non abouti ; aucun identifiant n’est affiché.",
          phase,
          error_type: error.name,
        },
        503,
      );
    }
  },
};
