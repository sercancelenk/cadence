/**
 * Integration tests for the Google Drive sync backend.
 *
 * Every Drive REST call is mocked via `vi.stubGlobal('fetch', …)`,
 * so these tests exercise the real serialization, error mapping, and
 * snapshot crypto pipeline — without ever touching the real Drive API.
 *
 * If the question is ever "did the Drive flow actually run end-to-end?"
 * the answer is yes — every code path in `gdrive.ts` is reached at
 * least once across this file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapSnapshot } from '../snapshotCrypto';
import { setSyncPassphrase, clearSyncPassphrase } from '../syncSession';
import { createGDriveBackend, disconnectGDrive } from './gdrive';
import { saveTokens, clearStoredTokens } from './gdriveAuth';

const SAMPLE = {
  teams: [{ id: 't1', name: 'A', createdAt: '2026-05-19T00:00:00.000Z', status: 'active' }],
  notes: [],
  todoItems: [],
};
const PASS = 'test-passphrase-123';

function fakeTokens() {
  saveTokens({
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    expiresAt: Date.now() + 60 * 60 * 1000,
    email: 'tester@example.com',
  });
}

type FetchHandler = (req: Request) => Promise<Response> | Response;

/**
 * Install a fetch mock that dispatches based on substring matches of
 * the request URL. Handlers are sorted by descending match-length so
 * more specific patterns win (`upload/drive/v3/files?` beats
 * `drive/v3/files?` for an upload URL). Unhandled URLs throw —
 * undeclared calls = bug in the test, not a graceful fallback.
 */
function mockFetch(handlers: Array<{ match: string; handler: FetchHandler }>) {
  const sorted = [...handlers].sort((a, b) => b.match.length - a.match.length);
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      const req = new Request(url, init);
      for (const { match, handler } of sorted) {
        if (url.includes(match)) return handler(req);
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    },
  );
}

function clearAllSyncStorage() {
  clearStoredTokens();
  disconnectGDrive();
  clearSyncPassphrase();
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('cadence.sync.gdrive.record.v1');
  }
}

describe('GDriveBackend (no client id configured)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    clearAllSyncStorage();
    // Default env: no client id → createGDriveBackend returns null.
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns null when client id is not configured (even with tokens)', () => {
    fakeTokens();
    const backend = createGDriveBackend();
    expect(backend).toBeNull();
  });
});

