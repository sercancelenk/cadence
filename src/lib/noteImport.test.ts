import { describe, expect, it } from 'vitest';
import type { RichTextDoc } from './richText';
import { extractPlainText } from './richText';
import { importFileToDoc, titleFromFileName } from './noteImport';

const types = (doc: RichTextDoc) => (doc.content ?? []).map((n) => n.type);

describe('importFileToDoc', () => {
  it('turns markdown into headings, lists and paragraphs', () => {
    const doc = importFileToDoc('# Title\n\n- a\n- b\n\ntext', 'md');
    expect(types(doc)).toEqual(['heading', 'bulletList', 'paragraph']);
  });

  it('treats .markdown like .md', () => {
    expect(types(importFileToDoc('# H', 'markdown'))).toEqual(['heading']);
  });

  it('turns plain text into one paragraph per line and keeps blank lines', () => {
    const doc = importFileToDoc('one\ntwo\n\nthree', 'txt');
    expect(types(doc)).toEqual(['paragraph', 'paragraph', 'paragraph', 'paragraph']);
    expect(extractPlainText(doc)).toContain('one');
    expect(extractPlainText(doc)).toContain('three');
  });

  it('keeps text exactly as written in .txt (no markdown interpretation)', () => {
    const doc = importFileToDoc('# not a heading\n*stars*', 'txt');
    expect(types(doc)).toEqual(['paragraph', 'paragraph']);
    expect(extractPlainText(doc)).toContain('# not a heading');
  });

  it('parses html structure', () => {
    const doc = importFileToDoc('<h2>Hi</h2><p>there <strong>you</strong></p>', 'html');
    expect(types(doc)).toEqual(['heading', 'paragraph']);
  });

  it('drops script and style content and event-handler attributes from html', () => {
    const html =
      '<p onclick="alert(1)">safe</p><script>alert("x")</script><style>p{color:red}</style><img src="x" onerror="alert(1)">';
    const json = JSON.stringify(importFileToDoc(html, 'htm'));
    expect(json).toContain('safe');
    expect(json).not.toContain('alert');
    expect(json).not.toContain('color:red');
    expect(json).not.toContain('onerror');
    expect(json).not.toContain('onclick');
  });

  it('does not keep javascript: links from html', () => {
    const json = JSON.stringify(importFileToDoc('<p><a href="javascript:alert(1)">x</a></p>', 'html'));
    expect(json).not.toContain('javascript:');
  });

  it('returns an empty document for empty input', () => {
    expect(extractPlainText(importFileToDoc('', 'md')).trim()).toBe('');
    expect(extractPlainText(importFileToDoc('   \n', 'txt')).trim()).toBe('');
    expect(importFileToDoc('', 'html').type).toBe('doc');
  });
});

describe('titleFromFileName', () => {
  it('drops the extension and trims', () => {
    expect(titleFromFileName('Meeting notes.md')).toBe('Meeting notes');
    expect(titleFromFileName('  a.b.txt ')).toBe('a.b');
  });
  it('falls back to an empty title for a bare extension', () => {
    expect(titleFromFileName('.md')).toBe('');
  });
});
