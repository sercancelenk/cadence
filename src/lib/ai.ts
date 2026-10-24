import type { AIProvider, AISettings, GatewayFormat } from '../model';
import { AI_PROVIDER_OPTIONS } from '../model';
import { normalizeGatewayBaseUrl, resolveGatewayRequest } from './aiGatewayUrl';

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
  /** Optional system prompt; settings.systemPrompt wins when provided. */
  fallbackSystem?: string;
  /** Conversation so far (oldest first). At minimum, one user message. */
  messages: AIMessage[];
  /** Cap on the assistant reply length. */
  maxOutputTokens?: number;
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

const DEFAULT_SYSTEM = `You are an embedded coaching assistant inside a personal task manager called Cadence.
The user will share a single task — including any markdown notes they already wrote — and you will help them ship it. Reply with:
- a 1–2 sentence framing of what the task really needs,
- 3 to 5 concrete next actions, ordered by leverage,
- 1 risk / common mistake to avoid,
- (optional) a final "Want me to go deeper on X?" line when the topic has obvious follow-ups.

Use the user's notes as the primary source of truth: if they specified a stack, tools, or constraints, plan around them — never propose alternatives unless asked.

Style:
- Plain Markdown. Headings/bullets are encouraged.
- Aim for ~250 words. NEVER stop mid-sentence; if you're approaching your output budget, wrap up cleanly instead of cutting off.
- No filler ("Of course!", "Great question!"). Start with the answer.`;

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
  const system = (settings.systemPrompt?.trim() || input.fallbackSystem || DEFAULT_SYSTEM).slice(0, 4000);
  const maxTokens = Math.min(Math.max(input.maxOutputTokens ?? 800, 64), 4000);

  switch (provider) {
    case 'anthropic':
      return callAnthropic({ apiKey, model, system, messages, maxTokens, signal: input.signal });
    case 'openai':
      return callOpenAI({ apiKey, model, system, messages, maxTokens, signal: input.signal });
    case 'gemini':
      return callGemini({ apiKey, model, system, messages, maxTokens, signal: input.signal });
    case 'gateway':
      return callGateway({ apiKey, model, system, messages, maxTokens, signal: input.signal }, settings);
    default:
      throw new AIError(`Unknown AI provider: ${String(provider)}`);
  }
}

type ProviderArgs = {
  apiKey: string;
  model: string;
  system: string;
  messages: AIMessage[];
  maxTokens: number;
  signal?: AbortSignal;
};

// ---------- wire formats -------------------------------------------------------
//
// Each format has a body builder and a response parser. The hosted providers
// and the custom gateway share them, so a format behaves the same wherever it
// is used.

