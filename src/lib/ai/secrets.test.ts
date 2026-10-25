import { describe, expect, it } from 'vitest';
import { emptyData } from '../../core/model';
import type { AIConnection, AISettings, AppData } from '../../core/model';
import { restoreAiSecrets, stripAiSecrets } from './secrets';

const company: AIConnection = {
  id: 'c-company',
  name: 'Company',
  provider: 'gateway',
  baseUrl: 'https://ai.corp.example.com/v1',
  model: 'team/x',
  apiKey: 'sk-corp-secret',
  extraHeaders: [{ name: 'x-tenant', value: 'tenant-secret' }],
  allowPeopleData: true,
};
const full: AISettings = {
  provider: 'openai',
  apiKey: 'sk-default-secret',
  model: 'gpt-5.4-mini',
  extraHeaders: [{ name: 'x-org', value: 'org-secret' }],
  connections: [company],
  unreadConnections: [{ id: 'c-future', name: 'F', provider: 'quantum', apiKey: 'sk-future-secret', extraHeaders: [{ name: 'a', value: 'b' }], note: 'keep me' }],
  routing: { content: 'c-company' },
  defaultMeta: { name: 'Work', allowPeopleData: false },
  systemPrompt: 'older instructions',
};
const withAi = (aiSettings: AISettings | undefined): AppData => ({ ...emptyData(), aiSettings });

describe('stripAiSecrets', () => {
  it('removes every key and header value from the default, the extras and the unread entries, and nothing else', () => {
    const out = stripAiSecrets(withAi(full)).aiSettings!;
    expect(JSON.stringify(out)).not.toMatch(/secret/);
    expect(out.apiKey).toBeUndefined();
    expect(out.extraHeaders).toBeUndefined();
    expect(out.connections?.[0]).toMatchObject({ id: 'c-company', name: 'Company', baseUrl: company.baseUrl, model: 'team/x', allowPeopleData: true });
    expect(out.connections?.[0].apiKey).toBeUndefined();
    expect(out.connections?.[0].extraHeaders).toBeUndefined();
    expect(out.unreadConnections?.[0]).toMatchObject({ id: 'c-future', note: 'keep me' });
    expect(out).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      routing: { content: 'c-company' },
      defaultMeta: { name: 'Work', allowPeopleData: false },
      systemPrompt: 'older instructions',
    });
  });

  it('does not change the data it is given, and leaves data without AI settings alone', () => {
    const data = withAi(full);
    stripAiSecrets(data);
    expect(data.aiSettings?.apiKey).toBe('sk-default-secret');
    const none = withAi(undefined);
    expect(stripAiSecrets(none)).toEqual(none);
  });

  it('never touches notes, tasks or people', () => {
    const data = { ...withAi(full), notes: [{ id: 'n1' }] as never, todoItems: [{ id: 't1' }] as never };
    const out = stripAiSecrets(data);
    expect(out.notes).toBe(data.notes);
    expect(out.todoItems).toBe(data.todoItems);
  });
});

describe('restoreAiSecrets', () => {
  const stripped = stripAiSecrets(withAi(full));

  it('puts the keys back for the same provider, address and connection id', () => {
    const out = restoreAiSecrets(stripped, withAi(full)).aiSettings!;
    expect(out.apiKey).toBe('sk-default-secret');
    expect(out.extraHeaders).toEqual(full.extraHeaders);
    expect(out.connections?.[0].apiKey).toBe('sk-corp-secret');
    expect(out.connections?.[0].extraHeaders).toEqual(company.extraHeaders);
  });

  it('never gives a stored key to a different address or provider', () => {
    const redirected = withAi({
      ...stripped.aiSettings!,
      provider: 'gateway',
      baseUrl: 'https://attacker.example.com/v1',
      connections: [{ ...company, baseUrl: 'https://attacker.example.com/v1', apiKey: undefined, extraHeaders: undefined }],
    });
    const out = restoreAiSecrets(redirected, withAi(full)).aiSettings!;
    expect(out.apiKey).toBeUndefined();
    expect(out.connections?.[0].apiKey).toBeUndefined();
    // Only the user's own unreadable entry (kept under its own destination) still holds its key.
    expect(JSON.stringify({ ...out, unreadConnections: undefined })).not.toMatch(/secret/);
  });

  it('keeps a key the imported file brings, and does not invent connections', () => {
    const own = withAi({ provider: 'openai', apiKey: 'sk-from-backup', model: 'm' });
    expect(restoreAiSecrets(own, withAi(full)).aiSettings?.apiKey).toBe('sk-from-backup');
    const out = restoreAiSecrets(withAi({ provider: 'openai', model: 'm' }), withAi(full)).aiSettings!;
    expect(out.connections).toBeUndefined();
  });

  it('does nothing when either side has no AI settings', () => {
    const a = withAi(undefined);
    expect(restoreAiSecrets(a, withAi(full))).toBe(a);
    const b = withAi(stripped.aiSettings);
    expect(restoreAiSecrets(b, withAi(undefined))).toBe(b);
  });
});

