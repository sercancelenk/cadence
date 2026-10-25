import type { AICapability, AISettings } from '../../model';
import { AIError, askAI } from '../ai';
import { readJson } from './prompts/shared';

const PROBE_SYSTEM = 'You answer with valid JSON only: no prose, no markdown.';
const PROBE_PROMPT = 'Return a JSON object with exactly one key, "ok", set to true.';

/**
 * - `ok`: it returned exactly `{ "ok": true }` (fences and surrounding prose are tolerated);
 * - `no-json`: it answered, but not with the JSON asked for;
 * - `unknown`: the request itself failed (rate limit, timeout, network, cancel), which says
 *   nothing about JSON, so the caller must not record it.
 */
export type JsonProbeResult = 'ok' | 'no-json' | 'unknown';

/** Asks the connection for a tiny JSON object. Never throws. */
export async function probeJsonCapability(settings: AISettings, signal?: AbortSignal): Promise<JsonProbeResult> {
  try {
    // A stored systemPrompt must not change what is being measured.
    const { systemPrompt: _ignored, ...clean } = settings;
    const reply = await askAI({
      settings: clean as AISettings,
      fallbackSystem: PROBE_SYSTEM,
      messages: [{ role: 'user', content: PROBE_PROMPT }],
      // Newer models can spend part of the limit on hidden reasoning.
      maxOutputTokens: 256,
      responseFormat: 'json',
      dataClass: 'content',
      signal,
    });
    const read = readJson(reply.text);
    const good = read.ok && !!read.value && typeof read.value === 'object' && (read.value as { ok?: unknown }).ok === true;
    return good ? 'ok' : 'no-json';
  } catch {
    return 'unknown';
  }
}

const ORDER: AICapability[] = ['json', 'vision', 'streaming'];

/** Applies probe results to a capability list; only the capabilities named are changed. */
export function mergeCapabilities(
  current: AICapability[] | undefined,
  probed: { json?: boolean; vision?: boolean; streaming?: boolean },
): AICapability[] {
  const set = new Set(current ?? []);
  for (const key of ['json', 'vision', 'streaming'] as const) {
    if (probed[key] === true) set.add(key);
    else if (probed[key] === false) set.delete(key);
  }
  return ORDER.filter((c) => set.has(c));
}

/** The result of checking one capability: it works, it does not, or the check could not tell. */
export type CapabilityProbeResult = 'ok' | 'no' | 'unknown';

/** A solid red 16x16 PNG, used to ask a model what colour it sees. */
const RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4IyJCEmIY1TCqYfhqAAACcQQQFwFJQgAAAABJRU5ErkJggg==';

/** Statuses a provider uses to say "I will not take this input" (as opposed to key, quota or outage problems). */
const REJECTED_INPUT = new Set([400, 415, 422]);

/**
 * Asks the connection what colour a tiny image is. `ok` only when it names red; a provider that
 * refuses the image is `no`; a failed request (key, quota, network) says nothing, so `unknown`.
 */
export async function probeVisionCapability(settings: AISettings, signal?: AbortSignal): Promise<CapabilityProbeResult> {
  try {
    const { systemPrompt: _ignored, ...clean } = settings;
    const reply = await askAI({
      settings: clean as AISettings,
      fallbackSystem: 'You describe images in as few words as possible.',
      messages: [
        {
          role: 'user',
          content: 'What colour is this image? Answer with one word.',
          images: [{ mediaType: 'image/png', base64: RED_PNG }],
        },
      ],
      maxOutputTokens: 256,
      dataClass: 'content',
      signal,
    });
    return /\bred\b/i.test(reply.text) ? 'ok' : 'no';
  } catch (err) {
    return err instanceof AIError && err.status !== undefined && REJECTED_INPUT.has(err.status) ? 'no' : 'unknown';
  }
}

/** Asks for a short count and watches whether the text arrives in several steps. */
export async function probeStreamingCapability(settings: AISettings, signal?: AbortSignal): Promise<CapabilityProbeResult> {
  try {
    const { systemPrompt: _ignored, ...clean } = settings;
    let updates = 0;
    await askAI({
      settings: clean as AISettings,
      fallbackSystem: 'Follow the instruction exactly.',
      messages: [{ role: 'user', content: 'Count from 1 to 20, separated by spaces, with no other text.' }],
      maxOutputTokens: 256,
      dataClass: 'content',
      signal,
      onText: () => {
        updates += 1;
      },
    });
    return updates >= 2 ? 'ok' : 'no';
  } catch {
    return 'unknown';
  }
}
