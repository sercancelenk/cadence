import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  gatewayChatUrl,
  formatHeaderLines,
  gatewayFormatDefaults,
  parseHeaderLines,
  normalizeGatewayBaseUrl,
  resolveGatewayRequest,
  validateGatewayHeaders,
  validateGatewayPath,
} from './aiGatewayUrl';

const require = createRequire(import.meta.url);
const main = require('../../electron/aiGateway.cjs') as {
  normalizeGatewayBaseUrl: (raw: string) => { ok: boolean; url?: string; error?: string };
  validateGatewayPath: (raw: string) => { ok: boolean; path?: string; error?: string };
  validateGatewayHeaders: (h: Record<string, string>) => { ok: boolean; headers?: Record<string, string>; error?: string };
};

/** Shared by the renderer and main-process validators: both must agree. */
const URL_CASES: Array<{ input: string; ok: boolean; url?: string }> = [
  { input: 'http://localhost:20128/v1', ok: true, url: 'http://localhost:20128/v1' },
  { input: '  http://localhost:20128/v1/  ', ok: true, url: 'http://localhost:20128/v1' },
  { input: 'http://127.0.0.1:20128/v1', ok: true, url: 'http://127.0.0.1:20128/v1' },
  { input: 'http://[::1]:20128/v1', ok: true, url: 'http://[::1]:20128/v1' },
  { input: 'http://192.168.1.20:20128/v1', ok: true, url: 'http://192.168.1.20:20128/v1' },
  { input: 'http://10.0.0.5/v1', ok: true, url: 'http://10.0.0.5/v1' },
  { input: 'http://172.16.0.1/v1', ok: true, url: 'http://172.16.0.1/v1' },
  { input: 'http://172.31.255.255/v1', ok: true, url: 'http://172.31.255.255/v1' },
  { input: 'http://mybox.local:8080/v1', ok: true, url: 'http://mybox.local:8080/v1' },
  { input: 'https://gw.example.com/v1', ok: true, url: 'https://gw.example.com/v1' },
  { input: 'https://abc.trycloudflare.com/v1/', ok: true, url: 'https://abc.trycloudflare.com/v1' },
  { input: 'https://gw.example.com', ok: true, url: 'https://gw.example.com' },
  { input: '', ok: false },
  { input: '   ', ok: false },
  { input: 'localhost:20128/v1', ok: false },
  { input: 'ftp://localhost/v1', ok: false },
  { input: 'file:///etc/passwd', ok: false },
  { input: 'javascript:alert(1)', ok: false },
  { input: 'http://gw.example.com/v1', ok: false },
  { input: 'http://8.8.8.8/v1', ok: false },
  { input: 'http://172.32.0.1/v1', ok: false },
  { input: 'http://172.15.0.1/v1', ok: false },
  { input: 'http://192.169.1.1/v1', ok: false },
  { input: 'http://localhost.evil.com/v1', ok: false },
  { input: 'http://user:pw@localhost:20128/v1', ok: false },
  { input: 'https://user@gw.example.com/v1', ok: false },
  { input: 'https://gw.example.com/v1?key=abc', ok: false },
  { input: 'https://gw.example.com/v1#frag', ok: false },
];

describe('normalizeGatewayBaseUrl (renderer)', () => {
  it.each(URL_CASES)('$input -> ok=$ok', ({ input, ok, url }) => {
    const r = normalizeGatewayBaseUrl(input);
    expect(r.ok).toBe(ok);
    if (r.ok) expect(r.url).toBe(url);
    else expect(r.error.length).toBeGreaterThan(0);
  });
});

describe('normalizeGatewayBaseUrl (main process) agrees with the renderer copy', () => {
  it.each(URL_CASES)('$input -> ok=$ok', ({ input, ok, url }) => {
    const r = main.normalizeGatewayBaseUrl(input);
    expect(r.ok).toBe(ok);
    if (ok) expect(r.url).toBe(url);
    else expect((r.error ?? '').length).toBeGreaterThan(0);
  });
});

describe('gatewayChatUrl', () => {
  it('appends /chat/completions exactly once', () => {
    expect(gatewayChatUrl('http://localhost:20128/v1')).toBe('http://localhost:20128/v1/chat/completions');
    expect(gatewayChatUrl('http://localhost:20128/v1/')).toBe('http://localhost:20128/v1/chat/completions');
  });
});

