/* VanMule Arcade: Brick Buster - paddle and ball brick breaker.
   window.VanArcade.bricks.mount(el, api) / unmount() */
(function () {
  'use strict';
  const ID = 'bricks';
  const W = 520, H = 660, BW = 40, BH = 18, GAP = 2, COLS = 12, OX = (W - COLS * BW - (COLS - 1) * GAP) / 2, OY = 72;
  const PY = H - 46, PH = 12, PW = 86, PW_WIDE = 136, BR = 6, MAXBALLS = 9;
  const ROWCOLS = ['#ff5a52', '#ff8a3d', '#ffc861', '#4ade80', '#6fd3c7', '#5aa9ff', '#b57bff', '#ff7ac8'];
  const LEVELS = [
    { name: 'Warm-up', rows: ['............', '111111111111', '111111111111', '111111111111', '111111111111', '111111111111'] },
    { name: 'Pyramid', rows: ['.....22.....', '....2112....', '...211112...', '..21111112..', '.2111111112.', '211111111112'] },
    { name: 'Checkers', rows: ['3.3.3..3.3.3', '.1.1.11.1.1.', '2.2.2..2.2.2', '.1.1.11.1.1.', 'XX..XXXX..XX', '111111111111'] },
    { name: 'The V', rows: ['2..........2', '12........21', '.12......21.', '..12....21..', '...12..21...', '....1221....', '.....11.....', 'XXX......XXX'] },
    { name: 'Fortress', rows: ['XXXXX..XXXXX', 'X3333333333X', 'X2222222222X', 'X1111111111X', 'X1111111111X', 'X..........X'] },
    { name: 'Diamond', rows: ['.....33.....', '....3223....', '...321123...', '..32111123..', '.3211..1123.', '..32111123..', '...321123...', '....3223....', '.....33.....'] },
  ];
  const POWERS = {
    W: { name: 'Wide', color: '#6fd3c7' }, M: { name: 'Multi-ball', color: '#b57bff' },
    S: { name: 'Slow', color: '#4ade80' }, L: { name: 'Laser', color: '#ff5a52' }, '+': { name: 'Extra life', color: '#ffc861' },
  };
  const CSS = `
.ag-bricks{display:flex;gap:18px;align-items:flex-start;color:var(--fg);font-family:var(--body);user-select:none}
.ag-bricks.narrow{flex-direction:column;gap:10px}
.ag-bricks .ag-stage{flex:0 0 auto;line-height:0}
.ag-bricks canvas{display:block;border-radius:14px;background:#08090c;box-shadow:0 0 0 1px var(--line),0 18px 40px rgba(0,0,0,.45);cursor:none;touch-action:none}
.ag-bricks .ag-side{flex:1 1 220px;min-width:210px;max-width:300px;display:flex;flex-direction:column;gap:12px}
.ag-bricks.narrow .ag-side{max-width:none;width:100%;order:-1}
.ag-bricks h2{font-family:var(--display);font-size:22px;line-height:1.1;margin:0}
.ag-bricks h2 em{font-style:normal;color:var(--ember)}
.ag-bricks .ag-how{color:var(--muted);font-size:13px;margin:0}
.ag-bricks .ag-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.ag-bricks .ag-stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.ag-bricks .ag-stat span{display:block;font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em}
.ag-bricks .ag-stat b{display:block;font-family:var(--mono);font-size:17px;font-weight:700}
.ag-bricks .ag-stat.hi b{color:var(--gold)}
.ag-bricks .ag-btns{display:flex;gap:8px;flex-wrap:wrap}
.ag-bricks .ag-keys{font-size:12px;color:var(--dim);line-height:1.7}
.ag-bricks kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-bricks .ag-pw{display:grid;grid-template-columns:auto 1fr;gap:5px 9px;font-size:12.5px;color:var(--muted);align-items:center}
.ag-bricks .ag-cap{font-family:var(--mono);font-weight:700;font-size:11px;color:#111;border-radius:6px;padding:1px 0;width:28px;text-align:center}
.ag-bricks details{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--muted)}
.ag-bricks summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-bricks details ul{margin:8px 0 2px;padding-left:18px}
.ag-bricks details li{margin:3px 0}
`;

  let el = null, api = null, root = null, cv = null, ctx = null, side = null, ui = {};
  let raf = 0, lastT = 0, ro = null, dpr = 1, sc = 1, S = null, AC = null, soundOn = true, hi = 0;
  const keys = {};
  const listeners = [];
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
  let lastBlip = 0;
  function sfx(k, x) {
    if (!AC || !soundOn) return;
    const now = AC.currentTime;
    if ((k === 'brick' || k === 'wall') && now - lastBlip < 0.03) return;
    if (k === 'brick' || k === 'wall') lastBlip = now;
    switch (k) {
      case 'paddle': tone('square', 330, 0, 0.06, 0.07); break;
      case 'wall': tone('square', 220, 0, 0.04, 0.04); break;
      case 'brick': tone('square', 520 + (x || 0) * 120, 0, 0.06, 0.06); break;
      case 'steel': tone('triangle', 1400, 900, 0.06, 0.05); break;
      case 'power': [660, 880, 1100].forEach((f, i) => tone('triangle', f, 0, 0.08, 0.08, i * 0.06)); break;
      case 'laser': tone('sawtooth', 1200, 300, 0.08, 0.04); break;
      case 'lose': tone('sawtooth', 400, 70, 0.6, 0.09); break;
      case 'clear': [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, 0, 0.12, 0.08, i * 0.08)); break;
      case 'launch': tone('sine', 300, 600, 0.1, 0.07); break;
    }
  }

  /* ---------- game ---------- */
  function newGame() {
    S = { phase: 'serve', paused: false, autoPaused: false, score: 0, lives: 3, level: 1, bricks: [], balls: [], caps: [], shots: [], parts: [],
      pad: { x: W / 2, w: PW, tw: PW, vx: 0 }, mouseX: null, wide: 0, slow: 0, laser: 0, laserCd: 0, msg: '', msgT: 0, time: 0, frames: 0, steps: 0, flash: 0, newHi: false };
    loadLevel(1); serve(); syncUI(); kick();
  }
  function loadLevel(n) {
    S.level = n;
    const L = LEVELS[(n - 1) % LEVELS.length];
    S.bricks = [];
    L.rows.forEach((row, r) => row.split('').forEach((ch, c) => {
      if (ch === '.') return;
      const steel = ch === 'X', hp = steel ? Infinity : +ch;
      S.bricks.push({ x: OX + c * (BW + GAP), y: OY + r * (BH + GAP), w: BW, h: BH, hp, max: hp, steel, color: ROWCOLS[r % ROWCOLS.length], hit: 0 });
    }));
    S.caps = []; S.shots = [];
    say(`Level ${n} · ${L.name}`, 2);
  }
  const baseSpeed = () => Math.min(560, 330 + (S.level - 1) * 22);
  function serve() {
    S.phase = 'serve'; S.balls = [{ x: S.pad.x, y: PY - BR - 1, vx: 0, vy: 0, sp: baseSpeed(), stuck: true }];
    S.wide = 0; S.slow = 0; S.laser = 0; S.pad.tw = PW;
  }
  function launch() {
    if (S.phase !== 'serve') return;
    const a = (Math.random() * 0.5 - 0.25), b = S.balls[0];
    b.vx = Math.sin(a) * b.sp; b.vy = -Math.cos(a) * b.sp; b.stuck = false; S.phase = 'play'; sfx('launch');
  }
  function say(m, t) { S.msg = m; S.msgT = t; }
  function addScore(n) {
    S.score += n;
    if (S.score > hi) { hi = S.score; S.newHi = true; }
    syncUI();
  }
  function fire() {
    if (S.laser <= 0 || S.laserCd > 0 || S.phase !== 'play') return;
    S.laserCd = 0.28; sfx('laser');
    const half = S.pad.w / 2 - 8;
    S.shots.push({ x: S.pad.x - half, y: PY - 4 }, { x: S.pad.x + half, y: PY - 4 });
  }
  function hitBrick(b, fromShot) {
    b.hit = 0.15;
    if (b.steel) { sfx('steel'); return; }
    b.hp--;
    if (b.hp > 0) { addScore(5); sfx('brick', 1); return; }
    addScore(10 + b.max * 20); sfx('brick', 0);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 220;
      S.parts.push({ x: b.x + Math.random() * b.w, y: b.y + Math.random() * b.h, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.5, t: 0, c: b.color, s: 2 + Math.random() * 3 });
    }
    if (S.parts.length > 500) S.parts.splice(0, S.parts.length - 500);
    if (Math.random() < (fromShot ? 0.08 : 0.15)) {
      const r = Math.random(), k = r < 0.06 ? '+' : r < 0.33 ? 'W' : r < 0.58 ? 'M' : r < 0.8 ? 'S' : 'L';
      S.caps.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, k });
    }
  }
  function applyPower(k) {
    sfx('power'); say(POWERS[k].name + '!', 1.2); addScore(50);
    if (k === 'W') { S.wide = 15; S.pad.tw = PW_WIDE; }
    else if (k === 'S') S.slow = 10;
    else if (k === 'L') S.laser = 10;
    else if (k === '+') { S.lives++; syncUI(); }
    else if (k === 'M') {
      const add = [];
      for (const b of S.balls) {
        if (b.stuck) continue;
        for (const d of [-0.45, 0.45]) {
          if (S.balls.length + add.length >= MAXBALLS) break;
          const ang = Math.atan2(b.vy, b.vx) + d;
          add.push({ x: b.x, y: b.y, vx: Math.cos(ang) * b.sp, vy: Math.sin(ang) * b.sp, sp: b.sp, stuck: false });
        }
      }
      for (const nb of add) fixAngle(nb);
      S.balls.push(...add);
    }
  }
  function fixAngle(b) { // keep the ball from going too horizontal
    const sp = Math.hypot(b.vx, b.vy) || b.sp, minVy = sp * 0.3;
    if (Math.abs(b.vy) < minVy) { b.vy = (b.vy < 0 ? -1 : 1) * minVy; b.vx = Math.sign(b.vx || 1) * Math.sqrt(sp * sp - minVy * minVy); }
  }
  function circleRect(b, r) {
    const nx = clamp(b.x, r.x, r.x + r.w), ny = clamp(b.y, r.y, r.y + r.h), dx = b.x - nx, dy = b.y - ny;
    return dx * dx + dy * dy < BR * BR ? { dx, dy, nx, ny } : null;
  }
  function stepBall(b, dt) {
    const slowF = S.slow > 0 ? 0.65 : 1;
    let dist = b.sp * slowF * dt;
    const n = Math.max(1, Math.ceil(dist / 3)), sub = dt / n;
    for (let i = 0; i < n; i++) {
      b.x += b.vx * slowF * sub; b.y += b.vy * slowF * sub;
      // walls
      if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx); sfx('wall'); }
      else if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx); sfx('wall'); }
      if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy); sfx('wall'); }
      // paddle
      const p = S.pad, top = PY;
      if (b.vy > 0 && b.y + BR >= top && b.y - BR <= top + PH && b.x >= p.x - p.w / 2 - BR && b.x <= p.x + p.w / 2 + BR) {
        const rel = clamp((b.x - p.x) / (p.w / 2), -1, 1), ang = rel * (Math.PI / 3);
        b.sp = Math.min(b.sp + 4, 620);
        b.vx = Math.sin(ang) * b.sp; b.vy = -Math.cos(ang) * b.sp; b.y = top - BR; sfx('paddle');
        continue;
      }
      // bricks: resolve against the deepest overlap only
      let best = null, bd = Infinity;
      for (const br of S.bricks) {
        if (br.hp <= 0) continue;
        if (b.x + BR < br.x || b.x - BR > br.x + br.w || b.y + BR < br.y || b.y - BR > br.y + br.h) continue;
        const c = circleRect(b, br);
        if (c) { const d = c.dx * c.dx + c.dy * c.dy; if (d < bd || best === null) { bd = d; best = { br, c }; } }
      }
      if (best) {
        const { br, c } = best;
        if (c.dx === 0 && c.dy === 0) { // centre inside the brick: push out along the shallowest axis
          const l = b.x - br.x, r = br.x + br.w - b.x, t = b.y - br.y, bt = br.y + br.h - b.y, m = Math.min(l, r, t, bt);
          if (m === l || m === r) { b.vx = m === l ? -Math.abs(b.vx) : Math.abs(b.vx); b.x = m === l ? br.x - BR : br.x + br.w + BR; }
          else { b.vy = m === t ? -Math.abs(b.vy) : Math.abs(b.vy); b.y = m === t ? br.y - BR : br.y + br.h + BR; }
        } else if (Math.abs(c.dx) > Math.abs(c.dy)) {
          b.vx = c.dx > 0 ? Math.abs(b.vx) : -Math.abs(b.vx); b.x = c.nx + Math.sign(c.dx) * BR;
        } else {
          b.vy = c.dy > 0 ? Math.abs(b.vy) : -Math.abs(b.vy); b.y = c.ny + Math.sign(c.dy || -1) * BR;
        }
        hitBrick(br, false);
      }
    }
    fixAngle(b);
  }
  function update(dt) {
    S.steps++; S.time += dt;
    if (S.msgT > 0) S.msgT -= dt;
    for (const p of S.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; }
    S.parts = S.parts.filter((p) => p.t < p.life);
    for (const br of S.bricks) if (br.hit > 0) br.hit -= dt;
    if (S.flash > 0) S.flash -= dt;
    if (S.phase === 'clear') {
      S.clearT -= dt;
      if (S.clearT <= 0) { loadLevel(S.level + 1); serve(); syncUI(); }
      return;
    }
    if (S.phase === 'over') return;
    // paddle
    const p = S.pad;
    p.w += (p.tw - p.w) * Math.min(1, dt * 10);
    const kdir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (kdir) { p.x += kdir * 640 * dt; S.mouseX = null; }
    else if (S.mouseX !== null) p.x += (S.mouseX - p.x) * Math.min(1, dt * 30);
    p.x = clamp(p.x, p.w / 2, W - p.w / 2);
    // timers
    if (S.wide > 0 && (S.wide -= dt) <= 0) { S.wide = 0; p.tw = PW; }
    if (S.slow > 0) S.slow = Math.max(0, S.slow - dt);
    if (S.laser > 0) S.laser = Math.max(0, S.laser - dt);
    if (S.laserCd > 0) S.laserCd -= dt;
    if (S.phase === 'serve') { const b = S.balls[0]; b.x = p.x; b.y = PY - BR - 1; return; }
    // balls
    for (const b of S.balls) stepBall(b, dt);
    S.balls = S.balls.filter((b) => b.y < H + BR * 2);
    // laser shots
    for (const s of S.shots) {
      s.y -= 720 * dt;
      for (const br of S.bricks) if (br.hp > 0 && s.x >= br.x && s.x <= br.x + br.w && s.y <= br.y + br.h && s.y >= br.y - 8) { hitBrick(br, true); s.dead = true; break; }
      if (s.y < 0) s.dead = true;
    }
    S.shots = S.shots.filter((s) => !s.dead);
    // capsules
    for (const c of S.caps) {
      c.y += 150 * dt;
      if (c.y + 8 >= PY && c.y - 8 <= PY + PH && Math.abs(c.x - p.x) <= p.w / 2 + 14) { c.got = true; applyPower(c.k); }
    }
    S.caps = S.caps.filter((c) => !c.got && c.y < H + 20);
    // level clear / lose ball
    if (!S.bricks.some((b) => !b.steel && b.hp > 0)) { S.phase = 'clear'; S.clearT = 2; S.caps = []; S.shots = []; say('LEVEL CLEAR!', 2); sfx('clear'); addScore(500); return; }
    if (!S.balls.length) {
      S.lives--; sfx('lose'); S.flash = 0.35; syncUI();
      if (S.lives <= 0) { S.phase = 'over'; S.paused = false; S.caps = []; saveHi(); syncUI(); }
      else { serve(); say('Ball lost', 1.2); }
    }
  }
  function saveHi() { if (S.score >= hi && S.score > 0) { hi = S.score; try { api.save('hi', hi); } catch (e) { /* ignore */ } } }

  /* ---------- loop ---------- */
  const animating = () => S && !S.paused && (S.phase !== 'over' || S.parts.length > 0);
  function kick() { if (!raf && el) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    if (!visible()) { autoPause(); return; }
    S.frames++;
    if (!lastT) lastT = t;
    let dt = Math.min(1 / 30, (t - lastT) / 1000); lastT = t;
    if (!S.paused) { const n = dt > 1 / 70 ? 2 : 1; for (let i = 0; i < n; i++) update(dt / n); }
    draw();
    if (animating()) raf = requestAnimationFrame(frame);
  }
  function autoPause() {
    if (S && S.phase !== 'over' && !S.paused) { S.paused = true; S.autoPaused = true; for (const k in keys) keys[k] = false; syncUI(); }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function setPaused(v) {
    if (!S || S.phase === 'over') return;
    S.paused = v; S.autoPaused = false; for (const k in keys) keys[k] = false; syncUI();
    if (!v) kick(); else if (visible()) draw();
  }

  /* ---------- drawing ---------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  let fontCache = '';
  function txt(s, x, y, size, color, weight) {
    if (!fontCache) fontCache = getComputedStyle(root).getPropertyValue('--display').trim() || 'system-ui';
    ctx.font = `${weight || 800} ${size}px ${fontCache}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fillText(s, x, y); ctx.shadowBlur = 0;
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = clamp(Math.round(r * f), 0, 255); g = clamp(Math.round(g * f), 0, 255); b = clamp(Math.round(b * f), 0, 255);
    return `rgb(${r},${g},${b})`;
  }
  function draw() {
    if (!ctx || !S) return;
    ctx.setTransform(sc * dpr, 0, 0, sc * dpr, 0, 0);
    ctx.fillStyle = '#08090c'; ctx.fillRect(0, 0, W, H);
    // backdrop grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= W; x += 26) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += 26) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    if (S.flash > 0) { ctx.fillStyle = `rgba(255,90,82,${S.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
    // top hud
    ctx.font = `600 12px ${getComputedStyle(root).getPropertyValue('--mono').trim() || 'monospace'}`; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#a3968a'; ctx.textAlign = 'left'; ctx.fillText(`LEVEL ${S.level}`, 12, 22);
    ctx.textAlign = 'right'; ctx.fillText(`SCORE ${S.score}`, W - 12, 22);
    for (let i = 0; i < Math.min(S.lives - (S.phase === 'over' ? 0 : 1), 8); i++) { ctx.fillStyle = '#ff8a3d'; rr(W / 2 - 60 + i * 18, 18, 14, 6, 3); ctx.fill(); }
    let px = 12; ctx.textAlign = 'left';
    for (const [k, v] of [['W', S.wide], ['S', S.slow], ['L', S.laser]]) {
      if (v <= 0) continue;
      ctx.fillStyle = POWERS[k].color; rr(px, 38, 46, 14, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = '700 10px monospace'; ctx.fillText(`${k} ${Math.ceil(v)}s`, px + 7, 45.5); px += 52;
    }
    // bricks
    for (const b of S.bricks) {
      if (b.hp <= 0) continue;
      let base;
      if (b.steel) base = '#8e9aa6';
      else base = b.max === 1 ? b.color : shade(b.color, 0.55 + 0.45 * (b.hp / b.max));
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      if (b.steel) { g.addColorStop(0, '#d5dde4'); g.addColorStop(0.5, '#7b8793'); g.addColorStop(1, '#4b545d'); }
      else { g.addColorStop(0, base); g.addColorStop(1, b.max === 1 ? shade(b.color, 0.62) : shade(b.color, 0.35)); }
      ctx.fillStyle = g; rr(b.x, b.y, b.w, b.h, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(b.x + 3, b.y + 2, b.w - 6, 2);
      if (b.steel) { ctx.fillStyle = 'rgba(30,34,40,.7)'; for (const [rx, ry] of [[5, 5], [b.w - 5, 5], [5, b.h - 5], [b.w - 5, b.h - 5]]) { ctx.beginPath(); ctx.arc(b.x + rx, b.y + ry, 1.5, 0, 7); ctx.fill(); } }
      else if (b.max > 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1.5; rr(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3, 3); ctx.stroke();
        if (b.hp < b.max) { ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(b.x + 10, b.y + 3); ctx.lineTo(b.x + 16, b.y + 9); ctx.lineTo(b.x + 13, b.y + 15); if (b.hp < b.max - 1) { ctx.moveTo(b.x + 30, b.y + 3); ctx.lineTo(b.x + 25, b.y + 10); ctx.lineTo(b.x + 29, b.y + 15); } ctx.stroke(); }
      }
      if (b.hit > 0) { ctx.fillStyle = `rgba(255,255,255,${b.hit * 4})`; rr(b.x, b.y, b.w, b.h, 4); ctx.fill(); }
    }
    // particles
    for (const p of S.parts) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    ctx.globalAlpha = 1;
    // capsules
    for (const c of S.caps) {
      const col = POWERS[c.k].color;
      ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.fillStyle = col; rr(c.x - 16, c.y - 8, 32, 16, 8); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; rr(c.x - 12, c.y - 6, 24, 4, 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = '800 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.k, c.x, c.y + 1);
    }
    // laser shots
    ctx.fillStyle = '#ff5a52'; ctx.shadowColor = '#ff5a52'; ctx.shadowBlur = 10;
    for (const s of S.shots) ctx.fillRect(s.x - 1.5, s.y - 10, 3, 12);
    ctx.shadowBlur = 0;
    // paddle
    const p = S.pad;
    if (S.phase !== 'over') {
      ctx.shadowColor = '#ff8a3d'; ctx.shadowBlur = 16;
      const g = ctx.createLinearGradient(0, PY, 0, PY + PH); g.addColorStop(0, '#ffb27a'); g.addColorStop(1, '#d9692a');
      ctx.fillStyle = g; rr(p.x - p.w / 2, PY, p.w, PH, 6); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(27,13,3,0.55)'; ctx.font = '800 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VM', p.x, PY + PH / 2 + 0.5);
      if (S.laser > 0) { ctx.fillStyle = '#ff5a52'; const half = p.w / 2 - 8; ctx.fillRect(p.x - half - 3, PY - 6, 6, 7); ctx.fillRect(p.x + half - 3, PY - 6, 6, 7); }
    }
    // balls
    for (const b of S.balls) {
      ctx.shadowColor = '#fff3d6'; ctx.shadowBlur = 14; ctx.fillStyle = '#fff6e6'; ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    // messages
    if (S.msgT > 0 && S.phase !== 'over') { ctx.globalAlpha = Math.min(1, S.msgT * 2); txt(S.msg, W / 2, H * 0.6, 22, S.phase === 'clear' ? '#ffc861' : '#f3ece5'); ctx.globalAlpha = 1; }
    if (S.phase === 'serve' && !S.paused) txt('Space or click to launch', W / 2, PY - 60, 14, '#a3968a', 600);
    if (S.phase === 'over') {
      ctx.fillStyle = 'rgba(8,9,12,0.6)'; ctx.fillRect(0, 0, W, H);
      txt('GAME OVER', W / 2, H / 2 - 30, 40, '#ff5a52');
      txt(S.newHi ? `New high score: ${S.score}` : `Score ${S.score}`, W / 2, H / 2 + 14, 18, S.newHi ? '#ffc861' : '#f3ece5', 600);
      txt('Space or click for a new game', W / 2, H / 2 + 46, 13, '#a3968a', 600);
    } else if (S.paused) {
      ctx.fillStyle = 'rgba(8,9,12,0.6)'; ctx.fillRect(0, 0, W, H);
      txt('PAUSED', W / 2, H / 2 - 14, 40, '#ffc861');
      txt(S.autoPaused ? 'Press P or click to resume' : 'Press P to resume', W / 2, H / 2 + 26, 13, '#a3968a', 600);
    }
  }

  /* ---------- layout / ui ---------- */
  function fit() {
    if (!el || !cv || el.offsetParent === null) return;
    const narrow = el.clientWidth < 560;
    root.classList.toggle('narrow', narrow);
    const top = cv.parentNode.getBoundingClientRect().top;
    const availH = Math.max(300, window.innerHeight - top - 40);
    const availW = Math.max(260, narrow ? el.clientWidth : el.clientWidth - 18 - Math.max(210, side.offsetWidth || 230));
    const s = Math.max(0.45, Math.min(availH / H, availW / W, 1.25));
    const nd = window.devicePixelRatio || 1;
    if (Math.abs(s - sc) < 0.001 && nd === dpr && cv.width) return;
    sc = s; dpr = nd;
    cv.style.width = Math.round(W * sc) + 'px'; cv.style.height = Math.round(H * sc) + 'px';
    cv.width = Math.round(W * sc * dpr); cv.height = Math.round(H * sc * dpr);
    draw();
  }
  function syncUI() {
    if (!ui.score || !S) return;
    ui.score.textContent = S.score; ui.hi.textContent = Math.max(hi, S.score); ui.level.textContent = S.level; ui.lives.textContent = Math.max(0, S.lives);
    ui.pause.textContent = S.paused ? 'Resume' : 'Pause'; ui.pause.disabled = S.phase === 'over';
  }
  function action() { // space / click
    ensureAudio();
    if (S.phase === 'over') { newGame(); return; }
    if (S.paused) { setPaused(false); return; }
    if (S.phase === 'serve') launch(); else fire();
    kick();
  }
  const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  function onKey(e) {
    if (!el || el.offsetParent === null) return;
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = KEYS[e.code];
    if (k) { e.preventDefault(); if (!S.paused) keys[k] = true; return; }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (!e.repeat || S.laser > 0) action(); return; }
    if (e.code === 'KeyP' || e.code === 'Escape') { if (S.phase === 'over') return; e.preventDefault(); setPaused(!S.paused); }
  }
  function onKeyUp(e) { const k = KEYS[e.code]; if (k) keys[k] = false; }

  function mount(container, theApi) {
    if (el) unmount();
    el = container; api = theApi || { load: () => null, save() {}, sound: false, toast() {} };
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    let h = null, sv = null;
    try { h = api.load('hi'); sv = api.load('sound'); } catch (e) { /* ignore */ }
    hi = typeof h === 'number' ? h : 0;
    soundOn = !!api.sound && sv !== false;
    fontCache = '';
    root = document.createElement('div'); root.className = 'ag-' + ID;
    const pw = Object.keys(POWERS).map((k) => `<span class="ag-cap" style="background:${POWERS[k].color}">${k}</span><span>${POWERS[k].name}${k === 'L' ? ' (Space/click to fire)' : ''}</span>`).join('');
    root.innerHTML = `
      <div class="ag-stage"><canvas aria-label="Brick Buster playfield"></canvas></div>
      <div class="ag-side">
        <div><h2>Brick <em>Buster</em></h2><p class="ag-how">Bounce the ball off your paddle to smash every brick. Where it hits the paddle sets the angle. Steel bricks never break.</p></div>
        <div class="ag-stats">
          <div class="ag-stat"><span>Score</span><b data-k="score">0</b></div>
          <div class="ag-stat hi"><span>High</span><b data-k="hi">0</b></div>
          <div class="ag-stat"><span>Level</span><b data-k="level">1</b></div>
          <div class="ag-stat"><span>Lives</span><b data-k="lives">3</b></div>
        </div>
        <div class="ag-btns">
          <button class="btn pri small" data-a="new">New game</button>
          <button class="btn sec small" data-a="pause">Pause</button>
          <button class="btn sec small" data-a="sound" title="Toggle sound"></button>
        </div>
        <div class="ag-keys">Mouse or <kbd>←</kbd><kbd>→</kbd>/<kbd>A</kbd><kbd>D</kbd> move · <kbd>Space</kbd>/click launch · <kbd>P</kbd> pause</div>
        <div class="ag-pw">${pw}</div>
        <details><summary>Tips</summary><ul>
          <li>Hit the ball with the paddle edge for a sharp angle, the centre to send it straight up.</li>
          <li>Outlined bricks take 2 or 3 hits; they crack as they weaken.</li>
          <li>Get the ball above the bricks and let it do the work.</li>
          <li>The ball speeds up a little on every paddle hit; Slow resets the pace for 10 s.</li>
        </ul></details>
      </div>`;
    el.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d'); side = root.querySelector('.ag-side');
    ui = { score: root.querySelector('[data-k=score]'), hi: root.querySelector('[data-k=hi]'), level: root.querySelector('[data-k=level]'), lives: root.querySelector('[data-k=lives]'),
      pause: root.querySelector('[data-a=pause]'), sound: root.querySelector('[data-a=sound]') };
    const setSoundLabel = () => { ui.sound.textContent = soundOn ? '🔊' : '🔇'; };
    setSoundLabel();
    on(root.querySelector('[data-a=new]'), 'click', (e) => { e.currentTarget.blur(); ensureAudio(); if (S) saveHi(); newGame(); });
    on(ui.pause, 'click', (e) => { e.currentTarget.blur(); setPaused(!S.paused); });
    on(ui.sound, 'click', (e) => { e.currentTarget.blur(); soundOn = !soundOn; setSoundLabel(); try { api.save('sound', soundOn); } catch (er) { /* ignore */ } if (soundOn) ensureAudio(); });
    on(cv, 'pointermove', (e) => { if (!S || S.paused) return; const r = cv.getBoundingClientRect(); S.mouseX = ((e.clientX - r.left) / r.width) * W; if (S.phase === 'serve' || S.phase === 'play') kick(); });
    on(cv, 'pointerdown', (e) => { e.preventDefault(); action(); });
    on(window, 'keydown', onKey);
    on(window, 'keyup', onKeyUp);
    on(window, 'resize', fit);
    on(window, 'blur', () => { for (const k in keys) keys[k] = false; if (S && el && S.phase !== 'over' && !S.paused) { S.paused = true; S.autoPaused = true; syncUI(); if (visible()) draw(); } });
    on(document, 'visibilitychange', () => { if (document.hidden) autoPause(); });
    if (window.ResizeObserver) { ro = new ResizeObserver(() => fit()); ro.observe(el); }
    newGame(); fit(); draw();
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
    listeners.length = 0;
    for (const k in keys) keys[k] = false;
    if (ro) { ro.disconnect(); ro = null; }
    if (AC) { try { AC.close(); } catch (e) { /* ignore */ } AC = null; }
    if (S && api) saveHi();
    if (el) el.innerHTML = '';
    el = null; root = null; cv = null; ctx = null; ui = {}; S = null;
  }

  window.VanArcade = window.VanArcade || {};
  window.VanArcade[ID] = {
    mount, unmount,
    _debug: { get S() { return S; }, update: (dt) => update(dt), applyPower: (k) => applyPower(k), launch: () => launch(), loadLevel: (n) => loadLevel(n), get raf() { return raf; }, W, H, PY },
  };
})();
