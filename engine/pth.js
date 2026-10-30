'use strict';
// Reads PyTorch .pth checkpoints (zip + pickle) without Python, and converts RVC v2 checkpoints to ONNX using a prebuilt template.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- minimal zip reader ---------- */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('This file is not a valid model archive.');
  let count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16);
  // zip64
  if (cdOff === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (buf.readUInt32LE(loc) === 0x07064b50) {
      const z64 = Number(buf.readBigUInt64LE(loc + 8));
      count = Number(buf.readBigUInt64LE(z64 + 32)); cdOff = Number(buf.readBigUInt64LE(z64 + 48));
    }
  }
  const files = new Map();
  let p = cdOff;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    let csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    let lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    // zip64 extra
    let x = p + 46 + nlen; const xe = x + xlen;
    while (x + 4 <= xe) {
      const id = buf.readUInt16LE(x), sz = buf.readUInt16LE(x + 2); let q = x + 4;
      if (id === 1) {
        if (usize === 0xffffffff) { usize = Number(buf.readBigUInt64LE(q)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(buf.readBigUInt64LE(q)); q += 8; }
        if (lho === 0xffffffff) { lho = Number(buf.readBigUInt64LE(q)); q += 8; }
      }
      x += 4 + sz;
    }
    files.set(name, { method, csize, usize, lho });
    p += 46 + nlen + xlen + clen;
  }
  const get = (name) => {
    const f = files.get(name); if (!f) return null;
    const ln = buf.readUInt16LE(f.lho + 26), lx = buf.readUInt16LE(f.lho + 28), start = f.lho + 30 + ln + lx;
    const raw = buf.subarray(start, start + f.csize);
    return f.method === 0 ? raw : zlib.inflateRawSync(raw);
  };
  return { names: [...files.keys()], get };
}

