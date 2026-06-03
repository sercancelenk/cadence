/**
 * On-disk optimistic concurrency for per-user workspace writes.
 * Meta file is written with the same durability policy as user data (fsync).
 */

const MAX_DATA_VERSION = 3;

/**
 * @param {string} metaPath
 * @returns {{ generation: number; updatedAt: string }}
 */
function defaultWriteMeta() {
  return { generation: 0, updatedAt: '' };
}

/**
 * @param {string} metaPath
 * @param {typeof import('fs')} fs
 * @returns {{ generation: number; updatedAt: string }}
 */
function readWriteMeta(metaPath, fs) {
  try {
    if (!fs.existsSync(metaPath)) return defaultWriteMeta();
    const raw = fs.readFileSync(metaPath, 'utf8');
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return defaultWriteMeta();
    const generation = typeof j.generation === 'number' && j.generation >= 0 ? j.generation : 0;
    const updatedAt = typeof j.updatedAt === 'string' ? j.updatedAt : '';
    return { generation, updatedAt };
  } catch {
    return defaultWriteMeta();
  }
}

/**
 * @param {number | null | undefined} expected
 * @param {number} current
 * @returns {boolean} true when write may proceed
 */
function canCommitWriteGeneration(expected, current) {
  if (expected === null || expected === undefined) return true;
  if (typeof expected !== 'number' || !Number.isFinite(expected)) return true;
  return expected === current;
}

/**
 * @param {unknown} payload
 * @returns {boolean}
 */
function isFutureDataVersion(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const ver = /** @type {{ version?: unknown }} */ (payload).version;
  return typeof ver === 'number' && ver > MAX_DATA_VERSION;
}

/**
 * @param {unknown} obj
 * @returns {boolean}
 */
function isValidSnapshotPayload(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  if (typeof obj.version !== 'number') return false;
  if (obj.version > MAX_DATA_VERSION) return false;
  if (!Array.isArray(obj.teams)) return false;
  if (!Array.isArray(obj.people)) return false;
  if (!Array.isArray(obj.items)) return false;
  if (!Array.isArray(obj.todoGroups)) return false;
  if (!Array.isArray(obj.todoItems)) return false;
  return true;
}

module.exports = {
  MAX_DATA_VERSION,
  defaultWriteMeta,
  readWriteMeta,
  canCommitWriteGeneration,
  isFutureDataVersion,
  isValidSnapshotPayload,
};
