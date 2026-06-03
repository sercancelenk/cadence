// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { mergeReminderEventIntoAppData } from './mergeReminderEvent';
import type { AppData } from '../../model';

function base(overrides: Partial<AppData> = {}): AppData {
  return {
    teams: [],
    people: [],
    items: [],
    todoGroups: [],
    todoItems: [],
    notes: [],
    notifiedReminderIds: [],
    ...overrides,
  } as AppData;
}

describe('mergeReminderEventIntoAppData', () => {
  it('merges reminder fields without overwriting local title edits', () => {
    const prev = base({
      todoItems: [
        {
          id: 't1',
          groupId: 'g1',
          title: 'Local edit in progress',
          status: 'todo',
          remindAt: '2026-06-01T10:00:00.000Z',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      notifiedReminderIds: [],
    });
    const disk = base({
      todoItems: [
        {
          id: 't1',
          groupId: 'g1',
          title: 'Stale title from disk',
          status: 'todo',
          remindAt: '2026-06-02T10:00:00.000Z',
          remindRepeat: 'daily',
          createdAt: '2026-01-01',
          updatedAt: '2026-06-02',
        },
      ],
      notifiedReminderIds: ['t1\u00012026-06-01T10:00:00.000Z'],
    });

    const merged = mergeReminderEventIntoAppData(prev, disk);
    expect(merged.todoItems[0].title).toBe('Local edit in progress');
    expect(merged.todoItems[0].remindAt).toBe('2026-06-02T10:00:00.000Z');
    expect(merged.todoItems[0].remindRepeat).toBe('daily');
    expect(merged.notifiedReminderIds).toEqual(disk.notifiedReminderIds);
  });

  it('merges people item reminder fields without touching other fields', () => {
    const prev = base({
      items: [
        {
          id: 'p1',
          personId: 'person-1',
          kind: 'task',
          title: 'Local follow-up',
          body: '',
          done: false,
          remindAt: '2026-06-01T09:00:00.000Z',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    });
    const disk = base({
      items: [
        {
          id: 'p1',
          personId: 'person-1',
          kind: 'task',
          title: 'Disk title',
          body: '',
          done: false,
          remindAt: '2026-06-02T09:00:00.000Z',
          remindRepeat: 'weekly',
          createdAt: '2026-01-01',
          updatedAt: '2026-06-02',
        },
      ],
    });

    const merged = mergeReminderEventIntoAppData(prev, disk);
    expect(merged.items[0].title).toBe('Local follow-up');
    expect(merged.items[0].remindAt).toBe('2026-06-02T09:00:00.000Z');
    expect(merged.items[0].remindRepeat).toBe('weekly');
  });

  it('skips rows when reminder fields already match disk', () => {
    const todo = {
      id: 't1',
      groupId: 'g1',
      title: 'Same',
      status: 'todo' as const,
      remindAt: '2026-06-01T10:00:00.000Z',
      remindRepeat: 'daily' as const,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const prev = base({ todoItems: [todo] });
    const disk = base({ todoItems: [{ ...todo }] });
    const merged = mergeReminderEventIntoAppData(prev, disk);
    expect(merged.todoItems[0]).toBe(prev.todoItems[0]);
  });

  it('leaves todos and items absent on disk unchanged', () => {
    const prev = base({
      todoItems: [
        {
          id: 'only-local',
          groupId: 'g1',
          title: 'X',
          status: 'todo',
          remindAt: '2026-06-01T10:00:00.000Z',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    });
    const merged = mergeReminderEventIntoAppData(prev, base());
    expect(merged.todoItems[0].remindAt).toBe('2026-06-01T10:00:00.000Z');
  });

  it('merges only remindAt when repeat is unchanged on todos', () => {
    const prev = base({
      todoItems: [
        {
          id: 't1',
          groupId: 'g1',
          title: 'Local',
          status: 'todo',
          remindAt: '2026-06-01T10:00:00.000Z',
          remindRepeat: 'daily',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    });
    const disk = base({
      todoItems: [
        {
          id: 't1',
          groupId: 'g1',
          title: 'Disk',
          status: 'todo',
          remindAt: '2026-06-02T10:00:00.000Z',
          remindRepeat: 'daily',
          createdAt: '2026-01-01',
          updatedAt: '2026-06-02',
        },
      ],
    });
    const merged = mergeReminderEventIntoAppData(prev, disk);
    expect(merged.todoItems[0]).toEqual({
      ...prev.todoItems[0],
      remindAt: '2026-06-02T10:00:00.000Z',
    });
    expect(merged.todoItems[0].title).toBe('Local');
  });

  it('merges only remindRepeat when remindAt is unchanged on todos', () => {
    const prev = base({
      todoItems: [
        {
          id: 't1',
          groupId: 'g1',
          title: 'Local',
          status: 'todo',
          remindAt: '2026-06-01T10:00:00.000Z',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    });
    const disk = base({
      todoItems: [
        {
          id: 't1',
          groupId: 'g1',
          title: 'Disk',
          status: 'todo',
          remindAt: '2026-06-01T10:00:00.000Z',
          remindRepeat: 'monthly',
          createdAt: '2026-01-01',
          updatedAt: '2026-06-02',
        },
      ],
    });
    const merged = mergeReminderEventIntoAppData(prev, disk);
    expect(merged.todoItems[0]).toEqual({
      ...prev.todoItems[0],
      remindRepeat: 'monthly',
    });
  });

  it('returns the same todo reference when disk row is missing', () => {
    const prev = base({
      todoItems: [
        {
          id: 'local-only',
          groupId: 'g1',
          title: 'Local',
          status: 'todo',
          remindAt: '2026-06-01T10:00:00.000Z',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    });
    const merged = mergeReminderEventIntoAppData(prev, base());
    expect(merged.todoItems[0]).toBe(prev.todoItems[0]);
  });

  it('skips people items when reminder fields already match disk', () => {
    const item = {
      id: 'p1',
      personId: 'person-1',
      kind: 'task' as const,
      title: 'Same',
      body: '',
      done: false,
      remindAt: '2026-06-01T09:00:00.000Z',
      remindRepeat: 'weekly' as const,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const prev = base({ items: [item] });
    const disk = base({ items: [{ ...item }] });
    const merged = mergeReminderEventIntoAppData(prev, disk);
    expect(merged.items[0]).toBe(prev.items[0]);
  });

  it('returns the same people item reference when disk row is missing', () => {
    const prev = base({
      items: [
        {
          id: 'local-item',
          personId: 'person-1',
          kind: 'task',
          title: 'Local',
          body: '',
          done: false,
          remindAt: '2026-06-01T09:00:00.000Z',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    });
    const merged = mergeReminderEventIntoAppData(prev, base());
    expect(merged.items[0]).toBe(prev.items[0]);
  });

  it('merges only remindAt on people items when repeat matches', () => {
    const prev = base({
      items: [
        {
          id: 'p1',
          personId: 'person-1',
          kind: 'task',
          title: 'Local',
          body: '',
          done: false,
          remindAt: '2026-06-01T09:00:00.000Z',
          remindRepeat: 'weekly',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    });
    const disk = base({
      items: [
        {
          id: 'p1',
          personId: 'person-1',
          kind: 'task',
          title: 'Disk',
          body: '',
          done: false,
          remindAt: '2026-06-03T09:00:00.000Z',
          remindRepeat: 'weekly',
          createdAt: '2026-01-01',
          updatedAt: '2026-06-03',
        },
      ],
    });
    const merged = mergeReminderEventIntoAppData(prev, disk);
    expect(merged.items[0]).toEqual({
      ...prev.items[0],
      remindAt: '2026-06-03T09:00:00.000Z',
    });
    expect(merged.items[0].title).toBe('Local');
  });

  it('merges only remindRepeat on people items when remindAt matches', () => {
    const prev = base({
      items: [
        {
          id: 'p1',
          personId: 'person-1',
          kind: 'task',
          title: 'Local',
          body: '',
          done: false,
          remindAt: '2026-06-01T09:00:00.000Z',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    });
    const disk = base({
      items: [
        {
          id: 'p1',
          personId: 'person-1',
          kind: 'task',
          title: 'Disk',
          body: '',
          done: false,
          remindAt: '2026-06-01T09:00:00.000Z',
          remindRepeat: 'monthly',
          createdAt: '2026-01-01',
          updatedAt: '2026-06-03',
        },
      ],
    });
    const merged = mergeReminderEventIntoAppData(prev, disk);
    expect(merged.items[0]).toEqual({
      ...prev.items[0],
      remindRepeat: 'monthly',
    });
  });
});
