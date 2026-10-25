import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../../model';

const askAI = vi.hoisted(() => vi.fn());
vi.mock('../ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ai')>()), askAI }));

import { AIError } from '../ai';
import { coachTask } from './prompts/coach';
import { extractTask } from './prompts/extract';
import { runAiTask } from './runTask';
import type { AiTask } from './types';

const features = { ai: true, aiPeople: true, aiFocusNote: true };
const cloud: AISettings = { provider: 'openai', apiKey: 'sk-cloud-key-1234', model: 'gpt-5.4-mini' };
const local: AISettings = {
  provider: 'gateway',
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3',
  defaultMeta: { name: 'Local' },
};
const now = new Date('2026-10-24T12:00:00Z');
const reply = (text: string, stopReason: 'stop' | 'length' | 'other' = 'stop') => ({ text, stopReason });
const extractInput = { notes: 'Send the brief to Maria by Friday.', lists: [{ id: 'g1', name: 'Work' }] };
const goodJson = JSON.stringify({ tasks: [{ title: 'Send the brief to Maria', list: 'Work' }] });

/** A tiny task that carries people data. */
const peopleTask: AiTask<string, string> = {
  id: 'test.people',
  promptVersion: 1,
  dataClass: 'people',
  needsJson: false,
  allowsFocusNote: false,
  build: (input) => ({ system: 'SYS', user: input, json: false, maxOutputTokens: 100 }),
  parse: (r) => ({ ok: true, value: r }),
};

beforeEach(() => askAI.mockReset());

describe('gates that stop a run before any request', () => {
  it('not-configured without a connection', async () => {
    const r = await runAiTask({ task: coachTask, input: { title: 't' }, settings: undefined, features, now });
    expect(r).toMatchObject({ ok: false, reason: 'not-configured' });
    expect(askAI).not.toHaveBeenCalled();
  });

  it('policy when the organization turned AI off', async () => {
    const r = await runAiTask({ task: coachTask, input: { title: 't' }, settings: cloud, features: { ...features, ai: false }, now });
    expect(r).toMatchObject({ ok: false, reason: 'policy' });
    expect(askAI).not.toHaveBeenCalled();
  });

  it('a people task never reaches a cloud connection', async () => {
    const r = await runAiTask({ task: peopleTask, input: 'x', settings: cloud, features, now });
    expect(r).toMatchObject({ ok: false, reason: 'blocked-people' });
    expect(askAI).not.toHaveBeenCalled();
  });

  it('a people task is blocked by policy even on a loopback connection', async () => {
    const r = await runAiTask({ task: peopleTask, input: 'x', settings: local, features: { ...features, aiPeople: false }, now });
    expect(r).toMatchObject({ ok: false, reason: 'policy' });
    expect(askAI).not.toHaveBeenCalled();
  });

  it('a people task runs on a loopback gateway and tells the engine it is people data', async () => {
    askAI.mockResolvedValueOnce(reply('done'));
    const r = await runAiTask({ task: peopleTask, input: 'x', settings: local, features, now });
    expect(r).toMatchObject({ ok: true, value: 'done', connectionName: 'Local' });
    expect(askAI.mock.calls[0][0].dataClass).toBe('people');
  });

  it('a people task runs on a cloud connection the user explicitly allowed', async () => {
    askAI.mockResolvedValueOnce(reply('done'));
    const r = await runAiTask({ task: peopleTask, input: 'x', settings: { ...cloud, defaultMeta: { allowPeopleData: true } }, features, now });
    expect(r.ok).toBe(true);
  });

  it('capability: a JSON task is refused on a connection a probe found unreliable, but not on an unprobed one', async () => {
    const probedNoJson: AISettings = { ...local, defaultMeta: { probedAt: '2026-10-24T10:00:00.000Z' } };
    const r = await runAiTask({ task: extractTask, input: extractInput, settings: probedNoJson, features, now });
    expect(r).toMatchObject({ ok: false, reason: 'capability' });
    expect(askAI).not.toHaveBeenCalled();
    askAI.mockResolvedValueOnce(reply(goodJson));
    expect((await runAiTask({ task: extractTask, input: extractInput, settings: local, features, now })).ok).toBe(true);
    askAI.mockResolvedValueOnce(reply(goodJson));
    const withJson: AISettings = { ...local, defaultMeta: { probedAt: '2026-10-24T10:00:00.000Z', capabilities: ['json'] } };
    expect((await runAiTask({ task: extractTask, input: extractInput, settings: withJson, features, now })).ok).toBe(true);
  });

  it('capability: the user can allow JSON tasks on a connection the probe found unreliable', async () => {
    const overridden: AISettings = { ...local, defaultMeta: { probedAt: '2026-10-24T10:00:00.000Z', jsonOverride: true } };
    askAI.mockResolvedValueOnce(reply(goodJson));
    expect((await runAiTask({ task: extractTask, input: extractInput, settings: overridden, features, now })).ok).toBe(true);
    // The same switch on an extra connection.
    const extra: AISettings = {
      ...cloud,
      connections: [{ id: 'c1', name: 'Local', provider: 'gateway', baseUrl: 'http://localhost:11434/v1', model: 'm', probedAt: '2026-10-24T10:00:00.000Z', jsonOverride: true }],
      routing: { content: 'c1' },
    };
    askAI.mockResolvedValueOnce(reply(goodJson));
    expect((await runAiTask({ task: extractTask, input: extractInput, settings: extra, features, now })).ok).toBe(true);
    const notAllowed: AISettings = { ...local, defaultMeta: { probedAt: '2026-10-24T10:00:00.000Z', jsonOverride: false } };
    expect(await runAiTask({ task: extractTask, input: extractInput, settings: notAllowed, features, now })).toMatchObject({ ok: false, reason: 'capability' });
  });
});

