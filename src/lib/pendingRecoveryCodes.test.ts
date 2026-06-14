import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingRecoveryCodes,
  readPendingRecoveryCodes,
  stashPendingRecoveryCodes,
} from './pendingRecoveryCodes';
import { STORAGE_PREFIX } from './appBranding';

const KEY = `${STORAGE_PREFIX}-pending-recovery-codes`;

describe('pendingRecoveryCodes', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips codes through sessionStorage', () => {
    stashPendingRecoveryCodes(['AAAA-BBBB-CCCC-DDDD', 'EEEE-FFFF-GGGG-HHHH']);
    expect(readPendingRecoveryCodes()).toEqual(['AAAA-BBBB-CCCC-DDDD', 'EEEE-FFFF-GGGG-HHHH']);
    clearPendingRecoveryCodes();
    expect(readPendingRecoveryCodes()).toBeNull();
  });

  it('returns null for malformed stored payloads', () => {
    sessionStorage.setItem(KEY, JSON.stringify(['ok', 42]));
    expect(readPendingRecoveryCodes()).toBeNull();
    sessionStorage.setItem(KEY, 'not-json');
    expect(readPendingRecoveryCodes()).toBeNull();
  });

  it('swallows sessionStorage write failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => stashPendingRecoveryCodes(['AAAA-BBBB-CCCC-DDDD'])).not.toThrow();
    expect(readPendingRecoveryCodes()).toBeNull();
  });
});
