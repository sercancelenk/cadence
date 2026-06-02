import { describe, expect, it } from 'vitest';
import { collectReferencedAttachmentIds } from './richTextAttachmentIndex';
import { serializeRichDoc } from './richText';
import type { AppData } from '../model';

const baseData = (): AppData =>
  ({
    version: 1,
    teams: [],
    people: [],
    items: [],
    todoGroups: [{ id: 'g1', name: 'Inbox', sortOrder: 0, createdAt: '2020-01-01T00:00:00.000Z' }],
    todoItems: [],
    notes: [],
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

  it('ignores legacy markdown bodies', () => {
    const data = baseData();
    data.notes = [
      {
        id: 'n1',
        title: 'T',
        body: '![x](cadence-attachment://should-not-parse)',
        sortOrder: 0,
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
    ];
    expect(collectReferencedAttachmentIds(data)).toEqual([]);
  });
});
