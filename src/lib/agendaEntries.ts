import {
  isTodoOpen,
  isTodoItemArchived,
  type AppData,
  type Item,
  type ReminderRepeat,
  type TodoItem,
} from '../model';
import { nextReminderOccurrence } from './reminderRecurrence';
import { PATH_AGENDA, PATH_TODOS } from './routes';
import { teamPersonWorkspacePath, withItemFocus } from './teamPaths';

export type AgendaItemScheduleKind = 'reminder' | 'due';

export type AgendaEntry =
  | {
      kind: 'item';
      key: string;
      when: Date;
      scheduleKind: AgendaItemScheduleKind;
      item: Item;
      teamId?: string;
      teamName?: string;
      personName?: string;
    }
  | {
      kind: 'todo';
      key: string;
      when: Date;
      scheduleKind: AgendaItemScheduleKind;
      todo: TodoItem;
      groupName?: string;
    };

export type AgendaDayBucket = {
  key: string;
  label: string;
  subtitle: string;
  isToday: boolean;
  entries: AgendaEntry[];
};

export type CollectAgendaEntriesOptions = {
  showCompleted?: boolean;
  /** Reference "now" used to project recurring reminders. Defaults to current time. */
  now?: Date;
};

/**
 * Resolve the agenda timestamp for a reminder. Recurring reminders are
 * projected to their next occurrence (≥ start of today) so daily / weekly /
 * monthly reminders surface on the right day even if the stored `remindAt` has
 * drifted into the past. One-time reminders keep their stored timestamp (and
 * can therefore still appear as overdue).
 */
function reminderWhen(
  remindAt: string,
  repeat: ReminderRepeat | undefined,
  now: Date,
): Date | null {
  const iso = repeat ? nextReminderOccurrence(remindAt, repeat, now) ?? remindAt : remindAt;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Unified agenda rows from team items (remind/due) and personal to-dos (due). */
export function collectAgendaEntries(
  data: AppData,
  { showCompleted = false, now = new Date() }: CollectAgendaEntriesOptions = {},
): AgendaEntry[] {
  const out: AgendaEntry[] = [];

  for (const it of data.items) {
    if (it.done && !showCompleted) continue;
    const person = data.people.find((p) => p.id === it.personId);
    const team = person ? data.teams.find((t) => t.id === person.teamId) : undefined;
    let reminderWhenMs: number | null = null;
    if (it.remindAt) {
      const d = reminderWhen(it.remindAt, it.remindRepeat, now);
      if (d) {
        reminderWhenMs = d.getTime();
        out.push({
          kind: 'item',
          key: `${it.id}-r`,
          when: d,
          scheduleKind: 'reminder',
          item: it,
          teamId: team?.id,
          teamName: team?.name,
          personName: person?.name,
        });
      }
    }
    if (it.dueAt) {
      const d = new Date(it.dueAt);
      // Dedupe against the reminder's *resolved* moment, not the raw `remindAt`:
      // a recurring reminder is projected forward, so a due date that merely
      // equals the stored `remindAt` is still a distinct (earlier) occurrence
      // and must keep its own row instead of vanishing from its due day.
      if (!Number.isNaN(d.getTime()) && d.getTime() !== reminderWhenMs) {
        out.push({
          kind: 'item',
          key: `${it.id}-d`,
          when: d,
          scheduleKind: 'due',
          item: it,
          teamId: team?.id,
          teamName: team?.name,
          personName: person?.name,
        });
      }
    }
  }

  for (const t of data.todoItems) {
    if (isTodoItemArchived(t)) continue;
    if (t.status === 'cancelled') continue;
    if (!isTodoOpen(t.status) && !showCompleted) continue;
    const group = data.todoGroups.find((g) => g.id === t.groupId);
    const groupName = group?.name;
    // Reminders count as agenda entries just like team-item reminders do —
    // this is what surfaces a recurring (e.g. weekly) todo reminder whose
    // next occurrence lives in the upcoming week even when the due date is
    // absent or further out. Mirrors the team-item branch above.
    let reminderWhenMs: number | null = null;
    if (t.remindAt) {
      const d = reminderWhen(t.remindAt, t.remindRepeat, now);
      if (d) {
        reminderWhenMs = d.getTime();
        out.push({
          kind: 'todo',
          key: `${t.id}-r`,
          when: d,
          scheduleKind: 'reminder',
          todo: t,
          groupName,
        });
      }
    }
    // Due entry keeps the bare todo id as its key (back-compat with existing
    // consumers/tests). Dedupe against the reminder's *resolved* moment so a
    // recurring reminder projected into the future can't swallow a distinct due
    // date (see the team-item branch above for the full rationale).
    if (t.dueAt) {
      const d = new Date(t.dueAt);
      if (!Number.isNaN(d.getTime()) && d.getTime() !== reminderWhenMs) {
        out.push({
          kind: 'todo',
          key: t.id,
          when: d,
          scheduleKind: 'due',
          todo: t,
          groupName,
        });
      }
    }
  }

  return out.sort((a, b) => a.when.getTime() - b.when.getTime());
}

export function filterOverdueAgendaEntries(entries: AgendaEntry[], ref = new Date()): AgendaEntry[] {
  const dayStart = startOfDay(ref).getTime();
  return entries.filter(
    (e) =>
      e.when.getTime() < dayStart &&
      (e.kind === 'item' ? !e.item.done : isTodoOpen(e.todo.status)),
  );
}

export function filterAgendaEntriesForDay(entries: AgendaEntry[], day: Date): AgendaEntry[] {
  const dayStart = startOfDay(day);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return entries.filter((e) => e.when >= dayStart && e.when < dayEnd);
}

export function buildAgendaWeekStrip(entries: AgendaEntry[], ref = new Date()): AgendaDayBucket[] {
  const today = startOfDay(ref);
  const out: AgendaDayBucket[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const dayStart = new Date(today);
    dayStart.setDate(dayStart.getDate() + offset);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const bucket = entries.filter((e) => e.when >= dayStart && e.when < dayEnd);
    if (offset > 0 && bucket.length === 0) continue;
    out.push({
      key: dayKey(dayStart),
      label:
        offset === 0
          ? 'Today'
          : offset === 1
            ? 'Tomorrow'
            : dayStart.toLocaleDateString(undefined, { weekday: 'long' }),
      subtitle: dayStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      isToday: offset === 0,
      entries: bucket,
    });
  }
  return out;
}

export function agendaEntryTitle(entry: AgendaEntry): string {
  if (entry.kind === 'item') {
    return entry.item.title || '(untitled)';
  }
  return entry.todo.title || '(untitled)';
}

export function agendaScheduleKindLabel(scheduleKind: AgendaItemScheduleKind): string {
  return scheduleKind === 'reminder' ? 'Reminder' : 'Due';
}

export function agendaEntryHref(entry: AgendaEntry): string {
  if (entry.kind === 'todo') {
    return `${PATH_TODOS}?focus=${encodeURIComponent(entry.todo.id)}`;
  }
  if (entry.teamId) {
    return withItemFocus(
      teamPersonWorkspacePath(entry.teamId, { id: entry.item.personId }),
      entry.item.id,
    );
  }
  return PATH_AGENDA;
}
