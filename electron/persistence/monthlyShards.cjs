/**
 * Monthly workspace shards — like log rotation, but for mutable CRUD data.
 *
 * Live layout (per user):
 *   cadence-data-<userId>.json           — full workspace (backward compat for older app versions)
 *   cadence-data-<userId>-YYYY-MM.json   — notes, todoItems, items created that month
 *
 * New app versions merge shards + core on read (ignoring duplicate bulk in base when
 * shards exist). The base file always keeps the full monolithic workspace so an older
 * Cadence build that only reads the base file still sees every note and task.
 *
 * Read path merges every shard into one AppData object for the renderer.
 * Write path splits bulk arrays by entity `createdAt` month (stable home).
 * Legacy single-file workspaces (no `-YYYY-MM` siblings) keep working unchanged.
 */

const SHARD_MAGIC = 'CDNC-SHARD1';

const SHARDABLE_KEYS = ['notes', 'todoItems', 'items'];

/** @param {string} prefix e.g. cadence */
/** @param {string} userId */
function monthlyShardFilename(prefix, userId, monthKey) {
  return `${prefix}-data-${userId}-${monthKey}.json`;
}

/**
 * @param {string} prefix
 * @param {string} userId
 * @param {string} filename basename only
 * @returns {string | null} month key or null
 */
function parseMonthlyShardFilename(prefix, userId, filename) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedUser = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `^${escapedPrefix}-data-${escapedUser}-(\\d{4}-\\d{2}|unknown)\\.json$`,
  );
  const m = filename.match(re);
  return m ? m[1] : null;
}

/**
 * @param {string} userDataDir
 * @param {string} prefix
 * @param {string} userId
 * @returns {string[]} sorted month keys
 */
function listMonthlyShardMonths(userDataDir, prefix, userId) {
  /** @type {string[]} */
  const months = [];
  let entries;
  try {
    entries = require('node:fs').readdirSync(userDataDir);
  } catch {
    return months;
  }
  for (const name of entries) {
    const mk = parseMonthlyShardFilename(prefix, userId, name);
    if (mk) months.push(mk);
  }
  return months.sort();
}

/**
 * Derive YYYY-MM from an ISO timestamp. Falls back to `unknown` so nothing is dropped.
 * @param {unknown} iso
 */
function monthKeyFromIso(iso) {
  if (typeof iso === 'string' && iso.length >= 7) {
    const key = iso.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(key)) return key;
  }
  return 'unknown';
}

/**
 * @param {unknown} workspace
 */
function countShardableEntities(workspace) {
  if (!workspace || typeof workspace !== 'object') {
    return { notes: 0, todoItems: 0, items: 0, total: 0 };
  }
  const o = /** @type {Record<string, unknown>} */ (workspace);
  const notes = Array.isArray(o.notes) ? o.notes.length : 0;
  const todoItems = Array.isArray(o.todoItems) ? o.todoItems.length : 0;
  const items = Array.isArray(o.items) ? o.items.length : 0;
  return { notes, todoItems, items, total: notes + todoItems + items };
}

/**
 * Collect string ids from shardable arrays (entities without id are counted separately).
 * @param {unknown} workspace
 */
function shardableEntityIdSet(workspace) {
  /** @type {Set<string>} */
  const ids = new Set();
  let withoutId = 0;
  if (!workspace || typeof workspace !== 'object') return { ids, withoutId };
  const o = /** @type {Record<string, unknown>} */ (workspace);
  for (const key of SHARDABLE_KEYS) {
    const arr = Array.isArray(o[key]) ? o[key] : [];
    for (const entity of arr) {
      if (entity && typeof entity === 'object' && typeof /** @type {{ id?: unknown }} */ (entity).id === 'string') {
        ids.add(/** @type {{ id: string }} */ (entity).id);
      } else if (entity != null) {
        withoutId += 1;
      }
    }
  }
  return { ids, withoutId };
}

/**
 * @param {unknown} source
 * @param {unknown} merged
 */
