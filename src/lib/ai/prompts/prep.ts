import type { AiTask, ParseResult, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock, isBlankText, readJson } from './shared';

export type PrepInput = { context: string };
export type PrepOut = {
  followUps: string[];
  openGoals: string[];
  feedbackToGive: string[];
  questions: string[];
};

const MAX_CONTEXT_CHARS = 12_000;
const MAX_ITEMS = 8;
const MAX_ITEM_CHARS = 240;
const KEYS = ['followUps', 'openGoals', 'feedbackToGive', 'questions'] as const;

const SYSTEM = [
  'ROLE',
  'You help a manager prepare for a 1:1 meeting with one person. You read what the manager has recorded about that person and suggest what to bring up.',
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- Ground every point in the recorded items. Do not invent events, results, feelings, performance claims or facts about the person. If there is little to go on, return fewer points, not made-up ones.',
  '- followUps: open tasks or earlier commitments worth asking about. openGoals: goals that are not finished and where they stand, from the data. feedbackToGive: recognition or constructive points the recorded items support. questions: open questions to ask the person.',
  '- At most 8 points per list, each one sentence of at most 240 characters. Be specific and kind; no platitudes.',
  '- Refer to the person as "they". Never guess a name or a gender.',
  '- Use the same language as the recorded items. Never translate.',
  '',
  'OUTPUT',
  'Return a single JSON object and nothing else: no prose, no markdown fences.',
  '{ "followUps": string[], "openGoals": string[], "feedbackToGive": string[], "questions": string[] }',
  'Use an empty list for a section with nothing to say.',
].join('\n');

function cleanList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (t && !isBlankText(t)) out.push(clip(t, MAX_ITEM_CHARS));
    if (out.length === MAX_ITEMS) break;
  }
  return out;
}

/** "Prepare a 1:1": follow-ups, open goals, feedback to give and questions, from one person's records. */
export const prepTask: AiTask<PrepInput, PrepOut> = {
  id: 'ai.prep',
  promptVersion: 1,
  dataClass: 'people',
  needsJson: true,
  allowsFocusNote: false,
  build(input): PromptParts {
    const user = [dataBlock(clip(input.context.trim(), MAX_CONTEXT_CHARS)), 'Return the JSON object now.'].join('\n\n');
    return { system: SYSTEM, user, json: true, maxOutputTokens: 1800 };
  },
  parse(reply): ParseResult<PrepOut> {
    const read = readJson(reply);
    if (!read.ok) return { ok: false, error: 'The reply was not valid JSON.' };
    const v = read.value;
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      return { ok: false, error: 'The reply must be a JSON object with followUps, openGoals, feedbackToGive and questions.' };
    }
    const o = v as Record<string, unknown>;
    const value: PrepOut = {
      followUps: cleanList(o.followUps),
      openGoals: cleanList(o.openGoals),
      feedbackToGive: cleanList(o.feedbackToGive),
      questions: cleanList(o.questions),
    };
    if (KEYS.every((k) => value[k].length === 0)) return { ok: false, error: 'The reply had no points in any list.' };
    return { ok: true, value };
  },
};
