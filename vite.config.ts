import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build targets:
 *  - Electron (`file://` runtime): we need relative asset paths (`./`).
 *  - GitHub Pages (`https://user.github.io/leeadman/`): assets must resolve
 *    under the repo sub-path. We set this via the `LEEADMAN_PWA` env var so
 *    the same source tree builds both.
 *
 * Set `LEEADMAN_PWA=1` (and optionally `LEEADMAN_BASE=/leeadman/`) when
 * building the web bundle for Pages. The default keeps Electron working.
 */
const isPwa = process.env.LEEADMAN_PWA === '1';
const base = isPwa ? process.env.LEEADMAN_BASE || '/leeadman/' : './';

export default defineConfig({
  plugins: [react()],
  base,
  define: {
    'import.meta.env.LEEADMAN_PWA': JSON.stringify(isPwa ? '1' : ''),
  },
  server: { port: 5173, strictPort: true },
  build: {
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
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
    pure: ['console.debug'],
  },
});
