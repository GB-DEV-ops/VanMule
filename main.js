const { app, BrowserWindow, ipcMain, session, globalShortcut, Tray, Menu, nativeImage, shell, dialog, utilityProcess, MessageChannelMain, net, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

// Keep audio running smoothly when the window is hidden or in the background.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.setAppUserModelId('com.vanmule.app');

// The app used to be called Vox Forge. Move its settings, voices and sounds to the new VanMule folder once.
(() => {
  try {
    const appData = app.getPath('appData'), legacy = path.join(appData, 'Vox Forge'), now = path.join(appData, 'VanMule');
    if (!fs.existsSync(now) && fs.existsSync(legacy)) { try { fs.renameSync(legacy, now); } catch { app.setPath('userData', legacy); return; } }
    app.setPath('userData', now);
  } catch {}
})();

const isWin = process.platform === 'win32';
const res = (...p) => (app.isPackaged ? path.join(process.resourcesPath, ...p) : path.join(__dirname, ...p));
let win = null, tray = null, quitting = false;

/* ---------- config ---------- */
const cfgPath = () => path.join(app.getPath('userData'), 'app-config.json');
let cfg = { startMinimized: false, closeToTray: true, defaultMic: true, prevMic: '', trayHintShown: false, voicesDir: '', soundsDir: '', recDir: '', ovHideFromCapture: true, updateRepo: '', autoUpdate: true, skipVersion: '', tmdbKey: '', omdbKey: '', itadKey: '', rawgKey: '', oddsKey: '' };
function loadCfg() { try { Object.assign(cfg, JSON.parse(fs.readFileSync(cfgPath(), 'utf8'))); } catch {} }
// Keys built into VanMule. A key the user pastes in Setup always wins.
// Built-in API keys live in keys.json next to main.js (not in the source), so the code can be published without them.
// Copy keys.example.json to keys.json and fill in what you have; everything works without them, with the user's own keys from Setup.
const BUILTIN = (() => { const empty = { tmdb: '', omdb: '', rawg: '', itad: '', odds: '', yahooId: '', yahooSecret: '', discordId: '' }; try { return Object.assign(empty, JSON.parse(fs.readFileSync(path.join(__dirname, 'keys.json'), 'utf8'))); } catch { return empty; } })();
const KEY = { get tmdb() { return cfg.tmdbKey || BUILTIN.tmdb; }, get omdb() { return cfg.omdbKey || BUILTIN.omdb; }, get rawg() { return cfg.rawgKey || BUILTIN.rawg; }, get itad() { return cfg.itadKey || BUILTIN.itad; }, get odds() { return cfg.oddsKey || BUILTIN.odds; } };
const builtinUse = () => ({ tmdb: !cfg.tmdbKey && !!BUILTIN.tmdb, omdb: !cfg.omdbKey && !!BUILTIN.omdb, rawg: !cfg.rawgKey && !!BUILTIN.rawg, itad: !cfg.itadKey && !!BUILTIN.itad, odds: !cfg.oddsKey && !!BUILTIN.odds });
function saveCfg() { try { fs.writeFileSync(cfgPath(), JSON.stringify(cfg, null, 2)); } catch {} }
function publicCfg() {
  let openAtLogin = false;
  try { openAtLogin = app.getLoginItemSettings().openAtLogin; } catch {}
  return { startMinimized: cfg.startMinimized, closeToTray: cfg.closeToTray, defaultMic: cfg.defaultMic, openAtLogin };
}

/* ---------- PowerShell helpers ---------- */
function ps(script, args = [], env = {}, timeout = 60000) {
  return new Promise((resolve) => {
    if (!isWin) return resolve({ ok: false, error: 'This feature needs Windows.' });
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', res('scripts', script), ...args],
      { windowsHide: true, timeout, env: { ...process.env, ...env } },
      (err, stdout, stderr) => {
        const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
        const last = lines.pop() || '';
        try { resolve(JSON.parse(last)); }
        catch { resolve({ ok: false, error: String(stderr || (err && err.message) || last || 'No response').slice(0, 400) }); }
      });
  });
}
const audioStatus = () => ps('audio.ps1', ['-Action', 'status']);
const setEndpoint = (id) => ps('audio.ps1', ['-Action', 'set', '-Id', id]);

function installCable() { return runElevated('install-cable.ps1'); }
function runElevated(script) {
  return new Promise((resolve) => {
    if (!isWin) return resolve({ ok: false, error: 'This feature needs Windows.' });
    const out = path.join(app.getPath('temp'), `vanmule-cable-${Date.now()}.json`);
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', res('scripts', 'elevate.ps1')],
      { windowsHide: true, timeout: 600000, env: { ...process.env, VAN_S: res('scripts', script), VAN_O: out } },
      (err) => {
        if (err && err.code === 5) return resolve({ ok: false, cancelled: true, error: 'Windows permission was declined.' });
        let r;
        try { r = JSON.parse(fs.readFileSync(out, 'utf8').replace(/^﻿/, '')); }
        catch { r = { ok: false, error: 'Windows did not finish the change. Try again, or restart your PC and check again.' }; }
        try { fs.unlinkSync(out); } catch {}
        resolve(r);
      });
  });
}

const sameId = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
async function setDefaultMic(on) {
  const st = await audioStatus();
  if (!st.ok) return st;
  cfg.defaultMic = on;
  if (on) {
    if (!st.installed) { saveCfg(); return { ok: false, error: 'The virtual microphone is not installed.' }; }
    if (!st.defaultIsCable) cfg.prevMic = st.defaultId;
    else if (!cfg.prevMic && st.mics && st.mics.length) cfg.prevMic = st.mics[0].id;
    saveCfg();
    return st.defaultIsCable ? { ok: true } : setEndpoint(st.cableId);
  }
  saveCfg();
  return restoreMic(st);
}
async function restoreMic(st) {
  st = st || await audioStatus();
  if (!st.ok || !st.defaultIsCable) return { ok: true };
  const mics = st.mics || [];
  const target = mics.some((m) => sameId(m.id, cfg.prevMic)) ? cfg.prevMic : (mics[0] && mics[0].id);
  if (!target) return { ok: false, error: 'No other microphone was found.' };
  return setEndpoint(target);
}

/* ---------- shortcuts ---------- */
function setShortcuts(list) {
  globalShortcut.unregisterAll();
  const failed = [];
  for (const s of list || []) {
    try {
      const ok = globalShortcut.register(s.acc, () => { if (win) win.webContents.send('van:shortcut', { kind: s.kind, id: s.id }); });
      if (!ok) failed.push(s.combo || s.acc);
    } catch { failed.push(s.combo || s.acc); }
  }
  return failed;
}

/* ---------- window & tray ---------- */
function showWin() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('VanMule');
  const send = (a) => () => win && win.webContents.send('van:tray', a);
  trayItems.send = send; rebuildTray();
  tray.on('click', showWin);
  if (isWin) tray.on('right-click', (_e, b) => trayPopup(b));
}
/* a nicer right-click menu: a small styled window with on/off switches (Windows) */
let trayWin = null, trayState = {}, trayTheme = null;
function trayPopup() {
  const { screen } = require('electron');
  try {
    const W = 300, H = 630, pt = screen.getCursorScreenPoint(), d = screen.getDisplayNearestPoint(pt), wa = d.workArea;
    const x = Math.round(Math.min(Math.max(pt.x - W + 20, wa.x + 4), wa.x + wa.width - W - 4)), y = Math.round(Math.min(Math.max(pt.y - H - 6, wa.y + 4), wa.y + wa.height - H - 4));
    if (!trayWin || trayWin.isDestroyed()) {
      trayWin = new BrowserWindow({ x, y, width: W, height: H, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: '#00000000', title: 'VanMule menu', webPreferences: { preload: path.join(__dirname, 'mini-preload.js'), contextIsolation: true, nodeIntegration: false } });
      trayWin.loadFile(path.join(__dirname, 'app', 'traymenu.html'));
      trayWin.on('blur', () => { if (trayWin && !trayWin.isDestroyed()) trayWin.hide(); });
      trayWin.once('ready-to-show', () => { trayWin.show(); trayWin.focus(); });
    } else { trayWin.setBounds({ x, y, width: W, height: H }); trayWin.show(); trayWin.focus(); }
    trayPush();
  } catch { if (trayItems.menu) tray.popUpContextMenu(trayItems.menu); }
}
function trayPush() { if (trayWin && !trayWin.isDestroyed()) trayWin.webContents.send('van:mini', { t: 'tray', st: Object.assign({}, trayState, { events: trayItems.events }), theme: trayTheme }); }
ipcMain.on('van:tray-state', (_e, a = {}) => { trayState = a.st || {}; if (a.theme) trayTheme = a.theme; trayPush(); });
function trayAct(act) {
  if (act === 'state') { trayPush(); return true; }
  if (act === 'close') { if (trayWin) trayWin.hide(); return true; }
  if (act === 'open') { if (trayWin) trayWin.hide(); showWin(); return true; }
  if (act === 'quit') { quitting = true; app.quit(); return true; }
  if (act === 'overlayToggle') { setOverlay(); return true; }
  if (/^view:/.test(act)) { if (trayWin) trayWin.hide(); showWin(); }
  if (win && !win.isDestroyed()) win.webContents.send('van:tray', act);
  return true;
}
let trayItems = { events: [], ovKey: '', send: null };
function rebuildTray() {
  if (!tray) return; const send = trayItems.send;
  const ev = trayItems.events || [];
  tray.setToolTip(ev.length ? `VanMule\nNext: ${ev[0].label}` : 'VanMule');
  const menu = Menu.buildFromTemplate([
    { label: 'Open VanMule', click: showWin },
    { label: 'Mini overlay' + (trayItems.ovKey ? `\t${trayItems.ovKey}` : ''), click: () => setOverlay() },
    { type: 'separator' },
    ...(ev.length ? [{ label: 'Coming up', enabled: false }, ...ev.slice(0, 6).map((e) => ({ label: e.label.length > 70 ? e.label.slice(0, 68) + '…' : e.label, click: () => { showWin(); win && win.webContents.send('van:tray', 'openWatch'); } })), { label: 'Open the Watch calendar', click: () => { showWin(); win && win.webContents.send('van:tray', 'openWatch'); } }] : []),
    { type: 'separator' },
    { label: 'Voice changer on/off', click: send('vcToggle') },
    { label: 'Hear myself on/off', click: send('hearToggle') },
    { label: 'Stop all sounds', click: send('stopSounds') },
    { type: 'separator' },
    { label: 'Quit VanMule', click: () => { quitting = true; app.quit(); } }
  ]);
  trayItems.menu = menu;
  if (!isWin) tray.setContextMenu(menu); // Windows gets the styled menu (trayPopup)
  trayPush();
}
ipcMain.on('van:tray-events', (_e, a = {}) => { trayItems.events = Array.isArray(a.events) ? a.events.slice(0, 8) : []; trayItems.ovKey = String(a.ovKey || ''); rebuildTray(); });
function createWindow() {
  const hidden = cfg.startMinimized || process.argv.includes('--hidden');
  const wb = cfg.winBounds && typeof cfg.winBounds === 'object' ? cfg.winBounds : null;
  win = new BrowserWindow({
    width: wb ? wb.width : 1440, height: wb ? wb.height : 900, x: wb ? wb.x : undefined, y: wb ? wb.y : undefined, minWidth: 980, minHeight: 640,
    show: false, backgroundColor: '#0e0c0b', title: 'VanMule',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0e0c0b', symbolColor: '#f3ece5', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // first run (or no saved size): open filling the screen; afterwards come back exactly where you left it
  if (!wb || cfg.winMax !== false) { try { const { screen } = require('electron'); const wa = screen.getDisplayMatching(win.getBounds()).workArea; if (!wb || cfg.winMax) { if (wa.width >= 1280) win.maximize(); } } catch {} }
  else { try { const { screen } = require('electron'); const wa = screen.getDisplayMatching(wb).workArea; if (wb.x + 100 > wa.x + wa.width || wb.y + 60 > wa.y + wa.height || wb.x + wb.width < wa.x + 100) win.center(); } catch {} }
  let wbT = null; const remember = () => { clearTimeout(wbT); wbT = setTimeout(() => { if (!win || win.isDestroyed() || win.isMinimized()) return; cfg.winMax = win.isMaximized(); if (!cfg.winMax) cfg.winBounds = win.getNormalBounds(); else if (!cfg.winBounds) cfg.winBounds = win.getNormalBounds(); saveCfg(); }, 600); };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) win.on(ev, remember);
  win.once('ready-to-show', () => { if (!hidden) win.show(); });
  // tell the page when it can't be seen (background throttling is off, so the page can't tell by itself)
  const vis = () => { if (win && !win.isDestroyed()) win.webContents.send('van:vis', !win.isVisible() || win.isMinimized()); };
  for (const ev of ['minimize', 'restore', 'hide', 'show']) win.on(ev, () => setTimeout(vis, 0));
  win.webContents.on('did-finish-load', () => setTimeout(vis, 500));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https:\/\//i.test(url)) shell.openExternal(url); } });
  win.on('close', (e) => {
    if (!quitting && cfg.closeToTray) {
      e.preventDefault(); win.hide();
      if (!cfg.trayHintShown && tray && isWin) {
        tray.displayBalloon({ title: 'VanMule is still running', content: 'Your voice keeps working. Right-click the tray icon to quit.' });
        cfg.trayHintShown = true; saveCfg();
      }
    }
  });
}

/* ---------- AI voice engine (separate process so audio never blocks the window) ---------- */
let engine = null;
function startEngine() {
  if (engine) return engine;
  engine = utilityProcess.fork(path.join(__dirname, 'engine', 'engine.js'), [], { serviceName: 'VanMule AI', stdio: 'ignore' });
  engine.on('message', (m) => { if (win && !win.isDestroyed()) win.webContents.send('van:ai-event', m); });
  engine.on('exit', (code) => { engine = null; if (win && !win.isDestroyed()) win.webContents.send('van:ai-event', { type: 'exit', code }); });
  engine.postMessage({ cmd: 'init', userData: app.getPath('userData'), resources: res(), voicesDir: dirs().voices });
  return engine;
}
function connectEngine() {
  const e = startEngine();
  const { port1, port2 } = new MessageChannelMain();
  e.postMessage({ cmd: 'port' }, [port1]);
  win.webContents.postMessage('van:ai-port', null, [port2]);
}
/* Engine model download, done here with Chromium's network stack (system proxy, Windows certificates). */
const BASE_FILES = [
  { file: 'hubert.onnx', label: 'Speech encoder', approx: 378e6, urls: ['https://huggingface.co/MidFord327/Hubert-Base-ONNX/resolve/main/hubert_base.onnx', 'https://huggingface.co/Kilvoctu/rvc/resolve/main/hubert_v2.onnx'] },
  { file: 'rmvpe.onnx', label: 'Pitch tracker', approx: 362e6, urls: ['https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.onnx', 'https://huggingface.co/Kilvoctu/rvc/resolve/main/rmvpe_model.onnx'] }
];
if (process.env.VAN_DL_TEST) BASE_FILES.forEach((b, i) => { b.urls = [process.env.VAN_DL_TEST + '/dead' + i, process.env.VAN_DL_TEST + '/redir' + i]; });
let downloading = false;
const aiEvent = (m) => { if (win && !win.isDestroyed()) win.webContents.send('van:ai-event', m); };
const dlLog = (msg) => { try { const f = path.join(app.getPath('userData'), 'ai', 'download.log'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, new Date().toISOString() + ' ' + msg + '\n'); } catch {} };
function fetchTo(url, dest, onProg) {
  return new Promise((resolve, reject) => {
    const host = (() => { try { return new URL(url).host; } catch { return url; } })();
    const req = net.request({ url, redirect: 'follow', useSessionCookies: false });
    req.setHeader('User-Agent', 'VanMule');
    let stall = null, done = false;
    const fail = (err) => { if (done) return; done = true; clearTimeout(stall); try { req.abort(); } catch {} reject(err); };
    const arm = (ms, msg) => { clearTimeout(stall); stall = setTimeout(() => fail(new Error(msg)), ms); };
    arm(30000, 'Could not reach ' + host + '. Check your internet connection, firewall or antivirus.');
    req.on('response', (res) => {
      dlLog('HTTP ' + res.statusCode + ' ' + url);
      if (res.statusCode !== 200) { res.on('data', () => {}); return fail(new Error('The server answered ' + res.statusCode + ' for ' + host)); }
      const total = Number([].concat(res.headers['content-length'] || [])[0]) || 0;
      const tmp = dest + '.part', out = fs.createWriteStream(tmp);
      let got = 0, last = 0;
      arm(45000, 'The download from ' + host + ' stopped responding.');
      res.on('data', (c) => { out.write(c); got += c.length; arm(45000, 'The download from ' + host + ' stopped responding.'); const now = Date.now(); if (now - last > 250) { last = now; onProg(got, total); } });
      res.on('end', () => { clearTimeout(stall); out.end(() => { if (done) return; done = true; if (total && got !== total) return reject(new Error('The download was cut off.')); try { fs.renameSync(tmp, dest); } catch (e) { return reject(e); } onProg(got, total || got); resolve(); }); });
      res.on('error', (e) => fail(e));
    });
    req.on('error', (e) => { dlLog('ERR ' + url + ' ' + e.message); fail(new Error('Could not download from ' + host + ': ' + e.message)); });
    req.end();
  });
}
async function downloadBase() {
  if (downloading) return; downloading = true;
  const dir = path.join(app.getPath('userData'), 'ai', 'base');
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < BASE_FILES.length; i++) {
      const b = BASE_FILES[i], dest = path.join(dir, b.file);
      try { if (fs.statSync(dest).size > 10e6) continue; } catch {}
      let lastErr = null;
      for (const url of b.urls) {
        try {
          dlLog('GET ' + url);
          aiEvent({ type: 'progress', part: i + 1, parts: BASE_FILES.length, label: b.label, got: 0, total: b.approx, connecting: new URL(url).host });
          await fetchTo(url, dest, (got, total) => aiEvent({ type: 'progress', part: i + 1, parts: BASE_FILES.length, label: b.label, got, total: total || b.approx }));
          lastErr = null; break;
        } catch (e) { lastErr = e; dlLog('FAIL ' + e.message); }
      }
      if (lastErr) throw new Error(b.label + ' download failed. ' + lastErr.message);
    }
    aiEvent({ type: 'downloaded' });
    startEngine().postMessage({ cmd: 'status' });
  } catch (e) {
    aiEvent({ type: 'error', cmd: 'download', msg: e.message });
  } finally { downloading = false; }
}
async function downloadAltEncoder() {
  if (downloading) return; downloading = true;
  const dir = path.join(app.getPath('userData'), 'ai', 'base'), dest = path.join(dir, 'hubert.onnx'), tmp = path.join(dir, 'hubert_alt.onnx');
  const url = process.env.VAN_DL_TEST ? process.env.VAN_DL_TEST + '/redir9' : 'https://huggingface.co/Kilvoctu/rvc/resolve/main/hubert_v2.onnx';
  try {
    fs.mkdirSync(dir, { recursive: true });
    dlLog('GET ' + url);
    aiEvent({ type: 'progress', part: 1, parts: 1, label: 'Alternative speech encoder', got: 0, total: 378e6, connecting: new URL(url).host });
    await fetchTo(url, tmp, (got, total) => aiEvent({ type: 'progress', part: 1, parts: 1, label: 'Alternative speech encoder', got, total: total || 378e6 }));
    const e = startEngine();
    e.postMessage({ cmd: 'releaseEncoder' });
    await new Promise((r) => setTimeout(r, 800));
    try { fs.renameSync(dest, path.join(dir, 'hubert_original.onnx')); } catch {}
    fs.renameSync(tmp, dest);
    e.postMessage({ cmd: 'reloadBase' });
    aiEvent({ type: 'downloaded' });
  } catch (err) {
    aiEvent({ type: 'error', cmd: 'download', msg: 'Alternative encoder download failed. ' + err.message });
  } finally { downloading = false; }
}
// the optional fast pitch tracker (FCPE, about 48 MB) downloads the first time it's picked
async function downloadFcpe() {
  if (downloading) return; downloading = true;
  const dir = path.join(app.getPath('userData'), 'ai', 'base'), dest = path.join(dir, 'fcpe.onnx');
  const urls = process.env.VAN_DL_TEST ? [process.env.VAN_DL_TEST + '/fcpe'] : ['https://huggingface.co/Scicom-intl/fcpe-onnx/resolve/main/fcpe.onnx'];
  try {
    fs.mkdirSync(dir, { recursive: true });
    let ok = false; try { ok = fs.statSync(dest).size > 10e6; } catch {}
    if (!ok) {
      let lastErr = null;
      for (const url of urls) {
        try { dlLog('GET ' + url); aiEvent({ type: 'progress', part: 1, parts: 1, label: 'Fast pitch tracker', got: 0, total: 48e6, connecting: new URL(url).host });
          await fetchTo(url, dest, (got, total) => aiEvent({ type: 'progress', part: 1, parts: 1, label: 'Fast pitch tracker', got, total: total || 48e6 })); lastErr = null; break; }
        catch (e) { lastErr = e; dlLog('FAIL ' + e.message); }
      }
      if (lastErr) throw lastErr;
    }
    aiEvent({ type: 'downloaded', what: 'fcpe' });
    startEngine().postMessage({ cmd: 'fcpeReady', use: true });
  } catch (e) { aiEvent({ type: 'error', cmd: 'fcpe', msg: 'Fast pitch tracker download failed. ' + e.message }); }
  finally { downloading = false; }
}
ipcMain.handle('van:ai', (_e, msg) => { if (msg && msg.cmd === 'download') { downloadBase(); return true; } if (msg && msg.cmd === 'altEncoder') { downloadAltEncoder(); return true; } if (msg && msg.cmd === 'downloadFcpe') { downloadFcpe(); return true; } startEngine().postMessage(msg); return true; });
ipcMain.handle('van:ai-connect', () => { connectEngine(); return true; });
ipcMain.handle('van:ai-pick-base', () => dialog.showOpenDialog(win, { title: 'Pick the two engine files (hubert and rmvpe)', properties: ['openFile', 'multiSelections'], filters: [{ name: 'ONNX model', extensions: ['onnx'] }] }));
ipcMain.handle('van:ai-folder', () => { const d = path.join(app.getPath('userData'), 'ai'); fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); });
ipcMain.handle('van:pick-image', () => dialog.showOpenDialog(win, { title: 'Choose a picture or GIF for this voice', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] }));
ipcMain.handle('van:ai-pick', () => dialog.showOpenDialog(win, { title: 'Import AI voice models (you can pick several)', properties: ['openFile', 'multiSelections'], filters: [{ name: 'RVC voice model', extensions: ['pth', 'onnx', 'zip'] }] }));
ipcMain.handle('van:ai-pick-index', () => dialog.showOpenDialog(win, { title: 'Pick the .index file for this voice', properties: ['openFile'], filters: [{ name: 'RVC index', extensions: ['index'] }] }));
ipcMain.handle('van:ai-pick-folder', () => dialog.showOpenDialog(win, { title: 'Pick a folder of voice models (subfolders are searched too)', properties: ['openDirectory'] }));

