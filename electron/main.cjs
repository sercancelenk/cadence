/**
 * Leeadman — Electron main process.
 *
 * Responsibilities:
 *   - Boot the application window with hardened defaults (contextIsolation, sandbox-friendly).
 *   - Persist per-user data files under `app.getPath('userData')`.
 *   - Provide IPC handlers for the renderer (data, auth, account, app metadata).
 *   - Install an English application menu and a basic auto-updater.
 *
 * Security notes:
 *   - `contextIsolation: true` and `nodeIntegration: false` are mandatory; the
 *     renderer only sees the `window.leeadman` surface exposed by preload.
 *   - We block in-app navigation to any non-dev URL and route external clicks
 *     to the user's default browser via `shell.openExternal`.
 *   - The app installs a strict-ish Content-Security-Policy header at runtime.
 */

const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  ipcMain,
  shell,
  session,
} = require('electron');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

// ---------- Single instance ----------------------------------------------------

let mainWindow = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ---------- Data paths ---------------------------------------------------------

const LEGACY_DATA_FILENAME = 'leeadman-data.json';
const ACCOUNTS_FILENAME = 'leeadman-accounts.json';
const SESSION_FILENAME = 'leeadman-session.json';
const AUTH_FILENAME = 'auth-lock.json';
const BACKUPS_DIRNAME = 'backups';
/**
 * How many rolling on-disk snapshots to keep per user. We snapshot before
 * every save, so 50 is roughly a few hours of heavy editing. The on-disk
 * format is identical to the live file (encrypted envelope or plaintext),
 * which means restore is a single file copy.
 */
const BACKUPS_KEEP_MAX = 50;

function legacyDataPath() {
  return path.join(app.getPath('userData'), LEGACY_DATA_FILENAME);
}

function dataPathForUser(userId) {
  return path.join(app.getPath('userData'), `leeadman-data-${userId}.json`);
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

// ---------- JSON utilities -----------------------------------------------------

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error('[leeadman] failed to read', filePath, err);
    return fallback;
  }
}

function writeJsonSafe(filePath, payload) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
    return true;
  } catch (err) {
    console.error('[leeadman] failed to write', filePath, err);
    return false;
  }
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

/**
 * Read-result discriminated union. `ok=false` distinguishes "no file" from
 * "file exists but undecipherable", which is critical for callers that need
 * to refuse writes instead of silently overwriting a key-mismatched file.
 */
function readUserDataResult(userId) {
  const file = dataPathForUser(userId);
  if (!fs.existsSync(file)) return { ok: true, data: null, encrypted: false };
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    console.error('[leeadman] failed to read user data', err);
    return { ok: false, reason: 'io', error: String(err) };
  }
  const key = dataKeys.get(userId);
  if (isEncryptedFile(text)) {
    if (!key) {
      console.warn('[leeadman] data file is encrypted but no key in memory for', userId);
      return { ok: false, reason: 'no-key', encrypted: true };
    }
    const plain = decryptPayload(text, key);
    if (plain == null) {
      console.warn('[leeadman] data file decrypt failed for', userId, '— wrong key?');
      return { ok: false, reason: 'bad-key', encrypted: true };
    }
    try {
      return { ok: true, data: JSON.parse(plain), encrypted: true };
    } catch {
      return { ok: false, reason: 'parse', encrypted: true };
    }
  }
  try {
    return { ok: true, data: JSON.parse(text), encrypted: false };
  } catch {
    return { ok: false, reason: 'parse', encrypted: false };
  }
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
    const live = dataPathForUser(userId);
    if (!fs.existsSync(live)) return null;
    const stat = fs.statSync(live);
    if (!stat.size) return null;
    const dir = backupsDirForUser(userId);
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `data-${label}-${ts}.json`;
    const target = path.join(dir, name);
    fs.copyFileSync(live, target);
    pruneBackups(dir);
    return target;
  } catch (err) {
    console.warn('[leeadman] snapshot failed (continuing)', err);
    return null;
  }
}

