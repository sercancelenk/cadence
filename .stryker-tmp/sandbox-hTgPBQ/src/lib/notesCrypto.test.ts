/**
 * Round-trip and failure-mode tests for workspace Notes cryptography.
 * Uses jsdom Web Crypto (same as production renderer).
 */
// @ts-nocheck


import { describe, expect, it } from 'vitest';
import { NOTES_VERIFIER_PLAINTEXT, NOTES_VERIFIER_PLAINTEXT_LEGACY } from './appBranding';
import {
  createNotesLock,
  decryptBodyWithMaster,
  encryptBodyWithMaster,
  unlockMaster,
  unwrapPassphraseFromRecovery,
  wrapPassphraseForRecovery,
  type NotesLock,
} from './notesCrypto';

const PASS = 'correct horse battery staple';
const ACCOUNT = 'account-password-123';

describe('notesCrypto workspace lock', () => {
  it('creates a lock and unlocks with the same passphrase', async () => {
    const { lock, masterKey } = await createNotesLock(PASS);
    expect(lock.saltB64).toBeTruthy();
    expect(lock.verifierIvB64).toBeTruthy();
    expect(lock.verifierCipherB64).toBeTruthy();

    const unlocked = await unlockMaster(PASS, lock);
    expect(unlocked).not.toBeNull();

    const wrong = await unlockMaster('wrong-pass', lock);
    expect(wrong).toBeNull();

    // Returned key should encrypt/decrypt note bodies.
    const cipher = await encryptBodyWithMaster(masterKey, 'Secret note body');
    const plain = await decryptBodyWithMaster(masterKey, cipher);
    expect(plain).toBe('Secret note body');
  });

  it('returns null when decrypting with wrong master key', async () => {
    const { lock } = await createNotesLock(PASS);
    const { masterKey: otherKey } = await createNotesLock('other passphrase');
    const cipher = await encryptBodyWithMaster(otherKey, 'hidden');
    const unlocked = await unlockMaster(PASS, lock);
    expect(unlocked).not.toBeNull();
    const plain = await decryptBodyWithMaster(unlocked!, cipher);
    expect(plain).toBeNull();
  });

  it('accepts legacy verifier plaintext on unlock', async () => {
    const { lock } = await createNotesLock(PASS);
    const c = crypto;
    const salt = Uint8Array.from(atob(lock.saltB64), (ch) => ch.charCodeAt(0));
    const baseKey = await c.subtle.importKey(
      'raw',
      new TextEncoder().encode(PASS),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    const derived = await c.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const iv = c.getRandomValues(new Uint8Array(12));
    const verifierCipher = await c.subtle.encrypt(
      { name: 'AES-GCM', iv },
      derived,
      new TextEncoder().encode(NOTES_VERIFIER_PLAINTEXT_LEGACY),
    );
    const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const legacyLock: NotesLock = {
      saltB64: lock.saltB64,
      verifierIvB64: b64(iv),
      verifierCipherB64: b64(verifierCipher),
    };
    expect(await unlockMaster(PASS, legacyLock)).not.toBeNull();
    expect(NOTES_VERIFIER_PLAINTEXT).toBe('cadence-notes-v1');
  });
});

describe('notesCrypto recovery envelope', () => {
  it('wraps and unwraps the notes passphrase with account password', async () => {
    const recovery = await wrapPassphraseForRecovery(PASS, ACCOUNT);
    expect(recovery.saltB64).toBeTruthy();

    const recovered = await unwrapPassphraseFromRecovery(recovery, ACCOUNT);
    expect(recovered).toBe(PASS);

    const wrong = await unwrapPassphraseFromRecovery(recovery, 'wrong-account');
    expect(wrong).toBeNull();
  });
});

describe('notesCrypto encrypt/decrypt round-trip', () => {
  it('produces distinct IVs on each encryption', async () => {
    const { masterKey } = await createNotesLock(PASS);
    const a = await encryptBodyWithMaster(masterKey, 'same text');
    const b = await encryptBodyWithMaster(masterKey, 'same text');
    expect(a.ivB64).not.toBe(b.ivB64);
    expect(await decryptBodyWithMaster(masterKey, a)).toBe('same text');
    expect(await decryptBodyWithMaster(masterKey, b)).toBe('same text');
  });
});
