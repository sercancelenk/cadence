import type { AppData, Item, Person, Team, TodoGroup, TodoStatus } from '../model';
import { isTodoItemArchived, isTodoOpen } from '../model';
import { isPlanningHubItem } from './planningMatrix';
import { calendarStartOfDay, formatCalendarRangeLabel } from './calendarGrid';
import { PATH_TODOS } from './routes';
import { teamPerson } from './teamPaths';

export type ActivityPeriodPreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_year'
  | 'last_year'
  | 'custom';

export type ActivitySource = 'personal' | 'team';

export type CollectActivityRecordsOptions = {
  source: ActivitySource;
  /** When source is personal: narrow to tasks in the planning hub. */
  planningHubOnly?: boolean;
  /** When source is team: optional team filter. */
  teamId?: string;
};

export type ActivityPeriod = {
  preset: ActivityPeriodPreset;
  start: Date;
  end: Date;
  label: string;
};

export type ActivityRecord = {
  id: string;
  source: 'todo' | 'team';
  title: string;
  status: TodoStatus;
  createdAt: Date;
  updatedAt: Date;
  doneAt: Date | null;
  dueAt: Date | null;
  contextLabel: string;
  teamId?: string;
  planInHub?: boolean;
  /** In-app navigation when the row is clicked. */
  navPath?: string;
};

export type ActivityReportEntry = ActivityRecord & {
  /** Primary timestamp shown in the section (doneAt, createdAt, etc.). */
  displayAt: Date;
};

export type ActivityReport = {
  period: ActivityPeriod;
  summary: {
    completed: number;
    opened: number;
    stillOpen: number;
    cancelled: number;
  };
  completed: ActivityReportEntry[];
  opened: ActivityReportEntry[];
  stillOpen: ActivityReportEntry[];
  cancelled: ActivityReportEntry[];
};

export const ACTIVITY_PERIOD_OPTIONS: { value: ActivityPeriodPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_year', label: 'Last year' },
  { value: 'custom', label: 'Custom' },
];

export const ACTIVITY_SOURCE_OPTIONS: { value: ActivitySource; label: string }[] = [
  { value: 'personal', label: 'Personal todos' },
  { value: 'team', label: 'Team work' },
];

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

export function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function startOfYear(d: Date): Date {
  const x = startOfDay(d);
  x.setMonth(0, 1);
  return x;
}

