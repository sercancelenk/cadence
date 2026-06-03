/**
 * Unit tests for the LAN sync backend adapter.
 * Mocks `lanSyncClient` so we exercise createLanBackend, outcome
 * mapping (via pull/push), and disconnectLan without network I/O.
 */
// @ts-nocheck


import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanSyncPair, PullOutcome, PushOutcome } from '../lanSyncClient';

const {
  loadPair,
  pullSnapshot,
  pushSnapshot,
  savePair,
  clearPair,
  recordSync,
} = vi.hoisted(() => ({
  loadPair: vi.fn<() => LanSyncPair | null>(),
  pullSnapshot: vi.fn(),
  pushSnapshot: vi.fn(),
  savePair: vi.fn(),
  clearPair: vi.fn(),
  recordSync: vi.fn(),
}));

vi.mock('../lanSyncClient', () => ({
  loadPair,
  pullSnapshot,
  pushSnapshot,
  savePair,
  clearPair,
  recordSync,
}));

import { createLanBackend, disconnectLan, lanRecordSync } from './lan';

const SAMPLE_PAIR: LanSyncPair = {
  url: 'https://192.168.1.10:9787',
  token: 'pair-token',
  etag: 'etag-1',
  localFingerprint: 'fp-1',
  lastSyncedAt: '2026-05-19T00:00:00.000Z',
};

