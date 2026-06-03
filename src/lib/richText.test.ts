import { describe, expect, it } from 'vitest';
import {
  EMPTY_RICH_DOC,
  SAMPLE_RICH_DOC,
  extractPlainText,
  isRichTextOverSoftLimit,
  parseRichDoc,
  serializeRichDoc,
} from './richText';

describe('richText', () => {
  it('extractPlainText walks nested content', () => {
    const text = extractPlainText(SAMPLE_RICH_DOC);
    expect(text).toContain('Editor lab sample');
    expect(text).toContain('Try a checkbox row');
    expect(text).toContain('npm run dev');
  });

  it('serialize + parse round-trips', () => {
    const raw = serializeRichDoc(SAMPLE_RICH_DOC);
    const back = parseRichDoc(raw);
    expect(back?.type).toBe('doc');
    expect(back?.content?.length).toBeGreaterThan(0);
  });

  it('parseRichDoc rejects non-doc JSON', () => {
    expect(parseRichDoc(JSON.stringify({ type: 'paragraph' }))).toBeNull();
    expect(parseRichDoc('not json')).toBeNull();
  });

  it('extractPlainText includes date chips', () => {
    const text = extractPlainText({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Due ' },
            { type: 'dateChip', attrs: { iso: '2026-05-31', label: 'May 31, 2026' } },
          ],
        },
      ],
    });
    expect(text).toContain('May 31, 2026');
  });

  it('empty doc yields empty plain text', () => {
    expect(extractPlainText(EMPTY_RICH_DOC)).toBe('');
    expect(extractPlainText(null)).toBe('');
  });

  it('extractPlainText includes image alt text', () => {
    const text = extractPlainText({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'image', attrs: { alt: '  Diagram  ' } }],
        },
      ],
    });
    expect(text).toBe('Diagram');
  });

  it('isRichTextOverSoftLimit compares against the soft char cap', () => {
    expect(isRichTextOverSoftLimit(100_001)).toBe(true);
    expect(isRichTextOverSoftLimit(100_000)).toBe(false);
  });

  it('parseRichDoc rejects empty and malformed payloads', () => {
    expect(parseRichDoc('')).toBeNull();
    expect(parseRichDoc('null')).toBeNull();
  });
});