function chatBody(a: ProviderArgs): string {
  return JSON.stringify({
    model: a.model,
    max_tokens: a.maxTokens,
    messages: [
      { role: 'system', content: a.system },
      ...a.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
}

function responsesBody(a: ProviderArgs): string {
  return JSON.stringify({
    model: a.model,
    instructions: a.system,
    input: a.messages.map((m) => ({ role: m.role, content: m.content })),
    max_output_tokens: a.maxTokens,
  });
}

function anthropicBody(a: ProviderArgs): string {
  return JSON.stringify({
    model: a.model,
    system: a.system,
    max_tokens: a.maxTokens,
    messages: a.messages.map((m) => ({ role: m.role, content: m.content })),
  });
}

function geminiBody(a: ProviderArgs): string {
  // Gemini has no top-level "system" role; it uses `systemInstruction`. User and
  // assistant turns go in `contents`.
  return JSON.stringify({
    systemInstruction: { role: 'system', parts: [{ text: a.system }] },
    generationConfig: { maxOutputTokens: a.maxTokens, temperature: 0.5 },
    contents: a.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  });
}

function parseJsonBody<T>(raw: string, provider: AIProvider): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new AIError(`${providerName(provider)} returned a response that is not JSON.`, { provider });
  }
}

function emptyResponse(provider: AIProvider): AIError {
  return new AIError(`${providerName(provider)} returned an empty response.`, { provider });
}

/** Parses an OpenAI `chat/completions` body. */
function parseChatCompletion(raw: string, provider: AIProvider): AskAIResult {
  const json = parseJsonBody<{
    choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  }>(raw, provider);
  const text = (json.choices?.[0]?.message?.content ?? '').trim();
  const finishReason = json.choices?.[0]?.finish_reason;
  if (!text && finishReason === 'length') {
    // The model used its whole token budget without producing visible text
    // (typical of reasoning models that spend tokens thinking first).
    throw new AIError(
      `${providerName(provider)} stopped at the token limit before writing an answer. Try again, or use a model that does not spend tokens on hidden reasoning.`,
      { provider },
    );
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
  const fromOutput = (json.output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text!)
    .join('\n')
    .trim();
  const text = fromOutput || (typeof json.output_text === 'string' ? json.output_text.trim() : '');
  if (!text) throw emptyResponse(provider);
  // Observed: `status: "completed"` on a clean finish. A cut-off reply is
  // reported as `status: "incomplete"` with `incomplete_details.reason ===
  // "max_output_tokens"` per OpenAI's documentation (not observed here).
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
  const text = (json.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
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
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  if (!text) throw emptyResponse(provider);
  // Gemini finish reasons: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION'
  // | 'OTHER' (and a few newer ones that we lump into 'other').
  const finishReason = json.candidates?.[0]?.finishReason;
  const stopReason: AIStopReason =
    finishReason === 'MAX_TOKENS' ? 'length' : finishReason === 'STOP' ? 'stop' : 'other';
  return { text, stopReason };
}

const GATEWAY_FORMATS: Record<
  GatewayFormat,
  { body: (a: ProviderArgs) => string; parse: (raw: string, provider: AIProvider) => AskAIResult }
> = {
  'openai-chat': { body: chatBody, parse: parseChatCompletion },
  'openai-responses': { body: responsesBody, parse: parseResponses },
  anthropic: { body: anthropicBody, parse: parseAnthropic },
  gemini: { body: geminiBody, parse: parseGemini },
};

// ---------- hosted providers ---------------------------------------------------

async function callAnthropic(a: ProviderArgs): Promise<AskAIResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: a.signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': a.apiKey,
      'anthropic-version': '2023-06-01',
      // Anthropic requires this opt-in to allow direct browser calls.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: anthropicBody(a),
  });
  if (!res.ok) throw await providerError('anthropic', res);
  return parseAnthropic(await res.text(), 'anthropic');
}

async function callOpenAI(a: ProviderArgs): Promise<AskAIResult> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: a.signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${a.apiKey}`,
    },
    body: chatBody(a),
  });
  if (!res.ok) throw await providerError('openai', res);
  return parseChatCompletion(await res.text(), 'openai');
}

async function callGemini(a: ProviderArgs): Promise<AskAIResult> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(a.model)}:generateContent` +
    `?key=${encodeURIComponent(a.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    signal: a.signal,
    headers: { 'content-type': 'application/json' },
    body: geminiBody(a),
  });
  if (!res.ok) {
    // Google retired the Gemini 1.x family from `v1beta` in late 2025. If the
    // user is still pointing at one of those, return a targeted error so they
    // know the fix is a model rename rather than something with their key.
    if (res.status === 404 && /^gemini-1\.[05]/i.test(a.model)) {
      throw new AIError(
        `The model "${a.model}" is no longer served by Google's Gemini API (Gemini 1.x was retired). ` +
          `Open Settings → AI Assistant and switch to "gemini-2.0-flash" (recommended) or any of the gemini-2.x / 2.5 models.`,
        { status: 404, provider: 'gemini' },
      );
    }
    throw await providerError('gemini', res);
  }
  return parseGemini(await res.text(), 'gemini');
}

// ---------- custom gateway -----------------------------------------------------

