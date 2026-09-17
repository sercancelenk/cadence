/**
 * When to copy the live workspace files into `backups/` before a write.
 *
 * The old rule was "every save". With `BACKUPS_KEEP_MAX = 50` snapshots and a
 * save landing every few seconds of typing, the ring buffer wrapped in about a
 * minute: the user paid a full file copy on every keystroke burst and still
 * could not recover a note deleted ten minutes earlier.
 *
 * Time-bucketing the routine case turns those 50 slots into hours of history
 * while removing almost all of the I/O. The cases that actually precede data
 * loss are exempt from the throttle:
 *
 *   - the first save of a session, when nothing has been snapshotted yet;
 *   - any save where a collection shrinks, which is the shape of a deletion;
 *   - any save where the serialized workspace loses a meaningful number of
 *     bytes, which is the shape of content destroyed *inside* entities —
 *     measured both against the previous save and, cumulatively, against the
 *     state the last snapshot captured;
 *   - explicit lifecycle events (launch, login, import, restore, password
 *     change), which never route through this policy at all.
 *
 * This module is pure: the caller supplies the clock and the shapes.
 */

const { contentShapeShrank } = require('./dataIntegrity.cjs');

/** Routine saves snapshot at most this often. 50 slots then cover ~4 hours. */
const PRE_SAVE_SNAPSHOT_MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * How much serialized workspace has to disappear before a routine save is
 * forced to snapshot.
 *
 * Counting entities is not enough. Wiping the body of a todo, an item or the
 * utility document leaves every collection exactly as long as it was, so
 * `contentShapeShrank` sees nothing — and unlike notes, those bodies have no
 * revision history to recover from. Losing them would be permanent.
 *
 * The threshold exists because ordinary editing shrinks the workspace too:
 * every backspace is a byte. 2 KB is far more than a keystroke burst and far
 * less than any paragraph, note body or task description worth recovering, so
 * routine typing stays throttled while destruction does not.
 */
const PRE_SAVE_SNAPSHOT_MIN_SHRINK_BYTES = 2048;

/**
 * @param {{
 *   nowMs: number;
 *   lastSnapshotAtMs?: number | null;
 *   previousWorkspace?: unknown;
 *   nextWorkspace?: unknown;
 *   previousContentBytes?: number | null;
 *   nextContentBytes?: number | null;
 *   snapshotContentBytes?: number | null;
 *   minIntervalMs?: number;
 *   minShrinkBytes?: number;
 * }} input
 * @returns {{ snapshot: boolean; reason: 'no-previous-snapshot' | 'content-shrink' | 'cumulative-shrink' | 'interval-elapsed' | 'throttled' }}
 */
function decidePreSaveSnapshot({
  nowMs,
  lastSnapshotAtMs = null,
  previousWorkspace = null,
  nextWorkspace = null,
  previousContentBytes = null,
  nextContentBytes = null,
  snapshotContentBytes = null,
  minIntervalMs = PRE_SAVE_SNAPSHOT_MIN_INTERVAL_MS,
  minShrinkBytes = PRE_SAVE_SNAPSHOT_MIN_SHRINK_BYTES,
}) {
  if (typeof lastSnapshotAtMs !== 'number' || !Number.isFinite(lastSnapshotAtMs)) {
    return { snapshot: true, reason: 'no-previous-snapshot' };
  }

  // Checked before the interval so a deletion is never throttled away.
  if (contentShapeShrank(previousWorkspace, nextWorkspace)) {
    return { snapshot: true, reason: 'content-shrink' };
  }

  if (contentBytesShrank(previousContentBytes, nextContentBytes, minShrinkBytes)) {
    return { snapshot: true, reason: 'content-shrink' };
  }

  // Erasing a body is not one save. Holding backspace, or deleting a paragraph
  // at a time, sheds a few hundred bytes per autosave — under the per-save
  // threshold every single time, so the check above never fires and the whole
  // body disappears inside one throttle window. Measuring against the state
  // the last snapshot actually captured is what makes the threshold mean
  // "this much content is gone" instead of "this much went in one keystroke
  // burst".
  if (contentBytesShrankSinceSnapshot(snapshotContentBytes, nextContentBytes, minShrinkBytes)) {
    return { snapshot: true, reason: 'cumulative-shrink' };
  }

  // A clock that jumped backwards (DST, NTP correction, manual change) would
  // otherwise suppress snapshots until it caught up. Treat it as elapsed.
  const elapsed = nowMs - lastSnapshotAtMs;
  if (elapsed < 0 || elapsed >= minIntervalMs) {
    return { snapshot: true, reason: 'interval-elapsed' };
  }

  return { snapshot: false, reason: 'throttled' };
}

/**
 * True when the workspace lost at least `minShrinkBytes` of serialized content.
 *
 * A size we cannot compare counts as a shrink. The previous size is only known
 * when this process wrote and verified the current files, and every other case
 * — the first save after launch, after a restore, after a failed write, after
 * a key change — is exactly when a backup is most worth having.
 *
 * @param {unknown} previousBytes
 * @param {unknown} nextBytes
 * @param {number} minShrinkBytes
 */
function contentBytesShrank(previousBytes, nextBytes, minShrinkBytes) {
  if (typeof previousBytes !== 'number' || !Number.isFinite(previousBytes)) return true;
  if (typeof nextBytes !== 'number' || !Number.isFinite(nextBytes)) return true;
  return previousBytes - nextBytes >= minShrinkBytes;
}

/**
 * True when the workspace has lost at least `minShrinkBytes` since the last
 * snapshot was taken.
 *
 * The unknown case is the mirror image of `contentBytesShrank`, and
 * deliberately so. There, an unknown size means "we cannot prove the workspace
 * on disk is intact" and a backup is taken. Here, an unknown baseline means
 * the last snapshot came from a lifecycle event (launch, login, import,
 * restore) that had no serialized size to record — a snapshot that was, by
 * definition, taken of the state we are still editing. Nothing can have been
 * lost since it, so forcing another one would only cost I/O.
 *
 * @param {unknown} snapshotBytes size of the workspace the last snapshot holds
 * @param {unknown} nextBytes size of the workspace about to be written
 * @param {number} minShrinkBytes
 */
function contentBytesShrankSinceSnapshot(snapshotBytes, nextBytes, minShrinkBytes) {
  if (typeof snapshotBytes !== 'number' || !Number.isFinite(snapshotBytes)) return false;
  if (typeof nextBytes !== 'number' || !Number.isFinite(nextBytes)) return false;
  return snapshotBytes - nextBytes >= minShrinkBytes;
}

module.exports = {
  PRE_SAVE_SNAPSHOT_MIN_INTERVAL_MS,
  PRE_SAVE_SNAPSHOT_MIN_SHRINK_BYTES,
  decidePreSaveSnapshot,
  contentBytesShrank,
  contentBytesShrankSinceSnapshot,
};
