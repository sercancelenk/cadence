import type { Note } from '../../model';
import { noteDisplayTitle } from './noteDisplay';
import { type NoteSortMode } from './notePreferences';

/**
 * Sort modes whose ordering key changes as the user types, and are therefore
 * the only ones `heldNote` applies to.
 *
 * 'manual' orders by `sortOrder` and 'created' by `createdAt`; neither moves on
 * a keystroke, so holding buys nothing — and for 'manual' it actively breaks
 * dragging, because a reorder writes a new `sortOrder` that a frozen snapshot
 * would never see and the row would snap back to where it was.
 */
const HOLD_SENSITIVE_SORT_MODES = new Set<NoteSortMode>(['updated', 'opened', 'title']);

/**
 * Sorted list driving the sidebar. Pinned notes always float to the top
 * regardless of `sortMode` — within each pinned tier the active mode
 * decides the order.
 *
 * `heldNote` freezes one note's place in the list: the ordering fields are
 * read from that snapshot instead of from the live note. The sidebar uses it
 * for the note being edited, so a note does not crawl up the list on every
 * keystroke under 'updated' (or re-alphabetise itself under 'title'). Pinning
 * is deliberately read live — that is an explicit user action and should move
 * the note immediately, and so is the whole of 'manual' order.
 */
export function sortNotes(notes: Note[], sortMode: NoteSortMode, heldNote?: Note | null): Note[] {
  const holdNote = HOLD_SENSITIVE_SORT_MODES.has(sortMode) ? heldNote : null;
  const held = (note: Note) => (holdNote && note.id === holdNote.id ? holdNote : note);
  const cmpUpdated = (a: Note, b: Note) => (b.updatedAt || '').localeCompare(a.updatedAt || '');
  const cmpCreated = (a: Note, b: Note) => (b.createdAt || '').localeCompare(a.createdAt || '');
  const cmpOpened = (a: Note, b: Note) =>
    (b.lastOpenedAt || b.updatedAt || '').localeCompare(a.lastOpenedAt || a.updatedAt || '');
  const cmpTitle = (a: Note, b: Note) =>
    noteDisplayTitle(a).localeCompare(noteDisplayTitle(b), undefined, {
      sensitivity: 'base',
    });
  // Stable, edit-invariant tie-break for manual order. Using `updatedAt` here
  // made notes jump position whenever they were edited; `createdAt` + `id`
  // never change, so equal/absent sortOrder values resolve deterministically.
  const cmpStable = (a: Note, b: Note) =>
    (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id);
  const cmpManual = (a: Note, b: Note) => {
    const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.POSITIVE_INFINITY;
    const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    return cmpStable(a, b);
  };
  const cmp =
    sortMode === 'created'
      ? cmpCreated
      : sortMode === 'opened'
        ? cmpOpened
        : sortMode === 'title'
          ? cmpTitle
          : sortMode === 'manual'
            ? cmpManual
            : cmpUpdated;
  return [...notes].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return cmp(held(a), held(b));
  });
}
