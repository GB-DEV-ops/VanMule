'use strict';
// Reads the .index files that come with RVC voice models (faiss IndexIVFFlat) and runs the
// same nearest-neighbour feature blend RVC does, without needing faiss itself.
const fs = require('fs');

function parseIndex(buf) {
  let p = 0;
  const need = (n) => { if (p + n > buf.length) throw new Error('This .index file is cut off or damaged.'); };
  const fourcc = () => { need(4); const s = buf.toString('latin1', p, p + 4); p += 4; return s; };
  const i32 = () => { need(4); const v = buf.readInt32LE(p); p += 4; return v; };
  const u32 = () => { need(4); const v = buf.readUInt32LE(p); p += 4; return v; };
  const i64 = () => { need(8); const v = Number(buf.readBigInt64LE(p)); p += 8; return v; };
  const u8 = () => { need(1); return buf[p++]; };
  const floats = (n) => { need(n * 4); const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = buf.readFloatLE(p + i * 4); p += n * 4; return out; };
  const header = () => {
    const h = { d: i32(), ntotal: i64() }; i64(); i64(); h.trained = u8(); h.metric = i32();
    if (h.metric > 1) p += 4; // metric_arg
    return h;
  };
  const top = fourcc();
  if (top !== 'IwFl') {
    if (top === 'IvFl') throw new Error('This .index file uses a very old format. Re-save it with a newer RVC, or skip it.');
    throw new Error('This .index file is a type VanMule can\'t read (' + top.replace(/[^\x20-\x7e]/g, '?') + '). Only the usual "added_IVF…_Flat" files are supported.');
  }
  const h = header();
  const nlist = i64(), nprobe = Math.max(1, i64());
  const qt = fourcc();
  if (qt !== 'IxF2' && qt !== 'IxFI') throw new Error('This .index file uses an unsupported quantizer (' + qt + ').');
  const qh = header();
  const nc = i64();
  if (nc !== nlist * h.d || qh.d !== h.d) throw new Error('This .index file looks damaged.');
  const centroids = floats(nc);
  // direct map
  const dmType = u8(); const dmN = i64(); p += dmN * 8; if (dmType === 2) { const hn = i64(); p += hn * 16; }
  const il = fourcc();
  if (il === 'il00') throw new Error('This .index file has no data in it.');
  if (il !== 'ilar') throw new Error('This .index file stores its data in a way VanMule can\'t read (' + il + ').');
  const nl2 = i64(), codeSize = i64();
  if (nl2 !== nlist || codeSize !== h.d * 4) throw new Error('This .index file isn\'t a plain float index.');
  const kind = fourcc(), sv = i64(), sizesRaw = []; for (let i = 0; i < sv; i++) sizesRaw.push(i64());
  const sizes = new Array(nlist).fill(0);
  if (kind === 'full') for (let i = 0; i < nlist; i++) sizes[i] = sizesRaw[i];
  else if (kind === 'sprs') for (let i = 0; i < sizesRaw.length; i += 2) sizes[sizesRaw[i]] = sizesRaw[i + 1];
  else throw new Error('Unknown list layout in this .index file.');
  const lists = [];
  for (let i = 0; i < nlist; i++) {
    const n = sizes[i];
    if (!n) { lists.push(null); continue; }
    const v = floats(n * h.d); p += n * 8; // skip ids
    const norms = new Float32Array(n);
    for (let j = 0; j < n; j++) { let s = 0; const o = j * h.d; for (let c = 0; c < h.d; c++) s += v[o + c] * v[o + c]; norms[j] = s; }
    lists.push({ n, v, norms });
  }
  const cn = new Float32Array(nlist);
  for (let i = 0; i < nlist; i++) { let s = 0; const o = i * h.d; for (let c = 0; c < h.d; c++) s += centroids[o + c] * centroids[o + c]; cn[i] = s; }
  return { d: h.d, ntotal: h.ntotal, nlist, nprobe, centroids, cn, lists, metric: h.metric };
}

function loadIndex(file) {
  const size = fs.statSync(file).size;
  if (size > 1.2e9) throw new Error('This .index file is too large to use (over 1.2 GB).');
  return parseIndex(fs.readFileSync(file));
}

function dot(a, ao, b, bo, d) {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, c = 0;
  for (; c + 3 < d; c += 4) { s0 += a[ao + c] * b[bo + c]; s1 += a[ao + c + 1] * b[bo + c + 1]; s2 += a[ao + c + 2] * b[bo + c + 2]; s3 += a[ao + c + 3] * b[bo + c + 3]; }
  for (; c < d; c++) s0 += a[ao + c] * b[bo + c];
  return s0 + s1 + s2 + s3;
}
// RVC's blend for one 768-dim feature row: average of the 8 nearest stored rows, weighted by 1/dist², then mixed by rate.
const qbuf = new Float32Array(4096);
function blendRow(ix, src, so, out, oo, rate, k = 8) {
  const d = ix.d, q = qbuf; for (let c = 0; c < d; c++) q[c] = src[so + c];
  const qn = dot(q, 0, q, 0, d);
  // nearest list(s)
  const np = ix.nprobe, pd = new Float64Array(np).fill(Infinity), pi = new Int32Array(np).fill(-1);
  for (let i = 0; i < ix.nlist; i++) {
    if (!ix.lists[i]) continue;
    const dist = ix.cn[i] - 2 * dot(q, 0, ix.centroids, i * d, d);
    if (dist < pd[np - 1]) { let m = np - 1; while (m > 0 && pd[m - 1] > dist) { pd[m] = pd[m - 1]; pi[m] = pi[m - 1]; m--; } pd[m] = dist; pi[m] = i; }
  }
  const bd = new Float64Array(k).fill(Infinity), bl = new Int32Array(k).fill(-1), bj = new Int32Array(k);
  for (let t = 0; t < np; t++) {
    if (pi[t] < 0) continue;
    const li = pi[t], L = ix.lists[li], V = L.v;
    for (let j = 0; j < L.n; j++) {
      const dist = qn + L.norms[j] - 2 * dot(q, 0, V, j * d, d);
      if (dist < bd[k - 1]) {
        let m = k - 1; while (m > 0 && bd[m - 1] > dist) { bd[m] = bd[m - 1]; bl[m] = bl[m - 1]; bj[m] = bj[m - 1]; m--; }
        bd[m] = dist; bl[m] = li; bj[m] = j;
      }
    }
  }
  let wsum = 0; const w = new Float64Array(k);
  for (let m = 0; m < k; m++) if (bl[m] >= 0) { const s = Math.max(bd[m], 1e-6); w[m] = 1 / (s * s); wsum += w[m]; }
  if (!wsum) { for (let c = 0; c < d; c++) out[oo + c] = q[c]; return; }
  for (let m = 0; m < k; m++) w[m] /= wsum;
  for (let c = 0; c < d; c++) out[oo + c] = (1 - rate) * q[c];
  for (let m = 0; m < k; m++) {
    if (bl[m] < 0) continue;
    const V = ix.lists[bl[m]].v, o = bj[m] * d, a = rate * w[m];
    for (let c = 0; c < d; c++) out[oo + c] += a * V[o + c];
  }
}

module.exports = { parseIndex, loadIndex, blendRow };
