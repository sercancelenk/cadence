/**
 * Cadence — Electron main process.
 *
 * Responsibilities:
 *   - Boot the application window with hardened defaults (contextIsolation, sandbox-friendly).
 *   - Persist per-user data files under `app.getPath('userData')`.
 *   - Provide IPC handlers for the renderer (data, auth, account, app metadata).
 *   - Install an English application menu and a basic auto-updater.
 *
 * Security notes:
 *   - `contextIsolation: true` and `nodeIntegration: false` are mandatory; the
 *     renderer only sees the `window.cadence` surface exposed by preload.
 *   - We block in-app navigation to any non-dev URL and route external clicks
 *     to the user's default browser via `shell.openExternal`.
 *   - The app installs a strict-ish Content-Security-Policy header at runtime.
 *
 * App naming notes:
 *   - The product was previously called "Leeadman" and shipped with
 *     userData at `appData/Leeadman/`. To keep upgrading users on their
 *     existing data we explicitly point `userData` at that legacy folder
 *     whenever it exists, regardless of the new productName "Cadence".
 *   - As of v1 the macOS `appId` is `com.cadence.app` (see `package.json`
 *     and `electron-builder.enterprise.json`). The pre-v1 builds shipped
 *     `com.leeadman.app`; users of that build need a one-time manual
 *     download of the new Cadence DMG. The data-migration code below
 *     copies their `Leeadman/` userData into `Cadence/` automatically
 *     on first launch so they don't lose anything in the move. After
 *     v1 the appId is frozen — every subsequent release stays on
 *     `com.cadence.app` so `electron-updater` can hand out updates.
 */

const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  dialog,
  ipcMain,
  protocol,
  shell,
  session,
  safeStorage,
} = require('electron');

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');
const selfsigned = require('selfsigned');

// Single source of truth for product-name strings (see also
// src/lib/appBranding.ts on the renderer side). If you find yourself
// editing this constant module please update BOTH copies.
const {
  APP_NAME,
  APP_NAME_LEGACY,
  APP_SLUG,
  APP_SLUG_LEGACY,
  LOG_TAG,
  DATA_FILE_PREFIX,
  DATA_FILE_PREFIX_LEGACY,
  SYNC_FINGERPRINT,
} = require('./branding.cjs');

const {
  initReminderSync,
  syncRemindersFromAppData,
  getReminderSyncStatus,
  requestReminderPermission,
  cancelReminderSlotsForItem,
  stopReminderSync,
} = require('./reminder/index.cjs');
const {
  initLinuxBackground,
  attachWindowCloseHandler,
  markQuitting,
  isActive: isLinuxBackgroundActive,
  destroyTray,
  getBackgroundStatus,
  setBackgroundSettings,
} = require('./reminder/linuxBackground.cjs');
const { parseCadenceDeepLink, deepLinkToRendererPath } = require('./reminder/deepLink.cjs');
const { getBuildAppId } = require('./buildAppId.cjs');
const {
  readWriteMeta,
  canCommitWriteGeneration,
  isFutureDataVersion,
  isValidSnapshotPayload,
} = require('./persistence/writeGeneration.cjs');
const { unwrapStoredWorkspace, wrapCommitEnvelope } = require('./persistence/commitEnvelope.cjs');
const {
  splitWorkspaceForMonthlyShards,
  mergeMonthlyShardPartials,
  monthlyShardFilename,
  listMonthlyShardMonths,
  unwrapShardPayload,
  wrapShardPayload,
  backupSnapshotKey,
  backupShardFilename,
  baseCoreForShardMerge,
  countShardableEntities,
  shardRoundTripMatches,
  isMonthlyShardBackupFilename,
  resolveBackupSetBasePath,
  mergeWorkspaceFromBackupParts,
} = require('./persistence/monthlyShards.cjs');
const { initCrashReporting } = require('./crashReporting.cjs');
const { requirePolicyFeature } = require('./ipc/policyGuard.cjs');
const {
  NOTE_HISTORY_DIRNAME,
  initNoteHistory,
  appendNoteRevision,
  listNoteRevisions,
  readNoteRevision,
  purgeNoteHistory,
  snapshotNoteHistoryForUser,
  pairedNoteHistoryBackupDir,
  importNoteHistoryFromDir,
  exportNoteHistoryToDir,
  collectReferencedAttachmentIdsFromNoteHistory,
  countNoteHistoryRevisions,
} = require('./noteHistory.cjs');
const {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  isRecoveryEnvelope,
  wrapRecoverySecret,
  unwrapRecoverySecret,
} = require('./accountRecovery.cjs');

/** Reject IPC saves larger than the LAN sync POST limit (defence against OOM). */
const MAX_SAVE_PAYLOAD_BYTES = 25 * 1024 * 1024;

if (process.platform === 'win32') {
  app.setAppUserModelId(getBuildAppId());
}

// ---------- Dev / prod data isolation + one-shot legacy migration --------------
//
// Production builds keep their data at `~/Library/Application Support/Cadence/`
// (derived from `app.getName()` which now resolves to "Cadence"). Dev builds
// (`npm run dev`) use a separate `Cadence (Dev)/` directory so they can never
// read, write or corrupt the data of the installed app.
//
// One-shot rename migration: pre-rename builds wrote everything to
// `~/Library/Application Support/Leeadman/` (and `Leeadman (Dev)/` for dev).
// On the FIRST launch after the rename we detect that folder and copy its
// contents into the new Cadence folder, renaming `leeadman-*.json` files to
// `cadence-*.json` on the way. We leave the legacy folder in place as a
// safety net — the user can delete it manually once they're happy.
//
// The decision MUST happen before any of our `app.getPath` calls or Electron
// will cache the resolved path for the rest of the process.
const IS_DEV = !!process.env.VITE_DEV_SERVER_URL;
app.setName(IS_DEV ? `${APP_NAME} (Dev)` : APP_NAME);

// Custom protocol for rich-text image sidecars (`cadence-attachment://…`).
// Must be registered before `app.ready` so `<img src>` loads work in the renderer.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'cadence-attachment',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
{
  const appDataDir = app.getPath('appData');
  const legacyDir = path.join(appDataDir, IS_DEV ? `${APP_NAME_LEGACY} (Dev)` : APP_NAME_LEGACY);
  const newDir = path.join(appDataDir, IS_DEV ? `${APP_NAME} (Dev)` : APP_NAME);

  try {
    fs.mkdirSync(newDir, { recursive: true });
  } catch {
    /* fs.mkdirSync on a path the OS refuses is non-recoverable; Electron
       will surface a clearer error below if userData turns out to be
       unwritable. */
  }
  app.setPath('userData', newDir);

  // Migration guard: only copy if the LEGACY folder exists AND the NEW folder
  // doesn't already have a Cadence-prefixed accounts file. The accounts file
  // is the most-likely-to-exist file in any non-empty workspace, so its
  // presence is a good "we've already migrated, leave it alone" signal.
  const newAccountsFile = path.join(newDir, `${DATA_FILE_PREFIX}-accounts.json`);
  if (fs.existsSync(legacyDir) && !fs.existsSync(newAccountsFile)) {
    try {
      migrateLegacyUserData(legacyDir, newDir);
      console.log(LOG_TAG, 'migrated legacy data from', legacyDir, '->', newDir);
    } catch (err) {
      console.warn(LOG_TAG, 'legacy data migration failed (continuing with empty workspace)', err);
    }
  }
}

/**
 * Recursive copy from a pre-rename `Leeadman/` folder into the new
 * `Cadence/` folder, renaming any `leeadman-*` filename to `cadence-*`.
 * Idempotent on a per-file basis (skips files that already exist at the
 * target) so a partial / interrupted migration can be re-run safely.
 */
function migrateLegacyUserData(legacyDir, newDir) {
  const entries = fs.readdirSync(legacyDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(legacyDir, entry.name);
    const renamed =
      entry.name.startsWith(`${DATA_FILE_PREFIX_LEGACY}-`) || entry.name === `${DATA_FILE_PREFIX_LEGACY}-data.json`
        ? `${DATA_FILE_PREFIX}-${entry.name.slice(DATA_FILE_PREFIX_LEGACY.length + 1)}`
        : entry.name;
    const dstPath = path.join(newDir, renamed);
    if (entry.isDirectory()) {
      try {
        fs.mkdirSync(dstPath, { recursive: true });
      } catch (err) {
        console.warn(LOG_TAG, 'migrate: mkdir failed for', dstPath, err);
        continue;
      }
      migrateLegacyUserData(srcPath, dstPath);
    } else if (entry.isFile() && !fs.existsSync(dstPath)) {
      try {
        fs.copyFileSync(srcPath, dstPath);
      } catch (err) {
        console.warn(LOG_TAG, 'migrate: copy failed for', srcPath, '->', dstPath, err);
      }
    }
  }
}

// ---------- Single instance ----------------------------------------------------

let mainWindow = null;
/** @type {string | null} */
let pendingDeepLinkPath = null;
/** @type {{ kind: string; itemId: string } | null} */
let pendingDeepLinkParsed = null;

function deliverDeepLinkPath(path) {
  if (!path || typeof path !== 'string') return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('app:deepLink', { path });
    } catch {
      /* ignore */
    }
    return;
  }
  pendingDeepLinkPath = path;
}

function deliverDeepLink(url) {
  const parsed = parseCadenceDeepLink(url);
  if (!parsed) return;
  const uid = readSessionUserId();
  const data = uid ? readUserData(uid) : null;
  const path = deepLinkToRendererPath(parsed, data);
  if (path) {
    pendingDeepLinkParsed = null;
    deliverDeepLinkPath(path);
    return;
  }
  pendingDeepLinkParsed = parsed;
}

function flushPendingDeepLink() {
  const uid = readSessionUserId();
  const data = uid ? readUserData(uid) : null;
  if (pendingDeepLinkParsed && data) {
    const path = deepLinkToRendererPath(pendingDeepLinkParsed, data);
    if (path) {
      pendingDeepLinkParsed = null;
      deliverDeepLinkPath(path);
      return;
    }
  }
  if (!pendingDeepLinkPath) return;
  const path = pendingDeepLinkPath;
  pendingDeepLinkPath = null;
  deliverDeepLinkPath(path);
}

if (process.platform === 'darwin') {
  app.on('open-url', (event, url) => {
    event.preventDefault();
    deliverDeepLink(url);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', (_event, commandLine) => {
  const url = commandLine.find((arg) => typeof arg === 'string' && arg.startsWith('cadence://'));
  if (url) deliverDeepLink(url);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ---------- Data paths ---------------------------------------------------------

// File names. The "single-user" legacy filename is what the very first
// pre-accounts builds wrote (no userId in the name); we still recognise it
// on login as a migration source. The other three files use the
// `${DATA_FILE_PREFIX}-` prefix from the branding module so a future rename
// is a one-constant change.
const LEGACY_SINGLEUSER_DATA_FILENAME = `${DATA_FILE_PREFIX_LEGACY}-data.json`;
const ACCOUNTS_FILENAME = `${DATA_FILE_PREFIX}-accounts.json`;
const SESSION_FILENAME = `${DATA_FILE_PREFIX}-session.json`;
const AUTH_FILENAME = 'auth-lock.json';
const BACKUPS_DIRNAME = 'backups';
const ATTACHMENTS_DIRNAME = 'attachments';
/**
 * Per-user file holding the data-encryption key wrapped by Electron's
 * `safeStorage` (which delegates to the OS Keychain on macOS, DPAPI on
 * Windows, and libsecret on Linux). Lets us resume an encrypted session
 * across app restarts without asking the user for their password again —
 * the original "every restart logs me out" UX bug.
 *
 * Threat model: the bytes on disk are useless without the OS-protected
 * key, so taking just the data files off the device leaks nothing extra.
 * On Linux without libsecret `safeStorage.isEncryptionAvailable()`
 * returns false; we refuse to persist a plaintext key in that case and
 * the user falls back to the previous behaviour (re-login on restart).
 *
 * Filename uses the user id (uuid) so multiple accounts on the same
 * machine each have their own opt-in/out without leaking state.
 */
const KEY_CACHE_FILENAME_PREFIX = `${DATA_FILE_PREFIX}-keycache-`;
/**
 * Tiny sidecar file that remembers when the auto-updater last successfully
 * pinged GitHub Releases. Lives next to the other user-data files so it
 * roams with the rest of the workspace state. Schema:
 *   { lastCheckedAt: number }   — epoch ms
 *
 * It exists so a fast quit-relaunch cycle (or a Settings → "Check for
 * updates" tap immediately after launch) doesn't keep firing fresh
 * network requests. Loss / corruption is harmless: it just falls back
 * to "never checked", which forces an immediate retry.
 */
const UPDATE_STATE_FILENAME = `${DATA_FILE_PREFIX}-update-state.json`;
/**
 * How many rolling on-disk snapshots to keep per user. We snapshot before
 * every save, so 50 is roughly a few hours of heavy editing. The on-disk
 * format is identical to the live file (encrypted envelope or plaintext),
 * which means restore is a single file copy.
 */
const BACKUPS_KEEP_MAX = 50;

function legacyDataPath() {
  return path.join(app.getPath('userData'), LEGACY_SINGLEUSER_DATA_FILENAME);
}

function dataPathForUser(userId) {
  return path.join(app.getPath('userData'), `${DATA_FILE_PREFIX}-data-${userId}.json`);
}

function monthlyShardPathForUser(userId, monthKey) {
  return path.join(
    app.getPath('userData'),
    monthlyShardFilename(DATA_FILE_PREFIX, userId, monthKey),
  );
}

function listMonthlyShardPathsForUser(userId) {
  const userData = app.getPath('userData');
  return listMonthlyShardMonths(userData, DATA_FILE_PREFIX, userId).map((monthKey) => ({
    monthKey,
    path: monthlyShardPathForUser(userId, monthKey),
  }));
}

/** Sum bytes of the base data file plus every monthly shard. */
function userDataFilesBytes(userId) {
  let bytes = fileSizeBytes(dataPathForUser(userId));
  for (const { path: shardPath } of listMonthlyShardPathsForUser(userId)) {
    bytes += fileSizeBytes(shardPath);
  }
  return bytes;
}

/**
 * Read a single on-disk JSON blob (encrypted or plaintext) into a parsed object.
 * @returns {{ ok: true; parsed: unknown; encrypted: boolean } | { ok: false; reason: string; error?: string; encrypted?: boolean }}
 */
function readParsedFile(userId, filePath) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, reason: 'missing', error: 'File not found.' };
  }
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, reason: 'io', error: String(err) };
  }
  const key = dataKeys.get(userId);
  if (isEncryptedFile(text)) {
    if (!key) {
      return { ok: false, reason: 'no-key', encrypted: true };
    }
    const plain = decryptPayload(text, key);
    if (plain == null) {
      return { ok: false, reason: 'bad-key', encrypted: true };
    }
    try {
      return { ok: true, parsed: JSON.parse(plain), encrypted: true };
    } catch {
      return { ok: false, reason: 'parse', encrypted: true };
    }
  }
  try {
    return { ok: true, parsed: JSON.parse(text), encrypted: false };
  } catch {
    return { ok: false, reason: 'parse', encrypted: false };
  }
}

/** @returns {ReturnType<typeof readUserDataResult>} */
function readSingleWorkspaceFileResult(userId, filePath) {
  const r = readParsedFile(userId, filePath);
  if (!r.ok) return r;
  try {
    const { workspace, writeGeneration, enveloped } = unwrapStoredWorkspace(r.parsed);
    return {
      ok: true,
      data: workspace,
      encrypted: r.encrypted,
      writeGeneration: enveloped ? writeGeneration : undefined,
    };
  } catch {
    return { ok: false, reason: 'parse', encrypted: r.encrypted };
  }
}

function writeEncryptedObject(userId, filePath, obj) {
  const key = dataKeys.get(userId);
  const json = JSON.stringify(obj);
  const out = key ? encryptPayload(json, key) : json;
  return writeJsonText(filePath, out);
}

function writeMetaPathForUser(userId) {
  return path.join(app.getPath('userData'), `${DATA_FILE_PREFIX}-data-${userId}.meta.json`);
}

function writeWriteMeta(userId, generation) {
  const metaPath = writeMetaPathForUser(userId);
  const payload = {
    generation,
    updatedAt: new Date().toISOString(),
  };
  return writeJsonText(metaPath, JSON.stringify(payload, null, 2)).ok;
}

/**
 * Extract AppData from a parsed on-disk object (envelope or legacy).
 * @param {unknown} obj
 */
function workspaceForSummary(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return unwrapStoredWorkspace(obj).workspace;
}

/**
 * Read the generation embedded in the live data file (envelope format).
 * Falls back to the meta sidecar for legacy plaintext files.
 * @param {string} userId
 * @returns {number}
 */
function readStoredWriteGeneration(userId) {
  const metaPath = writeMetaPathForUser(userId);
  const metaFallback = () => readWriteMeta(metaPath, fs).generation;
  const file = dataPathForUser(userId);
  if (!fs.existsSync(file)) return metaFallback();
  try {
    let text = fs.readFileSync(file, 'utf8');
    const key = dataKeys.get(userId);
    if (isEncryptedFile(text)) {
      if (!key) return metaFallback();
      const plain = decryptPayload(text, key);
      if (plain == null) return metaFallback();
      text = plain;
    }
    const parsed = JSON.parse(text);
    const { writeGeneration, enveloped } = unwrapStoredWorkspace(parsed);
    if (enveloped && typeof writeGeneration === 'number') return writeGeneration;
    return metaFallback();
  } catch {
    return metaFallback();
  }
}

/**
 * Persist workspace bytes and bump the on-disk write generation so the
 * renderer (and LAN clients using If-Match) can detect concurrent writers.
 *
 * Generation is embedded inside the data file envelope and atomically written
 * with the workspace bytes; the `.meta.json` sidecar is a read cache only.
 */
function commitUserData(userId, payload, options = {}) {
  const meta = readWriteMeta(writeMetaPathForUser(userId), fs);
  const fileGen = readStoredWriteGeneration(userId);
  const currentGeneration = Math.max(meta.generation, fileGen);
  const nextGeneration = currentGeneration + 1;

  const r = writeUserData(userId, payload, { ...options, writeGeneration: nextGeneration });
  if (!r.ok) return r;

  const metaOk = writeWriteMeta(userId, nextGeneration);
  if (!metaOk) {
    console.warn(
      '[cadence] meta mirror write failed; generation is embedded in the data envelope',
      { userId, nextGeneration },
    );
  }
  return { ok: true, writeGeneration: nextGeneration };
}

function accountsPath() {
  return path.join(app.getPath('userData'), ACCOUNTS_FILENAME);
}

function sessionPath() {
  return path.join(app.getPath('userData'), SESSION_FILENAME);
}

function authPath() {
  return path.join(app.getPath('userData'), AUTH_FILENAME);
}

function backupsDirForUser(userId) {
  return path.join(app.getPath('userData'), BACKUPS_DIRNAME, userId || '_anon');
}

function attachmentsDirForUser(userId) {
  return path.join(app.getPath('userData'), ATTACHMENTS_DIRNAME, userId || '_anon');
}

/** Safe attachment id for filesystem use (matches renderer validation). */
function sanitizeAttachmentId(id) {
  const s = String(id || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(s)) return null;
  return s;
}

function attachmentPathForUser(userId, attachmentId, encrypted) {
  const safe = sanitizeAttachmentId(attachmentId);
  if (!safe || !userId) return null;
  const ext = encrypted ? '.cadenc' : '.bin';
  return path.join(attachmentsDirForUser(userId), `${safe}${ext}`);
}

const ATTACHMENT_URI_PREFIX = 'cadence-attachment://';
const ATTACHMENT_DRAFT_GRACE_MS = 24 * 60 * 60 * 1000;

function parseAttachmentIdFromSrc(src) {
  if (!src || typeof src !== 'string') return null;
  if (!src.startsWith(ATTACHMENT_URI_PREFIX)) return null;
  return sanitizeAttachmentId(src.slice(ATTACHMENT_URI_PREFIX.length).trim());
}

function collectAttachmentIdsFromDocNode(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'image' && node.attrs && typeof node.attrs === 'object') {
    const id =
      (typeof node.attrs.attachmentId === 'string' && sanitizeAttachmentId(node.attrs.attachmentId)) ||
      parseAttachmentIdFromSrc(node.attrs.src);
    if (id) out.add(id);
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectAttachmentIdsFromDocNode(child, out);
  }
}

function collectReferencedAttachmentIdsFromPayload(payload) {
  const ids = new Set();
  const scan = (body, bodyFormat) => {
    if (bodyFormat !== 'prosemirror' || !body || typeof body !== 'string' || !body.trim()) return;
    try {
      collectAttachmentIdsFromDocNode(JSON.parse(body), ids);
    } catch {
      /* malformed doc — skip */
    }
  };
  for (const n of payload?.notes || []) {
    scan(n.body, n.bodyFormat);
    if (Array.isArray(n.attachmentRefs)) {
      for (const id of n.attachmentRefs) {
        const safe = sanitizeAttachmentId(id);
        if (safe) ids.add(safe);
      }
    }
  }
  for (const t of payload?.todoItems || []) scan(t.body, t.bodyFormat);
  const util = payload?.utilityDocument;
  if (util) scan(util.body, util.bodyFormat);
  return ids;
}

function listAttachmentIdsOnDisk(userId) {
  const dir = attachmentsDirForUser(userId);
  if (!fs.existsSync(dir)) return [];
  const ids = new Set();
  for (const name of fs.readdirSync(dir)) {
    const m = name.match(/^(.+)\.(cadenc|bin)$/);
    if (!m) continue;
    const id = sanitizeAttachmentId(m[1]);
    if (id) ids.add(id);
  }
  return [...ids];
}

