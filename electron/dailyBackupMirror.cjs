/**
 * Optional daily full-backup mirror to a user-chosen folder (desktop only).
 *
 * Expand-only / machine-local: prefs live under Electron userData, never inside
 * the workspace AppData JSON. Older builds ignore this file entirely — no
 * DATA_VERSION bump, no behavior change when `mirrorDir` is unset.
 *
 * In-app rolling snapshots are unchanged. This only adds an off-app safety net.
 */

'use strict';

const { isCatastrophicEmptyOverwrite } = require('./persistence/dataIntegrity.cjs');
const {
  MIRROR_KEEP_CHOICES,
  normalizeMirrorKeep,
  planMirrorPrune,
} = require('./persistence/retentionPolicy.cjs');

const PREFS_VERSION = 1;
/** `cadence-daily-<userIdShort>-YYYY-MM-DD` (userIdShort = first 8 of UUID). */
const DAILY_FOLDER_RE = /^(.+)-daily-([0-9a-f]{8})-(\d{4}-\d{2}-\d{2})$/i;

/**
 * @param {Date} [now]
 * @returns {string} Local calendar date YYYY-MM-DD
 */
function localDateKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Stable short id for folder names (UUID prefix). Rejects path-like userIds.
 * @param {string} userId
 */
function userIdFolderSegment(userId) {
  const raw = typeof userId === 'string' ? userId.trim() : '';
  const m = /^([0-9a-f]{8})/i.exec(raw);
  return m ? m[1].toLowerCase() : 'unknown';
}

/**
 * @param {string} appSlug
 * @param {string} userId
 * @param {string} dateKey
 */
function dailyFolderName(appSlug, userId, dateKey) {
  return `${appSlug}-daily-${userIdFolderSegment(userId)}-${dateKey}`;
}

/**
 * @param {string | null | undefined} mirrorDir
 * @param {string | null | undefined} lastDailyDate
 * @param {string} todayKey
 */
function shouldRunDailyMirror(mirrorDir, lastDailyDate, todayKey) {
  if (typeof mirrorDir !== 'string' || !mirrorDir.trim()) return false;
  if (typeof todayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) return false;
  if (lastDailyDate === todayKey) return false;
  return true;
}

/**
 * True when today's daily folder has parseable data.json + cadence-bundle-v2 manifest.
 * Existence alone is not enough — stubs would lock out a real rewrite for the day.
 *
 * @param {{ fs: typeof import('fs'); path: typeof import('path'); mirrorDir: string; appSlug: string; userId: string; dateKey: string }} opts
 */
function isDailyFolderComplete(opts) {
  const { fs, path, mirrorDir, appSlug, userId, dateKey } = opts;
  if (!mirrorDir || typeof mirrorDir !== 'string') return false;
  const finalPath = path.join(mirrorDir, dailyFolderName(appSlug, userId, dateKey));
  try {
    const dataPath = path.join(finalPath, 'data.json');
    const manPath = path.join(finalPath, 'manifest.json');
    if (!fs.existsSync(dataPath) || !fs.existsSync(manPath)) return false;
    const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
    if (!man || typeof man !== 'object' || man.format !== 'cadence-bundle-v2') return false;
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    return Boolean(data && typeof data === 'object');
  } catch {
    return false;
  }
}

/**
 * @param {unknown} raw
 * @returns {{ version: number; mirrorDir: string | null; keepFolders: number | null; lastDailyDate: string | null; lastOkPath: string | null; lastOkAt: string | null; lastError: string | null; lastErrorAt: string | null }}
 */
function normalizePrefs(raw) {
  const o = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const mirrorDir = typeof o.mirrorDir === 'string' && o.mirrorDir.trim() ? o.mirrorDir.trim() : null;
  const lastDailyDate =
    typeof o.lastDailyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.lastDailyDate)
      ? o.lastDailyDate
      : null;
  return {
    version: PREFS_VERSION,
    mirrorDir,
    // Optional and expand-only: absent / unknown means "use the default".
    keepFolders: MIRROR_KEEP_CHOICES.includes(o.keepFolders) ? o.keepFolders : null,
    lastDailyDate,
    lastOkPath: typeof o.lastOkPath === 'string' ? o.lastOkPath : null,
    lastOkAt: typeof o.lastOkAt === 'string' ? o.lastOkAt : null,
    lastError: typeof o.lastError === 'string' ? o.lastError : null,
    lastErrorAt: typeof o.lastErrorAt === 'string' ? o.lastErrorAt : null,
  };
}

