// Bridge for VanMule's small windows (performance overlay, volume mixer, desktop widgets)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('MINI', {
  call: (a) => ipcRenderer.invoke('van:mini', a),
  on: (cb) => ipcRenderer.on('van:mini', (_e, m) => cb(m)),
});
