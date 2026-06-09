import { isTodoOpen, isTodoItemArchived, type TodoItem } from '../model';

/** Eisenhower quadrant — derived from manual axes, not stored. */
export type PlanningQuadrant = 'do' | 'schedule' | 'delegate' | 'eliminate' | 'unsorted';

export const PLANNING_HUB_MAX_ITEMS = 20;
export const PLANNING_FOCUS_MAX = 3;

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