describe('a reply that cannot be used', () => {
  it('after the repair attempt it says what to try: another model or another connection', async () => {
    askAI.mockResolvedValue(reply('not json at all'));
    const r = await runAiTask({ task: extractTask, input: extractInput, settings: local, features, now });
    expect(r).toMatchObject({ ok: false, reason: 'invalid-output' });
    expect((r as { message: string }).message).toMatch(/larger model or another connection/i);
    expect(askAI).toHaveBeenCalledTimes(2);
    askAI.mockReset();
  });
});

describe('images', () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4IyJCEmIY1TCqYfhqAAACcQQQFwFJQgAAAABJRU5ErkJggg==';
  const images = [{ mediaType: 'image/png' as const, base64: PNG }];
  const visionTask = { ...coachTask, id: 'ai.vision-test', needsVision: true };

  it('a vision task is refused on a connection that has not been confirmed for images, and nothing is sent', async () => {
    const r = await runAiTask({ task: visionTask, input: { title: 't' }, settings: local, features, now, images });
    expect(r).toMatchObject({ ok: false, reason: 'capability' });
    expect((r as { message: string }).message).toMatch(/Check images/i);
    expect(askAI).not.toHaveBeenCalled();
  });

  it('on a confirmed connection the images go with the first message', async () => {
    askAI.mockResolvedValueOnce(reply('seen'));
    const withVision: AISettings = { ...local, defaultMeta: { capabilities: ['vision'], probedAt: '2026-10-24T10:00:00.000Z' } };
    const r = await runAiTask({ task: visionTask, input: { title: 't' }, settings: withVision, features, now, images });
    expect(r.ok).toBe(true);
    const sent = askAI.mock.calls[0][0].messages[0];
    expect(sent.role).toBe('user');
    expect(sent.images).toEqual(images);
  });

  it('a vision task without images is not sent', async () => {
    const withVision: AISettings = { ...local, defaultMeta: { capabilities: ['vision'] } };
    const r = await runAiTask({ task: visionTask, input: { title: 't' }, settings: withVision, features, now });
    expect(r).toMatchObject({ ok: false });
    expect(askAI).not.toHaveBeenCalled();
  });

  it('a task that does not use images never sends them, even if given', async () => {
    askAI.mockResolvedValueOnce(reply('plain'));
    await runAiTask({ task: coachTask, input: { title: 't' }, settings: local, features, now, images });
    expect(askAI.mock.calls[0][0].messages[0].images).toBeUndefined();
  });
});

