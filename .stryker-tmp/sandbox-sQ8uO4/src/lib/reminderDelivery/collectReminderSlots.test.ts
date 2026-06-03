// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { collectFutureReminderSlots } from './collectReminderSlots';
import type { AppData } from '../../core/model';
import { reminderNotifyKey } from '../reminderNotify';

const require = createRequire(import.meta.url);
const { collectFutureSlots } = require('../../../electron/reminder/collectDesiredSlots.cjs');

const NOW = Date.parse('2026-05-31T12:00:00.000Z');
const FUTURE_REMIND = '2026-05-31T14:00:00.000Z';
const FUTURE_DUE = '2026-05-31T16:00:00.000Z';

function baseData(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 3,
    notifiedReminderIds: [],
    teams: [{ id: 'team-1', name: 'Eng', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    people: [{ id: 'person-1', teamId: 'team-1', name: 'Alex', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    todoGroups: [
      { id: 'grp-1', name: 'Inbox', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', priority: 'normal' },
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
          remindAt: FUTURE_REMIND,
          createdAt: '2026-05-31T12:00:00.000Z',
          updatedAt: '2026-05-31T12:00:00.000Z',
        },
      ],
    });
    expectNoFutureSlots(data);
  });
});
