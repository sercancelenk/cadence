import { describe, expect, it } from 'vitest';
import { buildSearchQuery, currentRichTextMatchIndex } from './richTextSearch';

describe('buildSearchQuery', () => {
  it('carries the search term, replacement and case flag', () => {
    const q = buildSearchQuery('foo', 'bar', true);
    expect(q.search).toBe('foo');
    expect(q.replace).toBe('bar');
    expect(q.caseSensitive).toBe(true);
    expect(q.valid).toBe(true);
  });

  it('is invalid for an empty search term', () => {
    expect(buildSearchQuery('', '', false).valid).toBe(false);
  });
});

describe('currentRichTextMatchIndex', () => {
  const matches = [
    { from: 2, to: 5 },
    { from: 10, to: 13 },
    { from: 20, to: 23 },
  ];
  it('returns the 1-based index of the match at the selection start', () => {
    expect(currentRichTextMatchIndex(matches, 2)).toBe(1);
    expect(currentRichTextMatchIndex(matches, 10)).toBe(2);
    expect(currentRichTextMatchIndex(matches, 20)).toBe(3);
  });
  it('returns 0 when the selection is not on a match', () => {
    expect(currentRichTextMatchIndex(matches, 7)).toBe(0);
    expect(currentRichTextMatchIndex([], 0)).toBe(0);
  });
});
