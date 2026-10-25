import type { AppData, Note, TodoItem } from '../../core/model';
import { clip, isBlankText } from './prompts/shared';

export type ActivityWindow = { now: Date; days: number };
export type ActivityTask = { title: string; at?: string };
export type ActivitySummary = {
  days: number;
  done: ActivityTask[];
  created: ActivityTask[];
  inProgress: ActivityTask[];
  overdue: ActivityTask[];
  notes: { title: string }[];
  /** How many there were before each list was cut to its limit. */
  counts: { done: number; created: number; inProgress: number; overdue: number; notes: number };
};

const LIMITS = { done: 60, created: 40, inProgress: 30, overdue: 30, notes: 30 } as const;
const MAX_TITLE = 120;

const time = (iso: string | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : NaN;
};
const title = (t: string): string => clip(t.replace(/\s+/g, ' ').trim(), MAX_TITLE);

/** Newest first, cut to `limit`, with titles tidied and empty ones dropped. */
function pick<T>(rows: T[], limit: number, at: (r: T) => number, name: (r: T) => string): { rows: ActivityTask[]; total: number } {
  const named = rows
    .map((r) => ({ title: title(name(r)), at: at(r) }))
    .filter((r) => !isBlankText(r.title))
    .sort((a, b) => b.at - a.at);
  return {
    total: named.length,
    rows: named.slice(0, limit).map((r) => ({ title: r.title, at: Number.isFinite(r.at) ? new Date(r.at).toISOString() : undefined })),
  };
}

/**
 * What happened in the last `days` local days (today included), as counts and titles. Reads only
 * tasks and note titles: no note bodies, no locked or archived notes, and no people records.
 */
export function collectActivity(data: AppData, { now, days }: ActivityWindow): ActivitySummary {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  const end = now.getTime();
  const inWindow = (iso: string | undefined) => {
    const t = time(iso);
    return Number.isFinite(t) && t >= start && t <= end;
  };
  const live = (t: TodoItem) => !t.archived && t.status !== 'cancelled';
  const todos = data.todoItems ?? [];

  const done = pick(todos.filter((t) => t.status === 'done' && inWindow(t.doneAt)), LIMITS.done, (t) => time(t.doneAt), (t) => t.title);
  const created = pick(todos.filter((t) => live(t) && inWindow(t.createdAt)), LIMITS.created, (t) => time(t.createdAt), (t) => t.title);
  const inProgress = pick(todos.filter((t) => live(t) && t.status === 'in_progress'), LIMITS.inProgress, (t) => time(t.updatedAt), (t) => t.title);
  const overdue = pick(
    todos.filter((t) => live(t) && t.status !== 'done' && time(t.dueAt) < end),
    LIMITS.overdue,
    (t) => time(t.dueAt),
    (t) => t.title,
  );
  const notes = pick(
    (data.notes ?? []).filter((n: Note) => !n.locked && !n.archived && inWindow(n.updatedAt)),
    LIMITS.notes,
    (n) => time(n.updatedAt),
    (n) => n.title,
  );

  return {
    days,
    done: done.rows,
    created: created.rows,
    inProgress: inProgress.rows,
    overdue: overdue.rows,
    notes: notes.rows.map((n) => ({ title: n.title })),
    counts: { done: done.total, created: created.total, inProgress: inProgress.total, overdue: overdue.total, notes: notes.total },
  };
}

/** The summary as plain lines for the prompt. */
export function describeActivity(a: ActivitySummary): string {
  const section = (name: string, total: number, rows: { title: string }[]) =>
    [`${name} (${total})`, ...(rows.length ? rows.map((r) => `- ${r.title}`) : ['- (none)']), ...(total > rows.length ? [`- … and ${total - rows.length} more`] : [])].join('\n');
  return [
    `Last ${a.days} days`,
    section('Done', a.counts.done, a.done),
    section('Created', a.counts.created, a.created),
    section('In progress', a.counts.inProgress, a.inProgress),
    section('Overdue', a.counts.overdue, a.overdue),
    section('Notes edited', a.counts.notes, a.notes),
  ].join('\n\n');
}
