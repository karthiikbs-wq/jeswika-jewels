// Jeswika Jewels — Service Worker
// ⚠️ INCREMENT THIS VERSION STRING every time you deploy a new update
// e.g. 'v2', 'v3', 'v4' ...
const CACHE_VERSION = 'jj-v1';
const CACHE_NAME = CACHE_VERSION;

// Files to cache on install
const PRECACHE_URLS = ['/'];

self.addEventListener('install', (event) => {
  // Take over immediately — don't wait for old SW to finish
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => {
      // Tell all open tabs that a new version is active
      self.clients.claim();
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATED' });
        });
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy: always try network, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache a fresh copy
        if (response && response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
