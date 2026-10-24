import type { AIProvider, AISettings, GatewayFormat } from '../model';
import { AI_PROVIDER_OPTIONS } from '../model';
import { normalizeGatewayBaseUrl, resolveGatewayRequest } from './aiGatewayUrl';
import { HOSTED_CONNECTIONS, type GatewayConnection, type HostedProvider } from './aiPresets';
import type { DataClass } from './ai/types';

/**
 * Tiny provider abstraction for the BYO-key AI assistant. We keep this
 * deliberately small:
 *   - one entry point (`askAI`) that returns the assistant's plain text reply,
 *   - per-provider request shaping isolated in switch arms,
 *   - all failures funnelled into a single AIError with a user-friendly message.
 *
 * Calls go directly from the renderer to the provider — there is no proxy.
 * That keeps the user's key on their device but means they need to trust the
 * provider with their task title/body. We make this trade-off explicit in the
 * Settings UI.
 */

export type AIMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string };

export type AskAIInput = {
  settings: AISettings;
  /** The system text for this request. Defaults to a short neutral instruction. */
  fallbackSystem?: string;
  /** Conversation so far (oldest first). At minimum, one user message. */
  messages: AIMessage[];
  /** Cap on the assistant reply length. */
  maxOutputTokens?: number;
  /**
   * Ask the provider for JSON where it has a documented mechanism (OpenAI Chat and
   * Responses, Gemini). Formats without one (Anthropic needs a schema) ignore it; the
   * caller's validator is the guard either way.
   */
  responseFormat?: 'json';
  /** Class of data in `messages`; the desktop main process enforces `aiPeople` for `people`. */
  dataClass?: DataClass;
  /** Cancellation hook (browser AbortController). */
  signal?: AbortSignal;
};

/**
 * Normalised reason the provider stopped generating.
 *
 *   - 'stop'   → the model finished its turn cleanly (end_turn / STOP / etc.).
 *   - 'length' → the model hit our `maxOutputTokens` budget and was cut off
 *                mid-stream; the UI should offer a "Continue" affordance.
 *   - 'other'  → safety filters, tool calls, recitation refusals, or any
 *                provider-specific reason we don't have a UX for yet. Treated
 *                as "we got something but don't presume more is coming".
 */
export type AIStopReason = 'stop' | 'length' | 'other';

export type AskAIResult = {
  text: string;
  stopReason: AIStopReason;
};

export class AIError extends Error {
  status?: number;
  provider?: AIProvider;
  /**
   * Gateway failures only: a copy-pasteable description of the exchange (URL,
   * header names with masked values, HTTP status, start of the body). It never
   * contains an API key.
   */
  diagnostic?: string;
  constructor(
    message: string,
    opts: { status?: number; provider?: AIProvider; cause?: unknown; diagnostic?: string } = {},
  ) {
    super(message);
    this.name = 'AIError';
    this.status = opts.status;
    this.provider = opts.provider;
    this.diagnostic = opts.diagnostic;
    if (opts.cause !== undefined) (this as unknown as { cause?: unknown }).cause = opts.cause;
  }
}

export function defaultModel(provider: AIProvider): string {
  return AI_PROVIDER_OPTIONS.find((p) => p.value === provider)?.defaultModel ?? '';
}

/**
 * A hosted provider needs a key. A custom gateway needs a valid base URL and a
 * model name (it has no default model); its key is optional because a
 * gateway on the local network may not require one.
 */
export function isAIConfigured(
  s: AISettings | undefined,
): s is AISettings & { provider: AIProvider } {
  if (!s?.provider) return false;
  if (s.provider === 'gateway') {
    return !!s.baseUrl && normalizeGatewayBaseUrl(s.baseUrl).ok && !!s.model?.trim();
  }
  return !!s.apiKey;
}

/** Used only by callers that do not bring a task prompt (for example the connection test). */
const NEUTRAL_SYSTEM = 'Reply briefly and plainly.';

