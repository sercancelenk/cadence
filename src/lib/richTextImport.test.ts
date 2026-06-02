import { describe, expect, it } from 'vitest';
import { SAMPLE_LEGACY_MARKDOWN, parseRichDoc } from './richText';
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
  });
});
