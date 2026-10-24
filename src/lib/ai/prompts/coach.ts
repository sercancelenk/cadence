import { wrapFocusNote } from '../focusNote';
import type { AiTask, PromptContext, PromptParts } from '../types';
import { DATA_RULE, dataBlock, localDate } from './shared';

export type CoachInput = {
  title: string;
  body?: string;
  listName?: string;
  dueAt?: string;
  priority?: string;
  linkedNoteTitle?: string;
};

type Lens = 'plan' | 'risks' | 'first15';

const LENS_FORMAT: Record<Lens, string> = {
  plan: [
    'FORMAT',
    '- 1 or 2 sentences framing what the task really needs.',
    '- 3 to 5 concrete next actions, ordered by leverage.',
    '- 1 risk or common mistake to avoid.',
    '- Optionally, a final line offering to go deeper where the topic has obvious follow-ups.',
  ].join('\n'),
  risks: [
    'FORMAT',
    '- 3 to 5 risks, bottlenecks or edge cases that are easy to miss for this task.',
    '- For each: why it matters and one quick way to check it.',
    '- End with the one decision to settle first.',
  ].join('\n'),
  first15: [
    'FORMAT',
    '- Exactly what to do in the first 15 minutes, as 3 to 5 small steps.',
    '- Then one sentence on what "done for now" looks like.',
  ].join('\n'),
};

function lensOf(ctx: PromptContext): Lens {
  const lens = ctx.options.lens;
  return lens === 'risks' || lens === 'first15' ? lens : 'plan';
}

const SYSTEM_HEAD = [
  'ROLE',
  'You are the planning coach inside Cadence, a personal task and notes app. You help one person move a single task forward.',
  '',
  'OBJECTIVE',
  'Give practical help for the task in the data block.',
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- Treat the user\'s own notes as the source of truth. If they name a stack, tools or constraints, plan around them and never propose alternatives unless asked.',
  '- Reply in the same language as the task text.',
  '- Do not invent facts, names, dates or tools that are not in the data.',
  '- Aim for about 250 words. Never stop mid-sentence: if you are near your budget, wrap up cleanly.',
  '- Plain Markdown. Start with the answer, no filler or praise.',
  '',
].join('\n');

export const coachTask: AiTask<CoachInput, string> = {
  id: 'ai.coach',
  promptVersion: 1,
  dataClass: 'content',
  needsJson: false,
  allowsFocusNote: true,
  build(input, ctx): PromptParts {
    // Only the date is the app's own text. List, linked note title and the rest are the user's, so
    // they travel inside the data block with the task.
    const context: string[] = [];
    if (input.listName) context.push(`List: ${input.listName}`);
    if (input.dueAt) context.push(`Due: ${input.dueAt}`);
    if (input.priority) context.push(`Priority: ${input.priority}`);
    if (input.linkedNoteTitle) context.push(`Linked note: ${input.linkedNoteTitle}`);
    const details = input.body?.trim() ? `\n\nDetails:\n${input.body.trim()}` : '';
    const parts = [
      `Today: ${localDate(ctx)} (${ctx.timeZone})`,
      dataBlock([`Task: ${input.title.trim()}${details}`, ...context].join('\n')),
      'How should I approach this?',
    ];
    const focus = wrapFocusNote(ctx.focusNote ?? '');
    if (focus) parts.push(focus);
    return {
      system: `${SYSTEM_HEAD}${LENS_FORMAT[lensOf(ctx)]}`,
      user: parts.join('\n\n'),
      json: false,
      maxOutputTokens: 4000,
    };
  },
  parse(reply) {
    const text = reply.trim();
    return text ? { ok: true, value: text } : { ok: false, error: 'The reply was empty.' };
  },
};
