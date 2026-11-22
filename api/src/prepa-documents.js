/** A fixed read-only upstream; browser credentials never become upstream URLs. */
const UPSTREAM =
  "https://prepa-sync-huseyin.huseyinkenesari20081.chatgpt.site/api/integrations/collo/documents";
async function sameSecret(value, expected) {
  if (!value || !expected) return false;
  const enc = new TextEncoder(),
    key = await crypto.subtle.importKey(
      "raw",
      enc.encode(expected),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("collo-documents"));
  const test = await crypto.subtle.importKey(
    "raw",
    enc.encode(value),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", test, sig, enc.encode("collo-documents"));
}
async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2000000) {
        await reader.cancel();
        throw new Error("large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    raw.set(c, at);
    at += c.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(raw));
}
export async function prepaDocuments(request, env, fetchImpl = fetch) {
  const path = new URL(request.url).pathname;
  if (!["/api/documents/catalogue", "/api/documents/access"].includes(path)) return null;
  if (request.method !== "GET") return { status: 405, error: "Cet espace est en lecture seule." };
  if (!env.PREPA_SYNC_DOCUMENTS_KEY || !env.PREPA_SYNC_SITE_TOKEN)
    return { status: 503, error: "La connexion à Prépa Sync est en préparation." };
  const token = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (token.length > 200 || !(await sameSecret(token, env.PREPA_SYNC_DOCUMENTS_KEY)))
    return { status: 401, error: "Clé d’accès aux documents requise ou invalide." };
  if (path.endsWith("/access")) return { authenticated: true };
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetchImpl(UPSTREAM, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + env.PREPA_SYNC_DOCUMENTS_KEY,
        "OAI-Sites-Authorization": "Bearer " + env.PREPA_SYNC_SITE_TOKEN,
        Accept: "application/json",
      },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return {
        status: 503,
        error: "Prépa Sync est temporairement indisponible. Réessaie dans un instant.",
      };
    }
    const data = await boundedJson(response);
    if (
      data.schema !== 1 ||
      data.provider !== "prepa-sync" ||
      !Array.isArray(data.documents) ||
      data.documents.length > 500
    )
      throw new Error("invalid");
    return {
      schema: 1,
      provider: "prepa-sync",
      documents: data.documents,
      total: data.documents.length,
      subjects: data.subjects || [],
      updated_at: data.updated_at || null,
      last_heartbeat_at: data.last_heartbeat_at || null,
      stale: !!data.stale,
      truncated: !!data.truncated,
    };
  } catch {
    return {
      status: 503,
      error: "Prépa Sync est temporairement indisponible. Aucun document n’a été modifié.",
    };
  } finally {
    clearTimeout(timer);
  }
}