function pruneBackups(dir) {
  try {
    const entries = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith('data-') && n.endsWith('.json'))
      .map((n) => ({ name: n, full: path.join(dir, n), mtime: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of entries.slice(BACKUPS_KEEP_MAX)) {
      try { fs.unlinkSync(old.full); } catch { /* ignore */ }
    }
  } catch (err) {
    console.warn('[leeadman] prune backups failed', err);
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
function writeUserData(userId, payload, { allowOverwriteUnreadable = false } = {}) {
  const file = dataPathForUser(userId);

  if (fs.existsSync(file) && !allowOverwriteUnreadable) {
    const existing = readUserDataResult(userId);
    if (!existing.ok && (existing.reason === 'no-key' || existing.reason === 'bad-key')) {
      console.error(
        '[leeadman] refusing to overwrite undecipherable data file',
        { userId, reason: existing.reason },
      );
      return {
        ok: false,
        error:
          'A data file already exists for this account but cannot be decrypted with the current session key. Refusing to overwrite. Use Settings → Backups & Recovery to inspect or restore your data.',
        reason: existing.reason,
      };
    }
  }

  snapshotCurrentDataFile(userId, 'pre-save');

  const json = JSON.stringify(payload);
  const key = dataKeys.get(userId);
  const out = key ? encryptPayload(json, key) : json;
  const okWrite = writeJsonText(file, out);
  return okWrite ? { ok: true } : { ok: false, error: 'I/O error while writing data file.' };
}

function writeJsonText(filePath, text) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, filePath);
    return true;
  } catch (err) {
    console.error('[leeadman] failed to write', filePath, err);
    return false;
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

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function startSyncServer(port = SYNC_DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    if (syncServer) {
      resolve({ ok: true, port: syncBoundPort });
      return;
    }
    const cfg = readSyncConfig();
    if (!cfg.enabled || !cfg.token) {
      resolve({ ok: false, error: 'Sync is not enabled.' });
      return;
    }
    const server = http.createServer((req, res) => {
      applyCors(res);
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
      const auth = req.headers['authorization'] || '';
      const expected = `Bearer ${cfg.token}`;
      if (auth !== expected) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'unauthorised' }));
        return;
      }
      const uid = readSessionUserId();
      if (!uid) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'no active session on host' }));
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/v1/snapshot' && req.method === 'GET') {
        const data = readUserData(uid);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, ts: new Date().toISOString(), data }));
        return;
      }

      if (url.pathname === '/v1/snapshot' && req.method === 'POST') {
        const chunks = [];
        let total = 0;
        req.on('data', (c) => {
          total += c.length;
          if (total > 25 * 1024 * 1024) {
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        req.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8');
            const parsed = JSON.parse(body);
            const payload = parsed && typeof parsed === 'object' && parsed.data ? parsed.data : parsed;
            const writeRes = writeUserData(uid, payload);
            res.statusCode = writeRes.ok ? 200 : 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(writeRes));
          } catch (err) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'invalid payload' }));
          }
        });
        return;
      }

      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'not found' }));
    });

    server.on('error', (err) => {
      console.error('[leeadman] sync server error', err);
      reject(err);
    });
    server.listen(port, '0.0.0.0', () => {
      syncServer = server;
      syncBoundPort = server.address().port;
      resolve({ ok: true, port: syncBoundPort });
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
  writeJsonSafe(sessionPath(), { userId });
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
  writeJsonSafe(accountsPath(), data);
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

// ---------- Window -------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 880,
    minHeight: 560,
    title: 'Leeadman',
    backgroundColor: '#0b0b10',
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ---------- Application menu (English) -----------------------------------------

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const appName = app.name || 'Leeadman';

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
                  if (app.isPackaged) {
                    try {
                      const { autoUpdater } = require('electron-updater');
                      autoUpdater.checkForUpdatesAndNotify();
                    } catch (e) {
                      console.error('[leeadman] auto-updater error', e);
                    }
                  }
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
          label: 'Project on GitHub',
          click: () => {
            shell.openExternal('https://github.com/sercancelenk/leeadman');
          },
        },
        {
          label: 'Report an Issue',
          click: () => {
            shell.openExternal('https://github.com/sercancelenk/leeadman/issues/new');
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

function broadcastUpdaterEvent(event) {
  lastUpdaterEvent = event;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:event', event);
    }
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
      console.error('[leeadman] autoUpdater error', err);
      broadcastUpdaterEvent({
        status: 'error',
        message: err && typeof err.message === 'string' ? err.message : String(err),
      });
    });

    updaterInstance = autoUpdater;
    return autoUpdater;
  } catch (err) {
    console.error('[leeadman] electron-updater unavailable', err);
    return null;
  }
}

function setupAutoUpdater() {
  const u = getAutoUpdater();
  if (!u) return;
  u.checkForUpdatesAndNotify().catch((err) => {
    console.error('[leeadman] autoUpdater check failed', err);
  });
}

// ---------- IPC: data ----------------------------------------------------------

