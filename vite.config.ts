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

/**
 * Distribution flavor (Phase 2 enterprise gating).
 *
 *   "" / unset → public build. Every feature is reachable; users pick a
 *                preset in onboarding, optional policy.json overrides.
 *   "enterprise" → locked build for shared / company devices. The bundle
 *                  treats the workspace as if a `work-strict` policy were
 *                  always in effect. Users CANNOT open the preset picker
 *                  or re-enable Sync/AI/Export from the UI; a real
 *                  policy.json may still loosen specific flags (e.g.
 *                  re-enable AI for an internal Azure OpenAI), but the
 *                  baseline is locked down.
 *
 * The renderer reads `import.meta.env.CADENCE_DISTRIBUTION` (typed in
 * `src/vite-env.d.ts`). Compile-time literal substitution lets Vite
 * dead-code-eliminate the user-facing preset picker in the locked build
 * — `import.meta.env.CADENCE_DISTRIBUTION !== 'enterprise' && …` collapses
 * to `false` so the trailing JSX is dropped from the bundle.
 *
 * For deeper audit confidence (no sync/AI code at ALL in the binary)
 * we'd need to lazy-load the Cloud + AI modules behind dynamic imports
 * gated on the same env. That's a future tightening; runtime gating is
 * the immediate guarantee. See docs/ENTERPRISE.md.
 */
const distribution = (process.env.CADENCE_DISTRIBUTION || '').toLowerCase();
const isEnterprise = distribution === 'enterprise';

// In PWA builds the GitHub-Pages deploy expects the SPA assets to sit under
// `/cadence/app/`. We honour that by emitting straight into `dist/app/` so
// the same `dist/` directory can also receive the marketing landing's
// static files at its root and be uploaded as a single artifact.
const outDir = isPwa ? 'dist/app' : 'dist';

function isReactCoreVendor(id: string): boolean {
  return /node_modules\/(react|react-dom|scheduler)(\/|$)/.test(id);
}

export default defineConfig({
  plugins: [react()],
  base,
  define: {
    'import.meta.env.CADENCE_PWA': JSON.stringify(isPwa ? '1' : ''),
    'import.meta.env.LEEADMAN_PWA': JSON.stringify(isPwa ? '1' : ''),
    'import.meta.env.CADENCE_DISTRIBUTION': JSON.stringify(isEnterprise ? 'enterprise' : ''),
  },
  server: { port: 5173, strictPort: true },
  // esbuild 0.28+ errors when pre-bundling deps for legacy Safari targets because
  // it cannot downlevel destructuring (https://github.com/evanw/esbuild/issues/4436).
  // Our runtime targets (Electron + modern browsers) support destructuring natively.
  optimizeDeps: {
    esbuildOptions: {
      supported: {
        destructuring: true,
      },
    },
  },
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
          // Vendor splitting yields better long-term caching, parallel download,
          // and keeps each chunk under Vite's 500 kB advisory limit.
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router')) return 'vendor-router';
          if (
            id.includes('react-markdown') ||
            id.includes('remark-') ||
            id.includes('micromark') ||
            id.includes('mdast-') ||
            id.includes('unified') ||
            id.includes('vfile') ||
            id.includes('hast-')
          ) {
            return 'vendor-markdown';
          }
          if (isReactCoreVendor(id)) return 'vendor-react';
          if (id.includes('@tiptap/') || id.includes('/prosemirror-')) {
            return 'vendor-richtext';
          }
          if (id.includes('@codemirror') || id.includes('/codemirror/') || id.includes('/lezer-')) {
            return 'vendor-codemirror';
          }
          if (id.includes('/yaml/') || id.includes('yaml/dist')) return 'vendor-yaml';
          return 'vendor-misc';
        },
      },
    },
  },
  esbuild: {
    supported: {
      destructuring: true,
    },
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