function deleteAttachmentFiles(userId, attachmentId) {
  for (const enc of [true, false]) {
    const p = attachmentPathForUser(userId, attachmentId, enc);
    if (p && fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

function pruneOrphanAttachments(userId, payload) {
  try {
    const referenced = collectReferencedAttachmentIdsFromPayload(payload);
    for (const id of collectReferencedAttachmentIdsFromNoteHistory(userId)) {
      referenced.add(id);
    }
    const now = Date.now();
    let pruned = 0;
    for (const id of listAttachmentIdsOnDisk(userId)) {
      if (referenced.has(id)) continue;
      if (id.includes('-new-')) {
        const encPath = attachmentPathForUser(userId, id, true);
        const plainPath = attachmentPathForUser(userId, id, false);
        const p =
          (encPath && fs.existsSync(encPath) && encPath) ||
          (plainPath && fs.existsSync(plainPath) && plainPath) ||
          null;
        if (p) {
          const age = now - fs.statSync(p).mtimeMs;
          if (age < ATTACHMENT_DRAFT_GRACE_MS) continue;
        }
      }
      deleteAttachmentFiles(userId, id);
      pruned += 1;
    }
    return { ok: true, pruned };
  } catch (err) {
    console.warn('[cadence] attachment GC failed', err);
    return { ok: false, error: String(err?.message || err) };
  }
}

function snapshotAttachmentsForUser(userId, label, ts) {
  try {
    const srcDir = attachmentsDirForUser(userId);
    if (!fs.existsSync(srcDir)) return null;
    const files = fs.readdirSync(srcDir).filter((n) => n.endsWith('.cadenc') || n.endsWith('.bin'));
    if (!files.length) return null;
    const dir = backupsDirForUser(userId);
    fs.mkdirSync(dir, { recursive: true });
    const targetDir = path.join(dir, `attachments-${label}-${ts}`);
    fs.mkdirSync(targetDir, { recursive: true });
    for (const name of files) {
      fs.copyFileSync(path.join(srcDir, name), path.join(targetDir, name));
    }
    return targetDir;
  } catch (err) {
    console.warn('[cadence] attachment snapshot failed (continuing)', err);
    return null;
  }
}

function restoreAttachmentsFromBackupDir(userId, backupAttDir) {
  if (!backupAttDir || !fs.existsSync(backupAttDir)) return { ok: true, restored: 0 };
  const liveDir = attachmentsDirForUser(userId);
  fs.mkdirSync(liveDir, { recursive: true });
  let restored = 0;
  for (const name of fs.readdirSync(backupAttDir)) {
    if (!name.endsWith('.cadenc') && !name.endsWith('.bin')) continue;
    fs.copyFileSync(path.join(backupAttDir, name), path.join(liveDir, name));
    restored += 1;
  }
  return { ok: true, restored };
}

/** Read attachment bytes for `ownerUserId`, including OS-keychain cached keys. */
function readAttachmentBytesWithPersistedKey(ownerUserId, attachmentId) {
  const fromMem = readAttachmentBytes(ownerUserId, attachmentId);
  if (fromMem?.length) return fromMem;
  const persisted = loadPersistedDataKey(ownerUserId);
  if (!persisted) return null;
  const encPath = attachmentPathForUser(ownerUserId, attachmentId, true);
  if (encPath && fs.existsSync(encPath)) {
    try {
      const plain = decryptBuffer(fs.readFileSync(encPath, 'utf8'), persisted);
      if (plain?.length) return plain;
    } catch {
      /* fall through */
    }
  }
  const plainPath = attachmentPathForUser(ownerUserId, attachmentId, false);
  if (plainPath && fs.existsSync(plainPath)) {
    try {
      const raw = fs.readFileSync(plainPath);
      const text = raw.toString('utf8');
      if (isEncryptedEnvelope(text)) {
        return decryptBuffer(text, persisted);
      }
      return raw;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Portable export: decrypt sidecars so a bundle can be imported under another
 * account (or machine) without carrying the source encryption key.
 */
function exportAttachmentsPortableToDir(userId, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  let exported = 0;
  for (const id of listAttachmentIdsOnDisk(userId)) {
    const bytes = readAttachmentBytes(userId, id);
    if (!bytes?.length) continue;
    fs.writeFileSync(path.join(destDir, `${id}.bin`), bytes);
    exported += 1;
  }
  return exported;
}

/**
 * Portable import: accept plaintext `.bin` (preferred) or legacy encrypted
 * sidecars from an older export, then re-encrypt under the signed-in account.
 */
function importAttachmentsPortableFromDir(userId, srcDir) {
  if (!srcDir || !fs.existsSync(srcDir)) return { ok: true, restored: 0, skipped: 0 };
  let restored = 0;
  let skipped = 0;
  for (const name of fs.readdirSync(srcDir)) {
    const m = name.match(/^(.+)\.(cadenc|bin)$/);
    if (!m) continue;
    const id = sanitizeAttachmentId(m[1]);
    if (!id) continue;
    const filePath = path.join(srcDir, name);
    let plain = null;
    try {
      const raw = fs.readFileSync(filePath);
      const asText = raw.toString('utf8');
      if (isEncryptedEnvelope(asText)) {
        const key = dataKeys.get(userId);
        plain = key ? decryptBuffer(asText, key) : null;
      } else {
        plain = raw;
      }
    } catch {
      plain = null;
    }
    if (!plain?.length) {
      skipped += 1;
      continue;
    }
    const w = writeAttachmentBytes(userId, id, plain, detectAttachmentMime(plain));
    if (w.ok) restored += 1;
    else skipped += 1;
  }
  return { ok: true, restored, skipped };
}

/**
 * After a JSON-only import on this machine, copy referenced images from other
 * local account attachment folders (same device, pre-export salvage path).
 */
function salvageReferencedAttachmentsLocally(targetUserId, payload) {
  const needed = collectReferencedAttachmentIdsFromPayload(payload);
  if (!needed.length) return { restored: 0 };
  const attRoot = path.join(app.getPath('userData'), ATTACHMENTS_DIRNAME);
  if (!fs.existsSync(attRoot)) return { restored: 0 };
  let restored = 0;
  const siblingDirs = fs
    .readdirSync(attRoot)
    .filter((name) => name !== targetUserId && fs.statSync(path.join(attRoot, name)).isDirectory());
  for (const attachmentId of needed) {
    if (readAttachmentBytes(targetUserId, attachmentId)?.length) continue;
    for (const ownerId of siblingDirs) {
      const bytes = readAttachmentBytesWithPersistedKey(ownerId, attachmentId);
      if (!bytes?.length) continue;
      const w = writeAttachmentBytes(targetUserId, attachmentId, bytes, detectAttachmentMime(bytes));
      if (w.ok) {
        restored += 1;
        break;
      }
    }
  }
  return { restored };
}

function pairedAttachmentsBackupDir(dataBackupPath) {
  const base = path.basename(dataBackupPath, '.json');
  if (!base.startsWith('data-')) return null;
  const attDir = path.join(path.dirname(dataBackupPath), base.replace(/^data-/, 'attachments-'));
  return fs.existsSync(attDir) ? attDir : null;
}

function importAttachmentsFromDir(userId, srcDir) {
  return restoreAttachmentsFromBackupDir(userId, srcDir);
}

function keyCachePath(userId) {
  return path.join(app.getPath('userData'), `${KEY_CACHE_FILENAME_PREFIX}${userId}.bin`);
}

/**
 * Whether `safeStorage` can actually wrap secrets on this machine. False
 * on Linux installs that lack a libsecret-backed keyring; in that state
 * we MUST NOT persist the data-encryption key on disk because the only
 * remaining "encryption" `safeStorage` offers there is a hardcoded
 * obfuscation key which is no protection at all.
 */
function isKeyCacheAvailable() {
  try {
    return !!safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * Read-and-decrypt the previously persisted data-encryption key for `userId`.
 * Returns a 32-byte Buffer on success, or null if the file is missing,
 * unreadable, or no longer decryptable (e.g. the OS keyring was reset).
 *
 * Callers are expected to validate the returned key by attempting to
 * decrypt the user's actual data file with it. A mismatch means the cache
 * is stale (e.g. the password was rotated on another device + sync'd) and
 * the caller should `clearPersistedDataKey(userId)` and fall back to
 * password-based re-auth.
 */
function loadPersistedDataKey(userId) {
  if (!userId || !isKeyCacheAvailable()) return null;
  const file = keyCachePath(userId);
  if (!fs.existsSync(file)) return null;
  try {
    const wrapped = fs.readFileSync(file);
    const hex = safeStorage.decryptString(wrapped);
    if (typeof hex !== 'string' || hex.length !== 64) return null;
    const buf = Buffer.from(hex, 'hex');
    if (buf.length !== 32) return null;
    return buf;
  } catch (err) {
    console.warn('[cadence] could not load persisted data key', err);
    return null;
  }
}

/**
 * Wrap `keyBuffer` with `safeStorage` and persist it for `userId`.
 * Returns true if the key was successfully persisted, false otherwise
 * (e.g. `safeStorage` unavailable, fs error). NEVER falls back to
 * writing a plaintext or weakly-obfuscated key — better to keep
 * asking the user for their password than to leak a key at rest.
 */
function persistDataKey(userId, keyBuffer) {
  if (!userId || !Buffer.isBuffer(keyBuffer) || keyBuffer.length !== 32) return false;
  if (!isKeyCacheAvailable()) return false;
  const file = keyCachePath(userId);
  try {
    const wrapped = safeStorage.encryptString(keyBuffer.toString('hex'));
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, wrapped, { mode: 0o600 });
    fs.renameSync(tmp, file);
    // Tighten permissions on platforms that honor them.
    try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
    return true;
  } catch (err) {
    console.warn('[cadence] could not persist data key', err);
    return false;
  }
}

function clearPersistedDataKey(userId) {
  if (!userId) return;
  try {
    const p = keyCachePath(userId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err) {
    console.warn('[cadence] could not clear persisted data key', err);
  }
}

/**
 * Per-user opt-in flag for the OS-keychain cache. Default ON: a brand-new
 * account that never touched the toggle will be remembered after restart
 * (because that's what users overwhelmingly expect from a desktop app and
 * what the previous version of this app silently failed to do). The user
 * can opt out from Settings → "Stay signed in".
 */
function getUserRememberMe(u) {
  if (!u) return true;
  return u.rememberMe !== false;
}

// ---------- JSON utilities -----------------------------------------------------

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error('[cadence] failed to read', filePath, err);
    return fallback;
  }
}

function writeJsonSafe(filePath, payload) {
  return writeJsonText(filePath, JSON.stringify(payload, null, 2)).ok;
}

// ---------- Auth helpers -------------------------------------------------------

/**
 * Normalize PIN strings before hashing.
 *
 * `String.prototype.trim` only strips a fixed list of whitespace, so paste-
 * happy users (and some IMEs) sneak in invisibles like ZWSP/NBSP/BOM that
 * happily land in the stored hash on `setPin` but get trimmed on `verify`,
 * producing the dreaded "saved → wrong PIN → locked out" loop. Normalize to
 * NFC + strip every control/zero-width char everywhere so both call sites
 * always see the same bytes for the same user-visible input.
 */
function normalizePin(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F\u00A0\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim();
}

function hashWithSalt(value, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.scryptSync(String(value), salt, 64);
}

/**
 * Derive a 32-byte AES-256 key from the user's password.
 * `encSalt` is a hex string stored per-user in `accounts.json`.
 */
function deriveDataKey(password, encSaltHex) {
  const salt = Buffer.from(encSaltHex, 'hex');
  return crypto.scryptSync(String(password), salt, 32);
}

/**
 * In-memory map: userId -> 32-byte AES key. Held only for the duration of the
 * Electron process; cleared on logout / password change. Never persisted.
 */
const dataKeys = new Map();

const DATA_FILE_MAGIC = 'LDMN1';

/** Returns true when the buffer/string starts with our encrypted-file magic. */
function isEncryptedFile(text) {
  if (typeof text !== 'string') return false;
  const t = text.trimStart();
  if (!t.startsWith('{')) return false;
  try {
    const o = JSON.parse(t);
    return o && o.magic === DATA_FILE_MAGIC && typeof o.iv === 'string' && typeof o.ct === 'string';
  } catch {
    return false;
  }
}

/** AES-256-GCM encrypt → returns the on-disk JSON envelope as a string. */
function encryptPayload(plainText, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    magic: DATA_FILE_MAGIC,
    v: 1,
    alg: 'AES-256-GCM',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  });
}

/** AES-256-GCM decrypt → returns the original UTF-8 string or null on auth failure. */
function decryptPayload(envelope, key) {
  try {
    const o = JSON.parse(envelope);
    if (!o || o.magic !== DATA_FILE_MAGIC) return null;
    const iv = Buffer.from(o.iv, 'base64');
    const tag = Buffer.from(o.tag, 'base64');
    const ct = Buffer.from(o.ct, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    return null;
  }
}

/** AES-256-GCM encrypt binary → same on-disk envelope as data file, with `binary: true`. */
function encryptBuffer(buffer, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    magic: DATA_FILE_MAGIC,
    v: 1,
    alg: 'AES-256-GCM',
    binary: true,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  });
}

/** Decrypt binary envelope → Buffer or null. */
function decryptBuffer(envelopeText, key) {
  try {
    const o = JSON.parse(envelopeText);
    if (!o || o.magic !== DATA_FILE_MAGIC) return null;
    const iv = Buffer.from(o.iv, 'base64');
    const tag = Buffer.from(o.tag, 'base64');
    const ct = Buffer.from(o.ct, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    return null;
  }
}

function isEncryptedEnvelope(text) {
  try {
    const o = JSON.parse(text);
    return o && o.magic === DATA_FILE_MAGIC && typeof o.iv === 'string' && typeof o.ct === 'string';
  } catch {
    return false;
  }
}

/**
 * Atomic binary write (same durability guarantees as `writeJsonText`).
 */
function writeBinaryFile(filePath, buffer) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, buffer, 0, buffer.length);
      try {
        fs.fsyncSync(fd);
      } catch (err) {
        console.warn('[cadence] fsync(file) failed (continuing)', err);
      }
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, filePath);
    try {
      const dirFd = fs.openSync(path.dirname(filePath), 'r');
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      /* Windows may not fsync directories */
    }
    return true;
  } catch (err) {
    console.error('[cadence] failed to write binary', filePath, err);
    return false;
  }
}

function readAttachmentBytes(userId, attachmentId) {
  const key = dataKeys.get(userId);
  const encPath = attachmentPathForUser(userId, attachmentId, true);
  const plainPath = attachmentPathForUser(userId, attachmentId, false);
  if (key && encPath && fs.existsSync(encPath)) {
    const envelope = fs.readFileSync(encPath, 'utf8');
    return decryptBuffer(envelope, key);
  }
  if (plainPath && fs.existsSync(plainPath)) {
    const raw = fs.readFileSync(plainPath);
    if (isEncryptedEnvelope(raw.toString('utf8'))) {
      if (!key) return null;
      return decryptBuffer(raw.toString('utf8'), key);
    }
    return raw;
  }
  return null;
}

function writeAttachmentBytes(userId, attachmentId, buffer, mimeType) {
  const key = dataKeys.get(userId);
  const filePath = attachmentPathForUser(userId, attachmentId, !!key);
  if (!filePath) return { ok: false, error: 'Invalid attachment id.' };
  const out = key ? Buffer.from(encryptBuffer(buffer, key), 'utf8') : buffer;
  const ok = writeBinaryFile(filePath, out);
  if (!ok) return { ok: false, error: 'Could not write attachment file.' };
  return { ok: true, mimeType: mimeType || 'application/octet-stream' };
}

function detectAttachmentMime(bytes) {
  if (!bytes || bytes.length < 2) return 'application/octet-stream';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return 'image/webp';
}

function parseAttachmentUrl(urlString) {
  try {
    const u = new URL(urlString);
    const fromHost = u.hostname && !['localhost', '127.0.0.1'].includes(u.hostname) ? u.hostname : '';
    const fromPath = u.pathname.replace(/^\//, '');
    const raw = fromHost || fromPath || urlString.replace(/^cadence-attachment:\/\//i, '');
    return sanitizeAttachmentId(decodeURIComponent(raw.split('?')[0].split('#')[0] || ''));
  } catch {
    const raw = String(urlString || '').replace(/^cadence-attachment:\/\//i, '');
    return sanitizeAttachmentId(decodeURIComponent(raw.split('?')[0].split('#')[0] || ''));
  }
}

/**
 * Read-result discriminated union. `ok=false` distinguishes "no file" from
 * "file exists but undecipherable", which is critical for callers that need
 * to refuse writes instead of silently overwriting a key-mismatched file.
 */
function readUserDataResult(userId) {
  const basePath = dataPathForUser(userId);
  const shardPaths = listMonthlyShardPathsForUser(userId);

  // Legacy single-file workspace — no monthly shards on disk yet.
  if (shardPaths.length === 0) {
    if (!fs.existsSync(basePath)) return { ok: true, data: null, encrypted: false };
    return readSingleWorkspaceFileResult(userId, basePath);
  }

  let baseResult;
  if (fs.existsSync(basePath)) {
    baseResult = readSingleWorkspaceFileResult(userId, basePath);
  } else {
    baseResult = { ok: true, data: {}, encrypted: false };
  }
  if (!baseResult.ok) return baseResult;

  const baseWorkspace =
    baseResult.data && typeof baseResult.data === 'object'
      ? /** @type {Record<string, unknown>} */ (baseResult.data)
      : {};

  /** @type {Array<{ notes: unknown[]; todoItems: unknown[]; items: unknown[] }>} */
  const shardPartials = [];
  let anyEncrypted = !!baseResult.encrypted;
  let shardReadFailures = 0;

  for (const { monthKey, path: shardPath } of shardPaths) {
    const sr = readParsedFile(userId, shardPath);
    if (!sr.ok) {
      shardReadFailures += 1;
      console.warn(
        '[cadence] monthly shard unreadable — will fall back to base file bulk if needed',
        { monthKey, shardPath, reason: sr.reason },
      );
      continue;
    }
    anyEncrypted = anyEncrypted || sr.encrypted;
    shardPartials.push(unwrapShardPayload(sr.parsed));
  }

  // Shards are canonical for bulk; base may still hold a full monolithic copy for older app versions.
  const merged = mergeMonthlyShardPartials(baseCoreForShardMerge(baseWorkspace), shardPartials);
  const mergedCounts = countShardableEntities(merged);
  const baseCounts = countShardableEntities(baseWorkspace);

  let data = merged;
  if (mergedCounts.total < baseCounts.total && baseCounts.total > 0) {
    console.warn('[cadence] shard merge incomplete — serving full base file bulk', {
      shardReadFailures,
      mergedTotal: mergedCounts.total,
      baseTotal: baseCounts.total,
    });
    data = baseWorkspace;
  }

  return {
    ok: true,
    data,
    encrypted: anyEncrypted,
    writeGeneration: baseResult.writeGeneration,
  };
}

/** Back-compat: returns plain object or null. New code should prefer `readUserDataResult`. */
function readUserData(userId) {
  const r = readUserDataResult(userId);
  return r.ok ? r.data : null;
}

/**
 * Snapshot the user's current on-disk data file into `backups/<userId>/` so a
 * subsequent write can never silently destroy unreadable contents.
 *
 * Notes:
 *  - We copy the raw bytes (encrypted envelope or legacy plaintext), so a
 *    later restore is byte-identical to what was there.
 *  - Best-effort: any I/O error is logged but never blocks the live write.
 *  - We keep at most `BACKUPS_KEEP_MAX` files per user (FIFO), to bound disk.
 */
function snapshotCurrentDataFile(userId, label = 'pre-write') {
  try {
    const dir = backupsDirForUser(userId);
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const baseLive = dataPathForUser(userId);
    let copied = false;

    if (fs.existsSync(baseLive)) {
      const stat = fs.statSync(baseLive);
      if (stat.size) {
        const name = `data-${label}-${ts}.json`;
        fs.copyFileSync(baseLive, path.join(dir, name));
        copied = true;
      }
    }

    for (const { monthKey, path: shardLive } of listMonthlyShardPathsForUser(userId)) {
      if (!fs.existsSync(shardLive)) continue;
      const stat = fs.statSync(shardLive);
      if (!stat.size) continue;
      const baseName = `data-${label}-${ts}.json`;
      const shardName = backupShardFilename(baseName, monthKey);
      fs.copyFileSync(shardLive, path.join(dir, shardName));
      copied = true;
    }

    if (!copied) return null;

    snapshotAttachmentsForUser(userId, label, ts);
    snapshotNoteHistoryForUser(userId, label, ts);
    pruneBackups(dir);
    return path.join(dir, `data-${label}-${ts}.json`);
  } catch (err) {
    console.warn('[cadence] snapshot failed (continuing)', err);
    return null;
  }
}

function pruneBackups(dir) {
  try {
    const entries = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith('data-') && n.endsWith('.json'))
      .map((n) => ({
        name: n,
        full: path.join(dir, n),
        mtime: fs.statSync(path.join(dir, n)).mtimeMs,
        setKey: backupSnapshotKey(n),
      }));

    /** @type {Map<string, { mtime: number; files: { name: string; full: string }[] }>} */
    const sets = new Map();
    for (const entry of entries) {
      const existing = sets.get(entry.setKey);
      if (!existing) {
        sets.set(entry.setKey, { mtime: entry.mtime, files: [{ name: entry.name, full: entry.full }] });
      } else {
        existing.mtime = Math.max(existing.mtime, entry.mtime);
        existing.files.push({ name: entry.name, full: entry.full });
      }
    }

    const sortedSets = Array.from(sets.values()).sort((a, b) => b.mtime - a.mtime);
    const keptSets = sortedSets.slice(0, BACKUPS_KEEP_MAX);
    for (const old of sortedSets.slice(BACKUPS_KEEP_MAX)) {
      for (const file of old.files) {
        try {
          fs.unlinkSync(file.full);
        } catch {
          /* ignore */
        }
        const attName = file.name.replace(/^data-/, 'attachments-').replace(/\.json$/, '');
        const attDir = path.join(dir, attName);
        if (fs.existsSync(attDir)) {
          try {
            fs.rmSync(attDir, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
        }
        const histName = file.name.replace(/^data-/, 'note-history-').replace(/\.json$/, '');
        const histDir = path.join(dir, histName);
        if (fs.existsSync(histDir)) {
          try {
            fs.rmSync(histDir, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
        }
      }
    }
    // Drop orphaned attachment-only folders left from older builds.
    const keptAtt = new Set(
      keptSets.flatMap((set) =>
        set.files.map((f) => f.name.replace(/^data-/, 'attachments-').replace(/\.json$/, '')),
      ),
    );
    const keptHist = new Set(
      keptSets.flatMap((set) =>
        set.files.map((f) => f.name.replace(/^data-/, 'note-history-').replace(/\.json$/, '')),
      ),
    );
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('attachments-') && !keptAtt.has(name)) {
        try {
          fs.rmSync(path.join(dir, name), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
      if (name.startsWith('note-history-') && !keptHist.has(name)) {
        try {
          fs.rmSync(path.join(dir, name), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    console.warn('[cadence] prune backups failed', err);
  }
}

/**
 * Encrypts (when a key is available) and writes the user's data file atomically.
 *
 * Critical safety rules to prevent silent data loss on update / key mismatch:
 *   1. Always snapshot the existing file first (regardless of decrypt success).
 *   2. Refuse to write when the existing file is encrypted but we cannot
 *      decrypt it with our current in-memory key, UNLESS the caller passed
 *      `allowOverwriteUnreadable=true` (used by the explicit restore flow).
 *      Without this gate, a user who lands on a key mismatch (e.g. after a
 *      bad update) would see "empty" data, type a single character, and
 *      irrevocably overwrite the encrypted file with that single character's
 *      worth of state.
 */
function writeUserData(userId, payload, { allowOverwriteUnreadable = false, writeGeneration = null } = {}) {
  const file = dataPathForUser(userId);

  if (isFutureDataVersion(payload)) {
    console.error('[cadence] refusing to write future data version', {
      userId,
      version: payload && typeof payload === 'object' ? payload.version : undefined,
    });
    return {
      ok: false,
      reason: 'unsupported-version',
      error:
        'This workspace was saved by a newer version of Cadence. Update the app before saving changes.',
    };
  }

  if (fs.existsSync(file) && !allowOverwriteUnreadable) {
    const existing = readUserDataResult(userId);
    if (!existing.ok && (existing.reason === 'no-key' || existing.reason === 'bad-key')) {
      console.error(
        '[cadence] refusing to overwrite undecipherable data file',
        { userId, reason: existing.reason },
      );
      return {
        ok: false,
        error:
          'A data file already exists for this account but cannot be decrypted with the current session key. Refusing to overwrite. Use Settings → Backups & Recovery to inspect or restore your data.',
        reason: existing.reason,
      };
    }
    if (existing.ok && existing.data && isFutureDataVersion(existing.data)) {
      console.error('[cadence] refusing to overwrite newer-version workspace on disk', { userId });
      return {
        ok: false,
        reason: 'unsupported-version',
        error:
          'This workspace was saved by a newer version of Cadence. Update the app before saving changes.',
      };
    }
  }

  // Defence in depth against plaintext-leak: refuse to save when the
  // account is configured for encryption but the in-memory key is
  // missing. Without this guard, a stale renderer (or a session-only
  // resumed boot, see `account:session` above) would silently overwrite
  // an encrypted file with PLAINTEXT bytes the next time the user
  // typed anything. We never want to make encryption weaker mid-session.
  const key = dataKeys.get(userId);
  if (!key) {
    const accounts = readAccounts();
    const u = accounts.users.find((x) => x.id === userId);
    if (u && typeof u.encSalt === 'string' && u.encSalt) {
      console.error(
        '[cadence] refusing to write data: account is encrypted but no in-memory key',
        { userId, allowOverwriteUnreadable },
      );
      return {
        ok: false,
        reason: 'no-key',
        error:
          'Your session is locked: the encryption key is no longer in memory. Please sign in again and retry.',
      };
    }
  }

  const preSaveSnapshot = snapshotCurrentDataFile(userId, 'pre-save');

  const rollbackPreSaveSnapshot = (snapshotPath) => {
    if (!snapshotPath) return;
    try {
      const rollback = loadWorkspaceFromBackupSet(userId, snapshotPath);
      if (rollback.ok) {
        commitUserData(userId, rollback.workspace, { allowOverwriteUnreadable: true });
      }
    } catch (err) {
      console.warn('[cadence] pre-save rollback failed', err);
    }
  };

  const hadShards = listMonthlyShardPathsForUser(userId).length > 0;
  const { baseWorkspace, shards } = splitWorkspaceForMonthlyShards(
    payload && typeof payload === 'object' ? payload : {},
    { retainBaseBulk: true },
  );
  const willHaveShards = Object.keys(shards).length > 0;
  if (!hadShards && willHaveShards) {
    snapshotCurrentDataFile(userId, 'pre-monthly-layout');
  }

  // Write the base workspace first so a mid-save crash never leaves shards
  // ahead of an outdated (or missing) base file.
  const body =
    writeGeneration != null ? wrapCommitEnvelope(writeGeneration, baseWorkspace) : baseWorkspace;
  const writeResult = writeEncryptedObject(userId, file, body);
  if (!writeResult.ok) {
    return {
      ok: false,
      reason: writeResult.reason ?? 'io',
      error:
        writeResult.error ??
        'I/O error while writing data file.',
    };
  }

  const writtenMonths = new Set();
  for (const [monthKey, partial] of Object.entries(shards)) {
    const shardBody = wrapShardPayload(monthKey, partial);
    const shardPath = monthlyShardPathForUser(userId, monthKey);
    const shardWrite = writeEncryptedObject(userId, shardPath, shardBody);
    if (!shardWrite.ok) {
      console.error('[cadence] monthly shard write failed', {
        userId,
        monthKey,
        reason: shardWrite.reason,
        error: shardWrite.error,
      });
      rollbackPreSaveSnapshot(preSaveSnapshot);
      return {
        ok: false,
        reason: shardWrite.reason ?? 'io',
        error: 'I/O error while writing monthly archive shard.',
      };
    }
    writtenMonths.add(monthKey);
  }

  for (const { monthKey, path: shardPath } of listMonthlyShardPathsForUser(userId)) {
    if (Object.prototype.hasOwnProperty.call(shards, monthKey)) continue;
    try {
      fs.unlinkSync(shardPath);
    } catch (err) {
      console.warn('[cadence] failed to remove empty monthly shard', shardPath, err);
    }
  }

  const verify = readUserDataResult(userId);
  if (!verify.ok || !verify.data || !shardRoundTripMatches(payload, verify.data)) {
    console.error('[cadence] post-save verification failed', {
      userId,
      verifyOk: verify.ok,
    });
    rollbackPreSaveSnapshot(preSaveSnapshot);
    return {
      ok: false,
      reason: 'verify-failed',
      error:
        'Save verification failed: re-read workspace does not match what was written. Your previous files were snapshotted — use Settings → Backups & Recovery to restore.',
    };
  }

  setImmediate(() => {
    try {
      pruneOrphanAttachments(userId, payload);
    } catch (err) {
      console.warn('[cadence] deferred attachment GC failed', err);
    }
  });
  return { ok: true };
}

/**
 * Atomic, durable write of a UTF-8 string to `filePath`.
 *
 * Why this much ceremony for a single write?
 *   - Naïve `writeFileSync` returns when the bytes are queued in the kernel
 *     page cache, NOT when they have been persisted to the underlying
 *     storage. On macOS/Linux that delay can be 5–30 seconds.
 *   - A power loss, kernel panic, or forced reboot in that window will lose
 *     the "successful" write — exactly the failure mode the user wants to
 *     avoid ("notlarım kaybolmasın").
 *
 * What we do instead:
 *   1. Write the new content to a sibling `.tmp` file with an explicit
 *      fd open/write/fsync/close cycle. `fsync(fd)` blocks until the bytes
 *      are on durable storage.
 *   2. Atomically rename the tmp file over the target. POSIX guarantees the
 *      directory entry update is atomic, so a crash mid-rename leaves either
 *      the old file or the new file — never a torn one.
 *   3. fsync the containing directory so the rename itself survives a
 *      crash. (No-op / not supported on Windows; we swallow that error.)
 */
function writeJsonText(filePath, text) {
  const fail = (reason, error) => ({ ok: false, reason, error });
  let tmp;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    tmp = `${filePath}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    let fileFsyncOk = true;
    try {
      fs.writeSync(fd, text, 0, 'utf8');
      try {
        fs.fsyncSync(fd);
      } catch (err) {
        console.error('[cadence] fsync(file) failed — refusing to commit', filePath, err);
        fileFsyncOk = false;
      }
    } finally {
      fs.closeSync(fd);
    }
    if (!fileFsyncOk) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      return fail(
        'durability',
        'Could not confirm your data reached durable storage. Retry the save; your previous file is unchanged.',
      );
    }
    fs.renameSync(tmp, filePath);
    tmp = null;
    try {
      const dirFd = fs.openSync(path.dirname(filePath), 'r');
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      // Some platforms (Windows) don't allow fsync on directory fds.
      // The rename itself is still atomic; we just don't get the extra
      // crash guarantee for the directory entry.
    }
    return { ok: true };
  } catch (err) {
    if (tmp) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
    console.error('[cadence] failed to write', filePath, err);
    return fail('io', 'I/O error while writing data file.');
  }
}

// ---------- LAN sync server ---------------------------------------------------
//
// Optional, opt-in HTTP server that exposes the *currently signed-in* user's
// data to other devices on the same Wi-Fi network. Authentication is a
// bearer token that lives in `sync.json`; rotating it invalidates pairings.
//
// Endpoints:
//   GET  /v1/snapshot   → JSON `{ data, ts }` for the active session.
//   POST /v1/snapshot   → replaces the active user's data with the request body.
//   OPTIONS *           → CORS preflight reply.
//
// All responses set Access-Control-Allow-Origin: * so the PWA can call into
// the desktop from a different origin.

const SYNC_FILENAME = 'sync.json';
const SYNC_DEFAULT_PORT = 9787;

function syncConfigPath() {
  return path.join(app.getPath('userData'), SYNC_FILENAME);
}

function readSyncConfig() {
  return readJsonSafe(syncConfigPath(), { enabled: false });
}

function writeSyncConfig(cfg) {
  writeJsonSafe(syncConfigPath(), cfg);
}

let syncServer = null;
let syncBoundPort = null;
// Cached TLS metadata so `sync:status` can hand the fingerprint /
// expiry to the renderer without re-reading the cert each time.
let syncTlsFingerprint = null;
let syncTlsNotAfter = null;

function localIPv4Addresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ifc of ifaces[name] ?? []) {
      if (!ifc.internal && ifc.family === 'IPv4') out.push(ifc.address);
    }
  }
  return out;
}

// -- TLS for the sync server ---------------------------------------------------
//
// We run the sync server over HTTPS even on the LAN. Reasons:
//
//   1. Modern browsers (Firefox HTTPS-Only, Chrome's "Always use secure
//      connections", iOS Safari Private Relay) refuse to navigate to
//      `http://` URLs in many configurations. The QR-pair flow needs the
//      phone to *open* a URL, so the URL has to be `https://`.
//   2. HTTPS sidesteps the active mixed-content block (HTTPS pages
//      cannot `fetch` HTTP URLs). The PWA at github.io can now talk to
//      the LAN host without serving the bundle from the host as a
//      workaround.
//   3. LAN traffic is encrypted end-to-end. An attacker who has joined
//      your Wi-Fi sees TLS-protected bytes instead of the workspace.
//
// Because the cert is self-signed, the *first* visit from a given
// device shows a security warning ("Your connection is not private").
// The user taps "Advanced → Proceed Anyway" once and the device
// remembers the cert. We surface a clear explainer in the host UI so
// this isn't mysterious.
//
// Apple's iOS / Safari rejects TLS server certs whose validity period
// is longer than 825 days (per RFC 8555 + Apple's 2020 policy). We use
// 800 days as a defensive ceiling: long enough that most users never
// have to re-accept, short enough to stay under Safari's hard limit.
const SYNC_TLS_FILENAME = `${DATA_FILE_PREFIX}-sync-tls.json`;
const SYNC_TLS_VALIDITY_DAYS = 800;
// Regenerate ~30 days before expiry so a quietly-paired phone is never
// surprised by a hard-expired cert.
const SYNC_TLS_RENEW_THRESHOLD_DAYS = 30;

function syncTlsPath() {
  return path.join(app.getPath('userData'), SYNC_TLS_FILENAME);
}

function readTlsBundle() {
  // Returns the stored TLS material or `null` if missing/corrupt.
  // Format: `{ version: 1, key, cert, sans: [...], generatedAt, notAfter, fingerprint }`.
  const p = syncTlsPath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return null;
    if (typeof j.key !== 'string' || typeof j.cert !== 'string') return null;
    return j;
  } catch (e) {
    console.warn('[cadence] tls bundle unreadable; will regenerate', e?.message);
    return null;
  }
}

function writeTlsBundle(bundle) {
  // We touch the user data directory directly rather than going through
  // the snapshot writer — the bundle is small (~3 KB) and isn't part of
  // the workspace backup story.
  const p = syncTlsPath();
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(bundle, null, 2));
  fs.renameSync(tmp, p);
  // Restrict to owner-only on POSIX. No-op on Windows but harmless.
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* swallow */
  }
}

function computeFingerprint(certPem) {
  try {
    const x509 = new crypto.X509Certificate(certPem);
    return x509.fingerprint256;
  } catch (e) {
    console.warn('[cadence] could not compute cert fingerprint', e?.message);
    return null;
  }
}

function listCertSans(certPem) {
  try {
    const x509 = new crypto.X509Certificate(certPem);
    const raw = x509.subjectAltName || '';
    // `subjectAltName` is a comma-separated list like
    // "DNS:localhost, IP Address:192.168.1.45". Pull the values into a
    // flat array we can compare with the current host IP list.
    const out = [];
    for (const piece of raw.split(',')) {
      const trimmed = piece.trim();
      const colon = trimmed.indexOf(':');
      if (colon < 0) continue;
      out.push(trimmed.slice(colon + 1).trim());
    }
    return out;
  } catch {
    return [];
  }
}

async function generateTlsBundle(ips) {
  // Always include localhost + 127.0.0.1 + ::1 so the cert is usable
  // for local development and for the `curl --resolve` debugging
  // workflow even before the user knows their LAN IP.
  const altNames = [
    { type: 7, ip: '127.0.0.1' },
    { type: 2, value: 'localhost' },
  ];
  for (const ip of ips) {
    if (ip === '127.0.0.1') continue;
    altNames.push({ type: 7, ip });
  }

  const notBefore = new Date();
  const notAfter = new Date(notBefore.getTime() + SYNC_TLS_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  // `selfsigned@5` returns a Promise — be sure to await.
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: `${APP_NAME} sync` }],
    {
      algorithm: 'sha256',
      keySize: 2048,
      notBeforeDate: notBefore,
      notAfterDate: notAfter,
      extensions: [
        // basicConstraints: leaf cert (CA:FALSE) is the default for
        // selfsigned but be explicit so we don't accidentally issue a
        // CA cert if defaults change.
        { name: 'basicConstraints', cA: false },
        { name: 'subjectAltName', altNames },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
      ],
    },
  );

  const bundle = {
    version: 1,
    key: pems.private,
    cert: pems.cert,
    sans: ips.slice(),
    generatedAt: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
    fingerprint: computeFingerprint(pems.cert),
  };
  writeTlsBundle(bundle);
  return bundle;
}

/**
 * Load the stored TLS bundle, regenerating it lazily when necessary.
 * Regeneration triggers:
 *   - No file on disk yet (first run after enabling sync)
 *   - Cert expired or within {@link SYNC_TLS_RENEW_THRESHOLD_DAYS} of expiry
 *   - Any current LAN IP is not present in the cert's SAN list (the
 *     user moved networks or got a new DHCP lease — the old cert would
 *     produce a hostname-mismatch warning every time)
 */
async function ensureTlsBundle() {
  const ips = localIPv4Addresses();
  const existing = readTlsBundle();

  const now = Date.now();
  const renewByMs = SYNC_TLS_RENEW_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  if (existing) {
    const notAfter = Date.parse(existing.notAfter || '');
    const expiringSoon = Number.isFinite(notAfter) && notAfter - now < renewByMs;
    const sans = listCertSans(existing.cert);
    // Some browsers (esp. iOS Safari) require the IP itself, not the
    // hostname, to appear as an IP-type SAN. We compare textual values
    // since `listCertSans` already flattens "IP Address:..." → "...".
    const missingIp = ips.some((ip) => ip !== '127.0.0.1' && !sans.includes(ip));

    if (!expiringSoon && !missingIp) {
      // Still valid and the SAN list covers every detected interface.
      return existing;
    }

    console.log(
      `[cadence] regenerating sync TLS cert (expiringSoon=${expiringSoon}, missingIp=${missingIp})`,
    );
  }

  return await generateTlsBundle(ips);
}

// CORS for the /v1/ API. We deliberately do NOT use a wildcard origin: per
// fetch-spec, "Access-Control-Allow-Origin: *" combined with the
// Authorization header is rejected by browsers, AND a wildcard would let any
// website on the public web pivot through the user's browser into the LAN
// server. We echo the requesting Origin only when it looks like a same-LAN
// caller (a private IP, localhost, or http://<our-host>:<our-port>). Other
// origins get no CORS at all, which the browser interprets as opaque /
// blocked. The PWA-on-host trick (the same Node server serves the PWA bundle)
// makes Origin and Host match, so the legitimate case still works.
function applyApiCors(req, res) {
  const origin = req.headers['origin'];
  if (origin && isTrustworthyLanOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, If-Match, If-None-Match',
    );
    // Browsers hide unknown response headers from JS unless we ask for
    // them by name — without this the client can't read ETag back.
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
}

function isTrustworthyLanOrigin(origin) {
  let u;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname;
  if (!h) return false;
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return true;
  // RFC1918 private + link-local + carrier-grade-NAT ranges.
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^fe80::/i.test(h)) return true;
  // mDNS .local hostnames published by Bonjour/Avahi
  if (/\.local$/i.test(h)) return true;
  return false;
}

// Validate the `Host` header to defeat DNS rebinding. A browser that has been
// tricked into thinking `evil.com:9787` resolves to our LAN IP will still
// send `Host: evil.com:9787` — we reject anything that isn't a private IP /
// localhost / .local hostname.
function isTrustworthyHostHeader(req) {
  const hostHeader = req.headers['host'];
  if (!hostHeader) return false;
  // Strip port; "192.168.1.5:9787" → host "192.168.1.5".
  const host = hostHeader.split(':')[0];
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^fe80::/i.test(host)) return true;
  if (/\.local$/i.test(host)) return true;
  return false;
}

// Constant-time comparison of two Bearer tokens. Plain `===` exits on the
// first differing byte, leaking the prefix length to a timing-side-channel
// attacker on the same LAN. `crypto.timingSafeEqual` requires equal-length
// buffers, so we pad/length-check first.
function safeEqualToken(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Shape-validate the JSON we accept on POST /v1/snapshot. We DO NOT reject
// fields we don't recognise (so we don't break forward-compatibility), but
// we DO require the discriminator fields a legitimate Cadence client would
// always send. Anything else is rejected before it touches the data writer.
// ---------- Sync server: PWA static-asset helper -----------------------------
//
// We also serve the bundled PWA from the same port so a mobile device on the
// same Wi-Fi can open `http://<host-ip>:9787/` directly and use the app over
// plain HTTP. This sidesteps the mixed-content rule that blocks fetches from
// https://*.github.io to http://<lan-ip>:9787 — a frequent first-time-use
// failure mode.
//
// Security note: only static asset bytes from the bundled `dist/` folder are
// served. The token-protected `/v1/snapshot` endpoint is the only data path.

const STATIC_DIR = path.join(__dirname, '..', 'dist');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function safeJoinUnderStatic(reqPath) {
  // Strip query, decode, and protect against path-traversal. Anything that
  // would escape STATIC_DIR returns null so the caller can 404.
  let rel;
  try {
    rel = decodeURIComponent(reqPath.split('?')[0]);
  } catch {
    return null;
  }
  if (!rel || rel === '/') rel = '/index.html';
  if (rel.startsWith('/')) rel = rel.slice(1);
  const abs = path.normalize(path.join(STATIC_DIR, rel));
  if (!abs.startsWith(STATIC_DIR + path.sep) && abs !== STATIC_DIR) return null;
  return abs;
}

function serveStaticAsset(req, res) {
  // SPA fallback: anything that isn't a known asset returns index.html so the
  // React router can pick up deep links.
  const reqPath = (req.url || '/').split('?')[0];
  let abs = safeJoinUnderStatic(reqPath);
  if (!abs) {
    res.statusCode = 400;
    res.end('bad path');
    return;
  }
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isFile()) {
    // Fallback to index.html (SPA).
    abs = path.join(STATIC_DIR, 'index.html');
    try {
      stat = fs.statSync(abs);
    } catch {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Bundled PWA not found. Run `npm run build:pwa` first.');
      return;
    }
  }
  const ext = path.extname(abs).toLowerCase();
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  // Defensive: Vite emits <script type="module" crossorigin> and
  // <link rel="modulepreload" crossorigin> in the production HTML, which
  // makes browsers fetch those bytes in CORS mode even for same-origin
  // URLs. Some Safari versions over self-signed HTTPS have been observed
  // refusing such loads without ACAO. Safe to be `*` — no static asset is
  // privileged; the token-protected /v1/* endpoints set their own CORS
  // rules separately.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  // Pipe the file so large assets (vendor-react) stream instead of buffering.
  const stream = fs.createReadStream(abs);
  stream.on('error', () => {
    res.statusCode = 500;
    res.end();
  });
  stream.pipe(res);
}

async function startSyncServer(port = SYNC_DEFAULT_PORT) {
  if (syncServer) {
    return { ok: true, port: syncBoundPort, fingerprint: syncTlsFingerprint };
  }
  const cfg = readSyncConfig();
  if (!cfg.enabled || !cfg.token) {
    return { ok: false, error: 'Sync is not enabled.' };
  }

  // Load or lazily generate the TLS material. This is an awaited call
  // up front so that if anything goes wrong (e.g. disk full, key gen
  // failure) we surface the error to the renderer instead of leaving
  // the user with a half-started server.
  let tlsBundle;
  try {
    tlsBundle = await ensureTlsBundle();
  } catch (err) {
    console.error('[cadence] sync TLS bundle generation failed', err);
    return { ok: false, error: `TLS certificate setup failed: ${err.message || err}` };
  }
  syncTlsFingerprint = tlsBundle.fingerprint || null;
  syncTlsNotAfter = tlsBundle.notAfter || null;

  return await new Promise((resolve, reject) => {
    const requestHandler = (req, res) => {
      // Defense in depth #1: DNS-rebinding guard. A browser that has been
      // tricked into resolving `attacker.com` to our LAN IP will send the
      // attacker's hostname in `Host:`. Anything that isn't a private IP /
      // localhost / .local hostname is bounced before we look at the route.
      if (!isTrustworthyHostHeader(req)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Forbidden: invalid host header.');
        return;
      }

      const url = new URL(req.url, `https://${req.headers.host}`);
      const isApi = url.pathname.startsWith('/v1/');

      // CORS only applies to the /v1/ API. Static assets are GET-only and
      // don't need CORS at all (the PWA bundle is served same-origin from
      // here, and any other consumer is non-browser anyway).
      if (isApi) applyApiCors(req, res);

      if (req.method === 'OPTIONS') {
        res.statusCode = isApi ? 204 : 405;
        res.end();
        return;
      }

      // Unauthenticated reachability probe. Intentionally minimal so we
      // don't fingerprint our exact version to anyone who can talk to us.
      // The token-bearing client gets richer info elsewhere if it wants.
      //
      // Name compat: we emit the new `cadence-sync` identifier going
      // forward; the client (Settings.tsx) still accepts the legacy
      // `leeadman-sync` value from peers that haven't been upgraded yet.
      if (url.pathname === '/v1/ping' && req.method === 'GET') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, name: SYNC_FINGERPRINT }));
        return;
      }

      // Token-protected API surface.
      if (isApi) {
        const auth = req.headers['authorization'] || '';
        const prefix = 'Bearer ';
        const received = auth.startsWith(prefix) ? auth.slice(prefix.length) : '';
        if (!safeEqualToken(received, cfg.token)) {
          // Tiny constant-time jitter (~ a few ms) so 401s aren't faster
          // than 200s by an attacker-measurable margin.
          setTimeout(() => {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'unauthorised' }));
          }, 5);
          return;
        }
        const uid = readSessionUserId();
        if (!uid) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'no active session on host' }));
          return;
        }

        if (url.pathname === '/v1/snapshot' && req.method === 'GET') {
          const data = readUserData(uid);
          // ETag computed from the serialized payload — same bytes the
          // client will receive. This way two clients can compare ETags
          // without separately running the same hash on their copies.
          // We trim to 16 hex chars (64 bits) — collision-resistant
          // enough for a per-user dataset that gets one write per save.
          const dataJson = JSON.stringify({ ok: true, data });
          const etag = `"${crypto
            .createHash('sha256')
            .update(dataJson)
            .digest('hex')
            .slice(0, 16)}"`;

          // `If-None-Match`: client is asking "is anything new since I
          // last pulled?" — if our hash matches, return 304 with no
          // body. This is what lets the PWA's auto-pull on focus stay
          // cheap when nothing actually changed.
          const ifNoneMatch = req.headers['if-none-match'];
          if (ifNoneMatch && ifNoneMatch === etag) {
            res.statusCode = 304;
            res.setHeader('ETag', etag);
            res.end();
            return;
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('ETag', etag);
          res.end(JSON.stringify({ ok: true, ts: new Date().toISOString(), etag, data }));
          return;
        }

        if (url.pathname === '/v1/attachments/manifest' && req.method === 'GET') {
          const ids = listAttachmentIdsOnDisk(uid);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, ids }));
          return;
        }

        const attGet = url.pathname.match(/^\/v1\/attachments\/([^/]+)$/);
        if (attGet && req.method === 'GET') {
          const attId = sanitizeAttachmentId(decodeURIComponent(attGet[1]));
          if (!attId) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'invalid attachment id' }));
            return;
          }
          const bytes = readAttachmentBytes(uid, attId);
          if (!bytes?.length) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'not found' }));
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', detectAttachmentMime(bytes));
          res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
          res.end(bytes);
          return;
        }

        if (attGet && req.method === 'POST') {
          const attId = sanitizeAttachmentId(decodeURIComponent(attGet[1]));
          if (!attId) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'invalid attachment id' }));
            return;
          }
          const chunks = [];
          let total = 0;
          let oversized = false;
          req.on('data', (c) => {
            if (oversized) return;
            total += c.length;
            if (total > 3 * 1024 * 1024) {
              oversized = true;
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'attachment too large' }));
              req.destroy();
              return;
            }
            chunks.push(c);
          });
          req.on('end', () => {
            if (oversized) return;
            const buffer = Buffer.concat(chunks);
            if (!buffer.length) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'empty body' }));
              return;
            }
            const ct = String(req.headers['content-type'] || 'image/webp');
            const writeRes = writeAttachmentBytes(uid, attId, buffer, ct);
            res.statusCode = writeRes.ok ? 200 : 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(writeRes));
          });
          return;
        }

        if (url.pathname === '/v1/snapshot' && req.method === 'POST') {
          const chunks = [];
          let total = 0;
          let oversized = false;
          req.on('data', (c) => {
            if (oversized) return;
            total += c.length;
            if (total > 25 * 1024 * 1024) {
              // Tell the client EXACTLY why we hung up — without a 413,
              // browsers just see a connection reset and the user sees a
              // useless "Pull failed: socket hang up". Once we've written
              // the response we destroy the request so we stop allocating
              // memory for further chunks.
              oversized = true;
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  ok: false,
                  error: 'payload too large; max 25 MB. Compact your workspace or sync less data per push.',
                }),
              );
              req.destroy();
              return;
            }
            chunks.push(c);
          });
          req.on('end', () => {
            if (oversized) return;
            try {
              const body = Buffer.concat(chunks).toString('utf8');
              const parsed = JSON.parse(body);
              // Accept both `{ data: AppData }` (what our client sends) and a
              // bare AppData object (legacy / curl-friendly).
              const payload = parsed && typeof parsed === 'object' && parsed.data ? parsed.data : parsed;
              if (!isValidSnapshotPayload(payload)) {
                res.statusCode = 422;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    ok: false,
                    error:
                      'payload rejected: snapshot must include version and at least one workspace collection array',
                  }),
                );
                return;
              }
              const coerced = { ...payload };
              for (const key of ['teams', 'people', 'items', 'todoGroups', 'todoItems', 'notes']) {
                if (!Array.isArray(coerced[key])) coerced[key] = [];
              }

              // Optimistic concurrency: if the client sent an `If-Match`
              // header, it's telling us "I started with this version of
              // the workspace — only accept my push if nothing else has
              // changed since". If the current host snapshot has a
              // different ETag we refuse with 412 so the client can
              // pull + merge instead of blindly stomping on whichever
              // device wrote last. Clients that don't send the header
              // get the old behaviour (last-write-wins) for back-compat.
              const ifMatch = req.headers['if-match'];
              if (ifMatch) {
                const current = readUserData(uid);
                const currentJson = JSON.stringify({ ok: true, data: current });
                const currentEtag = `"${crypto
                  .createHash('sha256')
                  .update(currentJson)
                  .digest('hex')
                  .slice(0, 16)}"`;
                if (currentEtag !== ifMatch) {
                  res.statusCode = 412;
                  res.setHeader('Content-Type', 'application/json');
                  res.setHeader('ETag', currentEtag);
                  res.end(
                    JSON.stringify({
                      ok: false,
                      error:
                        'host has newer changes since you pulled — pull again, reapply your edits, then push.',
                      currentEtag,
                    }),
                  );
                  return;
                }
              }

              const writeRes = commitUserData(uid, coerced);
              if (writeRes.ok) {
                try {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('data:remoteUpdated', {
                      writeGeneration: writeRes.writeGeneration,
                    });
                  }
                } catch {
                  /* best effort */
                }
              }
              // Always return the post-write ETag so the client can stop
              // tracking the previous one (otherwise a successful push
              // followed by another push would 412 against itself).
              const postData = writeRes.ok ? readUserData(uid) : coerced;
              const newJson = JSON.stringify({ ok: true, data: postData });
              const newEtag = `"${crypto
                .createHash('sha256')
                .update(newJson)
                .digest('hex')
                .slice(0, 16)}"`;
              res.statusCode = writeRes.ok ? 200 : 500;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('ETag', newEtag);
              res.end(JSON.stringify({ ...writeRes, etag: newEtag }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'invalid payload' }));
            }
          });
          return;
        }

        // Unknown /v1/* path
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }

      // Everything else: serve the bundled PWA (SPA fallback to index.html).
      // The PWA only needs GET requests; reject other verbs cleanly.
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET, HEAD, OPTIONS');
        res.end();
        return;
      }
      serveStaticAsset(req, res);
    };

    const server = https.createServer(
      {
        key: tlsBundle.key,
        cert: tlsBundle.cert,
        // Force a modern handshake. Older protocols are turned off so
        // the user is never *quietly* sniffable even if their phone /
        // OS still supports them. iOS 13+, Android 9+, Chrome / Firefox
        // / Safari all default to TLS 1.2+, so this isn't a compat
        // hazard in practice.
        minVersion: 'TLSv1.2',
      },
      requestHandler,
    );

    server.on('error', (err) => {
      console.error('[cadence] sync server error', err);
      reject(err);
    });
    // Bind on all interfaces so phones on the LAN can reach us. The
    // bound port is reported back so the renderer can show it (we let
    // the OS pick a fallback when the requested port is busy).
    server.listen(port, '0.0.0.0', () => {
      syncServer = server;
      syncBoundPort = server.address().port;
      resolve({
        ok: true,
        port: syncBoundPort,
        fingerprint: syncTlsFingerprint,
        notAfter: syncTlsNotAfter,
      });
    });
  });
}