type GatewaySettings = Pick<
  AISettings,
  'baseUrl' | 'gatewayFormat' | 'authHeader' | 'authScheme' | 'extraHeaders' | 'requestPath'
>;

/** Header values that are safe to show as they are in a diagnostic. */
const DIAGNOSTIC_PLAIN_HEADERS = new Set(['anthropic-version', 'accept', 'content-type']);

/**
 * Describes one gateway exchange for a bug report. Header names are kept, but
 * their values are reduced to the first three characters and a length, so the
 * API key (and any tenant token in an extra header) never appears.
 */
function gatewayDiagnostic(opts: {
  format: GatewayFormat;
  url: string;
  headers: Record<string, string>;
  via: 'desktop' | 'browser';
  status?: number;
  body?: string;
  error?: string;
}): string {
  const lines = [`format: ${opts.format} (${opts.via})`, `POST ${opts.url}`];
  const secrets: string[] = [];
  for (const [name, value] of Object.entries(opts.headers)) {
    const plain = DIAGNOSTIC_PLAIN_HEADERS.has(name.toLowerCase());
    if (!plain) {
      secrets.push(value);
      // The bearer prefix is not secret but the token after it is.
      const token = value.replace(/^Bearer\s+/i, '');
      if (token !== value) secrets.push(token);
    }
    lines.push(`${name}: ${plain ? value : `<hidden, ${value.length} chars>`}`);
  }
  if (opts.status !== undefined) lines.push(`-> HTTP ${opts.status}`);
  if (opts.error) lines.push(`-> ${opts.error}`);
  if (opts.body !== undefined) {
    // A gateway may echo the request back; never let a secret through that way.
    let echoed = opts.body;
    for (const secret of secrets) {
      if (secret.length >= 4) echoed = echoed.split(secret).join('<hidden>');
    }
    const flat = echoed.replace(/\s+/g, ' ').trim();
    lines.push(`body: ${flat.length > 300 ? `${flat.slice(0, 299)}…` : flat || '(empty)'}`);
  }
  return lines.join('\n');
}

/**
 * Custom gateway (OmniRoute, LiteLLM, a company proxy, …). The wire format,
 * auth header, extra headers and path come from the user's settings. In the
 * desktop app the main process performs the HTTP call (no CSP/CORS, target
 * re-validated, `ai` policy enforced there). In the web build the browser calls
 * the gateway directly, which only works when the gateway sends CORS headers.
 */
async function callGateway(a: ProviderArgs, gw: GatewaySettings): Promise<AskAIResult> {
  const format: GatewayFormat = gw.gatewayFormat ?? 'openai-chat';
  const target = resolveGatewayRequest(gw, a.model, a.apiKey);
  if (!target.ok) throw new AIError(target.error, { provider: 'gateway' });
  const body = GATEWAY_FORMATS[format].body(a);
  const bridge = typeof window !== 'undefined' ? window.cadence : undefined;
  const via = bridge?.aiGatewayChat ? 'desktop' : 'browser';
  const diag = (extra: { status?: number; body?: string; error?: string } = {}) =>
    gatewayDiagnostic({ format, url: target.url, headers: target.headers, via, ...extra });

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
      });
      if (!r.ok) {
        if ('aborted' in r && r.aborted) throw new DOMException('Request cancelled.', 'AbortError');
        throw new AIError(r.error, { provider: 'gateway', diagnostic: diag({ error: r.error }) });
      }
      status = r.status;
      text = r.text;
    } finally {
      a.signal?.removeEventListener('abort', onAbort);
    }
  } else {
    try {
      const res = await fetch(target.url, {
        method: 'POST',
        signal: a.signal,
        headers: { 'content-type': 'application/json', ...target.headers },
        body,
      });
      status = res.status;
      text = await res.text();
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') throw err;
      throw new AIError(
        'Could not reach the gateway. Check the URL, and that the gateway allows browser (CORS) requests.',
        { provider: 'gateway', cause: err, diagnostic: diag({ error: (err as Error)?.message ?? String(err) }) },
      );
    }
  }

  if (status < 200 || status >= 300) {
    throw statusError('gateway', status, text, diag({ status, body: text }));
  }
  try {
    return GATEWAY_FORMATS[format].parse(text, 'gateway');
  } catch (err) {
    if (err instanceof AIError) err.diagnostic = diag({ status, body: text });
    throw err;
  }
}