/* ---------- Folders for AI voices and soundboard files ---------- */
const AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm', '.opus'];
function dirs() {
  const ud = app.getPath('userData');
  const d = {
    voices: cfg.voicesDir || path.join(ud, 'ai', 'voices'),
    sounds: cfg.soundsDir || path.join(ud, 'sounds'),
    recordings: cfg.recDir || path.join(app.getPath('videos'), 'VanMule'),
    backgrounds: path.join(ud, 'background music'),
    defaultRecordings: path.join(app.getPath('videos'), 'VanMule'),
    engine: path.join(ud, 'ai', 'base'),
    logs: path.join(ud, 'ai'),
    defaultVoices: path.join(ud, 'ai', 'voices'),
    defaultSounds: path.join(ud, 'sounds')
  };
  for (const k of ['voices', 'sounds', 'engine', 'recordings', 'backgrounds']) { try { fs.mkdirSync(d[k], { recursive: true }); } catch {} }
  return d;
}
const inDir = (dir, file) => { const p = path.resolve(dir, file); if (path.dirname(p) !== path.resolve(dir)) throw new Error('Bad file name'); return p; };
// Sounds may sit one folder deep ("Memes/bruh.mp3"); the folder becomes a category in the soundboard.
const inSounds = (dir, rel) => { const root = path.resolve(dir), p = path.resolve(root, String(rel)); const r = path.relative(root, p); if (!r || r.startsWith('..') || path.isAbsolute(r) || r.split(/[\\/]/).length > 2) throw new Error('Bad file name'); return p; };
const relOf = (dir, p) => path.relative(dir, p).split(path.sep).join('/');
const safeFolder = (n) => String(n || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const safeName = (n) => String(n || 'Sound').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Sound';
function uniqueFile(dir, base, ext) { let f = base + ext, i = 2; while (fs.existsSync(path.join(dir, f))) f = `${base} (${i++})${ext}`; return f; }
function moveContents(from, to, filter) {
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (filter && !filter(e)) continue;
    const src = path.join(from, e.name); let dst = path.join(to, e.name);
    if (fs.existsSync(dst)) { const ext = path.extname(e.name); dst = path.join(to, uniqueFile(to, path.basename(e.name, ext), ext)); }
    try { fs.renameSync(src, dst); } catch { fs.cpSync(src, dst, { recursive: true }); fs.rmSync(src, { recursive: true, force: true }); }
    n++;
  }
  return n;
}
ipcMain.handle('van:files', async (_e, op, a = {}) => {
  const d = dirs();
  switch (op) {
    case 'dirs': return d;
    case 'open': return shell.openPath(d[a.kind] || d.sounds);
    case 'listSounds': {
      const out = [], scan = (dir, folder) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory() && !folder && !e.name.startsWith('.')) { scan(full, e.name); continue; }
          if (!e.isFile() || !AUDIO_EXT.includes(path.extname(e.name).toLowerCase())) continue;
          const st = fs.statSync(full); out.push({ file: relOf(d.sounds, full), folder: folder || '', name: path.basename(e.name, path.extname(e.name)), size: st.size, mtime: st.mtimeMs });
        }
      };
      scan(d.sounds, '');
      return out.sort((x, y) => x.mtime - y.mtime);
    }
    case 'listBgm': return fs.readdirSync(d.backgrounds, { withFileTypes: true }).filter((e) => e.isFile() && AUDIO_EXT.includes(path.extname(e.name).toLowerCase())).map((e) => ({ file: e.name, name: path.basename(e.name, path.extname(e.name)) })).sort((x, y) => x.name.localeCompare(y.name));
    case 'writeBgm': { const ext = AUDIO_EXT.includes(String(a.ext).toLowerCase()) ? a.ext.toLowerCase() : '.mp3'; const f = uniqueFile(d.backgrounds, safeName(a.name), ext); fs.writeFileSync(path.join(d.backgrounds, f), Buffer.from(a.data)); return f; }
    case 'readBgm': { const b = fs.readFileSync(inDir(d.backgrounds, a.file)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
    case 'deleteBgm': { const p = inDir(d.backgrounds, a.file); try { await shell.trashItem(p); } catch { fs.unlinkSync(p); } return true; }
    case 'listFolders': return fs.readdirSync(d.sounds, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort((x, y) => x.localeCompare(y));
    case 'newFolder': { const n = safeFolder(a.name); if (!n) throw new Error('Pick a folder name'); fs.mkdirSync(path.join(d.sounds, n), { recursive: true }); return n; }
    case 'readSound': { const b = fs.readFileSync(inSounds(d.sounds, a.file)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
    case 'writeSound': {
      const ext = AUDIO_EXT.includes(String(a.ext).toLowerCase()) ? a.ext.toLowerCase() : '.wav', folder = safeFolder(a.folder), dir = folder ? path.join(d.sounds, folder) : d.sounds;
      fs.mkdirSync(dir, { recursive: true }); const f = uniqueFile(dir, safeName(a.name), ext); fs.writeFileSync(path.join(dir, f), Buffer.from(a.data)); return relOf(d.sounds, path.join(dir, f));
    }
    case 'renameSound': { const src = inSounds(d.sounds, a.file), dir = path.dirname(src), ext = path.extname(a.file); const f = uniqueFile(dir, safeName(a.name), ext); fs.renameSync(src, path.join(dir, f)); return relOf(d.sounds, path.join(dir, f)); }
    case 'moveSound': { const src = inSounds(d.sounds, a.file), folder = safeFolder(a.folder), dir = folder ? path.join(d.sounds, folder) : d.sounds; fs.mkdirSync(dir, { recursive: true }); const base = path.basename(src), ext = path.extname(base); const f = uniqueFile(dir, path.basename(base, ext), ext); fs.renameSync(src, path.join(dir, f)); return relOf(d.sounds, path.join(dir, f)); }
    case 'deleteSound': { const p = inSounds(d.sounds, a.file); try { await shell.trashItem(p); } catch { fs.unlinkSync(p); } return true; }
    case 'fetchSound': {
      // Accepts a MyInstants button page or a direct audio link.
      let url = String(a.url || '').trim(); if (!/^https?:\/\//i.test(url)) throw new Error('Paste a link that starts with https://');
      const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VanMule/' + app.getVersion() };
      let name = '', r = await net.fetch(url, { headers: UA }); if (!r.ok) throw new Error('That page could not be opened (' + r.status + ').');
      let type = String(r.headers.get('content-type') || '').toLowerCase();
      if (type.includes('text/html')) {
        const html = await r.text();
        const m = html.match(/(?:https?:\/\/www\.myinstants\.com)?\/media\/sounds\/[^"'\s)]+\.(?:mp3|ogg|wav|m4a)/i) || html.match(/https?:\/\/[^"'\s]+\.(?:mp3|ogg|wav|m4a)(?:\?[^"'\s]*)?/i);
        if (!m) throw new Error('No sound was found on that page.');
        const t = html.match(/<title>([^<]+)<\/title>/i); if (t) name = t[1].replace(/\s*[-|–].*(myinstants|instant sound).*$/i, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();
        url = new URL(m[0], url).href; r = await net.fetch(url, { headers: UA }); if (!r.ok) throw new Error('The sound could not be downloaded (' + r.status + ').');
        type = String(r.headers.get('content-type') || '').toLowerCase();
      }
      const len = +r.headers.get('content-length') || 0; if (len > 25e6) throw new Error('That sound is over 25 MB.');
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 25e6) throw new Error('That sound is over 25 MB.');
      let ext = (path.extname(new URL(url).pathname) || '').toLowerCase(); if (ext === '.oga') ext = '.ogg'; if (!AUDIO_EXT.includes(ext)) ext = type.includes('mpeg') ? '.mp3' : type.includes('ogg') ? '.ogg' : type.includes('wav') ? '.wav' : type.includes('mp4') || type.includes('aac') ? '.m4a' : '';
      if (!ext) throw new Error('That link is not an audio file.');
      if (a.name) name = String(a.name);
      if (!name) name = decodeURIComponent(path.basename(new URL(url).pathname, ext)).replace(/[_-]+/g, ' ');
      const folder = safeFolder(a.folder), dir = folder ? path.join(d.sounds, folder) : d.sounds; fs.mkdirSync(dir, { recursive: true });
      const f = uniqueFile(dir, safeName(name), ext); fs.writeFileSync(path.join(dir, f), buf);
      if (a.credit) { try { fs.appendFileSync(path.join(d.sounds, 'Sound credits.txt'), `${relOf(d.sounds, path.join(dir, f))}: ${String(a.credit).replace(/[\r\n]+/g, ' ')}\r\n`); } catch {} }
      return relOf(d.sounds, path.join(dir, f));
    }
    case 'chooseDir': {
      const r = await dialog.showOpenDialog(win, { title: a.kind === 'voices' ? 'Choose a folder for AI voices' : a.kind === 'recordings' ? 'Choose a folder for recordings' : 'Choose a folder for soundboard files', defaultPath: d[a.kind], properties: ['openDirectory', 'createDirectory'] });
      return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
    }
    case 'setDir': {
      const kind = a.kind, key = kind === 'voices' ? 'voicesDir' : kind === 'recordings' ? 'recDir' : 'soundsDir', from = d[kind];
      const to = a.reset ? (kind === 'voices' ? d.defaultVoices : kind === 'recordings' ? d.defaultRecordings : d.defaultSounds) : path.resolve(String(a.dir || ''));
      if (!to || path.resolve(to) === path.resolve(from)) return { ok: true, dir: from, moved: 0 };
      if (path.resolve(to).startsWith(path.resolve(from) + path.sep)) return { ok: false, error: 'Pick a folder outside the current one.' };
      fs.mkdirSync(to, { recursive: true });
      let moved = 0;
      if (kind === 'voices') {
        if (engine) { engine.postMessage({ cmd: 'unload' }); await new Promise((r) => setTimeout(r, 600)); }
        if (a.move) moved = moveContents(from, to, (e) => e.isDirectory() && fs.existsSync(path.join(from, e.name, 'meta.json')));
      } else if (kind === 'recordings') { if (a.move) moved = moveContents(from, to, (e) => e.isFile() && REC_EXT.includes(path.extname(e.name).toLowerCase())); }
      else if (a.move) moved = moveContents(from, to, (e) => e.isFile() && AUDIO_EXT.includes(path.extname(e.name).toLowerCase()));
      cfg[key] = a.reset ? '' : to; saveCfg();
      if (kind === 'voices' && engine) engine.postMessage({ cmd: 'setVoicesDir', dir: dirs().voices });
      return { ok: true, dir: dirs()[kind], moved };
    }
  }
  return null;
});
/* ---------- Watch: sports (ESPN), TV (TVmaze), movies (TMDB) and ratings (OMDb) ---------- */
const WATCH_LEAGUES = { nfl: ['football', 'nfl'], nba: ['basketball', 'nba'], mlb: ['baseball', 'mlb'], nhl: ['hockey', 'nhl'], wnba: ['basketball', 'wnba'], cfb: ['football', 'college-football'], cbb: ['basketball', 'mens-college-basketball'], mls: ['soccer', 'usa.1'], epl: ['soccer', 'eng.1'] };
const wcache = new Map();
// keep the response cache from growing for as long as VanMule runs in the tray
function wprune() { if (wcache.size < 300) return; const old = Date.now() - 6 * 3600e3; for (const [k, x] of wcache) if (x.t < old) wcache.delete(k); while (wcache.size > 250) wcache.delete(wcache.keys().next().value); }
let omdbDisk = null;
const omdbFile = () => path.join(app.getPath('userData'), 'ratings-cache.json');
async function wget(url, { ttl = 600e3, headers = {} } = {}) {
  const hit = wcache.get(url); if (hit && Date.now() - hit.t < ttl) return hit.v;
  const r = await net.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VanMule/' + app.getVersion(), Accept: 'application/json', ...headers } });
  if (!r.ok) { const e = new Error(`${new URL(url).host} answered ${r.status}`); e.status = r.status; throw e; }
  const v = await r.json(); wcache.set(url, { t: Date.now(), v }); wprune(); return v;
}
const ESPN = () => process.env.VAN_ESPN || 'https://site.api.espn.com';
const ymd = (d) => { const x = new Date(d); return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`; };
function espnTeam(c) {
  if (!c) return null; const t = c.team || {};
  const score = c.score == null ? null : typeof c.score === 'object' ? (c.score.displayValue != null ? c.score.displayValue : c.score.value) : c.score;
  const rec = (c.records || c.record || [])[0];
  return { id: String(t.id || ''), abbr: t.abbreviation || '', name: t.displayName || t.name || '', short: t.shortDisplayName || t.name || t.abbreviation || '', logo: t.logo || (t.logos && t.logos[0] && t.logos[0].href) || '', color: t.color ? '#' + t.color : '', score: score == null || score === '' ? null : String(score), winner: !!c.winner, record: rec ? (rec.summary || rec.displayValue || '') : '' };
}
// Betting line: ESPN has used a few shapes over the years, so read them all
function espnOdds(o, comps) {
  if (!o) return null;
  const home = (comps || []).find((x) => x.homeAway === 'home') || {}, away = (comps || []).find((x) => x.homeAway === 'away') || {};
  const ab = (c) => ((c && c.team) || {}).abbreviation || '';
  const num = (v) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(/[^0-9.+-]/g, '')); return isNaN(n) ? null : n; };
  const pick = (...v) => { for (const x of v) if (x != null && x !== '') return x; return null; };
  let details = o.details || '';
  const spreadHome = num(pick(o.spread, o.pointSpread && o.pointSpread.home && (o.pointSpread.home.close || o.pointSpread.home.open || {}).line));
  if (!details && spreadHome != null) details = spreadHome === 0 ? 'EVEN' : spreadHome < 0 ? `${ab(home)} ${spreadHome}` : `${ab(away)} -${spreadHome}`;
  const ou = num(pick(o.overUnder, o.total && o.total.over && (o.total.over.close || o.total.over.open || {}).line && String((o.total.over.close || o.total.over.open).line).replace(/^o/i, '')));
  const ml = (side) => { const t = o[side + 'TeamOdds'] || {}; return pick(t.moneyLine, o.moneyline && o.moneyline[side] && (o.moneyline[side].close || o.moneyline[side].open || {}).odds); };
  const mh = ml('home'), ma = ml('away');
  if (!details && ou == null && mh == null && ma == null) return null;
  return { details, overUnder: ou, spread: spreadHome, mlHome: mh != null ? String(mh) : null, mlAway: ma != null ? String(ma) : null, homeAbbr: ab(home), awayAbbr: ab(away), provider: (o.provider || {}).name || '' };
}
function espnEvent(ev, league) {
  const c = (ev.competitions || [])[0] || {}, comps = c.competitors || [];
  const st = (c.status || ev.status || {}).type || {};
  const names = new Set();
  for (const b of c.broadcasts || []) { (b.names || []).forEach((n) => names.add(n)); if (b.media && b.media.shortName) names.add(b.media.shortName); }
  for (const g of c.geoBroadcasts || []) if (g.media && g.media.shortName) names.add(g.media.shortName);
  const o = (c.odds || [])[0];
  const odds = espnOdds(o, comps);
  const v = c.venue || {};
  return {
    kind: 'game', id: league + ':' + ev.id, eid: String(ev.id), league, date: ev.date, name: ev.name || '', short: ev.shortName || '',
    state: st.state || 'pre', completed: !!st.completed, detail: st.shortDetail || st.detail || '',
    home: espnTeam(comps.find((x) => x.homeAway === 'home') || comps[0]), away: espnTeam(comps.find((x) => x.homeAway === 'away') || comps[1]),
    venue: v.fullName ? { name: v.fullName, city: (v.address || {}).city || '', state: (v.address || {}).state || '', country: (v.address || {}).country || '' } : null,
    neutral: !!c.neutralSite, indoor: !!v.indoor, weather: c.weather ? { txt: c.weather.displayValue || c.weather.conditionId || '', temp: c.weather.temperature != null ? c.weather.temperature : c.weather.highTemperature } : null, broadcasts: [...names], week: ev.week ? (ev.week.text || ('Week ' + ev.week.number)) : (ev.seasonType && ev.seasonType.name) || '',
    odds
  };
}
async function omdbRatings(imdb) {
  if (!/^tt\d+$/.test(String(imdb || '')) || !KEY.omdb) return null;
  if (!omdbDisk) { try { omdbDisk = JSON.parse(fs.readFileSync(omdbFile(), 'utf8')); } catch { omdbDisk = {}; } }
  const hit = omdbDisk[imdb]; if (hit && Date.now() - hit.t < 7 * 864e5) return hit.v;
  const j = await wget(`${process.env.VAN_OMDB || 'https://www.omdbapi.com'}/?apikey=${encodeURIComponent(KEY.omdb)}&i=${imdb}&tomatoes=true`, { ttl: 864e5 });
  if (j.Response === 'False') { if (/invalid api key|limit/i.test(j.Error || '')) throw new Error('OMDb: ' + j.Error); return null; }
  const rt = (j.Ratings || []).find((x) => /rotten/i.test(x.Source));
  const v = { imdb: j.imdbRating && j.imdbRating !== 'N/A' ? +j.imdbRating : null, votes: j.imdbVotes, rt: rt ? parseInt(rt.Value, 10) : null, meta: j.Metascore && j.Metascore !== 'N/A' ? +j.Metascore : null, rated: j.Rated, runtime: j.Runtime };
  omdbDisk[imdb] = { t: Date.now(), v }; try { fs.writeFileSync(omdbFile(), JSON.stringify(omdbDisk)); } catch {}
  return v;
}
const TMDB = () => process.env.VAN_TMDB || 'https://api.themoviedb.org';
function tmdbUrl(p, q = {}) {
  const k = String(KEY.tmdb || ''); const u = new URL(TMDB() + '/3' + p);
  for (const [a, b] of Object.entries(q)) u.searchParams.set(a, b);
  if (k && k.length < 40) u.searchParams.set('api_key', k);
  return { url: u.href, headers: k.length >= 40 ? { Authorization: 'Bearer ' + k } : {} };
}
async function tmdb(p, q, ttl = 6 * 3600e3) { if (!KEY.tmdb) { const e = new Error('NO_TMDB'); throw e; } const { url, headers } = tmdbUrl(p, q); return wget(url, { ttl, headers }); }
const tmdbMovie = (m) => ({ kind: 'movie', id: 'm:' + m.id, tmdb: m.id, title: m.title || m.name, date: m.release_date || m.first_air_date || '', poster: m.poster_path ? 'https://image.tmdb.org/t/p/w185' + m.poster_path : '', overview: m.overview || '', tmdbScore: m.vote_average || null, votes: m.vote_count || 0 });
function providersOf(wp) {
  const us = (wp && wp.results && wp.results.US) || null; if (!us) return null;
  const pick = (a) => (a || []).map((x) => x.provider_name);
  return { stream: pick(us.flatrate), free: pick(us.free).concat(pick(us.ads)), rent: pick(us.rent), buy: pick(us.buy), link: us.link || '' };
}

/* ---------- Fights: UFC from ESPN, boxing and all MMA from The Odds API (free key) ---------- */
const ODDSAPI = () => process.env.VAN_ODDSAPI || 'https://api.the-odds-api.com';
function bestLine(bms, name) { // most common (median) American price across US books
  const prices = []; for (const b of bms || []) for (const m of b.markets || []) if (m.key === 'h2h') for (const o of m.outcomes || []) if (o.name === name && o.price != null) prices.push(+o.price);
  if (!prices.length) return null; prices.sort((x, y) => x - y); const p = prices[Math.floor(prices.length / 2)]; return p > 0 ? '+' + Math.round(p) : String(Math.round(p));
}
async function oddsSport(key, withOdds) {
  const k = encodeURIComponent(KEY.odds);
  const evs = await wget(`${ODDSAPI()}/v4/sports/${key}/events?apiKey=${k}&dateFormat=iso`, { ttl: 6 * 3600e3 }); // free call
  let odds = {}; if (withOdds) { try { const j = await wget(`${ODDSAPI()}/v4/sports/${key}/odds?apiKey=${k}&regions=us&markets=h2h&oddsFormat=american&dateFormat=iso`, { ttl: 12 * 3600e3 }); for (const e of j || []) odds[e.id] = e; } catch {} }
  return (evs || []).map((e) => { const o = odds[e.id]; return { id: 'odds:' + e.id, a: e.home_team, b: e.away_team, date: e.commence_time, mlA: o ? bestLine(o.bookmakers, e.home_team) : null, mlB: o ? bestLine(o.bookmakers, e.away_team) : null }; });
}
async function fights(a) {
  const out = { ufc: [], boxing: [], mma: [], errors: [], hasKey: !!KEY.odds };
  const now = Date.now(), from = a.from || now - 10 * 864e5, to = a.to || now + 120 * 864e5;
  if (a.ufc !== false) {
    try {
      const j = await wget(`${ESPN()}/apis/site/v2/sports/mma/ufc/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=200`, { ttl: 1800e3 });
      for (const ev of j.events || []) {
        const comps = ev.competitions || [], v = (comps[0] || {}).venue || (ev.venues || [])[0] || {};
        const bouts = comps.map((c) => { const f = (c.competitors || []).map((x) => { const at = x.athlete || x.team || {}; const rec = (x.records || [])[0]; return { name: at.displayName || at.fullName || at.name || '', short: at.shortName || at.displayName || '', flag: (at.flag && at.flag.href) || '', record: rec ? rec.summary || '' : '', winner: !!x.winner }; });
          const st = (c.status || {}).type || {}; const o = espnOdds((c.odds || [])[0], c.competitors); const ha = ((c.competitors || [])[0] || {}).homeAway; const mlA = o ? (ha === 'away' ? o.mlAway : o.mlHome) : null, mlB = o ? (ha === 'away' ? o.mlHome : o.mlAway) : null;
          return { a: f[0] || {}, b: f[1] || {}, weight: (c.type && (c.type.text || c.type.abbreviation)) || '', state: st.state || 'pre', detail: st.shortDetail || st.detail || '', result: (c.status && c.status.result && (c.status.result.displayName || c.status.result.name)) || '', date: c.date || ev.date, odds: o, mlA, mlB, broadcasts: [...new Set([].concat(...(c.broadcasts || []).map((b) => b.names || [])))] }; });
        out.ufc.push({ kind: 'fight', sport: 'ufc', id: 'ufc:' + ev.id, name: ev.name || ev.shortName || 'UFC', date: ev.date, venue: v.fullName ? { name: v.fullName, city: (v.address || {}).city || '', state: (v.address || {}).state || '', country: (v.address || {}).country || '' } : null, bouts, main: bouts[bouts.length - 1] || null, state: ((ev.status || {}).type || {}).state || (bouts.some((b) => b.state === 'in') ? 'in' : bouts.every((b) => b.state === 'post') && bouts.length ? 'post' : 'pre'), broadcasts: [...new Set([].concat(...bouts.map((b) => b.broadcasts)))] });
      }
    } catch (e) { out.errors.push('UFC: ' + e.message); }
  }
  if (KEY.odds) {
    for (const [key, slot] of [['boxing_boxing', 'boxing'], ['mma_mixed_martial_arts', 'mma']]) {
      if (a[slot] === false) continue;
      try { out[slot] = (await oddsSport(key, a.odds !== false)).map((f) => Object.assign(f, { kind: 'fight', sport: slot, name: `${f.a} vs ${f.b}` })); } catch (e) { out.errors.push((slot === 'boxing' ? 'Boxing' : 'MMA') + ': ' + (e.status === 401 ? 'The Odds API did not accept the key or the monthly limit is used up.' : e.message)); }
    }
  }
  return out;
}
ipcMain.handle('van:watch', async (_e, a = {}) => {
  try {
    switch (a.op) {
      case 'keys': if ('tmdb' in a) cfg.tmdbKey = String(a.tmdb || '').trim(); if ('omdb' in a) cfg.omdbKey = String(a.omdb || '').trim(); if ('odds' in a) cfg.oddsKey = String(a.odds || '').trim(); if ('tmdb' in a || 'omdb' in a || 'odds' in a) { saveCfg(); wcache.clear(); }
        return { builtin: builtinUse(), odds: !!KEY.odds, oddsHint: KEY.odds ? KEY.odds.slice(0, 4) + '…' : '', tmdb: !!KEY.tmdb, omdb: !!KEY.omdb, tmdbHint: KEY.tmdb ? KEY.tmdb.slice(0, 4) + '…' : '', omdbHint: KEY.omdb ? KEY.omdb.slice(0, 3) + '…' : '' };
      case 'testKeys': {
        const out = {};
        if (KEY.tmdb) { try { await tmdb('/configuration', {}, 0); out.tmdb = true; } catch (e) { out.tmdb = false; out.tmdbErr = e.status === 401 ? 'TMDB did not accept that key.' : e.message; } }
        if (KEY.odds) { try { await wget(`${ODDSAPI()}/v4/sports?apiKey=${encodeURIComponent(KEY.odds)}`, { ttl: 0 }); out.odds = true; } catch (e) { out.odds = false; out.oddsErr = e.status === 401 ? 'The Odds API did not accept that key.' : e.message; } }
        if (KEY.omdb) { try { const j = await wget(`${process.env.VAN_OMDB || 'https://www.omdbapi.com'}/?apikey=${encodeURIComponent(KEY.omdb)}&i=tt0111161`, { ttl: 0 }); out.omdb = j.Response !== 'False'; if (!out.omdb) out.omdbErr = 'OMDb: ' + j.Error; } catch (e) { out.omdb = false; out.omdbErr = e.status === 401 ? 'OMDb did not accept that key (check the activation email).' : e.message; } }
        return out;
      }
      case 'teams': {
        const [sp, lg] = WATCH_LEAGUES[a.league] || []; if (!sp) throw new Error('Unknown league');
        const j = await wget(`${ESPN()}/apis/site/v2/sports/${sp}/${lg}/teams?limit=1000`, { ttl: 7 * 864e5 });
        const list = (((j.sports || [])[0] || {}).leagues || [])[0];
        return ((list && list.teams) || []).map((x) => x.team).map((t) => ({ id: String(t.id), abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName || t.name, logo: (t.logos && t.logos[0] && t.logos[0].href) || '', color: t.color ? '#' + t.color : '' })).sort((x, y) => x.name.localeCompare(y.name));
      }
      case 'scoreboard': {
        const [sp, lg] = WATCH_LEAGUES[a.league] || []; if (!sp) throw new Error('Unknown league');
        const from = a.from || Date.now() - 7 * 864e5, to = a.to || Date.now() + 14 * 864e5;
        const live = Date.now() > from && Date.now() < to;
        const base = `${ESPN()}/apis/site/v2/sports/${sp}/${lg}/scoreboard`, grp = a.league === 'cfb' ? '&groups=80' : '', ttl = live ? 120e3 : 1800e3;
        let events = [];
        try { events = (await wget(`${base}?dates=${ymd(from)}-${ymd(to)}&limit=1000${grp}`, { ttl })).events || []; }
        catch (e) { // ESPN sometimes rejects long ranges; ask a week at a time, then a day at a time
          if (e.status !== 400 && e.status !== 404) throw e;
          const seen = new Set(), push = (list) => { for (const ev of list || []) if (!seen.has(ev.id)) { seen.add(ev.id); events.push(ev); } };
          for (let t = from; t <= to; t += 7 * 864e5) {
            const end = Math.min(to, t + 6 * 864e5);
            try { push((await wget(`${base}?dates=${ymd(t)}-${ymd(end)}${grp}`, { ttl })).events); }
            catch { for (let d = t; d <= end; d += 864e5) { try { push((await wget(`${base}?dates=${ymd(d)}${grp}`, { ttl })).events); } catch {} } }
          }
        }
        const j = { events };
        return (j.events || []).map((ev) => espnEvent(ev, a.league));
      }
      case 'schedule': {
        const [sp, lg] = WATCH_LEAGUES[a.league] || []; if (!sp) throw new Error('Unknown league');
        const j = await wget(`${ESPN()}/apis/site/v2/sports/${sp}/${lg}/teams/${encodeURIComponent(a.team)}/schedule`, { ttl: 900e3 });
        let evs = (j.events || []).map((ev) => espnEvent(ev, a.league));
        // Some leagues need the postseason asked for separately
        if (a.league === 'nfl' || a.league === 'nba') { try { const p = await wget(`${ESPN()}/apis/site/v2/sports/${sp}/${lg}/teams/${encodeURIComponent(a.team)}/schedule?seasontype=3`, { ttl: 3600e3 }); const ids = new Set(evs.map((x) => x.eid)); evs = evs.concat((p.events || []).map((ev) => espnEvent(ev, a.league)).filter((x) => !ids.has(x.eid))); } catch {} }
        return evs;
      }
      case 'odds': { // betting line from the game summary, for games the scoreboard has no line for yet
        const [sp, lg] = WATCH_LEAGUES[a.league] || []; if (!sp) return null;
        const j = await wget(`${ESPN()}/apis/site/v2/sports/${sp}/${lg}/summary?event=${encodeURIComponent(a.eid)}`, { ttl: 1800e3 });
        const comps = (((j.header || {}).competitions || [])[0] || {}).competitors || [];
        return espnOdds((j.odds || [])[0] || (j.pickcenter || [])[0], comps);
      }
      case 'fights': return fights(a);
      case 'tvSearch': { const j = await wget(`${process.env.VAN_TVMAZE || 'https://api.tvmaze.com'}/search/shows?q=${encodeURIComponent(a.q || '')}`, { ttl: 3600e3 }); return j.map((x) => x.show); }
      case 'tvShow': return wget(`${process.env.VAN_TVMAZE || 'https://api.tvmaze.com'}/shows/${encodeURIComponent(a.id)}?embed[]=nextepisode&embed[]=previousepisode`, { ttl: 1800e3 });
      case 'tvEpisodes': return wget(`${process.env.VAN_TVMAZE || 'https://api.tvmaze.com'}/shows/${encodeURIComponent(a.id)}/episodes`, { ttl: 3 * 3600e3 });
      case 'tvSchedule': {
        const T = process.env.VAN_TVMAZE || 'https://api.tvmaze.com', d = a.date;
        const [web, net_] = await Promise.all([wget(`${T}/schedule/web?date=${d}&country=US`, { ttl: 3600e3 }).catch(() => []), wget(`${T}/schedule?country=US&date=${d}`, { ttl: 3600e3 }).catch(() => [])]);
        return web.concat(net_);
      }
      case 'ratings': return omdbRatings(a.imdb);
      case 'movies': {
        const list = ['upcoming', 'now_playing', 'popular', 'top_rated'].includes(a.list) ? a.list : 'upcoming';
        const j = await tmdb('/movie/' + list, { region: 'US', language: 'en-US', page: String(a.page || 1) });
        return { items: (j.results || []).map(tmdbMovie), more: (j.page || 1) < (j.total_pages || 1) };
      }
      case 'trendingTv': { const j = await tmdb('/trending/tv/week', {}); return (j.results || []).map(tmdbMovie); }
      case 'movieSearch': { const j = await tmdb('/search/movie', { query: a.q || '', region: 'US' }); return (j.results || []).map(tmdbMovie); }
      case 'movieDetail': {
        const j = await tmdb('/movie/' + a.id, { append_to_response: 'external_ids,watch/providers,release_dates' });
        const us = ((j.release_dates || {}).results || []).find((x) => x.iso_3166_1 === 'US');
        const rel = us ? us.release_dates.map((x) => ({ type: x.type, date: x.release_date })) : [];
        const imdb = j.imdb_id || (j.external_ids || {}).imdb_id || '';
        let ratings = null; try { ratings = await omdbRatings(imdb); } catch (e) { ratings = { error: e.message }; }
        return { ...tmdbMovie(j), imdbId: imdb, runtime: j.runtime, genres: (j.genres || []).map((g) => g.name), providers: providersOf(j['watch/providers']), releases: rel, ratings };
      }
      case 'tvProviders': {
        if (!KEY.tmdb || !a.imdb) return null;
        const f = await tmdb('/find/' + a.imdb, { external_source: 'imdb_id' }); const t = (f.tv_results || [])[0]; if (!t) return null;
        const wp = await tmdb(`/tv/${t.id}/watch/providers`, {}); return providersOf(wp);
      }
    }
    return null;
  } catch (e) { if (e.message !== 'NO_TMDB') logErr('watch:' + a.op, e); return { error: e.message === 'NO_TMDB' ? 'NO_TMDB' : e.message }; }
});

/* ---------- Games: deals (CheapShark, Steam, Xbox store, IsThereAnyDeal), friend slop stats (Steam, SteamSpy), releases (RAWG, Steam, Xbox) ---------- */
const G = {
  cs: () => process.env.VAN_CHEAPSHARK || 'https://www.cheapshark.com',
  store: () => process.env.VAN_STEAMSTORE || 'https://store.steampowered.com',
  sapi: () => process.env.VAN_STEAMAPI || 'https://api.steampowered.com',
  spy: () => process.env.VAN_STEAMSPY || 'https://steamspy.com',
  reco: () => process.env.VAN_XRECO || 'https://reco-public.rec.mp.microsoft.com',
  xcat: () => process.env.VAN_XCAT || 'https://displaycatalog.mp.microsoft.com',
  itad: () => process.env.VAN_ITAD || 'https://api.isthereanydeal.com',
  rawg: () => process.env.VAN_RAWG || 'https://api.rawg.io'
};
async function wpost(url, body, { ttl = 600e3 } = {}) {
  const key = url + '|' + JSON.stringify(body), hit = wcache.get(key); if (hit && Date.now() - hit.t < ttl) return hit.v;
  const r = await net.fetch(url, { method: 'POST', headers: { 'User-Agent': 'VanMule/' + app.getVersion() + ' (Windows desktop app)', 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { const e = new Error(`${new URL(url).host} answered ${r.status}`); e.status = r.status; throw e; }
  const v = await r.json(); wcache.set(key, { t: Date.now(), v }); return v;
}
// SteamSpy allows about one request a second
let spyChain = Promise.resolve();
function spyGet(q, ttl) { const p = spyChain.then(() => wget(`${G.spy()}/api.php?${q}`, { ttl })); spyChain = p.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 1100))); return p; }
// Our own price log, so lows build up even for stores nobody tracks (Xbox)
let plog = null; const plogFile = () => path.join(app.getPath('userData'), 'price-history.json');
function priceLog(key, price, regular) {
  if (price == null || isNaN(price)) return null;
  if (!plog) { try { plog = JSON.parse(fs.readFileSync(plogFile(), 'utf8')); } catch { plog = {}; } }
  const e = plog[key] || (plog[key] = { first: Date.now(), low: price, lowAt: Date.now(), pts: [] });
  const day = new Date().toISOString().slice(0, 10), last = e.pts[e.pts.length - 1];
  if (!last || last[0] !== day) e.pts.push([day, price]); else last[1] = Math.min(last[1], price);
  if (e.pts.length > 800) e.pts.splice(0, e.pts.length - 800);
  if (price < e.low) { e.low = price; e.lowAt = Date.now(); }
  if (regular) e.regular = regular;
  clearTimeout(priceLog.t); priceLog.t = setTimeout(() => { try { fs.writeFileSync(plogFile(), JSON.stringify(plog)); } catch {} }, 2000);
  const yr = Date.now() - 365 * 864e5, yLow = Math.min(...e.pts.filter((p) => new Date(p[0]) >= yr).map((p) => p[1]));
  return { low: e.low, lowAt: e.lowAt, yLow: isFinite(yLow) ? yLow : null, since: e.first };
}
const num = (x) => (x == null || x === '' ? null : +x);
async function csLows(ids) { // CheapShark game ids -> all-time low (any store)
  const out = {}; ids = [...new Set(ids.filter(Boolean))];
  const chunks = []; for (let i = 0; i < ids.length; i += 25) chunks.push(ids.slice(i, i + 25));
  await Promise.all(chunks.map(async (chunk) => {
    try { const j = await wget(`${G.cs()}/api/1.0/games?ids=${chunk.join(',')}`, { ttl: 6 * 3600e3 }); for (const [id, g] of Object.entries(j || {})) if (g && g.cheapestPriceEver) out[id] = { price: num(g.cheapestPriceEver.price), date: g.cheapestPriceEver.date ? g.cheapestPriceEver.date * 1000 : null }; } catch {}
  }));
  return out;
}
let itadShops = null;
async function itadShopId(name) {
  if (!itadShops) { try { itadShops = await wget(`${G.itad()}/service/shops/v1?country=US&key=${encodeURIComponent(KEY.itad)}`, { ttl: 7 * 864e5 }); } catch { itadShops = []; } }
  const s = (itadShops || []).find((x) => new RegExp(name, 'i').test(x.title)); return s ? s.id : null;
}
async function itadLows(steamAppIds) { // Steam appid -> {all, y1, m3, steamLow} from IsThereAnyDeal
  if (!KEY.itad || !steamAppIds.length) return {};
  const k = encodeURIComponent(KEY.itad), steam = (await itadShopId('^steam$')) || 61;
  const ids = await wpost(`${G.itad()}/lookup/id/shop/${steam}/v1?key=${k}`, steamAppIds.map((a) => 'app/' + a), { ttl: 7 * 864e5 });
  const back = {}; for (const [shopId, gid] of Object.entries(ids || {})) if (gid) back[gid] = shopId.replace('app/', '');
  const gids = Object.keys(back); if (!gids.length) return {};
  const out = {};
  for (let i = 0; i < gids.length; i += 100) {
    const pr = await wpost(`${G.itad()}/games/prices/v3?key=${k}&country=US&shops=${steam}`, gids.slice(i, i + 100), { ttl: 3600e3 });
    for (const g of pr || []) { const hl = g.historyLow || {}, d = (g.deals || [])[0]; out[back[g.id]] = { all: hl.all ? hl.all.amount : null, y1: hl.y1 ? hl.y1.amount : null, m3: hl.m3 ? hl.m3.amount : null, steamLow: d && d.storeLow ? d.storeLow.amount : null, itad: g.id }; }
  }
  return out;
}
const rawgUrl = (p, q) => { const u = new URL(G.rawg() + '/api' + p); u.searchParams.set('key', KEY.rawg); for (const [a, b] of Object.entries(q || {})) u.searchParams.set(a, b); return u.href; };
const rawgGame = (g) => ({ kind: 'vg', id: 'rawg:' + g.id, rawg: g.id, title: g.name, date: g.released || '', tba: !!g.tba, image: g.background_image || '', platforms: (g.platforms || []).map((p) => p.platform && p.platform.name).filter(Boolean), metacritic: g.metacritic || null, rating: g.rating || null, added: g.added || 0, genres: (g.genres || []).map((x) => x.name), slug: g.slug });
function parseSteamDate(s) { if (!s) return ''; const d = new Date(s + ' 12:00'); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
async function steamApp(appid) { // store details, cached a day
  const j = await wget(`${G.store()}/api/appdetails?appids=${appid}&cc=us&l=english`, { ttl: 864e5 });
  const d = j && j[appid] && j[appid].success ? j[appid].data : null; if (!d) return null;
  const po = d.price_overview || null;
  return { appid: String(appid), name: d.name, image: d.header_image || '', released: d.release_date ? d.release_date.date : '', comingSoon: !!(d.release_date && d.release_date.coming_soon), date: parseSteamDate(d.release_date && d.release_date.date), free: !!d.is_free, price: po ? po.final / 100 : d.is_free ? 0 : null, regular: po ? po.initial / 100 : null, cut: po ? po.discount_percent : 0, devs: d.developers || [], genres: (d.genres || []).map((g) => g.description), platforms: Object.entries(d.platforms || {}).filter(([, v]) => v).map(([k]) => k) };
}
async function steamPrices(appids) { // batch price check (Steam allows many ids with filters=price_overview)
  const out = {};
  for (let i = 0; i < appids.length; i += 50) {
    try { const j = await wget(`${G.store()}/api/appdetails?appids=${appids.slice(i, i + 50).join(',')}&cc=us&filters=price_overview`, { ttl: 1800e3 });
      for (const [id, v] of Object.entries(j || {})) { const po = v && v.success && v.data && v.data.price_overview; out[id] = po ? { price: po.final / 100, regular: po.initial / 100, cut: po.discount_percent } : (v && v.success ? { price: 0, regular: 0, cut: 0, free: true } : null); } } catch {}
  }
  return out;
}
function xboxProduct(p) {
  const lp = (p.LocalizedProperties || [])[0] || {}, mp = (p.MarketProperties || [])[0] || {};
  const av = (((p.DisplaySkuAvailabilities || [])[0] || {}).Availabilities || []).find((a) => a.OrderManagementData && a.OrderManagementData.Price) || {};
  const pr = (av.OrderManagementData || {}).Price || {};
  const img = (lp.Images || []).find((i) => i.ImagePurpose === 'Poster') || (lp.Images || []).find((i) => i.ImagePurpose === 'BoxArt') || (lp.Images || [])[0];
  const use = (mp.UsageData || []).find((u) => u.AggregateTimeSpan === 'AllTime') || {};
  const price = pr.ListPrice != null ? +pr.ListPrice : null, regular = pr.MSRP != null ? +pr.MSRP : null;
  const aff = ((lp.EligibilityProperties || {}).Affirmations || []).map((a) => a.Description || '').join(' ');
  return { id: p.ProductId, title: lp.ProductTitle || lp.ShortTitle || p.ProductId, image: img ? (img.Uri.startsWith('//') ? 'https:' + img.Uri : img.Uri) : '', price, regular, cut: price != null && regular ? Math.round((1 - price / regular) * 100) : 0, ends: (av.Conditions || {}).EndDate || null, released: mp.OriginalReleaseDate || '', rating: use.AverageRating != null ? +use.AverageRating : null, ratings: use.RatingCount || 0, publisher: lp.PublisherName || '', gamePass: /game pass/i.test(aff), url: `https://www.xbox.com/en-US/games/store/p/${p.ProductId}` };
}
async function xboxProducts(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 20) {
    const j = await wget(`${G.xcat()}/v7.0/products?bigIds=${ids.slice(i, i + 20).join(',')}&market=US&languages=en-us&MS-CV=DGU1mcuYo0WMMp+F.1`, { ttl: 1800e3 });
    for (const p of j.Products || []) { try { out.push(xboxProduct(p)); } catch {} }
  }
  return out;
}
const FRIENDSLOP_SEED = ['Lethal Company', 'R.E.P.O.', 'PEAK', 'Content Warning', 'Among Us', 'Phasmophobia', 'Schedule I', 'Chained Together', 'WEBFISHING', 'Buckshot Roulette', "Liar's Bar", 'LOCKDOWN Protocol', 'Mage Arena', 'Escape the Backrooms', 'Dale & Dawson Stationery Supplies', 'Murky Divers', 'YAPYAP', 'Super Battle Golf'];
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
async function steamSearch(term) {
  const j = await wget(`${G.store()}/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`, { ttl: 864e5 });
  return (j.items || []).filter((x) => x.type === 'app' || !x.type).map((x) => ({ appid: String(x.id), name: x.name, image: x.tiny_image || '', price: x.price ? x.price.final / 100 : null }));
}
async function slopStats(appid) {
  const [app_, rev, cur, spy] = await Promise.all([
    steamApp(appid).catch(() => null),
    wget(`${G.store()}/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`, { ttl: 3 * 3600e3 }).catch(() => null),
    wget(`${G.sapi()}/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`, { ttl: 600e3 }).catch(() => null),
    spyGet(`request=appdetails&appid=${appid}`, 12 * 3600e3).catch(() => null)
  ]);
  const q = (rev && rev.query_summary) || {};
  const own = spy && spy.owners ? spy.owners.split('..').map((x) => +x.replace(/[^0-9]/g, '')) : null;
  const total = q.total_reviews || ((spy && (spy.positive || 0) + (spy.negative || 0)) || 0), pos = q.total_positive != null ? q.total_positive : spy ? spy.positive : 0;
  return { appid: String(appid), name: (app_ && app_.name) || (spy && spy.name) || '', image: app_ ? app_.image : '', released: app_ ? app_.released : '', date: app_ ? app_.date : '', comingSoon: app_ ? app_.comingSoon : false,
    price: app_ ? app_.price : spy && spy.price != null ? +spy.price / 100 : null, regular: app_ ? app_.regular : null, cut: app_ ? app_.cut : 0, free: app_ ? app_.free : false,
    reviews: total, positive: pos, pct: total ? Math.round((pos / total) * 100) : null, desc: q.review_score_desc || '',
    players: cur && cur.response && cur.response.result === 1 ? cur.response.player_count : null, peak: spy && spy.ccu != null ? spy.ccu : null,
    ownersLo: own ? own[0] : null, ownersHi: own ? own[1] : null, devs: app_ ? app_.devs : spy && spy.developer ? [spy.developer] : [], tags: spy && spy.tags && !Array.isArray(spy.tags) ? Object.keys(spy.tags).slice(0, 6) : [] };
}

async function xboxDealsDirect(a) {
  const list = ['Deal', 'TopPaid', 'BestRated', 'New', 'ComingSoon', 'MostPlayed'].includes(a.list) ? a.list : 'Deal';
  const j = await wget(`${G.reco()}/channels/Reco/V8.0/Lists/Computed/${list}?market=US&language=en-US&itemTypes=Game&deviceFamily=Windows.Xbox&count=${Math.min(400, a.count || 200)}&skipItems=0`, { ttl: 1800e3 });
  const ids = (j.Items || []).map((x) => x.Id).filter(Boolean);
  const items = await xboxProducts(ids);
  for (const x of items) { const h = priceLog('xbox:' + x.id, x.price, x.regular); if (h) Object.assign(x, { seenLow: h.low, seenLowAt: h.lowAt, seenY1: h.yLow, seenSince: h.since }); }
  return { items };
}
async function itadMsDeals() { // Microsoft Store deals with 1-year and all-time lows, from IsThereAnyDeal
  const shop = (await itadShopId('microsoft')) || 48, k = encodeURIComponent(KEY.itad), rows = [];
  for (let off = 0; off < 400; off += 200) {
    const j = await wget(`${G.itad()}/deals/v2?key=${k}&country=US&shops=${shop}&limit=200&offset=${off}&sort=-cut`, { ttl: 1800e3 });
    rows.push(...(j.list || [])); if (!j.hasMore) break;
  }
  return rows.filter((g) => g.deal && g.type !== 'dlc').map((g) => { const d = g.deal, as = g.assets || {};
    return { id: 'itad:' + g.id, itad: g.id, title: g.title, image: as.banner145 || as.banner300 || as.boxart || '', price: d.price ? d.price.amount : null, regular: d.regular ? d.regular.amount : null, cut: d.cut || 0, ends: d.expiry || null, rating: null, ratings: 0, gamePass: false,
      seenLow: d.storeLow ? d.storeLow.amount : null, seenSince: null, y1: d.historyLow_1y ? d.historyLow_1y.amount : null, low: d.historyLow ? d.historyLow.amount : null, url: d.url, pcOnly: true }; });
}
/* ---------- YouTube clips for the soundboard (yt-dlp, downloaded on first use) ---------- */
const YT = {
  dir: () => path.join(app.getPath('userData'), 'tools'),
  exe: () => path.join(app.getPath('userData'), 'tools', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'),
  deno: () => path.join(app.getPath('userData'), 'tools', process.platform === 'win32' ? 'deno.exe' : 'deno'),
  rel: () => process.env.VAN_YTDLP_REL || 'https://github.com/yt-dlp/yt-dlp/releases/latest/download',
  denoRel: () => process.env.VAN_DENO_REL || 'https://github.com/denoland/deno/releases/latest/download',
  busy: null
};
const ytSend = (m) => { if (win && !win.isDestroyed()) win.webContents.send('van:yt', m); };
async function dlFile(url, dest, label) {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'VanMule/' + app.getVersion() } });
  if (!r.ok) throw new Error(`${label}: download failed (${r.status})`);
  const total = +r.headers.get('content-length') || 0, tmp = dest + '.part', out = fs.createWriteStream(tmp), hash = require('crypto').createHash('sha256');
  let got = 0, last = 0; const reader = r.body.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; got += value.length; hash.update(value); if (!out.write(Buffer.from(value))) await new Promise((res) => out.once('drain', res));
    if (Date.now() - last > 250) { last = Date.now(); ytSend({ type: 'setup', label, got, total }); } }
  await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
  return { tmp, sha: hash.digest('hex') };
}
async function sumFor(url, name) { try { const r = await net.fetch(url); if (!r.ok) return null; const t = await r.text(); for (const line of t.split(/\r?\n/)) { const m = /([a-f0-9]{64})/i.exec(line); if (m && (!name || line.includes(name) || t.trim().split(/\r?\n/).length === 1)) return m[1].toLowerCase(); } } catch {} return null; }
async function ytSetup(force) {
  fs.mkdirSync(YT.dir(), { recursive: true });
  if (!fs.existsSync(YT.exe()) || force) {
    const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const want = await sumFor(`${YT.rel()}/SHA2-256SUMS`, name);
    const { tmp, sha } = await dlFile(`${YT.rel()}/${name}`, YT.exe(), 'YouTube downloader (yt-dlp)');
    if (want && want !== sha) { fs.rmSync(tmp, { force: true }); throw new Error('The yt-dlp download did not match its checksum. Try again later.'); }
    fs.renameSync(tmp, YT.exe()); if (process.platform !== 'win32') fs.chmodSync(YT.exe(), 0o755);
  }
  if (!fs.existsSync(YT.deno()) && process.platform === 'win32') { // YouTube now needs a JavaScript runtime; Deno is what yt-dlp uses by default
    try {
      const zipName = 'deno-x86_64-pc-windows-msvc.zip', zip = path.join(YT.dir(), zipName);
      const want = await sumFor(`${YT.denoRel()}/${zipName}.sha256sum`, '');
      const { tmp, sha } = await dlFile(`${YT.denoRel()}/${zipName}`, zip, 'JavaScript runtime (Deno)');
      if (want && want !== sha) { fs.rmSync(tmp, { force: true }); throw new Error('checksum mismatch'); }
      fs.renameSync(tmp, zip);
      await new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${YT.dir().replace(/'/g, "''")}' -Force`], { windowsHide: true, timeout: 120000 }, (e) => (e ? rej(e) : res())));
      fs.rmSync(zip, { force: true });
    } catch (e) { ytSend({ type: 'note', text: 'Deno could not be set up (' + e.message + '); VanMule will use its own runtime instead.' }); }
  }
  // keep yt-dlp current: YouTube changes often
  try { const st = fs.statSync(YT.exe()); if (Date.now() - st.mtimeMs > 10 * 864e5 && !force) { await ytRun(['-U'], 60000).catch(() => {}); fs.utimesSync(YT.exe(), new Date(), new Date()); } } catch {}
  return { ok: true };
}
function ytArgs(extra) {
  const a = ['--no-playlist', '--no-warnings', '--ignore-config'];
  if (!fs.existsSync(YT.deno())) a.push('--js-runtimes', 'node:' + process.execPath); // Electron can act as Node.js
  return a.concat(extra);
}
function ytRun(args, timeout = 180000, onLine) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const env = { ...process.env, PATH: YT.dir() + path.delimiter + (process.env.PATH || ''), ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8' };
    const p = spawn(YT.exe(), args, { env, windowsHide: true });
    let out = '', err = ''; const t = setTimeout(() => { try { p.kill(); } catch {} reject(new Error('YouTube took too long to answer. Try again.')); }, timeout);
    p.stdout.on('data', (d) => { out += d; if (onLine) String(d).split(/\r?\n/).forEach((l) => l && onLine(l)); });
    p.stderr.on('data', (d) => { err += d; if (onLine) String(d).split(/\r?\n/).forEach((l) => l && onLine(l)); });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); if (code === 0) resolve(out); else { const m = (err.match(/ERROR: (.*)/) || [])[1] || err.trim().split('\n').pop() || 'yt-dlp failed (' + code + ')'; reject(new Error(m.replace(/\[youtube\] [\w-]+: /, ''))); } });
  });
}
const ytClean = (u) => { const s = String(u || '').trim(); if (!/^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(s)) throw new Error('Paste a YouTube link (youtube.com or youtu.be).'); return s; };
function ytStart(u) { try { const x = new URL(u); const t = x.searchParams.get('t') || x.searchParams.get('start') || (x.hash.match(/t=([^&]+)/) || [])[1]; if (!t) return 0; if (/^\d+$/.test(t)) return +t; const m = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(t); return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); } catch { return 0; } }
ipcMain.handle('van:yt', async (_e, a = {}) => {
  try {
    switch (a.op) {
      case 'status': return { ready: fs.existsSync(YT.exe()), deno: fs.existsSync(YT.deno()) };
      case 'setup': if (!YT.busy) YT.busy = ytSetup(!!a.force).finally(() => { YT.busy = null; }); return await YT.busy;
      case 'info': {
        const url = ytClean(a.url); if (YT.busy) await YT.busy; if (!fs.existsSync(YT.exe())) await ytSetup();
        const j = JSON.parse(await ytRun(ytArgs(['-J', '--skip-download', url]), 120000));
        return { id: j.id, title: j.title || 'YouTube clip', duration: j.duration || 0, thumb: j.thumbnail || '', channel: j.channel || j.uploader || '', live: !!j.is_live, start: ytStart(url) };
      }
      case 'download': {
        const url = ytClean(a.url); const dir = path.join(app.getPath('temp'), 'vanmule-yt'); fs.mkdirSync(dir, { recursive: true });
        for (const f of fs.readdirSync(dir)) { try { fs.rmSync(path.join(dir, f), { force: true }); } catch {} }
        const outT = path.join(dir, 'clip.%(ext)s');
        const res = await ytRun(ytArgs(['-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio', '--match-filter', `duration <= ${a.maxSec || 1200}`, '-o', outT, '--print', 'after_move:filepath', '--newline', '--progress', url]), 600000,
          (l) => { const m = /\[download\]\s+([\d.]+)%/.exec(l); if (m) ytSend({ type: 'dl', pct: +m[1] }); });
        const file = res.trim().split(/\r?\n/).filter((x) => x && fs.existsSync(x.trim())).pop();
        if (!file) throw new Error('That video is too long (over 20 minutes) or has no audio.');
        const buf = fs.readFileSync(file.trim()); try { fs.rmSync(file.trim(), { force: true }); } catch {}
        return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), ext: path.extname(file.trim()) };
      }
      case 'video': { // a small, silent copy of the video for GIF memes
        const url = ytClean(a.url); if (YT.busy) await YT.busy; if (!fs.existsSync(YT.exe())) await ytSetup();
        const dir = path.join(app.getPath('temp'), 'vanmule-ytv'); fs.mkdirSync(dir, { recursive: true });
        for (const f of fs.readdirSync(dir)) { try { fs.rmSync(path.join(dir, f), { force: true }); } catch {} }
        const res = await ytRun(ytArgs(['-f', 'bv*[height<=480][ext=mp4][vcodec^=avc1]/bv*[height<=480][ext=webm]/18/bv*[height<=480]/w', '--match-filter', `duration <= ${a.maxSec || 1200}`, '-o', path.join(dir, 'clip.%(ext)s'), '--print', 'after_move:filepath', '--newline', '--progress', url]), 600000,
          (l) => { const m = /\[download\]\s+([\d.]+)%/.exec(l); if (m) ytSend({ type: 'dl', pct: +m[1] }); });
        const file = res.trim().split(/\r?\n/).filter((x) => x && fs.existsSync(x.trim())).pop();
        if (!file) throw new Error('That video is too long (over 20 minutes) or couldn\'t be downloaded.');
        const buf = fs.readFileSync(file.trim()); try { fs.rmSync(file.trim(), { force: true }); } catch {}
        if (buf.length > 300e6) throw new Error('That video is too big to turn into a GIF.');
        return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), ext: path.extname(file.trim()) };
      }
    }
    return null;
  } catch (e) { logErr('yt:' + a.op, e); return { error: e.message }; }
});

/* ---------- 3.6: standings, injuries, weather, fantasy, webhooks, free games, Game Pass, wishlist, game detection, push-to-talk, TTS, voice packs ---------- */
const SLEEPER = () => process.env.VAN_SLEEPER || 'https://api.sleeper.app';
const ESPNFF = () => process.env.VAN_ESPNFF || 'https://lm-api-reads.fantasy.espn.com';
const YAHOO_API = () => process.env.VAN_YAHOO || 'https://fantasysports.yahooapis.com';
const YAHOO_LOGIN = () => process.env.VAN_YAHOO_LOGIN || 'https://api.login.yahoo.com';
const OPENMETEO = () => process.env.VAN_METEO || 'https://api.open-meteo.com';
const GEOCODE = () => process.env.VAN_GEO || 'https://geocoding-api.open-meteo.com';
const EPIC = () => process.env.VAN_EPIC || 'https://store-site-backend-static.ak.epicgames.com';
const GAMEPASS = () => process.env.VAN_GAMEPASS || 'https://catalog.gamepass.com';
const STEAMCOMM = () => process.env.VAN_STEAMCOMM || 'https://steamcommunity.com';
const ESPN_PRO = { 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU' };
const ESPN_POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST' };
const ESPN_BENCH = new Set([20, 21]); // bench, IR
const statOf = (e, n) => { const s = (e.stats || []).find((x) => x.name === n || x.type === n); return s ? (s.displayValue != null ? s.displayValue : s.value) : ''; };
async function standings(league) {
  const [sp, lg] = WATCH_LEAGUES[league] || []; if (!sp) throw new Error('Unknown league');
  const j = await wget(`${ESPN()}/apis/v2/sports/${sp}/${lg}/standings`, { ttl: 1800e3 });
  const groups = (j.children && j.children.length ? j.children : [j]).map((g) => ({
    name: g.name || g.abbreviation || '',
    teams: ((g.standings || {}).entries || []).map((e) => { const t = e.team || {}; return { id: String(t.id || ''), name: t.displayName || t.name || '', abbr: t.abbreviation || '', logo: (t.logos && t.logos[0] && t.logos[0].href) || '', w: statOf(e, 'wins'), l: statOf(e, 'losses'), t: statOf(e, 'ties'), pct: statOf(e, 'winPercent'), gb: statOf(e, 'gamesBehind'), seed: +statOf(e, 'playoffSeed') || null, streak: statOf(e, 'streak'), diff: statOf(e, 'pointDifferential') || statOf(e, 'differential'), clinch: statOf(e, 'clincher') }; })
  }));
  for (const g of groups) g.teams.sort((a, b) => (a.seed || 99) - (b.seed || 99) || (+b.pct || 0) - (+a.pct || 0));
  return { groups, playoffSpots: { nfl: 7, nba: 6, nhl: 8, mlb: 6, wnba: 8, mls: 9 }[league] || 0, playIn: league === 'nba' ? 10 : 0 };
}
async function injuries(league, eid) {
  const [sp, lg] = WATCH_LEAGUES[league] || []; if (!sp) return [];
  const j = await wget(`${ESPN()}/apis/site/v2/sports/${sp}/${lg}/summary?event=${encodeURIComponent(eid)}`, { ttl: 1800e3 });
  return (j.injuries || []).map((t) => ({ team: ((t.team || {}).abbreviation) || '', list: (t.injuries || []).map((i) => ({ name: ((i.athlete || {}).displayName) || '', pos: (((i.athlete || {}).position) || {}).abbreviation || '', status: i.status || (i.type && i.type.description) || '', detail: (i.details && (i.details.type || i.details.detail)) || i.shortComment || '' })).filter((x) => x.name) }));
}
async function weather(a) { // Open-Meteo, no key
  const g = await wget(`${GEOCODE()}/v1/search?name=${encodeURIComponent(a.city)}&count=5&language=en&format=json`, { ttl: 30 * 864e5 });
  const hit = (g.results || []).find((r) => !a.state || r.admin1_code === a.state || (r.admin1 || '').toLowerCase().startsWith(String(a.stateName || '').toLowerCase())) || (g.results || [])[0];
  if (!hit) return null;
  const day = new Date(a.date).toISOString().slice(0, 10);
  const w = await wget(`${OPENMETEO()}/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC&start_date=${day}&end_date=${day}`, { ttl: 3 * 3600e3 });
  const h = w.hourly || {}, hour = new Date(a.date).getUTCHours(), i = Math.min(Math.max(0, hour), (h.time || []).length - 1);
  if (!h.time || i < 0) return null;
  const code = (h.weather_code || [])[i], desc = code == null ? '' : code === 0 ? 'Clear' : code <= 3 ? 'Partly cloudy' : code <= 48 ? 'Fog' : code <= 67 ? 'Rain' : code <= 77 ? 'Snow' : code <= 82 ? 'Showers' : code <= 86 ? 'Snow showers' : 'Thunderstorms';
  return { temp: Math.round((h.temperature_2m || [])[i]), rain: (h.precipitation_probability || [])[i], wind: Math.round((h.wind_speed_10m || [])[i]), desc };
}
/* --- fantasy --- */
let sleeperPlayers = null;
async function sleeperDb() {
  if (sleeperPlayers) return sleeperPlayers;
  const f = path.join(app.getPath('userData'), 'sleeper-players.json');
  try { const st = fs.statSync(f); if (Date.now() - st.mtimeMs < 3 * 864e5) { sleeperPlayers = JSON.parse(fs.readFileSync(f, 'utf8')); return sleeperPlayers; } } catch {}
  const r = await net.fetch(`${SLEEPER()}/v1/players/nfl`); if (!r.ok) throw new Error('Sleeper players: ' + r.status);
  const all = await r.json(), slim = {};
  for (const [id, p] of Object.entries(all)) slim[id] = { n: p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || (p.team ? p.team + ' D/ST' : id), t: p.team || '', p: p.position || (p.fantasy_positions || [])[0] || '' };
  sleeperPlayers = slim; try { fs.writeFileSync(f, JSON.stringify(slim)); } catch {}
  return slim;
}
async function fantasySleeper(a) {
  const u = await wget(`${SLEEPER()}/v1/user/${encodeURIComponent(a.user)}`, { ttl: 864e5 }); if (!u || !u.user_id) throw new Error('Sleeper user not found');
  const state = await wget(`${SLEEPER()}/v1/state/nfl`, { ttl: 3600e3 });
  const season = state.league_season || state.season || new Date().getFullYear(), week = state.display_week || state.week || 1;
  const leagues = await wget(`${SLEEPER()}/v1/user/${u.user_id}/leagues/nfl/${season}`, { ttl: 6 * 3600e3 });
  const db = await sleeperDb(), out = [];
  for (const lg of (leagues || []).slice(0, 6)) {
    const [rosters, users, matchups] = await Promise.all([wget(`${SLEEPER()}/v1/league/${lg.league_id}/rosters`, { ttl: 600e3 }), wget(`${SLEEPER()}/v1/league/${lg.league_id}/users`, { ttl: 6 * 3600e3 }), wget(`${SLEEPER()}/v1/league/${lg.league_id}/matchups/${week}`, { ttl: 120e3 })]);
    const mine = (rosters || []).find((r) => r.owner_id === u.user_id || (r.co_owners || []).includes(u.user_id)); if (!mine) continue;
    const me = (matchups || []).find((m) => m.roster_id === mine.roster_id) || {};
    const opp = (matchups || []).find((m) => m.matchup_id && m.matchup_id === me.matchup_id && m.roster_id !== mine.roster_id) || null;
    const oppRoster = opp && (rosters || []).find((r) => r.roster_id === opp.roster_id);
    const nameOf = (r) => { const us = (users || []).find((x) => r && x.user_id === r.owner_id); return (us && ((us.metadata || {}).team_name || us.display_name)) || 'Team ' + (r ? r.roster_id : ''); };
    const pl = (ids, pts, starters) => (ids || []).filter((id) => id && id !== '0').map((id) => ({ name: (db[id] || {}).n || id, team: (db[id] || {}).t || '', pos: (db[id] || {}).p || '', pts: pts && pts[id] != null ? pts[id] : null, starter: (starters || []).includes(id) }));
    out.push({ source: 'Sleeper', league: lg.name, week, me: { name: nameOf(mine), pts: me.points != null ? me.points : null, record: mine.settings ? `${mine.settings.wins}-${mine.settings.losses}${mine.settings.ties ? '-' + mine.settings.ties : ''}` : '', players: pl(mine.players, me.players_points, me.starters || mine.starters) }, opp: opp ? { name: nameOf(oppRoster), pts: opp.points != null ? opp.points : null, players: pl(opp.starters, opp.players_points, opp.starters) } : null, board: (() => { const by = {}; for (const mm of matchups || []) if (mm.matchup_id) (by[mm.matchup_id] = by[mm.matchup_id] || []).push(mm); return Object.values(by).map((pair) => { const [x, y] = pair, rx = (rosters || []).find((r) => r.roster_id === (x || {}).roster_id), ry = y && (rosters || []).find((r) => r.roster_id === y.roster_id); return { a: { name: nameOf(rx), pts: x && x.points != null ? x.points : null }, b: y ? { name: nameOf(ry), pts: y.points != null ? y.points : null } : null, mine: pair.some((q) => q.roster_id === mine.roster_id) }; }); })() });
  }
  return out;
}
async function fantasyEspn(a) {
  const season = a.season || new Date().getFullYear() - (new Date().getMonth() < 2 ? 1 : 0);
  const headers = a.s2 && a.swid ? { Cookie: `espn_s2=${a.s2}; SWID=${a.swid}` } : {};
  const j = await wget(`${ESPNFF()}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${encodeURIComponent(a.league)}?view=mMatchupScore&view=mTeam&view=mRoster&view=mSettings&view=mScoreboard`, { ttl: 120e3, headers });
  const week = j.scoringPeriodId || (j.status || {}).currentMatchupPeriod || 1, period = (j.status || {}).currentMatchupPeriod || week;
  const teams = j.teams || [], tname = (t) => t ? (t.name || `${t.location || ''} ${t.nickname || ''}`.trim() || t.abbrev || 'Team ' + t.id) : '';
  const me = teams.find((t) => String(t.id) === String(a.team)) || teams.find((t) => a.swid && (t.owners || []).includes(a.swid)) || null;
  const list = teams.map((t) => ({ id: t.id, name: tname(t) }));
  if (!me) return [{ source: 'ESPN', league: (j.settings || {}).name || 'ESPN league', week, pickTeam: list }];
  const m = (j.schedule || []).find((s) => s.matchupPeriodId === period && ((s.home || {}).teamId === me.id || (s.away || {}).teamId === me.id)) || {};
  const side = (m.home || {}).teamId === me.id ? 'home' : 'away', oSide = side === 'home' ? 'away' : 'home', ot = teams.find((t) => t.id === (m[oSide] || {}).teamId);
  const pl = (t) => (((t || {}).roster || {}).entries || []).map((e) => { const p = ((e.playerPoolEntry || {}).player) || {}; return { name: p.fullName || '', team: ESPN_PRO[p.proTeamId] || '', pos: ESPN_POS[p.defaultPositionId] || '', pts: e.playerPoolEntry && e.playerPoolEntry.appliedStatTotal != null ? Math.round(e.playerPoolEntry.appliedStatTotal * 10) / 10 : null, starter: !ESPN_BENCH.has(e.lineupSlotId) }; });
  const pts = (s) => s ? (s.totalPointsLive != null ? s.totalPointsLive : s.totalPoints) : null;
  return [{ source: 'ESPN', league: (j.settings || {}).name || 'ESPN league', week, pickTeam: list, me: { name: tname(me), pts: pts(m[side]), record: me.record && me.record.overall ? `${me.record.overall.wins}-${me.record.overall.losses}` : '', players: pl(me) }, opp: ot ? { name: tname(ot), pts: pts(m[oSide]), players: pl(ot).filter((x) => x.starter) } : null, board: (j.schedule || []).filter((s) => s.matchupPeriodId === period).map((s) => { const ta = teams.find((t) => t.id === (s.home || {}).teamId), tb = teams.find((t) => t.id === (s.away || {}).teamId); return { a: { name: tname(ta), pts: pts(s.home) }, b: tb ? { name: tname(tb), pts: pts(s.away) } : null, mine: (s.home || {}).teamId === me.id || (s.away || {}).teamId === me.id }; }) }];
}
// Yahoo: OAuth with the user's (or built-in) app keys. Yahoo's JSON nests objects in numbered arrays, so flatten it.
const yflat = (arr) => { const o = {}; for (const x of [].concat(arr || [])) { if (Array.isArray(x)) Object.assign(o, yflat(x)); else if (x && typeof x === 'object') Object.assign(o, x); } return o; };
const ylist = (obj, key) => { const out = []; if (!obj) return out; for (let i = 0; i < (obj.count || 0); i++) if (obj[i] && obj[i][key]) out.push(obj[i][key]); return out; };
const YKEY = () => ({ id: cfg.yahooId || BUILTIN.yahooId || '', secret: cfg.yahooSecret || BUILTIN.yahooSecret || '', redirect: cfg.yahooRedirect || 'https://localhost:8080' });
async function yToken(body) {
  const k = YKEY(); if (!k.id || !k.secret) throw new Error('NO_YAHOO_APP');
  const r = await net.fetch(`${YAHOO_LOGIN()}/oauth2/get_token`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(k.id + ':' + k.secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...body, redirect_uri: k.redirect }).toString() });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.access_token) throw new Error('Yahoo sign-in failed: ' + (j.error_description || j.error || r.status));
  cfg.yahooTok = { access: j.access_token, refresh: j.refresh_token || (cfg.yahooTok || {}).refresh, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60e3 }; saveCfg(); return cfg.yahooTok.access;
}
async function yGet(p) {
  if (!cfg.yahooTok || !cfg.yahooTok.refresh) throw new Error('NO_YAHOO_LOGIN');
  let tok = cfg.yahooTok.access; if (Date.now() > cfg.yahooTok.exp) tok = await yToken({ grant_type: 'refresh_token', refresh_token: cfg.yahooTok.refresh });
  const go = (t) => net.fetch(`${YAHOO_API()}/fantasy/v2${p}${p.includes('?') ? '&' : '?'}format=json`, { headers: { Authorization: 'Bearer ' + t } });
  let r = await go(tok); if (r.status === 401) { tok = await yToken({ grant_type: 'refresh_token', refresh_token: cfg.yahooTok.refresh }); r = await go(tok); }
  if (!r.ok) throw new Error('Yahoo answered ' + r.status); return r.json();
}
async function fantasyYahoo() {
  const d = await yGet('/users;use_login=1/games;game_keys=nfl/leagues');
  const user = (d.fantasy_content.users || {})[0].user, games = ylist(user[1].games, 'game'), out = [];
  for (const g of games) for (const lg of ylist((g[1] || {}).leagues, 'league')) {
    const L = yflat(lg[0]); const sb = await yGet(`/league/${L.league_key}/scoreboard`);
    const league = sb.fantasy_content.league, week = yflat(league[0]).current_week, matchups = ylist(((league[1] || {}).scoreboard || {})[0] && league[1].scoreboard[0].matchups, 'matchup');
    for (const m of matchups) {
      const teams = ylist((m[0] || m).teams || (m['0'] || {}).teams, 'team').map((t) => ({ meta: yflat(t[0]), pts: ((t[1] || {}).team_points || {}).total, proj: ((t[1] || {}).team_projected_points || {}).total }));
      const mi = teams.findIndex((t) => +t.meta.is_owned_by_current_login === 1); if (mi < 0) continue;
      const me = teams[mi], op = teams[1 - mi];
      const yRoster = async (key) => { try { const ro = await yGet(`/team/${key}/roster;week=${week}/players/stats;type=week;week=${week}`); return ylist((((ro.fantasy_content.team || [])[1] || {}).roster || {})[0] && ro.fantasy_content.team[1].roster[0].players, 'player').map((p) => { const a = yflat(p[0]), parts = [].concat(p).slice(1), sel = yflat(((parts.find((x) => x && x.selected_position) || {}).selected_position) || []), pp = (parts.find((x) => x && x.player_points) || {}).player_points; return { name: (a.name || {}).full || '', team: String(a.editorial_team_abbr || '').toUpperCase(), pos: a.display_position || '', pts: pp && pp.total != null ? +pp.total : null, starter: !!sel.position && !['BN', 'IR'].includes(sel.position) }; }); } catch { return []; } };
      const players = await yRoster(me.meta.team_key), oppPlayers = op ? (await yRoster(op.meta.team_key)).filter((x) => x.starter) : [];
      const board = matchups.map((mm) => { const tt = ylist((mm[0] || mm).teams || (mm['0'] || {}).teams, 'team').map((t) => ({ meta: yflat(t[0]), pts: ((t[1] || {}).team_points || {}).total })); return { a: tt[0] ? { name: tt[0].meta.name, pts: tt[0].pts != null ? +tt[0].pts : null } : null, b: tt[1] ? { name: tt[1].meta.name, pts: tt[1].pts != null ? +tt[1].pts : null } : null, mine: tt.some((t) => +t.meta.is_owned_by_current_login === 1) }; }).filter((x) => x.a);
      out.push({ source: 'Yahoo', league: L.name, week, me: { name: me.meta.name, pts: me.pts != null ? +me.pts : null, proj: me.proj, players }, opp: op ? { name: op.meta.name, pts: op.pts != null ? +op.pts : null, proj: op.proj, players: oppPlayers } : null, board });
    }
  }
  return out;
}
/* --- free games, Game Pass, Steam wishlist --- */
async function freeGames() {
  const out = { epic: [], free: [] };
  try {
    const j = await wget(`${EPIC()}/freeGamesPromotions?locale=en-US&country=US&allowCountries=US`, { ttl: 3 * 3600e3 });
    for (const e of (((j.data || {}).Catalog || {}).searchStore || {}).elements || []) {
      const now = Date.now(), pr = e.promotions || {}, cur = [].concat(...(pr.promotionalOffers || []).map((x) => x.promotionalOffers || [])).find((o) => (o.discountSetting || {}).discountPercentage === 0 && new Date(o.startDate) <= now && new Date(o.endDate) > now);
      const up = [].concat(...(pr.upcomingPromotionalOffers || []).map((x) => x.promotionalOffers || [])).find((o) => (o.discountSetting || {}).discountPercentage === 0);
      if (!cur && !up) continue;
      const img = (e.keyImages || []).find((k) => /Wide|OfferImageWide|DieselStoreFrontWide/.test(k.type)) || (e.keyImages || [])[0];
      const slug = e.productSlug || (((e.catalogNs || {}).mappings || [])[0] || {}).pageSlug || e.urlSlug || '';
      out.epic.push({ id: 'epic:' + e.id, title: e.title, image: img ? img.url : '', now: !!cur, start: (cur || up).startDate, end: (cur || up).endDate, worth: ((e.price || {}).totalPrice || {}).fmtPrice ? e.price.totalPrice.fmtPrice.originalPrice : '', url: slug ? `https://store.epicgames.com/en-US/p/${slug}` : 'https://store.epicgames.com/en-US/free-games' });
    }
  } catch (e) { out.epicErr = e.message; }
  try { const j = await wget(`${G.cs()}/api/1.0/deals?upperPrice=0&pageSize=30&sortBy=Recent`, { ttl: 3 * 3600e3 }); out.free = (j || []).filter((d) => +d.normalPrice > 0).map((d) => ({ id: 'cs:' + d.dealID, title: d.title, image: d.thumb, worth: '$' + d.normalPrice, store: d.storeID, url: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(d.dealID)}` })); } catch (e) { out.freeErr = e.message; }
  return out;
}
async function gamePass() {
  const ids = new Set(), lists = { console: 'f6f1f99f-9b49-4ccd-b3bf-4d9767a77f5e', pc: 'fdd9e2a7-0fee-49f6-ad69-4354098401ff' }, on = {};
  for (const [k, id] of Object.entries(lists)) { const j = await wget(`${GAMEPASS()}/sigls/v2?id=${id}&language=en-us&market=US`, { ttl: 12 * 3600e3 }); for (const x of j || []) if (x.id) { ids.add(x.id); (on[x.id] = on[x.id] || []).push(k); } }
  const f = path.join(app.getPath('userData'), 'gamepass-seen.json'); let seen = {}; try { seen = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  const first = !Object.keys(seen).length, now = Date.now(), left = [];
  for (const id of ids) if (!seen[id]) seen[id] = { added: first ? 0 : now };
  for (const [id, v] of Object.entries(seen)) if (!ids.has(id) && !v.left) v.left = now;
  for (const [id, v] of Object.entries(seen)) if (v.left && now - v.left < 45 * 864e5) left.push(id);
  try { fs.writeFileSync(f, JSON.stringify(seen)); } catch {}
  const recent = [...ids].filter((id) => seen[id].added && now - seen[id].added < 45 * 864e5);
  const want = [...new Set(recent.concat(left))].slice(0, 120);
  const items = want.length ? await xboxProducts(want) : [];
  return { total: ids.size, tracking: first ? 'start' : 'ok', since: Math.min(...Object.values(seen).map((v) => v.added || now)), joined: items.filter((x) => recent.includes(x.id)).map((x) => Object.assign(x, { when: seen[x.id].added, on: on[x.id] || [] })), left: items.filter((x) => left.includes(x.id)).map((x) => Object.assign(x, { when: seen[x.id].left })) };
}
async function steamWishlist(who) {
  let id = String(who || '').trim(); const m = /steamcommunity\.com\/(id|profiles)\/([^/?#]+)/i.exec(id); if (m) id = m[1] === 'profiles' ? m[2] : m[2];
  if (!/^\d{17}$/.test(id)) { const r = await net.fetch(`${STEAMCOMM()}/id/${encodeURIComponent(id)}/?xml=1`); const t = await r.text(); const x = /<steamID64>(\d{17})<\/steamID64>/.exec(t); if (!x) throw new Error('Steam profile not found. Paste your profile link.'); id = x[1]; }
  const j = await wget(`${G.sapi()}/IWishlistService/GetWishlist/v1/?steamid=${id}`, { ttl: 600e3 });
  const items = ((j.response || {}).items || []).sort((a, b) => (a.priority || 999) - (b.priority || 999));
  if (!items.length) throw new Error('That wishlist is empty or private. In Steam: Profile → Edit Profile → Privacy, set Game details to Public.');
  const names = {};
  try { const q = { ids: items.slice(0, 200).map((x) => ({ appid: x.appid })), context: { language: 'english', country_code: 'US' }, data_request: { include_basic_info: true } };
    const r = await wget(`${G.sapi()}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(q))}`, { ttl: 864e5 }); for (const s of (r.response || {}).store_items || []) if (s.name) names[s.appid] = { name: s.name, image: `https://cdn.akamai.steamstatic.com/steam/apps/${s.appid}/header.jpg` }; } catch {}
  for (const x of items.slice(0, 60)) if (!names[x.appid]) { try { const d = await steamApp(x.appid); if (d) names[x.appid] = { name: d.name, image: d.image }; } catch {} }
  return items.slice(0, 200).map((x) => ({ appid: String(x.appid), name: (names[x.appid] || {}).name || 'App ' + x.appid, image: (names[x.appid] || {}).image || '' }));
}
/* ---------- Betting: DraftKings lines, player props and futures through The Odds API ---------- */
const ODDS_SPORT = { nfl: 'americanfootball_nfl', nba: 'basketball_nba', nhl: 'icehockey_nhl', mlb: 'baseball_mlb', wnba: 'basketball_wnba', cfb: 'americanfootball_ncaaf', cbb: 'basketball_ncaab', mls: 'soccer_usa_mls', epl: 'soccer_epl' };
const FUTURES = { nfl: ['americanfootball_nfl_super_bowl_winner', 'Super Bowl winner'], nba: ['basketball_nba_championship_winner', 'NBA champion'], nhl: ['icehockey_nhl_championship_winner', 'Stanley Cup winner'], mlb: ['baseball_mlb_world_series_winner', 'World Series winner'], wnba: ['basketball_wnba_championship_winner', 'WNBA champion'], cfb: ['americanfootball_ncaaf_championship_winner', 'College football champion'], cbb: ['basketball_ncaab_championship_winner', 'March Madness winner'], epl: ['soccer_epl_winner', 'Premier League winner'] };
const PROP_MARKETS = {
  nfl: [['player_anytime_td', 'Anytime touchdown'], ['player_pass_yds', 'Passing yards'], ['player_pass_tds', 'Passing TDs'], ['player_rush_yds', 'Rushing yards'], ['player_reception_yds', 'Receiving yards'], ['player_receptions', 'Receptions']],
  cfb: [['player_anytime_td', 'Anytime touchdown'], ['player_pass_yds', 'Passing yards'], ['player_rush_yds', 'Rushing yards'], ['player_reception_yds', 'Receiving yards']],
  nba: [['player_points', 'Points'], ['player_rebounds', 'Rebounds'], ['player_assists', 'Assists'], ['player_threes', '3-pointers made']],
  wnba: [['player_points', 'Points'], ['player_rebounds', 'Rebounds'], ['player_assists', 'Assists']],
  nhl: [['player_goal_scorer_anytime', 'Anytime goal scorer'], ['player_points', 'Points'], ['player_shots_on_goal', 'Shots on goal']],
  mlb: [['batter_home_runs', 'Home runs'], ['batter_hits', 'Hits'], ['pitcher_strikeouts', 'Pitcher strikeouts']]
};
let oddsLeft = null;
async function oddsGet(url, ttl) {
  const hit = wcache.get(url); if (hit && Date.now() - hit.t < ttl) return hit.v;
  const r = await net.fetch(url, { headers: { Accept: 'application/json' } });
  const rem = r.headers.get('x-requests-remaining'); if (rem != null) oddsLeft = +rem;
  if (!r.ok) { const e = new Error(r.status === 401 || r.status === 429 ? 'The Odds API limit for this month is used up (or the key was refused).' : r.status === 422 ? 'These lines aren\'t offered for this game.' : 'The Odds API answered ' + r.status); e.status = r.status; throw e; }
  const v = await r.json(); wcache.set(url, { t: Date.now(), v }); wprune(); return v;
}
const normTeam = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pickBook = (bms) => (bms || []).find((b) => b.key === 'draftkings') || (bms || []).find((b) => b.key === 'fanduel') || (bms || [])[0] || null;
async function props(a) {
  if (!KEY.odds) throw new Error('Props need The Odds API key (Watch → Setup).');
  const sport = ODDS_SPORT[a.league]; if (!sport) throw new Error('No betting lines for this league.');
  const k = encodeURIComponent(KEY.odds);
  const evs = await oddsGet(`${ODDSAPI()}/v4/sports/${sport}/events?apiKey=${k}&dateFormat=iso`, 3 * 3600e3);
  const h = normTeam(a.home), w = normTeam(a.away), t0 = +new Date(a.date);
  const ev = (evs || []).find((e) => { const eh = normTeam(e.home_team), ea = normTeam(e.away_team); return (eh.includes(h) || h.includes(eh)) && (ea.includes(w) || w.includes(ea)) && Math.abs(+new Date(e.commence_time) - t0) < 36 * 3600e3; });
  if (!ev) throw new Error('This game isn\'t listed by the sportsbooks yet.');
  const mk = (PROP_MARKETS[a.league] || []).map((m) => m[0]);
  const url = (books) => `${ODDSAPI()}/v4/sports/${sport}/events/${ev.id}/odds?apiKey=${k}&${books}&markets=${['h2h', 'spreads', 'totals'].concat(mk).join(',')}&oddsFormat=american&dateFormat=iso`;
  let j; try { j = await oddsGet(url('bookmakers=draftkings'), 2 * 3600e3); } catch (e) { if (e.status !== 422) throw e; j = null; }
  if (!j || !pickBook(j.bookmakers)) j = await oddsGet(url('regions=us'), 2 * 3600e3);
  const book = pickBook(j.bookmakers); if (!book) throw new Error('No sportsbook has posted lines for this game yet.');
  const m = (key) => (book.markets || []).find((x) => x.key === key);
  const fmt = (p) => (p == null ? '' : p > 0 ? '+' + p : String(p));
  const line = { book: book.title, updated: book.last_update, home: ev.home_team, away: ev.away_team };
  const sp = m('spreads'), tot = m('totals'), ml = m('h2h');
  if (sp) line.spread = sp.outcomes.map((o) => ({ team: o.name, point: o.point > 0 ? '+' + o.point : String(o.point), price: fmt(o.price) }));
  if (tot) line.total = tot.outcomes.map((o) => ({ side: o.name, point: o.point, price: fmt(o.price) }));
  if (ml) line.ml = ml.outcomes.map((o) => ({ team: o.name, price: fmt(o.price) }));
  const groups = [];
  for (const [key, label] of PROP_MARKETS[a.league] || []) {
    const mm = m(key); if (!mm) continue; const by = new Map();
    for (const o of mm.outcomes || []) { const p = o.description || o.name; const r = by.get(p) || { player: p, line: o.point != null ? o.point : null }; if (/^over$/i.test(o.name)) r.over = fmt(o.price); else if (/^under$/i.test(o.name)) r.under = fmt(o.price); else r.yes = fmt(o.price); if (o.point != null) r.line = o.point; by.set(p, r); }
    groups.push({ key, label, rows: [...by.values()].sort((x, y) => (parseInt(x.yes || x.over || 9999, 10)) - (parseInt(y.yes || y.over || 9999, 10))) });
  }
  return { line, groups, left: oddsLeft };
}
async function futures(a) {
  if (!KEY.odds) throw new Error('Futures need The Odds API key (Watch → Setup).');
  const f = FUTURES[a.league]; if (!f) throw new Error('No futures for this league.');
  const k = encodeURIComponent(KEY.odds), url = (books) => `${ODDSAPI()}/v4/sports/${f[0]}/odds?apiKey=${k}&${books}&markets=outrights&oddsFormat=american`;
  let j; try { j = await oddsGet(url('bookmakers=draftkings'), 12 * 3600e3); } catch (e) { if (e.status === 404 || e.status === 422) throw new Error(f[1] + ' odds aren\'t available right now (off-season?).'); throw e; }
  if (!(j || []).some((x) => pickBook(x.bookmakers))) j = await oddsGet(url('regions=us'), 12 * 3600e3);
  const e = (j || [])[0]; const book = e && pickBook(e.bookmakers); if (!book) throw new Error(f[1] + ' odds aren\'t posted right now.');
  const o = ((book.markets || [])[0] || {}).outcomes || [];
  return { title: f[1], book: book.title, left: oddsLeft, rows: o.map((x) => ({ team: x.name, price: x.price > 0 ? '+' + x.price : String(x.price), implied: Math.round((x.price > 0 ? 100 / (x.price + 100) : -x.price / (-x.price + 100)) * 1000) / 10 })).sort((x, y) => y.implied - x.implied) };
}

/* ---------- Stocks: Yahoo Finance chart and search data (no key) ---------- */
const YF = () => process.env.VAN_YF || 'https://query1.finance.yahoo.com';
const YF2 = () => process.env.VAN_YF2 || 'https://query2.finance.yahoo.com';
const YF_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' };
async function yfChart(symbol, range, interval) {
  const live = /^(1d|5d)$/.test(range) || /m$/.test(interval);
  const j = await wget(`${YF()}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplits`, { ttl: live ? 45e3 : 15 * 60e3, headers: YF_UA });
  const r = ((j.chart || {}).result || [])[0]; if (!r) throw new Error(((j.chart || {}).error || {}).description || 'No data for ' + symbol);
  const q = ((r.indicators || {}).quote || [])[0] || {}, ts = r.timestamp || [], m = r.meta || {};
  const bars = []; for (let i = 0; i < ts.length; i++) { if (q.close[i] == null || q.open[i] == null) continue; bars.push({ t: ts[i], o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume ? q.volume[i] || 0 : 0 }); }
  return { symbol: m.symbol || symbol, name: m.longName || m.shortName || symbol, currency: m.currency || 'USD', exchange: m.fullExchangeName || m.exchangeName || '', price: m.regularMarketPrice, prev: m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose, time: m.regularMarketTime, gmtoffset: m.gmtoffset || 0, tz: m.exchangeTimezoneName || '', dayHigh: m.regularMarketDayHigh, dayLow: m.regularMarketDayLow, vol: m.regularMarketVolume, hi52: m.fiftyTwoWeekHigh, lo52: m.fiftyTwoWeekLow, bars };
}
async function yfQuote(symbol) { const c = await yfChart(symbol, '5d', '1d'); const last = c.bars[c.bars.length - 1], prevBar = c.bars[c.bars.length - 2]; const price = c.price != null ? c.price : last && last.c; const prev = prevBar ? prevBar.c : c.prev; return { symbol: c.symbol, name: c.name, price, prev, chg: price != null && prev ? price - prev : null, pct: price != null && prev ? (price / prev - 1) * 100 : null, spark: c.bars.map((b) => b.c) }; }

/* ---------- Memes (Imgflip templates) and shopping (Slickdeals feeds) ---------- */
const IMGFLIP = () => process.env.VAN_IMGFLIP || 'https://api.imgflip.com';
const SLICK = () => process.env.VAN_SLICK || 'https://slickdeals.net';
const SLICK_FEEDS = { frontpage: 'mode=frontpage&searcharea=deals&searchin=first&rss=1', popular: 'mode=popdeals&searcharea=deals&searchin=first&rss=1', hot: 'searchin=first&forumchoice%5B%5D=9&rss=1', freebies: 'searchin=first&forumchoice%5B%5D=4&rss=1' };
const unCdata = (s) => String(s || '').replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
const deEnt = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const tagOf = (xml, t) => { const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i').exec(xml); return m ? unCdata(m[1].trim()) : ''; };
const sdCache = new Map();
async function slickdeals(feed, pages) {
  pages = Math.max(1, Math.min(4, +pages || 1));
  const ck = feed + ':' + pages, hit = sdCache.get(ck); if (hit && Date.now() - hit.t < 5 * 60e3) return hit.v;
  const v = await slickdeals0(feed, pages); if (v && v.length) sdCache.set(ck, { t: Date.now(), v }); return v;
}
async function slickdeals0(feed, pages) {
  const items = [], seen = new Set();
  for (let pg = 1; pg <= pages; pg++) {
    let xml = '';
    try {
      const r = await net.fetch(`${SLICK()}/newsearch.php?${SLICK_FEEDS[feed] || SLICK_FEEDS.frontpage}${pg > 1 ? '&page=' + pg : ''}`, { headers: YF_UA });
      if (!r.ok) { if (pg === 1) throw new Error('Slickdeals answered ' + r.status); break; }
      xml = await r.text();
    } catch (e) { if (pg === 1) throw e; break; }
    const before = items.length;
    sdParse(xml, items, seen);
    if (items.length === before) break; // that page had nothing new
  }
  return items;
}
function sdParse(xml, items, seen) {
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const it = m[1], title = deEnt(tagOf(it, 'title')), html = deEnt(tagOf(it, 'content:encoded') || tagOf(it, 'description'));
    const img = (/<img[^>]+src="([^"]+)"/i.exec(html) || [])[1] || '';
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const price = (/\$\s?\d[\d,]*(?:\.\d{2})?/.exec(title) || [])[0] || '';
    const was = (/(?:list|reg(?:ular)?|was|orig(?:inal)?)\.?\s*(?:price)?\s*:?\s*(\$\s?\d[\d,]*(?:\.\d{2})?)/i.exec(text) || [])[1] || '';
    const store = (/\b(?:at|@|from)\s+([A-Z][\w&'.\- ]{1,28}?)(?:\s*(?:\$|\+|,|\(|w\/|via|$))/.exec(title) || [])[1] || (tagOf(it, 'dc:creator') ? '' : '');
    const thumbs = +((/(?:Thumbs?\s*(?:Up)?|Thumb\s*Score|Deal\s*Score)\s*:?\s*\+?(\d+)/i.exec(text) || [])[1] || 0);
    const comments = +(tagOf(it, 'slash:comments') || (/(\d+)\s+(?:comments|replies)/i.exec(text) || [])[1] || 0);
    const id = tagOf(it, 'guid') || tagOf(it, 'link'); if (seen.has(id)) continue; seen.add(id);
    items.push({ id, title, link: deEnt(tagOf(it, 'link')), date: tagOf(it, 'pubDate'), img: deEnt(img), price, was, store: store.trim(), thumbs, comments, text: text.slice(0, 300) });
  }
}
/* ---------- Drops: sneaker, card and collectible release news from public RSS feeds ---------- */
const DROP_FEEDS = {
  sneakers: [['Sneaker Bar Detroit', 'https://sneakerbardetroit.com/feed/'], ['Just Fresh Kicks', 'https://justfreshkicks.com/feed/'], ['Sneaker News', 'https://sneakernews.com/feed/']],
  cards: [['Checklist Insider', 'https://www.checklistinsider.com/feed'], ['Sports Card Investor', 'https://www.sportscardinvestor.com/feed/'], ['Beckett', 'https://www.beckett.com/news/feed/']],
  pokemon: [['PokéBeach', 'https://www.pokebeach.com/forums/forum/-/index.rss'], ['Primetime Pokémon', 'https://feeds.feedburner.com/PrimetimepokemonsBlog']],
  lego: [['Brick Fanatics', 'https://www.brickfanatics.com/feed/'], ['The Brick Fan', 'https://www.thebrickfan.com/feed/']],
};
const DROP_RX = /release|releasing|drop(?:s|ping)?\b|restock|launch|pre-?order|available (?:now|soon)|coming soon|on sale|first look|official images|date|checklist|preview|set\b|hobby|blaster|box\b|reveal|revealed|expansion|first look/i;
const OGIMG = {};
async function dropsFetch(cat, custom) {
  const list = (cat === 'custom' ? (custom || []).map((c) => [c.name || c.url, c.url]) : DROP_FEEDS[cat] || []).filter((x) => /^https?:\/\//i.test(x[1])).slice(0, 8);
  const items = [], errors = [];
  await Promise.all(list.map(async ([name, url]) => {
    try {
      const u = process.env.VAN_DROPS ? `${process.env.VAN_DROPS}/drops?u=${encodeURIComponent(url)}` : url;
      const r = await net.fetch(u, { headers: YF_UA }); if (!r.ok) throw new Error('answered ' + r.status);
      const xml = (await r.text()).slice(0, 3e6);
      const blocks = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)].map((m) => m[1]).concat([...xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi)].map((m) => m[1]));
      for (const it of blocks.slice(0, 25)) {
        const title = deEnt(tagOf(it, 'title')).replace(/<[^>]+>/g, '').trim(); if (!title) continue;
        const link = deEnt(tagOf(it, 'link') || (/<link[^>]+href="([^"]+)"/i.exec(it) || [])[1] || '');
        const html = deEnt(tagOf(it, 'content:encoded') || tagOf(it, 'description') || tagOf(it, 'summary') || tagOf(it, 'content'));
        const img = deEnt((/<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i.exec(it) || /<enclosure[^>]+url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i.exec(it) || /<img[^>]+src="([^"]+)"/i.exec(html) || [])[1] || '');
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const price = (/\$\s?\d[\d,]*(?:\.\d{2})?/.exec(title + ' ' + text) || [])[0] || '';
        items.push({ id: link || title, title, link, date: tagOf(it, 'pubDate') || tagOf(it, 'published') || tagOf(it, 'updated') || tagOf(it, 'dc:date'), img, price, src: name, release: DROP_RX.test(title), text: text.slice(0, 220) });
      }
    } catch (e) { errors.push(name + ': ' + e.message); }
  }));
  const seen = new Set();
  return { items: items.filter((x) => !seen.has(x.id) && seen.add(x.id)).sort((a, b) => (+new Date(b.date) || 0) - (+new Date(a.date) || 0)), errors, sources: list.map((x) => x[0]) };
}
async function imgData(url) {
  const r = await net.fetch(url, { headers: YF_UA }); if (!r.ok) throw new Error('Image answered ' + r.status);
  const b = Buffer.from(await r.arrayBuffer()); if (b.length > 15e6) throw new Error('Image too large');
  return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${b.toString('base64')}`;
}
function memeSave(a) {
  const img = nativeImage.createFromDataURL(a.dataUrl); if (img.isEmpty()) throw new Error('Nothing to save');
  if (a.copy) require('electron').clipboard.writeImage(img);
  if (!a.save) return { ok: true };
  const dir = path.join(app.getPath('pictures'), 'VanMule Memes'); fs.mkdirSync(dir, { recursive: true });
  let base = String(a.name || 'meme').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'meme', f = path.join(dir, base + '.png'), i = 2;
  while (fs.existsSync(f)) f = path.join(dir, `${base} ${i++}.png`);
  fs.writeFileSync(f, img.toPNG()); if (a.show) shell.showItemInFolder(f); return { ok: true, file: f };
}

/* ---------- 3.9: problem reports, phone remote, Discord status, earnings, product links, box scores, GIF memes ---------- */
const http = require('http'), os = require('os');
/* --- error log (keys, tokens and webhook links are blanked out) --- */
const ERRLOG = [];
function redact(s) {
  return String(s)
    .replace(/((?:api[_-]?key|apikey|key|token|secret|client_secret|access_token|refresh_token|crumb|k|code)=)[^&\s"']+/gi, '$1***')
    .replace(/(discord(?:app)?\.com\/api\/webhooks\/)[^\s"']+/gi, '$1***')
    .replace(/(Bearer |Basic )[A-Za-z0-9._~+/=-]+/g, '$1***')
    .replace(/\b[a-f0-9]{32,}\b/gi, '***')
    .replace(/[A-Z]:\\Users\\[^\\\s"']+/gi, (m) => m.replace(/Users\\[^\\]+/i, 'Users\\you'));
}
function logErr(where, e) {
  const msg = redact(e && (e.stack || e.message) || String(e)).slice(0, 1500);
  const last = ERRLOG[ERRLOG.length - 1]; if (last && last.where === where && last.msg === msg) { last.n = (last.n || 1) + 1; last.t = Date.now(); return; }
  ERRLOG.push({ t: Date.now(), where, msg }); if (ERRLOG.length > 150) ERRLOG.shift();
}
process.on('uncaughtException', (e) => logErr('main', e));
process.on('unhandledRejection', (e) => logErr('main (promise)', e));

/* --- phone remote: a small web page on your home network, protected by a secret link --- */
const RM = { srv: null, port: 0, host: '', state: {}, ver: 1, waits: new Set(), err: '', clients: new Map() };
const RM_CMDS = new Set(['vc', 'hear', 'voice', 'sound', 'stopAll', 'mic', 'hearVol', 'mute', 'cap', 'vmsg', 'hello', 'replay', 'tts', 'meme']);
function lanIps() {
  const out = [], bad = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback|Tailscale|ZeroTier|Hamachi|VPN|TAP/i;
  for (const [n, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address)) out.push({ n, ip: a.address });
  const rank = (x) => (bad.test(x.n) ? 10 : 0) + (/^192\.168\./.test(x.ip) ? 0 : /^10\./.test(x.ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(x.ip) ? 2 : 5);
  return out.sort((a, b) => rank(a) - rank(b));
}
const privAddr = (a) => { a = String(a || '').replace(/^::ffff:/i, ''); return a === '::1' || /^127\./.test(a) || /^10\./.test(a) || /^192\.168\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a) || /^169\.254\./.test(a) || /^f[cd][0-9a-f]{2}:/i.test(a) || /^fe80:/i.test(a); };
function rmInfo() {
  const ips = lanIps(), ip = (ips[0] || {}).ip || '127.0.0.1', now = Date.now();
  for (const [k, t] of RM.clients) if (now - t > 60e3) RM.clients.delete(k);
  const url = RM.srv && RM.port && cfg.remoteOn && RM.host === '0.0.0.0' ? `http://${ip}:${RM.port}/?k=${cfg.remoteKey}` : '';
  let qr = '';
  if (url) { try { const q = require('./app/qrcode.js')(0, 'M'); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 6, margin: 3, scalable: true }); } catch (e) { logErr('qr', e); } }
  return { on: !!(RM.srv && cfg.remoteOn), obs: !!(RM.srv && cfg.obsOn), obsUrl: RM.srv && cfg.obsOn ? `http://127.0.0.1:${RM.port}/obs?k=${cfg.remoteKey}` : '', port: RM.port, ip, ips: ips.map((x) => x.ip), url, qr, err: RM.err, phones: RM.clients.size };
}
function rmSend(res, code, body, type = 'application/json') {
  if (res.writableEnded) return;
  res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function rmHandle(req, res) {
  if (!privAddr(req.socket.remoteAddress)) return rmSend(res, 403, { error: 'Only devices on your home network can use the remote.' });
  let u; try { u = new URL(req.url, 'http://x'); } catch { return rmSend(res, 400, { error: 'Bad request' }); }
  if (u.pathname === '/icon.png' || u.pathname === '/favicon.ico') { try { return rmSend(res, 200, fs.readFileSync(path.join(__dirname, 'build', 'icon.png')), 'image/png'); } catch { return rmSend(res, 404, ''); } }
  const k = String(u.searchParams.get('k') || req.headers['x-vm-key'] || ''), want = String(cfg.remoteKey || '');
  const ok = !!want && k.length === want.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(want));
  if (!ok) return u.pathname === '/' ? rmSend(res, 403, '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui;background:#141110;color:#f3ece5;padding:24px"><h2>VanMule remote</h2><p>This link has expired. In VanMule, open Settings → Phone remote and scan the QR code again.</p>', 'text/html') : rmSend(res, 403, { error: 'expired' });
  RM.clients.set(String(req.socket.remoteAddress), Date.now());
  if (req.method === 'GET' && u.pathname === '/obs') { if (!cfg.obsOn) return rmSend(res, 404, 'The OBS overlay is turned off in VanMule.', 'text/plain'); try { return rmSend(res, 200, fs.readFileSync(path.join(__dirname, 'app', 'obs.html'), 'utf8'), 'text/html'); } catch { return rmSend(res, 500, 'missing', 'text/plain'); } }
  if (req.method === 'GET' && u.pathname === '/' && !cfg.remoteOn) return rmSend(res, 403, 'The phone remote is turned off in VanMule.', 'text/plain');
  if (req.method === 'GET' && u.pathname === '/') { try { return rmSend(res, 200, fs.readFileSync(path.join(__dirname, 'app', 'remote.html'), 'utf8'), 'text/html'); } catch (e) { return rmSend(res, 500, 'Remote page missing', 'text/plain'); } }
  if (req.method === 'GET' && u.pathname === '/api/state') {
    const since = +u.searchParams.get('v') || 0;
    if (since && since === RM.ver) {
      const w = { res, t: setTimeout(() => { RM.waits.delete(w); rmSend(res, 200, { v: RM.ver, st: RM.state }); }, 20000) };
      RM.waits.add(w); res.on('close', () => { clearTimeout(w.t); RM.waits.delete(w); }); return;
    }
    return rmSend(res, 200, { v: RM.ver, st: RM.state });
  }
  if (req.method === 'POST' && u.pathname === '/api/cmd') {
    let b = ''; req.on('data', (d) => { b += d; if (b.length > 4096) req.destroy(); });
    req.on('end', () => {
      let c; try { c = JSON.parse(b); } catch { return rmSend(res, 400, { error: 'bad json' }); }
      if (!c || !RM_CMDS.has(c.t)) return rmSend(res, 400, { error: 'unknown command' });
      if (win && !win.isDestroyed()) win.webContents.send('van:remote-cmd', { t: c.t, id: c.id != null ? String(c.id).slice(0, 300) : undefined, v: typeof c.v === 'number' && isFinite(c.v) ? c.v : undefined, text: typeof c.text === 'string' ? c.text.slice(0, 300) : undefined, file: typeof c.file === 'string' ? path.basename(c.file).slice(0, 200) : undefined });
      rmSend(res, 200, { ok: true });
    });
    return;
  }
  rmSend(res, 404, { error: 'not found' });
}
function rmStart(host) {
  return new Promise((resolve) => {
    if (RM.srv) return resolve(rmInfo());
    if (!cfg.remoteKey) { cfg.remoteKey = crypto.randomBytes(16).toString('hex'); saveCfg(); }
    const srv = http.createServer((q, r) => { try { rmHandle(q, r); } catch (e) { logErr('remote', e); rmSend(r, 500, { error: 'oops' }); } });
    let tries = 0;
    const go = (p) => {
      srv.once('error', (e) => { if (e.code === 'EADDRINUSE' && tries++ < 1) return go(0); RM.err = e.message; logErr('remote', e); resolve(rmInfo()); });
      srv.listen(p, host, () => { srv.removeAllListeners('error'); srv.on('error', (e) => logErr('remote', e)); RM.srv = srv; RM.host = host; RM.port = srv.address().port; RM.err = ''; resolve(rmInfo()); });
    };
    go(+process.env.VAN_REMOTE_PORT || cfg.remotePort || 47800);
  });
}
function rmStop() {
  for (const w of RM.waits) { clearTimeout(w.t); rmSend(w.res, 200, { v: RM.ver, st: RM.state, off: true }); } RM.waits.clear();
  if (RM.srv) { try { RM.srv.close(); RM.srv.closeAllConnections && RM.srv.closeAllConnections(); } catch {} }
  RM.srv = null; RM.port = 0; RM.host = ''; RM.clients.clear(); return rmInfo();
}
/* one small server for the phone remote (home network) and the OBS overlay (this PC only) */
async function rmApply() {
  const want = cfg.remoteOn || cfg.obsOn, host = cfg.remoteOn ? '0.0.0.0' : '127.0.0.1';
  if (!want) { if (RM.srv) rmStop(); return rmInfo(); }
  if (RM.srv && RM.host !== host) rmStop();
  return await rmStart(host);
}
function rmPush(st) {
  RM.state = st || {}; RM.ver++;
  for (const w of RM.waits) { clearTimeout(w.t); rmSend(w.res, 200, { v: RM.ver, st: RM.state }); } RM.waits.clear();
}
ipcMain.on('van:remote-state', (_e, st) => { if (RM.srv) rmPush(st); });
app.on('before-quit', () => { try { if (RM.srv) RM.srv.close(); } catch {} });

/* --- Discord Rich Presence over Discord's local pipe --- */
const RPC = { sock: null, ready: false, act: null, err: '', timer: null, buf: Buffer.alloc(0), connecting: false };
const rpcId = () => String(cfg.discordAppId || BUILTIN.discordId || '').trim();
function rpcFrame(op, obj) { const j = Buffer.from(JSON.stringify(obj)), h = Buffer.alloc(8); h.writeInt32LE(op, 0); h.writeInt32LE(j.length, 4); return Buffer.concat([h, j]); }
function rpcRetry(ms) { clearTimeout(RPC.timer); if (cfg.rpcOn && rpcId()) RPC.timer = setTimeout(() => rpcConnect(), ms); }
function rpcConnect(i = 0) {
  if (!cfg.rpcOn || !rpcId() || RPC.sock || (RPC.connecting && i === 0)) return;
  if (i > 9) { RPC.connecting = false; RPC.err = 'Discord isn\'t running'; return rpcRetry(30000); }
  RPC.connecting = true;
  const name = isWin ? `\\\\?\\pipe\\discord-ipc-${i}` : path.join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp', `discord-ipc-${i}`);
  const s = require('net').createConnection(name);
  s.once('error', () => { s.destroy(); rpcConnect(i + 1); });
  s.once('connect', () => {
    RPC.connecting = false; RPC.sock = s; RPC.buf = Buffer.alloc(0); s.removeAllListeners('error');
    s.on('error', (e) => logErr('discord status', e));
    s.on('close', () => { RPC.sock = null; RPC.ready = false; rpcRetry(15000); });
    s.on('data', (d) => {
      RPC.buf = Buffer.concat([RPC.buf, d]);
      while (RPC.buf.length >= 8) {
        const op = RPC.buf.readInt32LE(0), len = RPC.buf.readInt32LE(4); if (RPC.buf.length < 8 + len) break;
        let m = {}; try { m = JSON.parse(RPC.buf.slice(8, 8 + len).toString('utf8')); } catch {} RPC.buf = RPC.buf.slice(8 + len);
        if (op === 1 && m.evt === 'READY') { RPC.ready = true; RPC.err = ''; rpcSet(RPC.act); }
        else if (op === 1 && m.evt === 'ERROR') { RPC.err = (m.data && m.data.message) || 'Discord refused the status'; }
        else if (op === 2) { RPC.err = m.message || 'Discord closed the connection. Check the Application ID.'; try { s.destroy(); } catch {} }
        else if (op === 3) { try { s.write(rpcFrame(4, m)); } catch {} }
      }
    });
    s.write(rpcFrame(0, { v: 1, client_id: rpcId() }));
  });
}
function rpcSet(act) {
  RPC.act = act || null;
  if (!cfg.rpcOn) return;
  if (!RPC.sock) return rpcConnect();
  if (!RPC.ready) return;
  try { RPC.sock.write(rpcFrame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: RPC.act }, nonce: crypto.randomUUID() })); } catch (e) { logErr('discord status', e); }
}
function rpcStop() { clearTimeout(RPC.timer); if (RPC.sock) { try { RPC.sock.write(rpcFrame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null }, nonce: crypto.randomUUID() })); } catch {} try { RPC.sock.end(); } catch {} } RPC.sock = null; RPC.ready = false; }
const rpcInfo = () => ({ on: !!cfg.rpcOn, appId: cfg.discordAppId || '', builtin: !cfg.discordAppId && !!BUILTIN.discordId, connected: RPC.ready, err: RPC.err });
app.on('before-quit', rpcStop);