function stopSyncServer() {
  return new Promise((resolve) => {
    if (!syncServer) {
      resolve({ ok: true });
      return;
    }
    const s = syncServer;
    syncServer = null;
    syncBoundPort = null;
    syncTlsFingerprint = null;
    syncTlsNotAfter = null;
    s.close(() => resolve({ ok: true }));
  });
}

function readAuth() {
  return readJsonSafe(authPath(), null);
}

function readSessionUserId() {
  const o = readJsonSafe(sessionPath(), null);
  if (!o || typeof o.userId !== 'string' || !o.userId) return null;
  return o.userId;
}

function writeSession(userId) {
  return writeJsonSafe(sessionPath(), { userId });
}

function clearSession() {
  try {
    const p = sessionPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

function readAccounts() {
  const o = readJsonSafe(accountsPath(), { users: [] });
  return { users: Array.isArray(o?.users) ? o.users : [] };
}

function writeAccounts(data) {
  return writeJsonSafe(accountsPath(), data);
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

// ---------- Window -------------------------------------------------------------

function createWindow() {
  // In packaged builds electron-builder bakes the platform-specific icon
  // (`.icns` / `.ico`) into the bundle, so the OS uses it everywhere
  // automatically. In dev mode there's no bundle — Electron would fall
  // back to its default globe icon for the window's title-bar / taskbar
  // entry unless we point it at our PNG explicitly.
  const devIconPath = path.join(__dirname, '..', 'build', 'icon.png');
  const devIcon = fs.existsSync(devIconPath) ? devIconPath : undefined;

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 880,
    minHeight: 560,
    title: 'Cadence',
    backgroundColor: '#0b0b10',
    show: false,
    autoHideMenuBar: false,
    icon: devIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // Show only when the renderer has painted to avoid white flashes.
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open any target=_blank / external link in the user's default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Block in-app navigations to anything other than our origin / dev URL.
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const allowed = process.env.VITE_DEV_SERVER_URL;
    if (allowed && targetUrl.startsWith(allowed)) return;
    if (targetUrl.startsWith('file://')) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(targetUrl)) {
      shell.openExternal(targetUrl);
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    // Dev convenience: log every renderer load failure to the main-process
    // console so a "stuck on blank window" symptom always has a paper trail
    // visible in the terminal that started `npm run dev`. Without this the
    // user sees a black window and has to manually pop DevTools to figure
    // out whether Vite is even reachable.
    mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedURL) => {
      console.error(LOG_TAG, 'renderer failed to load', { errorCode, errorDesc, validatedURL });
    });
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      console.error(LOG_TAG, 'renderer process gone', details);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.once('did-finish-load', () => {
    flushPendingDeepLink();
  });

  attachWindowCloseHandler(mainWindow);
}

// ---------- Application menu (English) -----------------------------------------

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const appName = app.name || 'Cadence';

  const template = [
    ...(isMac
      ? [
          {
            label: appName,
            submenu: [
              { role: 'about', label: `About ${appName}` },
              { type: 'separator' },
              {
                label: 'Check for Updates…',
                click: () => {
                  // Funnel through `runUpdateCheck` so the policy guard
                  // applies here too — otherwise an enterprise build with
                  // `updateCheck=false` could still hit GitHub via the
                  // macOS app menu.
                  void runUpdateCheck('menu', { force: true });
                },
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide', label: `Hide ${appName}` },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit', label: `Quit ${appName}` },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close', label: 'Close Window' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
            ]
          : [
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' },
            ]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' },
            ]
          : [{ role: 'close' }]),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'User guide',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || mainWindow;
            if (!win) return;
            const url = win.webContents.getURL();
            const base = url.split('#')[0];
            void win.loadURL(`${base}#/guide`);
          },
        },
        {
          label: 'Project on GitHub',
          click: () => {
            shell.openExternal('https://github.com/sercancelenk/cadence');
          },
        },
        {
          label: 'Report an Issue',
          click: () => {
            shell.openExternal('https://github.com/sercancelenk/cadence/issues/new');
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- Auto-update --------------------------------------------------------

let updaterInstance = null;
let lastUpdaterEvent = null;

// ---- Auto-update scheduling --------------------------------------------
//
// We trigger an update probe in four situations:
//
//   1. ~15 s after app launch (first-paint settled).
//   2. Every 6 h while the app stays open (`PERIODIC_CHECK_INTERVAL_MS`).
//   3. When a window regains focus AND ≥ 2 h since the last successful
//      check (`FOCUS_CHECK_MIN_GAP_MS`). Catches "laptop was asleep for
//      8 h, user just came back" without spamming on every focus flip.
//   4. Settings → "Check for updates" button (manual, bypasses gates).
//
// Every automatic trigger goes through `runUpdateCheck(reason, opts)`,
// which applies:
//   - `THROTTLE_MIN_GAP_MS` (30 min) so no two automatic checks land
//     closer together than that, even across triggers.
//   - Online gate (`navigator.onLine`-equivalent via `net.isOnline()`).
//   - Persistent `lastCheckedAt` in the user-data dir, so a quit /
//     relaunch within 30 min doesn't re-check.
//
// The manual Settings button passes `{ force: true }` and is free of
// the throttle / interval logic — the user explicitly asked.

const STARTUP_CHECK_DELAY_MS = 15 * 1000;
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FOCUS_CHECK_MIN_GAP_MS = 2 * 60 * 60 * 1000;
const THROTTLE_MIN_GAP_MS = 30 * 60 * 1000;

let updateCheckTimer = null;
let updateCheckInFlight = false;

function updateStateFilePath() {
  return path.join(app.getPath('userData'), UPDATE_STATE_FILENAME);
}

function readLastUpdateCheckAt() {
  try {
    const raw = fs.readFileSync(updateStateFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const v = parsed && typeof parsed.lastCheckedAt === 'number' ? parsed.lastCheckedAt : 0;
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function writeLastUpdateCheckAt(ts) {
  try {
    const dir = app.getPath('userData');
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists */ }
    fs.writeFileSync(updateStateFilePath(), JSON.stringify({ lastCheckedAt: ts }));
  } catch (err) {
    // Non-fatal: throttle just degrades to "ask every time" until next
    // successful write. We deliberately don't crash on a writable-FS
    // hiccup here.
    console.warn('[cadence] could not persist update-check state', err);
  }
}

function isOnlineForUpdateCheck() {
  try {
    // `net.isOnline()` (Electron 19+) consults the OS's network stack
    // rather than just inspecting whether an interface exists. We fall
    // through to `true` if the API isn't available so older builds keep
    // the old "try anyway" behaviour.
    const { net } = require('electron');
    if (net && typeof net.isOnline === 'function') return !!net.isOnline();
  } catch { /* ignore */ }
  return true;
}

function broadcastUpdaterEvent(event) {
  lastUpdaterEvent = event;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:event', event);
    }
  }
}

/**
 * Single entry-point for all auto-update probes.
 *
 * @param {string} reason  short label for logs ("launch", "periodic",
 *                         "focus", "manual"). Helps when reading the
 *                         devtools console of a deployed build.
 * @param {{ force?: boolean, minGapMs?: number }} [opts]
 *        - `force: true`     skips the throttle. Used by the Settings
 *                            button so the user always sees a fresh
 *                            answer.
 *        - `minGapMs`        overrides `THROTTLE_MIN_GAP_MS` (focus
 *                            uses 2 h instead of 30 min so a focus
 *                            check that lands inside the throttle
 *                            window still no-ops).
 * @returns {Promise<{ ok: boolean, skipped?: string }>}
 */
async function runUpdateCheck(reason, opts = {}) {
  // Defence in depth: policy or enterprise build may forbid hitting the
  // GitHub Releases endpoint. The renderer hides the "Check for updates"
  // button when `features.updateCheck` is false, but the periodic
  // background timer below also calls this function — and so does the
  // OS-level "Check for Updates…" menu item — so we must refuse here
  // too. Air-gapped enterprise deployments rely on this.
  if (!isFeatureAllowed('updateCheck')) {
    console.log(`[cadence] skip update check (${reason}): disabled by policy`);
    return { ok: false, skipped: 'policy' };
  }
  const u = getAutoUpdater();
  if (!u) return { ok: false, skipped: 'no-updater' };
  if (updateCheckInFlight) return { ok: false, skipped: 'in-flight' };

  const now = Date.now();
  if (!opts.force) {
    if (!isOnlineForUpdateCheck()) {
      console.log(`[cadence] skip update check (${reason}): offline`);
      return { ok: false, skipped: 'offline' };
    }
    const last = readLastUpdateCheckAt();
    const gap = opts.minGapMs ?? THROTTLE_MIN_GAP_MS;
    if (last && now - last < gap) {
      const mins = Math.round((gap - (now - last)) / 60000);
      console.log(`[cadence] skip update check (${reason}): throttled (${mins} min remaining)`);
      return { ok: false, skipped: 'throttled' };
    }
  }

  updateCheckInFlight = true;
  console.log(`[cadence] update check (${reason})`);
  // Stamp BEFORE the await so a slow check still occupies its throttle
  // window. If the check throws we restore `prev` in the catch so the
  // next legitimate check isn't penalised by a failed one.
  const prev = readLastUpdateCheckAt();
  writeLastUpdateCheckAt(now);
  try {
    await u.checkForUpdatesAndNotify();
    return { ok: true };
  } catch (err) {
    console.error(`[cadence] update check (${reason}) failed`, err);
    try { writeLastUpdateCheckAt(prev); } catch { /* ignore */ }
    return { ok: false, skipped: 'error' };
  } finally {
    updateCheckInFlight = false;
  }
}

function getAutoUpdater() {
  if (updaterInstance) return updaterInstance;
  if (!app.isPackaged) return null;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      broadcastUpdaterEvent({ status: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
      broadcastUpdaterEvent({
        status: 'available',
        version: info && typeof info.version === 'string' ? info.version : undefined,
        releaseDate: info && typeof info.releaseDate === 'string' ? info.releaseDate : undefined,
      });
    });
    autoUpdater.on('update-not-available', (info) => {
      broadcastUpdaterEvent({
        status: 'not-available',
        version: (info && typeof info.version === 'string' ? info.version : undefined) || app.getVersion(),
      });
    });
    autoUpdater.on('download-progress', (p) => {
      broadcastUpdaterEvent({
        status: 'downloading',
        percent: typeof p?.percent === 'number' ? p.percent : 0,
        transferred: typeof p?.transferred === 'number' ? p.transferred : 0,
        total: typeof p?.total === 'number' ? p.total : 0,
        bytesPerSecond: typeof p?.bytesPerSecond === 'number' ? p.bytesPerSecond : 0,
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      broadcastUpdaterEvent({
        status: 'downloaded',
        version: info && typeof info.version === 'string' ? info.version : undefined,
      });
    });
    autoUpdater.on('error', (err) => {
      console.error('[cadence] autoUpdater error', err);
      broadcastUpdaterEvent({
        status: 'error',
        message: err && typeof err.message === 'string' ? err.message : String(err),
      });
    });

    updaterInstance = autoUpdater;
    return autoUpdater;
  } catch (err) {
    console.error('[cadence] electron-updater unavailable', err);
    return null;
  }
}

function setupAutoUpdater() {
  const u = getAutoUpdater();
  if (!u) return;

  // 1) Initial check, after a short delay so first paint and IPC handshake
  //    settle. 15 s is the "long enough to be invisible, short enough that
  //    a user who launched specifically to update still gets it before
  //    closing again" sweet spot used by VS Code / Notion.
  setTimeout(() => {
    runUpdateCheck('launch').catch(() => { /* logged inside */ });
  }, STARTUP_CHECK_DELAY_MS);

  // 2) Periodic check while the app stays open. 6 h covers a typical
  //    workday with a single morning + afternoon poll. Slack uses 24 h,
  //    Spotify ~4 h; 6 h sits in the middle and respects long-running
  //    macOS sessions where people never quit.
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  updateCheckTimer = setInterval(() => {
    runUpdateCheck('periodic').catch(() => { /* logged inside */ });
  }, PERIODIC_CHECK_INTERVAL_MS);

  // 3) Focus-based "came back from sleep / background" check. We use the
  //    raised gap (`FOCUS_CHECK_MIN_GAP_MS`, 2 h) instead of the default
  //    throttle here because focus events fire on every alt-tab — we
  //    only care about returning from a genuine away period.
  app.on('browser-window-focus', () => {
    runUpdateCheck('focus', { minGapMs: FOCUS_CHECK_MIN_GAP_MS }).catch(() => { /* logged inside */ });
  });
}

// Coordinated quit: ask renderer to flush debounced saves before teardown.
let appQuittingConfirmed = false;
/** While set, renderer saves are deferred (import/replace on main process). */
let workspaceImportLockUid = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let pendingQuitFlushTimeout = null;

function finishAppQuit() {
  if (appQuittingConfirmed) return;
  appQuittingConfirmed = true;
  if (pendingQuitFlushTimeout) {
    clearTimeout(pendingQuitFlushTimeout);
    pendingQuitFlushTimeout = null;
  }
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
  markQuitting();
  destroyTray();
  stopReminderSync();
  void stopSyncServer();
  app.quit();
}

function requestRendererFlushBeforeQuit() {
  if (appQuittingConfirmed) return;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:request-flush');
    }
  } catch (err) {
    console.warn('[cadence] app:request-flush failed', err);
    finishAppQuit();
    return;
  }
  if (pendingQuitFlushTimeout) clearTimeout(pendingQuitFlushTimeout);
  pendingQuitFlushTimeout = setTimeout(() => finishAppQuit(), 8000);
}

ipcMain.on('app:flush-done', () => {
  finishAppQuit();
});

app.on('before-quit', (event) => {
  if (appQuittingConfirmed) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    event.preventDefault();
    requestRendererFlushBeforeQuit();
    return;
  }
  finishAppQuit();
});

// ---------- IPC: data ----------------------------------------------------------

function measurePayloadBytes(payload) {
  try {
    return Buffer.byteLength(JSON.stringify(payload ?? {}), 'utf8');
  } catch {
    return Infinity;
  }
}

/**
 * Shared save path for async IPC and synchronous flush-on-quit.
 * @returns {{ ok: true; writeGeneration?: number } | { ok: false; reason?: string; error?: string; writeGeneration?: number }}
 */
function executeDataSave(payload, expectedUid, expectedGeneration, { notifyRenderer = true } = {}) {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, reason: 'no-session' };

  if (measurePayloadBytes(payload) > MAX_SAVE_PAYLOAD_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      error: 'Workspace exceeds 25 MB. Compact attachments or archive old items before saving.',
    };
  }

  if (typeof expectedUid === 'string' && expectedUid && expectedUid !== uid) {
    console.warn(
      '[cadence] refusing data:save — session changed underneath the renderer',
      { expectedUid, currentUid: uid },
    );
    const rejected = {
      ok: false,
      reason: 'session-changed',
      error:
        'Your save was discarded because the active session changed between when you typed and when the save was committed. The data was NOT written under the wrong account.',
    };
    if (notifyRenderer && mainWindow) {
      try { mainWindow.webContents.send('data:saveError', rejected); } catch { /* ignore */ }
    }
    return rejected;
  }

  const metaPath = writeMetaPathForUser(uid);
  const meta = readWriteMeta(metaPath, fs);
  const resolvedGeneration = Math.max(meta.generation, readStoredWriteGeneration(uid));

  if (workspaceImportLockUid && workspaceImportLockUid === uid) {
    return {
      ok: false,
      reason: 'import-in-progress',
      writeGeneration: resolvedGeneration,
    };
  }

  if (!canCommitWriteGeneration(expectedGeneration, resolvedGeneration)) {
    console.warn('[cadence] refusing data:save — write generation conflict', {
      expectedGeneration,
      currentGeneration: resolvedGeneration,
      uid,
    });
    const conflict = {
      ok: false,
      reason: 'write-conflict',
      error:
        'Another save updated your data file before this one finished (for example LAN sync or a second app instance). Reload from disk or pull the latest snapshot, then retry your edits.',
      writeGeneration: resolvedGeneration,
    };
    // Stale renderer saves lose the race quietly — the IPC response carries
    // the current generation so the client can resync without alarming the user.
    return conflict;
  }

  const r = commitUserData(uid, payload);
  if (!r.ok && notifyRenderer && mainWindow) {
    try { mainWindow.webContents.send('data:saveError', r); } catch { /* ignore */ }
  }
  if (r.ok) {
    void syncRemindersFromAppData(payload, uid);
    return { ok: true, writeGeneration: r.writeGeneration };
  }
  return r;
}

