/**
 * A copy of `parseAISettings` as it shipped before extra connections existed (commit 2ec073d).
 * It stands in for "an older build" in compatibility tests: it knows only the fields listed
 * here, keeps any other key through `withExtras`, and returns `undefined` (so the whole object
 * is dropped on its next save) when none of the known fields is set.
 *
 * Do not "fix" or modernise this file: its value is that it does NOT know the newer keys.
 */

type Obj = Record<string, unknown>;

const FORMATS = ['openai-chat', 'openai-responses', 'anthropic', 'gemini'];
const PROVIDERS = ['anthropic', 'openai', 'gemini', 'gateway'];

function withExtras<T extends object>(raw: Obj, parsed: T): T {
  let extra: Obj | null = null;
  for (const key of Object.keys(raw)) {
    if (!(key in parsed)) {
      if (!extra) extra = {};
      extra[key] = raw[key];
    }
  }
  return extra ? ({ ...extra, ...parsed } as T) : parsed;
}

function headers(raw: unknown): Array<{ name: string; value: string }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Array<{ name: string; value: string }> = [];
  for (const h of raw) {
    if (!h || typeof h !== 'object') continue;
    const { name, value } = h as Obj;
    if (typeof name !== 'string' || typeof value !== 'string' || !name.trim()) continue;
    out.push({ name: name.trim(), value });
  }
  return out.length ? out : undefined;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export function legacyParseAISettings(raw: unknown): Obj | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Obj;
  const provider = typeof o.provider === 'string' && PROVIDERS.includes(o.provider) ? o.provider : undefined;
  const apiKey = str(o.apiKey);
  const model = str(o.model);
  const baseUrl = str(o.baseUrl);
  const gatewayFormat = FORMATS.includes(o.gatewayFormat as string) ? (o.gatewayFormat as string) : undefined;
  const authScheme = o.authScheme === 'bearer' || o.authScheme === 'raw' || o.authScheme === 'none' ? o.authScheme : undefined;
  const authHeader = str(o.authHeader);
  const requestPath = str(o.requestPath);
  const maxTokensField = o.maxTokensField === 'max_tokens' || o.maxTokensField === 'max_completion_tokens' ? o.maxTokensField : undefined;
  const extraHeaders = headers(o.extraHeaders);
  const systemPrompt = typeof o.systemPrompt === 'string' ? o.systemPrompt : undefined;
  const extractionGuidance = typeof o.extractionGuidance === 'string' ? o.extractionGuidance : undefined;
  if (
    !provider && !apiKey && !model && !baseUrl && !gatewayFormat && !authHeader && !authScheme &&
    !requestPath && !maxTokensField && !extraHeaders && !systemPrompt && !extractionGuidance
  ) {
    return undefined;
  }
  return withExtras(o, {
    provider, apiKey, model, baseUrl, gatewayFormat, authHeader, authScheme, requestPath, maxTokensField,
    extraHeaders, systemPrompt, extractionGuidance,
  });
}
