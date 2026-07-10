import { describe, expect, it } from 'vitest';
import {
  findTextMatches,
  matchIndexAtOrAfter,
  replaceAllText,
  replaceRange,
} from './textFindReplace';

describe('findTextMatches', () => {
  it('finds all non-overlapping occurrences left to right', () => {
    expect(findTextMatches('a-a-a', 'a', true)).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ]);
  });

  it('is case-insensitive by default flag', () => {
    expect(findTextMatches('Foo foo FOO', 'foo', false)).toHaveLength(3);
    expect(findTextMatches('Foo foo FOO', 'foo', true)).toHaveLength(1);
  });

  it('does not overlap on repeated substrings', () => {
    // "aa" in "aaaa" -> positions 0 and 2, not 1 and 3.
    expect(findTextMatches('aaaa', 'aa', true)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('returns nothing for an empty query', () => {
    expect(findTextMatches('anything', '', true)).toEqual([]);
  });
});

describe('matchIndexAtOrAfter', () => {
  const matches = [
    { start: 0, end: 1 },
    { start: 5, end: 6 },
    { start: 9, end: 10 },
  ];
  it('finds the first match at or after the caret', () => {
    expect(matchIndexAtOrAfter(matches, 0)).toBe(0);
    expect(matchIndexAtOrAfter(matches, 1)).toBe(1);
    expect(matchIndexAtOrAfter(matches, 6)).toBe(2);
  });
  it('returns -1 when the caret is past the last match', () => {
    expect(matchIndexAtOrAfter(matches, 11)).toBe(-1);
  });
});

describe('replaceAllText', () => {
  it('replaces every occurrence and preserves the gaps', () => {
    expect(replaceAllText('a-a-a', 'a', 'X', true)).toBe('X-X-X');
  });

  it('honours case sensitivity', () => {
    expect(replaceAllText('Foo foo', 'foo', 'bar', true)).toBe('Foo bar');
    expect(replaceAllText('Foo foo', 'foo', 'bar', false)).toBe('bar bar');
  });

  it('returns the original reference when there is nothing to replace', () => {
    const src = 'nothing here';
    expect(replaceAllText(src, 'zzz', 'x', true)).toBe(src);
  });

  it('supports empty replacement (deletion)', () => {
    expect(replaceAllText('a-a-a', '-', '', true)).toBe('aaa');
  });
});

describe('replaceRange', () => {
  it('splices a single span', () => {
    expect(replaceRange('hello world', 6, 11, 'there')).toBe('hello there');
  });
});
