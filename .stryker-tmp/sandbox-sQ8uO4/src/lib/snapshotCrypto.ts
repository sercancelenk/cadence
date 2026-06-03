/**
 * Snapshot encryption for cloud sync backends.
 *
 * Threat model
 * ============
 *
 * Cloud storage providers (Google Drive, OneDrive, S3, …) are
 * **untrusted custodians**. They store our snapshot bytes, replicate
 * them across data centres, hand them back on request, and — in the
 * worst case — can be compelled (subpoena, breach, rogue insider) to
 * reveal them.
 *
 * Cadence's promise is "your data is yours". To make that real for
 * cloud sync we encrypt the entire snapshot **client-side** before it
 * ever touches the network. The provider sees opaque bytes; only the
 * user's passphrase / account key can decrypt them.
 *
 * This module is the single source of truth for that boundary. Every
 * cloud sync backend (`gdrive`, future `onedrive`, future `s3`, …)
 * MUST go through `wrapSnapshot` on push and `unwrapSnapshot` on pull.
 *
 * Crypto choices
 * ==============
 *
 * - **KDF**: PBKDF2-SHA-256, 200 000 iterations. Mirrors the existing
 *   `notesCrypto` parameters so the codebase has ONE KDF profile to
 *   audit (no scrypt — we'd need a JS implementation and Web Crypto
 *   doesn't ship scrypt natively).
 *
 * - **Cipher**: AES-256-GCM with a fresh 12-byte IV per encryption.
 *   Built-in authentication tag detects tampering / wrong password
 *   without a separate MAC step.
 *
 * - **Compression**: gzip via `CompressionStream` when available.
 *   Snapshots compress 3-6× in practice (JSON with repeated keys);
 *   over a slow mobile uplink that matters. We gracefully skip
 *   compression on platforms where the API is missing (iOS < 16.4):
 *   slightly larger blobs but still correct.
 *
 * - **Salt**: fresh per-snapshot. Yes, this re-runs PBKDF2 on every
 *   push — 100–300 ms on a modern CPU. Acceptable trade-off because
 *   sync runs at minute-scale, not per-keystroke. It also means that
 *   two snapshots written from the same passphrase do not share key
 *   material, which is the conventional crypto hygiene.
 *
 * Versioned blob layout
 * =====================
 *
 *   off  len  field
 *   0    4    magic = "CDNS" (ASCII)
 *   4    2    format version (uint16 LE)        current: 1
 *   6    1    KDF id                            1 = PBKDF2-SHA256-200k
 *   7    1    salt length                       always 16 in v1
 *   8    N    salt (random)
 *   8+N  12   IV  (random, AES-GCM nonce)
 *   ...  ..   AES-GCM ciphertext (gzip(JSON(data)) || 16-byte auth tag)
 *
 * The magic prefix lets the caller detect "is this even a Cadence
 * snapshot file?" before attempting PBKDF2 (wrong password vs wrong
 * file shows distinct errors to the user). The version + KDF byte
 * give us a graceful upgrade path: a future v2 file could use
 * Argon2id or per-user-key wrapping without breaking the existing
 * decoder — it would just reject with "unsupported format" and
 * prompt the user to update.
 */
// @ts-nocheck


const MAGIC = new Uint8Array([0x43, 0x44, 0x4e, 0x53]); // "CDNS"
const FORMAT_VERSION = 1;
const KDF_PBKDF2_SHA256_200K = 1;
const SALT_LEN = 16;
const IV_LEN = 12;
const ITER = 200_000;
const KEY_LEN = 256;
const HEADER_LEN = 4 /* magic */ + 2 /* version */ + 1 /* kdf */ + 1 /* saltLen */;

/* ------------------------------------------------------------------ */
/* Public surface                                                      */
/* ------------------------------------------------------------------ */

/**
 * Encrypt + serialise an `AppData`-shaped value into a self-contained
 * blob suitable for upload to any cloud backend.
 *
 * Callers should treat the returned `Uint8Array` as opaque bytes.
 * Storing it as binary (`application/octet-stream`) is preferred but
 * base64-wrapping in a text field also works (the magic prefix
 * survives a round-trip through atob/btoa).
 *
 * Throws if the runtime lacks Web Crypto. Cloud sync gates on Web
 * Crypto availability upstream so this should never fire in practice.
 */
