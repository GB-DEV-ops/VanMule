const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ov', {
  cmd: (c) => ipcRenderer.send('van:ov-cmd', c),
  onState: (cb) => ipcRenderer.on('van:ov-state', (_e, st) => cb(st)),
  close: () => ipcRenderer.invoke('van:overlay', false),
  openMain: () => ipcRenderer.invoke('van:show-main')
});
