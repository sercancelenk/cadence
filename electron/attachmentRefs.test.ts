import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { collectReferencedAttachmentIdsFromPayload, sanitizeAttachmentId } = require('./attachmentRefs.cjs');

const pm = (id: string) =>
  JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { attachmentId: id, src: `cadence-attachment://${id}` } }] });
const ids = (payload: unknown) => [...collectReferencedAttachmentIdsFromPayload(payload)].sort();

describe('sanitizeAttachmentId', () => {
  it('accepts safe ids and rejects the rest', () => {
    expect(sanitizeAttachmentId('note-abc-12345678')).toBe('note-abc-12345678');
    expect(sanitizeAttachmentId('../etc/passwd')).toBeNull();
    expect(sanitizeAttachmentId('short')).toBeNull();
    expect(sanitizeAttachmentId(undefined)).toBeNull();
  });
});

describe('collectReferencedAttachmentIdsFromPayload', () => {
  it('finds images referenced only from a document tab', () => {
    const payload = {
      utilityDocumentTabs: [
        { id: 't1', body: '', bodyFormat: undefined },
        { id: 't2', body: pm('tab-image-11111111'), bodyFormat: 'prosemirror' },
      ],
    };
    expect(ids(payload)).toEqual(['tab-image-11111111']);
  });

  it('finds markdown-format tab bodies and the legacy document', () => {
    const payload = {
      utilityDocument: { body: pm('legacy-image-2222222'), bodyFormat: 'prosemirror' },
      utilityDocumentTabs: [{ id: 't1', body: '![a](cadence-attachment://md-tab-image-333333)' }],
    };
    expect(ids(payload)).toEqual(['legacy-image-2222222', 'md-tab-image-333333']);
  });

  it('keeps scanning notes, todos, items and people as before', () => {
    const payload = {
      notes: [{ body: pm('note-image-44444444'), bodyFormat: 'prosemirror', attachmentRefs: ['locked-ref-55555555', 'bad id'] }],
      todoItems: [{ body: pm('todo-image-66666666'), bodyFormat: 'prosemirror' }],
      items: [{ body: '![x](cadence-attachment://item-image-77777777)' }],
      people: [{ scratchpad: pm('person-image-8888888'), scratchpadFormat: 'prosemirror', agenda: '' }],
    };
    expect(ids(payload)).toEqual([
      'item-image-77777777',
      'locked-ref-55555555',
      'note-image-44444444',
      'person-image-8888888',
      'todo-image-66666666',
    ]);
  });

  it('falls back to the raw URI scan for a malformed prosemirror body', () => {
    const payload = { utilityDocumentTabs: [{ id: 't', body: '{broken cadence-attachment://fallback-image-999999', bodyFormat: 'prosemirror' }] };
    expect(ids(payload)).toEqual(['fallback-image-999999']);
  });

  it('does not throw on missing collections or junk', () => {
    expect(ids(undefined)).toEqual([]);
    expect(ids({ notes: null, utilityDocumentTabs: 'x' })).toEqual([]);
  });
});
