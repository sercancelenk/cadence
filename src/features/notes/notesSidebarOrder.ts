import type { Note, NoteGroup } from '../../model';
import { buildGroupForest, flattenForestNoteIds } from './noteGroupForest';
import type { NoteViewMode } from './notePreferences';

/**
 * Sidebar display order, used for shift-range selection: for each list its
 * sub-lists then its own notes, then ungrouped notes.
 */
export function flatSidebarNoteIds(
  groups: NoteGroup[],
  notes: Note[],
  viewMode: NoteViewMode = 'active',
): string[] {
  return flattenForestNoteIds(buildGroupForest({ groups, notes, viewMode }));
}
