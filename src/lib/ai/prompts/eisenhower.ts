import type { AiTask, ParseResult, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock, isBlankText, localDate, readJson } from './shared';

export type EisenhowerTaskInput = {
  id: string;
  title: string;
  body?: string;
  due?: string;
  priority?: string;
  list?: string;
  /** Notes the task is linked to: a title and the start of the text. */
  notes?: { title: string; text: string }[];
};

export type EisenhowerInput = { tasks: EisenhowerTaskInput[] };
export type EisenhowerItem = { id: string; important: boolean; urgent: boolean; reason?: string };

const MAX_TASKS = 40;
const MAX_BODY_CHARS = 500;
const MAX_NOTE_CHARS = 400;
const MAX_NOTES_PER_TASK = 2;
const MAX_REASON_CHARS = 120;

const SYSTEM = [
  'ROLE',
  'You help one person sort their open tasks on an Eisenhower matrix. For each task you judge two things, is it important and is it urgent, which places it in one of four quadrants:',
  '- Do first: important and urgent.',
  '- Schedule: important, not urgent. Plan it for later.',
  '- Delegate: urgent, not important for this person. Someone else could do it, or it is routine pressure from others.',
  '- Eliminate: neither. It can wait indefinitely or be dropped.',
  '',
  'HOW TO JUDGE',
  '- Read everything given for a task: the title, the details, and any linked note (the note is background the person kept for this task).',
  '- important: it moves a real goal or commitment forward, protects people, money, quality or health, or something the person cares about suffers without it. A high priority label points towards important. Busywork, nice-to-haves and things nobody is waiting for are not important.',
  '- urgent: time pressure is real now. That means overdue, due today or within about three days (the due line already says how many days), or the text says someone is waiting, something is blocked, or it is needed today or ASAP. A distant due date, or no date and no pressure, is not urgent.',
  '- Use all four quadrants where the data supports it. Do not put every task in the same one, and do not leave a task in Eliminate just because its text is short: judge a clear title on its own.',
  '- Delegate fits when the task is urgent but routine, or the text hints it could go to someone else ("ask", "have X do", "waiting for X to").',
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- Judge only from the data. Do not invent deadlines, people or stakes. When there is truly nothing to go on, answer important=false and urgent=false.',
  '- Answer for every task, using only the ids given. Never add an id that was not listed.',
  '- reason: one short sentence, at most 120 characters, in the same language as the task. Say what decided it (the deadline, who is waiting, what the note says). Write it before the verdict.',
  '',
  'OUTPUT',
  'Return a single JSON object and nothing else: no prose, no markdown fences.',
  '{ "items": [ { "id": string, "reason": string, "important": boolean, "urgent": boolean } ] }',
].join('\n');

/** "in 3 days", "today", "overdue by 2 days": worked out here so the model never does date arithmetic. */
function dueNote(due: string, today: string): string {
  const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  if (!/^\d{4}-\d{2}-\d{2}/.test(due) || !/^\d{4}-\d{2}-\d{2}/.test(today)) return '';
  const diff = Math.round((day(due) - day(today)) / 86_400_000);
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
  if (diff === 0) return ' (today)';
  return diff > 0 ? ` (in ${days(diff)})` : ` (overdue by ${days(-diff)})`;
}

export const eisenhowerTask: AiTask<EisenhowerInput, EisenhowerItem[]> = {
  id: 'ai.eisenhower',
  promptVersion: 2,
  dataClass: 'content',
  needsJson: true,
  allowsFocusNote: false,
  build(input, ctx): PromptParts {
    const today = localDate(ctx);
    const blocks = input.tasks.slice(0, MAX_TASKS).map((t) =>
      [
        `id: ${t.id}`,
        `title: ${t.title.trim()}`,
        ...(t.due ? [`due: ${t.due}${dueNote(t.due, today)}`] : []),
        ...(t.priority ? [`priority: ${t.priority}`] : []),
        ...(t.list ? [`list: ${t.list}`] : []),
        ...(t.body?.trim() ? [`details: ${clip(t.body.trim().replace(/\s+/g, ' '), MAX_BODY_CHARS)}`] : []),
        ...(t.notes ?? [])
          .slice(0, MAX_NOTES_PER_TASK)
          .map((n) => `linked note: ${clip(n.title.trim().replace(/\s+/g, ' '), 80)}${n.text.trim() ? ` — ${clip(n.text.trim().replace(/\s+/g, ' '), MAX_NOTE_CHARS)}` : ''}`),
      ].join('\n'),
    );
    const user = [
      `Today: ${today} (${ctx.timeZone})`,
      dataBlock(blocks.join('\n\n')),
      'Return the JSON object now.',
    ].join('\n\n');
    return { system: SYSTEM, user, json: true, maxOutputTokens: 4500 };
  },
  parse(reply): ParseResult<EisenhowerItem[]> {
    const read = readJson(reply);
    if (!read.ok) return { ok: false, error: 'The reply was not valid JSON.' };
    const v = read.value;
    const list = Array.isArray(v) ? v : v && typeof v === 'object' ? (v as { items?: unknown }).items : undefined;
    if (!Array.isArray(list)) return { ok: false, error: 'The reply did not contain an "items" list.' };
    const out: EisenhowerItem[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id.trim() : '';
      if (!id || seen.has(id) || typeof o.important !== 'boolean' || typeof o.urgent !== 'boolean') continue;
      seen.add(id);
      const reason = typeof o.reason === 'string' && !isBlankText(o.reason) ? clip(o.reason.trim(), MAX_REASON_CHARS) : '';
      out.push({ id, important: o.important, urgent: o.urgent, ...(reason ? { reason } : {}) });
      if (out.length === MAX_TASKS) break;
    }
    return out.length > 0 ? { ok: true, value: out } : { ok: false, error: 'The reply had no usable items.' };
  },
};
