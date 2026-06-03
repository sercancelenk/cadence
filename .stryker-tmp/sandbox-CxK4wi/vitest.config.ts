// @ts-nocheck
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom gives us Web Crypto + Blob + TextEncoder/Decoder which the
    // snapshot crypto layer relies on. Node's `globalThis.crypto.subtle`
    // is also fine in Node 19+, but jsdom keeps behaviour identical to
    // what we ship in the browser bundle.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.{ts,cjs}'],
    // Vitest defaults already isolate workers; we only need to ensure
    // jsdom is available where snapshot crypto uses CompressionStream
    // (which jsdom polyfills via Node's web streams).
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/core/**'],
      exclude: ['**/*.test.*', '**/vite-env.d.ts'],
      thresholds: {
        lines: 95,
        statements: 90,
        functions: 93,
        branches: 80,
      },
    },
  },
});
