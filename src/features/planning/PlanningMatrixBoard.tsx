import { useMemo, useState } from 'react';
import type { TodoGroup, TodoItem, TodoStatus } from '../../model';
import {
  PLANNING_FOCUS_MAX,
  PLANNING_HUB_MAX_ITEMS,
  PLANNING_QUADRANT_META,
  PLANNING_UNSORTED_META,
  groupPlanningItemsByQuadrant,
} from '../../lib/planningMatrix';
import { PlanningQuadrantCell } from './PlanningMatrix';
import type { PlanningQuadrant } from '../../lib/planningMatrix';

export type PlanningMatrixBoardProps = {
  hubItems: TodoItem[];
  groups: TodoGroup[];
  focusIds: Set<string>;
  onMoveToQuadrant: (itemId: string, quadrant: PlanningQuadrant) => void;
  onToggleFocus: (id: string) => void;
  onRemoveFromHub: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onStatusChange: (id: string, status: TodoStatus) => void;
};

export function PlanningMatrixBoard({
  hubItems,
  groups,
  focusIds,
  onMoveToQuadrant,
  onToggleFocus,
  onRemoveFromHub,
  onToggleComplete,
  onStatusChange,
}: PlanningMatrixBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const byQuadrant = useMemo(() => groupPlanningItemsByQuadrant(hubItems), [hubItems]);

  const handleDrop = (quadrant: PlanningQuadrant, itemId: string) => {
    onMoveToQuadrant(itemId, quadrant);
    setDraggingId(null);
  };

  return (
    <div className="planning-matrix">
      <div className="planning-matrix__head">
        <h2 className="planning-matrix__title">Eisenhower matrix</h2>
        <p className="planning-matrix__lead muted small">
          {hubItems.length}/{PLANNING_HUB_MAX_ITEMS} in hub · drag tasks between quadrants · today
          focus up to {PLANNING_FOCUS_MAX}
        </p>
      </div>
      <div className="planning-matrix__grid">
        {PLANNING_QUADRANT_META.map((meta) => (
          <PlanningQuadrantCell
            key={meta.id}
            quadrant={meta.id}
            title={meta.title}
            hint={meta.hint}
            items={byQuadrant[meta.id]}
            groupById={groupById}
            focusIds={focusIds}
            draggingId={draggingId}
            onDrop={handleDrop}
            onToggleFocus={onToggleFocus}
            onRemoveFromHub={onRemoveFromHub}
            onToggleComplete={onToggleComplete}
            onStatusChange={onStatusChange}
            onDragStart={setDraggingId}
            onDragEnd={() => setDraggingId(null)}
          />
        ))}
      </div>
      <PlanningQuadrantCell
        quadrant={PLANNING_UNSORTED_META.id}
        title={PLANNING_UNSORTED_META.title}
        hint={PLANNING_UNSORTED_META.hint}
        items={byQuadrant.unsorted}
        groupById={groupById}
        focusIds={focusIds}
        draggingId={draggingId}
        onDrop={handleDrop}
        onToggleFocus={onToggleFocus}
        onRemoveFromHub={onRemoveFromHub}
        onToggleComplete={onToggleComplete}
        onStatusChange={onStatusChange}
        onDragStart={setDraggingId}
        onDragEnd={() => setDraggingId(null)}
      />
    </div>
  );
}
