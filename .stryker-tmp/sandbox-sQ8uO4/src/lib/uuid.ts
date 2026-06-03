// @ts-nocheck
// Tiny UUID helper that replaces the `uuid` npm package (~10 KB minified).
// Every modern target Cadence ships to has `crypto.randomUUID()`:
//   - Electron renderer (Chromium ≥ 92)        — yes
//   - Electron main process  (Node 16+)        — yes (we run Node 20)
//   - PWA browsers (Chrome 92+, Firefox 95+, Safari 15.4+) — yes
//
// We still keep a defensive fallback for the rare case where the API is
// unavailable (e.g. a very old corporate-locked browser). The fallback uses
// `crypto.getRandomValues` and formats per RFC 4122 v4; it is NOT a
// cryptographically-vetted UUID library, just a last-resort polyfill.

export function uuid(): string {
  const g = globalThis as { crypto?: Crypto };
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    const b = new Uint8Array(16);
    g.crypto.getRandomValues(b);
    // Set version (4) and variant (10xx).
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (n) => n.toString(16).padStart(2, '0'));
    return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
  }
  // Math.random is NOT secure, but at this point there's nothing better.
  // The probability of collision for a personal task manager is negligible.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
