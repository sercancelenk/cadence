import { priorityRank, todoStatusRank } from '../../model';
import type { TodoGroup, TodoItem } from '../../model';
import { legacyBodyPlainText } from './todoBody';
import type { SortMode } from './todoPreferences';

function cmpDateDesc(a?: string, b?: string): number {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  const aBad = Number.isNaN(ta);
  const bBad = Number.isNaN(tb);
  if (aBad && bBad) return 0;
  if (aBad) return 1;
  if (bBad) return -1;
  return tb - ta;
}

/** Build per-group item lists sorted according to the active sort mode. */
export function buildItemsByGroup(
  todoGroups: TodoGroup[],
  todoItems: TodoItem[],
  sortMode: SortMode,
): Map<string, TodoItem[]> {
  const m = new Map<string, TodoItem[]>();
  for (const g of todoGroups) m.set(g.id, []);
  for (const it of todoItems) {
    const arr = m.get(it.groupId) ?? [];
    arr.push(it);
    m.set(it.groupId, arr);
  }
  const orderOf = (x: TodoItem) => x.sortOrder ?? 0;
  const dueOf = (x: TodoItem) => (x.dueAt ? Date.parse(x.dueAt) : Infinity);

  for (const arr of m.values()) {
    arr.sort((a, b) => {
      if (sortMode === 'priority') {
        const dp = priorityRank(a.priority) - priorityRank(b.priority);
        if (dp !== 0) return dp;
        return orderOf(a) - orderOf(b);
      }
      if (sortMode === 'due') {
        const dd = dueOf(a) - dueOf(b);
        if (dd !== 0) return dd;
        return orderOf(a) - orderOf(b);
      }
      if (sortMode === 'status') {
        const ds = todoStatusRank(a.status) - todoStatusRank(b.status);
        if (ds !== 0) return ds;
        return orderOf(a) - orderOf(b);
      }
      if (sortMode === 'created') {
        const d = cmpDateDesc(a.createdAt, b.createdAt);
        if (d !== 0) return d;
        return orderOf(a) - orderOf(b);
      }
      if (sortMode === 'updated') {
        const d = cmpDateDesc(a.updatedAt, b.updatedAt);
        if (d !== 0) return d;
        return orderOf(a) - orderOf(b);
      }
      if (sortMode === 'completed') {
        const d = cmpDateDesc(a.doneAt, b.doneAt);
        if (d !== 0) return d;
        return orderOf(a) - orderOf(b);
      }
      return orderOf(a) - orderOf(b);
    });
  }
  return m;
}

export function todoMatchesSearchQuery(item: TodoItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    legacyBodyPlainText(item).toLowerCase().includes(q)
  );
}
