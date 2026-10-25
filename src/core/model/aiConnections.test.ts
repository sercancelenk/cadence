import { describe, expect, it } from 'vitest';
import { emptyData, normalizeData } from '../model';
import { updateAISettings, upsertAIConnection, patchAIConnection, removeAIConnection, setAIRoute } from '../actions';
import type { AIConnection, AISettings } from '../model';
import { legacyParseAISettings } from './legacyAiParser.testutil';
import { connectionAllowsPeopleData, listConnections } from '../../lib/ai/connections';

/**
 * Extra AI connections and routing live INSIDE `aiSettings`, as new optional keys, so an
 * older build (whose parser keeps unknown keys through `withExtras`) carries them through
 * its own load → save untouched. See docs/superpowers/specs/2026-10-24-ai-features-design.md 5.3.
 */

const load = (aiSettings: unknown): AISettings | undefined =>
  normalizeData({ ...emptyData(), aiSettings } as never).aiSettings;

const roundTrip = (s: AISettings | undefined): AISettings | undefined =>
  load(JSON.parse(JSON.stringify(s)));

const company = {
  id: 'c-company',
  name: 'Company gateway',
  provider: 'gateway',
  baseUrl: 'https://ai.corp.example.com/v1',
  model: 'team/model-x',
  apiKey: 'sk-corp-key-12345',
  gatewayFormat: 'openai-chat',
  maxTokensField: 'max_completion_tokens',
  extraHeaders: [{ name: 'x-tenant', value: 'team-42' }],
  capabilities: ['json'],
  allowPeopleData: false,
};

describe('legacy compatibility, against a copy of the parser that shipped before connections existed', () => {
  const stored = {
    provider: 'openai',
    apiKey: 'sk-default-key-1234',
    model: 'gpt-5.4-mini',
    connections: [company],
    routing: { content: 'c-company' },
    defaultMeta: { name: 'Work', allowPeopleData: true },
  };
  const reload = (raw: unknown) => legacyParseAISettings(JSON.parse(JSON.stringify(raw))) as Record<string, unknown> | undefined;

  it('an older build keeps the new keys through its own load and save while a known field is set', () => {
    const out = reload(stored);
    expect(out?.connections).toEqual([company]);
    expect(out?.routing).toEqual({ content: 'c-company' });
    expect(out?.defaultMeta).toEqual({ name: 'Work', allowPeopleData: true });
  });

  it('an older build editing the default key and model leaves the extra connections alone', () => {
    const edited = { ...(reload(stored) as object), apiKey: 'sk-edited-by-old-build', model: 'edited-model' };
    const again = load(reload(edited)) as unknown as Record<string, unknown>;
    expect(again.apiKey).toBe('sk-edited-by-old-build');
    expect(again.model).toBe('edited-model');
    expect(again.connections).toEqual([company]);
    expect(again.routing).toEqual({ content: 'c-company' });
  });

  it('THE LIMIT: an older build discards aiSettings that hold only the new keys (why a marker is kept)', () => {
    expect(reload({ connections: [company], routing: { content: 'c-company' } })).toBeUndefined();
    expect(reload({ defaultMeta: { name: 'Work' } })).toBeUndefined();
  });

  it('a default-format marker is enough for an older build to keep everything', () => {
    const out = reload({ gatewayFormat: 'openai-chat', connections: [company], routing: { content: 'c-company' } });
    expect(out?.connections).toEqual([company]);
    expect(out?.routing).toEqual({ content: 'c-company' });
  });

  it('this build reads what the older one saved back, unchanged', () => {
    const back = load(reload(stored));
    expect(back?.connections).toEqual([company]);
    expect(back?.routing).toEqual({ content: 'c-company' });
    expect(back?.defaultMeta).toMatchObject({ name: 'Work', allowPeopleData: true });
  });
});

