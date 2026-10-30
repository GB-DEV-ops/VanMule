'use strict';
// VanMule AI voice engine. Runs in an Electron utility process.
// Talks to the main process (commands, status events) and directly to the audio worklet (audio in/out) over a MessagePort.
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const dsp = require('./dsp');
const pth = require('./pth');
const faiss = require('./faiss');

let ort = null, ortError = '';
try { ort = require('onnxruntime-node'); } catch (e) { ortError = e.message; }

const send = (m) => { try { process.parentPort.postMessage(m); } catch {} };
let LOGF = '';
const log = (...a) => { const msg = a.join(' '); send({ type: 'log', msg }); if (LOGF) { try { fs.appendFileSync(LOGF, new Date().toISOString() + ' ' + msg + '\n'); } catch {} } };

let DIRS = null, TEMPLATES = '';
const BASE = {
  hubert: { file: 'hubert.onnx', label: 'Speech encoder', urls: ['https://huggingface.co/MidFord327/Hubert-Base-ONNX/resolve/main/hubert_base.onnx', 'https://huggingface.co/Kilvoctu/rvc/resolve/main/hubert_v2.onnx'], approx: 378e6 },
  rmvpe: { file: 'rmvpe.onnx', label: 'Pitch tracker', urls: ['https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.onnx', 'https://huggingface.co/Kilvoctu/rvc/resolve/main/rmvpe_model.onnx'], approx: 362e6 }
};

/* ---------------- settings ---------------- */
const P = { pitch: 0, blockSec: 0.25, extraSec: 1.0, f0: 'rmvpe', gateDb: -50, indexRate: 0.5, protect: 0.33 };
// Optional fast pitch tracker (FCPE, 48 MB, MIT): the mel front end is inside the graph, so it costs less processor time than RMVPE too.
const FCPE = { file: 'fcpe.onnx', label: 'Fast pitch tracker', urls: ['https://huggingface.co/Scicom-intl/fcpe-onnx/resolve/main/fcpe.onnx'], approx: 48e6 };
const fcpeReady = () => { try { return fs.statSync(path.join(DIRS.base, FCPE.file)).size > (process.env.VAN_TEST ? 1 : 10e6); } catch { return false; } };

/* ---------------- files ---------------- */
function baseReady() { return Object.values(BASE).every((b) => { try { return fs.statSync(path.join(DIRS.base, b.file)).size > (process.env.VAN_TEST ? 1 : 10e6); } catch { return false; } }); }
function listVoices() {
  let ids = []; try { ids = fs.readdirSync(DIRS.voices); } catch {}
  const out = [];
  for (const id of ids) { try { const m = JSON.parse(fs.readFileSync(path.join(DIRS.voices, id, 'meta.json'), 'utf8')); out.push(m); } catch {} }
  return out.sort((a, b) => (a.created || 0) - (b.created || 0));
}
function status() {
  return { type: 'status', ortOk: !!ort, ortError, base: baseReady(), fcpe: DIRS ? fcpeReady() : false, voices: listVoices(), voicesDir: DIRS ? DIRS.voices : '', device, loaded: cur ? cur.id : null, params: P, busy, counters: { ...stats, port: !!port, running } };
}

function download(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    const host = (() => { try { return new URL(url).host; } catch { return ''; } })();
    log('GET', url);
    const req = https.get(url, { headers: { 'User-Agent': 'VanMule' } }, (res) => {
      log('HTTP', res.statusCode, host);
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects > 8) return reject(new Error('Too many redirects'));
        return resolve(download(new URL(res.headers.location, url).toString(), dest, onProgress, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('Download failed (HTTP ' + res.statusCode + ')')); }
      const total = Number(res.headers['content-length']) || 0; let got = 0, last = 0;
      const tmp = dest + '.part', out = fs.createWriteStream(tmp);
      let stall = setTimeout(() => req.destroy(new Error('The download stopped responding')), 45000);
      res.on('data', (c) => { got += c.length; clearTimeout(stall); stall = setTimeout(() => req.destroy(new Error('The download stopped responding')), 45000); const now = Date.now(); if (now - last > 250) { last = now; onProgress(got, total); } });
      res.on('end', () => clearTimeout(stall)); res.on('close', () => clearTimeout(stall));
      res.pipe(out);
      out.on('finish', () => { out.close(() => { if (total && got !== total) return reject(new Error('Download was cut off')); fs.renameSync(tmp, dest); onProgress(got, total || got); resolve(); }); });
      res.on('error', reject); out.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Could not reach ' + host + '. Check your internet connection, firewall or antivirus.')));
  });
}
async function downloadBase() {
  fs.mkdirSync(DIRS.base, { recursive: true });
  const keys = Object.keys(BASE);
  for (let i = 0; i < keys.length; i++) {
    const b = BASE[keys[i]], dest = path.join(DIRS.base, b.file);
    try { if (fs.statSync(dest).size > 10e6) continue; } catch {}
    let lastErr = null;
    for (const url of b.urls) {
      try {
        send({ type: 'progress', part: i + 1, parts: keys.length, label: b.label, got: 0, total: b.approx, connecting: new URL(url).host });
        await download(url, dest, (got, total) => send({ type: 'progress', part: i + 1, parts: keys.length, label: b.label, got, total: total || b.approx }));
        lastErr = null; break;
      } catch (e) { lastErr = e; log('download failed', url, e.message); }
    }
    if (lastErr) throw new Error(b.label + ' download failed: ' + lastErr.message);
  }
}

