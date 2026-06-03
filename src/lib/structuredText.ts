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
