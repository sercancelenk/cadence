/**
 * Single source of truth for product-name strings on the Electron side.
 *
 * Mirrors `src/lib/appBranding.ts` for the renderer; we keep two files
 * (instead of importing one from the other) because the renderer is ESM /
 * TypeScript and the Electron main process is CommonJS. The constants
 * MUST stay in sync — if you edit one, edit the other.
 *
 * See `src/lib/appBranding.ts` for the rationale behind each constant.
 */
// @ts-nocheck

'use strict';

const APP_NAME = 'Cadence';
const APP_NAME_LEGACY = 'Leeadman';

const APP_SLUG = 'cadence';
const APP_SLUG_LEGACY = 'leeadman';

const LOG_TAG = `[${APP_SLUG}]`;

const DATA_FILE_PREFIX = APP_SLUG;
const DATA_FILE_PREFIX_LEGACY = APP_SLUG_LEGACY;

const SYNC_FINGERPRINT = `${APP_SLUG}-sync`;
const SYNC_FINGERPRINT_LEGACY = `${APP_SLUG_LEGACY}-sync`;

module.exports = {
  APP_NAME,
  APP_NAME_LEGACY,
  APP_SLUG,
  APP_SLUG_LEGACY,
  LOG_TAG,
  DATA_FILE_PREFIX,
  DATA_FILE_PREFIX_LEGACY,
  SYNC_FINGERPRINT,
  SYNC_FINGERPRINT_LEGACY,
};
