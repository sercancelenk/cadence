import { describe, expect, it } from 'vitest';
import {
  agendaEntryHref,
  agendaEntryTitle,
  agendaScheduleKindLabel,
  buildAgendaWeekStrip,
  collectAgendaEntries,
  dayKey,
  filterAgendaEntriesForDay,
  filterOverdueAgendaEntries,
  startOfDay,
} from './agendaEntries';
import { PATH_AGENDA, PATH_TODOS } from './routes';
import type { AppData } from '../model';

function minimalData(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 1,
    teams: [],
    people: [],
    items: [],
    todoGroups: [],
    todoItems: [],
    notes: [],
    ...overrides,
  } as AppData;
}

describe('collectAgendaEntries', () => {
  it('includes open todos with due dates', () => {
    const data = minimalData({
      todoGroups: [{ id: 'g1', name: 'Inbox', priority: 0, archived: false }],
      todoItems: [
        {
          id: 't1',
          groupId: 'g1',
          title: 'Ship',
          status: 'todo',
          dueAt: '2030-06-15T10:00:00.000Z',
        },
      ],
    });
    const entries = collectAgendaEntries(data);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('todo');
  });

  it('filters overdue open items', () => {
    const data = minimalData({
      todoGroups: [{ id: 'g1', name: 'Inbox', priority: 0, archived: false }],
      todoItems: [
        {
          id: 't1',
          groupId: 'g1',
          title: 'Late',
          status: 'todo',
          dueAt: '2020-01-01T10:00:00.000Z',
        },
      ],
    });
    const entries = collectAgendaEntries(data);
    const overdue = filterOverdueAgendaEntries(entries, new Date('2025-01-01'));
    expect(overdue).toHaveLength(1);
  });

  it('filters entries for a calendar day', () => {
    const data = minimalData({
      todoGroups: [{ id: 'g1', name: 'Inbox', priority: 0, archived: false }],
      todoItems: [
        {
          id: 't1',
          groupId: 'g1',
          title: 'Today task',
          status: 'todo',
          dueAt: '2030-06-15T14:00:00.000Z',
        },
      ],
    });
    const entries = collectAgendaEntries(data);
    const day = filterAgendaEntriesForDay(entries, startOfDay(new Date('2030-06-15T08:00:00')));
    expect(day).toHaveLength(1);
  });

  it('shows reminder and due separately when both are set', () => {
    const data = minimalData({
      teams: [{ id: 'team1', name: 'Team', createdAt: '2020-01-01T00:00:00.000Z', status: 'active' }],
      people: [{ id: 'p1', teamId: 'team1', name: 'Alex', createdAt: '2020-01-01T00:00:00.000Z' }],
      items: [
        {
          id: 'i1',
          personId: 'p1',
          kind: 'task',
          title: 'Follow up',
          body: '',
          remindAt: '2030-06-15T10:00:00.000Z',
          dueAt: '2030-06-15T12:00:00.000Z',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    const entries = collectAgendaEntries(data);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.key)).toEqual(['i1-r', 'i1-d']);
    expect(entries.map((e) => (e.kind === 'item' ? e.scheduleKind : null))).toEqual(['reminder', 'due']);
    expect(entries[0].kind === 'item' && entries[0]).toMatchObject({
      teamId: 'team1',
      teamName: 'Team',
      personName: 'Alex',
    });
  });

  it('skips invalid remindAt and dueAt timestamps', () => {
    const data = minimalData({
      teams: [{ id: 'team1', name: 'Team', createdAt: '2020-01-01T00:00:00.000Z', status: 'active' }],
      people: [{ id: 'p1', teamId: 'team1', name: 'Alex', createdAt: '2020-01-01T00:00:00.000Z' }],
      items: [
        {
          id: 'i1',
          personId: 'p1',
          kind: 'task',
          title: 'Bad dates',
          body: '',
          remindAt: 'not-a-date',
          dueAt: 'also-bad',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      todoItems: [
        {
          id: 't-bad',
          groupId: 'g1',
          title: 'Bad todo date',
          status: 'todo',
          dueAt: 'nope',
        },
      ],
      todoGroups: [{ id: 'g1', name: 'Inbox', sortOrder: 0, createdAt: '2020-01-01T00:00:00.000Z' }],
    });
    expect(collectAgendaEntries(data)).toEqual([]);
  });

  it('hides done items and completed todos unless showCompleted', () => {
    const data = minimalData({
      teams: [{ id: 'team1', name: 'Team', createdAt: '2020-01-01T00:00:00.000Z', status: 'active' }],
      people: [{ id: 'p1', teamId: 'team1', name: 'Alex', createdAt: '2020-01-01T00:00:00.000Z' }],
      items: [
        {
          id: 'i-done',
          personId: 'p1',
          kind: 'task',
          title: 'Done item',
          body: '',
          dueAt: '2030-06-15T10:00:00.000Z',
          done: true,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      todoGroups: [{ id: 'g1', name: 'Inbox', sortOrder: 0, createdAt: '2020-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 't-done',
          groupId: 'g1',
          title: 'Done todo',
          status: 'done',
          dueAt: '2030-06-16T10:00:00.000Z',
        },
      ],
    });
    expect(collectAgendaEntries(data)).toEqual([]);
    const shown = collectAgendaEntries(data, { showCompleted: true });
    expect(shown.map((e) => e.key)).toEqual(['i-done-d', 't-done']);
  });

  it('excludes cancelled todos even when they have dueAt', () => {
    const data = minimalData({
      todoGroups: [{ id: 'g1', name: 'Inbox', sortOrder: 0, createdAt: '2020-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 't-cancel',
          groupId: 'g1',
          title: 'Dropped',
          status: 'cancelled',
          dueAt: '2030-06-15T10:00:00.000Z',
        },
      ],
    });
    expect(collectAgendaEntries(data)).toEqual([]);
  });

  it('sorts entries ascending by when', () => {
    const data = minimalData({
      todoGroups: [{ id: 'g1', name: 'Inbox', sortOrder: 0, createdAt: '2020-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 't-late',
          groupId: 'g1',
          title: 'Late',
          status: 'todo',
          dueAt: '2030-06-16T10:00:00.000Z',
        },
        {
          id: 't-early',
          groupId: 'g1',
          title: 'Early',
          status: 'todo',
          dueAt: '2030-06-14T10:00:00.000Z',
        },
      ],
    });
    const entries = collectAgendaEntries(data);
    expect(entries.map((e) => e.key)).toEqual(['t-early', 't-late']);
  });

  it('dedupes identical reminder and due timestamps', () => {
    const data = minimalData({
      teams: [{ id: 'team1', name: 'Team', createdAt: '2020-01-01T00:00:00.000Z', status: 'active' }],
      people: [{ id: 'p1', teamId: 'team1', name: 'Alex', createdAt: '2020-01-01T00:00:00.000Z' }],
      items: [
        {
          id: 'i1',
          personId: 'p1',
          kind: 'task',
          title: 'Follow up',
          body: '',
          remindAt: '2030-06-15T10:00:00.000Z',
          dueAt: '2030-06-15T10:00:00.000Z',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    const entries = collectAgendaEntries(data);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind === 'item' && entries[0].scheduleKind).toBe('reminder');
  });

  it('shows a single due row when only dueAt is set (regression: not a duplicate task)', () => {
    const data = minimalData({
      teams: [{ id: 'team1', name: 'Team', createdAt: '2020-01-01T00:00:00.000Z', status: 'active' }],
      people: [{ id: 'p1', teamId: 'team1', name: 'Alex', createdAt: '2020-01-01T00:00:00.000Z' }],
      items: [
        {
          id: 'i1',
          personId: 'p1',
          kind: 'task',
          title: 'Follow up',
          body: '',
          dueAt: '2030-06-15T12:00:00.000Z',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    const entries = collectAgendaEntries(data);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind === 'item' && entries[0].scheduleKind).toBe('due');
  });

  it('shows a single reminder row when only remindAt is set', () => {
    const data = minimalData({
      teams: [{ id: 'team1', name: 'Team', createdAt: '2020-01-01T00:00:00.000Z', status: 'active' }],
      people: [{ id: 'p1', teamId: 'team1', name: 'Alex', createdAt: '2020-01-01T00:00:00.000Z' }],
      items: [
        {
          id: 'i1',
          personId: 'p1',
          kind: 'task',
          title: 'Ping me',
          body: '',
          remindAt: '2030-06-15T10:00:00.000Z',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    const entries = collectAgendaEntries(data);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind === 'item' && entries[0].scheduleKind).toBe('reminder');
  });
});

describe('agendaScheduleKindLabel', () => {
  it('labels reminder and due kinds', () => {
    expect(agendaScheduleKindLabel('reminder')).toBe('Reminder');
    expect(agendaScheduleKindLabel('due')).toBe('Due');
  });
});

describe('agendaEntryHref', () => {
  it('links todos to the todos focus route', () => {
    const entries = collectAgendaEntries(
      minimalData({
        todoGroups: [{ id: 'g1', name: 'Inbox', priority: 0, archived: false }],
        todoItems: [
          {
            id: 't1',
            groupId: 'g1',
            title: 'Ship',
            status: 'todo',
            dueAt: '2030-06-15T10:00:00.000Z',
          },
        ],
      }),
    );
    expect(agendaEntryHref(entries[0])).toBe(`${PATH_TODOS}?focus=t1`);
  });

  it('links team items to the person page', () => {
    const data = minimalData({
      teams: [{ id: 'team1', name: 'Team', createdAt: '2020-01-01T00:00:00.000Z', status: 'active' }],
      people: [{ id: 'p1', teamId: 'team1', name: 'Alex', createdAt: '2020-01-01T00:00:00.000Z' }],
      items: [
        {
          id: 'i1',
          personId: 'p1',
          kind: 'task',
          title: 'Follow up',
          body: '',
          dueAt: '2030-06-15T12:00:00.000Z',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    const entry = collectAgendaEntries(data)[0];
    expect(agendaEntryHref(entry)).toBe('/teams/team1/people/p1');
  });

  it('falls back to agenda when team context is missing', () => {
    const data = minimalData({
      items: [
        {
          id: 'i1',
          personId: 'orphan',
          kind: 'task',
          title: 'Loose',
          body: '',
          dueAt: '2030-06-15T12:00:00.000Z',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    const entry = collectAgendaEntries(data)[0];
    expect(agendaEntryHref(entry)).toBe(PATH_AGENDA);
  });
});

describe('dayKey and startOfDay', () => {
  it('formats dayKey with zero-padded month and day', () => {
    expect(dayKey(new Date('2030-03-05T15:00:00.000Z'))).toBe('2030-03-05');
  });

  it('startOfDay zeroes local time fields', () => {
    const ref = new Date('2030-06-15T18:30:45.123Z');
    const sod = startOfDay(ref);
    expect(sod.getHours()).toBe(0);
    expect(sod.getMinutes()).toBe(0);
    expect(sod.getSeconds()).toBe(0);
    expect(sod.getMilliseconds()).toBe(0);
  });
});

describe('filterOverdueAgendaEntries', () => {
  it('excludes completed items and done todos', () => {
    const ref = new Date('2030-06-20T12:00:00.000Z');
    const data = minimalData({
      teams: [{ id: 'team1', name: 'Team', createdAt: '2020-01-01T00:00:00.000Z', status: 'active' }],
      people: [{ id: 'p1', teamId: 'team1', name: 'Alex', createdAt: '2020-01-01T00:00:00.000Z' }],
      items: [
        {
          id: 'i1',
          personId: 'p1',
          kind: 'task',
          title: 'Done task',
          body: '',
          dueAt: '2030-06-10T10:00:00.000Z',
          done: true,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
        {
          id: 'i2',
          personId: 'p1',
          kind: 'task',
          title: 'Open task',
          body: '',
          dueAt: '2030-06-10T10:00:00.000Z',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      todoGroups: [{ id: 'g1', name: 'Inbox', priority: 0, archived: false }],
      todoItems: [
        {
          id: 't-done',
          groupId: 'g1',
          title: 'Finished',
          status: 'done',
          dueAt: '2030-06-10T10:00:00.000Z',
        },
        {
          id: 't-open',
          groupId: 'g1',
          title: 'Late',
          status: 'todo',
          dueAt: '2030-06-10T10:00:00.000Z',
        },
      ],
    });
    const entries = collectAgendaEntries(data);
    const overdue = filterOverdueAgendaEntries(entries, ref);
    expect(overdue.map((e) => (e.kind === 'item' ? e.item.id : e.todo.id))).toEqual(['i2', 't-open']);
  });

  it('ignores entries scheduled later today', () => {
    const ref = new Date('2030-06-15T08:00:00.000Z');
    const data = minimalData({
      todoGroups: [{ id: 'g1', name: 'Inbox', priority: 0, archived: false }],
      todoItems: [
        {
          id: 't-later',
          groupId: 'g1',
          title: 'Later today',
          status: 'todo',
          dueAt: '2030-06-15T18:00:00.000Z',
        },
      ],
    });
    const entries = collectAgendaEntries(data);
    expect(filterOverdueAgendaEntries(entries, ref)).toEqual([]);
  });

  it('includes only entries strictly before ref day start', () => {
    const ref = new Date('2030-06-15T14:00:00.000Z');
    const dayStart = startOfDay(ref);
    const yesterday = new Date(dayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 0, 0, 0);
    const data = minimalData({
      todoGroups: [{ id: 'g1', name: 'Inbox', sortOrder: 0, createdAt: '2020-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 't-yesterday',
          groupId: 'g1',
          title: 'Yesterday',
          status: 'todo',
          dueAt: yesterday.toISOString(),
        },
      ],
    });
    const entries = collectAgendaEntries(data);
    expect(filterOverdueAgendaEntries(entries, ref).map((e) => e.key)).toEqual(['t-yesterday']);
    expect(entries[0].when.getTime()).toBeLessThan(dayStart.getTime());
  });
});

describe('buildAgendaWeekStrip', () => {
  it('always includes today and labels tomorrow', () => {
    const ref = new Date('2030-06-15T12:00:00.000Z');
    const data = minimalData({
      todoGroups: [{ id: 'g1', name: 'Inbox', priority: 0, archived: false }],
      todoItems: [
        {
          id: 't-today',
          groupId: 'g1',
          title: 'Today',
          status: 'todo',
          dueAt: '2030-06-15T14:00:00.000Z',
        },
        {
          id: 't-tomorrow',
          groupId: 'g1',
          title: 'Tomorrow',
          status: 'todo',
          dueAt: '2030-06-16T09:00:00.000Z',
        },
      ],
    });
    const strip = buildAgendaWeekStrip(collectAgendaEntries(data), ref);
    expect(strip[0].label).toBe('Today');
    expect(strip[0].isToday).toBe(true);
    expect(strip[0].entries).toHaveLength(1);
    expect(strip[1].label).toBe('Tomorrow');
    expect(strip[1].entries).toHaveLength(1);
  });

  it('skips empty future days after tomorrow', () => {
    const ref = new Date('2030-06-15T12:00:00.000Z');
    const strip = buildAgendaWeekStrip([], ref);
    expect(strip).toHaveLength(1);
    expect(strip[0].label).toBe('Today');
  });

  it('labels weekday and subtitle for day offset 2+', () => {
    const ref = new Date('2030-06-15T12:00:00.000Z');
    const today = startOfDay(ref);
    const monday = new Date(today);
    monday.setDate(monday.getDate() + 2);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const data = minimalData({
      todoGroups: [{ id: 'g1', name: 'Inbox', sortOrder: 0, createdAt: '2020-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 't-tomorrow',
          groupId: 'g1',
          title: 'Tomorrow task',
          status: 'todo',
          dueAt: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 9).toISOString(),
        },
        {
          id: 't-mon',
          groupId: 'g1',
          title: 'Monday task',
          status: 'todo',
          dueAt: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 10).toISOString(),
        },
      ],
    });
    const strip = buildAgendaWeekStrip(collectAgendaEntries(data), ref);
    expect(strip[0]).toMatchObject({ label: 'Today', isToday: true });
    expect(strip[1]).toMatchObject({ label: 'Tomorrow', isToday: false });
    const weekday = strip.find((b) => b.entries.some((e) => e.key === 't-mon'));
    expect(weekday?.label).toBe(
      monday.toLocaleDateString(undefined, { weekday: 'long' }),
    );
    expect(weekday?.subtitle).toBe(
      monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    );
    expect(weekday?.isToday).toBe(false);
  });
});

describe('agendaEntryTitle', () => {
  const when = new Date('2030-01-01T10:00:00.000Z');

  it('returns the item title or a placeholder when empty', () => {
    expect(
      agendaEntryTitle({
        kind: 'item',
        key: 'i1-d',
        when,
        item: { id: 'i1', title: 'Meet', personId: 'p1', kind: 'task' } as never,
        scheduleKind: 'due',
      }),
    ).toBe('Meet');
    expect(
      agendaEntryTitle({
        kind: 'item',
        key: 'i2-d',
        when,
        item: { id: 'i2', title: '', personId: 'p1', kind: 'task' } as never,
        scheduleKind: 'due',
      }),
    ).toBe('(untitled)');
  });

  it('returns the todo title or a placeholder when empty', () => {
    expect(
      agendaEntryTitle({
        kind: 'todo',
        key: 't1',
        when,
        todo: { id: 't1', groupId: 'g1', title: 'Ship', status: 'todo' } as never,
      }),
    ).toBe('Ship');
    expect(
      agendaEntryTitle({
        kind: 'todo',
        key: 't2',
        when,
        todo: { id: 't2', groupId: 'g1', title: '', status: 'todo' } as never,
      }),
    ).toBe('(untitled)');
  });
});