describe('an older build never loses extras that were created without a default connection', () => {
  const viaOlderBuild = (data: { aiSettings?: unknown }) =>
    legacyParseAISettings(JSON.parse(JSON.stringify(data.aiSettings))) as Record<string, unknown> | undefined;

  const extra = company as AIConnection;

  it('adding the first extra connection keeps aiSettings alive for the older parser', () => {
    const d = upsertAIConnection(emptyData(), extra);
    expect(viaOlderBuild(d)?.connections).toEqual([company]);
  });

  it('routing alone, or default metadata alone, is also kept', () => {
    const withRouting = updateAISettings(emptyData(), { routing: { content: 'c-company' } });
    expect(viaOlderBuild(withRouting)?.routing).toEqual({ content: 'c-company' });
    const withMeta = updateAISettings(emptyData(), { defaultMeta: { allowPeopleData: true } });
    expect(viaOlderBuild(withMeta)?.defaultMeta).toEqual({ allowPeopleData: true });
  });

  it('a probe result patched onto an extra connection keeps it as well', () => {
    const d = patchAIConnection(upsertAIConnection(emptyData(), extra), extra.id, { probedAt: '2026-10-25T00:00:00.000Z' });
    expect(viaOlderBuild(d)?.connections).toHaveLength(1);
  });

  it('clearing the default connection (Disabled) keeps the extras for the older parser', () => {
    const withDefault = updateAISettings(upsertAIConnection(emptyData(), extra), { provider: 'openai', apiKey: 'sk-x', model: 'm' });
    const disabled = updateAISettings(withDefault, { provider: '', apiKey: '', model: '' });
    expect(viaOlderBuild(disabled)?.connections).toEqual([company]);
  });

  it('does not invent a marker when no extras exist, and never overrides a chosen format', () => {
    expect(updateAISettings(emptyData(), { provider: 'openai', apiKey: 'sk-x' }).aiSettings?.gatewayFormat).toBeUndefined();
    const d = updateAISettings(upsertAIConnection(emptyData(), extra), { gatewayFormat: 'anthropic' });
    expect(d.aiSettings?.gatewayFormat).toBe('anthropic');
  });
});

describe('connections, routing and default metadata', () => {
  const base = { provider: 'openai', apiKey: 'sk-default-key-1234', model: 'gpt-5.4-mini' };

  it('round-trips a full connection and is idempotent', () => {
    const once = load({ ...base, connections: [company] });
    expect(once?.connections).toEqual([company]);
    expect(roundTrip(once)).toEqual(once);
  });

  it('keeps unknown keys inside a connection (forward compatibility)', () => {
    const out = load({ ...base, connections: [{ ...company, futureField: { a: 1 } }] });
    expect((out?.connections?.[0] as unknown as Record<string, unknown>).futureField).toEqual({ a: 1 });
  });

  it('drops invalid entries and keeps the valid ones', () => {
    const out = load({
      ...base,
      connections: [
        company,
        { name: 'no id', provider: 'gateway' },
        { id: 'x1', provider: 'gateway' },
        { id: 'x2', name: 'bad provider', provider: 'carrier-pigeon' },
        { id: 'default', name: 'reserved id', provider: 'gateway' },
        { id: 'c-company', name: 'duplicate id', provider: 'gateway' },
        'junk',
        null,
      ],
    });
    expect(out?.connections?.map((c) => c.id)).toEqual(['c-company']);
    expect(out?.connections?.[0].name).toBe('Company gateway');
  });

  it('caps the number of connections at 20', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, provider: 'gateway' }));
    expect(load({ ...base, connections: many })?.connections).toHaveLength(20);
  });

  it('trims connection fields and drops malformed optional ones without losing the entry', () => {
    const out = load({
      ...base,
      connections: [
        { id: ' c1 ', name: ' Mine ', provider: 'gateway', model: ' m ', gatewayFormat: 'nope', authScheme: 'nope', maxTokensField: 'nope', capabilities: ['json', 'telepathy', 'vision'], allowPeopleData: 'yes' },
      ],
    });
    expect(out?.connections?.[0]).toMatchObject({ id: 'c1', name: 'Mine', provider: 'gateway', model: 'm', capabilities: ['json', 'vision'] });
    expect(out?.connections?.[0].gatewayFormat).toBeUndefined();
    expect(out?.connections?.[0].authScheme).toBeUndefined();
    expect(out?.connections?.[0].maxTokensField).toBeUndefined();
    expect(out?.connections?.[0].allowPeopleData).toBeUndefined();
  });

  it('keeps routing ids that are strings and drops the rest', () => {
    const out = load({ ...base, routing: { content: 'c1', people: 7, tasks: { 'ai.coach': 'c2', 'ai.extract': 9, '': 'x' } } });
    expect(out?.routing).toEqual({ content: 'c1', tasks: { 'ai.coach': 'c2' } });
    expect(load({ ...base, routing: { content: 5 } })?.routing).toBeUndefined();
    expect(load({ ...base, routing: 'nope' })?.routing).toBeUndefined();
  });

  it('keeps default metadata: name, capabilities, people switch', () => {
    const out = load({ ...base, defaultMeta: { name: ' Mine ', capabilities: ['json', 'x'], allowPeopleData: true, extra: 1 } });
    expect(out?.defaultMeta).toMatchObject({ name: 'Mine', capabilities: ['json'], allowPeopleData: true });
    expect(load({ ...base, defaultMeta: 'nope' })?.defaultMeta).toBeUndefined();
  });

  it('settings that hold only connections or routing are not discarded as empty', () => {
    expect(load({ connections: [company] })?.connections).toHaveLength(1);
    expect(load({ routing: { content: 'c1' } })?.routing).toEqual({ content: 'c1' });
    expect(load({ defaultMeta: { allowPeopleData: true } })?.defaultMeta).toEqual({ allowPeopleData: true });
  });

  it('a workspace without any of the new keys loads exactly as before', () => {
    const out = load(base);
    expect(out).toMatchObject(base);
    expect(out?.connections).toBeUndefined();
    expect(out?.routing).toBeUndefined();
    expect(out?.defaultMeta).toBeUndefined();
  });
});

