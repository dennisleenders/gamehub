// GameVault service worker — hand-rolled, zero deps. Bump CACHE_VERSION to force
// clients to drop old caches after a deploy.
const CACHE_VERSION = "gv-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

// Fallback document for navigations that fail offline. "/" hits the auth gate,
// but offline we just need a real page to render instead of Safari's error.
const SHELL_URLS = ["/"];

self.addEventListener("install", (event) => {
  // NOTE: we deliberately do NOT skipWaiting() here. A new worker waits until the
  // user accepts the in-app "Update available" prompt (RegisterSW.tsx), which
  // posts SKIP_WAITING below — a controlled update instead of swapping chunks out
  // from under a live session.
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {})),
  );
});

// The update prompt asks the waiting worker to activate immediately.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/splash/") ||
    url.pathname === "/icon" ||
    url.pathname === "/apple-icon" ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|webp|svg|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never cache mutations

  const url = new URL(req.url);

  // Only our own origin. Cross-origin (Google Fonts, IGDB images, Supabase) is
  // left entirely to the network.
  if (url.origin !== self.location.origin) return;

  // Never intercept API / auth — always live network, never cached.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth") || url.pathname.includes("/supabase")) {
    return;
  }

  // Navigations: network-first, cached-shell fallback when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const shell = await caches.match("/", { ignoreSearch: true });
          return shell || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })(),
    );
    return;
  }

  // Static assets: cache-first (content-hashed or stable), then network + store.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            const cache = await caches.open(STATIC_CACHE);
            cache.put(req, copy);
          }
          return res;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
  }
  // Everything else: default network handling.
});

// --- Web Push -------------------------------------------------------------
// Payload is { title, body, url } sent by the push-send Edge Function. On iOS
// this only fires for an installed (home-screen) PWA; showNotification is
// mandatory there (userVisibleOnly subscriptions must always show UI).
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* non-JSON push */ }
  const title = data.title || "GameVault";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/192",
      badge: "/icons/192",
      data: { url: data.url || "/" },
    }),
  );
});

// Tapping a notification focuses an open GameVault tab (navigating it to the
// target) or opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          if ("navigate" in client) { try { await client.navigate(target); } catch { /* ignore */ } }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })(),
  );
});
