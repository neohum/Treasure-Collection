/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = "treasure-codex-cache-v1";

declare const __PRECACHE_ASSETS__: string[] | undefined;

const DEFAULT_ASSETS = [
  "./",
  "./index.html",
  "./config.json",
  "./pwa.json",
  "./favicon.svg",
  "./logo.svg",
  "./favicon.ico",
  "./apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/app-icon-192.png",
  "./icons/app-icon-512.png",
];

const PRECACHE_ASSETS: string[] = typeof __PRECACHE_ASSETS__ !== "undefined" ? __PRECACHE_ASSETS__ : DEFAULT_ASSETS;

// Install: precache static assets
self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        for (const asset of PRECACHE_ASSETS) {
          try {
            await cache.add(asset);
          } catch (err) {
            console.warn(`[SW] Precache failed for ${asset}:`, err);
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches & claim clients
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: Network-only for /api/ routes; Cache-first with stale-while-revalidate for assets
self.addEventListener("fetch", (event: FetchEvent) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Only handle GET requests
  if (req.method !== "GET") {
    return;
  }

  // 2. /api/ requests are strictly network-only (never cached)
  if (url.pathname.includes("/api/")) {
    return;
  }

  // 3. Cache first, fallback to network
  event.respondWith(
    caches
      .match(req, { ignoreSearch: true })
      .then((res) => res ?? caches.match(req.url))
      .then((cached) => {
        if (cached) {
          // Background revalidation
          fetch(req)
            .then((networkRes) => {
              if (networkRes && networkRes.status === 200) {
                const resClone = networkRes.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
              }
            })
            .catch(() => {});
          return cached;
        }

      // Not in cache: fetch from network and cache
      return fetch(req)
        .then((networkRes) => {
          if (!networkRes || networkRes.status !== 200) {
            return networkRes;
          }
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return networkRes;
        })
        .catch((err) => {
          console.warn("[SW] Cache miss & fetch failed for:", req.url, "mode:", req.mode, err);
          // If offline and navigating HTML, return index.html
          if (req.mode === "navigate") {
            return caches.match("./index.html").then((r) => r ?? caches.match("./")).then((r) => r ?? caches.match("index.html")) as Promise<Response>;
          }
          return new Response("Offline", { status: 503, statusText: "Offline" });
        });
    })
  );
});
