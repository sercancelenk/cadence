import type { Note } from '../../model';

/** Keep selection when the id exists in workspace data even if the sorted sidebar list lags. */
export function isSelectedNotePresent(
  selectedId: string | null,
  visibleNotes: Note[],
  allNotes: Note[],
): boolean {
  if (!selectedId) return false;
  if (visibleNotes.some((n) => n.id === selectedId)) return true;
  return allNotes.some((n) => n.id === selectedId);
}

export type NotesSelectionCorrection =
  | { action: 'keep' }
  | { action: 'select'; id: string }
  | { action: 'select-first' }
  | { action: 'clear' };

/**
 * Decide how to repair sidebar selection. While a create-note flow is pending,
 * never fall back to notes[0] — workspace data may lag behind setSelectedId.
 */
export function resolveNotesSelectionCorrection(
  selectedId: string | null,
  pendingSelectId: string | null,
  visibleNotes: Note[],
  allNotes: Note[],
  isNarrowViewport: boolean,
): NotesSelectionCorrection {
  if (pendingSelectId) {
    const pendingInWorkspace = allNotes.some((n) => n.id === pendingSelectId);
    if (!pendingInWorkspace) {
      return { action: 'keep' };
    }
    if (selectedId !== pendingSelectId) {
      return { action: 'select', id: pendingSelectId };
    }
    if (isSelectedNotePresent(pendingSelectId, visibleNotes, allNotes)) {
      return { action: 'keep' };
    }
    return { action: 'keep' };
  }

  if (isSelectedNotePresent(selectedId, visibleNotes, allNotes)) {
    return { action: 'keep' };
  }

  if (isNarrowViewport) {
    return selectedId ? { action: 'clear' } : { action: 'keep' };
  }

  return { action: 'select-first' };
}

export function isPendingSelectionComplete(
  pendingSelectId: string | null,
  selectedId: string | null,
  visibleNotes: Note[],
  allNotes: Note[],
): boolean {
  if (!pendingSelectId) return false;
  if (selectedId !== pendingSelectId) return false;
  return isSelectedNotePresent(pendingSelectId, visibleNotes, allNotes);
}
