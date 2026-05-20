import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom gives us Web Crypto + Blob + TextEncoder/Decoder which the
    // snapshot crypto layer relies on. Node's `globalThis.crypto.subtle`
    // is also fine in Node 19+, but jsdom keeps behaviour identical to
    // what we ship in the browser bundle.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Vitest defaults already isolate workers; we only need to ensure
    // jsdom is available where snapshot crypto uses CompressionStream
    // (which jsdom polyfills via Node's web streams).
    globals: false,
  },
});
