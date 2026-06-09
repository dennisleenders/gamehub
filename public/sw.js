// GameVault service worker — hand-rolled, zero deps. Bump CACHE_VERSION to force
// clients to drop old caches after a deploy.
const CACHE_VERSION = "gv-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

// Fallback document for navigations that fail offline. "/" hits the auth gate,
// but offline we just need a real page to render instead of Safari's error.
const SHELL_URLS = ["/"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {})),
  );
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