export async function askAI(input: AskAIInput): Promise<AskAIResult> {
  const { settings, messages } = input;
  if (!isAIConfigured(settings)) {
    throw new AIError('AI is not configured. Add a provider and API key in Settings.', {
      provider: settings?.provider,
    });
  }
  if (messages.length === 0) {
    throw new AIError('Nothing to ask — the conversation is empty.', { provider: settings.provider });
  }
  const { provider } = settings;
  const apiKey = settings.apiKey ?? '';
  const model = settings.model?.trim() || defaultModel(provider);
  // The system text always comes from the caller's task prompt (`src/lib/ai/prompts`); a stored
  // `settings.systemPrompt` is never used here (the task runner offers it as a focus note instead).
  const system = (input.fallbackSystem?.trim() || NEUTRAL_SYSTEM).slice(0, 4000);
  const maxTokens = Math.min(Math.max(input.maxOutputTokens ?? 800, 64), 4000);

  const args: ProviderArgs = {
    apiKey,
    model,
    system,
    messages,
    maxTokens,
    signal: input.signal,
    responseFormat: input.responseFormat,
    dataClass: input.dataClass,
  };
  if (provider === 'gateway') return callGateway(args, settings, 'gateway');
  if (provider in HOSTED_CONNECTIONS) {
    return callGateway(args, HOSTED_CONNECTIONS[provider as HostedProvider], provider);
  }
  throw new AIError(`Unknown AI provider: ${String(provider)}`);
}

type ProviderArgs = {
  apiKey: string;
  model: string;
  system: string;
  messages: AIMessage[];
  maxTokens: number;
  signal?: AbortSignal;
  responseFormat?: 'json';
  dataClass?: DataClass;
};

// ---------- wire formats -------------------------------------------------------
//
// Each format has a body builder and a response parser. The hosted providers
// and the custom gateway share them, so a format behaves the same wherever it
// is used.

function chatBody(a: ProviderArgs, conn: GatewayConnection): string {
  return JSON.stringify({
    model: a.model,
    // OpenAI deprecated `max_tokens` and its reasoning models reject it, but most
    // gateways and local servers only know it: the connection decides.
    [conn.maxTokensField ?? 'max_tokens']: a.maxTokens,
    // The older JSON mode (valid for every OpenAI chat model); the prompt must also ask for JSON.
    ...(a.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
    messages: [
      { role: 'system', content: a.system },
      ...a.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
}

function responsesBody(a: ProviderArgs, _conn?: GatewayConnection): string {
  return JSON.stringify({
    model: a.model,
    instructions: a.system,
    input: a.messages.map((m) => ({ role: m.role, content: m.content })),
    max_output_tokens: a.maxTokens,
    ...(a.responseFormat === 'json' ? { text: { format: { type: 'json_object' } } } : {}),
  });
}

function anthropicBody(a: ProviderArgs, _conn?: GatewayConnection): string {
  return JSON.stringify({
    model: a.model,
    system: a.system,
    max_tokens: a.maxTokens,
    messages: a.messages.map((m) => ({ role: m.role, content: m.content })),
  });
}

function geminiBody(a: ProviderArgs, _conn?: GatewayConnection): string {
  // Gemini has no top-level "system" role; it uses `systemInstruction` (a Content
  // without a role, as in Google's examples). User and assistant turns go in `contents`.
  return JSON.stringify({
    systemInstruction: { parts: [{ text: a.system }] },
    generationConfig: {
      maxOutputTokens: a.maxTokens,
      temperature: 0.5,
      ...(a.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
    },
    contents: a.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  });
}

function parseJsonBody<T>(raw: string, provider: AIProvider): T {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AIError(`${providerName(provider)} returned a response that is not JSON.`, { provider });
  }
  // `null`, a number, a string or an array are valid JSON but not a reply we can read.
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AIError(`${providerName(provider)} returned a response in an unexpected shape.`, { provider });
  }
  return value as T;
}

/** Text of an OpenAI `message.content`: a string, or a list of `{ type: 'text', text }` parts. */
function chatContentText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
      .join('')
      .trim();
  }
  return '';
}

/** The model used its whole token budget before writing visible text (hidden reasoning). */
function tokenLimitBeforeAnswer(provider: AIProvider): AIError {
  return new AIError(
    `${providerName(provider)} stopped at the token limit before writing an answer. Try again, or use a model that does not spend tokens on hidden reasoning.`,
    { provider },
  );
}

function emptyResponse(provider: AIProvider): AIError {
  return new AIError(`${providerName(provider)} returned an empty response.`, { provider });
}

/** Parses an OpenAI `chat/completions` body. */
function parseChatCompletion(raw: string, provider: AIProvider): AskAIResult {
  const json = parseJsonBody<{
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
  }>(raw, provider);
  const first = Array.isArray(json.choices) ? json.choices[0] : undefined;
  const text = chatContentText(first?.message?.content);
  const finishReason = first?.finish_reason;
  if (!text && finishReason === 'length') {
    // The model used its whole token budget without producing visible text
    // (typical of reasoning models that spend tokens thinking first).
    throw tokenLimitBeforeAnswer(provider);
  }
  if (!text) throw emptyResponse(provider);
  // OpenAI finish reasons: 'stop' | 'length' | 'content_filter' |
  // 'tool_calls' | 'function_call'. Anything that isn't an explicit
  // clean stop becomes 'other' — only 'length' lights up the
  // Continue affordance.
  const stopReason: AIStopReason =
    finishReason === 'length' ? 'length' : finishReason === 'stop' ? 'stop' : 'other';
  return { text, stopReason };
}

/** Parses an OpenAI `responses` body. */
function parseResponses(raw: string, provider: AIProvider): AskAIResult {
  const json = parseJsonBody<{
    status?: string;
    output_text?: unknown;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    incomplete_details?: { reason?: string } | null;
  }>(raw, provider);
  const fromOutput = (Array.isArray(json.output) ? json.output : [])
    .filter((item) => item && item.type === 'message')
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((c) => c && c.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text!)
    .join('\n')
    .trim();
  const text = fromOutput || (typeof json.output_text === 'string' ? json.output_text.trim() : '');
  if (!text && json.status === 'incomplete' && json.incomplete_details?.reason === 'max_output_tokens') {
    throw tokenLimitBeforeAnswer(provider);
  }
  if (!text) throw emptyResponse(provider);
  // `status: "completed"` on a clean finish (observed live). A cut-off reply is
  // `status: "incomplete"` with `incomplete_details.reason === "max_output_tokens"`
  // (the reason enum in OpenAI's published API spec).
  const stopReason: AIStopReason =
    json.status === 'completed'
      ? 'stop'
      : json.status === 'incomplete' && json.incomplete_details?.reason === 'max_output_tokens'
        ? 'length'
        : 'other';
  return { text, stopReason };
}

/** Parses an Anthropic `messages` body. */
function parseAnthropic(raw: string, provider: AIProvider): AskAIResult {
  const json = parseJsonBody<{
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
  }>(raw, provider);
  const text = (Array.isArray(json.content) ? json.content : [])
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!)
    .join('\n')
    .trim();
  if (!text) throw emptyResponse(provider);
  // Anthropic stop reasons: 'end_turn' | 'max_tokens' | 'stop_sequence' |
  // 'tool_use'. We only map 'max_tokens' to 'length'; 'stop_sequence' is
  // a clean stop driven by user-supplied stop strings.
  const stopReason: AIStopReason =
    json.stop_reason === 'max_tokens'
      ? 'length'
      : json.stop_reason === 'end_turn' || json.stop_reason === 'stop_sequence'
        ? 'stop'
        : 'other';
  return { text, stopReason };
}

