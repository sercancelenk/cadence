import { describe, expect, it } from 'vitest';
import {
  buildSemanticSummarySections,
  countSemanticSummaryRows,
  flattenSemanticSummarySections,
  SUMMARY_VIRTUAL_ROW_THRESHOLD,
} from './structuredTextSemanticSummary';
import { computeStructuredSemanticDiff } from './structuredTextSemanticDiff';

describe('buildSemanticSummarySections', () => {
  it('maps rename and value sections for mixed diffs', () => {
    const diff = computeStructuredSemanticDiff(
      '{"soyad2":"Y","count":1}',
      '{"soyad":"Y","count":2}',
      'json',
    );
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;

    const sections = buildSemanticSummarySections(diff, 'all', 'Left', 'Right');
    expect(sections.map((section) => section.id)).toEqual(['renamed', 'changed']);
    expect(sections[0]?.rows[0]?.fieldLabel).toBe('soyad2 → soyad');
  });

  it('respects filter tabs', () => {
    const diff = computeStructuredSemanticDiff('{"a":1,"drop":2}', '{"a":2,"add":3}', 'json');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;

    const keysOnly = buildSemanticSummarySections(diff, 'keys', 'Left', 'Right');
    expect(keysOnly.every((section) => section.id !== 'changed')).toBe(true);
  });
});

describe('flattenSemanticSummarySections', () => {
  it('interleaves headers and rows', () => {
    const diff = computeStructuredSemanticDiff('{"a":1}', '{"a":2}', 'json');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;

    const sections = buildSemanticSummarySections(diff, 'all', 'Left', 'Right');
    const items = flattenSemanticSummarySections(sections);
    expect(items[0]?.kind).toBe('header');
    expect(items[1]?.kind).toBe('row');
  });
});

describe('countSemanticSummaryRows', () => {
  it('counts only data rows, not section headers', () => {
    const diff = computeStructuredSemanticDiff('{"a":1,"b":2}', '{"a":1,"b":3,"c":4}', 'json');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;

    const sections = buildSemanticSummarySections(diff, 'all', 'Left', 'Right');
    expect(countSemanticSummaryRows(sections)).toBeGreaterThan(0);
    expect(SUMMARY_VIRTUAL_ROW_THRESHOLD).toBeGreaterThan(50);
  });
});
