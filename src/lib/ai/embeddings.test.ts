import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../../model';
import { cosine, embedTexts, rankBySimilarity } from './embeddings';

const openai = (extra: Partial<AISettings> = {}): AISettings => ({
  provider: 'openai',
  apiKey: 'sk-openai-secret-key',
  model: 'gpt-5.4-mini',
  ...extra,
});
const gateway = (extra: Partial<AISettings> = {}): AISettings => ({
  provider: 'gateway',
  baseUrl: 'https://gw.example.com/v1',
  model: 'm',
  apiKey: 'sk-gw-secret-key',
  ...extra,
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { cadence?: unknown }).cadence;
});

function stub(json: unknown, status = 200) {
  const fetchMock = vi.fn(async () => Response.json(json, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const call = (m: ReturnType<typeof stub>) => {
  const [url, init] = m.mock.calls[0] as unknown as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
};

describe('embedTexts: OpenAI-compatible', () => {
  it('posts to /embeddings with the default model on OpenAI and returns vectors in input order', async () => {
    const m = stub({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] });
    const out = await embedTexts({ settings: openai(), texts: ['a', 'b'], dataClass: 'content' });
    expect(out).toEqual([[1, 0], [0, 1]]);
    const c = call(m);
    expect(c.url).toBe('https://api.openai.com/v1/embeddings');
    expect(c.body).toEqual({ model: 'text-embedding-3-small', input: ['a', 'b'] });
    expect(c.headers.Authorization).toBe('Bearer sk-openai-secret-key');
  });

  it('uses the connection\'s embedding model on a gateway, and refuses a gateway without one', async () => {
    const m = stub({ data: [{ index: 0, embedding: [1] }] });
    await embedTexts({ settings: gateway({ embeddingModel: 'nomic-embed-text' }), texts: ['a'], dataClass: 'content' });
    expect(call(m).body.model).toBe('nomic-embed-text');
    await expect(embedTexts({ settings: gateway(), texts: ['a'], dataClass: 'content' })).rejects.toMatchObject({
      message: expect.stringMatching(/embedding model/i),
    });
  });

  it('rewrites a custom chat path to the embeddings path, and refuses one it cannot', async () => {
    const m = stub({ data: [{ index: 0, embedding: [1] }] });
    await embedTexts({
      settings: gateway({ embeddingModel: 'e', requestPath: '/openai/deployments/{model}/chat/completions?api-version=2024-02-01' }),
      texts: ['a'],
      dataClass: 'content',
    });
    expect(call(m).url).toBe('https://gw.example.com/v1/openai/deployments/e/embeddings?api-version=2024-02-01');
    await expect(
      embedTexts({ settings: gateway({ embeddingModel: 'e', requestPath: '/custom/generate' }), texts: ['a'], dataClass: 'content' }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/standard path/i) });
  });
});

describe('embedTexts: Gemini and others', () => {
  it('Gemini: batchEmbedContents with models/<name> and parts, vectors from embeddings[].values', async () => {
    const m = stub({ embeddings: [{ values: [1, 2] }, { values: [3, 4] }] });
    const out = await embedTexts({
      settings: { provider: 'gemini', apiKey: 'AIza-secret-key', model: 'gemini-3.8-flash' },
      texts: ['a', 'b'],
      dataClass: 'content',
    });
    expect(out).toEqual([[1, 2], [3, 4]]);
    const c = call(m);
    expect(c.url).toContain('/models/gemini-embedding-001:batchEmbedContents');
    expect(c.body).toEqual({
      requests: [
        { model: 'models/gemini-embedding-001', content: { parts: [{ text: 'a' }] } },
        { model: 'models/gemini-embedding-001', content: { parts: [{ text: 'b' }] } },
      ],
    });
  });

  it('Gemini: an embedding model already written as models/<name> is not prefixed twice', async () => {
    const m = stub({ embeddings: [{ values: [1] }] });
    await embedTexts({
      settings: { provider: 'gemini', apiKey: 'AIza-secret-key', model: 'gemini-3.8-flash', embeddingModel: 'models/gemini-embedding-001' },
      texts: ['a'],
      dataClass: 'content',
    });
    expect(call(m).body.requests[0].model).toBe('models/gemini-embedding-001');
  });

  it('rejects a reply whose index is not a number, instead of ordering vectors arbitrarily', async () => {
    stub({ data: [{ index: 'x', embedding: [1, 0] }, { index: 0, embedding: [0, 1] }] });
    await expect(embedTexts({ settings: openai(), texts: ['a', 'b'], dataClass: 'content' })).rejects.toMatchObject({
      message: expect.stringMatching(/unexpected shape|did not match|unreadable/i),
    });
  });

  it('Anthropic has no embeddings API', async () => {
    const fetchMock = stub({});
    await expect(
      embedTexts({ settings: { provider: 'anthropic', apiKey: 'sk-ant-secret-key', model: 'm' }, texts: ['a'], dataClass: 'content' }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/no embeddings/i) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('embedTexts: safety', () => {
  it('reports a bad reply or an HTTP error as an AIError with the key masked, and sends nothing for no texts', async () => {
    stub({ unexpected: true });
    await expect(embedTexts({ settings: openai(), texts: ['a'], dataClass: 'content' })).rejects.toMatchObject({ name: 'AIError' });
    stub({ error: { message: 'bad key sk-openai-secret-key' } }, 401);
    const err = await embedTexts({ settings: openai(), texts: ['a'], dataClass: 'content' }).catch((e) => e);
    expect(err.status).toBe(401);
    expect(err.message).not.toContain('sk-openai-secret-key');
    const none = stub({});
    expect(await embedTexts({ settings: openai(), texts: [], dataClass: 'content' })).toEqual([]);
    expect(none).not.toHaveBeenCalled();
  });

  it('a vector count that does not match the texts is an error, and so is a non-numeric vector', async () => {
    stub({ data: [{ index: 0, embedding: [1] }] });
    await expect(embedTexts({ settings: openai(), texts: ['a', 'b'], dataClass: 'content' })).rejects.toMatchObject({ name: 'AIError' });
    stub({ data: [{ index: 0, embedding: ['x'] }] });
    await expect(embedTexts({ settings: openai(), texts: ['a'], dataClass: 'content' })).rejects.toMatchObject({ name: 'AIError' });
  });

  it('through the desktop bridge it passes the data class', async () => {
    const aiGatewayChat = vi.fn(async () => ({ ok: true as const, status: 200, text: JSON.stringify({ data: [{ index: 0, embedding: [1, 0] }] }) }));
    (window as unknown as { cadence: unknown }).cadence = { aiGatewayChat, aiGatewayAbort: vi.fn() };
    await embedTexts({ settings: openai(), texts: ['a'], dataClass: 'people' });
    expect((aiGatewayChat.mock.calls[0] as unknown as [{ dataClass: string; path: string }])[0]).toMatchObject({ dataClass: 'people', path: '/embeddings' });
  });
});

describe('cosine and rankBySimilarity', () => {
  it('measures the angle, not the length', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([2, 0], [5, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('is 0 for a zero vector or vectors of different length', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(cosine([1], [1, 1])).toBe(0);
  });

  it('orders items by similarity to the query, stably', () => {
    const items = ['far', 'near', 'mid'];
    const vectors = [[0, 1], [1, 0.1], [1, 1]];
    expect(rankBySimilarity([1, 0], items, vectors)).toEqual(['near', 'mid', 'far']);
  });
});
