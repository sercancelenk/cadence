// @ts-nocheck
import { useMemo, useState } from 'react';
import type { Note } from '../../model';
import { type NoteSortMode } from './notePreferences';
import { sortNotes } from './sortNotes';

export function useNotesSort(allNotes: Note[]) {
  const [sortMode, setSortMode] = useState<NoteSortMode>('updated');

  const notes = useMemo(() => sortNotes(allNotes, sortMode), [allNotes, sortMode]);

  return { sortMode, setSortMode, notes };
}