/* ---------------- ONNX sessions ---------------- */
let device = null, sHubert = null, sRmvpe = null, sFcpe = null, cur = null, busy = '';
const DML_OPTS = { graphOptimizationLevel: 'all', enableMemPattern: false, executionMode: 'sequential' };
const cpuSession = (file) => ort.InferenceSession.create(file, { graphOptimizationLevel: 'all', executionProviders: ['cpu'], intraOpNumThreads: 0 });
async function createSession(file, preferCpu) {
  if (process.env.VAN_FAKE_GPU_FAIL && /hubert/.test(file)) { const c = await cpuSession(file); const real = c.run.bind(c); let fails = Number(process.env.VAN_FAKE_GPU_FAIL); c.run = async (f) => { if (fails-- > 0 || process.env.VAN_FAKE_GPU_ALWAYS) throw new Error('Non-zero status code returned while running Where node. DmlExecutionProvider 80070057 The parameter is incorrect.'); return real(f); }; c._file = file; c._dev = 'gpu'; device = 'gpu'; return c; }
  if (!preferCpu && process.env.VAN_FORCE_CPU !== '1') {
    try { const s = await ort.InferenceSession.create(file, { ...DML_OPTS, executionProviders: ['dml'] }); s._file = file; s._dev = 'gpu'; device = 'gpu'; return s; }
    catch (e) { log('GPU session failed for', path.basename(file), '- using CPU:', e.message); }
  }
  const s = await cpuSession(file); s._file = file; s._dev = 'cpu'; if (device !== 'gpu') device = 'cpu'; return s;
}
// Run a session; if the graphics card can't run this model, switch that model to the processor and retry once.
async function runWithFallback(get, set, feedsFn, label, noFallback) {
  const s = get();
  try { return await s.run(feedsFn(s)); }
  catch (e) {
    log(label, 'failed on', s._dev, ':', e.message);
    if (noFallback && noFallback(e)) throw e;
    if (s._dev !== 'gpu') throw new Error(label + ': ' + e.message);
    const c = await cpuSession(s._file); c._file = s._file; c._dev = 'cpu'; set(c);
    log(label, 'switched to processor');
    try { return await c.run(feedsFn(c)); } catch (e2) { log(label, 'failed on cpu too:', e2.message); throw new Error(label + ': ' + e2.message); }
  }
}
const meta = (s, name, isInput) => { const m = isInput ? s.inputMetadata : s.outputMetadata; if (!m) return null; return Array.isArray(m) ? m.find((x) => x.name === name) : m[name]; };

async function ensureBase() {
  if (!ort) throw new Error('The AI engine could not start: ' + ortError);
  if (!baseReady()) throw new Error('NEED_DOWNLOAD');
  if (!sHubert) { sHubert = await createSession(path.join(DIRS.base, BASE.hubert.file)); log('hubert inputs', JSON.stringify(sHubert.inputMetadata || sHubert.inputNames), 'on', sHubert._dev); }
  if (!sRmvpe && P.f0 === 'rmvpe') { try { sRmvpe = await createSession(path.join(DIRS.base, BASE.rmvpe.file)); } catch (e) { log('RMVPE failed, using built-in pitch tracker:', e.message); P.f0 = 'yin'; } }
  if (P.f0 === 'fcpe') await ensureFcpe();
}
async function ensureFcpe() {
  if (sFcpe) return true;
  if (!fcpeReady()) { log('fast pitch tracker not downloaded yet, using built-in'); P.f0 = 'yin'; send({ type: 'f0', f0: P.f0, reason: 'NEED_FCPE' }); return false; }
  try { sFcpe = await createSession(path.join(DIRS.base, FCPE.file)); log('fcpe inputs', JSON.stringify(sFcpe.inputNames), 'on', sFcpe._dev); return true; }
  catch (e) { log('FCPE failed, using built-in pitch tracker:', e.message); P.f0 = 'yin'; send({ type: 'f0', f0: P.f0, reason: e.message }); return false; }
}

