import type { AiTask, ParseResult, PromptParts } from '../types';
import type { CoachInput } from './coach';
import { DATA_RULE, clip, dataBlock, isBlankText, localDate, readJson } from './shared';

export type BreakdownInput = CoachInput;
export type BreakdownStep = { title: string; detail?: string };

const MAX_STEPS = 10;
const MAX_TITLE_CHARS = 90;
const MAX_DETAIL_CHARS = 160;

const SYSTEM = [
  'ROLE',
  'You split one task into small, concrete steps inside a personal task manager, so the person can start and finish it.',
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- 3 to 10 steps, in the order they should be done. Fewer steps is better when the task is small.',
  '- title: imperative voice, action verb first, at most 90 characters, no numbering, no trailing period.',
  '- detail: only when the title alone is ambiguous; one short sentence of at most 160 characters.',
  '- Treat the person\'s own details as the source of truth. If they name a stack, tools or constraints, plan around them.',
  '- Do not invent facts, names, dates or tools that are not in the data. Each step must be doable in one sitting.',
  '- Use the same language as the task text. Never translate.',
  '',
  'OUTPUT',
  'Return a single JSON object and nothing else: no prose, no markdown fences.',
  '{ "steps": [ { "title": string, "detail"?: string } ] }',
].join('\n');

export const breakdownTask: AiTask<BreakdownInput, BreakdownStep[]> = {
  id: 'ai.breakdown',
  promptVersion: 1,
  dataClass: 'content',
  needsJson: true,
  allowsFocusNote: false,
  build(input, ctx): PromptParts {
    // Only the date is the app's own text; the rest is the person's, so it stays in the data block.
    const context: string[] = [];
    if (input.listName) context.push(`List: ${input.listName}`);
    if (input.dueAt) context.push(`Due: ${input.dueAt}`);
    if (input.priority) context.push(`Priority: ${input.priority}`);
    if (input.linkedNoteTitle) context.push(`Linked note: ${input.linkedNoteTitle}`);
    const details = input.body?.trim() ? `\n\nDetails:\n${input.body.trim()}` : '';
    const user = [
      `Today: ${localDate(ctx)} (${ctx.timeZone})`,
      dataBlock([`Task: ${input.title.trim()}${details}`, ...context].join('\n')),
      'Return the JSON object now.',
    ].join('\n\n');
    return { system: SYSTEM, user, json: true, maxOutputTokens: 1600 };
  },
  parse(reply): ParseResult<BreakdownStep[]> {
    const read = readJson(reply);
    if (!read.ok) return { ok: false, error: 'The reply was not valid JSON.' };
    const v = read.value;
    const list = Array.isArray(v) ? v : v && typeof v === 'object' ? (v as { steps?: unknown }).steps : undefined;
    if (!Array.isArray(list)) return { ok: false, error: 'The reply did not contain a "steps" list.' };
    const steps: BreakdownStep[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      const o = typeof raw === 'string' ? { title: raw } : raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
      const rawTitle = o && typeof o.title === 'string' ? o.title.trim() : '';
      if (isBlankText(rawTitle)) continue;
      const title = clip(rawTitle, MAX_TITLE_CHARS);
      if (seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      const detail = o && typeof o.detail === 'string' ? clip(o.detail.trim(), MAX_DETAIL_CHARS) : '';
      steps.push(detail ? { title, detail } : { title });
      if (steps.length === MAX_STEPS) break;
    }
    return steps.length > 0 ? { ok: true, value: steps } : { ok: false, error: 'The reply had no usable steps.' };
  },
};
