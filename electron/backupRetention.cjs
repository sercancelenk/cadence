/**
 * Settings → Backups: how many daily folders and in-app snapshots to keep.
 *
 * Changing a value is one operation: validate, work out what the new value
 * would delete, ask for confirmation when that is anything, then save the
 * choice and trim. Nothing is deleted until the caller confirms the exact
 * numbers, and the choice is saved before any file is touched so a failed save
 * never leaves backups trimmed under a setting that was not stored.
 *
 * Raising a value, or choosing one that already fits, deletes nothing.
 *
 * `confirmed: true` only counts together with `expectedWillDelete`, the counts
 * the user was shown. If more would go now than they agreed to (a snapshot landed
 * in between), they are asked again instead.
 */

'use strict';

const {
  planDailyMirrorTrim,
  prefsPathForUser,
  pruneDailyMirrorFolders,
  readPrefs: readMirrorPrefs,
  writePrefs: writeMirrorPrefs,
} = require('./dailyBackupMirror.cjs');
const {
  DEFAULT_LIFECYCLE_KEEP,
  MIRROR_KEEP_CHOICES,
  ROUTINE_KEEP_CHOICES,
  normalizeMirrorKeep,
} = require('./persistence/retentionPolicy.cjs');
const {
  planSnapshotTrim,
  pruneSnapshotDir,
  readSnapshotPrefs,
  writeSnapshotPrefs,
} = require('./persistence/snapshotRetention.cjs');

/**
 * @typedef {{
 *   fs: typeof import('fs');
 *   path: typeof import('path');
 *   userDataDir: string;
 *   filePrefix: string;
 *   userId: string;
 *   appSlug: string;
 *   backupsDir: string;
 *   writeJsonText: (filePath: string, text: string) => { ok: boolean; error?: string };
 * }} RetentionDeps
 */

/**
 * @param {RetentionDeps} deps
 */
function getRetentionState(deps) {
  const mirror = readMirrorPrefs(deps);
  const snapshots = readSnapshotPrefs(deps);
  return {
    mirrorKeep: normalizeMirrorKeep(mirror.keepFolders),
    mirrorKeepChoices: [...MIRROR_KEEP_CHOICES],
    snapshotRoutineKeep: snapshots.routineKeep,
    snapshotRoutineKeepChoices: [...ROUTINE_KEEP_CHOICES],
    snapshotLifecycleKeep: DEFAULT_LIFECYCLE_KEEP,
    mirrorDirConfigured: Boolean(mirror.mirrorDir),
    mirrorDirAvailable: Boolean(mirror.mirrorDir && deps.fs.existsSync(mirror.mirrorDir)),
  };
}

/** True when the mirror prefs file exists but cannot be parsed (reading it would mean "defaults"). */
function mirrorPrefsUnreadable(deps) {
  const file = prefsPathForUser(deps.userDataDir, deps.filePrefix, deps.userId);
  if (!deps.fs.existsSync(file)) return false;
  try {
    JSON.parse(deps.fs.readFileSync(file, 'utf8'));
    return false;
  } catch {
    return true;
  }
}

/** @param {unknown} n */
const isCount = (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/**
 * @param {RetentionDeps} deps
 * @param {{ mirrorKeep?: unknown; snapshotRoutineKeep?: unknown; confirmed?: unknown; expectedWillDelete?: unknown }} request
 * @returns {{ ok: true; state: ReturnType<typeof getRetentionState>; deleted: { mirrorFolders: number; snapshotSets: number }; mirrorDeferred: boolean }
 *   | { ok: false; needsConfirm: true; willDelete: { mirrorFolders: number; snapshotSets: number } }
 *   | { ok: false; error: string }}
 */
function changeRetention(deps, request) {
  const mirrorPrefs = readMirrorPrefs(deps);
  const snapshotPrefs = readSnapshotPrefs(deps);

  const mirrorKeep =
    request.mirrorKeep === undefined ? normalizeMirrorKeep(mirrorPrefs.keepFolders) : request.mirrorKeep;
  const routineKeep =
    request.snapshotRoutineKeep === undefined ? snapshotPrefs.routineKeep : request.snapshotRoutineKeep;

  if (typeof mirrorKeep !== 'number' || !MIRROR_KEEP_CHOICES.includes(mirrorKeep)) {
    return { ok: false, error: 'Unsupported daily backup retention.' };
  }
  if (typeof routineKeep !== 'number' || !ROUTINE_KEEP_CHOICES.includes(routineKeep)) {
    return { ok: false, error: 'Unsupported snapshot retention.' };
  }

  const mirrorDirAvailable = Boolean(mirrorPrefs.mirrorDir && deps.fs.existsSync(mirrorPrefs.mirrorDir));
  const mirrorDeferred = Boolean(mirrorPrefs.mirrorDir) && !mirrorDirAvailable;
  const mirrorOpts = {
    fs: deps.fs,
    path: deps.path,
    mirrorDir: mirrorPrefs.mirrorDir ?? '',
    appSlug: deps.appSlug,
    userId: deps.userId,
    keepFolders: mirrorKeep,
  };
  const snapshotOpts = {
    fs: deps.fs,
    path: deps.path,
    dir: deps.backupsDir,
    limits: { routineKeep },
  };

  const willDelete = {
    mirrorFolders: mirrorDirAvailable ? planDailyMirrorTrim(mirrorOpts).length : 0,
    snapshotSets: planSnapshotTrim(snapshotOpts).length,
  };
  const shown = /** @type {{ mirrorFolders?: unknown; snapshotSets?: unknown } | null} */ (
    request.expectedWillDelete && typeof request.expectedWillDelete === 'object' ? request.expectedWillDelete : null
  );
  const agreed =
    request.confirmed === true &&
    shown !== null &&
    isCount(shown.mirrorFolders) &&
    isCount(shown.snapshotSets) &&
    willDelete.mirrorFolders <= shown.mirrorFolders &&
    willDelete.snapshotSets <= shown.snapshotSets;
  if ((willDelete.mirrorFolders > 0 || willDelete.snapshotSets > 0) && !agreed) {
    return { ok: false, needsConfirm: true, willDelete };
  }

  const mirrorChanged = mirrorKeep !== normalizeMirrorKeep(mirrorPrefs.keepFolders);
  // Never rewrite a prefs file we could not read: it would replace the chosen
  // backup folder with "none".
  if (mirrorChanged && mirrorPrefsUnreadable(deps)) {
    return { ok: false, error: 'The daily backup settings file is unreadable. Choose the daily backup folder again first.' };
  }

  // Store the choice first: if that fails, nothing has been deleted.
  const savedMirror = mirrorChanged
    ? writeMirrorPrefs(deps, { ...mirrorPrefs, keepFolders: mirrorKeep })
    : { ok: true };
  if (!savedMirror.ok) return { ok: false, error: savedMirror.error || 'Could not save the retention setting.' };
  const savedSnapshots =
    routineKeep !== snapshotPrefs.routineKeep ? writeSnapshotPrefs(deps, { routineKeep }) : { ok: true };
  if (!savedSnapshots.ok) {
    return { ok: false, error: savedSnapshots.error || 'Could not save the retention setting.' };
  }

  const deleted = {
    // Strays belong to a write that may be running right now; the next daily write removes them.
    mirrorFolders: mirrorDirAvailable ? pruneDailyMirrorFolders({ ...mirrorOpts, removeStrays: false }) : 0,
    snapshotSets: pruneSnapshotDir(snapshotOpts),
  };
  return { ok: true, state: getRetentionState(deps), deleted, mirrorDeferred };
}

module.exports = { getRetentionState, changeRetention };
