/**
 * Point d’entrée du Worker : CORS, connexion admin, lecture/sauvegarde du planning et cron.
 * Le synchroniseur Prépa Sync est un projet indépendant ; seuls les rappels de colles restent ici.
 */
import { pushRoute, dispatchReminders } from "./notifications.js";
import { normaliseAppearance } from "../../front/theme-core.mjs";
import { prepaDocuments } from "./prepa-documents.js";
import DEFAULT_DATA from "./default-data.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function allowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

function cors(request, env) {
  const origin = (request.headers.get("origin") || "").replace(/\/$/, "");
  if (!origin || !allowedOrigins(env).has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function originIsAllowed(request, env) {
  const origin = (request.headers.get("origin") || "").replace(/\/$/, "");
  return !origin || allowedOrigins(env).has(origin);
}

function json(request, env, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...cors(request, env), ...extra },
  });
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmac(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  let different = left.length ^ right.length;
  const maximum = Math.max(left.length, right.length, 1);
  for (let index = 0; index < maximum; index += 1) {
    different |=
      (left.charCodeAt(index % Math.max(1, left.length)) || 0) ^
      (right.charCodeAt(index % Math.max(1, right.length)) || 0);
  }
  return different === 0;
}

async function passwordMatches(value, expected) {
  if (typeof value !== "string" || typeof expected !== "string") return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(value)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return safeEqual(base64Url(new Uint8Array(left)), base64Url(new Uint8Array(right)));
}

async function issueToken(env) {
  const expires = String(Math.floor(Date.now() / 1000) + 8 * 60 * 60);
  return `${expires}.${await hmac(expires, env.SESSION_SECRET)}`;
}

async function tokenIsValid(request, env) {
  if (!env.SESSION_SECRET) return false;
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const [expires, signature, extra] = authorization.slice(7).split(".");
  if (!expires || !signature || extra || !/^\d+$/.test(expires)) return false;
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, await hmac(expires, env.SESSION_SECRET));
}

async function hashIp(request) {
  const value = request.headers.get("cf-connecting-ip") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

/** Réserve une tentative par incrément SQL atomique avant toute vérification du mot de passe. */
async function loginIsAllowed(request, env) {
  const ipHash = await hashIp(request);
  const now = Math.floor(Date.now() / 1000);
  // Reserve the attempt before checking the password, including concurrent requests.
  const row = await env.DB.prepare(
    `
    INSERT INTO login_attempts (ip_hash, window_started, attempts)
    VALUES (?, ?, 1)
    ON CONFLICT(ip_hash) DO UPDATE SET
      attempts = CASE WHEN window_started <= ? THEN 1 ELSE attempts + 1 END,
      window_started = CASE WHEN window_started <= ? THEN excluded.window_started ELSE window_started END
    RETURNING attempts
  `,
  )
    .bind(ipHash, now, now - 900, now - 900)
    .first();
  return { allowed: Number(row.attempts) <= 5, ipHash };
}

async function clearLoginAttempts(env, ipHash) {
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip_hash = ?").bind(ipHash).run();
}

function subjectSlug(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (["maths", "math", "mathematique", "mathematiques"].includes(text)) return "mathematiques";
  if (["physique", "physics"].includes(text)) return "physique";
  if (["anglais", "english"].includes(text)) return "anglais";
  if (["francais", "french"].includes(text)) return "francais";
  return text.replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "autre";
}

function daySlug(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 4)
    return ["lundi", "mardi", "mercredi", "jeudi", "vendredi"][value];
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!["lundi", "mardi", "mercredi", "jeudi", "vendredi"].includes(text))
    throw new Error("Jour invalide");
  return text;
}

