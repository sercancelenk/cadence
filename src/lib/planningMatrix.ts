import { isPast } from './datetime';
import { isTodoOpen, isTodoItemArchived, priorityRank, type TodoItem } from '../model';

/** Eisenhower quadrant — derived from manual axes, not stored. */
export type PlanningQuadrant = 'do' | 'schedule' | 'delegate' | 'eliminate' | 'unsorted';

export const PLANNING_HUB_MAX_ITEMS = 20;
export const PLANNING_FOCUS_MAX = 10;

/** localStorage key for the calendar day that currently owns “today focus” pins. */
export const PLANNING_FOCUS_DAY_STORAGE_KEY = 'cadence.planning.focusDay';

export type PlanningQuadrantMeta = {
  id: PlanningQuadrant;
  title: string;
  hint: string;
};

export const PLANNING_QUADRANT_META: PlanningQuadrantMeta[] = [
  { id: 'do', title: 'Do first', hint: 'Important and urgent' },
  { id: 'schedule', title: 'Schedule', hint: 'Important, not urgent' },
  { id: 'delegate', title: 'Delegate', hint: 'Urgent, not important' },
  { id: 'eliminate', title: 'Eliminate', hint: 'Neither important nor urgent' },
];

export const PLANNING_UNSORTED_META: PlanningQuadrantMeta = {
  id: 'unsorted',
  title: 'Unsorted',
  hint: 'Drag into a quadrant to classify',
};

export function isPlanningHubItem(item: Pick<TodoItem, 'planInHub'>): boolean {
  return item.planInHub === true;
}

/** Open todos opted into the personal planning hub. */
export function filterPlanningHubItems(items: TodoItem[]): TodoItem[] {
  return items.filter(
    (item) => isPlanningHubItem(item) && isTodoOpen(item.status) && !isTodoItemArchived(item),
  );
}

export function filterFocusTodayItems(items: TodoItem[]): TodoItem[] {
  return filterPlanningHubItems(items).filter((item) => item.planFocusToday === true);
}

/** Open todos not yet in the hub — candidates for “Add from to-dos”. */
export function filterPlanningCandidates(items: TodoItem[]): TodoItem[] {
  return items.filter(
    (item) => isTodoOpen(item.status) && !isPlanningHubItem(item) && !isTodoItemArchived(item),
  );
}

export function planningQuadrantFromItem(
  item: Pick<TodoItem, 'planImportant' | 'planUrgent'>,
): PlanningQuadrant {
  const { planImportant, planUrgent } = item;
  if (planImportant === undefined || planUrgent === undefined) return 'unsorted';
  if (planImportant && planUrgent) return 'do';
  if (planImportant && !planUrgent) return 'schedule';
  if (!planImportant && planUrgent) return 'delegate';
  return 'eliminate';
}

export function planningAxesForQuadrant(quadrant: PlanningQuadrant): {
  planImportant: boolean | undefined;
  planUrgent: boolean | undefined;
} {
  switch (quadrant) {
    case 'do':
      return { planImportant: true, planUrgent: true };
    case 'schedule':
      return { planImportant: true, planUrgent: false };
    case 'delegate':
      return { planImportant: false, planUrgent: true };
    case 'eliminate':
      return { planImportant: false, planUrgent: false };
    case 'unsorted':
      return { planImportant: undefined, planUrgent: undefined };
  }
}

export function groupPlanningItemsByQuadrant(
  items: TodoItem[],
): Record<PlanningQuadrant, TodoItem[]> {
  const buckets: Record<PlanningQuadrant, TodoItem[]> = {
    do: [],
    schedule: [],
    delegate: [],
    eliminate: [],
    unsorted: [],
  };
  for (const item of items) {
    buckets[planningQuadrantFromItem(item)].push(item);
  }
  return buckets;
}

export function canAddToPlanningHub(currentHubCount: number): boolean {
  return currentHubCount < PLANNING_HUB_MAX_ITEMS;
}

