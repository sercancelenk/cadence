import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../../model';

const askAI = vi.hoisted(() => vi.fn());
vi.mock('../ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ai')>()), askAI }));

import { AIError } from '../ai';
import { mergeCapabilities, probeJsonCapability } from './capabilities';

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

  it.each([['prose', 'ok, here you go'], ['wrong value', '{"ok":false}'], ['a list', '[true]'], ['null', 'null'], ['empty', '']])(
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