function shardRoundTripMatches(source, merged) {
  const a = shardableEntityIdSet(source);
  const b = shardableEntityIdSet(merged);
  if (a.withoutId !== b.withoutId) return false;
  if (a.ids.size !== b.ids.size) return false;
  for (const id of a.ids) {
    if (!b.ids.has(id)) return false;
  }
  return true;
}

/**
 * Strip shardable bulk from a workspace copy — used when shards are the canonical bulk source.
 * @param {Record<string, unknown>} workspace
 */
function baseCoreForShardMerge(workspace) {
  return {
    ...workspace,
    notes: [],
    todoItems: [],
    items: [],
  };
}

/**
 * @param {Record<string, unknown>} workspace
 * @param {{ retainBaseBulk?: boolean }} [options]
 */
function splitWorkspaceForMonthlyShards(workspace, { retainBaseBulk = true } = {}) {
  /** @type {Record<string, unknown>} */
  const baseWorkspace = { ...workspace };
  /** @type {Record<string, { notes: unknown[]; todoItems: unknown[]; items: unknown[] }>} */
  const shards = {};

  if (!retainBaseBulk) {
    for (const key of SHARDABLE_KEYS) {
      baseWorkspace[key] = [];
    }
  }

  for (const key of SHARDABLE_KEYS) {
    const arr = Array.isArray(workspace[key]) ? workspace[key] : [];
    for (const entity of arr) {
      const created =
        entity && typeof entity === 'object' && 'createdAt' in entity
          ? /** @type {{ createdAt?: unknown; updatedAt?: unknown }} */ (entity).createdAt
          : undefined;
      const updated =
        entity && typeof entity === 'object' && 'updatedAt' in entity
          ? /** @type {{ updatedAt?: unknown }} */ (entity).updatedAt
          : undefined;
      const monthKey = monthKeyFromIso(created ?? updated);
      if (!shards[monthKey]) {
        shards[monthKey] = { notes: [], todoItems: [], items: [] };
      }
      shards[monthKey][key].push(entity);
    }
  }

  return { baseWorkspace, shards };
}

/**
 * @param {unknown} parsed
 */
function unwrapShardPayload(parsed) {
  if (
    parsed &&
    typeof parsed === 'object' &&
    /** @type {{ magic?: unknown }} */ (parsed).magic === SHARD_MAGIC
  ) {
    const o = /** @type {{ month?: unknown; notes?: unknown; todoItems?: unknown; items?: unknown }} */ (
      parsed
    );
    return {
      month: typeof o.month === 'string' ? o.month : 'unknown',
      notes: Array.isArray(o.notes) ? o.notes : [],
      todoItems: Array.isArray(o.todoItems) ? o.todoItems : [],
      items: Array.isArray(o.items) ? o.items : [],
    };
  }
  const o = parsed && typeof parsed === 'object' ? /** @type {Record<string, unknown>} */ (parsed) : {};
  return {
    month: 'unknown',
    notes: Array.isArray(o.notes) ? o.notes : [],
    todoItems: Array.isArray(o.todoItems) ? o.todoItems : [],
    items: Array.isArray(o.items) ? o.items : [],
  };
}

/**
 * @param {string} monthKey
 * @param {{ notes: unknown[]; todoItems: unknown[]; items: unknown[] }} partial
 */
function wrapShardPayload(monthKey, partial) {
  return {
    magic: SHARD_MAGIC,
    month: monthKey,
    notes: partial.notes ?? [],
    todoItems: partial.todoItems ?? [],
    items: partial.items ?? [],
  };
}

/**
 * @param {unknown[]} items
 */
function dedupeById(items) {
  /** @type {Map<string, unknown>} */
  const map = new Map();
  /** @type {unknown[]} */
  const withoutId = [];
  for (const item of items) {
    if (item && typeof item === 'object' && typeof /** @type {{ id?: unknown }} */ (item).id === 'string') {
      const id = /** @type {{ id: string }} */ (item).id;
      const existing = map.get(id);
      // Later entries win, unless the earlier one is provably newer.
      map.set(id, existing !== undefined && isStrictlyNewer(existing, item) ? existing : item);
    } else if (item != null) {
      withoutId.push(item);
    }
  }
  return [...map.values(), ...withoutId];
}

