import { describe, expect, it } from 'vitest';
import { defaultTodoGroupId } from './todoGroupPick';
import type { TodoGroup } from '../model';

function group(
  id: string,
  sortOrder: number,
  archived?: boolean,
): TodoGroup {
  return {
    id,
    name: id,
    sortOrder,
    createdAt: '2020-01-01T00:00:00.000Z',
    ...(archived ? { archived: true } : {}),
  };
}

describe('defaultTodoGroupId', () => {
  it('returns undefined for an empty list', () => {
    expect(defaultTodoGroupId([])).toBeUndefined();
  });

  it('prefers the first non-archived group by sortOrder', () => {
    expect(defaultTodoGroupId([group('arch', 0, true), group('active', 1)])).toBe('active');
  });

  it('falls back to an archived group when that is all that exists', () => {
    expect(defaultTodoGroupId([group('only', 0, true)])).toBe('only');
  });
});
