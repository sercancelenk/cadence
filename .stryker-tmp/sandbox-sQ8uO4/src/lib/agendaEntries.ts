// @ts-nocheck
import { isTodoOpen, type AppData, type Item, type TodoItem } from '../model';
import { PATH_AGENDA, PATH_TODOS } from './routes';
import { teamPerson } from './teamPaths';

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
  | { kind: 'todo'; key: string; when: Date; todo: TodoItem; groupName?: string };

export type AgendaDayBucket = {
  key: string;
  label: string;
  subtitle: string;
  isToday: boolean;
  entries: AgendaEntry[];
};

export type CollectAgendaEntriesOptions = {
  showCompleted?: boolean;
};

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
  { showCompleted = false }: CollectAgendaEntriesOptions = {},
): AgendaEntry[] {
  const out: AgendaEntry[] = [];

  for (const it of data.items) {
    if (it.done && !showCompleted) continue;
    const person = data.people.find((p) => p.id === it.personId);
    const team = person ? data.teams.find((t) => t.id === person.teamId) : undefined;
    if (it.remindAt) {
      const d = new Date(it.remindAt);
      if (!Number.isNaN(d.getTime())) {
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
    if (it.dueAt && it.dueAt !== it.remindAt) {
      const d = new Date(it.dueAt);
      if (!Number.isNaN(d.getTime())) {
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
    if (t.status === 'cancelled') continue;
    if (!isTodoOpen(t.status) && !showCompleted) continue;
    if (!t.dueAt) continue;
    const d = new Date(t.dueAt);
    if (Number.isNaN(d.getTime())) continue;
    const group = data.todoGroups.find((g) => g.id === t.groupId);
    out.push({ kind: 'todo', key: t.id, when: d, todo: t, groupName: group?.name });
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
    return teamPerson(entry.teamId, entry.item.personId);
  }
  return PATH_AGENDA;
}
