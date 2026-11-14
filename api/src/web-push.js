// RFC 8291 (aes128gcm) and RFC 8292 (VAPID), using Worker Web Crypto.
const enc = new TextEncoder();
export const decode = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
export const encode = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const concat = (...parts) => new Uint8Array(parts.flatMap(p => [...p]));
async function hkdf(key, salt, info, length) {
  const material = await crypto.subtle.importKey("raw", key, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, material, length * 8));
}
export async function encrypt(subscription, payload) {
  const client = decode(subscription.keys.p256dh);
  const peer = await crypto.subtle.importKey("raw", client, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const server = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, pair.privateKey, 256);
  const ikm = await hkdf(secret, decode(subscription.keys.auth), concat(enc.encode("WebPush: info\0"), client, server), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await hkdf(ikm, salt, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, enc.encode("Content-Encoding: nonce\0"), 12);
  const plaintext = concat(enc.encode(JSON.stringify(payload)), [2]);
  if (plaintext.length + 16 > 3993) throw new Error("Notification trop volumineuse");
  const aes = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plaintext));
  return concat(salt, [0, 0, 16, 0, 65], server, ciphertext);
}
export async function sendPush(env, subscription, payload) {
  const publicKey = decode(env.VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256", x: encode(publicKey.slice(1, 33)), y: encode(publicKey.slice(33)), d: env.VAPID_PRIVATE_KEY,
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const jwt = [encode(enc.encode('{"typ":"JWT","alg":"ES256"}')), encode(enc.encode(JSON.stringify({
    aud: new URL(subscription.endpoint).origin, exp: Math.floor(Date.now() / 1000) + 3600, sub: env.VAPID_SUBJECT,
  })))].join(".");
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(jwt));
  return fetch(subscription.endpoint, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { authorization: `vapid t=${jwt}.${encode(signature)}, k=${env.VAPID_PUBLIC_KEY}`, "content-encoding": "aes128gcm", "content-type": "application/octet-stream", TTL: "300", Urgency: "high" },
    body: await encrypt(subscription, payload),
  });
}
