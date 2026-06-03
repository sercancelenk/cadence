// @ts-nocheck
const { app, Menu, Tray } = require('electron');
const fs = require('fs');
const path = require('path');

/** @typedef {{ launchAtLogin: boolean; hideToTrayOnClose: boolean }} LinuxBackgroundPrefs */

/** @type {Tray | null} */
let tray = null;
let isQuitting = false;
/** @type {LinuxBackgroundPrefs} */
let prefs = { launchAtLogin: false, hideToTrayOnClose: true };
/** @type {(() => void) | null} */
let showMainWindowFn = null;
/** @type {(() => void) | null} */
let requestQuitFn = null;

function prefsPath() {
  return path.join(app.getPath('userData'), 'reminder-background.json');
}

function loadPrefs() {
  try {
    const raw = fs.readFileSync(prefsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    prefs = {
      launchAtLogin: parsed.launchAtLogin === true,
      hideToTrayOnClose: parsed.hideToTrayOnClose !== false,
    };
  } catch {
    prefs = { launchAtLogin: false, hideToTrayOnClose: true };
  }
}

function savePrefs() {
  try {
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(prefsPath(), `${JSON.stringify(prefs, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.warn('[cadence] reminder background prefs save failed', err);
  }
}

function applyLaunchAtLogin() {
  try {
    app.setLoginItemSettings({
      openAtLogin: prefs.launchAtLogin,
      openAsHidden: prefs.launchAtLogin && prefs.hideToTrayOnClose,
    });
  } catch (err) {
    console.warn('[cadence] setLoginItemSettings failed', err);
  }
}

function trayIconPath() {
  const candidates = [
    path.join(process.resourcesPath, 'build', 'icon.png'),
    path.join(__dirname, '..', '..', 'build', 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function createTray() {
  if (tray || process.platform !== 'linux') return;
  const icon = trayIconPath();
  if (!icon) {
    console.warn('[cadence] tray icon missing — background reminders need build/icon.png');
    return;
  }
  tray = new Tray(icon);
  tray.setToolTip('Cadence');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show Cadence',
        click: () => showMainWindowFn?.(),
      },
      { type: 'separator' },
      {
        label: 'Quit Cadence',
        click: () => requestQuitFn?.(),
      },
    ]),
  );
  tray.on('click', () => showMainWindowFn?.());
}

/**
 * @param {{ showMainWindow: () => void; requestQuit: () => void }} handlers
 */
function initLinuxBackground(handlers) {
  if (process.platform !== 'linux') return;
  showMainWindowFn = handlers.showMainWindow;
  requestQuitFn = handlers.requestQuit;
  loadPrefs();
  applyLaunchAtLogin();
  createTray();
}

/**
 * @param {import('electron').BrowserWindow} win
 */
function attachWindowCloseHandler(win) {
  if (process.platform !== 'linux') return;
  win.on('close', (event) => {
    if (isQuitting || !prefs.hideToTrayOnClose) return;
    event.preventDefault();
    win.hide();
  });
}

function markQuitting() {
  isQuitting = true;
}

function isActive() {
  return process.platform === 'linux' && tray !== null;
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

/** @returns {{ backgroundMode: boolean; launchAtLogin: boolean; hideToTrayOnClose: boolean }} */
function getBackgroundStatus() {
  return {
    backgroundMode: isActive(),
    launchAtLogin: prefs.launchAtLogin,
    hideToTrayOnClose: prefs.hideToTrayOnClose,
  };
}

/**
 * @param {{ launchAtLogin?: boolean; hideToTrayOnClose?: boolean }} partial
 */
function setBackgroundSettings(partial) {
  if (process.platform !== 'linux') {
    return { ok: false, error: 'unsupported-platform' };
  }
  if (typeof partial.launchAtLogin === 'boolean') prefs.launchAtLogin = partial.launchAtLogin;
  if (typeof partial.hideToTrayOnClose === 'boolean') prefs.hideToTrayOnClose = partial.hideToTrayOnClose;
  savePrefs();
  applyLaunchAtLogin();
  return { ok: true, ...getBackgroundStatus() };
}

module.exports = {
  initLinuxBackground,
  attachWindowCloseHandler,
  markQuitting,
  isActive,
  destroyTray,
  getBackgroundStatus,
  setBackgroundSettings,
};
