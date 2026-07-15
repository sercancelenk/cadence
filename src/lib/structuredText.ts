/**
 * Pure helpers for JSON / YAML structured text (format + validate).
 * Used by StructuredTextEditor and unit tests — no CodeMirror dependency.
 *
 * Format / Compact / Convert only rewrite the document when parse succeeds
 * end-to-end. Invalid input returns an error and callers leave the buffer
 * untouched — no speculative “healing” of broken syntax.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  collectStructuredTextJsonDiagnostics,
  summarizeJsonDiagnostics,
} from './structuredTextDiagnostics';
import {
  collectHighConfidencePasteCandidates,
  noticeForPasteFix,
  peelOuterSingleQuotedJson as peelOuterSingleQuotedJsonCandidate,
  tryNormalizeDoubledQuoteJson as tryNormalizeDoubledQuoteJsonCandidate,
  type StructuredPasteFixKind,
} from './structuredTextPaste';
import { prepareStructuredTextInput } from './structuredTextPrepare';

export { prepareStructuredTextInput } from './structuredTextPrepare';
export {
  peelAssignmentWrapper,
  peelMarkdownCodeFence,
  peelOuterSingleQuotedJson as peelOuterSingleQuotedJsonDetailed,
  tryNormalizeDoubledQuoteJson as tryNormalizeDoubledQuoteJsonDetailed,
  collectHighConfidencePasteCandidates,
} from './structuredTextPaste';

/** @deprecated Prefer detailed paste helpers; kept for existing tests. */
export function peelOuterSingleQuotedJson(text: string): string | null {
  return peelOuterSingleQuotedJsonCandidate(text)?.text ?? null;
}

/** @deprecated Prefer detailed paste helpers; kept for existing tests. */
export function tryNormalizeDoubledQuoteJson(text: string): string | null {
  return tryNormalizeDoubledQuoteJsonCandidate(text)?.text ?? null;
}

export type StructuredTextLanguage = 'json' | 'yaml';

export type StructuredTextValidation = {
  valid: boolean;
  message?: string;
  /** 0-based line hint when the parser provides one. */
  line?: number;
  /** Extra structural issues (JSON) beyond the primary parse error. */
  issueCount?: number;
};

export type StructuredTextFormatResult =
  | { ok: true; text: string; /** Set when a high-confidence paste fix ran. */ notice?: string }
  | { ok: false; error: string };

/** Cap nested unwrap loops (DB dumps sometimes double/triple-encode). */
const MAX_STRUCTURED_UNWRAP_DEPTH = 8;

function isStructuredObjectOrArray(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

function tryParseJsonObjectOrArray(text: string): unknown | undefined {
  const inner = text.trim();
  if (!inner.startsWith('{') && !inner.startsWith('[')) return undefined;
  try {
    const reparsed = JSON.parse(inner);
    if (isStructuredObjectOrArray(reparsed)) return reparsed;
  } catch {
    /* not JSON structure */
  }
  return undefined;
}

/**
 * After Stringify (or a DB paste), the document root may be a string that
 * itself contains object/array JSON. Unwrap so Format / Compact restore the
 * original structure. Stops at plain strings (`"hello"`) and caps depth.
 *
 * Intentionally does NOT re-parse string roots as YAML: a YAML block scalar
 * whose text happens to look like a mapping must stay a string (data safety).
 */
function unwrapStringifiedStructuredDocument(
  value: unknown,
): { value: unknown; unwrapped: boolean } {
  let current = value;
  let unwrapped = false;
  for (let depth = 0; depth < MAX_STRUCTURED_UNWRAP_DEPTH && typeof current === 'string'; depth++) {
    const asJson = tryParseJsonObjectOrArray(current);
    if (asJson === undefined) break;
    current = asJson;
    unwrapped = true;
  }
  return { value: current, unwrapped };
}

type ParsedStructuredDocument =
  | { ok: true; value: unknown; fixKind?: StructuredPasteFixKind | 'stringified' }
  | { ok: false; error: string };

/**
 * Parse document to a JS value — shared by format, semantic diff, and canonicalize.
 * High-confidence paste fixes (Stage 2) run only when the raw document fails to parse.
 */
export function parseStructuredDocumentValue(
  text: string,
  language: StructuredTextLanguage,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const parsed = parseStructuredDocumentValueDetailed(text, language);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value };
}

