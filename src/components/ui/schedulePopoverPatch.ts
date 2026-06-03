import type { SchedulePatch } from './SchedulePopover';

/**
 * Pure patch builders for SchedulePopover — covered by unit tests so
 * deadline-only scheduling cannot silently arm reminders again.
 */
export function buildScheduleDateTimePatch(iso: string, reminderOn: boolean): SchedulePatch {
  if (reminderOn) return { dueAt: iso, remindAt: iso };
  return { dueAt: iso };
}

export function buildReminderToggleOnPatch(iso: string, hasDueAt: boolean): SchedulePatch {
  return { remindAt: iso, dueAt: hasDueAt ? undefined : iso };
}

export function buildReminderToggleOffPatch(): SchedulePatch {
  return { remindAt: null, remindRepeat: null };
}

export function buildScheduleClearPatch(): SchedulePatch {
  return { dueAt: null, remindAt: null, remindRepeat: null };
}
