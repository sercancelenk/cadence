import { describe, expect, it } from 'vitest';
import { noteBodyPatchIsNoOp, plainTextFromBodyFields } from './richTextBody';
import { serializeRichDoc, EMPTY_RICH_DOC } from './richText';

describe('plainTextFromBodyFields', () => {
  it('returns empty string for empty prosemirror doc, not raw JSON', () => {
    const body = serializeRichDoc(EMPTY_RICH_DOC);
    expect(plainTextFromBodyFields({ body, bodyFormat: 'prosemirror' })).toBe('');
    expect(plainTextFromBodyFields({ body })).toBe('');
  });

  it('detects prosemirror JSON without bodyFormat flag', () => {
    const body = serializeRichDoc({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    });
    expect(plainTextFromBodyFields({ body })).toBe('Hello');
  });

  it('keeps legacy markdown as plain text', () => {
    expect(plainTextFromBodyFields({ body: '# Title\n\nBody', bodyFormat: 'markdown' })).toBe(
      '# Title\n\nBody',
    );
  });
});

describe('noteBodyPatchIsNoOp', () => {
  it('treats editor remount with same plain text as no-op', () => {
    const body = serializeRichDoc(EMPTY_RICH_DOC);
    const current = { body: 'Hello', bodyFormat: 'markdown' as const };
    const next = { body: 'Hello', bodyFormat: 'markdown' as const, bodyPlainText: 'Hello' };
    expect(noteBodyPatchIsNoOp(current, next)).toBe(true);
    expect(
      noteBodyPatchIsNoOp(
        { body, bodyFormat: 'prosemirror' },
        { body: serializeRichDoc({ type: 'doc', content: [{ type: 'paragraph' }] }), bodyFormat: 'prosemirror' },
      ),
    ).toBe(true);
  });

  it('still patches when plain text matches but structure changes (e.g. image)', () => {
    const textDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    };
    const withImage = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        {
          type: 'image',
          attrs: { src: 'cadence-attachment://img-1', attachmentId: 'img-1' },
        },
      ],
    };
    expect(
      noteBodyPatchIsNoOp(
        { body: serializeRichDoc(textDoc), bodyFormat: 'prosemirror' },
        { body: serializeRichDoc(withImage), bodyFormat: 'prosemirror' },
      ),
    ).toBe(false);
  });
});
