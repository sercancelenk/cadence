/**
 * Unit tests for the AI provider abstraction — pure helpers and
 * askAI with mocked fetch (task prompts and parsing are tested under src/lib/ai/).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';
import {
  AIError,
  askAI,
  defaultModel,
  isAIConfigured,
} from './ai';

const configured: AISettings = {
  provider: 'openai',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
};

describe('isAIConfigured', () => {
  it('returns true when provider and apiKey are set', () => {
    expect(isAIConfigured(configured)).toBe(true);
    if (isAIConfigured(configured)) {
      expect(configured.apiKey).toBe('sk-test');
    }
  });

  it('returns false for missing provider or key', () => {
    expect(isAIConfigured(undefined)).toBe(false);
    expect(isAIConfigured({ provider: 'openai' } as AISettings)).toBe(false);
    expect(isAIConfigured({ apiKey: 'x' } as AISettings)).toBe(false);
  });
});

describe('defaultModel', () => {
  it('returns the default model for known providers', () => {
    expect(defaultModel('openai')).toBe('gpt-5.4-mini');
    expect(defaultModel('anthropic')).toBe('claude-sonnet-5-5');
    expect(defaultModel('gemini')).toBe('gemini-3.8-flash');
  });

  it('returns empty string for unknown provider', () => {
    expect(defaultModel('unknown' as 'openai')).toBe('');
  });
});

describe('AIError', () => {
  it('carries status and provider metadata', () => {
    const err = new AIError('failed', { status: 401, provider: 'openai' });
    expect(err.name).toBe('AIError');
    expect(err.message).toBe('failed');
    expect(err.status).toBe(401);
    expect(err.provider).toBe('openai');
  });
});

describe('askAI', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when AI is not configured', async () => {
    await expect(askAI({ settings: {}, messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
      name: 'AIError',
      message: expect.stringContaining('not configured'),
    });
  });

  it('throws when the conversation is empty', async () => {
    await expect(askAI({ settings: configured, messages: [] })).rejects.toMatchObject({
      name: 'AIError',
      message: expect.stringContaining('empty'),
    });
  });

  it('calls OpenAI and maps stop reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: 'Here is help.' }, finish_reason: 'stop' }],
        }),
      ),
    );

    const result = await askAI({
      settings: configured,
      messages: [{ role: 'user', content: 'Help me' }],
    });
    expect(result).toEqual({ text: 'Here is help.', stopReason: 'stop' });
  });

  it('maps OpenAI length finish reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: 'Partial…' }, finish_reason: 'length' }],
        }),
      ),
    );

    const result = await askAI({
      settings: configured,
      messages: [{ role: 'user', content: 'Long task' }],
    });
    expect(result.stopReason).toBe('length');
  });

  it('throws AIError on HTTP failure with friendly message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: 'Invalid key' } }), { status: 401 }),
      ),
    );

    await expect(
      askAI({ settings: configured, messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({
      name: 'AIError',
      status: 401,
      message: expect.stringContaining('rejected the API key'),
    });
  });

  it('calls Anthropic with dangerous-direct-browser-access header', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        content: [{ type: 'text', text: 'Claude says hi' }],
        stop_reason: 'end_turn',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await askAI({
      settings: { ...configured, provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(result.text).toBe('Claude says hi');
    expect(result.stopReason).toBe('stop');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('calls Gemini and maps STOP finish reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          candidates: [{ content: { parts: [{ text: 'Gemini reply' }] }, finishReason: 'STOP' }],
        }),
      ),
    );

    const result = await askAI({
      settings: { ...configured, provider: 'gemini', model: 'gemini-2.0-flash' },
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(result).toEqual({ text: 'Gemini reply', stopReason: 'stop' });
  });

  it('returns targeted error for retired Gemini 1.x models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));

    await expect(
      askAI({
        settings: { ...configured, provider: 'gemini', model: 'gemini-1.5-flash' },
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toMatchObject({
      name: 'AIError',
      status: 404,
      message: expect.stringContaining('no longer served'),
    });
  });
});

describe('custom gateway provider', () => {
  const gateway: AISettings = {
    provider: 'gateway',
    baseUrl: 'http://localhost:20128/v1',
    model: 'if/kimi-k2-thinking',
  };
  const ask = { role: 'user' as const, content: 'Help me' };

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as { cadence?: unknown }).cadence;
  });

  it('is configured with a valid URL and a model, and the key is optional', () => {
    expect(isAIConfigured(gateway)).toBe(true);
    expect(isAIConfigured({ ...gateway, apiKey: 'k' })).toBe(true);
  });

  it('is not configured without a URL, with an unsafe URL, or without a model', () => {
    expect(isAIConfigured({ ...gateway, baseUrl: undefined })).toBe(false);
    expect(isAIConfigured({ ...gateway, baseUrl: 'http://gw.example.com/v1' })).toBe(false);
    expect(isAIConfigured({ ...gateway, model: ' ' })).toBe(false);
    expect(isAIConfigured({ ...gateway, model: undefined })).toBe(false);
  });

  it('has no default model', () => {
    expect(defaultModel('gateway')).toBe('');
  });

  it('web build: posts to <base>/chat/completions with the bearer key', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const r = await askAI({ settings: { ...gateway, apiKey: 'sk-gw' }, messages: [ask] });
    expect(r).toEqual({ text: 'ok', stopReason: 'stop' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:20128/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-gw');
    expect(JSON.parse(init.body as string).model).toBe('if/kimi-k2-thinking');
  });

  it('web build: sends no authorization header without a key', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await askAI({ settings: gateway, messages: [ask] });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(['content-type']);
  });

  it('web build: a 401 is not blamed solely on the key, since the upstream provider may refuse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"message":"bad key"}}', { status: 401 })),
    );
    await expect(askAI({ settings: gateway, messages: [ask] })).rejects.toMatchObject({
      name: 'AIError',
      status: 401,
      provider: 'gateway',
      message: expect.stringContaining('provider behind this model'),
    });
  });

  it('web build: a network failure points at the URL and CORS', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(askAI({ settings: gateway, messages: [ask] })).rejects.toMatchObject({
      name: 'AIError',
      message: expect.stringContaining('CORS'),
    });
  });

  it('refuses an unsafe URL before any request is made', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      askAI({ settings: { ...gateway, baseUrl: 'http://gw.example.com/v1' }, messages: [ask] }),
    ).rejects.toMatchObject({ name: 'AIError', provider: 'gateway' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('desktop: goes through the main-process bridge, not fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const aiGatewayChat = vi.fn(async () => ({
      ok: true as const,
      status: 200,
      text: JSON.stringify({ choices: [{ message: { content: 'via main' }, finish_reason: 'length' }] }),
    }));
    (window as unknown as { cadence: unknown }).cadence = { aiGatewayChat };
    const r = await askAI({ settings: { ...gateway, apiKey: 'sk-gw' }, messages: [ask] });
    expect(r).toEqual({ text: 'via main', stopReason: 'length' });
    expect(fetchMock).not.toHaveBeenCalled();
    const req = (aiGatewayChat.mock.calls[0] as unknown as [
      { requestId: string; baseUrl: string; path: string; headers: Record<string, string>; body: string },
    ])[0];
    expect(req.baseUrl).toBe('http://localhost:20128/v1');
    expect(req.path).toBe('/chat/completions');
    expect(req.headers).toEqual({ Authorization: 'Bearer sk-gw' });
    expect(typeof req.requestId).toBe('string');
    expect(JSON.parse(req.body).messages[0].role).toBe('system');
  });

  it('desktop: maps a non-2xx status from the bridge to a friendly error', async () => {
    (window as unknown as { cadence: unknown }).cadence = {
      aiGatewayChat: async () => ({ ok: true, status: 404, text: '{"error":{"message":"no such model"}}' }),
    };
    await expect(askAI({ settings: gateway, messages: [ask] })).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining('model or the request path was not found'),
    });
  });

  it('desktop: surfaces a policy block from the main process', async () => {
    (window as unknown as { cadence: unknown }).cadence = {
      aiGatewayChat: async () => ({
        ok: false,
        reason: 'policy-disabled',
        error: 'AI features are disabled by your organization policy.',
      }),
    };
    await expect(askAI({ settings: gateway, messages: [ask] })).rejects.toMatchObject({
      name: 'AIError',
      message: 'AI features are disabled by your organization policy.',
    });
  });

  it('desktop: cancelling aborts in the main process and rejects with AbortError', async () => {
    const aiGatewayAbort = vi.fn(async () => true);
    let release: (v: unknown) => void = () => {};
    (window as unknown as { cadence: unknown }).cadence = {
      aiGatewayChat: () => new Promise((resolve) => (release = resolve)),
      aiGatewayAbort,
    };
    const ctrl = new AbortController();
    const pending = askAI({ settings: gateway, messages: [ask], signal: ctrl.signal });
    await Promise.resolve();
    ctrl.abort();
    release({ ok: false, error: 'Request cancelled.', aborted: true });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(aiGatewayAbort).toHaveBeenCalledTimes(1);
  });

  it('reports a gateway that answers with something other than JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>oops</html>', { status: 200 })));
    await expect(askAI({ settings: gateway, messages: [ask] })).rejects.toMatchObject({
      name: 'AIError',
      message: expect.stringContaining('not JSON'),
    });
  });
});

describe('custom gateway formats', () => {
  const base: AISettings = {
    provider: 'gateway',
    baseUrl: 'https://gw.example.com/v1',
    model: 'team/model-x',
    apiKey: 'sk-gw-secret',
  };
  const ask = { role: 'user' as const, content: 'Help me' };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(json: unknown) {
    const fetchMock = vi.fn(async () => Response.json(json));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  const lastCall = (m: ReturnType<typeof stubFetch>) => {
    const [url, init] = m.mock.calls[0] as unknown as [string, RequestInit];
    return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
  };

  it('openai-responses: posts to /responses and reads output_text items', async () => {
    const m = stubFetch({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'via responses' }] }],
    });
    const r = await askAI({ settings: { ...base, gatewayFormat: 'openai-responses' }, messages: [ask] });
    expect(r).toEqual({ text: 'via responses', stopReason: 'stop' });
    const c = lastCall(m);
    expect(c.url).toBe('https://gw.example.com/v1/responses');
    expect(c.headers.Authorization).toBe('Bearer sk-gw-secret');
    expect(c.body.model).toBe('team/model-x');
    expect(c.body.instructions).toEqual(expect.any(String));
    expect(c.body.input).toEqual([{ role: 'user', content: 'Help me' }]);
    expect(c.body.max_output_tokens).toBeGreaterThanOrEqual(64);
  });

  it('openai-responses: falls back to output_text and maps an incomplete reply to length', async () => {
    stubFetch({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: 'cut' });
    const r = await askAI({ settings: { ...base, gatewayFormat: 'openai-responses' }, messages: [ask] });
    expect(r).toEqual({ text: 'cut', stopReason: 'length' });
  });

  it('anthropic: posts to /messages with x-api-key and anthropic-version', async () => {
    const m = stubFetch({ content: [{ type: 'text', text: 'via anthropic' }], stop_reason: 'end_turn' });
    const r = await askAI({ settings: { ...base, gatewayFormat: 'anthropic' }, messages: [ask] });
    expect(r).toEqual({ text: 'via anthropic', stopReason: 'stop' });
    const c = lastCall(m);
    expect(c.url).toBe('https://gw.example.com/v1/messages');
    expect(c.headers['x-api-key']).toBe('sk-gw-secret');
    expect(c.headers['anthropic-version']).toBe('2023-06-01');
    expect(c.headers.Authorization).toBeUndefined();
    expect(c.body.system).toEqual(expect.any(String));
    expect(c.body.messages).toEqual([{ role: 'user', content: 'Help me' }]);
  });

  it('gemini: posts to /models/<encoded model>:generateContent with x-goog-api-key', async () => {
    const m = stubFetch({ candidates: [{ content: { parts: [{ text: 'via gemini' }] }, finishReason: 'MAX_TOKENS' }] });
    const r = await askAI({
      settings: { ...base, baseUrl: 'https://gw.example.com/v1beta', gatewayFormat: 'gemini' },
      messages: [ask],
    });
    expect(r).toEqual({ text: 'via gemini', stopReason: 'length' });
    const c = lastCall(m);
    expect(c.url).toBe('https://gw.example.com/v1beta/models/team%2Fmodel-x:generateContent');
    expect(c.headers['x-goog-api-key']).toBe('sk-gw-secret');
    expect(c.url).not.toContain('key=');
    expect(c.body.contents).toEqual([{ role: 'user', parts: [{ text: 'Help me' }] }]);
  });

  it('honours a custom auth header, raw scheme, extra headers and a request path', async () => {
    const m = stubFetch({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] });
    await askAI({
      settings: {
        ...base,
        authHeader: 'api-key',
        authScheme: 'raw',
        extraHeaders: [{ name: 'x-tenant', value: 'team-42' }],
        requestPath: '/openai/deployments/{model}/chat/completions',
      },
      messages: [ask],
    });
    const c = lastCall(m);
    expect(c.url).toBe('https://gw.example.com/v1/openai/deployments/team%2Fmodel-x/chat/completions');
    expect(c.headers['api-key']).toBe('sk-gw-secret');
    expect(c.headers['x-tenant']).toBe('team-42');
    expect(c.headers.Authorization).toBeUndefined();
  });

  it('refuses a header the transport owns, before any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      askAI({
        settings: { ...base, extraHeaders: [{ name: 'Host', value: 'evil.com' }] },
        messages: [ask],
      }),
    ).rejects.toMatchObject({ name: 'AIError', provider: 'gateway' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attaches a diagnostic to a gateway error that never contains the API key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"message":"nope"}}', { status: 405 })),
    );
    const err = await askAI({
      settings: { ...base, extraHeaders: [{ name: 'x-tenant', value: 'team-42-secret' }] },
      messages: [ask],
    }).catch((e) => e);
    expect(err.name).toBe('AIError');
    expect(err.message).toContain('HTTP 405');
    expect(err.diagnostic).toContain('POST https://gw.example.com/v1/chat/completions');
    expect(err.diagnostic).toContain('-> HTTP 405');
    expect(err.diagnostic).toContain('Authorization:');
    expect(err.diagnostic).toContain('format: openai-chat (browser)');
    expect(err.diagnostic).not.toContain('sk-gw-secret');
    expect(err.diagnostic).not.toContain('team-42-secret');
    expect(err.diagnostic).not.toContain('sk-'); // not even a key prefix
    expect(err.diagnostic).not.toContain('tea'); // nor the start of an extra header value
  });

  it('redacts secrets that the gateway echoes back in its reply', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad header Authorization: Bearer sk-gw-secret / x-tenant=team-42-secret', { status: 400 })),
    );
    const err = await askAI({
      settings: { ...base, extraHeaders: [{ name: 'x-tenant', value: 'team-42-secret' }] },
      messages: [ask],
    }).catch((e) => e);
    expect(err.diagnostic).toContain('<hidden>');
    expect(err.diagnostic).not.toContain('sk-gw-secret');
    expect(err.diagnostic).not.toContain('team-42-secret');
  });

  it('explains an empty reply that hit the token limit', async () => {
    stubFetch({ choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'length' }] });
    await expect(askAI({ settings: base, messages: [ask] })).rejects.toMatchObject({
      name: 'AIError',
      message: expect.stringContaining('token limit'),
      diagnostic: expect.stringContaining('finish_reason'),
    });
  });

  it('puts a diagnostic on a network failure too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const err = await askAI({ settings: base, messages: [ask] }).catch((e) => e);
    expect(err.diagnostic).toContain('Failed to fetch');
    expect(err.diagnostic).not.toContain('sk-gw-secret');
  });
});

describe('hosted providers run through the shared engine', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as { cadence?: unknown }).cadence;
  });
  const ask = { role: 'user' as const, content: 'Help me' };

  it('gemini: key travels in the address, no auth header, and is masked in the diagnostic', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":{"message":"bad"}}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const err = await askAI({
      settings: { provider: 'gemini', apiKey: 'AIza-secret-key', model: 'gemini-2.0-flash' },
      messages: [ask],
    }).catch((e) => e);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIza-secret-key',
    );
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(['content-type']);
    expect(err.provider).toBe('gemini');
    expect(err.diagnostic).toContain('?key=<hidden>');
    expect(err.diagnostic).not.toContain('AIza-secret-key');
    expect(err.message).not.toContain('AIza-secret-key');
  });

  it('gemini: a retired 1.x model gets the targeted message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(
      askAI({ settings: { provider: 'gemini', apiKey: 'AIza-secret-key', model: 'gemini-1.5-flash' }, messages: [ask] }),
    ).rejects.toMatchObject({ provider: 'gemini', status: 404, message: expect.stringContaining('retired') });
  });

  it('anthropic: sends the key, the API version and the browser opt-in header', async () => {
    const fetchMock = vi.fn(async () => Response.json({ content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn' }));
    vi.stubGlobal('fetch', fetchMock);
    await askAI({ settings: { provider: 'anthropic', apiKey: 'sk-ant-key', model: 'm' }, messages: [ask] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const h = init.headers as Record<string, string>;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(h['x-api-key']).toBe('sk-ant-key');
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('openai: bearer key and the chat completions address', async () => {
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await askAI({ settings: { provider: 'openai', apiKey: 'sk-key', model: 'm' }, messages: [ask] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-key');
  });

  it('desktop: hosted providers go through the main-process bridge too', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const aiGatewayChat = vi.fn(async () => ({
      ok: true as const,
      status: 200,
      text: JSON.stringify({ choices: [{ message: { content: 'via main' }, finish_reason: 'stop' }] }),
    }));
    (window as unknown as { cadence: unknown }).cadence = { aiGatewayChat };
    const r = await askAI({ settings: { provider: 'openai', apiKey: 'sk-key', model: 'm' }, messages: [ask] });
    expect(r.text).toBe('via main');
    expect(fetchMock).not.toHaveBeenCalled();
    const req = (aiGatewayChat.mock.calls[0] as unknown as [{ baseUrl: string; path: string }])[0];
    expect(req).toMatchObject({ baseUrl: 'https://api.openai.com/v1', path: '/chat/completions' });
  });

  it('desktop: a key echoed in a bridge error message is masked', async () => {
    (window as unknown as { cadence: unknown }).cadence = {
      aiGatewayChat: async () => ({ ok: false, error: 'Could not reach (https://x/?key=AIza-secret-key)' }),
    };
    const err = await askAI({
      settings: { provider: 'gemini', apiKey: 'AIza-secret-key', model: 'gemini-2.0-flash' },
      messages: [ask],
    }).catch((e) => e);
    expect(err.message).not.toContain('AIza-secret-key');
    expect(err.diagnostic).not.toContain('AIza-secret-key');
  });

  it('gemini: a key echoed in an error body never reaches the message or the diagnostic', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"message":"API key not valid: AIza-secret-key"}}', { status: 400 })),
    );
    const err = await askAI({
      settings: { provider: 'gemini', apiKey: 'AIza-secret-key', model: 'gemini-2.0-flash' },
      messages: [ask],
    }).catch((e) => e);
    expect(err.message).toContain('<hidden>');
    expect(err.message).not.toContain('AIza-secret-key');
    expect(err.diagnostic).not.toContain('AIza-secret-key');
  });

  it('gemini: the retired-model message carries a diagnostic without the key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const err = await askAI({
      settings: { provider: 'gemini', apiKey: 'AIza-secret-key', model: 'gemini-1.5-flash' },
      messages: [ask],
    }).catch((e) => e);
    expect(err.message).toContain('retired');
    expect(err.diagnostic).toContain('?key=<hidden>');
    expect(err.diagnostic).not.toContain('AIza-secret-key');
  });

  it('still reports a missing key for a hosted provider', async () => {
    await expect(
      askAI({ settings: { provider: 'openai', model: 'm' }, messages: [ask] }),
    ).rejects.toMatchObject({ name: 'AIError', message: expect.stringContaining('not configured') });
  });
});

describe('provider details checked against the providers\' published docs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const ask = { role: 'user' as const, content: 'Help me' };
  const bodyOf = (m: ReturnType<typeof vi.fn>) =>
    JSON.parse(((m.mock.calls[0] as unknown as [string, RequestInit])[1].body as string));

  it('hosted OpenAI sends max_completion_tokens, never max_tokens', async () => {
    const m = vi.fn(async () => Response.json({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] }));
    vi.stubGlobal('fetch', m);
    await askAI({ settings: { provider: 'openai', apiKey: 'sk-key', model: 'gpt-5.4-mini' }, messages: [ask] });
    const body = bodyOf(m);
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(64);
    expect(body.max_tokens).toBeUndefined();
  });

  it('a custom gateway sends max_tokens unless told otherwise', async () => {
    const m = vi.fn(async () => Response.json({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] }));
    vi.stubGlobal('fetch', m);
    const base = { provider: 'gateway' as const, baseUrl: 'https://gw.example.com/v1', model: 'm' };
    await askAI({ settings: base, messages: [ask] });
    expect(bodyOf(m).max_tokens).toBeGreaterThanOrEqual(64);
    expect(bodyOf(m).max_completion_tokens).toBeUndefined();
    m.mockClear();
    await askAI({ settings: { ...base, maxTokensField: 'max_completion_tokens' }, messages: [ask] });
    expect(bodyOf(m).max_completion_tokens).toBeGreaterThanOrEqual(64);
    expect(bodyOf(m).max_tokens).toBeUndefined();
  });

  it('gemini: the system instruction has no role, as in Google\'s examples', async () => {
    const m = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }] }));
    vi.stubGlobal('fetch', m);
    await askAI({ settings: { provider: 'gemini', apiKey: 'AIza-key-1234', model: 'gemini-3.8-flash' }, messages: [ask] });
    const body = bodyOf(m);
    expect(body.systemInstruction).toEqual({ parts: [{ text: expect.any(String) }] });
    expect(body.contents[0].role).toBe('user');
  });

  it.each(['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'])(
    'gemini: a 404 for the retired model %s says it was retired',
    async (model) => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
      await expect(
        askAI({ settings: { provider: 'gemini', apiKey: 'AIza-key-1234', model }, messages: [ask] }),
      ).rejects.toMatchObject({ message: expect.stringContaining('retired') });
    },
  );

  it('gemini: a 404 for a current model is the normal not-found message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(
      askAI({ settings: { provider: 'gemini', apiKey: 'AIza-key-1234', model: 'gemini-3.8-flash' }, messages: [ask] }),
    ).rejects.toMatchObject({ message: expect.stringContaining('could not find that model') });
  });

  it('gemini: no text and MAX_TOKENS explains the token limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] })),
    );
    await expect(
      askAI({ settings: { provider: 'gemini', apiKey: 'AIza-key-1234', model: 'gemini-3.8-flash' }, messages: [ask] }),
    ).rejects.toMatchObject({ message: expect.stringContaining('token limit') });
  });
});

describe('engine robustness (from the independent review)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const ask = { role: 'user' as const, content: 'Help me' };
  const gw = { provider: 'gateway' as const, baseUrl: 'https://gw.example.com/v1', model: 'm', apiKey: 'sk-gw-secret-key' };
  const reply = (json: unknown) => vi.stubGlobal('fetch', vi.fn(async () => Response.json(json)));

  it.each([
    ['null', 'null'],
    ['a number', '42'],
    ['a string', '"hello"'],
    ['an array', '[1,2]'],
  ])('a 200 reply that is JSON %s is an AIError with a diagnostic, never a raw TypeError', async (_label, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));
    for (const gatewayFormat of ['openai-chat', 'openai-responses', 'anthropic', 'gemini'] as const) {
      const err = await askAI({ settings: { ...gw, gatewayFormat }, messages: [ask] }).catch((e) => e);
      expect(err.name, gatewayFormat).toBe('AIError');
      expect(err.message, gatewayFormat).toContain('unexpected shape');
      expect(err.diagnostic, gatewayFormat).toContain('HTTP 200');
    }
  });

  it('wrongly typed fields inside a valid object still give an AIError', async () => {
    for (const [gatewayFormat, json] of [
      ['openai-chat', { choices: 'nope' }],
      ['openai-chat', { choices: [null] }],
      ['openai-responses', { output: { a: 1 }, status: 'completed' }],
      ['anthropic', { content: 'text' }],
      ['gemini', { candidates: { a: 1 } }],
      ['gemini', { candidates: [{ content: { parts: 'x' } }] }],
    ] as const) {
      reply(json);
      const err = await askAI({ settings: { ...gw, gatewayFormat }, messages: [ask] }).catch((e) => e);
      expect(err.name, `${gatewayFormat} ${JSON.stringify(json)}`).toBe('AIError');
    }
  });

  it('openai-chat: reads message.content given as a list of text parts', async () => {
    reply({
      choices: [{ message: { content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world' }, { type: 'image' }] }, finish_reason: 'stop' }],
    });
    expect(await askAI({ settings: gw, messages: [ask] })).toEqual({ text: 'Hello world', stopReason: 'stop' });
  });

  it('openai-responses: an incomplete reply with only reasoning explains the token limit', async () => {
    reply({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'reasoning', summary: [] }],
    });
    await expect(askAI({ settings: { ...gw, gatewayFormat: 'openai-responses' }, messages: [ask] })).rejects.toMatchObject({
      message: expect.stringContaining('token limit'),
    });
  });

  it('web path: refuses redirects so custom auth headers cannot follow one to another host', async () => {
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await askAI({ settings: gw, messages: [ask] });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.redirect).toBe('error');
  });

  it('web path: gives up after the timeout with a readable message', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      ),
    );
    const pending = askAI({ settings: gw, messages: [ask] }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(120_001);
    const err = await pending;
    expect(err.name).toBe('AIError');
    expect(err.message).toContain('did not answer within 120 seconds');
  });

  it('web path: a user cancel is still an AbortError, not a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      ),
    );
    const ctrl = new AbortController();
    const pending = askAI({ settings: gw, messages: [ask], signal: ctrl.signal }).catch((e) => e);
    ctrl.abort();
    expect((await pending).name).toBe('AbortError');
  });

  it('does not mask harmless flag values such as "true" in the diagnostic or the message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"message":"bad request","stream": true, "ok": true}}', { status: 400 })),
    );
    const err = await askAI({
      settings: { provider: 'anthropic', apiKey: 'sk-ant-secret-key', model: 'm' },
      messages: [ask],
    }).catch((e) => e);
    expect(err.diagnostic).toContain('"stream": true');
    expect(err.diagnostic).not.toContain('<hidden>"');
  });

  it('masks an extra-header token that a gateway echoes into the error the user sees', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('tenant token team-token-98765 rejected', { status: 400 })),
    );
    const err = await askAI({
      settings: { ...gw, extraHeaders: [{ name: 'x-tenant', value: 'team-token-98765' }] },
      messages: [ask],
    }).catch((e) => e);
    expect(err.message).not.toContain('team-token-98765');
    expect(err.diagnostic).not.toContain('team-token-98765');
  });
});

describe('structured output (responseFormat: json)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const ask = { role: 'user' as const, content: 'Return JSON' };
  const gw = { provider: 'gateway' as const, baseUrl: 'https://gw.example.com/v1', model: 'm', apiKey: 'sk-gw-secret-key' };
  const okChat = () => Response.json({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] });
  const okResponses = () => Response.json({ status: 'completed', output_text: '{}' });
  const okGemini = () => Response.json({ candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }] });
  const okAnthropic = () => Response.json({ content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn' });
  const bodyOf = (m: ReturnType<typeof vi.fn>) => JSON.parse((m.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  const run = async (settings: Parameters<typeof askAI>[0]['settings'], reply: () => Response, responseFormat?: 'json') => {
    const m = vi.fn(async () => reply());
    vi.stubGlobal('fetch', m);
    await askAI({ settings, messages: [ask], responseFormat });
    return bodyOf(m);
  };

  it('openai-chat: json_object response format, only when asked (gateway and hosted OpenAI)', async () => {
    expect((await run(gw, okChat, 'json')).response_format).toEqual({ type: 'json_object' });
    expect((await run(gw, okChat)).response_format).toBeUndefined();
    const hosted = await run({ provider: 'openai', apiKey: 'sk-key-1234', model: 'gpt-5.4-mini' }, okChat, 'json');
    expect(hosted.response_format).toEqual({ type: 'json_object' });
    expect(hosted.max_completion_tokens).toBeGreaterThanOrEqual(64);
  });

  it('openai-responses: text.format json_object', async () => {
    const s = { ...gw, gatewayFormat: 'openai-responses' as const };
    expect((await run(s, okResponses, 'json')).text).toEqual({ format: { type: 'json_object' } });
    expect((await run(s, okResponses)).text).toBeUndefined();
  });

  it('gemini: generationConfig.responseMimeType application/json, other settings kept', async () => {
    const s = { provider: 'gemini' as const, apiKey: 'AIza-key-1234', model: 'gemini-3.8-flash' };
    const withJson = await run(s, okGemini, 'json');
    expect(withJson.generationConfig.responseMimeType).toBe('application/json');
    expect(withJson.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(64);
    expect(withJson.generationConfig.temperature).toBe(0.5);
    expect((await run(s, okGemini)).generationConfig.responseMimeType).toBeUndefined();
  });

  it('anthropic: no schema-less JSON mode exists, so the flag changes nothing', async () => {
    const s = { provider: 'anthropic' as const, apiKey: 'sk-ant-key-1234', model: 'claude-sonnet-5-5' };
    const a = await run(s, okAnthropic, 'json');
    const b = await run(s, okAnthropic);
    expect(a).toEqual(b);
  });
});

describe('data class on the desktop bridge', () => {
  afterEach(() => {
    delete (window as { cadence?: unknown }).cadence;
  });
  const reply = JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] });
  const mount = () => {
    const aiGatewayChat = vi.fn(async () => ({ ok: true as const, status: 200, text: reply }));
    (window as unknown as { cadence: unknown }).cadence = { aiGatewayChat };
    return aiGatewayChat;
  };
  const settings = { provider: 'gateway' as const, baseUrl: 'https://gw.example.com/v1', model: 'm' };
  const ask = { role: 'user' as const, content: 'hi' };

  it('sends dataClass people when the caller says so, and content by default', async () => {
    const bridge = mount();
    await askAI({ settings, messages: [ask], dataClass: 'people' });
    await askAI({ settings, messages: [ask] });
    const calls = bridge.mock.calls as unknown as Array<[{ dataClass?: string }]>;
    expect(calls[0][0].dataClass).toBe('people');
    expect(calls[1][0].dataClass).toBe('content');
  });
});

describe('system text in the engine', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const settings = { provider: 'gateway' as const, baseUrl: 'https://gw.example.com/v1', model: 'm' };
  const sentSystem = async (input: Partial<Parameters<typeof askAI>[0]>) => {
    const m = vi.fn(async () => Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
    vi.stubGlobal('fetch', m);
    await askAI({ settings, messages: [{ role: 'user', content: 'hi' }], ...input });
    const body = JSON.parse((m.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    return body.messages[0].content as string;
  };

  it('uses the caller\'s system text', async () => {
    expect(await sentSystem({ fallbackSystem: 'THE TASK SYSTEM TEXT' })).toBe('THE TASK SYSTEM TEXT');
  });

  it('never lets a stored systemPrompt replace it', async () => {
    const out = await sentSystem({ settings: { ...settings, systemPrompt: 'EVIL OVERRIDE' }, fallbackSystem: 'THE TASK SYSTEM TEXT' });
    expect(out).toBe('THE TASK SYSTEM TEXT');
    expect(await sentSystem({ settings: { ...settings, systemPrompt: 'EVIL OVERRIDE' } })).not.toContain('EVIL');
  });

  it('falls back to a neutral instruction, not a task-specific prompt', async () => {
    const out = await sentSystem({});
    expect(out.length).toBeLessThan(120);
    expect(out).not.toMatch(/Cadence|coach|task manager/i);
  });

  it('cuts an over-long system text at 4,000 characters', async () => {
    expect((await sentSystem({ fallbackSystem: 'x'.repeat(5000) })).length).toBe(4000);
  });
});