function finishParsedValue(
  raw: unknown,
  fixKind?: StructuredPasteFixKind | 'stringified',
): ParsedStructuredDocument {
  const unwrapped = unwrapStringifiedStructuredDocument(raw);
  return {
    ok: true,
    value: unwrapped.value,
    fixKind: unwrapped.unwrapped ? 'stringified' : fixKind,
  };
}

function tryParseJsonText(
  candidate: string,
  fixKind?: StructuredPasteFixKind,
): ParsedStructuredDocument | null {
  try {
    return finishParsedValue(JSON.parse(candidate) as unknown, fixKind);
  } catch {
    return null;
  }
}

function tryParseYamlText(
  candidate: string,
  fixKind?: StructuredPasteFixKind,
): ParsedStructuredDocument | null {
  try {
    return finishParsedValue(parseYaml(candidate, { strict: true }), fixKind);
  } catch {
    return null;
  }
}

function parseStructuredDocumentValueDetailed(
  text: string,
  language: StructuredTextLanguage,
): ParsedStructuredDocument {
  const prepared = prepareStructuredTextInput(text);
  if (!prepared) return { ok: true, value: {} };

  if (language === 'json') {
    const direct = tryParseJsonText(prepared);
    if (direct) return direct;

    for (const candidate of collectHighConfidencePasteCandidates(prepared)) {
      const fixed = tryParseJsonText(candidate.text, candidate.kind);
      if (fixed) return fixed;
    }
    return { ok: false, error: 'Invalid JSON' };
  }

  const directYaml = tryParseYamlText(prepared);
  if (directYaml) return directYaml;

  for (const candidate of collectHighConfidencePasteCandidates(prepared)) {
    const asYaml = tryParseYamlText(candidate.text, candidate.kind);
    if (asYaml) return asYaml;
    // Fence/assignment often wraps JSON while YAML mode is selected.
    const asJson = tryParseJsonText(candidate.text, candidate.kind);
    if (asJson) return asJson;
  }

  return { ok: false, error: 'Invalid YAML' };
}

function formatNotice(fixKind?: StructuredPasteFixKind | 'stringified'): string | undefined {
  return fixKind ? noticeForPasteFix(fixKind) : undefined;
}