describe('createLanBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadPair.mockReturnValue(SAMPLE_PAIR);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when no pair is persisted', () => {
    loadPair.mockReturnValue(null);
    expect(createLanBackend()).toBeNull();
  });

  it('returns a backend with LAN metadata when paired', () => {
    const backend = createLanBackend();
    expect(backend).not.toBeNull();
    expect(backend!.id).toBe('lan');
    expect(backend!.displayName).toBe('LAN host');
    expect(backend!.e2eEncryption).toBe(false);
  });

  it('reports ready status when paired and online', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const backend = createLanBackend()!;
    await expect(backend.status()).resolves.toBe('ready');
  });

  it('reports offline when navigator.onLine is false', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const backend = createLanBackend()!;
    await expect(backend.status()).resolves.toBe('offline');
  });

  it('reports auth-required when pair disappears between calls', async () => {
    loadPair.mockReturnValueOnce(SAMPLE_PAIR).mockReturnValue(null);
    const backend = createLanBackend()!;
    await expect(backend.status()).resolves.toBe('auth-required');
  });

  it('reads and writes sync records through savePair', () => {
    const backend = createLanBackend()!;
    expect(backend.getRecord()).toEqual({
      etag: 'etag-1',
      localFingerprint: 'fp-1',
      lastSyncedAt: '2026-05-19T00:00:00.000Z',
    });

    backend.setRecord({ etag: 'etag-2', localFingerprint: 'fp-2', lastSyncedAt: '2026-06-01T00:00:00.000Z' });
    expect(savePair).toHaveBeenCalledWith({
      url: SAMPLE_PAIR.url,
      token: SAMPLE_PAIR.token,
      etag: 'etag-2',
      localFingerprint: 'fp-2',
      lastSyncedAt: '2026-06-01T00:00:00.000Z',
    });
  });

  it('describe() returns host from a valid URL', () => {
    const backend = createLanBackend()!;
    expect(backend.describe()).toBe('192.168.1.10:9787');
  });

  it('describe() falls back to raw url when URL parsing fails', () => {
    loadPair.mockReturnValue({ ...SAMPLE_PAIR, url: 'not-a-url' });
    const backend = createLanBackend()!;
    expect(backend.describe()).toBe('not-a-url');
  });

  it('describe() reports no host when pair is missing', () => {
    loadPair.mockReturnValueOnce(SAMPLE_PAIR).mockReturnValue(null);
    const backend = createLanBackend()!;
    expect(backend.describe()).toBe('No host paired');
  });

  describe('pull outcome mapping', () => {
    const pullCases: Array<{ lan: PullOutcome; expected: unknown }> = [
      { lan: { kind: 'ok', data: { x: 1 }, etag: 'e1' }, expected: { kind: 'ok', data: { x: 1 }, etag: 'e1' } },
      { lan: { kind: 'not-modified' }, expected: { kind: 'not-modified' } },
      { lan: { kind: 'unauthorised' }, expected: { kind: 'auth-required' } },
      { lan: { kind: 'no-session' }, expected: { kind: 'auth-required' } },
      { lan: { kind: 'mixed-content' }, expected: { kind: 'mixed-content' } },
      { lan: { kind: 'timeout' }, expected: { kind: 'timeout' } },
      {
        lan: { kind: 'http-error', status: 503, message: 'down' },
        expected: { kind: 'http-error', status: 503, message: 'down' },
      },
      {
        lan: { kind: 'network-error', message: 'offline' },
        expected: { kind: 'network-error', message: 'offline' },
      },
    ];

    it.each(pullCases)('maps pull $lan.kind → $expected.kind', async ({ lan, expected }) => {
      pullSnapshot.mockResolvedValue(lan);
      const backend = createLanBackend()!;
      const result = await backend.pull('prior-etag');
      expect(pullSnapshot).toHaveBeenCalledWith(SAMPLE_PAIR.url, SAMPLE_PAIR.token, 'prior-etag');
      expect(result).toEqual(expected);
    });

    it('returns auth-required when pair is missing on pull', async () => {
      loadPair.mockReturnValueOnce(SAMPLE_PAIR).mockReturnValue(null);
      const backend = createLanBackend()!;
      await expect(backend.pull()).resolves.toEqual({ kind: 'auth-required' });
      expect(pullSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('push outcome mapping', () => {
    const pushCases: Array<{ lan: PushOutcome; expected: unknown }> = [
      { lan: { kind: 'ok', etag: 'e2' }, expected: { kind: 'ok', etag: 'e2' } },
      {
        lan: { kind: 'conflict', currentEtag: 'e9', message: 'stale' },
        expected: { kind: 'conflict', currentEtag: 'e9', message: 'stale' },
      },
      { lan: { kind: 'unauthorised' }, expected: { kind: 'auth-required' } },
      { lan: { kind: 'too-large' }, expected: { kind: 'too-large' } },
      { lan: { kind: 'mixed-content' }, expected: { kind: 'mixed-content' } },
      { lan: { kind: 'timeout' }, expected: { kind: 'timeout' } },
      {
        lan: { kind: 'http-error', status: 413, message: 'big' },
        expected: { kind: 'http-error', status: 413, message: 'big' },
      },
      {
        lan: { kind: 'network-error', message: 'reset' },
        expected: { kind: 'network-error', message: 'reset' },
      },
    ];

    it.each(pushCases)('maps push $lan.kind → $expected.kind', async ({ lan, expected }) => {
      pushSnapshot.mockResolvedValue(lan);
      const backend = createLanBackend()!;
      const payload = { teams: [] };
      const result = await backend.push(payload, 'if-match');
      expect(pushSnapshot).toHaveBeenCalledWith(SAMPLE_PAIR.url, SAMPLE_PAIR.token, payload, 'if-match');
      expect(result).toEqual(expected);
    });

    it('returns auth-required when pair is missing on push', async () => {
      loadPair.mockReturnValueOnce(SAMPLE_PAIR).mockReturnValue(null);
      const backend = createLanBackend()!;
      await expect(backend.push({})).resolves.toEqual({ kind: 'auth-required' });
      expect(pushSnapshot).not.toHaveBeenCalled();
    });
  });
});

describe('disconnectLan', () => {
  it('clears the persisted pair', () => {
    disconnectLan();
    expect(clearPair).toHaveBeenCalled();
  });
});

describe('lanRecordSync', () => {
  it('delegates to recordSync', () => {
    lanRecordSync('etag-new');
    expect(recordSync).toHaveBeenCalledWith('etag-new');
  });
});