describe('review round 2', () => {
  it('stripAiSecrets drops a literal token from the request path query, and keeps harmless parts', () => {
    const data = withAi({
      provider: 'gateway',
      baseUrl: 'https://gw.example.com/v1',
      requestPath: '/chat?api-version=2024-02-01&key=sk-literal-secret&sig=abc123',
      connections: [{ ...company, requestPath: '/models/{model}:generateContent?key={apiKey}&token=literal-token' }],
    });
    const out = stripAiSecrets(data).aiSettings!;
    expect(out.requestPath).toBe('/chat?api-version=2024-02-01');
    expect(out.connections?.[0].requestPath).toBe('/models/{model}:generateContent?key={apiKey}');
    expect(JSON.stringify(out)).not.toMatch(/literal|abc123/);
  });

  it('a restore keeps the local entries this build cannot read, with their keys, and refills matching ones', () => {
    const local = withAi({
      provider: 'openai',
      model: 'm',
      unreadConnections: [
        { id: 'u1', name: 'Future 1', provider: 'quantum', baseUrl: 'https://q.example.com', apiKey: 'sk-u1-secret' },
        { id: 'u2', name: 'Future 2', provider: 'quantum', apiKey: 'sk-u2-secret' },
      ],
    });
    const imported = stripAiSecrets(
      withAi({
        provider: 'openai',
        model: 'm',
        unreadConnections: [{ id: 'u1', name: 'Future 1', provider: 'quantum', baseUrl: 'https://q.example.com', apiKey: 'x' }],
      }),
    );
    const out = restoreAiSecrets(imported, local).aiSettings!;
    const byId = Object.fromEntries((out.unreadConnections ?? []).map((c) => [c.id as string, c]));
    expect(byId.u1.apiKey).toBe('sk-u1-secret');
    expect(byId.u2.apiKey).toBe('sk-u2-secret');
    expect(out.unreadConnections).toHaveLength(2);
  });
});

describe('credentials inside a baseUrl', () => {
  const leaky = 'https://admin:hunter2@gw.example.com:8443/v1?api_key=lit-secret&api-version=2';
  const safe = 'https://gw.example.com:8443/v1?api-version=2';

  it('are removed from the default, extra and unread connections on export; the host and harmless parameters stay', () => {
    const out = stripAiSecrets(
      withAi({
        provider: 'gateway',
        baseUrl: leaky,
        model: 'm',
        connections: [{ ...company, baseUrl: leaky }],
        unreadConnections: [{ id: 'u', name: 'U', provider: 'quantum', baseUrl: leaky }],
      }),
    ).aiSettings!;
    expect(out.baseUrl).toBe(safe);
    expect(out.connections![0]!.baseUrl).toBe(safe);
    expect((out.unreadConnections![0] as { baseUrl?: string }).baseUrl).toBe(safe);
    expect(JSON.stringify(out)).not.toMatch(/hunter2|lit-secret/);
  });

  it('leave an ordinary address untouched, byte for byte', () => {
    const out = stripAiSecrets(withAi({ provider: 'gateway', baseUrl: 'http://localhost:20128', model: 'm', connections: [] })).aiSettings!;
    expect(out.baseUrl).toBe('http://localhost:20128');
  });

  it('still lets the local key come back after a restore, because the host is the same', () => {
    const local = withAi({ provider: 'gateway', baseUrl: leaky, apiKey: 'sk-local', model: 'm' });
    const restored = restoreAiSecrets(stripAiSecrets(local), local).aiSettings!;
    expect(restored.apiKey).toBe('sk-local');
  });

  it('never attaches the local key to a different host', () => {
    const local = withAi({ provider: 'gateway', baseUrl: leaky, apiKey: 'sk-local', model: 'm' });
    const other = withAi({ provider: 'gateway', baseUrl: 'https://evil.example.com/v1', model: 'm' });
    expect(restoreAiSecrets(other, local).aiSettings!.apiKey).toBeUndefined();
  });
});
