/* Cadence PWA service worker.
 *
 * Strategy:
 *  - Cache the app shell (HTML + manifest + icons) on install
 *  - "Network-first" for navigation requests (so a freshly deployed build is
 *    picked up as soon as the device is online; falls back to cache offline)
 *  - "Stale-while-revalidate" for build assets (hashed JS/CSS chunks)
 *  - Bumping CACHE_VERSION wipes old caches on activate. Vite hashes assets
 *    already, so we usually just bump this if we change the SW logic itself.
 *  - The activate handler deletes any cache whose name doesn't match the
 *    current one — that means the old `leeadman-*` caches from before the
 *    Cadence rename are cleaned up automatically on first activation.
 *
 * Note: The Electron host never registers this SW, only the deployed web build
 * does (main.tsx checks CADENCE_PWA flag + presence of `serviceWorker` API).
 */
// @ts-nocheck


const CACHE_VERSION = 'v30-reminder-reschedule';
const CACHE_NAME = `cadence-${CACHE_VERSION}`;

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
  if (event.data?.type === 'REMINDER_SYNC') {
    event.waitUntil(syncReminderSlots(event.data.slots || []));
  }
  if (event.data?.type === 'REMINDER_CANCEL_ITEM') {
    event.waitUntil(cancelReminderTagsForItem(event.data.itemId));
  }
});

const REMINDER_TAG_PREFIX = 'cadence:';

function reminderTag(slotKey) {
  return REMINDER_TAG_PREFIX + String(slotKey).replace(/\u0001/g, '|');
}

function reminderPath(slot) {
  if (slot.source === 'team-item') return null;
  return `/todos?focus=${encodeURIComponent(slot.itemId)}`;
}

async function cancelReminderTagsForItem(itemId) {
  if (!itemId || typeof itemId !== 'string') return;
  const prefix = `${REMINDER_TAG_PREFIX}${itemId}|`;
  const existing = await self.registration.getNotifications();
  for (const n of existing) {
    if (n.tag && n.tag.startsWith(prefix)) n.close();
  }
}

async function syncReminderSlots(slots) {
  if (!('showTrigger' in Notification.prototype)) return;
  if (Notification.permission !== 'granted') return;

  const desiredTags = new Set(slots.map((s) => reminderTag(s.slotKey)));
  const existing = await self.registration.getNotifications();
  const existingByTag = new Map(
    existing.filter((n) => n.tag && n.tag.startsWith(REMINDER_TAG_PREFIX)).map((n) => [n.tag, n]),
  );

  for (const n of existing) {
    if (n.tag && n.tag.startsWith(REMINDER_TAG_PREFIX) && !desiredTags.has(n.tag)) {
      n.close();
    }
  }

  const now = Date.now();

  for (const slot of slots) {
    const tag = reminderTag(slot.slotKey);
    const path = slot.deepLinkPath || reminderPath(slot);
    const title = slot.title || 'Reminder';
    const body = slot.body || '';
    const prev = existingByTag.get(tag);
    if (prev) {
      const d = prev.data || {};
      if (d.title === title && d.body === body && d.path === path) continue;
      prev.close();
    }
    const fireAt = Date.parse(slot.remindAt);
    if (Number.isNaN(fireAt) || fireAt <= now + 1000) continue;
    await self.registration.showNotification(title, {
      body,
      tag,
      data: { slotKey: slot.slotKey, itemId: slot.itemId, source: slot.source, path, title, body },
      showTrigger: new TimestampTrigger(fireAt),
    });
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.path;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if (path) client.navigate(path);
          return client.focus();
        }
      }
      if (path) return self.clients.openWindow(path);
      return self.clients.openWindow('./');
    }),
  );
});

function isAsset(url) {
  return /\/assets\/.+\.(js|css|woff2?|png|jpg|jpeg|svg|gif|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the LAN sync server's data endpoints. When this PWA is
  // installed from the desktop's host (`https://<lan-ip>:9787/`) the
  // worker shares an origin with `/v1/snapshot` and `/v1/ping`, and a
  // cache-first hit on `/v1/snapshot` would freeze the device on a stale
  // workspace forever. Skip the SW entirely for those paths.
  if (url.pathname.startsWith('/v1/')) return;

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