ipcMain.handle('data:load', () => {
  const uid = readSessionUserId();
  if (!uid) return null;
  const data = readUserData(uid);
  if (data) flushPendingDeepLink();
  return data;
});

ipcMain.handle('data:save', (_evt, payload, expectedUid, expectedGeneration) => {
  return executeDataSave(payload, expectedUid, expectedGeneration);
});

/** Synchronous flush used by renderer `pagehide` / update install (blocks until fsync). */
ipcMain.on('data:flushSync', (event, { payload, expectedUid, expectedGeneration } = {}) => {
  event.returnValue = executeDataSave(payload, expectedUid, expectedGeneration, { notifyRenderer: false });
});

/**
 * Diagnostic load: same data as `data:load` but with metadata so the renderer
 * can distinguish "no file yet" from "file exists, can't decrypt". The legacy
 * `data:load` is kept for back-compat (returns null on any failure).
 */
ipcMain.handle('data:loadResult', () => {
  const uid = readSessionUserId();
  if (!uid) return { ok: true, data: null, reason: 'no-session', writeGeneration: 0 };
  const result = readUserDataResult(uid);
  const metaGen = readWriteMeta(writeMetaPathForUser(uid), fs).generation;
  const fileGen = typeof result.writeGeneration === 'number' ? result.writeGeneration : 0;
  return { ...result, writeGeneration: Math.max(metaGen, fileGen) };
});

