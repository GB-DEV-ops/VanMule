'use strict';
// Signal processing helpers for the AI voice engine (all mono, Float32).

function makeFFT(n) {
  const rev = new Uint32Array(n), bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
  const cs = new Float64Array(n / 2), sn = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = Math.sin(2 * Math.PI * i / n); }
  return (re, im) => {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) for (let j = i, k = 0; j < i + half; j++, k += step) {
        const l = j + half, c = cs[k], s = -sn[k];
        const tr = re[l] * c - im[l] * s, ti = re[l] * s + im[l] * c;
        re[l] = re[j] - tr; im[l] = im[j] - ti; re[j] += tr; im[j] += ti;
      }
    }
  };
}

/* ---- Log-mel spectrogram matching RVC's RMVPE front end (16 kHz, 1024 FFT, hop 160, 128 HTK mels 30-8000 Hz, slaney norm) ---- */
const N_FFT = 1024, HOP = 160, N_MELS = 128, SR = 16000;
let melBasis = null, fft1024 = null, hannWin = null;
function buildMel() {
  const hz2mel = (f) => 2595 * Math.log10(1 + f / 700), mel2hz = (m) => 700 * (Math.pow(10, m / 2595) - 1);
  const mMin = hz2mel(30), mMax = hz2mel(8000), pts = [];
  for (let i = 0; i < N_MELS + 2; i++) pts.push(mel2hz(mMin + (mMax - mMin) * i / (N_MELS + 1)));
  const nb = N_FFT / 2 + 1, basis = new Float32Array(N_MELS * nb);
  for (let m = 0; m < N_MELS; m++) {
    const f0 = pts[m], f1 = pts[m + 1], f2 = pts[m + 2], enorm = 2 / (f2 - f0);
    for (let k = 0; k < nb; k++) {
      const f = k * SR / N_FFT, lo = (f - f0) / (f1 - f0), hi = (f2 - f) / (f2 - f1);
      basis[m * nb + k] = Math.max(0, Math.min(lo, hi)) * enorm;
    }
  }
  melBasis = basis; fft1024 = makeFFT(N_FFT);
  hannWin = new Float64Array(N_FFT); for (let i = 0; i < N_FFT; i++) hannWin[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N_FFT);
}
// Returns {data: Float32Array [128 x Tp], frames: T, padded: Tp} with Tp a multiple of 32 (zero padded).
function logMel(x) {
  if (!melBasis) buildMel();
  const pad = N_FFT / 2, len = x.length, T = Math.floor(len / HOP) + 1, Tp = 32 * Math.floor((T - 1) / 32 + 1);
  const nb = N_FFT / 2 + 1, out = new Float32Array(N_MELS * Tp);
  const re = new Float64Array(N_FFT), im = new Float64Array(N_FFT), mag = new Float64Array(nb);
  const at = (i) => { // reflect padding
    let j = i - pad; if (j < 0) j = -j; if (j >= len) j = 2 * (len - 1) - j; return x[Math.max(0, Math.min(len - 1, j))];
  };
  for (let t = 0; t < T; t++) {
    const s = t * HOP;
    for (let i = 0; i < N_FFT; i++) { re[i] = at(s + i) * hannWin[i]; im[i] = 0; }
    fft1024(re, im);
    for (let k = 0; k < nb; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    for (let m = 0; m < N_MELS; m++) {
      let acc = 0; const row = m * nb;
      for (let k = 0; k < nb; k++) { const w = melBasis[row + k]; if (w) acc += w * mag[k]; }
      out[m * Tp + t] = Math.log(Math.max(acc, 1e-5));
    }
  }
  return { data: out, frames: T, padded: Tp };
}
// RMVPE salience [T x 360] -> f0 in Hz (0 = unvoiced)
const CENTS = (() => { const c = new Float64Array(368); for (let i = 0; i < 360; i++) c[i + 4] = 20 * i + 1997.3794084376191; return c; })();
function rmvpeDecode(sal, T, thred = 0.03) {
  const f0 = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    const row = t * 360; let mi = 0, mv = -Infinity;
    for (let i = 0; i < 360; i++) { const v = sal[row + i]; if (v > mv) { mv = v; mi = i; } }
    if (mv <= thred) { f0[t] = 0; continue; }
    let ps = 0, ws = 0;
    for (let j = -4; j <= 4; j++) { const i = mi + j; const v = (i >= 0 && i < 360) ? sal[row + i] : 0; ps += v * CENTS[mi + 4 + j]; ws += v; }
    const cents = ws ? ps / ws : 0, hz = 10 * Math.pow(2, cents / 1200);
    f0[t] = Math.abs(hz - 10) < 1e-6 ? 0 : hz;
  }
  return f0;
}
// FCPE salience [T x 360] -> f0 in Hz. FCPE's bins run evenly in cents from 32.70 Hz (C1) to 1975.5 Hz (B6).
const FCPE_CENTS = (() => { const lo = 1200 * Math.log2(32.70 / 10), hi = 1200 * Math.log2(1975.5 / 10), c = new Float64Array(368); for (let i = 0; i < 360; i++) c[i + 4] = lo + (hi - lo) * i / 359; return c; })();
function fcpeDecode(sal, T, thred = 0.05) {
  const f0 = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    const row = t * 360; let mi = 0, mv = -Infinity;
    for (let i = 0; i < 360; i++) { const v = sal[row + i]; if (v > mv) { mv = v; mi = i; } }
    if (mv <= thred) { f0[t] = 0; continue; }
    let ps = 0, ws = 0;
    for (let j = -4; j <= 4; j++) { const i = mi + j; const v = (i >= 0 && i < 360) ? sal[row + i] : 0; ps += v * FCPE_CENTS[mi + 4 + j]; ws += v; }
    f0[t] = ws ? 10 * Math.pow(2, ps / ws / 1200) : 0;
  }
  return f0;
}
// Built-in YIN pitch tracker (fallback when RMVPE isn't available). Frames centered every 160 samples.
function yin(x, T, fmin = 60, fmax = 1100, thresh = 0.15) {
  const W = 800, tauMin = Math.floor(SR / fmax), tauMax = Math.min(Math.ceil(SR / fmin), W - 1);
  const f0 = new Float32Array(T), d = new Float64Array(tauMax + 1);
  for (let t = 0; t < T; t++) {
    const c = t * HOP, s0 = c - W / 2;
    let energy = 0;
    for (let i = 0; i < W / 2; i++) { const v = x[Math.max(0, Math.min(x.length - 1, s0 + i))]; energy += v * v; }
    if (energy / (W / 2) < 1e-6) { f0[t] = 0; continue; }
    d.fill(0);
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < W / 2; i++) {
        const a = x[Math.max(0, Math.min(x.length - 1, s0 + i))], b = x[Math.max(0, Math.min(x.length - 1, s0 + i + tau))];
        const df = a - b; s += df * df;
      }
      d[tau] = s;
    }
    let run = 0, found = -1;
    for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; const cm = run ? d[tau] * tau / run : 1; d[tau] = cm; }
    for (let tau = tauMin; tau <= tauMax; tau++) { if (d[tau] < thresh) { while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++; found = tau; break; } }
    if (found < 0) { f0[t] = 0; continue; }
    const a = d[found - 1] || d[found], b = d[found], cc = d[found + 1] || d[found];
    const den = a - 2 * b + cc, shift = den ? 0.5 * (a - cc) / den : 0;
    f0[t] = SR / (found + shift);
  }
  return f0;
}
// Cubic (Catmull-Rom) resampling.
function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.floor(x.length * to / from), y = new Float32Array(n), r = from / to, L = x.length;
  for (let i = 0; i < n; i++) {
    const p = i * r, k = Math.floor(p), f = p - k;
    const x0 = x[Math.max(0, k - 1)], x1 = x[Math.min(L - 1, k)], x2 = x[Math.min(L - 1, k + 1)], x3 = x[Math.min(L - 1, k + 2)];
    y[i] = x1 + 0.5 * f * (x2 - x0 + f * (2 * x0 - 5 * x1 + 4 * x2 - x3 + f * (3 * (x1 - x2) + x3 - x0)));
  }
  return y;
}
function rms(x, a = 0, b = x.length) { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); }
// Gaussian noise
function randn(n) { const o = new Float32Array(n); for (let i = 0; i < n; i += 2) { const u = Math.random() || 1e-9, v = Math.random(); const r = Math.sqrt(-2 * Math.log(u)); o[i] = r * Math.cos(2 * Math.PI * v); if (i + 1 < n) o[i + 1] = r * Math.sin(2 * Math.PI * v); } return o; }

module.exports = { makeFFT, logMel, rmvpeDecode, fcpeDecode, yin, resample, rms, randn, HOP, SR };
