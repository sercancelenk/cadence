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
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
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
