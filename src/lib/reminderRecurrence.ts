import type { ReminderRepeat } from '../model';

/**
 * Reminder recurrence math shared by the agenda projection and (by mirrored
 * semantics) the background firing engines.
 *
 * The Electron main process (`electron/reminder/index.cjs`) and the renderer
 * watcher (`AppDataContext`) advance a fired reminder by exactly ONE cycle so
 * users can catch up on missed runs incrementally. This module keeps the same
 * per-cycle semantics so a value projected here always lands on a real
 * occurrence those engines would also produce — agenda display and the actual
 * notification can never disagree about *when* the next ping is.
 */

/** Hard cap on roll-forward iterations — guards against pathological input. */
const MAX_ROLL_FORWARD_CYCLES = 4096;

function startOfDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/**
 * Advance an ISO timestamp by a single recurrence cycle.
 *
 * - `daily`   → +1 day
 * - `weekly`  → +7 days
 * - `monthly` → +1 calendar month (JS `Date` clamps day-of-month overflow, e.g.
 *   Jan 31 + 1 month → early March; this matches the firing engines exactly).
 *
 * Returns `null` when the input cannot be parsed.
 */
export function advanceReminderOnce(iso: string, repeat: ReminderRepeat): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

/**
 * Project a recurring reminder forward to its next occurrence that is not
 * before the start of `ref`'s day.
 *
 * This makes a recurring reminder display correctly even when the stored
 * `remindAt` has drifted into the past (e.g. notifications were never granted,
 * the app was offline, or the PWA tab was closed so no engine advanced it).
 * The occurrence whose moment is on/after the start of today is returned, so a
 * daily reminder that already fired earlier today still shows on "Today"
 * rather than rolling to tomorrow.
 *
 * Returns the original ISO string when it is already on/after today, or `null`
 * when the input cannot be parsed.
 */
export function nextReminderOccurrence(
  iso: string,
  repeat: ReminderRepeat,
  ref: Date = new Date(),
): string | null {
  const first = Date.parse(iso);
  if (Number.isNaN(first)) return null;
  const floor = startOfDayMs(ref);
  if (first >= floor) return new Date(first).toISOString();

  let currentIso = iso;
  for (let i = 0; i < MAX_ROLL_FORWARD_CYCLES; i++) {
    const next = advanceReminderOnce(currentIso, repeat);
    if (!next) return null;
    if (Date.parse(next) >= floor) return next;
    currentIso = next;
  }
  // Pathological input (e.g. a timestamp centuries in the past): fall back to
  // the last computed value rather than looping forever.
  return currentIso;
}
