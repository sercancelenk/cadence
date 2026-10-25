import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AISettings, GatewayFormat } from '../model';
import { askAI } from './ai';

const gw = (gatewayFormat: GatewayFormat, extra: Partial<AISettings> = {}): AISettings => ({
  provider: 'gateway',
  baseUrl: 'https://gw.example.com/v1',
  model: 'm',
  apiKey: 'sk-gw-secret-key',
  gatewayFormat,
  ...extra,
});
const ask = { role: 'user' as const, content: 'Hi' };
const enc = new TextEncoder();

/** A Response whose body arrives in the given pieces. */
function sse(pieces: string[], init: ResponseInit = { status: 200, headers: { 'content-type': 'text/event-stream' } }) {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of pieces) c.enqueue(enc.encode(p));
      c.close();
    },
  });
  return new Response(stream, init);
}
const ev = (data: unknown, event?: string) => `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`;

const STREAMS: Record<GatewayFormat, string[]> = {
  'openai-chat': [
    ev({ choices: [{ delta: { content: 'Hel' } }] }),
    ev({ choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }] }),
    'data: [DONE]\n\n',
  ],
  'openai-responses': [
    ev({ type: 'response.output_text.delta', delta: 'Hel' }, 'response.output_text.delta'),
    ev({ type: 'response.output_text.delta', delta: 'lo' }, 'response.output_text.delta'),
    ev({ type: 'response.completed', response: {} }, 'response.completed'),
  ],
  anthropic: [
    ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } }, 'content_block_delta'),
    ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } }, 'content_block_delta'),
    ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }, 'message_delta'),
  ],
  gemini: [
    ev({ candidates: [{ content: { parts: [{ text: 'Hel' }] } }] }),
    ev({ candidates: [{ content: { parts: [{ text: 'lo' }] }, finishReason: 'STOP' }] }),
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { cadence?: unknown }).cadence;
});

describe.each(Object.keys(STREAMS) as GatewayFormat[])('streaming over the web path: %s', (format) => {
  it('asks for a stream, reports the text as it grows and returns the whole answer', async () => {
    const fetchMock = vi.fn(async () => sse(STREAMS[format]));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    const r = await askAI({ settings: gw(format), messages: [ask], dataClass: 'content', onText: (t) => seen.push(t) });
    expect(r).toEqual({ text: 'Hello', stopReason: 'stop' });
    expect(seen).toEqual(['Hel', 'Hello']);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    if (format === 'gemini') {
      expect(url).toContain(':streamGenerateContent');
      expect(url).toContain('alt=sse');
    } else {
      expect(JSON.parse(init.body as string).stream).toBe(true);
    }
  });

  it('a request without onText is not a stream request', async () => {
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }], output_text: 'x', content: [{ type: 'text', text: 'x' }], candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'STOP' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await askAI({ settings: gw(format), messages: [ask], dataClass: 'content' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('streamGenerateContent');
    expect(JSON.parse(init.body as string).stream).toBeUndefined();
  });
});

describe('streaming edge cases', () => {
  it('falls back to reading a normal JSON reply when the server ignored the stream request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: 'Plain answer' }, finish_reason: 'stop' }] })));
    const seen: string[] = [];
    const r = await askAI({ settings: gw('openai-chat'), messages: [ask], dataClass: 'content', onText: (t) => seen.push(t) });
    expect(r).toEqual({ text: 'Plain answer', stopReason: 'stop' });
    expect(seen).toEqual(['Plain answer']);
  });

  it('reads the token-limit stop from a stream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([ev({ choices: [{ delta: { content: 'cut' }, finish_reason: 'length' }] })])));
    const r = await askAI({ settings: gw('openai-chat'), messages: [ask], dataClass: 'content', onText: () => {} });
    expect(r).toEqual({ text: 'cut', stopReason: 'length' });
  });

  it('an error event in the stream becomes an AIError, with the key masked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([ev({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded sk-gw-secret-key' } }, 'error')])));
    const err = await askAI({ settings: gw('anthropic'), messages: [ask], dataClass: 'content', onText: () => {} }).catch((e) => e);
    expect(err.name).toBe('AIError');
    expect(err.message).toContain('Overloaded');
    expect(err.message).not.toContain('sk-gw-secret-key');
  });

  it('a refusal in the stream says the model declined', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([ev({ choices: [{ delta: { refusal: 'I cannot.' }, finish_reason: 'stop' }] })])));
    await expect(askAI({ settings: gw('openai-chat'), messages: [ask], dataClass: 'content', onText: () => {} })).rejects.toMatchObject({
      message: expect.stringMatching(/declined.*cannot/i),
    });
  });

  it('a stream with no text is an empty-response error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([ev({ choices: [{ delta: {}, finish_reason: 'stop' }] })])));
    await expect(askAI({ settings: gw('openai-chat'), messages: [ask], dataClass: 'content', onText: () => {} })).rejects.toMatchObject({
      message: expect.stringMatching(/empty response/i),
    });
  });

  it('an HTTP error is reported as before, not as a stream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"bad key"}}', { status: 401 })));
    await expect(askAI({ settings: gw('openai-chat'), messages: [ask], dataClass: 'content', onText: () => {} })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('cancelling mid-stream rejects with AbortError', async () => {
    const ctrl = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(enc.encode(ev({ choices: [{ delta: { content: 'part' } }] })));
            init.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
          },
        });
        return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }),
    );
    const p = askAI({ settings: gw('openai-chat'), messages: [ask], dataClass: 'content', signal: ctrl.signal, onText: (t) => t === 'part' && ctrl.abort() });
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not stream a custom Gemini path it cannot turn into a streaming one', async () => {
    const fetchMock = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'STOP' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    await askAI({
      settings: gw('gemini', { requestPath: '/custom/generate' }),
      messages: [ask],
      dataClass: 'content',
      onText: (t) => seen.push(t),
    });
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://gw.example.com/v1/custom/generate');
    expect(seen).toEqual(['x']);
  });
});

