import { describe, expect, it } from 'vitest';
import { emptyData, normalizeData } from '../model';
import { updateAISettings, upsertAIConnection, patchAIConnection } from '../actions';
import type { AIConnection, AISettings } from '../model';
import { legacyParseAISettings } from './legacyAiParser.testutil';

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
