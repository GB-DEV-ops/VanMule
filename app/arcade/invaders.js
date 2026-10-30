/* VanMule Arcade: Hay Raiders - fixed shooter. Defend the farm from marching critters with a mule cart cannon.
   window.VanArcade.invaders.mount(el, api) / unmount() */
(function () {
  'use strict';
  const ID = 'invaders';
  const W = 640, H = 680, STEP = 1 / 120;
  const COLS = 11, ROWS = 5, CW = 44, RH = 36, PX = 3, SPR_W = 10, SPR_H = 8;
  const PY = 612, GROUND = 640, PLAYER_SPEED = 270, PB_SPEED = 640, SHIELD_Y = 516, CELL = 3.5, SCOLS = 18, SROWS = 12;
  const C = { ember: '#ff8a3d', gold: '#ffc861', teal: '#6fd3c7', red: '#ff5a52', ok: '#4ade80', fg: '#f3ece5', muted: '#a3968a', dim: '#6f655c' };
  const USED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'Enter', 'Escape', 'p', 'a', 'd', 'z', 'x']);
  // Original critters: 'X' body, 'O' eye white, 'P' pupil. Two frames each.
  const SPRITES = {
    jelly: { pts: 30, body: '#6fd3c7', dark: '#2f7f77', frames: [
      ['...XXXX...', '.XXXXXXXX.', 'XXXOOOOXXX', 'XXXOPPOXXX', 'XXXXXXXXXX', '.X.X..X.X.', 'X..X..X..X', '.X......X.'],
      ['...XXXX...', '.XXXXXXXX.', 'XXXOOOOXXX', 'XXXOPPOXXX', 'XXXXXXXXXX', '.X.X..X.X.', '.X.X..X.X.', 'X.X....X.X']] },
    beetle: { pts: 20, body: '#ff8a3d', dark: '#9c4a17', frames: [
      ['X........X', '.X......X.', '..XXXXXX..', '.XOPXXOPX.', 'XXXXXXXXXX', 'X.XXXXXX.X', 'X.X....X.X', '..XX..XX..'],
      ['X........X', '.X......X.', '..XXXXXX..', '.XPOXXPOX.', 'XXXXXXXXXX', '..XXXXXX..', '.X.X..X.X.', 'X........X']] },
    moth: { pts: 10, body: '#ffc861', dark: '#a87a22', frames: [
      ['XX......XX', 'XXX.XX.XXX', '.XXXXXXXX.', 'XXOPXXPOXX', '.XXXXXXXX.', '..XX..XX..', '.X..XX..X.', 'X........X'],
      ['..........', 'XXX.XX.XXX', 'XXXXXXXXXX', 'XXOPXXPOXX', '.XXXXXXXX.', '..XX..XX..', '..X.XX.X..', '.X......X.']] },
  };
  const ROW_TYPES = ['jelly', 'beetle', 'beetle', 'moth', 'moth'];
  const UFO_ART = ['.....XXXXXX.....', '...XXOOOOOOXX...', '..XXXXXXXXXXXX..', '.XX.XX.XX.XX.XX.', 'XXXXXXXXXXXXXXXX', '..XXX..XX..XXX..', '...X........X...'];
  const POWERS = { D: { name: 'Double shot', color: C.gold, dur: 12 }, S: { name: 'Hay shield', color: C.teal, dur: 0 }, R: { name: 'Rapid fire', color: C.ember, dur: 10 } };
  const CSS = `
.ag-invaders{display:flex;gap:18px;align-items:flex-start;color:var(--fg);font-family:var(--body);user-select:none}
.ag-invaders.narrow{flex-direction:column;gap:10px}
.ag-invaders .ag-stage{flex:0 0 auto;line-height:0}
.ag-invaders canvas{display:block;border-radius:14px;background:#0a0b12;box-shadow:0 0 0 1px var(--line),0 18px 40px rgba(0,0,0,.45);touch-action:none}
.ag-invaders .ag-side{flex:1 1 220px;min-width:210px;max-width:290px;display:flex;flex-direction:column;gap:12px}
.ag-invaders.narrow .ag-side{max-width:none;width:100%;order:-1}
.ag-invaders h2{font-family:var(--display);font-size:22px;line-height:1.1;margin:0}
.ag-invaders h2 em{font-style:normal;color:var(--gold)}
.ag-invaders .ag-how{color:var(--muted);font-size:13px;margin:4px 0 0}
.ag-invaders .ag-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.ag-invaders .ag-stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.ag-invaders .ag-stat span{display:block;font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em}
.ag-invaders .ag-stat b{display:block;font-family:var(--mono);font-size:17px;font-weight:700}
.ag-invaders .ag-stat.hi b{color:var(--gold)}
.ag-invaders .ag-btns{display:flex;gap:8px;flex-wrap:wrap}
.ag-invaders .ag-keys{font-size:12px;color:var(--dim);line-height:1.8}
.ag-invaders kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-invaders .ag-legend{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;font-size:12.5px;color:var(--muted);align-items:center}
.ag-invaders .ag-legend canvas{border-radius:0;box-shadow:none;background:none}
.ag-invaders .ag-cap{font-family:var(--mono);font-weight:700;font-size:11px;color:#111;border-radius:6px;width:30px;text-align:center;padding:1px 0}
.ag-invaders details{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--muted)}
.ag-invaders summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-invaders details ul{margin:8px 0 2px;padding-left:18px}
.ag-invaders details li{margin:3px 0}
`;

  let el = null, api = null, root = null, cv = null, ctx = null, side = null, ui = {};
  let raf = 0, lastT = 0, acc = 0, ro = null, dpr = 1, sc = 1, S = null, AC = null, NOISE = null, soundOn = true, best = 0, FONT = 'system-ui';
  let sprCache = null, sprScale = 0, stars = [], bgCache = null, bgScale = 0;
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
  function noise(dur, vol, freq, at) {
    if (!AC || !soundOn || !NOISE) return;
    try {
      const t = AC.currentTime + (at || 0), s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
      s.buffer = NOISE; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.3), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(AC.destination); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  const MARCH = [98, 87, 78, 73];
  function sfx(k, n) {
    switch (k) {
      case 'shoot': tone('square', 1300, 420, 0.1, 0.04); break;
      case 'hit': noise(0.18, 0.18, 3000); tone('square', 600, 200, 0.12, 0.04); break;
      case 'march': tone('square', MARCH[n & 3], 0, 0.09, 0.09); break;
      case 'hay': noise(0.09, 0.08, 1800); break;
      case 'die': noise(0.9, 0.3, 1600); tone('sawtooth', 320, 50, 0.8, 0.08); break;
      case 'ufo': tone('sine', n ? 700 : 520, n ? 520 : 700, 0.14, 0.035); break;
      case 'ufohit': [880, 660, 990, 740, 1100].forEach((f, i) => tone('square', f, 0, 0.06, 0.05, i * 0.05)); noise(0.4, 0.2, 2400); break;
      case 'power': [660, 880, 1175, 1568].forEach((f, i) => tone('triangle', f, 0, 0.09, 0.08, i * 0.06)); break;
      case 'block': tone('triangle', 1500, 800, 0.12, 0.06); break;
      case 'life': [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, 0, 0.12, 0.08, i * 0.08)); break;
      case 'clear': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, 0, 0.13, 0.08, i * 0.09)); break;
      case 'start': [392, 523, 659].forEach((f, i) => tone('square', f, 0, 0.08, 0.05, i * 0.07)); break;
      case 'over': [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, 0, 0.2, 0.08, i * 0.16)); break;
    }
  }

  /* ---------- sprites ---------- */
  function buildSprites() {
    const k = sc * dpr;
    if (sprCache && sprScale === k) return;
    sprScale = k; sprCache = {};
    const make = (rows, body, dark, ps) => {
      const w = rows[0].length, h = rows.length, c = document.createElement('canvas');
      c.width = Math.ceil(w * ps * k); c.height = Math.ceil(h * ps * k);
      const g = c.getContext('2d');
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        g.fillStyle = ch === 'O' ? '#fff8ee' : ch === 'P' ? '#1b0d03' : body;
        g.fillRect(Math.floor(x * ps * k), Math.floor(y * ps * k), Math.ceil(ps * k), Math.ceil(ps * k));
        if (ch === 'X' && (y === h - 1 || rows[y + 1][x] === '.')) { g.fillStyle = dark; g.fillRect(Math.floor(x * ps * k), Math.floor((y + 0.66) * ps * k), Math.ceil(ps * k), Math.ceil(ps * k * 0.34)); }
      }
      return c;
    };
    for (const t in SPRITES) { const s = SPRITES[t]; sprCache[t] = s.frames.map((f) => make(f, s.body, s.dark, PX)); sprCache[t + '_w'] = s.frames.map((f) => make(f, '#ffffff', '#dddddd', PX)); }
    sprCache.ufo = make(UFO_ART, '#ff6fae', '#a83a6e', 3);
  }
  function buildBg() {
    const k = sc * dpr;
    if (bgCache && bgScale === k) return;
    bgScale = k;
    const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
    const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#07080f'); sky.addColorStop(0.6, '#121022'); sky.addColorStop(0.9, '#2a1a1c'); sky.addColorStop(1, '#3a2216');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (const s of stars) { g.globalAlpha = s.b; g.fillStyle = s.c; g.fillRect(s.x, s.y, s.s, s.s); }
    g.globalAlpha = 1;
    // moon
    g.fillStyle = 'rgba(255,232,200,0.9)'; g.beginPath(); g.arc(596, 470, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b0b14'; g.beginPath(); g.arc(602, 466, 11.5, 0, Math.PI * 2); g.fill();
    // distant mesas
    g.fillStyle = '#1c1420'; g.beginPath(); g.moveTo(0, 600);
    const mesa = [[0, 585], [60, 585], [80, 560], [150, 560], [168, 585], [260, 588], [300, 575], [330, 575], [345, 590], [430, 590], [455, 552], [540, 552], [560, 582], [640, 584], [640, 640], [0, 640]];
    for (const [x, y] of mesa) g.lineTo(x, y); g.fill();
    // ground
    const gr = g.createLinearGradient(0, GROUND, 0, H); gr.addColorStop(0, '#5a3a1e'); gr.addColorStop(1, '#2a1b10');
    g.fillStyle = gr; g.fillRect(0, GROUND, W, H - GROUND);
    g.fillStyle = '#7a5a2a'; g.fillRect(0, GROUND, W, 2);
    g.fillStyle = '#6a8a3a';
    for (let x = 4; x < W; x += 13) { const h = 3 + ((x * 7) % 5); g.fillRect(x, GROUND - h + 1, 2, h); g.fillRect(x + 3, GROUND - h + 3, 2, h - 2); }
    bgCache = c;
  }

  /* ---------- game ---------- */
  function makeShield(i) {
    const cells = new Uint8Array(SCOLS * SROWS);
    for (let r = 0; r < SROWS; r++) for (let c = 0; c < SCOLS; c++) {
      let v = 0;
      if (r < 6) { if (c >= 4 && c <= 13 && !((r === 0) && (c === 4 || c === 13))) v = 1; }
      else if (c !== 9 && !(r === 6 && (c === 0 || c === 17))) v = 1;
      if (v) {
        const band = r < 6 ? (c === 6 || c === 11) : (c === 2 || c === 6 || c === 12 || c === 15);
        v = band ? 4 : (Math.random() < 0.18 ? 3 : Math.random() < 0.4 ? 2 : 1);
      }
      cells[r * SCOLS + c] = v;
    }
    for (let r = SROWS - 1; r >= 0; r--) for (let c = 0; c < SCOLS; c++) {
      const i = r * SCOLS + c;
      if (cells[i] && cells[i] !== 4 && (r === 0 || r === 6 || !cells[i - SCOLS])) cells[i] = 3;
    }
    const sw = SCOLS * CELL, gap = (W - 4 * sw) / 5;
    return { x: gap + i * (sw + gap), y: SHIELD_Y, cells };
  }
  function newGame() {
    S = { phase: 'ready', paused: false, autoPaused: false, px: W / 2, pvx: 0, wheel: 0, lives: 3, score: 0, wave: 0, nextLife: 3000,
      aliens: [], fx: 0, fy: 0, dir: 1, stepT: 0, anim: 0, marchI: 0, bullets: [], abullets: [], shields: [], ufo: null, ufoT: 20, powerups: [],
      parts: [], texts: [], double: 0, rapid: 0, guard: false, cool: 0, fireT: 1.5, respawnT: 0, waveT: 0, banner: null, time: 0, overT: 0,
      shake: 0, newHi: false, frames: 0, invaded: false, hitFlash: 0 };
    for (let i = 0; i < 4; i++) S.shields.push(makeShield(i));
    setupWave(1, true);
    syncUI(); draw();
  }
  function setupWave(n, quiet) {
    S.wave = n; S.aliens = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) S.aliens.push({ c, r, type: ROW_TYPES[r], alive: true });
    S.fx = (W - COLS * CW) / 2; S.fy = 96 + Math.min(n - 1, 6) * 12; S.dir = 1; S.stepT = 0.6; S.anim = 0;
    S.abullets = []; S.bullets = []; S.powerups = []; S.ufo = null; S.ufoT = rnd(16, 24);
    S.fireT = 1.6;
    if (n > 1) { S.shields = []; for (let i = 0; i < 4; i++) S.shields.push(makeShield(i)); }
    if (!quiet) { S.banner = { text: 'WAVE ' + n, t: 0 }; }
    syncUI();
  }
  function startGame() {
    newGame(); S.phase = 'play'; S.banner = { text: 'WAVE 1', t: 0 }; sfx('start'); syncUI(); kick();
  }
  const aliveCount = () => { let n = 0; for (const a of S.aliens) if (a.alive) n++; return n; };
  const alienX = (a) => S.fx + a.c * CW + (CW - SPR_W * PX) / 2;
  const alienY = (a) => S.fy + a.r * RH;
  function stepInterval() {
    const n = aliveCount(), f = n / (COLS * ROWS);
    return Math.max(0.028, (0.035 + 0.62 * Math.pow(f, 1.25)) * Math.max(0.55, 1 - (S.wave - 1) * 0.07));
  }
  function march() {
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const a of S.aliens) if (a.alive) { const x = alienX(a); minX = Math.min(minX, x); maxX = Math.max(maxX, x + SPR_W * PX); maxY = Math.max(maxY, alienY(a) + SPR_H * PX); }
    if (minX === Infinity) return;
    const n = aliveCount(), dx = n <= 3 ? 10 : 7;
    if ((S.dir > 0 && maxX + dx > W - 10) || (S.dir < 0 && minX - dx < 10)) { S.fy += 16; S.dir = -S.dir; }
    else S.fx += S.dir * dx;
    S.anim ^= 1; sfx('march', S.marchI++);
    // critters trample hay
    for (const a of S.aliens) if (a.alive) {
      const ay = alienY(a);
      if (ay + SPR_H * PX >= SHIELD_Y) for (const sh of S.shields) eraseRect(sh, alienX(a), ay, SPR_W * PX, SPR_H * PX);
      if (ay + SPR_H * PX >= PY - 6) { S.invaded = true; }
    }
    if (S.invaded) killPlayer(true);
  }
  function eraseRect(sh, x, y, w, h) {
    const c0 = Math.floor((x - sh.x) / CELL), c1 = Math.floor((x + w - sh.x) / CELL), r0 = Math.floor((y - sh.y) / CELL), r1 = Math.floor((y + h - sh.y) / CELL);
    for (let r = Math.max(0, r0); r <= Math.min(SROWS - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(SCOLS - 1, c1); c++) sh.cells[r * SCOLS + c] = 0;
  }
  function shieldHit(x, y, down) {
    for (const sh of S.shields) {
      if (x < sh.x || x >= sh.x + SCOLS * CELL || y < sh.y || y >= sh.y + SROWS * CELL) continue;
      const c = Math.floor((x - sh.x) / CELL), r = Math.floor((y - sh.y) / CELL);
      if (!sh.cells[r * SCOLS + c]) continue;
      // carve a ragged crater
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr + (down ? 1 : -1) * (Math.abs(dr) < 2 ? 0 : 0), cc = c + dc;
        if (rr < 0 || rr >= SROWS || cc < 0 || cc >= SCOLS) continue;
        const d = Math.abs(dr) + Math.abs(dc);
        if (d <= 1 || (d <= 3 && Math.random() < 0.5)) sh.cells[rr * SCOLS + cc] = 0;
      }
      for (let i = 0; i < 6; i++) S.parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-80, 20) * (down ? -1 : 1), t: 0, life: rnd(0.3, 0.6), color: Math.random() < 0.5 ? '#e0b050' : '#b8862e', size: 2, g: 260 });
      sfx('hay');
      return true;
    }
    return false;
  }
  function addScore(n) {
    S.score += n;
    if (S.score >= S.nextLife) { S.nextLife += 5000; S.lives = Math.min(S.lives + 1, 6); sfx('life'); S.texts.push({ x: W / 2, y: 300, s: 'EXTRA CART!', t: 0, life: 1.6, color: C.ok, big: true }); }
    if (S.score > best) { best = S.score; S.newHi = true; }
    syncUI();
  }
  function burst(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), v = rnd(30, spd || 160); S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rnd(0.3, 0.7), color, size: rnd(2, 3.5), g: 120 }); }
  }
  function playerFire() {
    if (S.phase !== 'play' || S.respawnT > 0 || S.cool > 0) return;
    const maxShots = S.rapid > 0 ? 3 : 1;
    const groups = new Set(S.bullets.map((b) => b.g)).size;
    if (groups >= maxShots) return;
    const g = Math.random();
    if (S.double > 0) { S.bullets.push({ x: S.px - 9, y: PY - 14, g }); S.bullets.push({ x: S.px + 9, y: PY - 14, g }); }
    else S.bullets.push({ x: S.px, y: PY - 18, g });
    S.cool = S.rapid > 0 ? 0.12 : 0.05; S.recoil = 1;
    sfx('shoot');
  }
  function alienFire() {
    const cols = {};
    for (const a of S.aliens) if (a.alive && (!cols[a.c] || a.r > cols[a.c].r)) cols[a.c] = a;
    const shooters = Object.values(cols);
    if (!shooters.length) return;
    let pick = null;
    if (Math.random() < 0.45) { let bd = Infinity; for (const a of shooters) { const d = Math.abs(alienX(a) + 15 - S.px); if (d < bd) { bd = d; pick = a; } } }
    if (!pick) pick = shooters[(Math.random() * shooters.length) | 0];
    const kind = Math.random() < 0.5 ? 0 : 1;
    const sp = (kind ? 250 : 190) * Math.min(1 + (S.wave - 1) * 0.06, 1.5);
    S.abullets.push({ x: alienX(pick) + 15, y: alienY(pick) + 24, vy: sp, kind, t: 0 });
  }
  function killAlien(a) {
    a.alive = false;
    const x = alienX(a) + 15, y = alienY(a) + 12, spr = SPRITES[a.type];
    burst(x, y, spr.body, 14, 170);
    S.texts.push({ x, y, s: '', t: 0, life: 0.25, splat: true, color: spr.body });
    addScore(spr.pts); sfx('hit');
    if (Math.random() < 0.035 + Math.min(0.02, S.wave * 0.003)) dropPower(x, y);
    if (!aliveCount()) { S.waveT = 2.2; S.abullets = []; sfx('clear'); }
  }
  function dropPower(x, y) {
    const keysP = Object.keys(POWERS), t = keysP[(Math.random() * keysP.length) | 0];
    S.powerups.push({ x, y, t, vy: 95, age: 0 });
  }
  function killPlayer(invaded) {
    if (S.respawnT > 0 && !invaded) return;
    if (S.guard && !invaded) { S.guard = false; sfx('block'); burst(S.px, PY - 6, C.teal, 22, 200); S.hitFlash = 0.3; return; }
    S.lives = invaded ? 0 : S.lives - 1;
    burst(S.px, PY - 6, C.ember, 30, 220); burst(S.px, PY - 6, C.gold, 16, 140);
    S.shake = 10; sfx('die');
    S.respawnT = 1.6; S.abullets = []; S.bullets = []; S.double = 0; S.rapid = 0; S.guard = false;
    syncUI();
  }
  function gameOver() {
    S.phase = 'over'; S.overT = 0; sfx('over');
    if (S.score >= best && S.score > 0) { best = S.score; try { api.save('best', best); } catch (e) { /* ignore */ } }
    syncUI();
  }

  function step(dt) {
    S.time += dt;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 30);
    if (S.hitFlash > 0) S.hitFlash -= dt;
    for (const p of S.parts) { p.t += dt; p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    if (S.parts.length) S.parts = S.parts.filter((p) => p.t < p.life);
    for (const t of S.texts) { t.t += dt; if (!t.splat) t.y -= dt * 24; }
    if (S.texts.length) S.texts = S.texts.filter((t) => t.t < t.life);
    if (S.banner) { S.banner.t += dt; if (S.banner.t > 2) S.banner = null; }
    if (S.phase === 'over') { S.overT += dt; return; }
    if (S.phase !== 'play') return;

    // player
    S.cool -= dt; if (S.recoil > 0) S.recoil = Math.max(0, S.recoil - dt * 8);
    if (S.double > 0) S.double -= dt;
    if (S.rapid > 0) S.rapid -= dt;
    if (S.respawnT > 0) {
      S.respawnT -= dt;
      if (S.respawnT <= 0) { if (S.lives <= 0) { gameOver(); return; } S.px = W / 2; S.pvx = 0; }
    } else {
      const L = keys.ArrowLeft || keys.a, R = keys.ArrowRight || keys.d;
      const target = ((R ? 1 : 0) - (L ? 1 : 0)) * PLAYER_SPEED;
      S.pvx += (target - S.pvx) * Math.min(1, dt * 18);
      S.px = clamp(S.px + S.pvx * dt, 38, W - 26);
      S.wheel += S.pvx * dt / 7;
      if (keys.Space || keys.ArrowUp || keys.z) playerFire();
    }
    // wave transition
    if (S.waveT > 0) {
      S.waveT -= dt;
      for (const b of S.bullets) b.y -= PB_SPEED * dt;
      S.bullets = S.bullets.filter((b) => b.y > -20);
      stepPowerups(dt);
      if (S.waveT <= 0) { setupWave(S.wave + 1); sfx('start'); }
      return;
    }
    // aliens march (frozen while the player respawns)
    if (S.respawnT <= 0) {
      S.stepT -= dt;
      if (S.stepT <= 0) { S.stepT = stepInterval(); march(); if (S.phase !== 'play') return; }
      S.fireT -= dt;
      const maxAB = Math.min(2 + Math.ceil(S.wave / 2), 7);
      if (S.fireT <= 0) { S.fireT = Math.max(0.22, 1.05 - S.wave * 0.08) * rnd(0.5, 1.4) * (0.6 + 0.4 * aliveCount() / 55); if (S.abullets.length < maxAB) alienFire(); }
      // ufo
      if (!S.ufo) { S.ufoT -= dt; if (S.ufoT <= 0 && aliveCount() > 6) { const l = Math.random() < 0.5; S.ufo = { x: l ? -50 : W + 50, vx: (l ? 1 : -1) * (100 + S.wave * 6), snd: 0, sndI: 0 }; S.ufoT = rnd(18, 28); } }
    }
    if (S.ufo) {
      const u = S.ufo; u.x += u.vx * dt; u.snd -= dt; if (u.snd <= 0) { u.snd = 0.14; u.sndI ^= 1; sfx('ufo', u.sndI); }
      if (u.x < -60 || u.x > W + 60) S.ufo = null;
    }
    // player bullets
    for (const b of S.bullets) b.y -= PB_SPEED * dt;
    for (let i = S.bullets.length - 1; i >= 0; i--) {
      const b = S.bullets[i];
      let hit = b.y < 46;
      if (!hit) for (const a of S.aliens) {
        if (!a.alive) continue;
        const ax = alienX(a), ay = alienY(a);
        if (b.x >= ax - 1 && b.x <= ax + SPR_W * PX + 1 && b.y - 6 <= ay + SPR_H * PX && b.y + 6 >= ay) { killAlien(a); hit = true; break; }
      }
      if (!hit && S.ufo && Math.abs(b.x - S.ufo.x) < 26 && b.y < 80 && b.y > 50) {
        const pts = [50, 100, 150, 300][(Math.random() * 4) | 0];
        addScore(pts); sfx('ufohit'); burst(S.ufo.x, 66, '#ff6fae', 30, 220);
        S.texts.push({ x: S.ufo.x, y: 66, s: String(pts), t: 0, life: 1.4, color: '#ff6fae' });
        dropPower(S.ufo.x, 70); S.ufo = null; hit = true;
      }
      if (!hit) for (let j = S.abullets.length - 1; j >= 0; j--) {
        const ab = S.abullets[j];
        if (Math.abs(ab.x - b.x) < 6 && Math.abs(ab.y - b.y) < 12) { if (ab.kind === 0 || Math.random() < 0.5) S.abullets.splice(j, 1); burst(b.x, b.y, C.fg, 6, 90); hit = true; break; }
      }
      if (!hit) hit = shieldHit(b.x, b.y - 6, false);
      if (hit) S.bullets.splice(i, 1);
    }
    // alien bullets
    for (let i = S.abullets.length - 1; i >= 0; i--) {
      const b = S.abullets[i]; b.t += dt; b.y += b.vy * dt;
      let hit = b.y > GROUND;
      if (hit) burst(b.x, GROUND, '#b8862e', 4, 60);
      if (!hit) hit = shieldHit(b.x, b.y + 6, true);
      if (!hit && S.respawnT <= 0 && b.y + 6 > PY - 16 && b.y - 6 < PY + 12 && Math.abs(b.x - S.px) < 21) { S.abullets.splice(i, 1); killPlayer(false); if (S.respawnT > 0) break; continue; }
      if (hit) S.abullets.splice(i, 1);
    }
    stepPowerups(dt);
  }
  function stepPowerups(dt) {
    for (let i = S.powerups.length - 1; i >= 0; i--) {
      const p = S.powerups[i]; p.y += p.vy * dt; p.age += dt;
      if (S.respawnT <= 0 && p.y > PY - 22 && p.y < PY + 12 && Math.abs(p.x - S.px) < 28) {
        S.powerups.splice(i, 1); sfx('power');
        if (p.t === 'D') S.double = POWERS.D.dur; else if (p.t === 'R') S.rapid = POWERS.R.dur; else S.guard = true;
        S.texts.push({ x: S.px, y: PY - 40, s: POWERS[p.t].name.toUpperCase(), t: 0, life: 1.3, color: POWERS[p.t].color });
        continue;
      }
      if (p.y > GROUND + 10) S.powerups.splice(i, 1);
    }
  }

  /* ---------- loop ---------- */
  const animating = () => S && !S.paused && (S.phase === 'play' || S.parts.length > 0 || S.phase === 'ready' || S.phase === 'over');
  function kick() { if (!raf && el) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    if (!visible()) { autoPause(); return; }
    S.frames++;
    if (!lastT) lastT = t;
    const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    if (!S.paused) { acc += dt; let n = 0; while (acc >= STEP && n++ < 14) { acc -= STEP; step(STEP); } if (acc > STEP) acc = 0; }
    if (S.phase === 'ready') S.titleT = (S.titleT || 0) + dt;
    draw();
    if (animating()) raf = requestAnimationFrame(frame);
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
  function txt(s, x, y, size, color, weight, align, glow) {
    ctx.font = `${weight || 700} ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = (glow == null ? 10 : glow) * sc * dpr;
    ctx.fillText(s, x, y); ctx.shadowBlur = 0;
  }
  function drawCart(x, y, scale, alpha, wheelA) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha = alpha == null ? 1 : alpha;
    const rec = S && S.recoil ? S.recoil * 3 : 0;
    // cannon barrel
    ctx.fillStyle = '#4a4440'; ctx.fillRect(-4, -20 + rec, 8, 14);
    ctx.fillStyle = '#7a7068'; ctx.fillRect(-4, -20 + rec, 3, 14);
    ctx.fillStyle = '#2a2420'; ctx.fillRect(-5, -22 + rec, 10, 4);
    // cart bed
    ctx.fillStyle = '#b4652a'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-20, -8, 40, 12, 3) : ctx.rect(-20, -8, 40, 12); ctx.fill();
    ctx.fillStyle = '#ff8a3d'; ctx.fillRect(-20, -8, 40, 3);
    ctx.fillStyle = '#7a3f16'; for (const sx of [-12, -2, 8]) ctx.fillRect(sx, -5, 2, 9);
    // mule head + ears at the front-left
    ctx.fillStyle = '#8a7a6c';
    ctx.beginPath(); ctx.ellipse(-25, -9, 6, 5, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-30, -6, 4, 3.2, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6d5e52'; ctx.beginPath(); ctx.ellipse(-24, -19, 1.8, 5.5, -0.35, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(-20.5, -18, 1.8, 5.5, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8c8b8'; ctx.beginPath(); ctx.ellipse(-31.5, -5.5, 2.2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b0d03'; ctx.beginPath(); ctx.arc(-26, -11, 1.2, 0, Math.PI * 2); ctx.fill();
    // wheels
    for (const wx of [-12, 12]) {
      ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.arc(wx, 6, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c8a070'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(wx, 6, 5.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = (wheelA || 0) + i * Math.PI / 3; ctx.moveTo(wx + Math.cos(a) * 5, 6 + Math.sin(a) * 5); ctx.lineTo(wx - Math.cos(a) * 5, 6 - Math.sin(a) * 5); } ctx.stroke();
    }
    ctx.restore();
  }
  const SHIELD_COLS = [null, '#d9a441', '#c8923a', '#e8bc5c', '#8a5a22'];
  function draw() {
    if (!ctx || !S) return;
    const k = sc * dpr;
    buildSprites(); buildBg();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bgCache, 0, 0);
    let ox = 0, oy = 0; if (S.shake > 0.2 && !S.paused) { ox = rnd(-1, 1) * S.shake; oy = rnd(-1, 1) * S.shake; }
    ctx.setTransform(k, 0, 0, k, ox * k, oy * k);
    // twinkle a few stars
    for (let i = 0; i < 14; i++) { const s = stars[i]; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(S.time * s.f + s.p); ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, 1.5, 1.5); }
    ctx.globalAlpha = 1;
    // shields
    for (const sh of S.shields) for (let v = 1; v <= 4; v++) {
      ctx.fillStyle = SHIELD_COLS[v];
      for (let r = 0; r < SROWS; r++) for (let c = 0; c < SCOLS; c++) if (sh.cells[r * SCOLS + c] === v) ctx.fillRect(sh.x + c * CELL, sh.y + r * CELL, CELL + 0.05, CELL + 0.05);
    }
    // aliens
    const bob = S.phase === 'ready' ? Math.round(Math.sin((S.titleT || 0) * 2) * 3) : 0;
    for (const a of S.aliens) {
      if (!a.alive) continue;
      const img = sprCache[a.type][S.phase === 'ready' ? (Math.floor((S.titleT || 0) * 2) & 1) : S.anim];
      ctx.drawImage(img, alienX(a), alienY(a) + bob, SPR_W * PX, SPR_H * PX);
    }
    // splats
    for (const t of S.texts) if (t.splat) {
      ctx.globalAlpha = 1 - t.t / t.life; ctx.fillStyle = t.color;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, d = 6 + t.t * 40; ctx.fillRect(t.x + Math.cos(a) * d - 2, t.y + Math.sin(a) * d - 2, 4, 4); }
      ctx.globalAlpha = 1;
    }
    // ufo
    if (S.ufo) { ctx.drawImage(sprCache.ufo, S.ufo.x - 24, 56, 48, 21); ctx.fillStyle = Math.floor(S.time * 10) % 2 ? '#fff' : C.gold; ctx.fillRect(S.ufo.x - 2, 52, 4, 4); }
    // power-ups
    for (const p of S.powerups) {
      const P = POWERS[p.t], wob = Math.sin(p.age * 6) * 2;
      ctx.save(); ctx.translate(p.x + wob, p.y);
      ctx.shadowColor = P.color; ctx.shadowBlur = 12 * k; ctx.fillStyle = P.color;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-13, -8, 26, 16, 6) : ctx.rect(-13, -8, 26, 16); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#1b0d03'; ctx.font = `800 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.t, 0, 1);
      ctx.restore();
    }
    // bullets
    ctx.shadowColor = C.ember; ctx.shadowBlur = 10 * k;
    for (const b of S.bullets) { ctx.fillStyle = C.gold; ctx.fillRect(b.x - 1.5, b.y - 7, 3, 12); ctx.fillStyle = '#fff'; ctx.fillRect(b.x - 0.75, b.y - 7, 1.5, 5); }
    ctx.shadowColor = C.red;
    for (const b of S.abullets) {
      if (b.kind === 0) {
        ctx.strokeStyle = '#ff9a8a'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i <= 4; i++) { const yy = b.y - 7 + i * 3.5, xx = b.x + ((i + Math.floor(b.t * 14)) % 2 ? 2.5 : -2.5); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
        ctx.stroke();
      } else { ctx.fillStyle = C.red; ctx.fillRect(b.x - 2, b.y - 6, 4, 12); ctx.fillStyle = '#ffd0c8'; ctx.fillRect(b.x - 1, b.y - 6, 2, 4); }
    }
    ctx.shadowBlur = 0;
    // player
    if (S.phase !== 'over' || S.respawnT <= 0) {
      if (S.respawnT <= 0 || S.phase === 'ready') {
        drawCart(S.px, PY, 1, 1, S.wheel);
        if (S.guard) {
          ctx.strokeStyle = 'rgba(111,211,199,' + (0.55 + 0.25 * Math.sin(S.time * 6)) + ')'; ctx.lineWidth = 2;
          ctx.shadowColor = C.teal; ctx.shadowBlur = 10 * k; ctx.beginPath(); ctx.ellipse(S.px - 4, PY - 4, 38, 26, 0, Math.PI, 0); ctx.stroke(); ctx.shadowBlur = 0;
        }
      } else if (S.lives > 0 && S.respawnT < 0.8 && Math.floor(S.respawnT * 10) % 2) drawCart(W / 2, PY, 1, 0.4, 0);
    }
    if (S.hitFlash > 0) { ctx.fillStyle = 'rgba(111,211,199,' + S.hitFlash + ')'; ctx.fillRect(0, 0, W, H); }
    // particles
    for (const p of S.parts) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalAlpha = 1;
    for (const t of S.texts) if (!t.splat) { ctx.globalAlpha = Math.min(1, 2 * (1 - t.t / t.life)); txt(t.s, clamp(t.x, 70, W - 70), t.y, t.big ? 22 : 13, t.color, 800); }
    ctx.globalAlpha = 1;
    // HUD
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, 42);
    ctx.fillStyle = 'rgba(255,200,97,0.25)'; ctx.fillRect(0, 42, W, 1);
    txt('SCORE', 18, 14, 9, C.muted, 600, 'left', 0); txt(String(S.score), 18, 30, 17, C.fg, 700, 'left', 0);
    txt('BEST', W / 2, 14, 9, C.muted, 600, 'center', 0); txt(String(best), W / 2, 30, 17, C.gold, 700, 'center', 0);
    txt('WAVE', W - 18, 14, 9, C.muted, 600, 'right', 0); txt(String(S.wave), W - 18, 30, 17, C.teal, 700, 'right', 0);
    for (let i = 0; i < Math.max(0, S.lives - (S.respawnT > 0 ? 0 : 1)); i++) drawCart(46 + i * 50, 664, 0.6, 0.9, 0);
    // power timers
    let px = W - 16;
    const pw = (label, color, frac) => {
      ctx.font = `700 10px ${FONT}`; const w = ctx.measureText(label).width + 16;
      px -= w;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px, 655, w, 18); ctx.fillStyle = color; ctx.fillRect(px, 671, w * frac, 2);
      txt(label, px + w / 2, 664, 10, color, 700, 'center', 0); px -= 6;
    };
    if (S.double > 0) pw('DOUBLE', C.gold, S.double / POWERS.D.dur);
    if (S.rapid > 0) pw('RAPID', C.ember, S.rapid / POWERS.R.dur);
    if (S.guard) pw('SHIELD', C.teal, 1);
    if (S.banner && S.phase === 'play') {
      const t = S.banner.t, a = t < 0.3 ? t / 0.3 : t > 1.5 ? Math.max(0, (2 - t) / 0.5) : 1;
      ctx.globalAlpha = a; txt(S.banner.text, W / 2, 400, 28, C.gold, 800, 'center', 16); ctx.globalAlpha = 1;
    }
    if (S.waveT > 0 && S.phase === 'play') txt('FIELD CLEARED!', W / 2, 340, 26, C.ok, 800, 'center', 16);
    // overlays
    if (S.phase === 'ready') {
      ctx.fillStyle = 'rgba(7,8,15,0.74)'; ctx.fillRect(0, 44, W, H - 44);
      txt('HAY', W / 2, 250, 54, C.gold, 800, 'center', 22);
      txt('RAIDERS', W / 2, 306, 54, C.ember, 800, 'center', 22);
      txt('Critters are raiding the farm. Hold the line!', W / 2, 360, 15, C.fg, 600, 'center', 0);
      txt('Press Enter or Space to start', W / 2, 400, 18, C.fg, 700, 'center', 8);
      txt('←/→ roll the cart  ·  Space fire  ·  P pause', W / 2, 436, 12, C.muted, 500, 'center', 0);
    } else if (S.phase === 'over') {
      ctx.fillStyle = 'rgba(7,8,15,0.62)'; ctx.fillRect(0, 44, W, H - 44);
      txt(S.invaded ? 'THE FARM IS OVERRUN' : 'GAME OVER', W / 2, 280, S.invaded ? 30 : 44, C.red, 800, 'center', 18);
      txt(S.newHi ? 'New best: ' + S.score : 'Score ' + S.score + '  ·  Wave ' + S.wave, W / 2, 334, 19, S.newHi ? C.gold : C.fg, 600);
      if (S.overT > 1) txt('Press Enter or Space to play again', W / 2, 374, 14, C.muted, 500, 'center', 0);
    } else if (S.paused) {
      ctx.fillStyle = 'rgba(7,8,15,0.6)'; ctx.fillRect(0, 44, W, H - 44);
      txt('PAUSED', W / 2, 320, 40, C.gold, 800);
      txt('Press P, Enter or Space to resume', W / 2, 366, 14, C.muted, 500, 'center', 0);
    }
  }

  /* ---------- layout / ui ---------- */
  function fit() {
    if (!el || !cv || el.offsetParent === null) return;
    const narrow = el.clientWidth < 640;
    root.classList.toggle('narrow', narrow);
    const top = cv.parentNode.getBoundingClientRect().top;
    const availH = Math.max(260, window.innerHeight - top - 40);
    const availW = Math.max(260, narrow ? el.clientWidth : el.clientWidth - 18 - Math.max(210, side.offsetWidth || 230));
    const s = Math.max(0.35, Math.min(availW / W, availH / H, 1.3));
    const nd = window.devicePixelRatio || 1;
    if (Math.abs(s - sc) < 0.002 && nd === dpr && cv.width > 300) return;
    sc = s; dpr = nd;
    cv.style.width = Math.round(W * sc) + 'px'; cv.style.height = Math.round(H * sc) + 'px';
    cv.width = Math.round(W * sc * dpr); cv.height = Math.round(H * sc * dpr);
    draw();
  }
  function syncUI() {
    if (!ui.score || !S) return;
    ui.score.textContent = S.score; ui.best.textContent = best; ui.wave.textContent = S.wave; ui.lives.textContent = Math.max(0, S.lives);
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
    if (k === 'p' || k === 'Escape') { if (S.phase === 'play') setPaused(!S.paused); return; }
    if (S.phase === 'ready' || S.phase === 'over') {
      if (k === 'Enter' || (k === 'Space' && (S.phase === 'ready' || S.overT > 1))) { startGame(); keys.Space = false; }
      return;
    }
    if (S.paused) { if (k === 'Enter' || k === 'Space') { setPaused(false); } return; }
    if (k === 'Enter') { setPaused(true); return; }
    if (k === 'Space' || k === 'ArrowUp' || k === 'z') playerFire();
  }
  function onKeyUp(e) { const k = keyName(e); if (k in keys) keys[k] = false; }

  function legendIcon(type) {
    const s = SPRITES[type], c = document.createElement('canvas'), d = window.devicePixelRatio || 1, ps = 2;
    c.width = SPR_W * ps * d; c.height = SPR_H * ps * d; c.style.width = SPR_W * ps + 'px'; c.style.height = SPR_H * ps + 'px';
    const g = c.getContext('2d'); g.scale(d, d);
    s.frames[0].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '.') return; g.fillStyle = ch === 'O' ? '#fff8ee' : ch === 'P' ? '#1b0d03' : s.body; g.fillRect(x * ps, y * ps, ps, ps); }));
    return c;
  }

  function mount(container, theApi) {
    if (el) unmount();
    el = container; api = theApi || { load: () => null, save() {}, sound: false, toast() {} };
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    let b = null, sv = null;
    try { b = api.load('best'); sv = api.load('sound'); } catch (e) { /* ignore */ }
    best = typeof b === 'number' && isFinite(b) ? b : 0;
    soundOn = !!api.sound && sv !== false;
    for (const kk in keys) delete keys[kk];
    acc = 0; sprCache = null; bgCache = null;
    stars = [];
    for (let i = 0; i < 110; i++) stars.push({ x: rnd(0, W), y: rnd(46, 560), s: Math.random() < 0.15 ? 2 : 1, b: rnd(0.2, 0.7), f: rnd(1, 3), p: rnd(0, 6.28), c: Math.random() < 0.25 ? '#ffe2c0' : '#ffffff' });
    root = document.createElement('div'); root.className = 'ag-' + ID;
    root.innerHTML = `
      <div class="ag-stage"><canvas aria-label="Hay Raiders playfield" tabindex="-1"></canvas></div>
      <div class="ag-side">
        <div><h2>Hay <em>Raiders</em></h2><p class="ag-how">Roll your mule cart cannon along the fence and blast the marching critters before they reach the farm.</p></div>
        <div class="ag-stats">
          <div class="ag-stat"><span>Score</span><b data-k="score">0</b></div>
          <div class="ag-stat hi"><span>Best</span><b data-k="best">0</b></div>
          <div class="ag-stat"><span>Wave</span><b data-k="wave">1</b></div>
          <div class="ag-stat"><span>Carts</span><b data-k="lives">3</b></div>
        </div>
        <div class="ag-btns">
          <button class="btn pri small" data-a="new">New game</button>
          <button class="btn sec small" data-a="pause">Pause</button>
          <button class="btn sec small" data-a="sound" title="Toggle sound"></button>
        </div>
        <div class="ag-legend" data-k="legend"></div>
        <div class="ag-keys"><kbd>←</kbd><kbd>→</kbd> move · <kbd>Space</kbd> fire · <kbd>P</kbd> pause · <kbd>Enter</kbd> start</div>
        <details><summary>Tips</summary><ul>
          <li>You can only have one shot in the air (three with Rapid fire), so make each one count.</li>
          <li>The critters speed up as their numbers shrink. Thin out the edge columns to buy time.</li>
          <li>Hay bales soak up shots from both sides. Shoot through a gap you carved yourself.</li>
          <li>The pink saucer is worth 50 to 300 and always drops a power-up.</li>
          <li>Your shot can cancel an incoming wiggly shot.</li>
          <li>An extra cart arrives at 3,000 points, then every 5,000.</li>
        </ul></details>
      </div>`;
    el.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d'); side = root.querySelector('.ag-side');
    FONT = (getComputedStyle(root).getPropertyValue('--display').trim()) || 'system-ui';
    const leg = root.querySelector('[data-k=legend]');
    for (const t of ['jelly', 'beetle', 'moth']) { leg.appendChild(legendIcon(t)); const s = document.createElement('span'); s.textContent = SPRITES[t].pts + ' pts'; leg.appendChild(s); }
    for (const p in POWERS) { const c = document.createElement('span'); c.className = 'ag-cap'; c.style.background = POWERS[p].color; c.textContent = p; leg.appendChild(c); const s = document.createElement('span'); s.textContent = POWERS[p].name + (p === 'S' ? ' (blocks one hit)' : ' (' + POWERS[p].dur + 's)'); leg.appendChild(s); }
    ui = { score: root.querySelector('[data-k=score]'), best: root.querySelector('[data-k=best]'), wave: root.querySelector('[data-k=wave]'), lives: root.querySelector('[data-k=lives]'),
      pause: root.querySelector('[data-a=pause]'), sound: root.querySelector('[data-a=sound]') };
    const setSoundLabel = () => { ui.sound.textContent = soundOn ? '🔊' : '🔇'; };
    setSoundLabel();
    on(root.querySelector('[data-a=new]'), 'click', (e) => { e.currentTarget.blur(); ensureAudio(); startGame(); });
    on(ui.pause, 'click', (e) => { e.currentTarget.blur(); setPaused(!S.paused); });
    on(ui.sound, 'click', (e) => { e.currentTarget.blur(); soundOn = !soundOn; setSoundLabel(); try { api.save('sound', soundOn); } catch (er) { /* ignore */ } if (soundOn) ensureAudio(); });
    on(cv, 'pointerdown', () => { ensureAudio(); if (S.phase === 'play' && S.paused) setPaused(false); else if (S.phase === 'ready' || (S.phase === 'over' && S.overT > 1)) startGame(); });
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
    if (S && S.newHi && api) { try { api.save('best', best); } catch (e) { /* ignore */ } }
    for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
    listeners.length = 0;
    if (ro) { ro.disconnect(); ro = null; }
    if (AC) { try { AC.close(); } catch (e) { /* ignore */ } AC = null; NOISE = null; }
    if (el) el.innerHTML = '';
    el = null; root = null; cv = null; ctx = null; ui = {}; S = null; sprCache = null; bgCache = null;
  }

  window.VanArcade = window.VanArcade || {};
  window.VanArcade[ID] = {
    mount, unmount,
    _debug: { get S() { return S; }, get raf() { return raf; }, start: () => startGame(), step: (n) => { for (let i = 0; i < (n || 1); i++) step(STEP); draw(); }, killAll: () => { for (const a of S.aliens) if (a.alive) killAlien(a); }, power: (t) => dropPower(S.px, PY - 60) },
  };
})();
