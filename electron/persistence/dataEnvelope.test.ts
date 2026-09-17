import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const {
  DATA_FILE_MAGIC,
  isEncryptedEnvelope,
  isEncryptedFile,
  encryptPayload,
  decryptPayload,
  encryptBuffer,
  decryptBuffer,
} = require('./dataEnvelope.cjs') as {
  DATA_FILE_MAGIC: string;
  isEncryptedEnvelope: (text: unknown) => boolean;
  isEncryptedFile: (text: unknown) => boolean;
  encryptPayload: (plainText: string, key: Buffer) => string;
  decryptPayload: (envelope: string, key: Buffer) => string | null;
  encryptBuffer: (buffer: Buffer, key: Buffer) => string;
  decryptBuffer: (envelope: string, key: Buffer) => Buffer | null;
};

const key = crypto.scryptSync('correct horse battery staple', Buffer.from('salt'), 32);
const otherKey = crypto.scryptSync('a different password', Buffer.from('salt'), 32);

describe('dataEnvelope', () => {
  it('keeps the on-disk magic frozen', () => {
    // Changing this string makes every previously written file unreadable.
    expect(DATA_FILE_MAGIC).toBe('LDMN1');
  });

  it('round-trips text through the envelope', () => {
    const plain = JSON.stringify({ version: 3, notes: [{ id: 'n1', title: 'hello' }] });
    const envelope = encryptPayload(plain, key);

    expect(envelope).not.toContain('hello');
    expect(decryptPayload(envelope, key)).toBe(plain);
  });

  it('round-trips binary through the envelope and marks it', () => {
    const bytes = crypto.randomBytes(2048);
    const envelope = encryptBuffer(bytes, key);

    expect(JSON.parse(envelope).binary).toBe(true);
    expect(decryptBuffer(envelope, key)?.equals(bytes)).toBe(true);
  });

  it('writes the documented envelope shape', () => {
    const parsed = JSON.parse(encryptPayload('x', key));
    expect(parsed).toMatchObject({ magic: DATA_FILE_MAGIC, v: 1, alg: 'AES-256-GCM' });
    expect(typeof parsed.iv).toBe('string');
    expect(typeof parsed.tag).toBe('string');
    expect(typeof parsed.ct).toBe('string');
    // Text envelopes must not claim to be binary — the attachment read path
    // branches on this flag.
    expect(parsed.binary).toBeUndefined();
  });

  it('returns null instead of throwing when the key is wrong', () => {
    const envelope = encryptPayload('secret', key);
    expect(decryptPayload(envelope, otherKey)).toBeNull();
    expect(decryptBuffer(envelope, otherKey)).toBeNull();
  });

  it('returns null instead of throwing when the envelope is tampered with', () => {
    const parsed = JSON.parse(encryptPayload('secret', key));
    const flipped = Buffer.from(parsed.ct, 'base64');
    flipped[0] ^= 0xff;
    const tampered = JSON.stringify({ ...parsed, ct: flipped.toString('base64') });

    expect(decryptPayload(tampered, key)).toBeNull();
  });

  it('returns null instead of throwing on malformed input', () => {
    expect(decryptPayload('{not json', key)).toBeNull();
    expect(decryptPayload(JSON.stringify({ magic: 'OTHER' }), key)).toBeNull();
    expect(decryptBuffer('', key)).toBeNull();
  });

  it('detects envelopes and rejects plaintext workspaces', () => {
    const envelope = encryptPayload('{"version":3}', key);
    expect(isEncryptedEnvelope(envelope)).toBe(true);
    expect(isEncryptedFile(envelope)).toBe(true);

    // A legacy plaintext workspace must never be mistaken for an envelope,
    // otherwise the read path would try to decrypt readable data and fail.
    expect(isEncryptedFile('{"version":3,"notes":[]}')).toBe(false);
    expect(isEncryptedFile('not json at all')).toBe(false);
    expect(isEncryptedFile(null)).toBe(false);
    expect(isEncryptedEnvelope(undefined)).toBe(false);
  });
});