function inputRank(sess, name, fallback) {
  const m = meta(sess, name, true);
  return m && Array.isArray(m.shape) && m.shape.length ? m.shape.length : fallback;
}
const isMaskInput = (sess, n) => { const m = meta(sess, n, true); return /mask/i.test(n) || !!(m && /bool/.test(String(m.type))); };
function hubertFeeds(sess, wav, maskLen, padTo) {
  if (padTo && padTo > wav.length) { const w = new Float32Array(padTo); w.set(wav); wav = w; }
  const feeds = {};
  for (const n of sess.inputNames) {
    if (isMaskInput(sess, n)) { const ml = maskLen || wav.length; feeds[n] = new ort.Tensor('bool', new Uint8Array(ml), [1, ml]); continue; }
    const rank = inputRank(sess, n, 2);
    feeds[n] = new ort.Tensor('float32', wav, rank === 3 ? [1, 1, wav.length] : [1, wav.length]);
  }
  return feeds;
}
// Some encoder exports size their padding mask differently from the audio frames.
// Try mask lengths that line up with the encoder's frame count and remember the one that works.
const maskCache = new Map();
const isShapeErr = (e) => /broadcast|by a dimension|Where node|dimension mismatch|incompatible dimensions|shape/i.test(String(e && e.message));
function maskCandidates(L) {
  const Tf = Math.floor((L - 400) / 320) + 1, c = [Tf * 320, L, (Tf - 1) * 320 + 400, (Tf - 1) * 320 + 1, Tf * 320 + 160, (Tf + 1) * 320, (Tf - 1) * 320, L - 320, L + 320, Tf * 320 - 1];
  return [...new Set(c.filter((x) => x > 0))];
}
// Some encoder exports need the audio and mask at particular lengths.
// Search audio padding x mask length on the processor (whose errors are exact), remember the combination that works.
function layoutCandidates(L, hasMask) {
  const out = [], seen = new Set();
  const add = (pad, ml) => { const k = pad + ':' + ml; if (!seen.has(k)) { seen.add(k); out.push({ pad, ml }); } };
  for (let d = 0; d <= 1280; d += 80) {
    const P = L + d, Tf = Math.floor((P - 400) / 320) + 1;
    if (!hasMask) { add(P, 0); continue; }
    for (const ml of [P, Tf * 320, (Tf - 1) * 320 + 400, (Tf + 1) * 320, (Tf - 1) * 320]) add(P, ml);
  }
  return out;
}
async function tryLayouts(sess, wav, cands, quietLimit) {
  let last = null, n = 0;
  for (const c of cands) {
    try { const r = await sess.run(hubertFeeds(sess, wav, c.ml, c.pad)); return { r, ...c }; }
    catch (e) { last = e; if (n++ < (quietLimit || 6)) log('encoder try', sess._dev, 'audio', c.pad, 'mask', c.ml, '->', (String(e.message).match(/(\d+ by \d+)|Invalid[^.]*|parameter is incorrect/) || [String(e.message).slice(0, 120)])[0]); }
  }
  throw last;
}
let encoderBad = false;
async function runHubert(wav) {
  const L = wav.length, hasMask = sHubert.inputNames.some((n) => isMaskInput(sHubert, n));
  let res;
  const cached = maskCache.get(L);
  try { res = await tryLayouts(sHubert, wav, cached ? [cached] : [{ pad: L, ml: hasMask ? L : 0 }]); }
  catch (e) {
    if (encoderBad) throw new Error('ENCODER_INCOMPATIBLE');
    const prev = sHubert;
    let cpu = prev;
    if (prev._dev === 'gpu') { cpu = await cpuSession(prev._file); cpu._file = prev._file; cpu._dev = 'cpu'; }
    log('searching encoder layout for audio', L);
    try { res = await tryLayouts(cpu, wav, layoutCandidates(L, hasMask), 12); }
    catch (e2) { encoderBad = true; log('no working encoder layout:', e2.message); throw new Error('ENCODER_INCOMPATIBLE'); }
    if (prev._dev === 'gpu') {
      try { res.r = await prev.run(hubertFeeds(prev, wav, res.ml, res.pad)); sHubert = prev; log('encoder works on gpu with audio', res.pad, 'mask', res.ml); }
      catch (e3) { sHubert = cpu; log('encoder stays on processor:', String(e3.message).slice(0, 160)); }
    } else sHubert = cpu;
  }
  if (!maskCache.has(L)) { maskCache.set(L, { pad: res.pad, ml: res.ml }); log('encoder layout audio', res.pad, 'mask', res.ml, 'for', L, 'on', sHubert._dev); }
  const r = res.r;
  const t = r[sHubert.outputNames[0]], d = t.dims;
  if (d[d.length - 1] === 768) return { data: t.data, T: d[d.length - 2], transposed: false };
  return { data: t.data, T: d[d.length - 1], transposed: true };
}
async function runRmvpe(wav) {
  const mel = dsp.logMel(wav);
  const r = await runWithFallback(() => sRmvpe, (x) => { sRmvpe = x; }, (sess) => {
    const n = sess.inputNames[0], rank = inputRank(sess, n, 3);
    return { [n]: new ort.Tensor('float32', mel.data, rank === 4 ? [1, 1, 128, mel.padded] : [1, 128, mel.padded]) };
  }, 'Pitch tracker');
  const out = r[sRmvpe.outputNames[0]];
  return dsp.rmvpeDecode(out.data, mel.frames);
}

async function runFcpe(wav) {
  const r = await runWithFallback(() => sFcpe, (x) => { sFcpe = x; }, (sess) => ({ [sess.inputNames[0]]: new ort.Tensor('float32', wav, [1, wav.length]) }), 'Fast pitch tracker');
  const out = r[sFcpe.outputNames[0]], T = out.dims[out.dims.length - 2] || Math.floor(wav.length / 160) + 1;
  return dsp.fcpeDecode(out.data, T);
}