describe('probedAt (a probe ran, whatever it found)', () => {
  const base = { provider: 'openai', apiKey: 'sk-default-key-1234', model: 'gpt-5.4-mini' };
  it('is kept for the default metadata and for connections, and dropped when not a string', () => {
    const out = load({
      ...base,
      defaultMeta: { probedAt: ' 2026-10-24T10:00:00.000Z ' },
      connections: [{ id: 'c1', name: 'One', provider: 'gateway', probedAt: '2026-10-24T11:00:00.000Z' }, { id: 'c2', name: 'Two', provider: 'gateway', probedAt: 5 }],
    });
    expect(out?.defaultMeta?.probedAt).toBe('2026-10-24T10:00:00.000Z');
    expect(out?.connections?.[0].probedAt).toBe('2026-10-24T11:00:00.000Z');
    expect(out?.connections?.[1].probedAt).toBeUndefined();
  });
});

describe('connection entries this version cannot read are kept, not dropped', () => {
  const base = { provider: 'openai', apiKey: 'sk-default-key-1234', model: 'gpt-5.4-mini' };
  const future = { id: 'c-future', name: 'From a newer build', provider: 'quantum', apiKey: 'sk-future-key', newField: { a: 1 } };

  it('keeps an unknown-provider entry aside, and the connections that are readable keep working', () => {
    const out = load({ ...base, connections: [company, future] }) as unknown as Record<string, unknown>;
    expect((out.connections as AIConnection[]).map((c) => c.id)).toEqual(['c-company']);
    expect(out.unreadConnections).toEqual([future]);
  });

  it('survives a later save: editing something else does not lose the entry or its key', () => {
    const loaded = load({ ...base, connections: [company, future] })!;
    const data = { ...emptyData(), aiSettings: loaded };
    const saved = updateAISettings(data, { model: 'another-model' }).aiSettings;
    const again = roundTrip(saved) as unknown as Record<string, unknown>;
    expect(again.unreadConnections).toEqual([future]);
    expect(again.model).toBe('another-model');
    expect(roundTrip(again as unknown as AISettings)).toEqual(again);
  });

  it.each([
    ['the reserved id', { ...company, id: 'default' }],
    ['a missing name', { id: 'x1', provider: 'gateway' }],
    ['a missing id', { name: 'No id', provider: 'gateway' }],
    ['a duplicate id', { ...company, name: 'Second one' }],
  ])('keeps an entry with %s aside too', (_n, entry) => {
    const out = load({ ...base, connections: [company, entry] }) as unknown as Record<string, unknown>;
    expect((out.connections as AIConnection[]).map((c) => c.id)).toEqual(['c-company']);
    expect(out.unreadConnections).toEqual([entry]);
  });

  it('keeps the entries past the 20th aside, and a reload gives the same result', () => {
    const many = Array.from({ length: 23 }, (_, i) => ({ ...company, id: `c${i}`, name: `Conn ${i}` }));
    const out = load({ ...base, connections: many }) as unknown as Record<string, unknown>;
    expect(out.connections).toHaveLength(20);
    expect((out.unreadConnections as unknown[]).map((c) => (c as { id: string }).id)).toEqual(['c20', 'c21', 'c22']);
    expect(roundTrip(out as unknown as AISettings)).toEqual(out);
  });

  it('drops values that are not entries at all, and never keeps more than 20 aside', () => {
    const junk = [null, 5, 'text', [], ...Array.from({ length: 30 }, (_, i) => ({ id: `u${i}`, name: 'u', provider: 'quantum' }))];
    const out = load({ ...base, connections: junk }) as unknown as Record<string, unknown>;
    expect(out.connections).toBeUndefined();
    expect(out.unreadConnections).toHaveLength(20);
  });

  it('an entry that becomes readable later moves back into the connections', () => {
    const stored = { ...base, unreadConnections: [company] };
    const out = load(stored) as unknown as Record<string, unknown>;
    expect((out.connections as AIConnection[]).map((c) => c.id)).toEqual(['c-company']);
    expect(out.unreadConnections).toBeUndefined();
  });

  it('an older build carries the unread entries through its own load and save', () => {
    const loaded = load({ ...base, connections: [company, future] });
    const viaOlder = legacyParseAISettings(JSON.parse(JSON.stringify(loaded))) as Record<string, unknown>;
    expect(viaOlder.unreadConnections).toEqual([future]);
    expect(load(viaOlder)).toEqual(loaded);
  });

  it('only unread entries still keep aiSettings alive for an older build', () => {
    const data = { ...emptyData(), aiSettings: load({ unreadConnections: [future] }) };
    expect(data.aiSettings).toBeDefined();
    const saved = updateAISettings(data, { routing: {} }).aiSettings;
    expect(legacyParseAISettings(JSON.parse(JSON.stringify(saved)))).toBeDefined();
  });
});

