import { useEffect, useMemo, useState } from 'react';
import type { Note } from '../../model';
import { type NoteSortMode, noteSortModeKey, SORT_OPTIONS } from './notePreferences';
import { sortNotes } from './sortNotes';

const ALLOWED_SORT_MODES = SORT_OPTIONS.map((o) => o.value);

function readSortMode(userId: string | undefined): NoteSortMode {
  if (!userId || typeof window === 'undefined') return 'updated';
  try {
    const raw = localStorage.getItem(noteSortModeKey(userId));
    if (raw && ALLOWED_SORT_MODES.includes(raw as NoteSortMode)) {
      return raw as NoteSortMode;
    }
  } catch {
    /* ignore */
  }
  return 'updated';
}

export function useNotesSort(allNotes: Note[], userId: string | undefined) {
  const [sortMode, setSortMode] = useState<NoteSortMode>(() => readSortMode(userId));

  useEffect(() => {
    setSortMode(readSortMode(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.setItem(noteSortModeKey(userId), sortMode);
    } catch {
      /* ignore */
    }
  }, [sortMode, userId]);

  const notes = useMemo(() => sortNotes(allNotes, sortMode), [allNotes, sortMode]);

  return { sortMode, setSortMode, notes };
}
