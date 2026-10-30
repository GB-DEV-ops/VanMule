/* VanMule Arcade: Four in a Row ("Mule Drop") vs the computer. Minimax + alpha-beta. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'four';
  const COLS = 7, ROWS = 6, CS = 70, PAD = 10;
  const BW = COLS * CS + PAD * 2, BH = ROWS * CS + PAD * 2;
  const HUMAN = 1, CPU = 2;
  const DIFF = { easy: { depth: 2, label: 'Easy' }, medium: { depth: 5, label: 'Medium' }, hard: { depth: 8, label: 'Hard' } };
  const ORDER = [3, 2, 4, 1, 5, 0, 6];
  const WIN = 1000000;

  /* ---------------- engine (pure) ---------------- */
  // board: Int8Array(42), index c*ROWS + r, r=0 bottom. heights: Int8Array(7)
  const WINDOWS = [];
  (function () {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) for (const [dc, dr] of dirs) {
      const ec = c + dc * 3, er = r + dr * 3;
      if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
      const w = []; for (let i = 0; i < 4; i++) w.push((c + dc * i) * ROWS + (r + dr * i));
      WINDOWS.push(w);
    }
  })();

  function winLine(b, c, r) {
    const p = b[c * ROWS + r]; if (!p) return null;
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dc, dr] of dirs) {
      const cells = [[c, r]];
      for (let s = 1; s < 4; s++) { const x = c + dc * s, y = r + dr * s; if (x < 0 || x >= COLS || y < 0 || y >= ROWS || b[x * ROWS + y] !== p) break; cells.push([x, y]); }
      for (let s = 1; s < 4; s++) { const x = c - dc * s, y = r - dr * s; if (x < 0 || x >= COLS || y < 0 || y >= ROWS || b[x * ROWS + y] !== p) break; cells.push([x, y]); }
      if (cells.length >= 4) return cells;
    }
    return null;
  }
  function wins(b, c, r) {
    const p = b[c * ROWS + r];
    const dirs = [1, 0, 0, 1, 1, 1, 1, -1];
    for (let d = 0; d < 8; d += 2) {
      const dc = dirs[d], dr = dirs[d + 1]; let n = 1;
      for (let s = 1; s < 4; s++) { const x = c + dc * s, y = r + dr * s; if (x < 0 || x >= COLS || y < 0 || y >= ROWS || b[x * ROWS + y] !== p) break; n++; }
      for (let s = 1; s < 4; s++) { const x = c - dc * s, y = r - dr * s; if (x < 0 || x >= COLS || y < 0 || y >= ROWS || b[x * ROWS + y] !== p) break; n++; }
      if (n >= 4) return true;
    }
    return false;
  }
  const MY = [0, 1, 6, 40, 0], OPP = [0, 1, 7, 50, 0];
  function evaluate(b, me) {
    let s = 0;
    for (let i = 0; i < WINDOWS.length; i++) {
      const w = WINDOWS[i]; let m = 0, o = 0;
      for (let k = 0; k < 4; k++) { const v = b[w[k]]; if (v === me) m++; else if (v) o++; }
      if (m && o) continue;
      if (m) s += MY[m]; else if (o) s -= OPP[o];
    }
    for (let r = 0; r < ROWS; r++) { const v = b[3 * ROWS + r]; if (v === me) s += 3; else if (v) s -= 3; }
    return s;
  }

  // Returns {col, scores} for player `me`.
  function search(board, heights, me, depth, timeMs, noise) {
    const b = Int8Array.from(board), h = Int8Array.from(heights);
    const t0 = performance.now(), deadline = t0 + (timeMs || 280);
    let nodes = 0, aborted = false;
    function negamax(d, alpha, beta, p, moves) {
      if ((++nodes & 1023) === 0 && performance.now() > deadline) { aborted = true; return 0; }
      if (moves >= 42) return 0;
      if (d === 0) return evaluate(b, p);
      const q = 3 - p;
      // immediate win check
      for (let i = 0; i < 7; i++) {
        const c = ORDER[i]; if (h[c] >= ROWS) continue;
        const r = h[c]; b[c * ROWS + r] = p;
        const w = wins(b, c, r); b[c * ROWS + r] = 0;
        if (w) return WIN + d;
      }
      let best = -Infinity;
      for (let i = 0; i < 7; i++) {
        const c = ORDER[i]; if (h[c] >= ROWS) continue;
        const r = h[c]; b[c * ROWS + r] = p; h[c]++;
        const v = -negamax(d - 1, -beta, -alpha, q, moves + 1);
        h[c]--; b[c * ROWS + r] = 0;
        if (aborted) return 0;
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      return best;
    }
    let moves = 0; for (let i = 0; i < 42; i++) if (b[i]) moves++;
    const legal = ORDER.filter(c => h[c] < ROWS);
    if (!legal.length) return { col: -1, scores: {} };
    // immediate win / forced block at root (always respected)
    for (const c of legal) { const r = h[c]; b[c * ROWS + r] = me; const w = wins(b, c, r); b[c * ROWS + r] = 0; if (w) return { col: c, scores: { [c]: WIN }, depth: 0 }; }
    let result = null, done = 0;
    for (let d = Math.min(2, depth); d <= depth; d++) {
      const scores = {};
      let alpha = -Infinity;
      for (const c of legal) {
        const r = h[c]; b[c * ROWS + r] = me; h[c]++;
        // with noise every root score must be exact, so search those with a full window
        const v = -negamax(d - 1, -Infinity, noise ? Infinity : -alpha + 1, 3 - me, moves + 1);
        h[c]--; b[c * ROWS + r] = 0;
        if (aborted) break;
        scores[c] = v; if (v > alpha) alpha = v;
      }
      if (aborted) break;
      result = scores; done = d;
      if (alpha >= WIN) break;
    }
    if (!result) result = {};
    let bestC = legal[0], bestV = -Infinity;
    for (const c of legal) {
      if (!(c in result)) continue;
      let v = result[c];
      if (noise && Math.abs(v) < WIN / 2) v += (Math.random() * 2 - 1) * noise;
      if (v > bestV) { bestV = v; bestC = c; }
    }
    return { col: bestC, scores: result, depth: done, ms: performance.now() - t0 };
  }

  /* ---------------- UI ---------------- */
  // Every class is prefixed "f4-": the host app has global rules for .bar, .status, .seg, .drop, .lbl ...
  // that previously squashed the toolbar into an 8px strip (hiding "New game") and restyled the status line.
  const CSS = `
.ag-four{font-family:var(--body);color:var(--fg);max-width:820px;margin:0 auto;user-select:none;-webkit-user-select:none}
.ag-four .f4-hd{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}
.ag-four .f4-ttl{flex:1;min-width:240px}
.ag-four .f4-ttl h2{font-family:var(--display);font-size:28px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-four .f4-ttl h2 span{color:var(--ember)}
.ag-four .f4-how{color:var(--muted);font-size:13px;margin-top:4px}
.ag-four .f4-tally{display:flex;gap:6px;align-items:stretch}
.ag-four .f4-tl{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:5px 12px;text-align:center;min-width:70px;line-height:1.25}
.ag-four .f4-tl b{display:block;font-size:10px;letter-spacing:1.3px;color:var(--muted)}
.ag-four .f4-tl i{font-style:normal;font-family:var(--display);font-weight:700;font-size:19px}
.ag-four .f4-tl.f4-y i{color:var(--ember)} .ag-four .f4-tl.f4-c i{color:var(--cool)}
.ag-four .f4-tl.f4-bump{animation:f4bump .5s ease-out}
@keyframes f4bump{30%{transform:scale(1.12);border-color:var(--gold)}}
.ag-four .f4-vs{font-size:11px;color:var(--dim);align-self:center;writing-mode:horizontal-tb;margin-left:2px}
.ag-four .f4-bar{display:flex;gap:8px 10px;flex-wrap:wrap;align-items:center;margin:0 0 10px;padding:8px 10px;background:var(--panel);border:1px solid var(--line);border-radius:12px;min-height:50px;height:auto;overflow:visible}
.ag-four .f4-grp{display:inline-flex;align-items:center;gap:6px}
.ag-four .f4-seg{display:inline-flex;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px}
.ag-four .f4-seg button{height:28px;padding:0 10px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted);white-space:nowrap}
.ag-four .f4-seg button:hover{color:var(--fg)}
.ag-four .f4-seg button.f4-on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-four .f4-lbl{font-size:12px;color:var(--muted);font-weight:600}
.ag-four .f4-sp{flex:1}
.ag-four .f4-status{height:28px;line-height:28px;text-align:center;font-weight:700;font-size:15px;margin:2px 0 4px;transition:color .2s;color:var(--fg)}
.ag-four .f4-status.f4-y{color:var(--ember)} .ag-four .f4-status.f4-c{color:var(--cool)} .ag-four .f4-status.f4-w{color:var(--gold)}
.ag-four .f4-fit{margin:0 auto;width:${BW}px;height:${BH + CS}px;position:relative}
.ag-four .f4-stage{position:absolute;left:0;top:0;width:${BW}px;transform-origin:0 0;cursor:pointer;touch-action:manipulation}
.ag-four .f4-stage.f4-busy{cursor:default}
.ag-four .f4-stage.f4-isover{cursor:pointer}
.ag-four .f4-top{height:${CS}px;position:relative}
.ag-four .f4-area{position:relative;width:${BW}px;height:${BH}px}
.ag-four .f4-back{position:absolute;inset:0;border-radius:18px;background:#0b0908}
.ag-four .f4-pcs{position:absolute;left:0;top:-${CS}px;width:${BW}px;height:${BH + CS}px;pointer-events:none}
.ag-four .f4-frame{position:absolute;inset:0;border-radius:18px;pointer-events:none;
  background-image:radial-gradient(circle at center,transparent 0 ${CS / 2 - 7}px,rgba(0,0,0,.55) ${CS / 2 - 6}px,#3a2c22 ${CS / 2 - 3}px,#2b211b ${CS / 2 + 4}px);
  background-size:${CS}px ${CS}px;background-position:${PAD}px ${PAD}px;background-repeat:repeat;
  box-shadow:inset 0 0 0 ${PAD}px #2b211b,inset 0 0 0 ${PAD + 1}px #3a2c22,0 14px 40px rgba(0,0,0,.5),0 0 0 1px #44352a}
.ag-four .f4-colhi{position:absolute;top:0;width:${CS}px;height:${BH}px;background:linear-gradient(rgba(255,138,61,.07),rgba(255,138,61,0));pointer-events:none;transition:left .08s;border-radius:10px}
.ag-four .f4-pc{position:absolute;width:${CS - 14}px;height:${CS - 14}px;border-radius:50%;margin:7px;border:0}
.ag-four .f4-pc.f4-p1{background:radial-gradient(circle at 35% 30%,#ffc08f,#ff8a3d 45%,#c95510 100%);box-shadow:inset 0 -3px 6px rgba(0,0,0,.35),inset 0 0 0 7px rgba(255,255,255,.08)}
.ag-four .f4-pc.f4-p2{background:radial-gradient(circle at 35% 30%,#c4fff6,#6fd3c7 45%,#2b8f84 100%);box-shadow:inset 0 -3px 6px rgba(0,0,0,.35),inset 0 0 0 7px rgba(255,255,255,.1)}
.ag-four .f4-pc::after{content:"";position:absolute;inset:15px;border-radius:50%;border:2px solid rgba(0,0,0,.14)}
.ag-four .f4-pc.f4-drop{animation:f4drop var(--t) linear both}
@keyframes f4drop{0%{transform:translateY(var(--d));animation-timing-function:cubic-bezier(.5,0,1,1)}
 78%{transform:translateY(0);animation-timing-function:cubic-bezier(0,0,.4,1)}
 88%{transform:translateY(-9px);animation-timing-function:cubic-bezier(.5,0,1,1)}100%{transform:translateY(0)}}
.ag-four .f4-pc.f4-ghost{opacity:.55;transition:left .08s}
.ag-four .f4-pc.f4-hint{opacity:.5;animation:f4hint .8s ease-in-out infinite alternate;outline:2px dashed var(--gold);outline-offset:3px}
@keyframes f4hint{to{opacity:.85}}
.ag-four .f4-pc.f4-win{animation:f4win .7s ease-in-out infinite alternate;z-index:2}
.ag-four .f4-pc.f4-win::after{border-color:#fff;border-width:3px}
@keyframes f4win{from{filter:brightness(1)}to{filter:brightness(1.35) drop-shadow(0 0 8px var(--gold))}}
.ag-four .f4-pcs.f4-done .f4-pc:not(.f4-win){opacity:.45;transition:opacity .4s}
.ag-four .f4-arrow{position:absolute;top:${CS / 2 - 14}px;width:${CS}px;text-align:center;color:var(--gold);font-size:22px;animation:f4bob .6s ease-in-out infinite alternate;pointer-events:none}
@keyframes f4bob{to{transform:translateY(6px)}}
.ag-four .f4-over{position:absolute;left:0;right:0;top:${CS}px;height:${BH}px;display:flex;align-items:center;justify-content:center;z-index:5;cursor:pointer}
.ag-four .f4-card{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:16px;padding:18px 24px 16px;text-align:center;box-shadow:0 16px 50px rgba(0,0,0,.6);min-width:250px;animation:f4pop .35s cubic-bezier(.2,.8,.3,1.2) .45s both;cursor:default;line-height:1.35}
@keyframes f4pop{from{opacity:0;transform:translateY(10px) scale(.94)}to{opacity:1;transform:none}}
.ag-four .f4-card h3{font-family:var(--display);font-size:22px;margin:0 0 4px}
.ag-four .f4-card h3.f4-y{color:var(--gold)} .ag-four .f4-card h3.f4-c{color:var(--cool)}
.ag-four .f4-card p{margin:0 0 14px;color:var(--muted);font-size:13px}
.ag-four .f4-card p b{font-family:var(--mono);color:var(--fg)}
.ag-four .f4-card .f4-kb{display:block;margin-top:10px;font-size:11.5px;color:var(--dim)}
.ag-four kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-radius:4px;padding:0 5px;color:var(--fg)}
.ag-four details{margin:14px auto 0;max-width:${BW}px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:13px;color:var(--muted)}
.ag-four summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-four details ul{margin:6px 0 2px;padding-left:18px}
`;

  let inst = null;
  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const opts = Object.assign({ diff: 'medium', first: 'you', lastFirst: 'mule' }, api.load('opts') || {});
    if (!DIFF[opts.diff]) opts.diff = 'medium';
    if (!['you', 'mule', 'alt'].includes(opts.first)) opts.first = 'you';
    const tally = Object.assign({ easy: { w: 0, l: 0, d: 0 }, medium: { w: 0, l: 0, d: 0 }, hard: { w: 0, l: 0, d: 0 } }, api.load('tally') || {});
    let soundOn = api.load('sound'); if (soundOn === null) soundOn = !!api.sound;
    let actx = null;
    function tone(f, d, type, vol, f2) {
      if (!soundOn) return;
      try {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
        o.onended = () => { o.disconnect(); g.disconnect(); };
      } catch (e) { /* ignore */ }
    }

    const root = document.createElement('div'); root.className = 'ag-four';
    root.innerHTML = `
<div class="f4-hd"><div class="f4-ttl"><h2>Mule <span>Drop</span></h2><div class="f4-how">Four in a row. Drop discs (click a column or press 1–7); line up four across, down or diagonally before the Mule does.</div></div>
<div class="f4-tally" title="Your record at this level"><div class="f4-tl f4-y" data-r="bw"><b>YOU</b><i data-r="tw">0</i></div><div class="f4-tl f4-c" data-r="bl"><b>MULE</b><i data-r="tl">0</i></div><div class="f4-tl" data-r="bd"><b>DRAWS</b><i data-r="td">0</i></div></div></div>
<div class="f4-bar">
<button class="btn pri small" data-r="new" title="New game (N)">New game</button>
<span class="f4-grp"><span class="f4-lbl">Level</span><span class="f4-seg" data-r="diff"><button data-v="easy">Easy</button><button data-v="medium">Medium</button><button data-v="hard">Hard</button></span></span>
<span class="f4-grp"><span class="f4-lbl">First</span><span class="f4-seg" data-r="first"><button data-v="you">You</button><button data-v="mule">Mule</button><button data-v="alt" title="Take turns going first">Alternate</button></span></span>
<span class="f4-sp"></span><button class="btn sec small" data-r="hint" title="Hint (H)">💡 Hint</button><button class="btn sec small" data-r="snd" aria-label="Sound"></button></div>
<div class="f4-status" data-r="status" aria-live="polite"></div>
<div class="f4-fit" data-r="fit"><div class="f4-stage" data-r="stage"><div class="f4-top" data-r="top"></div><div class="f4-area"><div class="f4-back"></div><div class="f4-colhi" data-r="colhi" hidden></div><div class="f4-pcs" data-r="pcs"></div><div class="f4-frame"></div></div>
<div class="f4-over" data-r="over" hidden><div class="f4-card"><h3 data-r="ot"></h3><p data-r="os"></p><button class="btn pri" data-r="again">Play again</button><span class="f4-kb">or press <kbd>Enter</kbd> / <kbd>N</kbd>, or click the board</span></div></div></div></div>
<details><summary>Strategy</summary><ul>
<li>Control the centre column: it takes part in the most possible lines.</li>
<li>Look for double threats: two ways to win at once can't both be blocked.</li>
<li>Don't fill the square directly beneath an opponent's threat.</li>
<li>Hard looks 8 moves ahead. Changing level or who goes first starts a new game.</li>
<li>Keys: <kbd>1</kbd>–<kbd>7</kbd> drop, <kbd>←</kbd> <kbd>→</kbd> aim and <kbd>↓</kbd>/<kbd>Enter</kbd> drop, <kbd>H</kbd> hint, <kbd>N</kbd> new game.</li></ul></details>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const fit = $('fit'), stage = $('stage'), pcs = $('pcs'), top = $('top'), colhi = $('colhi'), overEl = $('over');

    let board, heights, turn, over, busy, moves, ghost = null, hintEl = null, hintArrow = null, hover = 3, gameId = 0, starter = HUMAN, scale = 1;
    // scale the board down to fit short / narrow windows
    function fitBoard() {
      if (el.offsetParent === null) return;
      const availH = window.innerHeight - fit.getBoundingClientRect().top - 40 - 50;
      const availW = root.clientWidth || BW;
      const s = Math.max(0.55, Math.min(1, availW / BW, availH / (BH + CS)));
      if (Math.abs(s - scale) < 0.005 && fit.style.width) return;
      scale = s;
      fit.style.width = Math.round(BW * s) + 'px'; fit.style.height = Math.round((BH + CS) * s) + 'px';
      stage.style.transform = s < 1 ? 'scale(' + s + ')' : '';
    }

    const px = c => PAD + c * CS;
    const py = r => CS + PAD + (ROWS - 1 - r) * CS; // inside pcs layer (which starts CS above area)
    function status(t, cls) { const s = $('status'); s.textContent = t; s.className = 'f4-status' + (cls ? ' f4-' + cls : ''); }
    function hud() {
      const t = tally[opts.diff];
      $('tw').textContent = t.w; $('tl').textContent = t.l; $('td').textContent = t.d;
      root.querySelectorAll('[data-r="diff"] button').forEach(b => b.classList.toggle('f4-on', b.dataset.v === opts.diff));
      root.querySelectorAll('[data-r="first"] button').forEach(b => b.classList.toggle('f4-on', b.dataset.v === opts.first));
      $('snd').textContent = soundOn ? '🔊' : '🔇';
      $('hint').disabled = over || turn !== HUMAN || busy;
      stage.classList.toggle('f4-busy', !over && (turn !== HUMAN || busy));
      stage.classList.toggle('f4-isover', !!over);
    }
    function clearHint() { if (hintEl) { hintEl.remove(); hintEl = null; } if (hintArrow) { hintArrow.remove(); hintArrow = null; } }
    function showGhost() {
      if (over || busy || turn !== HUMAN || heights[hover] >= ROWS) { if (ghost) ghost.hidden = true; colhi.hidden = true; return; }
      if (!ghost) { ghost = document.createElement('div'); ghost.className = 'f4-pc f4-p1 f4-ghost'; top.appendChild(ghost); }
      ghost.hidden = false; ghost.style.left = px(hover) + 'px'; ghost.style.top = '0px';
      colhi.hidden = false; colhi.style.left = px(hover) + 'px';
    }
    function newGame() {
      gameId++;
      timers.forEach(clearTimeout); timers.clear();
      board = new Int8Array(42); heights = new Int8Array(7); over = false; busy = false; moves = 0;
      pcs.innerHTML = ''; pcs.classList.remove('f4-done'); clearHint();
      overEl.hidden = true;
      if (opts.first === 'alt') { starter = opts.lastFirst === 'you' ? CPU : HUMAN; opts.lastFirst = starter === HUMAN ? 'you' : 'mule'; api.save('opts', opts); }
      else starter = opts.first === 'you' ? HUMAN : CPU;
      turn = starter;
      hud();
      if (turn === CPU) cpuTurn(); else { status(opts.first === 'alt' ? 'You go first — your move' : 'Your move', 'y'); showGhost(); }
    }
    function drop(c, p, done) {
      const r = heights[c];
      board[c * ROWS + r] = p; heights[c]++; moves++;
      const d = document.createElement('div');
      d.className = 'f4-pc f4-p' + p + ' f4-drop';
      const dist = py(r) - 0;
      const t = Math.round(180 + Math.sqrt(dist) * 14);
      d.style.left = px(c) + 'px'; d.style.top = py(r) + 'px';
      d.style.setProperty('--d', -dist + 'px'); d.style.setProperty('--t', t + 'ms');
      d.dataset.c = c; d.dataset.r = r;
      pcs.appendChild(d);
      busy = true; hud(); showGhost();
      const g = gameId;
      later(() => tone(p === HUMAN ? 300 : 240, 0.07, 'square', 0.035, p === HUMAN ? 180 : 140), Math.round(t * 0.78));
      later(() => { if (g !== gameId) return; busy = false; done(c, r); }, t + 20);
    }
    function bump(r) { const n = $(r); n.classList.remove('f4-bump'); void n.offsetWidth; n.classList.add('f4-bump'); }
    function finish(kind, line) {
      if (over) return;            // a game is only ever scored once
      over = true; busy = false;
      clearHint();
      const t = tally[opts.diff];
      let title, cls;
      if (kind === 'w') { t.w++; bump('bw'); title = 'You win! 🎉'; cls = 'y'; status('You win! 🎉', 'w'); tone(523, 0.12, 'triangle', 0.06); later(() => tone(659, 0.12, 'triangle', 0.06), 120); later(() => tone(784, 0.25, 'triangle', 0.06), 240); }
      else if (kind === 'l') { t.l++; bump('bl'); title = 'The Mule wins'; cls = 'c'; status('The Mule wins this one.', 'c'); tone(330, 0.2, 'sawtooth', 0.04, 160); }
      else { t.d++; bump('bd'); title = 'Draw'; cls = ''; status('Draw — the board is full.', ''); tone(400, 0.15, 'sine', 0.04); }
      api.save('tally', tally);
      if (line) {
        pcs.classList.add('f4-done');
        for (const [c, r] of line) { const n = pcs.querySelector('.f4-pc[data-c="' + c + '"][data-r="' + r + '"]'); if (n) n.classList.add('f4-win'); }
      }
      const nextFirst = opts.first === 'alt' ? (starter === HUMAN ? 'The Mule' : 'You') : opts.first === 'you' ? 'You' : 'The Mule';
      $('ot').textContent = title; $('ot').className = cls ? 'f4-' + cls : '';
      $('os').innerHTML = DIFF[opts.diff].label + ' record: <b>' + t.w + '</b> W · <b>' + t.l + '</b> L · <b>' + t.d + '</b> D<br>' + nextFirst + (nextFirst === 'You' ? ' go' : ' goes') + ' first next game.';
      overEl.hidden = false;
      hud(); showGhost();
    }
    function after(c, r, p) {
      const line = winLine(board, c, r);
      if (line) return finish(p === HUMAN ? 'w' : 'l', line);
      if (moves >= 42) return finish('d');
      turn = 3 - p;
      if (turn === CPU) cpuTurn(); else { status('Your move', 'y'); hud(); showGhost(); }
    }
    function cpuTurn() {
      status('Mule is thinking…', 'c'); busy = true; hud(); showGhost();
      const g = gameId;
      later(() => {
        if (g !== gameId || over) return;
        const cfg = DIFF[opts.diff];
        let res;
        try {
          if (moves === 0) res = { col: opts.diff === 'easy' ? ORDER[Math.floor(Math.random() * 3)] : 3 };
          else res = search(board, heights, CPU, cfg.depth, 280, opts.diff === 'easy' ? 30 : opts.diff === 'medium' ? 3 : 0);
        } catch (e) { res = null; }
        if (!res || res.col < 0 || heights[res.col] >= ROWS) { const legal = ORDER.filter(c => heights[c] < ROWS); res = { col: legal[0] }; }
        busy = false;
        if (res.col === undefined) return finish('d');
        drop(res.col, CPU, (c, r) => after(c, r, CPU));
      }, 260);
    }
    function play(c) {
      if (over || busy || turn !== HUMAN || c < 0 || c >= COLS || heights[c] >= ROWS) return false;
      clearHint();
      drop(c, HUMAN, (cc, r) => after(cc, r, HUMAN));
      return true;
    }
    function hint() {
      if (over || busy || turn !== HUMAN) return;
      clearHint();
      const res = search(board, heights, HUMAN, 7, 250, 0);
      const c = res.col; if (c < 0) return;
      hintEl = document.createElement('div'); hintEl.className = 'f4-pc f4-p1 f4-hint';
      hintEl.style.left = px(c) + 'px'; hintEl.style.top = py(heights[c]) + 'px'; pcs.appendChild(hintEl);
      hintArrow = document.createElement('div'); hintArrow.className = 'f4-arrow'; hintArrow.textContent = '▼'; hintArrow.style.left = px(c) + 'px'; top.appendChild(hintArrow);
      hover = c; showGhost();
      status('Hint: column ' + (c + 1), 'w');
      tone(880, 0.08, 'sine', 0.04);
      const h = hintEl; later(() => { if (hintEl === h) { clearHint(); if (!over && turn === HUMAN && !busy) status('Your move', 'y'); } }, 2600);
    }
    function colAt(e) { const r = stage.getBoundingClientRect(); return Math.max(0, Math.min(COLS - 1, Math.floor(((e.clientX - r.left) / scale - PAD) / CS))); }
    function onMove(e) { if (over) return; const c = colAt(e); if (c !== hover) { hover = c; showGhost(); } }
    function onStageClick(e) {
      if (e.target.closest('button')) return;           // the Play again button is handled by onClick
      if (over) { if (!e.target.closest('.f4-card')) newGame(); return; }
      hover = colAt(e); play(hover);
    }
    function onClick(e) {
      const b = e.target.closest('button'); if (!b) return;
      const r = b.dataset.r, par = b.parentNode.dataset.r;
      if (r === 'new' || r === 'again') { newGame(); b.blur(); }
      else if (r === 'hint') hint();
      else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); hud(); tone(600, 0.05); }
      else if (par === 'diff' || par === 'first') {
        const key = par === 'diff' ? 'diff' : 'first';
        if (opts[key] !== b.dataset.v) {
          opts[key] = b.dataset.v;
          if (key === 'first' && b.dataset.v === 'alt') opts.lastFirst = starter === HUMAN ? 'mule' : 'you';   // next game: you start
          api.save('opts', opts); newGame();
        }
      }
    }
    function onKey(e) {
      if (el.offsetParent === null || document.hidden) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const k = e.key;
      if (k === 'n' || k === 'N') { e.preventDefault(); if (!e.repeat) newGame(); return; }
      if (over) {
        if (k === 'Enter' || k === ' ') { if (tg === 'BUTTON') return; e.preventDefault(); if (!e.repeat) newGame(); }
        return;
      }
      if (k >= '1' && k <= '7') { e.preventDefault(); hover = +k - 1; play(hover); }
      else if (k === 'h' || k === 'H') { e.preventDefault(); hint(); }
      else if (k === 'ArrowLeft') { e.preventDefault(); hover = Math.max(0, hover - 1); showGhost(); }
      else if (k === 'ArrowRight') { e.preventDefault(); hover = Math.min(COLS - 1, hover + 1); showGhost(); }
      else if (k === 'ArrowDown' || k === 'Enter' || k === ' ') { if (tg === 'BUTTON' && k !== 'ArrowDown') return; e.preventDefault(); play(hover); }
    }
    function onLeave() { if (ghost) ghost.hidden = true; colhi.hidden = true; }
    root.addEventListener('click', onClick);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
    stage.addEventListener('click', onStageClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', fitBoard);
    const ro = window.ResizeObserver ? new ResizeObserver(() => fitBoard()) : null;
    if (ro) ro.observe(el);
    fitBoard();
    newGame();

    return {
      destroy() {
        gameId++;
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', fitBoard);
        if (ro) ro.disconnect();
        root.removeEventListener('click', onClick);
        stage.removeEventListener('pointermove', onMove);
        stage.removeEventListener('pointerleave', onLeave);
        stage.removeEventListener('click', onStageClick);
        timers.forEach(clearTimeout); timers.clear();
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        el.innerHTML = '';
      },
      _test: {
        play, newGame,
        get state() { return { board: Array.from(board), heights: Array.from(heights), turn, over, busy, moves, starter, tally: JSON.parse(JSON.stringify(tally)) }; },
        setOpts(o) { Object.assign(opts, o); api.save('opts', opts); newGame(); },
        timers: () => timers.size,
      },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { inst.destroy(); inst = null; this._t = null; } },
    search, ROWS, COLS,
  };
})();
