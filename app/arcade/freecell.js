/* VanMule Arcade: FreeCell. Numbered deals, DOM cards, pointer drag & drop, click-to-move, supermoves. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'freecell';
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suitOf = id => (id / 13) | 0;
  const rankOf = id => (id % 13) + 1;
  const isRed = id => { const s = suitOf(id); return s === 1 || s === 2; };
  const MAXDEAL = 1000000;

  /* Classic numbered deals (the well-known LCG deal generator; deals 1..32000 are the traditional set). */
  function dealDeck(n) {
    let seed = n >>> 0;
    const rnd = () => { seed = (seed * 214013 + 2531011) % 2147483648; return Math.floor(seed / 65536); };
    const cards = []; for (let i = 51; i >= 0; i--) cards.push(i);
    for (let i = 0; i < 52; i++) {
      const j = 51 - rnd() % (52 - i);
      const t = cards[i]; cards[i] = cards[j]; cards[j] = t;
    }
    // generator card c: rank c>>2 (0 = Ace), suit c&3 in order clubs, diamonds, hearts, spades
    const SMAP = [3, 2, 1, 0];
    return cards.map(c => SMAP[c & 3] * 13 + (c >> 2));
  }

  const CSS = `
.ag-freecell{font-family:var(--body);color:var(--fg);user-select:none;-webkit-user-select:none}
.ag-freecell .hd{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px}
.ag-freecell .ttl{flex:1;min-width:230px}
.ag-freecell h2{font-family:var(--display);font-size:26px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-freecell h2 span{color:var(--ember)}
.ag-freecell h2 small{font-family:var(--mono);font-size:14px;font-weight:600;color:var(--muted);letter-spacing:0;margin-left:8px}
.ag-freecell .how{color:var(--muted);font-size:13px;margin-top:3px}
.ag-freecell .stats{display:flex;gap:6px}
.ag-freecell .st{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:4px 12px;text-align:center;min-width:70px}
.ag-freecell .st b{display:block;font-size:10px;letter-spacing:1.3px;color:var(--muted)}
.ag-freecell .st i{font-style:normal;font-family:var(--mono);font-weight:700;font-size:18px}
.ag-freecell .st.sc i{color:var(--ember)}
.ag-freecell .bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.ag-freecell .seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px;align-items:center}
.ag-freecell .seg button{height:28px;padding:0 9px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-freecell .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-freecell .seg label{font-size:12px;color:var(--muted);padding:0 4px 0 8px}
.ag-freecell .seg input{width:82px;height:28px;border-radius:7px;border:1px solid var(--line);background:var(--bg);font-family:var(--mono);font-size:13px;padding:0 6px;outline:none}
.ag-freecell .seg input:focus{border-color:var(--ember)}
.ag-freecell .sp{flex:1}
.ag-freecell .rec{font-size:12px;color:var(--dim);font-family:var(--mono)}
.ag-freecell .board{position:relative;border-radius:16px;background:radial-gradient(ellipse at 50% 0%,#232a26 0%,#161a18 72%);border:1px solid var(--line);overflow:hidden;touch-action:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
.ag-freecell .slot{position:absolute;left:0;top:0;width:var(--cw);height:var(--ch);border-radius:calc(var(--cw)*.08);border:2px dashed rgba(255,255,255,.09);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.13);font-size:calc(var(--cw)*.34);font-family:var(--display)}
.ag-freecell .slot.cell{border-style:solid;border-color:rgba(111,211,199,.18);background:rgba(111,211,199,.03);color:rgba(111,211,199,.22);font-size:calc(var(--cw)*.16);font-family:var(--body);font-weight:700;letter-spacing:1px}
.ag-freecell .slot.fd{border-color:rgba(255,200,97,.18);color:rgba(255,200,97,.22)}
.ag-freecell .card{position:absolute;left:0;top:0;width:var(--cw);height:var(--ch);transition:transform .22s cubic-bezier(.2,.75,.3,1);will-change:transform;cursor:default}
.ag-freecell .card.mov{cursor:grab}
.ag-freecell .card.drag{transition:none!important;cursor:grabbing}
.ag-freecell .card.drag .face{box-shadow:0 14px 26px rgba(0,0,0,.5)}
.ag-freecell .card.nt{transition:none!important}
.ag-freecell .card.gone{visibility:hidden}
.ag-freecell .cin{position:absolute;inset:0;transition:transform .32s ease;transform-style:preserve-3d}
.ag-freecell .card.down .cin{transform:rotateY(180deg)}
.ag-freecell .face,.ag-freecell .back{position:absolute;inset:0;border-radius:calc(var(--cw)*.08);backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden}
.ag-freecell .face{background:linear-gradient(170deg,#fffdf9,#f3ece3);box-shadow:0 1px 2px rgba(0,0,0,.45),inset 0 0 0 1px #d8cdc1;color:#1f1b18}
.ag-freecell .card.red .face{color:#cf2f2a}
.ag-freecell .back{transform:rotateY(180deg);background:
  radial-gradient(circle at 50% 50%,rgba(255,200,97,.25) 0 14%,transparent 15%),
  repeating-linear-gradient(45deg,rgba(255,255,255,.09) 0 2px,transparent 2px 9px),
  repeating-linear-gradient(-45deg,rgba(0,0,0,.12) 0 2px,transparent 2px 9px),
  linear-gradient(160deg,#ff9b52,#e2640f 55%,#b8480a);
  box-shadow:0 1px 2px rgba(0,0,0,.45),inset 0 0 0 calc(var(--cw)*.045) #fff4ea,inset 0 0 0 calc(var(--cw)*.06) #c9530c}
.ag-freecell .back::after{content:"VM";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-weight:800;font-size:calc(var(--cw)*.2);color:#fff4ea}
.ag-freecell .cr{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:.95;font-weight:700}
.ag-freecell .cr b{font-size:calc(var(--cw)*.2);font-weight:800;letter-spacing:-1px}
.ag-freecell .cr i{font-style:normal;font-size:calc(var(--cw)*.17)}
.ag-freecell .cr.tl{left:calc(var(--cw)*.06);top:calc(var(--cw)*.05)}
.ag-freecell .cr.tr{right:calc(var(--cw)*.06);top:calc(var(--cw)*.05);flex-direction:row;gap:1px}
.ag-freecell .cr.tr b{font-size:calc(var(--cw)*.15)}
.ag-freecell .cr.tr i{font-size:calc(var(--cw)*.14)}
.ag-freecell .cr.br{right:calc(var(--cw)*.06);bottom:calc(var(--cw)*.05);transform:rotate(180deg)}
.ag-freecell .pip{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:calc(var(--cw)*.5);padding-top:calc(var(--cw)*.1)}
.ag-freecell .pip.ace{font-size:calc(var(--cw)*.66)}
.ag-freecell .fc{position:absolute;left:22%;right:22%;top:31%;bottom:16%;border-radius:calc(var(--cw)*.05);border:1.5px solid currentColor;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(160deg,rgba(255,138,61,.13),rgba(255,200,97,.18))}
.ag-freecell .fc b{font-family:var(--display);font-weight:800;font-size:calc(var(--cw)*.3);line-height:1}
.ag-freecell .fc i{font-style:normal;font-size:calc(var(--cw)*.2);line-height:1.1}
.ag-freecell .hint .face,.ag-freecell .slot.hint{box-shadow:0 0 0 3px var(--gold),0 0 18px rgba(255,200,97,.7)!important}
.ag-freecell .card.shake{animation:agfcshake .3s}
@keyframes agfcshake{25%{margin-left:-4px}75%{margin-left:4px}}
.ag-freecell .cap{position:absolute;font-size:11px;letter-spacing:1.4px;font-weight:700;color:var(--dim);text-transform:uppercase}
.ag-freecell canvas.fx{position:absolute;left:0;top:0;z-index:3000;transition:opacity .6s;cursor:pointer}
.ag-freecell .win{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);z-index:3100;background:rgba(26,22,20,.95);border:1px solid var(--line);border-radius:16px;padding:20px 28px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.6);animation:agfcwin .4s ease-out}
@keyframes agfcwin{from{opacity:0;transform:translate(-50%,-40%)}}
.ag-freecell .win h3{font-family:var(--display);font-size:28px;margin:0 0 6px;color:var(--gold)}
.ag-freecell .win p{margin:0 0 14px;color:var(--muted);font-size:14px;line-height:1.6}
.ag-freecell .win p b{color:var(--fg)}
.ag-freecell .win .row{display:flex;gap:8px;justify-content:center}
.ag-freecell details{margin-top:10px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:13px;color:var(--muted)}
.ag-freecell summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-freecell details ul{margin:6px 0 2px;padding-left:18px}
`;

  let inst = null;

  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const opts = Object.assign({ auto: true }, api.load('opts') || {});
    const rec = Object.assign({ played: 0, won: 0, bestTime: null, streak: 0, bestStreak: 0 }, api.load('stats') || {});
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
      cell: () => tone(640, 0.045, 'sine', 0.03, 560),
      found: () => tone(660, 0.08, 'triangle', 0.045, 990),
      bad: () => tone(170, 0.08, 'square', 0.02),
    };
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

    const root = document.createElement('div'); root.className = 'ag-freecell';
    root.innerHTML = `
<div class="hd"><div class="ttl"><h2>Free<span>Cell</span><small data-r="dno"></small></h2><div class="how">Move every card to the four foundations, Ace→King by suit. Build columns down in alternating colours; park single cards in the 4 free cells. Drag, or click a card to auto-move it.</div></div>
<div class="stats"><div class="st sc"><b>TIME</b><i data-r="time">0:00</i></div><div class="st"><b>MOVES</b><i data-r="moves">0</i></div><div class="st"><b>CAN MOVE</b><i data-r="cap">5</i></div></div></div>
<div class="bar">
<button class="btn pri small" data-r="new">New game</button>
<button class="btn sec small" data-r="restart" title="Replay this same deal">↺ Restart</button>
<button class="btn sec small" data-r="undo">↶ Undo</button>
<button class="btn sec small" data-r="hint">💡 Hint</button>
<div class="seg"><label>Deal #</label><input data-r="dealin" type="number" min="1" max="${MAXDEAL}" step="1"><button data-r="go">Play</button></div>
<div class="seg" data-r="auto" title="Automatically move cards to the foundations when it is safe"><button data-v="1">Auto-play</button><button data-v="0">Manual</button></div>
<span class="sp"></span><span class="rec" data-r="rec"></span>
<button class="btn sec small" data-r="snd"></button></div>
<div class="board" data-r="board"></div>
<details><summary>Tips</summary><ul>
<li>Free cells are precious: try to keep at least one open, and empty a whole column whenever you can — an empty column is worth more than a cell.</li>
<li>You can move several cards at once if there is room to shuffle them: up to (free cells + 1) × 2<sup>empty columns</sup>. The "Can move" counter shows the current limit.</li>
<li>Free the Aces and Twos early; look for the low cards buried deepest and plan to dig them out.</li>
<li>Auto-play sends a card home only when no other card could still need it. Switch to Manual if you prefer full control.</li>
<li>Every deal is numbered: type a number to replay or share a deal. Almost every deal is winnable.</li>
<li>Keys: Ctrl+Z / U undo · H hint · N new game.</li></ul></details>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const board = $('board');

    /* ---------- cards & slots ---------- */
    const cardEl = [];
    for (let id = 0; id < 52; id++) {
      const d = document.createElement('div');
      const r = rankOf(id), s = SUITS[suitOf(id)];
      d.className = 'card' + (isRed(id) ? ' red' : '');
      d.dataset.id = id;
      let mid;
      if (r === 1) mid = '<div class="pip ace">' + s + '</div>';
      else if (r > 10) mid = '<div class="fc"><b>' + RANKS[r] + '</b><i>' + s + '</i></div>';
      else mid = '<div class="pip">' + s + '</div>';
      d.innerHTML = '<div class="cin"><div class="face"><div class="cr tl"><b>' + RANKS[r] + '</b><i>' + s + '</i></div><div class="cr tr"><b>' + RANKS[r] + '</b><i>' + s + '</i></div>' + mid +
        '<div class="cr br"><b>' + RANKS[r] + '</b><i>' + s + '</i></div></div><div class="back"></div></div>';
      board.appendChild(d); cardEl.push(d);
    }
    const slots = {};
    function mkSlot(name, txt, cls) { const d = document.createElement('div'); d.className = 'slot ' + (cls || ''); d.dataset.pile = name; d.textContent = txt; board.insertBefore(d, board.firstChild); slots[name] = d; }
    for (let i = 0; i < 4; i++) mkSlot('c' + i, 'FREE', 'cell');
    for (let i = 0; i < 4; i++) mkSlot('f' + i, SUITS[i], 'fd');
    for (let i = 0; i < 8; i++) mkSlot('t' + i, '');

    /* ---------- state ---------- */
    let S; // {c:[[]x4], f:[[]x4], t:[[]x8], moves, time, deal}
    let undoStack = [], started = false, won = false, busy = false, timerId = null, hintList = null, hintIdx = 0, autoT = null;
    let G = null;
    const pos = [];

    function pile(name) {
      const i = +name.slice(1);
      if (name[0] === 'c') return S.c[i]; if (name[0] === 'f') return S.f[i]; return S.t[i];
    }
    function where(id) {
      for (const k of ['c', 'f', 't']) {
        const arr = S[k];
        for (let i = 0; i < arr.length; i++) { const j = arr[i].indexOf(id); if (j >= 0) return { name: k + i, idx: j }; }
      }
      return null;
    }
    const top = arr => (arr.length ? arr[arr.length - 1] : -1);
    function snap() { return JSON.stringify({ c: S.c, f: S.f, t: S.t, moves: S.moves }); }
    function restore(js) { Object.assign(S, JSON.parse(js)); }

    /* ---------- rules ---------- */
    function canFound(id, fi) {
      const f = S.f[fi];
      if (!f.length) return rankOf(id) === 1;
      const t = top(f); return suitOf(t) === suitOf(id) && rankOf(id) === rankOf(t) + 1;
    }
    function foundFor(id) {
      for (let i = 0; i < 4; i++) if (canFound(id, i) && (S.f[i].length || i === suitOf(id))) return i;
      for (let i = 0; i < 4; i++) if (canFound(id, i)) return i;
      return -1;
    }
    const fits = (a, b) => isRed(a) !== isRed(b) && rankOf(a) + 1 === rankOf(b); // a goes on b
    function freeCells() { let n = 0; for (const c of S.c) if (!c.length) n++; return n; }
    function emptyCols(except) { let n = 0; for (let i = 0; i < 8; i++) if (!S.t[i].length && 't' + i !== except) n++; return n; }
    function maxMove(dst) { return (freeCells() + 1) * Math.pow(2, emptyCols(dst)); }
    function isRun(p, idx) { for (let k = idx; k < p.length - 1; k++) if (!fits(p[k + 1], p[k])) return false; return true; }
    function movable(name, idx) {
      const p = pile(name);
      if (idx < 0 || idx >= p.length) return false;
      if (name[0] === 'f') return false;
      if (name[0] === 'c') return true;
      return isRun(p, idx);
    }
    // 0 ok, 1 doesn't fit, 2 too many cards
    function check(src, idx, dst) {
      if (src === dst || !movable(src, idx)) return 1;
      const p = pile(src), id = p[idx], n = p.length - idx;
      if (dst[0] === 'f') return n === 1 && canFound(id, +dst[1]) ? 0 : 1;
      if (dst[0] === 'c') return n === 1 && !pile(dst).length ? 0 : 1;
      const t = pile(dst);
      if (t.length && !fits(id, top(t))) return 1;
      return n <= maxMove(dst) ? 0 : 2;
    }
    const legal = (src, idx, dst) => check(src, idx, dst) === 0;

    /* ---------- moves ---------- */
    function begin() { if (!started) { started = true; rec.played++; rec.streak = rec.streak || 0; api.save('stats', rec); startTimer(); } }
    function stopAuto() { if (autoT) { clearTimeout(autoT); timers.delete(autoT); autoT = null; } busy = false; }
    function doMove(src, idx, dst, opt) {
      opt = opt || {};
      const why = check(src, idx, dst);
      if (why) return why === 2 ? -1 : 0;
      if (!opt.auto) { stopAuto(); begin(); undoStack.push(snap()); hintList = null; clearHint(); }
      const cards = pile(src).splice(idx);
      pile(dst).push(...cards);
      if (!opt.auto) S.moves++;
      if (dst[0] === 'f') sfx.found(); else if (dst[0] === 'c') sfx.cell(); else sfx.place();
      layout(1); hud();
      if (checkWin()) return 1;
      if (!opt.auto) scheduleAuto();
      return 1;
    }
    function undo() {
      if (won || !undoStack.length) return;
      stopAuto();
      restore(undoStack.pop()); hintList = null; clearHint();
      layout(1); hud(); tone(330, 0.04, 'sine', 0.025);
    }

    /* safe auto-play: a card goes home when no card that could still be placed on it remains out */
    function foundRank(suit) { for (let i = 0; i < 4; i++) { const f = S.f[i]; if (f.length && suitOf(f[0]) === suit) return f.length; } return 0; }
    function safeHome(id) {
      const r = rankOf(id);
      if (r <= 2) return true;
      const opp = isRed(id) ? [0, 3] : [1, 2];
      return foundRank(opp[0]) >= r - 1 && foundRank(opp[1]) >= r - 1;
    }
    function allSorted() {
      for (const t of S.t) for (let k = 0; k < t.length - 1; k++) if (rankOf(t[k]) < rankOf(t[k + 1])) return false;
      return true;
    }
    function nextAuto(force) {
      let best = null;
      const consider = name => {
        const p = pile(name); if (!p.length) return;
        const id = top(p), fi = foundFor(id);
        if (fi < 0 || !(force || safeHome(id))) return;
        if (!best || rankOf(id) < rankOf(best.id)) best = { name, idx: p.length - 1, fi, id };
      };
      for (let i = 0; i < 4; i++) consider('c' + i);
      for (let i = 0; i < 8; i++) consider('t' + i);
      return best;
    }
    function scheduleAuto() {
      if (won) return;
      const force = allSorted();
      if (!opts.auto && !force) return;
      const m = nextAuto(force);
      if (!m) { busy = false; if (started) noMovesCheck(); return; }
      busy = true;
      autoT = later(() => {
        autoT = null;
        if (doMove(m.name, m.idx, 'f' + m.fi, { auto: true }) && !won) scheduleAuto();
        else busy = false;
      }, force ? 70 : 120);
    }
    function noMovesCheck() {
      if (won) return;
      if (!computeHints().length) api.toast('No moves left — try Undo or Restart.');
    }

    // click: send a card (and the run above it) somewhere sensible
    function smartMove(name, idx) {
      const p = pile(name), id = p[idx], n = p.length - idx;
      if (!movable(name, idx)) return 0;
      if (n === 1) { const fi = foundFor(id); if (fi >= 0 && doMove(name, idx, 'f' + fi) === 1) return 1; }
      let tooMany = false;
      // a non-empty column the run fits on
      for (let i = 0; i < 8; i++) {
        const d = 't' + i; if (d === name || !S.t[i].length) continue;
        const r = check(name, idx, d); if (r === 0) return doMove(name, idx, d); if (r === 2) tooMany = true;
      }
      // empty column (not just shuffling a whole column)
      if (!(name[0] === 't' && idx === 0)) {
        for (let i = 0; i < 8; i++) { if (S.t[i].length) continue; const r = check(name, idx, 't' + i); if (r === 0) return doMove(name, idx, 't' + i); if (r === 2) tooMany = true; }
      }
      // single card to a free cell
      if (n === 1 && name[0] === 't') for (let i = 0; i < 4; i++) if (!S.c[i].length) return doMove(name, idx, 'c' + i);
      return tooMany ? -1 : 0;
    }
    function shake(id) { const d = cardEl[id]; d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); later(() => d.classList.remove('shake'), 320); sfx.bad(); }

    /* ---------- deal ---------- */
    function randomDeal() { let n; do { n = 1 + Math.floor(Math.random() * 32000); } while (n === 11982); return n; }
    function newGame(dealNo) {
      clearFx(); stopTimer(); clearHint(); stopAuto();
      timers.forEach(clearTimeout); timers.clear(); autoT = null;
      if (started && !won) { rec.streak = 0; api.save('stats', rec); }
      dealNo = dealNo || randomDeal();
      const deck = dealDeck(dealNo);
      S = { c: [[], [], [], []], f: [[], [], [], []], t: [[], [], [], [], [], [], [], []], moves: 0, time: 0, deal: dealNo };
      deck.forEach((id, k) => S.t[k % 8].push(id));
      undoStack = []; started = false; won = false; busy = false; hintList = null;
      $('dealin').value = dealNo;
      opts.last = dealNo; api.save('opts', opts);
      geom();
      const cx = Math.round(G.W / 2 - G.cw / 2);
      for (let id = 0; id < 52; id++) { const d = cardEl[id]; d.classList.add('nt', 'down'); d.classList.remove('gone', 'hint', 'shake'); d.style.transform = 'translate(' + cx + 'px,' + (-G.ch - 10) + 'px)'; d.style.zIndex = 10 + id; pos[id] = null; }
      void board.offsetWidth;
      deck.forEach((id, i) => { const ms = i * 18; const d = cardEl[id]; d.classList.remove('nt'); d.style.transitionDelay = ms + 'ms'; d.firstChild.style.transitionDelay = (ms + 120) + 'ms'; d.classList.remove('down'); });
      layout(1, true);
      later(() => { for (const id of deck) { cardEl[id].style.transitionDelay = ''; cardEl[id].firstChild.style.transitionDelay = ''; } }, 52 * 18 + 500);
      hud();
    }

    /* ---------- layout ---------- */
    function geom() {
      const W = Math.max(560, board.clientWidth || root.clientWidth || 900);
      const g = Math.round(Math.max(7, Math.min(16, W * 0.014)));
      const rt = board.getBoundingClientRect();
      const avail = Math.max(440, window.innerHeight - Math.max(0, rt.top) - 24);
      let cw = Math.floor(Math.min(100, (W - 9 * g - 14) / 8));
      const chMax = (avail - g * 2.5) / 3.4; if (cw * 1.4 > chMax) cw = Math.floor(Math.max(56, chMax / 1.4));
      const ch = Math.round(cw * 1.4);
      const span = 8 * cw + 7 * g;
      const x0 = Math.round((W - span) / 2);
      const x = []; for (let i = 0; i < 8; i++) x.push(x0 + i * (cw + g));
      const split = 14; // extra gap between cells and foundations
      const tx = x.map((v, i) => v + (i < 4 ? -split / 2 : split / 2));
      G = { W, g, cw, ch, x, tx, top: g + 16, tabY: g + 16 + ch + Math.round(g * 1.6), avail };
      board.style.setProperty('--cw', cw + 'px'); board.style.setProperty('--ch', ch + 'px');
    }
    function fanFor(i) {
      const n = S.t[i].length; let off = Math.round(G.ch * 0.26);
      const room = G.avail - G.tabY - G.ch - 10;
      if (n > 1 && (n - 1) * off > room) off = Math.max(Math.round(G.ch * 0.12), Math.floor(room / (n - 1)));
      return off;
    }
    let flyT = null, caps = null;
    function layout(anim, keepDelays) {
      geom();
      if (!caps) {
        caps = [document.createElement('div'), document.createElement('div')];
        caps[0].className = 'cap'; caps[0].textContent = 'Free cells'; caps[1].className = 'cap'; caps[1].textContent = 'Foundations';
        board.insertBefore(caps[1], board.firstChild); board.insertBefore(caps[0], board.firstChild);
      }
      caps[0].style.left = G.tx[0] + 'px'; caps[0].style.top = (G.top - 16) + 'px';
      caps[1].style.left = G.tx[4] + 'px'; caps[1].style.top = (G.top - 16) + 'px';
      const P = [];
      const set = (id, x, y, z) => { P[id] = { x, y, z }; };
      for (let i = 0; i < 4; i++) S.c[i].forEach(id => set(id, G.tx[i], G.top, 100));
      for (let f = 0; f < 4; f++) S.f[f].forEach((id, k) => set(id, G.tx[4 + f], G.top, 200 + k));
      let maxY = G.tabY + G.ch * 2;
      for (let c = 0; c < 8; c++) {
        const off = fanFor(c); let y = G.tabY;
        S.t[c].forEach((id, k) => { set(id, G.x[c], y, 300 + k); y += off; });
        if (S.t[c].length) maxY = Math.max(maxY, P[top(S.t[c])].y + G.ch);
      }
      board.style.height = Math.max(G.avail, maxY + G.g) + 'px';
      const sp = (n, x, y) => { slots[n].style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
      for (let i = 0; i < 4; i++) { sp('c' + i, G.tx[i], G.top); sp('f' + i, G.tx[4 + i], G.top); }
      for (let c = 0; c < 8; c++) sp('t' + c, G.x[c], G.tabY);
      let moving = false;
      for (let id = 0; id < 52; id++) {
        const d = cardEl[id], p = P[id], o = pos[id];
        const changed = !o || o.x !== p.x || o.y !== p.y;
        d.classList.toggle('mov', !!S && !won);
        if (!anim) d.classList.add('nt');
        d.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
        if (anim && changed) { d.style.zIndex = 1000 + p.z; moving = true; } else d.style.zIndex = p.z;
        pos[id] = p;
        if (!keepDelays) d.style.transitionDelay = '';
      }
      if (!anim) { void board.offsetWidth; for (let id = 0; id < 52; id++) cardEl[id].classList.remove('nt'); }
      if (moving) {
        if (flyT) { clearTimeout(flyT); timers.delete(flyT); }
        flyT = later(() => { flyT = null; for (let id = 0; id < 52; id++) if (!cardEl[id].classList.contains('drag')) cardEl[id].style.zIndex = pos[id].z; }, keepDelays ? 1500 : 260);
      }
    }

    /* ---------- hud / timer ---------- */
    const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    function hud() {
      $('time').textContent = fmt(S.time); $('moves').textContent = S.moves;
      $('cap').textContent = Math.min(13, maxMove(null));
      $('dno').textContent = '#' + S.deal;
      $('undo').disabled = !undoStack.length || won;
      $('hint').disabled = won;
      root.querySelectorAll('[data-r="auto"] button').forEach(b => b.classList.toggle('on', (b.dataset.v === '1') === !!opts.auto));
      $('snd').textContent = soundOn ? '🔊' : '🔇';
      $('rec').textContent = 'Won ' + rec.won + '/' + rec.played + (rec.bestTime != null ? ' · Best ' + fmt(rec.bestTime) : '') + (rec.streak > 1 ? ' · Streak ' + rec.streak : '');
    }
    function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
    function startTimer() {
      stopTimer();
      timerId = setInterval(() => {
        if (document.hidden || el.offsetParent === null || won) return;
        S.time++; $('time').textContent = fmt(S.time);
      }, 1000);
    }

    /* ---------- hints ---------- */
    function computeHints() {
      const out = [];
      const add = (src, idx, dst) => out.push({ src, idx, dst });
      // to foundations
      for (const n of ['c0', 'c1', 'c2', 'c3', 't0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']) {
        const p = pile(n); if (!p.length) continue; const fi = foundFor(p[p.length - 1]); if (fi >= 0) add(n, p.length - 1, 'f' + fi);
      }
      // column runs onto non-empty columns (prefer moves that empty a column or uncover something)
      const tt = [];
      for (let c = 0; c < 8; c++) {
        const t = S.t[c]; if (!t.length) continue;
        for (let idx = 0; idx < t.length; idx++) {
          if (!isRun(t, idx)) continue;
          if (idx > 0 && fits(t[idx], t[idx - 1])) continue; // splitting a run sideways achieves nothing
          for (let d = 0; d < 8; d++) {
            if (d === c || !S.t[d].length) continue;
            if (legal('t' + c, idx, 't' + d)) tt.push({ src: 't' + c, idx, dst: 't' + d, w: idx === 0 ? 3 : (t.length - idx) });
          }
        }
      }
      tt.sort((a, b) => b.w - a.w).forEach(m => out.push(m));
      // free cells back onto columns
      for (let i = 0; i < 4; i++) {
        if (!S.c[i].length) continue;
        for (let d = 0; d < 8; d++) if (S.t[d].length && legal('c' + i, 0, 't' + d)) { add('c' + i, 0, 't' + d); break; }
      }
      // into empty columns
      const e = S.t.findIndex(t => !t.length);
      if (e >= 0) {
        for (let i = 0; i < 4; i++) if (S.c[i].length) { add('c' + i, 0, 't' + e); break; }
        for (let c = 0; c < 8; c++) {
          const t = S.t[c]; if (!t.length) continue;
          let idx = t.length - 1; while (idx > 0 && isRun(t, idx - 1)) idx--;
          while (idx < t.length && !legal('t' + c, idx, 't' + e)) idx++;
          if (idx > 0 && idx < t.length) add('t' + c, idx, 't' + e);
        }
      }
      // to a free cell
      const fc = S.c.findIndex(c => !c.length);
      if (fc >= 0) for (let c = 0; c < 8; c++) if (S.t[c].length > 1) { add('t' + c, S.t[c].length - 1, 'c' + fc); }
      return out;
    }
    function clearHint() { root.querySelectorAll('.hint').forEach(n => n.classList.remove('hint')); }
    function hint() {
      if (won) return;
      if (!hintList) { hintList = computeHints(); hintIdx = 0; }
      clearHint();
      if (!hintList.length) { api.toast('No moves left — try Undo or Restart.'); sfx.bad(); return null; }
      const h = hintList[hintIdx % hintList.length]; hintIdx++;
      pile(h.src).slice(h.idx).forEach(id => cardEl[id].classList.add('hint'));
      const dp = pile(h.dst); (dp.length ? cardEl[top(dp)] : slots[h.dst]).classList.add('hint');
      tone(880, 0.06, 'sine', 0.03);
      later(clearHint, 1700);
      return h;
    }

    /* ---------- win ---------- */
    function checkWin() {
      if (won || !S.f.every(f => f.length === 13)) return false;
      won = true; busy = false; stopTimer(); stopAuto();
      rec.won++; rec.streak = (rec.streak || 0) + 1; rec.bestStreak = Math.max(rec.bestStreak || 0, rec.streak);
      const newBest = rec.bestTime == null || S.time < rec.bestTime;
      if (newBest) { rec.bestTime = S.time; api.save('best', fmt(S.time)); }
      api.save('stats', rec);
      hud();
      later(() => celebrate(newBest), 420);
      return true;
    }

    let fx = null;
    function clearFx() {
      if (!fx) return;
      if (fx.raf) cancelAnimationFrame(fx.raf);
      fx.canvas.remove(); if (fx.banner) fx.banner.remove();
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
    function celebrate(newBest) {
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
        b.innerHTML = '<h3>Solved! 🎉</h3><p>Deal <b>#' + S.deal + '</b> in <b>' + fmt(S.time) + '</b> · <b>' + S.moves + '</b> moves' + (newBest ? '<br><b style="color:var(--gold)">New best time!</b>' : '') +
          '<br>Won ' + rec.won + ' of ' + rec.played + (rec.streak > 1 ? ' · streak ' + rec.streak : '') + '</p><div class="row"><button class="btn pri small" data-r="new">Next deal</button><button class="btn sec small" data-r="restart">Replay #' + S.deal + '</button></div>';
        board.appendChild(b); fx.banner = b;
        later(() => { if (fx && fx.canvas === canvas) canvas.remove(); }, 650);
      };
      canvas.addEventListener('pointerdown', finish);
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
          const dir = n.f < 2 ? -1 : 1;
          c = fx.cur = { id: n.id, x: G.tx[4 + n.f], y: G.top, vx: dir * (2.5 + Math.random() * 4.5), vy: -Math.random() * 7 };
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
    let drag = null;
    function tooMany(n, dst) { api.toast('Not enough free space to move ' + n + ' cards (limit ' + maxMove(dst) + ').'); }
    function onDown(e) {
      if (e.button !== 0 || won || drag) return;
      const ce = e.target.closest('.card');
      if (!ce) return;
      const id = +ce.dataset.id, w = where(id); if (!w) return;
      e.preventDefault();
      if (!movable(w.name, w.idx)) { if (w.name[0] !== 'f') shake(id); return; }
      if (busy) stopAuto();
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
      let best = null, bestA = 0, blocked = null, blockedA = 0;
      const consider = (name, x, y) => {
        const ox = Math.max(0, Math.min(bx + w, x + w) - Math.max(bx, x));
        const oy = Math.max(0, Math.min(by + h, y + h) - Math.max(by, y));
        let a = ox * oy;
        if (px >= x && px <= x + w && py >= y && py <= y + h) a += w * h;
        if (a <= 0) return;
        const r = check(d.src, d.idx, name);
        if (r === 0 && a > bestA) { bestA = a; best = name; }
        if (r === 2 && a > blockedA) { blockedA = a; blocked = name; }
      };
      for (let c = 0; c < 8; c++) { const t = S.t[c]; consider('t' + c, G.x[c], t.length ? pos[top(t)].y : G.tabY); }
      for (let i = 0; i < 4; i++) { consider('c' + i, G.tx[i], G.top); consider('f' + i, G.tx[4 + i], G.top); }
      return { best, blocked: blockedA > bestA ? blocked : null };
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const d = drag; drag = null;
      d.ids.forEach(id => cardEl[id].classList.remove('drag'));
      if (d.moved) {
        d.lastX = e.clientX; d.lastY = e.clientY;
        const tg = dropTarget(d);
        if (tg.blocked) { tooMany(d.ids.length, tg.blocked); layout(1); sfx.bad(); scheduleAuto(); return; }
        if (!tg.best || doMove(d.src, d.idx, tg.best) !== 1) { layout(1); if (Math.hypot(d.dx, d.dy) > 30) sfx.bad(); scheduleAuto(); }
        return;
      }
      const r = smartMove(d.src, d.idx);
      if (r === -1) { tooMany(d.ids.length, null); shake(d.ids[0]); }
      else if (!r) shake(d.ids[0]);
      if (r !== 1) scheduleAuto();
    }
    function onCancel() { if (drag) { drag.ids.forEach(id => cardEl[id].classList.remove('drag')); drag = null; layout(1); } }
    function playDeal() {
      const v = Math.floor(+$('dealin').value);
      if (!(v >= 1 && v <= MAXDEAL)) { api.toast('Pick a deal number from 1 to ' + MAXDEAL.toLocaleString()); return; }
      newGame(v);
    }
    function onClick(e) {
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      const r = b.dataset.r, par = b.parentNode.dataset.r;
      if (r === 'new') newGame();
      else if (r === 'restart') newGame(S.deal);
      else if (r === 'undo') undo();
      else if (r === 'hint') hint();
      else if (r === 'go') playDeal();
      else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); hud(); tone(600, 0.05); }
      else if (par === 'auto') { opts.auto = b.dataset.v === '1'; api.save('opts', opts); hud(); if (opts.auto) scheduleAuto(); }
    }
    function onInputKey(e) { if (e.key === 'Enter') { e.preventDefault(); playDeal(); $('dealin').blur(); } }
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
    $('dealin').addEventListener('keydown', onInputKey);
    newGame();

    return {
      destroy() {
        clearFx(); stopTimer(); stopAuto();
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
        get G() { return G; },
        get won() { return won; },
        get busy() { return busy; },
        get fx() { return !!(fx && !fx.done); },
        newGame, legal, check, hint, undo, doMove, smartMove, maxMove, computeHints, dealDeck,
        load(o) { stopAuto(); S = Object.assign({ moves: 0, time: 0, deal: 1 }, JSON.parse(JSON.stringify(o))); undoStack = []; won = false; hintList = null; clearFx(); clearHint(); layout(0); hud(); },
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
