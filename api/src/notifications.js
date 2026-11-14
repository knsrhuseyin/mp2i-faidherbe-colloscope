import { normaliseAppearance, resolveTheme, parisDate } from "../../front/theme-core.mjs";
import { iconPath } from "../../front/manifest-core.mjs";
import { decode, encode, sendPush } from "./web-push.js";

export const configured = (env) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && /^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT || ""));
const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"];
const digest = async (s) => encode(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export async function validateSubscription(s) {
  const url = new URL(s?.endpoint);
  // Only browser push services: never let a visitor choose an arbitrary fetch target.
  const host = url.hostname;
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash || s.endpoint.length > 2048 ||
      !(host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host === "web.push.apple.com" || host.endsWith(".notify.windows.com"))) throw new Error("Service de notification invalide");
  if (!/^[A-Za-z0-9_-]{87}$/.test(s.keys?.p256dh || "") || !/^[A-Za-z0-9_-]{22}$/.test(s.keys?.auth || "")) throw new Error("Clés de notification invalides");
  if (decode(s.keys.p256dh)[0] !== 4) throw new Error("Clé publique invalide");
  await crypto.subtle.importKey("raw", decode(s.keys.p256dh), { name: "ECDH", namedCurve: "P-256" }, false, []);
  return { endpoint: url.href, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

export async function pushRoute(request, env, data) {
  const path = new URL(request.url).pathname;
  if (path === "/api/push/config" && request.method === "GET") return { enabled: configured(env), publicKey: configured(env) ? env.VAPID_PUBLIC_KEY : null };
  if (!configured(env)) return { error: "Les notifications ne sont pas encore activées sur le serveur.", status: 503 };
  if (request.method !== "POST" || !["/api/push/subscribe", "/api/push/unsubscribe", "/api/push/test"].includes(path)) return { error: "Route introuvable", status: 404 };
  const id = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!/^[a-f0-9]{64}$/.test(id)) return { error: "Identifiant d’appareil invalide", status: 401 };
  const now = Date.now();
  const rateKey = "push:" + await digest(request.headers.get("cf-connecting-ip") || "unknown");
  const rate = await env.DB.prepare(`INSERT INTO login_attempts (ip_hash, window_started, attempts) VALUES (?, ?, 1)
    ON CONFLICT(ip_hash) DO UPDATE SET attempts = CASE WHEN window_started < ? THEN 1 ELSE attempts + 1 END,
    window_started = CASE WHEN window_started < ? THEN excluded.window_started ELSE window_started END RETURNING attempts`)
    .bind(rateKey, now, now - 60000, now - 60000).first();
  if (rate.attempts > 30) return { error: "Trop de demandes. Réessaie dans une minute.", status: 429 };
  if (path === "/api/push/unsubscribe") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM push_devices WHERE id = ?").bind(id),
      env.DB.prepare("DELETE FROM push_deliveries WHERE device_id = ?").bind(id),
    ]);
    return { ok: true };
  }
  if (path === "/api/push/test") {
    const row = await env.DB.prepare("SELECT subscription FROM push_devices WHERE id = ?").bind(id).first();
    if (!row) return { error: "Active les rappels sur cet appareil d’abord.", status: 404 };
    const response = await sendPush(env, JSON.parse(row.subscription), { title: "Collo · Test", body: "Les notifications sont prêtes sur ce téléphone.", tag: "collo-test", icon: iconPath(resolveTheme(normaliseAppearance(data.appearance))) });
    if (!response.ok) return { error: "Le service de notification a refusé le test. Réactive les rappels.", status: 502 };
    return { ok: true };
  }
  const text = await request.text();
  if (text.length > 8192) throw new Error("Abonnement trop volumineux");
  const body = JSON.parse(text);
  if (!data.groups.some(g => g.id === body.group) || !Array.isArray(body.reminders) || !body.reminders.length || body.reminders.length > 5 || body.reminders.some(n => !Number.isInteger(n) || n < 0 || n > 10080)) throw new Error("Groupe ou rappels invalides");
  const subscription = await validateSubscription(body.subscription);
  await env.DB.prepare(`INSERT INTO push_devices (id, subscription, group_id, reminders, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET subscription=excluded.subscription, group_id=excluded.group_id, reminders=excluded.reminders, updated_at=excluded.updated_at`)
    .bind(id, JSON.stringify(subscription), body.group, JSON.stringify([...new Set(body.reminders)]), now).run();
  return { ok: true };
}

