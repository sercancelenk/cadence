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

/**
 * Length of every array-valued collection on the workspace, keyed by field.
 *
 * Enumerated from the object rather than from a hard-coded list on purpose:
 * `notes`, `todoItems` and `items` are only the sharded collections, while a
 * workspace also carries `teams`, `people`, `todoGroups`, `noteGroups`,
 * `utilityStructuredTabs` and whatever a later version adds. Losing all of a
 * user's teams is a loss whether or not this file was updated to know the word
 * "teams".
 */
function collectionCounts(d) {
  /** @type {Record<string, number>} */
  const counts = {};
  if (!d || typeof d !== 'object') return counts;
  for (const [key, value] of Object.entries(d)) {
    if (Array.isArray(value)) counts[key] = value.length;
  }
  return counts;
}

/**
 * True when any collection has fewer entities than before.
 *
 * Deliberately per-collection rather than on the total: losing 40 notes while
 * gaining 40 todos leaves the total unchanged but is still a loss worth
 * snapshotting. A collection that disappears entirely (present as an array
 * before, gone or no longer an array now) counts as shrinking to zero. An
 * unknown previous shape counts as a shrink, so a caller that cannot prove the
 * workspace grew always errs towards taking a backup.
 */
function contentShapeShrank(previous, next) {
  if (!previous) return true;
  const before = collectionCounts(previous);
  const after = collectionCounts(next);
  for (const [key, count] of Object.entries(before)) {
    if ((after[key] ?? 0) < count) return true;
  }
  return false;
}

module.exports = {
  materialContentCount,
  isCatastrophicEmptyOverwrite,
  collectionCounts,
  contentShapeShrank,
};
