/* Leeadman PWA service worker.
 *
 * Strategy:
 *  - Cache the app shell (HTML + manifest + icons) on install
 *  - "Network-first" for navigation requests (so a freshly deployed build is
 *    picked up as soon as the device is online; falls back to cache offline)
 *  - "Stale-while-revalidate" for build assets (hashed JS/CSS chunks)
 *  - Bumping CACHE_VERSION wipes old caches on activate. Vite hashes assets
 *    already, so we usually just bump this if we change the SW logic itself.
 *
 * Note: The Electron host never registers this SW, only the deployed web build
 * does (main.tsx checks LEEADMAN_PWA flag + presence of `serviceWorker` API).
 */

const CACHE_VERSION = 'v6-ai-textarea';
const CACHE_NAME = `leeadman-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isAsset(url) {
  return /\/assets\/.+\.(js|css|woff2?|png|jpg|jpeg|svg|gif|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first, fallback to cached index.html for offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((c) => c || Response.error())),
    );
    return;
  }

  // Hashed build assets: stale-while-revalidate.
  if (isAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      }),
    );
    return;
  }

  // Everything else: cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