ipcMain.handle('data:load', () => {
  const uid = readSessionUserId();
  if (!uid) return null;
  return readUserData(uid);
});

ipcMain.handle('data:save', (_evt, payload) => {
  const uid = readSessionUserId();
  if (!uid) return false;
  const r = writeUserData(uid, payload);
  if (!r.ok && mainWindow) {
    // Surface destructive-write refusals to the renderer so it can show a
    // "Your data is locked, open Backups & Recovery" banner instead of the
    // user noticing only after they've typed a lot of text.
    try { mainWindow.webContents.send('data:saveError', r); } catch { /* ignore */ }
  }
  return r.ok;
});

/**
 * Diagnostic load: same data as `data:load` but with metadata so the renderer
 * can distinguish "no file yet" from "file exists, can't decrypt". The legacy
 * `data:load` is kept for back-compat (returns null on any failure).
 */
ipcMain.handle('data:loadResult', () => {
  const uid = readSessionUserId();
  if (!uid) return { ok: true, data: null, reason: 'no-session' };
  return readUserDataResult(uid);
});

// ---------- IPC: Backups & Recovery -----------------------------------------
//
// The user's data lives in `userData/leeadman-data-<userId>.json`. In the
// past, a single-user `leeadman-data.json` (no userId) was also written. We
// also continuously snapshot the live file into `userData/backups/<userId>/`
// before every save, after every login, and on demand.
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
        counts = summarizeAppData(obj);
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
            counts = summarizeAppData(obj);
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

function summarizeAppData(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return {
    teams: Array.isArray(obj.teams) ? obj.teams.length : 0,
    people: Array.isArray(obj.people) ? obj.people.length : 0,
    items: Array.isArray(obj.items) ? obj.items.length : 0,
    todoGroups: Array.isArray(obj.todoGroups) ? obj.todoGroups.length : 0,
    todoItems: Array.isArray(obj.todoItems) ? obj.todoItems.length : 0,
    lastTeamId: typeof obj.lastTeamId === 'string' ? obj.lastTeamId : undefined,
    profileName: obj.profile && typeof obj.profile.name === 'string' ? obj.profile.name : undefined,
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
    out.live = inspectDataFile(dataPathForUser(uid), uid);
    const backupsDir = backupsDirForUser(uid);
    if (fs.existsSync(backupsDir)) {
      try {
        const entries = fs
          .readdirSync(backupsDir)
          .filter((n) => n.endsWith('.json'))
          .map((n) => inspectDataFile(path.join(backupsDir, n), uid))
          .filter(Boolean)
          .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
        out.backups = entries;
      } catch (err) {
        console.warn('[leeadman] listSources backups failed', err);
      }
    }
  }

  out.legacy = inspectDataFile(legacyDataPath(), null);

  // Surface other per-user files so an admin/user can spot orphaned data files
  // from a previous account UUID (very common after registering twice).
  try {
    for (const name of fs.readdirSync(userData)) {
      const m = name.match(/^leeadman-data-([0-9a-fA-F-]{8,})\.json$/);
      if (!m) continue;
      if (uid && m[1] === uid) continue;
      const info = inspectDataFile(path.join(userData, name), m[1]);
      if (info) out.otherUsers.push(info);
    }
  } catch (err) {
    console.warn('[leeadman] listSources otherUsers failed', err);
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

  let text;
  try {
    text = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    return { ok: false, error: `Could not read source file: ${err.message ?? err}` };
  }

  let payload;
  if (isEncryptedFile(text)) {
    const key = dataKeys.get(uid);
    if (!key) return { ok: false, error: 'Session key missing. Please sign in again and retry.' };
    const plain = decryptPayload(text, key);
    if (plain == null) {
      return {
        ok: false,
        error: 'This backup is encrypted but cannot be decrypted with your current password. It probably belongs to a different account.',
      };
    }
    try {
      payload = JSON.parse(plain);
    } catch (err) {
      return { ok: false, error: `Decrypted contents are not valid JSON: ${err.message ?? err}` };
    }
  } else {
    try {
      payload = JSON.parse(text);
    } catch (err) {
      return { ok: false, error: `Source file is not valid JSON: ${err.message ?? err}` };
    }
  }

  // Snapshot the existing live file under a "pre-restore" label so the user
  // can undo the restore if they picked the wrong source.
  snapshotCurrentDataFile(uid, 'pre-restore');
  const w = writeUserData(uid, payload, { allowOverwriteUnreadable: true });
  return w.ok ? { ok: true, restoredFrom: path.basename(resolved) } : w;
});

