/* VanMule 3.16: PC metrics (CPU/GPU/temps/FPS), performance overlay, volume mixer, display check, build info, desktop widgets.
   Windows-only helpers run as small PowerShell processes that are started only while something needs them. */
'use strict';
const { app, BrowserWindow, ipcMain, net, shell } = require('electron');
const scr = () => require('electron').screen;
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

module.exports = function init(ctx) {
  const isWin = process.platform === 'win32';
  const cfg = ctx.cfg, saveCfg = ctx.saveCfg, mainWin = () => { const w = ctx.win(); return w && !w.isDestroyed() ? w : null; };
  const toMain = (ch, data) => { const w = mainWin(); if (w) w.webContents.send(ch, data); };
  const userDir = () => app.getPath('userData');
  const toolsDir = () => { const d = path.join(userDir(), 'tools'); fs.mkdirSync(d, { recursive: true }); return d; };
  const psFile = (name, body) => { const f = path.join(toolsDir(), name); try { if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== body) fs.writeFileSync(f, body); } catch {} return f; };
  const PS = 'powershell.exe';
  const psArgs = (file, extra = []) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', file, ...extra];
  const runPS = (name, body, extra = [], timeout = 30000) => new Promise((resolve) => {
    if (!isWin) return resolve(null);
    execFile(PS, psArgs(psFile(name, body), extra), { windowsHide: true, timeout, maxBuffer: 8e6 }, (e, out) => { try { resolve(JSON.parse(String(out || '').trim())); } catch { resolve(null); } });
  });

  /* ================= live stats (CPU, GPU, VRAM, temps, foreground app) ================= */
  const STATS_PS = String.raw`param([int]$ms = 1000, [int]$parent = 0)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices;
public class VMW { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); }
"@
$gcat = New-Object System.Diagnostics.PerformanceCounterCategory('GPU Engine')
$mcat = New-Object System.Diagnostics.PerformanceCounterCategory('GPU Adapter Memory')
$cpu = New-Object System.Diagnostics.PerformanceCounter('Processor Information', '% Processor Utility', '_Total')
if (-not $cpu) { $cpu = New-Object System.Diagnostics.PerformanceCounter('Processor', '% Processor Time', '_Total') }
$null = $cpu.NextValue()
$ctr = @{}; $mctr = @{}; $refresh = 0; $loop = 0; $temps = $null
while ($true) {
  if ($refresh -le 0) {
    $new = @{}
    foreach ($n in $gcat.GetInstanceNames()) { if ($n -like '*engtype_3D*') { if ($ctr.ContainsKey($n)) { $new[$n] = $ctr[$n] } else { $c = New-Object System.Diagnostics.PerformanceCounter('GPU Engine', 'Utilization Percentage', $n); $null = $c.NextValue(); $new[$n] = $c } } }
    $ctr = $new; $m2 = @{}
    foreach ($n in $mcat.GetInstanceNames()) { if ($mctr.ContainsKey($n)) { $m2[$n] = $mctr[$n] } else { $m2[$n] = New-Object System.Diagnostics.PerformanceCounter('GPU Adapter Memory', 'Dedicated Usage', $n) } }
    $mctr = $m2; $refresh = 5
  }
  $refresh--; $loop++
  Start-Sleep -Milliseconds $ms
  $eng = @{}
  foreach ($k in @($ctr.Keys)) { $v = 0; try { $v = $ctr[$k].NextValue() } catch {}; if ($k -match 'luid_(0x[0-9a-fA-F]+_0x[0-9a-fA-F]+).*eng_(\d+)') { $key = $matches[1] + '_' + $matches[2]; $eng[$key] = [double]$eng[$key] + $v } }
  $gpu = 0.0; foreach ($v in $eng.Values) { if ($v -gt $gpu) { $gpu = $v } }
  $vram = 0.0; foreach ($c in $mctr.Values) { try { $x = $c.NextValue(); if ($x -gt $vram) { $vram = $x } } catch {} }
  $h = [VMW]::GetForegroundWindow(); $fpid = [uint32]0; [void][VMW]::GetWindowThreadProcessId($h, [ref]$fpid)
  $fexe = ''; try { $fexe = (Get-Process -Id $fpid).ProcessName } catch {}
  if ($loop % 3 -eq 1) {
    $temps = @{}
    foreach ($ns in 'root/LibreHardwareMonitor', 'root/OpenHardwareMonitor') {
      $s = Get-CimInstance -Namespace $ns -ClassName Sensor -Filter "SensorType='Temperature'" -ErrorAction SilentlyContinue
      if ($s) { foreach ($x in $s) { $p = [string]$x.Parent; $nm = [string]$x.Name
          if ($p -match 'cpu' -and ($nm -match 'Package|Tctl|Tdie|CPU Total|Core Average' ) -and -not $temps.cpu) { $temps.cpu = [math]::Round($x.Value, 0) }
          if ($p -match 'gpu' -and $nm -match 'GPU Core|GPU Hot Spot|Core' -and -not $temps.gpu) { $temps.gpu = [math]::Round($x.Value, 0) } }
        $temps.src = $ns; break }
    }
  }
  $cv = 0; try { $cv = $cpu.NextValue() } catch {}
  $o = [ordered]@{ cpu = [math]::Round([math]::Min(100, $cv), 1); gpu = [math]::Round([math]::Min(100, $gpu), 1); vram = [int64]$vram; fg = [int]$fpid; fexe = $fexe; temps = $temps }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 3)); [Console]::Out.Flush()
  if ($parent -and ($loop % 5 -eq 0) -and -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit }
}`;
  const ST = { proc: null, nv: null, last: {}, users: new Set(), buf: '', nvbuf: '', fps: null };
  function nvPath() { for (const p of [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe'), 'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe']) if (fs.existsSync(p)) return p; return null; }
  function statsStart() {
    if (!isWin || ST.proc) return;
    ST.proc = spawn(PS, psArgs(psFile('vm-stats.ps1', STATS_PS), ['-ms', '1000', '-parent', String(process.pid)]), { windowsHide: true });
    ST.proc.stdout.on('data', (d) => { ST.buf += d; let i; while ((i = ST.buf.indexOf('\n')) >= 0) { const l = ST.buf.slice(0, i).trim(); ST.buf = ST.buf.slice(i + 1); if (!l) continue; try { Object.assign(ST.last, JSON.parse(l), { at: Date.now() }); pushStats(); } catch {} } });
    ST.proc.on('exit', () => { ST.proc = null; });
    const nv = nvPath();
    if (nv) {
      ST.nv = spawn(nv, ['--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,clocks.gr,power.draw,fan.speed', '--format=csv,noheader,nounits', '-lms', '1000'], { windowsHide: true });
      ST.nv.stdout.on('data', (d) => { ST.nvbuf += d; let i; while ((i = ST.nvbuf.indexOf('\n')) >= 0) { const l = ST.nvbuf.slice(0, i).trim(); ST.nvbuf = ST.nvbuf.slice(i + 1); const c = l.split(',').map((x) => x.trim()); if (c.length >= 8) { const n = (x) => (isFinite(+x) ? +x : null); ST.last.nv = { name: c[0], util: n(c[1]), temp: n(c[2]), memUsed: n(c[3]), memTotal: n(c[4]), clock: n(c[5]), power: n(c[6]), fan: n(c[7]) }; } } });
      ST.nv.on('exit', () => { ST.nv = null; });
    }
  }
  function statsStop() { if (ST.proc) { try { ST.proc.kill(); } catch {} ST.proc = null; } if (ST.nv) { try { ST.nv.kill(); } catch {} ST.nv = null; } }
  function statsUse(who, on) { if (on) ST.users.add(who); else ST.users.delete(who); if (ST.users.size) statsStart(); else { statsStop(); fpsStop(); } }
  // CPU fallback from Node (works everywhere) and RAM
  const os = require('os'); let prevCpu = null;
  function nodeCpu() { const c = os.cpus(); let idle = 0, tot = 0; for (const x of c) { for (const k in x.times) tot += x.times[k]; idle += x.times.idle; } const r = prevCpu ? 100 * (1 - (idle - prevCpu.idle) / Math.max(1, tot - prevCpu.tot)) : null; prevCpu = { idle, tot }; return r; }
  let pingMs = null, pingBusy = false;
  function ping() { if (pingBusy) return; pingBusy = true; const t0 = Date.now(); const s = require('net').connect({ host: '1.1.1.1', port: 443, timeout: 2000 }); const done = (ok) => { pingMs = ok ? Date.now() - t0 : null; pingBusy = false; try { s.destroy(); } catch {} }; s.on('connect', () => done(true)); s.on('timeout', () => done(false)); s.on('error', () => done(false)); }
  function snapshot() {
    const L = ST.last, fps = fpsFor(L.fg);
    return {
      cpu: L.cpu != null && L.at && Date.now() - L.at < 5000 ? L.cpu : nodeCpu(),
      gpu: L.nv && L.nv.util != null ? L.nv.util : L.gpu,
      gpuTemp: (L.nv && L.nv.temp) || (L.temps && L.temps.gpu) || null,
      cpuTemp: (L.temps && L.temps.cpu) || null, tempSrc: (L.temps && L.temps.src) || '',
      vramUsed: L.nv && L.nv.memUsed != null ? L.nv.memUsed * 1048576 : L.vram || null, vramTotal: L.nv && L.nv.memTotal ? L.nv.memTotal * 1048576 : null,
      gpuClock: L.nv ? L.nv.clock : null, gpuPower: L.nv ? L.nv.power : null, fan: L.nv ? L.nv.fan : null, gpuName: L.nv ? L.nv.name : '',
      ramUsed: os.totalmem() - os.freemem(), ramTotal: os.totalmem(), ping: pingMs,
      fps: fps ? fps.fps : null, low1: fps ? fps.low : null, frameMs: fps ? fps.ms : null, fpsApp: fps ? fps.n : (L.fexe || ''), fpsState: FPS.state,
      fg: L.fexe || '', helper: !!ST.proc, at: Date.now(),
    };
  }
  let pushT = 0;
  function pushStats() {
    if (Date.now() - pushT < 400) return; pushT = Date.now();
    // ping only when something shows it, and at most every 5 s
    const wantPing = (MT.on && ((MT.cfg && MT.cfg.items) || []).includes('ping')) || ST.users.has('page') || ST.users.has('widget');
    if (wantPing && Date.now() - (pushStats.pingAt || 0) > 5000) { pushStats.pingAt = Date.now(); ping(); }
    const s = snapshot();
    if (mtWin && !mtWin.isDestroyed()) mtWin.webContents.send('van:mini', { t: 'stats', s, cfg: MT.cfg });
    if (ST.users.has('page')) toMain('van:pc', { t: 'stats', s });
    for (const w of Object.values(WG.wins)) if (w && !w.isDestroyed() && (w._kind === 'stats' || w._kind === 'gauges')) w.webContents.send('van:mini', { t: 'stats', s });
  }
  // Non-Windows (dev/testing): synthesize from Node so the UI still works
  let fakeT = null;
  function fakeLoop() { if (isWin) return; clearInterval(fakeT); fakeT = setInterval(() => { if (!ST.users.size) return; ST.last = { cpu: nodeCpu(), at: Date.now(), fexe: 'electron' }; pushT = 0; pushStats(); }, 1000); }
  fakeLoop();

  /* ================= FPS via Intel PresentMon (downloaded on request) ================= */
  const FPS = { state: 'off', file: '', stop: '', data: {}, timer: null, err: '' };
  const pmPath = () => path.join(toolsDir(), 'PresentMon.exe');
  const FPS_PS = String.raw`param([string]$pm, [string]$out, [string]$stop, [int]$vm)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Diagnostics; using System.Collections.Generic; using System.Globalization; using System.Text;
public class VMFps {
  static Dictionary<int, List<double>> ft = new Dictionary<int, List<double>>(); static Dictionary<int, string> names = new Dictionary<int, string>(); static object L = new object();
  static int iApp = -1, iPid = -1, iMs = -1; public static int lines = 0; public static string err = "";
  public static Process Start(string pm, string args) {
    var psi = new ProcessStartInfo(pm, args); psi.UseShellExecute = false; psi.RedirectStandardOutput = true; psi.RedirectStandardError = true; psi.CreateNoWindow = true;
    var p = new Process(); p.StartInfo = psi;
    p.OutputDataReceived += (s, e) => { if (e.Data != null) Line(e.Data); };
    p.ErrorDataReceived += (s, e) => { if (e.Data != null && err.Length < 400) err += e.Data + " "; };
    p.Start(); p.BeginOutputReadLine(); p.BeginErrorReadLine(); return p;
  }
  static void Line(string l) {
    lines++; var c = l.Split(',');
    if (iMs < 0) { for (int i = 0; i < c.Length; i++) { var h = c[i].Trim(); if (h == "Application") iApp = i; else if (h == "ProcessID") iPid = i; else if (h == "MsBetweenPresents") iMs = i; }
      if (iMs < 0) for (int i = 0; i < c.Length; i++) { var h = c[i].Trim(); if (h == "MsBetweenAppStart" || h == "FrameTime") { iMs = i; break; } } return; }
    if (iPid < 0 || c.Length <= iMs || c.Length <= iPid) return; int pid; double ms;
    if (!int.TryParse(c[iPid], out pid)) return; if (!double.TryParse(c[iMs], NumberStyles.Float, CultureInfo.InvariantCulture, out ms) || ms <= 0) return;
    lock (L) { List<double> a; if (!ft.TryGetValue(pid, out a)) { a = new List<double>(); ft[pid] = a; } names[pid] = iApp >= 0 && iApp < c.Length ? c[iApp] : ""; a.Add(ms); }
  }
  public static string Take() {
    var sb = new StringBuilder("{\"ok\":1,\"lines\":" + lines + ",\"p\":{"); var inv = CultureInfo.InvariantCulture; bool first = true;
    lock (L) { foreach (var kv in ft) { var a = kv.Value; if (a.Count == 0) continue; double sum = 0; foreach (var x in a) sum += x; a.Sort(); int n1 = Math.Max(1, a.Count / 100); double s1 = 0; for (int i = a.Count - n1; i < a.Count; i++) s1 += a[i];
        if (!first) sb.Append(','); first = false;
        sb.Append("\"" + kv.Key + "\":{\"n\":\"" + names[kv.Key].Replace("\"", "").Replace("\\", "") + "\",\"c\":" + a.Count + ",\"ms\":" + (sum / a.Count).ToString("0.###", inv) + ",\"worst\":" + (s1 / n1).ToString("0.###", inv) + "}"); a.Clear(); } }
    sb.Append("}}"); return sb.ToString();
  }
}
"@
$p = [VMFps]::Start($pm, '--output_stdout --no_console_stats --stop_existing_session --session_name VanMuleFPS --exclude dwm.exe')
$t0 = Get-Date
while ($true) {
  Start-Sleep -Milliseconds 1000
  if ($p.HasExited) { [IO.File]::WriteAllText($out, '{"ok":0,"err":"' + ([VMFps]::err -replace '[^\w .:,()-]', '') + '","code":' + $p.ExitCode + '}'); break }
  [IO.File]::WriteAllText($out + '.tmp', [VMFps]::Take()); Move-Item -Force ($out + '.tmp') $out
  if ((Test-Path $stop) -or -not (Get-Process -Id $vm -ErrorAction SilentlyContinue)) { break }
}
try { $p.Kill() } catch {}
& $pm --terminate_existing_session --session_name VanMuleFPS 2>$null | Out-Null
Remove-Item $stop -ErrorAction SilentlyContinue`;
  async function pmDownload() {
    const r = await net.fetch('https://api.github.com/repos/GameTechDev/PresentMon/releases/latest', { headers: { 'User-Agent': 'VanMule', Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('GitHub answered ' + r.status);
    const j = await r.json(), assets = j.assets || [];
    const a = assets.find((x) => /^PresentMon-[\d.]+-x64\.exe$/i.test(x.name)) || assets.find((x) => /x64\.exe$/i.test(x.name) && !/capture|service|setup/i.test(x.name));
    if (!a) throw new Error('No PresentMon download found in release ' + (j.tag_name || ''));
    const b = await net.fetch(a.browser_download_url, { headers: { 'User-Agent': 'VanMule' } }); if (!b.ok) throw new Error('Download answered ' + b.status);
    const buf = Buffer.from(await b.arrayBuffer()); if (buf.length < 100000 || buf[0] !== 0x4d || buf[1] !== 0x5a) throw new Error('The download was not a Windows program');
    fs.writeFileSync(pmPath(), buf); cfg.pmVersion = j.tag_name || a.name; saveCfg(); return { ok: true, version: cfg.pmVersion };
  }
  function fpsRead() {
    try {
      const j = JSON.parse(fs.readFileSync(FPS.file, 'utf8'));
      if (!j.ok) { FPS.state = 'error'; FPS.err = j.err || 'PresentMon stopped (code ' + j.code + ')'; fpsStop(true); if (FPS.tryElev) fpsElevated(); return; }
      FPS.state = 'on'; FPS.at = Date.now();
      for (const [pid, v] of Object.entries(j.p || {})) FPS.data[pid] = { n: v.n, fps: v.ms > 0 ? Math.round(1000 / v.ms) : 0, low: v.worst > 0 ? Math.round(1000 / v.worst) : 0, ms: +v.ms.toFixed(1), c: v.c, at: Date.now() };
    } catch {}
  }
  function fpsFor(pid) {
    if (FPS.state !== 'on') return null; const now = Date.now(); let best = null;
    const d = FPS.data[String(pid)]; if (d && now - d.at < 2500 && d.c > 2) return d;
    for (const v of Object.values(FPS.data)) if (now - v.at < 2500 && v.c > 5 && (!best || v.c > best.c)) best = v; // otherwise the busiest app that's drawing frames
    return best;
  }
  function fpsLaunch(elevated) {
    const wrap = psFile('vm-fps.ps1', FPS_PS); FPS.file = path.join(toolsDir(), 'fps.json'); FPS.stop = path.join(toolsDir(), 'fps.stop');
    try { fs.unlinkSync(FPS.stop); } catch {} try { fs.unlinkSync(FPS.file); } catch {}
    const args = `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${wrap}" -pm "${pmPath()}" -out "${FPS.file}" -stop "${FPS.stop}" -vm ${process.pid}`;
    if (!elevated) { const p = spawn(PS, args.match(/"[^"]*"|\S+/g).map((x) => x.replace(/^"|"$/g, '')), { windowsHide: true, detached: false }); p.on('error', () => {}); }
    else {
      return new Promise((resolve) => execFile(PS, ['-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList '${args.replace(/'/g, "''")}'`], { windowsHide: true }, (e) => resolve(!e)));
    }
    return Promise.resolve(true);
  }
  async function fpsStart() {
    if (!isWin) throw new Error('FPS needs Windows');
    if (!fs.existsSync(pmPath())) { FPS.state = 'downloading'; pushState(); await pmDownload(); }
    FPS.state = 'starting'; FPS.err = ''; FPS.data = {}; pushState();
    FPS.tryElev = true; await fpsLaunch(false); // works without a prompt if you're in the Performance Log Users group
    clearInterval(FPS.timer); FPS.timer = setInterval(fpsRead, 1000);
    return { ok: true };
  }
  async function fpsElevated() {
    FPS.tryElev = false; FPS.state = 'starting'; FPS.err = ''; pushState();
    const ok = await fpsLaunch(true);
    if (!ok) { FPS.state = 'declined'; pushState(); return; }
    clearInterval(FPS.timer); FPS.timer = setInterval(fpsRead, 1000);
  }
  function fpsStop(keepState) { clearInterval(FPS.timer); FPS.timer = null; try { if (FPS.stop) fs.writeFileSync(FPS.stop, '1'); } catch {} if (!keepState) FPS.state = 'off'; FPS.data = {}; }
  function pushState() { toMain('van:pc', { t: 'fps', state: FPS.state, err: FPS.err }); }

  /* ================= metrics overlay window ================= */
  const MT = { on: false, cfg: cfg.metrics || {} };
  let mtWin = null;
  const MT_DEF = { items: ['fps', 'low1', 'cpu', 'gpu', 'gpuTemp', 'ram'], pos: 'tl', x: null, y: null, display: '', color: '#ffb347', textColor: '#ffffff', bg: 0.45, size: 14, layout: 'list', lock: true, labels: true, style: 'text', byLoad: false, glow: true, needle: false, fpsMax: 165, cols: 3 };
  function mtCfg() { return Object.assign({}, MT_DEF, cfg.metrics || {}); }
  function mtBounds(w, h) {
    const c = mtCfg(), d = scr().getAllDisplays().find((x) => String(x.id) === String(c.display)) || scr().getPrimaryDisplay(), b = d.workArea, m = 12;
    if (c.pos === 'custom' && c.x != null) return { x: Math.round(c.x), y: Math.round(c.y), width: w, height: h };
    const x = c.pos.endsWith('l') ? b.x + m : c.pos.endsWith('c') ? Math.round(b.x + (b.width - w) / 2) : b.x + b.width - w - m;
    const y = c.pos.startsWith('t') ? d.bounds.y + m : b.y + b.height - h - m;
    return { x, y, width: w, height: h };
  }
  function mtApply() {
    MT.cfg = mtCfg();
    if (!MT.on) { if (mtWin && !mtWin.isDestroyed()) mtWin.hide(); statsUse('overlay', false); return; }
    statsUse('overlay', true); if (MT.cfg.items.some((k) => k === 'fps' || k === 'low1' || k === 'frametime') && FPS.state === 'off' && fs.existsSync(pmPath())) fpsStart().catch(() => {});
    if (!mtWin || mtWin.isDestroyed()) {
      mtWin = new BrowserWindow({ ...mtBounds(220, 140), transparent: true, frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: false, show: false, backgroundColor: '#00000000', title: 'VanMule performance overlay', webPreferences: { preload: path.join(__dirname, 'mini-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
      mtWin.setAlwaysOnTop(true, 'screen-saver'); try { mtWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
      mtWin.loadFile(path.join(__dirname, 'app', 'metrics.html')); mtWin.once('ready-to-show', () => { if (MT.on && mtWin) mtWin.showInactive(); mtLock(); });
      mtWin.on('closed', () => { mtWin = null; });
      mtWin.on('moved', () => { if (!mtWin || MT.cfg.lock) return; const b = mtWin.getBounds(); cfg.metrics = Object.assign(mtCfg(), { pos: 'custom', x: b.x, y: b.y }); saveCfg(); toMain('van:pc', { t: 'mtcfg', cfg: cfg.metrics }); });
    } else { mtWin.webContents.send('van:mini', { t: 'cfg', cfg: MT.cfg }); if (!mtWin.isVisible()) mtWin.showInactive(); mtLock(); }
    try { mtWin.setContentProtection(!!cfg.ovHideFromCapture); } catch {}
  }
  function mtLock() { if (!mtWin || mtWin.isDestroyed()) return; const lock = mtCfg().lock; mtWin.setIgnoreMouseEvents(lock); mtWin.setFocusable(!lock); mtWin.webContents.send('van:mini', { t: 'cfg', cfg: mtCfg() }); }
  setInterval(() => { if (mtWin && !mtWin.isDestroyed() && mtWin.isVisible()) { try { mtWin.setAlwaysOnTop(true, 'screen-saver'); } catch {} } }, 3000);

  /* ================= volume mixer (Windows Core Audio sessions) ================= */
  const MIX_PS = String.raw`$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Collections.Generic; using System.Diagnostics; using System.Text;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class VMDevEnumCo {}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IVMDevEnum { [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out IntPtr devs); [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IVMDevice dev); }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IVMDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); [PreserveSig] int OpenPropertyStore(int access, out IVMPropStore ps); }
[StructLayout(LayoutKind.Sequential)] public struct VMPropKey { public Guid fmt; public int pid; }
[StructLayout(LayoutKind.Explicit, Size = 24)] public struct VMPropVar { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; }
[ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IVMPropStore { [PreserveSig] int GetCount(out int c); [PreserveSig] int GetAt(int i, out VMPropKey k); [PreserveSig] int GetValue(ref VMPropKey k, out VMPropVar v); }
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IVMSessMgr2 { [PreserveSig] int GetAudioSessionControl(IntPtr a, int b, out IntPtr c); [PreserveSig] int GetSimpleAudioVolume(IntPtr a, int b, out IntPtr c); [PreserveSig] int GetSessionEnumerator(out IVMSessEnum e); }
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IVMSessEnum { [PreserveSig] int GetCount(out int c); [PreserveSig] int GetSession(int i, out IVMSessCtl2 s); }
[ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IVMSessCtl2 {
  [PreserveSig] int GetState(out int s); [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string n); [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string n, ref Guid g);
  [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string p); [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string p, ref Guid g);
  [PreserveSig] int GetGroupingParam(out Guid g); [PreserveSig] int SetGroupingParam(ref Guid g, ref Guid c); [PreserveSig] int RegisterAudioSessionNotification(IntPtr n); [PreserveSig] int UnregisterAudioSessionNotification(IntPtr n);
  [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string s); [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string s);
  [PreserveSig] int GetProcessId(out uint pid); [PreserveSig] int IsSystemSoundsSession(); }
[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IVMSimpleVol { [PreserveSig] int SetMasterVolume(float v, ref Guid g); [PreserveSig] int GetMasterVolume(out float v); [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid g); [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m); }
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IVMEndVol {
  [PreserveSig] int RegisterControlChangeNotify(IntPtr n); [PreserveSig] int UnregisterControlChangeNotify(IntPtr n); [PreserveSig] int GetChannelCount(out uint c);
  [PreserveSig] int SetMasterVolumeLevel(float v, ref Guid g); [PreserveSig] int SetMasterVolumeLevelScalar(float v, ref Guid g); [PreserveSig] int GetMasterVolumeLevel(out float v); [PreserveSig] int GetMasterVolumeLevelScalar(out float v);
  [PreserveSig] int SetChannelVolumeLevel(uint c, float v, ref Guid g); [PreserveSig] int SetChannelVolumeLevelScalar(uint c, float v, ref Guid g); [PreserveSig] int GetChannelVolumeLevel(uint c, out float v); [PreserveSig] int GetChannelVolumeLevelScalar(uint c, out float v);
  [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid g); [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m); }
public static class VMMix {
  static Guid Z = Guid.Empty;
  static IVMDevice Dev() { var e = (IVMDevEnum)(new VMDevEnumCo()); IVMDevice d; e.GetDefaultAudioEndpoint(0, 1, out d); return d; }
  static string Esc(string s) { if (s == null) return ""; var b = new StringBuilder(); foreach (var ch in s) { if (ch == '"' || ch == '\\') b.Append('\\').Append(ch); else if (ch < 32) b.Append(' '); else b.Append(ch); } return b.ToString(); }
  static List<IVMSessCtl2> Sessions(IVMDevice d) { var r = new List<IVMSessCtl2>(); Guid iid = typeof(IVMSessMgr2).GUID; object o; if (d.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) return r; var m = (IVMSessMgr2)o; IVMSessEnum en; if (m.GetSessionEnumerator(out en) != 0) return r; int n; en.GetCount(out n); for (int i = 0; i < n; i++) { IVMSessCtl2 s; if (en.GetSession(i, out s) == 0 && s != null) r.Add(s); } return r; }
  static IVMEndVol EndVol(IVMDevice d) { Guid iid = typeof(IVMEndVol).GUID; object o; d.Activate(ref iid, 23, IntPtr.Zero, out o); return (IVMEndVol)o; }
  static string DevName(IVMDevice d) { try { IVMPropStore ps; if (d.OpenPropertyStore(0, out ps) != 0) return ""; var k = new VMPropKey { fmt = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 }; VMPropVar v; if (ps.GetValue(ref k, out v) == 0 && v.vt == 31) return Marshal.PtrToStringUni(v.p); } catch {} return ""; }
  public static string List() {
    var d = Dev(); var sb = new StringBuilder(); var ev = EndVol(d); float mv; ev.GetMasterVolumeLevelScalar(out mv); bool mm; ev.GetMute(out mm);
    sb.Append("{\"ok\":1,\"dev\":\"" + Esc(DevName(d)) + "\",\"vol\":" + mv.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",\"mute\":" + (mm ? "true" : "false") + ",\"apps\":[");
    bool first = true;
    foreach (var s in Sessions(d)) {
      int st; s.GetState(out st); if (st == 2) continue; uint pid; s.GetProcessId(out pid); bool sys = s.IsSystemSoundsSession() == 0; string dn; s.GetDisplayName(out dn);
      var sv = s as IVMSimpleVol; if (sv == null) continue; float v; sv.GetMasterVolume(out v); bool mu; sv.GetMute(out mu);
      string name = "", pathS = "", desc = "";
      if (!sys) { try { var p = Process.GetProcessById((int)pid); name = p.ProcessName; try { pathS = p.MainModule.FileName; var fi = FileVersionInfo.GetVersionInfo(pathS); desc = fi.FileDescription; } catch {} if (string.IsNullOrEmpty(desc)) { try { desc = p.MainWindowTitle; } catch {} } } catch {} }
      if (!first) sb.Append(','); first = false;
      sb.Append("{\"pid\":" + pid + ",\"sys\":" + (sys ? "true" : "false") + ",\"state\":" + st + ",\"dn\":\"" + Esc(dn) + "\",\"name\":\"" + Esc(name) + "\",\"desc\":\"" + Esc(desc) + "\",\"path\":\"" + Esc(pathS) + "\",\"vol\":" + v.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",\"mute\":" + (mu ? "true" : "false") + "}");
    }
    sb.Append("]}"); return sb.ToString();
  }
  public static void SetApp(uint pid, bool sys, float vol, int mute) { var d = Dev(); foreach (var s in Sessions(d)) { uint p; s.GetProcessId(out p); bool isSys = s.IsSystemSoundsSession() == 0; if (sys ? !isSys : (p != pid || isSys)) continue; var sv = s as IVMSimpleVol; if (sv == null) continue; if (vol >= 0) sv.SetMasterVolume(Math.Min(1f, vol), ref Z); if (mute >= 0) sv.SetMute(mute == 1, ref Z); } }
  public static void SetMaster(float vol, int mute) { var ev = EndVol(Dev()); if (vol >= 0) ev.SetMasterVolumeLevelScalar(Math.Min(1f, vol), ref Z); if (mute >= 0) ev.SetMute(mute == 1, ref Z); }
}
"@
[Console]::Out.WriteLine('{"ready":1}'); [Console]::Out.Flush()
while ($true) {
  $l = [Console]::In.ReadLine(); if ($l -eq $null) { break }
  $a = $l.Split(' '); $r = '{"ok":1}'
  try {
    switch ($a[0]) {
      'L' { $r = [VMMix]::List() }
      'A' { [VMMix]::SetApp([uint32]$a[1], $a[2] -eq '1', [single]::Parse($a[3], [Globalization.CultureInfo]::InvariantCulture), [int]$a[4]); $r = [VMMix]::List() }
      'M' { [VMMix]::SetMaster([single]::Parse($a[1], [Globalization.CultureInfo]::InvariantCulture), [int]$a[2]); $r = [VMMix]::List() }
    }
  } catch { $r = '{"ok":0,"err":"' + ($_.Exception.Message -replace '[^\w .:,()-]', '') + '"}' }
  [Console]::Out.WriteLine($r); [Console]::Out.Flush()
}`;
  const MX = { proc: null, q: [], buf: '', ready: null, icons: {}, last: null, idleT: null };
  function mixProc() {
    if (!isWin) return null; if (MX.proc) return MX.ready;
    MX.proc = spawn(PS, psArgs(psFile('vm-mixer.ps1', MIX_PS)), { windowsHide: true });
    MX.ready = new Promise((res) => { MX.onReady = res; setTimeout(res, 15000); });
    MX.proc.stdout.on('data', (d) => { MX.buf += d; let i; while ((i = MX.buf.indexOf('\n')) >= 0) { const l = MX.buf.slice(0, i).trim(); MX.buf = MX.buf.slice(i + 1); if (!l) continue; let j = null; try { j = JSON.parse(l); } catch {} if (j && j.ready) { MX.onReady && MX.onReady(); continue; } const cb = MX.q.shift(); if (cb) cb(j); } });
    MX.proc.on('exit', () => { MX.proc = null; for (const cb of MX.q.splice(0)) cb(null); });
    return MX.ready;
  }
  async function mixCmd(line) {
    if (!isWin) return demoMix(line);
    await mixProc(); clearTimeout(MX.idleT); MX.idleT = setTimeout(() => { if (MX.proc && !(mxWin && !mxWin.isDestroyed() && mxWin.isVisible())) { try { MX.proc.kill(); } catch {} MX.proc = null; } }, 60000);
    const j = await new Promise((res) => { MX.q.push(res); try { MX.proc.stdin.write(line + '\n'); } catch { MX.q.pop(); res(null); } setTimeout(() => res(null), 8000); });
    if (!j || !j.ok) throw new Error((j && j.err) || 'The volume mixer helper did not answer');
    for (const a of j.apps || []) { a.label = a.sys ? 'System sounds' : (a.dn && !a.dn.startsWith('@') ? a.dn : '') || a.desc || a.name || 'App ' + a.pid; if (a.path && !(a.path in MX.icons)) { MX.icons[a.path] = ''; try { const im = await app.getFileIcon(a.path, { size: 'normal' }); MX.icons[a.path] = im.toDataURL(); } catch {} } a.icon = MX.icons[a.path] || ''; }
    // group sessions from the same program (e.g. a browser with several tabs)
    const g = {}; for (const a of j.apps || []) { const k = a.sys ? 'sys' : (a.path || a.name || a.pid); if (!g[k]) g[k] = Object.assign({}, a, { pids: [a.pid] }); else g[k].pids.push(a.pid); }
    j.apps = Object.values(g).sort((x, y) => (y.sys - x.sys) || (y.state === 1) - (x.state === 1) || x.label.localeCompare(y.label));
    MX.last = j; return j;
  }
  // dev fallback so the UI can be tried on non-Windows
  const DEMO = { vol: 0.8, mute: false, apps: [{ pid: 1, sys: true, label: 'System sounds', vol: 1, mute: false, state: 0 }, { pid: 2, label: 'VanMule', vol: 1, mute: false, state: 1 }, { pid: 3, label: 'Discord', vol: 0.7, mute: false, state: 1 }, { pid: 4, label: 'Counter-Strike 2', vol: 0.55, mute: false, state: 1 }, { pid: 5, label: 'Spotify', vol: 0.3, mute: true, state: 0 }] };
  function demoMix(line) { const a = line.split(' '); if (a[0] === 'A') { const x = DEMO.apps.find((y) => y.pid === +a[1]); if (x) { if (+a[3] >= 0) x.vol = +a[3]; if (+a[4] >= 0) x.mute = a[4] === '1'; } } if (a[0] === 'M') { if (+a[1] >= 0) DEMO.vol = +a[1]; if (+a[2] >= 0) DEMO.mute = a[2] === '1'; } return Promise.resolve(Object.assign({ ok: 1, dev: 'Speakers (demo)', demo: true }, JSON.parse(JSON.stringify(DEMO)), { apps: DEMO.apps.map((x) => Object.assign({ pids: [x.pid], icon: '' }, x)) })); }
  let mxWin = null;
  const MX_SIZES = { mini: { w: 460, h: 250 }, compact: { w: 300, h: 340 }, normal: { w: 380, h: 460 }, large: { w: 500, h: 620 } };
  function mxPrefs() { return Object.assign({ size: 'normal', opacity: 0.94, tone: true }, cfg.mixerPrefs || {}); }
  function mxToggle(on) {
    const open = mxWin && !mxWin.isDestroyed() && mxWin.isVisible(); if (on == null) on = !open;
    if (!on) { if (mxWin && !mxWin.isDestroyed()) mxWin.hide(); return false; }
    if (!mxWin || mxWin.isDestroyed()) {
      const c = cfg.mixerWin || {}, d = scr().getPrimaryDisplay().workArea, sz = MX_SIZES[mxPrefs().size] || MX_SIZES.normal, w = sz.w, h = sz.h;
      mxWin = new BrowserWindow({ x: c.x != null ? c.x : d.x + d.width - w - 20, y: c.y != null ? c.y : d.y + d.height - h - 20, width: c.w || w, height: c.h || h, minWidth: 300, minHeight: 220, transparent: true, frame: false, resizable: true, skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: '#00000000', title: 'VanMule volume mixer', webPreferences: { preload: path.join(__dirname, 'mini-preload.js'), contextIsolation: true, nodeIntegration: false } });
      mxWin.setAlwaysOnTop(true, 'pop-up-menu'); mxWin.loadFile(path.join(__dirname, 'app', 'mixer.html'));
      mxWin.once('ready-to-show', () => { mxWin.show(); });
      const keep = () => { if (!mxWin) return; const b = mxWin.getBounds(); cfg.mixerWin = { x: b.x, y: b.y, w: b.width, h: b.height }; saveCfg(); };
      mxWin.on('moved', keep); mxWin.on('resized', keep); mxWin.on('closed', () => { mxWin = null; toMain('van:pc', { t: 'mixer', open: false }); });
      mxWin.on('hide', () => toMain('van:pc', { t: 'mixer', open: false }));
    } else { mxWin.show(); mxWin.focus(); }
    toMain('van:pc', { t: 'mixer', open: true }); return true;
  }

  /* ================= display check: refresh rate and resolution ================= */
  const DISP_PS = String.raw`$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Collections.Generic;
public static class VMDisp {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DEVMODE { [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName; public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra; public int dmFields; public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput; public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName; public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight; public int dmDisplayFlags; public int dmDisplayFrequency; public int dmICMMethod; public int dmICMIntent; public int dmMediaType; public int dmDitherType; public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DISPLAY_DEVICE { public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString; public int StateFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey; }
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] public static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] public static extern bool EnumDisplayDevices(string dev, uint i, ref DISPLAY_DEVICE dd, uint flags);
  // the monitor's real (native) resolution from its EDID: the first detailed timing is the preferred mode.
  // Driver-added modes (like NVIDIA DSR) are bigger than this, so the largest listed mode can't be trusted.
  static void Native(string iface, out int w, out int h, out string name) {
    w = 0; h = 0; name = "";
    try {
      var p = iface.Split('#'); if (p.Length < 3) return;
      var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey("SYSTEM\\CurrentControlSet\\Enum\\DISPLAY\\" + p[1] + "\\" + p[2] + "\\Device Parameters"); if (key == null) return;
      var e = key.GetValue("EDID") as byte[]; if (e == null || e.Length < 72) return;
      int hw = e[56] + ((e[58] & 0xF0) << 4), vh = e[59] + ((e[61] & 0xF0) << 4);
      if (hw >= 640 && vh >= 400) { w = hw; h = vh; }
      for (int b = 54; b + 18 <= Math.Min(e.Length, 126); b += 18) if (e[b] == 0 && e[b + 1] == 0 && e[b + 3] == 0xFC) { var sb = new StringBuilder(); for (int i = b + 5; i < b + 18 && e[i] != 0x0A && e[i] != 0; i++) sb.Append((char)e[i]); name = sb.ToString().Trim(); }
    } catch {}
  }
  public static string Run() {
    var sb = new StringBuilder("["); bool first = true;
    for (uint i = 0; i < 16; i++) {
      var dd = new DISPLAY_DEVICE(); dd.cb = Marshal.SizeOf(dd); if (!EnumDisplayDevices(null, i, ref dd, 0)) break; if ((dd.StateFlags & 1) == 0) continue;
      var mon = new DISPLAY_DEVICE(); mon.cb = Marshal.SizeOf(mon); string monName = ""; if (EnumDisplayDevices(dd.DeviceName, 0, ref mon, 0)) monName = mon.DeviceString;
      int nw = 0, nh = 0; string edidName = ""; var mi = new DISPLAY_DEVICE(); mi.cb = Marshal.SizeOf(mi); if (EnumDisplayDevices(dd.DeviceName, 0, ref mi, 1)) Native(mi.DeviceID, out nw, out nh, out edidName);
      var cur = new DEVMODE(); cur.dmSize = (short)Marshal.SizeOf(cur); if (!EnumDisplaySettings(dd.DeviceName, -1, ref cur)) continue;
      int maxHzCur = 0, maxW = 0, maxH = 0, maxHzMax = 0; var dm = new DEVMODE(); dm.dmSize = (short)Marshal.SizeOf(dm);
      for (int m = 0; EnumDisplaySettings(dd.DeviceName, m, ref dm) && m < 5000; m++) {
        if (dm.dmBitsPerPel < 24) continue;
        if (dm.dmPelsWidth == cur.dmPelsWidth && dm.dmPelsHeight == cur.dmPelsHeight && dm.dmDisplayFrequency > maxHzCur) maxHzCur = dm.dmDisplayFrequency;
        if ((long)dm.dmPelsWidth * dm.dmPelsHeight > (long)maxW * maxH) { maxW = dm.dmPelsWidth; maxH = dm.dmPelsHeight; maxHzMax = 0; }
        if (dm.dmPelsWidth == maxW && dm.dmPelsHeight == maxH && dm.dmDisplayFrequency > maxHzMax) maxHzMax = dm.dmDisplayFrequency;
      }
      if (!first) sb.Append(','); first = false;
      sb.Append("{\"dev\":\"" + dd.DeviceName.Replace("\\", "\\\\") + "\",\"gpu\":\"" + dd.DeviceString.Replace("\"", "") + "\",\"mon\":\"" + monName.Replace("\"", "") + "\",\"primary\":" + ((dd.StateFlags & 4) != 0 ? "true" : "false") + ",\"x\":" + cur.dmPositionX + ",\"y\":" + cur.dmPositionY + ",\"w\":" + cur.dmPelsWidth + ",\"h\":" + cur.dmPelsHeight + ",\"hz\":" + cur.dmDisplayFrequency + ",\"maxHz\":" + maxHzCur + ",\"maxW\":" + maxW + ",\"maxH\":" + maxH + ",\"maxHzAtMax\":" + maxHzMax + ",\"name\":\"" + edidName.Replace("\"", "").Replace("\\", "") + "\",\"nativeW\":" + nw + ",\"nativeH\":" + nh + ",\"orient\":" + cur.dmDisplayOrientation + "}");
    }
    return sb.Append("]").ToString();
  }
}
"@
$names = @{}
try { foreach ($m in Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID) { $n = -join ($m.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }); if ($n) { $names[[string]$m.InstanceName] = $n } } } catch {}
$list = [VMDisp]::Run() | ConvertFrom-Json
$out = @{ displays = @($list); names = @($names.Values) }
$out | ConvertTo-Json -Compress -Depth 4`;
  async function displayCheck() {
    if (!isWin) {
      const d = scr().getAllDisplays().map((x, i) => ({ dev: 'DISPLAY' + (i + 1), mon: x.label || 'Display ' + (i + 1), primary: x.id === scr().getPrimaryDisplay().id, w: Math.round(x.size.width * x.scaleFactor), h: Math.round(x.size.height * x.scaleFactor), hz: Math.round(x.displayFrequency || 60), maxHz: Math.round(x.displayFrequency || 60), maxW: Math.round(x.size.width * x.scaleFactor), maxH: Math.round(x.size.height * x.scaleFactor) }));
      return { displays: d, names: [], demo: true };
    }
    const r = await runPS('vm-display.ps1', DISP_PS, [], 20000); if (!r) return { displays: [], error: 'check failed' };
    r.displays = [].concat(r.displays || []); return r;
  }

  /* ================= build info (for "copy my build") ================= */
  const BUILD_PS = String.raw`$ErrorActionPreference = 'SilentlyContinue'
$cs = Get-CimInstance Win32_ComputerSystem; $bb = Get-CimInstance Win32_BaseBoard; $os = Get-CimInstance Win32_OperatingSystem; $bios = Get-CimInstance Win32_BIOS
$cpu = @(Get-CimInstance Win32_Processor | ForEach-Object { @{ name = $_.Name.Trim(); cores = $_.NumberOfCores; threads = $_.NumberOfLogicalProcessors; mhz = $_.MaxClockSpeed } })
$vram = @{}
Get-ChildItem 'HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-ItemProperty $_.PSPath; if ($p.DriverDesc -and $p.'HardwareInformation.qwMemorySize') { $vram[$p.DriverDesc] = [int64]$p.'HardwareInformation.qwMemorySize' } }
$gpu = @(Get-CimInstance Win32_VideoController | ForEach-Object { $m = $vram[$_.Name]; if (-not $m) { $m = [int64]$_.AdapterRAM }; @{ name = $_.Name; driver = $_.DriverVersion; vram = $m; res = "$($_.CurrentHorizontalResolution)x$($_.CurrentVerticalResolution)"; hz = $_.CurrentRefreshRate } })
$ram = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object { @{ size = [int64]$_.Capacity; speed = $_.Speed; cfg = $_.ConfiguredClockSpeed; maker = ([string]$_.Manufacturer).Trim(); part = ([string]$_.PartNumber).Trim() } })
$disks = @(Get-CimInstance -Namespace root\Microsoft\Windows\Storage -ClassName MSFT_PhysicalDisk | ForEach-Object { @{ name = $_.FriendlyName; size = [int64]$_.Size; media = $_.MediaType; bus = $_.BusType } })
$mons = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID | ForEach-Object { -join ($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) } | Where-Object { $_ })
$audio = @(Get-CimInstance Win32_SoundDevice | ForEach-Object { $_.Name })
$net = @(Get-CimInstance Win32_NetworkAdapter -Filter "PhysicalAdapter=True AND NetEnabled=True" | ForEach-Object { $_.Name })
@{ maker = $cs.Manufacturer; model = $cs.Model; board = "$($bb.Manufacturer) $($bb.Product)".Trim(); bios = $bios.SMBIOSBIOSVersion; os = "$($os.Caption) $($os.Version) (build $($os.BuildNumber))"; ramTotal = [int64]$cs.TotalPhysicalMemory; cpu = $cpu; gpu = $gpu; ram = $ram; disks = $disks; monitors = $mons; audio = $audio; net = $net } | ConvertTo-Json -Compress -Depth 4`;
  async function buildInfo() {
    if (!isWin) { const c = os.cpus(); return { demo: true, maker: '', model: os.hostname(), os: `${os.type()} ${os.release()}`, ramTotal: os.totalmem(), cpu: [{ name: (c[0] && c[0].model) || 'CPU', cores: c.length, threads: c.length }], gpu: [], ram: [], disks: [], monitors: [], audio: [], net: [] }; }
    const r = await runPS('vm-build.ps1', BUILD_PS, [], 45000); if (!r) throw new Error('Could not read your PC details');
    for (const k of ['cpu', 'gpu', 'ram', 'disks', 'monitors', 'audio', 'net']) r[k] = r[k] == null ? [] : [].concat(r[k]);
    return r;
  }

  /* ================= desktop widgets ================= */
  const WG = { wins: {} };
  function wgList() { return Array.isArray(cfg.widgets) ? cfg.widgets : (cfg.widgets = []); }
  function wgSync() {
    const list = wgList(), ids = new Set(list.map((w) => w.id));
    for (const [id, w] of Object.entries(WG.wins)) if (!ids.has(id)) { try { w.destroy(); } catch {} delete WG.wins[id]; }
    for (const w of list) wgOpen(w);
    statsUse('widget', list.some((w) => w.kind === 'stats' || w.kind === 'gauges'));
  }
  /* "on the desktop" widgets: push their windows to the bottom of the window stack (behind every app) */
  const ZB_PS = String.raw`$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices;
public class VMZ { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f); }
"@
while ($true) { $l = [Console]::In.ReadLine(); if ($l -eq $null) { break }; foreach ($h in $l.Split(' ')) { if ($h) { [void][VMZ]::SetWindowPos([IntPtr][Int64]$h, [IntPtr]1, 0, 0, 0, 0, 0x0013) } } }`;
  let zb = null;
  function toBack(bw) {
    if (!isWin || !bw || bw.isDestroyed()) return;
    try {
      if (!zb) { zb = spawn(PS, psArgs(psFile('vm-zorder.ps1', ZB_PS)), { windowsHide: true }); zb.on('exit', () => { zb = null; }); zb.on('error', () => { zb = null; }); }
      const b = bw.getNativeWindowHandle(), h = b.length >= 8 ? b.readBigUInt64LE(0) : BigInt(b.readUInt32LE(0));
      zb.stdin.write(h.toString() + '\n');
    } catch {}
  }
  function wgLayer(bw, w) { if (!bw || bw.isDestroyed()) return; const back = w.layer === 'back'; try { bw.setAlwaysOnTop(w.layer === 'top', 'normal'); } catch {} if (back) setTimeout(() => toBack(bw), 50); }
  function wgOpen(w) {
    if (!w.layer) w.layer = w.top ? 'top' : 'back';
    let bw = WG.wins[w.id];
    if (bw && !bw.isDestroyed()) { bw.webContents.send('van:mini', { t: 'cfg', cfg: w }); try { bw.setIgnoreMouseEvents(!!w.through, { forward: true }); } catch {} wgLayer(bw, w); return; }
    const d = scr().getPrimaryDisplay().workArea, n = Object.keys(WG.wins).length;
    if (w.x == null) { w.x = d.x + d.width - (w.w || 260) - 30 - (n % 4) * 30; w.y = d.y + 40 + (n % 6) * 40; }
    bw = new BrowserWindow({ x: w.x, y: w.y, width: w.w || 260, height: w.h || 200, minWidth: 120, minHeight: 80, transparent: true, frame: false, resizable: true, skipTaskbar: true, alwaysOnTop: w.layer === 'top', hasShadow: false, show: false, backgroundColor: '#00000000', title: 'VanMule widget', webPreferences: { preload: path.join(__dirname, 'mini-preload.js'), contextIsolation: true, nodeIntegration: false } });
    bw._kind = w.kind; bw._id = w.id; WG.wins[w.id] = bw;
    bw.loadFile(path.join(__dirname, 'app', 'widget.html'), { query: { id: w.id } });
    bw.once('ready-to-show', () => { bw.showInactive(); bw.webContents.send('van:mini', { t: 'cfg', cfg: w }); if (w.through) bw.setIgnoreMouseEvents(true, { forward: true }); wgLayer(bw, w); });
    bw.on('blur', () => { const x = wgList().find((y) => y.id === w.id); if (x && x.layer === 'back') toBack(bw); });
    const keep = () => { const b = bw.getBounds(), x = wgList().find((y) => y.id === w.id); if (x) { Object.assign(x, { x: b.x, y: b.y, w: b.width, h: b.height }); saveCfg(); } };
    bw.on('moved', keep); bw.on('resized', keep); bw.on('closed', () => { if (WG.wins[w.id] === bw) delete WG.wins[w.id]; });
  }
  app.whenReady().then(() => setTimeout(() => { if (wgList().length) wgSync(); }, 2500));

  /* ================= IPC ================= */
  ipcMain.handle('van:pc', async (_e, a = {}) => {
    try {
      switch (a.op) {
        case 'statsUse': statsUse(a.who || 'page', !!a.on); return snapshot();
        case 'snapshot': return snapshot();
        case 'fpsStart': return await fpsStart();
        case 'fpsAdmin': await fpsElevated(); return { ok: true };
        case 'fpsStop': fpsStop(); pushState(); return { ok: true };
        case 'fpsState': return { state: FPS.state, err: FPS.err, have: isWin && fs.existsSync(pmPath()), version: cfg.pmVersion || '' };
        case 'metrics': { if (a.cfg) { cfg.metrics = Object.assign(mtCfg(), a.cfg); saveCfg(); } if (a.on != null) MT.on = !!a.on; if (a.toggle) MT.on = !MT.on; cfg.metricsOn = MT.on; saveCfg(); mtApply(); if (mtWin && !mtWin.isDestroyed() && a.cfg) { mtWin.setBounds(mtBounds(mtWin.getBounds().width, mtWin.getBounds().height)); } return { on: MT.on, cfg: mtCfg() }; }
        case 'metricsState': return { on: MT.on, cfg: mtCfg() };
        case 'mixer': return await mixCmd('L');
        case 'mixSet': return await mixCmd(a.master ? `M ${a.vol != null ? a.vol : -1} ${a.mute == null ? -1 : a.mute ? 1 : 0}` : `A ${a.pid} ${a.sys ? 1 : 0} ${a.vol != null ? a.vol : -1} ${a.mute == null ? -1 : a.mute ? 1 : 0}`);
        case 'mixerWin': return { open: mxToggle(a.on == null ? null : !!a.on) };
        case 'mxPrefs': { if (a.set) { const old = mxPrefs().size; cfg.mixerPrefs = Object.assign(mxPrefs(), a.set); saveCfg(); if (mxWin && !mxWin.isDestroyed()) { mxWin.webContents.send('van:mini', { t: 'prefs', prefs: mxPrefs() }); if (a.set.size && a.set.size !== old) { const sz = MX_SIZES[a.set.size] || MX_SIZES.normal, b = mxWin.getBounds(); mxWin.setBounds({ x: b.x, y: b.y + b.height - sz.h, width: sz.w, height: sz.h }); } } } return mxPrefs(); }
        case 'display': return await displayCheck();
        case 'openDisplaySettings': shell.openExternal('ms-settings:display-advanced'); return true;
        case 'openSettings': shell.openExternal(a.uri || 'ms-settings:display'); return true;
        case 'build': return await buildInfo();
        case 'widgets': if (a.list) { cfg.widgets = a.list; saveCfg(); } wgSync(); return wgList();
        case 'widgetsGet': return wgList();
      }
      return null;
    } catch (e) { return { error: e.message }; }
  });
  // messages from the small windows (metrics overlay, mixer, widgets)
  ipcMain.handle('van:mini', async (e, a = {}) => {
    const bw = BrowserWindow.fromWebContents(e.sender);
    switch (a.op) {
      case 'tray': return ctx.tray ? ctx.tray(a.act, bw) : null;
      case 'mtSize': if (mtWin && bw === mtWin) { const b = mtBounds(Math.ceil(a.w), Math.ceil(a.h)); mtWin.setBounds(b); } return true;
      case 'mtCfg': return mtCfg();
      case 'mixer': return await mixCmd('L');
      case 'mixSet': return await mixCmd(a.master ? `M ${a.vol != null ? a.vol : -1} ${a.mute == null ? -1 : a.mute ? 1 : 0}` : `A ${a.pid} ${a.sys ? 1 : 0} ${a.vol != null ? a.vol : -1} ${a.mute == null ? -1 : a.mute ? 1 : 0}`);
      case 'mxPrefs': { if (a.set) { const old = mxPrefs().size; cfg.mixerPrefs = Object.assign(mxPrefs(), a.set); saveCfg(); if (bw === mxWin && a.set.size && a.set.size !== old) { const sz = MX_SIZES[a.set.size] || MX_SIZES.normal, b = mxWin.getBounds(); mxWin.setBounds({ x: b.x, y: b.y + b.height - sz.h, width: sz.w, height: sz.h }); } toMain('van:pc', { t: 'mxprefs', prefs: mxPrefs() }); } return mxPrefs(); }
      case 'close': if (bw === mxWin) mxToggle(false); else if (bw) bw.hide(); return true;
      case 'wgCfg': return wgList().find((w) => w.id === a.id) || null;
      case 'wgSave': { const x = wgList().find((w) => w.id === a.id); if (x) { Object.assign(x, a.patch || {}); saveCfg(); toMain('van:pc', { t: 'widgets', list: wgList() }); if (a.patch && ('layer' in a.patch || 'top' in a.patch || 'through' in a.patch) && bw) { if ('top' in a.patch && !('layer' in a.patch)) x.layer = x.top ? 'top' : (x.layer === 'top' ? 'normal' : x.layer); try { bw.setIgnoreMouseEvents(!!x.through, { forward: true }); } catch {} wgLayer(bw, x); } } return x || null; }
      case 'wgRemove': cfg.widgets = wgList().filter((w) => w.id !== a.id); saveCfg(); wgSync(); toMain('van:pc', { t: 'widgets', list: wgList() }); return true;
      case 'weather': return ctx.weather ? await ctx.weather(a) : null;
      case 'quote': return ctx.quote ? await ctx.quote(a.symbol) : null;
      case 'geo': return ctx.geo ? await ctx.geo(a.q) : null;
      case 'pickImage': { const { dialog } = require('electron'); const r = await dialog.showOpenDialog(bw, { filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }], properties: ['openFile'] }); if (r.canceled || !r.filePaths[0]) return null; const f = r.filePaths[0], buf = fs.readFileSync(f); if (buf.length > 8e6) throw new Error('Pick a picture under 8 MB'); const dst = path.join(userDir(), 'widget-pics'); fs.mkdirSync(dst, { recursive: true }); const out = path.join(dst, a.id + path.extname(f).toLowerCase()); fs.writeFileSync(out, buf); return 'file:///' + out.replace(/\\/g, '/') + '?t=' + Date.now(); }
      case 'stats': statsUse('widget', true); return snapshot();
      case 'events': return ctx.events ? ctx.events() : [];
      case 'openMain': { const w = mainWin(); if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); w.webContents.send('van:pc', { t: 'goto', view: a.view || 'widgets' }); } return true; }
    }
    return null;
  });

  // restore the overlay after a restart
  app.whenReady().then(() => { if (cfg.metricsOn) setTimeout(() => { MT.on = true; mtApply(); }, 3000); });
  app.on('will-quit', () => { if (zb) { try { zb.kill(); } catch {} } statsStop(); fpsStop(); if (MX.proc) { try { MX.proc.kill(); } catch {} } });

  return { metricsToggle: () => { MT.on = !MT.on; cfg.metricsOn = MT.on; saveCfg(); mtApply(); toMain('van:pc', { t: 'mtstate', on: MT.on }); return MT.on; }, mixerToggle: () => mxToggle(null), snapshot };
};