export function parseActivityDate(v: string | Date | undefined | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Inclusive local-date range; `end` is stored exclusive (midnight after last day). */
export function getActivityPeriodFromDates(start: Date, end: Date): ActivityPeriod {
  const a = calendarStartOfDay(start);
  const b = calendarStartOfDay(end);
  const lo = a.getTime() <= b.getTime() ? a : b;
  const hi = a.getTime() <= b.getTime() ? b : a;
  const endExclusive = new Date(hi);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return {
    preset: 'custom',
    start: lo,
    end: endExclusive,
    label: formatCalendarRangeLabel(lo, hi),
  };
}

export function getActivityPeriod(preset: ActivityPeriodPreset, ref = new Date()): ActivityPeriod {
  const now = ref;
  if (preset === 'today') {
    const start = startOfDay(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      preset,
      start,
      end,
      label: start.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
    };
  }
  if (preset === 'this_week') {
    const start = startOfWeek(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return {
      preset,
      start,
      end,
      label: `${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(end.getTime() - 1).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    };
  }
  if (preset === 'this_month') {
    const start = startOfMonth(now);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return {
      preset,
      start,
      end,
      label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    };
  }
  if (preset === 'this_year') {
    const start = startOfYear(now);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    return {
      preset,
      start,
      end,
      label: String(start.getFullYear()),
    };
  }
  if (preset === 'custom') {
    return getActivityPeriodFromDates(ref, ref);
  }
  const start = startOfYear(now);
  start.setFullYear(start.getFullYear() - 1);
  const end = startOfYear(now);
  return {
    preset,
    start,
    end,
    label: String(start.getFullYear()),
  };
}

/** Reference instant for “still open” — end of period for historical presets, now otherwise. */
export function activityOpenReferenceAt(period: ActivityPeriod, ref = new Date()): Date {
  if (period.preset === 'last_year') return period.end;
  return ref;
}

export function isWithinActivityPeriod(d: Date | null, period: ActivityPeriod): boolean {
  if (!d) return false;
  return d >= period.start && d < period.end;
}

export function wasOpenAt(record: ActivityRecord, at: Date): boolean {
  if (record.createdAt >= at) return false;
  if (record.status === 'cancelled') return false;
  if (record.doneAt && record.doneAt < at) return false;
  if (record.status === 'done' && record.doneAt && record.doneAt >= at) return true;
  return isTodoOpen(record.status);
}

function teamItemStatus(item: Item): TodoStatus {
  if (item.kind === 'goal') {
    if (item.goalStatus === 'completed' || item.done) return 'done';
    if (item.goalStatus === 'cancelled') return 'cancelled';
    if (item.goalStatus === 'active') return 'in_progress';
    return 'todo';
  }
  return item.done ? 'done' : 'todo';
}

function teamItemDoneAt(item: Item): Date | null {
  if (!item.done && item.goalStatus !== 'completed') return null;
  return parseActivityDate(item.doneAt) ?? parseActivityDate(item.updatedAt);
}

export function collectActivityRecords(
  data: AppData,
  options: CollectActivityRecordsOptions,
): ActivityRecord[] {
  const { source, planningHubOnly = false, teamId } = options;
  const groupById = new Map<string, TodoGroup>(data.todoGroups.map((g) => [g.id, g]));
  const personById = new Map<string, Person>(data.people.map((p) => [p.id, p]));
  const teamById = new Map<string, Team>(data.teams.map((t) => [t.id, t]));
  const out: ActivityRecord[] = [];

  if (source === 'personal') {
    for (const item of data.todoItems) {
      if (isTodoItemArchived(item)) continue;
      if (planningHubOnly && !isPlanningHubItem(item)) continue;
      const createdAt = parseActivityDate(item.createdAt);
      if (!createdAt) continue;
      out.push({
        id: item.id,
        source: 'todo',
        title: item.title,
        status: item.status,
        createdAt,
        updatedAt: parseActivityDate(item.updatedAt) ?? createdAt,
        doneAt:
          item.status === 'done'
            ? parseActivityDate(item.doneAt) ?? parseActivityDate(item.updatedAt) ?? createdAt
            : null,
        dueAt: parseActivityDate(item.dueAt),
        contextLabel: groupById.get(item.groupId)?.name ?? 'List',
        planInHub: item.planInHub === true,
        navPath: `${PATH_TODOS}?focus=${encodeURIComponent(item.id)}`,
      });
    }
    return out;
  }

  for (const item of data.items) {
    if (item.kind !== 'task' && item.kind !== 'goal') continue;
    const person = personById.get(item.personId);
    if (teamId && person?.teamId !== teamId) continue;
    const createdAt = parseActivityDate(item.createdAt);
    if (!createdAt) continue;
    const team = person ? teamById.get(person.teamId) : undefined;
    const status = teamItemStatus(item);
    out.push({
      id: item.id,
      source: 'team',
      title: item.title,
      status,
      createdAt,
      updatedAt: parseActivityDate(item.updatedAt) ?? createdAt,
      doneAt: teamItemDoneAt(item),
      dueAt: parseActivityDate(item.dueAt),
      contextLabel: team ? `${team.name} · ${person?.name ?? 'Member'}` : person?.name ?? 'Team',
      teamId: person?.teamId,
      navPath: person
        ? `${teamPerson(person.teamId, item.personId)}?focus=${encodeURIComponent(item.id)}`
        : undefined,
    });
  }

  return out;
}

function sortByDisplayAtDesc(a: ActivityReportEntry, b: ActivityReportEntry): number {
  return b.displayAt.getTime() - a.displayAt.getTime();
}

export function buildActivityReport(
  records: ActivityRecord[],
  period: ActivityPeriod,
  ref = new Date(),
): ActivityReport {
  const openAt = activityOpenReferenceAt(period, ref);

  const completed = records
    .filter((r) => r.status === 'done' && r.doneAt && isWithinActivityPeriod(r.doneAt, period))
    .map((r) => ({ ...r, displayAt: r.doneAt! }))
    .sort(sortByDisplayAtDesc);

  const opened = records
    .filter((r) => isWithinActivityPeriod(r.createdAt, period))
    .map((r) => ({ ...r, displayAt: r.createdAt }))
    .sort(sortByDisplayAtDesc);

  const cancelled = records
    .filter((r) => r.status === 'cancelled' && isWithinActivityPeriod(r.updatedAt, period))
    .map((r) => ({ ...r, displayAt: r.updatedAt }))
    .sort(sortByDisplayAtDesc);

  const stillOpen = records
    .filter((r) => wasOpenAt(r, openAt))
    .map((r) => ({ ...r, displayAt: r.dueAt ?? r.updatedAt }))
    .sort((a, b) => {
      const ad = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bd = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (ad !== bd) return ad - bd;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  return {
    period,
    summary: {
      completed: completed.length,
      opened: opened.length,
      stillOpen: stillOpen.length,
      cancelled: cancelled.length,
    },
    completed,
    opened,
    stillOpen,
    cancelled,
  };
}

export function buildActivityReportFromData(
  data: AppData,
  options: {
    source: ActivitySource;
    planningHubOnly?: boolean;
    preset?: ActivityPeriodPreset;
    period?: ActivityPeriod;
    teamId?: string;
    ref?: Date;
  },
): ActivityReport {
  const period =
    options.period ??
    getActivityPeriod(options.preset ?? 'this_week', options.ref);
  const records = collectActivityRecords(data, {
    source: options.source,
    planningHubOnly: options.planningHubOnly,
    teamId: options.teamId,
  });
  return buildActivityReport(records, period, options.ref);
}