/* --- earnings dates: Yahoo (needs a session crumb), Nasdaq as a fallback --- */
const YC = { crumb: '', cookie: '', t: 0 }, EARN = new Map();
async function yCrumb() {
  if (YC.crumb && Date.now() - YC.t < 6 * 3600e3) return YC;
  let ck = '';
  try { const r = await fetch(process.env.VAN_YFC || 'https://fc.yahoo.com/', { headers: YF_UA, redirect: 'manual' }); const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || '']; ck = sc.map((x) => String(x).split(';')[0]).filter(Boolean).join('; '); } catch {}
  const c = await fetch(`${YF2()}/v1/test/getcrumb`, { headers: { ...YF_UA, Cookie: ck } }); const crumb = (await c.text()).trim();
  if (!c.ok || !crumb || crumb.length > 40 || /[<{ ]/.test(crumb)) throw new Error('Yahoo crumb ' + c.status);
  Object.assign(YC, { crumb, cookie: ck, t: Date.now() }); return YC;
}
async function earningsOne(sym) {
  const hit = EARN.get(sym); if (hit && Date.now() - hit.t < 12 * 3600e3) return hit.v;
  let v = null;
  try {
    const y = await yCrumb();
    const r = await fetch(`${YF2()}/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=calendarEvents&crumb=${encodeURIComponent(y.crumb)}`, { headers: { ...YF_UA, Cookie: y.cookie } });
    if (r.status === 401) YC.crumb = '';
    if (r.ok) { const j = await r.json(), ce = ((((j.quoteSummary || {}).result || [])[0] || {}).calendarEvents || {}).earnings || {}; const d = (ce.earningsDate || [])[0];
      if (d && d.raw) v = { symbol: sym, date: d.raw * 1000, estimate: !!ce.isEarningsDateEstimate, eps: ce.earningsAverage && ce.earningsAverage.fmt || '' }; }
  } catch (e) { logErr('earnings yahoo', e); }
  if (!v) {
    try {
      const r = await fetch(`${process.env.VAN_NASDAQ || 'https://api.nasdaq.com'}/api/analyst/${encodeURIComponent(sym)}/earnings-date`, { headers: { ...YF_UA, Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' } });
      if (r.ok) { const j = await r.json(), txt = String(((j || {}).data || {}).announcement || ''), m = /([A-Z][a-z]{2,8}\.? \d{1,2}, \d{4})/.exec(txt); if (m) { const d = new Date(m[1].replace('.', '') + ' 12:00'); if (!isNaN(d)) v = { symbol: sym, date: +d, estimate: /\*/.test(txt), eps: '' }; } }
    } catch (e) { logErr('earnings nasdaq', e); }
  }
  EARN.set(sym, { t: Date.now(), v }); return v;
}
async function earnings(symbols) {
  const list = [...new Set((symbols || []).filter((s) => s && !/^\^|=|-USD$|=F$/i.test(s)))].slice(0, 40), out = [];
  for (let i = 0; i < list.length; i += 4) out.push(...await Promise.all(list.slice(i, i + 4).map((s) => earningsOne(s).catch(() => null))));
  return out.filter(Boolean);
}

/* --- a product link's price: Keepa for Amazon (paid key), store data on other pages --- */
function ldProduct(j) {
  for (const x of [].concat(j && j['@graph'] ? j['@graph'] : j)) {
    if (!x || typeof x !== 'object') continue;
    if (Array.isArray(x)) { const r = ldProduct(x); if (r) return r; continue; }
    const t = [].concat(x['@type'] || '');
    if (t.some((y) => /Product|ProductGroup/i.test(y))) {
      let o = [].concat(x.offers || [])[0]; if (o && o.offers) o = [].concat(o.offers)[0];
      if (!o && x.hasVariant) { const vv = [].concat(x.hasVariant)[0]; o = vv && [].concat(vv.offers || [])[0]; }
      const p = o && (o.price != null ? o.price : o.lowPrice != null ? o.lowPrice : (o.priceSpecification || {}).price);
      const img = [].concat(x.image || [])[0];
      if (p != null && !isNaN(parseFloat(p))) return { title: String(x.name || ''), price: parseFloat(p), currency: o.priceCurrency || '', img: typeof img === 'string' ? img : (img && img.url) || '', stock: o.availability ? !/OutOfStock|SoldOut/i.test(o.availability) : null };
    }
  }
  return null;
}
async function productPrice(link) {
  let u; try { u = new URL(String(link || '').trim()); } catch { throw new Error('That isn\'t a link.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('That isn\'t a web link.');
  const store = u.host.replace(/^www\.|^smile\./, '');
  if (/(^|\.)amazon\.|(^|\.)amzn\.(to|com)$|a\.co$/i.test(u.host)) {
    const asin = (/\/(?:dp|gp\/product|gp\/aw\/d|product|exec\/obidos\/asin)\/([A-Z0-9]{10})/i.exec(u.pathname) || [])[1];
    if (!cfg.keepaKey) throw new Error('KEEPA');
    if (!asin) throw new Error('Open the product page on Amazon and copy that link (it should contain /dp/).');
    const dom = { 'amazon.com': 1, 'amazon.co.uk': 2, 'amazon.de': 3, 'amazon.fr': 4, 'amazon.co.jp': 5, 'amazon.ca': 6, 'amazon.it': 8, 'amazon.es': 9, 'amazon.in': 10, 'amazon.com.mx': 11 }[store] || 1;
    const j = await wget(`${process.env.VAN_KEEPA || 'https://api.keepa.com'}/product?key=${encodeURIComponent(cfg.keepaKey)}&domain=${dom}&asin=${asin}&stats=90`, { ttl: 3 * 3600e3 });
    if (j.error) throw new Error('Keepa: ' + (j.error.message || j.error.type || 'error'));
    const p = (j.products || [])[0]; if (!p) throw new Error('Keepa doesn\'t know that product.');
    const st = p.stats || {}, pick = (arr) => { if (!arr) return null; const a = arr[0] > 0 ? arr[0] : arr[1] > 0 ? arr[1] : null; return a != null ? a / 100 : null; };
    const low = (m) => { if (!m) return null; const vals = [m[0], m[1]].filter((x) => Array.isArray(x) && x[1] > 0).map((x) => x[1]); return vals.length ? Math.min(...vals) / 100 : null; };
    const img = String(p.imagesCSV || '').split(',')[0];
    return { title: p.title || 'Amazon product', price: pick(st.current), low90: low(st.min), avg90: pick(st.avg), currency: dom === 1 ? 'USD' : '', img: img ? 'https://images-na.ssl-images-amazon.com/images/I/' + img : '', store: 'Amazon', keepa: true, tokens: j.tokensLeft };
  }
  if (/\/products\/[^/?#]+/.test(u.pathname)) {
    try { const j = await wget(u.origin + u.pathname.replace(/\/$/, '') + '.json' + (u.searchParams.get('variant') ? '' : ''), { ttl: 1800e3 }); const p = j.product, vid = u.searchParams.get('variant'), v = (p.variants || []).find((x) => String(x.id) === vid) || (p.variants || [])[0];
      if (v && v.price != null) return { title: p.title + (v.title && v.title !== 'Default Title' ? ' – ' + v.title : ''), price: parseFloat(v.price), currency: '', img: (p.image || {}).src || '', store, stock: v.available != null ? !!v.available : null }; } catch {}
  }
  const r = await net.fetch(u.href, { headers: { ...YF_UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!r.ok) throw new Error(`${store} answered ${r.status}. This store blocks automatic price checks.`);
  const html = (await r.text()).slice(0, 4e6);
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { const p = ldProduct(JSON.parse(m[1].trim())); if (p) return { ...p, title: deEnt(p.title), store }; } catch {} }
  const meta = (k) => (new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*content=["']([^"']*)`, 'i').exec(html) || new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${k}["']`, 'i').exec(html) || [])[1];
  const price = meta('product:price:amount') || meta('og:price:amount') || meta('twitter:data1') || (/itemprop=["']price["'][^>]*content=["']([\d.,]+)/i.exec(html) || [])[1];
  const num = price ? parseFloat(String(price).replace(/[^0-9.]/g, '')) : NaN;
  if (!price || isNaN(num)) throw new Error(`Couldn't find a price on that ${store} page. Some stores hide prices from apps.`);
  return { title: deEnt(meta('og:title') || (/<title[^>]*>([^<]+)/i.exec(html) || [])[1] || store).trim(), price: num, currency: meta('product:price:currency') || meta('og:price:currency') || '', img: meta('og:image') || '', store };
}

/* --- live box score and plays from ESPN's game summary --- */
async function gameDetail(league, eid) {
  const [sp, lg] = WATCH_LEAGUES[league] || []; if (!sp) throw new Error('No box scores for this league');
  const j = await wget(`${ESPN()}/apis/site/v2/sports/${sp}/${lg}/summary?event=${encodeURIComponent(eid)}`, { ttl: 20e3 });
  const comp = (((j.header || {}).competitions) || [])[0] || {}, cs = comp.competitors || [];
  const side = (ha) => cs.find((x) => x.homeAway === ha) || {};
  const team = (c) => ({ id: String((c.team || {}).id || ''), abbr: (c.team || {}).abbreviation || '', name: (c.team || {}).displayName || '', logo: (((c.team || {}).logos || [])[0] || {}).href || (c.team || {}).logo || '', score: c.score != null ? String(c.score) : '', lines: (c.linescores || []).map((l) => String(l.displayValue != null ? l.displayValue : l.value != null ? l.value : '')) , rec: (((c.record || [])[0]) || {}).summary || '' });
  const away = team(side('away')), home = team(side('home'));
  const st = ((comp.status || {}).type) || {};
  const byTeam = {}; for (const t of ((j.boxscore || {}).teams || [])) byTeam[String((t.team || {}).id || '')] = t;
  const stats = [];
  const ta = byTeam[away.id] || ((j.boxscore || {}).teams || [])[0], th = byTeam[home.id] || ((j.boxscore || {}).teams || [])[1];
  if (ta && th) for (const s of (ta.statistics || [])) { const o = (th.statistics || []).find((x) => x.name === s.name); if (o && s.displayValue != null) stats.push({ label: s.label || s.name, a: String(s.displayValue), h: String(o.displayValue) }); }
  const players = [];
  for (const t of ((j.boxscore || {}).players || [])) {
    for (const g of (t.statistics || []).slice(0, 4)) {
      const labels = g.labels || g.names || [], ath = (g.athletes || []).filter((a) => (a.stats || []).length && !a.didNotPlay).slice(0, 8);
      if (!ath.length || !labels.length) continue;
      players.push({ team: (t.team || {}).abbreviation || '', title: g.text || g.name || g.type || '', labels: labels.slice(0, 9), rows: ath.map((a) => ({ name: (a.athlete || {}).shortName || (a.athlete || {}).displayName || '', stats: (a.stats || []).slice(0, 9) })) });
    }
  }
  const leaders = [];
  for (const t of (j.leaders || [])) for (const c of (t.leaders || []).slice(0, 3)) { const l = (c.leaders || [])[0]; if (l) leaders.push({ team: (t.team || {}).abbreviation || '', cat: c.displayName || c.name || '', who: ((l.athlete || {}).shortName || (l.athlete || {}).displayName || ''), val: l.displayValue || '' }); }
  let plays = [];
  const tAbbr = (id) => (String(id) === away.id ? away.abbr : String(id) === home.id ? home.abbr : '');
  const pl = (p) => ({ text: p.text || p.shortText || (p.type || {}).text || '', clock: (p.clock || {}).displayValue || '', period: (p.period || {}).number || '', score: !!p.scoringPlay, team: tAbbr((p.team || {}).id || ''), a: p.awayScore, h: p.homeScore });
  if (Array.isArray(j.plays) && j.plays.length) plays = j.plays.slice(-30).reverse().map(pl);
  else if (j.drives) { const all = [].concat(...[].concat((j.drives.previous || []), j.drives.current ? [j.drives.current] : []).map((d) => (d.plays || []).map((p) => Object.assign({}, p, { team: p.team || d.team })))); plays = all.slice(-30).reverse().map(pl); }
  else if (Array.isArray(j.keyEvents)) plays = j.keyEvents.slice(-30).reverse().map(pl);
  else if (Array.isArray(j.commentary)) plays = j.commentary.slice(-30).reverse().map((c) => pl(Object.assign({ text: c.text }, c.play || {})));
  const scoring = (j.scoringPlays || []).map(pl).reverse().slice(0, 30);
  const sit = comp.situation || j.situation || null;
  return { league, eid, state: st.state || 'pre', detail: st.shortDetail || st.detail || '', away, home, stats: stats.slice(0, 16), players, leaders, plays, scoring,
    situation: sit ? { text: sit.downDistanceText || sit.shortDownDistanceText || '', poss: tAbbr(sit.possession), last: (sit.lastPlay || {}).text || '' } : null };
}

/* --- recent saved memes for the overlay --- */
function recentMemes() {
  const dir = path.join(app.getPath('pictures'), 'VanMule Memes'); let list = [];
  try { list = fs.readdirSync(dir).filter((f) => /\.(png|gif|jpe?g)$/i.test(f)).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(0, 8); } catch { return []; }
  return list.map(({ f }) => { let thumb = ''; if (!/\.gif$/i.test(f)) { try { const im = nativeImage.createFromPath(path.join(dir, f)); if (!im.isEmpty()) thumb = im.resize({ width: 120 }).toDataURL(); } catch {} } return { file: f, gif: /\.gif$/i.test(f), thumb }; });
}
function memeFile(name) { const dir = path.join(app.getPath('pictures'), 'VanMule Memes'), p = path.join(dir, path.basename(String(name || ''))); if (!p.startsWith(dir) || !fs.existsSync(p)) throw new Error('That meme is gone'); return p; }
function gifSave(a) {
  const b = Buffer.from(String(a.data || ''), 'base64'); if (b.length < 20 || b.slice(0, 3).toString() !== 'GIF') throw new Error('Nothing to save');
  const dir = a.save ? path.join(app.getPath('pictures'), 'VanMule Memes') : path.join(app.getPath('temp'), 'VanMule'); fs.mkdirSync(dir, { recursive: true });
  let base = String(a.name || 'meme').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'meme', f = path.join(dir, base + '.gif'), i = 2;
  while (fs.existsSync(f)) f = path.join(dir, `${base} ${i++}.gif`);
  fs.writeFileSync(f, b); if (a.show) shell.showItemInFolder(f);
  return { file: f };
}

/* ---------- 3.10: settings backup and sync, saved data for instant pages ---------- */
const stateFile = () => path.join(app.getPath('userData'), 'settings-backup.json');
ipcMain.on('van:state-load', (e) => { try { const j = fs.readFileSync(stateFile(), 'utf8'); JSON.parse(j); e.returnValue = j; } catch { e.returnValue = null; } });
function writeAtomic(f, text) { const tmp = f + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, f); }
const SYNC_FILE = () => cfg.syncDir ? path.join(cfg.syncDir, 'settings.json') : '';
function syncRemote() { const f = SYNC_FILE(); if (!f) return null; try { const r = JSON.parse(fs.readFileSync(f, 'utf8')); return r && r.state ? r : null; } catch { return null; } }
function syncInfo() { const r = syncRemote(); return { dir: cfg.syncDir || '', pc: os.hostname(), remote: r ? { pc: r.pc, t: r.t, app: r.app } : null, newer: !!(r && r.pc !== os.hostname() && r.t > (cfg.syncSeen || 0)) }; }
function stateWrite(json, force) {
  if (typeof json !== 'string' || json.length > 20e6) return { ok: false };
  try { JSON.parse(json); writeAtomic(stateFile(), json); } catch (e) { logErr('settings backup', e); return { ok: false }; }
  if (!cfg.syncDir) return { ok: true };
  const r = syncRemote();
  if (r && r.pc !== os.hostname() && r.t > (cfg.syncSeen || 0) && !force) return { ok: true, conflict: { pc: r.pc, t: r.t } };
  try { fs.mkdirSync(cfg.syncDir, { recursive: true }); const t = Date.now(); writeAtomic(SYNC_FILE(), JSON.stringify({ pc: os.hostname(), t, app: app.getVersion(), state: json })); cfg.syncSeen = t; saveCfg(); } catch (e) { logErr('sync', e); return { ok: true, syncErr: e.message }; }
  return { ok: true, synced: true };
}
const cacheDir = () => path.join(app.getPath('userData'), 'cache');
const cacheFile = (k) => path.join(cacheDir(), String(k).replace(/[^\w.-]+/g, '_').slice(0, 60) + '.json');
function cacheGet(k) { try { return JSON.parse(fs.readFileSync(cacheFile(k), 'utf8')); } catch { return null; } }
function cacheSet(k, v) { try { const j = JSON.stringify({ t: Date.now(), v }); if (j.length > 8e6) return; fs.mkdirSync(cacheDir(), { recursive: true }); writeAtomic(cacheFile(k), j); } catch (e) { logErr('cache', e); } }

/* ---------- 3.11: on-screen crosshair (a see-through, click-through window over the game) ---------- */
let chWin = null; const chState = Object.assign({ on: false, cfg: null, display: '', ox: 0, oy: 0, hideCap: false }, {});
const CH_SIZE = 420;
function chDisplay() { const { screen } = require('electron'); return screen.getAllDisplays().find((x) => String(x.id) === String(chState.display)) || screen.getPrimaryDisplay(); }
const physPx = (v) => (Math.abs(v - Math.round(v)) > 0.01 ? Math.round(v / 8) * 8 : Math.round(v));
function chBounds() { const d = chDisplay(), b = d.bounds, sf = d.scaleFactor || 1; return { x: Math.round(b.x + b.width / 2 - CH_SIZE / 2 + chState.ox / sf), y: Math.round(b.y + b.height / 2 - CH_SIZE / 2 + chState.oy / sf), width: CH_SIZE, height: CH_SIZE }; }
function chApply() {
  if (!chState.on || !chState.cfg) { if (chWin && !chWin.isDestroyed()) chWin.hide(); return; }
  if (!chWin || chWin.isDestroyed()) {
    chWin = new BrowserWindow({ ...chBounds(), transparent: true, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, fullscreenable: false, show: false, backgroundColor: '#00000000', title: 'VanMule crosshair', webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    chWin.setIgnoreMouseEvents(true); chWin.setAlwaysOnTop(true, 'screen-saver');
    try { chWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
    chWin.loadFile(path.join(__dirname, 'app', 'crosshair.html'));
    chWin.webContents.once('did-finish-load', () => chApply());
    chWin.on('closed', () => { chWin = null; });
    return;
  }
  try { chWin.setContentProtection(!!chState.hideCap); } catch {}
  chWin.setBounds(chBounds());
  chWin.webContents.executeJavaScript('setCrosshair(' + JSON.stringify(chState.cfg) + ')').catch(() => {});
  if (!chWin.isVisible()) chWin.showInactive();
  chWin.setAlwaysOnTop(true, 'screen-saver'); try { chWin.moveTop(); } catch {}
}
let chTick = 0; setInterval(() => { chTick++; if (chWin && !chWin.isDestroyed() && chWin.isVisible() && (chState.method === 'strong' || chTick % 6 === 0)) { try { chWin.setAlwaysOnTop(true, 'screen-saver'); chWin.moveTop(); if (chState.method === 'strong') chWin.showInactive(); } catch {} } }, 500);
app.whenReady().then(() => { const { screen } = require('electron'); const re = () => { if (chState.on) chApply(); }; screen.on('display-metrics-changed', re); screen.on('display-added', re); screen.on('display-removed', re);
  if (cfg.crosshair && cfg.crosshair.on) { Object.assign(chState, cfg.crosshair); setTimeout(chApply, 3000); } });

/* ---------- 3.16: PC metrics, performance overlay, volume mixer, display check, widgets, voice search ---------- */
async function geoSearch(q) { const g = await wget(`${GEOCODE()}/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`, { ttl: 30 * 864e5 }); return (g.results || []).map((r) => ({ name: [r.name, r.admin1].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude })); }
async function weatherNow(a) { const w = await wget(`${OPENMETEO()}/v1/forecast?latitude=${+a.lat}&longitude=${+a.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`, { ttl: 10 * 60e3 }); const c = w.current || {}, d = w.daily || {}; return { temp: c.temperature_2m, code: c.weather_code, daily: [{ max: (d.temperature_2m_max || [])[0], min: (d.temperature_2m_min || [])[0] }] }; }
const PC = require('./pcstats')({ cfg, saveCfg, win: () => win, tray: (act) => trayAct(act), weather: weatherNow, geo: geoSearch, quote: (s) => yfQuote(s) });
// 3.21: the voice-model search (voicesearch.js) was removed. VanMule only imports models the user already has.
ipcMain.handle('van:pc-toggle', (_e, k) => (k === 'mixer' ? PC.mixerToggle() : PC.metricsToggle()));

/* ---------- 3.12: fantasy overlay window (its own small always-on-top window) ---------- */
let foWin = null, foState = null, foLock = false;
function foSet(on, lock) {
  const open = foWin && !foWin.isDestroyed();
  if (lock !== undefined) foLock = !!lock;
  if (!on) { if (open) foWin.close(); return false; }
  if (!open) {
    const { screen } = require('electron'), wa = screen.getPrimaryDisplay().workArea;
    const b = cfg.foBounds || { x: wa.x + wa.width - 330, y: wa.y + 90, width: 310, height: 230 };
    foWin = new BrowserWindow({ ...b, minWidth: 200, minHeight: 80, frame: false, transparent: true, resizable: true, maximizable: false, minimizable: false, fullscreenable: false, alwaysOnTop: true, skipTaskbar: true, show: false, hasShadow: false, backgroundColor: '#00000000', title: 'VanMule fantasy',
      webPreferences: { preload: path.join(__dirname, 'overlay-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    foWin.setAlwaysOnTop(true, 'screen-saver'); try { foWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
    foWin.loadFile(path.join(__dirname, 'app', 'fantasy.html'));
    foWin.once('ready-to-show', () => { if (!foWin) return; foWin.showInactive(); if (foState) foWin.webContents.send('van:ov-state', foState); });
    const remember = () => { if (foWin && !foWin.isDestroyed()) { cfg.foBounds = foWin.getBounds(); saveCfg(); } };
    foWin.on('moved', remember); foWin.on('resized', remember);
    foWin.on('closed', () => { foWin = null; if (win && !win.isDestroyed()) win.webContents.send('van:ov-cmd', { t: 'foClosed' }); });
  }
  try { foWin.setIgnoreMouseEvents(foLock, { forward: true }); } catch {}
  if (foState) foWin.webContents.send('van:ov-state', Object.assign({}, foState, { lock: foLock }));
  return true;
}

ipcMain.handle('van:more', async (_e, a = {}) => {
  try {
    switch (a.op) {
      case 'standings': return await standings(a.league);
      case 'memes': { const j = await wget(`${IMGFLIP()}/get_memes`, { ttl: 864e5 }); return ((j.data || {}).memes || []).map((m) => ({ id: m.id, name: m.name, url: m.url, w: m.width, h: m.height, boxes: m.box_count || 2 })); }
      case 'imgData': return await imgData(a.url);
      case 'memeSave': return memeSave(a);
      case 'slickdeals': return await slickdeals(a.feed, a.pages);
      case 'drops': return await dropsFetch(a.cat, a.custom);
      case 'ogimg': { // the main picture of an article (for drop news without a picture in the feed)
        const u = String(a.url || ''); if (!/^https?:\/\//i.test(u)) return '';
        OGIMG.m = OGIMG.m || new Map(); if (OGIMG.m.has(u)) return OGIMG.m.get(u);
        let img = '';
        try { const r = await net.fetch(u, { headers: YF_UA }); if (r.ok) { const html = (await r.text()).slice(0, 400000); img = deEnt((/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]+content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i.exec(html) || [])[1] || ''); } } catch {}
        if (OGIMG.m.size > 500) OGIMG.m.clear(); OGIMG.m.set(u, img); return img; }
      case 'chart': return await yfChart(a.symbol, a.range || '1y', a.interval || '1d');
      case 'quotes': { const out = await Promise.all((a.symbols || []).slice(0, 25).map((x) => yfQuote(x).catch((e) => ({ symbol: x, error: e.message })))); return out; }
      case 'stockSearch': { const j = await wget(`${YF2()}/v1/finance/search?q=${encodeURIComponent(a.q || '')}&quotesCount=10&newsCount=0&listsCount=0`, { ttl: 3600e3, headers: YF_UA }); return (j.quotes || []).filter((x) => x.symbol).map((x) => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol, type: x.quoteType || x.typeDisp || '', exch: x.exchDisp || x.exchange || '' })); }
      case 'titlebar': { try { win && win.setTitleBarOverlay && win.setTitleBarOverlay({ color: a.color || '#0e0c0b', symbolColor: a.symbol || '#f3ece5', height: 40 }); } catch {} return true; }
      case 'props': return await props(a);
      case 'futures': return await futures(a);
      case 'injuries': return await injuries(a.league, a.eid);
      case 'weather': return await weather(a);
      case 'fantasy': {
        const out = [], errs = [];
        if (a.sleeper) { try { out.push(...await fantasySleeper({ user: a.sleeper })); } catch (e) { errs.push('Sleeper: ' + e.message); } }
        if (a.espn && a.espn.league) { try { out.push(...await fantasyEspn(a.espn)); } catch (e) { errs.push('ESPN: ' + (e.status === 401 ? 'that league is private. Add espn_s2 and SWID.' : e.message)); } }
        if (a.yahoo) { try { out.push(...await fantasyYahoo()); } catch (e) { errs.push('Yahoo: ' + (e.message === 'NO_YAHOO_LOGIN' ? 'not connected yet' : e.message === 'NO_YAHOO_APP' ? 'add your Yahoo app keys in Setup' : e.message)); } }
        return { leagues: out, errors: errs };
      }
      case 'yahooAuthUrl': { const k = YKEY(); if (!k.id) throw new Error('NO_YAHOO_APP'); return `${YAHOO_LOGIN()}/oauth2/request_auth?${new URLSearchParams({ client_id: k.id, redirect_uri: k.redirect, response_type: 'code', language: 'en-us' })}`; }
      case 'yahooLogin': { // sign in inside VanMule and catch the code when Yahoo sends you back
        const k = YKEY(); if (!k.id) throw new Error('NO_YAHOO_APP');
        const url = `${YAHOO_LOGIN()}/oauth2/request_auth?${new URLSearchParams({ client_id: k.id, redirect_uri: k.redirect, response_type: 'code', language: 'en-us' })}`;
        return await new Promise((resolve) => {
          const w = new BrowserWindow({ width: 520, height: 720, parent: win, modal: false, title: 'Connect Yahoo Fantasy', autoHideMenuBar: true, webPreferences: { partition: 'persist:yahoo', contextIsolation: true, nodeIntegration: false } });
          let done = false;
          const finish = async (r) => { if (done) return; done = true; try { w.close(); } catch {} resolve(r); };
          const check = (u) => { if (!u || (!u.startsWith(k.redirect) && !/[?&]code=/.test(u) || /yahoo\.com/.test(new URL(u).host))) return false; const m = /[?&]code=([^&#]+)/.exec(u); if (!m) { if (/[?&]error=/.test(u)) finish({ error: 'Yahoo sign-in was cancelled' }); return false; }
            yToken({ grant_type: 'authorization_code', code: decodeURIComponent(m[1]) }).then(() => finish({ ok: true })).catch((e) => finish({ error: e.message })); return true; };
          w.webContents.session.webRequest.onBeforeRequest({ urls: [k.redirect.replace(/\/?$/, '/') + '*'] }, (d, cb) => { if (check(d.url)) return cb({ cancel: true }); cb({}); });
          w.webContents.on('will-redirect', (e, u) => { if (check(u)) e.preventDefault(); });
          w.webContents.on('will-navigate', (e, u) => { if (check(u)) e.preventDefault(); });
          w.on('closed', () => finish({ error: done ? '' : 'closed' }));
          w.loadURL(url);
        });
      }
      case 'yahooCode': { let code = String(a.code || '').trim(); const m = /[?&]code=([^&]+)/.exec(code); if (m) code = decodeURIComponent(m[1]); await yToken({ grant_type: 'authorization_code', code }); return { ok: true }; }
      case 'yahooKeys': if ('id' in a) cfg.yahooId = String(a.id || '').trim(); if ('secret' in a) cfg.yahooSecret = String(a.secret || '').trim(); if ('redirect' in a) cfg.yahooRedirect = String(a.redirect || '').trim() || 'https://localhost:8080'; if (a.logout) cfg.yahooTok = null; saveCfg(); return { app: !!YKEY().id, builtin: !cfg.yahooId && !!BUILTIN.yahooId, connected: !!(cfg.yahooTok && cfg.yahooTok.refresh), redirect: YKEY().redirect };
      case 'webhook': {
        const url = String(a.url || ''); if (!/^https:\/\/(\w+\.)?discord(app)?\.com\/api\/webhooks\//.test(url)) throw new Error('That isn\'t a Discord webhook link.');
        const r = await net.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'VanMule', content: a.content || '', embeds: a.embeds || [] }) });
        if (!r.ok) throw new Error('Discord answered ' + r.status); return { ok: true };
      }
      case 'freeGames': return await freeGames();
      case 'gamePass': return await gamePass();
      case 'wishlist': return await steamWishlist(a.who);
      case 'processes': return await listProcesses(!!a.windows);
      case 'ptt': return pttStart(a.vk);
      case 'tts': return await ttsSynth(a.text, a.voice, a.rate);
      case 'ttsVoices': return await ttsVoices();
      case 'packExport': return await packExport(a);
      case 'packImport': return await packImport();
      case 'errlog': return ERRLOG.slice(-80);
      case 'fantasyOverlay': return { on: foSet(!!a.on, a.lock) };
      case 'foPush': foState = a.st || null; if (foWin && !foWin.isDestroyed() && foState) foWin.webContents.send('van:ov-state', Object.assign({}, foState, { lock: foLock })); return true;
      case 'crosshair': { const st = a.state || {}; for (const k of ['on', 'cfg', 'display', 'ox', 'oy', 'hideCap', 'method']) if (k in st) chState[k] = st[k]; chState.on = !!chState.on; chState.ox = Math.max(-400, Math.min(400, +chState.ox || 0)); chState.oy = Math.max(-400, Math.min(400, +chState.oy || 0)); cfg.crosshair = Object.assign({}, chState); saveCfg(); chApply(); return { on: chState.on }; }
      case 'crosshairCheck': { if (a.delay) await new Promise((r) => setTimeout(r, Math.min(30000, +a.delay))); return await crosshairCheck(); }
      case 'crosshairStatus': { const d = chState.on ? chDisplay() : null; return { visible: !!(chWin && !chWin.isDestroyed() && chWin.isVisible()), display: d ? `${Math.round(d.size.width * d.scaleFactor)}×${Math.round(d.size.height * d.scaleFactor)} screen` : '' }; }
      case 'displays': { const { screen } = require('electron'); const p = screen.getPrimaryDisplay().id; return screen.getAllDisplays().map((d, i) => ({ id: String(d.id), primary: d.id === p, label: `Screen ${i + 1}: ${physPx(d.size.width * d.scaleFactor)}×${physPx(d.size.height * d.scaleFactor)}${d.id === p ? ' (main)' : ''}` })); }
      case 'stateWrite': return stateWrite(a.json, !!a.force);
      case 'cacheGet': return cacheGet(a.key);
      case 'cacheSet': cacheSet(a.key, a.value); return true;
      case 'syncPick': { const r = await dialog.showOpenDialog(win, { title: 'Pick a folder that syncs between your PCs (OneDrive, Dropbox, Google Drive…)', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled || !r.filePaths[0]) return syncInfo(); cfg.syncDir = path.join(r.filePaths[0], 'VanMule sync'); fs.mkdirSync(cfg.syncDir, { recursive: true }); cfg.syncSeen = 0; saveCfg(); return syncInfo(); }
      case 'syncOff': cfg.syncDir = ''; saveCfg(); return syncInfo();
      case 'syncInfo': return syncInfo();
      case 'syncRead': { const r = syncRemote(); if (!r) throw new Error('Nothing synced yet'); cfg.syncSeen = r.t; saveCfg(); return r; }
      case 'remote': {
        if (a.reset) { cfg.remoteKey = crypto.randomBytes(16).toString('hex'); saveCfg(); for (const w of RM.waits) { clearTimeout(w.t); rmSend(w.res, 403, { error: 'expired' }); } RM.waits.clear(); RM.clients.clear(); }
        if ('on' in a) cfg.remoteOn = !!a.on; if ('obs' in a) cfg.obsOn = !!a.obs; if ('on' in a || 'obs' in a) { saveCfg(); return await rmApply(); } return rmInfo();
      }
      case 'rpc': {
        if ('appId' in a) { cfg.discordAppId = String(a.appId || '').replace(/\D/g, '').slice(0, 25); rpcStop(); RPC.err = ''; }
        if ('on' in a) { cfg.rpcOn = !!a.on; if (!cfg.rpcOn) { rpcStop(); RPC.err = ''; } }
        saveCfg(); if (cfg.rpcOn && rpcId() && !RPC.sock) rpcConnect(); if (cfg.rpcOn && !rpcId()) RPC.err = 'Add your Discord Application ID first.';
        await new Promise((r) => setTimeout(r, a.wait ? 1500 : 0)); return rpcInfo();
      }
      case 'presence': rpcSet(a.act || null); return true;
      case 'discordLogo': { const f = path.join(app.getPath('pictures'), 'VanMule logo.png'); fs.copyFileSync(path.join(__dirname, 'build', 'icon.png'), f); shell.showItemInFolder(f); return { file: f }; }
      case 'earnings': return await earnings(a.symbols);
      case 'product': return await productPrice(a.url);
      case 'keepaKey': cfg.keepaKey = String(a.key || '').trim(); saveCfg(); return { has: !!cfg.keepaKey };
      case 'keepaHas': return { has: !!cfg.keepaKey };
      case 'gameDetail': return await gameDetail(a.league, a.eid);
      case 'recentMemes': return recentMemes();
      case 'memeCopy': return await copyFileToClipboard(memeFile(a.file));
      case 'gifSave': { const r = gifSave(a); if (a.copy) { const c = await copyFileToClipboard(r.file); if (!c.ok) throw new Error(c.error); } return { ok: true, file: r.file }; }
    }
    return null;
  } catch (e) { if (e.message !== 'KEEPA') logErr('more:' + a.op, e); return { error: e.message }; }
});
/* --- crosshair check: what window is in front, and is it running exclusive fullscreen? --- */
const CH_PS = String.raw`$ErrorActionPreference='SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices;
public class VMFG {
 [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int s);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
[void][VMFG]::SetProcessDPIAware()
$q=0; [void][VMFG]::SHQueryUserNotificationState([ref]$q)
$h=[VMFG]::GetForegroundWindow(); $id=[uint32]0; [void][VMFG]::GetWindowThreadProcessId($h,[ref]$id)
$r=New-Object VMFG+RECT; [void][VMFG]::GetWindowRect($h,[ref]$r)
$pr=Get-Process -Id $id; $path=$null; try { $path=$pr.Path } catch {}
$fso=''; if ($path) { foreach ($k in 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers','HKLM:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers') { $v=(Get-ItemProperty -Path $k -Name $path).$path; if ($v) { $fso=$fso+' '+$v } } }
@{ quns=$q; exe=($pr.ProcessName+'.exe'); title=$pr.MainWindowTitle; path=$path; l=$r.L; t=$r.T; r=$r.R; b=$r.B; min=[VMFG]::IsIconic($h); fso=$fso } | ConvertTo-Json -Compress`;
function crosshairCheck() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ unsupported: true });
    const enc = Buffer.from(CH_PS, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, timeout: 20000 }, (e, out) => {
      let j = null; try { j = JSON.parse(String(out || '').trim()); } catch {}
      if (!j) return resolve({ error: 'check failed' });
      const { screen } = require('electron');
      const self = /^(vanmule|electron)\.exe$/i.test(j.exe || '') || j.path === process.execPath;
      let gameDisp = null, fills = false;
      try {
        const rect = screen.screenToDipRect ? screen.screenToDipRect(null, { x: j.l, y: j.t, width: j.r - j.l, height: j.b - j.t }) : { x: j.l, y: j.t, width: j.r - j.l, height: j.b - j.t };
        const d = screen.getDisplayMatching(rect); gameDisp = d; const b = d.bounds;
        fills = rect.x <= b.x + 2 && rect.y <= b.y + 2 && rect.x + rect.width >= b.x + b.width - 2 && rect.y + rect.height >= b.y + b.height - 2;
      } catch {}
      const chD = chDisplay();
      resolve({
        exe: j.exe || '', title: j.title || '', self, minimized: !!j.min,
        exclusive: j.quns === 3, busy: j.quns === 2, fills,
        fsoOff: /DISABLEDXMAXIMIZEDWINDOWEDMODE/i.test(j.fso || ''), runAsAdmin: /RUNASADMIN/i.test(j.fso || ''),
        wrongScreen: !!(gameDisp && chState.on && String(gameDisp.id) !== String(chD.id) && !self),
        gameScreen: gameDisp ? String(gameDisp.id) : '', chVisible: !!(chWin && !chWin.isDestroyed() && chWin.isVisible()), on: !!chState.on,
      });
    });
  });
}
/* --- running games (for per-game voices) --- */
function listProcesses(windows) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve([]);
    if (windows) { execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object ProcessName,MainWindowTitle | ConvertTo-Json -Compress'], { windowsHide: true, timeout: 15000 }, (e, out) => { try { const j = JSON.parse(out || '[]'); resolve([].concat(j).map((p) => ({ exe: p.ProcessName + '.exe', title: p.MainWindowTitle }))); } catch { resolve([]); } }); return; }
    execFile('tasklist.exe', ['/fo', 'csv', '/nh'], { windowsHide: true, timeout: 10000, maxBuffer: 4e6 }, (e, out) => { resolve(e ? [] : [...new Set(String(out).split(/\r?\n/).map((l) => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean))].map((exe) => ({ exe }))); });
  });
}
/* --- push-to-talk voice: a tiny PowerShell helper watches one key (GetAsyncKeyState) --- */
let pttProc = null;
function pttStart(vk) {
  if (pttProc) { try { pttProc.kill(); } catch {} pttProc = null; }
  vk = +vk; if (!vk || process.platform !== 'win32') return { ok: false };
  const ps = `Add-Type -Name K -Namespace V -MemberDefinition '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int k);'; $d=$false; $n=0; while($true){ if((++$n % 80) -eq 0 -and -not (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue)){ exit };  $s=([V.K]::GetAsyncKeyState(${vk}) -band 0x8000) -ne 0; if($s -ne $d){ $d=$s; if($s){'down'}else{'up'}; [Console]::Out.Flush() }; Start-Sleep -Milliseconds 25 }`;
  const { spawn } = require('child_process');
  pttProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true });
  pttProc.stdout.on('data', (d) => { for (const l of String(d).split(/\r?\n/)) if (l === 'down' || l === 'up') { if (win && !win.isDestroyed()) win.webContents.send('van:ptt', l); } });
  pttProc.on('exit', () => { pttProc = null; });
  return { ok: true };
}
app.on('before-quit', () => { if (pttProc) try { pttProc.kill(); } catch {} });
/* --- text to speech with Windows voices --- */
function ttsVoices() { return new Promise((resolve) => { if (process.platform !== 'win32') return resolve([]); execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }'], { windowsHide: true, timeout: 20000 }, (e, out) => resolve(e ? [] : String(out).split(/\r?\n/).map((s) => s.trim()).filter(Boolean))); }); }
function ttsSynth(text, voice, rate) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('Text to speech needs Windows'));
    const f = path.join(app.getPath('temp'), `vanmule-tts-${Date.now()}.wav`);
    const ps = 'Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; if($env:VM_VOICE){ try{ $s.SelectVoice($env:VM_VOICE) }catch{} }; $s.Rate=[int]$env:VM_RATE; $s.SetOutputToWaveFile($env:VM_OUT); $s.Speak($env:VM_TEXT); $s.Dispose()';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 60000, env: { ...process.env, VM_TEXT: String(text || '').slice(0, 1000), VM_VOICE: voice || '', VM_RATE: String(Math.max(-10, Math.min(10, +rate || 0))), VM_OUT: f } }, (e) => {
      if (e) return reject(new Error('Windows could not speak that: ' + e.message));
      try { const b = fs.readFileSync(f); fs.rmSync(f, { force: true }); resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); } catch (err) { reject(err); }
    });
  });
}
/* --- voice packs: a .vanpack is a zip with voices/, sounds/ and pack.json --- */
async function packExport(a) {
  const r = await dialog.showSaveDialog(win, { title: 'Save voice pack', defaultPath: path.join(app.getPath('documents'), (a.name || 'My VanMule pack').replace(/[\\/:*?"<>|]+/g, ' ') + '.vanpack'), filters: [{ name: 'VanMule pack', extensions: ['vanpack'] }] });
  if (r.canceled || !r.filePath) return { canceled: true };
  const tmp = path.join(app.getPath('temp'), 'vanmule-pack-' + Date.now()); fs.mkdirSync(path.join(tmp, 'voices'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'sounds'), { recursive: true });
  const D = dirs();
  for (const id of a.aiIds || []) { const src = path.join(D.voices, id); if (fs.existsSync(src)) await fs.promises.cp(src, path.join(tmp, 'voices', id), { recursive: true }); }
  for (const f of a.sounds || []) { const src = path.join(D.sounds, f); if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(path.join(tmp, 'sounds', f)), { recursive: true }); await fs.promises.copyFile(src, path.join(tmp, 'sounds', f)); } }
  fs.writeFileSync(path.join(tmp, 'pack.json'), JSON.stringify({ name: a.name || 'VanMule pack', made: Date.now(), custom: a.custom || [], app: app.getVersion() }, null, 2));
  const zip = r.filePath.replace(/\.vanpack$/i, '') + '.zip';
  await new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Compress-Archive -Path (Join-Path $env:VM_SRC '*') -DestinationPath $env:VM_ZIP -Force`], { windowsHide: true, timeout: 600000, env: { ...process.env, VM_SRC: tmp, VM_ZIP: zip } }, (e) => (e ? rej(e) : res())));
  fs.renameSync(zip, r.filePath); fs.rmSync(tmp, { recursive: true, force: true }); shell.showItemInFolder(r.filePath);
  return { ok: true, file: r.filePath };
}
async function packImport() {
  const r = await dialog.showOpenDialog(win, { title: 'Open a voice pack', filters: [{ name: 'VanMule pack', extensions: ['vanpack', 'zip'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  const tmp = path.join(app.getPath('temp'), 'vanmule-unpack-' + Date.now()), zip = tmp + '.zip'; fs.copyFileSync(r.filePaths[0], zip);
  await new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:VM_ZIP -DestinationPath $env:VM_DST -Force'], { windowsHide: true, timeout: 600000, env: { ...process.env, VM_ZIP: zip, VM_DST: tmp } }, (e) => (e ? rej(e) : res())));
  let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(tmp, 'pack.json'), 'utf8')); } catch {}
  const D = dirs(); let voices = 0, sounds = 0;
  try { for (const id of fs.readdirSync(path.join(tmp, 'voices'))) { let dst = path.join(D.voices, id); if (fs.existsSync(dst)) dst = path.join(D.voices, id + '-' + Date.now().toString(36)); await fs.promises.cp(path.join(tmp, 'voices', id), dst, { recursive: true }); try { const mf = path.join(dst, 'meta.json'), m = JSON.parse(fs.readFileSync(mf, 'utf8')); m.id = path.basename(dst); fs.writeFileSync(mf, JSON.stringify(m, null, 2)); } catch {} voices++; } } catch {}
  try { await copyMerge(path.join(tmp, 'sounds'), D.sounds); const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? walk(path.join(d, e.name)) : 1), 0); sounds = walk(path.join(tmp, 'sounds')); } catch {}
  fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(zip, { force: true });
  return { ok: true, name: meta.name || 'Voice pack', voices, sounds, custom: meta.custom || [] };
}

ipcMain.handle('van:games', async (_e, a = {}) => {
  try {
    switch (a.op) {
      case 'keys': if ('itad' in a) cfg.itadKey = String(a.itad || '').trim(); if ('rawg' in a) cfg.rawgKey = String(a.rawg || '').trim(); if ('itad' in a || 'rawg' in a) { saveCfg(); wcache.clear(); itadShops = null; }
        return { builtin: builtinUse(), itad: !!KEY.itad, rawg: !!KEY.rawg, itadHint: KEY.itad ? KEY.itad.slice(0, 4) + '…' : '', rawgHint: KEY.rawg ? KEY.rawg.slice(0, 4) + '…' : '' };
      case 'testKeys': {
        const out = {};
        if (KEY.itad) { try { await wget(`${G.itad()}/service/shops/v1?country=US&key=${encodeURIComponent(KEY.itad)}`, { ttl: 0 }); await wpost(`${G.itad()}/lookup/id/shop/61/v1?key=${encodeURIComponent(KEY.itad)}`, ['app/220'], { ttl: 0 }); out.itad = true; } catch (e) { out.itad = false; out.itadErr = e.status === 401 || e.status === 403 ? 'IsThereAnyDeal did not accept that key.' : e.message; } }
        if (KEY.rawg) { try { await wget(rawgUrl('/games', { page_size: 1 }), { ttl: 0 }); out.rawg = true; } catch (e) { out.rawg = false; out.rawgErr = e.status === 401 ? 'RAWG did not accept that key.' : e.message; } }
        return out;
      }
      case 'steamDeals': {
        const pages = Math.min(5, a.pages || 3), sort = a.sort || 'Deal Rating', rows = [];
        const got = await Promise.all(Array.from({ length: pages }, (_, p) => wget(`${G.cs()}/api/1.0/deals?storeID=1&onSale=1&pageSize=60&pageNumber=${p}&sortBy=${encodeURIComponent(sort)}${a.title ? '&title=' + encodeURIComponent(a.title) : ''}${a.aaa ? '&AAA=1' : ''}`, { ttl: 1800e3 }).catch(() => [])));
        for (const j of got) { if (!Array.isArray(j) || !j.length) break; rows.push(...j); if (j.length < 60) break; }
        let lows = {}, it = {};
        if (!a.lite) { // the price-history lookups are the slow part: the page asks for them in a second call
          [lows, it] = await Promise.all([csLows(rows.map((d) => d.gameID)), itadLows(rows.map((d) => d.steamAppID).filter(Boolean)).catch((e) => ({ _err: e.message }))]);
        }
        return { itadErr: it._err || '', items: rows.map((d) => { const sale = num(d.salePrice), reg = num(d.normalPrice), lw = lows[d.gameID] || {}, il = (d.steamAppID && it[d.steamAppID]) || {};
          return { id: 'steam:' + (d.steamAppID || d.gameID), appid: d.steamAppID || null, csGame: d.gameID, title: d.title, image: d.thumb, price: sale, regular: reg, cut: Math.round(num(d.savings) || 0), dealRating: num(d.dealRating), rating: num(d.steamRatingPercent) || null, ratingText: d.steamRatingText || '', ratingCount: num(d.steamRatingCount) || 0, metacritic: num(d.metacriticScore) || null, released: d.releaseDate ? d.releaseDate * 1000 : null, changed: d.lastChange ? d.lastChange * 1000 : null,
            low: lw.price, lowDate: lw.date, y1: il.y1 != null ? il.y1 : null, m3: il.m3 != null ? il.m3 : null, allItad: il.all != null ? il.all : null, steamLow: il.steamLow != null ? il.steamLow : null, url: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(d.dealID)}` }; }) };
      }
      case 'xboxDeals': {
        try { return await xboxDealsDirect(a); } catch (e) {
          const blocked = /ERR_ADDRESS_INVALID|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_BLOCKED|ENOTFOUND|EAI_AGAIN/i.test(e.message);
          if (!KEY.itad) throw e;
          const items = await itadMsDeals();
          return { items, fallback: true, blocked, reason: e.message };
        }
      }
      case 'xboxDealsDirect_unused': {
        const list = ['Deal', 'TopPaid', 'BestRated', 'New', 'ComingSoon', 'MostPlayed'].includes(a.list) ? a.list : 'Deal';
        const j = await wget(`${G.reco()}/channels/Reco/V8.0/Lists/Computed/${list}?market=US&language=en-US&itemTypes=Game&deviceFamily=Windows.Xbox&count=${Math.min(400, a.count || 200)}&skipItems=0`, { ttl: 1800e3 });
        const ids = (j.Items || []).map((x) => x.Id).filter(Boolean);
        const items = await xboxProducts(ids);
        for (const x of items) { const h = priceLog('xbox:' + x.id, x.price, x.regular); if (h) Object.assign(x, { seenLow: h.low, seenLowAt: h.lowAt, seenY1: h.yLow, seenSince: h.since }); }
        return { items };
      }
      case 'xboxLookup': { const items = await xboxProducts((a.ids || []).filter((x) => /^[A-Z0-9]{12}$/i.test(x))); for (const x of items) { const h = priceLog('xbox:' + x.id, x.price, x.regular); if (h) Object.assign(x, { seenLow: h.low, seenLowAt: h.lowAt, seenY1: h.yLow, seenSince: h.since }); } return items; }
      case 'steamSearch': return steamSearch(a.q || '');
      case 'tracked': { // [{store:'steam'|'xbox', id}]
        const steamIds = (a.items || []).filter((x) => x.store === 'steam').map((x) => String(x.id)), xboxIds = (a.items || []).filter((x) => x.store === 'xbox').map((x) => x.id);
        const out = {};
        if (steamIds.length) {
          const pr = await steamPrices(steamIds);
          let cs = {}; try { const look = await Promise.all(steamIds.map((id) => wget(`${G.cs()}/api/1.0/games?steamAppID=${id}`, { ttl: 864e5 }).then((r) => [id, (r || [])[0]]).catch(() => [id, null]))); const gids = look.filter(([, g]) => g).map(([id, g]) => [id, g.gameID]); const lows = await csLows(gids.map((x) => x[1])); for (const [id, gid] of gids) cs[id] = lows[gid]; } catch {}
          let it = {}; try { it = await itadLows(steamIds); } catch {}
          for (const id of steamIds) { const p = pr[id] || {}, h = priceLog('steam:' + id, p.price, p.regular); out['steam:' + id] = Object.assign({}, p, { low: cs[id] ? cs[id].price : null, lowDate: cs[id] ? cs[id].date : null, y1: (it[id] || {}).y1, steamLow: (it[id] || {}).steamLow, seenLow: h ? h.low : null, seenY1: h ? h.yLow : null, seenSince: h ? h.since : null }); }
        }
        if (xboxIds.length) { const items = await xboxProducts(xboxIds); for (const x of items) { const h = priceLog('xbox:' + x.id, x.price, x.regular); out['xbox:' + x.id] = Object.assign(x, h ? { seenLow: h.low, seenY1: h.yLow, seenSince: h.since } : {}); } }
        return out;
      }
      case 'appInfo': return steamApp(a.appid);
      case 'slopSeed': {
        const out = [];
        for (const n of FRIENDSLOP_SEED) { try { const r = await steamSearch(n); const hit = r.find((x) => normName(x.name) === normName(n)) || r.find((x) => normName(x.name).startsWith(normName(n))); if (hit) out.push({ appid: hit.appid, name: hit.name }); } catch {} }
        return out;
      }
      case 'slop': return slopStats(a.appid);
      case 'slopDiscover': {
        const j = await spyGet('request=tag&tag=' + encodeURIComponent(a.tag || 'Online Co-Op'), 12 * 3600e3);
        const skip = new Set((a.have || []).map(String));
        return Object.values(j || {}).filter((g) => !skip.has(String(g.appid)) && +g.price <= 2000 && (g.positive || 0) + (g.negative || 0) > 500 && g.positive / ((g.positive || 0) + (g.negative || 1)) >= 0.75 && (g.ccu || 0) >= 300)
          .sort((x, y) => (y.ccu || 0) - (x.ccu || 0)).slice(0, 40)
          .map((g) => ({ appid: String(g.appid), name: g.name, price: +g.price / 100, pct: Math.round((g.positive / (g.positive + g.negative)) * 100), reviews: g.positive + g.negative, peak: g.ccu, owners: g.owners }));
      }
      case 'releases': {
        const now = new Date(), from = now.toISOString().slice(0, 10), to = new Date(+now + (a.days || 365) * 864e5).toISOString().slice(0, 10);
        if (KEY.rawg) {
          const j = await wget(rawgUrl('/games', { dates: `${from},${to}`, ordering: '-added', page_size: '40', page: String(a.page || 1), ...(a.platforms ? { parent_platforms: a.platforms } : {}) }), { ttl: 6 * 3600e3 });
          return { source: 'rawg', more: !!j.next, items: (j.results || []).map(rawgGame) };
        }
        // No key: Xbox coming soon plus Steam's popular upcoming list
        const items = [];
        try { const j = await wget(`${G.reco()}/channels/Reco/V8.0/Lists/Computed/ComingSoon?market=US&language=en-US&itemTypes=Game&deviceFamily=Windows.Xbox&count=60&skipItems=0`, { ttl: 6 * 3600e3 });
          for (const x of await xboxProducts((j.Items || []).map((i) => i.Id))) items.push({ kind: 'vg', id: 'xbox:' + x.id, title: x.title, date: x.released ? x.released.slice(0, 10) : '', image: x.image, platforms: ['Xbox'], xbox: x.id, price: x.price, url: x.url }); } catch {}
        try { const j = await wget(`${G.store()}/search/results/?filter=popularcomingsoon&json=1&count=40&cc=us`, { ttl: 6 * 3600e3 });
          const apps = (j.items || []).map((x) => { const m = /\/apps\/(\d+)\//.exec(x.logo || ''); return m ? { appid: m[1], name: x.name, logo: x.logo } : null; }).filter(Boolean).slice(0, 30);
          for (const s of apps) { try { const d = await steamApp(s.appid); items.push({ kind: 'vg', id: 'steam:' + s.appid, title: s.name, date: d && d.date, when: d ? d.released : '', image: d ? d.image : s.logo, platforms: ['PC'], appid: s.appid, url: `https://store.steampowered.com/app/${s.appid}` }); } catch {} } } catch {}
        return { source: 'stores', more: false, items };
      }
      case 'gameSearch': {
        if (KEY.rawg) { const j = await wget(rawgUrl('/games', { search: a.q || '', page_size: '20' }), { ttl: 3600e3 }); return (j.results || []).map(rawgGame); }
        const r = await steamSearch(a.q || ''); const out = [];
        for (const x of r.slice(0, 8)) { const d = await steamApp(x.appid).catch(() => null); out.push({ kind: 'vg', id: 'steam:' + x.appid, title: x.name, date: d && d.date, when: d ? d.released : '', image: d ? d.image : x.image, platforms: ['PC'], appid: x.appid, url: `https://store.steampowered.com/app/${x.appid}` }); }
        return out;
      }
      case 'rawgGame': { if (!KEY.rawg) return null; return rawgGame(await wget(rawgUrl('/games/' + encodeURIComponent(a.id)), { ttl: 6 * 3600e3 })); }
    }
    return null;
  } catch (e) { logErr('games:' + a.op, e); return { error: e.message }; }
});

