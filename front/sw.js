// Cache only the app shell. Never cache API calls or admin responses.
const CACHE = "collo-shell-v1";
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./config.js", "./notifications.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith("collo-shell-") && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !SHELL.some(p => new URL(p, self.registration.scope).pathname === url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
self.addEventListener("push", event => event.waitUntil((async () => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  await self.registration.showNotification(payload.title || "Collo", {
    body: payload.body || "Un rappel de colle est disponible.", tag: payload.tag || "collo",
    icon: "./icons/icon-192.png", badge: "./icons/icon-192.png", data: { url: self.registration.scope },
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
