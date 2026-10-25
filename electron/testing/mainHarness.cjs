/**
 * Loads a build's real `electron/main.cjs` against a stubbed Electron and a temporary userData folder, and
 * exposes its IPC handlers. Used by the compatibility fixtures: `scripts/compat/make-fixture.mjs` drives an OLD
 * build with it to produce a data folder, and `electron/compat/compat.test.ts` drives the CURRENT build against
 * that folder.
 *
 * Handlers are reached the way the renderer reaches them (`invoke`), nothing is mocked inside main.
 */

const { EventEmitter } = require('events');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * @param {string} mainPath absolute path of the main.cjs to load
 * @param {{ userDataDir?: string, legacyHistoryInit?: boolean }} [options] `legacyHistoryInit`: older builds
 *   initialise the note-history store inside `app.whenReady`, which this stub never fires, so do it here
 */
function loadMain(mainPath, options = {}) {
  const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-harness-'));
  const state = {
    userDataDir: options.userDataDir ?? path.join(appDataDir, 'Cadence'),
    pickedOpen: { canceled: true, filePaths: [] },
    pickedSave: { canceled: true },
  };
  fs.mkdirSync(state.userDataDir, { recursive: true });
  const handlers = new Map();
  const listeners = new Map();
  const setPathCalls = [];

  class StubWorker extends EventEmitter {
    postMessage(request) {
      const { handlePersistRequest } = require(path.join(path.dirname(mainPath), 'persistence', 'persistRequest.cjs'));
      const response = handlePersistRequest(request);
      setImmediate(() => this.emit('message', response));
    }
    kill() {
      this.emit('exit', 0);
    }
  }

  const stub = {
    app: {
      getPath: (name) => (name === 'appData' ? appDataDir : state.userDataDir),
      // main.cjs points userData at its own folder name; when the caller chose the folder, keep it.
      setPath: (n, v) => {
        setPathCalls.push([n, v]);
        if (!options.userDataDir) state.userDataDir = v;
      },
      setName: () => undefined,
      getName: () => 'Cadence',
      getVersion: () => '0.0.0-harness',
      setAppUserModelId: () => undefined,
      requestSingleInstanceLock: () => true,
      on: () => undefined,
      once: () => undefined,
      quit: () => undefined,
      isPackaged: false,
      whenReady: () => new Promise(() => undefined),
      setAsDefaultProtocolClient: () => true,
      getLoginItemSettings: () => ({ openAtLogin: false }),
      setLoginItemSettings: () => undefined,
      commandLine: { appendSwitch: () => undefined },
      dock: { setBadge: () => undefined },
    },
    BrowserWindow: Object.assign(class {}, { getAllWindows: () => [], getFocusedWindow: () => null }),
    Menu: { buildFromTemplate: () => ({ popup: () => undefined }), setApplicationMenu: () => undefined },
    Tray: class {},
    Notification: Object.assign(class { show() {} }, { isSupported: () => false }),
    dialog: {
      showOpenDialog: async () => state.pickedOpen,
      showSaveDialog: async () => state.pickedSave,
    },
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      on: (channel, handler) => listeners.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
    },
    protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
    shell: { openExternal: async () => undefined, showItemInFolder: () => undefined, openPath: async () => '' },
    session: { defaultSession: { clearCache: async () => undefined, getCacheSize: async () => 0 } },
    safeStorage: { isEncryptionAvailable: () => false },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
    net: { isOnline: () => false },
    crashReporter: { start: () => undefined },
    utilityProcess: { fork: () => new StubWorker() },
    powerMonitor: new EventEmitter(),
  };

  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === 'electron') return stub;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    // A fresh load every time: main keeps state (keys, caches) in module variables.
    const buildDir = path.dirname(mainPath);
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(buildDir + path.sep) && !key.includes(`${path.sep}node_modules${path.sep}`)) delete require.cache[key];
    }
    require(mainPath);
  } finally {
    Module._load = originalLoad;
  }

  if (options.legacyHistoryInit) {
    require(path.join(path.dirname(mainPath), 'noteHistory.cjs')).initNoteHistory(() => state.userDataDir);
  }

  return {
    get userDataDir() {
      return state.userDataDir;
    },
    handlers,
    setPathCalls,
    /** Call a handler the way the renderer does. */
    async invoke(channel, ...args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler for ${channel}`);
      return handler({}, ...args);
    },
    has: (channel) => handlers.has(channel),
    pickOpen: (filePaths) => {
      state.pickedOpen = filePaths ? { canceled: false, filePaths } : { canceled: true, filePaths: [] };
    },
    pickSave: (filePath) => {
      state.pickedSave = filePath ? { canceled: false, filePath } : { canceled: true };
    },
    dispose() {
      fs.rmSync(appDataDir, { recursive: true, force: true });
    },
  };
}

module.exports = { loadMain };
