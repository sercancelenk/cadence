import { describe, expect, it } from 'vitest';
import type { TodoItem } from '../model';
import {
  PLANNING_FOCUS_MAX,
  PLANNING_HUB_MAX_ITEMS,
  canAddToPlanningHub,
  canToggleFocusToday,
  filterFocusTodayItems,
  filterPlanningCandidates,
  filterPlanningHubItems,
  groupPlanningItemsByQuadrant,
  isPlanningHubItem,
  planningAxesForQuadrant,
  planningPatchForAddToHub,
  planningPatchForRemoveFromHub,
  planningQuadrantFromItem,
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
  });

  it('enforces focus cap', () => {
    expect(canToggleFocusToday(PLANNING_FOCUS_MAX, false)).toBe(false);
    expect(canToggleFocusToday(PLANNING_FOCUS_MAX - 1, false)).toBe(true);
    expect(canToggleFocusToday(PLANNING_FOCUS_MAX, true)).toBe(true);
  });
});
