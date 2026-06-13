/**
 * Account recovery codes — local-first password reset without any server.
 *
 * Design constraints
 * ------------------
 * - Optional `recoveryEnvelope` on the account record. Older builds and
 *   accounts without codes ignore it; behaviour is unchanged until the user
 *   saves recovery codes (at sign-up or in Settings).
 * - Same crypto runs in the browser (Web Crypto) and Electron renderer; the
 *   main process mirrors it in `electron/accountRecovery.cjs`.
 * - Desktop: the envelope wraps the 32-byte workspace data-encryption key so a
 *   forgotten password can be rotated without losing encrypted data.
 * - Browser: the envelope wraps a random proof secret (data is not encrypted
 *   with the account password) — codes still gate password reset on that device.
 *
 * Codes are shown once; only the envelope is persisted. Changing the account
 * password clears the envelope — the user must generate fresh codes afterward.
 */

export const RECOVERY_CODE_COUNT = 8;
const CODE_GROUPS = 4;
const CODE_GROUP_LEN = 4;
/** No 0/O, 1/I/L — easier to read aloud and type. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const PBKDF2_ITER = 200_000;
const KDF_SALT_LEN = 16;
const DATA_KEY_LEN = 32;
const IV_LEN = 12;

export type RecoveryEnvelope = {
  v: 1;
  kdfSaltB64: string;
  ivB64: string;
  tagB64: string;
  ctB64: string;
};

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

/** Strip spaces/dashes and uppercase — order-independent matching uses sort(). */
export function normalizeRecoveryCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

export function normalizeRecoveryCodes(codes: string[]): string[] {
  return codes.map(normalizeRecoveryCode).filter((c) => c.length > 0).sort();
}

function randomCode(): string {
  const chars: string[] = [];
  const total = CODE_GROUPS * CODE_GROUP_LEN;
  const buf = crypto.getRandomValues(new Uint8Array(total));
  for (let i = 0; i < total; i++) {
    chars.push(CODE_ALPHABET[buf[i] % CODE_ALPHABET.length]);
  }
  const raw = chars.join('');
  const parts: string[] = [];
  for (let g = 0; g < CODE_GROUPS; g++) {
    const start = g * CODE_GROUP_LEN;
    parts.push(raw.slice(start, start + CODE_GROUP_LEN));
  }
  return parts.join('-');
}

/** Generate human-readable one-time recovery codes. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  while (out.length < count) {
    const code = randomCode();
    const norm = normalizeRecoveryCode(code);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(code);
  }
  return out;
}

function cryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes as Uint8Array<ArrayBuffer>;
  }
  return Uint8Array.from(bytes);
}

async function deriveRecoveryKey(codes: string[], kdfSalt: Uint8Array): Promise<CryptoKey> {
  const normalized = normalizeRecoveryCodes(codes);
  if (normalized.length !== RECOVERY_CODE_COUNT) {
    throw new Error('All recovery codes are required.');
  }
  const material = normalized.join('');
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(material), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: cryptoBytes(kdfSalt), iterations: PBKDF2_ITER, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function isRecoveryEnvelope(value: unknown): value is RecoveryEnvelope {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    o.v === 1 &&
    typeof o.kdfSaltB64 === 'string' &&
    typeof o.ivB64 === 'string' &&
    typeof o.tagB64 === 'string' &&
    typeof o.ctB64 === 'string'
  );
}

/** Wrap a 32-byte secret (data key or browser proof) with recovery codes. */
export async function wrapRecoverySecret(secret: Uint8Array, codes: string[]): Promise<RecoveryEnvelope> {
  if (secret.length !== DATA_KEY_LEN) {
    throw new Error('Recovery secret must be 32 bytes.');
  }
  const kdfSalt = crypto.getRandomValues(new Uint8Array(KDF_SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveRecoveryKey(codes, kdfSalt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: cryptoBytes(iv) }, key, cryptoBytes(secret));
  const raw = new Uint8Array(cipher);
  const ct = raw.slice(0, raw.length - 16);
  const tag = raw.slice(raw.length - 16);
  return {
    v: 1,
    kdfSaltB64: toB64(kdfSalt),
    ivB64: toB64(iv),
    tagB64: toB64(tag),
    ctB64: toB64(ct),
  };
}

/** Unwrap the 32-byte secret; returns null when codes or envelope are wrong. */
export async function unwrapRecoverySecret(envelope: RecoveryEnvelope, codes: string[]): Promise<Uint8Array | null> {
  if (!isRecoveryEnvelope(envelope)) return null;
  try {
    const kdfSalt = fromB64(envelope.kdfSaltB64);
    const iv = fromB64(envelope.ivB64);
    const ct = fromB64(envelope.ctB64);
    const tag = fromB64(envelope.tagB64);
    const key = await deriveRecoveryKey(codes, kdfSalt);
    const combined = new Uint8Array(ct.length + tag.length);
    combined.set(ct, 0);
    combined.set(tag, ct.length);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: cryptoBytes(iv) }, key, cryptoBytes(combined));
    const out = new Uint8Array(plain);
    if (out.length !== DATA_KEY_LEN) return null;
    return out;
  } catch {
    return null;
  }
}

/** Browser-only proof secret when workspace data is not password-encrypted. */
export function randomRecoveryProofSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(DATA_KEY_LEN));
}
