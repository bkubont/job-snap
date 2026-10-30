/* Job Snap service worker — caches app shell only, never IndexedDB user data. */
const CACHE_NAME = "job-snap-shell-v2";
// On a weak signal, don't wait forever for the network before showing the
// cached screen (the fetch keeps going and refreshes the cache).
const NAVIGATION_TIMEOUT_MS = 4000;
const PRECACHE_URLS = [
  "/",
  "/notes",
  "/export",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            /* ignore missing routes during first install */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("job-snap-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function shouldBypass(request, url) {
  if (request.method !== "GET") return true;
  if (!isSameOrigin(url)) return true;
  // Never cache API / download routes
  if (url.pathname.startsWith("/api/")) return true;
  // Service worker itself
  if (url.pathname === "/sw.js") return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (shouldBypass(request, url)) return;

  // Navigations: network first, fall back to cached shell
  if (request.mode === "navigate") {
    const network = fetch(request).then(async (fresh) => {
      if (fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, fresh.clone());
      }
      return fresh;
    });
    event.waitUntil(network.catch(() => {}));
    event.respondWith(
      (async () => {
        const cachedSame = await caches.match(request);
        if (cachedSame) {
          // Network first, but fall back to this page's cached copy after a timeout.
          const timeout = new Promise((resolve) =>
            setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS),
          );
          try {
            const winner = await Promise.race([network, timeout]);
            if (winner) return winner;
          } catch {
            /* offline */
          }
          return cachedSame;
        }
        try {
          return await network;
        } catch {
          const fallback =
            (await caches.match("/")) || (await caches.match("/export"));
          if (fallback) return fallback;
          return new Response("Job Snap is offline. Open once online to cache the shell.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  // Static assets (_next/static, icons): cache first
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".webmanifest");

  if (isStatic) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          return (
            cached ||
            new Response("", { status: 504, statusText: "Offline" })
          );
        }
      })(),
    );
  }
});
