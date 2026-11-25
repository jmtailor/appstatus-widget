const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('get-state'),
  setSettings: (p) => ipcRenderer.invoke('set-settings', p),
  refresh: () => ipcRenderer.invoke('refresh'),
  reloadApps: () => ipcRenderer.invoke('reload-apps'),
  openAppsFile: () => ipcRenderer.invoke('open-apps-file'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  toggleCollapse: () => ipcRenderer.invoke('toggle-collapse'),
  hide: () => ipcRenderer.invoke('hide'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
});