describe('removing a connection removes it for good', () => {
  it('an unread entry with the same id does not bring it back on the next load', () => {
    const a = { ...company, id: 'a', name: 'A', apiKey: 'sk-a' };
    const loaded = load({ provider: 'openai', apiKey: 'sk-d-key-1234', connections: [a, { ...a, name: 'A duplicate', apiKey: 'sk-dup' }] })!;
    expect((loaded as unknown as { unreadConnections: unknown[] }).unreadConnections).toHaveLength(1);
    const removed = removeAIConnection({ ...emptyData(), aiSettings: loaded }, 'a');
    const reloaded = roundTrip(removed.aiSettings)!;
    expect(reloaded.connections).toBeUndefined();
    expect((reloaded as unknown as { unreadConnections?: unknown[] }).unreadConnections).toBeUndefined();
  });
});

describe('connection actions refuse what the loader would drop', () => {
  const conn = company as AIConnection;

  it('upsert refuses the reserved id and a blank name', () => {
    const data = emptyData();
    expect(upsertAIConnection(data, { ...conn, id: 'default' })).toBe(data);
    expect(upsertAIConnection(data, { ...conn, id: '  ' })).toBe(data);
    expect(upsertAIConnection(data, { ...conn, name: '   ' })).toBe(data);
  });

  it('patch ignores a blank name and keeps the old one', () => {
    const data = upsertAIConnection(emptyData(), conn);
    const out = patchAIConnection(data, conn.id, { name: '  ', model: 'm2' });
    expect(out.aiSettings?.connections?.[0]).toMatchObject({ name: conn.name, model: 'm2' });
  });

  it('removing an id that does not exist returns the same data and adds no marker', () => {
    const data = emptyData();
    expect(removeAIConnection(data, 'nope')).toBe(data);
    const withOne = upsertAIConnection(emptyData(), conn);
    expect(removeAIConnection(withOne, 'nope')).toBe(withOne);
  });
});

