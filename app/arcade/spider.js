/* VanMule Arcade: Spider Solitaire (1, 2 or 4 suits). Two decks, DOM cards, drag & drop and click-to-move. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'spider';
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const N = 104;
  const rankOf = id => (id % 13) + 1;

  const CSS = `
.ag-spider{font-family:var(--body);color:var(--fg);user-select:none;-webkit-user-select:none}
.ag-spider .hd{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px}
.ag-spider .ttl{flex:1;min-width:230px}
.ag-spider h2{font-family:var(--display);font-size:26px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-spider h2 span{color:var(--ember)}
.ag-spider .how{color:var(--muted);font-size:13px;margin-top:3px}
.ag-spider .stats{display:flex;gap:6px}
.ag-spider .st{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:4px 12px;text-align:center;min-width:70px}
.ag-spider .st b{display:block;font-size:10px;letter-spacing:1.3px;color:var(--muted)}
.ag-spider .st i{font-style:normal;font-family:var(--mono);font-weight:700;font-size:18px}
.ag-spider .st.sc i{font-family:var(--display);color:var(--ember)}
.ag-spider .st.pop i{animation:agsppop .5s}
@keyframes agsppop{40%{color:var(--gold);text-shadow:0 0 12px rgba(255,200,97,.8)}}
.ag-spider .bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.ag-spider .seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px}
.ag-spider .seg button{height:28px;padding:0 9px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-spider .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-spider .sp{flex:1}
.ag-spider .rec{font-size:12px;color:var(--dim);font-family:var(--mono)}
.ag-spider .board{position:relative;border-radius:16px;background:radial-gradient(ellipse at 50% 0%,#26222c 0%,#17151a 72%);border:1px solid var(--line);overflow:hidden;touch-action:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
.ag-spider .slot{position:absolute;left:0;top:0;width:var(--cw);height:var(--ch);border-radius:calc(var(--cw)*.08);border:2px dashed rgba(255,255,255,.09);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.12);font-size:calc(var(--cw)*.3);font-family:var(--display)}
.ag-spider .slot.fd{border-color:rgba(255,200,97,.14);color:rgba(255,200,97,.18);font-size:calc(var(--cw)*.24)}
.ag-spider .slot.stock{border-style:solid;border-color:rgba(255,255,255,.07);font-size:calc(var(--cw)*.16);font-family:var(--body);font-weight:700}
.ag-spider .card{position:absolute;left:0;top:0;width:var(--cw);height:var(--ch);perspective:900px;transition:transform .24s cubic-bezier(.2,.75,.3,1);will-change:transform;cursor:default}
.ag-spider .card.mov{cursor:grab}
.ag-spider .card.stk{cursor:pointer}
.ag-spider .card.drag{transition:none!important;cursor:grabbing}
.ag-spider .card.drag .face{box-shadow:0 14px 26px rgba(0,0,0,.5)}
.ag-spider .card.nt{transition:none!important}
.ag-spider .card.gone{visibility:hidden}
.ag-spider .cin{position:absolute;inset:0;transition:transform .32s ease;transform-style:preserve-3d}
.ag-spider .card.down .cin{transform:rotateY(180deg)}
.ag-spider .face,.ag-spider .back{position:absolute;inset:0;border-radius:calc(var(--cw)*.08);backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden}
.ag-spider .face{background:linear-gradient(170deg,#fffdf9,#f3ece3);box-shadow:0 1px 2px rgba(0,0,0,.45),inset 0 0 0 1px #d8cdc1;color:#1f1b18}
.ag-spider .card.red .face{color:#cf2f2a}
.ag-spider .back{transform:rotateY(180deg);background:
  radial-gradient(circle at 50% 50%,rgba(255,200,97,.25) 0 14%,transparent 15%),
  repeating-linear-gradient(45deg,rgba(255,255,255,.09) 0 2px,transparent 2px 9px),
  repeating-linear-gradient(-45deg,rgba(0,0,0,.12) 0 2px,transparent 2px 9px),
  linear-gradient(160deg,#ff9b52,#e2640f 55%,#b8480a);
  box-shadow:0 1px 2px rgba(0,0,0,.45),inset 0 0 0 calc(var(--cw)*.045) #fff4ea,inset 0 0 0 calc(var(--cw)*.06) #c9530c}
.ag-spider .back::after{content:"VM";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-weight:800;font-size:calc(var(--cw)*.2);color:#fff4ea}
.ag-spider .cr{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:.95;font-weight:700}
.ag-spider .cr b{font-size:calc(var(--cw)*.21);font-weight:800;letter-spacing:-1px}
.ag-spider .cr i{font-style:normal;font-size:calc(var(--cw)*.18)}
.ag-spider .cr.tl{left:calc(var(--cw)*.06);top:calc(var(--cw)*.04)}
.ag-spider .cr.tr{right:calc(var(--cw)*.06);top:calc(var(--cw)*.04);flex-direction:row;gap:1px}
.ag-spider .cr.tr b{font-size:calc(var(--cw)*.16)}
.ag-spider .cr.tr i{font-size:calc(var(--cw)*.15)}
.ag-spider .cr.br{right:calc(var(--cw)*.06);bottom:calc(var(--cw)*.05);transform:rotate(180deg)}
.ag-spider .pip{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:calc(var(--cw)*.5);padding-top:calc(var(--cw)*.14)}
.ag-spider .pip.ace{font-size:calc(var(--cw)*.66)}
.ag-spider .fc{position:absolute;left:22%;right:22%;top:31%;bottom:16%;border-radius:calc(var(--cw)*.05);border:1.5px solid currentColor;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(160deg,rgba(255,138,61,.13),rgba(255,200,97,.18))}
.ag-spider .fc b{font-family:var(--display);font-weight:800;font-size:calc(var(--cw)*.3);line-height:1}
.ag-spider .fc i{font-style:normal;font-size:calc(var(--cw)*.2);line-height:1.1}
.ag-spider .hint .face,.ag-spider .hint .back,.ag-spider .slot.hint{box-shadow:0 0 0 3px var(--gold),0 0 18px rgba(255,200,97,.7)!important}
.ag-spider .card.shake{animation:agspshake .3s}
@keyframes agspshake{25%{margin-left:-4px}75%{margin-left:4px}}
.ag-spider .cap{position:absolute;font-size:11px;letter-spacing:1.4px;font-weight:700;color:var(--dim);text-transform:uppercase;white-space:nowrap}
.ag-spider .flash{position:absolute;z-index:2500;pointer-events:none;font-family:var(--display);font-weight:800;color:var(--gold);font-size:22px;text-shadow:0 2px 10px rgba(0,0,0,.6);animation:agspfl 1.1s ease-out forwards}
@keyframes agspfl{from{opacity:0;transform:translateY(10px) scale(.8)}20%{opacity:1;transform:none}to{opacity:0;transform:translateY(-30px)}}
.ag-spider canvas.fx{position:absolute;left:0;top:0;z-index:3000;transition:opacity .6s;cursor:pointer}
.ag-spider .win{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);z-index:3100;background:rgba(26,22,20,.95);border:1px solid var(--line);border-radius:16px;padding:20px 28px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.6);animation:agspwin .4s ease-out}
@keyframes agspwin{from{opacity:0;transform:translate(-50%,-40%)}}
.ag-spider .win h3{font-family:var(--display);font-size:28px;margin:0 0 6px;color:var(--gold)}
.ag-spider .win p{margin:0 0 14px;color:var(--muted);font-size:14px;line-height:1.6}
.ag-spider .win p b{color:var(--fg)}
.ag-spider details{margin-top:10px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:13px;color:var(--muted)}
.ag-spider summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-spider details ul{margin:6px 0 2px;padding-left:18px}
`;

  let inst = null;

  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const opts = Object.assign({ suits: 1 }, api.load('opts') || {});
    if ([1, 2, 4].indexOf(opts.suits) < 0) opts.suits = 1;
    const blank = () => ({ played: 0, won: 0, best: 0 });
    const rec = Object.assign({ 1: blank(), 2: blank(), 4: blank() }, api.load('stats') || {});
    let bestAll = +api.load('best') || 0;
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
      deal: () => tone(420, 0.035, 'sine', 0.025),
      bad: () => tone(170, 0.08, 'square', 0.02),
      run: () => { tone(660, 0.1, 'triangle', 0.045, 990); later(() => tone(880, 0.12, 'triangle', 0.045, 1320), 110); },
    };
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

    const root = document.createElement('div'); root.className = 'ag-spider';
    root.innerHTML = `
<div class="hd"><div class="ttl"><h2>Spider <span>Solitaire</span></h2><div class="how">Build full runs King→Ace in one suit; a finished run flies off. Stack any card on one rank higher, but only same-suit runs move together. Click the stock to deal a new row.</div></div>
<div class="stats"><div class="st sc" data-r="scbox"><b>SCORE</b><i data-r="score">500</i></div><div class="st"><b>MOVES</b><i data-r="moves">0</i></div><div class="st"><b>RUNS</b><i data-r="runs">0/8</i></div></div></div>
<div class="bar">
<button class="btn pri small" data-r="new">New game</button>
<button class="btn sec small" data-r="undo">↶ Undo</button>
<button class="btn sec small" data-r="hint">💡 Hint</button>
<button class="btn sec small" data-r="deal">Deal row</button>
<div class="seg" data-r="suits" title="Number of suits: more suits is much harder"><button data-v="1">1 suit</button><button data-v="2">2 suits</button><button data-v="4">4 suits</button></div>
<span class="sp"></span><span class="rec" data-r="rec"></span>
<button class="btn sec small" data-r="snd"></button></div>
<div class="board" data-r="board"></div>
<details><summary>Tips</summary><ul>
<li>Turning over face-down cards is the top priority; an empty column is the most powerful thing you can have.</li>
<li>Any card can go on a card one rank higher, but mixed-suit stacks are stuck together — prefer same-suit moves.</li>
<li>Before dealing a new row, tidy up: every column must hold at least one card, and the new row will cover everything.</li>
<li>Scoring: start at 500, every move or deal costs 1, each completed run earns 100. Undone moves still cost their point.</li>
<li>Keys: Ctrl+Z / U undo · H hint · D or Space deal · N new game.</li></ul></details>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const board = $('board');

    /* ---------- cards & slots ---------- */
    let suitArr = new Array(N).fill(0);
    const suitOf = id => suitArr[id];
    const isRed = id => { const s = suitArr[id]; return s === 1 || s === 2; };
    const cardEl = [];
    for (let id = 0; id < N; id++) { const d = document.createElement('div'); d.dataset.id = id; board.appendChild(d); cardEl.push(d); }
    function paintCards() {
      for (let id = 0; id < N; id++) {
        const d = cardEl[id], r = rankOf(id), s = SUITS[suitOf(id)];
        d.className = 'card down' + (isRed(id) ? ' red' : '');
        let mid;
        if (r === 1) mid = '<div class="pip ace">' + s + '</div>';
        else if (r > 10) mid = '<div class="fc"><b>' + RANKS[r] + '</b><i>' + s + '</i></div>';
        else mid = '<div class="pip">' + s + '</div>';
        d.innerHTML = '<div class="cin"><div class="face"><div class="cr tl"><b>' + RANKS[r] + '</b><i>' + s + '</i></div><div class="cr tr"><b>' + RANKS[r] + '</b><i>' + s + '</i></div>' + mid +
          '<div class="cr br"><b>' + RANKS[r] + '</b><i>' + s + '</i></div></div><div class="back"></div></div>';
      }
    }
    const slots = {};
    function mkSlot(name, txt, cls) { const d = document.createElement('div'); d.className = 'slot ' + (cls || ''); d.dataset.pile = name; d.textContent = txt; board.insertBefore(d, board.firstChild); slots[name] = d; }
    mkSlot('stock', 'EMPTY', 'stock');
    for (let i = 0; i < 8; i++) mkSlot('f' + i, 'K→A', 'fd');
    for (let i = 0; i < 10; i++) mkSlot('t' + i, '');

    /* ---------- state ---------- */
    let S; // {t:[[]x10], stock:[], f:[[]...], up:bool[], score, moves, suits}
    let undoStack = [], started = false, won = false, busy = false, hintList = null, hintIdx = 0;
    let G = null;
    const pos = [];

    const pile = name => name === 'stock' ? S.stock : name[0] === 'f' ? S.f[+name.slice(1)] : S.t[+name.slice(1)];
    function where(id) {
      for (let i = 0; i < 10; i++) { const j = S.t[i].indexOf(id); if (j >= 0) return { name: 't' + i, idx: j }; }
      if (S.stock.indexOf(id) >= 0) return { name: 'stock', idx: S.stock.indexOf(id) };
      return null;
    }
    const top = arr => (arr.length ? arr[arr.length - 1] : -1);
    function snap() { return JSON.stringify({ t: S.t, stock: S.stock, f: S.f, up: S.up, score: S.score, moves: S.moves }); }

    /* ---------- rules ---------- */
    const follows = (a, b) => rankOf(a) + 1 === rankOf(b); // a can sit on b
    const sameRun = (a, b) => follows(a, b) && suitOf(a) === suitOf(b);
    function movable(name, idx) {
      if (name[0] !== 't') return false;
      const p = pile(name);
      if (idx < 0 || idx >= p.length || !S.up[p[idx]]) return false;
      for (let k = idx; k < p.length - 1; k++) if (!sameRun(p[k + 1], p[k])) return false;
      return true;
    }
    function runStart(c) { const t = S.t[c]; if (!t.length) return -1; let i = t.length - 1; while (i > 0 && S.up[t[i - 1]] && sameRun(t[i], t[i - 1])) i--; return i; }
    function legal(src, idx, dst) {
      if (src === dst || dst[0] !== 't' || !movable(src, idx)) return false;
      const d = pile(dst);
      return !d.length || follows(pile(src)[idx], top(d));
    }

    /* ---------- moves ---------- */
    function begin() { if (!started) { started = true; rec[S.suits].played++; api.save('stats', rec); } }
    function pushUndo() { undoStack.push(snap()); hintList = null; clearHint(); }
    function flipTop(c) { const t = S.t[c]; if (t.length && !S.up[top(t)]) { S.up[top(t)] = true; return true; } return false; }
    // remove a finished K..A run from the end of column c
    function collect(c) {
      const t = S.t[c]; if (t.length < 13) return false;
      const s = t.length - 13;
      if (rankOf(t[s]) !== 13 || !S.up[t[s]]) return false;
      for (let k = s; k < t.length - 1; k++) if (!sameRun(t[k + 1], t[k])) return false;
      const run = t.splice(s);
      S.f.push(run.reverse()); // King ends up on top
      S.score += 100;
      flipTop(c);
      return true;
    }
    function doMove(src, idx, dst) {
      if (busy || won || !legal(src, idx, dst)) return false;
      begin(); pushUndo();
      const p = pile(src), cards = p.splice(idx);
      pile(dst).push(...cards);
      S.moves++; S.score--;
      const flipped = flipTop(+src.slice(1));
      const got = collect(+dst.slice(1));
      sfx.place(); if (flipped) later(sfx.flip, 120);
      layout(1); hud();
      if (got) runDone(+dst.slice(1));
      checkWin();
      return true;
    }
    function deal() {
      if (busy || won) return false;
      if (!S.stock.length) { api.toast('The stock is empty.'); sfx.bad(); return false; }
      if (S.t.some(t => !t.length)) { api.toast('Fill every column before dealing a new row.'); sfx.bad(); slots.stock.classList.add('hint'); later(clearHint, 900); return false; }
      begin(); pushUndo();
      const ids = [];
      for (let c = 0; c < 10; c++) { const id = S.stock.pop(); S.up[id] = true; S.t[c].push(id); ids.push(id); }
      S.moves++; S.score--;
      ids.forEach((id, i) => { cardEl[id].style.transitionDelay = (i * 45) + 'ms'; cardEl[id].firstChild.style.transitionDelay = (i * 45 + 120) + 'ms'; });
      layout(1, true);
      for (let i = 0; i < 10; i++) later(sfx.deal, i * 45);
      later(() => ids.forEach(id => { cardEl[id].style.transitionDelay = ''; cardEl[id].firstChild.style.transitionDelay = ''; }), 10 * 45 + 450);
      let got = -1;
      for (let c = 0; c < 10; c++) if (collect(c)) got = c;
      if (got >= 0) later(() => { layout(1); hud(); runDone(got); checkWin(); }, 700);
      hud();
      return true;
    }
    function runDone(c) {
      sfx.run();
      const box = $('scbox'); box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
      const f = document.createElement('div'); f.className = 'flash'; f.textContent = '+100';
      f.style.left = (G.x[c] + G.cw * 0.2) + 'px'; f.style.top = (G.tabY + 10) + 'px';
      board.appendChild(f); later(() => f.remove(), 1150);
    }
    function undo() {
      if (busy || won || !undoStack.length) return;
      const o = JSON.parse(undoStack.pop());
      Object.assign(S, o); S.score -= 1; S.moves += 1;
      hintList = null; clearHint();
      layout(1); hud(); tone(330, 0.04, 'sine', 0.025);
    }
    function targets(src, idx) {
      const id = pile(src)[idx], same = [], other = [], empty = [];
      for (let i = 0; i < 10; i++) {
        const d = 't' + i; if (d === src || !legal(src, idx, d)) continue;
        const t = S.t[i];
        if (!t.length) empty.push(d); else if (suitOf(top(t)) === suitOf(id)) same.push(d); else other.push(d);
      }
      return { same, other, empty };
    }
    function smartMove(name, idx) {
      if (!movable(name, idx)) return false;
      const tg = targets(name, idx);
      // prefer a same-suit target, then any card, then (unless it achieves nothing) an empty column
      let dst = tg.same[0] || tg.other[0];
      if (!dst && tg.empty.length && idx > 0) dst = tg.empty[0];
      return dst ? doMove(name, idx, dst) : false;
    }
    function shake(id) { const d = cardEl[id]; d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); later(() => d.classList.remove('shake'), 320); sfx.bad(); }

    /* ---------- new game ---------- */
    function newGame() {
      clearFx(); clearHint();
      timers.forEach(clearTimeout); timers.clear(); flyT = null;
      const suits = opts.suits;
      for (let id = 0; id < N; id++) { const set = (id / 13) | 0; suitArr[id] = suits === 1 ? 0 : suits === 2 ? (set % 2) : (set % 4); }
      paintCards();
      const deck = []; for (let i = 0; i < N; i++) deck.push(i);
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
      S = { t: [], stock: [], f: [], up: new Array(N).fill(false), score: 500, moves: 0, suits };
      for (let c = 0; c < 10; c++) S.t.push([]);
      let k = 0;
      const order = [];
      for (let row = 0; row < 6; row++) for (let c = 0; c < 10; c++) { if (row === 5 && c >= 4) continue; const id = deck[k++]; S.t[c].push(id); order.push(id); }
      for (let c = 0; c < 10; c++) S.up[top(S.t[c])] = true;
      while (k < N) S.stock.push(deck[k++]);
      undoStack = []; started = false; won = false; busy = false; hintList = null;
      geom();
      for (let id = 0; id < N; id++) { const d = cardEl[id]; d.classList.add('nt'); d.style.transform = 'translate(' + G.stockX + 'px,' + G.top + 'px)'; d.style.zIndex = 10 + id; pos[id] = null; }
      void board.offsetWidth;
      for (let id = 0; id < N; id++) cardEl[id].classList.remove('nt');
      order.forEach((id, i) => { const ms = i * 16; cardEl[id].style.transitionDelay = ms + 'ms'; cardEl[id].firstChild.style.transitionDelay = (ms + 160) + 'ms'; });
      layout(1, true);
      later(() => { for (const id of order) { cardEl[id].style.transitionDelay = ''; cardEl[id].firstChild.style.transitionDelay = ''; } }, order.length * 16 + 520);
      hud();
    }

    /* ---------- layout ---------- */
    function geom() {
      const W = Math.max(560, board.clientWidth || root.clientWidth || 900);
      const g = Math.round(Math.max(5, Math.min(13, W * 0.011)));
      const rt = board.getBoundingClientRect();
      const avail = Math.max(460, window.innerHeight - Math.max(0, rt.top) - 24);
      let cw = Math.floor(Math.min(92, (W - 11 * g) / 10));
      const chMax = (avail - g * 3) / 3.6; if (cw * 1.4 > chMax) cw = Math.floor(Math.max(50, chMax / 1.4));
      const ch = Math.round(cw * 1.4);
      const x0 = Math.round((W - (10 * cw + 9 * g)) / 2);
      const x = []; for (let i = 0; i < 10; i++) x.push(x0 + i * (cw + g));
      const top0 = g + 16;
      // foundations: 8 slots overlapping to the right, stock at the left
      const fStep = Math.min(cw + g, Math.floor((x[9] - x[3]) / 7));
      const fx = []; for (let i = 0; i < 8; i++) fx.push(x[9] - (7 - i) * fStep);
      G = { W, g, cw, ch, x, fx, top: top0, stockX: x[0], tabY: top0 + ch + Math.round(g * 1.8), avail };
      board.style.setProperty('--cw', cw + 'px'); board.style.setProperty('--ch', ch + 'px');
    }
    function colOffsets(i) {
      const t = S.t[i]; let nd = 0; for (const id of t) if (!S.up[id]) nd++;
      const nu = t.length - nd;
      let dOff = Math.round(G.ch * 0.09), uOff = Math.round(G.ch * 0.25);
      const room = G.avail - G.tabY - G.ch - 8;
      if (nu > 1 && nd * dOff + (nu - 1) * uOff > room) {
        uOff = Math.max(Math.round(G.ch * 0.165), Math.floor((room - nd * dOff) / (nu - 1)));
        if (nd * dOff + (nu - 1) * uOff > room) dOff = Math.round(G.ch * 0.05);
      }
      return { dOff, uOff };
    }
    let flyT = null, caps = null;
    function layout(anim, keepDelays) {
      geom();
      if (!caps) {
        caps = [document.createElement('div'), document.createElement('div')];
        caps.forEach(c => { c.className = 'cap'; board.insertBefore(c, board.firstChild); });
      }
      const deals = S.stock.length / 10;
      caps[0].textContent = 'Stock · ' + deals + (deals === 1 ? ' deal' : ' deals');
      caps[0].style.left = G.x[0] + 'px'; caps[0].style.top = (G.top - 16) + 'px';
      caps[1].textContent = 'Completed runs'; caps[1].style.left = G.fx[0] + 'px'; caps[1].style.top = (G.top - 16) + 'px';
      const P = [];
      const set = (id, x, y, z) => { P[id] = { x, y, z }; };
      const sStep = Math.round(G.cw * 0.16);
      S.stock.forEach((id, i) => { const grp = (i / 10) | 0; set(id, G.stockX + grp * sStep, G.top, 10 + i); });
      S.f.forEach((run, fi) => run.forEach((id, k) => set(id, G.fx[fi], G.top, 200 + fi * 13 + k)));
      let maxY = G.tabY + G.ch * 2;
      for (let c = 0; c < 10; c++) {
        const { dOff, uOff } = colOffsets(c); let y = G.tabY;
        S.t[c].forEach((id, i) => { set(id, G.x[c], y, 400 + i); y += S.up[id] ? uOff : dOff; });
        if (S.t[c].length) maxY = Math.max(maxY, P[top(S.t[c])].y + G.ch);
      }
      board.style.height = Math.max(G.avail, maxY + G.g) + 'px';
      const sp = (n, x, y) => { slots[n].style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
      sp('stock', G.stockX, G.top);
      for (let f = 0; f < 8; f++) { sp('f' + f, G.fx[f], G.top); slots['f' + f].style.zIndex = 1; }
      for (let c = 0; c < 10; c++) sp('t' + c, G.x[c], G.tabY);
      let moving = false;
      for (let id = 0; id < N; id++) {
        const d = cardEl[id], p = P[id], o = pos[id];
        const changed = !o || o.x !== p.x || o.y !== p.y;
        d.classList.toggle('down', !S.up[id]);
        d.classList.toggle('mov', S.up[id] && !won);
        d.classList.toggle('stk', !S.up[id] && S.stock.indexOf(id) >= 0);
        if (!anim) d.classList.add('nt');
        d.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
        if (anim && changed) { d.style.zIndex = 1000 + p.z; moving = true; } else d.style.zIndex = p.z;
        pos[id] = p;
        if (!keepDelays) { d.style.transitionDelay = ''; d.firstChild.style.transitionDelay = ''; }
      }
      if (!anim) { void board.offsetWidth; for (let id = 0; id < N; id++) cardEl[id].classList.remove('nt'); }
      if (moving) {
        if (flyT) { clearTimeout(flyT); timers.delete(flyT); }
        flyT = later(() => { flyT = null; for (let id = 0; id < N; id++) if (!cardEl[id].classList.contains('drag')) cardEl[id].style.zIndex = pos[id].z; }, keepDelays ? 2000 : 280);
      }
    }

    /* ---------- hud ---------- */
    function hud() {
      $('score').textContent = S.score; $('moves').textContent = S.moves; $('runs').textContent = S.f.length + '/8';
      $('undo').disabled = !undoStack.length || won;
      $('hint').disabled = won;
      $('deal').disabled = won || !S.stock.length;
      $('deal').textContent = 'Deal row (' + (S.stock.length / 10) + ')';
      root.querySelectorAll('[data-r="suits"] button').forEach(b => b.classList.toggle('on', +b.dataset.v === opts.suits));
      $('snd').textContent = soundOn ? '🔊' : '🔇';
      const r = rec[opts.suits];
      $('rec').textContent = opts.suits + '-suit: won ' + r.won + '/' + r.played + (r.best ? ' · best ' + r.best : '');
    }

    /* ---------- hints ---------- */
    function computeHints() {
      const out = [];
      for (let c = 0; c < 10; c++) {
        const t = S.t[c]; if (!t.length) continue;
        const rs = runStart(c);
        for (let idx = rs; idx < t.length; idx++) {
          const id = t[idx];
          const under = idx > 0 ? t[idx - 1] : -1;
          const reveals = idx > 0 && !S.up[under];
          const empties = idx === 0;
          const tg = targets('t' + c, idx);
          const sitsNatural = idx > 0 && S.up[under] && follows(id, under); // already on a card one higher
          for (const d of tg.same) {
            if (idx > rs && !sitsNatural) continue;
            if (sitsNatural && suitOf(under) === suitOf(id)) continue; // already in a same-suit run
            let w = 6 + (reveals ? 5 : 0) + (empties ? 3 : 0) + (t.length - idx) * 0.1;
            out.push({ src: 't' + c, idx, dst: d, w });
          }
          if (idx === rs && !sitsNatural) {
            for (const d of tg.other) out.push({ src: 't' + c, idx, dst: d, w: (reveals ? 5 : 0) + (empties ? 3 : 0) + 1 });
            if (!empties) for (const d of tg.empty.slice(0, 1)) out.push({ src: 't' + c, idx, dst: d, w: reveals ? 2.5 : 0.5 });
          }
        }
      }
      out.sort((a, b) => b.w - a.w);
      if (S.stock.length && !S.t.some(t => !t.length)) out.push({ src: 'stock', idx: -1, dst: null, w: 0 });
      return out;
    }
    function clearHint() { root.querySelectorAll('.hint').forEach(n => n.classList.remove('hint')); }
    function hint() {
      if (won || busy) return null;
      if (!hintList) { hintList = computeHints(); hintIdx = 0; }
      clearHint();
      if (!hintList.length) { api.toast(S.stock.length ? 'No moves — fill the empty column, then deal.' : 'No moves left — try Undo or a New game.'); sfx.bad(); return null; }
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

    /* ---------- win ---------- */
    function checkWin() {
      if (won || S.f.length < 8) return;
      won = true;
      const r = rec[S.suits]; r.won++;
      const newBest = S.score > r.best; if (newBest) r.best = S.score;
      api.save('stats', rec);
      if (S.score > bestAll) { bestAll = S.score; api.save('best', bestAll); }
      layout(1); hud();
      later(() => celebrate(newBest), 700);
    }
    let fx = null;
    function clearFx() {
      if (!fx) return;
      if (fx.raf) cancelAnimationFrame(fx.raf);
      fx.canvas.remove(); if (fx.banner) fx.banner.remove();
      for (let id = 0; id < N; id++) cardEl[id].classList.remove('gone');
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
    function celebrate(newBest) {
      clearFx();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = board.clientWidth, H = board.clientHeight;
      const canvas = document.createElement('canvas'); canvas.className = 'fx';
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      board.appendChild(canvas);
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
      const imgs = {};
      const queue = []; for (let k = 12; k >= 0; k--) for (let f = 0; f < 8; f++) if (S.f[f]) queue.push({ id: S.f[f][k], f });
      fx = { canvas, raf: 0, banner: null, cur: null, t0: performance.now(), last: performance.now() };
      const finish = () => {
        if (!fx || fx.done) return; fx.done = true;
        if (fx.raf) cancelAnimationFrame(fx.raf); fx.raf = 0;
        canvas.style.opacity = '0';
        for (let id = 0; id < N; id++) cardEl[id].classList.remove('gone');
        const r = rec[S.suits];
        const b = document.createElement('div'); b.className = 'win';
        b.innerHTML = '<h3>All runs home! 🕸️</h3><p>Score <b>' + S.score + '</b> in <b>' + S.moves + '</b> moves (' + S.suits + ' suit' + (S.suits > 1 ? 's' : '') + ')' + (newBest ? '<br><b style="color:var(--gold)">New best score!</b>' : '') +
          '<br>Won ' + r.won + ' of ' + r.played + '</p><button class="btn pri small" data-r="new">Deal again</button>';
        board.appendChild(b); fx.banner = b;
        later(() => { if (fx && fx.canvas === canvas) canvas.remove(); }, 650);
      };
      canvas.addEventListener('pointerdown', finish);
      const tick = (now) => {
        if (!fx || fx.done) return;
        fx.raf = 0;
        if (document.hidden || el.offsetParent === null) { finish(); return; }
        const dt = Math.min(3, (now - fx.last) / 16.67); fx.last = now;
        if (now - fx.t0 > 7000) { finish(); return; }
        let c = fx.cur;
        if (!c || c.x < -G.cw - 4 || c.x > W + 4) {
          const n = queue.shift();
          if (!n) { finish(); return; }
          if (!imgs[n.id]) imgs[n.id] = cardImage(n.id, G.cw, G.ch, dpr);
          cardEl[n.id].classList.add('gone');
          c = fx.cur = { id: n.id, x: G.fx[n.f], y: G.top, vx: -(3 + Math.random() * 5) * (Math.random() < 0.8 ? 1 : -1), vy: -Math.random() * 7 };
        }
        for (let s = 0; s < 3; s++) {
          c.vy += 0.42 * dt / 3; c.x += c.vx * dt / 3; c.y += c.vy * dt / 3;
          if (c.y > H - G.ch) { c.y = H - G.ch; c.vy = -c.vy * 0.78; }
          ctx.drawImage(imgs[c.id], c.x, c.y, G.cw, G.ch);
        }
        fx.raf = requestAnimationFrame(tick);
      };
      tone(523, 0.12, 'triangle', 0.05); later(() => tone(659, 0.12, 'triangle', 0.05), 120); later(() => tone(784, 0.12, 'triangle', 0.05), 240); later(() => tone(1046, 0.3, 'triangle', 0.05), 360);
      fx.raf = requestAnimationFrame(tick);
    }

    /* ---------- pointer input ---------- */
    let drag = null;
    function onDown(e) {
      if (e.button !== 0 || won || busy || drag) return;
      const ce = e.target.closest('.card'), sl = e.target.closest('.slot');
      if (!ce) { if (sl && sl.dataset.pile === 'stock') { e.preventDefault(); deal(); } return; }
      const id = +ce.dataset.id, w = where(id); if (!w) return;
      e.preventDefault();
      if (w.name === 'stock') { deal(); return; }
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
      for (let c = 0; c < 10; c++) {
        const t = S.t[c], x = G.x[c], y = t.length ? pos[top(t)].y : G.tabY;
        const ox = Math.max(0, Math.min(bx + w, x + w) - Math.max(bx, x));
        const oy = Math.max(0, Math.min(by + h, y + h) - Math.max(by, y));
        let a = ox * oy;
        if (px >= x && px <= x + w && py >= y && py <= y + h) a += w * h;
        if (a > bestA && legal(d.src, d.idx, 't' + c)) { bestA = a; best = 't' + c; }
      }
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
        return;
      }
      if (!smartMove(d.src, d.idx)) shake(d.ids[0]);
    }
    function onCancel() { if (drag) { drag.ids.forEach(id => cardEl[id].classList.remove('drag')); drag = null; layout(1); } }
    function onClick(e) {
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      const r = b.dataset.r, par = b.parentNode.dataset.r;
      if (r === 'new') newGame();
      else if (r === 'undo') undo();
      else if (r === 'hint') hint();
      else if (r === 'deal') deal();
      else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); hud(); tone(600, 0.05); }
      else if (par === 'suits') { const v = +b.dataset.v; if (v !== opts.suits) { opts.suits = v; api.save('opts', opts); if (started && !won) api.toast(v + ' suit' + (v > 1 ? 's' : '') + ': new deal'); newGame(); } }
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
      else if (k === 'n') { e.preventDefault(); newGame(); }
      else if (k === 'd' || (k === ' ' && tg !== 'BUTTON')) { e.preventDefault(); deal(); }
    }
    let rsz = 0;
    function onResize() { if (rsz) return; rsz = requestAnimationFrame(() => { rsz = 0; if (document.hidden || el.offsetParent === null || drag || !S) return; layout(0); }); }

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
        clearFx();
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
        get S() { return JSON.parse(JSON.stringify(S)); },
        get won() { return won; },
        get fx() { return !!(fx && !fx.done); },
        suit: id => suitArr[id],
        newGame, legal, hint, undo, deal, doMove, smartMove, computeHints,
        load(o) { S = Object.assign({ score: 500, moves: 0, suits: opts.suits }, JSON.parse(JSON.stringify(o))); undoStack = []; won = false; busy = false; hintList = null; clearFx(); clearHint(); layout(0); hud(); },
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
