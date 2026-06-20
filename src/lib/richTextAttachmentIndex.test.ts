import { describe, expect, it } from 'vitest';
import {
  collectReferencedAttachmentIds,
  attachmentRefsFromBody,
  attachmentRefsFromAnyBody,
} from './richTextAttachmentIndex';
import { serializeRichDoc } from './richText';
import type { AppData } from '../model';

const baseData = (): AppData =>
  ({
    version: 3,
    teams: [],
    people: [],
    items: [],
    notifiedReminderIds: [],
    todoGroups: [{ id: 'g1', name: 'Inbox', sortOrder: 0, createdAt: '2020-01-01T00:00:00.000Z' }],
    todoItems: [],
    notes: [],
    noteGroups: [],
  }) as AppData;

describe('collectReferencedAttachmentIds', () => {
  it('collects ids from prosemirror note and todo bodies', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            attachmentId: 'note-abc-111111111111',
            src: 'cadence-attachment://note-abc-111111111111',
          },
        },
      ],
    };
    const data = baseData();
    data.notes = [
      {
        id: 'n1',
        title: 'T',
        body: serializeRichDoc(doc),
        bodyFormat: 'prosemirror',
        locked: false,
        sortOrder: 0,
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
    ];
    data.todoItems = [
      {
        id: 't1',
        groupId: 'g1',
        title: 'Task',
        body: serializeRichDoc({
          type: 'doc',
          content: [
            {
              type: 'image',
              attrs: {
                src: 'cadence-attachment://todo-xyz-222222222222',
              },
            },
          ],
        }),
        bodyFormat: 'prosemirror',
        status: 'todo',
        done: false,
        sortOrder: 0,
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
    ];
    const ids = collectReferencedAttachmentIds(data);
    expect(ids).toContain('note-abc-111111111111');
    expect(ids).toContain('todo-xyz-222222222222');
  });

  it('collects ids from utilities document body', () => {
    const data = baseData();
    data.utilityDocument = {
      body: serializeRichDoc({
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              attachmentId: 'utility-scratch-333333333333',
              src: 'cadence-attachment://utility-scratch-333333333333',
            },
          },
        ],
      }),
      bodyFormat: 'prosemirror',
      updatedAt: '2020-01-01T00:00:00.000Z',
    };
    expect(collectReferencedAttachmentIds(data)).toContain('utility-scratch-333333333333');
  });

  it('collects explicit attachmentRefs on notes', () => {
    const data = baseData();
    data.notes = [
      {
        id: 'n1',
        title: 'T',
        body: '',
        locked: false,
        sortOrder: 0,
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
        attachmentRefs: ['note-sidecar-123456789'],
      },
    ];
    expect(collectReferencedAttachmentIds(data)).toEqual(['note-sidecar-123456789']);
  });

  it('collects attachment refs from legacy markdown bodies (so GC cannot delete them)', () => {
    const data = baseData();
    data.notes = [
      {
        id: 'n1',
        title: 'T',
        body: '![x](cadence-attachment://note-legacy-12345678)',
        locked: false,
        sortOrder: 0,
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
    ];
    expect(collectReferencedAttachmentIds(data)).toEqual(['note-legacy-12345678']);
  });

  it('ignores invalid attachmentRefs entries', () => {
    const data = baseData();
    data.notes = [
      {
        id: 'n1',
        title: 'T',
        body: '',
        locked: false,
        sortOrder: 0,
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
        // 'bad' is too short to be a valid attachment id; must not be trusted.
        attachmentRefs: ['note-sidecar-123456789', 'bad'],
      },
    ];
    expect(collectReferencedAttachmentIds(data)).toEqual(['note-sidecar-123456789']);
  });
});

describe('attachmentRefsFromBody', () => {
  it('returns ids from a prosemirror body', () => {
    const body = serializeRichDoc({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { attachmentId: 'note-only-1234567890', src: 'cadence-attachment://note-only-1234567890' },
        },
      ],
    });
    expect(attachmentRefsFromBody(body, 'prosemirror')).toEqual(['note-only-1234567890']);
    expect(attachmentRefsFromBody('plain', undefined)).toEqual([]);
  });
});

describe('attachmentRefsFromAnyBody', () => {
  it('extracts ids from prosemirror bodies (delegates to structural scan)', () => {
    const body = serializeRichDoc({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { attachmentId: 'pm-image-1234567890', src: 'cadence-attachment://pm-image-1234567890' },
        },
      ],
    });
    expect(attachmentRefsFromAnyBody(body, 'prosemirror')).toEqual(['pm-image-1234567890']);
  });

  it('extracts ids from markdown bodies that prosemirror scan would miss', () => {
    const md = 'Here is an image ![alt](cadence-attachment://md-image-1234567890) inline.';
    expect(attachmentRefsFromBody(md, 'markdown')).toEqual([]); // prosemirror-only scan misses it
    expect(attachmentRefsFromAnyBody(md, 'markdown')).toEqual(['md-image-1234567890']);
  });

  it('extracts ids from inline HTML images embedded in markdown', () => {
    const md = '<img src="cadence-attachment://html-img-1234567890" alt="x" />';
    expect(attachmentRefsFromAnyBody(md, 'markdown')).toEqual(['html-img-1234567890']);
  });

  it('returns an empty array for markdown with no attachment URIs', () => {
    expect(attachmentRefsFromAnyBody('just text', 'markdown')).toEqual([]);
    expect(attachmentRefsFromAnyBody(undefined, undefined)).toEqual([]);
  });

  it('ignores malformed attachment ids (too short)', () => {
    expect(attachmentRefsFromAnyBody('![x](cadence-attachment://short)', 'markdown')).toEqual([]);
  });

  it('dedupes repeated references', () => {
    const md =
      '![a](cadence-attachment://dup-image-1234567890) and again ![b](cadence-attachment://dup-image-1234567890)';
    expect(attachmentRefsFromAnyBody(md, 'markdown')).toEqual(['dup-image-1234567890']);
  });
});
