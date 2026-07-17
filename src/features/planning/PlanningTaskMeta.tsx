import { formatDateShort, formatTimeOnly } from '../../lib/datetime';
import { isPlanningTodoOverdue } from '../../lib/planningMatrix';
import { PRIORITY_OPTIONS, type TodoItem } from '../../model';
import { priorityShort } from '../todos/todoUiUtils';

/** Compact due + priority chips for planning cards and focus rows. */
export function PlanningTaskMeta({ item }: { item: TodoItem }) {
  const overdue = isPlanningTodoOverdue(item);
  const prio = item.priority
    ? PRIORITY_OPTIONS.find((o) => o.value === item.priority)
    : undefined;
  const dueDate = formatDateShort(item.dueAt);
  const dueTime = formatTimeOnly(item.dueAt);

  if (!dueDate && !prio) return null;

  return (
    <span className="planning-task-meta">
      {dueDate ? (
        <span
          className={`planning-task-meta__due${overdue ? ' planning-task-meta__due--overdue' : ''}`}
          title={overdue ? `Overdue · ${dueDate}${dueTime ? ` ${dueTime}` : ''}` : undefined}
        >
          {overdue ? 'Overdue · ' : 'Due '}
          {dueDate}
          {dueTime ? ` · ${dueTime}` : ''}
        </span>
      ) : null}
      {prio ? (
        <span
          className={`planning-task-meta__prio planning-task-meta__prio--${prio.value}`}
          title={`Priority: ${prio.label}`}
        >
          {priorityShort(prio.value)}
        </span>
      ) : null}
    </span>
  );
}