/**
 * @param {string} userDataDir
 * @param {string} filePrefix
 * @param {string} userId
 */
function prefsPathForUser(userDataDir, filePrefix, userId) {
  const safe = typeof userId === 'string' ? userId.replace(/[^a-zA-Z0-9_-]/g, '') : 'unknown';
  return require('path').join(userDataDir, `${filePrefix}-daily-backup-${safe}.json`);
}

/**
 * @param {{ fs: typeof import('fs'); path: typeof import('path'); userDataDir: string; filePrefix: string; userId: string }} deps
 */
function readPrefs(deps) {
  const file = prefsPathForUser(deps.userDataDir, deps.filePrefix, deps.userId);
  try {
    if (!deps.fs.existsSync(file)) return normalizePrefs(null);
    const raw = JSON.parse(deps.fs.readFileSync(file, 'utf8'));
    return normalizePrefs(raw);
  } catch {
    return normalizePrefs(null);
  }
}

/**
 * @param {{ fs: typeof import('fs'); path: typeof import('path'); userDataDir: string; filePrefix: string; userId: string; writeJsonText: (filePath: string, text: string) => { ok: boolean; error?: string } }} deps
 * @param {ReturnType<typeof normalizePrefs>} prefs
 */
function writePrefs(deps, prefs) {
  const file = prefsPathForUser(deps.userDataDir, deps.filePrefix, deps.userId);
  const body = JSON.stringify(normalizePrefs(prefs), null, 2);
  return deps.writeJsonText(file, body);
}

/**
 * This account's daily folders in `mirrorDir`, split into backups that can be
 * ranked and stray `*.partial` / `*.displaced` leftovers.
 *
 * Legacy `app-daily-YYYY-MM-DD` folders have no user segment, so in a shared
 * mirror dir they cannot be told apart from another account's: they are never
 * listed here, hence never deleted.
 *
 * Folders dated after `todayKey` (a clock that was wrong, or a folder copied in) are left out
 * entirely: they must neither push today's real backup out of the ranking nor be deleted.
 *
 * @param {{ fs: typeof import('fs'); path: typeof import('path'); mirrorDir: string; appSlug: string; userId: string; todayKey?: string }} opts
 * @returns {{ folders: { name: string; dateKey: string; complete: boolean }[]; strays: string[] }}
 */
function listDailyMirrorFolders(opts) {
  const { fs, path, mirrorDir, appSlug, userId } = opts;
  const todayKey = opts.todayKey ?? localDateKey();
  const folders = [];
  const strays = [];
  if (!mirrorDir || !fs.existsSync(mirrorDir)) return { folders, strays };
  const uidSeg = userIdFolderSegment(userId);

  for (const name of fs.readdirSync(mirrorDir)) {
    try {
      if (!fs.statSync(path.join(mirrorDir, name)).isDirectory()) continue;
    } catch {
      continue;
    }
    const isStray = name.endsWith('.partial') || name.endsWith('.displaced');
    const baseName = isStray ? name.slice(0, name.lastIndexOf('.')) : name;
    const modern = DAILY_FOLDER_RE.exec(baseName);
    if (!modern || modern[1] !== appSlug || modern[2].toLowerCase() !== uidSeg) continue;
    if (isStray) {
      strays.push(name);
      continue;
    }
    const dateKey = modern[3];
    if (!parseDateKey(dateKey) || dateKey > todayKey) continue;
    folders.push({
      name,
      dateKey,
      // Existence alone is not a backup; see isDailyFolderComplete.
      complete: isDailyFolderComplete({ fs, path, mirrorDir, appSlug, userId, dateKey }),
    });
  }
  return { folders, strays };
}

