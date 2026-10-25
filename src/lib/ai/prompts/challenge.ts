import type { AiTask, ParseResult, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock, isBlankText, readJson } from './shared';

export type ChallengeInput = { text: string };

export type ChallengeOut = {
  assumptions: string[];
  risks: string[];
  alternatives: string[];
  questions: string[];
};

const MAX_TEXT_CHARS = 16_000;
const MAX_ITEMS = 6;
const MAX_ITEM_CHARS = 240;
const KEYS = ['assumptions', 'risks', 'alternatives', 'questions'] as const;

const SYSTEM = [
  'ROLE',
  'You are a critical but constructive reviewer inside a notes app. You read a note that describes an idea, plan or decision and point out where it is weak, so the author can fix it before acting.',
  '',
  'RULES',
  `- ${DATA_RULE}`,
  '- Ground every point in what the text says. Do not invent facts, numbers, people or constraints. If the text is too thin to challenge, return fewer points, not made-up ones.',
  '- assumptions: things the plan takes for granted that may not hold. risks: ways it could fail or hurt. alternatives: other ways to reach the same goal. questions: open questions the author should answer before going ahead.',
  '- At most 6 points per list, each one sentence of at most 240 characters. Be specific; no platitudes.',
  '- Be respectful and concrete. No praise, no filler, no advice to "think carefully".',
  '- Use the same language as the text. Never translate.',
  '',
  'OUTPUT',
  'Return a single JSON object and nothing else: no prose, no markdown fences.',
  '{ "assumptions": string[], "risks": string[], "alternatives": string[], "questions": string[] }',
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

export const challengeTask: AiTask<ChallengeInput, ChallengeOut> = {
  id: 'ai.challenge',
  promptVersion: 1,
  dataClass: 'content',
  needsJson: true,
  allowsFocusNote: false,
  build(input): PromptParts {
    const user = [dataBlock(clip(input.text.trim(), MAX_TEXT_CHARS)), 'Return the JSON object now.'].join('\n\n');
    return { system: SYSTEM, user, json: true, maxOutputTokens: 1800 };
  },
  parse(reply): ParseResult<ChallengeOut> {
    const read = readJson(reply);
    if (!read.ok) return { ok: false, error: 'The reply was not valid JSON.' };
    const v = read.value;
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      return { ok: false, error: 'The reply must be a JSON object with assumptions, risks, alternatives and questions.' };
    }
    const o = v as Record<string, unknown>;
    const value = {
      assumptions: cleanList(o.assumptions),
      risks: cleanList(o.risks),
      alternatives: cleanList(o.alternatives),
      questions: cleanList(o.questions),
    };
    if (KEYS.every((k) => value[k].length === 0)) return { ok: false, error: 'The reply had no points in any list.' };
    return { ok: true, value };
  },
};
