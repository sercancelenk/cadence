import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDataActions, useAppDataSelector } from '../AppDataContext';
import { useToast } from '../components/ui/Toast';
import {
  setTodoStatus as setTodoStatusFn,
  updateTodoItem as updateTodoItemFn,
} from '../core/actions';
import { IcPlus, IcTarget } from '../components/icons';
import {
  AddToPlanningModal,
  PlanningFocusStrip,
  PlanningMatrixBoard,
  PlanningTodoPreviewDialog,
  planningGroupNameForItem,
  usePlanningFocusDayRollover,
} from '../features/planning';
import {
  canAddToPlanningHub,
  canToggleFocusToday,
  filterFocusTodayItems,
  filterPlanningCandidates,
  filterPlanningHubItems,
  PLANNING_FOCUS_MAX,
  planningAxesForQuadrant,
  planningPatchForAddToHub,
  planningPatchForRemoveFromHub,
  pickIdsToAddToPlanningHub,
  type PlanningQuadrant,
} from '../lib/planningMatrix';
import { isTodoOpen, type TodoStatus } from '../model';

export function PlanningPage() {
  const toast = useToast();
  const { update, updateTodoItem } = useAppDataActions();
  const { todoItems, todoGroups } = useAppDataSelector(
    (d) => ({ todoItems: d.todoItems, todoGroups: d.todoGroups }),
    (a, b) => a.todoItems === b.todoItems && a.todoGroups === b.todoGroups,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewItem = useMemo(
    () => (previewId ? todoItems.find((t) => t.id === previewId) ?? null : null),
    [previewId, todoItems],
  );

  useEffect(() => {
    if (previewId && !previewItem) setPreviewId(null);
  }, [previewId, previewItem]);

  usePlanningFocusDayRollover();

  const hubItems = useMemo(() => filterPlanningHubItems(todoItems), [todoItems]);
  const focusItems = useMemo(() => filterFocusTodayItems(todoItems), [todoItems]);
  const candidates = useMemo(() => filterPlanningCandidates(todoItems), [todoItems]);
  const focusIds = useMemo(() => new Set(focusItems.map((x) => x.id)), [focusItems]);
  const atCapacity = !canAddToPlanningHub(hubItems.length);

  const moveToQuadrant = useCallback(
    (itemId: string, quadrant: PlanningQuadrant) => {
      updateTodoItem(itemId, planningAxesForQuadrant(quadrant));
    },
    [updateTodoItem],
  );

  const addManyToHub = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      let addedCount = 0;
      const applied = update((data) => {
        const toAdd = pickIdsToAddToPlanningHub(data.todoItems, ids);
        addedCount = toAdd.length;
        if (toAdd.length === 0) return data;
        let next = data;
        for (const id of toAdd) {
          next = updateTodoItemFn(next, id, planningPatchForAddToHub());
        }
        return next;
      });
      if (!applied) {
        toast.showWarning('Could not update planning', 'Saving is temporarily blocked.');
        return;
      }
      if (addedCount === 0) {
        if (!canAddToPlanningHub(filterPlanningHubItems(todoItems).length)) {
          toast.showWarning('Planning hub is full', 'Remove a task before adding more (max 20).');
        }
        return;
      }
      setAddOpen(false);
      toast.showSuccess(
        addedCount === 1 ? 'Added to planning hub' : `Added ${addedCount} tasks to planning hub`,
      );
    },
    [toast, todoItems, update],
  );

  const removeFromHub = useCallback(
    (itemId: string) => {
      updateTodoItem(itemId, planningPatchForRemoveFromHub());
    },
    [updateTodoItem],
  );

  const toggleFocus = useCallback(
    (itemId: string) => {
      const item = todoItems.find((x) => x.id === itemId);
      if (!item?.planInHub) return;
      const focused = item.planFocusToday === true;
      if (!canToggleFocusToday(focusItems.length, focused)) {
        toast.showWarning(
          'Today focus is full',
          `Unstar a task first (max ${PLANNING_FOCUS_MAX}).`,
        );
        return;
      }
      updateTodoItem(itemId, { planFocusToday: focused ? false : true });
    },
    [focusItems.length, todoItems, toast, updateTodoItem],
  );

  const clearTodayFocus = useCallback(() => {
    let cleared = 0;
    const applied = update((data) => {
      let next = data;
      cleared = 0;
      for (const item of data.todoItems) {
        if (item.planFocusToday === true) {
          next = updateTodoItemFn(next, item.id, { planFocusToday: false });
          cleared += 1;
        }
      }
      return cleared > 0 ? next : data;
    });
    if (applied && cleared > 0) {
      toast.showSuccess('Cleared today focus');
    }
  }, [toast, update]);

  const toggleComplete = useCallback(
    (itemId: string) => {
      const item = todoItems.find((x) => x.id === itemId);
      if (!item) return;
      const next: TodoStatus = isTodoOpen(item.status) ? 'done' : 'todo';
      update((data) => {
        let out = setTodoStatusFn(data, itemId, next);
        if (next === 'done') {
          out = updateTodoItemFn(out, itemId, { planFocusToday: false, planInHub: false });
        }
        return out;
      });
    },
    [todoItems, update],
  );

  const setItemStatus = useCallback(
    (itemId: string, status: TodoStatus) => {
      update((data) => {
        let out = setTodoStatusFn(data, itemId, status);
        if (status === 'done' || status === 'cancelled') {
          out = updateTodoItemFn(out, itemId, { planFocusToday: false, planInHub: false });
        }
        return out;
      });
    },
    [update],
  );

  return (
    <div className="page page--wide planning-page">
      <header className="page-head planning-page__head">
        <div className="planning-page__head-main">
          <div className="planning-page__title-row">
            <span className="planning-page__icon" aria-hidden>
              <IcTarget size={22} />
            </span>
            <div>
              <h1 className="planning-page__title">Planning</h1>
              <p className="planning-page__lead muted">
                Personal Eisenhower matrix — separate from team to-do lists. Import open tasks,
                classify by importance and urgency, pin up to {PLANNING_FOCUS_MAX} for today.
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn--primary planning-page__add-btn"
          disabled={atCapacity}
          title={
            atCapacity
              ? 'Hub is full — remove a task from the matrix first'
              : candidates.length === 0
                ? 'All open to-dos are already in Planning — create or reopen a task in To-dos'
                : 'Add open to-dos to the planning hub'
          }
          onClick={() => setAddOpen(true)}
        >
          <IcPlus size={16} />
          <span>Add from to-dos</span>
        </button>
      </header>

      <div className="planning-page__body">
        <PlanningFocusStrip
          items={focusItems}
          groups={todoGroups}
          onToggleFocus={toggleFocus}
          onToggleComplete={toggleComplete}
          onStatusChange={setItemStatus}
          onPreview={setPreviewId}
          onClearFocus={clearTodayFocus}
        />
        <PlanningMatrixBoard
          hubItems={hubItems}
          groups={todoGroups}
          focusIds={focusIds}
          onMoveToQuadrant={moveToQuadrant}
          onToggleFocus={toggleFocus}
          onRemoveFromHub={removeFromHub}
          onToggleComplete={toggleComplete}
          onStatusChange={setItemStatus}
          onPreview={setPreviewId}
        />
      </div>

      {addOpen ? (
        <AddToPlanningModal
          candidates={candidates}
          groups={todoGroups}
          hubCount={hubItems.length}
          atCapacity={atCapacity}
          onAddMany={addManyToHub}
          onClose={() => setAddOpen(false)}
        />
      ) : null}

      {previewItem ? (
        <PlanningTodoPreviewDialog
          item={previewItem}
          groupName={planningGroupNameForItem(previewItem, todoGroups)}
          onClose={() => setPreviewId(null)}
        />
      ) : null}
    </div>
  );
}