const PATH_CASES: Array<{ input: string; ok: boolean }> = [
  { input: '/chat/completions', ok: true },
  { input: '/v1/responses', ok: true },
  { input: '/models/team%2Fx:generateContent', ok: true },
  { input: '/openai/deployments/gpt-4/chat/completions', ok: true },
  { input: '', ok: false },
  { input: 'chat/completions', ok: false },
  { input: '//evil.com/x', ok: false },
  { input: 'https://evil.com/x', ok: false },
  { input: '/a/../b', ok: false },
  { input: '/./a', ok: false },
  { input: '/a?x=1', ok: true },
  { input: '/models/m:generateContent?key=abc%2Fdef', ok: true },
  { input: '/openai/deployments/d/chat/completions?api-version=2024-02-01', ok: true },
  { input: '/a?x=1&y=2', ok: true },
  { input: '/a#f', ok: false },
  { input: '/a?x=1#f', ok: false },
  { input: '/a?x=a b', ok: false },
  { input: '/a?x=a"b', ok: false },
  { input: '/a?x=a?b', ok: false },
  { input: '/a?', ok: true },
  { input: '/%2e%2e/x?y=1', ok: false },
  { input: '/a b', ok: false },
  { input: '/a\\b', ok: false },
  { input: '/a"b', ok: false },
  { input: '/%2e%2e/x', ok: false },
  { input: '/a/%2E%2E/x', ok: false },
  { input: '/a/%2e/x', ok: false },
  { input: '/a/%zz/x', ok: false },
  { input: '/a/%2e%2e%2fb', ok: false },
  { input: '/a/x%2f..%2fb', ok: false },
  { input: '/a/team%2Fmodel:generateContent', ok: true },
];

const HEADER_CASES: Array<{ name: string; input: Record<string, string>; ok: boolean }> = [
  { name: 'auth', input: { Authorization: 'Bearer x' }, ok: true },
  { name: 'custom', input: { 'x-tenant': 'team-42', 'api-key': 'k' }, ok: true },
  { name: 'empty', input: {}, ok: true },
  { name: 'host', input: { Host: 'evil.com' }, ok: false },
  { name: 'content-length', input: { 'content-length': '1' }, ok: false },
  { name: 'content-type', input: { 'Content-Type': 'text/plain' }, ok: false },
  { name: 'cookie', input: { Cookie: 'a=b' }, ok: false },
  { name: 'bad name', input: { 'bad name': 'v' }, ok: false },
  { name: 'empty name', input: { '': 'v' }, ok: false },
  { name: 'CRLF value', input: { 'x-a': 'v\r\nX-B: 1' }, ok: false },
  { name: 'NUL value', input: { 'x-a': 'v\u0000' }, ok: false },
  { name: 'duplicate by case', input: { 'x-a': '1', 'X-A': '2' }, ok: false },
  { name: 'too long', input: { 'x-a': 'v'.repeat(4097) }, ok: false },
  {
    name: 'too many',
    input: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`x-h${i}`, 'v'])),
    ok: false,
  },
];

describe('validateGatewayPath', () => {
  it.each(PATH_CASES)('renderer $input -> $ok', ({ input, ok }) => {
    expect(validateGatewayPath(input).ok).toBe(ok);
  });
  it.each(PATH_CASES)('main process agrees: $input -> $ok', ({ input, ok }) => {
    expect(main.validateGatewayPath(input).ok).toBe(ok);
  });
});

describe('validateGatewayHeaders', () => {
  it.each(HEADER_CASES)('renderer $name -> $ok', ({ input, ok }) => {
    expect(validateGatewayHeaders(input).ok).toBe(ok);
  });
  it.each(HEADER_CASES)('main process agrees: $name -> $ok', ({ input, ok }) => {
    expect(main.validateGatewayHeaders(input).ok).toBe(ok);
  });
});

describe('gatewayFormatDefaults', () => {
  it('maps each format to its path and auth header', () => {
    expect(gatewayFormatDefaults('openai-chat')).toMatchObject({ path: '/chat/completions', authHeader: 'Authorization' });
    expect(gatewayFormatDefaults('openai-responses')).toMatchObject({ path: '/responses', authHeader: 'Authorization' });
    expect(gatewayFormatDefaults('anthropic')).toMatchObject({
      path: '/messages',
      authHeader: 'x-api-key',
      headers: { 'anthropic-version': '2023-06-01' },
    });
    expect(gatewayFormatDefaults('gemini')).toMatchObject({
      path: '/models/{model}:generateContent',
      authHeader: 'x-goog-api-key',
    });
  });
});

