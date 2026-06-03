import { describe, expect, it } from 'vitest';
import {
  appendPlainTextToBodyFields,
  backfillBodyPlainText,
  canonicalDocSignature,
  emptyRichBodyFields,
  noteBodyPatchIsNoOp,
  parseBodyFormat,
  plainTextFromBodyFields,
  richTextPayloadToBodyFields,
} from './richTextBody';
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

describe('canonicalDocSignature', () => {
  it('matches editor body with trailing space (avoids caret-reset echo)', () => {
    const doc = {
      type: 'doc' as const,
      content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'hello ' }] }],
    };
    const body = serializeRichDoc(doc);
    expect(canonicalDocSignature(body, 'prosemirror')).toBe(canonicalDocSignature(doc, 'prosemirror'));
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

describe('richTextPayloadToBodyFields', () => {
  it('serialises doc and trims plain text', () => {
    const fields = richTextPayloadToBodyFields({
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '  Hello  ' }] }],
      },
      plainText: '  Hello  ',
    });
    expect(fields.bodyFormat).toBe('prosemirror');
    expect(fields.bodyPlainText).toBe('Hello');
    expect(JSON.parse(fields.body).type).toBe('doc');
  });

  it('drops empty plain text', () => {
    const fields = richTextPayloadToBodyFields({ doc: EMPTY_RICH_DOC, plainText: '   ' });
    expect(fields.bodyPlainText).toBeUndefined();
  });
});

describe('emptyRichBodyFields', () => {
  it('returns an empty prosemirror document', () => {
    const fields = emptyRichBodyFields();
    expect(fields.bodyFormat).toBe('prosemirror');
    expect(fields.bodyPlainText).toBeUndefined();
    expect(plainTextFromBodyFields(fields)).toBe('');
  });
});

describe('appendPlainTextToBodyFields', () => {
  it('returns current fields unchanged when append text is blank', () => {
    const current = { body: 'Hi', bodyFormat: 'markdown' as const };
    expect(appendPlainTextToBodyFields(current, '   ')).toEqual(current);
  });

  it('appends to prosemirror with a horizontal rule separator', () => {
    const doc = {
      type: 'doc' as const,
      content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'First' }] }],
    };
    const current = { body: serializeRichDoc(doc), bodyFormat: 'prosemirror' as const };
    const next = appendPlainTextToBodyFields(current, 'Second part');
    expect(next.bodyFormat).toBe('prosemirror');
    expect(plainTextFromBodyFields(next)).toContain('First');
    expect(plainTextFromBodyFields(next)).toContain('Second part');
    const parsed = JSON.parse(next.body);
    expect(parsed.content.some((n: { type: string }) => n.type === 'horizontalRule')).toBe(true);
  });

  it('appends markdown with --- separator', () => {
    const next = appendPlainTextToBodyFields(
      { body: 'Existing', bodyFormat: 'markdown' },
      'New block',
    );
    expect(next.body).toBe('Existing\n\n---\n\nNew block');
    expect(next.bodyPlainText).toBe('Existing\n\n---\n\nNew block');
  });

  it('uses incoming text as body when current is empty markdown', () => {
    const next = appendPlainTextToBodyFields({ body: '', bodyFormat: 'markdown' }, 'Only');
    expect(next.body).toBe('Only');
  });
});

describe('parseBodyFormat', () => {
  it('accepts known formats only', () => {
    expect(parseBodyFormat('markdown')).toBe('markdown');
    expect(parseBodyFormat('prosemirror')).toBe('prosemirror');
    expect(parseBodyFormat('html')).toBeUndefined();
    expect(parseBodyFormat(null)).toBeUndefined();
  });
});

describe('backfillBodyPlainText', () => {
  it('returns fields unchanged when plain text already set', () => {
    const fields = { body: '{}', bodyFormat: 'prosemirror' as const, bodyPlainText: 'Cached' };
    expect(backfillBodyPlainText(fields)).toBe(fields);
  });

  it('derives plain text from body when missing', () => {
    const body = serializeRichDoc({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Derived' }] }],
    });
    const result = backfillBodyPlainText({ body, bodyFormat: 'prosemirror' });
    expect(result.bodyPlainText).toBe('Derived');
  });

  it('leaves fields unchanged when derived plain text is empty', () => {
    const fields = { body: serializeRichDoc(EMPTY_RICH_DOC), bodyFormat: 'prosemirror' as const };
    expect(backfillBodyPlainText(fields)).toBe(fields);
  });
});

describe('plainTextFromBodyFields — remaining branches', () => {
  it('prefers trimmed bodyPlainText over body content', () => {
    expect(
      plainTextFromBodyFields({
        body: '{"type":"doc"}',
        bodyFormat: 'prosemirror',
        bodyPlainText: '  Cached  ',
      }),
    ).toBe('Cached');
  });

  it('returns empty string for invalid prosemirror JSON without bodyFormat', () => {
    expect(plainTextFromBodyFields({ body: '{not-json' })).toBe('{not-json');
  });

  it('returns markdown body even when it looks like JSON', () => {
    expect(
      plainTextFromBodyFields({ body: '{"type":"doc"}', bodyFormat: 'markdown' }),
    ).toBe('{"type":"doc"}');
  });
});

describe('appendPlainTextToBodyFields — prosemirror edge cases', () => {
  it('appends to an empty prosemirror body without a horizontal rule', () => {
    const emptyDoc = { type: 'doc' as const, content: [] };
    const next = appendPlainTextToBodyFields(
      { body: serializeRichDoc(emptyDoc), bodyFormat: 'prosemirror' },
      'First line',
    );
    expect(next.bodyFormat).toBe('prosemirror');
    expect(plainTextFromBodyFields(next)).toBe('First line');
    const parsed = JSON.parse(next.body);
    expect(parsed.content.some((n: { type: string }) => n.type === 'horizontalRule')).toBe(false);
  });

  it('defaults bodyFormat to markdown when appending to empty legacy body', () => {
    const next = appendPlainTextToBodyFields({ body: '' }, 'Only');
    expect(next).toEqual({
      body: 'Only',
      bodyFormat: 'markdown',
      bodyPlainText: 'Only',
    });
  });
});

describe('noteBodyPatchIsNoOp — field equality branches', () => {
  it('returns true when body, format, and bodyPlainText are identical', () => {
    const fields = {
      body: 'Same',
      bodyFormat: 'markdown' as const,
      bodyPlainText: 'Same',
    };
    expect(noteBodyPatchIsNoOp(fields, { ...fields })).toBe(true);
  });

  it('returns false when body text changes for markdown', () => {
    expect(
      noteBodyPatchIsNoOp(
        { body: 'A', bodyFormat: 'markdown' },
        { body: 'B', bodyFormat: 'markdown' },
      ),
    ).toBe(false);
  });
});