describe('streaming through the desktop bridge', () => {
  const reply = (chunks: string[]) =>
    vi.fn(async (_req: unknown, onChunk: (c: string) => void) => {
      for (const c of chunks) onChunk(c);
      return { ok: true as const, status: 200, text: '' };
    });

  it('uses aiGatewayStream, feeds its chunks and passes the data class', async () => {
    const aiGatewayStream = reply(STREAMS['openai-chat']);
    const aiGatewayChat = vi.fn();
    (window as unknown as { cadence: unknown }).cadence = { aiGatewayStream, aiGatewayChat, aiGatewayAbort: vi.fn() };
    const seen: string[] = [];
    const r = await askAI({ settings: gw('openai-chat'), messages: [ask], dataClass: 'people', onText: (t) => seen.push(t) });
    expect(r).toEqual({ text: 'Hello', stopReason: 'stop' });
    expect(seen).toEqual(['Hel', 'Hello']);
    expect(aiGatewayChat).not.toHaveBeenCalled();
    const req = aiGatewayStream.mock.calls[0][0] as { dataClass: string; body: string };
    expect(req.dataClass).toBe('people');
    expect(JSON.parse(req.body).stream).toBe(true);
  });

  it('falls back to the normal call when the bridge has no streaming', async () => {
    const aiGatewayChat = vi.fn(async () => ({ ok: true as const, status: 200, text: JSON.stringify({ choices: [{ message: { content: 'Whole' }, finish_reason: 'stop' }] }) }));
    (window as unknown as { cadence: unknown }).cadence = { aiGatewayChat, aiGatewayAbort: vi.fn() };
    const seen: string[] = [];
    const r = await askAI({ settings: gw('openai-chat'), messages: [ask], dataClass: 'content', onText: (t) => seen.push(t) });
    expect(r.text).toBe('Whole');
    expect(seen).toEqual(['Whole']);
    expect(JSON.parse((aiGatewayChat.mock.calls[0] as unknown as [{ body: string }])[0].body).stream).toBeUndefined();
  });

  it('a non-2xx status from the bridge is an error carrying the body the server sent', async () => {
    const aiGatewayStream = vi.fn(async () => ({ ok: true as const, status: 429, text: '{"error":{"message":"slow down"}}' }));
    (window as unknown as { cadence: unknown }).cadence = { aiGatewayStream, aiGatewayChat: vi.fn(), aiGatewayAbort: vi.fn() };
    await expect(askAI({ settings: gw('openai-chat'), messages: [ask], dataClass: 'content', onText: () => {} })).rejects.toMatchObject({ status: 429 });
  });

  it('aborting asks the main process to cancel the request', async () => {
    const aiGatewayAbort = vi.fn();
    const ctrl = new AbortController();
    const aiGatewayStream = vi.fn(async () => {
      ctrl.abort();
      return { ok: false as const, error: 'Request cancelled.', aborted: true };
    });
    (window as unknown as { cadence: unknown }).cadence = { aiGatewayStream, aiGatewayChat: vi.fn(), aiGatewayAbort };
    await expect(askAI({ settings: gw('openai-chat'), messages: [ask], dataClass: 'content', signal: ctrl.signal, onText: () => {} })).rejects.toMatchObject({ name: 'AbortError' });
    expect(aiGatewayAbort).toHaveBeenCalled();
  });
});
