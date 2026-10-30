/* VanMule Arcade: Snake - grid snake with smooth interpolated movement.
   window.VanArcade.snake.mount(el, api) / unmount() */
(function () {
  'use strict';
  const ID = 'snake';
  const COLS = 26, ROWS = 18;
  const DIRS = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
  const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };
  const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' };
  const OBSTACLES = (() => {
    const o = [];
    const bar = (x, y, len, vert) => { for (let i = 0; i < len; i++) o.push(vert ? [x, y + i] : [x + i, y]); };
    bar(5, 3, 5, false); bar(5, 4, 2, true);           // top-left L
    bar(16, 3, 5, false); bar(20, 4, 2, true);         // top-right L
    bar(5, 14, 5, false); bar(5, 12, 2, true);         // bottom-left L
    bar(16, 14, 5, false); bar(20, 12, 2, true);       // bottom-right L
    bar(12, 6, 2, false); bar(12, 11, 2, false);       // centre posts
    return o;
  })();
  const CSS = `
.ag-snake{display:flex;gap:18px;align-items:flex-start;color:var(--fg);font-family:var(--body);user-select:none}
.ag-snake.narrow{flex-direction:column;gap:10px}
.ag-snake .ag-stage{flex:0 0 auto;line-height:0}
.ag-snake canvas{display:block;border-radius:14px;background:#08090b;box-shadow:0 0 0 1px var(--line),0 18px 40px rgba(0,0,0,.45)}
.ag-snake .ag-side{flex:1 1 220px;min-width:210px;max-width:290px;display:flex;flex-direction:column;gap:12px}
.ag-snake.narrow .ag-side{max-width:none;width:100%;order:-1}
.ag-snake h2{font-family:var(--display);font-size:22px;line-height:1.1;margin:0}
.ag-snake h2 em{font-style:normal;color:var(--ember)}
.ag-snake .ag-how{color:var(--muted);font-size:13px;margin:0}
.ag-snake .ag-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.ag-snake .ag-stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.ag-snake .ag-stat span{display:block;font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em}
.ag-snake .ag-stat b{display:block;font-family:var(--mono);font-size:17px;font-weight:700}
.ag-snake .ag-stat.hi b{color:var(--gold)}
.ag-snake .ag-btns{display:flex;gap:8px;flex-wrap:wrap}
.ag-snake .ag-opt{display:flex;flex-direction:column;gap:5px}
.ag-snake .ag-opt>span{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em}
.ag-snake .ag-seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:3px;gap:3px}
.ag-snake .ag-seg button{height:28px;padding:0 12px;border-radius:7px;font-size:13px;font-weight:600;color:var(--muted)}
.ag-snake .ag-seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-snake .ag-seg button:hover{color:var(--fg)}
.ag-snake .ag-keys{font-size:12px;color:var(--dim);line-height:1.7}
.ag-snake kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-snake details{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--muted)}
.ag-snake summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-snake details ul{margin:8px 0 2px;padding-left:18px}
.ag-snake details li{margin:3px 0}
`;

  let el = null, api = null, root = null, cv = null, ctx = null, side = null, ui = {};
  let raf = 0, lastT = 0, ro = null, dpr = 1, cs = 28, S = null, AC = null, soundOn = true;
  let opts = { walls: 'solid', obstacles: false }, his = {};
  const listeners = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };
  const visible = () => !!(el && !document.hidden && el.offsetParent !== null);
  const modeKey = () => opts.walls + (opts.obstacles ? '+obs' : '');
  const hiNow = () => his[modeKey()] || 0;

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
  function sfx(k) {
    if (k === 'eat') tone('square', 520, 880, 0.08, 0.07);
    else if (k === 'bonus') { [880, 1175, 1568].forEach((f, i) => tone('triangle', f, 0, 0.09, 0.09, i * 0.06)); }
    else if (k === 'die') tone('sawtooth', 300, 60, 0.6, 0.1);
    else if (k === 'turn') tone('sine', 220, 0, 0.025, 0.03);
  }

  /* ---------- game ---------- */
  function newGame() {
    const sy = Math.floor(ROWS / 2), sx = 6;
    S = { phase: 'ready', paused: false, autoPaused: false, snake: [], prevTail: null, dir: 'right', queue: [], grow: 0, food: null, bonus: null,
      obst: new Set(), score: 0, eaten: 0, acc: 0, time: 0, ticks: 0, frames: 0, parts: [], dieT: 0, newHi: false };
    for (let i = 0; i < 4; i++) S.snake.push({ x: sx - i, y: sy });
    S.prevTail = { x: sx - 4, y: sy };
    if (opts.obstacles) for (const [x, y] of OBSTACLES) S.obst.add(x + ',' + y);
    S.food = freeCell();
    syncUI(); kick();
  }
  const interval = () => Math.max(0.055, 0.135 - S.eaten * 0.0035);
  function occupied(x, y) {
    if (S.obst.has(x + ',' + y)) return true;
    for (const s of S.snake) if (s.x === x && s.y === y) return true;
    if (S.food && S.food.x === x && S.food.y === y) return true;
    if (S.bonus && S.bonus.x === x && S.bonus.y === y) return true;
    return false;
  }
  function freeCell() {
    const h = S.snake[0], free = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (occupied(x, y)) continue;
      if (Math.abs(x - h.x) + Math.abs(y - h.y) < 3) continue;
      free.push({ x, y });
    }
    return free.length ? free[(Math.random() * free.length) | 0] : null;
  }
  function queueDir(d) {
    const last = S.queue.length ? S.queue[S.queue.length - 1] : S.dir;
    if (d === last || d === OPP[last] || S.queue.length >= 3) return false;
    S.queue.push(d); return true;
  }
  function tick() {
    S.ticks++;
    if (S.queue.length) { S.dir = S.queue.shift(); sfx('turn'); }
    const d = DIRS[S.dir], h = S.snake[0];
    let nx = h.x + d.x, ny = h.y + d.y;
    if (opts.walls === 'wrap') { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
    else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return die();
    if (S.obst.has(nx + ',' + ny)) return die();
    const tailMoves = S.grow === 0;
    for (let i = 0; i < S.snake.length - (tailMoves ? 1 : 0); i++) if (S.snake[i].x === nx && S.snake[i].y === ny) return die();
    const tail = S.snake[S.snake.length - 1];
    S.snake.unshift({ x: nx, y: ny });
    if (S.grow > 0) { S.grow--; S.prevTail = { x: tail.x, y: tail.y }; }
    else { S.snake.pop(); S.prevTail = { x: tail.x, y: tail.y }; }
    if (S.food && nx === S.food.x && ny === S.food.y) {
      S.eaten++; S.grow += 1; addScore(10); burst(nx, ny, '#ff6b5e'); sfx('eat');
      S.food = freeCell();
      if (!S.bonus && S.eaten >= 3 && Math.random() < 0.28) { const c = freeCell(); if (c) S.bonus = { x: c.x, y: c.y, life: 45, max: 45 }; }
    } else if (S.bonus && nx === S.bonus.x && ny === S.bonus.y) {
      addScore(50); S.grow += 2; burst(nx, ny, '#ffc861', 26); sfx('bonus'); S.bonus = null;
    }
    if (S.bonus && --S.bonus.life <= 0) S.bonus = null;
    if (!S.food) die(true);
  }
  function die(won) {
    S.phase = 'dying'; S.dieT = 0.9; S.paused = false; sfx('die'); kick();
    const h = S.snake[0]; burst(h.x, h.y, won ? '#ffc861' : '#ff5a52', 30);
    if (S.score > hiNow()) { his[modeKey()] = S.score; S.newHi = true; try { api.save('hi', his); } catch (e) { /* ignore */ } }
    syncUI();
  }
  function addScore(n) { S.score += n; syncUI(); }
  function burst(x, y, color, n) {
    for (let i = 0; i < (n || 14); i++) {
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5;
      S.parts.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, t: 0, color });
    }
  }
  function update(dt) {
    S.time += dt;
    for (const p of S.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    S.parts = S.parts.filter((p) => p.t < p.life);
    if (S.phase === 'dying') { S.dieT -= dt; if (S.dieT <= 0) { S.phase = 'over'; syncUI(); } return; }
    if (S.phase !== 'play') return;
    S.acc += dt;
    let n = 0;
    while (S.acc >= interval() && S.phase === 'play' && n++ < 5) { S.acc -= interval(); tick(); }
  }

  /* ---------- loop ---------- */
  const animating = () => S && !S.paused && (S.phase === 'play' || S.phase === 'dying' || S.parts.length > 0);
  function kick() { if (!raf && el) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    if (!visible()) { autoPause(); return; }
    S.frames++;
    if (!lastT) lastT = t;
    const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    if (!S.paused) update(dt);
    draw();
    if (animating()) raf = requestAnimationFrame(frame);
  }
  function autoPause() {
    if (S && S.phase === 'play' && !S.paused) { S.paused = true; S.autoPaused = true; syncUI(); }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function setPaused(v) {
    if (!S || S.phase !== 'play') return;
    S.paused = v; S.autoPaused = false; syncUI();
    if (!v) kick(); else if (visible()) draw();
  }

  /* ---------- drawing ---------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function txt(s, x, y, size, color, weight) {
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${weight || 700} ${Math.round(size)}px ${getComputedStyle(root).getPropertyValue('--display').trim() || 'system-ui'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.fillText(s, x, y); ctx.restore();
  }
  function snakePoints(f) {
    // unwrapped polyline from head to tail in cell units; head and tail are interpolated by f
    const sn = S.snake, U = [{ x: sn[0].x, y: sn[0].y }];
    const unwrapStep = (a, b) => {
      let dx = b.x - a.x, dy = b.y - a.y;
      if (dx > 1) dx -= COLS; else if (dx < -1) dx += COLS;
      if (dy > 1) dy -= ROWS; else if (dy < -1) dy += ROWS;
      return { dx, dy };
    };
    for (let i = 1; i < sn.length; i++) { const s = unwrapStep(sn[i - 1], sn[i]); U.push({ x: U[i - 1].x + s.dx, y: U[i - 1].y + s.dy }); }
    const n = U.length, pts = [{ x: U[1].x + (U[0].x - U[1].x) * f, y: U[1].y + (U[0].y - U[1].y) * f }];
    for (let i = 1; i < n; i++) pts.push(U[i]);
    if (S.prevTail) {
      const s = unwrapStep(sn[n - 1], S.prevTail), pt = { x: U[n - 1].x + s.dx, y: U[n - 1].y + s.dy };
      pts.push({ x: pt.x + (U[n - 1].x - pt.x) * f, y: pt.y + (U[n - 1].y - pt.y) * f });
    }
    return pts;
  }
  function draw() {
    if (!ctx || !S) return;
    const s = cs * dpr, W = COLS * s, H = ROWS * s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#08090b'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // board
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < ROWS; y++) for (let x = (y & 1); x < COLS; x += 2) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let y = 1; y < ROWS; y++) for (let x = 1; x < COLS; x++) ctx.fillRect(x - 0.04, y - 0.04, 0.08, 0.08);
    // obstacles
    for (const k of S.obst) {
      const [x, y] = k.split(',').map(Number);
      ctx.fillStyle = '#2b3a3f'; rr(x + 0.06, y + 0.06, 0.88, 0.88, 0.18); ctx.fill();
      ctx.strokeStyle = 'rgba(111,211,199,0.55)'; ctx.lineWidth = 0.06; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 0.18, y + 0.16, 0.5, 0.12);
    }
    const f = S.phase === 'play' ? Math.min(1, S.acc / interval()) : 1;
    // food
    if (S.food) {
      const pulse = 1 + Math.sin(S.time * 6) * 0.06, fx = S.food.x + 0.5, fy = S.food.y + 0.5;
      ctx.save(); ctx.translate(fx, fy); ctx.scale(pulse, pulse);
      ctx.shadowColor = '#ff5a52'; ctx.shadowBlur = s * 0.6; ctx.fillStyle = '#ff5a52';
      ctx.beginPath(); ctx.arc(0, 0.04, 0.32, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(-0.11, -0.06, 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.ellipse(0.12, -0.32, 0.13, 0.06, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (S.bonus) {
      const b = S.bonus, bx = b.x + 0.5, by = b.y + 0.5, blink = b.life < 12 && Math.floor(S.time * 8) % 2 === 0;
      if (!blink) {
        ctx.save(); ctx.translate(bx, by); ctx.rotate(S.time * 1.5);
        ctx.shadowColor = '#ffc861'; ctx.shadowBlur = s * 0.8; ctx.fillStyle = '#ffc861'; ctx.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.17 : 0.4, a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
      const frac = Math.max(0, (b.life - (S.phase === 'play' ? f : 0)) / b.max);
      ctx.strokeStyle = 'rgba(255,200,97,0.7)'; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.arc(bx, by, 0.47, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    }
    // snake (drawn at wrap offsets so it slides through edges)
    const pts = snakePoints(f);
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const p of pts) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); }
    const offs = [];
    for (const ox of [-COLS, 0, COLS]) for (const oy of [-ROWS, 0, ROWS]) {
      if (maxx + ox + 1 < 0 || minx + ox > COLS || maxy + oy + 1 < 0 || miny + oy > ROWS) continue;
      offs.push([ox, oy]);
    }
    const dead = S.phase === 'dying' || S.phase === 'over';
    const body = dead ? (S.phase === 'dying' && Math.floor(S.dieT * 10) % 2 ? '#ff5a52' : '#8a4a2a') : '#ff8a3d';
    for (const [ox, oy] of offs) {
      ctx.save(); ctx.translate(ox, oy);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const path = new Path2D(); pts.forEach((p, i) => (i ? path.lineTo(p.x + 0.5, p.y + 0.5) : path.moveTo(p.x + 0.5, p.y + 0.5)));
      ctx.strokeStyle = body; ctx.lineWidth = 0.74; if (!dead) { ctx.shadowColor = 'rgba(255,138,61,0.8)'; ctx.shadowBlur = s * 0.5; }
      ctx.stroke(path); ctx.shadowBlur = 0;
      ctx.strokeStyle = dead ? 'rgba(255,255,255,0.08)' : 'rgba(255,200,140,0.45)'; ctx.lineWidth = 0.26; ctx.stroke(path);
      // tail taper dot
      const tl = pts[pts.length - 1];
      ctx.fillStyle = dead ? '#5a3020' : '#c65d22'; ctx.beginPath(); ctx.arc(tl.x + 0.5, tl.y + 0.5, 0.22, 0, Math.PI * 2); ctx.fill();
      // head
      const hd = pts[0], d = DIRS[S.dir];
      ctx.fillStyle = dead ? '#8a4a2a' : '#ffa060'; ctx.beginPath(); ctx.arc(hd.x + 0.5, hd.y + 0.5, 0.44, 0, Math.PI * 2); ctx.fill();
      const px = -d.y, py = d.x;
      for (const sgn of [-1, 1]) {
        const ex = hd.x + 0.5 + d.x * 0.12 + px * 0.2 * sgn, ey = hd.y + 0.5 + d.y * 0.12 + py * 0.2 * sgn;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1b0d03'; ctx.beginPath();
        if (dead) { ctx.lineWidth = 0.05; ctx.strokeStyle = '#1b0d03'; ctx.moveTo(ex - 0.07, ey - 0.07); ctx.lineTo(ex + 0.07, ey + 0.07); ctx.moveTo(ex + 0.07, ey - 0.07); ctx.lineTo(ex - 0.07, ey + 0.07); ctx.stroke(); }
        else { ctx.arc(ex + d.x * 0.04, ey + d.y * 0.04, 0.06, 0, Math.PI * 2); ctx.fill(); }
      }
      if (!dead && Math.sin(S.time * 3) > 0.85) {
        ctx.strokeStyle = '#ff5a52'; ctx.lineWidth = 0.06; ctx.beginPath();
        const tx = hd.x + 0.5 + d.x * 0.44, ty = hd.y + 0.5 + d.y * 0.44;
        ctx.moveTo(tx, ty); ctx.lineTo(tx + d.x * 0.22, ty + d.y * 0.22);
        ctx.lineTo(tx + d.x * 0.3 + px * 0.07, ty + d.y * 0.3 + py * 0.07); ctx.moveTo(tx + d.x * 0.22, ty + d.y * 0.22);
        ctx.lineTo(tx + d.x * 0.3 - px * 0.07, ty + d.y * 0.3 - py * 0.07); ctx.stroke();
      }
      ctx.restore();
    }
    // particles
    for (const p of S.parts) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - 0.07, p.y - 0.07, 0.14, 0.14); }
    ctx.globalAlpha = 1;
    // border
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = 2 * dpr;
    if (opts.walls === 'solid') { ctx.strokeStyle = 'rgba(255,138,61,0.75)'; ctx.shadowColor = '#ff8a3d'; ctx.shadowBlur = 12 * dpr; ctx.setLineDash([]); }
    else { ctx.strokeStyle = 'rgba(111,211,199,0.6)'; ctx.shadowColor = '#6fd3c7'; ctx.shadowBlur = 8 * dpr; ctx.setLineDash([8 * dpr, 8 * dpr]); }
    ctx.strokeRect(dpr, dpr, W - 2 * dpr, H - 2 * dpr); ctx.setLineDash([]); ctx.shadowBlur = 0;
    // overlays
    const cxp = (COLS * cs) / 2, cyp = (ROWS * cs) / 2;
    if (S.phase === 'ready') {
      ctx.fillStyle = 'rgba(8,9,11,0.45)'; ctx.fillRect(0, 0, W, H);
      txt('SNAKE', cxp, cyp - cs * 1.6, cs * 1.5, '#ff8a3d', 800);
      txt('Press an arrow key to start', cxp, cyp + cs * 0.4, cs * 0.6, '#f3ece5', 600);
      txt((opts.walls === 'wrap' ? 'Wrap-around walls' : 'Solid walls') + (opts.obstacles ? ' · Obstacles' : ''), cxp, cyp + cs * 1.4, cs * 0.45, '#a3968a', 500);
    } else if (S.phase === 'over') {
      ctx.fillStyle = 'rgba(8,9,11,0.6)'; ctx.fillRect(0, 0, W, H);
      txt('GAME OVER', cxp, cyp - cs * 1.2, cs * 1.2, '#ff5a52', 800);
      txt(S.newHi ? `New high score: ${S.score}` : `Score ${S.score}`, cxp, cyp + cs * 0.3, cs * 0.65, S.newHi ? '#ffc861' : '#f3ece5', 600);
      txt('Space or arrow key to play again', cxp, cyp + cs * 1.4, cs * 0.45, '#a3968a', 500);
    } else if (S.paused) {
      ctx.fillStyle = 'rgba(8,9,11,0.6)'; ctx.fillRect(0, 0, W, H);
      txt('PAUSED', cxp, cyp - cs * 0.4, cs * 1.2, '#ffc861', 800);
      txt(S.autoPaused ? 'Press P, Space or click to resume' : 'Press P or Space to resume', cxp, cyp + cs * 0.9, cs * 0.5, '#a3968a', 500);
    }
  }

  /* ---------- layout / ui ---------- */
  function fit() {
    if (!el || !cv || el.offsetParent === null) return;
    const narrow = el.clientWidth < 560;
    root.classList.toggle('narrow', narrow);
    const top = cv.parentNode.getBoundingClientRect().top;
    const availH = Math.max(260, window.innerHeight - top - 40);
    const availW = Math.max(260, narrow ? el.clientWidth : el.clientWidth - 18 - Math.max(210, side.offsetWidth || 230));
    let c = Math.min(availH / ROWS, availW / COLS, 34);
    c = Math.max(10, Math.floor(c));
    const nd = window.devicePixelRatio || 1;
    if (c === cs && nd === dpr && cv.width) return;
    cs = c; dpr = nd;
    cv.style.width = COLS * cs + 'px'; cv.style.height = ROWS * cs + 'px';
    cv.width = Math.round(COLS * cs * dpr); cv.height = Math.round(ROWS * cs * dpr);
    draw();
  }
  function syncUI() {
    if (!ui.score || !S) return;
    ui.score.textContent = S.score; ui.hi.textContent = Math.max(hiNow(), S.score); ui.len.textContent = S.snake.length;
    ui.pause.textContent = S.paused ? 'Resume' : 'Pause'; ui.pause.disabled = S.phase !== 'play';
    for (const b of root.querySelectorAll('[data-walls]')) b.classList.toggle('on', b.dataset.walls === opts.walls);
    for (const b of root.querySelectorAll('[data-obs]')) b.classList.toggle('on', (b.dataset.obs === '1') === opts.obstacles);
  }
  function start(dir) {
    if (S.phase === 'over' || S.phase === 'dying') newGame();
    if (S.phase === 'ready') { S.phase = 'play'; S.acc = 0; if (dir && dir !== 'left') queueDir(dir); syncUI(); kick(); }
  }
  function onKey(e) {
    if (!el || el.offsetParent === null) return;
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dir = KEYMAP[e.code];
    if (dir) {
      e.preventDefault(); ensureAudio();
      if (S.phase === 'ready' || S.phase === 'over') { if (!e.repeat) start(dir); return; }
      if (S.phase !== 'play') return;
      if (S.paused) setPaused(false);
      queueDir(dir); return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (S.phase !== 'play') return;
      e.preventDefault(); setPaused(!S.paused); return;
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault(); ensureAudio();
      if (S.phase === 'play') setPaused(!S.paused); else if (!e.repeat) start(null);
    }
  }

  function mount(container, theApi) {
    if (el) unmount();
    el = container; api = theApi || { load: () => null, save() {}, sound: false, toast() {} };
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    let h = null, o = null, sv = null;
    try { h = api.load('hi'); o = api.load('opts'); sv = api.load('sound'); } catch (e) { /* ignore */ }
    his = h && typeof h === 'object' ? h : {};
    if (o && typeof o === 'object') opts = { walls: o.walls === 'wrap' ? 'wrap' : 'solid', obstacles: !!o.obstacles };
    else opts = { walls: 'solid', obstacles: false };
    soundOn = !!api.sound && sv !== false;
    root = document.createElement('div'); root.className = 'ag-' + ID;
    root.innerHTML = `
      <div class="ag-stage"><canvas aria-label="Snake board"></canvas></div>
      <div class="ag-side">
        <div><h2>Neon <em>Snake</em></h2><p class="ag-how">Eat the red apples to grow. Golden stars are worth 50 but vanish fast. Don't bite yourself.</p></div>
        <div class="ag-stats">
          <div class="ag-stat"><span>Score</span><b data-k="score">0</b></div>
          <div class="ag-stat hi"><span>Best</span><b data-k="hi">0</b></div>
          <div class="ag-stat"><span>Length</span><b data-k="len">4</b></div>
        </div>
        <div class="ag-btns">
          <button class="btn pri small" data-a="new">New game</button>
          <button class="btn sec small" data-a="pause">Pause</button>
          <button class="btn sec small" data-a="sound" title="Toggle sound"></button>
        </div>
        <div class="ag-opt"><span>Walls</span><div class="ag-seg"><button data-walls="solid">Solid</button><button data-walls="wrap">Wrap-around</button></div></div>
        <div class="ag-opt"><span>Obstacles</span><div class="ag-seg"><button data-obs="0">Off</button><button data-obs="1">On</button></div></div>
        <div class="ag-keys"><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> steer · <kbd>P</kbd>/<kbd>Space</kbd> pause</div>
        <details><summary>Tips</summary><ul>
          <li>Turns are queued, so you can tap two keys quickly to make a tight U-turn.</li>
          <li>The snake speeds up with every apple.</li>
          <li>Each wall/obstacle combination keeps its own best score.</li>
          <li>Hug the edges early and keep the middle open for later.</li>
        </ul></details>
      </div>`;
    el.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d'); side = root.querySelector('.ag-side');
    ui = { score: root.querySelector('[data-k=score]'), hi: root.querySelector('[data-k=hi]'), len: root.querySelector('[data-k=len]'),
      pause: root.querySelector('[data-a=pause]'), sound: root.querySelector('[data-a=sound]') };
    const setSoundLabel = () => { ui.sound.textContent = soundOn ? '🔊' : '🔇'; };
    setSoundLabel();
    on(root.querySelector('[data-a=new]'), 'click', (e) => { e.currentTarget.blur(); ensureAudio(); newGame(); });
    on(ui.pause, 'click', (e) => { e.currentTarget.blur(); setPaused(!S.paused); });
    on(ui.sound, 'click', (e) => { e.currentTarget.blur(); soundOn = !soundOn; setSoundLabel(); try { api.save('sound', soundOn); } catch (er) { /* ignore */ } if (soundOn) ensureAudio(); });
    const setOpt = (k, v) => { opts[k] = v; try { api.save('opts', opts); } catch (er) { /* ignore */ } newGame(); };
    for (const b of root.querySelectorAll('[data-walls]')) on(b, 'click', (e) => { e.currentTarget.blur(); setOpt('walls', b.dataset.walls); });
    for (const b of root.querySelectorAll('[data-obs]')) on(b, 'click', (e) => { e.currentTarget.blur(); setOpt('obstacles', b.dataset.obs === '1'); });
    on(cv, 'pointerdown', () => { ensureAudio(); if (S.phase === 'play' && S.paused) setPaused(false); else if (S.phase === 'ready' || S.phase === 'over') start(null); });
    on(window, 'keydown', onKey);
    on(window, 'resize', fit);
    on(window, 'blur', () => { if (S && el && S.phase === 'play' && !S.paused) { S.paused = true; S.autoPaused = true; syncUI(); if (visible()) draw(); } });
    on(document, 'visibilitychange', () => { if (document.hidden) autoPause(); });
    if (window.ResizeObserver) { ro = new ResizeObserver(() => fit()); ro.observe(el); }
    newGame(); fit(); draw();
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
    listeners.length = 0;
    if (ro) { ro.disconnect(); ro = null; }
    if (AC) { try { AC.close(); } catch (e) { /* ignore */ } AC = null; }
    if (el) el.innerHTML = '';
    el = null; root = null; cv = null; ctx = null; ui = {}; S = null;
  }

  window.VanArcade = window.VanArcade || {};
  window.VanArcade[ID] = {
    mount, unmount,
    _debug: { get S() { return S; }, tick() { tick(); syncUI(); }, get opts() { return opts; }, get raf() { return raf; }, queueDir: (d) => queueDir(d) },
  };
})();
