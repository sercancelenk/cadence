import { describe, expect, it } from 'vitest';
import type { AIConnection, AISettings } from '../../model';
import {
  connectionAllowsPeopleData,
  hasUsableConnection,
  isLoopbackAddress,
  listConnections,
  resolveConnection,
} from './connections';

const ollama: AIConnection = {
  id: 'c-ollama',
  name: 'Ollama',
  provider: 'gateway',
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3',
  capabilities: ['json'],
};
const company: AIConnection = {
  id: 'c-company',
  name: 'Company gateway',
  provider: 'gateway',
  baseUrl: 'https://ai.corp.example.com/v1',
  model: 'team/model-x',
  apiKey: 'sk-corp-key-12345',
};
const base: AISettings = { provider: 'openai', apiKey: 'sk-default-key-1234', model: 'gpt-5.4-mini' };

describe('isLoopbackAddress', () => {
  it.each([
    ['http://localhost:11434/v1', true],
    ['http://LOCALHOST/v1', true],
    ['http://127.0.0.1/v1', true],
    ['http://127.9.9.9:20128/v1', true],
    ['http://[::1]:20128/v1', true],
    ['http://192.168.1.5/v1', false],
    ['http://10.0.0.2/v1', false],
    ['http://mybox.local/v1', false],
    ['https://gw.example.com/v1', false],
    ['http://localhost.evil.com/v1', false],
    ['http://foo.localhost/v1', false],
    ['http://127.0.0.1.evil.com/v1', false],
    ['not a url', false],
    ['', false],
    [undefined, false],
  ])('%s -> %s', (url, expected) => {
    expect(isLoopbackAddress(url as string | undefined)).toBe(expected);
  });
});

describe('connectionAllowsPeopleData', () => {
  it('allows a local gateway by default and nothing else', () => {
    expect(connectionAllowsPeopleData(ollama)).toBe(true);
    expect(connectionAllowsPeopleData(company)).toBe(false);
    expect(connectionAllowsPeopleData({ provider: 'openai' })).toBe(false);
    expect(connectionAllowsPeopleData({ provider: 'gateway', baseUrl: 'http://192.168.1.5/v1' })).toBe(false);
  });
  it('an explicit switch wins in both directions', () => {
    expect(connectionAllowsPeopleData({ provider: 'openai', allowPeopleData: true })).toBe(true);
    expect(connectionAllowsPeopleData({ ...ollama, allowPeopleData: false })).toBe(false);
  });
});

describe('listConnections', () => {
  it('is empty without settings or provider', () => {
    expect(listConnections(undefined)).toEqual([]);
    expect(listConnections({})).toEqual([]);
  });
  it('lists the default first, named from defaultMeta or the provider label', () => {
    const named = listConnections({ ...base, defaultMeta: { name: 'Work OpenAI', capabilities: ['json'] }, connections: [ollama] });
    expect(named.map((c) => [c.id, c.name, c.isDefault])).toEqual([
      ['default', 'Work OpenAI', true],
      ['c-ollama', 'Ollama', false],
    ]);
    expect(named[0].capabilities).toEqual(['json']);
    expect(listConnections(base)[0].name).toBe('OpenAI ChatGPT');
  });
  it('gives each connection an engine-shaped settings object without the bookkeeping keys', () => {
    const [def, extra] = listConnections({ ...base, connections: [company], routing: { content: 'c-company' } });
    expect(def.settings).toMatchObject({ provider: 'openai', apiKey: 'sk-default-key-1234' });
    expect('connections' in def.settings).toBe(false);
    expect('routing' in def.settings).toBe(false);
    expect(extra.settings).toMatchObject({ provider: 'gateway', baseUrl: 'https://ai.corp.example.com/v1', model: 'team/model-x' });
    expect('id' in extra.settings).toBe(false);
    expect('name' in extra.settings).toBe(false);
  });
  it('reads people permission from defaultMeta for the default and from the connection for extras', () => {
    const [def, e1, e2] = listConnections({
      ...base,
      defaultMeta: { allowPeopleData: true },
      connections: [ollama, company],
    });
    expect([def.allowsPeopleData, e1.allowsPeopleData, e2.allowsPeopleData]).toEqual([true, true, false]);
  });
});