// ---------- IPC: Backups & Recovery -----------------------------------------
//
// The user's data lives in `userData/cadence-data-<userId>.json`. In the
// past, a single-user `leeadman-data.json` (no userId) was also written by
// the pre-accounts and pre-rename builds. We also continuously snapshot
// the live file into `userData/backups/<userId>/` before every save,
// after every login, and on demand.
//
// These three handlers expose a tiny recovery API so a user can:
//   1. See every candidate data source on this machine.
//   2. Peek at its contents (encrypted ones are previewed only when the
//      current session key happens to decrypt them).
//   3. Replace the live data file with any chosen candidate.

/**
 * Inspect a single on-disk file and return safe metadata. Never throws.
 */
function inspectDataFile(filePath, uid) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    const text = fs.readFileSync(filePath, 'utf8');
    const encrypted = isEncryptedFile(text);
    let decryptable = !encrypted;
    let counts = null;
    let parsedOk = false;
    if (!encrypted) {
      try {
        const obj = JSON.parse(text);
        parsedOk = true;
        counts = summarizeAppData(workspaceForSummary(obj));
      } catch { /* parse fail */ }
    } else if (uid) {
      const key = dataKeys.get(uid);
      if (key) {
        const plain = decryptPayload(text, key);
        if (plain != null) {
          decryptable = true;
          try {
            const obj = JSON.parse(plain);
            parsedOk = true;
            counts = summarizeAppData(workspaceForSummary(obj));
          } catch { /* parse fail */ }
        }
      }
    }
    return {
      path: filePath,
      name: path.basename(filePath),
      bytes: stat.size,
      mtime: stat.mtime.toISOString(),
      encrypted,
      decryptable,
      parsedOk,
      counts,
    };
  } catch (err) {
    return { path: filePath, name: path.basename(filePath), error: String(err) };
  }
}

/**
 * Inspect the merged live workspace (base + monthly shards) for Settings recovery UI.
 */
function inspectLiveUserData(uid) {
  const basePath = dataPathForUser(uid);
  const shardPaths = listMonthlyShardPathsForUser(uid);
  if (!fs.existsSync(basePath) && shardPaths.length === 0) return null;

  let mtime = '';
  try {
    let maxMtime = 0;
    if (fs.existsSync(basePath)) maxMtime = Math.max(maxMtime, fs.statSync(basePath).mtimeMs);
    for (const { path: shardPath } of shardPaths) {
      if (fs.existsSync(shardPath)) maxMtime = Math.max(maxMtime, fs.statSync(shardPath).mtimeMs);
    }
    if (maxMtime) mtime = new Date(maxMtime).toISOString();
  } catch {
    /* ignore */
  }

  const result = readUserDataResult(uid);
  if (!result.ok) {
    const fallback = inspectDataFile(basePath, uid);
    if (fallback) {
      fallback.bytes = userDataFilesBytes(uid);
      fallback.sharded = shardPaths.length > 0;
      fallback.shardCount = shardPaths.length;
    }
    return fallback;
  }

  const counts = result.data ? summarizeAppData(result.data) : null;
  return {
    path: basePath,
    name: path.basename(basePath),
    bytes: userDataFilesBytes(uid),
    mtime,
    encrypted: !!result.encrypted,
    decryptable: true,
    parsedOk: !!result.data,
    counts,
    sharded: shardPaths.length > 0,
    shardCount: shardPaths.length,
  };
}

/**
 * Load a workspace from a backup base file plus any sibling monthly shard backups.
 */
function loadWorkspaceFromBackupSet(uid, backupPath) {
  const resolved = resolveBackupSetBasePath(backupPath, (dir) => fs.readdirSync(dir));
  if (!resolved.ok) return { ok: false, reason: 'invalid-backup', error: resolved.error };

  const baseBackupPath = resolved.basePath;
  const r = readParsedFile(uid, baseBackupPath);
  if (!r.ok) return r;

  const dir = path.dirname(baseBackupPath);
  const setKey = backupSnapshotKey(path.basename(baseBackupPath));
  /** @type {Array<{ notes: unknown[]; todoItems: unknown[]; items: unknown[] }>} */
  const shardPartials = [];

  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    return { ok: false, reason: 'io', error: String(err) };
  }

  for (const name of names) {
    if (name === path.basename(baseBackupPath)) continue;
    if (backupSnapshotKey(name) !== setKey) continue;
    if (!name.includes('-shard-')) continue;
    const sr = readParsedFile(uid, path.join(dir, name));
    if (!sr.ok) {
      console.warn('[cadence] skipping unreadable shard backup', name, sr.reason);
      continue;
    }
    shardPartials.push(unwrapShardPayload(sr.parsed));
  }

  return mergeWorkspaceFromBackupParts(r.parsed, shardPartials, unwrapStoredWorkspace);
}

function summarizeAppData(obj) {
  if (!obj || typeof obj !== 'object') return null;
  obj = workspaceForSummary(obj);
  if (!obj || typeof obj !== 'object') return null;
  // Pre-compute "archived" splits for todo groups so the Backups & Recovery
  // viewer can flag a backup that's already in the failure mode the user
  // reported (everything archived → looks empty in TodosPage). Lets the
  // user pick a snapshot from BEFORE the accidental archive ran.
  let todoGroupsArchived = 0;
  if (Array.isArray(obj.todoGroups)) {
    for (const g of obj.todoGroups) {
      if (g && typeof g === 'object' && g.archived) todoGroupsArchived += 1;
    }
  }
  // Locked-vs-unlocked notes split has the same diagnostic value (notesLock
  // orphan = "I can't see my notes because the app keeps asking me for a
  // passphrase that no longer unlocks anything"). We surface both counts.
  let notesLocked = 0;
  if (Array.isArray(obj.notes)) {
    for (const n of obj.notes) {
      if (n && typeof n === 'object' && n.locked) notesLocked += 1;
    }
  }
  return {
    teams: Array.isArray(obj.teams) ? obj.teams.length : 0,
    people: Array.isArray(obj.people) ? obj.people.length : 0,
    items: Array.isArray(obj.items) ? obj.items.length : 0,
    todoGroups: Array.isArray(obj.todoGroups) ? obj.todoGroups.length : 0,
    todoGroupsArchived,
    todoItems: Array.isArray(obj.todoItems) ? obj.todoItems.length : 0,
    notes: Array.isArray(obj.notes) ? obj.notes.length : 0,
    notesLocked,
    hasNotesLock: obj.notesLock && typeof obj.notesLock === 'object' ? true : false,
    lastTeamId: typeof obj.lastTeamId === 'string' ? obj.lastTeamId : undefined,
    profileName: obj.profile && typeof obj.profile.displayName === 'string' ? obj.profile.displayName : undefined,
  };
}

/**
 * List candidate data sources: live, legacy, and all rolling backups for the
 * signed-in user. Designed for a recovery UI in Settings.
 */
ipcMain.handle('data:listSources', () => {
  const uid = readSessionUserId();
  const userData = app.getPath('userData');
  const out = {
    userDataPath: userData,
    uid,
    live: null,
    legacy: null,
    backups: [],
    otherUsers: [],
  };

  if (uid) {
    out.live = inspectLiveUserData(uid);
    const backupsDir = backupsDirForUser(uid);
    if (fs.existsSync(backupsDir)) {
      try {
        const entries = fs
          .readdirSync(backupsDir)
          .filter((n) => n.endsWith('.json') && !isMonthlyShardBackupFilename(n))
          .map((n) => inspectDataFile(path.join(backupsDir, n), uid))
          .filter(Boolean)
          .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
        out.backups = entries;
      } catch (err) {
        console.warn('[cadence] listSources backups failed', err);
      }
    }
  }

  out.legacy = inspectDataFile(legacyDataPath(), null);

  // Surface other per-user files so an admin/user can spot orphaned data files
  // from a previous account UUID (very common after registering twice). We
  // accept BOTH the new `cadence-data-*.json` filenames and the legacy
  // `leeadman-data-*.json` ones so a pre-migration file lying around in the
  // userData dir (e.g. a manually copied backup) still shows up here.
  const ORPHAN_RE = new RegExp(
    `^(?:${DATA_FILE_PREFIX}|${DATA_FILE_PREFIX_LEGACY})-data-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\\.json$`,
    'i',
  );
  try {
    for (const name of fs.readdirSync(userData)) {
      const m = name.match(ORPHAN_RE);
      if (!m) continue;
      if (uid && m[1] === uid) continue;
      const info = inspectDataFile(path.join(userData, name), m[1]);
      if (info) out.otherUsers.push(info);
    }
  } catch (err) {
    console.warn(LOG_TAG, 'listSources otherUsers failed', err);
  }

  return out;
});

/**
 * Decrypt-and-preview a specific file by absolute path, scoped to userData/.
 * Returns a tiny human-readable peek so the user can decide what to restore.
 */
ipcMain.handle('data:previewSource', (_evt, { filePath } = {}) => {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'filePath required' };
  const userData = app.getPath('userData');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(userData))) {
    return { ok: false, error: 'Refusing to read outside userData.' };
  }
  const uid = readSessionUserId();
  const info = inspectDataFile(resolved, uid);
  if (!info) return { ok: false, error: 'File not found.' };
  return { ok: true, info };
});

/**
 * Replace the signed-in user's live data file with the contents of `filePath`.
 * Always snapshots the *current* live file first so the operation is itself
 * undoable through the backups list.
 *
 * Encryption rules:
 *   - If the source is plaintext → re-encrypt under the current key.
 *   - If the source is encrypted with the *current* key → copy bytes verbatim.
 *   - If the source is encrypted but undecipherable here → refuse (cross-
 *     account restore is not supported; the user would lose the data).
 */
ipcMain.handle('data:restoreFromSource', (_evt, { filePath } = {}) => {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'filePath required' };

  const userData = app.getPath('userData');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(userData))) {
    return { ok: false, error: 'Refusing to read outside userData.' };
  }
  if (!fs.existsSync(resolved)) return { ok: false, error: 'File no longer exists.' };

  let payload;
  const loaded = loadWorkspaceFromBackupSet(uid, resolved);
  if (!loaded.ok) {
    if (loaded.reason === 'no-key') {
      return { ok: false, error: 'Session key missing. Please sign in again and retry.' };
    }
    if (loaded.reason === 'bad-key') {
      return {
        ok: false,
        error: 'This backup is encrypted but cannot be decrypted with your current password. It probably belongs to a different account.',
      };
    }
    return { ok: false, error: loaded.error || 'Could not read backup.' };
  }
  payload = loaded.workspace;

  // Snapshot the existing live file under a "pre-restore" label so the user
  // can undo the restore if they picked the wrong source.
  snapshotCurrentDataFile(uid, 'pre-restore');
  const attBackup = pairedAttachmentsBackupDir(resolved);
  if (attBackup) restoreAttachmentsFromBackupDir(uid, attBackup);
  const histBackup = pairedNoteHistoryBackupDir(resolved);
  if (histBackup) importNoteHistoryFromDir(uid, histBackup);
  workspaceImportLockUid = uid;
  try {
    const w = commitUserData(uid, payload, { allowOverwriteUnreadable: true });
    return w.ok ? { ok: true, restoredFrom: path.basename(resolved), writeGeneration: w.writeGeneration } : w;
  } finally {
    workspaceImportLockUid = null;
  }
});

/**
 * Open the userData folder in the OS file manager. Handy when the user wants
 * to copy a backup off to iCloud Drive / a USB stick.
 */
ipcMain.handle('data:openUserDataFolder', () => {
  shell.openPath(app.getPath('userData'));
  return { ok: true };
});

/**
 * Reveal a specific file (typically a backup) in Finder / Explorer / the
 * default file manager. Scoped to userData/ so a malicious renderer can't
 * use this to enumerate arbitrary disk paths. The user uses this when they
 * want to inspect a backup with a third-party tool (diff, jq, hex viewer)
 * before deciding to restore it.
 */
ipcMain.handle('data:revealInOS', (_evt, { filePath } = {}) => {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'filePath required' };
  const userData = app.getPath('userData');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(userData))) {
    return { ok: false, error: 'Refusing to reveal paths outside the app data folder.' };
  }
  if (!fs.existsSync(resolved)) return { ok: false, error: 'File no longer exists.' };
  try {
    shell.showItemInFolder(resolved);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ─── Storage & cache diagnostics ─────────────────────────────────────────
//
// The renderer Settings → "Storage & cache" card calls these to show the
// user how big their on-disk footprint is and (optionally) wipe Chromium's
// internal caches (HTTP / Code / GPU / Shader). User data — the encrypted
// AppData file, the backups folder, AI settings, account list — is NEVER
// touched by `cache:clearChromium`.

function dirSizeBytes(dirPath) {
  let total = 0;
  let files = 0;
  try {
    if (!fs.existsSync(dirPath)) return { bytes: 0, files: 0 };
    const stack = [dirPath];
    while (stack.length) {
      const cur = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(cur, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const p = path.join(cur, e.name);
        try {
          if (e.isDirectory()) {
            stack.push(p);
          } else if (e.isFile()) {
            const st = fs.statSync(p);
            total += st.size;
            files += 1;
          }
        } catch {
          // permission/race — skip
        }
      }
    }
  } catch {
    // best-effort; never crash the IPC
  }
  return { bytes: total, files };
}

function fileSizeBytes(filePath) {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() ? st.size : 0;
  } catch {
    return 0;
  }
}

function chromiumCacheDirs() {
  // The exact set of Chromium-managed cache folders varies slightly across
  // platforms and Electron versions. We enumerate the common ones and let
  // the size calc silently skip what doesn't exist.
  const root = app.getPath('userData');
  return [
    'Cache',
    'Code Cache',
    'GPUCache',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'ShaderCache',
    'GrShaderCache',
    'Service Worker',
    'Worker',
    'blob_storage',
  ].map((rel) => ({ label: rel, abs: path.join(root, rel) }));
}