/**
 * Daily folders that trimming to `keepFolders` would delete, without deleting.
 *
 * @param {{ fs: typeof import('fs'); path: typeof import('path'); mirrorDir: string; appSlug: string; userId: string; keepFolders?: number | null; todayKey?: string }} opts
 * @returns {string[]} folder names, oldest first
 */
function planDailyMirrorTrim(opts) {
  const { folders } = listDailyMirrorFolders(opts);
  return planMirrorPrune(folders, normalizeMirrorKeep(opts.keepFolders)).remove;
}

/**
 * Keep the newest `keepFolders` complete daily folders of this account and
 * delete the older ones. With `removeStrays`, also drop this account's leftover
 * `*.partial` / `*.displaced` dirs — only safe when no write is in flight.
 *
 * @param {{ fs: typeof import('fs'); path: typeof import('path'); mirrorDir: string; appSlug: string; userId: string; keepFolders?: number | null; removeStrays?: boolean; todayKey?: string }} opts
 * @returns {number} number of directories removed
 */
function pruneDailyMirrorFolders(opts) {
  const { fs, path, mirrorDir, removeStrays = true } = opts;
  const { folders, strays } = listDailyMirrorFolders(opts);
  const doomed = [
    ...(removeStrays ? strays : []),
    ...planMirrorPrune(folders, normalizeMirrorKeep(opts.keepFolders)).remove,
  ];
  let removed = 0;
  for (const name of doomed) {
    try {
      fs.rmSync(path.join(mirrorDir, name), { recursive: true, force: true });
      removed += 1;
    } catch {
      /* best-effort */
    }
  }
  return removed;
}

/**
 * @param {string} key
 * @returns {Date | null}
 */
function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * The mirror folder usually sits in a synced cloud folder, so it carries no API keys or
 * extra-header values (they can hold tokens). Mirrors `stripAiSecrets` in src/lib/ai/secrets.ts;
 * the encrypted data file is untouched and keeps its keys.
 */
const AI_SECRET_FIELDS = ['apiKey', 'extraHeaders'];
const SECRET_PARAM = /key|token|secret|auth|sig|pass|credential/i;

function scrubRequestPath(p) {
  const q = p.indexOf('?');
  if (q === -1) return p;
  const kept = p
    .slice(q + 1)
    .split('&')
    .filter((pair) => {
      const eq = pair.indexOf('=');
      const name = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      return !(SECRET_PARAM.test(name) && value !== '' && value !== '{apiKey}');
    });
  return kept.length ? `${p.slice(0, q)}?${kept.join('&')}` : p.slice(0, q);
}

function scrubBaseUrl(url) {
  const m = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)(.*)$/i.exec(url);
  if (!m) return scrubRequestPath(url);
  const authority = m[2];
  const at = authority.lastIndexOf('@');
  return `${m[1]}${at === -1 ? authority : authority.slice(at + 1)}${scrubRequestPath(m[3])}`;
}

function withoutAiSecrets(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  const copy = { ...entry };
  for (const key of AI_SECRET_FIELDS) delete copy[key];
  if (typeof copy.baseUrl === 'string') copy.baseUrl = scrubBaseUrl(copy.baseUrl);
  if (typeof copy.requestPath === 'string') copy.requestPath = scrubRequestPath(copy.requestPath);
  return copy;
}

function stripAiSecretsForMirror(payload) {
  const ai = payload && payload.aiSettings;
  if (!ai || typeof ai !== 'object') return payload;
  const next = withoutAiSecrets(ai);
  if (Array.isArray(ai.connections)) next.connections = ai.connections.map(withoutAiSecrets);
  if (Array.isArray(ai.unreadConnections)) next.unreadConnections = ai.unreadConnections.map(withoutAiSecrets);
  return { ...payload, aiSettings: next };
}

/**
 * Write one daily full-export folder (same shape as Settings → Export full backup).
 *
 * @param {{
 *   fs: typeof import('fs');
 *   path: typeof import('path');
 *   mirrorDir: string;
 *   appSlug: string;
 *   userId: string;
 *   dateKey: string;
 *   workspacePayload: object;
 *   writeJsonText: (filePath: string, text: string) => { ok: boolean; error?: string };
 *   exportAttachments: (destDir: string) => number;
 *   exportNoteHistory: (destFolder: string) => void;
 *   countNoteHistoryRevisions: () => number;
 *   force?: boolean;
 * }} opts
 * @returns {{ ok: true; path: string; attachmentCount: number } | { ok: false; error: string }}
 */