export function canToggleFocusToday(currentFocusCount: number, alreadyFocused: boolean): boolean {
  if (alreadyFocused) return true;
  return currentFocusCount < PLANNING_FOCUS_MAX;
}

export function planningPatchForAddToHub(): Pick<
  TodoItem,
  'planInHub' | 'planImportant' | 'planUrgent' | 'planFocusToday'
> {
  return {
    planInHub: true,
    planImportant: undefined,
    planUrgent: undefined,
    planFocusToday: undefined,
  };
}

export function planningPatchForRemoveFromHub(): Pick<
  TodoItem,
  'planInHub' | 'planFocusToday'
> {
  return {
    planInHub: false,
    planFocusToday: undefined,
  };
}

export function planningHubSlotsRemaining(currentHubCount: number): number {
  return Math.max(0, PLANNING_HUB_MAX_ITEMS - currentHubCount);
}

/**
 * Pick candidate ids to add without exceeding the hub cap.
 * Evaluates against live `items` (open + not already in hub).
 */
export function pickIdsToAddToPlanningHub(items: TodoItem[], requestedIds: string[]): string[] {
  let hubCount = filterPlanningHubItems(items).length;
  const picked: string[] = [];
  for (const id of requestedIds) {
    if (hubCount >= PLANNING_HUB_MAX_ITEMS) break;
    const item = items.find((x) => x.id === id);
    if (!item || item.planInHub || !isTodoOpen(item.status) || isTodoItemArchived(item)) {
      continue;
    }
    picked.push(id);
    hubCount += 1;
  }
  return picked;
}

/** Local calendar day as `YYYY-MM-DD` (for focus-day rollover). */
export function localCalendarDayKey(ref = new Date()): string {
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, '0');
  const d = String(ref.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * True when a previously recorded focus day exists and is not today —
 * first launch (null/empty) must not wipe pins.
 */
export function shouldClearFocusForNewDay(
  storedDayKey: string | null | undefined,
  todayKey: string,
): boolean {
  if (!storedDayKey?.trim()) return false;
  return storedDayKey !== todayKey;
}

/**
 * Due date is overdue, or falls on/before the local end of `now + days`
 * (e.g. days=7 from Mon → through next Mon 23:59:59).
 */
export function isTodoDueWithinLocalDays(
  dueAt: string | undefined,
  days: number,
  now = new Date(),
): boolean {
  if (!dueAt || days < 0) return false;
  const t = Date.parse(dueAt);
  if (Number.isNaN(t)) return false;
  if (t < now.getTime()) return true;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 23, 59, 59, 999);
  return t <= end.getTime();
}

/** Sort candidates: earliest due first, then priority, then title. */
export function comparePlanningCandidates(a: TodoItem, b: TodoItem): number {
  const aDue = a.dueAt ? Date.parse(a.dueAt) : Number.NaN;
  const bDue = b.dueAt ? Date.parse(b.dueAt) : Number.NaN;
  const aHas = !Number.isNaN(aDue);
  const bHas = !Number.isNaN(bDue);
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (aHas && bHas && aDue !== bDue) return aDue - bDue;
  const pr = priorityRank(a.priority) - priorityRank(b.priority);
  if (pr !== 0) return pr;
  return a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
}

export function sortPlanningCandidates(items: TodoItem[]): TodoItem[] {
  return [...items].sort(comparePlanningCandidates);
}

export function filterCandidatesDueSoon(
  items: TodoItem[],
  withinDays = 7,
  now = new Date(),
): TodoItem[] {
  return items.filter((item) => isTodoDueWithinLocalDays(item.dueAt, withinDays, now));
}

export function isPlanningTodoOverdue(item: Pick<TodoItem, 'dueAt' | 'status'>): boolean {
  return !!item.dueAt && isPast(item.dueAt) && isTodoOpen(item.status);
}
