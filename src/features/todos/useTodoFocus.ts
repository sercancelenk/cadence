import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { isTodoOpen } from '../../model';
import type { TodoGroup, TodoItem } from '../../model';
import { matchesStatusFilter, type StatusFilter } from './todoPreferences';

type FocusSetters = {
  setSearch: (q: string) => void;
  setStatusFilter: (f: StatusFilter) => void;
  setHideDone: (v: boolean) => void;
  setShowArchived: (v: boolean) => void;
  setSectionOpenMap: Dispatch<SetStateAction<Record<string, boolean>>>;
};

/**
 * Deep-link handler for `/todos?focus=<id>` — reveals filtered rows,
 * scrolls into view, and flashes the matching task briefly.
 */
export function useTodoFocus(
  locationSearch: string,
  locationPathname: string,
  navigate: NavigateFunction,
  todoItems: TodoItem[],
  todoGroups: TodoGroup[],
  statusFilter: StatusFilter,
  hideDone: boolean,
  showArchived: boolean,
  setters: FocusSetters,
) {
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(locationSearch);
    const focusId = params.get('focus');
    if (!focusId) return;

    const target = todoItems.find((t) => t.id === focusId);
    if (target) {
      setters.setSearch('');
      if (!matchesStatusFilter(target.status, statusFilter)) {
        setters.setStatusFilter('all');
      }
      if (!isTodoOpen(target.status) && hideDone) {
        setters.setHideDone(false);
      }
      const group = todoGroups.find((g) => g.id === target.groupId);
      if (group?.archived && !showArchived) {
        setters.setShowArchived(true);
      }
      setters.setSectionOpenMap((prev) =>
        prev[target.groupId] === false ? { ...prev, [target.groupId]: true } : prev,
      );
    }

    setFocusedTaskId(focusId);
    params.delete('focus');
    const next = params.toString();
    navigate({ pathname: locationPathname, search: next ? `?${next}` : '' }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSearch, locationPathname, navigate]);

  useEffect(() => {
    if (!focusedTaskId) return;
    let cancelled = false;
    const tryScroll = (attempt = 0) => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-todo-id="${focusedTaskId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (attempt < 6) {
        window.setTimeout(() => tryScroll(attempt + 1), 50 * (attempt + 1));
      }
    };
    const frame = window.requestAnimationFrame(() => tryScroll());
    const clear = window.setTimeout(() => setFocusedTaskId(null), 1800);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(clear);
    };
  }, [focusedTaskId]);

  return focusedTaskId;
}