/* ---------------- voices ---------------- */
// Quick check of an RVC .index file: the usual faiss IVF-Flat type, 768-dim (RVC v2), with data in it.
function indexProblem(head) {
  if (!head || head.length < 16) return 'The .index file is empty.';
  const tag = head.toString('latin1', 0, 4);
  if (tag !== 'IwFl') return 'This .index file is a type VanMule can\'t read.';
  const d = head.readInt32LE(4), n = Number(head.readBigInt64LE(8));
  if (d === 256) return 'This .index file is for an RVC v1 model.';
  if (d !== 768) return 'This .index file doesn\'t match RVC v2 voices.';
  if (n <= 0) return 'This .index file has no data in it (use the "added_" one, not "trained_").';
  return '';
}
function fileHead(f, n = 64) { const fd = fs.openSync(f, 'r'); try { const b = Buffer.alloc(n); const r = fs.readSync(fd, b, 0, n, 0); return b.subarray(0, r); } finally { fs.closeSync(fd); } }
function bestIndex(files) {
  // Prefer RVC's "added_…" file; skip "trained_…" files, which hold no voice data.
  const ok = files.filter((f) => !/(^|[\\/])trained_/i.test(f)).map((f) => { let sz = 0; try { sz = fs.statSync(f).size; } catch {} return { f, sz }; })
    .filter((x) => x.sz > 1e5 && x.sz < 1.2e9).filter((x) => { try { return !indexProblem(fileHead(x.f)); } catch { return false; } });
  ok.sort((a, b) => (/added_/i.test(path.basename(b.f)) - /added_/i.test(path.basename(a.f))) || b.sz - a.sz);
  return ok.length ? ok[0].f : null;
}
function attachIndex(id, file, buf) {
  const dir = path.join(DIRS.voices, id), dest = path.join(dir, 'model.index');
  const prob = indexProblem(buf ? buf.subarray(0, 64) : fileHead(file));
  if (prob) throw new Error(prob);
  if (buf) fs.writeFileSync(dest, buf); else fs.copyFileSync(file, dest);
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); m.index = true; writeMeta(m);
  if (cur && cur.id === id) { try { cur.index = faiss.loadIndex(dest); } catch (e) { log('index not used:', e.message); } }
  return m;
}
let lastId = 0;
function newId() { let t = Date.now(); if (t <= lastId) t = lastId + 1; lastId = t; return 'v' + t.toString(36); }
const IMG_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
async function importVoice(file, name, opts = {}) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.zip') return importZip(file, name, opts);
  const id = newId();
  const dir = path.join(DIRS.voices, id);
  fs.mkdirSync(dir, { recursive: true });
  let info = {};
  try {
    if (ext === '.pth') info = pth.convertPth(file, dir, TEMPLATES);
    else if (ext === '.onnx') { fs.copyFileSync(file, path.join(dir, 'model.onnx')); const data = file + '.data'; if (fs.existsSync(data)) fs.copyFileSync(data, path.join(dir, path.basename(data))); }
    else throw new Error('Pick a .pth or .onnx RVC voice model.');
  } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  const m = { id, name: (name || cleanName(path.basename(file))).slice(0, 40), sr: info.sr || 0, source: ext.slice(1), created: Date.now(), pitch: 0 };
  if (opts.src) { m.src = opts.src; m.srcSize = opts.srcSize; }
  // A picture next to the model (or inside its zip) becomes the voice's picture.
  try {
    if (opts.imageBuf) { fs.writeFileSync(path.join(dir, 'avatar' + opts.imageExt), opts.imageBuf); m.image = 'avatar' + opts.imageExt; }
    else if (opts.image) { const ie = path.extname(opts.image).toLowerCase(); fs.copyFileSync(opts.image, path.join(dir, 'avatar' + ie)); m.image = 'avatar' + ie; }
  } catch {}
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(m, null, 2));
  if (opts.index || opts.indexBuf) { try { return attachIndex(id, opts.index, opts.indexBuf); } catch (e) { log('index skipped for', m.name + ':', e.message); } }
  return m;
}
const isCheckpoint = (n) => /(^|\/)(D|G)_\d+\.pth$/i.test(n) || /(^|\/)(hubert|rmvpe|f0[GD]|pretrained)/i.test(n);
async function importZip(file, name, opts) {
  const size = fs.statSync(file).size;
  if (size > 1.5e9) throw new Error('That zip is too large to open. Unzip it and import the .pth inside.');
  const z = pth.readZip(fs.readFileSync(file));
  const pths = z.names.filter((n) => /\.pth$/i.test(n) && !isCheckpoint(n) && !/__MACOSX/.test(n));
  if (!pths.length) throw new Error('No RVC voice model (.pth) was found inside ' + path.basename(file) + '.');
  let best = null, bestBuf = null;
  for (const n of pths) { const b = z.get(n); if (b && (!bestBuf || b.length > bestBuf.length)) { best = n; bestBuf = b; } }
  const tmp = path.join(os.tmpdir(), 'vanmule-' + Date.now() + '.pth');
  fs.writeFileSync(tmp, bestBuf);
  const img = z.names.find((n) => IMG_EXT.includes(path.extname(n).toLowerCase()) && !/__MACOSX/.test(n));
  const o = { ...opts };
  if (!o.index) {
    const ixs = z.names.filter((n) => /\.index$/i.test(n) && !/__MACOSX/.test(n) && !/(^|\/)trained_/i.test(n));
    ixs.sort((a, b) => /added_/i.test(b) - /added_/i.test(a));
    for (const n of ixs) { try { const b = z.get(n); if (b && !indexProblem(b.subarray(0, 64))) { o.indexBuf = b; break; } } catch {} }
  }
  if (img && !o.image) { try { const b = z.get(img); if (b && b.length < 25e6) { o.imageBuf = b; o.imageExt = path.extname(img).toLowerCase(); } } catch {} }
  try { return await importVoice(tmp, name || pickName(file), o); }
  finally { try { fs.unlinkSync(tmp); } catch {} }
}

