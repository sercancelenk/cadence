import type { FeedbackKind } from '../../../model';
import type { AiTask, ParseResult, PromptParts } from '../types';
import { DATA_RULE, clip, dataBlock, isBlankText, readJson } from './shared';

export type FeedbackInput = { text: string; kind?: FeedbackKind };
export type CandorOut = { care: string; challenge: string };
export type ReviewOut = { summary: string; strengths: string[]; growth: string[] };
/** One labelled piece of a rewritten feedback; the dialog lets the user keep or drop each. */
export type FeedbackPart = { key: string; label: string; text: string; list?: boolean };

const MAX_TEXT_CHARS = 8_000;
const MAX_ELEMENT_CHARS = 400;
const MAX_SUMMARY_CHARS = 600;
const MAX_ITEM_CHARS = 200;
const MAX_ITEMS = 8;
const KINDS = new Set<string>(['praise', 'coaching', 'concern']);

const COMMON_RULES = [
  `- ${DATA_RULE}`,
  '- Use only what the text states. Never add facts, names, dates, numbers, motives or judgements that are not in it.',
  '- Keep a neutral, respectful tone. Keep praise as praise and concerns as concerns; do not soften a concern into praise.',
  '- Use the same language as the text. Never translate.',
];

const CANDOR_SYSTEM = [
  'ROLE',
  'You rewrite one piece of workplace feedback in the Radical Candor style: Care Personally and Challenge Directly, said together, kindly and clearly.',
  '',
  'RULES',
  ...COMMON_RULES,
  '- care: what the text shows you appreciate or want for the person; challenge: the specific thing that needs to change or continue, said directly, about the work and not the person.',
  '- If the text states no care or no challenge, return an empty string for it. Do not guess it.',
  '- One or two short sentences per element, at most 400 characters each.',
  '',
  'OUTPUT',
  'Return a single JSON object and nothing else: no prose, no markdown fences.',
  '{ "care": string, "challenge": string }',
].join('\n');

const REVIEW_SYSTEM = [
  'ROLE',
  'You turn rough notes about one person into a short draft for a performance review: a summary, strengths and growth areas.',
  '',
  'RULES',
  ...COMMON_RULES,
  '- summary: two or three sentences at most. strengths and growth: short statements, one idea each, at most 8 of each.',
  '- Give no rating, score or ranking, and draw no conclusion about pay, promotion or employment that the text does not state.',
  '- A list the text gives no basis for is an empty list. Do not invent items.',
  '',
  'OUTPUT',
  'Return a single JSON object and nothing else: no prose, no markdown fences.',
  '{ "summary": string, "strengths": string[], "growth": string[] }',
].join('\n');

const text = (v: unknown, max: number): string => (typeof v === 'string' && !isBlankText(v) ? clip(v.trim(), max) : '');
const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [])
    .map((i) => text(i, MAX_ITEM_CHARS))
    .filter(Boolean)
    .slice(0, MAX_ITEMS);

function buildFor(system: string, input: FeedbackInput): PromptParts {
  const kind = input.kind && KINDS.has(input.kind) ? input.kind : undefined;
  const user = [
    ...(kind ? [`Feedback type: ${kind}`] : []),
    dataBlock(clip(input.text.trim(), MAX_TEXT_CHARS)),
    'Return the JSON object now.',
  ].join('\n\n');
  return { system, user, json: true, maxOutputTokens: 900 };
}

function readObject(reply: string): { ok: true; o: Record<string, unknown> } | { ok: false; error: string } {
  const read = readJson(reply);
  if (!read.ok) return { ok: false, error: 'The reply was not valid JSON.' };
  const v = read.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'The reply must be a JSON object.' };
  return { ok: true, o: v as Record<string, unknown> };
}

/** "Rewrite as Radical Candor": care and challenge, said together. */
export const candorTask: AiTask<FeedbackInput, CandorOut> = {
  id: 'ai.candor',
  promptVersion: 1,
  dataClass: 'people',
  needsJson: true,
  allowsFocusNote: false,
  build: (input): PromptParts => buildFor(CANDOR_SYSTEM, input),
  parse(reply): ParseResult<CandorOut> {
    const r = readObject(reply);
    if (!r.ok) return r;
    const value = { care: text(r.o.care, MAX_ELEMENT_CHARS), challenge: text(r.o.challenge, MAX_ELEMENT_CHARS) };
    if (!value.care && !value.challenge) return { ok: false, error: 'The reply stated neither care nor challenge.' };
    return { ok: true, value };
  },
};

/** "Draft a review": summary, strengths and growth areas from rough notes. */
export const reviewTask: AiTask<FeedbackInput, ReviewOut> = {
  id: 'ai.review',
  promptVersion: 1,
  dataClass: 'people',
  needsJson: true,
  allowsFocusNote: false,
  build: (input): PromptParts => buildFor(REVIEW_SYSTEM, input),
  parse(reply): ParseResult<ReviewOut> {
    const r = readObject(reply);
    if (!r.ok) return r;
    const value = { summary: text(r.o.summary, MAX_SUMMARY_CHARS), strengths: list(r.o.strengths), growth: list(r.o.growth) };
    if (!value.summary && value.strengths.length === 0 && value.growth.length === 0) {
      return { ok: false, error: 'The reply had no summary, strengths or growth areas.' };
    }
    return { ok: true, value };
  },
};

export function candorParts(out: CandorOut): FeedbackPart[] {
  const parts: FeedbackPart[] = [];
  if (out.care) parts.push({ key: 'care', label: 'Care personally', text: out.care });
  if (out.challenge) parts.push({ key: 'challenge', label: 'Challenge directly', text: out.challenge });
  return parts;
}

export function reviewParts(out: ReviewOut): FeedbackPart[] {
  const bullets = (items: string[]) => items.map((i) => `- ${i}`).join('\n');
  const parts: FeedbackPart[] = [];
  if (out.summary) parts.push({ key: 'summary', label: 'Summary', text: out.summary });
  if (out.strengths.length > 0) parts.push({ key: 'strengths', label: 'Strengths', text: bullets(out.strengths), list: true });
  if (out.growth.length > 0) parts.push({ key: 'growth', label: 'Growth areas', text: bullets(out.growth), list: true });
  return parts;
}

/** Labelled parts as inline text: one labelled line per part, a list on the lines below its label. */
export function partsToText(parts: FeedbackPart[]): string {
  return parts.map((p) => (p.list ? `${p.label}:\n${p.text}` : `${p.label}: ${p.text}`)).join('\n');
}
