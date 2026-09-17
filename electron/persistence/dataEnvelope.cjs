/**
 * On-disk encryption envelope for workspace files and attachment blobs.
 *
 * Format (JSON, one object per file):
 *   { magic, v, alg, binary?, iv, tag, ct }
 *
 * The magic string is part of the file format — changing it would make every
 * existing file unreadable, so it is frozen. Decrypt failures always return
 * `null` rather than throwing: callers treat "cannot read" as "must not
 * overwrite", and an exception escaping here would turn a recoverable state
 * into a crash.
 */

const crypto = require('node:crypto');

/** Frozen: this string identifies every encrypted file we have ever written. */
const DATA_FILE_MAGIC = 'LDMN1';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/** True when the text is one of our encrypted envelopes. */
function isEncryptedEnvelope(text) {
  if (typeof text !== 'string') return false;
  try {
    const o = JSON.parse(text);
    return !!o && o.magic === DATA_FILE_MAGIC && typeof o.iv === 'string' && typeof o.ct === 'string';
  } catch {
    return false;
  }
}

/**
 * Same check as `isEncryptedEnvelope` but cheap-exits on content that cannot
 * be an envelope, so it is safe to call on arbitrary file contents.
 */
function isEncryptedFile(text) {
  if (typeof text !== 'string') return false;
  if (!text.trimStart().startsWith('{')) return false;
  return isEncryptedEnvelope(text);
}

function sealEnvelope(key, data, binary) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([
    binary ? cipher.update(data) : cipher.update(data, 'utf8'),
    cipher.final(),
  ]);
  const envelope = {
    magic: DATA_FILE_MAGIC,
    v: 1,
    alg: 'AES-256-GCM',
    ...(binary ? { binary: true } : {}),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
  return JSON.stringify(envelope);
}

/** @returns {Buffer | null} plaintext bytes, or null when the envelope fails to authenticate. */
function openEnvelope(envelopeText, key) {
  try {
    const o = JSON.parse(envelopeText);
    if (!o || o.magic !== DATA_FILE_MAGIC) return null;
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(o.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(o.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(o.ct, 'base64')), decipher.final()]);
  } catch {
    return null;
  }
}

/** AES-256-GCM encrypt text → the on-disk JSON envelope as a string. */
function encryptPayload(plainText, key) {
  return sealEnvelope(key, plainText, false);
}

/** AES-256-GCM decrypt → the original UTF-8 string, or null on auth failure. */
function decryptPayload(envelopeText, key) {
  const plain = openEnvelope(envelopeText, key);
  return plain === null ? null : plain.toString('utf8');
}

/** AES-256-GCM encrypt binary → same envelope shape, marked `binary: true`. */
function encryptBuffer(buffer, key) {
  return sealEnvelope(key, buffer, true);
}

/** Decrypt a binary envelope → Buffer, or null on auth failure. */
function decryptBuffer(envelopeText, key) {
  return openEnvelope(envelopeText, key);
}

module.exports = {
  DATA_FILE_MAGIC,
  isEncryptedEnvelope,
  isEncryptedFile,
  encryptPayload,
  decryptPayload,
  encryptBuffer,
  decryptBuffer,
};
