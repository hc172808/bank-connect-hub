// Virtual Bank Service Worker
// Minimal offline shell + network-first caching for the SPA.
//
// Bump CACHE_VERSION whenever the build output materially changes so the
// service worker installs a fresh cache on next visit.
const CACHE_VERSION = "vb-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET requests from same origin.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache Supabase or auth calls.
  if (url.pathname.startsWith("/auth") || url.hostname.includes("supabase")) return;

  // Navigation requests → network-first, fall back to cached shell (offline support).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match("/index.html").then((m) => m || Response.error())),
    );
    return;
  }

  // Static assets → cache-first with background refresh.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    }),
  );
});

// Listen for messages from the page, e.g. to force-refresh.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "CLEAR_CACHES") {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});