describe('resolveGatewayRequest', () => {
  const s = { baseUrl: 'https://gw.example.com/v1' };

  it('defaults to OpenAI Chat with a bearer Authorization header', () => {
    const r = resolveGatewayRequest(s, 'm', 'k');
    expect(r).toMatchObject({
      ok: true,
      url: 'https://gw.example.com/v1/chat/completions',
      baseUrl: 'https://gw.example.com/v1',
      path: '/chat/completions',
      headers: { Authorization: 'Bearer k' },
    });
  });

  it('sends no auth header without a key', () => {
    const r = resolveGatewayRequest(s, 'm', '');
    expect(r.ok && r.headers).toEqual({});
  });

  it('uses the raw key for non-Authorization headers and bearer for Authorization', () => {
    expect(resolveGatewayRequest({ ...s, authHeader: 'api-key' }, 'm', 'k')).toMatchObject({ headers: { 'api-key': 'k' } });
    expect(resolveGatewayRequest({ ...s, authHeader: 'authorization' }, 'm', 'k')).toMatchObject({
      headers: { authorization: 'Bearer k' },
    });
    expect(resolveGatewayRequest({ ...s, authScheme: 'raw' }, 'm', 'k')).toMatchObject({ headers: { Authorization: 'k' } });
    expect(resolveGatewayRequest({ ...s, authHeader: 'x-key', authScheme: 'bearer' }, 'm', 'k')).toMatchObject({
      headers: { 'x-key': 'Bearer k' },
    });
  });

  it('lets the auth header win over an extra header of the same name, ignoring case', () => {
    const r = resolveGatewayRequest({ ...s, extraHeaders: [{ name: 'authorization', value: 'old' }] }, 'm', 'k');
    expect(r.ok && r.headers).toEqual({ Authorization: 'Bearer k' });
  });

  it('substitutes the URL-encoded model into a custom path', () => {
    const r = resolveGatewayRequest({ ...s, requestPath: '/d/{model}/x' }, 'a/b c', 'k');
    expect(r.ok && r.path).toBe('/d/a%2Fb%20c/x');
  });

  it('rejects an invalid base URL, path or header', () => {
    expect(resolveGatewayRequest({ baseUrl: 'http://gw.example.com/v1' }, 'm', 'k').ok).toBe(false);
    expect(resolveGatewayRequest({ ...s, requestPath: '/a/../b' }, 'm', 'k').ok).toBe(false);
    expect(resolveGatewayRequest({ ...s, extraHeaders: [{ name: 'Host', value: 'x' }] }, 'm', 'k').ok).toBe(false);
  });
});

describe('header lines', () => {
  it('parses "Name: value" lines, trimming and skipping blanks, keeping colons in values', () => {
    expect(parseHeaderLines('x-tenant: team-42\n\n  api-version :  2024-02-01  \nx-url: https://a:8080/b\r\n')).toEqual({
      ok: true,
      headers: [
        { name: 'x-tenant', value: 'team-42' },
        { name: 'api-version', value: '2024-02-01' },
        { name: 'x-url', value: 'https://a:8080/b' },
      ],
    });
  });

  it('rejects the same header written twice with different case', () => {
    const r = parseHeaderLines('X-Tenant: a\nx-tenant: b');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Line 2');
  });

  it('reports the offending line number', () => {
    const r = parseHeaderLines('x-a: 1\nnot a header\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Line 2');
    expect(parseHeaderLines(': value').ok).toBe(false);
  });

  it('round-trips through formatHeaderLines', () => {
    const headers = [{ name: 'x-a', value: '1' }, { name: 'x-b', value: 'two words' }];
    expect(formatHeaderLines(headers)).toBe('x-a: 1\nx-b: two words');
    expect(parseHeaderLines(formatHeaderLines(headers))).toEqual({ ok: true, headers });
    expect(formatHeaderLines(undefined)).toBe('');
  });
});

describe('resolveGatewayRequest: {apiKey}, query strings and no-auth', () => {
  const s = { baseUrl: 'https://gw.example.com/v1beta' };

  it('puts the URL-encoded key into the path and sends no auth header with authScheme none', () => {
    const r = resolveGatewayRequest(
      { ...s, requestPath: '/models/{model}:generateContent?key={apiKey}', authScheme: 'none' },
      'gemini-2.0-flash',
      'AIza/Sy+key',
    );
    expect(r).toMatchObject({
      ok: true,
      url: 'https://gw.example.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIza%2FSy%2Bkey',
      path: '/models/gemini-2.0-flash:generateContent?key=AIza%2FSy%2Bkey',
      headers: {},
    });
  });

  it('refuses a path that needs the key when there is none', () => {
    const r = resolveGatewayRequest({ ...s, requestPath: '/m?key={apiKey}' }, 'm', '');
    expect(r.ok).toBe(false);
  });

  it('keeps a plain query string such as an API version', () => {
    const r = resolveGatewayRequest(
      { ...s, requestPath: '/openai/deployments/{model}/chat/completions?api-version=2024-02-01' },
      'gpt-4',
      'k',
    );
    expect(r.ok && r.url).toBe(
      'https://gw.example.com/v1beta/openai/deployments/gpt-4/chat/completions?api-version=2024-02-01',
    );
  });

  it('omits the auth header for authScheme none even when a key is set', () => {
    const r = resolveGatewayRequest({ ...s, authScheme: 'none' }, 'm', 'k');
    expect(r.ok && r.headers).toEqual({});
  });
});
