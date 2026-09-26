const CACHE_NAME = 'skate-manager-shell-v2';
const APP_FILES = [
  './',
  './index.html',
  './balancer.html',
  './database.html',
  './credits.html',
  './financials.html',
  './css/balancer.css',
  './css/credits.css',
  './css/database.css',
  './css/financials.css',
  './css/index.css',
  './js/balancer.js',
  './js/credits.js',
  './js/database.js',
  './js/database-modal.js',
  './js/financials.js',
  './js/index.js',
  './manifest.webmanifest',
  './js/supabase-config.js',
  './js/auth-gate.js',
  './js/pwa.js',
  './icons/skate-manager-192.png',
  './icons/skate-manager-512.png',
  './icons/skate-manager-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((name) => name.startsWith('skate-manager-shell-') && name !== CACHE_NAME)
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  // Only cache this app's static files. Supabase requests and other origins
  // remain network-only so private records and auth responses are never stored.
  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  const cacheKey = new URL(requestUrl.pathname, self.location.origin).href;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        await cache.put(cacheKey, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        return (await cache.match(new URL('./index.html', self.location.href).href)) || Response.error();
      }
      return Response.error();
    }
  })());
});