/** Parses a Gemini `generateContent` body. */
function parseGemini(raw: string, provider: AIProvider): AskAIResult {
  const json = parseJsonBody<{
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  }>(raw, provider);
  const candidate = Array.isArray(json.candidates) ? json.candidates[0] : undefined;
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const text = parts
    .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  const finishReason = candidate?.finishReason;
  if (!text && finishReason === 'MAX_TOKENS') throw tokenLimitBeforeAnswer(provider);
  if (!text) throw emptyResponse(provider);
  // Gemini finish reasons: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION'
  // | 'OTHER' (and a few newer ones that we lump into 'other').
  const stopReason: AIStopReason =
    finishReason === 'MAX_TOKENS' ? 'length' : finishReason === 'STOP' ? 'stop' : 'other';
  return { text, stopReason };
}

const GATEWAY_FORMATS: Record<
  GatewayFormat,
  { body: (a: ProviderArgs, conn: GatewayConnection) => string; parse: (raw: string, provider: AIProvider) => AskAIResult }
> = {
  'openai-chat': { body: chatBody, parse: parseChatCompletion },
  'openai-responses': { body: responsesBody, parse: parseResponses },
  anthropic: { body: anthropicBody, parse: parseAnthropic },
  gemini: { body: geminiBody, parse: parseGemini },
};

// ---------- request engine -----------------------------------------------------
//
// Every provider (the hosted ones through their preset, and the custom gateway
// through the user's settings) is sent by the same code, so a format behaves
// the same wherever it is used.

/** Header values that are safe to show as they are in a diagnostic. */
const DIAGNOSTIC_PLAIN_HEADERS = new Set(['anthropic-version', 'accept', 'content-type']);

/** Only secrets long enough to be worth masking; a 1-2 character "key" would corrupt the text. */
const MIN_MASKED_SECRET = 4;
/** Header values are masked only from this length: short ones such as `true` are flags, not tokens. */
const MIN_MASKED_HEADER_SECRET = 8;

