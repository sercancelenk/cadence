import { describe, expect, it } from 'vitest';
import { collectReferencedAttachmentIds, attachmentRefsFromBody } from './richTextAttachmentIndex';
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

  it('ignores legacy markdown bodies', () => {
    const data = baseData();
    data.notes = [
      {
        id: 'n1',
        title: 'T',
        body: '![x](cadence-attachment://should-not-parse)',
        locked: false,
        sortOrder: 0,
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
    ];
    expect(collectReferencedAttachmentIds(data)).toEqual([]);
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
