import type { AIProvider, AISettings } from '../../model';
import { AIError, connectionOf, isAIConfigured, maskConnectionSecrets, postConnectionJson, connectionStatusError } from '../ai';
import { gatewayFormatDefaults } from '../aiGatewayUrl';
import type { DataClass } from './types';

/**
 * Text embeddings through the user's own connection, used to re-rank search results by meaning.
 * Nothing is stored: vectors are computed for the texts of one request and thrown away.
 *
 * OpenAI-compatible hosts: `POST …/embeddings` `{ model, input }` → `data[].embedding`.
 * Gemini: `POST …/models/<model>:batchEmbedContents` → `embeddings[].values`.
 * Anthropic has no embeddings API.
 */

const DEFAULT_MODEL: Partial<Record<string, string>> = {
  openai: 'text-embedding-3-small',
  gemini: 'gemini-embedding-001',
};

const BATCH = 96;

type EmbedInput = {
  settings: AISettings;
  texts: string[];
  dataClass: DataClass;
  signal?: AbortSignal;
};

export async function embedTexts(input: EmbedInput): Promise<number[][]> {
  const { settings, texts, signal } = input;
  if (!isAIConfigured(settings)) throw new AIError('AI is not configured. Add a provider and API key in Settings.');
  if (texts.length === 0) return [];
  const { conn, provider } = connectionOf(settings);
  const format = conn.gatewayFormat ?? 'openai-chat';
  if (format === 'anthropic') {
    throw new AIError('Anthropic has no embeddings API. Choose another connection for search by meaning.', { provider });
  }
  const configured = settings.embeddingModel?.trim() || DEFAULT_MODEL[provider] || '';
  // Gemini names are written `models/<name>` in its own docs; the request adds that prefix itself.
  const model = format === 'gemini' ? configured.replace(/^models\//, '') : configured;
  if (!model) {
    throw new AIError('Set an embedding model for this connection (Settings → AI) to search by meaning.', { provider });
  }

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    out.push(...(await embedBatch({ ...input, signal }, batch, model, conn, provider, format)));
  }
  return out;
}

async function embedBatch(
  input: EmbedInput,
  batch: string[],
  model: string,
  conn: ReturnType<typeof connectionOf>['conn'],
  provider: ReturnType<typeof connectionOf>['provider'],
  format: 'openai-chat' | 'openai-responses' | 'gemini',
): Promise<number[][]> {
  const isGemini = format === 'gemini';
  const template = conn.requestPath?.trim() || gatewayFormatDefaults(format).path;
  let requestPath: string;
  if (isGemini) {
    if (!template.includes(':generateContent')) {
      throw new AIError('Search by meaning needs the standard path for this connection.', { provider });
    }
    requestPath = template.replace(':generateContent', ':batchEmbedContents');
  } else if (!conn.requestPath?.trim()) {
    requestPath = '/embeddings';
  } else if (template.includes('/chat/completions')) {
    requestPath = template.replace('/chat/completions', '/embeddings');
  } else if (template.includes('/responses')) {
    requestPath = template.replace('/responses', '/embeddings');
  } else {
    throw new AIError('Search by meaning needs the standard path for this connection.', { provider });
  }

  const body = isGemini
    ? { requests: batch.map((text) => ({ model: `models/${model}`, content: { parts: [{ text }] } })) }
    : { model, input: batch };
  const res = await postConnectionJson({
    conn,
    provider,
    apiKey: input.settings.apiKey ?? '',
    model,
    requestPath,
    body,
    dataClass: input.dataClass,
    signal: input.signal,
  });
  if (res.status < 200 || res.status >= 300) {
    throw connectionStatusError(provider, res.status, maskConnectionSecrets(res.text, res.secrets), res.diagnostic());
  }
  return parseEmbeddings(res.text, batch.length, isGemini, provider, res.diagnostic());
}

function parseEmbeddings(text: string, expected: number, gemini: boolean, provider: AIProvider, diagnostic: string): number[][] {
  const fail = (message: string) => new AIError(message, { provider, diagnostic });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw fail('The embeddings reply was not valid JSON.');
  }
  const obj = json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
  let vectors: unknown[];
  if (gemini) {
    const list = obj?.embeddings;
    if (!Array.isArray(list)) throw fail('The embeddings reply had an unexpected shape.');
    vectors = list.map((e) => (e && typeof e === 'object' ? (e as { values?: unknown }).values : undefined));
  } else {
    const list = obj?.data;
    if (!Array.isArray(list)) throw fail('The embeddings reply had an unexpected shape.');
    const indexOf = (e: unknown): number => {
      const raw = (e as { index?: unknown } | null)?.index;
      return raw === undefined ? 0 : typeof raw === 'number' ? raw : Number.NaN;
    };
    // An index that is not a number would make the order arbitrary; the reply is refused instead.
    if (list.some((e) => !Number.isFinite(indexOf(e)))) throw fail('The embeddings reply had an unexpected shape.');
    const ordered = [...list].sort((a, b) => indexOf(a) - indexOf(b));
    vectors = ordered.map((e) => (e && typeof e === 'object' ? (e as { embedding?: unknown }).embedding : undefined));
  }
  if (vectors.length !== expected) throw fail('The embeddings reply did not match the request.');
  return vectors.map((v) => {
    if (!Array.isArray(v) || v.length === 0 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
      throw fail('The embeddings reply had an unreadable vector.');
    }
    return v as number[];
  });
}

/** Cosine similarity; 0 for a zero vector or vectors of different length. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** The items, most similar to the query vector first. Ties keep their original order. */
export function rankBySimilarity<T>(query: readonly number[], items: readonly T[], vectors: readonly (readonly number[])[]): T[] {
  return items
    .map((item, index) => ({ item, index, score: cosine(query, vectors[index] ?? []) }))
    .sort((x, y) => y.score - x.score || x.index - y.index)
    .map((x) => x.item);
}
