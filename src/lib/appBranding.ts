/**
 * Single source of truth for product-name strings on the renderer side.
 *
 * Why this exists:
 *   - The product has been renamed once (Leeadman → Cadence) and may be
 *     renamed again. Hard-coding the string in dozens of components made
 *     the last rename a 27-file change. Importing from here means a
 *     future rename touches one file plus a small list of static assets.
 *   - We need to handle the legacy name in a few places (data migration,
 *     legacy-backup imports, accept-both-names probes). Keeping the
 *     legacy strings beside the new ones keeps that logic honest.
 *
 * What this CAN'T do:
 *   - Static files like `package.json` (read by `electron-builder` and
 *     `npm`), `index.html`, `public/manifest.webmanifest`, `public/icon.svg`
 *     and `README.md` can't import from a TS module. Those have to be
 *     updated in lockstep — search for `APP_NAME` here and grep the repo
 *     for matching string literals.
 *
 * Convention:
 *   - `APP_*` constants — the new (canonical) name.
 *   - `APP_*_LEGACY` constants — the previous name; used ONLY where we
 *     need to recognise old data on disk, accept it from peers, or talk
 *     to it diagnostically.
 */

export const APP_NAME = 'Cadence' as const;
export const APP_NAME_LEGACY = 'Leeadman' as const;

/** Lowercase variant used in URL segments, env-var names and CSS prefixes. */
export const APP_SLUG = 'cadence' as const;
export const APP_SLUG_LEGACY = 'leeadman' as const;

/**
 * Prefix used at the start of console messages so logs from different
 * subsystems are easy to grep for in the devtools console.
 */
export const LOG_TAG = `[${APP_SLUG}]` as const;

/**
 * On-disk file name prefix for data files. `*-data-<userId>.json`,
 * `*-accounts.json`, `*-session.json` use this. The legacy prefix is what
 * the pre-rename build wrote; the importer checks both.
 */
export const DATA_FILE_PREFIX = APP_SLUG;
export const DATA_FILE_PREFIX_LEGACY = APP_SLUG_LEGACY;

/**
 * localStorage / sessionStorage key prefix. The legacy prefix is read by
 * the migration shim in the renderer (one-time copy on first launch).
 */
export const STORAGE_PREFIX = APP_SLUG;
export const STORAGE_PREFIX_LEGACY = APP_SLUG_LEGACY;

/**
 * Legacy sync identifier kept for branding/back-compat. It previously tagged
 * the (now removed) LAN sync server's probe responses; retained so the rename
 * window stays consistent with `SYNC_FINGERPRINT_LEGACY`.
 */
export const SYNC_FINGERPRINT = `${APP_SLUG}-sync` as const;
export const SYNC_FINGERPRINT_LEGACY = `${APP_SLUG_LEGACY}-sync` as const;

/**
 * Plaintext encrypted under the Notes master key as a "did the passphrase
 * decrypt correctly?" verifier. NEVER change this casually — any value
 * change invalidates every existing locked-notes lock on disk. The legacy
 * verifier is recognised on read so pre-rename locks keep working.
 */
export const NOTES_VERIFIER_PLAINTEXT = `${APP_SLUG}-notes-v1` as const;
export const NOTES_VERIFIER_PLAINTEXT_LEGACY = 'leeadman-notes-v2' as const;

/**
 * Resolve a `public/`-rooted asset to a URL the renderer can fetch.
 *
 * Vite ships everything under `public/` to the build output root at
 * deploy time, but the served path depends on the configured `base`:
 *   - Electron / `npm run dev`: served from `/`, e.g. `/icon.svg`.
 *   - PWA on GitHub Pages: served from `/cadence/app/`, e.g.
 *     `/cadence/app/icon.svg`.
 * Hard-coding `/icon.svg` in components or in CSS works in dev but
 * 404s once deployed. `import.meta.env.BASE_URL` is the canonical Vite
 * way to bridge that gap, so anything that wants a public asset URL
 * should funnel through here instead of building the string by hand.
 */
export function publicAssetUrl(name: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const trimmedBase = base.endsWith('/') ? base : `${base}/`;
  const trimmedName = name.startsWith('/') ? name.slice(1) : name;
  return `${trimmedBase}${trimmedName}`;
}

/** Convenience wrapper for the brand mark used in the sidebar / hero. */
export function brandIconUrl(): string {
  return publicAssetUrl('icon.svg');
}
