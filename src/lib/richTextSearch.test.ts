import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { createRichTextExtensions } from './richTextEditorExtensions';
import {
  buildSearchQuery,
  collectRichTextMatches,
  currentRichTextMatchIndex,
} from './richTextSearch';

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

describe('collectRichTextMatches', () => {
  it('returns [] for an invalid query', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: '<p>hello world</p>',
    });
    expect(collectRichTextMatches(editor.state, buildSearchQuery('', '', false))).toEqual([]);
    editor.destroy();
  });

  it('enumerates non-overlapping matches left to right', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: '<p>foo bar foo</p>',
    });
    const matches = collectRichTextMatches(editor.state, buildSearchQuery('foo', '', false));
    expect(matches.length).toBe(2);
    expect(matches[0]!.from).toBeLessThan(matches[1]!.from);
    expect(matches[0]!.to).toBeGreaterThan(matches[0]!.from);
    editor.destroy();
  });

  it('is case-sensitive when requested', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions(),
      content: '<p>Foo foo</p>',
    });
    const sensitive = collectRichTextMatches(editor.state, buildSearchQuery('Foo', '', true));
    const insensitive = collectRichTextMatches(editor.state, buildSearchQuery('foo', '', false));
    expect(sensitive.length).toBe(1);
    expect(insensitive.length).toBe(2);
    editor.destroy();
  });
});
