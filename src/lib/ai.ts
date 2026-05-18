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
