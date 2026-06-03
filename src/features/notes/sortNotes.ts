import type { Note } from '../../model';
import { PLACEHOLDER_TITLE, type NoteSortMode } from './notePreferences';

/**
 * Sorted list driving the sidebar. Pinned notes always float to the top
 * regardless of `sortMode` — within each pinned tier the active mode
 * decides the order.
 */
export function sortNotes(notes: Note[], sortMode: NoteSortMode): Note[] {
  const cmpUpdated = (a: Note, b: Note) => (b.updatedAt || '').localeCompare(a.updatedAt || '');
  const cmpCreated = (a: Note, b: Note) => (b.createdAt || '').localeCompare(a.createdAt || '');
  const cmpOpened = (a: Note, b: Note) =>
    (b.lastOpenedAt || b.updatedAt || '').localeCompare(a.lastOpenedAt || a.updatedAt || '');
  const cmpTitle = (a: Note, b: Note) =>
    (a.title || PLACEHOLDER_TITLE).localeCompare(b.title || PLACEHOLDER_TITLE, undefined, {
      sensitivity: 'base',
    });
  const cmpManual = (a: Note, b: Note) => {
    const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.POSITIVE_INFINITY;
    const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    return cmpUpdated(a, b);
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
    return cmp(a, b);
  });
}