/** Same limit the desktop main process applies. */
const WEB_REQUEST_TIMEOUT_MS = 120_000;

/**
 * Everything that must never be shown: the API key (raw and URL-encoded), and the values
 * of headers that may carry a token (the key's header and any extra header), without the
 * `Bearer ` prefix. Used for the diagnostic and for the message the user sees.
 */
function collectSecrets(apiKey: string, headers: Record<string, string>): string[] {
  const secrets = apiKey ? [apiKey, encodeURIComponent(apiKey)] : [];
  for (const [name, value] of Object.entries(headers)) {
    if (DIAGNOSTIC_PLAIN_HEADERS.has(name.toLowerCase())) continue;
    const token = value.replace(/^Bearer\s+/i, '');
    for (const v of [value, token]) if (v.length >= MIN_MASKED_HEADER_SECRET) secrets.push(v);
  }
  return secrets;
}

function maskSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= MIN_MASKED_SECRET) out = out.split(secret).join('<hidden>');
  }
  return out;
}

/**
 * Describes one exchange for a bug report. Header names are kept but their
 * values are not shown, and the API key is masked wherever it appears: in the
 * address (Gemini puts it there), in an error message, or echoed in the reply.
 */
function exchangeDiagnostic(opts: {
  format: GatewayFormat;
  url: string;
  headers: Record<string, string>;
  secrets: string[];
  via: 'desktop' | 'browser';
  status?: number;
  body?: string;
  error?: string;
}): string {
  const secrets = opts.secrets;
  const lines = [`format: ${opts.format} (${opts.via})`, `POST ${maskSecrets(opts.url, secrets)}`];
  for (const [name, value] of Object.entries(opts.headers)) {
    const plain = DIAGNOSTIC_PLAIN_HEADERS.has(name.toLowerCase());
    lines.push(`${name}: ${plain ? value : `<hidden, ${value.length} chars>`}`);
  }
  if (opts.status !== undefined) lines.push(`-> HTTP ${opts.status}`);
  if (opts.error) lines.push(`-> ${maskSecrets(opts.error, secrets)}`);
  if (opts.body !== undefined) {
    const flat = maskSecrets(opts.body, secrets).replace(/\s+/g, ' ').trim();
    lines.push(`body: ${flat.length > 300 ? `${flat.slice(0, 299)}…` : flat || '(empty)'}`);
  }
  return lines.join('\n');
}

/**
 * Sends one request. In the desktop app the main process performs the HTTP call
 * (no CSP/CORS, target re-validated, `ai` policy enforced there). In the web
 * build the browser calls the server directly, which only works when the server
 * sends CORS headers.
 *
 * `provider` only labels errors; the target comes from `conn`.
 */
