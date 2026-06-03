// @ts-nocheck
// Workspace-master-key cryptography for the Notes view.
//
// Design (revised from the per-note-salt design):
//   - A *workspace* PBKDF2 salt is stored once in `AppData.notesLock`. The
//     user's passphrase + that salt derive a single non-extractable AES-256
//     CryptoKey ("master key"). The master key is held in renderer memory
//     for the rest of the session.
//   - Every locked note ciphertext stores ONLY a fresh 12-byte IV and the
//     AES-GCM ciphertext+tag. No per-note salt — the master key is the same
//     for the whole workspace.
//
// Why we changed from per-note salts:
//   1. PBKDF2 (200k iterations) used to run on every keystroke when editing
//      a locked note, locking up the UI and racing with itself. With one
//      master key, re-encryption is a sub-millisecond AES-GCM call.
//   2. We can stop holding the raw passphrase string in renderer memory.
//      Once the master key is derived we discard the string immediately.
//      The CryptoKey is created with `extractable: false`, so a memory
//      dump can't recover the bytes.
//
// On-disk shapes (see `model.ts`):
//   NotesLock  = { saltB64, verifierIvB64, verifierCipherB64 }
//   NoteCipher = { ivB64, cipherB64 }
//
// Verifier compatibility:
//   New locks created after the Leeadman → Cadence rename use the new
//   `cadence-notes-v1` verifier (`NOTES_VERIFIER_PLAINTEXT`). Older locks
//   on disk used `leeadman-notes-v2`. `unlockMaster` accepts EITHER value
//   so existing locks keep opening; setup always writes the new value.

import { NOTES_VERIFIER_PLAINTEXT, NOTES_VERIFIER_PLAINTEXT_LEGACY } from './appBranding';

const ITER = 200_000;
const KEY_LEN = 256;
const ACCEPTED_VERIFIERS: ReadonlyArray<string> = [
  NOTES_VERIFIER_PLAINTEXT,
  NOTES_VERIFIER_PLAINTEXT_LEGACY,
];

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type NotesLock = {
  /** Base64 PBKDF2 salt for the workspace master key. */
  saltB64: string;
  /** Base64 IV used to encrypt the verifier marker. */
  verifierIvB64: string;
  /** Base64 ciphertext+tag of VERIFIER_PLAINTEXT under the master key. */
  verifierCipherB64: string;
  /**
   * Optional account-password-based recovery envelope. When present, the
   * Notes passphrase itself has been encrypted with a key derived from the
   * user's account password. Lets a forgotten-passphrase user recover by
   * entering their account password instead. See `wrapPassphraseForRecovery`
   * and `unwrapPassphraseFromRecovery`.
   */
  recovery?: PassphraseRecovery;
};

export type PassphraseRecovery = {
  /** PBKDF2 salt for deriving the recovery wrap key from the account password. */
  saltB64: string;
  /** AES-GCM IV used to encrypt the Notes passphrase. */
  ivB64: string;
  /** AES-GCM ciphertext + tag of the Notes passphrase. */
  cipherB64: string;
};

export type NoteCipher = {
  ivB64: string;
  cipherB64: string;
};

function getCrypto(): Crypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API is not available in this context.');
  }
  return crypto;
}

async function deriveMasterKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const c = getCrypto();
  const baseKey = await c.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as unknown as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  // extractable=false: the key bytes are never exposed to JS, so a heap dump
  // can't recover them — Chromium keeps them in a separate crypto-isolated
  // region. The only way to "use" the key is to call subtle.encrypt/decrypt.
  return c.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: ITER, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_LEN },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** First-time setup: create a workspace lock and return the master key for immediate use. */
export async function createNotesLock(
  passphrase: string,
): Promise<{ lock: NotesLock; masterKey: CryptoKey }> {
  const c = getCrypto();
  const salt = c.getRandomValues(new Uint8Array(16));
  const masterKey = await deriveMasterKey(passphrase, salt);
  const verifierIv = c.getRandomValues(new Uint8Array(12));
  // New locks always encrypt the current verifier constant. Existing locks
  // continue to round-trip through `unlockMaster` which accepts both.
  const verifierCipher = await c.subtle.encrypt(
    { name: 'AES-GCM', iv: verifierIv as unknown as BufferSource },
    masterKey,
    new TextEncoder().encode(NOTES_VERIFIER_PLAINTEXT) as unknown as BufferSource,
  );
  return {
    lock: {
      saltB64: toB64(salt),
      verifierIvB64: toB64(verifierIv),
      verifierCipherB64: toB64(verifierCipher),
    },
    masterKey,
  };
}

