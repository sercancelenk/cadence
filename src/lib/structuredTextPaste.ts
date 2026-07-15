/**
 * High-confidence paste normalizers for JSON / YAML Format.
 * Each transform must re-parse as object|array before acceptance — never invent structure.
 */

import { prepareStructuredTextInput } from './structuredTextPrepare';

export type StructuredPasteFixKind =
  | 'single-quoted'
  | 'doubled-quotes'
  | 'assignment-wrapper'
  | 'code-fence';

export type StructuredPasteCandidate = {
  text: string;
  kind: StructuredPasteFixKind;
};

function isStructuredObjectOrArray(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

function acceptsJsonObjectOrArray(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isStructuredObjectOrArray(parsed);
  } catch {
    return false;
  }
}

/**
 * Some DB / shell copies wrap JSON in single quotes (`'{"a":1}'`).
 */
export function peelOuterSingleQuotedJson(text: string): StructuredPasteCandidate | null {
  const prepared = prepareStructuredTextInput(text);
  if (prepared.length < 2 || prepared[0] !== "'" || prepared[prepared.length - 1] !== "'") {
    return null;
  }
  const inner = prepared.slice(1, -1).replace(/''/g, "'").trim();
  if (!inner.startsWith('{') && !inner.startsWith('[')) return null;
  if (!acceptsJsonObjectOrArray(inner)) return null;
  return { text: inner, kind: 'single-quoted' };
}

/**
 * Kibana / CSV / Excel-style pastes escape quotes by doubling them:
 *   "{\n  ""z"": ""x""\n}"
 */
export function tryNormalizeDoubledQuoteJson(text: string): StructuredPasteCandidate | null {
  const prepared = prepareStructuredTextInput(text);
  if (!prepared.includes('""')) return null;

  const candidates: string[] = [];
  if (prepared.length >= 2 && prepared.startsWith('"') && prepared.endsWith('"')) {
    candidates.push(prepared.slice(1, -1).trim());
  }
  candidates.push(prepared);

  for (const candidate of candidates) {
    if (!candidate.includes('""')) continue;
    const normalized = candidate.replaceAll('""', '"');
    const trimmed = normalized.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue;
    if (acceptsJsonObjectOrArray(normalized)) {
      return { text: normalized, kind: 'doubled-quotes' };
    }
  }
  return null;
}

/**
 * Log / snippet wrappers: `data = {...}`, `const x = {...}`, `JSON: {...}`.
 */
export function peelAssignmentWrapper(text: string): StructuredPasteCandidate | null {
  const prepared = prepareStructuredTextInput(text);
  const match = prepared.match(
    /^(?:(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|[A-Za-z_$][\w.$]*\s*=|JSON\s*:)\s*([\[{][\s\S]*)$/i,
  );
  if (!match?.[1]) return null;
  const inner = match[1].trim();
  // Drop a trailing semicolon common in JS snippets.
  const withoutSemi = inner.endsWith(';') ? inner.slice(0, -1).trim() : inner;
  if (!acceptsJsonObjectOrArray(withoutSemi)) return null;
  return { text: withoutSemi, kind: 'assignment-wrapper' };
}

/**
 * Markdown fenced blocks: ```json ... ``` / ```yaml ... ```.
 */
export function peelMarkdownCodeFence(text: string): StructuredPasteCandidate | null {
  const prepared = prepareStructuredTextInput(text);
  const match = prepared.match(/^```(?:json|yaml|yml)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  if (!match?.[1]) return null;
  const inner = match[1].trim();
  if (!inner) return null;
  // Fence peel is language-agnostic at this stage; caller re-parses as JSON or YAML.
  return { text: inner, kind: 'code-fence' };
}

/**
 * Ordered high-confidence paste candidates (least aggressive first among wrappers).
 * Does not include stringified-root unwrap — that runs after a successful parse.
 */
export function collectHighConfidencePasteCandidates(text: string): StructuredPasteCandidate[] {
  const prepared = prepareStructuredTextInput(text);
  if (!prepared) return [];

  const out: StructuredPasteCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: StructuredPasteCandidate | null) => {
    if (!c || seen.has(c.text)) return;
    seen.add(c.text);
    out.push(c);
  };

  push(peelMarkdownCodeFence(prepared));
  push(peelAssignmentWrapper(prepared));
  push(peelOuterSingleQuotedJson(prepared));
  push(tryNormalizeDoubledQuoteJson(prepared));

  // Fence / assignment may still be Kibana-escaped inside.
  for (const c of [...out]) {
    if (c.kind === 'code-fence' || c.kind === 'assignment-wrapper') {
      push(tryNormalizeDoubledQuoteJson(c.text));
      push(peelOuterSingleQuotedJson(c.text));
    }
  }

  return out;
}

export function noticeForPasteFix(kind: StructuredPasteFixKind | 'stringified'): string {
  switch (kind) {
    case 'single-quoted':
      return 'Removed single-quote wrapper';
    case 'doubled-quotes':
      return 'Fixed Kibana/CSV doubled quotes';
    case 'assignment-wrapper':
      return 'Removed assignment wrapper';
    case 'code-fence':
      return 'Removed code fence';
    case 'stringified':
      return 'Unwrapped stringified JSON';
    default:
      return 'Cleaned paste and formatted';
  }
}