async function callGateway(
  a: ProviderArgs,
  conn: GatewayConnection,
  provider: AIProvider,
): Promise<AskAIResult> {
  const format: GatewayFormat = conn.gatewayFormat ?? 'openai-chat';
  const target = resolveGatewayRequest(conn, a.model, a.apiKey);
  if (!target.ok) throw new AIError(target.error, { provider });
  const body = GATEWAY_FORMATS[format].body(a, conn);
  const bridge = typeof window !== 'undefined' ? window.cadence : undefined;
  const via = bridge?.aiGatewayChat ? 'desktop' : 'browser';
  const secrets = collectSecrets(a.apiKey, target.headers);
  const diag = (extra: { status?: number; body?: string; error?: string } = {}) =>
    exchangeDiagnostic({ format, url: target.url, headers: target.headers, secrets, via, ...extra });

  let status: number;
  let text: string;
  if (bridge?.aiGatewayChat) {
    const requestId = globalThis.crypto.randomUUID();
    const onAbort = () => void bridge.aiGatewayAbort?.(requestId);
    if (a.signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    a.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const r = await bridge.aiGatewayChat({
        requestId,
        baseUrl: target.baseUrl,
        path: target.path,
        headers: target.headers,
        body,
        dataClass: a.dataClass ?? 'content',
      });
      if (!r.ok) {
        if ('aborted' in r && r.aborted) throw new DOMException('Request cancelled.', 'AbortError');
        throw new AIError(maskSecrets(r.error, secrets), { provider, diagnostic: diag({ error: r.error }) });
      }
      status = r.status;
      text = r.text;
    } finally {
      a.signal?.removeEventListener('abort', onAbort);
    }
  } else {
    // Like the desktop path: refuse redirects (a cross-origin redirect would otherwise carry
    // custom auth headers to another host) and give up after the same two minutes.
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), WEB_REQUEST_TIMEOUT_MS);
    const onUserAbort = () => timeout.abort();
    a.signal?.addEventListener('abort', onUserAbort, { once: true });
    if (a.signal?.aborted) timeout.abort();
    try {
      const res = await fetch(target.url, {
        method: 'POST',
        signal: timeout.signal,
        redirect: 'error',
        headers: { 'content-type': 'application/json', ...target.headers },
        body,
      });
      status = res.status;
      text = await res.text();
    } catch (err) {
      if (a.signal?.aborted) throw err;
      if (timeout.signal.aborted) {
        throw new AIError(`${provider === 'gateway' ? 'The gateway' : providerName(provider)} did not answer within ${WEB_REQUEST_TIMEOUT_MS / 1000} seconds.`, {
          provider,
          diagnostic: diag({ error: 'timeout' }),
        });
      }
      if ((err as DOMException)?.name === 'AbortError') throw err;
      throw new AIError(
        `Could not reach ${provider === 'gateway' ? 'the gateway' : providerName(provider)}. Check the address and your connection${
          provider === 'gateway' ? ', and that the gateway allows browser (CORS) requests' : ''
        }.`,
        { provider, cause: err, diagnostic: diag({ error: (err as Error)?.message ?? String(err) }) },
      );
    } finally {
      clearTimeout(timer);
      a.signal?.removeEventListener('abort', onUserAbort);
    }
  }

  if (status < 200 || status >= 300) {
    // Google retired Gemini 1.x (late 2025) and gemini-2.0-flash(-lite) (2026-06-01). If
    // the user is still pointing at one of those, return a targeted error so they know
    // the fix is a model rename rather than something with their key.
    if (provider === 'gemini' && status === 404 && /^gemini-(1\.|2\.0)/i.test(a.model)) {
      throw new AIError(
        `The model "${a.model}" is no longer served by Google's Gemini API (it was retired). ` +
          `Open Settings → AI Assistant and switch to "${defaultModel('gemini')}" (recommended) or another current Gemini model.`,
        { status: 404, provider, diagnostic: diag({ status, body: text }) },
      );
    }
    throw statusError(provider, status, maskSecrets(text, secrets), diag({ status, body: text }));
  }
  try {
    return GATEWAY_FORMATS[format].parse(text, provider);
  } catch (err) {
    const failure =
      err instanceof AIError
        ? err
        : new AIError(`${providerName(provider)} returned a response in an unexpected shape.`, { provider, cause: err });
    failure.diagnostic = diag({ status, body: text });
    throw failure;
  }
}

function statusError(provider: AIProvider, status: number, raw: string, diagnostic?: string): AIError {
  let detail = raw;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const inner = (j.error as { message?: string } | undefined)?.message;
    if (typeof inner === 'string' && inner.trim()) detail = inner;
  } catch {
    // raw stays as-is
  }
  const friendly = friendlyStatus(status, provider);
  const message = `${friendly} ${detail ? `— ${truncate(detail, 320)}` : ''}`.trim();
  return new AIError(message, { status, provider, diagnostic });
}

function providerName(provider: AIProvider): string {
  return provider === 'anthropic'
    ? 'Anthropic'
    : provider === 'openai'
      ? 'OpenAI'
      : provider === 'gateway'
        ? 'The gateway'
        : 'Gemini';
}

function friendlyStatus(status: number, provider: AIProvider): string {
  const name = providerName(provider);
  if (status === 401 || status === 403) {
    // A gateway forwards to other providers, so the rejection may come from the
    // provider behind the chosen model rather than from the gateway key.
    if (provider === 'gateway') {
      return `The gateway answered HTTP ${status}: either its API key or the provider behind this model refused the request. Try another model.`;
    }
    return `${name} rejected the API key (HTTP ${status}).`;
  }
  if (status === 404) {
    if (provider === 'gateway') {
      return 'The gateway answered HTTP 404: the model or the request path was not found. Check the model name, the base URL, the API format and the request path.';
    }
    return `${name} could not find that model (HTTP 404). Check the model name in Settings.`;
  }
  if (status === 405 && provider === 'gateway') {
    return 'The gateway answered HTTP 405: it does not accept this request at this address. Check the API format, the base URL and the request path.';
  }
  if (status === 429) return `${name} rate-limited the request (HTTP 429). Try again in a moment.`;
  if (status >= 500) return `${name} is having trouble (HTTP ${status}). Try again later.`;
  return `${name} request failed (HTTP ${status}).`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
