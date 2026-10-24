import type { Note, NoteGroup } from '../../model';
import { isNoteEffectivelyArchived } from '../../model';

export const PLACEHOLDER_TITLE = 'New note';

/** Consistent note title for sidebar, headers, and version history. */
export function displayNoteTitle(title?: string | null): string {
  const trimmed = (title ?? '').trim();
  return trimmed || PLACEHOLDER_TITLE;
}

export type NoteViewMode = 'active' | 'archived';

export const NOTE_VIEW_OPTIONS: { value: NoteViewMode; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const LS_NOTE_VIEW = 'cadence.notes.viewMode.v1';

export function noteViewModeKey(userId: string) {
  return `${LS_NOTE_VIEW}:${userId}`;
}

/**
 * Active / Archived lens. A note is archived by its own flag or because its
 * list (or an enclosing list) is archived; pass `groups` to honour the latter.
 */
export function filterNotesForView(notes: Note[], mode: NoteViewMode, groups: NoteGroup[] = []) {
  return notes.filter((n) => isNoteEffectivelyArchived(n, groups) === (mode === 'archived'));
}

/** Notes in the selected list, after the active/archived lens. */
export function filterNotesForGroup(notes: Note[], groupId: string | null) {
  if (!groupId) return notes;
  return notes.filter((n) => n.groupId === groupId);
}

/**
 * Sort modes available in the sidebar dropdown. `manual` is special — it's
 * the only mode that lets the user drag rows up/down to reorder them
 * (using each note's persisted `sortOrder`).
 *
 * Pinned notes always sort to the top, regardless of mode.
 */
export type NoteSortMode = 'updated' | 'opened' | 'created' | 'title' | 'manual';

export const SORT_OPTIONS: { value: NoteSortMode; label: string }[] = [
  { value: 'updated', label: 'Last updated' },
  { value: 'opened', label: 'Last opened' },
  { value: 'created', label: 'Created' },
  { value: 'title', label: 'Title (A→Z)' },
  { value: 'manual', label: 'Manual' },
];

/** Sidebar resize bounds. Kept liberal — the goal is to prevent the
 *  sidebar from collapsing to a useless slit or hogging the editor pane,
 *  not to police taste. */
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 560;
export const SIDEBAR_DEFAULT_WIDTH = 320;

const LS_NOTE_SORT = 'cadence.notes.sortMode.v1';
const LS_SIDEBAR_COLLAPSED = 'cadence.notes.sidebarCollapsed.v1';

export function noteSortModeKey(userId: string) {
  return `${LS_NOTE_SORT}:${userId}`;
}

const LS_NOTE_EXPORT_FORMAT = 'cadence.notes.exportFormat.v1';

export function noteExportFormatKey(userId: string) {
  return `${LS_NOTE_EXPORT_FORMAT}:${userId}`;
}

export function noteSidebarCollapsedKey(userId: string) {
  return `${LS_SIDEBAR_COLLAPSED}:${userId}`;
}
