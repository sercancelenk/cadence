import { describe, expect, it } from 'vitest';
import type { RichTextDoc } from './richText';
import { serializeRichNodesToClipboardPlainText } from './richTextClipboard';
import {
  exportNoteContent,
  exportFileName,
  NOTE_EXPORT_FORMATS,
  parseNoteExportFormat,
} from './noteExport';

const p = (text: string, marks?: { type: string; attrs?: Record<string, unknown> }[]): RichTextDoc => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});
const doc = (...content: RichTextDoc[]): RichTextDoc => ({ type: 'doc', content });

describe('exportNoteContent markdown', () => {
  it('writes the title as an H1 followed by the body', () => {
    expect(exportNoteContent(doc(p('hello')), 'My note', 'md')).toBe('# My note\n\nhello\n');
  });

  it('keeps headings, inline marks and links', () => {
    const d = doc(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Sub' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'it', marks: [{ type: 'italic' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'x', marks: [{ type: 'code' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://a.test' } }] },
        ],
      },
    );
    expect(exportNoteContent(d, 'T', 'md')).toBe(
      '# T\n\n## Sub\n\n**bold** *it* `x` [site](https://a.test)\n',
    );
  });

  it('renders bullet, ordered and task lists with nesting', () => {
    const li = (...c: RichTextDoc[]): RichTextDoc => ({ type: 'listItem', content: c });
    const d = doc(
      { type: 'bulletList', content: [li(p('a'), { type: 'bulletList', content: [li(p('b'))] })] },
      { type: 'orderedList', content: [li(p('one')), li(p('two'))] },
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: true }, content: [p('done')] },
          { type: 'taskItem', attrs: { checked: false }, content: [p('todo')] },
        ],
      },
    );
    expect(exportNoteContent(d, 'T', 'md')).toBe(
      ['# T', '', '- a\n  - b', '', '1. one\n2. two', '', '- [x] done\n- [ ] todo', ''].join('\n'),
    );
  });

  it('fences code blocks with their language and quotes blockquotes', () => {
    const d = doc(
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1;' }] },
      { type: 'blockquote', content: [p('quoted')] },
    );
    expect(exportNoteContent(d, 'T', 'md')).toBe('# T\n\n```ts\nconst a = 1;\n```\n\n> quoted\n');
  });

  it('renders tables with a header separator and escapes pipes', () => {
    const cell = (type: string, t: string): RichTextDoc => ({ type, content: [p(t)] });
    const d = doc({
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'h1'), cell('tableHeader', 'h|2')] },
        { type: 'tableRow', content: [cell('tableCell', 'c1'), cell('tableCell', 'c2')] },
      ],
    });
    expect(exportNoteContent(d, 'T', 'md')).toBe(
      '# T\n\n| h1 | h\\|2 |\n| --- | --- |\n| c1 | c2 |\n',
    );
  });

  it('replaces images with a text placeholder instead of an unusable attachment link', () => {
    const d = doc({ type: 'image', attrs: { src: 'cadence-attachment://abc', alt: 'cat' } });
    expect(exportNoteContent(d, 'T', 'md')).toBe('# T\n\n[image: cat]\n');
  });

  it('escapes markdown control characters in plain text', () => {
    expect(exportNoteContent(doc(p('2*3*4 a_b')), 'T', 'md')).toBe('# T\n\n2\\*3\\*4 a\\_b\n');
  });

  it('still produces a valid file for an empty document and blank title', () => {
    expect(exportNoteContent(doc(), '   ', 'md')).toBe('# New note\n');
  });
});

describe('exportNoteContent txt', () => {
  it('uses the clipboard plain-text serializer after the title', () => {
    const d = doc(p('line one'), p('line two'));
    const expected = serializeRichNodesToClipboardPlainText([d]);
    expect(exportNoteContent(d, 'Title', 'txt')).toBe(`Title\n\n${expected}\n`);
  });
});

describe('exportNoteContent html', () => {
  it('escapes markup in text and title so a note cannot inject script', () => {
    const html = exportNoteContent(doc(p('<script>alert(1)</script>')), '<b>t</b>', 'html');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<title>&lt;b&gt;t&lt;/b&gt;</title>');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('wraps rendered body in a complete html document', () => {
    const html = exportNoteContent(doc(p('hi')), 'T', 'html');
    expect(html).toContain('<h1>T</h1>');
    expect(html).toContain('<p>hi</p>');
    expect(html).toContain('<meta charset="utf-8">');
  });
});

describe('format helpers', () => {
  it('lists md first as the default and gives each format an extension', () => {
    expect(NOTE_EXPORT_FORMATS.map((f) => f.value)).toEqual(['md', 'txt', 'html']);
    expect(NOTE_EXPORT_FORMATS.map((f) => f.ext)).toEqual(['md', 'txt', 'html']);
  });

  it('parses stored preference and falls back to md', () => {
    expect(parseNoteExportFormat('html')).toBe('html');
    expect(parseNoteExportFormat('pdf')).toBe('md');
    expect(parseNoteExportFormat(null)).toBe('md');
  });

  it('builds a safe file name from the note title', () => {
    expect(exportFileName('A/B: C?', 'md')).toBe('A-B- C-.md');
    expect(exportFileName('   ', 'txt')).toBe('New note.txt');
    expect(exportFileName('x'.repeat(200), 'html').length).toBe(125);
  });
});
