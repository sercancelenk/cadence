import { useCallback, useMemo, useState } from 'react';
import { useAppDataActions, useAppDataSelector } from '../AppDataContext';
import { useToast } from '../components/ui/Toast';
import { IcPlus, IcTarget } from '../components/icons';
import {
  AddToPlanningModal,
  PlanningFocusStrip,
  PlanningMatrixBoard,
} from '../features/planning';
import {
  canAddToPlanningHub,
  canToggleFocusToday,
  filterFocusTodayItems,
  filterPlanningCandidates,
  filterPlanningHubItems,
  planningAxesForQuadrant,
  planningPatchForAddToHub,
  planningPatchForRemoveFromHub,
  type PlanningQuadrant,
} from '../lib/planningMatrix';
import { isTodoOpen, type TodoStatus } from '../model';

export function PlanningPage() {
  const toast = useToast();
  const { updateTodoItem, setTodoStatus } = useAppDataActions();
  const { todoItems, todoGroups } = useAppDataSelector(
    (d) => ({ todoItems: d.todoItems, todoGroups: d.todoGroups }),
    (a, b) => a.todoItems === b.todoItems && a.todoGroups === b.todoGroups,
  );
  const [addOpen, setAddOpen] = useState(false);

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

  const addToHub = useCallback(
    (itemId: string) => {
      if (atCapacity) {
        toast.showWarning('Planning hub is full', 'Remove a task before adding more (max 20).');
        return;
      }
      updateTodoItem(itemId, planningPatchForAddToHub());
      setAddOpen(false);
      toast.showSuccess('Added to planning hub');
    },
    [atCapacity, toast, updateTodoItem],
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
        toast.showWarning('Today focus is full', 'Unstar a task first (max 3).');
        return;
      }
      updateTodoItem(itemId, { planFocusToday: focused ? false : true });
    },
    [focusItems.length, todoItems, toast, updateTodoItem],
  );

  const toggleComplete = useCallback(
    (itemId: string) => {
      const item = todoItems.find((x) => x.id === itemId);
      if (!item) return;
      const next: TodoStatus = isTodoOpen(item.status) ? 'done' : 'todo';
      setTodoStatus(itemId, next);
      if (next === 'done') {
        updateTodoItem(itemId, { planFocusToday: false });
      }
    },
    [setTodoStatus, todoItems, updateTodoItem],
  );

  const setItemStatus = useCallback(
    (itemId: string, status: TodoStatus) => {
      setTodoStatus(itemId, status);
      if (status === 'done' || status === 'cancelled') {
        updateTodoItem(itemId, { planFocusToday: false });
      }
    },
    [setTodoStatus, updateTodoItem],
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
                classify by importance and urgency, pin up to three for today.
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn--primary planning-page__add-btn"
          disabled={atCapacity || candidates.length === 0}
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
        />
      </div>

      {addOpen ? (
        <AddToPlanningModal
          candidates={candidates}
          groups={todoGroups}
          atCapacity={atCapacity}
          onAdd={addToHub}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
    </div>
  );
}
