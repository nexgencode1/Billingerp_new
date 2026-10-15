/* Billing ERP service worker — offline support.
 *
 * Strategy: NETWORK-FIRST for everything we cache, so an online user always gets fresh code and
 * data; the cache is only a fallback when the network is unreachable.
 *  - page navigations      → cached copy of that page, else /offline.html
 *  - /_next/static/*       → cached build assets (JS/CSS/fonts)
 *  - GET /api/products, /api/customers, /api/business → last known data, so billing works offline
 *  - every other /api call → network only (never serve stale balances, reports, etc.)
 * Caches are cleared on logout (the page posts {type: "CLEAR_CACHES"}).
 */
const VERSION = "v1";
const PAGES = `erp-pages-${VERSION}`;
const ASSETS = `erp-assets-${VERSION}`;
const API = `erp-api-${VERSION}`;
const OFFLINE_DATA_APIS = ["/api/products", "/api/customers", "/api/business"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll(["/offline.html"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_CACHES") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

async function networkFirst(request, cacheName, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Customer portal: never cached (different user, different data).
  if (url.pathname.startsWith("/portal") || url.pathname.startsWith("/api/portal")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGES, "/offline.html"));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(networkFirst(request, ASSETS));
    return;
  }
  if (OFFLINE_DATA_APIS.includes(url.pathname)) {
    event.respondWith(networkFirst(request, API));
  }
});
