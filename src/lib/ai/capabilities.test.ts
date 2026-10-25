import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../../model';

const askAI = vi.hoisted(() => vi.fn());
vi.mock('../ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ai')>()), askAI }));

import { AIError } from '../ai';
import { mergeCapabilities, probeJsonCapability, probeStreamingCapability, probeVisionCapability } from './capabilities';

const settings: AISettings = { provider: 'gateway', baseUrl: 'http://localhost:11434/v1', model: 'llama3' };
const reply = (text: string) => ({ text, stopReason: 'stop' as const });

beforeEach(() => askAI.mockReset());

describe('probeJsonCapability', () => {
  it('asks for a JSON object with the JSON flag, as content data, with room to think', async () => {
    askAI.mockResolvedValueOnce(reply('{"ok":true}'));
    await probeJsonCapability(settings);
    const call = askAI.mock.calls[0][0];
    expect(call.responseFormat).toBe('json');
    expect(call.dataClass).toBe('content');
    expect(call.maxOutputTokens).toBeGreaterThanOrEqual(256);
    expect(call.messages[0].content).toMatch(/JSON/);
  });

  it.each([
    ['clean', '{"ok":true}'],
    ['fenced', '```json\n{"ok": true}\n```'],
    ['in prose', 'Sure: {"ok":true} done'],
  ])('is "ok" for a %s reply', async (_n, text) => {
    askAI.mockResolvedValueOnce(reply(text));
    expect(await probeJsonCapability(settings)).toBe('ok');
  });

  it.each([['prose', 'ok, here you go'], ['wrong value', '{"ok":false}'], ['a truthy number', '{"ok":1}'], ['a truthy string', '{"ok":"yes"}'], ['a list', '[true]'], ['null', 'null'], ['empty', '']])(
    'is "no-json" for %s: the model answered, just not with the JSON asked for',
    async (_n, text) => {
      askAI.mockResolvedValueOnce(reply(text));
      expect(await probeJsonCapability(settings)).toBe('no-json');
    },
  );

  it('is "unknown", and never throws, when the request itself fails: a rate limit says nothing about JSON', async () => {
    askAI.mockRejectedValueOnce(new AIError('HTTP 429'));
    expect(await probeJsonCapability(settings)).toBe('unknown');
    askAI.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    expect(await probeJsonCapability(settings)).toBe('unknown');
    askAI.mockRejectedValueOnce(new TypeError('boom'));
    expect(await probeJsonCapability(settings)).toBe('unknown');
  });
});

describe('mergeCapabilities', () => {
  it.each([
    [undefined, true, ['json']],
    [undefined, false, []],
    [['vision'], true, ['json', 'vision']],
    [['streaming', 'json'], true, ['json', 'streaming']],
    [['json', 'vision'], false, ['vision']],
    [['json'], false, []],
  ] as const)('%j with json=%s -> %j', (current, json, expected) => {
    expect(mergeCapabilities(current as never, { json })).toEqual(expected);
  });
});

describe('probeJsonCapability and stored instructions', () => {
  it('never lets a stored systemPrompt reach the probe request', async () => {
    askAI.mockResolvedValueOnce(reply('{"ok":true}'));
    await probeJsonCapability({ ...settings, systemPrompt: 'Always answer in pirate speak' });
    expect(askAI.mock.calls[0][0].settings.systemPrompt).toBeUndefined();
  });
});

describe('mergeCapabilities with the other capabilities', () => {
  it('changes only what the probe decided', () => {
    expect(mergeCapabilities(['json'], { vision: true })).toEqual(['json', 'vision']);
    expect(mergeCapabilities(['json', 'vision', 'streaming'], { vision: false })).toEqual(['json', 'streaming']);
    expect(mergeCapabilities(undefined, { streaming: true })).toEqual(['streaming']);
    expect(mergeCapabilities(['vision'], { json: true })).toEqual(['json', 'vision']);
    expect(mergeCapabilities(['json'], {})).toEqual(['json']);
  });
});

describe('probeVisionCapability', () => {
  it('sends one small image and says "ok" when the model names its colour', async () => {
    askAI.mockResolvedValueOnce(reply('Red.'));
    expect(await probeVisionCapability(settings)).toBe('ok');
    const call = askAI.mock.calls[0][0];
    expect(call.messages[0].images).toHaveLength(1);
    expect(call.messages[0].images[0].mediaType).toBe('image/png');
    expect(call.dataClass).toBe('content');
    expect(call.settings.systemPrompt).toBeUndefined();
  });

  it('is "no" when it answers without seeing the image, or the provider refuses the image', async () => {
    askAI.mockResolvedValueOnce(reply('I cannot view images.'));
    expect(await probeVisionCapability(settings)).toBe('no');
    askAI.mockRejectedValueOnce(new AIError('image input is not supported', { status: 400 }));
    expect(await probeVisionCapability(settings)).toBe('no');
    askAI.mockRejectedValueOnce(new AIError('unprocessable', { status: 422 }));
    expect(await probeVisionCapability(settings)).toBe('no');
  });

  it('is "unknown" when the request itself failed, so nothing is recorded', async () => {
    for (const status of [401, 403, 429, 500, undefined]) {
      askAI.mockRejectedValueOnce(new AIError('failed', { status }));
      expect(await probeVisionCapability(settings), String(status)).toBe('unknown');
    }
    askAI.mockRejectedValueOnce(new Error('network'));
    expect(await probeVisionCapability(settings)).toBe('unknown');
  });
});

describe('probeStreamingCapability', () => {
  it('is "ok" when the text grew in several steps', async () => {
    askAI.mockImplementationOnce(async (input: { onText: (t: string) => void }) => {
      input.onText('1 2');
      input.onText('1 2 3 4');
      return reply('1 2 3 4');
    });
    expect(await probeStreamingCapability(settings)).toBe('ok');
    expect(askAI.mock.calls[0][0].dataClass).toBe('content');
  });

  it('is "no" when the whole answer arrived at once', async () => {
    askAI.mockImplementationOnce(async (input: { onText: (t: string) => void }) => {
      input.onText('1 2 3 4');
      return reply('1 2 3 4');
    });
    expect(await probeStreamingCapability(settings)).toBe('no');
  });

  it('is "unknown" when the request failed', async () => {
    askAI.mockRejectedValueOnce(new AIError('rate limited', { status: 429 }));
    expect(await probeStreamingCapability(settings)).toBe('unknown');
  });
});