/* ---------- bulk import: find every model in a folder and its subfolders ---------- */
function decodeName(s) { try { return decodeURIComponent(s); } catch { return s.replace(/%20/g, ' ').replace(/%28/gi, '(').replace(/%29/gi, ')'); } }
function cleanName(raw) {
  let t = decodeName(raw).replace(/\.(pth|zip|onnx)$/i, '').replace(/[_+]+/g, ' ');
  t = t.replace(/[(\[]\s*(rvc[^)\]]*|v2|from [^)\]]*)[)\]]?/gi, ' ')
    .replace(/\b(rvc\s*v?2?|v2)\b/gi, ' ')
    .replace(/\b(\d+|unknown)\s*(epochs?|steps?|ep)\b/gi, ' ')
    .replace(/\b\d+(\.\d+)?\s*k\b/gi, ' ')
    .replace(/\b[es]\d{2,}\b/gi, ' ')
    .replace(/[\s\-–.,]+$/g, '').replace(/^[\s\-–.,]+/g, '').replace(/\s{2,}/g, ' ').trim();
  if (!/[a-z]/i.test(t)) t = decodeName(raw).replace(/\.(pth|zip|onnx)$/i, '').trim();
  if (!/\s/.test(t)) t = t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'); // KanyeWest → Kanye West
  if (t === t.toLowerCase()) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.slice(0, 40);
}
const GENERIC_DIR = /^(weights?|models?|voices?|files?|output|out|logs?|unzipped|extracted|rvc|pth)$/i;
const GENERIC = /^(model|weights?|voice|final|latest|best|added|output|out|\d+)$/i;
function pickName(file) {
  const base = cleanName(path.basename(file));
  // Skip generic folders like "weights" or "model" and use the folder above them.
  let d = path.dirname(file), folder = cleanName(path.basename(d));
  for (let k = 0; k < 2 && GENERIC_DIR.test(folder.replace(/\s+/g, '')); k++) { d = path.dirname(d); folder = cleanName(path.basename(d)); }
  if (path.extname(file).toLowerCase() === '.zip') return base;
  if (!base || base.length < 3 || GENERIC.test(base.replace(/\s+/g, ''))) return folder || base;
  const squash = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (folder && squash(folder) === squash(base)) return folder; // "LilWayne.pth" in "Lil Wayne (RVC)" → "Lil Wayne"
  return base;
}
// Voices imported before .index support: pick up the .index next to the file they came from.
function attachMissingIndexes() {
  let n = 0;
  for (const v of listVoices()) {
    if (v.index || !v.src || fs.existsSync(path.join(DIRS.voices, v.id, 'model.index'))) continue;
    try {
      if (/\.zip$/i.test(v.src)) {
        if (!fs.existsSync(v.src) || fs.statSync(v.src).size > 1.5e9) continue;
        const z = pth.readZip(fs.readFileSync(v.src));
        const ixs = z.names.filter((x) => /\.index$/i.test(x) && !/__MACOSX/.test(x) && !/(^|\/)trained_/i.test(x)).sort((a, b) => /added_/i.test(b) - /added_/i.test(a));
        for (const x of ixs) { const b = z.get(x); if (b && !indexProblem(b.subarray(0, 64))) { attachIndex(v.id, null, b); n++; break; } }
      } else {
        const d = path.dirname(v.src); let ents; try { ents = fs.readdirSync(d); } catch { continue; }
        if (ents.filter((e) => /\.pth$/i.test(e) && !isCheckpoint(e)).length !== 1) continue;
        const best = bestIndex(ents.filter((e) => /\.index$/i.test(e)).map((e) => path.join(d, e)));
        if (best) { attachIndex(v.id, best); n++; }
      }
    } catch (e) { log('could not add index for', v.name + ':', e.message); }
  }
  return n;
}
function scanFolder(root) {
  const voices = listVoices();
  const srcs = new Set(voices.map((v) => v.src).filter(Boolean).map((s) => s.toLowerCase()));
  const names = new Set(voices.map((v) => String(v.name).toLowerCase()));
  const found = []; let dirs = 0;
  const walk = (d, depth) => {
    if (depth > 10 || dirs++ > 20000) return;
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    if (ents.some((e) => e.name === 'meta.json') && ents.some((e) => e.name === 'model.onnx')) return; // already a VanMule voice
    const models = [], imgs = [], idxs = [];
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/^(\.|\$|node_modules$|System Volume Information$)/i.test(e.name)) walk(p, depth + 1); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (IMG_EXT.includes(ext)) { imgs.push(p); continue; }
      if (ext === '.index') { idxs.push(p); continue; }
      if (ext !== '.pth' && ext !== '.zip') continue;
      if (isCheckpoint(e.name)) continue;
      let size = 0; try { size = fs.statSync(p).size; } catch { continue; }
      if (size < 3e6 || size > (ext === '.pth' ? 400e6 : 1.5e9)) continue;
      models.push({ path: p, size, ext: ext.slice(1) });
    }
    const pthCount = models.filter((m) => m.ext === 'pth').length;
    for (const m of models) {
      m.name = pickName(m.path);
      if (pthCount === 1 && m.ext === 'pth' && idxs.length) m.index = bestIndex(idxs) || undefined;
      if (m.index) { try { m.indexSize = fs.statSync(m.index).size; } catch {} }
      if (pthCount === 1 && m.ext === 'pth' && imgs.length) m.image = imgs.find((i) => cleanName(path.basename(i)).toLowerCase() === m.name.toLowerCase()) || imgs[0];
      m.dup = srcs.has(m.path.toLowerCase()) || names.has(m.name.toLowerCase());
      found.push(m);
    }
  };
  walk(root, 0);
  // A zip that was already unzipped next to its .pth would be a duplicate.
  const pthNames = new Set(found.filter((f) => f.ext === 'pth').map((f) => f.name.toLowerCase()));
  const seen = new Set();
  return found.filter((f) => {
    if (f.ext === 'zip' && pthNames.has(f.name.toLowerCase())) return false;
    const k = f.name.toLowerCase() + '|' + f.size; if (seen.has(k)) return false; seen.add(k); return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
}
let bulkStop = false;
async function importMany(items) {
  bulkStop = false;
  const done = [], failed = [];
  for (let i = 0; i < items.length; i++) {
    if (bulkStop) break;
    const it = items[i];
    if (!it.name) it.name = pickName(it.path);
    send({ type: 'bulk', i, n: items.length, name: it.name });
    await new Promise((r) => setImmediate(r)); // let a Stop message through
    try {
      const v = await importVoice(it.path, it.name, { src: it.path, srcSize: it.size, image: it.image, index: it.index });
      done.push(v.name); log('bulk imported', it.path);
    } catch (e) { failed.push({ name: it.name, msg: e.message }); log('bulk import failed', it.path, e.message); }
    if (i % 5 === 4) send(status());
  }
  return { done, failed, stopped: bulkStop };
}
function writeMeta(m) { fs.writeFileSync(path.join(DIRS.voices, m.id, 'meta.json'), JSON.stringify(m, null, 2)); }

async function loadVoice(id) {
  await ensureBase();
  if (cur && cur.id === id) return cur;
  const m = listVoices().find((v) => v.id === id); if (!m) throw new Error('That voice was not found.');
  if (cur && cur.session) { try { await cur.session.release(); } catch {} }
  cur = null;
  const session = await createSession(path.join(DIRS.voices, id, 'model.onnx'));
  const names = session.inputNames;
  const v = { id, meta: m, session, names, sr: m.sr || 0, dim: 768, index: null };
  const ixf = path.join(DIRS.voices, id, 'model.index');
  if (fs.existsSync(ixf)) { try { const t = Date.now(); v.index = faiss.loadIndex(ixf); log('index loaded', v.index.ntotal, 'rows,', v.index.nlist, 'lists,', Date.now() - t, 'ms'); } catch (e) { log('index not used:', e.message); } }
  const pm = meta(session, names[0], true);
  if (pm && pm.shape && pm.shape[2] === 256) throw new Error('This is an RVC v1 model. VanMule supports RVC v2 models.');
  // Warm up and detect the output sample rate.
  const T = 100, out = await synth(v, new Float32Array(T * 768), new Float32Array(T).fill(150));
  if (!v.sr) { v.sr = Math.round(out.length / T * 100); m.sr = v.sr; writeMeta(m); }
  cur = v; resetStream();
  return v;
}
function f0Coarse(f0) {
  const mn = 1127 * Math.log(1 + 50 / 700), mx = 1127 * Math.log(1 + 1100 / 700), c = new BigInt64Array(f0.length);
  for (let i = 0; i < f0.length; i++) { let m = 1127 * Math.log(1 + f0[i] / 700); if (m > 0) m = (m - mn) * 254 / (mx - mn) + 1; if (m <= 1) m = 1; if (m > 255) m = 255; c[i] = BigInt(Math.round(m)); }
  return c;
}
async function synth(v, feats, f0, noise) {
  const T = f0.length, s = v.session, n = v.names;
  const feeds = {
    [n[0]]: new ort.Tensor('float32', feats, [1, T, 768]),
    [n[1]]: new ort.Tensor('int64', BigInt64Array.from([BigInt(T)]), [1]),
    [n[2]]: new ort.Tensor('int64', f0Coarse(f0), [1, T]),
    [n[3]]: new ort.Tensor('float32', f0, [1, T]),
    [n[4]]: new ort.Tensor('int64', BigInt64Array.from([0n]), [1]),
    [n[5]]: new ort.Tensor('float32', noise || dsp.randn(192 * T), [1, 192, T])
  };
  const r = await s.run(feeds);
  return r[s.outputNames[0]].data;
}

/* ---------------- real-time streaming ---------------- */
let port = null, outSr = 48000;
let inQ = [], inQLen = 0;           // incoming 16 kHz audio not yet processed
let buf16 = null;                   // sliding analysis window (16 kHz)
let pitchCache = null;              // f0 per 10 ms frame across the window
let noiseCache = null;              // persistent noise per frame for stable output
let lastPumpErr = 0;
let solaBuf = null, running = false, stats = { ms: 0, blocks: 0, inSamples: 0, outBlocks: 0, quiet: 0 };
const L = () => {
  const B = Math.max(1, Math.round(P.blockSec * 50)) * 320, E = Math.max(1, Math.round(P.extraSec * 50)) * 320, C = 800, S = 160;
  return { B, E, C, S, N: E + B + C + S };
};
function resetStream() {
  const { N } = L();
  buf16 = new Float32Array(N); pitchCache = new Float32Array(N / 160); noiseCache = dsp.randn(192 * (N / 160));
  solaBuf = null; inQ = []; inQLen = 0;
}
function onAudio(data) {
  stats.inSamples += data.length;
  if (!cur || !buf16) return;
  inQ.push(data); inQLen += data.length;
  const { B } = L();
  // If we fall far behind, drop old audio to keep the delay low.
  while (inQLen > B * 3) { const d = inQ.shift(); inQLen -= d.length; }
  if (!running && inQLen >= B) pump();
}
function takeIn(n) {
  const out = new Float32Array(n); let o = 0;
  while (o < n && inQ.length) { const d = inQ[0], k = Math.min(n - o, d.length); out.set(d.subarray(0, k), o); o += k; if (k === d.length) inQ.shift(); else inQ[0] = d.subarray(k); }
  inQLen -= n; return out;
}
async function pump() {
  running = true;
  try {
    while (cur && inQLen >= L().B) {
      const { B, C, S, N } = L();
      const block = takeIn(B);
      buf16.copyWithin(0, B); buf16.set(block, N - B);
      const shift = B / 160, frames = N / 160;
      pitchCache.copyWithin(0, shift);
      const nz = noiseCache; nz.copyWithin(0, shift * 192); nz.set(dsp.randn(shift * 192), (frames - shift) * 192);
      const t0 = Date.now();
      let out;
      const quiet = dsp.rms(buf16, N - B - C - S, N) < Math.pow(10, P.gateDb / 20);
      if (quiet) { stats.quiet++; pitchCache.fill(0, frames - shift); out = new Float32Array(Math.round((B + C + S) / 16000 * outSr)); }
      else out = await inferBlock(B, C, S, N);
      stats.ms = Date.now() - t0; stats.blocks++;
      const finalOut = sola(out, Math.round(B / 16000 * outSr), Math.round(C / 16000 * outSr), Math.round(S / 16000 * outSr));
      if (port) { port.postMessage({ t: 'out', d: finalOut, prime: Math.round(B / 16000 * outSr * 1.25) }); stats.outBlocks++; }
      if (stats.blocks % 10 === 0) send({ type: 'stats', ms: stats.ms, blockMs: Math.round(B / 16), device, encoder: sHubert ? sHubert._dev : device });
    }
  } catch (e) { const now = Date.now(); if (e.message === 'ENCODER_INCOMPATIBLE') { if (now - lastPumpErr > 30000) { lastPumpErr = now; send({ type: 'error', msg: 'ENCODER_INCOMPATIBLE' }); } } else if (now - lastPumpErr > 5000) { lastPumpErr = now; send({ type: 'error', msg: 'AI voice stopped: ' + e.message }); } log(e.stack); }
  running = false;
}
async function inferBlock(B, C, S, N) {
  const v = cur, frames = N / 160;
  // 1) pitch for the newest audio only, cached for older frames (as RVC's real-time mode does)
  let seg = B + 800; if (P.f0 === 'rmvpe') seg = 5120 * Math.floor((seg - 1) / 5120 + 1) - 160;
  seg = Math.min(seg, N);
  const wav = buf16.subarray(N - seg), nF = Math.floor(seg / 160) + 1;
  const h = await runHubert(buf16);
  let f0 = P.f0 === 'rmvpe' && sRmvpe ? await runRmvpe(wav) : P.f0 === 'fcpe' && sFcpe ? await runFcpe(wav) : dsp.yin(wav, nF);
  if (f0.length < nF) { const z = new Float32Array(nF); z.set(f0, nF - f0.length); f0 = z; } else if (f0.length > nF) f0 = f0.subarray(f0.length - nF);
  const k = Math.pow(2, P.pitch / 12);
  let fresh = f0.subarray(3, f0.length - 1);
  if (fresh.length > frames) fresh = fresh.subarray(fresh.length - frames);
  pitchCache.set(fresh.map((x) => x * k), frames - fresh.length);
  // 2) content features (50 fps), optionally pulled toward the voice's .index, then -> 100 fps
  const Th = h.T, half = frames / 2;
  const rows = new Float32Array(half * 768);
  for (let i = 0; i < half; i++) {
    const src = Math.min(i, Th - 1);
    if (h.transposed) for (let c = 0; c < 768; c++) rows[i * 768 + c] = h.data[c * Th + src];
    else rows.set(h.data.subarray(src * 768, src * 768 + 768), i * 768);
  }
  let blended = null, from = half;
  if (v.index && P.indexRate > 0) {
    // Only the newest frames reach the output, so only those are searched.
    from = Math.max(0, half - Math.ceil((B + C + S) / 320) - 8);
    blended = new Float32Array(rows.length);
    for (let i = from; i < half; i++) faiss.blendRow(v.index, rows, i * 768, blended, i * 768, P.indexRate);
  }
  const feats = new Float32Array(frames * 768);
  for (let i = 0; i < half; i++) {
    for (let r = 0; r < 2; r++) {
      const j = 2 * i + r, o = j * 768;
      if (blended && i >= from) {
        // RVC's "protect": keep breaths and consonants (no pitch) closer to the original so they stay clear.
        const pf = pitchCache[j] > 0 ? 1 : P.protect;
        for (let c = 0; c < 768; c++) feats[o + c] = blended[i * 768 + c] * pf + rows[i * 768 + c] * (1 - pf);
      } else feats.set(rows.subarray(i * 768, i * 768 + 768), o);
    }
  }
  // 3) synthesize the whole window, keep the tail
  const audio = await synth(v, feats, pitchCache.slice(), noiseCache.slice());
  const tailIn = (B + C + S) / 16000, tail = Math.round(tailIn * v.sr);
  const piece = audio.subarray(Math.max(0, audio.length - tail));
  return dsp.resample(piece, v.sr, outSr);
}
// SOLA crossfade so blocks join without clicks.
function sola(x, B, C, S) {
  const need = B + C + S;
  if (x.length < need) { const y = new Float32Array(need); y.set(x, need - x.length); x = y; }
  let off = 0;
  if (solaBuf) {
    let best = -Infinity;
    for (let o = 0; o <= S; o++) {
      let num = 0, den = 1e-8;
      for (let i = 0; i < C; i++) { num += x[o + i] * solaBuf[i]; den += x[o + i] * x[o + i]; }
      const sc = num / Math.sqrt(den); if (sc > best) { best = sc; off = o; }
    }
  }
  const y = x.slice(off, off + B + C);
  if (solaBuf) for (let i = 0; i < C; i++) { const w = Math.sin(0.5 * Math.PI * i / C); const a = w * w; y[i] = y[i] * a + solaBuf[i] * (1 - a); }
  solaBuf = y.slice(B, B + C);
  return y.slice(0, B);
}

/* ---------------- messages ---------------- */
async function handle(m) {
  try {
    switch (m.cmd) {
      case 'init': DIRS = { base: path.join(m.userData, 'ai', 'base'), voices: m.voicesDir || path.join(m.userData, 'ai', 'voices') }; LOGF = path.join(m.userData, 'ai', 'engine.log'); fs.mkdirSync(path.dirname(LOGF), { recursive: true }); log('engine started', process.versions.node); TEMPLATES = path.join(m.resources, 'templates'); fs.mkdirSync(DIRS.voices, { recursive: true }); send(status()); break;
      case 'status': send(status()); break;
      case 'setVoicesDir': if (cur) { try { await cur.session.release(); } catch {} cur = null; } DIRS.voices = m.dir; fs.mkdirSync(DIRS.voices, { recursive: true }); log('voices folder', DIRS.voices); send(status()); break;
      case 'releaseEncoder': if (sHubert) { try { await sHubert.release(); } catch {} } sHubert = null; break;
      case 'fcpeReady': sFcpe = null; if (P.f0 === 'fcpe' || m.use) { P.f0 = 'fcpe'; await ensureFcpe(); } send(status()); break;
      case 'reloadBase': if (sHubert) { try { await sHubert.release(); } catch {} } sHubert = null; encoderBad = false; maskCache.clear(); if (cur) { await ensureBase(); } send(status()); break;
      case 'importBase': {
        fs.mkdirSync(DIRS.base, { recursive: true });
        const got = [];
        for (const f of m.paths || []) {
          const nm = path.basename(f).toLowerCase(), size = fs.statSync(f).size;
          if (size < 50e6) throw new Error(path.basename(f) + ' is too small to be an engine model. Download the full file.');
          const key = /rmvpe/.test(nm) ? 'rmvpe' : /hubert|contentvec|vec/.test(nm) ? 'hubert' : null;
          if (!key) throw new Error('Could not tell what ' + path.basename(f) + ' is. Pick the files named hubert…onnx and rmvpe…onnx.');
          fs.copyFileSync(f, path.join(DIRS.base, BASE[key].file)); got.push(BASE[key].label);
        }
        sHubert = null; sRmvpe = null; encoderBad = false; maskCache.clear();
        send({ type: 'baseImported', got, ready: baseReady() }); send(status()); break;
      }
      case 'download': busy = 'download'; send(status()); await downloadBase(); busy = ''; send({ type: 'downloaded' }); send(status()); break;
      case 'scan': { const attached = attachMissingIndexes(); const items = scanFolder(m.dir); send({ type: 'scan', dir: m.dir, items, attached }); if (attached) send(status()); break; }
      case 'setIndex': { const meta = attachIndex(m.id, m.path); send({ type: 'indexSet', id: m.id, name: meta.name }); send(status()); break; }
      case 'clearIndex': {
        try { fs.unlinkSync(path.join(DIRS.voices, m.id, 'model.index')); } catch {}
        const v = listVoices().find((x) => x.id === m.id); if (v) { delete v.index; writeMeta(v); }
        if (cur && cur.id === m.id) cur.index = null;
        send({ type: 'indexSet', id: m.id, cleared: true }); send(status()); break;
      }
      case 'importMany': busy = 'import'; send(status()); { const r = await importMany(m.items || []); busy = ''; send({ type: 'bulkDone', ...r }); send(status()); } break;
      case 'stopBulk': bulkStop = true; break;
      case 'import': busy = 'import'; send(status()); { const v = await importVoice(m.path, m.name); busy = ''; send({ type: 'imported', voice: v }); send(status()); } break;
      case 'setImage': case 'clearImage': {
        const v = listVoices().find((x) => x.id === m.id); if (!v) throw new Error('That voice was not found.');
        const dir = path.join(DIRS.voices, v.id);
        for (const f of fs.readdirSync(dir)) if (/^avatar\./i.test(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
        if (m.cmd === 'setImage') {
          const ext = path.extname(m.path).toLowerCase();
          if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) throw new Error('Pick a PNG, JPG, GIF or WebP image.');
          if (fs.statSync(m.path).size > 25e6) throw new Error('That image is over 25 MB. Pick a smaller one.');
          fs.copyFileSync(m.path, path.join(dir, 'avatar' + ext));
          v.image = 'avatar' + ext;
        } else delete v.image;
        v.imgv = Date.now(); writeMeta(v);
        send({ type: 'imageSet', id: v.id, cleared: m.cmd === 'clearImage' }); send(status()); break;
      }
      case 'rename': { const v = listVoices().find((x) => x.id === m.id); if (v) { v.name = String(m.name).slice(0, 40); writeMeta(v); } send(status()); break; }
      case 'removeAll': {
        if (cur) { try { await cur.session.release(); } catch {} cur = null; }
        let n = 0;
        // Only VanMule's own voice folders (meta.json + model.onnx); anything else in the folder is left alone.
        for (const v of listVoices()) {
          const d = path.join(DIRS.voices, v.id);
          if (!fs.existsSync(path.join(d, 'meta.json')) || !fs.existsSync(path.join(d, 'model.onnx'))) continue;
          try { fs.rmSync(d, { recursive: true, force: true }); n++; } catch (e) { log('could not remove', d, e.message); }
        }
        log('removed all voices:', n); send({ type: 'removedAll', n }); send(status()); break;
      }
      case 'remove': { if (cur && cur.id === m.id) { try { await cur.session.release(); } catch {} cur = null; } fs.rmSync(path.join(DIRS.voices, m.id), { recursive: true, force: true }); send(status()); break; }
      case 'load': busy = 'load'; send(status()); { const v = await loadVoice(m.id); busy = ''; send({ type: 'loaded', id: v.id, sr: v.sr, device }); send(status()); } break;
      case 'unload': if (cur) { try { await cur.session.release(); } catch {} } cur = null; send(status()); break;
      case 'sleep': { // free graphics memory while no AI voice is in use; everything reloads on the next use
        if (cur) { try { await cur.session.release(); } catch {} } cur = null;
        if (sHubert) { try { await sHubert.release(); } catch {} } sHubert = null;
        if (sRmvpe) { try { await sRmvpe.release(); } catch {} } sRmvpe = null;
        maskCache.clear(); resetStream(); log('asleep: models released'); send(status()); break;
      }
      case 'params': {
        const old = L().N;
        for (const k of ['pitch', 'blockSec', 'extraSec', 'gateDb', 'indexRate']) if (typeof m[k] === 'number') P[k] = m[k];
        if (m.f0 === 'rmvpe' || m.f0 === 'yin' || m.f0 === 'fcpe') { P.f0 = m.f0; if (P.f0 === 'rmvpe' && !sRmvpe && baseReady()) { try { sRmvpe = await createSession(path.join(DIRS.base, BASE.rmvpe.file)); } catch { P.f0 = 'yin'; } } if (P.f0 === 'fcpe' && DIRS) await ensureFcpe(); }
        if (L().N !== old) resetStream();
        break;
      }
    }
  } catch (e) {
    busy = '';
    log('error in', m.cmd, e.message);
    send({ type: 'error', cmd: m.cmd, msg: e.message === 'NEED_DOWNLOAD' ? 'NEED_DOWNLOAD' : e.message });
    send(status());
  }
}
process.parentPort.on('message', (e) => {
  const m = e.data || {};
  if (m.cmd === 'port' && e.ports && e.ports[0]) {
    port = e.ports[0];
    port.on('message', (ev) => { const d = ev.data; if (!d) return; if (d.t === 'in') onAudio(d.d); else if (d.t === 'init') outSr = d.sr || 48000; else if (d.t === 'reset') resetStream(); });
    port.start();
    return;
  }
  handle(m);
});
