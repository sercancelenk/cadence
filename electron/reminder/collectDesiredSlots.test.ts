import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { collectFutureSlots, collectPastDueSlots } = require('./collectDesiredSlots.cjs');
const { reminderNotifyKey } = require('./reminderNotify.cjs');

const baseData = {
  notifiedReminderIds: [],
  teams: [{ id: 'team-1', name: 'Eng', createdAt: '2026-01-01T00:00:00.000Z' }],
  people: [{ id: 'person-1', teamId: 'team-1', name: 'Alex', createdAt: '2026-01-01T00:00:00.000Z' }],
  todoGroups: [{ id: 'grp-1', name: 'Inbox', createdAt: '2026-01-01T00:00:00.000Z' }],
  items: [],
  todoItems: [],
};

describe('collectDesiredSlots (electron)', () => {
  it('collects open todo reminders in the future', () => {
    const now = Date.parse('2026-05-31T12:00:00.000Z');
    const data = {
      ...baseData,
      todoItems: [
        {
          id: 't1',
          groupId: 'grp-1',
          title: 'Buy milk',
          status: 'todo',
          remindAt: '2026-05-31T14:00:00.000Z',
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    const slots = collectFutureSlots(data, now);
    expect(slots).toHaveLength(1);
    expect(slots[0].body).toContain('Buy milk');
    expect(slots[0].slotKey).toBe(reminderNotifyKey('t1', '2026-05-31T14:00:00.000Z'));
  });

  it('skips done todos and already notified slots', () => {
    const now = Date.parse('2026-05-31T12:00:00.000Z');
    const remindAt = '2026-05-31T14:00:00.000Z';
    const data = {
      ...baseData,
      notifiedReminderIds: [reminderNotifyKey('t1', remindAt)],
      todoItems: [
        {
          id: 't1',
          groupId: 'grp-1',
          title: 'Done',
          status: 'done',
          remindAt,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 't2',
          groupId: 'grp-1',
          title: 'Pending',
          status: 'todo',
          remindAt,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    expect(collectFutureSlots(data, now)).toHaveLength(1);
    expect(collectFutureSlots(data, now)[0].itemId).toBe('t2');
  });

  it('collects past due for catch-up', () => {
    const now = Date.parse('2026-05-31T15:00:00.000Z');
    const data = {
      ...baseData,
      todoItems: [
        {
          id: 't1',
          groupId: 'grp-1',
          title: 'Late',
          status: 'todo',
          remindAt: '2026-05-31T14:00:00.000Z',
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    const past = collectPastDueSlots(data, now);
    expect(past).toHaveLength(1);
    expect(past[0].title).toBe('Todo reminder');
  });

  it('does not schedule team item with dueAt only (regression)', () => {
    const now = Date.parse('2026-05-31T12:00:00.000Z');
    const data = {
      ...baseData,
      items: [
        {
          id: 'i-due-only',
          personId: 'person-1',
          kind: 'task',
          title: 'Deadline',
          body: '',
          dueAt: '2026-05-31T16:00:00.000Z',
          done: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    expect(collectFutureSlots(data, now)).toHaveLength(0);
  });

  it('does not schedule todo with dueAt only (regression)', () => {
    const now = Date.parse('2026-05-31T12:00:00.000Z');
    const data = {
      ...baseData,
      todoItems: [
        {
          id: 't-due-only',
          groupId: 'grp-1',
          title: 'Deadline',
          status: 'todo',
          dueAt: '2026-05-31T16:00:00.000Z',
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    expect(collectFutureSlots(data, now)).toHaveLength(0);
  });
});
