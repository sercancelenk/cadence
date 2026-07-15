/**
 * Content-count helpers for refusing catastrophic empty overwrites.
 * Kept in CJS so Electron main can use the same rules as the renderer.
 */

function materialContentCount(d) {
  if (!d || typeof d !== 'object') return 0;
  const notes = Array.isArray(d.notes) ? d.notes.length : 0;
  const todos = Array.isArray(d.todoItems) ? d.todoItems.length : 0;
  const items = Array.isArray(d.items) ? d.items.length : 0;
  return notes + todos + items;
}

/**
 * Refuse silently replacing a populated workspace with an empty scaffold.
 * Restore / import / password-change paths bypass this by calling
 * commitUserData directly (or with allowOverwriteUnreadable).
 * Threshold is prev >= 1 so small workspaces are protected too.
 */
function isCatastrophicEmptyOverwrite(previous, next) {
  return materialContentCount(previous) >= 1 && materialContentCount(next) === 0;
}

module.exports = {
  materialContentCount,
  isCatastrophicEmptyOverwrite,
};