export async function wrapSnapshot(
  data: unknown,
  passphrase: string,
): Promise<Uint8Array> {
  if (!passphrase) throw new Error('snapshotCrypto: empty passphrase');
  const c = getCrypto();
  const salt = c.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = c.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(passphrase, salt);
  const json = new TextEncoder().encode(JSON.stringify(data));
  const compressed = await compress(json);
  const cipher = new Uint8Array(
    await c.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      compressed as unknown as BufferSource,
    ),
  );

  const out = new Uint8Array(HEADER_LEN + SALT_LEN + IV_LEN + cipher.length);
  let p = 0;
  out.set(MAGIC, p); p += MAGIC.length;
  out[p++] = FORMAT_VERSION & 0xff;
  out[p++] = (FORMAT_VERSION >> 8) & 0xff;
  out[p++] = KDF_PBKDF2_SHA256_200K;
  out[p++] = SALT_LEN;
  out.set(salt, p); p += SALT_LEN;
  out.set(iv, p); p += IV_LEN;
  out.set(cipher, p);
  return out;
}

export type UnwrapResult =
  | { kind: 'ok'; data: unknown }
  | { kind: 'not-snapshot' }
  | { kind: 'unsupported-version'; version: number }
  | { kind: 'unsupported-kdf'; kdf: number }
  | { kind: 'wrong-password' }
  | { kind: 'corrupt' };

/**
 * Decrypt + parse a snapshot blob. Discriminated-union return so the
 * UI can show the right message:
 *   - `not-snapshot`     → "this file isn't a Cadence backup"
 *   - `wrong-password`   → "the passphrase doesn't open this snapshot"
 *   - `corrupt`          → "the snapshot is damaged; pick another"
 *   - `unsupported-*`    → "this file was written by a newer build,
 *                         please update Cadence"
 *
 * Never throws on malformed input — that's a strong contract because
 * the input is by definition untrusted (it came from a cloud provider).
 */
export async function unwrapSnapshot(
  blob: Uint8Array,
  passphrase: string,
): Promise<UnwrapResult> {
  if (!hasMagic(blob)) return { kind: 'not-snapshot' };
  if (blob.length < HEADER_LEN + IV_LEN + 16 /* auth tag */) return { kind: 'corrupt' };

  const version = blob[4] | (blob[5] << 8);
  if (version !== FORMAT_VERSION) return { kind: 'unsupported-version', version };

  const kdf = blob[6];
  if (kdf !== KDF_PBKDF2_SHA256_200K) return { kind: 'unsupported-kdf', kdf };

  const saltLen = blob[7];
  // Defend against a malformed file claiming a salt longer than the
  // blob — would otherwise produce a confusing TypedArray exception.
  if (saltLen <= 0 || saltLen > 64) return { kind: 'corrupt' };
  if (blob.length < HEADER_LEN + saltLen + IV_LEN + 16) return { kind: 'corrupt' };

  const salt = blob.slice(HEADER_LEN, HEADER_LEN + saltLen);
  const iv = blob.slice(HEADER_LEN + saltLen, HEADER_LEN + saltLen + IV_LEN);
  const cipher = blob.slice(HEADER_LEN + saltLen + IV_LEN);

  let key: CryptoKey;
  try {
    key = await deriveKey(passphrase, salt);
  } catch {
    return { kind: 'corrupt' };
  }

  let plainCompressed: Uint8Array;
  try {
    plainCompressed = new Uint8Array(
      await getCrypto().subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        cipher as unknown as BufferSource,
      ),
    );
  } catch {
    // AES-GCM tag mismatch ≡ wrong password OR tampered ciphertext.
    // We cannot distinguish — both are "snapshot won't open". Surface
    // it as wrong-password because that's the more common case the
    // user can fix.
    return { kind: 'wrong-password' };
  }

  let plainJson: Uint8Array;
  try {
    plainJson = await decompress(plainCompressed);
  } catch {
    return { kind: 'corrupt' };
  }

  try {
    const data = JSON.parse(new TextDecoder().decode(plainJson));
    return { kind: 'ok', data };
  } catch {
    return { kind: 'corrupt' };
  }
}

/**
 * Inspect the first 8 bytes without attempting decryption. Useful when
 * the UI wants to early-out on "this file isn't a Cadence backup" with
 * a friendlier message than the generic `unwrapSnapshot` failure path,
 * or to display "Format v1 · AES-256-GCM" metadata in a Settings view.
 */
export function peekSnapshotMeta(
  blob: Uint8Array,
): { version: number; kdf: number; saltLen: number } | null {
  if (!hasMagic(blob) || blob.length < HEADER_LEN) return null;
  return {
    version: blob[4] | (blob[5] << 8),
    kdf: blob[6],
    saltLen: blob[7],
  };
}

