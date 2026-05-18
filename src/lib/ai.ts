import type { AIProvider, AISettings } from '../model';
import { AI_PROVIDER_OPTIONS } from '../model';

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

export class AIError extends Error {
  status?: number;
  provider?: AIProvider;
  constructor(message: string, opts: { status?: number; provider?: AIProvider; cause?: unknown } = {}) {
    super(message);
    this.name = 'AIError';
    this.status = opts.status;
    this.provider = opts.provider;
    if (opts.cause !== undefined) (this as unknown as { cause?: unknown }).cause = opts.cause;
  }
}

export function defaultModel(provider: AIProvider): string {
  return AI_PROVIDER_OPTIONS.find((p) => p.value === provider)?.defaultModel ?? '';
}

export function isAIConfigured(
  s: AISettings | undefined,
): s is AISettings & { provider: AIProvider; apiKey: string } {
  return !!s?.provider && !!s.apiKey;
}

const DEFAULT_SYSTEM = `You are an embedded coaching assistant inside a personal task manager called Leeadman.
The user will share a single task they are trying to make progress on. Reply with:
- a 1–2 sentence framing of what the task really needs,
- 3 to 5 concrete next actions, ordered by leverage,
- 1 risk / common mistake to avoid.
Keep the whole answer under 200 words. Use plain Markdown.`;

export async function askAI(input: AskAIInput): Promise<string> {
  const { settings, messages } = input;
  if (!isAIConfigured(settings)) {
    throw new AIError('AI is not configured. Add a provider and API key in Settings.', {
      provider: settings?.provider,
    });
  }
  if (messages.length === 0) {
    throw new AIError('Nothing to ask — the conversation is empty.', { provider: settings.provider });
  }
  const { provider, apiKey } = settings;
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

async function callAnthropic({ apiKey, model, system, messages, maxTokens, signal }: ProviderArgs): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Anthropic requires this opt-in to allow direct browser calls.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      system,
      max_tokens: maxTokens,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw await providerError('anthropic', res);
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (json.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!)
    .join('\n')
    .trim();
  if (!text) throw new AIError('Anthropic returned an empty response.', { provider: 'anthropic' });
  return text;
}

async function callOpenAI({ apiKey, model, system, messages, maxTokens, signal }: ProviderArgs): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });
  if (!res.ok) throw await providerError('openai', res);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = (json.choices?.[0]?.message?.content ?? '').trim();
  if (!text) throw new AIError('OpenAI returned an empty response.', { provider: 'openai' });
  return text;
}

async function callGemini({ apiKey, model, system, messages, maxTokens, signal }: ProviderArgs): Promise<string> {
  // Gemini doesn't have an explicit "system" role at the top level; it uses
  // `systemInstruction`. We put user/assistant turns in `contents`.
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { role: 'system', parts: [{ text: system }] },
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 },
      contents,
    }),
  });
  if (!res.ok) {
    // Google retired the Gemini 1.x family from `v1beta` in late 2025. If the
    // user is still pointing at one of those, return a targeted error so they
    // know the fix is a model rename rather than something with their key.
    if (res.status === 404 && /^gemini-1\.[05]/i.test(model)) {
      throw new AIError(
        `The model "${model}" is no longer served by Google's Gemini API (Gemini 1.x was retired). ` +
          `Open Settings → AI Assistant and switch to "gemini-2.0-flash" (recommended) or any of the gemini-2.x / 2.5 models.`,
        { status: 404, provider: 'gemini' },
      );
    }
    throw await providerError('gemini', res);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  if (!text) throw new AIError('Gemini returned an empty response.', { provider: 'gemini' });
  return text;
}

async function providerError(provider: AIProvider, res: Response): Promise<AIError> {
  let raw = '';
  try {
    raw = await res.text();
  } catch {
    raw = '';
  }
  let detail = raw;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const inner = (j.error as { message?: string } | undefined)?.message;
    if (typeof inner === 'string' && inner.trim()) detail = inner;
  } catch {
    // raw stays as-is
  }
  const friendly = friendlyStatus(res.status, provider);
  const message = `${friendly} ${detail ? `— ${truncate(detail, 320)}` : ''}`.trim();
  return new AIError(message, { status: res.status, provider });
}

function friendlyStatus(status: number, provider: AIProvider): string {
  const name =
    provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'OpenAI' : 'Gemini';
  if (status === 401 || status === 403) return `${name} rejected the API key (HTTP ${status}).`;
  if (status === 404) return `${name} could not find that model (HTTP 404). Check the model name in Settings.`;
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

  const raw = await askAI({
    settings: { ...input.settings, systemPrompt: undefined },
    fallbackSystem: EXTRACT_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
    // Bigger ceiling because a 2-page meeting transcript can fan out into
    // 20+ tasks. We still cap at 4000 in askAI itself.
    maxOutputTokens: 2400,
    signal: input.signal,
  });

  return parseExtractedTasks(raw);
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
