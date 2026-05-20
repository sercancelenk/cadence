/**
 * Round-trip and failure-mode tests for the snapshot encryption layer.
 *
 * These tests exist because cloud sync runs untrusted bytes through
 * this module on every pull — a regression here can lose users'
 * data. We deliberately exercise both happy path AND every failure
 * mode `unwrapSnapshot` claims to handle, so a future refactor that
 * accidentally collapses two cases (e.g. silently treating "wrong
 * password" as "corrupt") fails loudly here.
 */

import { describe, expect, it } from 'vitest';
import {
  __snapshotCryptoSelfTest,
  hasMagic,
  peekSnapshotMeta,
  SNAPSHOT_CRYPTO_INFO,
  unwrapSnapshot,
  wrapSnapshot,
} from './snapshotCrypto';

const SAMPLE = {
  teams: [
    { id: 't1', name: 'Demo', createdAt: '2026-05-19T00:00:00.000Z', status: 'active' },
  ],
  notes: [
    {
      id: 'n1',
      title: 'Hello',
      body: 'World — Türkçe karakterler 🌱',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    },
  ],
  todoItems: [
    {
      id: 'tdo1',
      title: 'Ship cloud sync',
      status: 'todo',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    },
  ],
};
const PASS = 'correct horse battery staple';

describe('snapshotCrypto.wrap / unwrap', () => {
  it('round-trips a plausible AppData payload', async () => {
    const blob = await wrapSnapshot(SAMPLE, PASS);
    expect(blob).toBeInstanceOf(Uint8Array);
    expect(hasMagic(blob)).toBe(true);

    const result = await unwrapSnapshot(blob, PASS);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(JSON.stringify(result.data)).toBe(JSON.stringify(SAMPLE));
  });

  it('returns "wrong-password" for the wrong passphrase', async () => {
    const blob = await wrapSnapshot(SAMPLE, PASS);
    const result = await unwrapSnapshot(blob, 'wrong-pass');
    expect(result.kind).toBe('wrong-password');
  });

  it('detects tampering with the auth tag', async () => {
    const blob = await wrapSnapshot(SAMPLE, PASS);
    const tampered = new Uint8Array(blob);
    // Flip the final auth-tag byte.
    tampered[tampered.length - 1] ^= 0x01;
    const result = await unwrapSnapshot(tampered, PASS);
    expect(['wrong-password', 'corrupt']).toContain(result.kind);
  });

  it('detects tampering with the ciphertext middle', async () => {
    const blob = await wrapSnapshot(SAMPLE, PASS);
    const tampered = new Uint8Array(blob);
    const middle = Math.floor((tampered.length + 20) / 2);
    tampered[middle] ^= 0xff;
    const result = await unwrapSnapshot(tampered, PASS);
    expect(['wrong-password', 'corrupt']).toContain(result.kind);
  });

  it('rejects non-snapshot bytes cleanly', async () => {
    const garbage = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 1, 2, 3, 4]);
    const result = await unwrapSnapshot(garbage, PASS);
    expect(result.kind).toBe('not-snapshot');
  });

  it('rejects truncated snapshot bytes as corrupt', async () => {
    const blob = await wrapSnapshot(SAMPLE, PASS);
    const truncated = blob.slice(0, blob.length - 5);
    const result = await unwrapSnapshot(truncated, PASS);
    expect(['corrupt', 'wrong-password']).toContain(result.kind);
  });

  it('reports format metadata via peekSnapshotMeta', async () => {
    const blob = await wrapSnapshot(SAMPLE, PASS);
    const meta = peekSnapshotMeta(blob);
    expect(meta).not.toBeNull();
    if (!meta) return;
    expect(meta.version).toBe(SNAPSHOT_CRYPTO_INFO.formatVersion);
    expect(meta.saltLen).toBeGreaterThan(0);
  });

  it('peekSnapshotMeta returns null for non-snapshot input', () => {
    expect(peekSnapshotMeta(new Uint8Array([0, 0, 0, 0]))).toBeNull();
  });

  it('uses a fresh salt + IV each wrap (output bytes differ)', async () => {
    const a = await wrapSnapshot(SAMPLE, PASS);
    const b = await wrapSnapshot(SAMPLE, PASS);
    // First 4 bytes are the magic, then 2 byte version, 1 byte kdf, 1
    // byte salt-len — those are identical. Bytes 8.. (salt + IV +
    // ciphertext) must differ in at least one position.
    let diff = false;
    for (let i = 8; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        diff = true;
        break;
      }
    }
    expect(diff).toBe(true);
  });

  it('rejects "unsupported-version" if the version byte is bumped', async () => {
    const blob = await wrapSnapshot(SAMPLE, PASS);
    const fake = new Uint8Array(blob);
    fake[4] = 0xfe; // version low byte
    fake[5] = 0xff; // version high byte
    const result = await unwrapSnapshot(fake, PASS);
    expect(result.kind).toBe('unsupported-version');
  });

  it('rejects "unsupported-kdf" if the KDF byte is changed', async () => {
    const blob = await wrapSnapshot(SAMPLE, PASS);
    const fake = new Uint8Array(blob);
    fake[6] = 0x99; // arbitrary unsupported KDF id
    const result = await unwrapSnapshot(fake, PASS);
    expect(result.kind).toBe('unsupported-kdf');
  });

  it('rejects empty passphrase on wrap', async () => {
    await expect(wrapSnapshot(SAMPLE, '')).rejects.toThrow();
  });

  it('developer self-test passes end-to-end', async () => {
    const result = await __snapshotCryptoSelfTest();
    expect(result).toEqual({ ok: true });
  });
});