export function hasMagic(blob: Uint8Array): boolean {
  if (blob.length < MAGIC.length) return false;
  for (let i = 0; i < MAGIC.length; i++) if (blob[i] !== MAGIC[i]) return false;
  return true;
}

/**
 * Constants & helpers for downstream consumers.
 *
 * We deliberately don't export raw values (`MAGIC`, `ITER`) — they are
 * implementation details that change if we bump the format. The
 * `SNAPSHOT_CRYPTO_INFO` object is what the rest of the app uses for
 * version badges and audit logs.
 */
export const SNAPSHOT_CRYPTO_INFO = Object.freeze({
  formatVersion: FORMAT_VERSION,
  kdf: 'PBKDF2-SHA-256',
  kdfIterations: ITER,
  cipher: 'AES-256-GCM',
  saltBits: SALT_LEN * 8,
  ivBits: IV_LEN * 8,
  authTagBits: 128,
} as const);

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

function getCrypto(): Crypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API is not available (cloud sync requires it).');
  }
  return crypto;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const c = getCrypto();
  const base = await c.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as unknown as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return c.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: ITER,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: KEY_LEN },
    /* extractable */ false,
    ['encrypt', 'decrypt'],
  );
}

async function compress(plain: Uint8Array): Promise<Uint8Array> {
  // CompressionStream is widely available in modern browsers and
  // Electron, but iOS < 16.4 and old Safari builds may not ship it.
  // Fallback: send plaintext. Slightly larger blob; everything else
  // (encryption, format, verification) is unchanged.
  if (typeof CompressionStream === 'undefined') return plain;
  try {
    const cs = new CompressionStream('gzip');
    const stream = new Blob([plain as BlobPart]).stream().pipeThrough(cs);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return plain;
  }
}

async function decompress(blob: Uint8Array): Promise<Uint8Array> {
  // Mirror the wrap-side fallback. We try to gunzip; if it fails (the
  // bytes weren't gzipped because the encoder skipped compression),
  // we assume they are raw and pass through.
  if (typeof DecompressionStream === 'undefined') return blob;
  try {
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([blob as BlobPart]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return blob;
  }
}

/* ------------------------------------------------------------------ */
/* Developer self-test                                                 */
/* ------------------------------------------------------------------ */

/**
 * Round-trip smoke test, runnable from a console (`__snapshotCryptoSelfTest()`)
 * during development. Not wired into any UI path — the project doesn't
 * have a unit-test runner yet, but this gives a deterministic way to
 * verify the layer end-to-end after refactors.
 *
 * Returns `{ ok: true }` on success or `{ ok: false, reason }`.
 */
export async function __snapshotCryptoSelfTest(): Promise<{ ok: boolean; reason?: string }> {
  const sample = {
    teams: [{ id: 't1', name: 'Demo' }],
    notes: [{ id: 'n1', title: 'Hello', body: 'World — Türkçe karakterler 🌱' }],
    todoItems: [{ id: 'tdo1', title: 'Ship cloud sync', status: 'todo' }],
  };
  const password = 'correct horse battery staple';

  try {
    const blob = await wrapSnapshot(sample, password);
    if (!hasMagic(blob)) return { ok: false, reason: 'magic missing' };

    const okRes = await unwrapSnapshot(blob, password);
    if (okRes.kind !== 'ok') return { ok: false, reason: `unwrap returned ${okRes.kind}` };
    if (JSON.stringify(okRes.data) !== JSON.stringify(sample)) {
      return { ok: false, reason: 'round-trip mismatch' };
    }

    const wrongRes = await unwrapSnapshot(blob, 'wrong');
    if (wrongRes.kind !== 'wrong-password') {
      return { ok: false, reason: `expected wrong-password, got ${wrongRes.kind}` };
    }

    // Tamper the last byte (auth tag) — must fail.
    const tampered = new Uint8Array(blob);
    tampered[tampered.length - 1] ^= 0x01;
    const tamperedRes = await unwrapSnapshot(tampered, password);
    if (tamperedRes.kind !== 'wrong-password' && tamperedRes.kind !== 'corrupt') {
      return { ok: false, reason: `tamper not detected: ${tamperedRes.kind}` };
    }

    // Non-snapshot bytes must classify cleanly.
    const garbage = new Uint8Array(64);
    const garbageRes = await unwrapSnapshot(garbage, password);
    if (garbageRes.kind !== 'not-snapshot') {
      return { ok: false, reason: `garbage classified as ${garbageRes.kind}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