/* ---------- minimal unpickler (enough for torch.save checkpoints) ---------- */
const DTYPES = { HalfStorage: ['f16', 2], FloatStorage: ['f32', 4], BFloat16Storage: ['bf16', 2], DoubleStorage: ['f64', 8], LongStorage: ['i64', 8], IntStorage: ['i32', 4] };
function unpickle(data, persistentLoad) {
  const stack = [], marks = [], memo = new Map();
  let p = 0;
  const u8 = () => data[p++], u16 = () => { const v = data.readUInt16LE(p); p += 2; return v; }, u32 = () => { const v = data.readUInt32LE(p); p += 4; return v; };
  const i32 = () => { const v = data.readInt32LE(p); p += 4; return v; };
  const str = (n) => { const s = data.toString('utf8', p, p + n); p += n; return s; };
  const popMark = () => { const m = marks.pop(); return stack.splice(m); };
  const findClass = (mod, name) => {
    const full = mod + '.' + name;
    if (full === 'collections.OrderedDict') return { kind: 'ctor', make: () => ({ __dict: true }) };
    if (full === 'torch._utils._rebuild_tensor_v2' || full === 'torch._utils._rebuild_tensor') return { kind: 'fn', call: (a) => ({ __tensor: true, storage: a[0], offset: a[1], shape: a[2], stride: a[3] }) };
    if (full === 'torch._utils._rebuild_parameter' || full === 'torch._utils._rebuild_parameter_with_state') return { kind: 'fn', call: (a) => a[0] };
    if (mod === 'torch' && DTYPES[name]) return { kind: 'storage', dtype: DTYPES[name] };
    if (full === 'torch.Size') return { kind: 'fn', call: (a) => a[0] };
    return { kind: 'fn', call: () => ({ __unknown: full }) };
  };
  const setItem = (d, k, v) => { if (d && typeof d === 'object') d[k] = v; };
  for (;;) {
    const op = u8();
    switch (op) {
      case 0x80: p++; break; // PROTO
      case 0x95: p += 8; break; // FRAME
      case 0x2e: return stack.pop(); // STOP
      case 0x28: marks.push(stack.length); break; // MARK
      case 0x7d: stack.push({}); break; // EMPTY_DICT
      case 0x5d: stack.push([]); break; // EMPTY_LIST
      case 0x29: stack.push([]); break; // EMPTY_TUPLE
      case 0x4e: stack.push(null); break; // NONE
      case 0x88: stack.push(true); break;
      case 0x89: stack.push(false); break;
      case 0x4b: stack.push(u8()); break; // BININT1
      case 0x4d: stack.push(u16()); break; // BININT2
      case 0x4a: stack.push(i32()); break; // BININT
      case 0x8a: { const n = u8(); let v = 0n; for (let i = 0; i < n; i++) v |= BigInt(data[p + i]) << BigInt(8 * i); if (n && data[p + n - 1] & 0x80) v -= 1n << BigInt(8 * n); p += n; stack.push(Number(v)); break; } // LONG1
      case 0x47: { const v = data.readDoubleBE(p); p += 8; stack.push(v); break; } // BINFLOAT
      case 0x58: stack.push(str(u32())); break; // BINUNICODE
      case 0x8c: stack.push(str(u8())); break; // SHORT_BINUNICODE
      case 0x8d: { const n = Number(data.readBigUInt64LE(p)); p += 8; stack.push(str(n)); break; }
      case 0x54: stack.push(str(u32())); break; // BINSTRING
      case 0x55: stack.push(str(u8())); break; // SHORT_BINSTRING
      case 0x43: { const n = u8(); stack.push(data.subarray(p, p + n)); p += n; break; } // SHORT_BINBYTES
      case 0x42: { const n = u32(); stack.push(data.subarray(p, p + n)); p += n; break; } // BINBYTES
      case 0x71: memo.set(u8(), stack[stack.length - 1]); break; // BINPUT
      case 0x72: memo.set(u32(), stack[stack.length - 1]); break; // LONG_BINPUT
      case 0x94: memo.set(memo.size, stack[stack.length - 1]); break; // MEMOIZE
      case 0x68: stack.push(memo.get(u8())); break; // BINGET
      case 0x6a: stack.push(memo.get(u32())); break; // LONG_BINGET
      case 0x74: stack.push(popMark()); break; // TUPLE
      case 0x85: stack.push([stack.pop()]); break;
      case 0x86: { const b = stack.pop(), a = stack.pop(); stack.push([a, b]); break; }
      case 0x87: { const c = stack.pop(), b = stack.pop(), a = stack.pop(); stack.push([a, b, c]); break; }
      case 0x6c: stack.push(popMark()); break; // LIST
      case 0x61: { const v = stack.pop(); stack[stack.length - 1].push(v); break; } // APPEND
      case 0x65: { const items = popMark(); stack[stack.length - 1].push(...items); break; } // APPENDS
      case 0x64: { const items = popMark(), d = {}; for (let i = 0; i < items.length; i += 2) d[items[i]] = items[i + 1]; stack.push(d); break; } // DICT
      case 0x73: { const v = stack.pop(), k = stack.pop(); setItem(stack[stack.length - 1], k, v); break; } // SETITEM
      case 0x75: { const items = popMark(), d = stack[stack.length - 1]; for (let i = 0; i < items.length; i += 2) setItem(d, items[i], items[i + 1]); break; } // SETITEMS
      case 0x63: { const a = data.indexOf(10, p); const mod = data.toString('utf8', p, a); const b = data.indexOf(10, a + 1); const name = data.toString('utf8', a + 1, b); p = b + 1; stack.push(findClass(mod, name)); break; } // GLOBAL
      case 0x93: { const name = stack.pop(), mod = stack.pop(); stack.push(findClass(mod, name)); break; } // STACK_GLOBAL
      case 0x52: { const args = stack.pop(), f = stack.pop(); stack.push(f.kind === 'ctor' ? f.make(args) : f.kind === 'fn' ? f.call(args) : f); break; } // REDUCE
      case 0x81: { const args = stack.pop(), cls = stack.pop(); stack.push(cls.kind === 'ctor' ? cls.make(args) : {}); break; } // NEWOBJ
      case 0x62: { const st = stack.pop(); const o = stack[stack.length - 1]; if (o && typeof o === 'object' && st && typeof st === 'object' && !Array.isArray(st)) Object.assign(o, st); break; } // BUILD
      case 0x51: { const pid = stack.pop(); stack.push(persistentLoad(pid)); break; } // BINPERSID
      case 0x30: stack.pop(); break; // POP
      case 0x31: popMark(); break; // POP_MARK
      case 0x32: stack.push(stack[stack.length - 1]); break; // DUP
      default: throw new Error('Unsupported pickle opcode 0x' + op.toString(16) + ' at ' + (p - 1));
    }
  }
}