describe('streaming', () => {
  it('passes onText to the first request only, never to the repair request, and returns the final value', async () => {
    askAI.mockResolvedValueOnce(reply('not json')).mockResolvedValueOnce(reply(goodJson));
    const onText = vi.fn();
    const r = await runAiTask({ task: extractTask, input: extractInput, settings: local, features, now, onText });
    expect(r.ok).toBe(true);
    expect(askAI.mock.calls[0][0].onText).toBe(onText);
    expect(askAI.mock.calls[1][0].onText).toBeUndefined();
  });

  it('asks for no stream when no onText was given', async () => {
    askAI.mockResolvedValueOnce(reply('plain'));
    await runAiTask({ task: coachTask, input: { title: 't' }, settings: local, features, now });
    expect(askAI.mock.calls[0][0].onText).toBeUndefined();
  });
});

describe('routing', () => {
  it('uses the routed connection and reports it', async () => {
    askAI.mockResolvedValueOnce(reply('ok'));
    const settings: AISettings = {
      ...cloud,
      connections: [{ id: 'c1', name: 'Company', provider: 'gateway', baseUrl: 'https://gw.example.com/v1', model: 'team/x' }],
      routing: { content: 'c1' },
    };
    const r = await runAiTask({ task: coachTask, input: { title: 't' }, settings, features, now });
    expect(r).toMatchObject({ ok: true, connectionName: 'Company', model: 'team/x', fellBack: false });
    expect(askAI.mock.calls[0][0].settings.model).toBe('team/x');
  });

  it('falls back to the default, and says so, when the routed connection was deleted', async () => {
    askAI.mockResolvedValueOnce(reply('ok'));
    const r = await runAiTask({ task: coachTask, input: { title: 't' }, settings: { ...cloud, routing: { content: 'gone' } }, features, now });
    expect(r).toMatchObject({ ok: true, fellBack: true });
  });
});

describe('what is sent', () => {
  it('sends the registry system text once, never a stored systemPrompt, and the JSON flag for JSON tasks', async () => {
    askAI.mockResolvedValueOnce(reply(goodJson));
    await runAiTask({ task: extractTask, input: extractInput, settings: { ...local, systemPrompt: 'EVIL OVERRIDE' }, features, now });
    const call = askAI.mock.calls[0][0];
    expect(call.settings.systemPrompt).toBeUndefined();
    expect(call.fallbackSystem).toBe(extractTask.build(extractInput, { now, timeZone: 'UTC', options: {} }).system);
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].content).not.toContain('EVIL OVERRIDE');
    expect(call.responseFormat).toBe('json');
    expect(call.maxOutputTokens).toBe(2400);
  });

  it('adds the legacy focus note, sanitized, only for tasks that allow it and when policy permits', async () => {
    askAI.mockResolvedValue(reply('ok'));
    const note = 'prefer **short** answers https://evil.example';
    await runAiTask({ task: coachTask, input: { title: 't' }, settings: cloud, features, legacyFocusNote: note, now });
    expect(askAI.mock.calls[0][0].messages[0].content).toContain('prefer short answers');
    expect(askAI.mock.calls[0][0].messages[0].content).not.toContain('evil.example');
    askAI.mockClear();
    await runAiTask({ task: coachTask, input: { title: 't' }, settings: cloud, features: { ...features, aiFocusNote: false }, legacyFocusNote: note, now });
    expect(askAI.mock.calls[0][0].messages[0].content).not.toContain('prefer short answers');
    askAI.mockClear();
    askAI.mockResolvedValue(reply(goodJson));
    await runAiTask({ task: extractTask, input: extractInput, settings: cloud, features, legacyFocusNote: note, now });
    const extractUser = askAI.mock.calls[0][0].messages[0].content;
    expect(extractUser).toContain('prefer short answers'); // the legacy value still works on Extract tasks
    expect(extractUser).not.toContain('evil.example');
    expect(askAI.mock.calls[0][0].fallbackSystem).not.toContain('prefer short answers');
    askAI.mockClear();
    const noFocus: AiTask<string, string> = { ...peopleTask, id: 'test.nofocus', dataClass: 'content', allowsFocusNote: false, build: (i, c) => ({ system: 'S', user: i + (c.focusNote ?? ''), json: false, maxOutputTokens: 10 }) };
    askAI.mockResolvedValue(reply('x'));
    await runAiTask({ task: noFocus, input: 'in', settings: cloud, features, legacyFocusNote: note, now });
    expect(askAI.mock.calls[0][0].messages[0].content).toBe('in'); // a task that does not allow it never sees it
  });

  it('passes the abort signal to the engine', async () => {
    askAI.mockResolvedValueOnce(reply('ok'));
    const ctrl = new AbortController();
    await runAiTask({ task: coachTask, input: { title: 't' }, settings: cloud, features, signal: ctrl.signal, now });
    expect(askAI.mock.calls[0][0].signal).toBe(ctrl.signal);
  });
});

