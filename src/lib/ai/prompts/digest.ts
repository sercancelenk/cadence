import type { AiTask, ParseResult, PromptContext, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock, isBlankText } from './shared';

export type DigestInput = {
  /** Counts and titles from `describeActivity`. */
  activity: string;
  /** Notes the user chose to include, with their text. */
  notes?: { title: string; text: string }[];
};

const MAX_ACTIVITY_CHARS = 8_000;
const MAX_NOTES = 5;
const MAX_NOTE_CHARS = 1_500;
const MAX_REPLY_CHARS = 12_000;

const RETRO = [
  'Write a short personal retrospective for the person who did this work: what moved, what is stuck or late, and what to carry into next week.',
  'Use these Markdown sections, leaving out any that have nothing to say: "## Done", "## In progress", "## Overdue", "## Carry into next week", "## Next week\'s opportunities".',
  'Next week\'s opportunities: only what the data supports, such as work that is nearly finished, overdue items worth unblocking, or a note that points to a next step. Do not invent an opportunity; leave the section out when the data gives none.',
].join('\n');

const UPWARD = [
  'Write a short status update that this person can send upward to a manager or stakeholders: outcomes first, then what is at risk, then what is next.',
  'Use these Markdown sections, leaving out any that have nothing to say: "## Highlights", "## At risk", "## Next".',
  'Keep a neutral, professional tone. Mention counts only where the data gives them.',
].join('\n');

function systemFor(mode: 'retro' | 'upward'): string {
  return [
    'ROLE',
    'You summarise a week of work for one person inside a notes and tasks app.',
    '',
    'RULES',
    `- ${DATA_RULE}`,
    '- The data is a list of counts and titles, and sometimes the text of a few notes. Use only what it says. Do not invent tasks, results, reasons, people or dates, and do not guess what a title means beyond its words.',
    '- Do not add numbers that are not in the data.',
    '- Use the same language as the titles. Never translate.',
    '- Reply with Markdown only: short sections and bullet points, no preamble, no sign-off.',
    '',
    mode === 'upward' ? UPWARD : RETRO,
  ].join('\n');
}

function stripFence(reply: string): string {
  const m = reply.trim().match(/^```(?:markdown|md)?[^\n]*\n([\s\S]*?)\n?```$/i);
  return (m ? m[1] : reply).trim();
}

export const digestTask: AiTask<DigestInput, string> = {
  id: 'ai.digest',
  promptVersion: 2,
  dataClass: 'content',
  needsJson: false,
  allowsFocusNote: false,
  build(input, ctx: PromptContext): PromptParts {
    const mode = ctx.options.mode === 'upward' ? 'upward' : 'retro';
    const notes = (input.notes ?? []).slice(0, MAX_NOTES).map((n) => `Note: ${clip(n.title, 120)}\n${clip(n.text.trim(), MAX_NOTE_CHARS)}`);
    const data = [clip(input.activity, MAX_ACTIVITY_CHARS), ...notes].join('\n\n');
    return {
      system: systemFor(mode),
      user: [dataBlock(data), 'Write the summary now.'].join('\n\n'),
      json: false,
      maxOutputTokens: 1500,
    };
  },
  parse(reply: string): ParseResult<string> {
    if (reply.length > MAX_REPLY_CHARS * 2) return { ok: false, error: 'The summary was too long.' };
    const text = stripFence(reply);
    if (isBlankText(text)) return { ok: false, error: 'The reply was empty.' };
    if (/<\s*(?:script|iframe|object|embed|style|link)\b|javascript:/i.test(text)) {
      return { ok: false, error: 'HTML and script content are not allowed.' };
    }
    return { ok: true, value: clip(text, MAX_REPLY_CHARS) };
  },
};
