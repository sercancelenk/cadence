import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingRecoveryEnvelope,
  readPendingRecoveryEnvelope,
  stashPendingRecoveryEnvelope,
} from './pendingRecoveryEnvelope';
import { STORAGE_PREFIX } from './appBranding';
import type { RecoveryEnvelope } from './accountRecovery';

const KEY = `${STORAGE_PREFIX}-pending-recovery-envelope`;

const ENVELOPE: RecoveryEnvelope = {
  v: 1,
  kdfSaltB64: 'c2FsdA==',
  ivB64: 'aXY=',
  tagB64: 'dGFn',
  ctB64: 'Y3Q=',
};

describe('pendingRecoveryEnvelope', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips a recovery envelope through sessionStorage', () => {
    stashPendingRecoveryEnvelope(ENVELOPE);
    expect(readPendingRecoveryEnvelope()).toEqual(ENVELOPE);
    clearPendingRecoveryEnvelope();
    expect(readPendingRecoveryEnvelope()).toBeNull();
  });

  it('returns null for invalid stored envelopes', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ v: 2 }));
    expect(readPendingRecoveryEnvelope()).toBeNull();
    sessionStorage.setItem(KEY, '{bad json');
    expect(readPendingRecoveryEnvelope()).toBeNull();
  });

  it('swallows sessionStorage failures', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => clearPendingRecoveryEnvelope()).not.toThrow();
  });
});