describe('validation and the single repair attempt', () => {
  it.each([
    ['null', 'null'],
    ['prose', 'I found nothing to do.'],
    ['an object without tasks', '{"a":1}'],
  ])('a bad first reply (%s) is repaired once, with the validator message', async (_n, bad) => {
    askAI.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(goodJson));
    const r = await runAiTask({ task: extractTask, input: extractInput, settings: local, features, now });
    expect(r).toMatchObject({ ok: true, repaired: true });
    const second = askAI.mock.calls[1][0];
    expect(second.messages).toHaveLength(3);
    expect(second.messages[1]).toEqual({ role: 'assistant', content: bad });
    expect(second.messages[2].content).toMatch(/not valid|did not contain|JSON/i);
  });

  it('two bad replies are discarded: nothing is returned', async () => {
    askAI.mockResolvedValue(reply('nope'));
    const r = await runAiTask({ task: extractTask, input: extractInput, settings: local, features, now });
    expect(r).toMatchObject({ ok: false, reason: 'invalid-output' });
    expect('value' in r).toBe(false);
    expect(askAI).toHaveBeenCalledTimes(2);
  });

  it('fenced JSON and JSON wrapped in prose are accepted without a repair', async () => {
    askAI.mockResolvedValueOnce(reply('```json\n' + goodJson + '\n```'));
    expect(await runAiTask({ task: extractTask, input: extractInput, settings: local, features, now })).toMatchObject({ ok: true, repaired: false });
  });
});

describe('engine errors', () => {
  it('an AIError becomes an engine failure that keeps the diagnostic', async () => {
    askAI.mockRejectedValueOnce(new AIError('The gateway answered HTTP 405', { diagnostic: 'POST https://x\n-> HTTP 405' }));
    const r = await runAiTask({ task: coachTask, input: { title: 't' }, settings: cloud, features, now });
    expect(r).toMatchObject({ ok: false, reason: 'engine', message: 'The gateway answered HTTP 405', diagnostic: 'POST https://x\n-> HTTP 405' });
  });

  it('an abort is cancelled, not an error', async () => {
    askAI.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    expect(await runAiTask({ task: coachTask, input: { title: 't' }, settings: cloud, features, now })).toMatchObject({ ok: false, reason: 'cancelled' });
  });

  it('an unexpected error is reported as an engine failure, not thrown', async () => {
    askAI.mockRejectedValueOnce(new TypeError('boom'));
    expect(await runAiTask({ task: coachTask, input: { title: 't' }, settings: cloud, features, now })).toMatchObject({ ok: false, reason: 'engine' });
  });
});

