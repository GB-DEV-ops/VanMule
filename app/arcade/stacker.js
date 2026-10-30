/* VanMule Arcade: Block Stack, a falling-block line-clearing puzzle. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};

  const ID = 'stacker';
  const COLS = 10, ROWS = 22, HIDDEN = 2;           // 20 visible rows + 2 spawn rows
  const DAS = 160, ARR = 33, LOCK_MS = 500, MAX_RESETS = 15, CLEAR_MS = 180;
  const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const COLORS = { I: '#ff8a3d', O: '#ffc861', T: '#6fd3c7', S: '#9be15d', Z: '#ff6b8b', J: '#9a86ff', L: '#4cb8ff' };
  const BASE = {
    I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  };
  // SHAPES[t][r] = list of [x,y]; rotation r: 0, R, 2, L (clockwise order)
  const SHAPES = {};
  for (const t of TYPES) {
    const { n, c } = BASE[t];
    const rs = [c];
    for (let r = 1; r < 4; r++) rs.push(t === 'O' ? c : rs[r - 1].map(([x, y]) => [n - 1 - y, x]));
    SHAPES[t] = rs;
  }
  // SRS kick data (x right, y up), converted on use
  const K_JLSTZ = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };
  const K_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };
  const LINE_PTS = [0, 100, 300, 500, 800];
  const LINE_NAMES = ['', 'Single', 'Double', 'Triple', 'Quad!'];
  // line clear: rows flash + shrink (0..FLASH_MS), the stack above slides down (FALL_START..CLEAR_MS).
  // Input is never dropped during it: taps are buffered and replayed on the next piece, DAS keeps charging.
  const FLASH_MS = 110, FALL_START = 60, BUF_MAX = 4;

  const CSS = `
.ag-stacker{display:flex;flex-direction:column;gap:12px;user-select:none;-webkit-user-select:none;--ags-side:170px;--ags-gap:18px}
.ag-stacker .ags-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
.ag-stacker .ags-title{font-family:var(--display);font-size:24px;font-weight:700;margin:0;line-height:1.1}
.ag-stacker .ags-how{color:var(--muted);font-size:13px;margin-top:4px}
.ag-stacker .ags-actions{display:flex;gap:8px;align-items:center}
.ag-stacker .ags-play{display:flex;justify-content:center;align-items:flex-start;gap:var(--ags-gap)}
.ag-stacker .ags-col{display:flex;flex-direction:column;gap:12px;width:var(--ags-side);flex:none;min-width:0}
.ag-stacker .ags-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px;line-height:1.3}
.ag-stacker .ags-lab{font-family:var(--display);font-size:10.5px;font-weight:700;letter-spacing:.14em;color:var(--muted);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center}
.ag-stacker .ags-lab small{font-family:var(--body);letter-spacing:0;font-weight:600;font-size:11px;color:var(--dim)}
.ag-stacker .ags-card canvas{display:block;margin:0 auto}
.ag-stacker .ags-stat{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:5px 0;border-top:1px solid var(--line)}
.ag-stacker .ags-stat:first-child{border-top:0;padding-top:0}
.ag-stacker .ags-stat span{font-family:var(--display);font-size:10px;font-weight:700;letter-spacing:.12em;color:var(--muted)}
.ag-stacker .ags-stat b{font-family:var(--mono);font-size:17px;color:var(--fg);font-weight:600}
.ag-stacker .ags-stat.big{display:block}
.ag-stacker .ags-stat.big b{display:block;font-size:26px;color:var(--ember);line-height:1.15;overflow:hidden;text-overflow:ellipsis}
.ag-stacker .ags-stat.combo b{color:var(--gold)}
.ag-stacker .ags-meter{height:5px;border-radius:3px;background:var(--panel2);overflow:hidden;margin-top:4px}
.ag-stacker .ags-meter i{display:block;height:100%;background:var(--cool);width:0;transition:width .2s}
.ag-stacker .ags-keys{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;font-size:12px;color:var(--muted);align-items:center}
.ag-stacker .ags-keys kbd{justify-self:start}
.ag-stacker.ags-short .ags-keyc{display:none}
.ag-stacker .ags-stage{position:relative;line-height:0;flex:none;border-radius:10px;border:1px solid var(--line);box-shadow:0 10px 36px rgba(0,0,0,.45);overflow:hidden;background:#0b090c}
.ag-stacker canvas{display:block}
.ag-stacker .ags-over{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;line-height:1.4}
.ag-stacker .ags-over>div{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 22px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.55);max-width:88%}
.ag-stacker .ags-over h3{font-family:var(--display);font-size:20px;margin:0 0 6px}
.ag-stacker .ags-over p{margin:0 0 14px;color:var(--muted);font-size:13px}
.ag-stacker .ags-over b{font-family:var(--mono);color:var(--fg)}
.ag-stacker details{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 14px;font-size:13px;color:var(--muted)}
.ag-stacker summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-stacker details ul{margin:8px 0 4px;padding-left:18px}
.ag-stacker kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-radius:4px;padding:0 5px;color:var(--fg);line-height:1.5}
`;

  let el = null, api = null, root = null, cv = null, ctx = null, ui = {};
  let raf = 0, last = 0, mounted = false, ro = null, actx = null, soundOn = true;
  let cell = 30, dpr = 1, side = 170, nextN = 5, sideKeys = {};
  let G = null;
  let fonts = { mono: 'monospace', display: 'sans-serif', body: 'sans-serif' };

  /* ---------------- game state ---------------- */
  function emptyBoard() { return Array.from({ length: ROWS }, () => new Array(COLS).fill(null)); }

  function newGame() {
    G = {
      state: 'ready', board: emptyBoard(), bag: [], queue: [], hold: null, holdUsed: false, cur: null,
      score: 0, lines: 0, level: 1, combo: -1, b2b: false, best: G ? G.best : 0,
      gT: 0, lockT: 0, resets: 0, lowest: 0, soft: false,
      das: { dir: 0, t: 0, arr: 0 }, held: { left: false, right: false },
      clearing: null, buf: [], pops: [], drops: [], lastKick: -1, newBest: false,
    };
    refill();
  }

  function refill() {
    while (G.queue.length < 7) {
      if (!G.bag.length) {
        G.bag = TYPES.slice();
        for (let i = G.bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [G.bag[i], G.bag[j]] = [G.bag[j], G.bag[i]]; }
      }
      G.queue.push(G.bag.pop());
    }
  }

  function spawnPiece(t) {
    // every piece spawns with its lowest row on the first visible row (board row 2)
    const p = { t, r: 0, x: t === 'O' ? 4 : 3, y: 1 };
    G.cur = p; G.gT = 0; G.lockT = 0; G.resets = 0; G.lowest = p.y;
    if (!fits(p.t, p.r, p.x, p.y)) { gameOver(); return false; }
    // drop once immediately if possible (guideline)
    if (fits(p.t, p.r, p.x, p.y + 1)) { p.y++; G.lowest = p.y; }
    return true;
  }

  function nextPiece() {
    const t = G.queue.shift();
    refill();
    G.holdUsed = false;
    return spawnPiece(t);
  }

  function fits(t, r, x, y) {
    for (const [cx, cy] of SHAPES[t][r]) {
      const bx = x + cx, by = y + cy;
      if (bx < 0 || bx >= COLS || by >= ROWS) return false;
      if (by >= 0 && G.board[by][bx]) return false;
    }
    return true;
  }

  function grounded() { const p = G.cur; return !fits(p.t, p.r, p.x, p.y + 1); }

  function onMoved() {
    // lock delay move-reset
    const p = G.cur;
    if (p.y > G.lowest) { G.lowest = p.y; G.resets = 0; }
    if (G.lockT > 0 || grounded()) {
      if (G.resets < MAX_RESETS) { G.lockT = 0; G.resets++; }
    }
  }

  function move(dx) {
    const p = G.cur;
    if (!p || !playing()) return false;
    if (fits(p.t, p.r, p.x + dx, p.y)) { p.x += dx; onMoved(); sfx('move'); return true; }
    return false;
  }

  function rotate(dir) {
    const p = G.cur;
    if (!p || !playing()) return false;
    if (p.t === 'O') { G.lastKick = 0; return true; }
    const to = (p.r + dir + 4) % 4, kicks = (p.t === 'I' ? K_I : K_JLSTZ)[p.r + '>' + to];
    for (let k = 0; k < kicks.length; k++) {
      const nx = p.x + kicks[k][0], ny = p.y - kicks[k][1];
      if (fits(p.t, to, nx, ny)) { p.x = nx; p.y = ny; p.r = to; G.lastKick = k; onMoved(); sfx('rot'); return true; }
    }
    G.lastKick = -1;
    return false;
  }

  function ghostY() {
    const p = G.cur;
    let y = p.y;
    while (fits(p.t, p.r, p.x, y + 1)) y++;
    return y;
  }

  function hardDrop() {
    const p = G.cur;
    if (!p || !playing()) return;
    const gy = ghostY(), d = gy - p.y;
    G.drops.push({ t: p.t, r: p.r, x: p.x, y0: p.y, y1: gy, age: 0 });
    p.y = gy;
    G.score += d * 2;
    sfx('drop');
    lock();
  }

  function hold() {
    if (!G.cur || !playing() || G.holdUsed) return;
    const t = G.cur.t;
    sfx('hold');
    if (G.hold) { const h = G.hold; G.hold = t; spawnPiece(h); }
    else { G.hold = t; nextPiece(); }
    G.holdUsed = true;
  }

  function lock() {
    const p = G.cur;
    let above = true;
    for (const [cx, cy] of SHAPES[p.t][p.r]) {
      const by = p.y + cy;
      if (by >= 0) G.board[by][p.x + cx] = p.t;
      if (by >= HIDDEN) above = false;
    }
    G.cur = null;
    if (above) { gameOver(); return; }   // lock out
    const full = [];
    for (let y = 0; y < ROWS; y++) if (G.board[y].every(Boolean)) full.push(y);
    if (full.length) {
      const n = full.length;
      let pts = LINE_PTS[n] * G.level;
      if (n === 4 && G.b2b) pts = Math.round(pts * 1.5);
      G.b2b = n === 4;
      G.combo++;
      if (G.combo > 0) pts += 50 * G.combo * G.level;
      G.score += pts;
      G.lines += n;
      const lv = Math.min(20, Math.floor(G.lines / 10) + 1);
      if (lv > G.level) { G.level = lv; G.pops.push({ text: 'Level ' + lv, age: 0, big: true }); sfx('level'); }
      for (const q of G.pops) if (!q.big) q.age = Math.max(q.age, 900);   // fade out the previous callout quickly
      G.pops.push({ text: LINE_NAMES[n] +(G.combo > 0 ? '  combo ×' + G.combo : ''), sub: '+' + pts, age: 0 });
      G.clearing = { rows: full, t: 0 };
      G.das.arr = 0;
      sfx(n === 4 ? 'quad' : 'clear');
    } else {
      G.combo = -1;
      sfx('lock');
      nextPiece();
    }
  }

  function finishClear() {
    const rows = G.clearing.rows;
    G.board = G.board.filter((_, y) => !rows.includes(y));
    while (G.board.length < ROWS) G.board.unshift(new Array(COLS).fill(null));
    G.clearing = null;
    if (!nextPiece()) { G.buf = []; return; }
    flushBuffer();
  }

  // replay keys pressed during the clear animation on the fresh piece, in order
  function flushBuffer() {
    const q = G.buf;
    G.buf = [];
    for (const a of q) {
      if (!G.cur || !playing()) break;
      if (a === 'left') move(-1);
      else if (a === 'right') move(1);
      else if (a === 'cw') rotate(1);
      else if (a === 'ccw') rotate(-1);
      else if (a === 'hold') hold();
      else if (a === 'hard') hardDrop();
    }
  }

  function gravityMs() {
    const l = G.level;
    return Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000;
  }

  function playing() { return G.state === 'play' && !G.clearing; }

  function update(dt) {
    G.pops = G.pops.filter((q) => (q.age += dt) < 1100);
    G.drops = G.drops.filter((q) => (q.age += dt) < 160);
    if (G.state !== 'play') return;
    if (G.clearing) {
      G.clearing.t += dt;
      if (G.das.dir) G.das.t = Math.min(DAS, G.das.t + dt);   // keep charging auto-shift through the clear
      if (G.clearing.t >= CLEAR_MS) finishClear();
      return;
    }
    if (!G.cur) return;
    // auto-shift
    const d = G.das;
    if (d.dir) {
      d.t += dt;
      if (d.t >= DAS) {
        d.arr += dt;
        while (d.arr >= ARR) { d.arr -= ARR; if (!move(d.dir)) { d.arr = 0; break; } }
      }
    }
    if (!G.cur) return;
    // gravity
    const base = gravityMs(), step = Math.max(0.5, G.soft ? Math.min(base / 20, 50) : base);
    G.gT += dt;
    while (G.gT >= step) {
      G.gT -= step;
      const p = G.cur;
      if (fits(p.t, p.r, p.x, p.y + 1)) {
        p.y++;
        if (G.soft) G.score += 1;
        if (p.y > G.lowest) { G.lowest = p.y; G.resets = 0; G.lockT = 0; }
      } else { G.gT = 0; break; }
    }
    // lock delay
    if (grounded()) {
      G.lockT += dt;
      if (G.lockT >= LOCK_MS) lock();
    } else G.lockT = 0;
  }

  function gameOver() {
    G.state = 'over';
    G.cur = null; G.clearing = null; G.buf = [];
    if (G.score > G.best) { G.best = G.score; G.newBest = G.score > 0; api.save('best', G.best); if (G.newBest && api.toast) api.toast('Block Stack: new best ' + G.best.toLocaleString()); }
    sfx('over');
    showOverlay();
    render();
  }

  function start() {
    const best = G ? G.best : 0;
    newGame();
    G.best = best;
    G.state = 'play';
    nextPiece();
    showOverlay();
    sideKeys = {};
    render();
    kick();
  }

  function setPaused(on) {
    if (on && G.state === 'play') { G.state = 'pause'; G.das.dir = 0; G.soft = false; G.held.left = G.held.right = false; G.buf = []; showOverlay(); render(); }
    else if (!on && G.state === 'pause') { G.state = 'play'; showOverlay(); kick(); }
    if (ui.pause) ui.pause.textContent = G.state === 'pause' ? 'Resume' : 'Pause';
  }

  /* ---------------- loop ---------------- */
  function kick() {
    if (!mounted || raf) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function frame(ts) {
    raf = 0;
    if (!mounted) return;
    if (document.hidden || el.offsetParent === null) { setPaused(true); return; }
    const dt = last ? Math.min(50, ts - last) : 16;
    last = ts;
    update(dt);
    render();
    if (G.state === 'play' || (G.state !== 'pause' && (G.pops.length || G.drops.length))) raf = requestAnimationFrame(frame);
  }

  /* ---------------- rendering ---------------- */
  function render() {
    if (!ctx || !G) return;
    renderBoard();
    renderSide();
  }

  const easeOut = (k) => 1 - (1 - k) * (1 - k);

  function renderBoard() {
    const c = cell, W = COLS * c, H = 20 * c;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b090c';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(x * c + 0.5, 0); ctx.lineTo(x * c + 0.5, H); }
    for (let y = 1; y < 20; y++) { ctx.moveTo(0, y * c + 0.5); ctx.lineTo(W, y * c + 0.5); }
    ctx.stroke();
    // board (with line-clear animation)
    const clr = G.clearing;
    let fk = 0, sk = 0;
    if (clr) {
      fk = Math.min(1, clr.t / FLASH_MS);
      sk = easeOut(Math.max(0, Math.min(1, (clr.t - FALL_START) / (CLEAR_MS - FALL_START))));
    }
    for (let y = 0; y < ROWS; y++) {
      const isClr = clr && clr.rows.includes(y);
      let shift = 0;
      if (clr && !isClr) { let n = 0; for (const r of clr.rows) if (r > y) n++; shift = n * c * sk; }
      const py = (y - HIDDEN) * c + shift;
      if (py <= -c) continue;
      if (isClr) {
        if (fk >= 1) continue;
        const s = 1 - fk;
        ctx.globalAlpha = 1 - fk * 0.5;
        for (let x = 0; x < COLS; x++) {
          const t = G.board[y][x]; if (!t) continue;
          const w = c * s, px = x * c + (c - w) / 2;
          drawCell(ctx, px, py + (c - w) / 2, w, fk < 0.4 ? '#fff6e8' : COLORS[t]);
        }
        ctx.globalAlpha = Math.max(0, 0.75 * (1 - fk));
        ctx.fillStyle = '#fff6e8';
        const bh = c * (0.35 + 0.65 * (1 - fk));
        ctx.fillRect(0, py + (c - bh) / 2, W, bh);
        ctx.globalAlpha = 1;
        continue;
      }
      for (let x = 0; x < COLS; x++) {
        const t = G.board[y][x];
        if (t) drawCell(ctx, x * c, py, c, COLORS[t]);
      }
    }
    // hard drop streaks
    for (const d of G.drops) {
      const a = 1 - d.age / 160;
      const xs = new Set(SHAPES[d.t][d.r].map(([x]) => x));
      for (const cx of xs) {
        let miny = 99;
        for (const [x, y] of SHAPES[d.t][d.r]) if (x === cx) miny = Math.min(miny, y);
        const top = Math.max(0, (d.y0 + miny - HIDDEN) * c), bot = (d.y1 + miny - HIDDEN) * c;
        if (bot <= top) continue;
        const gr = ctx.createLinearGradient(0, top, 0, bot);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, hexA(COLORS[d.t], 0.35 * a));
        ctx.fillStyle = gr;
        ctx.fillRect((d.x + cx) * c + 2, top, c - 4, bot - top);
      }
    }
    // ghost + current
    const p = G.cur;
    if (p && G.state !== 'over') {
      const gy = ghostY();
      for (const [cx, cy] of SHAPES[p.t][p.r]) {
        const px = (p.x + cx) * c, py = (gy + cy - HIDDEN) * c;
        ctx.fillStyle = hexA(COLORS[p.t], 0.13);
        ctx.fillRect(px + 1, py + 1, c - 2, c - 2);
        ctx.strokeStyle = hexA(COLORS[p.t], 0.55); ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 2, py + 2, c - 4, c - 4);
      }
      ctx.globalAlpha = grounded() ? 1 - Math.min(1, G.lockT / LOCK_MS) * 0.35 : 1;
      for (const [cx, cy] of SHAPES[p.t][p.r]) drawCell(ctx, (p.x + cx) * c, (p.y + cy - HIDDEN) * c, c, COLORS[p.t]);
      ctx.globalAlpha = 1;
    }
    // popups
    ctx.textAlign = 'center';
    for (const q of G.pops) {
      const a = q.age < 120 ? q.age / 120 : 1 - Math.max(0, q.age - 700) / 400;
      ctx.globalAlpha = Math.max(0, a);
      const yy = (q.big ? 7 : 9.5) * c - q.age * 0.02;
      ctx.font = '700 ' + Math.round(c * (q.big ? 0.74 : 0.58)) + 'px ' + fonts.display;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(q.text, W / 2 + 2, yy + 2);
      ctx.fillStyle = q.big ? '#6fd3c7' : '#ffc861'; ctx.fillText(q.text, W / 2, yy);
      if (q.sub) { ctx.font = '600 ' + Math.round(c * 0.45) + 'px ' + fonts.mono; ctx.fillStyle = '#f3ece5'; ctx.fillText(q.sub, W / 2, yy + c * 0.7); }
    }
    ctx.globalAlpha = 1;
    if (G.state === 'pause' || G.state === 'ready' || G.state === 'over') {
      ctx.fillStyle = 'rgba(8,6,10,.62)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function setT(node, v) { if (node && node._v !== v) { node._v = v; node.textContent = v; } }

  function renderSide() {
    // hold + next previews only redraw when they change
    const hk = (G.hold || '-') + (G.holdUsed ? 1 : 0) + cell + dpr;
    if (sideKeys.hold !== hk && ui.holdc) {
      sideKeys.hold = hk;
      const x = ui.holdc.getContext('2d'), w = ui.holdc.width / dpr, h = ui.holdc.height / dpr;
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
      if (G.hold) mini(x, G.hold, w / 2, h / 2, Math.min(Math.max(cell * 0.78, 16), (w - 8) / 4, (h - 6) / 2), G.holdUsed ? 0.3 : 1);
      ui.holdNote.textContent = G.holdUsed ? 'used' : '';
    }
    const q = G.queue.slice(0, nextN), nk = q.join('') + cell + dpr + nextN;
    if (sideKeys.next !== nk && ui.nextc) {
      sideKeys.next = nk;
      const x = ui.nextc.getContext('2d'), w = ui.nextc.width / dpr, h = ui.nextc.height / dpr;
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
      const s0 = Math.min(Math.max(cell * 0.78, 16), (w - 8) / 4), s1 = Math.min(Math.max(cell * 0.56, 12), (w - 8) / 4);
      let y = 0;
      q.forEach((t, i) => {
        const s = i === 0 ? s0 : s1, slot = i === 0 ? s0 * 2 + 14 : s1 * 2 + 12;
        mini(x, t, w / 2, y + slot / 2, s, i === 0 ? 1 : 0.8);
        y += slot;
      });
    }
    setT(ui.sScore, G.score.toLocaleString());
    setT(ui.sBest, Math.max(G.best, G.score).toLocaleString());
    setT(ui.sLevel, String(G.level));
    setT(ui.sLines, String(G.lines));
    const into = G.level >= 20 ? 10 : G.lines - (G.level - 1) * 10;
    const mw = Math.max(0, Math.min(100, into * 10)) + '%';
    if (ui.meter._v !== mw) { ui.meter._v = mw; ui.meter.style.width = mw; }
    const cb = G.combo > 0 ? '×' + G.combo : '';
    setT(ui.sCombo, cb);
    if (ui.comboRow.hidden !== !cb) ui.comboRow.hidden = !cb;
  }

  function mini(X, t, cx, cy, s, alpha) {
    const cs = SHAPES[t][0];
    let minx = 9, maxx = -9, miny = 9, maxy = -9;
    for (const [x, y] of cs) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    const ox = cx - ((maxx - minx + 1) * s) / 2, oy = cy - ((maxy - miny + 1) * s) / 2;
    X.globalAlpha = alpha;
    for (const [x, y] of cs) drawCell(X, ox + (x - minx) * s, oy + (y - miny) * s, s, COLORS[t]);
    X.globalAlpha = 1;
  }

  function drawCell(X, x, y, w, col) {
    const h = w;
    if (w < 1) return;
    const i = Math.max(1, Math.round(w * 0.12));
    X.fillStyle = col;
    rr(X, x + 1, y + 1, w - 2, h - 2, Math.min(4, w * 0.14)); X.fill();
    X.fillStyle = 'rgba(255,255,255,.28)';
    X.fillRect(x + 2, y + 2, w - 4, i);
    X.fillStyle = 'rgba(0,0,0,.22)';
    X.fillRect(x + 2, y + h - 2 - i, w - 4, i);
    X.fillStyle = 'rgba(255,255,255,.1)';
    X.fillRect(x + w * 0.3, y + h * 0.3, w * 0.4, h * 0.4);
  }

  function rr(X, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    X.beginPath();
    X.moveTo(x + r, y); X.arcTo(x + w, y, x + w, y + h, r); X.arcTo(x + w, y + h, x, y + h, r); X.arcTo(x, y + h, x, y, r); X.arcTo(x, y, x + w, y, r); X.closePath();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---------------- UI ---------------- */
  function buildUI() {
    root = document.createElement('div');
    root.className = 'ag-stacker';
    root.innerHTML = `
      <div class="ags-head">
        <div><h2 class="ags-title">Block Stack</h2>
          <div class="ags-how">Slide and spin the falling blocks to fill whole rows. Full rows vanish; the stack must not reach the top.</div></div>
        <div class="ags-actions">
          <button class="btn sec small" data-r="pause">Pause</button>
          <button class="btn sec small" data-r="new">New game</button>
          <button class="btn sec small" data-r="snd" aria-label="Sound"></button>
        </div>
      </div>
      <div class="ags-play">
        <div class="ags-col">
          <div class="ags-card"><div class="ags-lab">HOLD <small data-r="holdNote"></small></div><canvas data-r="holdc"></canvas></div>
          <div class="ags-card ags-keyc"><div class="ags-lab">KEYS</div><div class="ags-keys">
            <kbd>← →</kbd><span>move</span><kbd>↓</kbd><span>soft drop</span><kbd>Space</kbd><span>hard drop</span>
            <kbd>↑ X</kbd><span>rotate right</span><kbd>Z</kbd><span>rotate left</span><kbd>C</kbd><span>hold</span><kbd>P</kbd><span>pause</span></div></div>
        </div>
        <div class="ags-stage" data-r="stage"><canvas data-r="board"></canvas>
          <div class="ags-over" data-r="over" hidden><div><h3 data-r="ot"></h3><p data-r="os"></p><button class="btn pri" data-r="ob"></button></div></div>
        </div>
        <div class="ags-col">
          <div class="ags-card"><div class="ags-lab">NEXT</div><canvas data-r="nextc"></canvas></div>
          <div class="ags-card">
            <div class="ags-stat big"><span>SCORE</span><b data-r="sScore">0</b></div>
            <div class="ags-stat"><span>BEST</span><b data-r="sBest">0</b></div>
            <div class="ags-stat" style="display:block"><div style="display:flex;justify-content:space-between;align-items:baseline"><span>LEVEL</span><b data-r="sLevel">1</b></div><div class="ags-meter" title="Progress to the next level"><i data-r="meter"></i></div></div>
            <div class="ags-stat"><span>LINES</span><b data-r="sLines">0</b></div>
            <div class="ags-stat combo" data-r="comboRow" hidden><span>COMBO</span><b data-r="sCombo"></b></div>
          </div>
        </div>
      </div>
      <details><summary>Tips &amp; controls</summary><ul>
        <li><kbd>←</kbd> <kbd>→</kbd> move (hold to slide), <kbd>↓</kbd> soft drop, <kbd>Space</kbd> hard drop, <kbd>↑</kbd>/<kbd>X</kbd> rotate right, <kbd>Z</kbd> rotate left, <kbd>C</kbd>/<kbd>Shift</kbd> hold, <kbd>P</kbd> pause.</li>
        <li>Keep the stack flat and leave one column open: clearing four rows at once (a Quad) scores the most, and back-to-back Quads earn a 50% bonus.</li>
        <li>Clearing rows with consecutive pieces builds a combo bonus.</li>
        <li>Pieces rotate with wall kicks: a piece pressed against a wall or the stack will hop sideways or up to find room.</li>
        <li>Use hold to save the long bar for a deep well. The ghost outline shows exactly where a hard drop lands.</li>
        <li>You get half a second to slide a landed piece before it locks. Keys pressed while rows are clearing still count.</li>
      </ul></details>`;
    el.appendChild(root);
    root.querySelectorAll('[data-r]').forEach((n) => (ui[n.dataset.r] = n));
    cv = ui.board;
    ctx = cv.getContext('2d');
    root.addEventListener('click', onClick);
  }

  function onClick(e) {
    ensureAudio();
    const b = e.target.closest('button');
    if (!b) {
      // clicking the board starts / resumes
      if (e.target.closest('.ags-stage') && G.state !== 'play') { if (G.state === 'pause') setPaused(false); else start(); }
      return;
    }
    b.blur();
    const r = b.dataset.r;
    if (r === 'new' || r === 'ob') { if (r === 'ob' && G.state === 'pause') setPaused(false); else start(); }
    else if (r === 'pause') { if (G.state === 'play') setPaused(true); else if (G.state === 'pause') setPaused(false); }
    else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); ui.snd.textContent = soundOn ? '🔊' : '🔇'; sfx('rot'); }
  }

  function showOverlay() {
    if (!ui.over) return;
    const s = G.state;
    ui.pause.textContent = s === 'pause' ? 'Resume' : 'Pause';
    ui.pause.disabled = !(s === 'play' || s === 'pause');
    if (s === 'play') { ui.over.hidden = true; return; }
    ui.over.hidden = false;
    if (s === 'ready') { ui.ot.textContent = 'Block Stack'; ui.os.innerHTML = 'Best <b>' + G.best.toLocaleString() + '</b> · Enter or click to start'; ui.ob.textContent = 'Start'; }
    else if (s === 'pause') { ui.ot.textContent = 'Paused'; ui.os.innerHTML = 'Press <b>P</b> to resume'; ui.ob.textContent = 'Resume'; }
    else { ui.ot.textContent = G.newBest ? 'New best!' : 'Stacked out'; ui.os.innerHTML = 'Score <b>' + G.score.toLocaleString() + '</b> · Level <b>' + G.level + '</b> · Lines <b>' + G.lines + '</b>'; ui.ob.textContent = 'Play again'; }
  }

  function sizeCanvas(c, w, h) {
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
  }

  function layout() {
    if (!root || el.offsetParent === null) return;
    dpr = window.devicePixelRatio || 1;
    const top = ui.stage.getBoundingClientRect().top;
    const availH = Math.max(300, window.innerHeight - top - 40);
    const availW = root.clientWidth || 800;
    let c = Math.max(14, Math.min(36, Math.floor((availH - 2) / 20)));
    let sd = Math.max(130, Math.min(200, Math.round(c * 5.4)));
    let gap = Math.max(10, Math.min(24, Math.round(c * 0.6)));
    if (10 * c + 2 * sd + 2 * gap + 2 > availW) {
      sd = Math.max(118, Math.min(sd, Math.floor((availW - 10 * c - 2 * gap - 2) / 2)));
      c = Math.max(12, Math.min(c, Math.floor((availW - 2 * sd - 2 * gap - 2) / 10)));
    }
    cell = c; side = sd;
    root.style.setProperty('--ags-side', sd + 'px');
    root.style.setProperty('--ags-gap', gap + 'px');
    // short screens: drop the key list and show fewer next pieces so the side columns stay within the board height
    root.classList.toggle('ags-short', c < 24);
    nextN = c >= 27 ? 5 : c >= 21 ? 3 : 2;
    sizeCanvas(cv, COLS * c, 20 * c);
    const inner = sd - 26;
    const s0 = Math.min(Math.max(c * 0.78, 16), (inner - 8) / 4), s1 = Math.min(Math.max(c * 0.56, 12), (inner - 8) / 4);
    sizeCanvas(ui.holdc, inner, Math.round(s0 * 2 + 14));
    sizeCanvas(ui.nextc, inner, Math.round(s0 * 2 + 14 + (nextN - 1) * (s1 * 2 + 12)));
    sideKeys = {};
    render();
  }

  /* ---------------- input ---------------- */
  const KEYMAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft', ArrowUp: 'cw', x: 'cw', X: 'cw', z: 'ccw', Z: 'ccw',
    ' ': 'hard', c: 'hold', C: 'hold', Shift: 'hold', p: 'pause', P: 'pause', Escape: 'pause', Enter: 'enter',
  };
  function ignoreEvent(e) {
    if (!mounted || el.offsetParent === null) return true;
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return true;
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    return false;
  }

  function onKey(e) {
    if (ignoreEvent(e)) return;
    const a = KEYMAP[e.key];
    if (!a) return;
    if (a === 'pause' && e.key === 'Escape' && G.state !== 'play') return;
    e.preventDefault();
    ensureAudio();
    if (G.state === 'ready' || G.state === 'over') { if ((a === 'enter' || a === 'hard') && !e.repeat) start(); return; }
    if (a === 'pause') { if (!e.repeat) setPaused(G.state === 'play'); return; }
    if (G.state === 'pause') { if (a === 'enter' && !e.repeat) setPaused(false); return; }
    if (e.repeat && a !== 'soft') return;  // we do our own key repeat
    if (a === 'left' || a === 'right') {
      const dir = a === 'left' ? -1 : 1;
      G.held[a] = true;
      G.das = { dir, t: 0, arr: 0 };
    }
    if (a === 'soft') { G.soft = true; kick(); return; }
    if (a === 'enter') return;
    if (G.clearing) {
      // rows are clearing: remember the key and apply it to the next piece the moment it spawns
      if (G.buf.length < BUF_MAX) G.buf.push(a);
      kick();
      return;
    }
    switch (a) {
      case 'left': move(-1); break;
      case 'right': move(1); break;
      case 'cw': rotate(1); break;
      case 'ccw': rotate(-1); break;
      case 'hard': hardDrop(); break;
      case 'hold': hold(); break;
    }
    render();
    kick();
  }

  function onKeyUp(e) {
    if (!mounted || !G) return;
    const a = KEYMAP[e.key];
    if (!a) return;
    if (a === 'left' || a === 'right') {
      G.held[a] = false;
      const dir = a === 'left' ? -1 : 1;
      if (G.das.dir === dir) {
        const other = a === 'left' ? 'right' : 'left';
        G.das = G.held[other] ? { dir: -dir, t: 0, arr: 0 } : { dir: 0, t: 0, arr: 0 };
      }
    } else if (a === 'soft') G.soft = false;
    if (!ignoreEvent(e)) e.preventDefault();
  }

  function onBlur() { if (G) { G.held.left = G.held.right = false; G.das.dir = 0; G.soft = false; setPaused(true); } }
  function onVis() { if (document.hidden && G) setPaused(true); }
  function onResize() { if (mounted && el.offsetParent !== null) layout(); }

  /* ---------------- sound ---------------- */
  function ensureAudio() {
    if (actx || !soundOn) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { actx = new AC(); } catch (e) { actx = null; }
  }
  function tone(f, d, type, vol, f2, delay) {
    if (!soundOn || !actx) return;
    try {
      const t = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    } catch (e) { /* ignore */ }
  }
  function sfx(k) {
    switch (k) {
      case 'move': tone(300, 0.025, 'square', 0.025); break;
      case 'rot': tone(520, 0.04, 'triangle', 0.05); break;
      case 'lock': tone(150, 0.06, 'square', 0.05, 90); break;
      case 'drop': tone(220, 0.09, 'square', 0.06, 70); break;
      case 'hold': tone(440, 0.06, 'sine', 0.06, 660); break;
      case 'clear': [523, 659, 784].forEach((f, i) => tone(f, 0.09, 'triangle', 0.06, 0, i * 0.05)); break;
      case 'quad': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'square', 0.05, 0, i * 0.06)); break;
      case 'level': tone(660, 0.2, 'sine', 0.07, 990); break;
      case 'over': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.16, 'triangle', 0.07, 0, i * 0.12)); break;
    }
  }

  /* ---------------- mount ---------------- */
  window.VanArcade[ID] = {
    mount(container, a) {
      if (mounted) this.unmount();
      el = container; api = a; mounted = true; ui = {};
      if (!document.getElementById('ag-' + ID + '-css')) {
        const st = document.createElement('style');
        st.id = 'ag-' + ID + '-css';
        st.textContent = CSS;
        document.head.appendChild(st);
      }
      const cs = getComputedStyle(el), v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
      fonts = { mono: v('--mono', 'monospace'), display: v('--display', 'sans-serif'), body: v('--body', 'sans-serif') };
      const snd = api.load('sound');
      soundOn = snd == null ? !!api.sound : !!snd;
      G = null;
      newGame();
      G.best = +api.load('best') || 0;
      buildUI();
      ui.snd.textContent = soundOn ? '🔊' : '🔇';
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('resize', onResize);
      window.addEventListener('blur', onBlur);
      document.addEventListener('visibilitychange', onVis);
      if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (mounted) onResize(); }); ro.observe(el); }
      showOverlay();
      layout();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (mounted) render(); });
    },
    unmount() {
      mounted = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
      if (ro) { ro.disconnect(); ro = null; }
      if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
      if (root) root.removeEventListener('click', onClick);
      if (el) el.innerHTML = '';
      root = cv = ctx = null; ui = {};
    },
    // test/debug hooks
    _debug: {
      get state() { return G; },
      SHAPES,
      start: () => start(),
      fits: (t, r, x, y) => fits(t, r, x, y),
      setBoard(rows) {   // rows: strings for the bottom of the board, '.' empty, any other char a block
        G.board = emptyBoard();
        rows.forEach((s, i) => { const y = ROWS - rows.length + i; for (let x = 0; x < COLS; x++) if (s[x] && s[x] !== '.') G.board[y][x] = TYPES.includes(s[x]) ? s[x] : 'T'; });
      },
      setPiece(t, r, x, y) { G.cur = { t, r, x, y }; G.lockT = 0; G.gT = 0; G.lowest = y; G.resets = 0; },
      rotate: (d) => rotate(d), move: (d) => move(d), hardDrop: () => hardDrop(), hold: () => hold(),
      tick: (ms) => { for (let t = 0; t < ms; t += 16) update(Math.min(16, ms - t)); render(); },
      raf: () => raf, gravityMs: () => gravityMs(), layout: () => layout(), geom: () => ({ cell, side, nextN }),
    },
  };
})();
