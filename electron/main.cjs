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

function hashWithSalt(value, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.scryptSync(String(value), salt, 64);
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

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.on('error', (err) => {
      console.error('[leeadman] autoUpdater error', err);
    });
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[leeadman] autoUpdater check failed', err);
    });
  } catch (err) {
    console.error('[leeadman] electron-updater unavailable', err);
  }
}

// ---------- IPC: data ----------------------------------------------------------

ipcMain.handle('data:load', () => {
  const uid = readSessionUserId();
  if (!uid) return null;
  return readJsonSafe(dataPathForUser(uid), null);
});

ipcMain.handle('data:save', (_evt, payload) => {
  const uid = readSessionUserId();
  if (!uid) return false;
  return writeJsonSafe(dataPathForUser(uid), payload);
});

ipcMain.handle('app:showNotification', (_evt, { title, body } = {}) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title: title || 'Leeadman', body: body || '' });
  n.show();
  return true;
});

ipcMain.handle('app:userDataPath', () => app.getPath('userData'));
ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('app:checkUpdates', () => {
  if (!app.isPackaged) return { ok: false, reason: 'dev' };
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[leeadman] update check failed', err);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// ---------- IPC: auth (PIN) ---------------------------------------------------

ipcMain.handle('auth:status', () => {
  return { enabled: fs.existsSync(authPath()) };
});

ipcMain.handle('auth:setPin', (_evt, { pin } = {}) => {
  if (typeof pin !== 'string' || pin.length < 4) {
    return { ok: false, error: 'PIN must be at least 4 characters.' };
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashWithSalt(pin, salt).toString('hex');
  const ok = writeJsonSafe(authPath(), { salt, hash });
  return ok ? { ok: true } : { ok: false, error: 'Could not save PIN.' };
});

ipcMain.handle('auth:verify', (_evt, { pin } = {}) => {
  const d = readAuth();
  if (!d || typeof d.salt !== 'string' || typeof d.hash !== 'string') return { ok: true };
  if (typeof pin !== 'string') return { ok: false };
  try {
    const got = hashWithSalt(pin, d.salt);
    const exp = Buffer.from(d.hash, 'hex');
    if (got.length !== exp.length) return { ok: false };
    return { ok: crypto.timingSafeEqual(got, exp) };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('auth:clear', (_evt, { pin } = {}) => {
  const d = readAuth();
  if (!d) return { ok: true };
  if (typeof pin !== 'string') return { ok: false, error: 'PIN required.' };
  try {
    const got = hashWithSalt(pin, d.salt);
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
  accounts.users.push({
    id,
    email: em,
    salt,
    hash,
    createdAt: new Date().toISOString(),
    displayName: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : undefined,
  });
  writeAccounts(accounts);
  writeSession(id);

  const userPath = dataPathForUser(id);
  if (migrateLegacy === true) {
    try {
      const leg = legacyDataPath();
      if (fs.existsSync(leg) && !fs.existsSync(userPath)) {
        fs.copyFileSync(leg, userPath);
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
  clearSession();
  return { ok: true };
});

ipcMain.handle('account:hasLegacyData', () => {
  try {
    return { has: fs.existsSync(legacyDataPath()) };
  } catch {
    return { has: false };
  }
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
      "connect-src 'self' https://api.github.com https://github.com",
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  console.error('[leeadman] uncaught exception', err);
});