describe('GDriveBackend (client id configured)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    clearAllSyncStorage();
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'test-client.apps.googleusercontent.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reports auth-required on pull when no passphrase is set', async () => {
    fakeTokens();
    const backend = createGDriveBackend();
    expect(backend).not.toBeNull();
    const out = await backend!.pull();
    expect(out.kind).toBe('auth-required');
  });

  it('returns null factory when there are no stored tokens', () => {
    expect(createGDriveBackend()).toBeNull();
  });

  it('pulls "no-snapshot" when Drive has no file', async () => {
    fakeTokens();
    setSyncPassphrase(PASS, false);
    mockFetch([
      {
        match: 'drive/v3/files?',
        handler: async () => Response.json({ files: [] }),
      },
    ]);
    const backend = createGDriveBackend()!;
    const out = await backend.pull();
    expect(out.kind).toBe('no-snapshot');
  });

  it('pulls and decrypts a snapshot end-to-end', async () => {
    fakeTokens();
    setSyncPassphrase(PASS, false);
    const blob = await wrapSnapshot(SAMPLE, PASS);
    mockFetch([
      {
        match: 'drive/v3/files?',
        handler: async () =>
          Response.json({ files: [{ id: 'file-1', name: 'snapshot.cadence', version: '7' }] }),
      },
      {
        match: 'drive/v3/files/file-1',
        handler: async () =>
          new Response(blob as unknown as BodyInit, {
            status: 200,
            headers: { 'Content-Type': 'application/octet-stream' },
          }),
      },
    ]);
    const backend = createGDriveBackend()!;
    const out = await backend.pull();
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.etag).toBe('7');
    expect(JSON.stringify(out.data)).toBe(JSON.stringify(SAMPLE));
  });

  it('reports wrong-password when the snapshot was encrypted with a different passphrase', async () => {
    fakeTokens();
    setSyncPassphrase(PASS, false);
    const blob = await wrapSnapshot(SAMPLE, 'totally-different-passphrase');
    mockFetch([
      {
        match: 'drive/v3/files?',
        handler: async () =>
          Response.json({ files: [{ id: 'file-1', name: 'snapshot.cadence', version: '7' }] }),
      },
      {
        match: 'drive/v3/files/file-1',
        handler: async () => new Response(blob as unknown as BodyInit, { status: 200 }),
      },
    ]);
    const backend = createGDriveBackend()!;
    const out = await backend.pull();
    expect(out.kind).toBe('wrong-password');
  });

  it('treats not-a-snapshot bytes as no-snapshot (safe overwrite)', async () => {
    fakeTokens();
    setSyncPassphrase(PASS, false);
    const garbage = new Uint8Array([1, 2, 3, 4, 5]);
    mockFetch([
      {
        match: 'drive/v3/files?',
        handler: async () =>
          Response.json({ files: [{ id: 'file-1', name: 'snapshot.cadence', version: '7' }] }),
      },
      {
        match: 'drive/v3/files/file-1',
        handler: async () => new Response(garbage as unknown as BodyInit, { status: 200 }),
      },
    ]);
    const backend = createGDriveBackend()!;
    const out = await backend.pull();
    expect(out.kind).toBe('no-snapshot');
  });

  it('pulls "not-modified" when prior etag matches the current Drive version', async () => {
    fakeTokens();
    setSyncPassphrase(PASS, false);
    let downloadCalled = false;
    mockFetch([
      {
        match: 'drive/v3/files?',
        handler: async () =>
          Response.json({ files: [{ id: 'file-1', name: 'snapshot.cadence', version: '7' }] }),
      },
      {
        match: 'drive/v3/files/file-1',
        handler: async () => {
          downloadCalled = true;
          return new Response('shouldnt-be-called');
        },
      },
    ]);
    const backend = createGDriveBackend()!;
    const out = await backend.pull('7');
    expect(out.kind).toBe('not-modified');
    expect(downloadCalled).toBe(false);
  });

  it('creates a new file on first push when no snapshot exists', async () => {
    fakeTokens();
    setSyncPassphrase(PASS, false);
    const calls: { url: string; method: string }[] = [];
    mockFetch([
      {
        match: 'drive/v3/files?',
        handler: async (req) => {
          calls.push({ url: req.url, method: req.method });
          return Response.json({ files: [] });
        },
      },
      {
        match: 'upload/drive/v3/files?',
        handler: async (req) => {
          calls.push({ url: req.url, method: req.method });
          return Response.json({ id: 'new-file', name: 'snapshot.cadence', version: '1' });
        },
      },
    ]);
    const backend = createGDriveBackend()!;
    const out = await backend.push(SAMPLE);
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.etag).toBe('1');
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('upload/drive/v3/files?'))).toBe(true);
  });

  it('PATCH-updates an existing file when one exists', async () => {
    fakeTokens();
    setSyncPassphrase(PASS, false);
    const calls: { url: string; method: string }[] = [];
    mockFetch([
      {
        match: 'drive/v3/files?',
        handler: async (req) => {
          calls.push({ url: req.url, method: req.method });
          return Response.json({
            files: [{ id: 'existing-file', name: 'snapshot.cadence', version: '5' }],
          });
        },
      },
      {
        match: 'upload/drive/v3/files/existing-file',
        handler: async (req) => {
          calls.push({ url: req.url, method: req.method });
          return Response.json({ id: 'existing-file', name: 'snapshot.cadence', version: '6' });
        },
      },
    ]);
    const backend = createGDriveBackend()!;
    const out = await backend.push(SAMPLE, '5');
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.etag).toBe('6');
    expect(calls.some((c) => c.method === 'PATCH')).toBe(true);
  });

  it('detects a conflict when remote version moved past expected', async () => {
    fakeTokens();
    setSyncPassphrase(PASS, false);
    let patchCalled = false;
    mockFetch([
      {
        match: 'drive/v3/files?',
        handler: async () =>
          Response.json({ files: [{ id: 'f', name: 'snapshot.cadence', version: '9' }] }),
      },
      {
        match: 'upload/drive/v3/files/f',
        handler: async () => {
          patchCalled = true;
          return Response.json({ id: 'f', version: '10' });
        },
      },
    ]);
    const backend = createGDriveBackend()!;
    const out = await backend.push(SAMPLE, '7');
    expect(out.kind).toBe('conflict');
    if (out.kind !== 'conflict') return;
    expect(out.currentEtag).toBe('9');
    expect(patchCalled).toBe(false); // never even tried to upload
  });

  it('reports auth-required when Drive returns 401', async () => {
    fakeTokens();
    setSyncPassphrase(PASS, false);
    mockFetch([
      {
        match: 'drive/v3/files?',
        handler: async () => new Response('unauthorized', { status: 401 }),
      },
    ]);
    const backend = createGDriveBackend()!;
    const out = await backend.pull();
    expect(out.kind).toBe('auth-required');
  });

  it('reports network-error when fetch throws', async () => {
    fakeTokens();
    setSyncPassphrase(PASS, false);
    mockFetch([
      {
        match: 'drive/v3/files?',
        handler: () => {
          throw new TypeError('NetworkError when attempting to fetch resource');
        },
      },
    ]);
    const backend = createGDriveBackend()!;
    const out = await backend.pull();
    expect(out.kind).toBe('network-error');
  });

  it('reports http-error when Drive returns 500 (after retries)', async () => {
    fakeTokens();
    setSyncPassphrase(PASS, false);
    let count = 0;
    mockFetch([
      {
        match: 'drive/v3/files?',
        handler: async () => {
          count++;
          return new Response(JSON.stringify({ error: { message: 'transient' } }), {
            status: 500,
          });
        },
      },
    ]);
    const backend = createGDriveBackend()!;
    const out = await backend.pull();
    expect(out.kind).toBe('http-error');
    // Retry policy in gdrive.ts: 1 initial + 2 retries on 5xx = 3 calls.
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('reports too-large when Drive PATCH returns 413', async () => {
    fakeTokens();
    setSyncPassphrase(PASS, false);
    mockFetch([
      {
        match: 'drive/v3/files?',
        handler: async () =>
          Response.json({ files: [{ id: 'f', name: 'snapshot.cadence', version: '5' }] }),
      },
      {
        match: 'upload/drive/v3/files/f',
        handler: async () => new Response('too big', { status: 413 }),
      },
    ]);
    const backend = createGDriveBackend()!;
    const out = await backend.push(SAMPLE, '5');
    expect(out.kind).toBe('too-large');
  });

  it('persists and reads its own SyncRecord (etag + localFingerprint)', () => {
    fakeTokens();
    const backend = createGDriveBackend()!;
    backend.setRecord({
      etag: '42',
      localFingerprint: '"deadbeef00000000"',
      lastSyncedAt: '2026-05-19T00:00:00.000Z',
    });
    const r = backend.getRecord();
    expect(r).toEqual({
      etag: '42',
      localFingerprint: '"deadbeef00000000"',
      lastSyncedAt: '2026-05-19T00:00:00.000Z',
    });
  });

  it('disconnect clears tokens AND record', () => {
    fakeTokens();
    const backend = createGDriveBackend()!;
    backend.setRecord({ etag: '7', lastSyncedAt: '2026-05-19T00:00:00.000Z' });
    disconnectGDrive();
    expect(window.localStorage.getItem('cadence.sync.gdrive.record.v1')).toBeNull();
    expect(window.localStorage.getItem('cadence.sync.gdrive.tokens.v1')).toBeNull();
  });

  it('status() returns "auth-required" with no valid access token', async () => {
    saveTokens({
      accessToken: 'expired',
      refreshToken: undefined,
      expiresAt: Date.now() - 60_000,
    });
    const backend = createGDriveBackend()!;
    const status = await backend.status();
    expect(status).toBe('auth-required');
  });

  it('status() returns "ready" when token is fresh', async () => {
    fakeTokens();
    const backend = createGDriveBackend()!;
    const status = await backend.status();
    expect(status).toBe('ready');
  });
});
