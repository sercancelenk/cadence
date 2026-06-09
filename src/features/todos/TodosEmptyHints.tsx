import type { DragEvent } from 'react';
import type { TodoGroup, TodoItem } from '../../model';

type Props = {
  allGroupsSorted: TodoGroup[];
  todoItems: TodoItem[];
  showArchived: boolean;
  onShowArchived: () => void;
};

export function TodosFilteredEmptyHint({
  allGroupsSorted,
  todoItems,
  showArchived,
  onShowArchived,
}: Props) {
  const archived = allGroupsSorted.filter((g) => g.archived).length;
  const allArchived = archived > 0 && archived === allGroupsSorted.length;
  const itemsInArchived = todoItems.filter((it) =>
    allGroupsSorted.some((g) => g.id === it.groupId && g.archived),
  ).length;

  return (
    <section
      className={`card todos-empty-hint${allArchived ? ' todos-empty-hint--alarm' : ''}`}
      role={allArchived ? 'alert' : undefined}
    >
      <h3 className="todos-empty-hint__title">
        {allArchived
          ? `⚠ Your data is safe — all ${archived} of your lists are archived (${itemsInArchived} items inside).`
          : 'No lists match the current filters.'}
      </h3>
      <p className="muted small todos-empty-hint__body">
        {allArchived
          ? 'Your todos are still on disk. Click below to bring them back, or pick "Unarchive" from each list\'s menu to permanently restore it. (You can also restore an earlier snapshot from Settings → Backups & Recovery.)'
          : 'Adjust the status filter or search box above, or create a new list below.'}
      </p>
      {allArchived && !showArchived ? (
        <button type="button" className="btn btn--primary" onClick={onShowArchived}>
          Show archived lists
        </button>
      ) : null}
    </section>
  );
}

export function TodosArchivedEmptyHint() {
  return (
    <section className="card todos-empty-hint">
      <h3 className="todos-empty-hint__title">No archived tasks</h3>
      <p className="muted small todos-empty-hint__body">
        Archive a task from the <strong>Active</strong> view using the archive icon on its row. Archived
        tasks stay on disk and can be restored anytime.
      </p>
    </section>
  );
}

export function TodosNoListsHint() {
  return (
    <section className="card todos-empty-hint">
      <h3 className="todos-empty-hint__title">No lists yet</h3>
      <p className="muted small todos-empty-hint__body">
        Use <strong>Add list</strong> at the top of the page to create your first list.
      </p>
    </section>
  );
}

export function TodosGroupDropTail({
  active,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  active: boolean;
  isDropTarget: boolean;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
}) {
  if (!active) return null;
  return (
    <div
      className={`todos-drop-tail${isDropTarget ? ' todos-drop-tail--active' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      Drop here to move to the end
    </div>
  );
}