/**
 * True only when both carry a parsable `updatedAt` and `a` is later than `b`.
 * Anything undated or unparsable never wins on its own.
 * @param {unknown} a
 * @param {unknown} b
 */
function isStrictlyNewer(a, b) {
  const ta = Date.parse(/** @type {{ updatedAt?: string }} */ (a).updatedAt ?? '');
  const tb = Date.parse(/** @type {{ updatedAt?: string }} */ (b).updatedAt ?? '');
  return Number.isFinite(ta) && Number.isFinite(tb) && ta > tb;
}

/**
 * Merge base workspace (may still hold legacy bulk) with shard partials.
 * Later entries win on id collision — shard copies override stale base bulk —
 * unless the base copy has a strictly newer `updatedAt`: an older app version
 * that only knows the base file keeps editing it after shards exist, and those
 * edits must not be replaced by the stale shard copy.
 * @param {Record<string, unknown>} baseWorkspace
 * @param {Array<{ notes: unknown[]; todoItems: unknown[]; items: unknown[] }>} shardPartials
 */
function mergeMonthlyShardPartials(baseWorkspace, shardPartials) {
  /** @type {Record<string, unknown>} */
  const merged = { ...baseWorkspace };

  for (const key of SHARDABLE_KEYS) {
    const fromBase = Array.isArray(baseWorkspace[key]) ? baseWorkspace[key] : [];
    /** @type {unknown[]} */
    const fromShards = [];
    for (const partial of shardPartials) {
      if (Array.isArray(partial[key])) fromShards.push(...partial[key]);
    }
    merged[key] = dedupeById([...fromBase, ...fromShards]);
  }

  return merged;
}

/**
 * Live read path: the base file's own notes/tasks/items are part of the result,
 * not discarded. Every save of this version writes the full workspace to the
 * base file and the shards together, so they agree; they only differ when an
 * older app version wrote the base file alone, and then nothing it wrote may be
 * lost. A removal made there is not honoured (the shard still has the entity):
 * resurfacing a deleted note is recoverable, losing one is not.
 * @param {Record<string, unknown>} baseWorkspace
 * @param {Array<{ notes: unknown[]; todoItems: unknown[]; items: unknown[] }>} shardPartials
 */
function mergeBaseWithShards(baseWorkspace, shardPartials) {
  return mergeMonthlyShardPartials(baseWorkspace, shardPartials);
}

/**
 * Guard for a merge that is meant to be a superset of the base file: every
 * entity the base holds, by id, plus every one without an id, must be in the
 * result. Counts cannot say this — repeated ids in the base make its count
 * larger than any id-deduplicated merge without anything having been lost.
 * @param {Record<string, unknown>} baseWorkspace
 * @param {Record<string, unknown>} merged
 */
function mergeKeepsEveryBaseEntity(baseWorkspace, merged) {
  const base = shardableEntityIdSet(baseWorkspace);
  const result = shardableEntityIdSet(merged);
  if (result.withoutId < base.withoutId) return false;
  for (const id of base.ids) {
    if (!result.ids.has(id)) return false;
  }
  return true;
}

/**
 * Flatten a split's shard buckets back into one set of bulk arrays.
 *
 * Lets the save path prove the split dropped nothing — `shardRoundTripMatches`
 * against this is the same guarantee as re-reading every file from disk and
 * merging it, without any I/O.
 *
 * @param {Record<string, { notes: unknown[]; todoItems: unknown[]; items: unknown[] }>} shards
 */
function unionShardEntities(shards) {
  /** @type {Record<string, unknown[]>} */
  const union = { notes: [], todoItems: [], items: [] };
  for (const partial of Object.values(shards)) {
    for (const key of SHARDABLE_KEYS) {
      if (Array.isArray(partial[key]) && partial[key].length) {
        union[key] = union[key].concat(partial[key]);
      }
    }
  }
  return union;
}

