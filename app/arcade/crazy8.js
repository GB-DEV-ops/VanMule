/* VanMule Arcade: Crazy Eights - shedding card game vs 1-3 computer players, scoring to 100.
   DOM cards with CSS transitions; no loops (turn-based). */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'crazy8';
  const SUITS = ['♠', '♥', '♦', '♣'];
  const SUIT_NAMES = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suitOf = id => (id / 13) | 0;
  const rankOf = id => (id % 13) + 1;
  const isRed = id => { const s = suitOf(id); return s === 1 || s === 2; };
  const cardPts = id => { const r = rankOf(id); return r === 8 ? 50 : r >= 11 ? 10 : r === 1 ? 1 : r; };
  const TARGET = 100;
  const BOTS = [
    { name: 'Mo', av: '🫏', col: '#6fd3c7' },
    { name: 'Clem', av: '🦊', col: '#ffc861' },
    { name: 'Rusty', av: '🦉', col: '#c9a7ff' },
  ];

  const CSS = `
.ag-crazy8{font-family:var(--body);color:var(--fg);user-select:none;-webkit-user-select:none;max-width:1100px;margin:0 auto}
.ag-crazy8 .hd{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px}
.ag-crazy8 .ttl{flex:1;min-width:240px}
.ag-crazy8 h2{font-family:var(--display);font-size:26px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-crazy8 h2 span{color:var(--ember)}
.ag-crazy8 .how{color:var(--muted);font-size:13px;margin-top:3px}
.ag-crazy8 .scores{display:flex;gap:6px;flex-wrap:wrap}
.ag-crazy8 .st{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:4px 12px;text-align:center;min-width:66px;position:relative;overflow:hidden}
.ag-crazy8 .st b{display:block;font-size:10px;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;white-space:nowrap}
.ag-crazy8 .st i{font-style:normal;font-family:var(--display);font-weight:700;font-size:18px}
.ag-crazy8 .st .meter{position:absolute;left:0;bottom:0;height:3px;background:var(--c,var(--ember));transition:width .6s}
.ag-crazy8 .st.tg{background:transparent;border-style:dashed}
.ag-crazy8 .st.tg i{color:var(--dim)}
.ag-crazy8 .bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.ag-crazy8 .seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px}
.ag-crazy8 .seg button{height:28px;padding:0 9px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-crazy8 .seg button:hover{color:var(--fg)}
.ag-crazy8 .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-crazy8 .lbl{font-size:12px;color:var(--dim)}
.ag-crazy8 .sp{flex:1}
.ag-crazy8 .rec{font-size:12px;color:var(--dim);font-family:var(--mono)}
.ag-crazy8 .board{position:relative;border-radius:16px;background:radial-gradient(ellipse at 50% 45%,#2c2019 0%,#1b1512 62%,#141010 100%);border:1px solid var(--line);overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
.ag-crazy8 .board::before{content:"";position:absolute;left:50%;top:var(--py);width:calc(var(--cw)*4.4);height:calc(var(--cw)*2.6);transform:translate(-50%,-50%);border-radius:50%;border:1px solid rgba(255,138,61,.09);background:radial-gradient(ellipse,rgba(255,138,61,.07),transparent 70%)}
.ag-crazy8 .card{position:absolute;left:0;top:0;width:var(--cw);height:var(--ch);perspective:900px;transition:transform .42s cubic-bezier(.2,.75,.3,1),top .15s;will-change:transform}
.ag-crazy8 .card.nt{transition:none!important}
.ag-crazy8 .card.mine{cursor:default}
.ag-crazy8 .card.ok{cursor:pointer}
.ag-crazy8 .card.ok .face{box-shadow:0 0 0 2px var(--gold),0 0 14px rgba(255,200,97,.45),0 3px 8px rgba(0,0,0,.4)}
.ag-crazy8 .card.ok:hover,.ag-crazy8 .card.ok.cur{top:-18px}
.ag-crazy8 .card.cur .face{outline:3px solid #fff;outline-offset:2px}
.ag-crazy8 .card.dim .face{filter:brightness(.72) saturate(.8)}
.ag-crazy8 .cin{position:absolute;inset:0;transition:transform .4s ease;transform-style:preserve-3d}
.ag-crazy8 .card.down .cin{transform:rotateY(180deg)}
.ag-crazy8 .face,.ag-crazy8 .back{position:absolute;inset:0;border-radius:calc(var(--cw)*.08);backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden}
.ag-crazy8 .face{background:linear-gradient(170deg,#fffdf9,#f3ece3);box-shadow:0 1px 3px rgba(0,0,0,.5),inset 0 0 0 1px #d8cdc1;color:#1f1b18}
.ag-crazy8 .card.red .face{color:#cf2f2a}
.ag-crazy8 .back{transform:rotateY(180deg);background:
  radial-gradient(circle at 50% 50%,rgba(255,200,97,.25) 0 14%,transparent 15%),
  repeating-linear-gradient(45deg,rgba(255,255,255,.09) 0 2px,transparent 2px 9px),
  repeating-linear-gradient(-45deg,rgba(0,0,0,.12) 0 2px,transparent 2px 9px),
  linear-gradient(160deg,#ff9b52,#e2640f 55%,#b8480a);
  box-shadow:0 1px 3px rgba(0,0,0,.5),inset 0 0 0 calc(var(--cw)*.045) #fff4ea,inset 0 0 0 calc(var(--cw)*.06) #c9530c}
.ag-crazy8 .back::after{content:"VM";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-weight:800;font-size:calc(var(--cw)*.2);color:#fff4ea;text-shadow:0 1px 0 rgba(0,0,0,.25);letter-spacing:-.5px}
.ag-crazy8 .cr{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:.95;font-weight:700}
.ag-crazy8 .cr b{font-family:var(--body);font-size:calc(var(--cw)*.2);font-weight:800;letter-spacing:-1px}
.ag-crazy8 .cr i{font-style:normal;font-size:calc(var(--cw)*.17)}
.ag-crazy8 .cr.tl{left:calc(var(--cw)*.06);top:calc(var(--cw)*.05)}
.ag-crazy8 .cr.br{right:calc(var(--cw)*.06);bottom:calc(var(--cw)*.05);transform:rotate(180deg)}
.ag-crazy8 .pip{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:calc(var(--cw)*.5);padding-top:calc(var(--cw)*.06)}
.ag-crazy8 .pip.ace{font-size:calc(var(--cw)*.66)}
.ag-crazy8 .eight{position:absolute;inset:18% 16%;border-radius:calc(var(--cw)*.06);display:flex;align-items:center;justify-content:center;background:conic-gradient(from 45deg,rgba(31,27,24,.12) 0 25%,rgba(207,47,42,.14) 0 50%,rgba(31,27,24,.12) 0 75%,rgba(207,47,42,.14) 0);border:1.5px solid currentColor}
.ag-crazy8 .eight b{font-family:var(--display);font-weight:800;font-size:calc(var(--cw)*.42);line-height:1}
.ag-crazy8 .eight i{position:absolute;font-style:normal;font-size:calc(var(--cw)*.15);bottom:4%}
.ag-crazy8 .fc{position:absolute;left:22%;right:22%;top:20%;bottom:20%;border-radius:calc(var(--cw)*.05);border:1.5px solid currentColor;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(160deg,rgba(255,138,61,.13),rgba(255,200,97,.18));opacity:.95}
.ag-crazy8 .fc b{font-family:var(--display);font-weight:800;font-size:calc(var(--cw)*.3);line-height:1}
.ag-crazy8 .fc i{font-style:normal;font-size:calc(var(--cw)*.2);line-height:1.1}
.ag-crazy8 .slot{position:absolute;left:0;top:0;width:var(--cw);height:var(--ch);border-radius:calc(var(--cw)*.08);border:2px dashed rgba(255,255,255,.09);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.14);font-size:calc(var(--cw)*.3)}
.ag-crazy8 .slot.stock{cursor:pointer}
.ag-crazy8 .slot.must{border-color:var(--gold);box-shadow:0 0 18px rgba(255,200,97,.55);animation:agc8p .7s ease-in-out infinite alternate;z-index:900}
.ag-crazy8 .slot.cur{outline:3px solid #fff;outline-offset:3px}
@keyframes agc8p{from{opacity:.55}to{opacity:1}}
.ag-crazy8 .cnt{position:absolute;left:0;top:0;transform:translate(-50%,0);font:600 11px/1 var(--mono);color:var(--muted);white-space:nowrap;pointer-events:none}
.ag-crazy8 .suitb{position:absolute;left:0;top:0;transform:translate(-50%,0);display:flex;align-items:center;gap:6px;padding:3px 10px 3px 6px;border-radius:999px;background:rgba(0,0,0,.35);border:1px solid var(--line);font-size:12px;color:var(--muted);white-space:nowrap;transition:box-shadow .3s}
.ag-crazy8 .suitb i{font-style:normal;font-size:20px;line-height:1;width:26px;height:26px;border-radius:50%;background:#fbf7f2;display:flex;align-items:center;justify-content:center;color:#1f1b18}
.ag-crazy8 .suitb.red i{color:#cf2f2a}
.ag-crazy8 .suitb.wild{border-color:var(--gold);color:var(--gold);box-shadow:0 0 16px rgba(255,200,97,.35)}
.ag-crazy8 .suitb.pop i{animation:agc8pop .5s ease-out}
@keyframes agc8pop{0%{transform:scale(1.9) rotate(-30deg)}100%{transform:scale(1)}}
.ag-crazy8 .tag{position:absolute;left:0;top:0;display:flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;border-radius:999px;background:rgba(20,16,14,.82);border:1px solid var(--line);font-size:12.5px;white-space:nowrap;transition:box-shadow .3s,border-color .3s;z-index:950;pointer-events:none}
.ag-crazy8 .tag .av{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;background:var(--panel2);box-shadow:inset 0 0 0 2px var(--c)}
.ag-crazy8 .tag b{font-weight:700}
.ag-crazy8 .tag em{font-style:normal;color:var(--muted);font-family:var(--mono);font-size:11.5px}
.ag-crazy8 .tag.turn{border-color:var(--c);box-shadow:0 0 0 1px var(--c),0 0 18px color-mix(in srgb,var(--c) 45%,transparent)}
.ag-crazy8 .tag .bub{position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);background:var(--gold);color:#1b0d03;font-weight:800;font-size:11.5px;padding:3px 8px;border-radius:8px;opacity:0;transition:opacity .25s;white-space:nowrap}
.ag-crazy8 .tag .bub.show{opacity:1}
.ag-crazy8 .tag.below .bub{bottom:auto;top:calc(100% + 6px)}
.ag-crazy8 .status{position:absolute;left:50%;top:0;transform:translate(-50%,0);font-weight:700;font-size:15px;text-align:center;white-space:nowrap;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.ag-crazy8 .status.you{color:var(--ember)}
.ag-crazy8 .status small{display:block;font-weight:500;font-size:12px;color:var(--muted)}
.ag-crazy8 .acts{position:absolute;left:0;top:0;display:flex;gap:8px;z-index:960}
.ag-crazy8 .pick{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,8,7,.55);z-index:3000;animation:agc8in .2s ease-out}
.ag-crazy8 .pick .box,.ag-crazy8 .over .box{background:rgba(26,22,20,.97);border:1px solid var(--line);border-radius:16px;padding:16px 22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.6)}
.ag-crazy8 .pick h3,.ag-crazy8 .over h3{font-family:var(--display);font-size:20px;margin:0 0 4px}
.ag-crazy8 .pick p{margin:0 0 12px;color:var(--muted);font-size:13px}
.ag-crazy8 .pick .ss{display:flex;gap:10px;justify-content:center}
.ag-crazy8 .pick .ss button{width:82px;height:96px;border-radius:12px;background:linear-gradient(170deg,#fffdf9,#f3ece3);color:#1f1b18;font-size:40px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;box-shadow:0 3px 10px rgba(0,0,0,.4);transition:transform .12s}
.ag-crazy8 .pick .ss button small{font-size:11px;color:#6f655c;font-weight:600}
.ag-crazy8 .pick .ss button.red{color:#cf2f2a}
.ag-crazy8 .pick .ss button:hover,.ag-crazy8 .pick .ss button.cur{transform:translateY(-5px);box-shadow:0 0 0 3px var(--gold),0 8px 18px rgba(0,0,0,.5)}
@keyframes agc8in{from{opacity:0}}
.ag-crazy8 .over{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,8,7,.6);z-index:3000;animation:agc8in .3s ease-out}
.ag-crazy8 .over .box{min-width:320px;max-width:92%}
.ag-crazy8 .over h3.win{color:var(--gold)}
.ag-crazy8 .over .sub{color:var(--muted);font-size:13px;margin-bottom:12px}
.ag-crazy8 .over table{border-collapse:collapse;margin:0 auto 14px;font-size:13.5px}
.ag-crazy8 .over td,.ag-crazy8 .over th{padding:4px 10px;text-align:right}
.ag-crazy8 .over th{font-size:10px;letter-spacing:1.2px;color:var(--dim);font-weight:600;text-transform:uppercase}
.ag-crazy8 .over td:first-child,.ag-crazy8 .over th:first-child{text-align:left}
.ag-crazy8 .over td{font-family:var(--mono)}
.ag-crazy8 .over td:first-child{font-family:var(--body);font-weight:600}
.ag-crazy8 .over tr.w td{color:var(--gold)}
.ag-crazy8 .over .bars{display:inline-block;width:90px;height:6px;border-radius:3px;background:var(--panel2);vertical-align:middle;overflow:hidden}
.ag-crazy8 .over .bars span{display:block;height:100%;background:var(--c)}
.ag-crazy8 details{margin-top:10px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:13px;color:var(--muted)}
.ag-crazy8 summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-crazy8 details ul{margin:6px 0 2px;padding-left:18px}
.ag-crazy8 details li{margin:3px 0}
.ag-crazy8 kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
`;

  let inst = null;

  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const opts = Object.assign({ opp: 2, draw: 'until' }, api.load('opts') || {});
    if (![1, 2, 3].includes(opts.opp)) opts.opp = 2;
    if (opts.draw !== 'one') opts.draw = 'until';
    const rec = Object.assign({ matches: 0, won: 0, rounds: 0, roundsWon: 0, bestRounds: null }, api.load('stats') || {});
    let soundOn = api.load('sound'); if (soundOn === null) soundOn = !!api.sound;
    let actx = null;
    function tone(f, d, type, vol, f2, at) {
      if (!soundOn) return;
      try {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        const t = actx.currentTime + (at || 0), o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(vol || 0.04, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
      } catch (e) { /* ignore */ }
    }
    const sfx = {
      deal: () => tone(900, 0.025, 'sine', 0.015),
      play: () => { tone(260, 0.06, 'triangle', 0.05, 180); tone(1400, 0.02, 'sine', 0.012); },
      draw: () => tone(520, 0.05, 'sine', 0.025, 700),
      eight: () => { [660, 880, 1175].forEach((f, i) => tone(f, 0.1, 'triangle', 0.04, 0, i * 0.06)); },
      turn: () => tone(740, 0.08, 'sine', 0.03),
      bad: () => tone(170, 0.08, 'square', 0.02),
      shuffle: () => { for (let i = 0; i < 6; i++) tone(600 + i * 40, 0.02, 'sine', 0.012, 0, i * 0.03); },
      win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.05, 0, i * 0.11)); },
      lose: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.18, 'triangle', 0.045, 0, i * 0.13)); },
      last: () => { tone(988, 0.08, 'square', 0.02); tone(1318, 0.1, 'square', 0.02, 0, 0.08); },
    };
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const visible = () => !document.hidden && el.offsetParent !== null;
    // game steps that must wait while the game is hidden
    function step(fn, ms) { later(function run() { if (!visible()) { later(run, 600); return; } fn(); }, ms); }

    const root = document.createElement('div'); root.className = 'ag-crazy8';
    root.innerHTML = `
<div class="hd"><div class="ttl"><h2>Crazy <span>Eights</span></h2><div class="how">Match the top card by suit or rank. Eights are wild: play one any time and name the next suit. Empty your hand first to score the cards left in everyone else's.</div></div>
<div class="scores" data-r="scores"></div></div>
<div class="bar">
<button class="btn pri small" data-r="new">New match</button>
<span class="lbl">Opponents</span><div class="seg" data-r="opp"><button data-v="1">1</button><button data-v="2">2</button><button data-v="3">3</button></div>
<span class="lbl">Draw</span><div class="seg" data-r="draw" title="What happens when you can't play"><button data-v="until">Until playable</button><button data-v="one">One card</button></div>
<span class="sp"></span><span class="rec" data-r="rec"></span>
<button class="btn sec small" data-r="snd" title="Toggle sound"></button></div>
<div class="board" data-r="board"></div>
<details><summary>Tips &amp; rules</summary><ul>
<li>On your turn play one card that matches the suit or the rank of the top card. Playable cards glow gold.</li>
<li>An 8 can be played on anything; you then choose the suit the next player must follow.</li>
<li>No playable card? Click the deck to draw: either until you can play, or a single card and then you pass (see the Draw option).</li>
<li>When someone goes out they score the cards left in the other hands: 8 = 50, K/Q/J = 10, Ace = 1, others face value. First to ${TARGET} wins the match.</li>
<li>Strategy: hold your 8s for when you're stuck, dump high cards early, and switch to the suit you hold the most of.</li>
<li>Keys: <kbd>←</kbd><kbd>→</kbd> pick a card · <kbd>Space</kbd>/<kbd>Enter</kbd> play · <kbd>D</kbd> draw.</li></ul></details>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const board = $('board');

    /* ---------- card elements ---------- */
    const cardEl = [];
    for (let id = 0; id < 52; id++) {
      const d = document.createElement('div');
      const r = rankOf(id), s = SUITS[suitOf(id)];
      d.className = 'card down' + (isRed(id) ? ' red' : '');
      d.dataset.id = id;
      let mid;
      if (r === 1) mid = '<div class="pip ace">' + s + '</div>';
      else if (r === 8) mid = '<div class="eight"><b>8</b><i>' + s + '</i></div>';
      else if (r > 10) mid = '<div class="fc"><b>' + RANKS[r] + '</b><i>' + s + '</i></div>';
      else mid = '<div class="pip">' + s + '</div>';
      d.innerHTML = '<div class="cin"><div class="face"><div class="cr tl"><b>' + RANKS[r] + '</b><i>' + s + '</i></div>' + mid +
        '<div class="cr br"><b>' + RANKS[r] + '</b><i>' + s + '</i></div></div><div class="back"></div></div>';
      board.appendChild(d); cardEl.push(d);
    }
    const mk = (cls, html) => { const d = document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; board.appendChild(d); return d; };
    const stockSlot = mk('slot stock', '↻'); stockSlot.dataset.pile = 'stock';
    const discSlot = mk('slot');
    const stockCnt = mk('cnt');
    const suitB = mk('suitb', '<i></i><span></span>');
    const status = mk('status');
    const acts = mk('acts', '<button class="btn sec small" data-r="pass" hidden>Pass</button>');
    let tags = [];

    /* ---------- state ---------- */
    let S = null;       // round state
    let M = null;       // match state {names, scores, round, first}
    let busy = false, cursor = -1, overEl = null, pickEl = null, pickCur = 0, G = null;
    const pos = [];

    function players() { return 1 + opts.opp; }
    function seats(n) { return n === 1 ? ['top'] : n === 2 ? ['left', 'right'] : ['left', 'top', 'right']; }
    function shuffled() { const a = []; for (let i = 0; i < 52; i++) a.push(i); for (let i = 51; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    const top = () => S.discard[S.discard.length - 1];
    function canPlay(id) { return rankOf(id) === 8 || suitOf(id) === S.suit || rankOf(id) === S.rank; }
    function playable(p) { return S.hands[p].filter(canPlay); }
    function sortHand(h) { h.sort((a, b) => { const ea = rankOf(a) === 8, eb = rankOf(b) === 8; if (ea !== eb) return ea ? 1 : -1; const sa = [0, 1, 3, 2][suitOf(a)], sb = [0, 1, 3, 2][suitOf(b)]; return sa - sb || rankOf(a) - rankOf(b); }); }
    const handValue = h => h.reduce((s, id) => s + cardPts(id), 0);

    /* ---------- match / round ---------- */
    function newMatch() {
      cancelAll();
      const n = players();
      M = { n, names: ['You'].concat(BOTS.slice(0, n - 1).map(b => b.name)), scores: Array(n).fill(0), round: 0, first: 0, over: false };
      buildTags();
      newRound();
    }
    function cancelAll() { timers.forEach(clearTimeout); timers.clear(); busy = false; closeOver(); closePick(); }
    function buildTags() {
      tags.forEach(t => t.remove()); tags = [];
      for (let p = 0; p < M.n; p++) {
        const c = p === 0 ? '#ff8a3d' : BOTS[p - 1].col, av = p === 0 ? '🙂' : BOTS[p - 1].av;
        const t = mk('tag', '<span class="av">' + av + '</span><b>' + M.names[p] + '</b><em></em><span class="bub"></span>');
        t.style.setProperty('--c', c); tags.push(t);
      }
    }
    function newRound() {
      cancelAll();
      const n = M.n, deck = shuffled();
      S = { hands: [], stock: [], discard: [], suit: 0, rank: 0, turn: M.round % n, drew: 0, passes: 0, phase: 'deal', wild: false, lastBub: [] };
      for (let p = 0; p < n; p++) S.hands.push([]);
      const per = n === 2 ? 7 : 5;
      const order = [];
      for (let k = 0; k < per; k++) for (let p = 0; p < n; p++) { const id = deck.pop(); S.hands[p].push(id); order.push(id); }
      // starter: never an 8
      let si = deck.length - 1; while (rankOf(deck[si]) === 8) si--;
      const starter = deck.splice(si, 1)[0];
      S.stock = deck; S.discard = [starter]; S.suit = suitOf(starter); S.rank = rankOf(starter);
      sortHand(S.hands[0]);
      cursor = -1;
      // put everything on the stock, then fly out
      geom();
      for (let id = 0; id < 52; id++) { const d = cardEl[id]; d.classList.add('nt', 'down'); d.classList.remove('ok', 'dim', 'cur', 'mine'); d.style.top = ''; setPos(id, { x: G.stock.x, y: G.stock.y, r: 0, s: 1, z: 10 + id }); }
      void board.offsetWidth;
      for (let id = 0; id < 52; id++) cardEl[id].classList.remove('nt');
      busy = true;
      order.push(starter);
      order.forEach((id, i) => { cardEl[id].style.transitionDelay = (i * 55) + 'ms'; cardEl[id].firstChild.style.transitionDelay = (i * 55 + 250) + 'ms'; later(sfx.deal, i * 55); });
      S.dealing = new Set(order);
      layout(true);
      const dur = order.length * 55 + 450;
      later(() => { for (const id of order) { cardEl[id].style.transitionDelay = ''; cardEl[id].firstChild.style.transitionDelay = ''; } S.dealing = null; busy = false; S.phase = 'play'; layout(); beginTurn(); }, dur);
      hud();
    }

    /* ---------- turns ---------- */
    function beginTurn() {
      if (!S || S.phase !== 'play') return;
      S.drew = 0;
      if (S.turn === 0) {
        busy = false;
        const pl = playable(0);
        if (!pl.length && !canDraw()) { say('No moves and nothing to draw — you pass.'); step(() => pass(0), 1100); busy = true; }
        else sfx.turn();
        if (cursor < 0 || cursor > S.hands[0].length) cursor = -1;
        layout(); hud();
      } else {
        busy = true; layout(); hud();
        step(() => aiTurn(S.turn), 650 + Math.random() * 350);
      }
    }
    function nextTurn() { S.turn = (S.turn + 1) % M.n; beginTurn(); }
    function canDraw() { return S.stock.length > 0 || S.discard.length > 1; }
    // returns drawn card id or -1
    function drawCard(p) {
      if (!S.stock.length) {
        if (S.discard.length <= 1) return -1;
        const keep = S.discard.pop();
        const rest = S.discard; S.discard = [keep];
        for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
        S.stock = rest; sfx.shuffle(); say('Deck reshuffled from the discards.');
        layout();
      }
      const id = S.stock.pop(); S.hands[p].push(id); S.passes = 0;
      if (p === 0) sortHand(S.hands[0]);
      sfx.draw(); return id;
    }
    function playCard(p, id, chosenSuit) {
      const h = S.hands[p], i = h.indexOf(id); if (i < 0) return;
      h.splice(i, 1); S.discard.push(id); S.passes = 0;
      S.rank = rankOf(id);
      const eight = rankOf(id) === 8;
      if (eight) { S.suit = chosenSuit; S.wild = true; sfx.eight(); } else { S.suit = suitOf(id); S.wild = false; sfx.play(); }
      if (h.length === 1) { bubble(p, 'Last card!'); later(sfx.last, 250); }
      if (eight) bubble(p, SUITS[chosenSuit] + ' ' + SUIT_NAMES[chosenSuit] + '!');
      layout(); hud(); popSuit();
      if (!h.length) { S.phase = 'end'; busy = true; step(() => endRound(p), 700); return; }
      step(nextTurn, p === 0 ? 380 : 520);
    }
    function pass(p) {
      S.passes++;
      bubble(p, 'Pass');
      if (S.passes >= M.n && !canDraw()) { S.phase = 'end'; busy = true; step(() => endRound(-1), 700); return; }
      if (p === 0) { $('pass').hidden = true; busy = true; }
      step(nextTurn, 450);
    }

    /* ---------- computer ---------- */
    function aiChoose(p) {
      const h = S.hands[p], pl = h.filter(canPlay);
      if (!pl.length) return null;
      const counts = [0, 0, 0, 0]; for (const c of h) if (rankOf(c) !== 8) counts[suitOf(c)]++;
      const danger = S.hands.some((hh, q) => q !== p && hh.length <= 2);
      const non8 = pl.filter(c => rankOf(c) !== 8);
      let best = null, bestS = -1e9;
      for (const c of non8) {
        let sc = cardPts(c) * 1.2;
        // after playing c the suit becomes suitOf(c): good if we hold many of that suit
        sc += (counts[suitOf(c)] - 1) * 6;
        // changing to a suit we hold is better than staying in one we lack
        if (suitOf(c) !== S.suit) sc += counts[suitOf(c)] > counts[S.suit] ? 4 : -3;
        sc += Math.random() * 3;
        if (sc > bestS) { bestS = sc; best = c; }
      }
      const eights = pl.filter(c => rankOf(c) === 8);
      if (eights.length && (best === null || (danger && h.length <= 3) || (h.length === eights.length))) best = eights[0];
      if (best === null) best = eights[0];
      let suit = S.suit;
      if (rankOf(best) === 8) {
        let bs = -1; for (let s = 0; s < 4; s++) { const v = counts[s] * 10 + h.filter(c => suitOf(c) === s && rankOf(c) !== 8).reduce((a, c) => a + cardPts(c), 0) * 0.1; if (v > bs) { bs = v; suit = s; } }
        if (counts.every(c => c === 0)) suit = Math.floor(Math.random() * 4);
      }
      return { id: best, suit };
    }
    function aiTurn(p) {
      if (!S || S.phase !== 'play' || S.turn !== p) return;
      const ch = aiChoose(p);
      if (ch) { playCard(p, ch.id, ch.suit); return; }
      // draw
      const id = drawCard(p);
      if (id < 0) { pass(p); return; }
      S.drew++;
      layout(); hud();
      if (opts.draw === 'one' && !canPlay(id)) { step(() => pass(p), 500); return; }
      step(() => aiTurn(p), canPlay(id) ? 520 : 330);
    }

    /* ---------- human ---------- */
    function humanPlay(id) {
      if (busy || !S || S.phase !== 'play' || S.turn !== 0) return;
      if (!canPlay(id)) { shake(id); return; }
      $('pass').hidden = true;
      if (rankOf(id) === 8 && S.hands[0].length > 1) { openPick(id); return; }
      if (rankOf(id) === 8) { playCard(0, id, suitOf(id)); return; }
      busy = true; playCard(0, id);
    }
    function humanDraw() {
      if (busy || !S || S.phase !== 'play' || S.turn !== 0) return;
      if (playable(0).length) { say('You have a playable card.'); sfx.bad(); flashPlayable(); return; }
      if (opts.draw === 'one' && S.drew) { say('Already drew — play it or pass.'); sfx.bad(); return; }
      if (!canDraw()) { pass(0); return; }
      busy = true;
      const id = drawCard(0); S.drew++;
      layout(); hud();
      later(() => {
        busy = false;
        if (canPlay(id)) { cursor = S.hands[0].indexOf(id); say(rankOf(id) === 8 ? 'You drew an 8 — play it!' : 'You drew a playable card.'); layout(); }
        else if (opts.draw === 'one') { say('No luck — passing.'); busy = true; step(() => pass(0), 650); }
        else if (!canDraw()) { say('Deck is empty — you pass.'); busy = true; step(() => pass(0), 650); }
        hud();
      }, 380);
    }
    function shake(id) {
      const d = cardEl[id]; sfx.bad();
      d.animate([{ marginLeft: '0px' }, { marginLeft: '-6px' }, { marginLeft: '6px' }, { marginLeft: '0px' }], { duration: 260 });
      say('That card doesn\'t match ' + SUITS[S.suit] + ' or ' + RANKS[S.rank] + '.');
    }
    function flashPlayable() { for (const id of playable(0)) cardEl[id].animate([{ top: '0px' }, { top: '-22px' }, { top: '0px' }], { duration: 380 }); }

    /* ---------- suit picker ---------- */
    function openPick(id) {
      closePick(); busy = true; pickCur = 0;
      const counts = [0, 0, 0, 0]; for (const c of S.hands[0]) if (c !== id && rankOf(c) !== 8) counts[suitOf(c)]++;
      pickCur = counts.indexOf(Math.max(...counts));
      pickEl = document.createElement('div'); pickEl.className = 'pick';
      pickEl.innerHTML = '<div class="box"><h3>Crazy eight!</h3><p>Choose the suit the next player must follow.</p><div class="ss">' +
        SUITS.map((s, i) => '<button data-suit="' + i + '" class="' + (i === 1 || i === 2 ? 'red' : '') + (i === pickCur ? ' cur' : '') + '">' + s + '<small>' + SUIT_NAMES[i] + ' · ' + counts[i] + '</small></button>').join('') +
        '</div><p style="margin:12px 0 0"><button class="btn sec small" data-r="pickx">Cancel</button></p></div>';
      pickEl.dataset.card = id;
      board.appendChild(pickEl);
    }
    function closePick() { if (pickEl) { pickEl.remove(); pickEl = null; } }
    function choosePick(s) {
      if (!pickEl) return;
      const id = +pickEl.dataset.card; closePick();
      playCard(0, id, s);
    }

    /* ---------- round end ---------- */
    function endRound(w) {
      S.phase = 'end'; busy = true;
      // reveal all hands
      for (let p = 1; p < M.n; p++) for (const id of S.hands[p]) cardEl[id].classList.remove('down');
      const vals = S.hands.map(handValue);
      let winner = w;
      if (winner < 0) { let mv = Infinity; vals.forEach((v, i) => { if (v < mv) { mv = v; winner = i; } }); }
      let pts = 0; vals.forEach((v, i) => { if (i !== winner) pts += v; });
      if (w < 0) pts = Math.max(0, pts - vals[winner] * (M.n - 1));
      M.scores[winner] += pts; M.round++;
      rec.rounds++; if (winner === 0) rec.roundsWon++;
      const matchOver = M.scores[winner] >= TARGET;
      if (matchOver) {
        M.over = true; rec.matches++;
        if (winner === 0) {
          rec.won++;
          if (rec.bestRounds === null || M.round < rec.bestRounds) { rec.bestRounds = M.round; try { api.save('best', M.round + (M.round === 1 ? ' round' : ' rounds')); } catch (e) { /* ignore */ } M.newBest = true; }
        }
      }
      try { api.save('stats', rec); } catch (e) { /* ignore */ }
      layout(); hud();
      if (winner === 0) sfx.win(); else sfx.lose();
      later(() => showOver(winner, pts, vals, w < 0, matchOver), 900);
    }
    function showOver(winner, pts, vals, blocked, matchOver) {
      closeOver();
      overEl = document.createElement('div'); overEl.className = 'over';
      const you = winner === 0;
      let head, sub;
      if (matchOver) { head = you ? 'You win the match! 🏆' : M.names[winner] + ' wins the match'; sub = 'After ' + M.round + ' round' + (M.round === 1 ? '' : 's') + (you && M.newBest ? ' · <b style="color:var(--gold)">fastest win yet!</b>' : ''); }
      else { head = you ? 'You went out! +' + pts : (blocked ? 'Blocked — ' : '') + M.names[winner] + (blocked ? ' has the lowest hand' : ' went out') + ' · +' + pts; sub = blocked ? 'Nobody could play and the deck ran dry.' : 'Points come from the cards left in the other hands.'; }
      let rows = '';
      for (let p = 0; p < M.n; p++) {
        const c = p === 0 ? '#ff8a3d' : BOTS[p - 1].col;
        rows += '<tr class="' + (p === winner ? 'w' : '') + '"><td>' + M.names[p] + '</td><td>' + S.hands[p].length + '</td><td>' + (p === winner ? '+' + pts : vals[p]) + '</td><td>' + M.scores[p] + '</td><td><span class="bars" style="--c:' + c + '"><span style="width:' + Math.min(100, M.scores[p] / TARGET * 100) + '%"></span></span></td></tr>';
      }
      overEl.innerHTML = '<div class="box"><h3 class="' + (you ? 'win' : '') + '">' + head + '</h3><div class="sub">' + sub + '</div>' +
        '<table><tr><th>Player</th><th>Cards</th><th>Round</th><th>Total</th><th>to ' + TARGET + '</th></tr>' + rows + '</table>' +
        '<button class="btn pri small" data-r="' + (matchOver ? 'new2' : 'next') + '">' + (matchOver ? 'New match' : 'Next round') + '</button></div>';
      board.appendChild(overEl);
    }
    function closeOver() { if (overEl) { overEl.remove(); overEl = null; } }

    /* ---------- layout ---------- */
    function geom() {
      const W = Math.max(600, board.clientWidth || root.clientWidth || 900);
      const rt = board.getBoundingClientRect();
      const H = Math.round(Math.min(760, Math.max(470, window.innerHeight - Math.max(0, rt.top) - 30)));
      let cw = Math.floor(Math.min(96, W / 10.5, (H - 190) / 2.62 / 1.4));
      cw = Math.max(56, cw);
      const ch = Math.round(cw * 1.4);
      const os = 0.62;  // opponent card scale
      const handY = H - ch / 2 - 18, tagY = handY - ch / 2 - 58, stMax = tagY - 42;
      const py = Math.round(Math.max(16 + ch * os + 8 + ch / 2, Math.min(H * 0.43, stMax - 46 - ch / 2)));
      G = { W, H, cw, ch, os, py, stock: { x: W / 2 - cw * 0.7, y: py }, disc: { x: W / 2 + cw * 0.7, y: py }, handY, tagY, stY: Math.min(py + ch / 2 + 46, stMax) };
      board.style.height = H + 'px';
      board.style.setProperty('--cw', cw + 'px'); board.style.setProperty('--ch', ch + 'px'); board.style.setProperty('--py', py + 'px');
    }
    function setPos(id, p) {
      const d = cardEl[id];
      d.style.transform = 'translate(' + (p.x - G.cw / 2).toFixed(1) + 'px,' + (p.y - G.ch / 2).toFixed(1) + 'px) rotate(' + (p.r || 0) + 'deg) scale(' + (p.s || 1) + ')';
      d.style.zIndex = p.z;
      pos[id] = p;
    }
    const jit = (id, k) => (((id * 7919 + k * 104729) % 1000) / 1000 - 0.5);
    function seatGeom(seat, n) {
      const { W, H, ch, cw, os } = G;
      const sw = cw * os, sh = ch * os;
      if (seat === 'top') { const sp = Math.min(sw * 0.42, (W * 0.5) / Math.max(1, n - 1)); return { cx: W / 2, cy: 16 + sh / 2, dx: sp, dy: 0, r: 180, tag: { x: W / 2, y: 22 + sh, below: true, center: true } }; }
      const sp = Math.min(sw * 0.38, (H * 0.42) / Math.max(1, n - 1));
      if (seat === 'left') return { cx: 18 + sh / 2, cy: G.py - 10, dx: 0, dy: sp, r: 90, tag: { x: 12, y: G.py + sp * (n - 1) / 2 + sw / 2 + 4, below: true } };
      return { cx: W - 18 - sh / 2, cy: G.py - 10, dx: 0, dy: sp, r: -90, tag: { x: W - 12, y: G.py + sp * (n - 1) / 2 + sw / 2 + 4, below: true, right: true } };
    }
    function layout(dealAnim) {
      if (!S) return;
      geom();
      const { W, cw, ch, os } = G;
      const placed = new Set();
      // stock
      S.stock.forEach((id, i) => { cardEl[id].classList.add('down'); cardEl[id].classList.remove('mine', 'ok', 'dim', 'cur'); setPos(id, { x: G.stock.x - Math.min(i, 24) * 0.25, y: G.stock.y - Math.min(i, 24) * 0.35, r: 0, s: 1, z: 10 + i }); placed.add(id); });
      // discard
      const dn = S.discard.length;
      S.discard.forEach((id, i) => {
        const depth = dn - 1 - i, k = Math.min(depth, 6);
        cardEl[id].classList.remove('down', 'mine', 'ok', 'dim', 'cur'); cardEl[id].style.top = '';
        setPos(id, { x: G.disc.x + jit(id, 1) * 10 + (depth ? 0 : 0), y: G.disc.y + jit(id, 2) * 8 - k * 0.3, r: jit(id, 3) * 18, s: 1, z: 200 + i });
        placed.add(id);
      });
      // opponents
      const ss = seats(M.n - 1);
      for (let p = 1; p < M.n; p++) {
        const h = S.hands[p], n = h.length, sg = seatGeom(ss[p - 1], n);
        const reveal = S.phase === 'end';
        h.forEach((id, i) => {
          const off = i - (n - 1) / 2;
          cardEl[id].classList.toggle('down', !reveal); cardEl[id].classList.remove('mine', 'ok', 'dim', 'cur'); cardEl[id].style.top = '';
          setPos(id, { x: sg.cx + sg.dx * off, y: sg.cy + sg.dy * off, r: sg.r + off * (sg.dy ? 0 : 1.2), s: os, z: 400 + p * 60 + i });
          placed.add(id);
        });
        const t = tags[p];
        t.querySelector('em').textContent = n + (n === 1 ? ' card' : ' cards');
        const tw = t.offsetWidth || 120;
        let tx = sg.tag.x, ty = sg.tag.y;
        if (sg.tag.center) tx -= tw / 2; else if (sg.tag.right) tx -= tw;
        if (ss[p - 1] === 'top') { tx = W / 2 + Math.max(sg.dx * (n - 1) / 2, 0) + cw * os / 2 + 14; ty = sg.cy - 17; t.classList.remove('below'); }
        else t.classList.add('below');
        t.style.transform = 'translate(' + Math.round(tx) + 'px,' + Math.round(ty) + 'px)';
        t.classList.toggle('turn', S.turn === p && S.phase === 'play');
      }
      // you
      const h = S.hands[0], n = h.length;
      const maxW = W * 0.86 - cw;
      const sp = n > 1 ? Math.min(cw * 0.72, maxW / (n - 1)) : 0;
      const myTurn = S.turn === 0 && S.phase === 'play' && !busy;
      const okSet = new Set(myTurn ? playable(0) : []);
      if (cursor >= n) cursor = n - 1;
      h.forEach((id, i) => {
        const off = i - (n - 1) / 2, d = cardEl[id];
        d.classList.remove('down'); d.classList.add('mine');
        d.classList.toggle('ok', okSet.has(id));
        d.classList.toggle('dim', myTurn && !okSet.has(id));
        d.classList.toggle('cur', myTurn && cursor === i);
        setPos(id, { x: W / 2 + off * sp, y: G.handY + Math.abs(off) * Math.abs(off) * 0.6, r: off * Math.min(2.2, 16 / Math.max(1, n)), s: 1, z: 700 + i });
        placed.add(id);
      });
      const t0 = tags[0];
      t0.querySelector('em').textContent = n + (n === 1 ? ' card' : ' cards');
      t0.style.transform = 'translate(' + Math.round(W / 2 - (t0.offsetWidth || 110) / 2) + 'px,' + Math.round(G.tagY) + 'px)';
      t0.classList.toggle('turn', S.turn === 0 && S.phase === 'play');
      if (dealAnim && S.dealing) { /* cards already have delays */ }
      // slots & indicators
      const sp2 = (e, x, y) => { e.style.transform = 'translate(' + Math.round(x - cw / 2) + 'px,' + Math.round(y - ch / 2) + 'px)'; };
      sp2(stockSlot, G.stock.x, G.stock.y); sp2(discSlot, G.disc.x, G.disc.y);
      const mustDraw = myTurn && !okSet.size && canDraw() && !(opts.draw === 'one' && S.drew);
      stockSlot.classList.toggle('must', mustDraw);
      stockSlot.classList.toggle('cur', myTurn && cursor === n);
      stockSlot.style.zIndex = mustDraw ? 900 : 1;
      stockCnt.textContent = S.stock.length ? S.stock.length + ' left' : 'empty';
      stockCnt.style.transform = 'translate(' + Math.round(G.stock.x - stockCnt.offsetWidth / 2) + 'px,' + Math.round(G.stock.y + ch / 2 + 8) + 'px)';
      suitB.className = 'suitb' + (S.suit === 1 || S.suit === 2 ? ' red' : '') + (S.wild ? ' wild' : '');
      suitB.querySelector('i').textContent = SUITS[S.suit];
      suitB.querySelector('span').textContent = S.wild ? 'Eight called ' + SUIT_NAMES[S.suit] : 'Follow ' + SUIT_NAMES[S.suit] + ' or ' + RANKS[S.rank];
      suitB.style.transform = 'translate(' + Math.round(G.disc.x - (suitB.offsetWidth || 150) / 2) + 'px,' + Math.round(G.disc.y + ch / 2 + 8) + 'px)';
      status.style.transform = 'translate(-50%,' + Math.round(G.stY) + 'px)';
      acts.style.transform = 'translate(' + Math.round(G.disc.x + cw / 2 + 22) + 'px,' + Math.round(G.py - 16) + 'px)';
      // safety: anything unplaced (shouldn't happen) goes under the stock
      for (let id = 0; id < 52; id++) if (!placed.has(id)) setPos(id, { x: G.stock.x, y: G.stock.y, r: 0, s: 1, z: 1 });
    }

    /* ---------- hud ---------- */
    let sayMsg = '', sayT = null;
    function say(m) { sayMsg = m; if (sayT) { clearTimeout(sayT); timers.delete(sayT); } sayT = later(() => { sayMsg = ''; sayT = null; hud(); }, 2200); hud(); }
    function bubble(p, txt) {
      const t = tags[p]; if (!t) return;
      const b = t.querySelector('.bub'); b.textContent = txt; b.classList.add('show');
      if (S.lastBub[p]) { clearTimeout(S.lastBub[p]); timers.delete(S.lastBub[p]); }
      S.lastBub[p] = later(() => b.classList.remove('show'), 1500);
    }
    function popSuit() { suitB.classList.remove('pop'); void suitB.offsetWidth; suitB.classList.add('pop'); }
    function hud() {
      if (!S || !M) return;
      // scores
      let h = '';
      for (let p = 0; p < M.n; p++) {
        const c = p === 0 ? '#ff8a3d' : BOTS[p - 1].col;
        h += '<div class="st" style="--c:' + c + '"><b>' + M.names[p] + '</b><i style="color:' + c + '">' + M.scores[p] + '</i><span class="meter" style="width:' + Math.min(100, M.scores[p] / TARGET * 100) + '%"></span></div>';
      }
      h += '<div class="st tg"><b>Round</b><i>' + (M.round + (S.phase === 'end' ? 0 : 1)) + '</i></div>';
      $('scores').innerHTML = h;
      let line = '', sub = '';
      if (S.phase === 'deal') line = 'Dealing…';
      else if (S.phase === 'end') line = '';
      else if (S.turn === 0) {
        line = 'Your turn';
        const pl = playable(0).length;
        if (sayMsg) sub = sayMsg;
        else if (pl) sub = 'Play a card that matches ' + SUITS[S.suit] + ' or ' + RANKS[S.rank] + (S.hands[0].some(c => rankOf(c) === 8) ? ' — or an 8' : '');
        else if (opts.draw === 'one' && S.drew) sub = 'No match — passing';
        else if (canDraw()) sub = 'No match: draw from the deck';
      } else { line = M.names[S.turn] + ' is thinking…'; sub = sayMsg; }
      status.className = 'status' + (S.turn === 0 && S.phase === 'play' ? ' you' : '');
      status.innerHTML = line + (sub ? '<small>' + sub + '</small>' : '');
      $('pass').hidden = !(S.phase === 'play' && S.turn === 0 && !busy && opts.draw === 'one' && S.drew && playable(0).length);
      root.querySelectorAll('[data-r="opp"] button').forEach(b => b.classList.toggle('on', +b.dataset.v === opts.opp));
      root.querySelectorAll('[data-r="draw"] button').forEach(b => b.classList.toggle('on', b.dataset.v === opts.draw));
      $('snd').textContent = soundOn ? '🔊' : '🔇';
      $('rec').textContent = 'Matches ' + rec.won + '/' + rec.matches + (rec.bestRounds ? ' · Fastest win ' + rec.bestRounds + ' rd' : '');
    }

    /* ---------- input ---------- */
    function onClick(e) {
      const b = e.target.closest('button');
      if (b && root.contains(b)) {
        const r = b.dataset.r, par = b.parentNode.dataset.r;
        b.blur();
        if (r === 'new' || r === 'new2') { newMatch(); return; }
        if (r === 'next') { newRound(); return; }
        if (r === 'pass') { if (!busy && S.turn === 0) pass(0); return; }
        if (r === 'pickx') { closePick(); busy = false; layout(); hud(); return; }
        if (b.dataset.suit !== undefined) { choosePick(+b.dataset.suit); return; }
        if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); hud(); tone(600, 0.05); return; }
        if (par === 'opp') { const v = +b.dataset.v; if (v !== opts.opp) { opts.opp = v; api.save('opts', opts); newMatch(); } return; }
        if (par === 'draw') { opts.draw = b.dataset.v; api.save('opts', opts); hud(); layout(); return; }
        return;
      }
      const ce = e.target.closest('.card');
      if (ce && board.contains(ce)) {
        const id = +ce.dataset.id;
        if (S && S.hands[0].includes(id)) { cursor = S.hands[0].indexOf(id); humanPlay(id); return; }
        if (S && S.stock.includes(id)) { humanDraw(); return; }
        return;
      }
      if (e.target === stockSlot) humanDraw();
    }
    function onKey(e) {
      if (el.offsetParent === null || document.hidden || !S) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const k = e.key;
      if (pickEl) {
        if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); pickCur = (pickCur + (k === 'ArrowLeft' ? 3 : 1)) % 4; pickEl.querySelectorAll('[data-suit]').forEach((b, i) => b.classList.toggle('cur', i === pickCur)); }
        else if (k === ' ' || k === 'Enter') { e.preventDefault(); choosePick(pickCur); }
        else if (k >= '1' && k <= '4') { e.preventDefault(); choosePick(+k - 1); }
        else if (k === 'Escape' || k === 'x') { e.preventDefault(); closePick(); busy = false; layout(); hud(); }
        return;
      }
      if (overEl) {
        if (k === ' ' || k === 'Enter') { e.preventDefault(); const b = overEl.querySelector('button'); if (b.dataset.r === 'next') newRound(); else newMatch(); }
        return;
      }
      if (S.phase !== 'play' || S.turn !== 0 || busy) return;
      const n = S.hands[0].length;
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault();
        if (cursor < 0) cursor = k === 'ArrowLeft' ? n : 0;
        else cursor = (cursor + (k === 'ArrowLeft' ? n : 1)) % (n + 1); // index n = the deck
        tone(880, 0.02, 'sine', 0.012); layout(); return;
      }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        const pl = playable(0); if (!pl.length) { cursor = n; layout(); return; }
        const idxs = pl.map(id => S.hands[0].indexOf(id));
        const curI = idxs.indexOf(cursor);
        cursor = idxs[(curI + (k === 'ArrowUp' ? 1 : idxs.length - 1) + (curI < 0 ? (k === 'ArrowUp' ? 0 : 1) : 0)) % idxs.length];
        layout(); return;
      }
      if (k === ' ' || (k === 'Enter' && tg !== 'BUTTON')) {
        e.preventDefault();
        if (cursor >= 0 && cursor < n) humanPlay(S.hands[0][cursor]);
        else if (cursor === n || !playable(0).length) humanDraw();
        else { cursor = S.hands[0].indexOf(playable(0)[0]); layout(); }
        return;
      }
      if (k === 'd' || k === 'D') { e.preventDefault(); humanDraw(); return; }
      if ((k === 'p' || k === 'P') && !$('pass').hidden) { e.preventDefault(); pass(0); }
    }
    let rsz = 0;
    function onResize() { if (rsz) return; rsz = requestAnimationFrame(() => { rsz = 0; if (document.hidden || el.offsetParent === null || !S) return; for (let id = 0; id < 52; id++) cardEl[id].classList.add('nt'); layout(); void board.offsetWidth; for (let id = 0; id < 52; id++) cardEl[id].classList.remove('nt'); }); }

    root.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    newMatch();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (inst && S) layout(); });

    return {
      destroy() {
        timers.forEach(clearTimeout); timers.clear();
        if (rsz) cancelAnimationFrame(rsz);
        root.removeEventListener('click', onClick);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        el.innerHTML = '';
        S = null;
      },
      _test: {
        get S() { return S; }, get M() { return M; }, get busy() { return busy; }, get timers() { return timers.size; },
        humanPlay, humanDraw, choosePick, newRound, newMatch, endRound, playable: () => playable(0), canPlay,
      },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { inst.destroy(); inst = null; this._t = null; } },
  };
})();
