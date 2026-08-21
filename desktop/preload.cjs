const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('miniScraper', {
  chooseFolder: () => ipcRenderer.invoke('library:choose-folder'),
  chooseMediaFolder: () => ipcRenderer.invoke('library:choose-media-folder'),
  getRetroAchievementsSession: () => ipcRenderer.invoke('retroachievements:session'),
  loginRetroAchievements: (credentials) => ipcRenderer.invoke('retroachievements:login', credentials),
  logoutRetroAchievements: () => ipcRenderer.invoke('retroachievements:logout'),
  start: (options) => ipcRenderer.invoke('scrape:start', options),
  cancel: () => ipcRenderer.invoke('scrape:cancel'),
  onProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on('scrape:progress', handler);
    return () => ipcRenderer.removeListener('scrape:progress', handler);
  },
  onNetworkStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on('scrape:network-status', handler);
    return () => ipcRenderer.removeListener('scrape:network-status', handler);
  }
});
