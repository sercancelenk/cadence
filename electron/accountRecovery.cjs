/**
 * Node-side mirror of `src/lib/accountRecovery.ts` for the Electron main process.
 * Keep algorithms byte-identical so envelopes written in the renderer work here
 * and vice versa.
 */

const crypto = require('crypto');

const RECOVERY_CODE_COUNT = 8;
const CODE_GROUPS = 4;
const CODE_GROUP_LEN = 4;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PBKDF2_ITER = 200_000;
const KDF_SALT_LEN = 16;
const DATA_KEY_LEN = 32;

function randomCode() {
  const chars = [];
  const total = CODE_GROUPS * CODE_GROUP_LEN;
  const buf = crypto.randomBytes(total);
  for (let i = 0; i < total; i++) {
    chars.push(CODE_ALPHABET[buf[i] % CODE_ALPHABET.length]);
  }
  const raw = chars.join('');
  const parts = [];
  for (let g = 0; g < CODE_GROUPS; g++) {
    const start = g * CODE_GROUP_LEN;
    parts.push(raw.slice(start, start + CODE_GROUP_LEN));
  }
  return parts.join('-');
}

function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  const out = [];
  const seen = new Set();
  while (out.length < count) {
    const code = randomCode();
    const norm = normalizeRecoveryCode(code);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(code);
  }
  return out;
}

function normalizeRecoveryCode(code) {
  return String(code)
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeRecoveryCodes(codes) {
  return codes.map(normalizeRecoveryCode).filter((c) => c.length > 0).sort();
}

function isRecoveryEnvelope(value) {
  if (!value || typeof value !== 'object') return false;
  return (
    value.v === 1 &&
    typeof value.kdfSaltB64 === 'string' &&
    typeof value.ivB64 === 'string' &&
    typeof value.tagB64 === 'string' &&
    typeof value.ctB64 === 'string'
  );
}

function deriveRecoveryKey(codes, kdfSalt) {
  const normalized = normalizeRecoveryCodes(codes);
  if (normalized.length !== RECOVERY_CODE_COUNT) {
    throw new Error('All recovery codes are required.');
  }
  const material = normalized.join('');
  return crypto.pbkdf2Sync(material, kdfSalt, PBKDF2_ITER, 32, 'sha256');
}

function wrapRecoverySecret(secret, codes) {
  if (!Buffer.isBuffer(secret)) secret = Buffer.from(secret);
  if (secret.length !== DATA_KEY_LEN) {
    throw new Error('Recovery secret must be 32 bytes.');
  }
  const kdfSalt = crypto.randomBytes(KDF_SALT_LEN);
  const iv = crypto.randomBytes(12);
  const key = deriveRecoveryKey(codes, kdfSalt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(secret), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    kdfSaltB64: kdfSalt.toString('base64'),
    ivB64: iv.toString('base64'),
    tagB64: tag.toString('base64'),
    ctB64: ct.toString('base64'),
  };
}

function unwrapRecoverySecret(envelope, codes) {
  if (!isRecoveryEnvelope(envelope)) return null;
  try {
    const kdfSalt = Buffer.from(envelope.kdfSaltB64, 'base64');
    const iv = Buffer.from(envelope.ivB64, 'base64');
    const ct = Buffer.from(envelope.ctB64, 'base64');
    const tag = Buffer.from(envelope.tagB64, 'base64');
    const key = deriveRecoveryKey(codes, kdfSalt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    if (plain.length !== DATA_KEY_LEN) return null;
    return plain;
  } catch {
    return null;
  }
}

module.exports = {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  normalizeRecoveryCode,
  normalizeRecoveryCodes,
  isRecoveryEnvelope,
  wrapRecoverySecret,
  unwrapRecoverySecret,
};
