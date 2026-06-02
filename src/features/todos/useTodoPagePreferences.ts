import { useEffect, useState } from 'react';
import {
  ALLOWED_SORT_MODES,
  parseStatusFilter,
  todoHideDoneKey,
  todoSectionsStorageKey,
  todoShowArchivedKey,
  todoSortModeKey,
  todoStatusFilterKey,
  type SortMode,
  type StatusFilter,
} from './todoPreferences';

/** Persisted todos page filter + section-collapse preferences (per user). */
export function useTodoPagePreferences(userId: string) {
  const [sectionOpenMap, setSectionOpenMap] = useState<Record<string, boolean>>({});
  const [sectionsHydrated, setSectionsHydrated] = useState(false);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('manual');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (!userId) {
      setSectionOpenMap({});
      setSectionsHydrated(true);
      return;
    }
    setSectionsHydrated(false);
    try {
      const raw = localStorage.getItem(todoSectionsStorageKey(userId));
      let fromStorage: Record<string, boolean> = {};
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          fromStorage = parsed as Record<string, boolean>;
        }
      }
      setSectionOpenMap((prev) => ({ ...fromStorage, ...prev }));
      setShowArchived(localStorage.getItem(todoShowArchivedKey(userId)) === '1');
      setHideDone(localStorage.getItem(todoHideDoneKey(userId)) === '1');
      const sortRaw = localStorage.getItem(todoSortModeKey(userId));
      setSortMode(
        ALLOWED_SORT_MODES.includes(sortRaw as SortMode) ? (sortRaw as SortMode) : 'manual',
      );
      setStatusFilter(parseStatusFilter(localStorage.getItem(todoStatusFilterKey(userId))));
    } catch {
      setSectionOpenMap({});
    }
    setSectionsHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (!sectionsHydrated || !userId) return;
    try {
      localStorage.setItem(todoSectionsStorageKey(userId), JSON.stringify(sectionOpenMap));
    } catch {
      /* ignore */
    }
  }, [sectionOpenMap, sectionsHydrated, userId]);

  useEffect(() => {
    if (!sectionsHydrated || !userId) return;
    try {
      localStorage.setItem(todoShowArchivedKey(userId), showArchived ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [showArchived, sectionsHydrated, userId]);

  useEffect(() => {
    if (!sectionsHydrated || !userId) return;
    try {
      localStorage.setItem(todoHideDoneKey(userId), hideDone ? '1' : '0');
      localStorage.setItem(todoSortModeKey(userId), sortMode);
      localStorage.setItem(todoStatusFilterKey(userId), statusFilter);
    } catch {
      /* ignore */
    }
  }, [hideDone, sortMode, statusFilter, sectionsHydrated, userId]);

  return {
    sectionOpenMap,
    setSectionOpenMap,
    search,
    setSearch,
    showArchived,
    setShowArchived,
    hideDone,
    setHideDone,
    sortMode,
    setSortMode,
    statusFilter,
    setStatusFilter,
    filtersOpen,
    setFiltersOpen,
  };
}
