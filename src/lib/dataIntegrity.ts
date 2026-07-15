import type { DataShape } from '../core/model';

/**
 * Count user-visible content entities (notes, personal todos, team items).
 * Excludes groups/teams scaffolding so an empty workspace still "looks empty".
 */
export function materialContentCount(d: {
  notes?: readonly unknown[];
  todoItems?: readonly unknown[];
  items?: readonly unknown[];
} | null | undefined): number {
  if (!d) return 0;
  return (d.notes?.length ?? 0) + (d.todoItems?.length ?? 0) + (d.items?.length ?? 0);
}

/**
 * Decide whether the freshly loaded shape is "much smaller" than the
 * last-known-good marker. Deliberately conservative: a few items less is
 * normal. Any populated → empty wipe is always suspicious (even 1–2 items).
 * Larger drops fire when absolute drop is meaningful AND relative drop is large.
 */
export function isSuspiciousShrink(current: DataShape, previous: DataShape): boolean {
  if (previous.total <= 0) return false;
  // Populated → empty is always catastrophic, regardless of prior size.
  if (current.total === 0) return true;
  const drop = previous.total - current.total;
  if (drop < 3) return false;
  if (current.total <= 1) return true;
  return drop / previous.total >= 0.5;
}

/**
 * Main-process / renderer gate: refuse silently overwriting a populated
 * workspace with an empty scaffold (0 notes + 0 todos + 0 team items).
 * Threshold is prev >= 1 so 1–2 item workspaces are protected too.
 * Legitimate "delete everything" / restore / import bypass this.
 */
export function isCatastrophicEmptyOverwrite(
  previous: { notes?: readonly unknown[]; todoItems?: readonly unknown[]; items?: readonly unknown[] } | null | undefined,
  next: { notes?: readonly unknown[]; todoItems?: readonly unknown[]; items?: readonly unknown[] } | null | undefined,
): boolean {
  const prev = materialContentCount(previous);
  const cur = materialContentCount(next);
  return prev >= 1 && cur === 0;
}

/** True when boot should refuse autosave until the user restores or dismisses. */
export function shouldBlockPersistOnSuspiciousShrink(
  current: DataShape,
  previous: DataShape | null,
): boolean {
  return !!previous && isSuspiciousShrink(current, previous);
}
