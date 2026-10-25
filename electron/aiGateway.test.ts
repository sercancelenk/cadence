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

describe('createGatewayClient hardening', () => {
  const ok = (text = '{}') => ({ status: 200, text: () => Promise.resolve(text) }) as unknown as Response;
  const base = { baseUrl: 'https://gw.example.com/v1', path: '/chat/completions', headers: {} };

  it('rejects a header value with invisible or non-ASCII characters', async () => {
    const fetchMock = vi.fn();
    const r = await createGatewayClient({ fetch: fetchMock }).chat({ ...base, headers: { Authorization: 'Bearer sk\u200Babc' }, body: '{}' });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a request body larger than 8 million characters without touching the network', async () => {
    const fetchMock = vi.fn();
    const r = await createGatewayClient({ fetch: fetchMock }).chat({ ...base, body: 'x'.repeat(8_000_001) });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/too large/i) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a second request that reuses the id of one still running, and keeps the first abortable', async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          release = resolve;
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const client = createGatewayClient({ fetch: fetchMock });
    const first = client.chat({ ...base, requestId: 'same', body: '{}' });
    const second = await client.chat({ ...base, requestId: 'same', body: '{}' });
    expect(second).toEqual({ ok: false, error: expect.stringMatching(/already running|duplicate/i) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.abort('same')).toBe(true);
    await expect(first).resolves.toMatchObject({ ok: false, aborted: true });
    release(ok());
  });

  it('abortAll cancels every request in flight', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const client = createGatewayClient({ fetch: fetchMock });
    const a = client.chat({ ...base, requestId: 'a', body: '{}' });
    const b = client.chat({ ...base, requestId: 'b', body: '{}' });
    expect(client.abortAll()).toBe(2);
    await expect(a).resolves.toMatchObject({ aborted: true });
    await expect(b).resolves.toMatchObject({ aborted: true });
    expect(client.abortAll()).toBe(0);
  });
});

describe('createGatewayClient.chat streaming (onChunk)', () => {
  const enc = new TextEncoder();
  const base = { baseUrl: 'https://gw.example.com/v1', path: '/chat/completions', headers: {}, body: '{}' };
  const streamRes = (pieces: string[], status = 200, gapMs = 0, signal?: AbortSignal | null) => {
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(c) {
        if (i >= pieces.length) return c.close();
        if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
        if (signal?.aborted) return c.error(new Error('aborted'));
        c.enqueue(enc.encode(pieces[i++]));
      },
    });
    return new Response(body, { status });
  };

  it('delivers each piece as it arrives and returns no text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamRes(['data: a\n\n', 'data: b\n\n']));
    const got: string[] = [];
    const r = await createGatewayClient({ fetch: fetchMock }).chat({ ...base, requestId: 's1' }, (p: string) => got.push(p));
    expect(r).toEqual({ ok: true, status: 200, text: '' });
    expect(got.join('')).toBe('data: a\n\ndata: b\n\n');
  });

  it('does not stream an error status: the body comes back as text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamRes(['{"error":"nope"}'], 401));
    const got: string[] = [];
    const r = await createGatewayClient({ fetch: fetchMock }).chat({ ...base }, (p: string) => got.push(p));
    expect(r).toEqual({ ok: true, status: 401, text: '{"error":"nope"}' });
    expect(got).toEqual([]);
  });

  it('stops a stream that grows past the cap', async () => {
    const big = 'x'.repeat(1_000_000);
    const fetchMock = vi.fn().mockResolvedValue(streamRes([big, big, big, big, big]));
    const r = await createGatewayClient({ fetch: fetchMock }).chat({ ...base }, () => {});
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/too large/i) });
  });

  it('gives a stream silence, not a total time: pieces keep it alive, a gap ends it', async () => {
    const alive = vi.fn((_u: string, init: RequestInit) => Promise.resolve(streamRes(['a', 'b', 'c', 'd', 'e'], 200, 30, init.signal)));
    const ok = await createGatewayClient({ fetch: alive, timeoutMs: 80 }).chat({ ...base }, () => {});
    expect(ok).toMatchObject({ ok: true, status: 200 });
    const silent = vi.fn((_u: string, init: RequestInit) => Promise.resolve(streamRes(['a', 'b'], 200, 200, init.signal)));
    const timedOut = await createGatewayClient({ fetch: silent, timeoutMs: 80 }).chat({ ...base }, () => {});
    expect(timedOut).toMatchObject({ ok: false, error: expect.stringMatching(/did not answer/i) });
  });

  it('cancelling mid-stream reports aborted', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode('data: first\n\n'));
          init.signal?.addEventListener('abort', () => c.error(new Error('aborted')));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    const client = createGatewayClient({ fetch: fetchMock });
    const p = client.chat({ ...base, requestId: 'live' }, () => {
      client.abort('live');
    });
    await expect(p).resolves.toMatchObject({ ok: false, aborted: true });
  });
});