ipcMain.handle('cache:stats', () => {
  try {
    const userDataDir = app.getPath('userData');
    const userId = readSessionUserId();

    const dataFileBytes = userId ? userDataFilesBytes(userId) : 0;
    const legacyBytes = fileSizeBytes(legacyDataPath());

    const backupsRoot = path.join(userDataDir, BACKUPS_DIRNAME);
    const backupsSelf = userId ? dirSizeBytes(path.join(backupsRoot, userId)) : { bytes: 0, files: 0 };
    const backupsAll = dirSizeBytes(backupsRoot);
    const attachmentsSelf = userId ? dirSizeBytes(attachmentsDirForUser(userId)) : { bytes: 0, files: 0 };

    const chromiumDirs = chromiumCacheDirs();
    const chromium = chromiumDirs.map((d) => ({ label: d.label, ...dirSizeBytes(d.abs) }));
    const chromiumTotal = chromium.reduce((acc, x) => acc + x.bytes, 0);

    const totalUserData = dirSizeBytes(userDataDir);

    return {
      ok: true,
      userDataPath: userDataDir,
      dataFileBytes,
      legacyBytes,
      backupsSelfBytes: backupsSelf.bytes,
      backupsSelfCount: backupsSelf.files,
      backupsAllBytes: backupsAll.bytes,
      attachmentsSelfBytes: attachmentsSelf.bytes,
      attachmentsSelfCount: attachmentsSelf.files,
      chromiumBytes: chromiumTotal,
      chromiumBreakdown: chromium,
      totalBytes: totalUserData.bytes,
      totalFiles: totalUserData.files,
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('cache:clearChromium', async () => {
  // We touch ONLY Chromium-managed caches via the documented session APIs.
  // No fs.unlink on app data, no localStorage wipe, no cookie purge — those
  // would silently sign the user out or destroy AI keys.
  try {
    const sess = session.defaultSession;
    await sess.clearCache(); // HTTP cache
    if (typeof sess.clearCodeCaches === 'function') {
      await sess.clearCodeCaches({}); // V8 code cache
    }
    await sess.clearStorageData({
      storages: ['cachestorage', 'shadercache'],
      quotas: ['temporary'],
    });

    // Re-measure so the UI can show "after" sizes.
    const after = chromiumCacheDirs().map((d) => ({ label: d.label, ...dirSizeBytes(d.abs) }));
    const afterTotal = after.reduce((acc, x) => acc + x.bytes, 0);
    return { ok: true, chromiumBytes: afterTotal, chromiumBreakdown: after };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('app:showNotification', (_evt, { title, body } = {}) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title: title || 'Cadence', body: body || '' });
  n.show();
  return true;
});

ipcMain.handle('reminder:status', () => {
  const status = getReminderSyncStatus();
  if (process.platform === 'linux') {
    return { ...status, ...getBackgroundStatus() };
  }
  return status;
});
ipcMain.handle('reminder:requestPermission', () => requestReminderPermission());
ipcMain.handle('reminder:setBackgroundSettings', (_event, partial) => setBackgroundSettings(partial || {}));
ipcMain.handle('reminder:sync', (_evt, payload) => {
  const uid = readSessionUserId();
  if (!uid || !payload) return { ok: false };
  void syncRemindersFromAppData(payload, uid);
  return { ok: true };
});
ipcMain.handle('reminder:cancelItem', (_evt, { itemId } = {}) => {
  if (typeof itemId !== 'string' || !itemId) return { ok: false, error: 'bad-id' };
  return cancelReminderSlotsForItem(itemId);
});

ipcMain.handle('app:userDataPath', () => app.getPath('userData'));

ipcMain.handle('attachment:write', (_evt, payload = {}) => {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  if (payload.userId && payload.userId !== uid) {
    return { ok: false, error: 'Session mismatch.' };
  }
  const attachmentId = sanitizeAttachmentId(payload.attachmentId);
  if (!attachmentId) return { ok: false, error: 'Invalid attachment id.' };
  const dataBase64 = typeof payload.dataBase64 === 'string' ? payload.dataBase64 : '';
  if (!dataBase64) return { ok: false, error: 'Empty attachment payload.' };
  let buffer;
  try {
    buffer = Buffer.from(dataBase64, 'base64');
  } catch {
    return { ok: false, error: 'Invalid attachment encoding.' };
  }
  if (!buffer.length) return { ok: false, error: 'Empty attachment payload.' };
  if (buffer.length > 3 * 1024 * 1024) {
    return { ok: false, error: 'Attachment exceeds size limit.' };
  }
  return writeAttachmentBytes(uid, attachmentId, buffer, payload.mimeType || 'image/webp');
});

ipcMain.handle('attachment:read', (_evt, payload = {}) => {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  const attachmentId = sanitizeAttachmentId(payload.attachmentId);
  if (!attachmentId) return { ok: false, error: 'Invalid attachment id.' };
  const bytes = readAttachmentBytes(uid, attachmentId);
  if (!bytes?.length) return { ok: false, error: 'Attachment not found.' };
  return {
    ok: true,
    dataBase64: bytes.toString('base64'),
    mimeType: detectAttachmentMime(bytes),
  };
});

/** Import one attachment from a portable backup (plaintext or legacy encrypted sidecar). */
ipcMain.handle('attachment:importPortable', (_evt, payload = {}) => {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  const attachmentId = sanitizeAttachmentId(payload.attachmentId);
  if (!attachmentId) return { ok: false, error: 'Invalid attachment id.' };
  const dataBase64 = typeof payload.dataBase64 === 'string' ? payload.dataBase64 : '';
  if (!dataBase64) return { ok: false, error: 'Empty attachment payload.' };
  let buffer;
  try {
    buffer = Buffer.from(dataBase64, 'base64');
  } catch {
    return { ok: false, error: 'Invalid attachment encoding.' };
  }
  if (!buffer.length) return { ok: false, error: 'Empty attachment payload.' };
  if (buffer.length > 3 * 1024 * 1024) {
    return { ok: false, error: 'Attachment exceeds size limit.' };
  }

  let plain = buffer;
  if (payload.encrypted === true) {
    const key = dataKeys.get(uid);
    if (!key) return { ok: false, error: 'Session expired. Sign in again and retry import.' };
    try {
      const text = buffer.toString('utf8');
      const decrypted = decryptBuffer(text, key);
      if (!decrypted?.length) return { ok: false, error: 'Could not decrypt attachment (wrong account key).' };
      plain = decrypted;
    } catch {
      return { ok: false, error: 'Could not decrypt attachment.' };
    }
  }

  return writeAttachmentBytes(uid, attachmentId, plain, detectAttachmentMime(plain));
});

ipcMain.handle('attachment:gc', (_evt, payload = {}) => {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  const data = readUserData(uid);
  if (!data) return { ok: false, error: 'No workspace loaded.' };
  return pruneOrphanAttachments(uid, data);
});

ipcMain.handle('noteHistory:list', (_evt, { noteId } = {}) => {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.', revisions: [] };
  return listNoteRevisions(uid, noteId);
});

ipcMain.handle('noteHistory:read', (_evt, { noteId, revisionId } = {}) => {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  return readNoteRevision(uid, noteId, revisionId);
});

ipcMain.handle('noteHistory:append', (_evt, payload = {}) => {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  return appendNoteRevision(uid, payload);
});

ipcMain.handle('noteHistory:purge', (_evt, { noteId } = {}) => {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  return purgeNoteHistory(uid, noteId);
});

/**
 * Export workspace JSON + attachment sidecars into a folder the user picks.
 * Folder layout: data.json, manifest.json, attachments/*, note-history/*
 */
ipcMain.handle('data:exportBundle', async (_evt, { data: payload } = {}) => {
  const blocked = requirePolicyFeature('dataExport', isFeatureAllowed);
  if (blocked) return blocked;
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'data required' };
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const pick = await dialog.showOpenDialog(win, {
    title: 'Choose folder for full backup',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (pick.canceled || !pick.filePaths?.[0]) return { ok: false, canceled: true };
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const folder = path.join(pick.filePaths[0], `${APP_SLUG}-backup-${ts}`);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'data.json'), JSON.stringify(payload, null, 2), 'utf8');
    const attDest = path.join(folder, 'attachments');
    const attachmentCount = exportAttachmentsPortableToDir(uid, attDest);
    fs.writeFileSync(
      path.join(folder, 'manifest.json'),
      JSON.stringify(
        {
          format: 'cadence-bundle-v2',
          exportedAt: new Date().toISOString(),
          attachmentsPortable: true,
          attachmentCount,
          noteHistoryRevisionCount: countNoteHistoryRevisions(uid),
        },
        null,
        2,
      ),
      'utf8',
    );
    exportNoteHistoryToDir(uid, folder);
    return { ok: true, path: folder };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

/**
 * Import a bundle folder (data.json + optional attachments/) over the live workspace.
 */
function plausibilityCheckWorkspacePayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const collections = ['teams', 'people', 'items', 'todoGroups', 'todoItems', 'notes'];
  return collections.some((k) => Array.isArray(/** @type {Record<string, unknown>} */ (payload)[k]));
}

ipcMain.handle('data:importBundle', async () => {
  const blocked = requirePolicyFeature('dataExport', isFeatureAllowed);
  if (blocked) return blocked;
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const pick = await dialog.showOpenDialog(win, {
    title: 'Choose backup folder to import',
    properties: ['openDirectory'],
  });
  if (pick.canceled || !pick.filePaths?.[0]) return { ok: false, canceled: true };
  const folder = pick.filePaths[0];
  const dataPath = path.join(folder, 'data.json');
  if (!fs.existsSync(dataPath)) {
    return { ok: false, error: 'No data.json found in that folder.' };
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (err) {
    return { ok: false, error: `Invalid data.json: ${err.message ?? err}` };
  }
  const { workspace } = unwrapStoredWorkspace(raw);
  const payload =
    workspace && typeof workspace === 'object' ? workspace : raw;
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'data.json does not contain a workspace object.' };
  }
  if (!plausibilityCheckWorkspacePayload(payload)) {
    return {
      ok: false,
      error: 'data.json does not look like a Cadence workspace export (no recognised collections).',
    };
  }
  snapshotCurrentDataFile(uid, 'pre-import');
  snapshotNoteHistoryForUser(uid, 'pre-import', Date.now());
  const attSrc = path.join(folder, 'attachments');
  const attResult = fs.existsSync(attSrc)
    ? importAttachmentsPortableFromDir(uid, attSrc)
    : { restored: 0, skipped: 0 };
  const histSrc = path.join(folder, NOTE_HISTORY_DIRNAME);
  if (fs.existsSync(histSrc)) importNoteHistoryFromDir(uid, histSrc);
  workspaceImportLockUid = uid;
  try {
    const w = commitUserData(uid, payload, { allowOverwriteUnreadable: true });
    if (!w.ok) return w;
    const salvaged = salvageReferencedAttachmentsLocally(uid, payload);
    return {
      ok: true,
      importedFrom: path.basename(folder),
      writeGeneration: w.writeGeneration,
      attachmentsRestored: attResult.restored + salvaged.restored,
      attachmentsSkipped: attResult.skipped ?? 0,
    };
  } finally {
    workspaceImportLockUid = null;
  }
});

/**
 * Replace the live workspace from a parsed JSON import (renderer-side file picker).
 * Commits on the main process without optimistic-concurrency checks — same as
 * folder import — so a stale renderer writeGeneration cannot block the import.
 */
ipcMain.handle('data:importWorkspace', (_evt, payload) => {
  const blocked = requirePolicyFeature('dataExport', isFeatureAllowed);
  if (blocked) return blocked;
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  if (!plausibilityCheckWorkspacePayload(payload)) {
    return {
      ok: false,
      error: 'The JSON does not look like a Cadence workspace export (no recognised collections).',
    };
  }
  snapshotCurrentDataFile(uid, 'pre-import');
  workspaceImportLockUid = uid;
  try {
    const w = commitUserData(uid, payload, { allowOverwriteUnreadable: true });
    if (!w.ok) return w;
    const salvaged = salvageReferencedAttachmentsLocally(uid, payload);
    return {
      ...w,
      attachmentsRestored: salvaged.restored,
    };
  } finally {
    workspaceImportLockUid = null;
  }
});

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('app:checkUpdates', async () => {
  if (!app.isPackaged) return { ok: false, reason: 'dev' };
  const blocked = requirePolicyFeature('updateCheck', isFeatureAllowed);
  if (blocked) return blocked;
  const u = getAutoUpdater();
  if (!u) return { ok: false, error: 'updater unavailable' };

  // If a launch-time check already discovered an update, replay the latest
  // event so a freshly opened modal can render the right state instantly.
  if (
    lastUpdaterEvent &&
    (lastUpdaterEvent.status === 'downloaded' || lastUpdaterEvent.status === 'downloading')
  ) {
    broadcastUpdaterEvent(lastUpdaterEvent);
    return { ok: true };
  }

  // Manual button bypasses throttle & offline gate — the user explicitly
  // asked, so we honour that and surface the error if the network is down.
  const r = await runUpdateCheck('manual', { force: true });
  if (!r.ok) {
    const errorByCode = {
      'in-flight':  'Another update check is already running. Please wait a moment and try again.',
      'no-updater': 'Auto-updater is not available in this build.',
      'error':      'Update check failed. Please check your internet connection and try again.',
    };
    return { ok: false, error: errorByCode[r.skipped] || `Update check skipped: ${r.skipped || 'unknown'}` };
  }
  return { ok: true };
});

ipcMain.handle('app:installUpdate', () => {
  if (!app.isPackaged) return { ok: false, reason: 'dev' };
  const blocked = requirePolicyFeature('updateCheck', isFeatureAllowed);
  if (blocked) return blocked;
  const u = getAutoUpdater();
  if (!u) return { ok: false, error: 'updater unavailable' };
  // Defer so this IPC can return its result before the app quits.
  setImmediate(() => {
    try {
      u.quitAndInstall();
    } catch (err) {
      console.error('[cadence] quitAndInstall failed', err);
    }
  });
  return { ok: true };
});

// ---------- IPC: policy (enterprise / shared-device gating) -------------------
//
// Cadence ships a single binary that can target both public users and
// enterprise/work-device deployments. Enterprise admins (or self-install
// scripts on smaller teams) drop a `policy.json` onto the machine; the
// renderer's `useFeatures()` hook reads it via `policy:get` and gates UI
// (Cloud sync, LAN sync, AI provider, backup export, update checks) based
// on what the policy permits.
//
// We deliberately don't enforce policy in IPC handlers themselves — gating
// at IPC level would mean every existing handler grows a "is this feature
// permitted right now?" branch, which is both invasive and easy to get
// wrong. Instead we:
//   - Hide the entry points in the renderer when policy disables a feature.
//   - Forbid LAN sync server start-up here when policy says so (defence in
//     depth: even a buggy renderer can't spin up the LAN HTTPS server).
// AI calls go directly from renderer to the LLM provider (no IPC), so the
// renderer-side gate is sufficient for that path.
//
// Path precedence (first hit wins; an empty file or invalid JSON is logged
// and the next path is tried):
//   1. App bundle resources (immutable; signed into the .app/.exe).
//      macOS: `Cadence.app/Contents/Resources/policy.json`
//      Linux: `<asar root>/extraResources/policy.json` (when packaged).
//   2. OS-managed location (MDM-friendly).
//      macOS: `/Library/Managed Preferences/<appId>.policy.json`
//      Windows: `%ProgramFiles%\Cadence\policy.json`
//      Linux:  `/etc/cadence/policy.json`
//   3. Shared admin location (self-install scripts).
//      macOS: `/Library/Application Support/Cadence/policy.json`
//      Windows: `%ProgramData%\Cadence\policy.json`
//      Linux:  `/etc/cadence/policy.json` (already covered above; deduped)
//   4. User-writable location (developer override / power user).
//      `<userData>/policy.json`

function candidatePolicyPaths() {
  const candidates = [];

  // The packaged app's display name. For the public build this is
  // `Cadence`; for the enterprise build flavor it's `Cadence for Work`
  // (set by electron-builder.enterprise.json). We deploy enterprise
  // policies under the productName-derived directory because that's
  // what electron's `app.getPath('userData')` already uses, but we
  // ALSO check the canonical `APP_NAME` path so an IT team that ships
  // a single policy.json file for a mixed fleet doesn't have to deploy
  // twice. The dedup pass at the bottom collapses the duplicates on
  // public-build machines where the two names are identical.
  const productName = (() => {
    try {
      return typeof app.getName === 'function' ? app.getName() : APP_NAME;
    } catch { return APP_NAME; }
  })();
  // Strip any dev-mode suffix (`Cadence (Dev)` → `Cadence`) when looking
  // for an installed policy. Developers running with `npm run dev`
  // already have ProductName="Cadence (Dev)" in `app.setName` (see top
  // of this file); their machines should pick up the same policy as
  // the packaged build for testing purposes.
  const productNameClean = productName.replace(/\s+\(Dev\)$/i, '');

  // 1. App bundle resources — read-only after install.
  try {
    const resourcesPath = process.resourcesPath || path.join(app.getAppPath(), '..');
    candidates.push({
      path: path.join(resourcesPath, 'policy.json'),
      managedBy: 'app-bundle',
    });
  } catch (_e) { void _e; }

  // 2. OS-managed (MDM) location.
  if (process.platform === 'darwin') {
    // Both `<appId>.policy.json` (preferred) and `policy.json` (legacy
    // / older docs) are checked — MDM tools write the former, but a
    // hand-edited deployment often produces the latter.
    candidates.push({
      path: `/Library/Managed Preferences/${APP_SLUG}.policy.json`,
      managedBy: 'mdm',
    });
    candidates.push({
      path: '/Library/Managed Preferences/cadence.policy.json',
      managedBy: 'mdm',
    });
  } else if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    candidates.push({ path: path.join(pf, productNameClean, 'policy.json'), managedBy: 'admin' });
    if (productNameClean !== APP_NAME) {
      candidates.push({ path: path.join(pf, APP_NAME, 'policy.json'), managedBy: 'admin' });
    }
  } else {
    candidates.push({
      path: `/etc/${APP_SLUG}/policy.json`,
      managedBy: 'admin',
    });
  }

  // 3. Shared admin location. Check the productName-derived directory
  //    first (enterprise build) and fall back to the canonical APP_NAME
  //    directory (public build / mixed-fleet single-file deploys).
  if (process.platform === 'darwin') {
    candidates.push({ path: `/Library/Application Support/${productNameClean}/policy.json`, managedBy: 'admin' });
    if (productNameClean !== APP_NAME) {
      candidates.push({ path: `/Library/Application Support/${APP_NAME}/policy.json`, managedBy: 'admin' });
    }
  } else if (process.platform === 'win32') {
    const pd = process.env['ProgramData'] || 'C:\\ProgramData';
    candidates.push({ path: path.join(pd, productNameClean, 'policy.json'), managedBy: 'admin' });
    if (productNameClean !== APP_NAME) {
      candidates.push({ path: path.join(pd, APP_NAME, 'policy.json'), managedBy: 'admin' });
    }
  }

  // 4. User-writable location — last resort, lowest precedence.
  try {
    candidates.push({
      path: path.join(app.getPath('userData'), 'policy.json'),
      managedBy: 'user',
    });
  } catch (_e) { void _e; }

  // Dedup while preserving order: in the unusual case of two candidates
  // resolving to the same absolute path, keep the higher-precedence one.
  const seen = new Set();
  return candidates.filter((c) => {
    if (!c.path) return false;
    if (seen.has(c.path)) return false;
    seen.add(c.path);
    return true;
  });
}

/**
 * Attempt to load a policy file from the first existing candidate path.
 * Validates the JSON, normalises the payload to the shape the renderer
 * expects (see `parsePolicy` in `src/lib/features.tsx`), and returns
 * `null` when no candidate yields a valid policy.
 *
 * IMPORTANT: this MUST NOT throw — a malformed admin-supplied file should
 * cause us to fall back to the user's preset (or default), not lock the
 * user out of the app.
 */
function loadPolicy() {
  const candidates = candidatePolicyPaths();
  for (const cand of candidates) {
    try {
      if (!fs.existsSync(cand.path)) continue;
      const text = fs.readFileSync(cand.path, 'utf8');
      if (!text.trim()) continue;
      let raw;
      try {
        raw = JSON.parse(text);
      } catch (parseErr) {
        console.warn(LOG_TAG, 'policy.json at', cand.path, 'is not valid JSON; skipping', parseErr);
        continue;
      }
      if (!raw || typeof raw !== 'object') continue;

      // Build the renderer-facing payload. Validation happens both here
      // AND in `parsePolicy()` on the renderer side — defence in depth,
      // and it keeps the IPC contract obvious.
      const out = { path: cand.path, managedBy: typeof raw.managedBy === 'string' ? raw.managedBy : cand.managedBy };
      if (typeof raw.preset === 'string' && (raw.preset === 'personal' || raw.preset === 'work-standard' || raw.preset === 'work-strict')) {
        out.preset = raw.preset;
      }
      if (raw.features && typeof raw.features === 'object') {
        const f = raw.features;
        const features = {};
        if (f.sync && typeof f.sync === 'object') {
          const sync = {};
          if (typeof f.sync.lan === 'boolean') sync.lan = f.sync.lan;
          if (typeof f.sync.cloud === 'boolean') sync.cloud = f.sync.cloud;
          if (Object.keys(sync).length) features.sync = sync;
        }
        if (typeof f.ai === 'boolean') features.ai = f.ai;
        if (typeof f.dataExport === 'boolean') features.dataExport = f.dataExport;
        if (typeof f.updateCheck === 'boolean') features.updateCheck = f.updateCheck;
        if (Object.keys(features).length) out.features = features;
      }
      if (!out.preset && !out.features) {
        console.warn(LOG_TAG, 'policy.json at', cand.path, 'has neither preset nor features; skipping');
        continue;
      }
      console.log(LOG_TAG, 'policy loaded from', cand.path);
      return out;
    } catch (err) {
      console.warn(LOG_TAG, 'policy load failed for', cand.path, err);
    }
  }
  return null;
}

// Cache the result for the lifetime of the process. Policy is immutable
// during a session by design — re-reading it on every renderer call would
// invite a race where the UI flickers between gated/ungated states. Admins
// who change policy.json need the user to restart the app, which is also
// how Chrome / Edge enterprise policies behave.
let _cachedPolicy = undefined;
function getCachedPolicy() {
  if (_cachedPolicy === undefined) _cachedPolicy = loadPolicy();
  return _cachedPolicy;
}

/**
 * Is this running on the locked enterprise build flavor (`Cadence for Work`)?
 *
 * The renderer learns its flavor at compile time via Vite's
 * `import.meta.env.CADENCE_DISTRIBUTION` literal substitution; the main
 * process has no such build-time hook because `main.cjs` is shipped
 * verbatim by electron-builder. We instead infer the flavor from the
 * `productName` set by `electron-builder.enterprise.json` (which is also
 * what end-users see in their Applications folder), and additionally
 * honour an explicit `CADENCE_DISTRIBUTION=enterprise` env var so a
 * developer running `npm run dev` with that flag set still gets the
 * defence-in-depth behaviour.
 *
 * This is the "policy is implied by the build" backstop — without it, a
 * `Cadence for Work` install with NO policy.json on disk would allow
 * `sync:enable` to start the LAN server even though the renderer
 * (correctly) keeps the UI hidden.
 */
function isEnterpriseBuild() {
  try {
    if (process.env.CADENCE_DISTRIBUTION === 'enterprise') return true;
    if (typeof app.getName === 'function' && app.getName() === 'Cadence for Work') return true;
  } catch { /* ignore */ }
  return false;
}

/**
 * Resolve the "is feature X allowed by policy" decision for a single
 * binary flag (lan, cloud, ai, dataExport, updateCheck). Mirrors the
 * renderer's `resolveFeatures()` precedence but does NOT use any
 * renderer code (main.cjs is plain Node, no Vite). Keep the rules in
 * sync if you change them in `src/lib/features.tsx`.
 *
 * Order of precedence (highest wins):
 *   1. Sidecar policy.json explicit flag value
 *   2. Sidecar policy.json preset's value
 *   3. Enterprise build → `work-strict` defaults (sync/cloud/ai/export = false, updates = true)
 *   4. Public build → `personal` defaults (everything = true)
 */
function isFeatureAllowed(featurePath) {
  const policy = getCachedPolicy();
  const enterprise = isEnterpriseBuild();

  const presetDefaults = {
    personal:        { 'sync.lan': true,  'sync.cloud': true,  ai: true,  dataExport: true,  updateCheck: true },
    'work-standard': { 'sync.lan': false, 'sync.cloud': false, ai: true,  dataExport: true,  updateCheck: true },
    'work-strict':   { 'sync.lan': false, 'sync.cloud': false, ai: false, dataExport: false, updateCheck: true },
  };

  // 1. Explicit policy flag.
  if (policy?.features) {
    if (featurePath === 'sync.lan'    && typeof policy.features.sync?.lan    === 'boolean') return policy.features.sync.lan;
    if (featurePath === 'sync.cloud'  && typeof policy.features.sync?.cloud  === 'boolean') return policy.features.sync.cloud;
    if (featurePath === 'ai'          && typeof policy.features.ai          === 'boolean') return policy.features.ai;
    if (featurePath === 'dataExport'  && typeof policy.features.dataExport  === 'boolean') return policy.features.dataExport;
    if (featurePath === 'updateCheck' && typeof policy.features.updateCheck === 'boolean') return policy.features.updateCheck;
  }

  // 2. Policy preset.
  if (policy?.preset && presetDefaults[policy.preset]) {
    return presetDefaults[policy.preset][featurePath];
  }

  // 3 / 4. Build-implied baseline.
  const base = enterprise ? presetDefaults['work-strict'] : presetDefaults.personal;
  return base[featurePath];
}

ipcMain.handle('policy:get', () => getCachedPolicy());

// ---------- IPC: auth (PIN) ---------------------------------------------------

ipcMain.handle('auth:status', () => {
  return { enabled: fs.existsSync(authPath()) };
});

ipcMain.handle('auth:setPin', (_evt, { pin } = {}) => {
  const safe = normalizePin(pin);
  if (safe.length < 4) {
    return { ok: false, error: 'PIN must be at least 4 characters.' };
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashWithSalt(safe, salt).toString('hex');
  const wrote = writeJsonSafe(authPath(), { salt, hash });
  if (!wrote) return { ok: false, error: 'Could not save PIN.' };

  // Self-verify: read the file back and re-hash with the exact same plaintext.
  // If the round-trip fails for any reason (encoding, FS quirk, antivirus
  // rewrites…) we delete the half-baked file so the user is not locked out and
  // can try again. Better to fail loudly here than to greet them with
  // "incorrect PIN" on the very first unlock.
  try {
    const round = readAuth();
    if (!round || round.salt !== salt || round.hash !== hash) {
      console.error('[cadence] auth:setPin self-verify (round-trip) failed', {
        wrote: !!wrote,
        sameSalt: round && round.salt === salt,
        sameHash: round && round.hash === hash,
      });
      try { fs.unlinkSync(authPath()); } catch (_e) { void _e; }
      return { ok: false, error: 'PIN could not be saved reliably on this device. Please try again.' };
    }
    const reHash = hashWithSalt(safe, round.salt).toString('hex');
    if (reHash !== round.hash) {
      console.error('[cadence] auth:setPin self-verify (re-hash) failed — keyspace mismatch');
      try { fs.unlinkSync(authPath()); } catch (_e) { void _e; }
      return { ok: false, error: 'PIN could not be saved reliably on this device. Please try again.' };
    }
  } catch (err) {
    console.error('[cadence] auth:setPin self-verify threw', err);
    try { fs.unlinkSync(authPath()); } catch (_e) { void _e; }
    return { ok: false, error: 'PIN could not be saved reliably on this device. Please try again.' };
  }
  return { ok: true };
});

ipcMain.handle('auth:verify', (_evt, { pin } = {}) => {
  const d = readAuth();
  if (!d || typeof d.salt !== 'string' || typeof d.hash !== 'string') return { ok: true };
  const safe = normalizePin(pin);
  if (!safe) return { ok: false };
  try {
    const got = hashWithSalt(safe, d.salt);
    const exp = Buffer.from(d.hash, 'hex');
    if (got.length !== exp.length) {
      console.warn(
        '[cadence] auth:verify length mismatch — got', got.length, 'expected', exp.length,
        'salt[0..6]=', d.salt.slice(0, 6), 'authPath=', authPath(),
      );
      return { ok: false };
    }
    const matched = crypto.timingSafeEqual(got, exp);
    if (!matched) {
      console.warn(
        '[cadence] auth:verify mismatch — pin.length=', safe.length,
        'salt[0..6]=', d.salt.slice(0, 6),
        'storedHash[0..8]=', d.hash.slice(0, 8),
        'authPath=', authPath(),
      );
    }
    return { ok: matched };
  } catch (err) {
    console.error('[cadence] auth:verify threw', err);
    return { ok: false };
  }
});

ipcMain.handle('auth:clear', (_evt, { pin } = {}) => {
  const d = readAuth();
  if (!d) return { ok: true };
  const safe = normalizePin(pin);
  if (!safe) return { ok: false, error: 'PIN required.' };
  try {
    const got = hashWithSalt(safe, d.salt);
    const exp = Buffer.from(d.hash, 'hex');
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) {
      return { ok: false, error: 'Incorrect PIN.' };
    }
    fs.unlinkSync(authPath());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// Emergency unlock: if the user gets locked out (forgotten PIN, bug, paste
// glitch on initial set), they can wipe the PIN by re-authenticating with
// their account password — the same credential that owns the encryption key
// for their data, so this doesn't grant any new capability.
//
// The brute-force surface here is identical to login (scrypt-hashed account
// password). We still add a small in-memory rate limit so an unattended
// machine doesn't let an attacker test thousands of passwords by mashing
// "Reset PIN".
const pinResetAttempts = { count: 0, blockedUntil: 0 };
const PIN_RESET_MAX_ATTEMPTS = 5;
const PIN_RESET_BLOCK_MS = 30_000;

ipcMain.handle('auth:resetWithAccountPassword', (_evt, { password } = {}) => {
  const now = Date.now();
  if (pinResetAttempts.blockedUntil > now) {
    const remainingSec = Math.ceil((pinResetAttempts.blockedUntil - now) / 1000);
    return {
      ok: false,
      error: `Too many attempts. Try again in ${remainingSec}s.`,
    };
  }
  if (typeof password !== 'string' || !password) {
    return { ok: false, error: 'Account password is required.' };
  }
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'No active account session on this device.' };
  const accounts = readAccounts();
  const u = accounts.users.find((x) => x.id === uid);
  if (!u || typeof u.salt !== 'string' || typeof u.hash !== 'string') {
    return { ok: false, error: 'Account record is missing or corrupt.' };
  }
  try {
    const got = hashWithSalt(password, u.salt);
    const exp = Buffer.from(u.hash, 'hex');
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) {
      pinResetAttempts.count += 1;
      if (pinResetAttempts.count >= PIN_RESET_MAX_ATTEMPTS) {
        pinResetAttempts.blockedUntil = now + PIN_RESET_BLOCK_MS;
        pinResetAttempts.count = 0;
      }
      return { ok: false, error: 'Incorrect account password.' };
    }
    pinResetAttempts.count = 0;
    pinResetAttempts.blockedUntil = 0;
    if (fs.existsSync(authPath())) {
      try { fs.unlinkSync(authPath()); } catch (err) {
        return { ok: false, error: `Could not remove PIN file: ${String(err)}` };
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// ---------- IPC: accounts ------------------------------------------------------

ipcMain.handle('account:session', () => {
  const uid = readSessionUserId();
  if (!uid) return { user: null };
  const { users } = readAccounts();
  const u = users.find((x) => x.id === uid);
  if (!u || typeof u.email !== 'string') {
    clearSession();
    return { user: null };
  }

  // CRITICAL: a "resumed" session does NOT carry an in-memory data key —
  // those only exist after `account:login` / `account:register` /
  // `account:changePassword` (because deriving them requires the
  // plaintext password, which we never persist). On Electron restart
  // we have a session ID on disk but no key in memory.
  //
  // If the on-disk data file is encrypted, we MUST NOT pretend the
  // session is fully resumed. Doing so causes two compounding bugs:
  //   (a) `readUserDataResult` returns `{ ok:false, reason:'no-key' }`,
  //       the renderer treats that as "no data", and the user boots
  //       into an empty workspace.
  //   (b) the very next `data:save` falls through `writeUserData` with
  //       no key in memory — until this commit, that path silently
  //       wrote PLAINTEXT, both overwriting the encrypted file AND
  //       leaking decrypted bytes to disk.
  //
  // Both are fixed below. Here, we surface "needs-re-auth" so the
  // renderer can route the user to the Login screen instead of an
  // empty workspace.
  const accountIsEncrypted = typeof u.encSalt === 'string' && !!u.encSalt;
  if (accountIsEncrypted && !dataKeys.has(uid)) {
    const file = dataPathForUser(u.id);
    let dataFileIsEncrypted = false;
    let encryptedHead = null;
    if (fs.existsSync(file)) {
      try {
        encryptedHead = fs.readFileSync(file, 'utf8');
        dataFileIsEncrypted = isEncryptedFile(encryptedHead);
      } catch (err) {
        console.warn('[cadence] account:session could not probe data file', err);
        // Conservative: if we can't tell, assume encrypted → require re-auth.
        dataFileIsEncrypted = true;
      }
    } else {
      // No data file yet (first launch after register, account purge, etc).
      // No key required — let the session resume so the user sees an empty
      // workspace they can populate.
      dataFileIsEncrypted = false;
    }

    // "Stay signed in": try to rehydrate the in-memory data key from the
    // OS-protected key cache. This is the entire point of that feature —
    // without it, every Electron restart routes the user back to the
    // login screen even though their PIN already gates the workspace.
    //
    // We deliberately VALIDATE the cached key against the actual data
    // file before declaring success. A stale cache (e.g. password was
    // rotated on another device) must surface as re-auth, not as silent
    // data corruption.
    if (dataFileIsEncrypted && getUserRememberMe(u)) {
      const cached = loadPersistedDataKey(u.id);
      if (cached && encryptedHead && decryptPayload(encryptedHead, cached) != null) {
        dataKeys.set(u.id, cached);
        dataFileIsEncrypted = false; // Resumed — no re-auth needed.
      } else if (cached) {
        // The cache is unusable for this file. Drop it so the next
        // successful login can rewrite a valid one.
        clearPersistedDataKey(u.id);
      }
    }

    if (dataFileIsEncrypted) {
      return {
        user: null,
        requiresAuth: true,
        email: u.email,
        displayName: typeof u.displayName === 'string' ? u.displayName : undefined,
      };
    }
  }

  return {
    user: {
      id: u.id,
      email: u.email,
      displayName: typeof u.displayName === 'string' ? u.displayName : undefined,
    },
  };
});

ipcMain.handle('account:register', (_evt, { email, password, migrateLegacy, displayName } = {}) => {
  const em = normalizeEmail(email);
  if (!em || !em.includes('@')) return { ok: false, error: 'Please enter a valid email.' };
  if (typeof password !== 'string' || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  const accounts = readAccounts();
  if (accounts.users.some((u) => u.email === em)) {
    return { ok: false, error: 'An account already exists for this email.' };
  }

  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashWithSalt(password, salt).toString('hex');
  const encSalt = crypto.randomBytes(16).toString('hex');
  accounts.users.push({
    id,
    email: em,
    salt,
    hash,
    encSalt,
    // Default ON: new accounts opt into "stay signed in across restarts"
    // until the user explicitly disables it from Settings. See
    // `getUserRememberMe` for why this matches user expectations.
    rememberMe: true,
    createdAt: new Date().toISOString(),
    displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : undefined,
  });
  writeAccounts(accounts);
  writeSession(id);
  flushPendingDeepLink();
  const newKey = deriveDataKey(password, encSalt);
  dataKeys.set(id, newKey);
  // Persist the freshly derived key so the next launch can resume without
  // asking for the password again. Silently no-ops if `safeStorage` is
  // unavailable (Linux without libsecret) — that user falls back to the
  // pre-existing "re-login on restart" behaviour.
  persistDataKey(id, newKey);

  // Recovery codes (optional field — older builds ignore `recoveryEnvelope`).
  let recoveryCodes = null;
  try {
    const codes = generateRecoveryCodes();
    const envelope = wrapRecoverySecret(newKey, codes);
    const created = accounts.users.find((x) => x.id === id);
    if (created) {
      created.recoveryEnvelope = envelope;
      created.recoveryConfiguredAt = new Date().toISOString();
      writeAccounts(accounts);
      recoveryCodes = codes;
    }
  } catch (err) {
    console.warn('[cadence] recovery envelope setup failed at register', err);
  }

  const userPath = dataPathForUser(id);
  if (migrateLegacy === true) {
    try {
      const leg = legacyDataPath();
      if (fs.existsSync(leg) && !fs.existsSync(userPath)) {
        // Read legacy plaintext, immediately rewrite encrypted under the new key.
        const legacyText = fs.readFileSync(leg, 'utf8');
        try {
          const obj = JSON.parse(legacyText);
          commitUserData(id, obj);
        } catch {
          fs.copyFileSync(leg, userPath);
          writeWriteMeta(id, 1);
        }
      }
    } catch (e) {
      return {
        ok: true,
        user: { id, email: em, displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : undefined },
        warn: String(e),
        recoveryCodes,
      };
    }
  }

  return {
    ok: true,
    user: { id, email: em, displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : undefined },
    recoveryCodes,
  };
});

ipcMain.handle('account:login', (_evt, { email, password } = {}) => {
  const em = normalizeEmail(email);
  if (!em || typeof password !== 'string') return { ok: false, error: 'Email and password are required.' };
  const accounts = readAccounts();
  const u = accounts.users.find((x) => x.email === em);
  if (!u || typeof u.salt !== 'string' || typeof u.hash !== 'string') {
    return { ok: false, error: 'Incorrect email or password.' };
  }
  try {
    const got = hashWithSalt(password, u.salt);
    const exp = Buffer.from(u.hash, 'hex');
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) {
      return { ok: false, error: 'Incorrect email or password.' };
    }
    // Backfill encSalt + encrypt-on-first-save for accounts created before encryption support.
    let mutated = false;
    if (typeof u.encSalt !== 'string' || !u.encSalt) {
      u.encSalt = crypto.randomBytes(16).toString('hex');
      mutated = true;
    }
    // Backfill the `rememberMe` flag for legacy accounts that pre-date the
    // OS-keychain feature. Default ON matches the new-account behaviour.
    if (typeof u.rememberMe !== 'boolean') {
      u.rememberMe = true;
      mutated = true;
    }
    if (mutated) writeAccounts(accounts);
    const derivedKey = deriveDataKey(password, u.encSalt);
    dataKeys.set(u.id, derivedKey);
    // Refresh the OS-keychain cache on every successful login so a future
    // restart can skip the password prompt. Honours the user's opt-out.
    if (getUserRememberMe(u)) {
      persistDataKey(u.id, derivedKey);
    } else {
      clearPersistedDataKey(u.id);
    }

    // Auto-migrate legacy single-user file (`leeadman-data.json`) into this
    // account if the per-user file is missing. This is the most common cause
    // of "I updated and my data disappeared" — the legacy file is still on
    // disk but nobody links it to the account that was created post-update.
    const file = dataPathForUser(u.id);
    if (!fs.existsSync(file)) {
      const leg = legacyDataPath();
      if (fs.existsSync(leg)) {
        try {
          const legacyText = fs.readFileSync(leg, 'utf8');
          try {
            const obj = JSON.parse(legacyText);
            commitUserData(u.id, obj);
            console.log('[cadence] auto-migrated legacy data into', u.email);
          } catch {
            fs.copyFileSync(leg, file);
            writeWriteMeta(u.id, 1);
          }
        } catch (err) {
          console.warn('[cadence] legacy auto-migrate failed', err);
        }
      }
    }

    // Take a snapshot right after we successfully derived the key, so even
    // a buggy in-session save can never destroy this known-good baseline.
    snapshotCurrentDataFile(u.id, 'post-login');

    // If the data file is currently plaintext (legacy in-place), upgrade it transparently now.
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, 'utf8');
      if (!isEncryptedFile(text)) {
        try {
          const obj = JSON.parse(text);
          commitUserData(u.id, obj);
        } catch {
          /* best effort */
        }
      }
    }

    writeSession(u.id);
    flushPendingDeepLink();
    return {
      ok: true,
      user: { id: u.id, email: u.email, displayName: typeof u.displayName === 'string' ? u.displayName : undefined },
    };
  } catch {
    return { ok: false, error: 'Incorrect email or password.' };
  }
});

ipcMain.handle('account:logout', () => {
  const uid = readSessionUserId();
  if (uid) {
    dataKeys.delete(uid);
    pendingRecoveryEnvelopes.delete(uid);
    // Explicit logout means "don't auto-resume next time". Clearing the
    // cached key here is what makes Logout actually feel like a logout
    // even with "Stay signed in" turned on for the next session — the
    // user has to enter their password again at next launch. The
    // rememberMe preference itself is preserved for the NEXT login.
    clearPersistedDataKey(uid);
  }
  clearSession();
  return { ok: true };
});

/**
 * Verify the current password and rotate the user's password (and on-disk
 * encryption key). The data file is decrypted with the old key, then
 * re-encrypted under the new key in a single atomic swap.
 */
ipcMain.handle('account:changePassword', (_evt, { oldPassword, newPassword } = {}) => {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  if (typeof oldPassword !== 'string' || typeof newPassword !== 'string') {
    return { ok: false, error: 'Both passwords are required.' };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters.' };
  }
  if (oldPassword === newPassword) {
    return { ok: false, error: 'New password must be different from the current one.' };
  }

  const accounts = readAccounts();
  const u = accounts.users.find((x) => x.id === uid);
  if (!u || typeof u.salt !== 'string' || typeof u.hash !== 'string') {
    return { ok: false, error: 'Account not found.' };
  }

  try {
    const got = hashWithSalt(oldPassword, u.salt);
    const exp = Buffer.from(u.hash, 'hex');
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) {
      return { ok: false, error: 'Current password is incorrect.' };
    }
  } catch {
    return { ok: false, error: 'Current password is incorrect.' };
  }

  // Read merged workspace (base + monthly shards, CDNC1 envelope unwrapped) under the current key.
  const previousKey = dataKeys.get(uid);
  const loaded = readUserDataResult(uid);
  if (!loaded.ok) {
    if (loaded.reason === 'no-key') {
      return { ok: false, error: 'Session expired. Please sign in again.' };
    }
    if (loaded.reason === 'bad-key') {
      return { ok: false, error: 'Could not decrypt your data with the current password.' };
    }
    return { ok: false, error: loaded.error ?? 'Could not read workspace.' };
  }
  const workspacePayload = loaded.data;

  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashWithSalt(newPassword, newSalt).toString('hex');
  const newEncSalt = crypto.randomBytes(16).toString('hex');
  const newKey = deriveDataKey(newPassword, newEncSalt);

  const preChangeSnapshot = snapshotCurrentDataFile(uid, 'pre-pwchange');
  dataKeys.set(uid, newKey);
  if (workspacePayload != null) {
    const commitResult = commitUserData(uid, workspacePayload, { allowOverwriteUnreadable: true });
    if (!commitResult?.ok) {
      if (previousKey) dataKeys.set(uid, previousKey);
      else dataKeys.delete(uid);
      return {
        ok: false,
        error: commitResult?.error ?? 'Could not re-encrypt workspace with the new password.',
      };
    }
  }

  u.salt = newSalt;
  u.hash = newHash;
  u.encSalt = newEncSalt;
  u.passwordChangedAt = new Date().toISOString();
  if (u.recoveryEnvelope) {
    delete u.recoveryEnvelope;
    delete u.recoveryConfiguredAt;
  }
  if (!writeAccounts(accounts)) {
    if (previousKey) dataKeys.set(uid, previousKey);
    else dataKeys.delete(uid);
    if (preChangeSnapshot) {
      const restored = loadWorkspaceFromBackupSet(uid, preChangeSnapshot);
      if (restored.ok) {
        commitUserData(uid, restored.workspace, { allowOverwriteUnreadable: true });
      }
    }
    return {
      ok: false,
      error:
        'Could not save your new password to disk. Your workspace was restored to the previous password — try again.',
    };
  }

  if (getUserRememberMe(u)) {
    persistDataKey(uid, newKey);
  } else {
    clearPersistedDataKey(uid);
  }

  return { ok: true };
});

ipcMain.handle('account:hasLegacyData', () => {
  try {
    return { has: fs.existsSync(legacyDataPath()) };
  } catch {
    return { has: false };
  }
});

// Verify the current session's account password without performing any state
// change. Used by features (e.g. Notes recovery setup) that need to bind
// data to the account password and want to catch a typo at setup time rather
// than at recovery time. Rate-limited identically to `auth:resetWithAccountPassword`
// since the brute-force surface is the same.
const verifyAttempts = { count: 0, blockedUntil: 0 };
const VERIFY_MAX_ATTEMPTS = 5;
const VERIFY_BLOCK_MS = 30_000;

ipcMain.handle('account:verifyPassword', (_evt, { password } = {}) => {
  const now = Date.now();
  if (verifyAttempts.blockedUntil > now) {
    const remainingSec = Math.ceil((verifyAttempts.blockedUntil - now) / 1000);
    return { ok: false, error: `Too many attempts. Try again in ${remainingSec}s.` };
  }
  if (typeof password !== 'string' || !password) {
    return { ok: false, error: 'Account password is required.' };
  }
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'No active account session on this device.' };
  const accounts = readAccounts();
  const u = accounts.users.find((x) => x.id === uid);
  if (!u || typeof u.salt !== 'string' || typeof u.hash !== 'string') {
    return { ok: false, error: 'Account record is missing or corrupt.' };
  }
  try {
    const got = hashWithSalt(password, u.salt);
    const exp = Buffer.from(u.hash, 'hex');
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) {
      verifyAttempts.count += 1;
      if (verifyAttempts.count >= VERIFY_MAX_ATTEMPTS) {
        verifyAttempts.blockedUntil = now + VERIFY_BLOCK_MS;
        verifyAttempts.count = 0;
      }
      return { ok: false, error: 'Incorrect account password.' };
    }
    verifyAttempts.count = 0;
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not verify account password.' };
  }
});

const recoverWithCodesAttempts = new Map();

function recoverAttemptsFor(email) {
  const key = String(email || '').toLowerCase();
  if (!recoverWithCodesAttempts.has(key)) {
    recoverWithCodesAttempts.set(key, { count: 0, blockedUntil: 0 });
  }
  return recoverWithCodesAttempts.get(key);
}
const RECOVER_WITH_CODES_MAX_ATTEMPTS = 5;
const RECOVER_WITH_CODES_BLOCK_MS = 60_000;

/** Pending recovery envelopes — not persisted until user confirms they saved codes. */
const pendingRecoveryEnvelopes = new Map();

ipcMain.handle('account:recoverWithCodes', (_evt, { email, codes, newPassword } = {}) => {
  const now = Date.now();
  const attempts = recoverAttemptsFor(normalizeEmail(email));
  if (attempts.blockedUntil > now) {
    const remainingSec = Math.ceil((attempts.blockedUntil - now) / 1000);
    return { ok: false, error: `Too many attempts. Try again in ${remainingSec}s.` };
  }

  const em = normalizeEmail(email);
  if (!em || !Array.isArray(codes) || codes.length !== RECOVERY_CODE_COUNT) {
    return { ok: false, error: 'Email and all recovery codes are required.' };
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters.' };
  }

  const accounts = readAccounts();
  const u = accounts.users.find((x) => x.email === em);
  if (!u || !isRecoveryEnvelope(u.recoveryEnvelope)) {
    return { ok: false, error: 'Recovery is not available for this account on this device.' };
  }

  let dataKey;
  try {
    dataKey = unwrapRecoverySecret(u.recoveryEnvelope, codes);
  } catch {
    dataKey = null;
  }
  if (!dataKey) {
    attempts.count += 1;
    if (attempts.count >= RECOVER_WITH_CODES_MAX_ATTEMPTS) {
      attempts.blockedUntil = now + RECOVER_WITH_CODES_BLOCK_MS;
      attempts.count = 0;
    }
    return { ok: false, error: 'Recovery codes are incorrect.' };
  }
  attempts.count = 0;

  dataKeys.set(u.id, dataKey);
  const loaded = readUserDataResult(u.id);
  if (!loaded.ok) {
    dataKeys.delete(u.id);
    if (loaded.reason === 'bad-key') {
      return {
        ok: false,
        error:
          'Recovery codes no longer match your data (for example after a password change). Restore from a backup export or sign in with your current password.',
      };
    }
    return { ok: false, error: loaded.error ?? 'Could not read workspace.' };
  }
  const workspacePayload = loaded.data;

  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashWithSalt(newPassword, newSalt).toString('hex');
  const newEncSalt = crypto.randomBytes(16).toString('hex');
  const newKey = deriveDataKey(newPassword, newEncSalt);

  const preRecoverySnapshot = snapshotCurrentDataFile(u.id, 'pre-recovery');
  dataKeys.set(u.id, newKey);
  if (workspacePayload != null) {
    const commitResult = commitUserData(u.id, workspacePayload, { allowOverwriteUnreadable: true });
    if (!commitResult?.ok) {
      dataKeys.set(u.id, dataKey);
      return {
        ok: false,
        error: commitResult?.error ?? 'Could not re-encrypt workspace with the new password.',
      };
    }
  }

  u.salt = newSalt;
  u.hash = newHash;
  u.encSalt = newEncSalt;
  u.passwordChangedAt = new Date().toISOString();
  delete u.recoveryEnvelope;
  delete u.recoveryConfiguredAt;
  if (!writeAccounts(accounts)) {
    dataKeys.set(u.id, dataKey);
    if (preRecoverySnapshot) {
      const restored = loadWorkspaceFromBackupSet(u.id, preRecoverySnapshot);
      if (restored.ok) {
        commitUserData(u.id, restored.workspace, { allowOverwriteUnreadable: true });
      }
    }
    return {
      ok: false,
      error:
        'Could not save your new password to disk. Your workspace was restored — try again or restore from backup.',
    };
  }

  dataKeys.set(u.id, newKey);

  if (getUserRememberMe(u)) {
    persistDataKey(u.id, newKey);
  } else {
    clearPersistedDataKey(u.id);
  }

  if (!writeSession(u.id)) {
    return {
      ok: false,
      error: 'Password was reset but the session could not be saved. Sign in with your new password.',
    };
  }
  flushPendingDeepLink();

  return {
    ok: true,
    user: { id: u.id, email: u.email, displayName: typeof u.displayName === 'string' ? u.displayName : undefined },
    needsRecoverySetup: true,
  };
});

ipcMain.handle('account:setupRecovery', (_evt, { password } = {}) => {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  if (typeof password !== 'string' || !password) {
    return { ok: false, error: 'Account password is required.' };
  }

  const accounts = readAccounts();
  const u = accounts.users.find((x) => x.id === uid);
  if (!u || typeof u.salt !== 'string' || typeof u.hash !== 'string') {
    return { ok: false, error: 'Account not found.' };
  }

  try {
    const got = hashWithSalt(password, u.salt);
    const exp = Buffer.from(u.hash, 'hex');
    if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) {
      return { ok: false, error: 'Incorrect account password.' };
    }
  } catch {
    return { ok: false, error: 'Incorrect account password.' };
  }

  let dataKey = dataKeys.get(uid);
  if (!dataKey) {
    if (typeof u.encSalt !== 'string' || !u.encSalt) {
      return { ok: false, error: 'Session expired. Please sign in again.' };
    }
    dataKey = deriveDataKey(password, u.encSalt);
    dataKeys.set(uid, dataKey);
  }

  try {
    const codes = generateRecoveryCodes();
    const envelope = wrapRecoverySecret(dataKey, codes);
    pendingRecoveryEnvelopes.set(uid, envelope);
    return { ok: true, recoveryCodes: codes };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create recovery codes.' };
  }
});

ipcMain.handle('account:confirmRecoverySetup', () => {
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.' };
  const envelope = pendingRecoveryEnvelopes.get(uid);
  if (!envelope || !isRecoveryEnvelope(envelope)) {
    return { ok: false, error: 'No pending recovery setup. Generate codes again.' };
  }

  const accounts = readAccounts();
  const u = accounts.users.find((x) => x.id === uid);
  if (!u) return { ok: false, error: 'Account not found.' };

  u.recoveryEnvelope = envelope;
  u.recoveryConfiguredAt = new Date().toISOString();
  writeAccounts(accounts);
  pendingRecoveryEnvelopes.delete(uid);
  return { ok: true };
});

ipcMain.handle('account:getRecoveryStatus', () => {
  const uid = readSessionUserId();
  if (!uid) return { configured: false, signedIn: false };
  const { users } = readAccounts();
  const u = users.find((x) => x.id === uid);
  if (!u) return { configured: false, signedIn: false };
  return {
    signedIn: true,
    configured: isRecoveryEnvelope(u.recoveryEnvelope),
    configuredAt: typeof u.recoveryConfiguredAt === 'string' ? u.recoveryConfiguredAt : undefined,
  };
});

/**
 * Report whether the OS-keychain "stay signed in" cache is available on
 * this machine AND whether the currently signed-in user has opted into
 * using it. The renderer uses this to render the Settings toggle and
 * decide whether to hint "not available on Linux without libsecret".
 *
 * Defaults to `enabled: true` when the user record exists but pre-dates
 * the feature flag — matching the backfill in `account:login`.
 */
ipcMain.handle('account:getRememberMe', () => {
  const available = isKeyCacheAvailable();
  const uid = readSessionUserId();
  if (!uid) return { available, enabled: false, signedIn: false };
  const { users } = readAccounts();
  const u = users.find((x) => x.id === uid);
  if (!u) return { available, enabled: false, signedIn: false };
  return { available, enabled: getUserRememberMe(u), signedIn: true };
});

/**
 * Toggle the per-user "stay signed in" preference.
 *
 * Enabling: persist the current in-memory data key under the OS keychain
 * so the next launch can resume without a password prompt. If the key
 * cannot be persisted (no `safeStorage`, fs error) we DO NOT flip the
 * preference — better to keep the user's mental model accurate than to
 * silently leave them with a toggle that says "on" but doesn't work.
 *
 * Disabling: clear the cached key and flip the flag. The current session
 * stays unlocked (we don't kick the user out of their open workspace),
 * but the next restart will require their password again.
 */
ipcMain.handle('account:setRememberMe', (_evt, { value } = {}) => {
  const desired = value !== false;
  const uid = readSessionUserId();
  if (!uid) return { ok: false, error: 'Not signed in.', available: isKeyCacheAvailable() };
  const accounts = readAccounts();
  const u = accounts.users.find((x) => x.id === uid);
  if (!u) return { ok: false, error: 'Account not found.', available: isKeyCacheAvailable() };

  const available = isKeyCacheAvailable();
  if (desired) {
    if (!available) {
      return {
        ok: false,
        available: false,
        enabled: false,
        error: 'This system does not provide a secure keychain. Cadence will keep asking for your password on every launch.',
      };
    }
    const key = dataKeys.get(uid);
    if (!key) {
      // Defence-in-depth: we should only get here if `account:session`
      // somehow handed control back without populating the key map. In
      // practice that means the user is in the "needs re-auth" branch
      // already, so we surface a clear error instead of writing a
      // preference that points at nothing.
      return { ok: false, available, enabled: false, error: 'Session expired. Please sign in again.' };
    }
    if (!persistDataKey(uid, key)) {
      return {
        ok: false,
        available,
        enabled: false,
        error: 'Could not store the session key in your OS keychain. Try unlocking your login keyring and retry.',
      };
    }
    if (u.rememberMe !== true) {
      u.rememberMe = true;
      writeAccounts(accounts);
    }
    return { ok: true, available, enabled: true };
  }

  clearPersistedDataKey(uid);
  if (u.rememberMe !== false) {
    u.rememberMe = false;
    writeAccounts(accounts);
  }
  return { ok: true, available, enabled: false };
});

// ---------- IPC: sync ---------------------------------------------------------

ipcMain.handle('sync:status', () => {
  const cfg = readSyncConfig();
  return {
    enabled: !!cfg.enabled,
    running: !!syncServer,
    port: syncBoundPort,
    token: cfg.token ?? null,
    ips: localIPv4Addresses(),
    // `tls` carries everything the host UI needs to render the
    // "first-time pairing" explainer and the cert fingerprint badge.
    // `null` while the server is stopped — no cert is loaded into
    // memory in that state.
    tls: syncServer
      ? {
          fingerprint: syncTlsFingerprint,
          notAfter: syncTlsNotAfter,
        }
      : null,
  };
});

ipcMain.handle('sync:enable', async () => {
  // Defence in depth: the renderer hides Sync UI when policy or the
  // enterprise build flavor forbids LAN sync, but a buggy or malicious
  // renderer must not be able to spin up the LAN server anyway. The
  // `isFeatureAllowed` helper combines sidecar policy, build flavor and
  // preset defaults using the SAME precedence as the renderer (see
  // `src/lib/features.tsx`), so this is a single source of truth.
  if (!isFeatureAllowed('sync.lan')) {
    return {
      ok: false,
      error:
        'LAN sync is disabled by your organization policy. Contact your IT administrator if you need this enabled.',
    };
  }

  let cfg = readSyncConfig();
  if (!cfg.token) cfg.token = crypto.randomBytes(24).toString('base64url');
  cfg.enabled = true;
  writeSyncConfig(cfg);
  try {
    const r = await startSyncServer(SYNC_DEFAULT_PORT);
    if (!r.ok) return { ok: false, error: r.error ?? 'Could not start server.' };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
  return {
    ok: true,
    token: cfg.token,
    port: syncBoundPort,
    ips: localIPv4Addresses(),
    tls: {
      fingerprint: syncTlsFingerprint,
      notAfter: syncTlsNotAfter,
    },
  };
});

ipcMain.handle('sync:disable', async () => {
  const cfg = readSyncConfig();
  cfg.enabled = false;
  writeSyncConfig(cfg);
  await stopSyncServer();
  return { ok: true };
});

ipcMain.handle('sync:rotateToken', async () => {
  const blocked = requirePolicyFeature('sync.lan', isFeatureAllowed);
  if (blocked) return blocked;
  const cfg = readSyncConfig();
  cfg.token = crypto.randomBytes(24).toString('base64url');
  writeSyncConfig(cfg);
  if (syncServer) {
    await stopSyncServer();
    if (cfg.enabled) await startSyncServer(SYNC_DEFAULT_PORT);
  }
  return { ok: true, token: cfg.token };
});

// ---------- Google Drive OAuth (loopback) ---------------------------------------
//
// The PWA path uses a popup + same-origin redirect (`gdriveAuth.ts`). That
// can't work in Electron because the renderer doesn't have an `https://...`
// origin to redirect back to — `file://` URLs aren't accepted by Google as
// redirect targets, and we don't ship a hosted callback page.
//
// The standard alternative for desktop apps (recommended by Google's own
// guides for installed apps) is the **loopback redirect**: spin up a tiny
// localhost HTTP server, set the redirect URI to `http://127.0.0.1:<port>/oauth`,
// and capture the `?code=…` query when the user finishes the consent flow.
//
// Security notes
// --------------
//
// - PKCE is mandatory. We compute `code_verifier` + `code_challenge` here in
//   the main process, return the verifier to the renderer alongside the code,
//   and let the renderer exchange both with Google for tokens. The renderer
//   then stores tokens the same way the PWA does — single code path for
//   refresh, revoke and snapshot fetch.
//
// - The loopback server binds to 127.0.0.1 (not 0.0.0.0). Other devices on
//   the LAN can't reach it.
//
// - The server runs for at most 5 minutes and only accepts a single
//   callback. We don't keep a long-lived listener; any leftover socket is
//   closed with the response.
//
// - The redirect URI Google needs is registered against a *Desktop App*
//   OAuth client (Google Cloud Console → Credentials → OAuth client ID →
//   Application type: Desktop app). On a Desktop client, Google accepts any
//   loopback port — no need to pre-register a specific port number.

const GDRIVE_AUTH_TIMEOUT_MS = 5 * 60 * 1000;

ipcMain.handle('gdrive:beginAuth', async (_evt, payload = {}) => {
  // Defence in depth: cloud sync gating mirrors the LAN sync gating in
  // `sync:enable`. The renderer hides the "Connect Drive" button when
  // policy disables cloud sync, but a manually-issued IPC must still
  // refuse to open a browser window for the OAuth handshake.
  if (!isFeatureAllowed('sync.cloud')) {
    return {
      ok: false,
      reason: 'policy-disabled',
      detail:
        'Cloud sync is disabled by your organization policy. Contact your IT administrator if you need this enabled.',
    };
  }
  const { clientId, scopes } = payload;
  if (typeof clientId !== 'string' || !clientId) {
    return { ok: false, reason: 'no-client-id', detail: 'Client ID is required.' };
  }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return { ok: false, reason: 'unexpected', detail: 'At least one scope is required.' };
  }

  // PKCE helpers — equivalent to the renderer-side versions in
  // `gdriveAuth.ts`, but mirrored here so the main process never trusts
  // a renderer-supplied verifier (which would defeat PKCE).
  const codeVerifier = base64url(crypto.randomBytes(64));
  const codeChallenge = base64url(
    crypto.createHash('sha256').update(codeVerifier).digest(),
  );
  const state = base64url(crypto.randomBytes(16));

  try {
    const http = require('http');
    const result = await new Promise((resolve) => {
      let server;
      let timer;
      let settled = false;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        try {
          if (server) server.close();
        } catch {
          /* swallow */
        }
      };
      const settle = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      server = http.createServer((req, res) => {
        try {
          const url = new URL(req.url, 'http://127.0.0.1');
          if (url.pathname !== '/oauth') {
            res.writeHead(404).end('not found');
            return;
          }
          const incomingState = url.searchParams.get('state');
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          // Always respond with a friendly HTML page so the user sees a
          // confirmation in their browser before flipping back to the app.
          if (error || !code || incomingState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(buildLoopbackResponseHtml(false, error || 'cancelled'));
            settle({ ok: false, reason: 'user-cancelled', detail: error || 'cancelled' });
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(buildLoopbackResponseHtml(true));
          settle({ ok: true, code, codeVerifier, redirectUri: getRedirectUri(server.address().port) });
        } catch (err) {
          try {
            res.writeHead(500).end('error');
          } catch {
            /* swallow */
          }
          settle({ ok: false, reason: 'unexpected', detail: String(err) });
        }
      });

      server.on('error', (err) => {
        settle({ ok: false, reason: 'network-error', detail: String(err) });
      });

      // Bind to 127.0.0.1 with an OS-picked free port. Avoiding 0.0.0.0
      // keeps the listener invisible to anything off this machine.
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const redirectUri = getRedirectUri(port);
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', scopes.join(' '));
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('access_type', 'offline');
        // `prompt=consent` forces re-emission of the refresh token on
        // repeated sign-ins. Same rationale as the PWA path.
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('include_granted_scopes', 'true');

        shell.openExternal(authUrl.toString()).catch((err) => {
          settle({ ok: false, reason: 'unexpected', detail: String(err) });
        });

        timer = setTimeout(() => {
          settle({
            ok: false,
            reason: 'user-cancelled',
            detail: 'OAuth flow timed out — no callback received in 5 minutes.',
          });
        }, GDRIVE_AUTH_TIMEOUT_MS);
      });
    });
    return result;
  } catch (err) {
    return { ok: false, reason: 'unexpected', detail: err instanceof Error ? err.message : String(err) };
  }
});

