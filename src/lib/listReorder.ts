/**
 * Shared helpers for HTML5 list reorder. Dropping always used to mean
 * "insert before the target", which is a no-op when dragging an item onto the
 * neighbour immediately below it — the most common "move down" gesture.
 * Placement is decided from the pointer's Y inside the target row instead.
 */

export type DropPlacement = 'before' | 'after';

export function dropPlacementFromPointer(clientY: number, targetRect: DOMRect): DropPlacement {
  const mid = targetRect.top + targetRect.height / 2;
  return clientY < mid ? 'before' : 'after';
}

/**
 * Move `sourceId` to before/after `targetId` inside `ids`.
 * Returns `null` when the move would not change the order (or ids are unknown).
 */
export function reorderIds(
  ids: readonly string[],
  sourceId: string,
  targetId: string,
  placement: DropPlacement,
): string[] | null {
  if (sourceId === targetId) return null;
  const from = ids.indexOf(sourceId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1) return null;

  const without = ids.filter((id) => id !== sourceId);
  let insertAt = without.indexOf(targetId);
  if (insertAt === -1) return null;
  if (placement === 'after') insertAt += 1;

  const next = [...without.slice(0, insertAt), sourceId, ...without.slice(insertAt)];
  if (next.length === ids.length && next.every((id, i) => id === ids[i])) return null;
  return next;
}

/**
 * Translate a placed reorder into the `beforeItemId` argument used by
 * `reorderTodoItem` (insert before this id, or `null` = append).
 */
export function beforeItemIdAfterReorder(
  ids: readonly string[],
  sourceId: string,
  targetId: string,
  placement: DropPlacement,
): string | null | undefined {
  const next = reorderIds(ids, sourceId, targetId, placement);
  if (!next) return undefined;
  const at = next.indexOf(sourceId);
  if (at === -1) return undefined;
  return next[at + 1] ?? null;
}