/**
 * Open the userData folder in the OS file manager. Handy when the user wants
 * to copy a backup off to iCloud Drive / a USB stick.
 */
ipcMain.handle('data:openUserDataFolder', () => {
  shell.openPath(app.getPath('userData'));
  return { ok: true };
});

ipcMain.handle('app:showNotification', (_evt, { title, body } = {}) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title: title || 'Leeadman', body: body || '' });
  n.show();
  return true;
});

ipcMain.handle('app:userDataPath', () => app.getPath('userData'));
ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('app:checkUpdates', async () => {
  if (!app.isPackaged) return { ok: false, reason: 'dev' };
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

  try {
    await u.checkForUpdates();
    return { ok: true };
  } catch (e) {
    broadcastUpdaterEvent({ status: 'error', message: String(e) });
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('app:installUpdate', () => {
  if (!app.isPackaged) return { ok: false, reason: 'dev' };
  const u = getAutoUpdater();
  if (!u) return { ok: false, error: 'updater unavailable' };
  // Defer so this IPC can return its result before the app quits.
  setImmediate(() => {
    try {
      u.quitAndInstall();
    } catch (err) {
      console.error('[leeadman] quitAndInstall failed', err);
    }
  });
  return { ok: true };
});

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
      console.error('[leeadman] auth:setPin self-verify (round-trip) failed', {
        wrote: !!wrote,
        sameSalt: round && round.salt === salt,
        sameHash: round && round.hash === hash,
      });
      try { fs.unlinkSync(authPath()); } catch (_e) { void _e; }
      return { ok: false, error: 'PIN could not be saved reliably on this device. Please try again.' };
    }
    const reHash = hashWithSalt(safe, round.salt).toString('hex');
    if (reHash !== round.hash) {
      console.error('[leeadman] auth:setPin self-verify (re-hash) failed — keyspace mismatch');
      try { fs.unlinkSync(authPath()); } catch (_e) { void _e; }
      return { ok: false, error: 'PIN could not be saved reliably on this device. Please try again.' };
    }
  } catch (err) {
    console.error('[leeadman] auth:setPin self-verify threw', err);
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
        '[leeadman] auth:verify length mismatch — got', got.length, 'expected', exp.length,
        'salt[0..6]=', d.salt.slice(0, 6), 'authPath=', authPath(),
      );
      return { ok: false };
    }
    const matched = crypto.timingSafeEqual(got, exp);
    if (!matched) {
      console.warn(
        '[leeadman] auth:verify mismatch — pin.length=', safe.length,
        'salt[0..6]=', d.salt.slice(0, 6),
        'storedHash[0..8]=', d.hash.slice(0, 8),
        'authPath=', authPath(),
      );
    }
    return { ok: matched };
  } catch (err) {
    console.error('[leeadman] auth:verify threw', err);
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
const recoveryAttempts = { count: 0, blockedUntil: 0 };
const RECOVERY_MAX_ATTEMPTS = 5;
const RECOVERY_BLOCK_MS = 30_000;

ipcMain.handle('auth:resetWithAccountPassword', (_evt, { password } = {}) => {
  const now = Date.now();
  if (recoveryAttempts.blockedUntil > now) {
    const remainingSec = Math.ceil((recoveryAttempts.blockedUntil - now) / 1000);
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
      recoveryAttempts.count += 1;
      if (recoveryAttempts.count >= RECOVERY_MAX_ATTEMPTS) {
        recoveryAttempts.blockedUntil = now + RECOVERY_BLOCK_MS;
        recoveryAttempts.count = 0;
      }
      return { ok: false, error: 'Incorrect account password.' };
    }
    recoveryAttempts.count = 0;
    recoveryAttempts.blockedUntil = 0;
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
    createdAt: new Date().toISOString(),
    displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : undefined,
  });
  writeAccounts(accounts);
  writeSession(id);
  dataKeys.set(id, deriveDataKey(password, encSalt));

  const userPath = dataPathForUser(id);
  if (migrateLegacy === true) {
    try {
      const leg = legacyDataPath();
      if (fs.existsSync(leg) && !fs.existsSync(userPath)) {
        // Read legacy plaintext, immediately rewrite encrypted under the new key.
        const legacyText = fs.readFileSync(leg, 'utf8');
        try {
          const obj = JSON.parse(legacyText);
          writeUserData(id, obj);
        } catch {
          fs.copyFileSync(leg, userPath);
        }
      }
    } catch (e) {
      return {
        ok: true,
        user: { id, email: em, displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : undefined },
        warn: String(e),
      };
    }
  }

  return {
    ok: true,
    user: { id, email: em, displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : undefined },
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
    if (mutated) writeAccounts(accounts);
    dataKeys.set(u.id, deriveDataKey(password, u.encSalt));

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
            writeUserData(u.id, obj);
            console.log('[leeadman] auto-migrated legacy data into', u.email);
          } catch {
            fs.copyFileSync(leg, file);
          }
        } catch (err) {
          console.warn('[leeadman] legacy auto-migrate failed', err);
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
          writeUserData(u.id, obj);
        } catch {
          /* best effort */
        }
      }
    }

    writeSession(u.id);
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
  if (uid) dataKeys.delete(uid);
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

  // Decrypt with current key (or read plaintext) before rotating keys.
  const file = dataPathForUser(uid);
  let plaintextPayload = null;
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8');
    if (isEncryptedFile(text)) {
      const currentKey = dataKeys.get(uid);
      if (!currentKey) {
        return { ok: false, error: 'Session expired. Please sign in again.' };
      }
      const plain = decryptPayload(text, currentKey);
      if (plain == null) {
        return { ok: false, error: 'Could not decrypt your data with the current password.' };
      }
      try {
        plaintextPayload = JSON.parse(plain);
      } catch {
        return { ok: false, error: 'Existing data file is corrupt.' };
      }
    } else {
      try {
        plaintextPayload = JSON.parse(text);
      } catch {
        plaintextPayload = null;
      }
    }
  }

  // Generate fresh password hash + encryption salt → derive new key.
  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashWithSalt(newPassword, newSalt).toString('hex');
  const newEncSalt = crypto.randomBytes(16).toString('hex');
  const newKey = deriveDataKey(newPassword, newEncSalt);

  u.salt = newSalt;
  u.hash = newHash;
  u.encSalt = newEncSalt;
  u.passwordChangedAt = new Date().toISOString();
  writeAccounts(accounts);

  // Snapshot the about-to-be-rotated file under its old key first, then swap
  // to the new key and re-encrypt. The `allowOverwriteUnreadable` flag is
  // required because the on-disk file was encrypted under the old key (which
  // we just decrypted manually above) and the new key cannot decrypt it.
  snapshotCurrentDataFile(uid, 'pre-pwchange');
  dataKeys.set(uid, newKey);
  if (plaintextPayload != null) {
    writeUserData(uid, plaintextPayload, { allowOverwriteUnreadable: true });
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

// ---------- IPC: sync ---------------------------------------------------------

ipcMain.handle('sync:status', () => {
  const cfg = readSyncConfig();
  return {
    enabled: !!cfg.enabled,
    running: !!syncServer,
    port: syncBoundPort,
    token: cfg.token ?? null,
    ips: localIPv4Addresses(),
  };
});

ipcMain.handle('sync:enable', async () => {
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
  const cfg = readSyncConfig();
  cfg.token = crypto.randomBytes(24).toString('base64url');
  writeSyncConfig(cfg);
  if (syncServer) {
    await stopSyncServer();
    if (cfg.enabled) await startSyncServer(SYNC_DEFAULT_PORT);
  }
  return { ok: true, token: cfg.token };
});

// ---------- App lifecycle ------------------------------------------------------

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

app.whenReady().then(() => {
  // Install a baseline Content-Security-Policy for the renderer.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      // Vite injects inline styles; Google Fonts CSS is loaded from googleapis.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://api.github.com https://github.com https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  buildMenu();
  createWindow();
  setupAutoUpdater();

  // Take a "known good at launch" snapshot of every per-user data file we can
  // find. This runs before the renderer even loads, so even if a buggy save
  // later in this session destroys live state, the user can recover.
  try {
    const userData = app.getPath('userData');
    for (const name of fs.readdirSync(userData)) {
      const m = name.match(/^leeadman-data-([0-9a-fA-F-]{8,})\.json$/);
      if (!m) continue;
      snapshotCurrentDataFile(m[1], 'launch');
    }
  } catch (err) {
    console.warn('[leeadman] launch snapshot failed', err);
  }

  // Resume LAN sync if the user enabled it previously.
  const sCfg = readSyncConfig();
  if (sCfg.enabled && sCfg.token) {
    startSyncServer(SYNC_DEFAULT_PORT).catch((err) => {
      console.error('[leeadman] sync auto-start failed', err);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  void stopSyncServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  console.error('[leeadman] uncaught exception', err);
});
