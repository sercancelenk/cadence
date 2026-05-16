const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('leeadman', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  showNotification: (opts) => ipcRenderer.invoke('app:showNotification', opts),
  userDataPath: () => ipcRenderer.invoke('app:userDataPath'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authSetPin: (payload) => ipcRenderer.invoke('auth:setPin', payload),
  authVerify: (payload) => ipcRenderer.invoke('auth:verify', payload),
  authClear: (payload) => ipcRenderer.invoke('auth:clear', payload),
  accountSession: () => ipcRenderer.invoke('account:session'),
  accountRegister: (payload) => ipcRenderer.invoke('account:register', payload),
  accountLogin: (payload) => ipcRenderer.invoke('account:login', payload),
  accountLogout: () => ipcRenderer.invoke('account:logout'),
  accountHasLegacyData: () => ipcRenderer.invoke('account:hasLegacyData'),
  accountChangePassword: (payload) => ipcRenderer.invoke('account:changePassword', payload),
  syncStatus: () => ipcRenderer.invoke('sync:status'),
  syncEnable: () => ipcRenderer.invoke('sync:enable'),
  syncDisable: () => ipcRenderer.invoke('sync:disable'),
  syncRotateToken: () => ipcRenderer.invoke('sync:rotateToken'),
});
