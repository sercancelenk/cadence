/**
 * ⌘S / Ctrl+S: write whatever is open right now instead of waiting for the
 * autosave interval. Shift+⌘S is "save to a file on this computer".
 * `code` is checked too so layouts where `key` is not a Latin "s" still work.
 */
export function isSaveNowShortcut(e: KeyboardEvent): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return false;
  return e.key === 's' || e.key === 'S' || e.code === 'KeyS';
}
