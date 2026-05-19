import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build targets:
 *  - Electron (`file://` runtime): we need relative asset paths (`./`).
 *  - GitHub Pages (`https://<user>.github.io/cadence/app/`): assets must
 *    resolve under the repo sub-path. We set this via the `CADENCE_PWA`
 *    env var so the same source tree builds both.
 *
 * The PWA used to live at `/cadence/` directly. As of the marketing-site
 * launch the static landing page took over that slot and the PWA moved
 * one level deeper to `/cadence/app/`. The landing's index.html catches
 * the legacy `?source=pwa` query string (saved into existing PWA installs
 * via the old manifest) and bounces those users to the new location, so
 * the migration is transparent for already-installed users.
 *
 * Set `CADENCE_PWA=1` (and optionally `CADENCE_BASE=/cadence/app/`) when
 * building the web bundle for Pages. We still accept the legacy `LEEADMAN_*`
 * names for one release cycle so existing CI workflows keep working until
 * they're updated.
 */
const isPwa = process.env.CADENCE_PWA === '1' || process.env.LEEADMAN_PWA === '1';
const base = isPwa
  ? process.env.CADENCE_BASE || process.env.LEEADMAN_BASE || '/cadence/app/'
  : './';

// In PWA builds the GitHub-Pages deploy expects the SPA assets to sit under
// `/cadence/app/`. We honour that by emitting straight into `dist/app/` so
// the same `dist/` directory can also receive the marketing landing's
// static files at its root and be uploaded as a single artifact.
const outDir = isPwa ? 'dist/app' : 'dist';

export default defineConfig({
  plugins: [react()],
  base,
  define: {
    'import.meta.env.CADENCE_PWA': JSON.stringify(isPwa ? '1' : ''),
    'import.meta.env.LEEADMAN_PWA': JSON.stringify(isPwa ? '1' : ''),
  },
  server: { port: 5173, strictPort: true },
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    // Drop noisy logs from production bundles. Errors and warnings stay so
    // diagnostic info still surfaces in the renderer console / Sentry-style
    // tooling later.
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor splitting yields better long-term caching and parallel
          // download. React + Router are cached separately from the page-
          // specific chunks, and the Markdown stack rides with the People
          // route only.
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('react-markdown') || id.includes('remark-') || id.includes('micromark') || id.includes('mdast-') || id.includes('unified') || id.includes('vfile') || id.includes('hast-')) return 'vendor-markdown';
          if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
          return 'vendor-misc';
        },
      },
    },
  },
  esbuild: {
    // In production we strip all `debugger` statements plus the chatty
    // `console.log`/`console.info`/`console.debug` calls. We keep
    // `console.warn` and `console.error` so real problems are still visible
    // in the user's devtools console (and in Sentry-style breadcrumbs if we
    // ever add them).
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
    pure:
      process.env.NODE_ENV === 'production'
        ? ['console.debug', 'console.log', 'console.info']
        : ['console.debug'],
  },
});
