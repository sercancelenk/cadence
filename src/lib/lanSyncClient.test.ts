/**
 * Tests for the LAN sync client primitives that are stateless enough
 * to exercise without a running HTTP server. We focus on the bits
 * that have caused real bugs in the past:
 *
 *   - `normalizeHostUrl` must canonicalise input from QR codes, the
 *     pair-paste UI, and `?pair=` URLs into the exact form the
 *     sync client expects (with port, with protocol).
 *   - `computeLocalEtag` must be deterministic + match the host's
 *     formula byte-for-byte (we mirror it client-side to detect
 *     dirty state without a network round-trip).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPairUrl,
  clearPair,
  computeLocalEtag,
  downloadAttachment,
  fetchAttachmentManifest,
  formatRelativeSync,
  loadPair,
  normalizeHostUrl,
  pullSnapshot,
  pushSnapshot,
  readPairFromUrl,
  recordSync,
  savePair,
  stripPairFromUrl,
  uploadAttachment,
} from './lanSyncClient';

const STORAGE_KEY = 'cadence.lanSync.pair.v1';

function makeLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  } as Storage;
}

describe('normalizeHostUrl', () => {
  it('adds https and default port to a bare IP', () => {
    expect(normalizeHostUrl('192.168.1.5')).toBe('https://192.168.1.5:9787');
  });

  it('preserves an explicit port', () => {
    expect(normalizeHostUrl('192.168.1.5:8443')).toBe('https://192.168.1.5:8443');
  });

  it('keeps http:// for legacy peers', () => {
    expect(normalizeHostUrl('http://192.168.1.5:9787')).toBe('http://192.168.1.5:9787');
  });

  it('adds default port when only host is given with protocol', () => {
    expect(normalizeHostUrl('https://leeadman.local')).toBe('https://leeadman.local:9787');
  });

  it('returns empty for unusable input', () => {
    expect(normalizeHostUrl('')).toBe('');
    expect(normalizeHostUrl('   ')).toBe('');
  });

  it('strips trailing slashes', () => {
    expect(normalizeHostUrl('https://192.168.1.5/')).toBe('https://192.168.1.5:9787');
    expect(normalizeHostUrl('192.168.1.5/')).toBe('https://192.168.1.5:9787');
  });
});

describe('computeLocalEtag', () => {
  it('is deterministic for identical inputs', async () => {
    const data = { teams: [{ id: 't1', name: 'A' }], notes: [] };
    const a = await computeLocalEtag(data);
    const b = await computeLocalEtag(data);
    expect(a).toBe(b);
  });

  it('changes when the payload changes', async () => {
    const a = await computeLocalEtag({ teams: [{ id: 't1', name: 'A' }] });
    const b = await computeLocalEtag({ teams: [{ id: 't1', name: 'B' }] });
    expect(a).not.toBe(b);
  });

  it('produces a quoted 16-char hex string by default', async () => {
    const etag = await computeLocalEtag({ teams: [] });
    expect(etag).toMatch(/^"[0-9a-f]{16}"$/);
  });
});

describe('formatRelativeSync', () => {
  it('returns "just now" for very recent timestamps', () => {
    const now = Date.now();
    const iso = new Date(now - 3_000).toISOString();
    expect(formatRelativeSync(iso, now)).toBe('just now');
  });

  it('returns seconds for under-a-minute timestamps', () => {
    const now = Date.now();
    const iso = new Date(now - 25_000).toISOString();
    expect(formatRelativeSync(iso, now)).toBe('25s ago');
  });

  it('returns minutes between 1 minute and 1 hour', () => {
    const now = Date.now();
    const iso = new Date(now - 5 * 60_000).toISOString();
    expect(formatRelativeSync(iso, now)).toBe('5 min ago');
  });

  it('returns hours between 1 hour and 24 hours', () => {
    const now = Date.now();
    const iso = new Date(now - 3 * 3_600_000).toISOString();
    expect(formatRelativeSync(iso, now)).toBe('3h ago');
  });

  it('returns days beyond 24 hours', () => {
    const now = Date.now();
    const iso = new Date(now - 2 * 24 * 3_600_000).toISOString();
    expect(formatRelativeSync(iso, now)).toBe('2d ago');
  });

  it('returns empty string for no timestamp', () => {
    expect(formatRelativeSync(undefined)).toBe('');
    expect(formatRelativeSync('not-a-date')).toBe('');
  });
});

describe('pair persistence', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeLocalStorage();
    vi.stubGlobal('window', {
      localStorage: storage,
      location: { origin: 'https://192.168.1.5:9787', search: '', href: 'https://192.168.1.5:9787/' },
      history: { replaceState: vi.fn(), state: null },
      btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
      atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('savePair, loadPair, recordSync, and clearPair round-trip', () => {
    const saved = savePair({ url: 'https://host:9787', token: 'secret-token' });
    expect(saved.url).toBe('https://host:9787');
    expect(saved.token).toBe('secret-token');
    expect(saved.pairedAt).toBeTruthy();

    const loaded = loadPair();
    expect(loaded?.token).toBe('secret-token');

    const synced = recordSync('"etag-abc"', '2026-01-01T00:00:00.000Z');
    expect(synced?.etag).toBe('"etag-abc"');
    expect(synced?.lastSyncedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(loadPair()?.etag).toBe('"etag-abc"');

    clearPair();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadPair()).toBeNull();
    expect(recordSync('"x"')).toBeNull();
  });

  it('loadPair returns null for corrupt JSON', () => {
    storage.setItem(STORAGE_KEY, '{not-json');
    expect(loadPair()).toBeNull();
  });

  it('loadPair returns null when url or token is missing', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ url: 'https://x' }));
    expect(loadPair()).toBeNull();
  });

  it('buildPairUrl and readPairFromUrl round-trip the token', () => {
    const url = buildPairUrl('192.168.1.5', 'my-token');
    expect(url).toContain('pair=');
    const tokenPart = url.split('pair=')[1]!;
    vi.stubGlobal('window', {
      ...window,
      localStorage: storage,
      location: { origin: 'https://192.168.1.5:9787', search: `?pair=${tokenPart}` },
    });
    const parsed = readPairFromUrl();
    expect(parsed).toEqual({ url: 'https://192.168.1.5:9787', token: 'my-token' });
  });

  it('stripPairFromUrl removes the pair query param', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      ...window,
      localStorage: storage,
      location: {
        origin: 'https://192.168.1.5:9787',
        href: 'https://192.168.1.5:9787/?pair=abc&x=1#hash',
        search: '?pair=abc&x=1',
        pathname: '/',
        hash: '#hash',
      },
      history: { replaceState, state: null },
    });
    stripPairFromUrl();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/?x=1#hash');
  });
});

describe('pullSnapshot / pushSnapshot', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: { protocol: 'http:' },
      localStorage: makeLocalStorage(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pullSnapshot returns ok with data and etag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: (h: string) => (h === 'ETag' ? '"remote"' : null) },
        json: async () => ({ data: { teams: [] } }),
      }),
    );
    const out = await pullSnapshot('http://host:9787', 'tok');
    expect(out).toEqual({ kind: 'ok', data: { teams: [] }, etag: '"remote"' });
  });

  it('pullSnapshot maps status codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ status: 304, ok: false, headers: { get: () => null } }),
    );
    expect(await pullSnapshot('http://host:9787', 'tok')).toEqual({ kind: 'not-modified' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ status: 401, ok: false, headers: { get: () => null } }),
    );
    expect(await pullSnapshot('http://host:9787', 'tok')).toEqual({ kind: 'unauthorised' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ status: 503, ok: false, headers: { get: () => null } }),
    );
    expect(await pullSnapshot('http://host:9787', 'tok')).toEqual({ kind: 'no-session' });
  });

  it('pullSnapshot returns mixed-content on https page with http host', async () => {
    vi.stubGlobal('window', { location: { protocol: 'https:' }, localStorage: makeLocalStorage() });
    expect(await pullSnapshot('http://host:9787', 'tok')).toEqual({ kind: 'mixed-content' });
  });

  it('pushSnapshot returns ok and conflict outcomes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => '"push-etag"' },
        json: async () => ({ etag: '"body-etag"' }),
      }),
    );
    expect(await pushSnapshot('http://host:9787', 'tok', { x: 1 })).toEqual({
      kind: 'ok',
      etag: '"push-etag"',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 412,
        ok: false,
        headers: { get: () => '"current"' },
        json: async () => ({ error: 'stale', currentEtag: '"current"' }),
      }),
    );
    expect(await pushSnapshot('http://host:9787', 'tok', {})).toEqual({
      kind: 'conflict',
      currentEtag: '"current"',
      message: 'stale',
    });
  });

  it('pushSnapshot maps timeout and too-large responses', async () => {
    const abortErr = new DOMException('aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr));
    expect(await pushSnapshot('http://host:9787', 'tok', {})).toEqual({ kind: 'timeout' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 413, ok: false, headers: { get: () => null } }),
    );
    expect(await pushSnapshot('http://host:9787', 'tok', {})).toEqual({ kind: 'too-large' });
  });
});

describe('attachment network helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { protocol: 'http:' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchAttachmentManifest returns string ids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ids: ['a', 1, 'b'] }),
      }),
    );
    expect(await fetchAttachmentManifest('http://host:9787', 'tok')).toEqual(['a', 'b']);
  });

  it('downloadAttachment and uploadAttachment handle success and failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['x']),
      }),
    );
    const blob = await downloadAttachment('http://host:9787', 'tok', 'att-1');
    expect(blob?.size).toBe(1);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: false }),
    );
    expect(await downloadAttachment('http://host:9787', 'tok', 'att-1')).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }),
    );
    expect(await uploadAttachment('http://host:9787', 'tok', 'att-1', new Blob(['y']))).toBe(true);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await downloadAttachment('http://host:9787', 'tok', 'att-1')).toBeNull();
    expect(await uploadAttachment('http://host:9787', 'tok', 'att-1', new Blob(['y']))).toBe(false);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        blob: async () => {
          throw new Error('blob failed');
        },
      }),
    );
    expect(await downloadAttachment('http://host:9787', 'tok', 'att-1')).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('json failed');
        },
      }),
    );
    expect(await uploadAttachment('http://host:9787', 'tok', 'att-1', new Blob(['y']))).toBe(true);
  });
});
