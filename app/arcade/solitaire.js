/* VanMule Arcade: Klondike solitaire ("Ember Solitaire"). DOM cards, pointer drag & drop. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'solitaire';
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suitOf = id => (id / 13) | 0;
  const rankOf = id => (id % 13) + 1;
  const isRed = id => { const s = suitOf(id); return s === 1 || s === 2; };

  const CSS = `
.ag-solitaire{font-family:var(--body);color:var(--fg);user-select:none;-webkit-user-select:none}
.ag-solitaire .hd{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px}
.ag-solitaire .ttl{flex:1;min-width:230px}
.ag-solitaire h2{font-family:var(--display);font-size:26px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-solitaire h2 span{color:var(--ember)}
.ag-solitaire .how{color:var(--muted);font-size:13px;margin-top:3px}
.ag-solitaire .stats{display:flex;gap:6px}
.ag-solitaire .st{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:4px 12px;text-align:center;min-width:70px}
.ag-solitaire .st b{display:block;font-size:10px;letter-spacing:1.3px;color:var(--muted)}
.ag-solitaire .st i{font-style:normal;font-family:var(--mono);font-weight:700;font-size:18px}
.ag-solitaire .st.sc i{font-family:var(--display);color:var(--ember)}
.ag-solitaire .bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.ag-solitaire .seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px}
.ag-solitaire .seg button{height:28px;padding:0 9px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-solitaire .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-solitaire .sp{flex:1}
.ag-solitaire .rec{font-size:12px;color:var(--dim);font-family:var(--mono)}
.ag-solitaire .board{position:relative;border-radius:16px;background:radial-gradient(ellipse at 50% 0%,#2a211b 0%,#1a1513 70%);border:1px solid var(--line);overflow:hidden;touch-action:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
.ag-solitaire .slot{position:absolute;left:0;top:0;width:var(--cw);height:var(--ch);border-radius:calc(var(--cw)*.08);border:2px dashed rgba(255,255,255,.09);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.12);font-size:calc(var(--cw)*.36);font-family:var(--display)}
.ag-solitaire .slot.stock{cursor:pointer;border-style:solid;border-color:rgba(255,138,61,.22);color:rgba(255,138,61,.45)}
.ag-solitaire .slot.stock.out{border-color:rgba(255,255,255,.07);color:rgba(255,255,255,.1)}
.ag-solitaire .card{position:absolute;left:0;top:0;width:var(--cw);height:var(--ch);perspective:900px;transition:transform .24s cubic-bezier(.2,.75,.3,1);cursor:default;will-change:transform}
.ag-solitaire .card.mov{cursor:grab}
.ag-solitaire .card.drag{transition:none!important;cursor:grabbing}
.ag-solitaire .card.drag .face{box-shadow:0 14px 26px rgba(0,0,0,.5)}
.ag-solitaire .card.nt{transition:none!important}
.ag-solitaire .card.gone{visibility:hidden}
.ag-solitaire .cin{position:absolute;inset:0;transition:transform .32s ease;transform-style:preserve-3d}
.ag-solitaire .card.down .cin{transform:rotateY(180deg)}
.ag-solitaire .face,.ag-solitaire .back{position:absolute;inset:0;border-radius:calc(var(--cw)*.08);backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden}
.ag-solitaire .face{background:linear-gradient(170deg,#fffdf9,#f3ece3);box-shadow:0 1px 2px rgba(0,0,0,.45),inset 0 0 0 1px #d8cdc1;color:#1f1b18}
.ag-solitaire .card.red .face{color:#cf2f2a}
.ag-solitaire .back{transform:rotateY(180deg);background:
  radial-gradient(circle at 50% 50%,rgba(255,200,97,.25) 0 14%,transparent 15%),
  repeating-linear-gradient(45deg,rgba(255,255,255,.09) 0 2px,transparent 2px 9px),
  repeating-linear-gradient(-45deg,rgba(0,0,0,.12) 0 2px,transparent 2px 9px),
  linear-gradient(160deg,#ff9b52,#e2640f 55%,#b8480a);
  box-shadow:0 1px 2px rgba(0,0,0,.45),inset 0 0 0 calc(var(--cw)*.045) #fff4ea,inset 0 0 0 calc(var(--cw)*.06) #c9530c}
.ag-solitaire .back::after{content:"VM";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-weight:800;font-size:calc(var(--cw)*.2);color:#fff4ea;text-shadow:0 1px 0 rgba(0,0,0,.25);letter-spacing:-.5px}
.ag-solitaire .cr{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:.95;font-weight:700}
.ag-solitaire .cr b{font-family:var(--body);font-size:calc(var(--cw)*.2);font-weight:800;letter-spacing:-1px}
.ag-solitaire .cr i{font-style:normal;font-size:calc(var(--cw)*.17)}
.ag-solitaire .cr.tl{left:calc(var(--cw)*.06);top:calc(var(--cw)*.05)}
.ag-solitaire .cr.br{right:calc(var(--cw)*.06);bottom:calc(var(--cw)*.05);transform:rotate(180deg)}
.ag-solitaire .pip{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:calc(var(--cw)*.5);padding-top:calc(var(--cw)*.06)}
.ag-solitaire .pip.ace{font-size:calc(var(--cw)*.66)}
.ag-solitaire .fc{position:absolute;left:22%;right:22%;top:20%;bottom:20%;border-radius:calc(var(--cw)*.05);border:1.5px solid currentColor;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(160deg,rgba(255,138,61,.13),rgba(255,200,97,.18));opacity:.95}
.ag-solitaire .fc b{font-family:var(--display);font-weight:800;font-size:calc(var(--cw)*.3);line-height:1}
.ag-solitaire .fc i{font-style:normal;font-size:calc(var(--cw)*.2);line-height:1.1}
.ag-solitaire .hint .face,.ag-solitaire .slot.hint{box-shadow:0 0 0 3px var(--gold),0 0 18px rgba(255,200,97,.7)!important;animation:agsolh .5s ease-in-out infinite alternate}
@keyframes agsolh{to{filter:brightness(1.08)}}
.ag-solitaire .card.shake{animation:agsolshake .3s}
@keyframes agsolshake{25%{margin-left:-4px}75%{margin-left:4px}}
.ag-solitaire canvas.fx{position:absolute;left:0;top:0;z-index:3000;transition:opacity .6s;cursor:pointer}
.ag-solitaire .win{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);z-index:3100;background:rgba(26,22,20,.95);border:1px solid var(--line);border-radius:16px;padding:20px 28px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.6);animation:agsolwin .4s ease-out}
@keyframes agsolwin{from{opacity:0;transform:translate(-50%,-40%)}}
.ag-solitaire .win h3{font-family:var(--display);font-size:28px;margin:0 0 6px;color:var(--gold)}
.ag-solitaire .win p{margin:0 0 14px;color:var(--muted);font-size:14px;line-height:1.6}
.ag-solitaire .win p b{color:var(--fg)}
.ag-solitaire details{margin-top:10px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:13px;color:var(--muted)}
.ag-solitaire summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-solitaire details ul{margin:6px 0 2px;padding-left:18px}
`;

  let inst = null;

  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const opts = Object.assign({ draw: 1, oneClick: false }, api.load('opts') || {});
    if (opts.draw !== 3) opts.draw = 1;
    const rec = Object.assign({ played: 0, won: 0, bestTime: null, bestScore: 0 }, api.load('stats') || {});
    let soundOn = api.load('sound'); if (soundOn === null) soundOn = !!api.sound;
    let actx = null;
    function tone(f, d, type, vol, f2) {
      if (!soundOn) return;
      try {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(vol || 0.04, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
      } catch (e) { /* ignore */ }
    }
    const sfx = {
      place: () => tone(520, 0.05, 'triangle', 0.035, 380),
      flip: () => tone(760, 0.04, 'sine', 0.03),
      found: () => tone(660, 0.08, 'triangle', 0.045, 990),
      bad: () => tone(170, 0.08, 'square', 0.02),
      draw: () => tone(420, 0.035, 'sine', 0.025),
    };
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

    const root = document.createElement('div'); root.className = 'ag-solitaire';
    root.innerHTML = `
<div class="hd"><div class="ttl"><h2>Ember <span>Solitaire</span></h2><div class="how">Klondike: build the four foundations Ace→King by suit. In the tableau stack down in alternating colours. Drag cards, click the deck to draw, double-click to send home.</div></div>
<div class="stats"><div class="st sc"><b>SCORE</b><i data-r="score">0</i></div><div class="st"><b>TIME</b><i data-r="time">0:00</i></div><div class="st"><b>MOVES</b><i data-r="moves">0</i></div></div></div>
<div class="bar">
<button class="btn pri small" data-r="new">New game</button>
<button class="btn sec small" data-r="undo">↶ Undo</button>
<button class="btn sec small" data-r="hint">💡 Hint</button>
<button class="btn sec small" data-r="auto" hidden>⚡ Auto-finish</button>
<div class="seg" data-r="draw" title="Cards drawn from the deck each time"><button data-v="1">Draw 1</button><button data-v="3">Draw 3</button></div>
<div class="seg" data-r="click" title="How to send a card to the foundations"><button data-v="2">Double-click</button><button data-v="1">Single-click</button></div>
<span class="sp"></span><span class="rec" data-r="rec"></span>
<button class="btn sec small" data-r="snd"></button></div>
<div class="board" data-r="board"></div>
<details><summary>Tips</summary><ul>
<li>Turning over face-down tableau cards matters most: prefer moves that uncover them.</li>
<li>Don't rush cards to the foundations if you might still need them to hold lower cards.</li>
<li>Only Kings can go into an empty column, so empty one when you have a King ready.</li>
<li>Scoring: +10 to foundation, +5 waste→tableau, +5 per card turned, −15 foundation→tableau, recycling the deck costs 100 (Draw 1) or 20 (Draw 3), −2 every 10 s, time bonus on a win.</li>
<li>Keys: Ctrl+Z / U undo · H hint · D or Space draw.</li></ul></details>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const board = $('board');

    /* ---------- cards & slots ---------- */
    const cardEl = [];
    for (let id = 0; id < 52; id++) {
      const d = document.createElement('div');
      const r = rankOf(id), s = SUITS[suitOf(id)];
      d.className = 'card down' + (isRed(id) ? ' red' : '');
      d.dataset.id = id;
      let mid;
      if (r === 1) mid = '<div class="pip ace">' + s + '</div>';
      else if (r > 10) mid = '<div class="fc"><b>' + RANKS[r] + '</b><i>' + s + '</i></div>';
      else mid = '<div class="pip">' + s + '</div>';
      d.innerHTML = '<div class="cin"><div class="face"><div class="cr tl"><b>' + RANKS[r] + '</b><i>' + s + '</i></div>' + mid +
        '<div class="cr br"><b>' + RANKS[r] + '</b><i>' + s + '</i></div></div><div class="back"></div></div>';
      board.appendChild(d); cardEl.push(d);
    }
    const slots = {};
    function mkSlot(name, txt, cls) { const d = document.createElement('div'); d.className = 'slot ' + (cls || ''); d.dataset.pile = name; d.textContent = txt; board.insertBefore(d, board.firstChild); slots[name] = d; }
    mkSlot('stock', '↻', 'stock');
    for (let i = 0; i < 4; i++) mkSlot('f' + i, 'A');
    for (let i = 0; i < 7; i++) mkSlot('t' + i, 'K');

    /* ---------- state ---------- */
    let S; // {stock, waste, f:[[]x4], t:[[]x7], up: bool[52], score, moves, passes, time}
    let undoStack = [], started = false, won = false, busy = false, timerId = null, hintList = null, hintIdx = 0;
    let G = null; // geometry
    const pos = []; // current laid-out {x,y,z}

    function pile(name) {
      if (name === 'stock') return S.stock; if (name === 'waste') return S.waste;
      if (name[0] === 'f') return S.f[+name[1]]; return S.t[+name[1]];
    }
    function where(id) {
      if (S.stock.includes(id)) return { name: 'stock', idx: S.stock.indexOf(id) };
      if (S.waste.includes(id)) return { name: 'waste', idx: S.waste.indexOf(id) };
      for (let i = 0; i < 4; i++) { const k = S.f[i].indexOf(id); if (k >= 0) return { name: 'f' + i, idx: k }; }
      for (let i = 0; i < 7; i++) { const k = S.t[i].indexOf(id); if (k >= 0) return { name: 't' + i, idx: k }; }
      return null;
    }
    const top = arr => (arr.length ? arr[arr.length - 1] : -1);
    function snap() { return JSON.stringify({ stock: S.stock, waste: S.waste, f: S.f, t: S.t, up: S.up, score: S.score, moves: S.moves, passes: S.passes }); }
    function restore(js) { const o = JSON.parse(js); Object.assign(S, o); }

    /* ---------- rules ---------- */
    function canFound(id, fi) {
      const f = S.f[fi];
      if (!f.length) return rankOf(id) === 1;
      const t = top(f); return suitOf(t) === suitOf(id) && rankOf(id) === rankOf(t) + 1;
    }
    function foundFor(id) {
      for (let i = 0; i < 4; i++) if (S.f[i].length && canFound(id, i)) return i;
      if (rankOf(id) === 1) for (let i = 0; i < 4; i++) if (!S.f[i].length) return i;
      return -1;
    }
    function canTab(id, ti) {
      const t = S.t[ti];
      if (!t.length) return rankOf(id) === 13;
      const c = top(t); return S.up[c] && isRed(c) !== isRed(id) && rankOf(c) === rankOf(id) + 1;
    }
    // can the card at (name, idx) be picked up (with everything above it)?
    function movable(name, idx) {
      const p = pile(name);
      if (name === 'stock') return false;
      if (!S.up[p[idx]]) return false;
      if (name === 'waste' || name[0] === 'f') return idx === p.length - 1;
      for (let k = idx; k < p.length - 1; k++) { const a = p[k], b = p[k + 1]; if (!S.up[b] || isRed(a) === isRed(b) || rankOf(a) !== rankOf(b) + 1) return false; }
      return true;
    }
    function legal(src, idx, dst) {
      if (src === dst || !movable(src, idx)) return false;
      const p = pile(src), id = p[idx], n = p.length - idx;
      if (dst[0] === 'f') return n === 1 && canFound(id, +dst[1]);
      if (dst[0] === 't') return canTab(id, +dst[1]);
      return false;
    }

    /* ---------- moves ---------- */
    function addScore(n) { S.score = Math.max(0, S.score + n); }
    function begin() {
      if (!started) { started = true; rec.played++; api.save('stats', rec); startTimer(); }
    }
    function pushUndo() { undoStack.push(snap()); hintList = null; }
    function doMove(src, idx, dst, opt) {
      if (!legal(src, idx, dst)) return false;
      begin(); pushUndo();
      const p = pile(src), cards = p.splice(idx);
      pile(dst).push(...cards);
      if (src === 'waste' && dst[0] === 't') addScore(5);
      if ((src === 'waste' || src[0] === 't') && dst[0] === 'f') addScore(10);
      if (src[0] === 'f' && dst[0] === 't') addScore(-15);
      let flipped = false;
      if (src[0] === 't' && p.length && !S.up[top(p)]) { S.up[top(p)] = true; addScore(5); flipped = true; }
      S.moves++;
      if (dst[0] === 'f') sfx.found(); else sfx.place();
      if (flipped) later(sfx.flip, 120);
      layout(opt && opt.fast ? 0 : 1);
      hud(); checkWin();
      return true;
    }
    function draw() {
      if (won || busy) return;
      if (!S.stock.length && !S.waste.length) return;
      begin(); pushUndo();
      if (S.stock.length) {
        const n = Math.min(opts.draw, S.stock.length);
        for (let k = 0; k < n; k++) { const id = S.stock.pop(); S.up[id] = true; S.waste.push(id); }
        sfx.draw();
      } else {
        while (S.waste.length) { const id = S.waste.pop(); S.up[id] = false; S.stock.push(id); }
        S.passes++;
        addScore(opts.draw === 1 ? -100 : -20);
        tone(300, 0.12, 'sine', 0.03, 200);
      }
      S.moves++;
      layout(1); hud();
    }
    function undo() {
      if (busy || won || !undoStack.length) return;
      restore(undoStack.pop()); hintList = null;
      layout(1); hud(); tone(330, 0.04, 'sine', 0.025);
    }
    // send a clicked card somewhere sensible: foundation first, then tableau
    function smartMove(name, idx) {
      const p = pile(name), id = p[idx];
      if (idx === p.length - 1 && name[0] !== 'f') { const fi = foundFor(id); if (fi >= 0 && doMove(name, idx, 'f' + fi)) return true; }
      if (!movable(name, idx)) return false;
      let empty = -1;
      for (let i = 0; i < 7; i++) {
        const d = 't' + i; if (d === name) continue;
        if (!S.t[i].length) { if (empty < 0) empty = i; continue; }
        if (legal(name, idx, d)) return doMove(name, idx, d);
      }
      // only move a king into an empty column if it actually achieves something
      if (empty >= 0 && legal(name, idx, 't' + empty) && !(name[0] === 't' && idx === 0)) return doMove(name, idx, 't' + empty);
      return false;
    }
    function shake(id) { const d = cardEl[id]; d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); later(() => d.classList.remove('shake'), 320); sfx.bad(); }

    /* ---------- deal ---------- */
    function shuffled() { const a = []; for (let i = 0; i < 52; i++) a.push(i); for (let i = 51; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function newGame(deck) {
      clearFx(); stopTimer(); clearHint();
      timers.forEach(clearTimeout); timers.clear();
      deck = deck || shuffled();
      S = { stock: [], waste: [], f: [[], [], [], []], t: [[], [], [], [], [], [], []], up: Array(52).fill(false), score: 0, moves: 0, passes: 0, time: 0 };
      const order = []; let k = 0;
      for (let row = 0; row < 7; row++) for (let c = row; c < 7; c++) { const id = deck[k++]; S.t[c].push(id); order.push(id); }
      for (let c = 0; c < 7; c++) S.up[top(S.t[c])] = true;
      while (k < 52) S.stock.push(deck[k++]);
      undoStack = []; started = false; won = false; busy = false; hintList = null;
      // deal animation: put everything on the stock, then fly out
      geom();
      for (let id = 0; id < 52; id++) { const d = cardEl[id]; d.classList.add('nt', 'down'); d.classList.remove('gone', 'hint'); d.style.transform = 'translate(' + G.x[0] + 'px,0px)'; d.style.zIndex = 10 + id; pos[id] = { x: G.x[0], y: 0, z: 10 + id }; }
      void board.offsetWidth;
      for (let id = 0; id < 52; id++) cardEl[id].classList.remove('nt');
      order.forEach((id, i) => { const ms = i * 28; cardEl[id].style.transitionDelay = ms + 'ms'; cardEl[id].firstChild.style.transitionDelay = (ms + 180) + 'ms'; });
      layout(1, true);
      later(() => { for (const id of order) { cardEl[id].style.transitionDelay = ''; cardEl[id].firstChild.style.transitionDelay = ''; } }, order.length * 28 + 520);
      hud();
    }

    /* ---------- layout ---------- */
    function geom() {
      const W = Math.max(560, board.clientWidth || root.clientWidth || 900);
      const g = Math.round(Math.max(8, Math.min(18, W * 0.016)));
      const rt = board.getBoundingClientRect();
      const avail = Math.max(430, window.innerHeight - Math.max(0, rt.top) - 24);
      let cw = Math.floor(Math.min(104, (W - 8 * g) / 7));
      const chMax = (avail - g * 2.5) / 3.7; if (cw * 1.4 > chMax) cw = Math.floor(Math.max(58, chMax / 1.4));
      const ch = Math.round(cw * 1.4);
      const x0 = Math.round((W - (7 * cw + 6 * g)) / 2);
      const x = []; for (let i = 0; i < 7; i++) x.push(x0 + i * (cw + g));
      G = { W, g, cw, ch, x, top: g, tabY: g + ch + Math.round(g * 1.4), avail, fan: Math.round(cw * 0.24) };
      board.style.setProperty('--cw', cw + 'px'); board.style.setProperty('--ch', ch + 'px');
    }
    function colOffsets(i) {
      const t = S.t[i]; let nd = 0; for (const id of t) if (!S.up[id]) nd++;
      const nu = t.length - nd;
      let dOff = Math.round(G.ch * 0.1), uOff = Math.round(G.ch * 0.27);
      const room = G.avail - G.tabY - G.ch - 8;
      if (nu > 1 && nd * dOff + (nu - 1) * uOff > room) {
        uOff = Math.max(Math.round(G.ch * 0.13), Math.floor((room - nd * dOff) / (nu - 1)));
        if (nd * dOff + (nu - 1) * uOff > room) dOff = Math.round(G.ch * 0.05);
      }
      return { dOff, uOff };
    }
    let flyT = null;
    function layout(anim, keepDelays) {
      geom();
      const P = [];
      const set = (id, x, y, z) => { P[id] = { x, y, z }; };
      const stY = G.top;
      S.stock.forEach((id, i) => set(id, G.x[0] + Math.min(i, 30) * 0, stY - Math.floor(i / 8), 10 + i));
      const wn = S.waste.length, vis = opts.draw === 3 ? 3 : 1;
      S.waste.forEach((id, i) => {
        const k = i - (wn - vis); // position within the visible fan
        const off = opts.draw === 3 && k > 0 ? k * G.fan : 0;
        set(id, G.x[1] + off, stY, 100 + i);
      });
      for (let f = 0; f < 4; f++) S.f[f].forEach((id, i) => set(id, G.x[3 + f], stY, 200 + i));
      let maxY = G.tabY + G.ch * 2;
      for (let c = 0; c < 7; c++) {
        const { dOff, uOff } = colOffsets(c); let y = G.tabY;
        S.t[c].forEach((id, i) => { set(id, G.x[c], y, 300 + i); y += S.up[id] ? uOff : dOff; });
        if (S.t[c].length) maxY = Math.max(maxY, P[top(S.t[c])].y + G.ch);
      }
      board.style.height = Math.max(G.avail, maxY + G.g) + 'px';
      // slots
      const sp = (n, x, y) => { slots[n].style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
      sp('stock', G.x[0], stY); slots.stock.classList.toggle('out', !S.waste.length);
      for (let f = 0; f < 4; f++) sp('f' + f, G.x[3 + f], stY);
      for (let c = 0; c < 7; c++) sp('t' + c, G.x[c], G.tabY);
      const moving = [];
      for (let id = 0; id < 52; id++) {
        const d = cardEl[id], p = P[id], o = pos[id];
        const changed = !o || o.x !== p.x || o.y !== p.y;
        d.classList.toggle('down', !S.up[id]);
        d.classList.toggle('mov', S.up[id]);
        if (!anim) d.classList.add('nt');
        d.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
        if (anim && changed) { d.style.zIndex = 1000 + p.z; moving.push(id); } else d.style.zIndex = p.z;
        pos[id] = p;
        if (!keepDelays) d.style.transitionDelay = '';
      }
      if (!anim) { void board.offsetWidth; for (let id = 0; id < 52; id++) cardEl[id].classList.remove('nt'); }
      if (moving.length) {
        if (flyT) { clearTimeout(flyT); timers.delete(flyT); }
        flyT = later(() => { flyT = null; for (let id = 0; id < 52; id++) if (!cardEl[id].classList.contains('drag')) cardEl[id].style.zIndex = pos[id].z; }, keepDelays ? 1900 : 280);
      }
      $('auto').hidden = !canAuto();
    }

    /* ---------- hud / timer ---------- */
    const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    function hud() {
      $('score').textContent = S.score; $('time').textContent = fmt(S.time); $('moves').textContent = S.moves;
      $('undo').disabled = !undoStack.length || won || busy;
      $('hint').disabled = won || busy;
      root.querySelectorAll('[data-r="draw"] button').forEach(b => b.classList.toggle('on', +b.dataset.v === opts.draw));
      root.querySelectorAll('[data-r="click"] button').forEach(b => b.classList.toggle('on', (b.dataset.v === '1') === !!opts.oneClick));
      $('snd').textContent = soundOn ? '🔊' : '🔇';
      $('rec').textContent = 'Won ' + rec.won + '/' + rec.played + (rec.bestTime != null ? ' · Best ' + fmt(rec.bestTime) : '');
      $('auto').hidden = !canAuto();
    }
    function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
    function startTimer() {
      stopTimer();
      timerId = setInterval(() => {
        if (document.hidden || el.offsetParent === null || won) return;
        S.time++;
        if (S.time % 10 === 0) addScore(-2);
        $('time').textContent = fmt(S.time); $('score').textContent = S.score;
      }, 1000);
    }

    /* ---------- hints ---------- */
    function computeHints() {
      const out = [];
      const srcs = []; // single top cards
      for (let c = 0; c < 7; c++) if (S.t[c].length) srcs.push(['t' + c, S.t[c].length - 1]);
      if (S.waste.length) srcs.push(['waste', S.waste.length - 1]);
      for (const [n, i] of srcs) { const id = pile(n)[i], fi = foundFor(id); if (fi >= 0) out.push({ src: n, idx: i, dst: 'f' + fi }); }
      for (let c = 0; c < 7; c++) {
        const t = S.t[c]; if (!t.length) continue;
        let idx = t.findIndex(id => S.up[id]); if (idx < 0) continue;
        for (let d = 0; d < 7; d++) {
          if (d === c || !legal('t' + c, idx, 't' + d)) continue;
          if (!S.t[d].length && idx === 0) continue; // king shuffle between empty columns
          out.push({ src: 't' + c, idx, dst: 't' + d });
          break;
        }
      }
      if (S.waste.length) for (let d = 0; d < 7; d++) if (legal('waste', S.waste.length - 1, 't' + d)) { out.push({ src: 'waste', idx: S.waste.length - 1, dst: 't' + d }); break; }
      if (S.stock.length || S.waste.length) out.push({ src: 'stock', idx: -1, dst: null });
      return out;
    }
    function clearHint() { root.querySelectorAll('.ag-solitaire .hint').forEach(n => n.classList.remove('hint')); }
    function hint() {
      if (won || busy) return;
      if (!hintList) { hintList = computeHints(); hintIdx = 0; }
      clearHint();
      if (!hintList.length) { api.toast('No moves left — try Undo or a New game.'); sfx.bad(); return; }
      const h = hintList[hintIdx % hintList.length]; hintIdx++;
      if (h.src === 'stock') { (S.stock.length ? cardEl[top(S.stock)] : slots.stock).classList.add('hint'); }
      else {
        pile(h.src).slice(h.idx).forEach(id => cardEl[id].classList.add('hint'));
        const dp = pile(h.dst); (dp.length ? cardEl[top(dp)] : slots[h.dst]).classList.add('hint');
      }
      tone(880, 0.06, 'sine', 0.03);
      later(clearHint, 1700);
      return h;
    }

    /* ---------- auto-finish & win ---------- */
    function canAuto() {
      if (won || busy || !S || S.stock.length || S.waste.length) return false;
      let any = false;
      for (const t of S.t) for (const id of t) { if (!S.up[id]) return false; any = true; }
      return any;
    }
    function autoFinish() {
      if (!canAuto()) return;
      busy = true; hud();
      const step = () => {
        let best = null;
        for (let c = 0; c < 7; c++) { const t = S.t[c]; if (!t.length) continue; const id = top(t), fi = foundFor(id); if (fi >= 0 && (!best || rankOf(id) < rankOf(best.id))) best = { c, id, fi }; }
        if (!best) { busy = false; hud(); return; }
        busy = false; doMove('t' + best.c, S.t[best.c].length - 1, 'f' + best.fi); if (won) return; busy = true; hud();
        later(step, 85);
      };
      step();
    }
    function checkWin() {
      if (won || !S.f.every(f => f.length === 13)) return;
      won = true; busy = false; stopTimer();
      let bonus = 0; if (S.time >= 30) bonus = Math.round(700000 / S.time);
      S.score += bonus;
      rec.won++;
      const newBest = rec.bestTime == null || S.time < rec.bestTime;
      if (newBest) rec.bestTime = S.time;
      if (S.score > rec.bestScore) rec.bestScore = S.score;
      api.save('stats', rec);
      hud();
      later(() => celebrate(bonus, newBest), 420);
    }

    let fx = null; // celebration
    function clearFx() {
      if (!fx) return;
      if (fx.raf) cancelAnimationFrame(fx.raf);
      fx.canvas.remove(); if (fx.banner) fx.banner.remove();
      board.removeEventListener('pointerdown', fx.skip, true);
      for (let id = 0; id < 52; id++) cardEl[id].classList.remove('gone');
      fx = null;
    }
    function cardImage(id, w, h, dpr) {
      const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const x = c.getContext('2d'); x.scale(dpr, dpr);
      const r = w * 0.08;
      x.beginPath(); x.moveTo(r, 0); x.arcTo(w, 0, w, h, r); x.arcTo(w, h, 0, h, r); x.arcTo(0, h, 0, 0, r); x.arcTo(0, 0, w, 0, r); x.closePath();
      x.fillStyle = '#fbf7f2'; x.fill(); x.strokeStyle = '#8f8276'; x.lineWidth = 1; x.stroke();
      x.fillStyle = isRed(id) ? '#cf2f2a' : '#1f1b18';
      x.textBaseline = 'top'; x.font = '800 ' + Math.round(w * 0.2) + 'px Figtree, sans-serif';
      x.fillText(RANKS[rankOf(id)], w * 0.07, h * 0.04);
      x.font = Math.round(w * 0.17) + 'px sans-serif'; x.fillText(SUITS[suitOf(id)], w * 0.07, h * 0.04 + w * 0.2);
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = Math.round(w * 0.5) + 'px sans-serif'; x.fillText(SUITS[suitOf(id)], w / 2, h / 2 + w * 0.04);
      return c;
    }
    function celebrate(bonus, newBest) {
      clearFx();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = board.clientWidth, H = board.clientHeight;
      const canvas = document.createElement('canvas'); canvas.className = 'fx';
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      board.appendChild(canvas);
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
      const imgs = {};
      const queue = []; for (let r = 12; r >= 0; r--) for (let f = 0; f < 4; f++) queue.push({ id: S.f[f][r], f });
      fx = { canvas, raf: 0, banner: null, cur: null, t0: performance.now(), last: performance.now() };
      const finish = () => {
        if (!fx || fx.done) return; fx.done = true;
        if (fx.raf) cancelAnimationFrame(fx.raf); fx.raf = 0;
        canvas.style.opacity = '0';
        for (let id = 0; id < 52; id++) cardEl[id].classList.remove('gone');
        const b = document.createElement('div'); b.className = 'win';
        b.innerHTML = '<h3>You won! 🎉</h3><p>Score <b>' + S.score + '</b>' + (bonus ? ' (time bonus +' + bonus + ')' : '') + '<br>Time <b>' + fmt(S.time) + '</b> · Moves <b>' + S.moves + '</b>' + (newBest ? '<br><b style="color:var(--gold)">New best time!</b>' : '') +
          '<br>Games won ' + rec.won + ' of ' + rec.played + '</p><button class="btn pri small" data-r="new2">Deal again</button>';
        board.appendChild(b); fx.banner = b;
        later(() => { if (fx && fx.canvas === canvas) canvas.remove(); }, 650);
      };
      fx.skip = (e) => { if (fx && !fx.done && e.target === canvas) finish(); };
      board.addEventListener('pointerdown', fx.skip, true);
      const tick = (now) => {
        if (!fx || fx.done) return;
        fx.raf = 0;
        if (document.hidden || el.offsetParent === null) { finish(); return; }
        const dt = Math.min(3, (now - fx.last) / 16.67); fx.last = now;
        if (now - fx.t0 > 6500) { finish(); return; }
        let c = fx.cur;
        if (!c || c.x < -G.cw - 4 || c.x > W + 4) {
          const n = queue.shift();
          if (!n) { finish(); return; }
          if (!imgs[n.id]) imgs[n.id] = cardImage(n.id, G.cw, G.ch, dpr);
          cardEl[n.id].classList.add('gone');
          const dir = Math.random() < 0.5 ? -1 : 1;
          c = fx.cur = { id: n.id, x: G.x[3 + n.f], y: G.top, vx: dir * (2.5 + Math.random() * 4.5), vy: -Math.random() * 7 };
        }
        for (let s = 0; s < 2; s++) {
          c.vy += 0.42 * dt / 2; c.x += c.vx * dt / 2; c.y += c.vy * dt / 2;
          if (c.y > H - G.ch) { c.y = H - G.ch; c.vy = -c.vy * 0.78; }
          ctx.drawImage(imgs[c.id], c.x, c.y, G.cw, G.ch);
        }
        fx.raf = requestAnimationFrame(tick);
      };
      tone(523, 0.12, 'triangle', 0.05); later(() => tone(659, 0.12, 'triangle', 0.05), 120); later(() => tone(784, 0.12, 'triangle', 0.05), 240); later(() => tone(1046, 0.3, 'triangle', 0.05), 360);
      fx.raf = requestAnimationFrame(tick);
    }

    /* ---------- pointer input ---------- */
    let drag = null, lastClick = null;
    function onDown(e) {
      if (e.button !== 0 || won || busy || drag) return;
      const ce = e.target.closest('.card');
      const sl = e.target.closest('.slot');
      if (!ce) { if (sl && sl.dataset.pile === 'stock') { e.preventDefault(); draw(); } return; }
      const id = +ce.dataset.id, w = where(id); if (!w) return;
      e.preventDefault();
      if (w.name === 'stock') { draw(); return; }
      if (!movable(w.name, w.idx)) { if (S.up[id]) shake(id); return; }
      const ids = pile(w.name).slice(w.idx);
      drag = { src: w.name, idx: w.idx, ids, x0: e.clientX, y0: e.clientY, pid: e.pointerId, moved: false, start: ids.map(i => ({ x: pos[i].x, y: pos[i].y })) };
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 5) return;
        drag.moved = true; clearHint();
        drag.ids.forEach((id, k) => { cardEl[id].classList.add('drag'); cardEl[id].style.zIndex = 2000 + k; });
      }
      drag.dx = dx; drag.dy = dy;
      drag.ids.forEach((id, k) => { cardEl[id].style.transform = 'translate(' + (drag.start[k].x + dx) + 'px,' + (drag.start[k].y + dy) + 'px)'; });
    }
    function dropTarget(d) {
      const bx = d.start[0].x + d.dx, by = d.start[0].y + d.dy, w = G.cw, h = G.ch;
      const br = board.getBoundingClientRect();
      const px = d.lastX - br.left, py = d.lastY - br.top;
      let best = null, bestA = 0;
      const consider = (name, x, y) => {
        const ox = Math.max(0, Math.min(bx + w, x + w) - Math.max(bx, x));
        const oy = Math.max(0, Math.min(by + h, y + h) - Math.max(by, y));
        let a = ox * oy;
        if (px >= x && px <= x + w && py >= y && py <= y + h) a += w * h; // pointer directly over it wins
        if (a > bestA && legal(d.src, d.idx, name)) { bestA = a; best = name; }
      };
      for (let c = 0; c < 7; c++) { const t = S.t[c]; consider('t' + c, G.x[c], t.length ? pos[top(t)].y : G.tabY); }
      if (d.ids.length === 1) for (let f = 0; f < 4; f++) consider('f' + f, G.x[3 + f], G.top);
      return best;
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const d = drag; drag = null;
      d.ids.forEach(id => cardEl[id].classList.remove('drag'));
      if (d.moved) {
        d.lastX = e.clientX; d.lastY = e.clientY;
        const tgt = dropTarget(d);
        if (!tgt || !doMove(d.src, d.idx, tgt)) { layout(1); if (Math.hypot(d.dx, d.dy) > 30) sfx.bad(); }
        lastClick = null;
        return;
      }
      // click
      const id = d.ids[0], now = performance.now();
      if (opts.oneClick || (lastClick && lastClick.id === id && now - lastClick.t < 420)) {
        lastClick = null;
        if (!smartMove(d.src, d.idx)) shake(id);
      } else lastClick = { id, t: now };
    }
    function onCancel() { if (drag) { drag.ids.forEach(id => cardEl[id].classList.remove('drag')); drag = null; layout(1); } }
    function onClick(e) {
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      const r = b.dataset.r, par = b.parentNode.dataset.r;
      if (r === 'new' || r === 'new2') newGame();
      else if (r === 'undo') undo();
      else if (r === 'hint') hint();
      else if (r === 'auto') autoFinish();
      else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); hud(); tone(600, 0.05); }
      else if (par === 'draw') { const v = +b.dataset.v; if (v !== opts.draw) { opts.draw = v; api.save('opts', opts); if (started && !won) api.toast('Draw ' + v + ': new deal'); newGame(); } }
      else if (par === 'click') { opts.oneClick = b.dataset.v === '1'; api.save('opts', opts); hud(); }
    }
    function onKey(e) {
      if (el.offsetParent === null || document.hidden) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.altKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey) { if (k === 'z') { e.preventDefault(); undo(); } return; }
      if (k === 'u') { e.preventDefault(); undo(); }
      else if (k === 'h') { e.preventDefault(); hint(); }
      else if (k === 'd' || (k === ' ' && tg !== 'BUTTON')) { e.preventDefault(); draw(); }
    }
    let rsz = 0;
    function onResize() { if (rsz) return; rsz = requestAnimationFrame(() => { rsz = 0; if (document.hidden || el.offsetParent === null || drag) return; layout(0); }); }

    board.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    root.addEventListener('click', onClick);
    newGame();

    return {
      destroy() {
        clearFx(); stopTimer();
        timers.forEach(clearTimeout); timers.clear();
        if (rsz) cancelAnimationFrame(rsz);
        board.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        root.removeEventListener('click', onClick);
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        el.innerHTML = '';
      },
      _test: {
        get S() { return JSON.parse(snap()); },
        get G() { return G; },
        get won() { return won; },
        get fx() { return !!(fx && !fx.done); },
        newGame, legal, hint, undo, draw, doMove, canAuto,
        load(o) { S = Object.assign({ time: 0 }, JSON.parse(JSON.stringify(o))); undoStack = []; won = false; busy = false; hintList = null; clearFx(); clearHint(); layout(0); hud(); },
        rect(id) { return cardEl[id].getBoundingClientRect(); },
        slotRect(n) { return slots[n].getBoundingClientRect(); },
      },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { inst.destroy(); inst = null; this._t = null; } },
  };
})();
