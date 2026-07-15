import { describe, expect, it } from 'vitest';
import {
  collectStructuredTextJsonDiagnostics,
  scanJsonStructuralIssues,
  summarizeJsonDiagnostics,
} from './structuredTextDiagnostics';
import {
  collectHighConfidencePasteCandidates,
  peelAssignmentWrapper,
  peelMarkdownCodeFence,
} from './structuredTextPaste';
import { formatStructuredText, validateStructuredText } from './structuredText';

function lineAtFactory(text: string) {
  return (lineNumber: number) => {
    let line = 1;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (line === lineNumber) {
        let end = text.indexOf('\n', i);
        if (end < 0) end = text.length;
        return { from: start, to: end };
      }
      if (text[i] === '\n') {
        line++;
        start = i + 1;
      }
    }
    return { from: Math.max(0, text.length - 1), to: text.length };
  };
}

const BROKEN_SAMPLE = `{
  "z": "x",
  "a": 1212
  "u": {
    "vv": 
      {
        "dasda": "xx
      }
    ]
  }
}`;

describe('scanJsonStructuralIssues', () => {
  it('flags missing commas, unclosed strings, and mismatched brackets', () => {
    const issues = scanJsonStructuralIssues(BROKEN_SAMPLE);
    const messages = issues.map((i) => i.message);
    expect(messages.some((m) => /comma/i.test(m))).toBe(true);
    expect(messages.some((m) => /Unclosed string/i.test(m))).toBe(true);
    expect(messages.some((m) => /Mismatched bracket|Unclosed/i.test(m))).toBe(true);
  });
});

describe('collectStructuredTextJsonDiagnostics', () => {
  it('returns multiple diagnostics for the broken sample', () => {
    const diagnostics = collectStructuredTextJsonDiagnostics(
      BROKEN_SAMPLE,
      lineAtFactory(BROKEN_SAMPLE),
    );
    expect(diagnostics.length).toBeGreaterThan(1);
    expect(summarizeJsonDiagnostics(diagnostics)).toMatch(/\d+ issues/);
  });

  it('returns no diagnostics for valid JSON', () => {
    expect(collectStructuredTextJsonDiagnostics('{"a":1}', lineAtFactory('{"a":1}'))).toEqual([]);
  });
});

describe('validateStructuredText multi-issue', () => {
  it('reports issueCount for broken JSON', () => {
    const r = validateStructuredText(BROKEN_SAMPLE, 'json');
    expect(r.valid).toBe(false);
    expect(r.issueCount).toBeGreaterThan(1);
    expect(r.message).toMatch(/issues/i);
  });
});

describe('formatStructuredText refuses unsafe broken JSON', () => {
  it('leaves structurally broken JSON unchanged', () => {
    const r = formatStructuredText(BROKEN_SAMPLE, 'json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unchanged|safe auto-fix/i);
  });
});

describe('high-confidence paste wrappers', () => {
  it('peels assignment wrappers', () => {
    const c = peelAssignmentWrapper('const payload = {"a":1};');
    expect(c?.kind).toBe('assignment-wrapper');
    expect(c?.text).toBe('{"a":1}');
  });

  it('peels markdown fences', () => {
    const c = peelMarkdownCodeFence('```json\n{"a":1}\n```');
    expect(c?.kind).toBe('code-fence');
    expect(c?.text).toBe('{"a":1}');
  });

  it('formats assignment-wrapped JSON with a specific notice', () => {
    const r = formatStructuredText('data = {"z":"x"}', 'json');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(JSON.parse(r.text)).toEqual({ z: 'x' });
      expect(r.notice).toBe('Removed assignment wrapper');
    }
  });

  it('collects candidates without duplicates', () => {
    const list = collectHighConfidencePasteCandidates("'{\"a\":1}'");
    expect(list.some((c) => c.kind === 'single-quoted')).toBe(true);
  });
});
