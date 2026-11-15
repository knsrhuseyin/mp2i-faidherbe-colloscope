/**
 * Outil local de génération des clés VAPID pour les rappels.
 * Sa sortie contient une clé privée destinée aux secrets Cloudflare, pas au dépôt.
 */
// Run locally. Outputs secrets for manual entry in Cloudflare, never commit them.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const privateKey = await crypto.subtle.exportKey("jwk", pair.privateKey);
const publicKey = await crypto.subtle.exportKey("raw", pair.publicKey);
console.log("VAPID_PUBLIC_KEY=" + Buffer.from(publicKey).toString("base64url"));
console.log("VAPID_PRIVATE_KEY=" + privateKey.d);
