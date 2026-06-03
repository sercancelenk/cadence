// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  agendaEntryHref,
  agendaEntryTitle,
  agendaScheduleKindLabel,
  buildAgendaWeekStrip,
  collectAgendaEntries,
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
    expect(entries.map((e) => (e.kind === 'item' ? e.scheduleKind : null))).toEqual(['reminder', 'due']);
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
    expect(filterOverdueAgendaEntries(entries, ref)).toHaveLength(0);
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
});

describe('agendaEntryTitle', () => {
  it('returns the item title or a placeholder when empty', () => {
    expect(
      agendaEntryTitle({
        kind: 'item',
        item: { id: 'i1', title: 'Meet', personId: 'p1', kind: 'task' } as never,
        scheduleKind: 'due',
        at: '2030-01-01T10:00:00.000Z',
      }),
    ).toBe('Meet');
    expect(
      agendaEntryTitle({
        kind: 'item',
        item: { id: 'i2', title: '', personId: 'p1', kind: 'task' } as never,
        scheduleKind: 'due',
        at: '2030-01-01T10:00:00.000Z',
      }),
    ).toBe('(untitled)');
  });

  it('returns the todo title or a placeholder when empty', () => {
    expect(
      agendaEntryTitle({
        kind: 'todo',
        todo: { id: 't1', groupId: 'g1', title: 'Ship', status: 'todo' } as never,
        scheduleKind: 'due',
        at: '2030-01-01T10:00:00.000Z',
      }),
    ).toBe('Ship');
    expect(
      agendaEntryTitle({
        kind: 'todo',
        todo: { id: 't2', groupId: 'g1', title: '', status: 'todo' } as never,
        scheduleKind: 'due',
        at: '2030-01-01T10:00:00.000Z',
      }),
    ).toBe('(untitled)');
  });
});
