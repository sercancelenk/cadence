import type { TodoGroup } from '../model';

/**
 * Default list for quick task creation (notes bubble, etc.).
 * Prefer non-archived groups (Quick Add parity); fall back to any group.
 */
export function defaultTodoGroupId(groups: TodoGroup[]): string | undefined {
  const ordered = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  return ordered.find((g) => !g.archived)?.id ?? ordered[0]?.id;
}
