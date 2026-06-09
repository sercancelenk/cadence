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
  saveData: (data, expectedUid, expectedGeneration) =>
    ipcRenderer.invoke('data:save', data, expectedUid, expectedGeneration),
  /**
   * Blocks until the main process has fsync'd the payload (used on pagehide
   * and before quit-and-install so debounced edits are not lost).
   */
  flushPendingSaveSync: (data, expectedUid, expectedGeneration) =>
    ipcRenderer.sendSync('data:flushSync', {
      payload: data,
      expectedUid,
      expectedGeneration,
    }),
  onRequestFlush: (cb) => {
    const listener = () => {
      try {
        cb();
      } catch (err) {
        console.error('[cadence] request-flush handler threw', err);
      }
    };
    ipcRenderer.on('app:request-flush', listener);
    return () => ipcRenderer.removeListener('app:request-flush', listener);
  },
  notifyFlushDone: () => ipcRenderer.send('app:flush-done'),
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
  reminderSyncStatus: () => ipcRenderer.invoke('reminder:status'),
  requestReminderPermission: () => ipcRenderer.invoke('reminder:requestPermission'),
  setReminderBackgroundSettings: (settings) => ipcRenderer.invoke('reminder:setBackgroundSettings', settings),
  syncReminders: (data) => ipcRenderer.invoke('reminder:sync', data),
  cancelReminderSlots: (itemId) => ipcRenderer.invoke('reminder:cancelItem', { itemId }),
  onReminderEvent: (cb) => {
    const listener = (_evt, payload) => {
      try {
        cb(payload);
      } catch (err) {
        console.error('[cadence] reminder event handler threw', err);
      }
    };
    ipcRenderer.on('reminder:event', listener);
    return () => ipcRenderer.removeListener('reminder:event', listener);
  },
  onDeepLink: (cb) => {
    const listener = (_evt, payload) => {
      try {
        cb(payload);
      } catch (err) {
        console.error('[cadence] deep link handler threw', err);
      }
    };
    ipcRenderer.on('app:deepLink', listener);
    return () => ipcRenderer.removeListener('app:deepLink', listener);
  },
  userDataPath: () => ipcRenderer.invoke('app:userDataPath'),
  attachmentWrite: (payload) => ipcRenderer.invoke('attachment:write', payload),
  attachmentRead: (payload) => ipcRenderer.invoke('attachment:read', payload),
  attachmentGc: () => ipcRenderer.invoke('attachment:gc'),
  exportDataBundle: (data) => ipcRenderer.invoke('data:exportBundle', { data }),
  importDataBundle: () => ipcRenderer.invoke('data:importBundle'),
  importWorkspace: (payload) => ipcRenderer.invoke('data:importWorkspace', payload),
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
  accountGetRememberMe: () => ipcRenderer.invoke('account:getRememberMe'),
  accountSetRememberMe: (payload) => ipcRenderer.invoke('account:setRememberMe', payload),
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