/**
 * Group rolling backup filenames that belong to the same snapshot set.
 * @param {string} filename
 */
function backupSnapshotKey(filename) {
  if (!filename.endsWith('.json')) return filename;
  const withoutExt = filename.slice(0, -5);
  const shardIdx = withoutExt.lastIndexOf('-shard-');
  if (shardIdx !== -1) return withoutExt.slice(0, shardIdx);
  return withoutExt;
}

/**
 * @param {string} backupBaseFilename e.g. data-pre-save-2026-04-05T12-00-00-000Z.json
 * @param {string} monthKey
 */
function backupShardFilename(backupBaseFilename, monthKey) {
  return backupBaseFilename.replace(/\.json$/, `-shard-${monthKey}.json`);
}

/**
 * @param {string} backupFilename basename
 * @returns {boolean}
 */
function isMonthlyShardBackupFilename(backupFilename) {
  return backupFilename.includes('-shard-') && backupFilename.endsWith('.json');
}

/**
 * When the user picks a shard sibling in a rolling backup set, resolve the base file.
 * @param {string} backupPath absolute path to base or shard backup
 * @param {(dir: string) => string[]} readDir
 * @returns {{ ok: true; basePath: string } | { ok: false; error: string }}
 */
function resolveBackupSetBasePath(backupPath, readDir) {
  const dir = require('node:path').dirname(backupPath);
  const baseName = require('node:path').basename(backupPath);
  if (!isMonthlyShardBackupFilename(baseName)) {
    return { ok: true, basePath: backupPath };
  }
  const setKey = backupSnapshotKey(baseName);
  const candidateName = `${setKey}.json`;
  let names;
  try {
    names = readDir(dir);
  } catch (err) {
    return { ok: false, error: String(err) };
  }
  if (names.includes(candidateName)) {
    return { ok: true, basePath: require('node:path').join(dir, candidateName) };
  }
  return {
    ok: false,
    error:
      'This is a monthly shard backup file, not a full workspace snapshot. Restore the matching main backup file (same timestamp, without "-shard-") instead.',
  };
}

/**
 * Build a full workspace from a backup base file and sibling shard backups in the same folder.
 * @param {unknown} parsedBase parsed JSON from the base backup (envelope or legacy)
 * @param {Array<{ notes: unknown[]; todoItems: unknown[]; items: unknown[] }>} shardPartials
 * @param {(parsed: unknown) => { workspace: unknown }} unwrapWorkspace
 */
function mergeWorkspaceFromBackupParts(parsedBase, shardPartials, unwrapWorkspace) {
  const { workspace: baseWorkspace } = unwrapWorkspace(parsedBase);
  const baseWs =
    baseWorkspace && typeof baseWorkspace === 'object'
      ? /** @type {Record<string, unknown>} */ (baseWorkspace)
      : {};

  if (shardPartials.length === 0) {
    return { ok: true, workspace: baseWs };
  }

  // Same rule as the live read path: nothing the base file holds may be dropped.
  const merged = mergeBaseWithShards(baseWs, shardPartials);
  if (!mergeKeepsEveryBaseEntity(baseWs, merged)) {
    return { ok: true, workspace: baseWs };
  }
  return { ok: true, workspace: merged };
}

module.exports = {
  SHARD_MAGIC,
  SHARDABLE_KEYS,
  monthlyShardFilename,
  parseMonthlyShardFilename,
  listMonthlyShardMonths,
  monthKeyFromIso,
  countShardableEntities,
  shardableEntityIdSet,
  shardRoundTripMatches,
  unionShardEntities,
  baseCoreForShardMerge,
  splitWorkspaceForMonthlyShards,
  unwrapShardPayload,
  wrapShardPayload,
  mergeMonthlyShardPartials,
  mergeBaseWithShards,
  mergeKeepsEveryBaseEntity,
  backupSnapshotKey,
  backupShardFilename,
  isMonthlyShardBackupFilename,
  resolveBackupSetBasePath,
  mergeWorkspaceFromBackupParts,
};
