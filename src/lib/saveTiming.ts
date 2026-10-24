/**
 * Typing → disk cadence.
 *
 * Two kinds of change reach `scheduleSave`:
 *  - `typing`: body text of the document being edited. Written at most every
 *    `TYPING_SAVE_INTERVAL_MS`; the timer is NOT pushed back by further typing,
 *    so a long session still lands on disk periodically.
 *  - `structural`: anything else (todo toggles, create/delete/move/archive…).
 *    Written almost immediately and carries any pending typing along, because
 *    every write persists the whole latest snapshot.
 *
 * Blur, note switch, lock, pagehide, quit and ⌘S drain everything immediately
 * (see `pendingSaveFlush`), so the typing interval only matters for a crash,
 * power loss or force-quit.
 */

/** Editor buffer → `onChange` (one full-document read per flush). */
export const EDITOR_CHANGE_DEBOUNCE_MS = 600;

/** A non-stop burst of typing is still handed to AppData at least this often. */
export const EDITOR_MAX_WAIT_MS = 5_000;

/** `onChange` → encrypted AppData write, for typing. */
export const TYPING_SAVE_INTERVAL_MS = 30_000;

/** `onChange` → encrypted AppData write, for structural edits. */
export const STRUCTURAL_SAVE_DEBOUNCE_MS = 300;

export const MAX_UNSAVED_WINDOW_MS = EDITOR_MAX_WAIT_MS + TYPING_SAVE_INTERVAL_MS;

export type SaveKind = 'typing' | 'structural';

/**
 * Decide the persist timer for a new change. `currentDueAt` is when the timer
 * already pending would fire (null when none). Returns the new due time, or
 * null to keep the pending timer untouched.
 */
export function planSaveTimer(
  kind: SaveKind,
  now: number,
  currentDueAt: number | null,
): { dueAt: number } | null {
  if (kind === 'structural') return { dueAt: now + STRUCTURAL_SAVE_DEBOUNCE_MS };
  if (currentDueAt !== null) return null;
  return { dueAt: now + TYPING_SAVE_INTERVAL_MS };
}

/** Editor debounce delay, capped so continuous typing cannot starve the flush. */
export function editorFlushDelayMs(now: number, burstStartedAt: number | null): number {
  if (burstStartedAt === null) return EDITOR_CHANGE_DEBOUNCE_MS;
  const remaining = EDITOR_MAX_WAIT_MS - (now - burstStartedAt);
  return Math.max(0, Math.min(EDITOR_CHANGE_DEBOUNCE_MS, remaining));
}
