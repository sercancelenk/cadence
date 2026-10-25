import type { AiTask, ParseResult, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock, readJson } from './shared';

export type MockDataInput = { sample: string; count: number };
export type MockDataOut = Record<string, unknown>[];

const MAX_SAMPLE_CHARS = 8_000;
const MAX_RECORDS = 50;

const SYSTEM = [
  'ROLE',
  'You generate realistic but entirely fictional sample records for developers, shaped exactly like an example the user gives you.',
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- Every record has the same keys as the example, in the same order, with the same kinds of values (strings stay strings, numbers stay numbers, nested objects and lists keep their shape). Add no keys and leave none out, except keys the example itself omits in some records.',
  '- Follow the formats you see: dates, ids, currencies, enums, casing, phone numbers. Make values vary between records and make ids unique.',
  '- All data is invented. Never copy real-looking personal data from the example; use invented names, and example.com, example.org or example.net for emails and domains, and 555-style fictional phone numbers.',
  '- Do not add comments or explanations inside the data.',
  '',
  'OUTPUT',
  'Return a single JSON object and nothing else: no prose, no markdown fences.',
  '{ "records": [ { ... } ] }',
].join('\n');

export const mockDataTask: AiTask<MockDataInput, MockDataOut> = {
  id: 'ai.mockdata',
  promptVersion: 1,
  dataClass: 'content',
  needsJson: true,
  allowsFocusNote: false,
  build(input): PromptParts {
    const count = Math.min(MAX_RECORDS, Math.max(1, Math.floor(input.count) || 1));
    const user = [
      `Generate ${count} ${count === 1 ? 'record' : 'records'} shaped like this example.`,
      dataBlock(clip(input.sample.trim(), MAX_SAMPLE_CHARS)),
      'Return the JSON object now.',
    ].join('\n\n');
    return { system: SYSTEM, user, json: true, maxOutputTokens: 4000 };
  },
  parse(reply): ParseResult<MockDataOut> {
    const read = readJson(reply);
    if (!read.ok) return { ok: false, error: 'The reply was not valid JSON.' };
    const v = read.value;
    const list = Array.isArray(v) ? v : v && typeof v === 'object' ? (v as { records?: unknown }).records : undefined;
    if (!Array.isArray(list)) return { ok: false, error: 'The reply did not contain a "records" list.' };
    const records = list
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r))
      .slice(0, MAX_RECORDS);
    return records.length > 0 ? { ok: true, value: records } : { ok: false, error: 'The reply had no records.' };
  },
};