function validTime(value, field) {
  const result = String(value || "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) throw new Error(`${field} invalide`);
  return result;
}

function validDate(value, field) {
  const result = String(value || "").trim();
  const stamp = Date.parse(`${result}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(stamp) ||
    new Date(stamp).toISOString().slice(0, 10) !== result
  )
    throw new Error(`${field} invalide`);
  return result;
}

/** Valide le planning avant écriture : dates réelles, identifiants uniques, semaines ordonnées et créneaux cohérents. */
function normaliseData(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Le JSON doit contenir un objet");
  if (!Array.isArray(input.weeks) || input.weeks.length < 1 || input.weeks.length > 60)
    throw new Error("Le JSON doit contenir entre 1 et 60 semaines");
  if (!Array.isArray(input.slots) || input.slots.length > 500)
    throw new Error("La liste des créneaux est invalide");

  const weeks = input.weeks.map((week, index) => {
    if (!week || typeof week !== "object") throw new Error("Semaine invalide");
    const id = Number(week.id ?? week.n ?? index + 1);
    if (!Number.isInteger(id) || id < 1 || id > 99) throw new Error("Numéro de semaine invalide");
    const start = validDate(week.start, "Date de début");
    const end = validDate(week.end, "Date de fin");
    if (end < start) throw new Error("Une semaine se termine avant de commencer");
    if (new Date(`${start}T12:00:00Z`).getUTCDay() !== 1)
      throw new Error("Une semaine doit commencer un lundi");
    if (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`) > 6 * 86400000)
      throw new Error("Une semaine ne peut pas dépasser sept jours");
    return { id, label: String(week.label || `S${id}`).slice(0, 30), start, end };
  });
  if (new Set(weeks.map((week) => week.id)).size !== weeks.length)
    throw new Error("Identifiants de semaine dupliqués");
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i].start <= weeks[i - 1].end)
      throw new Error("Semaines non ordonnées ou qui se chevauchent");
  }

  const groups =
    Array.isArray(input.groups) && input.groups.length
      ? input.groups.map((group) => {
          if (group === null) throw new Error("Groupe invalide");
          const id = Number(typeof group === "object" ? group.id : group);
          if (!Number.isInteger(id) || id < 1 || id > 99) throw new Error("Groupe invalide");
          return {
            id,
            label: String((typeof group === "object" && group.label) || `G${id}`).slice(0, 30),
            members_raw: String((typeof group === "object" && group.members_raw) || "").slice(
              0,
              500,
            ),
          };
        })
      : Array.from({ length: 17 }, (_, index) => ({
          id: index + 1,
          label: `G${index + 1}`,
          members_raw: "",
        }));
  const groupIds = new Set(groups.map((group) => group.id));
  if (groupIds.size !== groups.length) throw new Error("Identifiants de groupe dupliqués");

  const slots = input.slots.map((slot, index) => {
    if (!slot || typeof slot !== "object") throw new Error("Créneau invalide");
    const old = Array.isArray(slot);
    const allocation = old ? slot[5] : slot.group_by_week;
    if (!Array.isArray(allocation) || allocation.length !== weeks.length)
      throw new Error(`Le créneau ${index + 1} doit avoir un groupe par semaine`);
    const groupByWeek = allocation.map((value) => {
      if (value === null || value === undefined || value === "" || Number(value) === 0) return null;
      const id = Number(value);
      if (!Number.isInteger(id) || !groupIds.has(id))
        throw new Error(`Groupe inconnu dans le créneau ${index + 1}`);
      return id;
    });
    const examiner = String(old ? slot[1] : slot.examiner || "")
      .trim()
      .slice(0, 150);
    if (!examiner) throw new Error(`Colleur manquant dans le créneau ${index + 1}`);
    const start = validTime(old ? slot[3] : slot.start, "Heure de début");
    const end = validTime(old ? slot[4] : slot.end, "Heure de fin");
    if (end <= start)
      throw new Error(`Heures du créneau ${index + 1} invalides : la fin doit suivre le début`);
    return {
      subject: subjectSlug(old ? slot[0] : slot.subject),
      examiner,
      day: daySlug(old ? slot[2] : slot.day),
      start,
      end,
      room:
        old || slot.room === null || slot.room === undefined
          ? null
          : String(slot.room).trim().slice(0, 100) || null,
      group_by_week: groupByWeek,
    };
  });

  return {
    appearance: normaliseAppearance(input.appearance),
    schema_version: 1,
    source: String(input.source || "Mise à jour depuis l’administration").slice(0, 240),
    title: String(input.title || "Colloscope").slice(0, 160),
    class: String(input.class || "MP2I").slice(0, 50),
    semester: Number(input.semester) || 1,
    school_year: String(input.school_year || "").slice(0, 30),
    groups,
    weeks,
    slots,
  };
}

