/**
 * On-disk side of in-app snapshot retention: list the sets in `backups/<user>/`,
 * trim them according to `retentionPolicy.cjs`, and keep the user's choice in a
 * machine-local prefs file.
 *
 * A "set" is one snapshot: `data-<label>-<ts>.json` (+ `-shard-<month>.json`
 * siblings) and the `attachments-…` / `note-history-…` folders with the same
 * `<label>-<ts>` suffix.
 *
 * The prefs live next to the other machine-local prefs, never inside the
 * workspace JSON: older builds ignore the file, so there is no schema change.
 */

'use strict';

const { backupSnapshotKey } = require('./monthlyShards.cjs');
const {
  DEFAULT_LIFECYCLE_KEEP,
  normalizeRoutineKeep,
  planSnapshotPrune,
} = require('./retentionPolicy.cjs');

const SNAPSHOT_PREFS_VERSION = 1;

/** Folder names that carry a snapshot set's sidecars. */
const SIDECAR_PREFIXES = Object.freeze(['attachments-', 'note-history-']);

/** @param {string} setKey `data-<label>-<ts>` */
function sidecarNames(setKey) {
  const suffix = setKey.replace(/^data-/, '');
  return SIDECAR_PREFIXES.map((prefix) => `${prefix}${suffix}`);
}

/**
 * @param {{ fs: typeof import('fs'); path: typeof import('path'); dir: string }} opts
 * @returns {{ sets: { key: string; mtime: number; files: { name: string; full: string }[] }[]; skipped: number }}
 *   `skipped` counts snapshot files that could not be read; their sets are unknown, so callers must
 *   not treat anything that looks unowned as an orphan.
 */
function listSnapshotSets({ fs, path, dir }) {
  if (!fs.existsSync(dir)) return { sets: [], skipped: 0 };
  let skipped = 0;
  /** @type {Map<string, { key: string; mtime: number; files: { name: string; full: string }[] }>} */
  const sets = new Map();
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith('data-') || !name.endsWith('.json')) continue;
    const full = path.join(dir, name);
    let mtime;
    try {
      mtime = fs.statSync(full).mtimeMs;
    } catch {
      skipped += 1;
      continue;
    }
    const key = backupSnapshotKey(name);
    const set = sets.get(key) ?? { key, mtime, files: [] };
    set.mtime = Math.max(set.mtime, mtime);
    set.files.push({ name, full });
    sets.set(key, set);
  }
  return { sets: [...sets.values()], skipped };
}

/**
 * Snapshot sets that trimming to `limits` would delete, without deleting.
 *
 * @param {{ fs: typeof import('fs'); path: typeof import('path'); dir: string; limits?: { routineKeep?: number; lifecycleKeep?: number; protect?: readonly string[] } }} opts
 * @returns {string[]} set keys, oldest first
 */
function planSnapshotTrim({ fs, path, dir, limits }) {
  const { sets } = listSnapshotSets({ fs, path, dir });
  return planSnapshotPrune(sets, withDefaults(limits)).remove;
}

/**
 * Delete the sets beyond `limits`, then any sidecar folder that no kept set
 * owns (orphans left by older builds).
 *
 * @param {{ fs: typeof import('fs'); path: typeof import('path'); dir: string; limits?: { routineKeep?: number; lifecycleKeep?: number; protect?: readonly string[] } }} opts
 * @returns {number} sets removed
 */
function pruneSnapshotDir({ fs, path, dir, limits }) {
  if (!fs.existsSync(dir)) return 0;
  const { sets, skipped } = listSnapshotSets({ fs, path, dir });
  const { remove } = planSnapshotPrune(sets, withDefaults(limits));
  const doomed = new Set(remove);

  for (const set of sets) {
    if (!doomed.has(set.key)) continue;
    for (const file of set.files) rmQuiet(fs, file.full);
    for (const name of sidecarNames(set.key)) rmQuiet(fs, path.join(dir, name));
  }

  // A snapshot file we could not read may own sidecars we cannot attribute: leave them.
  if (skipped > 0) return remove.length;

  const kept = new Set(sets.filter((s) => !doomed.has(s.key)).flatMap((s) => sidecarNames(s.key)));
  for (const name of fs.readdirSync(dir)) {
    if (SIDECAR_PREFIXES.some((p) => name.startsWith(p)) && !kept.has(name)) {
      rmQuiet(fs, path.join(dir, name));
    }
  }
  return remove.length;
}

/** @param {{ routineKeep?: number; lifecycleKeep?: number; protect?: readonly string[] } | undefined} limits */
function withDefaults(limits) {
  return {
    protect: limits?.protect,
    routineKeep: normalizeRoutineKeep(limits?.routineKeep),
    lifecycleKeep: limits?.lifecycleKeep ?? DEFAULT_LIFECYCLE_KEEP,
  };
}

/** Best-effort delete of a file or folder; a failure leaves it for the next prune. */
function rmQuiet(fs, target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} userDataDir
 * @param {string} filePrefix
 * @param {string} userId
 */
function snapshotPrefsPath(path, userDataDir, filePrefix, userId) {
  const safe = typeof userId === 'string' ? userId.replace(/[^a-zA-Z0-9_-]/g, '') : 'unknown';
  return path.join(userDataDir, `${filePrefix}-snapshot-retention-${safe}.json`);
}

/**
 * @param {unknown} raw
 * @returns {{ version: number; routineKeep: number }}
 */
function normalizeSnapshotPrefs(raw) {
  const o = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  return { version: SNAPSHOT_PREFS_VERSION, routineKeep: normalizeRoutineKeep(o.routineKeep) };
}

/** @param {{ fs: typeof import('fs'); path: typeof import('path'); userDataDir: string; filePrefix: string; userId: string }} deps */
function readSnapshotPrefs(deps) {
  const file = snapshotPrefsPath(deps.path, deps.userDataDir, deps.filePrefix, deps.userId);
  try {
    if (!deps.fs.existsSync(file)) return normalizeSnapshotPrefs(null);
    return normalizeSnapshotPrefs(JSON.parse(deps.fs.readFileSync(file, 'utf8')));
  } catch {
    // Unreadable prefs mean "default", which is the most a snapshot is ever kept.
    return normalizeSnapshotPrefs(null);
  }
}

/**
 * @param {{ path: typeof import('path'); userDataDir: string; filePrefix: string; userId: string; writeJsonText: (filePath: string, text: string) => { ok: boolean; error?: string } }} deps
 * @param {{ routineKeep?: unknown }} prefs
 */
function writeSnapshotPrefs(deps, prefs) {
  const file = snapshotPrefsPath(deps.path, deps.userDataDir, deps.filePrefix, deps.userId);
  return deps.writeJsonText(file, JSON.stringify(normalizeSnapshotPrefs(prefs), null, 2));
}

module.exports = {
  SNAPSHOT_PREFS_VERSION,
  sidecarNames,
  listSnapshotSets,
  planSnapshotTrim,
  pruneSnapshotDir,
  normalizeSnapshotPrefs,
  readSnapshotPrefs,
  writeSnapshotPrefs,
};
