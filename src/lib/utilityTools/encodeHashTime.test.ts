import { describe, expect, it } from 'vitest';
import { decodeBase64Utf8, encodeBase64Utf8 } from './base64';
import { decodeUrlComponent, encodeUrlComponent } from './urlCodec';
import { decodeJwt } from './jwtDecode';
import { digestAllHashes, md5Hex } from './hashDigest';
import { generateUuids, MAX_UUID_BATCH } from './uuidBatch';
import { convertAllCases, toCamelCase, toSnakeCase } from './stringCase';
import { formatEpochViews, isoToEpochMs, parseEpochInput } from './epochConvert';

describe('base64', () => {
  it('round-trips unicode', () => {
    const s = 'Cadence — café 🎹';
    expect(decodeBase64Utf8(encodeBase64Utf8(s))).toEqual({ ok: true, text: s });
  });
  it('rejects garbage', () => {
    expect(decodeBase64Utf8('@@@').ok).toBe(false);
  });
  it('decodes URL-safe Base64', () => {
    const std = encodeBase64Utf8('hello+/');
    const urlSafe = std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeBase64Utf8(urlSafe)).toEqual({ ok: true, text: 'hello+/' });
  });
});

describe('urlCodec', () => {
  it('encodes and decodes', () => {
    const raw = 'a=1&b=hello world';
    const enc = encodeUrlComponent(raw);
    expect(decodeUrlComponent(enc)).toEqual({ ok: true, text: raw });
  });
  it('rejects bad escapes', () => {
    expect(decodeUrlComponent('%E0%A4%A').ok).toBe(false);
  });
});

describe('jwtDecode', () => {
  it('decodes a well-formed unsigned-looking token', () => {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const payload = btoa(JSON.stringify({ sub: 'user-1', name: 'Ada' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const r = decodeJwt(`${header}.${payload}.sig`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toMatchObject({ sub: 'user-1' });
      expect(r.signature).toBe('sig');
    }
  });
  it('rejects malformed tokens', () => {
    expect(decodeJwt('only.two').ok).toBe(false);
    expect(decodeJwt('').ok).toBe(false);
  });
});

describe('hashDigest', () => {
  it('matches known MD5 vector', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
  it('returns all digests', async () => {
    const r = await digestAllHashes('hello');
    expect(r.md5).toHaveLength(32);
    expect(r.sha1).toHaveLength(40);
    expect(r.sha256).toHaveLength(64);
    expect(r.sha512).toHaveLength(128);
  });
});

describe('uuidBatch', () => {
  it('caps count and produces unique ids', () => {
    expect(generateUuids(0)).toEqual([]);
    const ids = generateUuids(5);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(generateUuids(10_000)).toHaveLength(MAX_UUID_BATCH);
  });
});

describe('stringCase', () => {
  it('converts common cases', () => {
    expect(toCamelCase('hello_world')).toBe('helloWorld');
    expect(toSnakeCase('HelloWorld')).toBe('hello_world');
    expect(convertAllCases('foo-bar').pascal).toBe('FooBar');
    expect(convertAllCases('foo-bar').constant).toBe('FOO_BAR');
  });
});

describe('epochConvert', () => {
  it('detects seconds vs milliseconds', () => {
    const s = parseEpochInput('1700000000');
    expect(s.ok).toBe(true);
    if (s.ok) {
      expect(s.unit).toBe('s');
      const views = formatEpochViews(s.ms);
      expect(views).not.toBeNull();
      expect(views!.iso).toContain('T');
      expect(views!.seconds).toBe(1700000000);
    }
    const ms = parseEpochInput('1700000000000');
    expect(ms.ok && ms.unit).toBe('ms');
  });
  it('rejects out-of-range timestamps (no toISOString crash)', () => {
    expect(parseEpochInput(String(Number.MAX_SAFE_INTEGER)).ok).toBe(false);
    expect(formatEpochViews(Number.MAX_SAFE_INTEGER)).toBeNull();
  });
  it('parses ISO', () => {
    const r = isoToEpochMs('2024-01-01T00:00:00.000Z');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ms).toBe(Date.parse('2024-01-01T00:00:00.000Z'));
  });
});
