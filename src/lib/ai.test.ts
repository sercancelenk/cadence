/**
 * Unit tests for the AI provider abstraction — pure helpers and
 * askAI / extractTasksFromNotes with mocked fetch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../model';
import {
  AIError,
  askAI,
  buildTaskPrompt,
  defaultModel,
  extractTasksFromNotes,
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
    expect(defaultModel('openai')).toBe('gpt-4o-mini');
    expect(defaultModel('anthropic')).toBe('claude-3-5-sonnet-latest');
    expect(defaultModel('gemini')).toBe('gemini-2.0-flash');
  });

  it('returns empty string for unknown provider', () => {
    expect(defaultModel('unknown' as 'openai')).toBe('');
  });
});

describe('buildTaskPrompt', () => {
  it('builds a minimal prompt from title only', () => {
    const prompt = buildTaskPrompt({ title: '  Ship release  ' });
    expect(prompt).toContain('Task: Ship release');
    expect(prompt).toContain('How should I approach this?');
    expect(prompt).not.toContain('Notes / context');
  });

  it('includes body and extra context when provided', () => {
    const prompt = buildTaskPrompt({
      title: 'Fix bug',
      body: '  Repro steps here  ',
      context: '  Sprint deadline Friday  ',
    });
    expect(prompt).toContain('Notes / context I already wrote:');
    expect(prompt).toContain('Repro steps here');
    expect(prompt).toContain('Additional context:');
    expect(prompt).toContain('Sprint deadline Friday');
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

describe('extractTasksFromNotes', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty array for blank notes without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const tasks = await extractTasksFromNotes({ settings: configured, notes: '   ' });
    expect(tasks).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses a JSON array from the model response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          choices: [
            {
              message: {
                content: '[{"title":"Email Maria","priority":"high"},{"title":"  ","notes":"skip"}]',
              },
              finish_reason: 'stop',
            },
          ],
        }),
      ),
    );

    const tasks = await extractTasksFromNotes({
      settings: configured,
      notes: 'Maria needs the deck by Friday',
    });
    expect(tasks).toEqual([{ title: 'Email Maria', priority: 'high' }]);
  });

  it('strips markdown fences before parsing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          choices: [
            {
              message: {
                content: '```json\n[{"title":"Book flight"}]\n```',
              },
              finish_reason: 'stop',
            },
          ],
        }),
      ),
    );

    const tasks = await extractTasksFromNotes({ settings: configured, notes: 'Travel notes' });
    expect(tasks).toEqual([{ title: 'Book flight' }]);
  });

  it('throws when the model does not return JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: 'Here are your tasks…' }, finish_reason: 'stop' }],
        }),
      ),
    );

    await expect(
      extractTasksFromNotes({ settings: configured, notes: 'Some notes' }),
    ).rejects.toMatchObject({
      name: 'AIError',
      message: expect.stringContaining('JSON list'),
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
