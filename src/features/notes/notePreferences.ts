export const PLACEHOLDER_TITLE = 'New note';

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
