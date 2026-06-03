import { describe, expect, it } from 'vitest';
import type { AppData } from '../model';
import { distinctCategoriesForTeam, SUGGESTED_CATEGORIES } from './categories';

function minimalData(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 1,
    teams: [],
    people: [],
    items: [],
    notifiedReminderIds: [],
    todoGroups: [],
    todoItems: [],
    notes: [],
    ...overrides,
  } as AppData;
}

describe('SUGGESTED_CATEGORIES', () => {
  it('exposes the built-in category suggestions', () => {
    expect(SUGGESTED_CATEGORIES).toEqual([
      'Initiative',
      'Operations',
      'Team',
      'Stakeholder',
      'Personal growth',
      'Leadership',
    ]);
  });
});

describe('distinctCategoriesForTeam', () => {
  it('returns distinct trimmed categories for team members only', () => {
    const data = minimalData({
      people: [
        { id: 'p1', teamId: 't1', name: 'A', createdAt: '2020-01-01T00:00:00.000Z' },
        { id: 'p2', teamId: 't2', name: 'B', createdAt: '2020-01-01T00:00:00.000Z' },
      ],
      items: [
        {
          id: 'i1',
          personId: 'p1',
          kind: 'task',
          title: 'One',
          body: '',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
          category: '  Operations  ',
        },
        {
          id: 'i2',
          personId: 'p1',
          kind: 'note',
          title: 'Two',
          body: '',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
          category: 'Initiative',
        },
        {
          id: 'i3',
          personId: 'p1',
          kind: 'goal',
          title: 'Dup',
          body: '',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
          category: 'Initiative',
        },
        {
          id: 'i4',
          personId: 'p2',
          kind: 'task',
          title: 'Other team',
          body: '',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
          category: 'Ignored',
        },
        {
          id: 'i5',
          personId: 'p1',
          kind: 'task',
          title: 'Empty',
          body: '',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
          category: '   ',
        },
      ],
    });
    expect(distinctCategoriesForTeam(data, 't1')).toEqual(['Initiative', 'Operations']);
  });

  it('returns an empty array when the team has no categorized items', () => {
    const data = minimalData({
      people: [{ id: 'p1', teamId: 't1', name: 'A', createdAt: '2020-01-01T00:00:00.000Z' }],
      items: [
        {
          id: 'i1',
          personId: 'p1',
          kind: 'task',
          title: 'No category',
          body: '',
          done: false,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(distinctCategoriesForTeam(data, 't1')).toEqual([]);
  });
});