describe('conversation and stop reason (used by Ask AI follow-ups)', () => {
  it('appends the conversation after the opening message, in order', async () => {
    askAI.mockResolvedValueOnce(reply('second answer'));
    const conversation = [
      { role: 'assistant' as const, content: 'first answer' },
      { role: 'user' as const, content: 'make it shorter' },
    ];
    const r = await runAiTask({ task: coachTask, input: { title: 'Ship it' }, settings: cloud, features, conversation, now });
    expect(r).toMatchObject({ ok: true, value: 'second answer' });
    const sent = askAI.mock.calls[0][0].messages;
    expect(sent).toHaveLength(3);
    expect(sent[0].role).toBe('user');
    expect(sent[0].content).toContain('Ship it');
    expect(sent.slice(1)).toEqual(conversation);
  });

  it('reports why the reply stopped, so the caller can offer Continue', async () => {
    askAI.mockResolvedValueOnce(reply('cut off mid-', 'length'));
    const r = await runAiTask({ task: coachTask, input: { title: 't' }, settings: cloud, features, now });
    expect(r).toMatchObject({ ok: true, stopReason: 'length' });
    askAI.mockResolvedValueOnce(reply('done'));
    expect(await runAiTask({ task: coachTask, input: { title: 't' }, settings: cloud, features, now })).toMatchObject({ stopReason: 'stop' });
  });

  it('reports the stop reason of the repaired reply, not the discarded one', async () => {
    askAI.mockResolvedValueOnce(reply('nope', 'length')).mockResolvedValueOnce(reply(goodJson, 'stop'));
    const r = await runAiTask({ task: extractTask, input: extractInput, settings: local, features, now });
    expect(r).toMatchObject({ ok: true, repaired: true, stopReason: 'stop' });
  });
});

describe('the caller can raise the data class (Ask AI on a person\'s task or goal is people data)', () => {
  const personTask = { title: 'Give Maria feedback on the Q3 review' };

  it('blocks it on a cloud connection before any request, even though the coach task itself is content', async () => {
    const r = await runAiTask({ task: coachTask, input: personTask, dataClass: 'people', settings: cloud, features, now });
    expect(r).toMatchObject({ ok: false, reason: 'blocked-people' });
    expect(askAI).not.toHaveBeenCalled();
  });

  it('is blocked by the organization policy even on a loopback connection', async () => {
    const r = await runAiTask({ task: coachTask, input: personTask, dataClass: 'people', settings: local, features: { ...features, aiPeople: false }, now });
    expect(r).toMatchObject({ ok: false, reason: 'policy' });
    expect(askAI).not.toHaveBeenCalled();
  });

  it('runs on an allowed connection and tells the engine (and so the main process) it is people data', async () => {
    askAI.mockResolvedValueOnce(reply('plan'));
    const r = await runAiTask({ task: coachTask, input: personTask, dataClass: 'people', settings: local, features, now });
    expect(r.ok).toBe(true);
    expect(askAI.mock.calls[0][0].dataClass).toBe('people');
  });

  it('uses the people route, not the content route', async () => {
    askAI.mockResolvedValueOnce(reply('plan'));
    const settings: AISettings = {
      ...cloud,
      connections: [{ id: 'c-local', name: 'Local', provider: 'gateway', baseUrl: 'http://localhost:11434/v1', model: 'llama3' }],
      routing: { people: 'c-local' },
    };
    const r = await runAiTask({ task: coachTask, input: personTask, dataClass: 'people', settings, features, now });
    expect(r).toMatchObject({ ok: true, connectionName: 'Local' });
  });

  it('can only raise the class: a content declaration never lowers a people task', async () => {
    const r = await runAiTask({ task: peopleTask, input: 'x', dataClass: 'content', settings: cloud, features, now });
    expect(r).toMatchObject({ ok: false, reason: 'blocked-people' });
    expect(askAI).not.toHaveBeenCalled();
  });
});

describe('parse sees the options the prompt was built with (for tasks whose output depends on a choice)', () => {
  it('passes the same options to build and to parse, on the first reply and on the repair', async () => {
    const seen: Array<Record<string, string>> = [];
    const task: AiTask<string, string> = {
      id: 'ai.options-probe',
      promptVersion: 1,
      dataClass: 'content',
      needsJson: false,
      allowsFocusNote: false,
      build: () => ({ system: 's', user: 'u', json: false, maxOutputTokens: 100 }),
      parse: (text, ctx) => {
        seen.push({ ...(ctx?.options ?? {}) });
        return text === 'good' ? { ok: true, value: text } : { ok: false, error: 'bad' };
      },
    };
    askAI.mockReset().mockResolvedValueOnce(reply('nope')).mockResolvedValueOnce(reply('good'));
    const r = await runAiTask({ task, input: 'x', options: { target: 'html' }, settings: cloud, features, now });
    expect(r.ok).toBe(true);
    expect(seen).toEqual([{ target: 'html' }, { target: 'html' }]);
  });
});
