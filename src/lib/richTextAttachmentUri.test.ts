import { describe, expect, it } from 'vitest';
import {
  attachmentUri,
  createAttachmentId,
  isValidAttachmentId,
  parseAttachmentId,
} from './richTextAttachmentUri';
import { normalizeDocAttachmentsForStorage } from './richTextDocAttachments';
import type { RichTextDoc } from './richText';

describe('attachmentUri', () => {
  it('round-trips ids', () => {
    const id = 'lab-editor-lab-abc123456789';
    expect(parseAttachmentId(attachmentUri(id))).toBe(id);
  });

  it('rejects invalid ids', () => {
    expect(isValidAttachmentId('short')).toBe(false);
    expect(parseAttachmentId('https://example.com/x.png')).toBeNull();
  });
});

describe('createAttachmentId', () => {
  it('produces valid ids', () => {
    const id = createAttachmentId('note', 'abc-123');
    expect(isValidAttachmentId(id)).toBe(true);
    expect(id.startsWith('note-abc-123-')).toBe(true);
  });
});

describe('normalizeDocAttachmentsForStorage', () => {
  it('rewrites blob URLs to cadence-attachment pointers', () => {
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: 'blob:http://localhost/abc',
            attachmentId: 'lab-editor-lab-abc123456789',
          },
        },
      ],
    };
    const out = normalizeDocAttachmentsForStorage(doc);
    const img = out.content?.[0];
    expect(img?.attrs?.src).toBe(attachmentUri('lab-editor-lab-abc123456789'));
  });
});
