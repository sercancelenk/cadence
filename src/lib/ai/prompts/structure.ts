import type { AiTask, ParseResult, PromptContext, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock, isBlankText, readJson } from './shared';

export type StructureInput = { text: string };
export type StructureKind = 'outline' | 'rfc' | 'meeting' | 'table';
export type StructureOut = {
  title: string;
  sections: { heading: string; items: string[] }[];
  /** Only for kind `table`; then `sections` is empty. */
  table?: { columns: string[]; rows: string[][] };
};

const KINDS: readonly StructureKind[] = ['outline', 'rfc', 'meeting', 'table'];
const kindOf = (ctx?: PromptContext): StructureKind => {
  const k = ctx?.options.kind;
  return KINDS.find((v) => v === k) ?? 'outline';
};

const MAX_TEXT_CHARS = 16_000;
const MAX_SECTIONS = 12;
const MAX_ITEMS = 20;
const MAX_ITEM_CHARS = 300;
const MAX_HEADING_CHARS = 80;
const MAX_COLUMNS = 8;
const MAX_ROWS = 40;
const MAX_CELL_CHARS = 200;

const RULES = [
  'RULES',
  `- ${DATA_RULE}`,
  '- Keep every detail of the text: names, numbers, links, dates, open questions. Nothing may be dropped or invented. Merge duplicates only when they say the same thing.',
  '- Group related things under a short, plain heading. Put what fits nowhere under a section called "Other".',
  '- Items are short statements, one idea each, at most 300 characters. Keep the author\'s wording where you can.',
  '- At most 12 sections and 20 items per section.',
  '- Use the same language as the text. Never translate.',
];

const SECTIONS_OUTPUT = [
  'OUTPUT',
  'Return a single JSON object and nothing else: no prose, no markdown fences.',
  '{ "title": string, "sections": [ { "heading": string, "items": string[] } ] }',
];

const OUTLINE = [
  'ROLE',
  'You tidy a rough scratch document into a clear structure: a title, sections with headings, and short items under each. You organize; you do not add.',
  '',
  ...RULES,
  '',
  ...SECTIONS_OUTPUT,
].join('\n');

const RFC = [
  'ROLE',
  'You turn a rough scratch document into the skeleton of a short RFC (a design proposal): a title and these sections, in this order: "Context", "Proposal", "Alternatives", "Risks", "Open questions".',
  '',
  ...RULES,
  '- Fill each section only from what the text says. Never invent a decision, an alternative or a risk the text does not contain. A section the text says nothing about is left out entirely.',
  '',
  ...SECTIONS_OUTPUT,
].join('\n');

const MEETING = [
  'ROLE',
  'You turn rough meeting notes into a meeting summary: a title and these sections, in this order: "Summary", "Decisions", "Action items".',
  '',
  ...RULES,
  '- Decisions are only what the text says was decided. Action items are only tasks the text names; put the owner and the date in the item when the text gives them ("Ann: send the draft by Friday"), never guess an owner.',
  '- If the text names no decisions or no actions, leave the section out. Do not invent any.',
  '',
  ...SECTIONS_OUTPUT,
].join('\n');

const TABLE = [
  'ROLE',
  'You turn a rough scratch document into one table: a title, column names, and one row per item.',
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- Choose the columns the text itself suggests (for example Task, Owner, Due). At most 8 columns and 40 rows.',
  '- Every cell comes from the text. Leave a cell empty ("") when the text does not say; never guess. Cells are short, at most 200 characters.',
  '- Use the same language as the text. Never translate.',
  '',
  'OUTPUT',
  'Return a single JSON object and nothing else: no prose, no markdown fences.',
  '{ "title": string, "columns": string[], "rows": string[][] }',
].join('\n');

const SYSTEMS: Record<StructureKind, string> = { outline: OUTLINE, rfc: RFC, meeting: MEETING, table: TABLE };

const cleanText = (v: unknown, max: number): string =>
  typeof v === 'string' && !isBlankText(v) ? clip(v.trim().replace(/\s+/g, ' '), max) : '';

function parseTable(o: Record<string, unknown>): ParseResult<StructureOut> {
  const named = (Array.isArray(o.columns) ? o.columns : [])
    .map((c) => cleanText(c, MAX_CELL_CHARS))
    .slice(0, MAX_COLUMNS);
  if (named.length === 0 || named.every((c) => c === '')) return { ok: false, error: 'The reply had no columns.' };
  // A column the model left unnamed still gets a header, so the table never has an empty one.
  const columns = named.map((c, i) => c || `Column ${i + 1}`);
  const rows: string[][] = [];
  for (const raw of Array.isArray(o.rows) ? o.rows : []) {
    if (rows.length === MAX_ROWS) break;
    if (!Array.isArray(raw)) continue;
    const cells = columns.map((_, i) => cleanText(raw[i], MAX_CELL_CHARS));
    if (cells.every((c) => c === '')) continue;
    rows.push(cells);
  }
  if (rows.length === 0) return { ok: false, error: 'The reply had no rows.' };
  return { ok: true, value: { title: cleanText(o.title, MAX_HEADING_CHARS) || 'Table', sections: [], table: { columns, rows } } };
}

export const structureTask: AiTask<StructureInput, StructureOut> = {
  id: 'ai.structure',
  promptVersion: 2,
  dataClass: 'content',
  needsJson: true,
  allowsFocusNote: false,
  build(input, ctx): PromptParts {
    const user = [dataBlock(clip(input.text.trim(), MAX_TEXT_CHARS)), 'Return the JSON object now.'].join('\n\n');
    return { system: SYSTEMS[kindOf(ctx)], user, json: true, maxOutputTokens: 3000 };
  },
  parse(reply, ctx): ParseResult<StructureOut> {
    const read = readJson(reply);
    if (!read.ok) return { ok: false, error: 'The reply was not valid JSON.' };
    const v = read.value;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'The reply must be a JSON object.' };
    const o = v as Record<string, unknown>;
    if (kindOf(ctx) === 'table') return parseTable(o);
    if (!Array.isArray(o.sections)) return { ok: false, error: 'The reply did not contain a "sections" list.' };
    const sections: StructureOut['sections'] = [];
    for (const raw of o.sections) {
      if (sections.length === MAX_SECTIONS) break;
      if (!raw || typeof raw !== 'object') continue;
      const s = raw as Record<string, unknown>;
      const items = (Array.isArray(s.items) ? s.items : [])
        .map((i) => cleanText(i, MAX_ITEM_CHARS))
        .filter(Boolean)
        .slice(0, MAX_ITEMS);
      if (items.length === 0) continue;
      sections.push({ heading: cleanText(s.heading, MAX_HEADING_CHARS) || 'Notes', items });
    }
    if (sections.length === 0) return { ok: false, error: 'The reply had no section with items.' };
    return { ok: true, value: { title: cleanText(o.title, MAX_HEADING_CHARS) || 'Structured notes', sections } };
  },
};