describe('resolveConnection', () => {
  it('is not-configured without a usable connection', () => {
    expect(resolveConnection(undefined, 'content', 'ai.coach')).toEqual({ ok: false, reason: 'not-configured' });
    expect(resolveConnection({ provider: 'openai' }, 'content', 'ai.coach')).toEqual({ ok: false, reason: 'not-configured' });
  });
  it('uses the default when nothing is routed', () => {
    const r = resolveConnection(base, 'content', 'ai.coach');
    expect(r.ok && [r.connection.id, r.fellBack]).toEqual(['default', false]);
  });
  it('routes by task id first, then by class, then the default', () => {
    const s: AISettings = { ...base, connections: [ollama, company], routing: { content: 'c-company', people: 'c-ollama', tasks: { 'ai.extract': 'c-ollama' } } };
    const id = (cls: 'content' | 'people', task: string) => {
      const r = resolveConnection(s, cls, task);
      return r.ok ? r.connection.id : r.reason;
    };
    expect(id('content', 'ai.extract')).toBe('c-ollama');
    expect(id('content', 'ai.coach')).toBe('c-company');
    expect(id('people', 'ai.coach')).toBe('c-ollama');
    expect(id('content', 'other')).toBe('c-company');
  });
  it('can route to the default explicitly', () => {
    const r = resolveConnection({ ...base, connections: [company], routing: { content: 'default' } }, 'content', 'ai.coach');
    expect(r.ok && [r.connection.id, r.fellBack]).toEqual(['default', false]);
  });
  it('falls back to the default, and says so, when the routed connection no longer exists', () => {
    const r = resolveConnection({ ...base, routing: { content: 'deleted-id' } }, 'content', 'ai.coach');
    expect(r.ok && [r.connection.id, r.fellBack]).toEqual(['default', true]);
  });
  it('falls back when the routed connection is not usable (hosted provider without a key)', () => {
    const broken: AIConnection = { id: 'c-broken', name: 'Broken', provider: 'openai' };
    const r = resolveConnection({ ...base, connections: [broken], routing: { content: 'c-broken' } }, 'content', 'ai.coach');
    expect(r.ok && [r.connection.id, r.fellBack]).toEqual(['default', true]);
  });
  it('uses a routed extra connection when the default is not configured', () => {
    const r = resolveConnection({ connections: [company], routing: { content: 'c-company' } }, 'content', 'ai.coach');
    expect(r.ok && r.connection.id).toBe('c-company');
  });
  it('with no default and nothing routed, the first usable extra serves the task (the entry points are shown for it)', () => {
    const r = resolveConnection({ connections: [{ id: 'x', name: 'x', provider: 'openai' }, ollama, company] }, 'content', 'ai.coach');
    expect(r.ok && [r.connection.id, r.fellBack]).toEqual([ollama.id, false]);
  });
  it('with no default, a route to a connection that is gone falls back to the first usable extra and says so', () => {
    const r = resolveConnection({ connections: [company], routing: { people: 'deleted-id' } }, 'people', 'ai.coach');
    expect(r.ok && [r.connection.id, r.fellBack]).toEqual(['c-company', true]);
  });
  it('an unconfigured default with no usable extra is not-configured', () => {
    expect(resolveConnection({ connections: [{ id: 'x', name: 'x', provider: 'openai' }] }, 'content', 'ai.coach')).toEqual({
      ok: false,
      reason: 'not-configured',
    });
  });
});

describe('probed', () => {
  it('is true only when a probe has run, for the default and for extras', () => {
    const [def, e1, e2] = listConnections({
      ...base,
      defaultMeta: { probedAt: '2026-10-24T10:00:00.000Z' },
      connections: [{ ...ollama, probedAt: '2026-10-24T11:00:00.000Z' }, company],
    });
    expect([def.probed, e1.probed, e2.probed]).toEqual([true, true, false]);
  });
});

describe('hasUsableConnection', () => {
  it('is true for a configured default, and for extras alone after the default was removed', () => {
    expect(hasUsableConnection(base)).toBe(true);
    expect(hasUsableConnection({ connections: [company] })).toBe(true);
    expect(hasUsableConnection({ gatewayFormat: 'openai-chat', connections: [ollama] })).toBe(true);
  });
  it('is false with nothing configured, or only incomplete connections', () => {
    expect(hasUsableConnection(undefined)).toBe(false);
    expect(hasUsableConnection({})).toBe(false);
    expect(hasUsableConnection({ provider: 'openai' })).toBe(false);
    expect(hasUsableConnection({ connections: [{ id: 'x', name: 'x', provider: 'openai' }] })).toBe(false);
  });
});
