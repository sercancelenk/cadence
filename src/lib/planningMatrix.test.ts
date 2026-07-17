import { describe, expect, it } from 'vitest';
import type { TodoItem } from '../model';
import {
  PLANNING_FOCUS_MAX,
  PLANNING_HUB_MAX_ITEMS,
  canAddToPlanningHub,
  canToggleFocusToday,
  comparePlanningCandidates,
  filterCandidatesDueSoon,
  filterFocusTodayItems,
  filterPlanningCandidates,
  filterPlanningHubItems,
  groupPlanningItemsByQuadrant,
  isPlanningHubItem,
  isPlanningTodoOverdue,
  isTodoDueWithinLocalDays,
  localCalendarDayKey,
  pickIdsToAddToPlanningHub,
  planningAxesForQuadrant,
  planningHubSlotsRemaining,
  planningPatchForAddToHub,
  planningPatchForRemoveFromHub,
  planningQuadrantFromItem,
  shouldClearFocusForNewDay,
  sortPlanningCandidates,
} from './planningMatrix';

function item(partial: Partial<TodoItem> & Pick<TodoItem, 'id'>): TodoItem {
  return {
    groupId: partial.groupId ?? 'g1',
    title: partial.title ?? 'Task',
    status: partial.status ?? 'todo',
    done: partial.done ?? false,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('planningQuadrantFromItem', () => {
  it('returns unsorted when either axis is unset', () => {
    expect(planningQuadrantFromItem({})).toBe('unsorted');
    expect(planningQuadrantFromItem({ planImportant: true })).toBe('unsorted');
    expect(planningQuadrantFromItem({ planUrgent: false })).toBe('unsorted');
  });

  it('maps four Eisenhower quadrants', () => {
    expect(planningQuadrantFromItem({ planImportant: true, planUrgent: true })).toBe('do');
    expect(planningQuadrantFromItem({ planImportant: true, planUrgent: false })).toBe('schedule');
    expect(planningQuadrantFromItem({ planImportant: false, planUrgent: true })).toBe('delegate');
    expect(planningQuadrantFromItem({ planImportant: false, planUrgent: false })).toBe('eliminate');
  });
});

describe('planningAxesForQuadrant', () => {
  it('round-trips with quadrantFromItem for classified quadrants', () => {
    for (const q of ['do', 'schedule', 'delegate', 'eliminate'] as const) {
      expect(planningQuadrantFromItem(planningAxesForQuadrant(q))).toBe(q);
    }
  });

  it('unsorted clears axes', () => {
    expect(planningAxesForQuadrant('unsorted')).toEqual({
      planImportant: undefined,
      planUrgent: undefined,
    });
  });
});

describe('planning filters', () => {
  const items = [
    item({ id: 'a', planInHub: true, status: 'todo' }),
    item({ id: 'b', planInHub: true, status: 'done', done: true }),
    item({ id: 'c', planInHub: false, status: 'todo' }),
    item({ id: 'd', planInHub: true, planFocusToday: true, status: 'in_progress' }),
  ];

  it('filterPlanningHubItems keeps open hub items only', () => {
    expect(filterPlanningHubItems(items).map((x) => x.id)).toEqual(['a', 'd']);
  });

  it('filterPlanningCandidates excludes hub and closed', () => {
    expect(filterPlanningCandidates(items).map((x) => x.id)).toEqual(['c']);
  });

  it('filterFocusTodayItems keeps focus pins in hub', () => {
    expect(filterFocusTodayItems(items).map((x) => x.id)).toEqual(['d']);
  });
});

describe('groupPlanningItemsByQuadrant', () => {
  it('sorts items into buckets', () => {
    const grouped = groupPlanningItemsByQuadrant([
      item({ id: '1', planImportant: true, planUrgent: true }),
      item({ id: '2', planInHub: true }),
      item({ id: '3', planImportant: false, planUrgent: false }),
    ]);
    expect(grouped.do.map((x) => x.id)).toEqual(['1']);
    expect(grouped.unsorted.map((x) => x.id)).toEqual(['2']);
    expect(grouped.eliminate.map((x) => x.id)).toEqual(['3']);
  });
});

describe('planning patches', () => {
  it('add patch opts in without preset axes', () => {
    expect(planningPatchForAddToHub()).toEqual({
      planInHub: true,
      planImportant: undefined,
      planUrgent: undefined,
      planFocusToday: undefined,
    });
  });

  it('remove patch clears hub and focus', () => {
    expect(planningPatchForRemoveFromHub()).toEqual({
      planInHub: false,
      planFocusToday: undefined,
    });
  });

  it('isPlanningHubItem is true only when planInHub is set', () => {
    expect(isPlanningHubItem({ planInHub: true })).toBe(true);
    expect(isPlanningHubItem({ planInHub: false })).toBe(false);
    expect(isPlanningHubItem({})).toBe(false);
  });
});

describe('planning limits', () => {
  it('enforces hub cap', () => {
    expect(canAddToPlanningHub(PLANNING_HUB_MAX_ITEMS - 1)).toBe(true);
    expect(canAddToPlanningHub(PLANNING_HUB_MAX_ITEMS)).toBe(false);
    expect(planningHubSlotsRemaining(18)).toBe(2);
    expect(planningHubSlotsRemaining(PLANNING_HUB_MAX_ITEMS)).toBe(0);
  });

  it('enforces focus cap', () => {
    expect(canToggleFocusToday(PLANNING_FOCUS_MAX, false)).toBe(false);
    expect(canToggleFocusToday(PLANNING_FOCUS_MAX - 1, false)).toBe(true);
    expect(canToggleFocusToday(PLANNING_FOCUS_MAX, true)).toBe(true);
  });
});

describe('planning candidate helpers', () => {
  it('sorts by due date then priority', () => {
    const later = item({ id: 'b', dueAt: '2026-07-20T12:00:00.000Z', priority: 'urgent' });
    const sooner = item({ id: 'a', dueAt: '2026-07-18T12:00:00.000Z', priority: 'low' });
    const none = item({ id: 'c', title: 'Zed' });
    expect([later, none, sooner].sort(comparePlanningCandidates).map((x) => x.id)).toEqual([
      'a',
      'b',
      'c',
    ]);

    const sameDueHigh = item({
      id: 'h',
      dueAt: '2026-07-18T12:00:00.000Z',
      priority: 'high',
      title: 'Beta',
    });
    const sameDueLow = item({
      id: 'l',
      dueAt: '2026-07-18T12:00:00.000Z',
      priority: 'low',
      title: 'Alpha',
    });
    expect(sortPlanningCandidates([sameDueLow, sameDueHigh]).map((x) => x.id)).toEqual([
      'h',
      'l',
    ]);
    const byTitle = [
      item({ id: 'z', title: 'Zoo' }),
      item({ id: 'a2', title: 'aardvark' }),
    ];
    expect(sortPlanningCandidates(byTitle).map((x) => x.id)).toEqual(['a2', 'z']);
  });

  it('detects due-soon and overdue windows', () => {
    const now = new Date('2026-07-17T12:00:00.000Z');
    expect(isTodoDueWithinLocalDays('2026-07-10T12:00:00.000Z', 7, now)).toBe(true);
    expect(isTodoDueWithinLocalDays('2026-07-20T12:00:00.000Z', 7, now)).toBe(true);
    expect(isTodoDueWithinLocalDays('2026-08-01T12:00:00.000Z', 7, now)).toBe(false);
    expect(isTodoDueWithinLocalDays(undefined, 7, now)).toBe(false);
    expect(isTodoDueWithinLocalDays('not-a-date', 7, now)).toBe(false);
    expect(isTodoDueWithinLocalDays('2026-07-17T18:00:00.000Z', -1, now)).toBe(false);

    const candidates = [
      item({ id: 'overdue', dueAt: '2026-07-10T12:00:00.000Z' }),
      item({ id: 'far', dueAt: '2026-08-01T12:00:00.000Z' }),
      item({ id: 'none' }),
    ];
    expect(filterCandidatesDueSoon(candidates, 7, now).map((x) => x.id)).toEqual(['overdue']);
    expect(filterCandidatesDueSoon(candidates, 0, now).map((x) => x.id)).toContain('overdue');
  });

  it('marks open overdue todos only', () => {
    expect(
      isPlanningTodoOverdue(item({ id: 'o', dueAt: '2020-01-01T00:00:00.000Z', status: 'todo' })),
    ).toBe(true);
    expect(
      isPlanningTodoOverdue(item({ id: 'd', dueAt: '2020-01-01T00:00:00.000Z', status: 'done' })),
    ).toBe(false);
    expect(isPlanningTodoOverdue(item({ id: 'n' }))).toBe(false);
  });
});

describe('pickIdsToAddToPlanningHub', () => {
  it('respects live hub capacity and skips ineligible ids', () => {
    const hub = Array.from({ length: PLANNING_HUB_MAX_ITEMS - 1 }, (_, i) =>
      item({ id: `t${i}`, planInHub: true, status: 'todo' }),
    );
    const items = [
      ...hub,
      item({ id: 'skip-done', status: 'done', done: true }),
      item({ id: 'a', status: 'todo' }),
      item({ id: 'b', status: 'todo' }),
    ];
    // MAX-1 open hub items → one slot; skip missing / done.
    expect(pickIdsToAddToPlanningHub(items, ['missing', 'skip-done', 'a', 'b'])).toEqual(['a']);

    const full = [
      ...Array.from({ length: PLANNING_HUB_MAX_ITEMS }, (_, i) =>
        item({ id: `f${i}`, planInHub: true, status: 'todo' }),
      ),
      item({ id: 'x', status: 'todo' }),
    ];
    expect(pickIdsToAddToPlanningHub(full, ['x'])).toEqual([]);
  });
});

describe('planning focus day rollover', () => {
  it('formats a stable local day key', () => {
    expect(localCalendarDayKey(new Date(2026, 6, 17))).toBe('2026-07-17');
  });

  it('clears only when a prior day key exists and differs', () => {
    expect(shouldClearFocusForNewDay(null, '2026-07-17')).toBe(false);
    expect(shouldClearFocusForNewDay('', '2026-07-17')).toBe(false);
    expect(shouldClearFocusForNewDay('2026-07-17', '2026-07-17')).toBe(false);
    expect(shouldClearFocusForNewDay('2026-07-16', '2026-07-17')).toBe(true);
  });
});
