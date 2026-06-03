// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { EMPTY_RICH_DOC, parseRichDoc } from './richText';
import { markdownToRichDoc, resolveRichTextContent } from './richTextImport';

describe('richTextImport', () => {
  it('imports legacy markdown into a doc node', () => {
    const doc = markdownToRichDoc('## Hello\n\n**bold** text');
    expect(doc.type).toBe('doc');
    expect(doc.content?.length).toBeGreaterThan(0);
  });

  it('resolveRichTextContent treats unknown format as markdown (legacy default)', () => {
    const doc = resolveRichTextContent('## Legacy\n\n- item');
    expect(doc.type).toBe('doc');
  });

  it('resolveRichTextContent reads prosemirror JSON strings', () => {
    const raw = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
    });
    const doc = resolveRichTextContent(raw, 'prosemirror');
    expect(parseRichDoc(raw)).toEqual(doc);
  });

  it('imports GFM task list checkboxes', () => {
    const doc = markdownToRichDoc('- [ ] open\n- [x] done');
    const json = JSON.stringify(doc);
    expect(json).toContain('taskList');
    expect(json).toContain('done');
  });

  it('returns EMPTY_RICH_DOC for blank markdown', () => {
    expect(markdownToRichDoc('   ')).toEqual(EMPTY_RICH_DOC);
  });

  it('resolveRichTextContent handles in-memory docs and invalid objects', () => {
    const doc = { type: 'doc' as const, content: [] };
    expect(resolveRichTextContent(doc)).toBe(doc);
    expect(resolveRichTextContent({ type: 'paragraph' } as never)).toEqual(EMPTY_RICH_DOC);
    expect(resolveRichTextContent(null)).toEqual(EMPTY_RICH_DOC);
    expect(resolveRichTextContent('', 'markdown')).toEqual(EMPTY_RICH_DOC);
  });

  it('resolveRichTextContent uses explicit markdown format', () => {
    const doc = resolveRichTextContent('# Title', 'markdown');
    expect(doc.type).toBe('doc');
    expect(doc.content?.length).toBeGreaterThan(0);
  });
});
