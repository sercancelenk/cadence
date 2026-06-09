import { TODO_STATUS_OPTIONS, isTodoItemArchived, isTodoOpen, type TodoStatus, type TodoItem } from '../../model';

const LS_TODO_SECTIONS = 'cadence.todos.sectionsOpen.v1';
const LS_TODO_SHOW_ARCHIVED = 'cadence.todos.showArchived.v1';
const LS_TODO_ITEM_VIEW = 'cadence.todos.itemView.v1';
const LS_TODO_HIDE_DONE = 'cadence.todos.hideDone.v1';
const LS_TODO_SORT_MODE = 'cadence.todos.sortMode.v1';
const LS_TODO_STATUS_FILTER = 'cadence.todos.statusFilter.v1';

export function todoSectionsStorageKey(userId: string) {
  return `${LS_TODO_SECTIONS}:${userId}`;
}

export function todoShowArchivedKey(userId: string) {
  return `${LS_TODO_SHOW_ARCHIVED}:${userId}`;
}

export function todoItemViewKey(userId: string) {
  return `${LS_TODO_ITEM_VIEW}:${userId}`;
}

export function todoHideDoneKey(userId: string) {
  return `${LS_TODO_HIDE_DONE}:${userId}`;
}

export function todoSortModeKey(userId: string) {
  return `${LS_TODO_SORT_MODE}:${userId}`;
}

export function todoStatusFilterKey(userId: string) {
  return `${LS_TODO_STATUS_FILTER}:${userId}`;
}

export type SortMode =
  | 'manual'
  | 'priority'
  | 'due'
  | 'status'
  | 'created'
  | 'updated'
  | 'completed';

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'manual', label: 'Manual order' },
  { value: 'priority', label: 'By priority' },
  { value: 'due', label: 'By due date' },
  { value: 'status', label: 'By status' },
  { value: 'created', label: 'By created date (newest)' },
  { value: 'updated', label: 'By updated date (newest)' },
  { value: 'completed', label: 'By completed date (newest)' },
];

export const ALLOWED_SORT_MODES: SortMode[] = SORT_OPTIONS.map((o) => o.value);

export type StatusFilter = 'all' | 'open' | TodoStatus;

export type TodoItemViewMode = 'active' | 'archived';

export const TODO_ITEM_VIEW_OPTIONS: { value: TodoItemViewMode; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export function filterTodoItemsForView(items: TodoItem[], mode: TodoItemViewMode): TodoItem[] {
  return items.filter((it) =>
    mode === 'archived' ? isTodoItemArchived(it) : !isTodoItemArchived(it),
  );
}

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open (todo + WIP)' },
  ...TODO_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
];

export function matchesStatusFilter(status: TodoStatus, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') return isTodoOpen(status);
  return status === filter;
}

export function parseStatusFilter(raw: string | null): StatusFilter {
  if (!raw) return 'all';
  if (STATUS_FILTER_OPTIONS.some((o) => o.value === raw)) return raw as StatusFilter;
  return 'all';
}

export function isSectionOpen(map: Record<string, boolean>, groupId: string): boolean {
  return map[groupId] !== false;
}
