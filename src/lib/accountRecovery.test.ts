import { describe, expect, it } from 'vitest';
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  isRecoveryEnvelope,
  normalizeRecoveryCode,
  normalizeRecoveryCodes,
  randomRecoveryProofSecret,
  unwrapRecoverySecret,
  wrapRecoverySecret,
} from './accountRecovery';

describe('accountRecovery', () => {
  it('generates distinct readable codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    const norms = new Set(codes.map(normalizeRecoveryCode));
    expect(norms.size).toBe(RECOVERY_CODE_COUNT);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    }
  });

  it('normalizes codes case- and dash-insensitively', () => {
    expect(normalizeRecoveryCode('abcd-efgh')).toBe('ABCDEFGH');
    // Sorted for stable PBKDF2 material regardless of input order.
    expect(normalizeRecoveryCodes(['zzzz-aaaa', 'bbbb-cccc'])).toEqual(['BBBBCCCC', 'ZZZZAAAA']);
  });

  it('round-trips wrap / unwrap', async () => {
    const codes = generateRecoveryCodes();
    const secret = randomRecoveryProofSecret();
    const envelope = await wrapRecoverySecret(secret, codes);
    expect(isRecoveryEnvelope(envelope)).toBe(true);
    const got = await unwrapRecoverySecret(envelope, codes);
    expect(got).not.toBeNull();
    expect(Array.from(got!)).toEqual(Array.from(secret));
  });

  it('accepts codes in any order', async () => {
    const codes = generateRecoveryCodes();
    const secret = randomRecoveryProofSecret();
    const envelope = await wrapRecoverySecret(secret, codes);
    const shuffled = [...codes].reverse();
    const got = await unwrapRecoverySecret(envelope, shuffled);
    expect(got).not.toBeNull();
  });

  it('returns null on wrong codes', async () => {
    const codes = generateRecoveryCodes();
    const secret = randomRecoveryProofSecret();
    const envelope = await wrapRecoverySecret(secret, codes);
    const wrong = codes.map((c, i) => (i === 0 ? 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' : c));
    const got = await unwrapRecoverySecret(envelope, wrong);
    expect(got).toBeNull();
  });

  it('cross-compat with Electron main-process wrap / unwrap', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const nodeRecovery = require('../../electron/accountRecovery.cjs') as {
      wrapRecoverySecret: (secret: Buffer, codes: string[]) => import('./accountRecovery').RecoveryEnvelope;
      unwrapRecoverySecret: (
        envelope: import('./accountRecovery').RecoveryEnvelope,
        codes: string[],
      ) => Buffer | null;
    };
    const codes = generateRecoveryCodes();
    const secret = randomRecoveryProofSecret();

    const rendererEnvelope = await wrapRecoverySecret(secret, codes);
    const nodeUnwrappedFromRenderer = nodeRecovery.unwrapRecoverySecret(rendererEnvelope, codes);
    expect(nodeUnwrappedFromRenderer).not.toBeNull();
    expect(Array.from(nodeUnwrappedFromRenderer!)).toEqual(Array.from(secret));

    const nodeEnvelope = nodeRecovery.wrapRecoverySecret(Buffer.from(secret), codes);
    const rendererUnwrappedFromNode = await unwrapRecoverySecret(nodeEnvelope, codes);
    expect(rendererUnwrappedFromNode).not.toBeNull();
    expect(Array.from(rendererUnwrappedFromNode!)).toEqual(Array.from(secret));
  });
});
