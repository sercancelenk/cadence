import { describe, expect, it } from 'vitest';
import {
  compactStructuredText,
  formatStructuredText,
  stringifyStructuredTextDocument,
  validateStructuredText,
} from './structuredText';

describe('validateStructuredText', () => {
  it('accepts empty input', () => {
    expect(validateStructuredText('', 'json').valid).toBe(true);
    expect(validateStructuredText('  ', 'yaml').valid).toBe(true);
  });

  it('rejects invalid JSON', () => {
    const source = '{\n  "a": 1,\n  bad\n}';
    const r = validateStructuredText(source, 'json');
    expect(r.valid).toBe(false);
    expect(r.message).toBeTruthy();
  });

  it('accepts valid JSON with trailing content after parse', () => {
    expect(validateStructuredText('{"a":1}', 'json').valid).toBe(true);
  });

  it('rejects invalid YAML', () => {
    const r = validateStructuredText('foo: [', 'yaml');
    expect(r.valid).toBe(false);
  });

  it('accepts valid YAML', () => {
    expect(validateStructuredText('foo:\n  bar: 1\n', 'yaml').valid).toBe(true);
  });
});

describe('formatStructuredText', () => {
  it('pretty-prints JSON', () => {
    const r = formatStructuredText('{"b":2,"a":1}', 'json');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain('"a": 1');
      expect(r.text).toContain('"b": 2');
    }
  });

  it('returns error for invalid JSON format', () => {
    const r = formatStructuredText('{bad', 'json');
    expect(r.ok).toBe(false);
  });

  it('pretty-prints YAML', () => {
    const r = formatStructuredText('foo: {bar: 1}', 'yaml');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain('foo');
  });

  it('unwraps stringified JSON back to a pretty object', () => {
    const stringified = stringifyStructuredTextDocument('{"a":1}', 'json');
    expect(stringified.ok).toBe(true);
    if (!stringified.ok) return;

    const r = formatStructuredText(stringified.text, 'json');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain('"a": 1');
      expect(r.text.trim().startsWith('{')).toBe(true);
    }
  });

  it('keeps plain JSON string values when pretty-printing', () => {
    const r = formatStructuredText('"hello"', 'json');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.trim()).toBe('"hello"');
  });
});

describe('compactStructuredText', () => {
  it('minifies JSON to one line', () => {
    const r = compactStructuredText('{\n  "a": 1,\n  "b": 2\n}\n', 'json');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.trim()).toBe('{"a":1,"b":2}');
  });

  it('returns error for invalid JSON compact', () => {
    expect(compactStructuredText('{bad', 'json').ok).toBe(false);
  });

  it('rejects YAML', () => {
    expect(compactStructuredText('foo: 1\n', 'yaml').ok).toBe(false);
  });

  it('unwraps stringified JSON back to one line', () => {
    const stringified = stringifyStructuredTextDocument('{"a":1,"b":2}', 'json');
    expect(stringified.ok).toBe(true);
    if (!stringified.ok) return;

    const r = compactStructuredText(stringified.text, 'json');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.trim()).toBe('{"a":1,"b":2}');
  });
});

describe('stringifyStructuredTextDocument', () => {
  it('escapes JSON as a string literal', () => {
    const r = stringifyStructuredTextDocument('{\n  "a": 1\n}\n', 'json');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.trim()).toBe('"{\\"a\\":1}"');
  });

  it('rejects YAML', () => {
    expect(stringifyStructuredTextDocument('foo: 1\n', 'yaml').ok).toBe(false);
  });
});
