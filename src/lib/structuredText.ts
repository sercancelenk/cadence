/**
 * Pure helpers for JSON / YAML structured text (format + validate).
 * Used by StructuredTextEditor and unit tests — no CodeMirror dependency.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export type StructuredTextLanguage = 'json' | 'yaml';

export type StructuredTextValidation = {
  valid: boolean;
  message?: string;
  /** 0-based line hint when the parser provides one. */
  line?: number;
};

export type StructuredTextFormatResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * After Stringify, the document root is a JSON string containing object/array
 * text. Unwrap so Format / Compact restore the original structure.
 */
function unwrapStringifiedJsonDocument(value: unknown): unknown {
  let current = value;
  while (typeof current === 'string') {
    const inner = current.trim();
    if (!inner.startsWith('{') && !inner.startsWith('[')) break;
    try {
      const reparsed = JSON.parse(inner);
      if (reparsed === null || typeof reparsed !== 'object') break;
      current = reparsed;
    } catch {
      break;
    }
  }
  return current;
}

function parseJsonDocumentValue(text: string): unknown {
  return unwrapStringifiedJsonDocument(JSON.parse(text.trim()));
}

/** Parse document to a JS value — shared by format, semantic diff, and canonicalize. */
export function parseStructuredDocumentValue(
  text: string,
  language: StructuredTextLanguage,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: {} };

  if (language === 'json') {
    try {
      return { ok: true, value: parseJsonDocumentValue(trimmed) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
    }
  }

  try {
    return { ok: true, value: parseYaml(trimmed, { strict: true }) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid YAML' };
  }
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
  const trimmed = text.trim();
  if (!trimmed) return { valid: true };

  if (language === 'json') {
    try {
      JSON.parse(trimmed);
      return { valid: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid JSON';
      const line = parseJsonErrorLine(message, trimmed);
      return { valid: false, message, line };
    }
  }

  try {
    parseYaml(trimmed, { strict: true });
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid YAML';
    const line = parseYamlErrorLine(message);
    return { valid: false, message, line };
  }
}

export function formatStructuredText(
  text: string,
  language: StructuredTextLanguage,
): StructuredTextFormatResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, text: language === 'json' ? '{\n}\n' : '' };
  }

  if (language === 'json') {
    try {
      const parsed = parseJsonDocumentValue(trimmed);
      return { ok: true, text: `${JSON.stringify(parsed, null, 2)}\n` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
    }
  }

  try {
    const parsed = parseYaml(trimmed, { strict: true });
    return { ok: true, text: stringifyYaml(parsed, { indent: 2 }) };
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

  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, text: '{}\n' };
  }

  try {
    const parsed = parseJsonDocumentValue(trimmed);
    return { ok: true, text: `${JSON.stringify(parsed)}\n` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
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

  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, text: '""\n' };
  }

  try {
    const parsed = parseJsonDocumentValue(trimmed);
    const compact = JSON.stringify(parsed);
    return { ok: true, text: `${JSON.stringify(compact)}\n` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
}

/** Parse the document as JSON and emit pretty YAML (2-space indent). */
export function convertJsonToYaml(text: string): StructuredTextFormatResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, text: '{}\n' };
  }

  try {
    const parsed = parseJsonDocumentValue(trimmed);
    const yamlText = stringifyYaml(parsed, { indent: 2 });
    return { ok: true, text: yamlText.endsWith('\n') ? yamlText : `${yamlText}\n` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
}

/** Parse the document as YAML and emit pretty JSON. */
export function convertYamlToJson(text: string): StructuredTextFormatResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, text: '{\n}\n' };
  }

  try {
    const parsed = parseYaml(trimmed, { strict: true });
    return { ok: true, text: `${JSON.stringify(parsed, null, 2)}\n` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid YAML' };
  }
}

/** Convert structured text to the target language (parses source format from the action). */
export function convertStructuredText(
  text: string,
  target: StructuredTextLanguage,
): StructuredTextFormatResult {
  return target === 'yaml' ? convertJsonToYaml(text) : convertYamlToJson(text);
}

function parseJsonErrorLine(message: string, source?: string): number | undefined {
  const lineMatch = message.match(/line\s+(\d+)/i);
  if (lineMatch) {
    const line = Number(lineMatch[1]);
    return Number.isFinite(line) ? line - 1 : undefined;
  }

  const posMatch = message.match(/position\s+(\d+)/i);
  if (posMatch && source) {
    const pos = Number(posMatch[1]);
    if (!Number.isFinite(pos) || pos < 0) return undefined;
    let line = 0;
    const limit = Math.min(pos, source.length);
    for (let i = 0; i < limit; i++) {
      if (source[i] === '\n') line++;
    }
    return line;
  }

  return undefined;
}

function parseYamlErrorLine(message: string): number | undefined {
  const m = message.match(/at line (\d+)/i);
  if (!m) return undefined;
  const line = Number(m[1]);
  return Number.isFinite(line) ? line - 1 : undefined;
}
