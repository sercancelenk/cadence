import { ERD_COLUMN_TYPES, type ErdColumnType } from '../../erd/erdModel';
import type { ErdProposal } from '../erdAi';
import type { AiTask, ParseResult, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock, readJson } from './shared';

export type ErdInput = { request: string; current: string };

const MAX_REQUEST_CHARS = 4_000;
const MAX_CURRENT_CHARS = 3_000;
const MAX_TABLES = 20;
const MAX_COLUMNS = 30;
const MAX_RELATIONS = 40;
const MAX_NAME = 40;

const SYSTEM = [
  'ROLE',
  'You design and extend database schemas for a small entity-relationship diagram tool. The user describes tables and relations in words; you answer with the schema they should end up with.',
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- The data holds the current diagram and the request. Keep every existing table and column exactly as it is (same names), and add what the request needs. Return the whole resulting schema: the existing tables plus the new ones.',
  `- Column types must be one of: ${ERD_COLUMN_TYPES.join(', ')}.`,
  '- Names are lower snake_case, letters, digits and underscores only. Every new table gets an "id" column of type uuid with pk true. A foreign key column is named after the table it points to, ending in _id, and has the same type as the column it points to.',
  '- Add a relation for every foreign key: from the column that holds the key to the column it references.',
  '- At most 20 tables, 30 columns per table and 40 relations. Keep it simple: model what is asked, not more.',
  '- Use the same language as the request for nothing but names; names stay in English snake_case.',
  '',
  'OUTPUT',
  'Return a single JSON object and nothing else: no prose, no markdown fences.',
  '{ "tables": [ { "name": string, "columns": [ { "name": string, "type": string, "pk"?: boolean } ] } ], "relations": [ { "from": { "table": string, "column": string }, "to": { "table": string, "column": string } } ] }',
].join('\n');

const TYPE_ALIASES: Record<string, ErdColumnType> = {
  integer: 'int', smallint: 'int', serial: 'int', bigserial: 'bigint', float: 'decimal', double: 'decimal',
  real: 'decimal', numeric: 'decimal', number: 'decimal', money: 'decimal', bool: 'boolean', datetime: 'timestamp',
  timestamptz: 'timestamp', jsonb: 'json', guid: 'uuid', varchar: 'string', char: 'string', nvarchar: 'string',
};

function columnType(raw: unknown): ErdColumnType {
  const t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if ((ERD_COLUMN_TYPES as readonly string[]).includes(t)) return t as ErdColumnType;
  return TYPE_ALIASES[t] ?? 'string';
}

/** A usable table or column name, or '' when nothing sensible can be made of it. */
function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const name = raw.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
  if (!/^[A-Za-z_]/.test(name)) return '';
  return clip(name, MAX_NAME);
}

const lower = (s: string) => s.toLowerCase();
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export const erdTask: AiTask<ErdInput, ErdProposal> = {
  id: 'ai.erd',
  promptVersion: 1,
  dataClass: 'content',
  needsJson: true,
  allowsFocusNote: false,
  build(input): PromptParts {
    const user = [
      dataBlock(
        `Current diagram:\n${clip(input.current.trim(), MAX_CURRENT_CHARS)}\n\nRequest:\n${clip(input.request.trim(), MAX_REQUEST_CHARS)}`,
      ),
      'Return the JSON object now.',
    ].join('\n\n');
    return { system: SYSTEM, user, json: true, maxOutputTokens: 3500 };
  },
  parse(reply): ParseResult<ErdProposal> {
    const read = readJson(reply);
    if (!read.ok) return { ok: false, error: 'The reply was not valid JSON.' };
    const root = obj(read.value);
    if (!root || !Array.isArray(root.tables)) return { ok: false, error: 'The reply did not contain a "tables" list.' };

    const tables: ErdProposal['tables'] = [];
    const seenTables = new Set<string>();
    for (const rawTable of root.tables) {
      if (tables.length === MAX_TABLES) break;
      const t = obj(rawTable);
      const name = t ? cleanName(t.name) : '';
      if (!t || !name || seenTables.has(lower(name)) || !Array.isArray(t.columns)) continue;
      const columns: ErdProposal['tables'][number]['columns'] = [];
      const seenCols = new Set<string>();
      for (const rawCol of t.columns) {
        if (columns.length === MAX_COLUMNS) break;
        const c = obj(rawCol);
        const colName = c ? cleanName(c.name) : '';
        if (!c || !colName || seenCols.has(lower(colName))) continue;
        seenCols.add(lower(colName));
        columns.push({ name: colName, type: columnType(c.type), ...(c.pk === true ? { pk: true } : {}) });
      }
      if (columns.length === 0) continue;
      seenTables.add(lower(name));
      tables.push({ name, columns });
    }
    if (tables.length === 0) return { ok: false, error: 'The reply had no usable tables.' };

    const find = (table: string, column: string) =>
      tables.find((t) => lower(t.name) === lower(table))?.columns.find((c) => lower(c.name) === lower(column));
    const relations: ErdProposal['relations'] = [];
    const seenRel = new Set<string>();
    for (const rawRel of Array.isArray(root.relations) ? root.relations : []) {
      if (relations.length === MAX_RELATIONS) break;
      const r = obj(rawRel);
      const from = obj(r?.from);
      const to = obj(r?.to);
      const [ft, fc, tt, tc] = [cleanName(from?.table), cleanName(from?.column), cleanName(to?.table), cleanName(to?.column)];
      if (!ft || !fc || !tt || !tc || !find(ft, fc) || !find(tt, tc)) continue;
      const key = [ft, fc, tt, tc].map(lower).join('|');
      if (seenRel.has(key)) continue;
      seenRel.add(key);
      // Written with the names the tables were given.
      relations.push({
        fromTable: tables.find((t) => lower(t.name) === lower(ft))!.name,
        fromColumn: find(ft, fc)!.name,
        toTable: tables.find((t) => lower(t.name) === lower(tt))!.name,
        toColumn: find(tt, tc)!.name,
      });
    }
    return { ok: true, value: { tables, relations } };
  },
};
