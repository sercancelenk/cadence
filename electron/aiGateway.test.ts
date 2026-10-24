import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createGatewayClient } = require('./aiGateway.cjs');

const okResponse = (status: number, text: string) =>
  ({ status, text: () => Promise.resolve(text) }) as unknown as Response;

describe('createGatewayClient.chat', () => {
  it('posts to <base><path> with the given headers and returns status + text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(200, '{"choices":[]}'));
    const client = createGatewayClient({ fetch: fetchMock });
    const r = await client.chat({
      requestId: 'r1',
      baseUrl: 'http://localhost:20128/v1/',
      path: '/chat/completions',
      headers: { Authorization: 'Bearer sk-test' },
      body: '{"model":"m"}',
    });
    expect(r).toEqual({ ok: true, status: 200, text: '{"choices":[]}' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:20128/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.body).toBe('{"model":"m"}');
    expect(init.redirect).toBe('error');
  });

  it('sends no auth header when none is supplied, and honours a custom one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(200, '{}'));
    const client = createGatewayClient({ fetch: fetchMock });
    await client.chat({ baseUrl: 'http://localhost:20128/v1', path: '/messages', headers: {}, body: '{}' });
    expect(Object.keys(fetchMock.mock.calls[0][1].headers)).toEqual(['content-type']);
    await client.chat({
      baseUrl: 'https://gw.example.com',
      path: '/models/m%2Fx:generateContent',
      headers: { 'x-goog-api-key': 'k', 'x-tenant': 't' },
      body: '{}',
    });
    expect(fetchMock.mock.calls[1][0]).toBe('https://gw.example.com/models/m%2Fx:generateContent');
    expect(fetchMock.mock.calls[1][1].headers['x-goog-api-key']).toBe('k');
    expect(fetchMock.mock.calls[1][1].headers['x-tenant']).toBe('t');
  });

  it('passes non-2xx statuses through so the renderer can word the error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(401, '{"error":{"message":"bad key"}}'));
    const r = await createGatewayClient({ fetch: fetchMock }).chat({
      baseUrl: 'https://gw.example.com/v1',
      path: '/chat/completions',
      body: '{}',
    });
    expect(r).toEqual({ ok: true, status: 401, text: '{"error":{"message":"bad key"}}' });
  });

  it('rejects an unsafe base URL without touching the network', async () => {
    const fetchMock = vi.fn();
    const client = createGatewayClient({ fetch: fetchMock });
    for (const baseUrl of ['http://gw.example.com/v1', 'file:///etc/passwd', '', undefined, 42]) {
      const r = await client.chat({ baseUrl, path: '/chat/completions', body: '{}' });
      expect(r.ok).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an empty or non-string body', async () => {
    const fetchMock = vi.fn();
    const client = createGatewayClient({ fetch: fetchMock });
    const t = { baseUrl: 'http://localhost/v1', path: '/chat/completions' };
    expect((await client.chat({ ...t, body: '' })).ok).toBe(false);
    expect((await client.chat({ ...t, body: { a: 1 } })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a network failure with a readable message', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const r = await createGatewayClient({ fetch: fetchMock }).chat({
      baseUrl: 'http://localhost:20128/v1',
      path: '/chat/completions',
      body: '{}',
    });
    expect(r).toEqual({ ok: false, error: 'Could not reach the gateway (fetch failed).' });
  });

  it('stops reading a streamed body once it exceeds the cap', async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new TextEncoder().encode('x'.repeat(1_000_000)));
        if (pulls > 100) controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    const r = await createGatewayClient({ fetch: fetchMock }).chat({
      baseUrl: 'http://localhost:20128/v1',
      path: '/chat/completions',
      body: '{}',
    });
    expect(r.ok).toBe(false);
    expect(pulls).toBeLessThan(20);
  });

  it('rejects an oversized response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(200, 'x'.repeat(4_000_001)));
    const r = await createGatewayClient({ fetch: fetchMock }).chat({
      baseUrl: 'http://localhost:20128/v1',
      path: '/chat/completions',
      body: '{}',
    });
    expect(r.ok).toBe(false);
  });

  it('aborts an in-flight request by id', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const client = createGatewayClient({ fetch: fetchMock });
    const pending = client.chat({ requestId: 'abc', baseUrl: 'http://localhost:20128/v1', path: '/chat/completions', body: '{}' });
    await Promise.resolve();
    expect(client.abort('abc')).toBe(true);
    expect(await pending).toEqual({ ok: false, error: 'Request cancelled.', aborted: true });
    expect(client.abort('abc')).toBe(false);
    expect(client.abort(123)).toBe(false);
  });

  it('times out when the gateway never answers', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const client = createGatewayClient({ fetch: fetchMock, timeoutMs: 20 });
    const r = await client.chat({ baseUrl: 'http://localhost:20128/v1', path: '/chat/completions', body: '{}' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/did not answer/);
  });

  it('rejects an unsafe path or header without touching the network', async () => {
    const fetchMock = vi.fn();
    const client = createGatewayClient({ fetch: fetchMock });
    const base = { baseUrl: 'http://localhost:20128/v1', body: '{}' };
    const bad = [
      { path: '/../etc' },
      { path: '//evil.com/x' },
      { path: 'chat' },
      { path: '/a#frag' },
      { path: '/a?b=c d' },
      { path: '/chat/completions', headers: { Host: 'evil.com' } },
      { path: '/chat/completions', headers: { 'Content-Length': '1' } },
      { path: '/chat/completions', headers: { 'x-a': 'v\r\nInjected: 1' } },
      { path: '/chat/completions', headers: { 'bad name': 'v' } },
    ];
    for (const extra of bad) {
      const r = await client.chat({ ...base, ...extra });
      expect(r.ok, JSON.stringify(extra)).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