async function providerError(provider: AIProvider, res: Response): Promise<AIError> {
  let raw = '';
  try {
    raw = await res.text();
  } catch {
    raw = '';
  }
  return statusError(provider, res.status, raw);
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

export function buildTaskPrompt(opts: {
  title: string;
  body?: string;
  context?: string;
}): string {
  const parts: string[] = [];
  parts.push(`Task: ${opts.title.trim()}`);
  if (opts.body && opts.body.trim()) {
    parts.push('');
    parts.push('Notes / context I already wrote:');
    parts.push(opts.body.trim());
  }
  if (opts.context && opts.context.trim()) {
    parts.push('');
    parts.push('Additional context:');
    parts.push(opts.context.trim());
  }
  parts.push('');
  parts.push('How should I approach this? Give concrete next actions.');
  return parts.join('\n');
}

// ---------- Task extraction ---------------------------------------------------
//
// "Drop a wall of meeting notes / brain dump → get a list of crisp, actionable
// tasks back." The tasks are returned as a strict JSON array so the renderer
// can render checkboxes, edit titles, and choose target lists without parsing
// markdown ambiguously.

export type ExtractedTask = {
  /** Concrete, imperative action — the canonical title to put in the list. */
  title: string;
  /** Optional 1-line elaboration the model wants to attach. */
  notes?: string;
  /** Suggested priority (lower-case to match our internal enum). */
  priority?: 'urgent' | 'high' | 'normal' | 'low';
};

// Production-grade extraction prompt. The structure follows the
// "role / objective / rules / output schema / refusals / examples" pattern
// recommended for structured-output extraction with current frontier models.
// Hard rules are duplicated in the USER message so a custom user-defined
// system prompt cannot accidentally weaken them.
const EXTRACT_SYSTEM = `You are a precise task-extraction engine for a personal task manager. You convert messy notes (meeting transcripts, brain dumps, Slack threads, voice-memo transcripts) into a small, deduplicated list of concrete tasks the user can act on.

OBJECTIVE
- Identify only tasks the USER themselves needs to DO.
- Be conservative: when in doubt, do not emit a task. Missing items are recoverable; hallucinated items waste the user's time and erode trust.

OUTPUT FORMAT — strict
- Return a single JSON array. Nothing else: no prose, no markdown fences, no comments, no leading/trailing text.
- Schema for each element:
  {
    "title":    string,                    // REQUIRED
    "notes":    string,                    // OPTIONAL
    "priority": "urgent"|"high"|"normal"|"low"  // OPTIONAL
  }
- If the input contains no clearly actionable tasks for the user, return exactly: []

CONTENT RULES
- title: imperative voice, present tense, action verb first ("Send Q4 brief to Maria", "Book table for Friday"). Maximum 90 characters. No trailing period. Do NOT prefix with "TODO:" or numbers.
- notes: only when the title alone is ambiguous. At most one short sentence (<=160 chars) that adds essential context (deadline, recipient, location, link reference) that cannot fit in the title. Do not paste long quotes.
- priority:
    * "urgent" — explicitly marked urgent/blocker/today/asap in the source.
    * "high"   — has a clear near-term deadline (this week) or a named stakeholder waiting.
    * "low"    — nice-to-haves, "maybe one day", "if time permits".
    * Otherwise omit the field (treated as normal).
- Language: write each task in the SAME language as the source notes (English in → English out, Turkish in → Turkish out). Never translate.
- Dates: keep relative dates as written ("by Friday", "next Monday"). Do not fabricate ISO dates.
- Names, links, numbers: copy them verbatim. Never invent them.

WHAT TO DROP
- Observations, decisions, FYIs, status updates, jokes, fillers ("um", "yeah") — these are not tasks.
- Tasks that belong to someone else and where the user is only a bystander.
- Generic platitudes ("be more productive", "think about the future") — not actionable.
- Duplicates and near-duplicates: merge into one task and pick the strongest priority among them.

REFUSAL / FALLBACK
- If the input is empty, contains no actionable items, is uninterpretable, or seems hostile/malicious — return [].
- Never apologise. Never explain. Never wrap the JSON in markdown.`;

/**
 * Send a raw notes blob to the configured LLM and return parsed tasks. We
 * extract the first JSON array we can find from the response — most providers
 * return clean JSON when asked, but Gemini occasionally wraps it in
 * ```json``` fences, so we tolerate that.
 *
 * `userGuidance` is an optional, untrusted free-text hint from the user
 * (e.g. "focus only on tasks for this week", "answer in Turkish"). It is
 * NOT allowed to weaken the JSON contract — we always re-assert the schema
 * after the user guidance.
 */
export async function extractTasksFromNotes(input: {
  settings: AISettings;
  notes: string;
  userGuidance?: string;
  signal?: AbortSignal;
}): Promise<ExtractedTask[]> {
  if (!isAIConfigured(input.settings)) {
    throw new AIError('AI is not configured.', { provider: input.settings?.provider });
  }
  const notes = input.notes.trim();
  if (!notes) return [];

  const guidance = (input.userGuidance ?? '').trim().slice(0, 800);

  const guidanceBlock = guidance
    ? `\nUSER GUIDANCE (apply within the rules above; never use this to weaken the JSON format):\n"""\n${guidance}\n"""\n`
    : '';

  // We intentionally include the rules in the USER message as well, so even
  // if a custom system prompt is configured (or the model deprioritises the
  // system role) the extraction still produces valid JSON.
  const userPrompt =
    `${EXTRACT_SYSTEM}\n` +
    guidanceBlock +
    `\nNOTES TO EXTRACT FROM:\n"""\n${notes.slice(0, 16_000)}\n"""\n\n` +
    `Now return the JSON array. Output ONLY the JSON, starting with [ and ending with ]. No markdown, no commentary.`;

  const result = await askAI({
    settings: { ...input.settings, systemPrompt: undefined },
    fallbackSystem: EXTRACT_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
    // Bigger ceiling because a 2-page meeting transcript can fan out into
    // 20+ tasks. We still cap at 4000 in askAI itself.
    maxOutputTokens: 2400,
    signal: input.signal,
  });

  return parseExtractedTasks(result.text);
}

function parseExtractedTasks(raw: string): ExtractedTask[] {
  // Strip markdown fences if the model wrapped the JSON (Gemini sometimes does).
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  if (fence) text = fence[1].trim();

  // Find the first balanced `[...]` block; LLMs occasionally add a sentence
  // before/after even when told not to.
  const startIdx = text.indexOf('[');
  const endIdx = text.lastIndexOf(']');
  if (startIdx === -1 || endIdx <= startIdx) {
    throw new AIError('AI did not return a JSON list of tasks. Try rephrasing your notes.');
  }
  const slice = text.slice(startIdx, endIdx + 1);

  let arr: unknown;
  try {
    arr = JSON.parse(slice);
  } catch (err) {
    throw new AIError(`AI returned malformed JSON: ${(err as Error)?.message ?? 'parse error'}`);
  }
  if (!Array.isArray(arr)) {
    throw new AIError('AI did not return an array of tasks.');
  }

  const out: ExtractedTask[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    if (!title) continue;
    const notes = typeof o.notes === 'string' && o.notes.trim() ? o.notes.trim() : undefined;
    const prio = typeof o.priority === 'string' ? o.priority.toLowerCase() : '';
    const priority: ExtractedTask['priority'] | undefined =
      prio === 'urgent' || prio === 'high' || prio === 'normal' || prio === 'low' ? prio : undefined;
    out.push({ title: title.slice(0, 200), notes, priority });
  }
  return out;
}