/** Recursively sort object keys so line diff aligns fields regardless of source order. */
export function deepSortStructuredValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepSortStructuredValue);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort((a, b) => a.localeCompare(b))) {
      sorted[key] = deepSortStructuredValue(obj[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Pretty-print with stable key order — use before structural line diff so moved
 * fields highlight as unchanged instead of false whole-document rewrites.
 */
export function canonicalizeStructuredTextForDiff(
  text: string,
  language: StructuredTextLanguage,
): StructuredTextFormatResult {
  const parsed = parseStructuredDocumentValue(text, language);
  if (!parsed.ok) return parsed;

  const sorted = deepSortStructuredValue(parsed.value);
  if (language === 'json') {
    return { ok: true, text: `${JSON.stringify(sorted, null, 2)}\n` };
  }

  try {
    const yamlText = stringifyYaml(sorted, { indent: 2, sortMapEntries: true });
    return { ok: true, text: yamlText.endsWith('\n') ? yamlText : `${yamlText}\n` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid YAML' };
  }
}

export function alignStructuredTextSidesForDiff(
  textA: string,
  textB: string,
  language: StructuredTextLanguage,
):
  | { ok: true; textA: string; textB: string; changedA: boolean; changedB: boolean }
  | { ok: false; error: string } {
  const canonA = canonicalizeStructuredTextForDiff(textA, language);
  if (!canonA.ok) return canonA;
  const canonB = canonicalizeStructuredTextForDiff(textB, language);
  if (!canonB.ok) return canonB;
  return {
    ok: true,
    textA: canonA.text,
    textB: canonB.text,
    changedA: canonA.text !== textA,
    changedB: canonB.text !== textB,
  };
}

/** Merge an aligned editor document back into raw text, preserving original key order. */
export function mergeStructuredEditPreservingKeyOrder(raw: unknown, edited: unknown): unknown {
  if (Array.isArray(raw) && Array.isArray(edited)) {
    if (raw.length !== edited.length) return edited;
    return raw.map((item, index) => mergeStructuredEditPreservingKeyOrder(item, edited[index]));
  }

  if (
    raw !== null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    edited !== null &&
    typeof edited === 'object' &&
    !Array.isArray(edited)
  ) {
    const rawRecord = raw as Record<string, unknown>;
    const editedRecord = edited as Record<string, unknown>;
    const merged: Record<string, unknown> = {};

    for (const key of Object.keys(rawRecord)) {
      if (Object.prototype.hasOwnProperty.call(editedRecord, key)) {
        merged[key] = mergeStructuredEditPreservingKeyOrder(rawRecord[key], editedRecord[key]);
      }
    }

    for (const key of Object.keys(editedRecord)) {
      if (!Object.prototype.hasOwnProperty.call(merged, key)) {
        merged[key] = editedRecord[key];
      }
    }

    return merged;
  }

  return edited;
}

/** When align-keys is on, persist value edits onto the raw document without reordering keys. */
export function applyStructuredEditToRawText(
  rawText: string,
  editedText: string,
  language: StructuredTextLanguage,
): StructuredTextFormatResult {
  const rawParsed = parseStructuredDocumentValue(rawText, language);
  if (!rawParsed.ok) return { ok: true, text: editedText };
  const editedParsed = parseStructuredDocumentValue(editedText, language);
  if (!editedParsed.ok) return { ok: true, text: editedText };

  const merged = mergeStructuredEditPreservingKeyOrder(rawParsed.value, editedParsed.value);

  if (language === 'json') {
    return { ok: true, text: `${JSON.stringify(merged, null, 2)}\n` };
  }

  try {
    const yamlText = stringifyYaml(merged, { indent: 2, sortMapEntries: false });
    return { ok: true, text: yamlText.endsWith('\n') ? yamlText : `${yamlText}\n` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid YAML' };
  }
}

export function validateStructuredText(
  text: string,
  language: StructuredTextLanguage,
): StructuredTextValidation {
  // Validate the editor document as-is (BOM-strip only). Trimming would shift
  // line numbers vs the CodeMirror gutter / linter which sees the full doc.
  const prepared = text.replace(/^\uFEFF/, '');
  if (!prepared.trim()) return { valid: true };

  if (language === 'json') {
    const lineAt = (lineNumber: number) => {
      // 1-based line → offsets in the prepared string
      let line = 1;
      let start = 0;
      for (let i = 0; i < prepared.length; i++) {
        if (line === lineNumber) {
          let end = prepared.indexOf('\n', i);
          if (end < 0) end = prepared.length;
          return { from: start, to: end };
        }
        if (prepared[i] === '\n') {
          line++;
          start = i + 1;
        }
      }
      return { from: Math.max(0, prepared.length - 1), to: prepared.length };
    };

    const diagnostics = collectStructuredTextJsonDiagnostics(prepared, lineAt);
    if (diagnostics.length === 0) return { valid: true };
    const primary = diagnostics[0]!;
    return {
      valid: false,
      message: summarizeJsonDiagnostics(diagnostics),
      line: primary.line,
      issueCount: diagnostics.length,
    };
  }

  try {
    parseYaml(prepared, { strict: true });
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid YAML';
    const line = parseYamlErrorLine(message);
    return { valid: false, message, line, issueCount: 1 };
  }
}

export function formatStructuredText(
  text: string,
  language: StructuredTextLanguage,
): StructuredTextFormatResult {
  const prepared = prepareStructuredTextInput(text);
  if (!prepared) {
    return { ok: true, text: language === 'json' ? '{\n}\n' : '' };
  }

  const parsed = parseStructuredDocumentValueDetailed(text, language);
  if (!parsed.ok) {
    if (language === 'json') {
      const diagnostics = collectStructuredTextJsonDiagnostics(prepared, (lineNumber) => {
        let line = 1;
        let start = 0;
        for (let i = 0; i < prepared.length; i++) {
          if (line === lineNumber) {
            let end = prepared.indexOf('\n', i);
            if (end < 0) end = prepared.length;
            return { from: start, to: end };
          }
          if (prepared[i] === '\n') {
            line++;
            start = i + 1;
          }
        }
        return { from: Math.max(0, prepared.length - 1), to: prepared.length };
      });
      return {
        ok: false,
        error: `${summarizeJsonDiagnostics(diagnostics)} — left unchanged (not a safe auto-fix)`,
      };
    }
    return parsed;
  }

  if (language === 'json') {
    return {
      ok: true,
      text: `${JSON.stringify(parsed.value, null, 2)}\n`,
      notice: formatNotice(parsed.fixKind),
    };
  }

  try {
    const yamlText = stringifyYaml(parsed.value, { indent: 2 });
    return {
      ok: true,
      text: yamlText.endsWith('\n') ? yamlText : `${yamlText}\n`,
      notice: formatNotice(parsed.fixKind),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid YAML' };
  }
}

/** Compact JSON to a single line (inverse of pretty-print). JSON only. */
export function compactStructuredText(
  text: string,
  language: StructuredTextLanguage,
): StructuredTextFormatResult {
  if (language !== 'json') {
    return { ok: false, error: 'Compact is only available for JSON' };
  }

  const prepared = prepareStructuredTextInput(text);
  if (!prepared) {
    return { ok: true, text: '{}\n' };
  }

  const parsed = parseStructuredDocumentValueDetailed(text, 'json');
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    text: `${JSON.stringify(parsed.value)}\n`,
    notice: parsed.fixKind ? `${noticeForPasteFix(parsed.fixKind)} (compacted)` : undefined,
  };
}

/**
 * Wrap valid JSON as an escaped string literal — useful for env vars,
 * API fields, or embedding JSON inside another JSON document.
 */
export function stringifyStructuredTextDocument(
  text: string,
  language: StructuredTextLanguage,
): StructuredTextFormatResult {
  if (language !== 'json') {
    return { ok: false, error: 'Stringify is only available for JSON' };
  }

  const prepared = prepareStructuredTextInput(text);
  if (!prepared) {
    return { ok: true, text: '""\n' };
  }

  const parsed = parseStructuredDocumentValueDetailed(text, 'json');
  if (!parsed.ok) return parsed;
  const compact = JSON.stringify(parsed.value);
  return { ok: true, text: `${JSON.stringify(compact)}\n` };
}

/** Parse the document as JSON and emit pretty YAML (2-space indent). */
export function convertJsonToYaml(text: string): StructuredTextFormatResult {
  const prepared = prepareStructuredTextInput(text);
  if (!prepared) {
    return { ok: true, text: '{}\n' };
  }

  const parsed = parseStructuredDocumentValueDetailed(text, 'json');
  if (!parsed.ok) return parsed;
  try {
    const yamlText = stringifyYaml(parsed.value, { indent: 2 });
    return { ok: true, text: yamlText.endsWith('\n') ? yamlText : `${yamlText}\n` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
}

/** Parse the document as YAML and emit pretty JSON. */
export function convertYamlToJson(text: string): StructuredTextFormatResult {
  const prepared = prepareStructuredTextInput(text);
  if (!prepared) {
    return { ok: true, text: '{\n}\n' };
  }

  const parsed = parseStructuredDocumentValueDetailed(text, 'yaml');
  if (!parsed.ok) return parsed;
  return { ok: true, text: `${JSON.stringify(parsed.value, null, 2)}\n` };
}

/** Convert structured text to the target language (parses source format from the action). */
export function convertStructuredText(
  text: string,
  target: StructuredTextLanguage,
): StructuredTextFormatResult {
  return target === 'yaml' ? convertJsonToYaml(text) : convertYamlToJson(text);
}

function parseYamlErrorLine(message: string): number | undefined {
  const m = message.match(/at line (\d+)/i);
  if (!m) return undefined;
  const line = Number(m[1]);
  return Number.isFinite(line) ? line - 1 : undefined;
}