function f16to32(h) {
  const s = (h & 0x8000) >> 15, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

function loadCheckpoint(file) {
  const zip = readZip(fs.readFileSync(file));
  const pkl = zip.names.find((n) => /(^|\/)data\.pkl$/.test(n));
  if (!pkl) throw new Error('This .pth file was saved in an old format VanMule can\'t read.');
  const prefix = pkl.slice(0, pkl.length - 'data.pkl'.length);
  const cache = new Map();
  const obj = unpickle(zip.get(pkl), (pid) => {
    // ('storage', storage_type, key, location, numel)
    const [, stype, key, , numel] = pid;
    return { dtype: stype && stype.dtype, key: String(key), numel };
  });
  const tensorData = (t) => {
    const st = t.storage, [dt, size] = st.dtype || ['f32', 4];
    let raw = cache.get(st.key);
    if (!raw) { raw = zip.get(prefix + 'data/' + st.key); if (!raw) throw new Error('Missing tensor data ' + st.key); cache.set(st.key, raw); }
    const shape = t.shape || [], n = shape.reduce((a, b) => a * b, 1), out = new Float32Array(n);
    const stride = t.stride || [];
    const idx = new Array(shape.length).fill(0);
    for (let i = 0; i < n; i++) {
      let e = t.offset || 0; for (let d = 0; d < shape.length; d++) e += idx[d] * stride[d];
      const b = e * size;
      out[i] = dt === 'f16' ? f16to32(raw.readUInt16LE(b)) : dt === 'bf16' ? new Float32Array(new Uint32Array([raw.readUInt16LE(b) << 16]).buffer)[0] : dt === 'f64' ? raw.readDoubleLE(b) : dt === 'f32' ? raw.readFloatLE(b) : dt === 'i64' ? Number(raw.readBigInt64LE(b)) : raw.readInt32LE(b);
      for (let d = shape.length - 1; d >= 0; d--) { if (++idx[d] < shape[d]) break; idx[d] = 0; }
    }
    return out;
  };
  return { obj, tensorData };
}

/* ---------- RVC .pth -> ONNX ---------- */
const SR_KEY = { '32k': '32k', '40k': '40k', '48k': '48k', 32000: '32k', 40000: '40k', 48000: '48k' };
function convertPth(file, outDir, templatesDir, variant = '') {
  const { obj, tensorData } = loadCheckpoint(file);
  const weight = obj.weight || obj.model || obj.state_dict;
  if (!weight || typeof weight !== 'object') throw new Error('This file is not an RVC voice model. Use the small .pth file from the model\'s "weights" folder, not a training checkpoint (G_ or D_ files).');
  const version = obj.version || (weight['enc_p.emb_phone.weight'] && weight['enc_p.emb_phone.weight'].shape[1] === 768 ? 'v2' : 'v1');
  if (version !== 'v2') throw new Error('This is an RVC v1 model. VanMule supports RVC v2 models.');
  if (obj.f0 === 0) throw new Error('This model was trained without pitch. VanMule needs a model trained with pitch (f0).');
  let sr = obj.sr; const cfg = obj.config || [];
  if (!SR_KEY[sr] && cfg.length) sr = cfg[cfg.length - 1];
  const key = SR_KEY[sr];
  if (!key) throw new Error('Unsupported sample rate: ' + sr);
  const man = JSON.parse(fs.readFileSync(path.join(templatesDir, `rvc_v2_${key}${variant}.json`), 'utf8'));
  // Compare architecture to the template.
  const cmp = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const mc = cfg.slice(0, man.config.length);
  for (const i of man.checkConfig) { if (mc[i] !== undefined && !cmp(mc[i], man.config[i])) throw new Error('This model uses a custom layout VanMule can\'t convert yet. Export it to ONNX with RVC or Applio, then import the .onnx file.'); }
  const total = man.dataSize, data = Buffer.alloc(total);
  const consts = fs.readFileSync(path.join(templatesDir, `rvc_v2_${key}${variant}.const.bin`));
  let filled = 0;
  for (const it of man.initializers) {
    if (it.source === 'const') { consts.copy(data, it.offset, it.constOffset, it.constOffset + it.length); continue; }
    const t = weight[it.weight];
    if (!t || !t.__tensor) throw new Error('The model is missing weight ' + it.weight + '.');
    let v = tensorData(t);
    const need = it.length / 4;
    if (v.length !== need) {
      if (it.weight === 'emb_g.weight') { // speaker table: repeat speaker 0
        const row = man.ginChannels, out = new Float32Array(need);
        for (let r = 0; r < need / row; r++) out.set(v.subarray(0, row), r * row);
        v = out;
      } else throw new Error('Weight ' + it.weight + ' has an unexpected size. This model can\'t be converted.');
    }
    Buffer.from(v.buffer, v.byteOffset, v.byteLength).copy(data, it.offset);
    filled++;
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(path.join(templatesDir, `rvc_v2_${key}${variant}.onnx`), path.join(outDir, 'model.onnx'));
  fs.writeFileSync(path.join(outDir, man.dataFile), data);
  return { sr: { '32k': 32000, '40k': 40000, '48k': 48000 }[key], weights: filled, info: obj.info || '' };
}

module.exports = { readZip, unpickle, loadCheckpoint, convertPth };