/* ---------- Sound browser: MyInstants listings and Wikimedia Commons sound effects ---------- */
const BROWSER_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
const unent = (t) => String(t).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
function parseMyInstants(html, pageUrl) {
  const out = [], seen = new Set();
  for (const chunk of html.split(/<div[^>]*class="[^"]*\binstant\b[^"]*"/i).slice(1)) {
    const play = chunk.match(/play\(\s*'([^']+)'(?:\s*,\s*'([^']*)')?(?:\s*,\s*'([^']*)')?/);
    const link = chunk.match(/<a\b[^>]*class="[^"]*instant-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || chunk.match(/<a\b[^>]*href="(?:[^"]*\/instant\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    const title = link ? unent(link[1]) : (chunk.match(/title="Play ([^"]+?) sound"/i) || [])[1];
    if (!play || !title) continue;
    const url = new URL(play[1], pageUrl).href; if (seen.has(url)) continue; seen.add(url);
    const color = (chunk.match(/background-color:\s*([^;"]+)/i) || [])[1];
    out.push({ name: unent(title), url, color: color ? color.trim() : '', src: 'MyInstants' });
  }
  return out;
}
ipcMain.handle('van:sound-browse', async (_e, a = {}) => {
  const page = Math.max(1, a.page | 0 || 1);
  if (a.src === 'commons') {
    const q = String(a.q || '').trim() || 'sound effect';
    const u = `${process.env.VAN_SB_COMMONS || 'https://commons.wikimedia.org'}/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=30&gsroffset=${(page - 1) * 30}&gsrsearch=${encodeURIComponent(q + ' filetype:audio')}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiextmetadatafilter=LicenseShortName|Artist`;
    const r = await net.fetch(u, { headers: { 'User-Agent': 'VanMule/' + app.getVersion() + ' (sound browser)' } });
    if (!r.ok) throw new Error('Wikimedia Commons answered ' + r.status + '.');
    const j = await r.json(), pages = j.query ? Object.values(j.query.pages).sort((x, y) => x.index - y.index) : [];
    const items = pages.map((p) => { const ii = p.imageinfo && p.imageinfo[0]; if (!ii || !ii.url || (ii.size || 0) > 8e6) return null; const m = ii.extmetadata || {};
      return { name: p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' '), url: ii.url, size: ii.size, license: m.LicenseShortName ? unent(m.LicenseShortName.value) : '', author: m.Artist ? unent(m.Artist.value).slice(0, 80) : '', page: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(p.title.replace(/ /g, '_')), src: 'Wikimedia Commons' }; }).filter(Boolean);
    return { items, more: !!j.continue };
  }
  const region = /^[a-z]{2}$/.test(a.region || '') ? a.region : 'us';
  let url;
  if (a.mode === 'search') url = `${process.env.VAN_SB_MI || 'https://www.myinstants.com'}/en/search/?name=${encodeURIComponent(String(a.q || '').trim())}`;
  else if (a.mode === 'best') url = `${process.env.VAN_SB_MI || 'https://www.myinstants.com'}/en/best_of_all_time/${region}/`;
  else if (a.mode === 'category') url = `${process.env.VAN_SB_MI || 'https://www.myinstants.com'}/en/categories/${encodeURIComponent(String(a.cat || 'memes'))}/`;
  else url = `${process.env.VAN_SB_MI || 'https://www.myinstants.com'}/en/index/${region}/`;
  const full = new URL(url); if (page > 1) full.searchParams.set('page', String(page));
  const r = await net.fetch(full.href, { headers: BROWSER_UA });
  if (r.status === 404) return { items: [], more: false };
  if (!r.ok) throw new Error('MyInstants answered ' + r.status + '.');
  const items = parseMyInstants(await r.text(), full.href);
  return { items, more: items.length >= 20 };
});

/* ---------- Game recording: sources, streaming chunks to disk, recordings list ---------- */
const REC_EXT = ['.mp4', '.webm', '.m4a', '.mkv'];
const recFiles = new Map(); let recSeq = 0;
ipcMain.handle('van:rec-sources', async () => {
  const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
  const mine = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId && w.getMediaSourceId()));
  return list.filter((x) => !mine.has(x.id) && x.name !== 'VanMule overlay').map((x) => ({
    id: x.id, name: x.name, screen: x.id.startsWith('screen:'), thumb: x.thumbnail && !x.thumbnail.isEmpty() ? x.thumbnail.toDataURL() : '',
    icon: x.appIcon && !x.appIcon.isEmpty() ? x.appIcon.toDataURL() : ''
  }));
});
ipcMain.handle('van:rec-open', (_e, a = {}) => {
  const d = dirs().recordings; fs.mkdirSync(d, { recursive: true });
  const ext = REC_EXT.includes(String(a.ext)) ? a.ext : '.webm';
  const t = new Date(), z = (n) => String(n).padStart(2, '0');
  const base = safeName(`${a.prefix === 'replay' ? 'VanMule replay' : 'VanMule'} ${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())} ${z(t.getHours())}-${z(t.getMinutes())}-${z(t.getSeconds())}`);
  const file = uniqueFile(d, base, ext), full = path.join(d, file);
  const id = ++recSeq, stream = fs.createWriteStream(full);
  const rec = { stream, full, file, bytes: 0, err: null };
  stream.on('error', (e) => { rec.err = e.message; });
  recFiles.set(id, rec);
  return { id, file, path: full };
});
ipcMain.on('van:rec-chunk', (_e, id, buf) => {
  const r = recFiles.get(id); if (!r || r.err) return;
  const b = Buffer.from(buf); r.bytes += b.length; r.stream.write(b);
});
ipcMain.handle('van:rec-close', (_e, id) => new Promise((resolve) => {
  const r = recFiles.get(id); if (!r) return resolve(null);
  recFiles.delete(id);
  r.stream.end(() => {
    let size = r.bytes; try { size = fs.statSync(r.full).size; } catch {}
    if (size === 0) { try { fs.unlinkSync(r.full); } catch {} return resolve({ ok: false, error: r.err || 'Nothing was recorded.' }); }
    resolve({ ok: !r.err, error: r.err, file: r.file, path: r.full, size });
  });
}));
ipcMain.handle('van:rec-list', () => {
  const d = dirs().recordings; let ents = [];
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch {}
  const open = new Set([...recFiles.values()].map((r) => r.file));
  return ents.filter((e) => e.isFile() && REC_EXT.includes(path.extname(e.name).toLowerCase()) && !open.has(e.name))
    .map((e) => { const st = fs.statSync(path.join(d, e.name)); return { file: e.name, path: path.join(d, e.name), size: st.size, mtime: st.mtimeMs }; })
    .sort((a, b) => b.mtime - a.mtime);
});
ipcMain.handle('van:rec-action', async (_e, a = {}) => {
  const d = dirs().recordings, p = inDir(d, a.file);
  switch (a.op) {
    case 'open': return shell.openPath(p);
    case 'show': shell.showItemInFolder(p); return true;
    case 'delete': try { await shell.trashItem(p); } catch { fs.unlinkSync(p); } return true;
    case 'rename': { const ext = path.extname(a.file); const f = uniqueFile(d, safeName(a.name), ext); fs.renameSync(p, path.join(d, f)); return f; }
  }
  return null;
});
/* ---------- Voice pictures from the web, the clipboard or drag-and-drop ---------- */
const IMG_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };
function sniffImg(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50) return '.png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return '.jpg';
  if (b.length > 6 && b.toString('latin1', 0, 3) === 'GIF') return '.gif';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return '.webp';
  return '';
}
ipcMain.handle('van:image-save', async (_e, a = {}) => {
  let buf, ext = '';
  if (a.url) {
    const u = new URL(String(a.url));
    if (!/^https?:$/.test(u.protocol)) throw new Error('Use an http or https image link.');
    const r = await net.fetch(u.href, { headers: { 'User-Agent': 'VanMule/' + app.getVersion() + ' (voice picture)' } });
    if (!r.ok) throw new Error('The image could not be downloaded (' + r.status + ').');
    const len = +r.headers.get('content-length') || 0; if (len > 25e6) throw new Error('That image is over 25 MB.');
    buf = Buffer.from(await r.arrayBuffer());
    ext = IMG_TYPES[String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()] || '';
  } else if (a.data) buf = Buffer.from(a.data);
  else throw new Error('No picture was given.');
  if (buf.length > 25e6) throw new Error('That image is over 25 MB.');
  ext = sniffImg(buf) || ext;
  if (!ext) throw new Error('That link is not a PNG, JPG, GIF or WebP image.');
  const dir = path.join(app.getPath('userData'), 'tmp'); fs.mkdirSync(dir, { recursive: true });
  try { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (Date.now() - fs.statSync(p).mtimeMs > 3600e3) fs.unlinkSync(p); } } catch {}
  const file = path.join(dir, 'pic-' + Date.now() + ext); fs.writeFileSync(file, buf);
  return file;
});
/* ---------- Voice messages: short clips in your current voice, ready to paste into Discord ---------- */
const VMSG_EXT = ['.mp3', '.ogg', '.wav', '.m4a'];
const vmsgDir = () => { const d = path.join(dirs().recordings, 'Voice messages'); fs.mkdirSync(d, { recursive: true }); return d; };
function copyFileToClipboard(p) {
  return new Promise((resolve) => {
    if (!isWin) { require('electron').clipboard.writeText(p); return resolve({ ok: true, textOnly: true }); }
    // Puts the file itself on the clipboard (like Copy in File Explorer), so Ctrl+V in Discord attaches it.
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', `Set-Clipboard -LiteralPath '${p.replace(/'/g, "''")}'`], { windowsHide: true, timeout: 15000 },
      (err) => resolve(err ? { ok: false, error: 'Could not copy the file: ' + err.message } : { ok: true }));
  });
}
let dragIcon = null;
ipcMain.handle('van:vmsg-save', (_e, a = {}) => {
  const d = vmsgDir(), ext = VMSG_EXT.includes(a.ext) ? a.ext : '.mp3';
  const t = new Date(), z = (n) => String(n).padStart(2, '0');
  const base = safeName(a.name || `Voice message ${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())} ${z(t.getHours())}-${z(t.getMinutes())}-${z(t.getSeconds())}`);
  const file = uniqueFile(d, base, ext), full = path.join(d, file);
  fs.writeFileSync(full, Buffer.from(a.data));
  return { file, path: full, size: fs.statSync(full).size };
});
ipcMain.handle('van:vmsg-list', () => {
  const d = vmsgDir();
  return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isFile() && VMSG_EXT.includes(path.extname(e.name).toLowerCase()))
    .map((e) => { const st = fs.statSync(path.join(d, e.name)); return { file: e.name, path: path.join(d, e.name), size: st.size, mtime: st.mtimeMs }; })
    .sort((a, b) => b.mtime - a.mtime);
});
ipcMain.handle('van:vmsg-action', async (_e, a = {}) => {
  const d = vmsgDir(), p = inDir(d, a.file);
  switch (a.op) {
    case 'copy': return copyFileToClipboard(p);
    case 'show': shell.showItemInFolder(p); return true;
    case 'delete': try { await shell.trashItem(p); } catch { fs.unlinkSync(p); } return true;
    case 'rename': { const ext = path.extname(a.file); const f = uniqueFile(d, safeName(a.name), ext); fs.renameSync(p, path.join(d, f)); return f; }
    case 'read': { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
    case 'webhook': {
      const url = String(a.url || '').trim();
      if (!/^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/.test(url)) return { ok: false, error: 'That is not a Discord webhook link.' };
      const fd = new FormData();
      fd.append('payload_json', JSON.stringify({ content: String(a.text || '').slice(0, 2000), username: a.username ? String(a.username).slice(0, 80) : undefined, allowed_mentions: { parse: [] } }));
      fd.append('files[0]', new Blob([fs.readFileSync(p)], { type: 'audio/mpeg' }), a.file);
      try {
        const r = await fetch(url.split('?')[0], { method: 'POST', body: fd });
        if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch {} return { ok: false, error: `Discord said no (${r.status}${m ? ': ' + m : ''}).` }; }
        return { ok: true };
      } catch (e) { return { ok: false, error: 'Could not reach Discord: ' + e.message }; }
    }
  }
  return null;
});
/* Conversation projects: each line's audio is stored as a WAV next to the voice messages */
const studioDir = (pid) => { if (!/^[a-z0-9]{1,40}$/.test(String(pid))) throw new Error('Bad project id'); const d = path.join(vmsgDir(), 'Conversations', String(pid)); fs.mkdirSync(d, { recursive: true }); return d; };
ipcMain.handle('van:studio', async (_e, a = {}) => {
  const okId = (x) => /^[a-z0-9]{1,40}$/.test(String(x));
  switch (a.op) {
    case 'save': { if (!okId(a.lid)) throw new Error('Bad line id'); fs.writeFileSync(path.join(studioDir(a.pid), a.lid + '.wav'), Buffer.from(a.data)); return true; }
    case 'read': { if (!okId(a.lid)) throw new Error('Bad line id'); const f = path.join(studioDir(a.pid), a.lid + '.wav'); if (!fs.existsSync(f)) return null; const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
    case 'deleteLine': { if (!okId(a.lid)) return false; try { fs.unlinkSync(path.join(studioDir(a.pid), a.lid + '.wav')); } catch {} return true; }
    case 'deleteProject': { const d = studioDir(a.pid); try { await shell.trashItem(d); } catch { fs.rmSync(d, { recursive: true, force: true }); } return true; }
  }
  return null;
});
ipcMain.on('van:vmsg-drag', (e, file) => {
  try {
    const p = inDir(vmsgDir(), file);
    if (!dragIcon) { dragIcon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')); if (!dragIcon.isEmpty()) dragIcon = dragIcon.resize({ width: 48, height: 48 }); }
    e.sender.startDrag({ file: p, icon: dragIcon });
  } catch {}
});

ipcMain.handle('van:ov-protect', (_e, on) => { cfg.ovHideFromCapture = !!on; saveCfg(); if (overlay && !overlay.isDestroyed()) { try { overlay.setContentProtection(!!on); } catch {} } return cfg.ovHideFromCapture; });

ipcMain.handle('van:uninstall-app', () => {
  const exe = path.join(path.dirname(process.execPath), 'Uninstall VanMule.exe');
  if (!isWin || !fs.existsSync(exe)) return { ok: false, error: 'The uninstaller was not found. Use Windows Settings → Apps → Installed apps → VanMule → Uninstall.' };
  const { spawn } = require('child_process');
  spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => { quitting = true; app.quit(); }, 400);
  return { ok: true };
});

/* ---------- Mini overlay ---------- */
let overlay = null;
function overlayBounds() {
  const { screen } = require('electron');
  const wa = screen.getPrimaryDisplay().workArea, W = 300, H = 690;
  const b = cfg.overlayBounds;
  if (b && screen.getAllDisplays().some((d) => b.x >= d.workArea.x - 50 && b.y >= d.workArea.y - 50 && b.x < d.workArea.x + d.workArea.width - 50 && b.y < d.workArea.y + d.workArea.height - 50)) return { x: b.x, y: b.y, width: W, height: b.height || H };
  return { x: wa.x + wa.width - W - 24, y: wa.y + wa.height - H - 24, width: W, height: H };
}
function setOverlay(on) {
  const open = overlay && !overlay.isDestroyed();
  if (on === undefined || on === null) on = !open;
  if (!on) { if (open) overlay.close(); return false; }
  if (open) { overlay.show(); overlay.focus(); return true; }
  overlay = new BrowserWindow({
    ...overlayBounds(), minHeight: 300, maxWidth: 300, minWidth: 300, frame: false, resizable: true, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false, backgroundColor: '#141110', title: 'VanMule overlay',
    webPreferences: { preload: path.join(__dirname, 'overlay-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  // Keep the overlay out of recordings and screen shares (Windows 10 2004+ removes it from captures).
  if (cfg.ovHideFromCapture !== false) { try { overlay.setContentProtection(true); } catch {} }
  try { overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
  overlay.loadFile(path.join(__dirname, 'app', 'overlay.html'));
  overlay.once('ready-to-show', () => overlay.showInactive());
  const remember = () => { if (overlay && !overlay.isDestroyed()) { cfg.overlayBounds = overlay.getBounds(); saveCfg(); } };
  overlay.on('moved', remember); overlay.on('resized', remember);
  overlay.on('closed', () => { overlay = null; if (win && !win.isDestroyed()) win.webContents.send('van:overlay-state', false); });
  if (win && !win.isDestroyed()) win.webContents.send('van:overlay-state', true);
  return true;
}
ipcMain.handle('van:overlay', (_e, on) => setOverlay(on));
ipcMain.handle('van:show-main', () => { showWin(); return true; });
ipcMain.on('van:ov-cmd', (_e, c) => { if (win && !win.isDestroyed()) win.webContents.send('van:ov-cmd', c); });
ipcMain.on('van:ov-state', (_e, st) => { if (overlay && !overlay.isDestroyed()) overlay.webContents.send('van:ov-state', st); });

/* ---------- IPC ---------- */
ipcMain.handle('van:status', () => audioStatus());
/* ---------- Updates from GitHub Releases ---------- */
const crypto = require('crypto');
let upd = { state: 'idle', latest: null, progress: 0, file: '', error: '' };
const vnum = (v) => String(v || '').replace(/^v/i, '').split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
const newer = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return false; };
function updSend() { if (win && !win.isDestroyed()) win.webContents.send('van:update', { ...upd, current: app.getVersion(), repo: cfg.updateRepo, auto: cfg.autoUpdate }); }
async function checkUpdate(manual) {
  const repo = String(cfg.updateRepo || '').trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { upd = { ...upd, state: 'unconfigured', error: '' }; updSend(); return upd; }
  if (upd.state === 'downloading') return upd;
  upd = { ...upd, state: 'checking', error: '' }; updSend();
  try {
    const r = await net.fetch(`${process.env.VAN_UPDATE_API || 'https://api.github.com'}/repos/${repo}/releases/latest`, { headers: { 'User-Agent': 'VanMule/' + app.getVersion(), Accept: 'application/vnd.github+json' } });
    if (r.status === 404) throw new Error('No releases found for ' + repo + '.');
    if (!r.ok) throw new Error('GitHub answered ' + r.status + '.');
    const j = await r.json();
    const exe = (j.assets || []).find((a) => /\.exe$/i.test(a.name) && /setup/i.test(a.name));
    const shaAsset = (j.assets || []).find((a) => /\.sha256$/i.test(a.name));
    const m = String(j.body || '').match(/sha-?256[:\s]+([a-f0-9]{64})/i);
    const latest = { version: String(j.tag_name || '').replace(/^v/i, ''), name: j.name || j.tag_name, notes: String(j.body || '').replace(/sha-?256[:\s]+[a-f0-9]{64}/ig, '').trim(), url: exe && exe.browser_download_url, size: exe && exe.size, sha256: m ? m[1].toLowerCase() : '', shaUrl: shaAsset && shaAsset.browser_download_url, page: j.html_url };
    upd.latest = latest;
    if (!latest.url) throw new Error('The latest release has no installer attached.');
    const avail = newer(latest.version, app.getVersion());
    if (avail && fs.existsSync(upd.file || '') && upd.readyVersion === latest.version) upd.state = 'ready';
    else upd.state = avail ? (!manual && cfg.skipVersion === latest.version ? 'skipped' : 'available') : 'current';
    updSend();
    if (avail && cfg.autoUpdate && upd.state === 'available') downloadUpdate();
  } catch (e) { upd = { ...upd, state: 'error', error: e.message }; updSend(); }
  return upd;
}
async function downloadUpdate() {
  const L = upd.latest; if (!L || !L.url || upd.state === 'downloading') return;
  upd = { ...upd, state: 'downloading', progress: 0, error: '' }; updSend();
  const dir = path.join(app.getPath('temp'), 'VanMule-update'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `VanMule-Setup-${L.version}.exe`), tmp = file + '.part';
  try {
    let want = L.sha256;
    if (!want && L.shaUrl) { try { const t = await (await net.fetch(L.shaUrl)).text(); const m = t.match(/[a-f0-9]{64}/i); if (m) want = m[0].toLowerCase(); } catch {} }
    const r = await net.fetch(L.url); if (!r.ok) throw new Error('Download failed (' + r.status + ').');
    const total = +r.headers.get('content-length') || L.size || 0, hash = crypto.createHash('sha256'), out = fs.createWriteStream(tmp);
    let got = 0, last = 0; const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      const b = Buffer.from(value); hash.update(b); got += b.length;
      if (!out.write(b)) await new Promise((res) => out.once('drain', res));
      if (Date.now() - last > 300) { last = Date.now(); upd.progress = total ? got / total : 0; updSend(); }
    }
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
    const sum = hash.digest('hex');
    if (want && sum !== want) { fs.unlinkSync(tmp); throw new Error('The download was damaged (checksum did not match). Try again.'); }
    fs.renameSync(tmp, file);
    upd = { ...upd, state: 'ready', progress: 1, file, readyVersion: L.version, verified: !!want }; updSend();
  } catch (e) { try { fs.unlinkSync(tmp); } catch {} upd = { ...upd, state: 'error', error: e.message }; updSend(); }
}
function installUpdate() {
  if (upd.state !== 'ready' || !fs.existsSync(upd.file)) return false;
  const { spawn } = require('child_process');
  spawn(upd.file, ['/S', '/UPDATE'], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => { quitting = true; app.quit(); }, 300);
  return true;
}
ipcMain.handle('van:update', async (_e, a = {}) => {
  switch (a.op) {
    case 'get': return { ...upd, current: app.getVersion(), repo: cfg.updateRepo, auto: cfg.autoUpdate };
    case 'check': return checkUpdate(true);
    case 'download': downloadUpdate(); return true;
    case 'install': return installUpdate();
    case 'skip': cfg.skipVersion = upd.latest ? upd.latest.version : ''; saveCfg(); upd.state = 'skipped'; updSend(); return true;
    case 'config': if ('repo' in a) cfg.updateRepo = String(a.repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$|\/$/g, ''); if ('auto' in a) cfg.autoUpdate = !!a.auto; saveCfg(); upd.state = 'idle'; return checkUpdate(true);
    case 'changelog': try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'app', 'changelog.json'), 'utf8')); } catch { return []; }
  }
  return null;
});

/* ---------- Live graphics-memory use of the AI engine (Windows performance counters) ---------- */
ipcMain.handle('van:gpu-usage', () => new Promise((resolve) => {
  if (!isWin || !engine || !engine.pid) return resolve({ ok: false });
  execFile('typeperf', ['\\GPU Process Memory(*)\\Dedicated Usage', '-sc', '1'], { windowsHide: true, timeout: 8000 }, (err, out) => {
    if (err) return resolve({ ok: false, error: err.message });
    const lines = String(out).split(/\r?\n/).filter((l) => l.startsWith('"'));
    if (lines.length < 2) return resolve({ ok: false });
    const head = lines[0].split('","'), vals = lines[1].split('","');
    let bytes = 0, found = false;
    head.forEach((h, i) => { if (h.includes('pid_' + engine.pid + '_')) { found = true; bytes += parseFloat(String(vals[i]).replace(/"/g, '')) || 0; } });
    resolve({ ok: found, mb: Math.round(bytes / 1048576) });
  });
}));

/* ---------- Backup and restore (plain folders, easy to copy to a USB drive or cloud folder) ---------- */
function dirSize(d) { let n = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); n += e.isDirectory() ? dirSize(p) : (fs.statSync(p).size || 0); } } catch {} return n; }
async function copyMerge(from, to) { let n = 0; if (!fs.existsSync(from)) return 0; await fs.promises.mkdir(to, { recursive: true });
  for (const e of await fs.promises.readdir(from, { withFileTypes: true })) { const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) n += await copyMerge(a, b); else if (!fs.existsSync(b)) { await fs.promises.copyFile(a, b); n++; } }
  return n; }
ipcMain.handle('van:backup', async (_e, a = {}) => {
  const d = dirs(), vm = path.join(d.recordings, 'Voice messages');
  if (a.op === 'sizes') return { voices: dirSize(d.voices), sounds: dirSize(d.sounds), messages: dirSize(vm), recordings: Math.max(0, dirSize(d.recordings) - dirSize(vm)) };
  if (a.op === 'create') {
    const r = process.env.VAN_TEST_DIR ? { canceled: false, filePaths: [process.env.VAN_TEST_DIR] } : await dialog.showOpenDialog(win, { title: 'Choose where to save the backup', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    const t = new Date(), z = (n) => String(n).padStart(2, '0');
    const out = path.join(r.filePaths[0], `VanMule Backup ${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())} ${z(t.getHours())}-${z(t.getMinutes())}`);
    fs.mkdirSync(out, { recursive: true });
    const inc = a.include || {}, done = [];
    fs.writeFileSync(path.join(out, 'settings.json'), JSON.stringify({ app: app.getVersion(), created: t.toISOString(), settings: a.settings || null, config: { ...cfg, voicesDir: '', soundsDir: '', recDir: '' } }, null, 2));
    if (inc.voices) { await copyMerge(d.voices, path.join(out, 'AI voices')); done.push('AI voices'); }
    if (inc.sounds) { await copyMerge(d.sounds, path.join(out, 'Sounds')); done.push('sounds'); }
    if (inc.messages) { await copyMerge(vm, path.join(out, 'Voice messages')); done.push('voice messages and conversations'); }
    if (inc.recordings) { for (const e of fs.readdirSync(d.recordings, { withFileTypes: true })) if (e.isFile()) { fs.mkdirSync(path.join(out, 'Recordings'), { recursive: true }); await fs.promises.copyFile(path.join(d.recordings, e.name), path.join(out, 'Recordings', e.name)); } done.push('recordings'); }
    if (!process.env.VAN_TEST_DIR) shell.showItemInFolder(path.join(out, 'settings.json'));
    return { ok: true, path: out, done, size: dirSize(out) };
  }
  if (a.op === 'pick') {
    const r = process.env.VAN_TEST_PICK ? { canceled: false, filePaths: [process.env.VAN_TEST_PICK] } : await dialog.showOpenDialog(win, { title: 'Choose a VanMule backup folder', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    const f = path.join(r.filePaths[0], 'settings.json');
    if (!fs.existsSync(f)) return { ok: false, error: 'That folder is not a VanMule backup (no settings.json inside).' };
    let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { ok: false, error: 'The backup settings file is damaged.' }; }
    const has = (n) => fs.existsSync(path.join(r.filePaths[0], n));
    return { ok: true, path: r.filePaths[0], created: j.created, appVersion: j.app, hasSettings: !!j.settings, settings: j.settings, voices: has('AI voices'), sounds: has('Sounds'), messages: has('Voice messages'), recordings: has('Recordings') };
  }
  if (a.op === 'restore') {
    const src = String(a.path || ''); if (!fs.existsSync(path.join(src, 'settings.json'))) return { ok: false, error: 'Backup not found.' };
    const inc = a.include || {}, n = {};
    if (inc.voices) { if (engine) { engine.postMessage({ cmd: 'unload' }); await new Promise((r) => setTimeout(r, 500)); } n.voices = await copyMerge(path.join(src, 'AI voices'), d.voices); }
    if (inc.sounds) n.sounds = await copyMerge(path.join(src, 'Sounds'), d.sounds);
    if (inc.messages) n.messages = await copyMerge(path.join(src, 'Voice messages'), vm);
    if (inc.recordings) n.recordings = await copyMerge(path.join(src, 'Recordings'), d.recordings);
    if (inc.settings) { try { const j = JSON.parse(fs.readFileSync(path.join(src, 'settings.json'), 'utf8')); for (const k of ['startMinimized', 'closeToTray', 'defaultMic', 'ovHideFromCapture', 'updateRepo', 'autoUpdate']) if (j.config && k in j.config) cfg[k] = j.config[k]; saveCfg(); } catch {} }
    if (engine) engine.postMessage({ cmd: 'status' });
    return { ok: true, copied: n };
  }
  return null;
});

/* ---------- Diagnostics ---------- */
ipcMain.handle('van:diag', async (_e, a = {}) => {
  const base = { app: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, platform: process.platform, arch: process.arch };
  if (a.op === 'clipboard') {
    const f = path.join(app.getPath('temp'), 'VanMule clipboard test.txt'); fs.writeFileSync(f, 'VanMule clipboard test');
    const r = await ps('diag.ps1', ['-Action', 'clipboard', '-TestFile', f], {}, 20000);
    return r.clipboard || { ok: false, error: r.error || 'No answer' };
  }
  if (a.op === 'discord') { const r = await ps('diag.ps1', ['-Action', 'discord'], {}, 30000); return r.discord || { found: false, error: r.error }; }
  if (a.op === 'save') {
    const d = path.join(app.getPath('userData'), 'diagnostics'); fs.mkdirSync(d, { recursive: true });
    const t = new Date(), z = (n) => String(n).padStart(2, '0');
    const f = path.join(d, `VanMule diagnostics ${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())} ${z(t.getHours())}-${z(t.getMinutes())}.txt`);
    fs.writeFileSync(f, String(a.text || '')); require('electron').clipboard.writeText(String(a.text || '')); shell.showItemInFolder(f);
    return f;
  }
  const dd = dirs();
  const sys = isWin ? await ps('diag.ps1', ['-Action', 'all', '-Dirs', [dd.voices, dd.recordings, app.getPath('userData')].join('|')], {}, 45000) : { ok: false, error: 'Windows only' };
  const cable = isWin ? await audioStatus() : { ok: false, error: 'Windows only' };
  let gpuInfo = null; try { gpuInfo = await app.getGPUInfo('basic'); } catch {}
  return { ...base, sys, cable, cfg: { defaultMic: cfg.defaultMic, ovHide: cfg.ovHideFromCapture }, gpuFeature: app.getGPUFeatureStatus(), gpuDevices: gpuInfo && gpuInfo.gpuDevice };
});
ipcMain.handle('van:install', () => installCable());
ipcMain.handle('van:remove-cable', async () => {
  cfg.defaultMic = false; saveCfg();
  try { await restoreMic(); } catch {}
  return runElevated('uninstall-cable.ps1');
});
ipcMain.handle('van:setDefaultMic', (_e, on) => setDefaultMic(on));
ipcMain.handle('van:getConfig', () => publicCfg());
ipcMain.handle('van:setConfig', (_e, c) => {
  if ('startMinimized' in c) cfg.startMinimized = !!c.startMinimized;
  if ('closeToTray' in c) cfg.closeToTray = !!c.closeToTray;
  if ('openAtLogin' in c) { try { app.setLoginItemSettings({ openAtLogin: !!c.openAtLogin, args: ['--hidden'] }); } catch {} }
  saveCfg();
  return publicCfg();
});
ipcMain.handle('van:setShortcuts', (_e, list) => setShortcuts(list));
ipcMain.handle('van:restart', () => { if (isWin) execFile('shutdown.exe', ['/r', '/t', '5'], { windowsHide: true }); return true; });
ipcMain.handle('van:open', (_e, u) => { if (/^https:\/\//i.test(String(u))) shell.openExternal(String(u)); return true; });

/* ---------- lifecycle ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWin);
  app.whenReady().then(async () => {
    loadCfg();
    const allow = new Set(['media', 'speaker-selection', 'audioCapture', 'mediaKeySystem', 'display-capture']);
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allow.has(perm)));
    session.defaultSession.setPermissionCheckHandler((_wc, perm) => allow.has(perm));
    createWindow();
    createTray();
    if (cfg.defaultMic) setDefaultMic(true).catch(() => {});
    setTimeout(() => checkUpdate(false), 15000);
    if (cfg.remoteOn || cfg.obsOn) setTimeout(() => rmApply().catch(() => {}), 4000);
    if (cfg.rpcOn) setTimeout(() => rpcConnect(), 6000);
    setInterval(() => checkUpdate(false), 6 * 3600e3);
  });
  app.on('before-quit', async (e) => {
    quitting = true;
    if (cfg.defaultMic && !app._vfRestored) {
      e.preventDefault();
      app._vfRestored = true;
      try { await Promise.race([restoreMic(), new Promise((r) => setTimeout(r, 6000))]); } catch {}
      app.quit();
    }
  });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); if (engine) engine.kill(); });
  app.on('window-all-closed', () => { if (quitting) app.quit(); });
}