async function readCurrentData(env) {
  const row = await env.DB.prepare("SELECT json, updated_at FROM colloscope_data WHERE id = ?")
    .bind(1)
    .first();
  if (row?.json) return { data: normaliseData(JSON.parse(row.json)), updated_at: row.updated_at };
  return { data: normaliseData(DEFAULT_DATA), updated_at: null };
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 2_000_000) throw new Error("Fichier trop volumineux");
  return JSON.parse(text);
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    if (!originIsAllowed(request, env))
      return json(request, env, { error: "Origine refusée" }, 403);
    return new Response(null, { status: 204, headers: cors(request, env) });
  }
  if (!originIsAllowed(request, env)) return json(request, env, { error: "Origine refusée" }, 403);

  const catalogue = await prepaDocuments(request, env);
  if (catalogue) {
    const { status = 200, ...body } = catalogue;
    return json(request, env, body, status);
  }

  if (
    url.pathname.startsWith("/api/documents/") ||
    url.pathname.startsWith("/api/admin/documents")
  ) {
    return json(
      request,
      env,
      {
        error: "Les documents et les réglages de synchronisation sont désormais dans Prépa Sync.",
        dashboard_url: "https://prepa-sync.knsr-family.com/documents",
      },
      410,
    );
  }
  if (url.pathname.startsWith("/api/push/")) {
    const result = await pushRoute(request, env, (await readCurrentData(env)).data);
    const { status = 200, ...body } = result;
    return json(request, env, body, status);
  }
  if (request.method === "GET" && url.pathname === "/")
    return json(request, env, { name: "Colloscope API", ok: true });
  if (request.method === "GET" && url.pathname === "/health")
    return json(request, env, { ok: true });
  if (request.method === "GET" && url.pathname === "/api/colloscope")
    return json(request, env, await readCurrentData(env));
  if (request.method === "GET" && url.pathname === "/api/admin/session")
    return json(request, env, { authenticated: await tokenIsValid(request, env) });

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET)
      return json(request, env, { error: "Administration non configurée" }, 503);
    const state = await loginIsAllowed(request, env);
    if (!state.allowed)
      return json(request, env, { error: "Trop d’essais. Réessaie dans 15 minutes." }, 429);
    const body = await readBody(request);
    if (!(await passwordMatches(body?.password, env.ADMIN_PASSWORD))) {
      return json(request, env, { error: "Mot de passe incorrect" }, 401);
    }
    await clearLoginAttempts(env, state.ipHash);
    return json(request, env, {
      authenticated: true,
      token: await issueToken(env),
      expires_in: 28800,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/admin/colloscope") {
    if (!(await tokenIsValid(request, env)))
      return json(request, env, { error: "Session expirée" }, 401);
    const input = await readBody(request);
    const current = await readCurrentData(env);
    if (!input || !Object.hasOwn(input, "expected_updated_at"))
      return json(request, env, { error: "Recharge le planning avant de l’enregistrer." }, 428);
    if (input.expected_updated_at !== current.updated_at)
      return json(
        request,
        env,
        {
          error:
            "Le planning a été modifié dans une autre session. Exporte ton brouillon puis recharge la page.",
        },
        409,
      );
    // Older clients and planning-only imports must preserve the shared appearance.
    if (input.appearance === undefined) input.appearance = current.data.appearance;
    const data = normaliseData(input);
    const updatedAt = new Date(
      Math.max(Date.now(), (Date.parse(current.updated_at) || 0) + 1),
    ).toISOString();
    const saved = await env.DB.prepare(
      `
      INSERT INTO colloscope_data (id, json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
      WHERE colloscope_data.updated_at IS ?
      RETURNING updated_at
    `,
    )
      .bind(1, JSON.stringify(data), updatedAt, input.expected_updated_at)
      .first();
    if (!saved)
      return json(
        request,
        env,
        {
          error:
            "Le planning a été modifié dans une autre session. Exporte ton brouillon puis recharge la page.",
        },
        409,
      );
    return json(request, env, { ok: true, data, updated_at: updatedAt });
  }

  return json(request, env, { error: "Route introuvable" }, 404);
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      readCurrentData(env).then(({ data }) =>
        dispatchReminders(env, data, controller.scheduledTime),
      ),
    );
  },
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Erreur interne";
      const clientError =
        /invalide|inconnu|manquant|JSON|volumineux|semaine|créneau|groupe|période|thème|apparence|chevauch|document|source|métadonnée|catalogue|lot|adresse|lien|dossier/i.test(
          message,
        );
      return json(
        request,
        env,
        { error: clientError ? message : "Erreur interne" },
        clientError ? 400 : 500,
      );
    }
  },
};

export { normaliseData };
