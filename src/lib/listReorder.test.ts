import { describe, expect, it } from 'vitest';
import {
  beforeItemIdAfterReorder,
  dropPlacementFromPointer,
  reorderIds,
} from './listReorder';

describe('dropPlacementFromPointer', () => {
  const rect = { top: 100, height: 40 } as DOMRect;

  it('uses the top half as before and the bottom half as after', () => {
    expect(dropPlacementFromPointer(110, rect)).toBe('before');
    expect(dropPlacementFromPointer(130, rect)).toBe('after');
  });
});

describe('reorderIds', () => {
  const ids = ['a', 'b', 'c'];

  it('moves an item down onto the next neighbour (the classic broken gesture)', () => {
    // Drag a onto b's bottom half → [b, a, c]
    expect(reorderIds(ids, 'a', 'b', 'after')).toEqual(['b', 'a', 'c']);
  });

  it('moves an item up onto the previous neighbour', () => {
    expect(reorderIds(ids, 'c', 'b', 'before')).toEqual(['a', 'c', 'b']);
  });

  it('returns null when before-placement on the next neighbour would be a no-op', () => {
    // This is exactly what the old "always insert before" path did for move-down.
    expect(reorderIds(ids, 'a', 'b', 'before')).toBeNull();
  });

  it('returns null for unknown ids or identical source/target', () => {
    expect(reorderIds(ids, 'a', 'a', 'after')).toBeNull();
    expect(reorderIds(ids, 'x', 'b', 'after')).toBeNull();
  });
});

describe('beforeItemIdAfterReorder', () => {
  it('maps placements onto reorderTodoItem\'s beforeItemId', () => {
    expect(beforeItemIdAfterReorder(['a', 'b', 'c'], 'a', 'b', 'after')).toBe('c');
    expect(beforeItemIdAfterReorder(['a', 'b', 'c'], 'c', 'a', 'before')).toBe('a');
    expect(beforeItemIdAfterReorder(['a', 'b', 'c'], 'a', 'c', 'after')).toBeNull();
    expect(beforeItemIdAfterReorder(['a', 'b', 'c'], 'a', 'b', 'before')).toBeUndefined();
  });

  /**
   * `beforeItemId` is resolved against the caller's list, and `reorderTodoItem`
   * applies it to every peer in the group. Hand it the filtered view and the
   * two disagree: with `c` hidden by a search, dropping `a` below `b` looks
   * like "append" and the task lands *after* `c` instead of before it. The
   * caller must pass the full order — this pins the difference so nobody
   * re-derives the ids from the visible rows again.
   */
  it('needs the full list, not the filtered view, to place a trailing drop', () => {
    const full = ['a', 'b', 'c'];
    const visibleOnly = ['a', 'b'];

    expect(beforeItemIdAfterReorder(full, 'a', 'b', 'after')).toBe('c');
    expect(beforeItemIdAfterReorder(visibleOnly, 'a', 'b', 'after')).toBeNull();
  });
});
