import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { collectFutureReminderSlots } from './collectReminderSlots';
import type { AppData } from '../../core/model';
import { reminderNotifyKey } from '../reminderNotify';

const require = createRequire(import.meta.url);
const { collectFutureSlots } = require('../../../electron/reminder/collectDesiredSlots.cjs');

const NOW = Date.parse('2026-05-31T12:00:00.000Z');
const FUTURE_REMIND = '2026-05-31T14:00:00.000Z';
const FUTURE_REMIND_LATER = '2026-05-31T16:00:00.000Z';
const FUTURE_DUE = '2026-05-31T16:00:00.000Z';
const AT_NOW = '2026-05-31T12:00:00.000Z';
const PAST_REMIND = '2026-05-31T10:00:00.000Z';

function baseData(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 3,
    notifiedReminderIds: [],
    teams: [{ id: 'team-1', name: 'Eng', createdAt: '2026-01-01T00:00:00.000Z' }],
    people: [{ id: 'person-1', teamId: 'team-1', name: 'Alex', createdAt: '2026-01-01T00:00:00.000Z' }],
    todoGroups: [
      { id: 'grp-1', name: 'Inbox', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z', priority: 'normal' },
    ],
    items: [],
    todoItems: [],
    notes: [],
    lastTeamId: null,
    utilityDocument: { title: '', body: '', updatedAt: '2026-05-31T12:00:00.000Z' },
    utilityStructuredText: { title: '', body: '', updatedAt: '2026-05-31T12:00:00.000Z' },
    userProfile: { displayName: '', updatedAt: '2026-05-31T12:00:00.000Z' },
    aiSettings: { provider: 'none', updatedAt: '2026-05-31T12:00:00.000Z' },
    ...overrides,
  } as AppData;
}

function expectNoFutureSlots(data: AppData) {
  expect(collectFutureReminderSlots(data, NOW)).toHaveLength(0);
  expect(collectFutureSlots(data, NOW)).toHaveLength(0);
}

