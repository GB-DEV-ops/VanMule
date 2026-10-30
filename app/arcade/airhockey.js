/* VanMule Arcade: Air Hockey - neon table, mouse / keyboard mallet, CPU (3 levels) or 2 players.
   window.VanArcade.airhockey.mount(el, api) / unmount() */
(function () {
  'use strict';
  const ID = 'airhockey';
  const TW = 1000, TH = 560, PAD = 20;      // table units
  const GH = 92;                            // half goal mouth
  const CR = 70;                            // corner radius
  const RP = 22, RM = 36;                   // puck / mallet radius
  const REST = 0.9, HIT_E = 0.86;           // wall / mallet restitution
  const MAXP = 2100, MAXM = 3400;           // max puck / mallet speed (units/s)
  const KSPD = 980, KACC = 7600;            // keyboard mallet
  const WIN_SCORE = 7;
  const CY = TH / 2;
  const LV = {
    easy: { label: 'Easy', speed: 560, accel: 2600, err: 70, think: 0.2, predict: 0, strike: 0.62, attackMax: 520 },
    medium: { label: 'Medium', speed: 900, accel: 4400, err: 28, think: 0.09, predict: 1, strike: 0.85, attackMax: 900 },
    hard: { label: 'Hard', speed: 1380, accel: 8200, err: 6, think: 0.03, predict: 4, strike: 1.05, attackMax: 9999 },
  };
  const LV_KEYS = ['easy', 'medium', 'hard'];
  const C1 = '#ff8a3d', C2 = '#6fd3c7';

  const CSS = `
.ag-airhockey{color:var(--fg);font-family:var(--body);user-select:none;-webkit-user-select:none;max-width:1100px;margin:0 auto}
.ag-airhockey .hd{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.ag-airhockey .ttl{flex:1;min-width:240px}
.ag-airhockey h2{font-family:var(--display);font-size:26px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-airhockey h2 span{color:var(--ember)}
.ag-airhockey .how{color:var(--muted);font-size:13px;margin-top:3px}
.ag-airhockey .sbd{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:6px 14px}
.ag-airhockey .sb{text-align:center;min-width:70px}
.ag-airhockey .sb b{display:block;font-size:10px;letter-spacing:1.4px;color:var(--muted);text-transform:uppercase}
.ag-airhockey .sb i{display:block;font-style:normal;font-family:var(--display);font-weight:800;font-size:28px;line-height:1.1}
.ag-airhockey .sb.p1 i{color:#ff8a3d;text-shadow:0 0 14px rgba(255,138,61,.55)}
.ag-airhockey .sb.p2 i{color:#6fd3c7;text-shadow:0 0 14px rgba(111,211,199,.55)}
.ag-airhockey .sb i.pop{animation:agahpop .45s ease-out}
@keyframes agahpop{0%{transform:scale(1.6)}100%{transform:scale(1)}}
.ag-airhockey .to{font-family:var(--mono);color:var(--dim);font-size:11px;text-align:center;line-height:1.2}
.ag-airhockey .bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.ag-airhockey .seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px}
.ag-airhockey .seg button{height:28px;padding:0 10px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-airhockey .seg button:hover{color:var(--fg)}
.ag-airhockey .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-airhockey .seg.dis{opacity:.35;pointer-events:none}
.ag-airhockey .sp{flex:1}
.ag-airhockey .rec{font-size:12px;color:var(--dim);font-family:var(--mono)}
.ag-airhockey .stage{line-height:0;display:flex;justify-content:center}
.ag-airhockey canvas{display:block;border-radius:18px;background:#05070c;box-shadow:0 0 0 1px var(--line),0 18px 44px rgba(0,0,0,.5);touch-action:none}
.ag-airhockey canvas.play{cursor:none}
.ag-airhockey .foot{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-top:10px}
.ag-airhockey .keys{flex:1;min-width:260px;font-size:12px;color:var(--dim);line-height:1.8}
.ag-airhockey kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-airhockey details{flex:1;min-width:260px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--muted)}
.ag-airhockey summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-airhockey details ul{margin:6px 0 2px;padding-left:18px}
.ag-airhockey details li{margin:3px 0}
`;

  let el = null, api = null, root = null, cv = null, ctx = null, ui = {};
  let raf = 0, lastT = 0, ro = null, dpr = 1, sc = 1, S = null, AC = null, soundOn = true, tableCv = null, fontFam = 'system-ui';
  let opts = { mode: 'cpu', level: 'medium' }, stats = {}, best = null;
  const listeners = [];
  const keys = new Set();
  const mouse = { x: TW * 0.2, y: CY, active: false };
  let ctrl = 'mouse'; // last used control for player 1
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };
  const visible = () => !!(el && !document.hidden && el.offsetParent !== null);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------- sound ---------- */
  function ensureAudio() { if (!soundOn || AC) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  function tone(type, f1, f2, dur, vol, at) {
    if (!AC || !soundOn) return;
    try {
      const t = AC.currentTime + (at || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.setValueAtTime(f1, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  let lastHitSnd = 0, lastWallSnd = 0;
  function sfx(k, v) {
    if (!AC || !soundOn) return;
    const now = AC.currentTime;
    if (k === 'hit') { if (now - lastHitSnd < 0.05) return; lastHitSnd = now; const q = clamp(v / MAXP, 0.1, 1); tone('triangle', 300 + q * 500, 160, 0.07, 0.05 + q * 0.07); tone('square', 120, 60, 0.04, 0.03 * q); }
    else if (k === 'wall') { if (now - lastWallSnd < 0.06) return; lastWallSnd = now; const q = clamp(v / MAXP, 0.1, 1); tone('sine', 520 + q * 300, 380, 0.05, 0.03 + q * 0.04); }
    else if (k === 'goal') { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, 0, 0.12, 0.05, i * 0.07)); tone('sawtooth', 90, 45, 0.45, 0.05); }
    else if (k === 'conceded') { [440, 370, 311].forEach((f, i) => tone('triangle', f, 0, 0.14, 0.06, i * 0.09)); }
    else if (k === 'win') { [523, 659, 784, 1046, 1318].forEach((f, i) => tone('triangle', f, 0, 0.18, 0.07, i * 0.1)); }
    else if (k === 'lose') { [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, 0, 0.2, 0.06, i * 0.13)); }
    else if (k === 'start') { tone('sine', 660, 990, 0.12, 0.05); }
    else if (k === 'click') { tone('sine', 700, 0, 0.04, 0.03); }
  }

  /* ---------- game state ---------- */
  function names() { return opts.mode === 'cpu' ? ['You', 'CPU'] : ['Player 1', 'Player 2']; }
  function newGame() {
    S = {
      phase: 'ready', paused: false, autoPaused: false, time: 0,
      p: { x: TW / 2, y: CY, vx: 0, vy: 0 },
      m: [{ x: 110, y: CY, vx: 0, vy: 0 }, { x: TW - 110, y: CY, vx: 0, vy: 0 }],
      kv: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
      score: [0, 0], trail: [], parts: [], rings: [], flash: 0, flashC: C1, shake: 0, goalT: 0, lastGoal: -1, lastHit: -1,
      ai: { t: 0, tx: TW - 110, ty: CY, mode: 'def', atk: 0, aim: 0 }, slowT: 0, winner: -1, banner: 0,
    };
    S.p.vx = (Math.random() < 0.5 ? -1 : 1) * 40; S.p.vy = (Math.random() - 0.5) * 60;
    mouse.x = 110; mouse.y = CY;
    syncUI(); draw();
  }
  function start() {
    if (!S) return;
    if (S.phase === 'over') newGame();
    if (S.phase === 'ready') { S.phase = 'play'; S.time = 0; sfx('start'); syncUI(); kick(); }
  }
  function serve(toSide) {
    S.p.x = toSide === 0 ? TW * 0.25 : TW * 0.75; S.p.y = CY + (Math.random() - 0.5) * 80; S.p.vx = 0; S.p.vy = 0;
    S.trail.length = 0; S.lastHit = -1; S.slowT = 0;
    // push mallets out of the puck's spawn spot
    for (const m of S.m) { const dx = m.x - S.p.x, dy = m.y - S.p.y, d = Math.hypot(dx, dy); if (d < RP + RM + 4) { const n = d > 0.01 ? 1 / d : 0; m.x = S.p.x + (d > 0.01 ? dx * n : (m === S.m[0] ? -1 : 1)) * (RP + RM + 6); m.y = S.p.y + (d > 0.01 ? dy * n : 0) * (RP + RM + 6); clampMallet(m, m === S.m[0] ? 0 : 1); } }
    S.m[1].vx = S.m[1].vy = 0; S.ai.t = 0.35; S.ai.atk = 0;
  }
  function goal(scorer) {
    S.score[scorer]++; S.lastGoal = scorer; S.trail.length = 0; S.phase = 'goal'; S.goalT = 1.5;
    S.flash = 1; S.flashC = scorer === 0 ? C1 : C2; S.shake = 1;
    const gx = scorer === 0 ? TW : 0;
    for (let i = 0; i < 70; i++) {
      const a = (scorer === 0 ? Math.PI : 0) + (Math.random() - 0.5) * 2.4, v = 200 + Math.random() * 700;
      S.parts.push({ x: gx, y: CY + (Math.random() - 0.5) * GH * 1.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.6 + Math.random() * 0.7, c: Math.random() < 0.3 ? '#ffffff' : S.flashC, s: 2 + Math.random() * 4 });
    }
    S.rings.push({ x: gx, y: CY, t: 0, c: S.flashC });
    if (opts.mode === 'cpu' && scorer === 1) sfx('conceded'); else sfx('goal');
    const i = ui['s' + (scorer + 1)]; if (i) { i.classList.remove('pop'); void i.offsetWidth; i.classList.add('pop'); }
    if (S.score[scorer] >= WIN_SCORE) { S.winner = scorer; S.goalT = 1.1; }
    syncUI();
  }
  function finish() {
    S.phase = 'over'; S.banner = 0;
    if (opts.mode === 'cpu') {
      const st = stats[opts.level] || (stats[opts.level] = { w: 0, l: 0 });
      if (S.winner === 0) {
        st.w++; sfx('win');
        const rank = LV_KEYS.indexOf(opts.level) * 100 + (WIN_SCORE - S.score[1]) * 10;
        if (!best || rank > best.rank) {
          best = { rank, txt: WIN_SCORE + '-' + S.score[1] + ' ' + LV[opts.level].label };
          try { api.save('best', best.txt); api.save('bestRank', best.rank); } catch (e) { /* ignore */ }
          S.newBest = true;
        }
      } else { st.l++; sfx('lose'); }
      try { api.save('stats', stats); } catch (e) { /* ignore */ }
    } else sfx('win');
    syncUI(); kick();
  }

  /* ---------- physics ---------- */
  function clampMallet(m, side) {
    const xmin = side === 0 ? RM : TW / 2 + RM, xmax = side === 0 ? TW / 2 - RM : TW - RM;
    m.x = clamp(m.x, xmin, xmax); m.y = clamp(m.y, RM, TH - RM);
    // rounded corners
    const cx = m.x < CR ? CR : m.x > TW - CR ? TW - CR : null, cy = m.y < CR ? CR : m.y > TH - CR ? TH - CR : null;
    if (cx !== null && cy !== null) {
      const dx = m.x - cx, dy = m.y - cy, d = Math.hypot(dx, dy), lim = CR - RM;
      if (d > lim) { m.x = cx + dx / d * lim; m.y = cy + dy / d * lim; }
    }
  }
  function puckWalls(p) {
    let hit = 0;
    const sp = Math.hypot(p.vx, p.vy);
    if (p.y < RP) { p.y = RP; if (p.vy < 0) { p.vy = -p.vy * REST; hit = 1; } }
    else if (p.y > TH - RP) { p.y = TH - RP; if (p.vy > 0) { p.vy = -p.vy * REST; hit = 1; } }
    const inMouth = Math.abs(p.y - CY) < GH;
    if (!inMouth || (p.x > 0 && p.x < TW)) {
      if (!inMouth) {
        if (p.x < RP) { p.x = RP; if (p.vx < 0) { p.vx = -p.vx * REST; hit = 1; } }
        else if (p.x > TW - RP) { p.x = TW - RP; if (p.vx > 0) { p.vx = -p.vx * REST; hit = 1; } }
      }
    }
    // corners
    const cx = p.x < CR ? CR : p.x > TW - CR ? TW - CR : null, cy = p.y < CR ? CR : p.y > TH - CR ? TH - CR : null;
    if (cx !== null && cy !== null) {
      const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy), lim = CR - RP;
      if (d > lim) {
        const nx = dx / d, ny = dy / d; p.x = cx + nx * lim; p.y = cy + ny * lim;
        const vn = p.vx * nx + p.vy * ny; if (vn > 0) { p.vx -= (1 + REST) * vn * nx; p.vy -= (1 + REST) * vn * ny; hit = 1; }
      }
    }
    // goal posts
    for (const px of [0, TW]) for (const py of [CY - GH, CY + GH]) {
      const dx = p.x - px, dy = p.y - py, d = Math.hypot(dx, dy);
      if (d < RP && d > 0.001) {
        const nx = dx / d, ny = dy / d; p.x = px + nx * RP; p.y = py + ny * RP;
        const vn = p.vx * nx + p.vy * ny; if (vn < 0) { p.vx -= (1 + REST) * vn * nx; p.vy -= (1 + REST) * vn * ny; hit = 1; }
      }
    }
    // inside the goal slot keep it between the posts
    if (p.x < 0 || p.x > TW) { const lim = GH - RP * 0.2; if (Math.abs(p.y - CY) > lim) { p.y = CY + Math.sign(p.y - CY) * lim; p.vy = -p.vy * 0.5; } }
    if (hit) { sfx('wall', sp); if (sp > 500) spark(p.x, p.y, '#cfe9ff', 5); }
  }
  function malletHit(p, m, mvx, mvy, idx) {
    const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy), R = RP + RM;
    if (d >= R) return false;
    let nx, ny;
    if (d < 0.001) { nx = idx === 0 ? 1 : -1; ny = 0; } else { nx = dx / d; ny = dy / d; }
    p.x = m.x + nx * R; p.y = m.y + ny * R;
    const rvx = p.vx - mvx, rvy = p.vy - mvy, vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      p.vx -= (1 + HIT_E) * vn * nx; p.vy -= (1 + HIT_E) * vn * ny;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > MAXP) { p.vx *= MAXP / sp; p.vy *= MAXP / sp; }
      if (S.lastHit !== idx || -vn > 150) { sfx('hit', -vn); if (-vn > 600) spark(p.x - nx * RP, p.y - ny * RP, idx === 0 ? C1 : C2, 8); }
      S.lastHit = idx;
    }
    return true;
  }
  function spark(x, y, c, n) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 260; S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.25 + Math.random() * 0.25, c, s: 1.5 + Math.random() * 2 }); }
  }

  /* ---------- controls ---------- */
  function keyDir(side) {
    let x = 0, y = 0;
    if (side === 0) {
      if (keys.has('ArrowLeft')) x--; if (keys.has('ArrowRight')) x++; if (keys.has('ArrowUp')) y--; if (keys.has('ArrowDown')) y++;
      if (opts.mode === 'cpu') { if (keys.has('KeyA')) x--; if (keys.has('KeyD')) x++; if (keys.has('KeyW')) y--; if (keys.has('KeyS')) y++; }
    } else { if (keys.has('KeyA')) x--; if (keys.has('KeyD')) x++; if (keys.has('KeyW')) y--; if (keys.has('KeyS')) y++; }
    x = clamp(x, -1, 1); y = clamp(y, -1, 1);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }
  function keyTarget(side, dt) {
    const m = S.m[side], kv = S.kv[side], d = keyDir(side);
    const ax = d.x * KSPD - kv.x, ay = d.y * KSPD - kv.y, al = Math.hypot(ax, ay), lim = KACC * dt * (d.x || d.y ? 1 : 1.6);
    if (al > lim) { kv.x += ax / al * lim; kv.y += ay / al * lim; } else { kv.x += ax; kv.y += ay; }
    return { x: m.x + kv.x * dt, y: m.y + kv.y * dt };
  }
  function predictY(p, xLine, bounces) {
    if (p.vx <= 1) return p.y;
    const t = (xLine - p.x) / p.vx; let y = p.y + p.vy * t;
    const lo = RP, hi = TH - RP, span = hi - lo;
    for (let i = 0; i < bounces && (y < lo || y > hi); i++) { if (y < lo) y = lo + (lo - y); else if (y > hi) y = hi - (y - hi); }
    if (y < lo || y > hi) { y = ((y - lo) % (2 * span) + 2 * span) % (2 * span); y = lo + (y > span ? 2 * span - y : y); }
    return y;
  }
  function aiThink() {
    const L = LV[opts.level], m = S.m[1], p = S.p, A = S.ai;
    const sp = Math.hypot(p.vx, p.vy), onSide = p.x > TW / 2 - RP * 0.6;
    const homeX = TW - 95;
    const err = () => (Math.random() - 0.5) * 2 * L.err;
    if (onSide && !(p.vx > 380 && L.predict && p.x < TW - 180) && sp < L.attackMax) {
      // attack: line the puck up with the opponent goal and drive through it
      if (A.mode !== 'atk') { A.mode = 'atk'; A.atk = 0; A.aim = (Math.random() - 0.5) * GH * 1.1; A.bank = opts.level === 'hard' && Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0; }
      let gx = 0, gy = CY + A.aim;
      if (A.bank) gy = A.bank < 0 ? -gy + 2 * RP : 2 * (TH - RP) - gy; // aim at mirrored goal = bank shot
      let ux = p.x - gx, uy = p.y - gy; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
      const rx = m.x - p.x, ry = m.y - p.y, rel = rx * ux + ry * uy, lat = -rx * uy + ry * ux;
      const R = RP + RM;
      if (A.atk > 2.4 || (p.x > TW - CR && (p.y < CR || p.y > TH - CR))) { A.tx = p.x - ux * 30; A.ty = p.y - uy * 30; A.strike = true; }
      else if (rel < R * 0.55) { // in front of the puck: go around
        const s = lat >= 0 ? 1 : -1;
        A.tx = p.x + ux * (R + 34) - uy * s * (R + 26); A.ty = p.y + uy * (R + 34) + ux * s * (R + 26); A.strike = false;
      } else if (Math.abs(lat) < 14 + L.err * 0.2 && rel < R + 90) { // aligned: strike through
        A.tx = p.x - ux * 120; A.ty = p.y - uy * 120; A.strike = true;
      } else { A.tx = p.x + ux * (R + 46); A.ty = p.y + uy * (R + 46); A.strike = false; }
      A.tx += err() * 0.3; A.ty += err() * 0.3;
    } else {
      A.mode = 'def'; A.strike = false;
      let ty = p.y;
      if (L.predict && p.vx > 40) ty = predictY(p, homeX, L.predict);
      else if (!L.predict) ty = CY + (p.y - CY) * 0.7;
      ty = CY + clamp(ty - CY, -GH * 1.05, GH * 1.05) + err();
      let tx = homeX;
      if (p.vx < -50 && p.x < TW / 2) tx = homeX - 70; // puck going away: step up a little
      A.tx = tx; A.ty = ty;
    }
  }
  function aiTarget(dt) {
    const L = LV[opts.level], m = S.m[1], A = S.ai;
    A.t -= dt; if (A.mode === 'atk') A.atk += dt;
    if (A.t <= 0) { A.t = L.think; aiThink(); }
    const dx = A.tx - m.x, dy = A.ty - m.y;
    const max = L.speed * (A.strike ? L.strike * 1.5 : 1);
    let dvx = dx * 9, dvy = dy * 9; const dl = Math.hypot(dvx, dvy); if (dl > max) { dvx *= max / dl; dvy *= max / dl; }
    if (A.strike) { const l = Math.hypot(dx, dy) || 1; dvx = dx / l * max; dvy = dy / l * max; }
    const ax = dvx - m.vx, ay = dvy - m.vy, al = Math.hypot(ax, ay), lim = L.accel * dt;
    let vx = m.vx, vy = m.vy;
    if (al > lim) { vx += ax / al * lim; vy += ay / al * lim; } else { vx = dvx; vy = dvy; }
    return { x: m.x + vx * dt, y: m.y + vy * dt };
  }

  /* ---------- update ---------- */
  function update(dt) {
    S.time += dt;
    S.flash = Math.max(0, S.flash - dt * 2.2); S.shake = Math.max(0, S.shake - dt * 3);
    for (const q of S.parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; }
    S.parts = S.parts.filter(q => q.t < q.life);
    for (const r of S.rings) r.t += dt; S.rings = S.rings.filter(r => r.t < 0.8);
    if (S.phase === 'over') { S.banner = Math.min(1, S.banner + dt * 3); return; }
    if (S.phase !== 'play' && S.phase !== 'goal') return;

    // mallet targets
    const tg = [null, null];
    if (ctrl === 'mouse' && mouse.active) {
      const m = S.m[0]; let tx = mouse.x, ty = mouse.y;
      const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy), lim = MAXM * dt;
      if (d > lim) { tx = m.x + dx / d * lim; ty = m.y + dy / d * lim; }
      tg[0] = { x: tx, y: ty }; S.kv[0].x = S.kv[0].y = 0;
    } else tg[0] = keyTarget(0, dt);
    tg[1] = opts.mode === 'cpu' ? aiTarget(dt) : keyTarget(1, dt);
    const prev = S.m.map(m => ({ x: m.x, y: m.y }));
    for (let i = 0; i < 2; i++) { const c = { x: tg[i].x, y: tg[i].y }; clampMallet(c, i); tg[i] = c; }
    const mv = tg.map((t, i) => ({ x: (t.x - prev[i].x) / dt, y: (t.y - prev[i].y) / dt }));

    if (S.phase === 'goal') {
      for (let i = 0; i < 2; i++) { S.m[i].x = tg[i].x; S.m[i].y = tg[i].y; S.m[i].vx = mv[i].x; S.m[i].vy = mv[i].y; }
      S.goalT -= dt;
      if (S.goalT <= 0) {
        if (S.winner >= 0) { finish(); return; }
        S.phase = 'play'; serve(S.lastGoal === 0 ? 1 : 0);
      }
      return;
    }

    const p = S.p, N = Math.max(4, Math.ceil((Math.hypot(p.vx, p.vy) + 3000) * dt / (RP * 0.45)));
    const h = dt / N;
    for (let k = 1; k <= N; k++) {
      const f = k / N;
      for (let i = 0; i < 2; i++) { const m = S.m[i]; m.x = prev[i].x + (tg[i].x - prev[i].x) * f; m.y = prev[i].y + (tg[i].y - prev[i].y) * f; }
      p.x += p.vx * h; p.y += p.vy * h;
      for (let i = 0; i < 2; i++) malletHit(p, S.m[i], mv[i].x, mv[i].y, i);
      puckWalls(p);
      // puck pinned between a mallet and a wall: the mallet gets blocked instead
      for (let i = 0; i < 2; i++) {
        const m = S.m[i], dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy), R = RP + RM;
        if (d < R - 0.5) {
          const nx = d > 0.001 ? dx / d : (i === 0 ? -1 : 1), ny = d > 0.001 ? dy / d : 0;
          m.x = p.x + nx * R; m.y = p.y + ny * R; clampMallet(m, i);
          tg[i].x = m.x; tg[i].y = m.y; prev[i].x = m.x; prev[i].y = m.y; // stop here for the rest of the frame
          if (i === 1) { S.m[1].vx *= 0.3; S.m[1].vy *= 0.3; }
        }
      }
      if (p.x < -RP * 0.7) { goal(1); break; }
      if (p.x > TW + RP * 0.7) { goal(0); break; }
    }
    for (let i = 0; i < 2; i++) { const m = S.m[i]; const nvx = (m.x - prev[i].x) / dt, nvy = (m.y - prev[i].y) / dt; if (i === 1 && opts.mode === 'cpu') { m.vx = clamp(mv[1].x, -4000, 4000); m.vy = clamp(mv[1].y, -4000, 4000); } else { m.vx = nvx; m.vy = nvy; } }
    if (S.phase !== 'play') return;
    // friction and speed cap
    const fr = Math.pow(0.72, dt); p.vx *= fr; p.vy *= fr;
    let sp = Math.hypot(p.vx, p.vy); if (sp > MAXP) { p.vx *= MAXP / sp; p.vy *= MAXP / sp; sp = MAXP; }
    if (sp < 4) { p.vx = 0; p.vy = 0; }
    // dead puck in the neutral middle: nudge it to a side after a while
    if (sp < 25 && Math.abs(p.x - TW / 2) < RP + 4) { S.slowT += dt; if (S.slowT > 2.5) { p.vx = (Math.random() < 0.5 ? -1 : 1) * 90; S.slowT = 0; } } else S.slowT = 0;
    const lt = S.trail[S.trail.length - 1];
    if (!lt || Math.abs(lt.x - p.x) + Math.abs(lt.y - p.y) > 3) S.trail.push({ x: p.x, y: p.y, c: S.lastHit === 1 ? C2 : S.lastHit === 0 ? C1 : '#d8ecff' });
    else if (S.trail.length) S.trail.shift();
    if (S.trail.length > 14) S.trail.shift();
  }

  /* ---------- loop ---------- */
  const animating = () => S && !S.paused && (S.phase === 'play' || S.phase === 'goal' || S.parts.length > 0 || S.flash > 0 || (S.phase === 'over' && S.banner < 1));
  function kick() { if (!raf && el) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    if (!visible()) { autoPause(); return; }
    if (!lastT) lastT = t;
    const dt = Math.min(0.05, Math.max(0.001, (t - lastT) / 1000)); lastT = t;
    if (!S.paused) update(dt);
    draw();
    if (animating()) raf = requestAnimationFrame(frame);
  }
  function autoPause() {
    if (S && (S.phase === 'play' || S.phase === 'goal') && !S.paused) { S.paused = true; S.autoPaused = true; syncUI(); }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function setPaused(v) {
    if (!S || (S.phase !== 'play' && S.phase !== 'goal')) return;
    S.paused = v; S.autoPaused = false; syncUI();
    if (!v) kick(); else if (visible()) draw();
  }

  /* ---------- drawing ---------- */
  function roundedTablePath(g) {
    g.beginPath(); g.moveTo(CR, 0); g.lineTo(TW - CR, 0); g.arcTo(TW, 0, TW, CR, CR); g.lineTo(TW, TH - CR); g.arcTo(TW, TH, TW - CR, TH, CR);
    g.lineTo(CR, TH); g.arcTo(0, TH, 0, TH - CR, CR); g.lineTo(0, CR); g.arcTo(0, 0, CR, 0, CR); g.closePath();
  }
  function railPath(g, side) {
    g.beginPath();
    if (side === 0) {
      g.moveTo(TW / 2, 0); g.lineTo(CR, 0); g.arcTo(0, 0, 0, CR, CR); g.lineTo(0, CY - GH);
      g.moveTo(0, CY + GH); g.lineTo(0, TH - CR); g.arcTo(0, TH, CR, TH, CR); g.lineTo(TW / 2, TH);
    } else {
      g.moveTo(TW / 2, 0); g.lineTo(TW - CR, 0); g.arcTo(TW, 0, TW, CR, CR); g.lineTo(TW, CY - GH);
      g.moveTo(TW, CY + GH); g.lineTo(TW, TH - CR); g.arcTo(TW, TH, TW - CR, TH, CR); g.lineTo(TW / 2, TH);
    }
  }
  function buildTable() {
    const w = cv.width, h = cv.height;
    tableCv = document.createElement('canvas'); tableCv.width = w; tableCv.height = h;
    const g = tableCv.getContext('2d'), k = sc * dpr;
    g.fillStyle = '#05070c'; g.fillRect(0, 0, w, h);
    g.setTransform(k, 0, 0, k, PAD * k, PAD * k);
    // surface
    const bg = g.createRadialGradient(TW / 2, CY, 40, TW / 2, CY, TW * 0.62);
    bg.addColorStop(0, '#111a2a'); bg.addColorStop(1, '#070b13');
    roundedTablePath(g); g.fillStyle = bg; g.fill();
    g.save(); roundedTablePath(g); g.clip();
    // side tints
    let lg = g.createLinearGradient(0, 0, TW, 0);
    lg.addColorStop(0, 'rgba(255,138,61,0.10)'); lg.addColorStop(0.35, 'rgba(255,138,61,0)'); lg.addColorStop(0.65, 'rgba(111,211,199,0)'); lg.addColorStop(1, 'rgba(111,211,199,0.10)');
    g.fillStyle = lg; g.fillRect(0, 0, TW, TH);
    // air holes
    g.fillStyle = 'rgba(190,215,255,0.07)';
    for (let y = 20; y < TH; y += 26) for (let x = 20 + ((y / 26) % 2 ? 13 : 0); x < TW; x += 26) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); }
    // center line + circle
    g.shadowBlur = 14; g.shadowColor = 'rgba(255,90,140,0.9)'; g.strokeStyle = 'rgba(255,110,150,0.75)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(TW / 2, 0); g.lineTo(TW / 2, TH); g.stroke();
    g.beginPath(); g.arc(TW / 2, CY, 78, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,110,150,0.8)'; g.beginPath(); g.arc(TW / 2, CY, 6, 0, Math.PI * 2); g.fill();
    // creases + face-off dots
    for (const [x, c, a0] of [[0, C1, -Math.PI / 2], [TW, C2, Math.PI / 2]]) {
      g.shadowColor = c; g.strokeStyle = c; g.globalAlpha = 0.65; g.lineWidth = 2.5;
      g.beginPath(); g.arc(x, CY, GH + 46, a0, a0 + Math.PI); g.stroke();
      g.globalAlpha = 0.35; g.setLineDash([10, 10]);
      g.beginPath(); g.moveTo(x === 0 ? TW * 0.25 : TW * 0.75, 20); g.lineTo(x === 0 ? TW * 0.25 : TW * 0.75, TH - 20); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;
    }
    // mule mark in the centre circle
    g.shadowBlur = 0; g.globalAlpha = 0.07; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 30px ' + fontFam; g.fillText('VM', TW / 2, CY - 34); g.globalAlpha = 1;
    g.restore();
    // goal slots
    for (const [x, c] of [[0, C1], [TW, C2]]) {
      g.shadowBlur = 22; g.shadowColor = c;
      const gg = g.createLinearGradient(x - 14, 0, x + 14, 0); gg.addColorStop(0, x === 0 ? '#000' : c); gg.addColorStop(1, x === 0 ? c : '#000');
      g.fillStyle = '#000'; g.fillRect(x === 0 ? -PAD + 4 : TW, CY - GH, PAD - 4, GH * 2);
      g.strokeStyle = c; g.lineWidth = 2; g.globalAlpha = 0.6; g.strokeRect(x === 0 ? -PAD + 4 : TW, CY - GH, PAD - 4, GH * 2); g.globalAlpha = 1;
    }
    // neon rails
    for (const [side, c] of [[0, C1], [1, C2]]) {
      g.shadowBlur = 26; g.shadowColor = c; g.strokeStyle = c; g.lineWidth = 7; g.lineCap = 'round';
      railPath(g, side); g.stroke();
      g.shadowBlur = 6; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; railPath(g, side); g.stroke();
    }
    g.shadowBlur = 0;
    // posts
    for (const x of [0, TW]) for (const y of [CY - GH, CY + GH]) { g.fillStyle = '#fff'; g.shadowBlur = 12; g.shadowColor = '#fff'; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
    g.shadowBlur = 0;
  }
  function drawMallet(g, m, c, idx) {
    const glow = idx === 0 ? 'rgba(255,138,61,' : 'rgba(111,211,199,';
    g.save(); g.translate(m.x, m.y);
    g.shadowBlur = 24; g.shadowColor = c;
    g.fillStyle = '#0b0f17'; g.beginPath(); g.arc(0, 0, RM, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = c; g.beginPath(); g.arc(0, 0, RM - 3, 0, Math.PI * 2); g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = 1.5; g.strokeStyle = glow + '0.45)'; g.beginPath(); g.arc(0, 0, RM * 0.7, 0, Math.PI * 2); g.stroke();
    const hg = g.createRadialGradient(-RM * 0.15, -RM * 0.15, 2, 0, 0, RM * 0.46);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.35, c); hg.addColorStop(1, idx === 0 ? '#8a3a0c' : '#1e6b62');
    g.fillStyle = hg; g.beginPath(); g.arc(0, 0, RM * 0.44, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function draw() {
    if (!ctx || !S || !cv.width) return;
    if (!tableCv || tableCv.width !== cv.width || tableCv.height !== cv.height) buildTable();
    const k = sc * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let sx = 0, sy = 0;
    if (S.shake > 0) { sx = (Math.random() - 0.5) * 12 * S.shake * k; sy = (Math.random() - 0.5) * 12 * S.shake * k; }
    ctx.drawImage(tableCv, sx, sy);
    ctx.setTransform(k, 0, 0, k, PAD * k + sx, PAD * k + sy);
    // shockwave rings
    for (const r of S.rings) {
      const f = r.t / 0.8; ctx.globalAlpha = 1 - f; ctx.strokeStyle = r.c; ctx.lineWidth = 6 * (1 - f) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, 30 + f * 340, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // trail
    const tr = S.trail;
    for (let i = 0; i < tr.length - 1; i++) {
      const a = (i + 1) / tr.length; ctx.globalAlpha = a * 0.35; ctx.fillStyle = tr[i].c;
      ctx.beginPath(); ctx.arc(tr[i].x, tr[i].y, RP * (0.45 + a * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // mallets
    drawMallet(ctx, S.m[0], C1, 0); drawMallet(ctx, S.m[1], C2, 1);
    // puck
    if (S.phase !== 'goal' || S.p.x > -RP * 2 && S.p.x < TW + RP * 2) {
      const p = S.p, pc = S.lastHit === 0 ? C1 : S.lastHit === 1 ? C2 : '#bfe0ff';
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.shadowBlur = 22; ctx.shadowColor = pc;
      ctx.fillStyle = '#f4f8ff'; ctx.beginPath(); ctx.arc(0, 0, RP, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = pc; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, RP - 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(20,30,50,0.25)'; ctx.beginPath(); ctx.arc(0, 0, RP * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // particles
    for (const q of S.parts) { ctx.globalAlpha = Math.max(0, 1 - q.t / q.life); ctx.fillStyle = q.c; ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s); }
    ctx.globalAlpha = 1;
    // flash
    if (S.flash > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = S.flash * 0.28; ctx.fillStyle = S.flashC; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1;
      ctx.setTransform(k, 0, 0, k, PAD * k, PAD * k);
    }
    // overlays
    const nm = names();
    if (S.phase === 'goal') {
      const f = 1 - S.goalT / 1.5, s = 1 + Math.max(0, 0.4 - f) * 1.4;
      txt('GOAL!', TW / 2, CY - 30, 84 * s, S.flashC, 800);
      txt((opts.mode === 'cpu' && S.lastGoal === 0 ? 'You score' : nm[S.lastGoal] + ' scores') + ' · ' + S.score[0] + ' – ' + S.score[1], TW / 2, CY + 40, 24, '#f3ece5', 600);
    } else if (S.phase === 'ready') {
      shade(0.5);
      txt('AIR HOCKEY', TW / 2, CY - 70, 64, C1, 800);
      txt('First to ' + WIN_SCORE + ' · ' + (opts.mode === 'cpu' ? 'vs CPU (' + LV[opts.level].label + ')' : '2 players'), TW / 2, CY - 6, 24, '#f3ece5', 600);
      txt('Click, Space or Enter to face off', TW / 2, CY + 44, 20, '#a3968a', 500);
      txt(opts.mode === 'cpu' ? 'Mouse or arrow keys move your orange mallet' : 'Orange: mouse / arrows  ·  Teal: W A S D', TW / 2, CY + 80, 17, '#6f655c', 500);
    } else if (S.phase === 'over') {
      shade(0.6 * S.banner);
      const s = 0.6 + 0.4 * S.banner;
      const youWon = S.winner === 0;
      const head = opts.mode === 'cpu' ? (youWon ? 'YOU WIN!' : 'CPU WINS') : (S.winner === 0 ? 'PLAYER 1 WINS' : 'PLAYER 2 WINS');
      txt(head, TW / 2, CY - 56, 66 * s, S.winner === 0 ? C1 : C2, 800);
      txt(S.score[0] + '  –  ' + S.score[1], TW / 2, CY + 14, 40, '#f3ece5', 700);
      if (S.newBest) txt('New best: ' + best.txt, TW / 2, CY + 62, 20, '#ffc861', 600);
      txt('Click, Space or Enter to play again', TW / 2, CY + 98, 18, '#a3968a', 500);
    } else if (S.paused) {
      shade(0.6);
      txt('PAUSED', TW / 2, CY - 20, 60, '#ffc861', 800);
      txt('Press P, Space or click to resume', TW / 2, CY + 40, 20, '#a3968a', 500);
    }
  }
  function shade(a) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(4,6,10,' + a + ')'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore(); }
  function txt(s, x, y, size, color, weight) {
    ctx.save(); ctx.font = (weight || 700) + ' ' + Math.round(size) + 'px ' + fontFam;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillText(s, x, y); ctx.restore();
  }

  /* ---------- layout / ui ---------- */
  function fit() {
    if (!el || !cv || el.offsetParent === null) return;
    const top = cv.parentNode.getBoundingClientRect().top;
    const availH = Math.max(240, window.innerHeight - top - 40);
    const availW = Math.max(300, root.clientWidth);
    const LW = TW + PAD * 2, LH = TH + PAD * 2;
    const s = Math.min(availW / LW, availH / LH, 1.08);
    const nd = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(LW * s), h = Math.floor(LH * s);
    if (cv.width === Math.round(w * nd) && cv.height === Math.round(h * nd) && nd === dpr) return;
    sc = s; dpr = nd;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    tableCv = null; draw();
  }
  function syncUI() {
    if (!ui.s1 || !S) return;
    const nm = names();
    ui.n1.textContent = nm[0]; ui.n2.textContent = nm[1];
    ui.s1.textContent = S.score[0]; ui.s2.textContent = S.score[1];
    ui.pause.textContent = S.paused ? 'Resume' : 'Pause';
    ui.pause.disabled = !(S.phase === 'play' || S.phase === 'goal');
    for (const b of root.querySelectorAll('[data-mode]')) b.classList.toggle('on', b.dataset.mode === opts.mode);
    for (const b of root.querySelectorAll('[data-lv]')) b.classList.toggle('on', b.dataset.lv === opts.level);
    ui.lvseg.classList.toggle('dis', opts.mode !== 'cpu');
    ui.sound.textContent = soundOn ? '🔊' : '🔇';
    const st = stats[opts.level] || { w: 0, l: 0 };
    ui.rec.textContent = opts.mode === 'cpu' ? (LV[opts.level].label + ' W ' + st.w + ' · L ' + st.l + (best ? ' · Best ' + best.txt : '')) : (best ? 'Best vs CPU ' + best.txt : '');
    cv.classList.toggle('play', S.phase === 'play' && !S.paused && ctrl === 'mouse');
  }
  function toTable(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / sc - PAD, y: (e.clientY - r.top) / sc - PAD };
  }
  function onKey(e) {
    if (!el || el.offsetParent === null || !S) return;
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const c = e.code, k = e.key;
    const isArrow = k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown';
    if (isArrow || c === 'KeyW' || c === 'KeyA' || c === 'KeyS' || c === 'KeyD') {
      e.preventDefault(); ensureAudio();
      keys.add(isArrow ? k : c);
      if (isArrow || opts.mode === 'cpu') { if (ctrl !== 'keys') { ctrl = 'keys'; S.kv[0].x = S.kv[0].y = 0; syncUI(); } }
      if (S.paused && !S.autoPaused) return;
      if (S.paused) setPaused(false);
      return;
    }
    if (c === 'KeyP' || c === 'Escape') { if (S.phase === 'play' || S.phase === 'goal') { e.preventDefault(); setPaused(!S.paused); } return; }
    if (k === ' ' || k === 'Enter') {
      if (tg === 'BUTTON' && k === 'Enter') return;
      e.preventDefault(); ensureAudio();
      if (S.paused) setPaused(false);
      else if (S.phase === 'ready' || S.phase === 'over') { if (!e.repeat) start(); }
    }
  }
  function onKeyUp(e) {
    const k = e.key;
    keys.delete(k); keys.delete(e.code);
  }

  function mount(container, theApi) {
    if (el) unmount();
    el = container; api = theApi || { load: () => null, save() {}, sound: false, toast() {} };
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    let o = null, sv = null, stt = null, bs = null, br = null;
    try { o = api.load('opts'); sv = api.load('sound'); stt = api.load('stats'); bs = api.load('best'); br = api.load('bestRank'); } catch (e) { /* ignore */ }
    opts = { mode: o && o.mode === '2p' ? '2p' : 'cpu', level: o && LV[o.level] ? o.level : 'medium' };
    stats = stt && typeof stt === 'object' ? stt : {};
    best = typeof bs === 'string' && typeof br === 'number' ? { txt: bs, rank: br } : null;
    soundOn = sv === null || sv === undefined ? !!api.sound : !!sv;
    ctrl = 'mouse'; keys.clear(); mouse.active = false;
    root = document.createElement('div'); root.className = 'ag-' + ID;
    root.innerHTML = `
      <div class="hd">
        <div class="ttl"><h2>Air <span>Hockey</span></h2><div class="how">Slide your mallet to smash the puck into the far goal. Hit it while moving for power. First to ${WIN_SCORE} wins.</div></div>
        <div class="sbd"><div class="sb p1"><b data-k="n1">You</b><i data-k="s1">0</i></div><div class="to">FIRST<br>TO ${WIN_SCORE}</div><div class="sb p2"><b data-k="n2">CPU</b><i data-k="s2">0</i></div></div>
      </div>
      <div class="bar">
        <button class="btn pri small" data-a="new">New game</button>
        <button class="btn sec small" data-a="pause">Pause</button>
        <div class="seg"><button data-mode="cpu">vs CPU</button><button data-mode="2p">2 players</button></div>
        <div class="seg" data-k="lvseg"><button data-lv="easy">Easy</button><button data-lv="medium">Medium</button><button data-lv="hard">Hard</button></div>
        <span class="sp"></span><span class="rec" data-k="rec"></span>
        <button class="btn sec small" data-a="sound" title="Toggle sound"></button>
      </div>
      <div class="stage"><canvas aria-label="Air hockey table"></canvas></div>
      <div class="foot">
        <div class="keys">Orange mallet: <b>mouse</b> or <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> (or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> vs CPU) · Teal mallet in 2-player mode: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><br><kbd>Space</kbd>/<kbd>Enter</kbd> start · <kbd>P</kbd> pause</div>
        <details><summary>Tips</summary><ul>
          <li>Speed is everything: the puck takes on your mallet's velocity, so swing through it instead of just touching it.</li>
          <li>Bank shots off the side rails are hard to read for the CPU.</li>
          <li>Retreat to your goal crease after a shot; the rebound comes back fast.</li>
          <li>Hard CPU predicts rebounds and lines up bank shots of its own.</li>
        </ul></details>
      </div>`;
    el.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d');
    const q = s => root.querySelector('[data-k="' + s + '"]');
    ui = { n1: q('n1'), n2: q('n2'), s1: q('s1'), s2: q('s2'), rec: q('rec'), lvseg: q('lvseg'), pause: root.querySelector('[data-a=pause]'), sound: root.querySelector('[data-a=sound]') };
    fontFam = (getComputedStyle(root).getPropertyValue('--display').trim()) || 'system-ui';
    on(root.querySelector('[data-a=new]'), 'click', (e) => { e.currentTarget.blur(); ensureAudio(); sfx('click'); newGame(); });
    on(ui.pause, 'click', (e) => { e.currentTarget.blur(); setPaused(!S.paused); });
    on(ui.sound, 'click', (e) => { e.currentTarget.blur(); soundOn = !soundOn; try { api.save('sound', soundOn); } catch (er) { /* ignore */ } if (soundOn) { ensureAudio(); sfx('click'); } syncUI(); });
    for (const b of root.querySelectorAll('[data-mode]')) on(b, 'click', (e) => { e.currentTarget.blur(); if (opts.mode === b.dataset.mode) return; opts.mode = b.dataset.mode; try { api.save('opts', opts); } catch (er) { /* ignore */ } newGame(); });
    for (const b of root.querySelectorAll('[data-lv]')) on(b, 'click', (e) => { e.currentTarget.blur(); if (opts.level === b.dataset.lv) return; opts.level = b.dataset.lv; try { api.save('opts', opts); } catch (er) { /* ignore */ } newGame(); });
    on(cv, 'pointerdown', (e) => {
      ensureAudio(); const t = toTable(e); mouse.x = t.x; mouse.y = t.y; mouse.active = true; ctrl = 'mouse';
      if (S.paused) setPaused(false); else if (S.phase === 'ready' || S.phase === 'over') start();
      syncUI();
    });
    on(window, 'pointermove', (e) => {
      if (!cv || el.offsetParent === null) return;
      const t = toTable(e);
      if (!mouse.active || ctrl !== 'mouse') {
        // only take over from the keyboard when the pointer is actually over the table
        const r = cv.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
        if (ctrl !== 'mouse') { ctrl = 'mouse'; syncUI(); }
      }
      mouse.x = t.x; mouse.y = t.y; mouse.active = true;
    });
    on(window, 'keydown', onKey);
    on(window, 'keyup', onKeyUp);
    on(window, 'resize', fit);
    on(window, 'blur', () => { keys.clear(); if (S && el && (S.phase === 'play' || S.phase === 'goal') && !S.paused) { S.paused = true; S.autoPaused = true; syncUI(); if (visible()) draw(); } });
    on(document, 'visibilitychange', () => { if (document.hidden) autoPause(); });
    if (window.ResizeObserver) { ro = new ResizeObserver(() => fit()); ro.observe(el); }
    newGame(); fit(); draw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (cv && root) { tableCv = null; if (!raf) draw(); } });
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
    listeners.length = 0;
    if (ro) { ro.disconnect(); ro = null; }
    if (AC) { try { AC.close(); } catch (e) { /* ignore */ } AC = null; }
    keys.clear();
    if (el) el.innerHTML = '';
    el = null; root = null; cv = null; ctx = null; ui = {}; S = null; tableCv = null;
  }

  window.VanArcade = window.VanArcade || {};
  window.VanArcade[ID] = {
    mount, unmount,
    _debug: { get S() { return S; }, get raf() { return raf; }, get opts() { return opts; }, start, update: (dt) => update(dt), draw: () => draw(), goal: (s) => goal(s), setMouse(x, y) { mouse.x = x; mouse.y = y; mouse.active = true; ctrl = 'mouse'; } },
  };
})();
