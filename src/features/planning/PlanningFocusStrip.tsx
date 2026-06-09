import type { TodoGroup, TodoItem, TodoStatus } from '../../model';
import { TODO_STATUS_OPTIONS } from '../../model';
import { PLANNING_FOCUS_MAX } from '../../lib/planningMatrix';

export type PlanningFocusStripProps = {
  items: TodoItem[];
  groups: TodoGroup[];
  onToggleFocus: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onStatusChange: (id: string, status: TodoStatus) => void;
};

export function PlanningFocusStrip({
  items,
  groups,
  onToggleFocus,
  onToggleComplete,
  onStatusChange,
}: PlanningFocusStripProps) {
  const groupById = new Map(groups.map((g) => [g.id, g]));

  return (
    <section className="planning-focus" aria-label="Today focus">
      <div className="planning-focus__head">
        <h2 className="planning-focus__title">Today focus</h2>
        <p className="planning-focus__lead muted small">
          {items.length}/{PLANNING_FOCUS_MAX} pinned — star tasks in the matrix to add them here
        </p>
      </div>
      {items.length === 0 ? (
        <p className="planning-focus__empty muted small">
          No focus tasks yet. Star up to {PLANNING_FOCUS_MAX} items you want to finish today.
        </p>
      ) : (
        <ul className="planning-focus__list">
          {items.map((item) => {
            const statusMeta = TODO_STATUS_OPTIONS.find((o) => o.value === item.status);
            return (
            <li key={item.id} className="planning-focus__item">
              <button
                type="button"
                className="planning-focus__check"
                aria-label={`Mark "${item.title}" done`}
                onClick={() => onToggleComplete(item.id)}
              />
              <div className="planning-focus__body">
                <span className="planning-focus__task-title">{item.title}</span>
                <span className="planning-focus__list-name muted small">
                  {groupById.get(item.groupId)?.name ?? 'List'}
                </span>
              </div>
              <select
                className={`planning-focus__status planning-focus__status--${item.status}`}
                value={item.status}
                aria-label={`Status for ${item.title}`}
                title={statusMeta?.label}
                onChange={(e) => onStatusChange(item.id, e.target.value as TodoStatus)}
              >
                {TODO_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.shortLabel}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="planning-focus__unpin"
                aria-label="Remove from today focus"
                onClick={() => onToggleFocus(item.id)}
              >
                ★
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
