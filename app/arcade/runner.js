/* VanMule Arcade: Mule Run - endless side-scrolling runner.
   window.VanArcade.runner.mount(el, api) / unmount() */
(function () {
  'use strict';
  const ID = 'runner';
  const W = 960, H = 400, GROUND = 330, MULE_X = 160, STEP = 1 / 120, TAU = Math.PI * 2;
  const G = 2700, G_HOLD = 1150, JUMP_V = 780, HOLD_MAX = 0.24, START_SPEED = 390, MAX_SPEED = 1050, ACCEL = 9;
  const PX_PER_M = 40, CYCLE_M = 900, CARROT_PTS = 25;
  const C = { ember: '#ff8a3d', gold: '#ffc861', teal: '#6fd3c7', red: '#ff5a52', ok: '#4ade80', fg: '#f3ece5', muted: '#a3968a' };
  const USED = new Set(['ArrowUp', 'ArrowDown', 'Space', 'Enter', 'Escape', 'p', 'w', 's', 'x']);
  // sky keyframes over one day cycle: [pos, skyTop, skyBottom, far, mid, near, ground, light]
  const SKY = [
    [0.00, '#4f9cc4', '#f2d7a6', '#b9a6a0', '#c79566', '#a8733f', '#d9a86a', 1],
    [0.40, '#4f9cc4', '#f2d7a6', '#b9a6a0', '#c79566', '#a8733f', '#d9a86a', 1],
    [0.52, '#3a2f5e', '#ff9a52', '#7a5470', '#8e5a4a', '#6e4630', '#b9804e', 0.7],
    [0.62, '#080a1a', '#1c1d3c', '#2a2840', '#2a2634', '#211c26', '#4a3a36', 0.25],
    [0.88, '#080a1a', '#1c1d3c', '#2a2840', '#2a2634', '#211c26', '#4a3a36', 0.25],
    [0.95, '#3d4c80', '#ffb27a', '#8a7488', '#a07a64', '#7e5a3e', '#c39060', 0.75],
    [1.00, '#4f9cc4', '#f2d7a6', '#b9a6a0', '#c79566', '#a8733f', '#d9a86a', 1],
  ];
  const CSS = `
.ag-runner{display:flex;flex-direction:column;gap:12px;color:var(--fg);font-family:var(--body);user-select:none}
.ag-runner .ag-top{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap}
.ag-runner .ag-title{flex:1 1 260px;min-width:220px}
.ag-runner .ag-stage{line-height:0}
.ag-runner canvas{display:block;border-radius:14px;background:#4f9cc4;box-shadow:0 0 0 1px var(--line),0 18px 40px rgba(0,0,0,.45);touch-action:none}
.ag-runner h2{font-family:var(--display);font-size:22px;line-height:1.1;margin:0}
.ag-runner h2 em{font-style:normal;color:var(--ember)}
.ag-runner .ag-how{color:var(--muted);font-size:13px;margin:4px 0 0}
.ag-runner .ag-stats{display:flex;gap:8px}
.ag-runner .ag-stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 12px;min-width:84px}
.ag-runner .ag-stat span{display:block;font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em}
.ag-runner .ag-stat b{display:block;font-family:var(--mono);font-size:17px;font-weight:700}
.ag-runner .ag-stat.hi b{color:var(--gold)}
.ag-runner .ag-btns{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ag-runner .ag-bottom{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
.ag-runner .ag-keys{font-size:12px;color:var(--dim);line-height:1.8;flex:1 1 300px}
.ag-runner kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-runner details{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--muted);flex:1 1 300px}
.ag-runner summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-runner details ul{margin:8px 0 2px;padding-left:18px}
.ag-runner details li{margin:3px 0}
`;

  let el = null, api = null, root = null, cv = null, ctx = null, ui = {};
  let raf = 0, lastT = 0, acc = 0, ro = null, dpr = 1, sc = 1, S = null, AC = null, NOISE = null, soundOn = true, best = 0, bestDist = 0, FONT = 'system-ui';
  let stars = [], clouds = [];
  const keys = {};
  const listeners = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };
  const visible = () => !!(el && !document.hidden && el.offsetParent !== null);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------- sound ---------- */
  function ensureAudio() {
    if (!soundOn || AC) return;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const len = AC.sampleRate | 0; NOISE = AC.createBuffer(1, len, AC.sampleRate);
      const d = NOISE.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { AC = null; }
  }
  function tone(type, f1, f2, dur, vol, at) {
    if (!AC || !soundOn) return;
    try {
      const t = AC.currentTime + (at || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.setValueAtTime(f1, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  function noise(dur, vol, freq) {
    if (!AC || !soundOn || !NOISE) return;
    try {
      const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
      s.buffer = NOISE; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(AC.destination); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  function sfx(k) {
    switch (k) {
      case 'jump': tone('square', 300, 620, 0.12, 0.05); break;
      case 'land': noise(0.06, 0.06, 700); break;
      case 'carrot': tone('triangle', 988, 0, 0.06, 0.07); tone('triangle', 1319, 0, 0.09, 0.07, 0.05); break;
      case 'duck': tone('sine', 260, 160, 0.07, 0.04); break;
      case 'milestone': [659, 880, 1175].forEach((f, i) => tone('triangle', f, 0, 0.09, 0.06, i * 0.06)); break;
      case 'hit': noise(0.3, 0.25, 1500); tone('sawtooth', 260, 70, 0.45, 0.08); break;
      case 'hee': tone('square', 820, 1200, 0.12, 0.04); tone('square', 520, 380, 0.2, 0.05, 0.13); tone('square', 820, 1150, 0.11, 0.04, 0.34); tone('square', 500, 360, 0.24, 0.05, 0.46); break;
      case 'start': [392, 523, 659].forEach((f, i) => tone('square', f, 0, 0.08, 0.05, i * 0.07)); break;
    }
  }

  /* ---------- colors ---------- */
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const SKYC = SKY.map((k) => [k[0], ...k.slice(1, 7).map(hex), k[7]]);
  function palette(p) {
    let i = 0; while (i < SKYC.length - 2 && SKYC[i + 1][0] <= p) i++;
    const a = SKYC[i], b = SKYC[i + 1], f = clamp((p - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1), e = f * f * (3 - 2 * f);
    const out = [];
    for (let j = 1; j <= 6; j++) { const c = a[j].map((v, q) => Math.round(v + (b[j][q] - v) * e)); out.push(`rgb(${c[0]},${c[1]},${c[2]})`); }
    out.push(a[7] + (b[7] - a[7]) * e);
    return out;
  }

  /* ---------- game ---------- */
  function newGame() {
    S = { phase: 'ready', paused: false, autoPaused: false, speed: START_SPEED, dist: 0, scroll: 0, carrots: 0, score: 0, time: 0, overT: 0,
      y: 0, vy: 0, onGround: true, ducking: false, holdT: 0, jumpHeld: false, coyote: 0, buffer: 0, legT: 0, blinkT: 2,
      obs: [], items: [], parts: [], texts: [], nextGap: 700, milestone: 100, flash: 0, newHi: false, frames: 0, deadT: 0, shake: 0 };
    syncUI(); draw();
  }
  function startGame() {
    newGame(); S.phase = 'play'; sfx('start'); syncUI(); kick();
  }
  const meters = () => Math.floor(S.dist / PX_PER_M);
  function score() { return meters() + S.carrots * CARROT_PTS; }
  function spawn() {
    const m = meters(), birdsOK = m > 250, x = W + 60;
    const r = Math.random();
    let o;
    if (birdsOK && r < Math.min(0.32, 0.12 + m / 6000)) {
      const lv = Math.random(), hgt = lv < 0.36 ? 22 : lv < 0.72 ? 56 : 92;
      o = { type: 'bird', x, y: GROUND - hgt, w: 40, h: 22, flap: rnd(0, TAU), bob: rnd(0, TAU), vx: 70 };
    } else if (r < 0.62) {
      const k = Math.random();
      if (k < 0.4) o = { type: 'cactus', x, w: 22, h: 46, arms: [[-1, 0.55], [1, 0.35]] };
      else if (k < 0.7) o = { type: 'cactus', x, w: 26, h: 66, arms: [[-1, 0.45], [1, 0.6]] };
      else o = { type: 'cluster', x, w: m > 400 && Math.random() < 0.5 ? 78 : 54, h: 44 };
    } else o = { type: 'fence', x, w: m > 300 && Math.random() < 0.4 ? 104 : 72, h: 34 };
    if (o.type !== 'bird') o.y = GROUND - o.h;
    S.obs.push(o);
    // carrots: an arc over ground obstacles (rewarding a clean jump) or a little row in the gap
    if (o.type !== 'bird' && Math.random() < 0.38) {
      const n = 5, span = Math.max(150, S.speed * 0.5);
      for (let i = 0; i < n; i++) { const f = i / (n - 1), cx = o.x + o.w / 2 - span / 2 + f * span; S.items.push({ x: cx, y: GROUND - o.h - 30 - Math.sin(f * Math.PI) * 60, t: rnd(0, TAU) }); }
    } else if (Math.random() < 0.3) {
      const n = 3 + ((Math.random() * 3) | 0), y = Math.random() < 0.5 ? GROUND - 24 : GROUND - 110;
      for (let i = 0; i < n; i++) S.items.push({ x: x + o.w + 120 + i * 34, y, t: rnd(0, TAU) });
    }
    // gap until next obstacle scales with speed so reaction time stays fair
    const minGap = S.speed * 0.62 + 140;
    S.nextGap = minGap + rnd(0, S.speed * 0.9) + (Math.random() < 0.12 ? S.speed * 0.8 : 0);
    if (m > 500 && o.type !== 'bird' && Math.random() < 0.18) S.nextGap = Math.max(S.nextGap, minGap + 120);
  }
  function muleBoxes() {
    const x = MULE_X, y = GROUND + S.y;
    if (S.ducking && S.onGround) return [[x - 26, y - 34, 56, 22], [x + 24, y - 36, 22, 16], [x - 18, y - 14, 36, 12]];
    return [[x - 22, y - 48, 44, 26], [x + 14, y - 72, 24, 28], [x - 16, y - 24, 34, 20]];
  }
  function obsBoxes(o) {
    if (o.type === 'bird') return [[o.x + 6, o.y - 7, o.w - 12, 14]];
    if (o.type === 'fence') return [[o.x + 4, o.y + 4, o.w - 8, o.h - 4]];
    if (o.type === 'cluster') return [[o.x + 4, o.y + 6, o.w - 8, o.h - 6]];
    return [[o.x + 4, o.y + 4, o.w - 8, o.h - 4]];
  }
  const overlap = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
  function crash() {
    S.phase = 'dead'; S.deadT = 0; S.vy = -420; S.onGround = false; S.shake = 9; sfx('hit'); sfx('hee');
    for (let i = 0; i < 22; i++) S.parts.push({ x: MULE_X + 20, y: GROUND + S.y - 40, vx: rnd(-200, 200), vy: rnd(-300, 0), t: 0, life: rnd(0.4, 0.9), color: Math.random() < 0.5 ? C.ember : '#e8d8b0', size: rnd(2, 4), g: 900 });
    const sc0 = score();
    if (sc0 > best) { best = sc0; S.newHi = true; try { api.save('best', best); } catch (e) { /* ignore */ } }
    if (meters() > bestDist) { bestDist = meters(); try { api.save('bestDist', bestDist); } catch (e) { /* ignore */ } }
    syncUI();
  }
  function doJump() {
    S.vy = -JUMP_V; S.onGround = false; S.holdT = 0; S.coyote = 0; S.buffer = 0; S.ducking = false; sfx('jump');
    for (let i = 0; i < 6; i++) S.parts.push({ x: MULE_X + rnd(-14, 14), y: GROUND, vx: rnd(-80, 20) - S.speed * 0.2, vy: rnd(-60, -10), t: 0, life: rnd(0.3, 0.5), color: 'dust', size: rnd(3, 6), g: 0 });
  }
  function step(dt) {
    S.time += dt;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 30);
    if (S.flash > 0) S.flash -= dt;
    for (const p of S.parts) { p.t += dt; p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    if (S.parts.length) S.parts = S.parts.filter((p) => p.t < p.life);
    for (const t of S.texts) { t.t += dt; t.y -= dt * 30; }
    if (S.texts.length) S.texts = S.texts.filter((t) => t.t < t.life);
    S.blinkT -= dt; if (S.blinkT < -0.12) S.blinkT = rnd(1.5, 4);
    if (S.phase === 'ready') { S.legT += dt * 0.6; return; }
    if (S.phase === 'dead' || S.phase === 'over') {
      S.deadT += dt; S.overT += dt;
      if (S.phase === 'dead') {
        S.vy += G * dt; S.y = Math.min(0, S.y + S.vy * dt);
        if (S.y >= 0 && S.vy > 0) { S.vy = 0; }
        if (S.deadT > 0.7) { S.phase = 'over'; S.overT = 0; syncUI(); }
      }
      return;
    }
    // speed + distance
    S.speed = Math.min(MAX_SPEED, S.speed + ACCEL * dt * (S.speed < 700 ? 1 : 0.6));
    const dx = S.speed * dt;
    S.dist += dx; S.scroll += dx;
    S.legT += dt * (S.speed / 55);
    if (meters() >= S.milestone) { S.milestone += 100; S.flash = 0.8; sfx('milestone'); }
    // input
    const jumpKey = keys.Space || keys.ArrowUp || keys.w || keys.x;
    const downKey = keys.ArrowDown || keys.s;
    if (S.buffer > 0) S.buffer -= dt;
    if (S.onGround) S.coyote = 0.08; else S.coyote -= dt;
    if (S.buffer > 0 && (S.onGround || S.coyote > 0) && S.vy >= 0) doJump();
    // physics
    if (!S.onGround) {
      let g = G;
      if (S.vy < 0 && jumpKey && S.holdT < HOLD_MAX) { g = G_HOLD; S.holdT += dt; }
      if (downKey) g = G * 2.6;
      S.vy += g * dt; S.y += S.vy * dt;
      if (S.y >= 0) {
        S.y = 0; S.vy = 0; S.onGround = true; sfx('land');
        for (let i = 0; i < 5; i++) S.parts.push({ x: MULE_X + rnd(-20, 20), y: GROUND, vx: rnd(-90, 30) - S.speed * 0.15, vy: rnd(-50, -10), t: 0, life: rnd(0.25, 0.45), color: 'dust', size: rnd(3, 6), g: 0 });
      }
    }
    const wasDuck = S.ducking;
    S.ducking = !!downKey && S.onGround;
    if (S.ducking && !wasDuck) sfx('duck');
    // running dust
    if (S.onGround && Math.random() < dt * (S.speed / 40)) S.parts.push({ x: MULE_X - 18, y: GROUND - 2, vx: -S.speed * 0.3 + rnd(-30, 30), vy: rnd(-40, -5), t: 0, life: rnd(0.2, 0.4), color: 'dust', size: rnd(2, 4), g: 0 });
    // obstacles
    S.nextGap -= dx;
    if (S.nextGap <= 0) spawn();
    for (const o of S.obs) { o.x -= dx + (o.vx || 0) * dt; if (o.type === 'bird') { o.flap += dt * 12; o.bob += dt * 3; } }
    S.obs = S.obs.filter((o) => o.x + o.w > -40);
    for (const it of S.items) { it.x -= dx; it.t += dt * 4; }
    S.items = S.items.filter((it) => it.x > -30 && !it.got);
    // collisions
    const mb = muleBoxes();
    for (const o of S.obs) {
      if (o.x > MULE_X + 60 || o.x + o.w < MULE_X - 40) continue;
      const ob = obsBoxes(o);
      for (const a of mb) for (const b of ob) if (overlap(a, b)) { crash(); return; }
    }
    for (const it of S.items) {
      const b = [it.x - 10, it.y - 14, 20, 28];
      if (mb.some((a) => overlap(a, b))) {
        it.got = true; S.carrots++; sfx('carrot');
        S.texts.push({ x: it.x, y: it.y - 10, s: '+' + CARROT_PTS, t: 0, life: 0.7, color: C.ember });
        for (let i = 0; i < 6; i++) S.parts.push({ x: it.x, y: it.y, vx: rnd(-90, 90), vy: rnd(-120, 40), t: 0, life: rnd(0.3, 0.5), color: Math.random() < 0.5 ? C.ember : C.ok, size: rnd(2, 3.5), g: 300 });
      }
    }
    S.score = score();
    if (S.frames % 6 === 0) syncUI();
  }

  /* ---------- loop ---------- */
  const animating = () => S && !S.paused;
  function kick() { if (!raf && el) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    if (!visible()) { autoPause(); return; }
    S.frames++;
    if (!lastT) lastT = t;
    const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    if (!S.paused) { acc += dt; let n = 0; while (acc >= STEP && n++ < 14) { acc -= STEP; step(STEP); } if (acc > STEP) acc = 0; }
    draw();
    // idle screens keep a gentle animation, but stop after a while to save power
    const idle = (S.phase === 'over' && S.overT > 12) || (S.phase === 'ready' && S.time > 30);
    if (animating() && !idle) raf = requestAnimationFrame(frame);
  }
  function autoPause() {
    if (S && S.phase === 'play' && !S.paused) { S.paused = true; S.autoPaused = true; syncUI(); }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function setPaused(v) {
    if (!S || S.phase !== 'play') return;
    S.paused = v; S.autoPaused = false;
    if (v) for (const k in keys) keys[k] = false;
    syncUI();
    if (!v) kick(); else if (visible()) draw();
  }

  /* ---------- drawing ---------- */
  function txt(s, x, y, size, color, weight, align, shadow) {
    ctx.font = `${weight || 700} ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    if (shadow !== false) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText(s, x + 1.5, y + 2); }
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function hill(off, base, amp, f1, f2, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 16; x += 16) {
      const wx = x + off;
      const y = base - amp * (0.55 * Math.sin(wx * f1) + 0.3 * Math.sin(wx * f2 + 1.7) + 0.15 * Math.sin(wx * f1 * 3.1 + 0.4));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  function mesa(off, color) {
    // distant flat-topped buttes, repeating every 1400px
    ctx.fillStyle = color;
    const period = 1400, o = ((off % period) + period) % period;
    for (let k = -1; k < 2; k++) {
      const bx = k * period - o;
      const shapes = [[120, 180, 200, 228], [520, 120, 236, 250], [900, 240, 190, 214], [1240, 90, 244, 256]];
      for (const [sx, w, top, shoulder] of shapes) {
        const x = bx + sx; if (x > W + 50 || x + w < -50) continue;
        ctx.beginPath(); ctx.moveTo(x - 30, 300); ctx.lineTo(x, shoulder); ctx.lineTo(x + 12, top); ctx.lineTo(x + w - 12, top); ctx.lineTo(x + w, shoulder); ctx.lineTo(x + w + 30, 300); ctx.closePath(); ctx.fill();
      }
    }
  }
  function drawCactus(o, light) {
    const x = o.x, y = o.y, w = o.w, h = o.h;
    const body = light > 0.6 ? '#3f8a4a' : '#2a5a34', hi = light > 0.6 ? '#5fae5e' : '#3a7044', dark = '#1f4a28';
    const trunk = (tx, tw, th) => {
      ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(tx, GROUND - th, tw, th + 2, [tw / 2, tw / 2, 2, 2]) : ctx.rect(tx, GROUND - th, tw, th); ctx.fill();
      ctx.fillStyle = hi; ctx.fillRect(tx + tw * 0.22, GROUND - th + tw * 0.4, Math.max(2, tw * 0.16), th - tw * 0.5);
      ctx.fillStyle = dark; for (let yy = GROUND - th + 8; yy < GROUND - 4; yy += 9) { ctx.fillRect(tx + 1, yy, 1.5, 1.5); ctx.fillRect(tx + tw - 2.5, yy + 4, 1.5, 1.5); }
    };
    const arm = (tx, tw, th, side, at) => {
      const ay = GROUND - th * at, aw = tw * 0.62, ax = side < 0 ? tx - aw * 1.3 : tx + tw + aw * 0.3;
      ctx.fillStyle = body;
      ctx.fillRect(side < 0 ? ax + aw * 0.5 : tx + tw - 2, ay - aw * 0.5, aw * 0.9 + 2, aw);
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ax, ay - th * 0.32, aw, th * 0.32 + aw * 0.5, aw / 2) : ctx.rect(ax, ay - th * 0.32, aw, th * 0.32); ctx.fill();
    };
    if (o.type === 'cluster') {
      const n = w > 60 ? 3 : 2, cw = 18;
      for (let i = 0; i < n; i++) { const th = h - (i % 2) * 12, tx = x + 4 + i * ((w - cw - 8) / Math.max(1, n - 1)); arm(tx, cw, th, i % 2 ? 1 : -1, 0.55); trunk(tx, cw, th); }
    } else {
      const tw = w * 0.62, tx = x + (w - tw) / 2;
      for (const [side, at] of o.arms) arm(tx, tw, h, side, at);
      trunk(tx, tw, h);
    }
    void y;
  }
  function drawFence(o, light) {
    const wood = light > 0.6 ? '#9a6a3a' : '#5a4030', dark = light > 0.6 ? '#6e4824' : '#3a2a20';
    const posts = Math.max(2, Math.round(o.w / 34) + 1);
    ctx.fillStyle = wood;
    ctx.fillRect(o.x, o.y + 6, o.w, 6); ctx.fillRect(o.x, o.y + 19, o.w, 6);
    ctx.fillStyle = dark; ctx.fillRect(o.x, o.y + 10, o.w, 2); ctx.fillRect(o.x, o.y + 23, o.w, 2);
    for (let i = 0; i < posts; i++) {
      const px = o.x + (i * (o.w - 8)) / (posts - 1);
      ctx.fillStyle = wood; ctx.fillRect(px, o.y, 8, o.h + 2);
      ctx.fillStyle = dark; ctx.fillRect(px + 6, o.y + 2, 2, o.h); ctx.beginPath(); ctx.moveTo(px, o.y); ctx.lineTo(px + 4, o.y - 4); ctx.lineTo(px + 8, o.y); ctx.fill();
    }
  }
  function drawBird(o, light) {
    const x = o.x + o.w / 2, y = o.y + Math.sin(o.bob) * 3, wing = Math.sin(o.flap);
    const body = light > 0.6 ? '#5a3a5a' : '#3a2a44';
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 7, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(12, -3); ctx.lineTo(-0, 0); ctx.lineTo(13, 4); ctx.fill();
    ctx.beginPath(); ctx.arc(-13, -3, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(-18, -4); ctx.lineTo(-25, -1); ctx.lineTo(-18, 0); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-14, -4.5, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-14.6, -4.5, 1, 0, TAU); ctx.fill();
    // tail
    ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(13, -2); ctx.lineTo(22, -6); ctx.lineTo(22, 4); ctx.lineTo(13, 3); ctx.fill();
    // wing
    ctx.fillStyle = light > 0.6 ? '#7a527a' : '#4e3a5a';
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(2, -2 - wing * 20, 10, -2 - wing * 16); ctx.lineTo(6, 1); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawCarrot(it) {
    const y = it.y + Math.sin(it.t) * 3;
    ctx.save(); ctx.translate(it.x, y); ctx.rotate(0.35);
    ctx.fillStyle = '#4ade80';
    ctx.beginPath(); ctx.ellipse(-3, -12, 2.4, 6, -0.4, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(3, -12, 2.4, 6, 0.4, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, -13, 2.2, 6.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C.ember; ctx.beginPath(); ctx.moveTo(-6, -7); ctx.quadraticCurveTo(0, -10, 6, -7); ctx.lineTo(0.8, 13); ctx.lineTo(-0.8, 13); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c4601e'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-3.5, -2); ctx.lineTo(0, -1); ctx.moveTo(2, 3); ctx.lineTo(4.5, 2.5); ctx.moveTo(-2, 7); ctx.lineTo(0.5, 7.5); ctx.stroke();
    ctx.restore();
  }
  function drawMule() {
    const x = MULE_X, y = GROUND + S.y;
    const dead = S.phase === 'dead' || S.phase === 'over';
    const duck = S.ducking && S.onGround && !dead;
    const air = !S.onGround && !dead;
    const run = S.phase === 'play' && S.onGround && !dead;
    const t = S.legT;
    const coat = '#9a8878', coatD = '#7a685a', belly = '#c9b8a6', hoof = '#2a201a', mane = '#3a2c24';
    const bodyY = duck ? y - 26 : y - 38 - (run ? Math.abs(Math.sin(t)) * 3 : 0);
    ctx.save();
    if (dead) { ctx.translate(x, y - 30); ctx.rotate(Math.min(1, S.deadT * 3) * -0.25); ctx.translate(-x, -(y - 30)); }
    // legs: [hipX, phase]
    const legs = [[-15, 0], [-11, Math.PI], [13, Math.PI * 0.5], [17, Math.PI * 1.5]];
    legs.forEach(([hx, ph], i) => {
      const back = i < 2, far = i % 2 === 1;
      let a1, a2;
      if (run) { const s = Math.sin(t + ph); a1 = s * 0.75; a2 = Math.max(0, -Math.cos(t + ph)) * (back ? -0.9 : 0.9); }
      else if (air) { a1 = back ? 0.9 : -0.8; a2 = back ? -1.2 : 1.3; }
      else if (duck) { a1 = back ? 0.5 : -0.5; a2 = back ? -1.3 : 1.3; }
      else { a1 = 0; a2 = 0; }
      const L1 = duck ? 12 : 14, L2 = duck ? 10 : 13;
      const kx = x + hx + Math.sin(a1) * L1, ky = bodyY + 8 + Math.cos(a1) * L1;
      const fx = kx + Math.sin(a1 + a2) * L2, fy = ky + Math.cos(a1 + a2) * L2;
      ctx.strokeStyle = far ? coatD : coat; ctx.lineWidth = 6.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + hx, bodyY + 4); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.fillStyle = hoof; ctx.beginPath(); ctx.ellipse(fx, fy + 1, 4, 3, 0, 0, TAU); ctx.fill();
    });
    // tail
    const wag = Math.sin(S.time * (run ? 14 : 4)) * 0.3;
    ctx.strokeStyle = coatD; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 24, bodyY - 4); ctx.quadraticCurveTo(x - 34, bodyY - 2 + wag * 10, x - 33 - wag * 4, bodyY + 12); ctx.stroke();
    ctx.fillStyle = mane; ctx.beginPath(); ctx.ellipse(x - 33 - wag * 4, bodyY + 14, 3.5, 6, wag, 0, TAU); ctx.fill();
    // body
    ctx.fillStyle = coat; ctx.beginPath(); ctx.ellipse(x, bodyY, 26, duck ? 11 : 14, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(x + 2, bodyY + (duck ? 5 : 7), 18, duck ? 4.5 : 6, 0, 0, TAU); ctx.fill();
    // saddle blanket
    ctx.fillStyle = C.ember; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 12, bodyY - (duck ? 11 : 14), 22, duck ? 13 : 16, 4) : ctx.rect(x - 12, bodyY - 14, 22, 16); ctx.fill();
    ctx.fillStyle = C.gold; ctx.fillRect(x - 12, bodyY + (duck ? 0 : 0), 22, 2.5);
    ctx.fillStyle = '#1b0d03'; ctx.font = `800 7px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VM', x - 1, bodyY - (duck ? 5 : 6));
    // neck + head
    const hx = duck ? x + 32 : x + 24, hy = duck ? bodyY - 4 : bodyY - 24;
    ctx.fillStyle = coat;
    ctx.beginPath(); ctx.moveTo(x + 12, bodyY - 8); ctx.lineTo(hx - 4, hy - 6); ctx.lineTo(hx + 4, hy + 4); ctx.lineTo(x + 22, bodyY + 4); ctx.closePath(); ctx.fill();
    // mane
    ctx.fillStyle = mane;
    if (!duck) for (let i = 0; i < 4; i++) { const f = i / 4; ctx.beginPath(); ctx.ellipse(x + 12 + (hx - x - 14) * f, bodyY - 10 + (hy - bodyY + 6) * f, 3, 4.5, 0.6, 0, TAU); ctx.fill(); }
    // ears (long, the mule's trademark)
    const earBack = duck ? 1.2 : air ? 0.55 : 0.2 + Math.sin(S.time * (run ? 10 : 2)) * 0.08;
    for (const [ex, extra] of [[-3, 0.18], [3, 0]]) {
      ctx.save(); ctx.translate(hx + ex, hy - 8); ctx.rotate(-earBack - extra);
      ctx.fillStyle = ex < 0 ? coatD : coat; ctx.beginPath(); ctx.ellipse(0, -11, 3.6, 12, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8a8a0'; ctx.beginPath(); ctx.ellipse(0.4, -11, 1.5, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = mane; ctx.beginPath(); ctx.ellipse(0, -21, 2.4, 3, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // head
    ctx.fillStyle = coat; ctx.beginPath(); ctx.ellipse(hx + 3, hy - 2, 11, 9, 0.35, 0, TAU); ctx.fill();
    ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(hx + 13, hy + 4, 7.5, 6, 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a4a40'; ctx.beginPath(); ctx.ellipse(hx + 16, hy + 3, 1.4, 1.1, 0, 0, TAU); ctx.fill();
    // eye
    if (dead) {
      ctx.strokeStyle = '#1b0d03'; ctx.lineWidth = 1.6; ctx.beginPath();
      ctx.moveTo(hx + 1, hy - 7); ctx.lineTo(hx + 6, hy - 2); ctx.moveTo(hx + 6, hy - 7); ctx.lineTo(hx + 1, hy - 2); ctx.stroke();
    } else if (S.blinkT < 0) {
      ctx.strokeStyle = '#1b0d03'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(hx + 1, hy - 4); ctx.lineTo(hx + 7, hy - 4); ctx.stroke();
    } else {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(hx + 4, hy - 4.5, 3.6, 4.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1b0d03'; ctx.beginPath(); ctx.arc(hx + 5, hy - 4, 2.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx + 5.8, hy - 5, 0.8, 0, TAU); ctx.fill();
    }
    // cheek blush
    ctx.fillStyle = 'rgba(255,138,61,0.35)'; ctx.beginPath(); ctx.ellipse(hx + 6, hy + 3, 3, 2, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function draw() {
    if (!ctx || !S) return;
    const k = sc * dpr;
    const cyc = ((S.dist / PX_PER_M) / CYCLE_M + 0.12) % 1;
    const [skyT, skyB, farC, midC, nearC, groundC, light] = palette(cyc);
    let ox = 0, oy = 0; if (S.shake > 0.2 && !S.paused) { ox = rnd(-1, 1) * S.shake; oy = rnd(-1, 1) * S.shake; }
    ctx.setTransform(k, 0, 0, k, ox * k, oy * k); ctx.globalAlpha = 1;
    const sg = ctx.createLinearGradient(0, 0, 0, GROUND); sg.addColorStop(0, skyT); sg.addColorStop(1, skyB);
    ctx.fillStyle = sg; ctx.fillRect(-12, -12, W + 24, H + 24);
    // stars at night
    const night = clamp((0.75 - light) / 0.5, 0, 1);
    if (night > 0.01) {
      ctx.fillStyle = '#fff';
      for (const s of stars) { ctx.globalAlpha = night * s.b * (0.6 + 0.4 * Math.sin(S.time * s.f + s.p)); ctx.fillRect(s.x, s.y, s.s, s.s); }
      ctx.globalAlpha = 1;
    }
    // sun / moon: sun rises through the day, the moon through the night
    const sunP = cyc / 0.58, moonP = (cyc - 0.56) / 0.42;
    if (sunP >= 0 && sunP <= 1) {
      const sx = 120 + sunP * 720, sy = 250 - Math.sin(sunP * Math.PI) * 190;
      const grd = ctx.createRadialGradient(sx, sy, 4, sx, sy, 70); grd.addColorStop(0, 'rgba(255,240,200,0.9)'); grd.addColorStop(0.3, 'rgba(255,200,97,0.35)'); grd.addColorStop(1, 'rgba(255,200,97,0)');
      ctx.fillStyle = grd; ctx.fillRect(sx - 70, sy - 70, 140, 140);
      ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(sx, sy, 20, 0, TAU); ctx.fill();
    }
    if (moonP >= 0 && moonP <= 1) {
      const mx = 140 + moonP * 680, my = 240 - Math.sin(moonP * Math.PI) * 180;
      ctx.fillStyle = 'rgba(240,235,220,0.95)'; ctx.beginPath(); ctx.arc(mx, my, 15, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(200,195,185,0.6)'; ctx.beginPath(); ctx.arc(mx - 4, my - 3, 3, 0, TAU); ctx.arc(mx + 5, my + 4, 2.2, 0, TAU); ctx.fill();
    }
    // clouds by day
    if (light > 0.4) {
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (light - 0.4) / 0.6})`;
      for (const c of clouds) {
        const cx = ((c.x - S.scroll * 0.08) % (W + 300) + W + 300) % (W + 300) - 150;
        ctx.beginPath(); ctx.ellipse(cx, c.y, c.w, c.h, 0, 0, TAU); ctx.ellipse(cx - c.w * 0.5, c.y + 4, c.w * 0.6, c.h * 0.7, 0, 0, TAU); ctx.ellipse(cx + c.w * 0.55, c.y + 5, c.w * 0.5, c.h * 0.65, 0, 0, TAU); ctx.fill();
      }
    }
    // parallax layers
    mesa(S.scroll * 0.06, farC);
    hill(S.scroll * 0.18, 286, 26, 0.006, 0.013, midC);
    hill(S.scroll * 0.42 + 900, 312, 16, 0.009, 0.021, nearC);
    // ground
    ctx.fillStyle = groundC; ctx.fillRect(-12, GROUND, W + 24, H - GROUND + 12);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-12, GROUND, W + 24, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-12, GROUND - 1, W + 24, 1);
    const gOff = S.scroll % 48;
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let x = -gOff; x < W + 48; x += 48) { ctx.fillRect(x, GROUND + 14, 10, 2); ctx.fillRect(x + 24, GROUND + 34, 6, 2); ctx.fillRect(x + 34, GROUND + 56, 14, 2); }
    const pOff = (S.scroll * 1.0) % 230;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let x = -pOff; x < W + 230; x += 230) { ctx.beginPath(); ctx.ellipse(x + 40, GROUND + 22, 4, 2.5, 0, 0, TAU); ctx.ellipse(x + 150, GROUND + 46, 3, 2, 0, 0, TAU); ctx.fill(); }
    // tufts of grass on the horizon line
    ctx.fillStyle = light > 0.6 ? '#7a8a3a' : '#3a4030';
    const tOff = S.scroll % 140;
    for (let x = -tOff; x < W + 140; x += 140) { ctx.fillRect(x + 20, GROUND - 4, 2, 5); ctx.fillRect(x + 24, GROUND - 6, 2, 7); ctx.fillRect(x + 28, GROUND - 3, 2, 4); }
    // shadows
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const shW = 30 * (1 - Math.min(0.5, -S.y / 300));
    ctx.beginPath(); ctx.ellipse(MULE_X + 2, GROUND + 3, shW, 4, 0, 0, TAU); ctx.fill();
    for (const o of S.obs) if (o.type !== 'bird') { ctx.beginPath(); ctx.ellipse(o.x + o.w / 2 + 6, GROUND + 3, o.w / 2 + 4, 3.5, 0, 0, TAU); ctx.fill(); }
    // items + obstacles
    for (const it of S.items) drawCarrot(it);
    for (const o of S.obs) { if (o.type === 'bird') drawBird(o, light); else if (o.type === 'fence') drawFence(o, light); else drawCactus(o, light); }
    // dust + particles behind and in front
    for (const p of S.parts) {
      const f = 1 - p.t / p.life; ctx.globalAlpha = f * (p.color === 'dust' ? 0.5 : 1);
      ctx.fillStyle = p.color === 'dust' ? (light > 0.6 ? '#e8d0a0' : '#8a7a6a') : p.color;
      if (p.color === 'dust') { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - f * 0.5), 0, TAU); ctx.fill(); } else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    drawMule();
    // night tint over the world for mood (keeps sprites readable)
    if (night > 0.01) { ctx.fillStyle = `rgba(10,12,40,${0.22 * night})`; ctx.fillRect(-12, -12, W + 24, H + 24); }
    for (const t of S.texts) { ctx.globalAlpha = Math.min(1, 2 * (1 - t.t / t.life)); txt(t.s, t.x, t.y, 14, t.color, 800); }
    ctx.globalAlpha = 1;
    // HUD
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const hudC = light > 0.6 ? '#2a1a10' : C.fg;
    if (S.phase !== 'ready') {
      const pulse = S.flash > 0 && Math.floor(S.flash * 10) % 2 === 0;
      txt(String(meters()).padStart(5, '0') + ' m', W - 22, 30, 22, pulse ? C.ember : hudC, 800, 'right', light > 0.6 ? false : true);
      txt('🥕 ' + S.carrots + '   SCORE ' + score() + '   BEST ' + best, W - 22, 58, 12, hudC, 600, 'right', false);
      txt(Math.round(S.speed / START_SPEED * 10) / 10 + 'x', 22, 30, 13, hudC, 700, 'left', false);
    }
    if (S.phase === 'ready') {
      ctx.fillStyle = 'rgba(14,12,11,0.35)'; ctx.fillRect(0, 0, W, H);
      txt('MULE RUN', W / 2, 112, 56, C.ember, 800);
      txt('Press Space or ↑ to start running', W / 2, 168, 18, C.fg, 700);
      txt('↑/Space jump (hold for higher)  ·  ↓ duck  ·  P pause', W / 2, 198, 13, '#f3e6d8', 600);
      if (best) txt('BEST ' + best, W / 2, 228, 14, C.gold, 700);
    } else if (S.phase === 'over') {
      ctx.fillStyle = 'rgba(14,12,11,0.45)'; ctx.fillRect(0, 0, W, H);
      txt('OUCH!', W / 2, 110, 50, C.red, 800);
      txt(meters() + ' m  +  ' + S.carrots + ' carrots  =  ' + score(), W / 2, 162, 20, C.fg, 700);
      if (S.newHi) txt('New best!', W / 2, 192, 17, C.gold, 800);
      if (S.overT > 0.5) txt('Press Space or Enter to run again', W / 2, 224, 14, '#f3e6d8', 600);
    } else if (S.paused) {
      ctx.fillStyle = 'rgba(14,12,11,0.55)'; ctx.fillRect(0, 0, W, H);
      txt('PAUSED', W / 2, 150, 44, C.gold, 800);
      txt('Press P, Enter or Space to resume', W / 2, 196, 14, '#f3e6d8', 600);
    }
  }

  /* ---------- layout / ui ---------- */
  function fit() {
    if (!el || !cv || el.offsetParent === null) return;
    const top = cv.parentNode.getBoundingClientRect().top;
    const availH = Math.max(200, window.innerHeight - top - 40 - 70);
    const availW = Math.max(280, el.clientWidth);
    const s = Math.max(0.3, Math.min(availW / W, availH / H, 1.25));
    const nd = window.devicePixelRatio || 1;
    if (Math.abs(s - sc) < 0.002 && nd === dpr && cv.width > 300) return;
    sc = s; dpr = nd;
    cv.style.width = Math.round(W * sc) + 'px'; cv.style.height = Math.round(H * sc) + 'px';
    cv.width = Math.round(W * sc * dpr); cv.height = Math.round(H * sc * dpr);
    draw();
  }
  function syncUI() {
    if (!ui.score || !S) return;
    ui.score.textContent = score(); ui.best.textContent = best; ui.dist.textContent = meters() + ' m'; ui.carrots.textContent = S.carrots;
    ui.pause.textContent = S.paused ? 'Resume' : 'Pause'; ui.pause.disabled = S.phase !== 'play';
  }
  function keyName(e) {
    let k = e.key;
    if (k === ' ' || k === 'Spacebar') return 'Space';
    if (!k || k === 'Unidentified') { k = e.code || ''; if (k.startsWith('Key')) return k.slice(3).toLowerCase(); return k; }
    return k.length === 1 ? k.toLowerCase() : k;
  }
  function onKeyDown(e) {
    if (!el || el.offsetParent === null || !S) return;
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = keyName(e);
    if (!USED.has(k)) return;
    e.preventDefault(); ensureAudio();
    const first = !keys[k] && !e.repeat; keys[k] = true;
    if (!first) return;
    const isJump = k === 'Space' || k === 'ArrowUp' || k === 'w' || k === 'x';
    if (k === 'p' || k === 'Escape') { if (S.phase === 'play') setPaused(!S.paused); return; }
    if (S.phase === 'ready') { if (isJump || k === 'Enter') { startGame(); if (isJump) S.buffer = 0.12; } return; }
    if (S.phase === 'over') { if ((isJump || k === 'Enter') && S.overT > 0.5) startGame(); return; }
    if (S.phase !== 'play') return;
    if (S.paused) { if (k === 'Enter' || k === 'Space') setPaused(false); return; }
    if (k === 'Enter') { setPaused(true); return; }
    if (isJump) S.buffer = 0.12;
  }
  function onKeyUp(e) { const k = keyName(e); if (k in keys) keys[k] = false; }

  function mount(container, theApi) {
    if (el) unmount();
    el = container; api = theApi || { load: () => null, save() {}, sound: false, toast() {} };
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    let b = null, bd = null, sv = null;
    try { b = api.load('best'); bd = api.load('bestDist'); sv = api.load('sound'); } catch (e) { /* ignore */ }
    best = typeof b === 'number' && isFinite(b) ? b : 0;
    bestDist = typeof bd === 'number' && isFinite(bd) ? bd : 0;
    soundOn = !!api.sound && sv !== false;
    for (const kk in keys) delete keys[kk];
    acc = 0;
    stars = []; for (let i = 0; i < 90; i++) stars.push({ x: rnd(0, W), y: rnd(0, 250), s: Math.random() < 0.2 ? 2 : 1, b: rnd(0.3, 1), f: rnd(1, 3), p: rnd(0, TAU) });
    clouds = []; for (let i = 0; i < 5; i++) clouds.push({ x: rnd(0, W + 300), y: rnd(40, 150), w: rnd(30, 60), h: rnd(10, 16) });
    root = document.createElement('div'); root.className = 'ag-' + ID;
    root.innerHTML = `
      <div class="ag-top">
        <div class="ag-title"><h2>Mule <em>Run</em></h2><p class="ag-how">Jump the cacti and fences, duck the hawks, grab carrots. The trail gets faster the farther you go.</p></div>
        <div class="ag-stats">
          <div class="ag-stat"><span>Distance</span><b data-k="dist">0 m</b></div>
          <div class="ag-stat"><span>Carrots</span><b data-k="carrots">0</b></div>
          <div class="ag-stat"><span>Score</span><b data-k="score">0</b></div>
          <div class="ag-stat hi"><span>Best</span><b data-k="best">0</b></div>
        </div>
        <div class="ag-btns">
          <button class="btn pri small" data-a="new">New run</button>
          <button class="btn sec small" data-a="pause">Pause</button>
          <button class="btn sec small" data-a="sound" title="Toggle sound"></button>
        </div>
      </div>
      <div class="ag-stage"><canvas aria-label="Mule Run trail" tabindex="-1"></canvas></div>
      <div class="ag-bottom">
        <div class="ag-keys"><kbd>Space</kbd>/<kbd>↑</kbd> jump (hold for a higher jump) · <kbd>↓</kbd> duck, or drop fast in the air · <kbd>P</kbd> pause · <kbd>Enter</kbd> start<br>Score = meters run + ${CARROT_PTS} per carrot.</div>
        <details><summary>Tips</summary><ul>
          <li>Tap for a short hop over small cacti; hold for the tall ones and long fences.</li>
          <li>Press ↓ in mid-air to drop fast and be ready for the next obstacle sooner.</li>
          <li>Low hawks must be jumped; middle hawks must be ducked; high hawks fly safely overhead (unless you jump into them).</li>
          <li>Carrot arcs over an obstacle trace a perfect jump. Follow them.</li>
          <li>You can press jump a split second before landing and it still counts.</li>
        </ul></details>
      </div>`;
    el.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d');
    FONT = (getComputedStyle(root).getPropertyValue('--display').trim()) || 'system-ui';
    ui = { score: root.querySelector('[data-k=score]'), best: root.querySelector('[data-k=best]'), dist: root.querySelector('[data-k=dist]'), carrots: root.querySelector('[data-k=carrots]'),
      pause: root.querySelector('[data-a=pause]'), sound: root.querySelector('[data-a=sound]') };
    const setSoundLabel = () => { ui.sound.textContent = soundOn ? '🔊' : '🔇'; };
    setSoundLabel();
    on(root.querySelector('[data-a=new]'), 'click', (e) => { e.currentTarget.blur(); ensureAudio(); startGame(); });
    on(ui.pause, 'click', (e) => { e.currentTarget.blur(); setPaused(!S.paused); });
    on(ui.sound, 'click', (e) => { e.currentTarget.blur(); soundOn = !soundOn; setSoundLabel(); try { api.save('sound', soundOn); } catch (er) { /* ignore */ } if (soundOn) ensureAudio(); });
    on(cv, 'pointerdown', () => {
      ensureAudio();
      if (S.phase === 'play' && S.paused) setPaused(false);
      else if (S.phase === 'ready' || (S.phase === 'over' && S.overT > 0.5)) startGame();
      else if (S.phase === 'play') S.buffer = 0.12;
    });
    on(window, 'keydown', onKeyDown);
    on(window, 'keyup', onKeyUp);
    on(window, 'resize', fit);
    on(window, 'blur', () => { for (const kk in keys) keys[kk] = false; if (S && el && S.phase === 'play' && !S.paused) { S.paused = true; S.autoPaused = true; syncUI(); if (visible()) draw(); } });
    on(document, 'visibilitychange', () => { if (document.hidden) autoPause(); else if (S && S.phase !== 'play') kick(); });
    if (window.ResizeObserver) { ro = new ResizeObserver(() => { fit(); if (S && S.phase !== 'play') kick(); }); ro.observe(el); }
    newGame(); fit(); draw(); kick();
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
    listeners.length = 0;
    if (ro) { ro.disconnect(); ro = null; }
    if (AC) { try { AC.close(); } catch (e) { /* ignore */ } AC = null; NOISE = null; }
    if (el) el.innerHTML = '';
    el = null; root = null; cv = null; ctx = null; ui = {}; S = null;
  }

  window.VanArcade = window.VanArcade || {};
  window.VanArcade[ID] = {
    mount, unmount,
    _debug: { get S() { return S; }, get raf() { return raf; }, start: () => startGame(), step: (n) => { for (let i = 0; i < (n || 1); i++) step(STEP); draw(); }, spawn: () => spawn(), keys, sim: (n) => { for (let i = 0; i < n; i++) step(STEP); } },
  };
})();
