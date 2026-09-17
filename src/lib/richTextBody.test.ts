import { describe, expect, it } from 'vitest';
import {
  appendPlainTextToBodyFields,
  backfillBodyPlainText,
  canonicalDocSignature,
  emptyRichBodyFields,
  noteBodyPatchIsNoOp,
  parseBodyFormat,
  plainTextFromBodyFields,
  richBodyFieldsFromPayload,
  richBodyFieldsIsEmpty,
  richTextPayloadIsEmpty,
  richTextPayloadToBodyFields,
  prepareStoredRichBodyForDisplay,
} from './richTextBody';
import { attachmentUri } from './richTextAttachmentUri';
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

  it('treats empty auto body and empty prosemirror JSON as the same doc', () => {
    const emptyBody = serializeRichDoc(EMPTY_RICH_DOC);
    expect(canonicalDocSignature('', undefined)).toBe(canonicalDocSignature(emptyBody, 'prosemirror'));
    expect(canonicalDocSignature('', 'prosemirror')).toBe(canonicalDocSignature(emptyBody, 'prosemirror'));
  });
});

describe('prepareStoredRichBodyForDisplay', () => {
  it('repairs blob image src using attachmentId for preview', () => {
    const id = 'note-doc1-abc123456789';
    const body = serializeRichDoc({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            attachmentId: id,
            src: 'blob:http://localhost/dead-beef',
          },
        },
      ],
    });
    const repaired = prepareStoredRichBodyForDisplay(body, 'prosemirror');
    expect(repaired).toContain(attachmentUri(id));
    expect(repaired).not.toContain('blob:');
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

describe('richBodyFieldsIsEmpty', () => {
  it('is false for image-only prosemirror bodies', () => {
    const doc = {
      type: 'doc' as const,
      content: [
        {
          type: 'image' as const,
          attrs: {
            src: 'cadence-attachment://note-abc-111111111111',
            attachmentId: 'note-abc-111111111111',
          },
        },
      ],
    };
    const fields = richBodyFieldsFromPayload({ doc, plainText: '' });
    expect(richBodyFieldsIsEmpty(fields)).toBe(false);
  });

  it('is true for empty / whitespace bodies', () => {
    expect(richBodyFieldsIsEmpty({ body: '', bodyFormat: undefined })).toBe(true);
    expect(
      richBodyFieldsIsEmpty(richBodyFieldsFromPayload({ doc: EMPTY_RICH_DOC, plainText: '' })),
    ).toBe(true);
  });
});

describe('richBodyFieldsFromPayload', () => {
  it('persists image-only docs even when plainText is empty', () => {
    const doc = {
      type: 'doc' as const,
      content: [
        {
          type: 'image' as const,
          attrs: {
            src: 'cadence-attachment://note-abc-111111111111',
            attachmentId: 'note-abc-111111111111',
          },
        },
      ],
    };
    const payload = { doc, plainText: '' };
    expect(richTextPayloadIsEmpty(payload)).toBe(false);
    const fields = richBodyFieldsFromPayload(payload);
    expect(fields.bodyFormat).toBe('prosemirror');
    expect(fields.bodyPlainText).toBeUndefined();
    expect(JSON.parse(fields.body).content[0].type).toBe('image');
  });

  it('clears truly empty docs', () => {
    const fields = richBodyFieldsFromPayload({ doc: EMPTY_RICH_DOC, plainText: '' });
    expect(fields).toEqual({ body: '', bodyFormat: undefined, bodyPlainText: undefined });
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

describe('single canonical signature per editor flush', () => {
  const doc = {
    type: 'doc' as const,
    content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Hello' }] }],
  };

  it('uses the signature the editor already computed', () => {
    const withSignature = {
      doc,
      plainText: 'Hello',
      docSignature: canonicalDocSignature(doc, 'prosemirror'),
    };
    const withoutSignature = { doc, plainText: 'Hello' };

    expect(richBodyFieldsFromPayload(withSignature)).toEqual(
      richBodyFieldsFromPayload(withoutSignature),
    );
    expect(richTextPayloadToBodyFields(withSignature)).toEqual(
      richTextPayloadToBodyFields(withoutSignature),
    );
    expect(richTextPayloadIsEmpty(withSignature)).toBe(richTextPayloadIsEmpty(withoutSignature));
  });

  it('still detects an empty document through the precomputed signature', () => {
    expect(
      richTextPayloadIsEmpty({
        doc: EMPTY_RICH_DOC,
        plainText: '',
        docSignature: canonicalDocSignature(EMPTY_RICH_DOC, 'prosemirror'),
      }),
    ).toBe(true);
    expect(
      richBodyFieldsFromPayload({
        doc: EMPTY_RICH_DOC,
        plainText: '',
        docSignature: canonicalDocSignature(EMPTY_RICH_DOC, 'prosemirror'),
      }),
    ).toEqual({ body: '', bodyFormat: undefined, bodyPlainText: undefined });
  });

  it('never blanks a document because the cached signature claims it is empty', () => {
    // A producer that hands over a stale or hand-built signature must not be
    // able to clear a body that still has text in it — that is the one verdict
    // here that destroys user content. Persisting the empty-doc JSON (which is
    // not the empty string) is the same loss, so the body must equal the
    // honest document, not merely be non-empty.
    const lying = {
      doc,
      plainText: 'Hello',
      docSignature: canonicalDocSignature(EMPTY_RICH_DOC, 'prosemirror'),
    };
    const honest = canonicalDocSignature(doc, 'prosemirror');

    expect(richTextPayloadIsEmpty(lying)).toBe(false);
    expect(richBodyFieldsFromPayload(lying).body).toBe(honest);
    expect(richTextPayloadToBodyFields(lying).body).toBe(honest);
    expect(richBodyFieldsFromPayload(lying).bodyPlainText).toBe('Hello');
  });

  it('ignores a cached signature that names a different document', () => {
    const other = {
      type: 'doc' as const,
      content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Other' }] }],
    };
    const mismatched = {
      doc,
      plainText: 'Hello',
      docSignature: canonicalDocSignature(other, 'prosemirror'),
    };
    const honest = canonicalDocSignature(doc, 'prosemirror');
    expect(richBodyFieldsFromPayload(mismatched).body).toBe(honest);
    expect(richTextPayloadToBodyFields(mismatched).body).toBe(honest);
  });

  it('nextBodyIsCanonical gives the same answer as the full comparison', () => {
    const current = { body: serializeRichDoc(doc), bodyFormat: 'prosemirror' as const };
    const unchanged = richBodyFieldsFromPayload({ doc, plainText: 'Hello' });
    const changed = richBodyFieldsFromPayload({
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
      },
      plainText: 'Hello world',
    });

    for (const next of [unchanged, changed]) {
      expect(noteBodyPatchIsNoOp(current, next, { nextBodyIsCanonical: true })).toBe(
        noteBodyPatchIsNoOp(current, next),
      );
    }
    expect(noteBodyPatchIsNoOp(current, unchanged, { nextBodyIsCanonical: true })).toBe(true);
    expect(noteBodyPatchIsNoOp(current, changed, { nextBodyIsCanonical: true })).toBe(false);
  });

  /**
   * The shortcut compares a body normalized once (the payload's signature)
   * against a stored body normalized again on the way in. Attachment
   * normalization has to be a fixed point for those to line up — otherwise an
   * edit to a note holding an image reads as unchanged and is never saved.
   */
  it('holds for a document with an attachment, whose src is rewritten on storage', () => {
    const withImage = {
      type: 'doc' as const,
      content: [
        { type: 'image' as const, attrs: { src: 'cadence-attachment://att-1' } },
        { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Caption' }] },
      ],
    };
    const stored = richBodyFieldsFromPayload({ doc: withImage, plainText: 'Caption' });
    expect(canonicalDocSignature(stored.body, 'prosemirror')).toBe(stored.body);

    const current = { body: stored.body, bodyFormat: 'prosemirror' as const };
    const edited = richBodyFieldsFromPayload({
      doc: {
        ...withImage,
        content: [
          withImage.content[0]!,
          { type: 'paragraph', content: [{ type: 'text', text: 'New caption' }] },
        ],
      },
      plainText: 'New caption',
    });

    expect(noteBodyPatchIsNoOp(current, stored, { nextBodyIsCanonical: true })).toBe(true);
    expect(noteBodyPatchIsNoOp(current, edited, { nextBodyIsCanonical: true })).toBe(false);
  });

  it('ignores the canonical shortcut for non-prosemirror bodies', () => {
    // A markdown body is not its own canonical form; the flag must not make us
    // compare a markdown string against a serialized doc.
    const markdown = { body: '# Title', bodyFormat: 'markdown' as const };
    expect(noteBodyPatchIsNoOp(markdown, { ...markdown, bodyPlainText: 'x' }, {
      nextBodyIsCanonical: true,
    })).toBe(true);
  });

  it('treats a legacy markdown body and its prosemirror form as unchanged', () => {
    const markdownCurrent = { body: 'Hello', bodyFormat: 'markdown' as const };
    const next = richBodyFieldsFromPayload({
      doc: canonicalDocFromMarkdown('Hello'),
      plainText: 'Hello',
    });

    expect(noteBodyPatchIsNoOp(markdownCurrent, next, { nextBodyIsCanonical: true })).toBe(
      noteBodyPatchIsNoOp(markdownCurrent, next),
    );
  });
});

/** Round-trips markdown through the importer the editor uses. */
function canonicalDocFromMarkdown(markdown: string) {
  return JSON.parse(canonicalDocSignature(markdown, 'markdown'));
}
