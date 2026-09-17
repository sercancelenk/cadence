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

/**
 * @param heldNoteId Note whose place in the list should not move while it is
 *   the one being worked on — see `sortNotes`. The snapshot is taken when the
 *   id changes and released when the user moves to another note.
 */
export function useNotesSort(
  allNotes: Note[],
  userId: string | undefined,
  heldNoteId?: string | null,
) {
  const [sortMode, setSortMode] = useState<NoteSortMode>(() => readSortMode(userId));
  const [held, setHeld] = useState<{ id: string | null; note: Note | null }>({
    id: null,
    note: null,
  });

  // Derived during render (not in an effect) so the list never paints one frame
  // in the un-held order. Compared by id only, so a note that is missing from
  // `allNotes` settles on `note: null` instead of looping.
  if (held.id !== (heldNoteId ?? null)) {
    const note = heldNoteId ? allNotes.find((n) => n.id === heldNoteId) : undefined;
    setHeld({ id: heldNoteId ?? null, note: note ?? null });
  }

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

  const notes = useMemo(
    () => sortNotes(allNotes, sortMode, held.note),
    [allNotes, sortMode, held.note],
  );

  return { sortMode, setSortMode, notes };
}
