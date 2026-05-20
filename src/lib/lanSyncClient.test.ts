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

import { describe, expect, it } from 'vitest';
import { computeLocalEtag, normalizeHostUrl, formatRelativeSync } from './lanSyncClient';

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