function writeDailyFullExport(opts) {
  const {
    fs,
    path,
    mirrorDir,
    appSlug,
    userId,
    dateKey,
    workspacePayload,
    writeJsonText,
    exportAttachments,
    exportNoteHistory,
    countNoteHistoryRevisions,
    force = false,
  } = opts;

  if (!mirrorDir || typeof mirrorDir !== 'string') {
    return { ok: false, error: 'No mirror folder configured.' };
  }
  if (!workspacePayload || typeof workspacePayload !== 'object') {
    return { ok: false, error: 'Workspace payload missing.' };
  }

  try {
    fs.mkdirSync(mirrorDir, { recursive: true });
  } catch (err) {
    return { ok: false, error: `Cannot create mirror folder: ${String(err?.message || err)}` };
  }

  const finalName = dailyFolderName(appSlug, userId, dateKey);
  const finalPath = path.join(mirrorDir, finalName);
  const partialPath = `${finalPath}.partial`;

  // Idempotent: a complete folder for today means we are done (unless forced).
  if (
    !force &&
    isDailyFolderComplete({ fs, path, mirrorDir, appSlug, userId, dateKey })
  ) {
    return { ok: true, path: finalPath, attachmentCount: -1 };
  }

  // Never replace a populated daily data.json with an empty scaffold (force or rewrite).
  if (fs.existsSync(path.join(finalPath, 'data.json'))) {
    try {
      const previous = JSON.parse(fs.readFileSync(path.join(finalPath, 'data.json'), 'utf8'));
      if (isCatastrophicEmptyOverwrite(previous, workspacePayload)) {
        return {
          ok: false,
          error: "Refusing to replace today's daily backup with an empty workspace.",
        };
      }
    } catch {
      /* unreadable previous → allow rewrite */
    }
  }

  const cleanupPartial = () => {
    try {
      if (fs.existsSync(partialPath)) fs.rmSync(partialPath, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  try {
    cleanupPartial();
    fs.mkdirSync(partialPath, { recursive: true });

    const dataWrite = writeJsonText(
      path.join(partialPath, 'data.json'),
      JSON.stringify(stripAiSecretsForMirror(workspacePayload), null, 2),
    );
    if (!dataWrite.ok) {
      cleanupPartial();
      return { ok: false, error: dataWrite.error || 'Could not write data.json.' };
    }

    const attDest = path.join(partialPath, 'attachments');
    const attachmentCount = exportAttachments(attDest);
    const noteHistoryRevisionCount = countNoteHistoryRevisions();
    exportNoteHistory(partialPath);

    const manifestWrite = writeJsonText(
      path.join(partialPath, 'manifest.json'),
      JSON.stringify(
        {
          format: 'cadence-bundle-v2',
          exportedAt: new Date().toISOString(),
          attachmentsPortable: true,
          attachmentCount,
          noteHistoryRevisionCount,
          dailyMirror: true,
          dailyDate: dateKey,
          userIdSegment: userIdFolderSegment(userId),
        },
        null,
        2,
      ),
    );
    if (!manifestWrite.ok) {
      cleanupPartial();
      return { ok: false, error: manifestWrite.error || 'Could not write manifest.json.' };
    }

    // Replace final atomically: rename final aside, rename partial in, drop aside.
    const displaced = `${finalPath}.displaced`;
    try {
      if (fs.existsSync(displaced)) fs.rmSync(displaced, { recursive: true, force: true });
      if (fs.existsSync(finalPath)) fs.renameSync(finalPath, displaced);
      fs.renameSync(partialPath, finalPath);
      if (fs.existsSync(displaced)) fs.rmSync(displaced, { recursive: true, force: true });
    } catch (err) {
      // Roll back if rename-in failed and we still have the previous final.
      try {
        if (!fs.existsSync(finalPath) && fs.existsSync(displaced)) {
          fs.renameSync(displaced, finalPath);
        }
      } catch {
        /* ignore */
      }
      cleanupPartial();
      return { ok: false, error: String(err?.message || err) };
    }
    return { ok: true, path: finalPath, attachmentCount };
  } catch (err) {
    cleanupPartial();
    return { ok: false, error: String(err?.message || err) };
  }
}

/** @type {Set<string>} */
const inFlightUsers = new Set();

/**
 * Best-effort daily mirror. Never throws. No-op when unset or already done today.
 *
 * @param {{
 *   fs: typeof import('fs');
 *   path: typeof import('path');
 *   userDataDir: string;
 *   filePrefix: string;
 *   userId: string;
 *   appSlug: string;
 *   workspacePayload: object;
 *   writeJsonText: (filePath: string, text: string) => { ok: boolean; error?: string };
 *   exportAttachments: (destDir: string) => number;
 *   exportNoteHistory: (destFolder: string) => void;
 *   countNoteHistoryRevisions: () => number;
 *   now?: Date;
 *   force?: boolean;
 * }} deps
 * @returns {{ ran: boolean; skipped?: string; ok?: boolean; path?: string; error?: string }}
 */
function maybeRunDailyBackupMirror(deps) {
  const todayKey = localDateKey(deps.now);
  const prefs = readPrefs(deps);
  const force = Boolean(deps.force);

  if (!prefs.mirrorDir) {
    return { ran: false, skipped: 'not-configured' };
  }

  if (!force && !shouldRunDailyMirror(prefs.mirrorDir, prefs.lastDailyDate, todayKey)) {
    // Prefs say "done today" but the folder may have been deleted — rewrite.
    const complete = isDailyFolderComplete({
      fs: deps.fs,
      path: deps.path,
      mirrorDir: prefs.mirrorDir,
      appSlug: deps.appSlug,
      userId: deps.userId,
      dateKey: todayKey,
    });
    if (complete) {
      return { ran: false, skipped: 'already-today' };
    }
  }

  if (inFlightUsers.has(deps.userId)) {
    return { ran: false, skipped: 'in-flight' };
  }
  inFlightUsers.add(deps.userId);

  try {
    const result = writeDailyFullExport({
      fs: deps.fs,
      path: deps.path,
      mirrorDir: /** @type {string} */ (prefs.mirrorDir),
      appSlug: deps.appSlug,
      userId: deps.userId,
      dateKey: todayKey,
      workspacePayload: deps.workspacePayload,
      writeJsonText: deps.writeJsonText,
      exportAttachments: deps.exportAttachments,
      exportNoteHistory: deps.exportNoteHistory,
      countNoteHistoryRevisions: deps.countNoteHistoryRevisions,
      force,
    });

    if (result.ok) {
      const next = {
        ...prefs,
        lastDailyDate: todayKey,
        lastOkPath: result.path,
        lastOkAt: new Date().toISOString(),
        lastError: null,
        lastErrorAt: null,
      };
      writePrefs(deps, next);
      try {
        pruneDailyMirrorFolders({
          fs: deps.fs,
          path: deps.path,
          mirrorDir: /** @type {string} */ (prefs.mirrorDir),
          appSlug: deps.appSlug,
          userId: deps.userId,
          keepFolders: prefs.keepFolders,
          todayKey,
        });
      } catch {
        /* prune is best-effort */
      }
      return { ran: true, ok: true, path: result.path };
    }

    const failed = {
      ...prefs,
      lastError: result.error,
      lastErrorAt: new Date().toISOString(),
    };
    writePrefs(deps, failed);
    return { ran: true, ok: false, error: result.error };
  } finally {
    inFlightUsers.delete(deps.userId);
  }
}

module.exports = {
  PREFS_VERSION,
  localDateKey,
  userIdFolderSegment,
  dailyFolderName,
  shouldRunDailyMirror,
  isDailyFolderComplete,
  normalizePrefs,
  prefsPathForUser,
  readPrefs,
  writePrefs,
  listDailyMirrorFolders,
  planDailyMirrorTrim,
  pruneDailyMirrorFolders,
  writeDailyFullExport,
  stripAiSecretsForMirror,
  maybeRunDailyBackupMirror,
};
