import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  APP_NAME_LEGACY,
  APP_SLUG,
  APP_SLUG_LEGACY,
  brandIconUrl,
  DATA_FILE_PREFIX,
  DATA_FILE_PREFIX_LEGACY,
  LOG_TAG,
  NOTES_VERIFIER_PLAINTEXT,
  NOTES_VERIFIER_PLAINTEXT_LEGACY,
  publicAssetUrl,
  STORAGE_PREFIX,
  STORAGE_PREFIX_LEGACY,
  SYNC_FINGERPRINT,
  SYNC_FINGERPRINT_LEGACY,
} from './appBranding';

describe('appBranding constants', () => {
  it('exposes canonical and legacy product names', () => {
    expect(APP_NAME).toBe('Cadence');
    expect(APP_NAME_LEGACY).toBe('Leeadman');
    expect(APP_SLUG).toBe('cadence');
    expect(APP_SLUG_LEGACY).toBe('leeadman');
  });

  it('derives storage and sync identifiers from the slug', () => {
    expect(LOG_TAG).toBe('[cadence]');
    expect(DATA_FILE_PREFIX).toBe('cadence');
    expect(DATA_FILE_PREFIX_LEGACY).toBe('leeadman');
    expect(STORAGE_PREFIX).toBe('cadence');
    expect(STORAGE_PREFIX_LEGACY).toBe('leeadman');
    expect(SYNC_FINGERPRINT).toBe('cadence-sync');
    expect(SYNC_FINGERPRINT_LEGACY).toBe('leeadman-sync');
  });

  it('keeps notes verifier strings stable for migration', () => {
    expect(NOTES_VERIFIER_PLAINTEXT).toBe('cadence-notes-v1');
    expect(NOTES_VERIFIER_PLAINTEXT_LEGACY).toBe('leeadman-notes-v2');
  });
});

describe('publicAssetUrl', () => {
  it('joins default base with asset name', () => {
    const url = publicAssetUrl('icon.svg');
    expect(url.endsWith('icon.svg')).toBe(true);
    expect(url.startsWith('/')).toBe(true);
  });

  it('strips leading slash from asset name', () => {
    expect(publicAssetUrl('/icon.svg')).toBe(publicAssetUrl('icon.svg'));
  });
});

describe('brandIconUrl', () => {
  it('points at icon.svg', () => {
    expect(brandIconUrl()).toBe(publicAssetUrl('icon.svg'));
  });
});
