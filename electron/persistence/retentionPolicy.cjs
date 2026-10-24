/**
 * What to keep when trimming backups. Pure: callers supply the listing and
 * apply the result, so every rule here can be tested without touching disk.
 *
 * Two independent stores, two rules:
 *
 *  - In-app snapshots (`backups/<user>/data-<label>-<ts>.json`) are split in two
 *    tiers. Routine sets (`pre-save`, `launch`, ...) are written constantly and
 *    form a ring. Lifecycle sets (`pre-import`, `pre-restore`, `pre-pwchange`,
 *    `pre-recovery`, ...) are the restore points taken right before something
 *    that can go wrong. They have their own quota so a busy editing session can
 *    never push one out.
 *  - Daily mirror folders are ranked by date, newest first, and only folders
 *    that are provably complete count as backups.
 *
 * Nothing here ever selects the newest set / newest complete folder for removal.
 */

'use strict';

/** Labels written on every routine autosave / app start. */
const ROUTINE_SNAPSHOT_LABELS = new Set(['pre-save', 'launch', 'post-login', 'pre-write']);

/** Choices offered for routine in-app snapshots. 50 is the long-standing size. */
const ROUTINE_KEEP_CHOICES = Object.freeze([10, 20, 30, 50]);
const DEFAULT_ROUTINE_KEEP = 50;

/** Restore points taken before import / restore / password change / recovery. */
const DEFAULT_LIFECYCLE_KEEP = 50;

/** Choices offered for daily mirror folders. 30 is the long-standing size. */
const MIRROR_KEEP_CHOICES = Object.freeze([3, 7, 14, 30]);
const DEFAULT_MIRROR_KEEP = 30;

/** `data-<label>-<ISO timestamp with : and . replaced by ->` */
const SNAPSHOT_SET_RE = /^data-(.+?)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

/**
 * @param {unknown} value
 * @param {readonly number[]} choices
 * @param {number} fallback
 */
function pickChoice(value, choices, fallback) {
  return typeof value === 'number' && choices.includes(value) ? value : fallback;
}

/** @param {unknown} value */
function normalizeRoutineKeep(value) {
  return pickChoice(value, ROUTINE_KEEP_CHOICES, DEFAULT_ROUTINE_KEEP);
}

/** @param {unknown} value */
function normalizeMirrorKeep(value) {
  return pickChoice(value, MIRROR_KEEP_CHOICES, DEFAULT_MIRROR_KEEP);
}

/**
 * @param {string} setKey e.g. `data-pre-save-2026-04-05T12-00-00-000Z`
 * @returns {string | null} the label, or null when the name has no label (very old builds)
 */
function snapshotSetLabel(setKey) {
  const m = SNAPSHOT_SET_RE.exec(setKey);
  return m ? m[1] : null;
}

/**
 * Unlabelled (very old) sets and the four routine labels are routine. Any other
 * label — including ones a newer build invents — is treated as a restore point.
 *
 * @param {string} setKey
 * @returns {'routine' | 'lifecycle'}
 */
function snapshotTier(setKey) {
  const label = snapshotSetLabel(setKey);
  if (label === null || ROUTINE_SNAPSHOT_LABELS.has(label)) return 'routine';
  return 'lifecycle';
}

/**
 * @param {{ key: string; mtime: number }[]} sets one entry per snapshot set
 * @param {{ routineKeep?: number; lifecycleKeep?: number; protect?: readonly string[] }} [limits]
 *   `protect` lists set keys that must survive this prune (e.g. the set a restore is reading from)
 * @returns {{ remove: string[] }} keys of the sets to delete, oldest first
 */
function planSnapshotPrune(sets, limits = {}) {
  const routineKeep = normalizeRoutineKeep(limits.routineKeep);
  const lifecycleKeep = Math.max(1, limits.lifecycleKeep ?? DEFAULT_LIFECYCLE_KEEP);
  const protectedKeys = new Set(limits.protect ?? []);

  /** @type {{ routine: typeof sets; lifecycle: typeof sets }} */
  const tiers = { routine: [], lifecycle: [] };
  for (const set of sets) tiers[snapshotTier(set.key)].push(set);

  /** @type {{ key: string; mtime: number }[]} */
  const doomed = [];
  for (const [tier, keep] of /** @type {const} */ ([
    ['routine', routineKeep],
    ['lifecycle', lifecycleKeep],
  ])) {
    const newestFirst = [...tiers[tier]].sort(
      (a, b) => b.mtime - a.mtime || (a.key < b.key ? 1 : -1),
    );
    doomed.push(...newestFirst.slice(keep).filter((s) => !protectedKeys.has(s.key)));
  }
  return {
    remove: doomed.sort((a, b) => a.mtime - b.mtime || (a.key < b.key ? -1 : 1)).map((s) => s.key),
  };
}

/**
 * Only `complete` folders are backups: they are ranked newest-first by date and
 * everything past `keep` is removed. Incomplete folders are neither counted nor
 * removed, so a half-written or damaged folder can never cost a good one its
 * place, and is never deleted on a guess.
 *
 * @param {{ name: string; dateKey: string; complete: boolean }[]} folders
 * @param {number} keep
 * @returns {{ remove: string[] }} folder names, oldest first
 */
function planMirrorPrune(folders, keep) {
  const limit = normalizeMirrorKeep(keep);
  const newestFirst = folders
    .filter((f) => f.complete)
    .sort((a, b) => (a.dateKey === b.dateKey ? (a.name < b.name ? 1 : -1) : a.dateKey < b.dateKey ? 1 : -1));
  return { remove: newestFirst.slice(limit).reverse().map((f) => f.name) };
}

module.exports = {
  ROUTINE_SNAPSHOT_LABELS,
  ROUTINE_KEEP_CHOICES,
  DEFAULT_ROUTINE_KEEP,
  DEFAULT_LIFECYCLE_KEEP,
  MIRROR_KEEP_CHOICES,
  DEFAULT_MIRROR_KEEP,
  normalizeRoutineKeep,
  normalizeMirrorKeep,
  snapshotSetLabel,
  snapshotTier,
  planSnapshotPrune,
  planMirrorPrune,
};
