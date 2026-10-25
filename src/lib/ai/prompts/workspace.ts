import type { Source } from '../retrieve';
import type { AiTask, ParseResult, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock, isBlankText } from './shared';

export type WorkspaceInput = { question: string; sources: Source[] };

const MAX_QUESTION_CHARS = 1_000;
const MAX_SOURCES = 12;
const MAX_REPLY_CHARS = 8_000;

const SYSTEM = [
  'ROLE',
  "You answer a question using only the user's own notes and tasks, which are given as numbered sources.",
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- Answer only from the numbered sources. Do not use outside knowledge and do not guess.',
  '- After each statement that comes from a source, cite it as [1], [2] with the source number. Cite only numbers that exist in the data.',
  '- If the sources do not contain the answer, say clearly that it was not found in the notes and tasks, and name what is missing. Do not make something up.',
  '- Be brief and concrete. Use the same language as the question. Never translate.',
  '- Reply with plain text or short Markdown only. No preamble.',
].join('\n');

const label = (s: Source) => `[${s.n}] ${clip(s.title.replace(/\s+/g, ' ').trim(), 120)} (${s.kind})`;

/** "Ask your workspace": an answer from retrieved notes and tasks, with numbered citations. */
export const workspaceTask: AiTask<WorkspaceInput, string> = {
  id: 'ai.workspace',
  promptVersion: 1,
  dataClass: 'content',
  needsJson: false,
  allowsFocusNote: false,
  build(input): PromptParts {
    const sources = input.sources.slice(0, MAX_SOURCES).map((s) => `${label(s)}\n${s.snippet}`);
    const data = [`QUESTION\n${clip(input.question.trim(), MAX_QUESTION_CHARS)}`, 'SOURCES', ...(sources.length ? sources : ['(none)'])].join('\n\n');
    return { system: SYSTEM, user: [dataBlock(data), 'Answer the question now.'].join('\n\n'), json: false, maxOutputTokens: 1200 };
  },
  parse(reply: string): ParseResult<string> {
    const fenced = reply.trim().match(/^```(?:markdown|md)?[^\n]*\n([\s\S]*?)\n?```$/i);
    const text = (fenced ? fenced[1] : reply).trim();
    if (isBlankText(text)) return { ok: false, error: 'The reply was empty.' };
    if (/<\s*(?:script|iframe|object|embed|style|link)\b|javascript:/i.test(text)) {
      return { ok: false, error: 'HTML and script content are not allowed.' };
    }
    return { ok: true, value: clip(text, MAX_REPLY_CHARS) };
  },
};
