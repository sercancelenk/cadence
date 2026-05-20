const { contextBridge, ipcRenderer } = require('electron');

// Surface the IPC bridge under the new name (`cadence`). We also expose
// the legacy `leeadman` alias so any code path we miss during the rename
// keeps working — TypeScript users should prefer `window.cadence`.
const api = {
  loadData: () => ipcRenderer.invoke('data:load'),
  loadDataResult: () => ipcRenderer.invoke('data:loadResult'),
  // Optional `expectedUid` is a defence-in-depth guard against the
  // "fast logout → login → late timer fires" race documented in
  // electron/main.cjs `data:save`. New callers should always pass it;
  // omitting it falls back to the old "trust the active session" path
  // for any legacy renderer code we haven't migrated yet.
  saveData: (data, expectedUid) => ipcRenderer.invoke('data:save', data, expectedUid),
  dataListSources: () => ipcRenderer.invoke('data:listSources'),
  dataPreviewSource: (payload) => ipcRenderer.invoke('data:previewSource', payload),
  dataRestoreFromSource: (payload) => ipcRenderer.invoke('data:restoreFromSource', payload),
  openUserDataFolder: () => ipcRenderer.invoke('data:openUserDataFolder'),
  revealInOS: (payload) => ipcRenderer.invoke('data:revealInOS', payload),
  cacheStats: () => ipcRenderer.invoke('cache:stats'),
  clearChromiumCache: () => ipcRenderer.invoke('cache:clearChromium'),
  onSaveError: (cb) => {
    const listener = (_evt, payload) => {
      try { cb(payload); } catch (err) { console.error('[cadence] save error handler threw', err); }
    };
    ipcRenderer.on('data:saveError', listener);
    return () => ipcRenderer.removeListener('data:saveError', listener);
  },
  showNotification: (opts) => ipcRenderer.invoke('app:showNotification', opts),
  userDataPath: () => ipcRenderer.invoke('app:userDataPath'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
  onUpdaterEvent: (cb) => {
    const listener = (_evt, payload) => {
      try { cb(payload); } catch (err) { console.error('[cadence] updater event handler threw', err); }
    };
    ipcRenderer.on('updater:event', listener);
    return () => ipcRenderer.removeListener('updater:event', listener);
  },
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authSetPin: (payload) => ipcRenderer.invoke('auth:setPin', payload),
  authVerify: (payload) => ipcRenderer.invoke('auth:verify', payload),
  authClear: (payload) => ipcRenderer.invoke('auth:clear', payload),
  authResetWithAccountPassword: (payload) => ipcRenderer.invoke('auth:resetWithAccountPassword', payload),
  accountSession: () => ipcRenderer.invoke('account:session'),
  accountRegister: (payload) => ipcRenderer.invoke('account:register', payload),
  accountLogin: (payload) => ipcRenderer.invoke('account:login', payload),
  accountLogout: () => ipcRenderer.invoke('account:logout'),
  accountHasLegacyData: () => ipcRenderer.invoke('account:hasLegacyData'),
  accountChangePassword: (payload) => ipcRenderer.invoke('account:changePassword', payload),
  accountVerifyPassword: (payload) => ipcRenderer.invoke('account:verifyPassword', payload),
  policyGet: () => ipcRenderer.invoke('policy:get'),
  syncStatus: () => ipcRenderer.invoke('sync:status'),
  syncEnable: () => ipcRenderer.invoke('sync:enable'),
  syncDisable: () => ipcRenderer.invoke('sync:disable'),
  syncRotateToken: () => ipcRenderer.invoke('sync:rotateToken'),
  gdriveAuth: {
    // Loopback OAuth flow for Electron. Main process spins up a
    // localhost HTTP server, opens the system browser, captures the
    // `?code=` callback and returns it to the renderer. Token
    // exchange happens in the renderer like in the PWA — keeps the
    // crypto code path single-sourced.
    start: (payload) => ipcRenderer.invoke('gdrive:beginAuth', payload),
  },
};

contextBridge.exposeInMainWorld('cadence', api);
// Backwards-compatible alias for any code path that hasn't been migrated to
// `window.cadence` yet. Remove once the renderer no longer touches the
// legacy name.
contextBridge.exposeInMainWorld('leeadman', api);