/**
 * Try to unlock with `passphrase`. Returns the derived master CryptoKey on
 * success, or null if the verifier doesn't match either of the accepted
 * constants (current `cadence-notes-v1` or legacy `leeadman-notes-v2`).
 */
export async function unlockMaster(passphrase: string, lock: NotesLock): Promise<CryptoKey | null> {
  const c = getCrypto();
  let key: CryptoKey;
  try {
    key = await deriveMasterKey(passphrase, fromB64(lock.saltB64));
  } catch {
    return null;
  }
  try {
    const plain = await c.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(lock.verifierIvB64) as unknown as BufferSource },
      key,
      fromB64(lock.verifierCipherB64) as unknown as BufferSource,
    );
    const decoded = new TextDecoder().decode(plain);
    if (!ACCEPTED_VERIFIERS.includes(decoded)) return null;
    return key;
  } catch {
    return null;
  }
}

/** Sub-millisecond per call (no PBKDF2). Generates a fresh 12-byte IV each time. */
export async function encryptBodyWithMaster(masterKey: CryptoKey, body: string): Promise<NoteCipher> {
  const c = getCrypto();
  const iv = c.getRandomValues(new Uint8Array(12));
  const cipher = await c.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    masterKey,
    new TextEncoder().encode(body) as unknown as BufferSource,
  );
  return { ivB64: toB64(iv), cipherB64: toB64(cipher) };
}

export async function decryptBodyWithMaster(
  masterKey: CryptoKey,
  cipher: NoteCipher,
): Promise<string | null> {
  const c = getCrypto();
  try {
    const plain = await c.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(cipher.ivB64) as unknown as BufferSource },
      masterKey,
      fromB64(cipher.cipherB64) as unknown as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/**
 * Derive a (non-extractable) AES-256-GCM key from the account password using
 * the supplied salt. Used to wrap / unwrap the Notes passphrase for the
 * forgotten-passphrase recovery flow. Same PBKDF2 parameters as the master
 * key, but with a separate salt so the account-derived key cannot be confused
 * with the workspace master key.
 */
async function deriveRecoveryKey(accountPassword: string, salt: Uint8Array): Promise<CryptoKey> {
  const c = getCrypto();
  const baseKey = await c.subtle.importKey(
    'raw',
    new TextEncoder().encode(accountPassword) as unknown as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return c.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: ITER, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_LEN },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Wrap (encrypt) the Notes passphrase under a key derived from the user's
 * account password. The resulting envelope can be stored on disk and used
 * later as a recovery path — see `unwrapPassphraseFromRecovery`.
 *
 * Threat model: an attacker who only has the on-disk file still has to brute
 * force either the Notes passphrase OR the account password (whichever is
 * weaker). The recovery does not reveal anything stronger than the existing
 * account password already protected.
 */
export async function wrapPassphraseForRecovery(
  notesPassphrase: string,
  accountPassword: string,
): Promise<PassphraseRecovery> {
  const c = getCrypto();
  const salt = c.getRandomValues(new Uint8Array(16));
  const key = await deriveRecoveryKey(accountPassword, salt);
  const iv = c.getRandomValues(new Uint8Array(12));
  const cipher = await c.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(notesPassphrase) as unknown as BufferSource,
  );
  return { saltB64: toB64(salt), ivB64: toB64(iv), cipherB64: toB64(cipher) };
}

/**
 * Decrypt the Notes passphrase using the user's account password. Returns
 * null when the account password is wrong (AES-GCM tag mismatch).
 */
export async function unwrapPassphraseFromRecovery(
  recovery: PassphraseRecovery,
  accountPassword: string,
): Promise<string | null> {
  const c = getCrypto();
  let key: CryptoKey;
  try {
    key = await deriveRecoveryKey(accountPassword, fromB64(recovery.saltB64));
  } catch {
    return null;
  }
  try {
    const plain = await c.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(recovery.ivB64) as unknown as BufferSource },
      key,
      fromB64(recovery.cipherB64) as unknown as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
