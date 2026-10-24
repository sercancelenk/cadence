import type { AICapability, AISettings } from '../../model';
import { askAI } from '../ai';
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

/** Applies a probe result to a capability list; the probe only decides `json`. */
export function mergeCapabilities(
  current: AICapability[] | undefined,
  probed: { json: boolean },
): AICapability[] {
  const set = new Set(current ?? []);
  if (probed.json) set.add('json');
  else set.delete('json');
  return ORDER.filter((c) => set.has(c));
}