describe('setAIRoute works on the latest routing', () => {
  const conn = company as AIConnection;

  it('two changes in a row both stay', () => {
    let data = upsertAIConnection(emptyData(), conn);
    data = setAIRoute(data, 'content', conn.id);
    data = setAIRoute(data, 'people', conn.id);
    expect(data.aiSettings?.routing).toEqual({ content: conn.id, people: conn.id });
  });

  it('choosing the default clears only that route; clearing the last one removes the key', () => {
    let data = upsertAIConnection(emptyData(), conn);
    data = setAIRoute(setAIRoute(data, 'content', conn.id), 'people', conn.id);
    data = setAIRoute(data, 'content', 'default');
    expect(data.aiSettings?.routing).toEqual({ people: conn.id });
    data = setAIRoute(data, 'people', 'default');
    expect(data.aiSettings?.routing).toBeUndefined();
  });

  it('keeps per-task routes it does not touch', () => {
    let data = upsertAIConnection(emptyData(), conn);
    data = updateAISettings(data, { routing: { tasks: { 'ai.extract': conn.id } } });
    data = setAIRoute(data, 'content', conn.id);
    expect(data.aiSettings?.routing).toEqual({ content: conn.id, tasks: { 'ai.extract': conn.id } });
  });
});

describe('JSON override', () => {
  it('is kept on an extra connection and on the default connection, and only as true', () => {
    const out = load({
      provider: 'openai',
      apiKey: 'sk-default-key-1234',
      defaultMeta: { jsonOverride: true, probedAt: '2026-10-24T10:00:00.000Z' },
      connections: [{ ...company, jsonOverride: true }, { ...company, id: 'c2', name: 'Other', jsonOverride: false }],
    })!;
    expect(out.defaultMeta?.jsonOverride).toBe(true);
    expect(out.connections?.[0].jsonOverride).toBe(true);
    expect(out.connections?.[1].jsonOverride).toBeUndefined();
    expect(roundTrip(out)).toEqual(out);
    const cleared = updateAISettings({ ...emptyData(), aiSettings: out }, { defaultMeta: { jsonOverride: undefined } });
    expect(cleared.aiSettings?.defaultMeta?.jsonOverride).toBeUndefined();
  });
});

describe('people-data permission: the explicit "off" and the provider tie', () => {
  it('an explicit off on a loopback default connection stays off', () => {
    const data = updateAISettings(emptyData(), {
      provider: 'gateway',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'llama3',
    });
    expect(listConnections(data.aiSettings)[0].allowsPeopleData).toBe(true);
    const off = updateAISettings(data, { defaultMeta: { allowPeopleData: false } });
    expect(off.aiSettings?.defaultMeta?.allowPeopleData).toBe(false);
    expect(listConnections(off.aiSettings)[0].allowsPeopleData).toBe(false);
  });

  it('a hosted provider with a leftover localhost address is never counted as local', () => {
    expect(connectionAllowsPeopleData({ provider: 'openai', baseUrl: 'http://127.0.0.1:11434/v1' })).toBe(false);
    expect(connectionAllowsPeopleData({ provider: 'gateway', baseUrl: 'http://127.0.0.1:11434/v1' })).toBe(true);
  });
});

describe('embedding model', () => {
  it('is kept on the default and on extras, and survives an older build', () => {
    const out = load({ provider: 'openai', apiKey: 'sk-default-key-1234', embeddingModel: ' text-embedding-3-large ', connections: [{ ...company, embeddingModel: 'bge-m3' }] })!;
    expect(out.embeddingModel).toBe('text-embedding-3-large');
    expect(out.connections?.[0].embeddingModel).toBe('bge-m3');
    expect(roundTrip(out)).toEqual(out);
    const viaOlder = legacyParseAISettings(JSON.parse(JSON.stringify(out))) as Record<string, unknown>;
    expect(viaOlder.embeddingModel).toBe('text-embedding-3-large');
    expect(load(viaOlder)).toEqual(out);
  });

  it('does not stand in for an older field: extras and routing on a default with only an embedding model still get the downgrade marker', () => {
    const data = updateAISettings(emptyData(), { embeddingModel: 'x', connections: [company as never] });
    expect(data.aiSettings?.gatewayFormat).toBe('openai-chat');
  });

  it('can be cleared with an empty value', () => {
    const data = updateAISettings(emptyData(), { provider: 'openai', apiKey: 'sk-default-key-1234', embeddingModel: 'x' });
    expect(data.aiSettings?.embeddingModel).toBe('x');
    expect(updateAISettings(data, { embeddingModel: '' }).aiSettings?.embeddingModel).toBeUndefined();
  });
});
