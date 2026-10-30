/* VanMule Arcade: 2048 ("Ember 2048"). Slide tiles, merge equal numbers, reach 2048. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'g2048';
  const N = 4, CS = 100, GAP = 12, STEP = CS + GAP, BOARD = N * CS + (N + 1) * GAP;
  const SLIDE_MS = 110;

  const CSS = `
.ag-g2048{font-family:var(--body);color:var(--fg);max-width:760px;margin:0 auto;user-select:none;-webkit-user-select:none}
.ag-g2048 .hd{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.ag-g2048 .ttl{flex:1;min-width:220px}
.ag-g2048 h2{font-family:var(--display);font-size:30px;font-weight:800;margin:0;letter-spacing:-.5px;line-height:1.1}
.ag-g2048 h2 span{color:var(--ember)}
.ag-g2048 .how{color:var(--muted);font-size:13px;margin-top:4px}
.ag-g2048 .scores{display:flex;gap:8px}
.ag-g2048 .sc{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:6px 14px;min-width:88px;text-align:center;position:relative}
.ag-g2048 .sc b{display:block;font-size:10px;letter-spacing:1.5px;color:var(--muted);font-weight:700}
.ag-g2048 .sc i{font-style:normal;font-family:var(--display);font-size:20px;font-weight:700}
.ag-g2048 .plus{position:absolute;left:50%;top:18px;transform:translateX(-50%);font-family:var(--display);font-weight:700;color:var(--gold);font-size:15px;pointer-events:none;animation:ag2048up .7s ease-out forwards}
@keyframes ag2048up{to{transform:translate(-50%,-34px);opacity:0}}
.ag-g2048 .bar{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
.ag-g2048 .bar .sp{flex:1}
.ag-g2048 .wrap{position:relative;width:${BOARD}px;height:${BOARD}px;margin:0 auto}
.ag-g2048 .board{position:absolute;inset:0;background:linear-gradient(160deg,#2a221d,#1d1815);border:1px solid var(--line);border-radius:14px;touch-action:none;box-shadow:0 12px 40px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.04)}
.ag-g2048 .cell{position:absolute;width:${CS}px;height:${CS}px;border-radius:10px;background:rgba(255,255,255,.035);box-shadow:inset 0 2px 6px rgba(0,0,0,.35)}
.ag-g2048 .tile{position:absolute;left:0;top:0;width:${CS}px;height:${CS}px;transition:transform ${SLIDE_MS}ms ease-in-out;will-change:transform}
.ag-g2048 .tile .in{width:100%;height:100%;border-radius:10px;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-weight:800;font-size:40px;letter-spacing:-1px;box-shadow:0 3px 0 rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.12)}
.ag-g2048 .tile.new .in{animation:ag2048new 180ms ease-out ${SLIDE_MS}ms backwards}
.ag-g2048 .tile.mg .in{animation:ag2048pop 200ms ease-out ${SLIDE_MS}ms backwards}
.ag-g2048 .tile.mg{z-index:2}
@keyframes ag2048new{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes ag2048pop{0%{transform:scale(0)}55%{transform:scale(1.18)}100%{transform:scale(1)}}
.ag-g2048 .v2 .in{background:linear-gradient(150deg,#3b322c,#2f2722);color:#e9ddd0}
.ag-g2048 .v4 .in{background:linear-gradient(150deg,#4a3a2c,#3a2d22);color:#f3e5d4}
.ag-g2048 .v8 .in{background:linear-gradient(150deg,#7a3e18,#5f2f12);color:#ffe9d6}
.ag-g2048 .v16 .in{background:linear-gradient(150deg,#9c4715,#7d3810);color:#fff1e3}
.ag-g2048 .v32 .in{background:linear-gradient(150deg,#c75314,#a2410e);color:#fff4e8}
.ag-g2048 .v64 .in{background:linear-gradient(150deg,#ee6512,#c94f0a);color:#fff}
.ag-g2048 .v128 .in{background:linear-gradient(150deg,#ff8a3d,#f06f1d);color:#1b0d03;font-size:34px;box-shadow:0 0 18px rgba(255,138,61,.35),inset 0 1px 0 rgba(255,255,255,.3)}
.ag-g2048 .v256 .in{background:linear-gradient(150deg,#ff9e52,#ff8233);color:#1b0d03;font-size:34px;box-shadow:0 0 22px rgba(255,150,70,.42),inset 0 1px 0 rgba(255,255,255,.3)}
.ag-g2048 .v512 .in{background:linear-gradient(150deg,#ffb468,#ff9645);color:#1b0d03;font-size:34px;box-shadow:0 0 26px rgba(255,170,90,.5),inset 0 1px 0 rgba(255,255,255,.35)}
.ag-g2048 .v1024 .in{background:linear-gradient(150deg,#ffd27a,#ffb54d);color:#1b0d03;font-size:28px;box-shadow:0 0 30px rgba(255,200,97,.55),inset 0 1px 0 rgba(255,255,255,.4)}
.ag-g2048 .v2048 .in{background:linear-gradient(150deg,#fff0b0,#ffc861 55%,#ff9a3d);color:#1b0d03;font-size:28px;box-shadow:0 0 38px rgba(255,200,97,.75),inset 0 1px 0 rgba(255,255,255,.6)}
.ag-g2048 .vbig .in{background:linear-gradient(150deg,#ff6a4a,#d63d2b 60%,#8f2216);color:#fff;font-size:24px;box-shadow:0 0 34px rgba(255,90,82,.6),inset 0 1px 0 rgba(255,255,255,.3)}
.ag-g2048 .ov{position:absolute;inset:0;border-radius:14px;background:rgba(14,12,11,.78);backdrop-filter:blur(2px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:5;animation:ag2048fade .35s ease-out}
.ag-g2048 .ov h3{font-family:var(--display);font-size:30px;margin:0;color:var(--gold)}
.ag-g2048 .ov p{margin:0;color:var(--muted)}
.ag-g2048 .ov .row{display:flex;gap:8px}
@keyframes ag2048fade{from{opacity:0}}
.ag-g2048 details{margin:14px auto 0;width:${BOARD}px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:13px;color:var(--muted)}
.ag-g2048 summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-g2048 details ul{margin:6px 0 2px;padding-left:18px}
`;

  // Pure line slide toward index 0. Exposed for tests.
  function slideLine(line) {
    const vals = line.filter(v => v);
    const out = [];
    let gained = 0;
    for (let i = 0; i < vals.length; i++) {
      if (i + 1 < vals.length && vals[i] === vals[i + 1]) { out.push(vals[i] * 2); gained += vals[i] * 2; i++; }
      else out.push(vals[i]);
    }
    while (out.length < line.length) out.push(0);
    return { out, gained };
  }

  let inst = null;

  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    let soundOn = api.load('sound'); if (soundOn === null) soundOn = !!api.sound;
    let actx = null;
    function blip(f, d, type, vol) {
      if (!soundOn) return;
      try {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.25, t + d);
        g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
      } catch (e) { /* ignore */ }
    }

    const root = document.createElement('div');
    root.className = 'ag-g2048';
    root.innerHTML = `
<div class="hd"><div class="ttl"><h2>Ember <span>2048</span></h2>
<div class="how">Slide with arrow keys / WASD or swipe. Equal tiles merge. Reach 2048!</div></div>
<div class="scores"><div class="sc" data-r="scw"><b>SCORE</b><i data-r="score">0</i></div><div class="sc"><b>BEST</b><i data-r="best">0</i></div></div></div>
<div class="bar"><button class="btn pri small" data-r="new">New game</button><button class="btn sec small" data-r="undo" disabled>↶ Undo</button><span class="sp"></span><button class="btn sec small" data-r="snd"></button></div>
<div class="wrap"><div class="board" data-r="board"></div></div>
<details><summary>Tips</summary><ul>
<li>Keep your biggest tile in a corner and build a descending chain along one edge.</li>
<li>Favour two directions (e.g. left + down); use a third only when stuck.</li>
<li>Undo rewinds one move. U or Ctrl+Z works too.</li></ul></details>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const board = $('board'), wrap = board.parentNode;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const d = document.createElement('div'); d.className = 'cell';
      d.style.left = (GAP + c * STEP) + 'px'; d.style.top = (GAP + r * STEP) + 'px'; board.appendChild(d);
    }

    let grid, score, best = api.load('best') || 0, prev = null, won = false, keep = false, over = false, nextId = 1, overlay = null;

    function pos(t) { return 'translate(' + (GAP + t.c * STEP) + 'px,' + (GAP + t.r * STEP) + 'px)'; }
    function makeTile(v, r, c, cls) {
      const t = { id: nextId++, v, r, c, el: document.createElement('div') };
      t.el.className = 'tile ' + (v > 2048 ? 'vbig' : 'v' + v) + (cls ? ' ' + cls : '');
      t.el.innerHTML = '<div class="in">' + v + '</div>';
      if (v >= 16384) t.el.firstChild.style.fontSize = '20px';
      t.el.style.transform = pos(t);
      board.appendChild(t.el);
      return t;
    }
    function empties() { const e = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) e.push([r, c]); return e; }
    function spawn(anim) {
      const e = empties(); if (!e.length) return;
      const [r, c] = e[Math.floor(Math.random() * e.length)];
      grid[r][c] = makeTile(Math.random() < 0.9 ? 2 : 4, r, c, anim ? 'new' : '');
    }
    function values() { return grid.map(row => row.map(t => (t ? t.v : 0))); }
    function clearTiles() { board.querySelectorAll('.tile').forEach(n => n.remove()); }
    function loadValues(vals, sc) {
      clearTiles();
      grid = [];
      for (let r = 0; r < N; r++) { grid.push([]); for (let c = 0; c < N; c++) grid[r].push(vals[r][c] ? makeTile(vals[r][c], r, c, '') : null); }
      score = sc;
    }
    function persist() { api.save('state', { v: values(), s: score, won, keep }); }
    function hud(gain) {
      $('score').textContent = score; $('best').textContent = best;
      $('undo').disabled = !prev;
      if (gain) {
        const p = document.createElement('div'); p.className = 'plus'; p.textContent = '+' + gain; $('scw').appendChild(p);
        later(() => p.remove(), 720);
      }
    }
    function sndLabel() { $('snd').textContent = soundOn ? '🔊' : '🔇'; $('snd').title = soundOn ? 'Sound on' : 'Sound off'; }
    function hideOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
    function showOverlay(kind) {
      hideOverlay();
      overlay = document.createElement('div'); overlay.className = 'ov';
      if (kind === 'win') {
        overlay.innerHTML = '<h3>2048!</h3><p>The mule is on fire. Score ' + score + '.</p><div class="row"><button class="btn pri small" data-a="keep">Keep going</button><button class="btn sec small" data-a="new">New game</button></div>';
      } else {
        overlay.innerHTML = '<h3>No moves left</h3><p>Final score ' + score + (score >= best && score > 0 ? ' — new best!' : '') + '</p><div class="row"><button class="btn pri small" data-a="new">New game</button>' + (prev ? '<button class="btn sec small" data-a="undo">↶ Undo</button>' : '') + '</div>';
      }
      wrap.appendChild(overlay);
    }
    function canMove() {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const t = grid[r][c]; if (!t) return true;
        if (c + 1 < N && grid[r][c + 1] && grid[r][c + 1].v === t.v) return true;
        if (r + 1 < N && grid[r + 1][c] && grid[r + 1][c].v === t.v) return true;
      }
      return false;
    }
    function newGame() {
      hideOverlay(); prev = null; won = false; keep = false; over = false;
      grid = Array.from({ length: N }, () => Array(N).fill(null)); score = 0;
      clearTiles(); spawn(true); spawn(true); hud(); persist();
    }
    // dir: 0 left, 1 right, 2 up, 3 down
    function move(dir) {
      if (over || (won && !keep)) return false;
      const before = values(), beforeScore = score;
      let moved = false, gain = 0, made2048 = false;
      const ng = Array.from({ length: N }, () => Array(N).fill(null));
      const dying = [];
      for (let k = 0; k < N; k++) {
        const cells = [];
        for (let i = 0; i < N; i++) {
          if (dir === 0) cells.push([k, i]); else if (dir === 1) cells.push([k, N - 1 - i]);
          else if (dir === 2) cells.push([i, k]); else cells.push([N - 1 - i, k]);
        }
        const ts = cells.map(([r, c]) => grid[r][c]).filter(Boolean);
        let tgt = 0;
        for (let i = 0; i < ts.length; i++) {
          const [r, c] = cells[tgt], t = ts[i];
          if (i + 1 < ts.length && ts[i + 1].v === t.v) {
            const u = ts[i + 1];
            for (const s of [t, u]) { if (s.r !== r || s.c !== c) moved = true; s.r = r; s.c = c; s.el.style.transform = pos(s); s.el.style.zIndex = 1; dying.push(s); }
            moved = true;
            const nt = makeTile(t.v * 2, r, c, 'mg');
            ng[r][c] = nt; gain += nt.v; if (nt.v === 2048) made2048 = true;
            i++;
          } else {
            if (t.r !== r || t.c !== c) moved = true;
            t.r = r; t.c = c; t.el.style.transform = pos(t); ng[r][c] = t;
          }
          tgt++;
        }
      }
      if (!moved) return false;
      later(() => dying.forEach(s => s.el.remove()), SLIDE_MS + 10);
      prev = { v: before, s: beforeScore, won, keep };
      grid = ng; score += gain;
      if (score > best) { best = score; api.save('best', best); }
      spawn(true);
      hud(gain);
      blip(gain ? 330 + Math.min(8, Math.log2(gain)) * 50 : 220, gain ? 0.09 : 0.04, gain ? 'triangle' : 'sine', gain ? 0.06 : 0.03);
      if (made2048 && !won) { won = true; later(() => { showOverlay('win'); blip(784, 0.3, 'triangle', 0.07); }, 260); }
      else if (!canMove()) { over = true; later(() => { showOverlay('over'); blip(160, 0.35, 'sawtooth', 0.04); }, 300); }
      persist();
      return true;
    }
    function undo() {
      if (!prev) return;
      hideOverlay(); over = false;
      won = prev.won; keep = prev.keep;
      loadValues(prev.v, prev.s); prev = null; hud(); persist();
    }

    // events
    function onClick(e) {
      const b = e.target.closest('button'); if (!b) return;
      const r = b.getAttribute('data-r'), a = b.getAttribute('data-a');
      if (r === 'new' || a === 'new') newGame();
      else if (r === 'undo' || a === 'undo') undo();
      else if (a === 'keep') { keep = true; hideOverlay(); persist(); }
      else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); sndLabel(); blip(520, 0.05); }
    }
    const KEYS = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3, a: 0, d: 1, w: 2, s: 3, A: 0, D: 1, W: 2, S: 3 };
    function onKey(e) {
      if (el.offsetParent === null || document.hidden) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.altKey || e.metaKey) return;
      if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey) { e.preventDefault(); undo(); return; }
      if (e.ctrlKey) return;
      if (e.key === 'u' || e.key === 'U') { e.preventDefault(); undo(); return; }
      if (e.key in KEYS) { e.preventDefault(); move(KEYS[e.key]); }
    }
    let sw = null;
    function onDown(e) { if (e.button !== 0 && e.pointerType === 'mouse') return; sw = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { board.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } }
    function onUp(e) {
      if (!sw || e.pointerId !== sw.id) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 0 : 1); else move(dy < 0 ? 2 : 3);
    }
    function onCancel() { sw = null; }
    root.addEventListener('click', onClick);
    board.addEventListener('pointerdown', onDown);
    board.addEventListener('pointerup', onUp);
    board.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);

    sndLabel();
    const saved = api.load('state');
    if (saved && saved.v && saved.v.length === N) {
      loadValues(saved.v, saved.s || 0); won = !!saved.won; keep = !!saved.keep;
      if (!canMove()) newGame(); else hud();
    } else newGame();

    return {
      destroy() {
        window.removeEventListener('keydown', onKey);
        root.removeEventListener('click', onClick);
        board.removeEventListener('pointerdown', onDown);
        board.removeEventListener('pointerup', onUp);
        board.removeEventListener('pointercancel', onCancel);
        timers.forEach(clearTimeout); timers.clear();
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        el.innerHTML = '';
      },
      _test: { move, undo, values, setValues: (v, s) => { hideOverlay(); over = false; prev = null; loadValues(v, s || 0); hud(); }, get score() { return score; }, get over() { return over; }, get won() { return won; } },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { inst.destroy(); inst = null; this._t = null; } },
    slideLine,
  };
})();