// All school times are Europe/Paris, even when the phone is abroad (DST included).
export function parisTime(date, time) {
  const target = Date.parse(`${date}T${time}:00Z`);
  const format = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let result = target;
  for (let i = 0; i < 3; i++) {
    const local = Date.parse(format.format(new Date(result)).replace(" ", "T") + "Z");
    result += target - local;
  }
  return result;
}
export function eventsFor(data, group) {
  return data.slots.flatMap((slot, slotIndex) => slot.group_by_week.flatMap((g, i) => {
    if (g !== group || !data.weeks[i]) return [];
    const day = DAYS.indexOf(slot.day);
    if (day < 0) return [];
    const date = new Date(data.weeks[i].start + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + day);
    const starts = parisTime(date.toISOString().slice(0, 10), slot.start);
    return [{ ...slot, starts, key: `${data.weeks[i].id}:${slotIndex}:${starts}:${slot.subject}` }];
  }));
}
export async function dispatchReminders(env, data, now = Date.now()) {
  if (!configured(env)) return;
  let after = "";
  while (true) {
    const { results } = await env.DB.prepare("SELECT * FROM push_devices WHERE id > ? ORDER BY id LIMIT 100").bind(after).all();
    if (!results.length) break;
    for (const device of results) {
      for (const event of eventsFor(data, device.group_id)) {
        for (const minutes of JSON.parse(device.reminders)) {
          const due = event.starts - minutes * 60000;
          if (due > now || due < now - 300000 || event.starts < now - 60000 || device.updated_at > due) continue;
          const key = `${event.key}:${minutes}`;
          const claim = await env.DB.prepare(`INSERT INTO push_deliveries (device_id, event_key, claimed_at, sent) VALUES (?, ?, ?, 0)
            ON CONFLICT(device_id, event_key) DO UPDATE SET claimed_at=excluded.claimed_at WHERE sent=0 AND claimed_at < ?`)
            .bind(device.id, key, now, now - 120000).run();
          if (!claim.meta.changes) continue;
          try {
            const response = await sendPush(env, JSON.parse(device.subscription), {
              title: `Collo · ${event.subject}`, tag: key, icon: iconPath(resolveTheme(normaliseAppearance(data.appearance), parisDate(new Date(now)))),
              body: `G${device.group_id} · ${event.day} à ${event.start} · ${event.examiner}${event.room ? " · Salle " + event.room : ""}`,
            });
            if (response.status === 404 || response.status === 410) {
              await env.DB.prepare("DELETE FROM push_devices WHERE id = ?").bind(device.id).run();
            } else if (!response.ok) throw new Error("Push HTTP " + response.status);
            await env.DB.prepare("UPDATE push_deliveries SET sent=1 WHERE device_id=? AND event_key=?").bind(device.id, key).run();
          } catch {
            // Do not log device endpoints/keys; retry in the next cron window.
            console.error("Échec d’un envoi push; nouvelle tentative au prochain passage.");
            await env.DB.prepare("UPDATE push_deliveries SET claimed_at=0 WHERE device_id=? AND event_key=? AND sent=0").bind(device.id, key).run();
          }
        }
      }
    }
    after = results.at(-1).id;
  }
  await env.DB.prepare("DELETE FROM push_deliveries WHERE claimed_at < ?").bind(now - 8 * 86400000).run();
}
