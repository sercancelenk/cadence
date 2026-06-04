import { describe, expect, it } from 'vitest';
import {
  compactStructuredText,
  convertJsonToYaml,
  convertStructuredText,
  convertYamlToJson,
  formatStructuredText,
  stringifyStructuredTextDocument,
  validateStructuredText,
  canonicalizeStructuredTextForDiff,
  alignStructuredTextSidesForDiff,
  applyStructuredEditToRawText,
  deepSortStructuredValue,
  mergeStructuredEditPreservingKeyOrder,
  parseStructuredDocumentValue,
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

describe('convertJsonToYaml', () => {
  it('converts a JSON object to YAML', () => {
    const r = convertJsonToYaml('{"name":"cadence","count":2}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain('name: cadence');
      expect(r.text).toContain('count: 2');
    }
  });

  it('converts empty JSON to an empty YAML mapping', () => {
    const r = convertJsonToYaml('  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.trim()).toBe('{}');
  });

  it('rejects invalid JSON', () => {
    expect(convertJsonToYaml('{bad').ok).toBe(false);
  });

  it('converts JSON arrays', () => {
    const r = convertJsonToYaml('[1, 2, 3]');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain('- 1');
  });
});

describe('convertYamlToJson', () => {
  it('converts YAML to pretty JSON', () => {
    const r = convertYamlToJson('name: cadence\ncount: 2\n');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain('"name": "cadence"');
      expect(r.text).toContain('"count": 2');
    }
  });

  it('converts empty YAML to an empty JSON object', () => {
    const r = convertYamlToJson('');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.trim()).toBe('{\n}');
  });

  it('rejects invalid YAML', () => {
    expect(convertYamlToJson('foo: [').ok).toBe(false);
  });
});

describe('convertStructuredText', () => {
  it('routes to JSON or YAML targets', () => {
    const yaml = convertStructuredText('{"a":1}', 'yaml');
    const json = convertStructuredText('a: 1\n', 'json');
    expect(yaml.ok).toBe(true);
    expect(json.ok).toBe(true);
    if (yaml.ok) expect(yaml.text).toContain('a: 1');
    if (json.ok) expect(json.text).toContain('"a": 1');
  });
});

describe('canonicalizeStructuredTextForDiff', () => {
  it('aligns JSON key order so reordered objects canonicalize identically', () => {
    const a = canonicalizeStructuredTextForDiff('{"b":2,"a":1}', 'json');
    const b = canonicalizeStructuredTextForDiff('{"a":1,"b":2}', 'json');
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.text).toBe(b.text);
  });

  it('returns parse errors for invalid input', () => {
    expect(canonicalizeStructuredTextForDiff('{bad', 'json').ok).toBe(false);
  });

  it('sorts YAML mapping keys for stable line diff', () => {
    const r = canonicalizeStructuredTextForDiff('z: 1\na: 2\n', 'yaml');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const aIdx = r.text.indexOf('a:');
      const zIdx = r.text.indexOf('z:');
      expect(aIdx).toBeGreaterThanOrEqual(0);
      expect(zIdx).toBeGreaterThan(aIdx);
    }
  });
});

describe('deepSortStructuredValue', () => {
  it('sorts object keys recursively', () => {
    const sorted = deepSortStructuredValue({ z: 1, a: { y: 2, b: 3 } });
    expect(Object.keys(sorted as Record<string, unknown>)).toEqual(['a', 'z']);
    expect(Object.keys((sorted as { a: Record<string, unknown> }).a)).toEqual(['b', 'y']);
  });

  it('preserves array order and primitive values', () => {
    expect(deepSortStructuredValue([3, 1, 2])).toEqual([3, 1, 2]);
    expect(deepSortStructuredValue(null)).toBe(null);
    expect(deepSortStructuredValue('x')).toBe('x');
  });
});

describe('alignStructuredTextSidesForDiff', () => {
  it('reports whether each side changed after canonicalization', () => {
    const r = alignStructuredTextSidesForDiff('{"b":2,"a":1}', '{"a":1,"b":2}', 'json');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changedA).toBe(true);
    expect(r.changedB).toBe(true);
    expect(r.textA).toBe(r.textB);
  });

  it('returns parse error from either side', () => {
    expect(alignStructuredTextSidesForDiff('{', '{}', 'json').ok).toBe(false);
  });
});

describe('mergeStructuredEditPreservingKeyOrder', () => {
  it('applies value edits without reordering top-level keys', () => {
    const raw = { b: 2, a: 1 };
    const edited = { a: 1, b: 3 };
    expect(mergeStructuredEditPreservingKeyOrder(raw, edited)).toEqual({ b: 3, a: 1 });
  });

  it('preserves nested key order while updating values', () => {
    const raw = { meta: { z: 1, a: 2 } };
    const edited = { meta: { a: 5, z: 1 } };
    expect(mergeStructuredEditPreservingKeyOrder(raw, edited)).toEqual({ meta: { z: 1, a: 5 } });
  });
});

describe('applyStructuredEditToRawText', () => {
  it('persists aligned-editor edits onto raw JSON key order', () => {
    const raw = '{\n  "b": 2,\n  "a": 1\n}\n';
    const edited = '{\n  "a": 1,\n  "b": 3\n}\n';
    const result = applyStructuredEditToRawText(raw, edited, 'json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('"b": 3');
    expect(result.text.indexOf('"b"')).toBeLessThan(result.text.indexOf('"a"'));
  });
});

describe('parseStructuredDocumentValue', () => {
  it('unwraps nested stringified JSON documents', () => {
    const inner = JSON.stringify(JSON.stringify({ a: 1 }));
    const r = parseStructuredDocumentValue(inner, 'json');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1 });
  });
});

describe('validateStructuredText error lines', () => {
  it('maps JSON position errors to a line number', () => {
    const source = '{\n  "a": 1,\n  bad\n}';
    const r = validateStructuredText(source, 'json');
    expect(r.valid).toBe(false);
    expect(r.line).toBeGreaterThanOrEqual(0);
  });

  it('maps YAML line errors when provided by the parser', () => {
    const r = validateStructuredText('foo: [\n  bar\n', 'yaml');
    expect(r.valid).toBe(false);
    expect(r.line).toBeDefined();
  });

  it('returns empty YAML format for blank yaml input', () => {
    const r = formatStructuredText('   ', 'yaml');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe('');
  });
});
