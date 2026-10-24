/**
 * Typing → disk cadence. Two stages debounce in series, so the worst-case
 * window of unsaved keystrokes is their sum. Blur, note switch, lock, pagehide
 * and quit all drain both stages immediately (see `pendingSaveFlush`).
 */

/** Editor buffer → `onChange` (one full-document read per flush). */
export const EDITOR_CHANGE_DEBOUNCE_MS = 600;

/** `onChange` → encrypted AppData write. */
export const APP_SAVE_DEBOUNCE_MS = 1800;

export const MAX_UNSAVED_WINDOW_MS = EDITOR_CHANGE_DEBOUNCE_MS + APP_SAVE_DEBOUNCE_MS;
