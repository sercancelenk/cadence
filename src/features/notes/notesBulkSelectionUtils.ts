export function rangeNoteIds(
  orderedIds: readonly string[],
  anchorId: string,
  targetId: string,
): string[] {
  const anchorIdx = orderedIds.indexOf(anchorId);
  const targetIdx = orderedIds.indexOf(targetId);
  if (anchorIdx < 0 || targetIdx < 0) return [targetId];
  const start = Math.min(anchorIdx, targetIdx);
  const end = Math.max(anchorIdx, targetIdx);
  return orderedIds.slice(start, end + 1);
}

/**
 * Only move the shift-range anchor on clicks that genuinely change the primary
 * selection, or when toggling within an active multi-select. A no-op click on
 * the already-selected row (typical for the auto-selected first note) must NOT
 * become the range anchor.
 */
export function shouldUpdateRangeAnchor(
  clickedId: string,
  selectedId: string | null,
  bulkIds: ReadonlySet<string>,
): boolean {
  if (clickedId !== selectedId) return true;
  return bulkIds.size > 1 && bulkIds.has(clickedId);
}

export function toggleBulkId(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function contextMenuNoteIds(
  clickedId: string,
  bulkIds: ReadonlySet<string>,
): { ids: string[]; nextBulk: Set<string> } {
  if (bulkIds.has(clickedId) && bulkIds.size > 1) {
    return { ids: [...bulkIds], nextBulk: new Set(bulkIds) };
  }
  return { ids: [clickedId], nextBulk: new Set([clickedId]) };
}
