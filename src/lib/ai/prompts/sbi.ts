import type { FeedbackKind } from '../../../model';
import type { AiTask, ParseResult, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock, isBlankText, readJson } from './shared';

export type SbiInput = { text: string; kind?: FeedbackKind };
export type SbiOut = { situation: string; behavior: string; impact: string };

const MAX_TEXT_CHARS = 8_000;
const MAX_ELEMENT_CHARS = 400;
const KINDS = new Set<string>(['praise', 'coaching', 'concern']);

const SYSTEM = [
  'ROLE',
  'You rewrite one piece of workplace feedback in the Situation-Behavior-Impact (SBI) format, so it is specific, factual and easy to act on.',
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- Use only what the text states. Never add facts, names, dates, numbers, motives or judgements that are not in it.',
  '- situation: when and where it happened. behavior: what the person did or said, observable, without labels or character judgements. impact: the effect on you, the team or the work.',
  '- If the text does not state an element, return an empty string for it. Do not guess it.',
  '- Keep a neutral, respectful tone. Keep praise as praise and concerns as concerns; do not soften a concern into praise.',
  '- One or two short sentences per element, at most 400 characters each.',
  '- Use the same language as the text. Never translate.',
  '',
  'OUTPUT',
  'Return a single JSON object and nothing else: no prose, no markdown fences.',
  '{ "situation": string, "behavior": string, "impact": string }',
].join('\n');

const element = (v: unknown): string => (typeof v === 'string' && !isBlankText(v) ? clip(v.trim(), MAX_ELEMENT_CHARS) : '');

export const sbiTask: AiTask<SbiInput, SbiOut> = {
  id: 'ai.sbi',
  promptVersion: 1,
  dataClass: 'people',
  needsJson: true,
  allowsFocusNote: false,
  build(input): PromptParts {
    const kind = input.kind && KINDS.has(input.kind) ? input.kind : undefined;
    const user = [
      ...(kind ? [`Feedback type: ${kind}`] : []),
      dataBlock(clip(input.text.trim(), MAX_TEXT_CHARS)),
      'Return the JSON object now.',
    ].join('\n\n');
    return { system: SYSTEM, user, json: true, maxOutputTokens: 900 };
  },
  parse(reply): ParseResult<SbiOut> {
    const read = readJson(reply);
    if (!read.ok) return { ok: false, error: 'The reply was not valid JSON.' };
    const v = read.value;
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      return { ok: false, error: 'The reply must be a JSON object with situation, behavior and impact.' };
    }
    const o = v as Record<string, unknown>;
    const value = { situation: element(o.situation), behavior: element(o.behavior), impact: element(o.impact) };
    if (!value.behavior) return { ok: false, error: 'The reply did not state the behavior.' };
    return { ok: true, value };
  },
};

/** The rewritten feedback as inline text: one labelled line per element that was stated. */
export function sbiToText(out: SbiOut): string {
  return [
    out.situation && `Situation: ${out.situation}`,
    out.behavior && `Behavior: ${out.behavior}`,
    out.impact && `Impact: ${out.impact}`,
  ]
    .filter(Boolean)
    .join('\n');
}