function getRedirectUri(port) {
  return `http://127.0.0.1:${port}/oauth`;
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildLoopbackResponseHtml(success, errorDetail) {
  const title = success ? 'Cadence — Signed in' : 'Cadence — Sign-in failed';
  const body = success
    ? 'You\'re signed in. You can close this tab and return to Cadence.'
    : `Sign-in did not complete${errorDetail ? ` (${errorDetail})` : ''}. You can close this tab and try again from Cadence.`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
         color: #1d1d1f; background: #f5f5f7; margin: 0;
         min-height: 100vh; display: flex; align-items: center; justify-content: center;
         padding: 24px; box-sizing: border-box; }
  .card { max-width: 480px; background: #fff; border-radius: 14px; padding: 32px;
          box-shadow: 0 16px 40px rgba(0,0,0,.06); text-align: center; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p  { font-size: 15px; color: #4a4a4f; line-height: 1.5; margin: 0; }
  .ok { color: #1f8a3b; }
  .err { color: #c0392b; }
</style></head>
<body><div class="card">
  <h1 class="${success ? 'ok' : 'err'}">${escapeHtml(title)}</h1>
  <p>${escapeHtml(body)}</p>
</div></body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

// ---------- App lifecycle ------------------------------------------------------

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

app.whenReady().then(() => {
  initCrashReporting(app.getPath('userData'));
  initNoteHistory(() => app.getPath('userData'));
  if (!process.defaultApp) {
    app.setAsDefaultProtocolClient('cadence');
  }

  // macOS dock icon override. The packaged DMG ships with a proper `.icns`
  // baked in, so the OS picks the right icon for both Finder and the dock
  // automatically. In dev (`npm run dev`) Electron defaults to its grey
  // globe — this points the dock at our PNG so the running app feels like
  // the real product even before it's been signed and shipped.
  if (process.platform === 'darwin' && app.dock?.setIcon) {
    const dockIconPath = path.join(__dirname, '..', 'build', 'icon.png');
    if (fs.existsSync(dockIconPath)) {
      try {
        app.dock.setIcon(dockIconPath);
      } catch (err) {
        console.warn('[cadence] app.dock.setIcon failed (continuing)', err);
      }
    }
  }

  // Install a baseline Content-Security-Policy for the renderer.
  //
  // Dev vs prod split: in production the bundle is a fixed set of `self`
  // assets, so we can be strict. In dev, Vite injects:
  //   - an inline `<script type="module">` with the React-Refresh preamble
  //     (would be blocked by `script-src 'self'` without `'unsafe-inline'`)
  //   - inline `eval`-ish module wrappers for HMR (need `'unsafe-eval'`)
  //   - a websocket back to the dev server (need `ws:` in `connect-src`)
  // Locking those down in dev produces a black/blank window because the
  // first inline script in `index.html` is refused, so React never mounts.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = (IS_DEV
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "img-src 'self' data: blob: cadence-attachment:",
          "connect-src 'self' ws: wss: http://localhost:* cadence-attachment: https://api.github.com https://github.com https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ]
      : [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "img-src 'self' data: blob: cadence-attachment:",
          "connect-src 'self' cadence-attachment: https://api.github.com https://github.com https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ]
    ).join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  buildMenu();

  // Electron 25+ — `registerBufferProtocol` is deprecated; `protocol.handle` serves
  // `<img src="cadence-attachment://…">` in the editor (and fetch previews).
  protocol.handle('cadence-attachment', (request) => {
    try {
      const attachmentId = parseAttachmentUrl(request.url);
      const uid = readSessionUserId();
      if (!attachmentId || !uid) {
        return new Response('Not found', { status: 404 });
      }
      const bytes = readAttachmentBytes(uid, attachmentId);
      if (!bytes?.length) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(bytes, {
        headers: { 'Content-Type': detectAttachmentMime(bytes), 'Cache-Control': 'private' },
      });
    } catch (err) {
      console.warn('[cadence] cadence-attachment protocol failed', err);
      return new Response('Error', { status: 500 });
    }
  });

  createWindow();
  const launchUrl = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith('cadence://'));
  if (launchUrl) deliverDeepLink(launchUrl);
  initLinuxBackground({
    showMainWindow: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      } else {
        createWindow();
      }
    },
    requestQuit: () => {
      markQuitting();
      app.quit();
    },
  });
  initReminderSync({
    readUserData,
    writeUserData: (uid, payload) => commitUserData(uid, payload),
    getSessionUserId: readSessionUserId,
    notifyRenderer: (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('reminder:event', payload);
        } catch {
          /* ignore */
        }
      }
    },
    emitDeepLink: deliverDeepLink,
  });
  setupAutoUpdater();

  // Take a "known good at launch" snapshot of every per-user data file we can
  // find. This runs before the renderer even loads, so even if a buggy save
  // later in this session destroys live state, the user can recover.
  try {
    const userData = app.getPath('userData');
    const LAUNCH_DATA_RE = new RegExp(
      `^(?:${DATA_FILE_PREFIX}|${DATA_FILE_PREFIX_LEGACY})-data-([0-9a-fA-F-]{8,})\\.json$`,
    );
    for (const name of fs.readdirSync(userData)) {
      const m = name.match(LAUNCH_DATA_RE);
      if (!m) continue;
      snapshotCurrentDataFile(m[1], 'launch');
    }
  } catch (err) {
    console.warn('[cadence] launch snapshot failed', err);
  }

  // Resume LAN sync if the user enabled it previously.
  const sCfg = readSyncConfig();
  if (sCfg.enabled && sCfg.token) {
    startSyncServer(SYNC_DEFAULT_PORT).catch((err) => {
      console.error('[cadence] sync auto-start failed', err);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  if (isLinuxBackgroundActive()) return;
  app.quit();
});

process.on('uncaughtException', (err) => {
  console.error('[cadence] uncaught exception', err);
});
