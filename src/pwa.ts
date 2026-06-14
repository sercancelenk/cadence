/**
 * Registers the PWA service worker in the deployed web build and skips
 * registration in the Electron host (where it is unnecessary and `file://`
 * scope is incompatible with the SW API).
 *
 * Update strategy: when a new SW is detected we ask it to skipWaiting so it
 * activates immediately, but we deliberately DO NOT call `location.reload()`
 * on `controllerchange`. Reloading mid-session breaks any client-side route
 * the SPA is currently on (e.g. /leeadman/login pushed via React Router) —
 * the browser would do a real fetch of that URL and, depending on the host,
 * return 404 from the static host. The new SW will start serving on the next
 * real navigation; that's enough for "silent" updates without losing state.
 */

function shouldRegister(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  // Electron host injects `window.cadence` (and `window.leeadman` as a
  // backwards-compatibility alias) — either presence means we are inside
  // Electron and a service worker is neither useful nor compatible.
  const w = window as unknown as { cadence?: unknown; leeadman?: unknown };
  if (w.cadence || w.leeadman) return false;
  // file:// and chrome:// scopes cannot host a SW.
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return false;
  // We register the service worker whenever the runtime is an actual
  // browser (http/https + no Electron bridge), rather than gating on an
  // explicit `CADENCE_PWA=1` build flag. The manifest and `sw.js` are
  // bundled in dist/ for every build target, so the install flow works
  // wherever the bundle is served from a real origin.
  return true;
}

export function registerServiceWorker(): void {
  if (!shouldRegister()) return;

  const swUrl = `${import.meta.env.BASE_URL || '/'}sw.js`;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL || '/' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[cadence] service worker registration failed:', err);
      });
  });
}
