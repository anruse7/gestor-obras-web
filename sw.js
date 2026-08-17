/* Service Worker del Gestor de Obras MT/BT.
   Cachea la app (caché de todo menos de la API de datos) para que
   funcione sin conexión. Los datos van a Supabase/IndexedDB, no se cachean. */
const CACHE = 'gestor-obras-v4';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './config.js',
  './data.js',
  './manifest.webmanifest',
  './libs/jszip.min.js',
  './libs/xlsx.full.min.js',
  './libs/jspdf.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  // Nunca cachear llamadas a Supabase
  if (url.indexOf('.supabase.co') >= 0) return;
  // Mismo origen: stale-while-revalidate (sirve caché y actualiza en segundo plano)
  if (url.indexOf(self.location.origin) === 0) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const network = fetch(e.request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request);
    })
  );
});
