// Cache only the app shell. Never cache API calls or admin responses.
const CACHE = "collo-shell-v4";
const SHELL = ["./", "./index.html", "./style.css", "./appearance.css", "./app.js", "./appearance.js", "./icon-art.mjs", "./manifest-core.mjs", "./icons/badge-hx1.png", "./theme-core.mjs", "./assets/christmas-night.svg", "./assets/christmas-garland.svg", "./assets/christmas-postcard.svg", "./config.js", "./notifications.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
for (const theme of ["midnight", "indigo", "lavender", "polar", "sand", "sage", "christmas", "halloween"]) {
  SHELL.push(`./icons/themes/${theme}.svg`, `./icons/themes/${theme}-192.png`, `./icons/themes/${theme}-512.png`);
}
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith("collo-shell-") && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !SHELL.some(p => new URL(p, self.registration.scope).pathname === url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request, { ignoreSearch: true })));
});
self.addEventListener("push", event => event.waitUntil((async () => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  let icon = new URL("./icons/icon-192.png", self.registration.scope);
  try {
    const candidate = new URL(payload.icon, self.registration.scope);
    if (candidate.origin === icon.origin && candidate.pathname.startsWith(new URL("./icons/", self.registration.scope).pathname)) icon = candidate;
  } catch { /* Keep the default icon for malformed payloads. */ }
  await self.registration.showNotification(payload.title || "Collo", {
    body: payload.body || "Un rappel de colle est disponible.", tag: payload.tag || "collo",
    icon: icon.href, badge: "./icons/badge-hx1.png", data: { url: self.registration.scope },
  });
})()));
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = self.registration.scope;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = windows.find(c => c.url.startsWith(url));
    if (client) { await client.navigate(url); return client.focus(); }
    return self.clients.openWindow(url);
  })());
});
