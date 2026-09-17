/**
 * Runs one workspace save cycle against a scratch directory so the cost of each
 * stage can be measured without booting Electron.
 *
 * Two modes are modelled:
 *   - `legacy`    — what `writeUserData` did before this work: stringify once
 *                   just to measure size, read + decrypt + parse everything for
 *                   the empty-overwrite guard, copy every file into `backups/`,
 *                   rewrite every shard, then read + decrypt + parse everything
 *                   again to verify.
 *   - `optimized` — the current path: serialize once, prove the files are
 *                   untouched with a stat, throttle the pre-save snapshot,
 *                   rewrite only shards whose bytes changed, and verify by
 *                   comparing the written documents byte-for-byte.
 *
 * It calls the same primitives the real path calls (`durableWrite`,
 * `dataEnvelope`, `monthlyShards`, `committedState`). It is a measurement
 * harness, not the production save path: it has no guards, no rollback and no
 * write-generation handling, because it only writes to a caller-owned
 * temporary directory.
 */

const fsDefault = require('node:fs');
const pathDefault = require('node:path');
const crypto = require('node:crypto');

const { createDurableJsonWriter } = require('./durableWrite.cjs');
const { encryptPayload, decryptPayload } = require('./dataEnvelope.cjs');
const { captureFileFingerprints, fingerprintsUnchanged, unchangedPaths } = require(
  './committedState.cjs',
);
const {
  splitWorkspaceForMonthlyShards,
  mergeMonthlyShardPartials,
  unwrapShardPayload,
  wrapShardPayload,
  baseCoreForShardMerge,
  shardRoundTripMatches,
  unionShardEntities,
} = require('./monthlyShards.cjs');

const BASE_FILENAME = 'workspace.json';

function shardFilename(monthKey) {
  return `workspace-${monthKey}.json`;
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function listShardPaths(fs, path, dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => /^workspace-.+\.json$/.test(name))
    .sort()
    .map((name) => path.join(dir, name));
}

function workspaceFilePaths(fs, path, dir) {
  return [path.join(dir, BASE_FILENAME), ...listShardPaths(fs, path, dir)];
}

/** Read + decrypt + parse every workspace file and merge shards. */
function readWorkspace(fs, path, dir, key) {
  const basePath = path.join(dir, BASE_FILENAME);
  if (!fs.existsSync(basePath)) return null;

  const baseText = decryptPayload(fs.readFileSync(basePath, 'utf8'), key);
  if (baseText === null) return null;
  const base = JSON.parse(baseText);

  const shardPaths = listShardPaths(fs, path, dir);
  if (shardPaths.length === 0) return base;

  const partials = [];
  for (const shardPath of shardPaths) {
    const shardText = decryptPayload(fs.readFileSync(shardPath, 'utf8'), key);
    if (shardText === null) return null;
    partials.push(unwrapShardPayload(JSON.parse(shardText)));
  }
  return mergeMonthlyShardPartials(baseCoreForShardMerge(base), partials);
}

/** Copy the live files and attachments into `backups/`, then scan for pruning. */
function snapshotEverything(fs, path, dir) {
  const backupsDir = path.join(dir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  for (const filePath of workspaceFilePaths(fs, path, dir)) {
    if (!fs.existsSync(filePath)) continue;
    fs.copyFileSync(filePath, path.join(backupsDir, `data-${ts}-${path.basename(filePath)}`));
  }

  let scanned = 0;
  for (const name of fs.readdirSync(backupsDir)) {
    if (!name.startsWith('data-') || !name.endsWith('.json')) continue;
    fs.statSync(path.join(backupsDir, name));
    scanned += 1;
  }
  return scanned;
}

function writtenDocumentMatches(fs, filePath, key, expectedJson) {
  try {
    return decryptPayload(fs.readFileSync(filePath, 'utf8'), key) === expectedJson;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   dir: string;
 *   key: Buffer;
 *   payload: Record<string, unknown>;
 *   mode?: 'legacy' | 'optimized';
 *   committed?: object | null;
 *   timer?: { stage: (name: string) => void };
 *   fs?: typeof import('fs');
 *   path?: typeof import('path');
 * }} options
 */
function runSaveCycle({
  dir,
  key,
  payload,
  mode = 'legacy',
  committed = null,
  timer = null,
  fs = fsDefault,
  path = pathDefault,
}) {
  const optimized = mode === 'optimized';
  const writeJsonText = createDurableJsonWriter({ fs, path });
  fs.mkdirSync(dir, { recursive: true });
  const basePath = path.join(dir, BASE_FILENAME);

  if (!optimized) {
    // Stringify the whole workspace only to count its bytes, then throw it away.
    Buffer.byteLength(JSON.stringify(payload), 'utf8');
    timer?.stage('size-check');
  }

  // Empty-overwrite guard: a full read, or a stat when the files are provably
  // the ones we last wrote.
  const proven =
    optimized &&
    committed &&
    fingerprintsUnchanged(fs, committed.fingerprints, workspaceFilePaths(fs, path, dir));
  if (!proven) readWorkspace(fs, path, dir, key);
  timer?.stage('empty-guard');

  const { baseWorkspace, shards } = splitWorkspaceForMonthlyShards(payload, {
    retainBaseBulk: true,
  });
  const baseJson = JSON.stringify(baseWorkspace);
  const untouched = proven ? unchangedPaths(fs, committed.fingerprints) : new Set();
  const priorDigests = proven ? committed.shardDigests : new Map();

  const shardDocuments = Object.entries(shards).map(([monthKey, partial]) => {
    const shardPath = path.join(dir, shardFilename(monthKey));
    const json = JSON.stringify(wrapShardPayload(monthKey, partial));
    const digest = optimized ? sha256Hex(json) : '';
    return {
      path: shardPath,
      json,
      digest,
      unchanged: optimized && untouched.has(shardPath) && priorDigests.get(shardPath) === digest,
    };
  });
  if (optimized) timer?.stage('serialize');

  // The pre-save snapshot: unconditional in the legacy path, throttled to one
  // every few minutes in the optimized path (so a typing burst takes none).
  let snapshotsScanned = 0;
  if (!optimized) snapshotsScanned = snapshotEverything(fs, path, dir);
  timer?.stage('snapshot');

  writeJsonText(basePath, encryptPayload(baseJson, key));
  const written = [{ path: basePath, json: baseJson }];
  for (const doc of shardDocuments) {
    if (doc.unchanged) continue;
    writeJsonText(doc.path, encryptPayload(doc.json, key));
    written.push(doc);
  }
  timer?.stage('encrypt-write');

  let verified;
  if (optimized) {
    verified =
      written.every((doc) => writtenDocumentMatches(fs, doc.path, key, doc.json)) &&
      shardRoundTripMatches(payload, unionShardEntities(shards));
  } else {
    const reread = readWorkspace(fs, path, dir, key);
    verified = !!reread && shardRoundTripMatches(payload, reread);
  }
  timer?.stage('verify');

  return {
    bytes: Buffer.byteLength(baseJson, 'utf8'),
    shardCount: shardDocuments.length,
    shardsWritten: written.length - 1,
    verified,
    snapshotsScanned,
    committed: {
      fingerprints: captureFileFingerprints(fs, [
        basePath,
        ...shardDocuments.map((doc) => doc.path),
      ]),
      shardDigests: new Map(shardDocuments.map((doc) => [doc.path, doc.digest])),
    },
  };
}

module.exports = {
  BASE_FILENAME,
  readWorkspace,
  runSaveCycle,
};
