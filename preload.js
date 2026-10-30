const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('vanmule', {
  isApp: true,
  platform: process.platform,
  status: () => ipcRenderer.invoke('van:status'),
  diag: (a) => ipcRenderer.invoke('van:diag', a),
  backup: (a) => ipcRenderer.invoke('van:backup', a),
  gpuUsage: () => ipcRenderer.invoke('van:gpu-usage'),
  update: (a) => ipcRenderer.invoke('van:update', a),
  onUpdate: (cb) => ipcRenderer.on('van:update', (_e, u) => cb(u)),
  installCable: () => ipcRenderer.invoke('van:install'),
  removeCable: () => ipcRenderer.invoke('van:remove-cable'),
  setDefaultMic: (on) => ipcRenderer.invoke('van:setDefaultMic', !!on),
  getConfig: () => ipcRenderer.invoke('van:getConfig'),
  setConfig: (c) => ipcRenderer.invoke('van:setConfig', c),
  setShortcuts: (list) => ipcRenderer.invoke('van:setShortcuts', list),
  onShortcut: (cb) => ipcRenderer.on('van:shortcut', (_e, d) => cb(d)),
  onTray: (cb) => ipcRenderer.on('van:tray', (_e, a) => cb(a)),
  restartPC: () => ipcRenderer.invoke('van:restart'),
  openExternal: (u) => ipcRenderer.invoke('van:open', u),
  pickImage: () => ipcRenderer.invoke('van:pick-image'),
  saveImage: (a) => ipcRenderer.invoke('van:image-save', a),
  files: (op, a) => ipcRenderer.invoke('van:files', op, a),
  browseSounds: (a) => ipcRenderer.invoke('van:sound-browse', a),
  watch: (a) => ipcRenderer.invoke('van:watch', a),
  games: (a) => ipcRenderer.invoke('van:games', a),
  yt: (a) => ipcRenderer.invoke('van:yt', a),
  trayEvents: (a) => ipcRenderer.send('van:tray-events', a),
  trayState: (a) => ipcRenderer.send('van:tray-state', a),
  more: (a) => ipcRenderer.invoke('van:more', a),
  onVis: (cb) => ipcRenderer.on('van:vis', (_e, hidden) => cb(hidden)),
  stateLoadSync: () => { try { return ipcRenderer.sendSync('van:state-load'); } catch { return null; } },
  remote: { push: (st) => ipcRenderer.send('van:remote-state', st), onCmd: (cb) => ipcRenderer.on('van:remote-cmd', (_e, c) => cb(c)) },
  onPtt: (cb) => ipcRenderer.on('van:ptt', (_e, s) => cb(s)),
  onYt: (cb) => ipcRenderer.on('van:yt', (_e, m) => cb(m)),
  uninstallApp: () => ipcRenderer.invoke('van:uninstall-app'),
  showMain: () => ipcRenderer.invoke('van:show-main'),
  pc: { call: (a) => ipcRenderer.invoke('van:pc', a), toggle: (k) => ipcRenderer.invoke('van:pc-toggle', k), on: (cb) => ipcRenderer.on('van:pc', (_e, m) => cb(m)) },
  rec: {
    sources: () => ipcRenderer.invoke('van:rec-sources'),
    open: (a) => ipcRenderer.invoke('van:rec-open', a),
    chunk: (id, buf) => ipcRenderer.send('van:rec-chunk', id, buf),
    close: (id) => ipcRenderer.invoke('van:rec-close', id),
    list: () => ipcRenderer.invoke('van:rec-list'),
    action: (a) => ipcRenderer.invoke('van:rec-action', a),
    protectOverlay: (on) => ipcRenderer.invoke('van:ov-protect', on)
  },
  vmsg: {
    save: (a) => ipcRenderer.invoke('van:vmsg-save', a),
    list: () => ipcRenderer.invoke('van:vmsg-list'),
    action: (a) => ipcRenderer.invoke('van:vmsg-action', a),
    drag: (file) => ipcRenderer.send('van:vmsg-drag', file)
  },
  studio: (a) => ipcRenderer.invoke('van:studio', a),
  overlay: {
    set: (on) => ipcRenderer.invoke('van:overlay', on),
    push: (st) => ipcRenderer.send('van:ov-state', st),
    onCmd: (cb) => ipcRenderer.on('van:ov-cmd', (_e, c) => cb(c)),
    onState: (cb) => ipcRenderer.on('van:overlay-state', (_e, on) => cb(on))
  },
  ai: {
    send: (m) => ipcRenderer.invoke('van:ai', m),
    connect: () => ipcRenderer.invoke('van:ai-connect'),
    pick: () => ipcRenderer.invoke('van:ai-pick'),
    pickFolder: () => ipcRenderer.invoke('van:ai-pick-folder'),
    pickIndex: () => ipcRenderer.invoke('van:ai-pick-index'),
    pickBase: () => ipcRenderer.invoke('van:ai-pick-base'),
    openFolder: () => ipcRenderer.invoke('van:ai-folder'),
    openUrl: (u) => ipcRenderer.invoke('van:open', u),
    onEvent: (cb) => ipcRenderer.on('van:ai-event', (_e, m) => cb(m))
  }
});
// Hand the engine's audio port to the page (ports can't cross the context bridge directly).
ipcRenderer.on('van:ai-port', (e) => { window.postMessage({ vanAiPort: true }, '*', e.ports); });