describe('collectFutureReminderSlots — due vs remind isolation', () => {
  it('does not schedule a todo that only has dueAt (regression: due must not notify)', () => {
    const data = baseData({
      todoItems: [
        {
          id: 't-due-only',
          groupId: 'grp-1',
          title: 'Deadline only',
          status: 'todo',
          done: false,
          dueAt: FUTURE_DUE,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expectNoFutureSlots(data);
  });

  it('does not schedule a team item that only has dueAt', () => {
    const data = baseData({
      items: [
        {
          id: 'i-due-only',
          personId: 'person-1',
          kind: 'task',
          title: 'Team deadline',
          body: '',
          dueAt: FUTURE_DUE,
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expectNoFutureSlots(data);
  });

  it('schedules a todo with remindAt', () => {
    const data = baseData({
      todoItems: [
        {
          id: 't1',
          groupId: 'grp-1',
          title: 'Buy milk',
          status: 'todo',
          done: false,
          remindAt: FUTURE_REMIND,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    const tsSlots = collectFutureReminderSlots(data, NOW);
    const cjsSlots = collectFutureSlots(data, NOW);
    expect(tsSlots).toHaveLength(1);
    expect(cjsSlots).toHaveLength(1);
    expect(tsSlots[0].slotKey).toBe(reminderNotifyKey('t1', FUTURE_REMIND));
    expect(tsSlots[0].deepLinkPath).toBe('/todos?focus=t1');
    expect(tsSlots.map((s) => s.slotKey)).toEqual(cjsSlots.map((s: { slotKey: string }) => s.slotKey));
  });

  it('schedules a team item with remindAt even when dueAt differs', () => {
    const data = baseData({
      items: [
        {
          id: 'i1',
          personId: 'person-1',
          kind: 'task',
          title: 'Follow up',
          body: '',
          remindAt: FUTURE_REMIND,
          dueAt: FUTURE_DUE,
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    const tsSlots = collectFutureReminderSlots(data, NOW);
    const cjsSlots = collectFutureSlots(data, NOW);
    expect(tsSlots).toHaveLength(1);
    expect(cjsSlots).toHaveLength(1);
    expect(tsSlots[0].slotKey).toBe(reminderNotifyKey('i1', FUTURE_REMIND));
    expect(tsSlots[0].source).toBe('team-item');
    expect(tsSlots[0].title).toBe('Task reminder');
    expect(tsSlots.map((s) => s.slotKey)).toEqual(cjsSlots.map((s: { slotKey: string }) => s.slotKey));
  });

  it('skips done team items and todos without remindAt', () => {
    const data = baseData({
      items: [
        {
          id: 'i-done',
          personId: 'person-1',
          kind: 'task',
          title: 'Done task',
          body: '',
          remindAt: FUTURE_REMIND,
          done: true,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
      todoItems: [
        {
          id: 't-done',
          groupId: 'grp-1',
          title: 'Done todo',
          status: 'done',
          done: true,
          remindAt: FUTURE_REMIND,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expectNoFutureSlots(data);
  });
});

describe('collectFutureReminderSlots — filtering and slot shape', () => {
  it('skips todos with cancelled status', () => {
    const data = baseData({
      todoItems: [
        {
          id: 't-cancelled',
          groupId: 'grp-1',
          title: 'Cancelled',
          status: 'cancelled',
          done: false,
          remindAt: FUTURE_REMIND,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expect(collectFutureReminderSlots(data, NOW)).toEqual([]);
  });

  it('skips past and at-now remindAt todos', () => {
    const data = baseData({
      todoItems: [
        {
          id: 't-past',
          groupId: 'grp-1',
          title: 'Past',
          status: 'todo',
          done: false,
          remindAt: PAST_REMIND,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
        {
          id: 't-now',
          groupId: 'grp-1',
          title: 'Now',
          status: 'todo',
          done: false,
          remindAt: AT_NOW,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expect(collectFutureReminderSlots(data, NOW)).toEqual([]);
  });

  it('skips todos with invalid remindAt ISO strings', () => {
    const data = baseData({
      todoItems: [
        {
          id: 't-bad-date',
          groupId: 'grp-1',
          title: 'Bad date',
          status: 'todo',
          done: false,
          remindAt: 'not-a-date',
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expect(collectFutureReminderSlots(data, NOW)).toEqual([]);
  });

  it('skips already-notified todos via composite and legacy keys', () => {
    const data = baseData({
      notifiedReminderIds: [
        reminderNotifyKey('t-notified', FUTURE_REMIND),
        't-legacy',
      ],
      todoItems: [
        {
          id: 't-notified',
          groupId: 'grp-1',
          title: 'Already notified',
          status: 'todo',
          done: false,
          remindAt: FUTURE_REMIND,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
        {
          id: 't-legacy',
          groupId: 'grp-1',
          title: 'Legacy notified',
          status: 'todo',
          done: false,
          remindAt: PAST_REMIND,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
        {
          id: 't-fresh',
          groupId: 'grp-1',
          title: 'Fresh',
          status: 'todo',
          done: false,
          remindAt: FUTURE_REMIND,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expect(collectFutureReminderSlots(data, NOW)).toEqual([
      {
        slotKey: reminderNotifyKey('t-fresh', FUTURE_REMIND),
        itemId: 't-fresh',
        source: 'todo',
        remindAt: FUTURE_REMIND,
        title: 'Todo reminder',
        body: 'Inbox: Fresh',
        repeat: undefined,
        deepLinkPath: '/todos?focus=t-fresh',
      },
    ]);
  });

  it('builds exact todo slot fields including repeat and untitled fallback', () => {
    const data = baseData({
      todoGroups: [
        {
          id: 'grp-missing',
          name: 'Work',
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          priority: 'normal',
        },
      ],
      todoItems: [
        {
          id: 't-shape',
          groupId: 'grp-missing',
          title: '  ',
          status: 'todo',
          done: false,
          remindAt: FUTURE_REMIND,
          remindRepeat: 'weekly',
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
        {
          id: 't-no-group',
          groupId: 'missing-group',
          title: 'Orphan',
          status: 'todo',
          done: false,
          remindAt: FUTURE_REMIND_LATER,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expect(collectFutureReminderSlots(data, NOW)).toEqual([
      {
        slotKey: reminderNotifyKey('t-shape', FUTURE_REMIND),
        itemId: 't-shape',
        source: 'todo',
        remindAt: FUTURE_REMIND,
        title: 'Todo reminder',
        body: 'Work: (untitled)',
        repeat: 'weekly',
        deepLinkPath: '/todos?focus=t-shape',
      },
      {
        slotKey: reminderNotifyKey('t-no-group', FUTURE_REMIND_LATER),
        itemId: 't-no-group',
        source: 'todo',
        remindAt: FUTURE_REMIND_LATER,
        title: 'Todo reminder',
        body: 'Todo: Orphan',
        repeat: undefined,
        deepLinkPath: '/todos?focus=t-no-group',
      },
    ]);
  });

  it('builds team task vs goal titles and deep links from people/teams maps', () => {
    const data = baseData({
      items: [
        {
          id: 'i-task',
          personId: 'person-1',
          kind: 'task',
          title: 'Follow up',
          body: '',
          remindAt: FUTURE_REMIND,
          remindRepeat: 'daily',
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
        {
          id: 'i-goal',
          personId: 'person-1',
          kind: 'goal',
          title: '  Launch  ',
          body: '',
          remindAt: FUTURE_REMIND_LATER,
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expect(collectFutureReminderSlots(data, NOW)).toEqual([
      {
        slotKey: reminderNotifyKey('i-task', FUTURE_REMIND),
        itemId: 'i-task',
        source: 'team-item',
        remindAt: FUTURE_REMIND,
        title: 'Task reminder',
        body: 'Eng · Alex: Follow up',
        repeat: 'daily',
        deepLinkPath: '/teams/team-1/people/person-1?focus=i-task',
      },
      {
        slotKey: reminderNotifyKey('i-goal', FUTURE_REMIND_LATER),
        itemId: 'i-goal',
        source: 'team-item',
        remindAt: FUTURE_REMIND_LATER,
        title: 'Reminder',
        body: 'Eng · Alex: Launch',
        repeat: undefined,
        deepLinkPath: '/teams/team-1/people/person-1?focus=i-goal',
      },
    ]);
  });

  it('uses canonical Me / leader / skip-level paths for synthetic people', () => {
    const data = baseData({
      people: [
        {
          id: '__self__team-1',
          teamId: 'team-1',
          name: 'Me',
          isSelf: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '__leader__team-1',
          teamId: 'team-1',
          name: 'My leader',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '__skiplevel__team-1',
          teamId: 'team-1',
          name: 'Skip-level leader',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      items: [
        {
          id: 'i-me',
          personId: '__self__team-1',
          kind: 'task',
          title: 'My task',
          body: '',
          remindAt: FUTURE_REMIND,
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
        {
          id: 'i-leader',
          personId: '__leader__team-1',
          kind: 'task',
          title: 'Leader task',
          body: '',
          remindAt: FUTURE_REMIND_LATER,
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    const slots = collectFutureReminderSlots(data, NOW);
    expect(slots.map((s) => s.deepLinkPath)).toEqual([
      '/teams/team-1/me?focus=i-me',
      '/teams/team-1/leader?focus=i-leader',
    ]);
  });

  it('skips done, past, and notified team items', () => {
    const data = baseData({
      notifiedReminderIds: [reminderNotifyKey('i-notified', FUTURE_REMIND)],
      items: [
        {
          id: 'i-done',
          personId: 'person-1',
          kind: 'task',
          title: 'Done',
          body: '',
          remindAt: FUTURE_REMIND,
          done: true,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
        {
          id: 'i-past',
          personId: 'person-1',
          kind: 'task',
          title: 'Past',
          body: '',
          remindAt: PAST_REMIND,
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
        {
          id: 'i-notified',
          personId: 'person-1',
          kind: 'task',
          title: 'Notified',
          body: '',
          remindAt: FUTURE_REMIND,
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
        {
          id: 'i-bad-date',
          personId: 'person-1',
          kind: 'task',
          title: 'Bad',
          body: '',
          remindAt: 'invalid',
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expect(collectFutureReminderSlots(data, NOW)).toEqual([]);
  });

  it('uses Item label and null deepLink when person or team is missing', () => {
    const data = baseData({
      people: [],
      teams: [],
      items: [
        {
          id: 'i-orphan',
          personId: 'missing-person',
          kind: 'task',
          title: '',
          body: '',
          remindAt: FUTURE_REMIND,
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
        {
          id: 'i-no-team',
          personId: 'person-no-team',
          kind: 'note',
          title: 'Note item',
          body: '',
          remindAt: FUTURE_REMIND,
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    data.people.push({
      id: 'person-no-team',
      teamId: '',
      name: 'Solo',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(collectFutureReminderSlots(data, NOW)).toEqual([
      {
        slotKey: reminderNotifyKey('i-orphan', FUTURE_REMIND),
        itemId: 'i-orphan',
        source: 'team-item',
        remindAt: FUTURE_REMIND,
        title: 'Task reminder',
        body: 'Item: (untitled)',
        repeat: undefined,
        deepLinkPath: null,
      },
      {
        slotKey: reminderNotifyKey('i-no-team', FUTURE_REMIND),
        itemId: 'i-no-team',
        source: 'team-item',
        remindAt: FUTURE_REMIND,
        title: 'Reminder',
        body: 'Solo: Note item',
        repeat: undefined,
        deepLinkPath: null,
      },
    ]);
  });

  it('skips team items whose remindAt equals nowMs', () => {
    const data = baseData({
      items: [
        {
          id: 'i-at-now',
          personId: 'person-1',
          kind: 'task',
          title: 'Now',
          body: '',
          remindAt: AT_NOW,
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expect(collectFutureReminderSlots(data, NOW)).toEqual([]);
  });

  it('sorts todos and team items together by remindAt ascending', () => {
    const data = baseData({
      todoItems: [
        {
          id: 't-late',
          groupId: 'grp-1',
          title: 'Late todo',
          status: 'todo',
          done: false,
          remindAt: FUTURE_REMIND_LATER,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
      items: [
        {
          id: 'i-early',
          personId: 'person-1',
          kind: 'task',
          title: 'Early item',
          body: '',
          remindAt: FUTURE_REMIND,
          done: false,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expect(collectFutureReminderSlots(data, NOW).map((s) => s.itemId)).toEqual(['i-early', 't-late']);
  });

  it('handles todos without a title property', () => {
    const data = baseData({
      todoItems: [
        {
          id: 't-no-title',
          groupId: 'grp-1',
          status: 'todo',
          done: false,
          remindAt: FUTURE_REMIND,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        } as AppData['todoItems'][number],
      ],
    });
    expect(collectFutureReminderSlots(data, NOW)).toEqual([
      {
        slotKey: reminderNotifyKey('t-no-title', FUTURE_REMIND),
        itemId: 't-no-title',
        source: 'todo',
        remindAt: FUTURE_REMIND,
        title: 'Todo reminder',
        body: 'Inbox: (untitled)',
        repeat: undefined,
        deepLinkPath: '/todos?focus=t-no-title',
      },
    ]);
  });
});
