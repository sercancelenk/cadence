// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { buildItemsByGroup, todoMatchesSearchQuery } from './sortTodoItemsByGroup';
import type { TodoGroup, TodoItem } from '../../model';

function item(
  id: string,
  groupId: string,
  overrides: Partial<TodoItem> = {},
): TodoItem {
  return {
    id,
    groupId,
    title: id,
    status: 'todo',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const groups: TodoGroup[] = [
  { id: 'g1', name: 'A', sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'g2', name: 'B', sortOrder: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];

describe('buildItemsByGroup', () => {
  it('groups items and sorts by priority', () => {
    const items = [
      item('low', 'g1', { priority: 'low', sortOrder: 1 }),
      item('urgent', 'g1', { priority: 'urgent', sortOrder: 2 }),
      item('high', 'g1', { priority: 'high', sortOrder: 0 }),
    ];
    const map = buildItemsByGroup(groups, items, 'priority');
    expect(map.get('g1')!.map((t) => t.id)).toEqual(['urgent', 'high', 'low']);
  });

  it('sorts by due date ascending, missing due last', () => {
    const items = [
      item('later', 'g1', { dueAt: '2026-06-10', sortOrder: 0 }),
      item('none', 'g1', { sortOrder: 1 }),
      item('soon', 'g1', { dueAt: '2026-06-01', sortOrder: 2 }),
    ];
    const map = buildItemsByGroup(groups, items, 'due');
    expect(map.get('g1')!.map((t) => t.id)).toEqual(['soon', 'later', 'none']);
  });

  it('sorts by status rank', () => {
    const items = [
      item('done', 'g1', { status: 'done', sortOrder: 0 }),
      item('todo', 'g1', { status: 'todo', sortOrder: 1 }),
      item('wip', 'g1', { status: 'in_progress', sortOrder: 2 }),
    ];
    const map = buildItemsByGroup(groups, items, 'status');
    expect(map.get('g1')!.map((t) => t.id)).toEqual(['todo', 'wip', 'done']);
  });

  it('sorts by created descending', () => {
    const items = [
      item('old', 'g1', { createdAt: '2026-01-01', sortOrder: 0 }),
      item('new', 'g1', { createdAt: '2026-06-01', sortOrder: 1 }),
    ];
    const map = buildItemsByGroup(groups, items, 'created');
    expect(map.get('g1')!.map((t) => t.id)).toEqual(['new', 'old']);
  });

  it('uses manual sortOrder as fallback', () => {
    const items = [item('b', 'g1', { sortOrder: 2 }), item('a', 'g1', { sortOrder: 1 })];
    const map = buildItemsByGroup(groups, items, 'manual');
    expect(map.get('g1')!.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('initializes empty arrays for every group', () => {
    const map = buildItemsByGroup(groups, [], 'manual');
    expect(map.get('g1')).toEqual([]);
    expect(map.get('g2')).toEqual([]);
  });
});

describe('todoMatchesSearchQuery', () => {
  it('matches empty query', () => {
    expect(todoMatchesSearchQuery(item('x', 'g1'), '')).toBe(true);
    expect(todoMatchesSearchQuery(item('x', 'g1'), '   ')).toBe(true);
  });

  it('matches title case-insensitively', () => {
    expect(todoMatchesSearchQuery(item('x', 'g1', { title: 'Fix API' }), 'api')).toBe(true);
  });

  it('matches legacy body plain text', () => {
    expect(
      todoMatchesSearchQuery(item('x', 'g1', { title: 'Other', bodyPlainText: 'secret phrase' }), 'phrase'),
    ).toBe(true);
  });

  it('returns false when neither title nor body matches', () => {
    expect(todoMatchesSearchQuery(item('x', 'g1', { title: 'Alpha' }), 'beta')).toBe(false);
  });
});
