const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('miniScraper', {
  chooseFolder: () => ipcRenderer.invoke('library:choose-folder'),
  start: (options) => ipcRenderer.invoke('scrape:start', options),
  cancel: () => ipcRenderer.invoke('scrape:cancel'),
  onProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on('scrape:progress', handler);
    return () => ipcRenderer.removeListener('scrape:progress', handler);
  }
});
