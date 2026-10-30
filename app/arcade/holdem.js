/* VanMule Arcade: Texas Hold'em. No-limit ring game vs 3-5 computer players with distinct styles,
   rising blinds, persistent chips, side pots, full showdown ranking and a built-in coach. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'holdem';

  /* ================================================================ cards & evaluator */
  // card = rank*4 + suit ; rank 0..12 = 2..A ; suit 0..3 = ♠ ♥ ♦ ♣
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RCH = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const RN = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  const plural = r => r === 4 ? 'Sixes' : RN[r] + 's';
  const CAT = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
  const cstr = c => RCH[c >> 2] + SUITS[c & 3];

  const RC = new Int8Array(13), SM = new Int32Array(4), SC = new Int8Array(4);
  function strHigh(m) {
    for (let hi = 12; hi >= 4; hi--) if (((m >> (hi - 4)) & 31) === 31) return hi;
    if ((m & 0x100F) === 0x100F) return 3;
    return -1;
  }
  function topRanks(mask, k, out) { for (let r = 12; r >= 0 && k > 0; r--) if (mask & (1 << r)) { out.push(r); k--; } return out; }
  function pack(cat, a) { let v = cat; for (let i = 0; i < 5; i++) v = v * 16 + (i < a.length ? a[i] : 0); return v; }
  // evaluates the best 5-card hand among the first n cards of arr (n = 2..7); higher is better
  function evalN(arr, n) {
    RC.fill(0); SM.fill(0); SC.fill(0);
    let rm = 0;
    for (let i = 0; i < n; i++) { const c = arr[i], r = c >> 2, s = c & 3; RC[r]++; rm |= 1 << r; SM[s] |= 1 << r; SC[s]++; }
    let fs = -1; for (let s = 0; s < 4; s++) if (SC[s] >= 5) fs = s;
    if (fs >= 0) { const sh = strHigh(SM[fs]); if (sh >= 0) return pack(8, [sh]); }
    let q = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
    for (let r = 12; r >= 0; r--) {
      const k = RC[r];
      if (k === 4) q = r;
      else if (k === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
      else if (k === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
    }
    if (q >= 0) return pack(7, topRanks(rm & ~(1 << q), 1, [q]));
    if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return pack(6, [t1, Math.max(t2, p1)]);
    if (fs >= 0) return pack(5, topRanks(SM[fs], 5, []));
    const sh = strHigh(rm); if (sh >= 0) return pack(4, [sh]);
    if (t1 >= 0) return pack(3, topRanks(rm & ~(1 << t1), 2, [t1]));
    if (p1 >= 0 && p2 >= 0) return pack(2, topRanks(rm & ~(1 << p1) & ~(1 << p2), 1, [p1, p2]));
    if (p1 >= 0) return pack(1, topRanks(rm & ~(1 << p1), 3, [p1]));
    return pack(0, topRanks(rm, 5, []));
  }
  const evalCards = cs => evalN(cs, cs.length);
  const catOf = v => Math.floor(v / 1048576);
  const nib = (v, i) => Math.floor(v / Math.pow(16, 4 - i)) % 16; // i = 0..4
  function describe(v) {
    const c = catOf(v), a = nib(v, 0), b = nib(v, 1);
    switch (c) {
      case 0: return RN[a] + ' high';
      case 1: return 'Pair of ' + plural(a);
      case 2: return 'Two pair, ' + plural(a) + ' and ' + plural(b);
      case 3: return 'Three ' + plural(a);
      case 4: return 'Straight, ' + RN[a] + ' high';
      case 5: return 'Flush, ' + RN[a] + ' high';
      case 6: return 'Full house, ' + plural(a) + ' full of ' + plural(b);
      case 7: return 'Four ' + plural(a);
      default: return a === 12 ? 'Royal flush' : 'Straight flush, ' + RN[a] + ' high';
    }
  }
  const PRIMARY = [1, 1, 2, 1, 5, 1, 5, 1, 5];
  // if the winner beat the runner-up only on a kicker, name it
  function kickerNote(win, other) {
    if (catOf(win) !== catOf(other) || win <= other) return '';
    for (let i = 0; i < 5; i++) {
      const a = nib(win, i), b = nib(other, i);
      if (a !== b) return i >= PRIMARY[catOf(win)] ? RN[a] + ' kicker' : '';
    }
    return '';
  }
  // which 5 of these cards make the best hand
  function best5(cs) {
    let best = -1, pick = null; const tmp = [0, 0, 0, 0, 0], n = cs.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      tmp[0] = cs[a]; tmp[1] = cs[b]; tmp[2] = cs[c]; tmp[3] = cs[d]; tmp[4] = cs[e];
      const v = evalN(tmp, 5); if (v > best) { best = v; pick = tmp.slice(); }
    }
    return pick || cs.slice();
  }
  // Monte Carlo win probability vs nOpp random hands
  function mcEquity(hole, board, nOpp, iters) {
    if (nOpp <= 0) return 1;
    const used = new Uint8Array(52); hole.forEach(c => { used[c] = 1; }); board.forEach(c => { used[c] = 1; });
    const deck = []; for (let c = 0; c < 52; c++) if (!used[c]) deck.push(c);
    const need = 5 - board.length, k = need + nOpp * 2, L = deck.length;
    const mine = new Array(7), opp = new Array(7);
    mine[0] = hole[0]; mine[1] = hole[1];
    for (let i = 0; i < board.length; i++) { mine[2 + i] = board[i]; opp[2 + i] = board[i]; }
    let score = 0;
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < k; i++) { const j = i + Math.floor(Math.random() * (L - i)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
      for (let i = 0; i < need; i++) { mine[2 + board.length + i] = deck[i]; opp[2 + board.length + i] = deck[i]; }
      const me = evalN(mine, 7);
      let bestO = -1, ties = 0;
      for (let o = 0; o < nOpp; o++) {
        opp[0] = deck[need + o * 2]; opp[1] = deck[need + o * 2 + 1];
        const v = evalN(opp, 7);
        if (v > bestO) { bestO = v; ties = 0; } else if (v === bestO) ties++;
      }
      if (me > bestO) score += 1; else if (me === bestO) score += 1 / (ties + 2);
    }
    return score / iters;
  }
  // classic starting-hand points (pairs/suited/connected bonuses)
  function chen(h) {
    const a = h[0] >> 2, b = h[1] >> 2, hi = Math.max(a, b), lo = Math.min(a, b);
    const base = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10];
    let s = base[hi];
    if (a === b) return Math.max(5, s * 2);
    if ((h[0] & 3) === (h[1] & 3)) s += 2;
    const gap = hi - lo - 1;
    s -= gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && hi < 10) s += 1;
    return Math.ceil(s);
  }
  function startName(h) {
    const a = h[0] >> 2, b = h[1] >> 2, hi = Math.max(a, b), lo = Math.min(a, b);
    if (a === b) return RCH[a] + RCH[a];
    return RCH[hi] + RCH[lo] + ((h[0] & 3) === (h[1] & 3) ? 's' : 'o');
  }
  function startTier(h) {
    const c = chen(h);
    if (c >= 12) return { t: 'Premium', d: 'one of the very best starting hands', k: 4 };
    if (c >= 10) return { t: 'Strong', d: 'a strong starting hand', k: 3 };
    if (c >= 8) return { t: 'Good', d: 'a good hand, best played in position', k: 2 };
    if (c >= 6) return { t: 'Speculative', d: 'a speculative hand that wants a cheap flop', k: 1 };
    return { t: 'Weak', d: 'a weak hand that loses money in most spots', k: 0 };
  }

  /* ================================================================ players */
  const STY = {
    rock:    { name: 'Pebble',  icon: '🪨', tag: 'Tight',           desc: 'Plays few hands but bets them hard. When Pebble raises, believe it.', vpip: 1.3,  raiseAdv: 1.65, aggr: 0.6,  bluff: 0.03, slack: -0.04, size: 0.7,  col: '#9fb2c6' },
    loose:   { name: 'Juniper', icon: '🌵', tag: 'Loose',           desc: 'Plays lots of hands and loves seeing flops; folds to real pressure.', vpip: 0.68, raiseAdv: 1.9,  aggr: 0.35, bluff: 0.07, slack: 0.05,  size: 0.6,  col: '#86d67f' },
    aggro:   { name: 'Blaze',   icon: '🔥', tag: 'Aggressive',      desc: 'Bets and raises constantly and bluffs often. Call down lighter, trap with strong hands.', vpip: 0.85, raiseAdv: 1.2,  aggr: 0.85, bluff: 0.2,  slack: 0.03,  size: 0.95, col: '#ff8a52' },
    station: { name: 'Dot',     icon: '🐢', tag: 'Calling station', desc: 'Calls almost anything, rarely raises. Value-bet big and never bluff.', vpip: 0.58, raiseAdv: 2.3,  aggr: 0.15, bluff: 0,    slack: 0.18,  size: 0.5,  col: '#e6c85e' },
    solid:   { name: 'Quill',   icon: '🦉', tag: 'Solid',           desc: 'A balanced regular: sensible hands, sensible bets, the odd bluff.', vpip: 1.1,  raiseAdv: 1.5,  aggr: 0.6,  bluff: 0.08, slack: 0,     size: 0.75, col: '#b993ff' },
  };
  const LINEUP = { 3: ['rock', 'aggro', 'station'], 4: ['rock', 'loose', 'aggro', 'station'], 5: ['rock', 'loose', 'aggro', 'solid', 'station'] };
  const SEATS = {
    4: [[50, 84], [10, 46], [50, 14], [90, 46]],
    5: [[50, 84], [10, 60], [25, 15], [75, 15], [90, 60]],
    6: [[50, 84], [10, 66], [12, 23], [50, 14], [88, 23], [90, 66]],
  };
  const LEVELS = [[5, 10], [10, 20], [15, 30], [25, 50], [40, 80], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [500, 1000]];
  const HANDS_PER_LEVEL = 10;
  const BUYIN = 2000;
  const fmtN = n => Math.round(n).toLocaleString('en-US');
  const round5 = x => Math.max(5, Math.round(x / 5) * 5);

  /* ================================================================ CSS */
  const CSS = `
.ag-holdem{font-family:var(--body);color:var(--fg);user-select:none;-webkit-user-select:none;--bw:52px}
.ag-holdem .hd{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px}
.ag-holdem .ttl{flex:1;min-width:230px}
.ag-holdem h2{font-family:var(--display);font-size:26px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-holdem h2 span{color:var(--ember)}
.ag-holdem .how{color:var(--muted);font-size:13px;margin-top:3px}
.ag-holdem .stats{display:flex;gap:6px}
.ag-holdem .st{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:4px 12px;text-align:center;min-width:76px}
.ag-holdem .st b{display:block;font-size:10px;letter-spacing:1.3px;color:var(--muted)}
.ag-holdem .st i{font-style:normal;font-family:var(--mono);font-weight:700;font-size:18px;white-space:nowrap}
.ag-holdem .st.sc i{font-family:var(--display);color:var(--ember)}
.ag-holdem .st small{display:block;font-size:10px;color:var(--dim);font-family:var(--mono);margin-top:-2px}
.ag-holdem .bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.ag-holdem .seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px;align-items:center}
.ag-holdem .seg label{font-size:12px;color:var(--muted);padding:0 4px 0 8px}
.ag-holdem .seg button{height:28px;padding:0 9px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-holdem .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-holdem .sp{flex:1}
.ag-holdem .rec{font-size:12px;color:var(--dim);font-family:var(--mono)}
.ag-holdem .main{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:12px;align-items:start}
.ag-holdem.narrow .main{grid-template-columns:minmax(0,1fr)}
.ag-holdem .felt{position:relative;width:100%;height:440px;border-radius:22px;background:radial-gradient(ellipse at 50% 40%,#211b17 0%,#141110 75%);border:1px solid var(--line);overflow:hidden}
.ag-holdem .oval{position:absolute;left:7%;right:7%;top:13%;bottom:15%;border-radius:50%/50%;background:radial-gradient(ellipse at 50% 42%,#1f6a55 0%,#164a3d 58%,#103629 100%);box-shadow:0 0 0 10px #3a2618,0 0 0 12px #5a3b24,0 0 0 13px rgba(255,138,61,.25),0 18px 40px rgba(0,0,0,.55),inset 0 0 50px rgba(0,0,0,.45)}
.ag-holdem .oval::after{content:"VANMULE";position:absolute;left:0;right:0;top:66%;text-align:center;font-family:var(--display);font-weight:800;letter-spacing:6px;font-size:13px;color:rgba(255,255,255,.07)}
.ag-holdem .center{position:absolute;left:50%;top:45%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:6px;z-index:7}
.ag-holdem .pot{font-family:var(--mono);font-weight:700;font-size:14px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:2px 12px;display:flex;align-items:center;gap:6px;min-height:24px;white-space:nowrap}
.ag-holdem .pot .side{color:var(--gold);font-size:12px}
.ag-holdem .pot:empty{visibility:hidden}
.ag-holdem .board{display:flex;gap:calc(var(--bw)*.12)}
.ag-holdem .bslot{width:var(--bw);height:calc(var(--bw)*1.4);border-radius:calc(var(--bw)*.09);border:1.5px dashed rgba(255,255,255,.12)}
.ag-holdem .pc{position:relative;width:var(--w,var(--bw));height:calc(var(--w,var(--bw))*1.4);border-radius:calc(var(--w,var(--bw))*.09);background:linear-gradient(170deg,#fffdf9,#f1e9df);box-shadow:0 1px 3px rgba(0,0,0,.5),inset 0 0 0 1px #d8cdc1;color:#1f1b18;flex:none;transition:transform .25s,filter .25s,box-shadow .25s,opacity .25s}
.ag-holdem .pc.red{color:#cf2f2a}
.ag-holdem .pc .r{position:absolute;left:8%;top:4%;font-weight:800;font-size:calc(var(--w,var(--bw))*.3);letter-spacing:-1px;line-height:1}
.ag-holdem .pc .s1{position:absolute;left:9%;top:29%;font-size:calc(var(--w,var(--bw))*.24);line-height:1}
.ag-holdem .pc .s2{position:absolute;right:8%;bottom:4%;font-size:calc(var(--w,var(--bw))*.5);line-height:1}
.ag-holdem .pc.back{background:radial-gradient(circle at 50% 50%,rgba(255,200,97,.25) 0 14%,transparent 15%),repeating-linear-gradient(45deg,rgba(255,255,255,.09) 0 2px,transparent 2px 7px),repeating-linear-gradient(-45deg,rgba(0,0,0,.12) 0 2px,transparent 2px 7px),linear-gradient(160deg,#ff9b52,#e2640f 55%,#b8480a);box-shadow:0 1px 3px rgba(0,0,0,.5),inset 0 0 0 calc(var(--w,var(--bw))*.05) #fff4ea,inset 0 0 0 calc(var(--w,var(--bw))*.07) #c9530c}
.ag-holdem .pc.back::after{content:"VM";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-weight:800;font-size:calc(var(--w,var(--bw))*.24);color:#fff4ea}
.ag-holdem .pc.deal{animation:aghedeal .35s cubic-bezier(.2,.8,.3,1) both}
@keyframes aghedeal{from{opacity:0;transform:translateY(-26px) scale(.6) rotate(-10deg)}}
.ag-holdem .pc.hi{box-shadow:0 0 0 2px var(--gold),0 0 16px rgba(255,200,97,.75);transform:translateY(-5px)}
.ag-holdem .pc.lo{filter:brightness(.55)}
.ag-holdem .seat{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;z-index:6;width:132px}
.ag-holdem .seat .cards{display:flex;height:calc(var(--bw)*.78*1.4);margin-bottom:-12px;position:relative;z-index:1}
.ag-holdem .seat .cards .pc{--w:calc(var(--bw)*.78)}
.ag-holdem .seat .cards .pc+.pc{margin-left:calc(var(--bw)*-.32)}
.ag-holdem .seat .cards .pc:first-child{transform:rotate(-5deg)}
.ag-holdem .seat .cards .pc:last-child{transform:rotate(5deg)}
.ag-holdem .seat .cards .pc.hi{transform:translateY(-5px)}
.ag-holdem .seat.me{width:200px}
.ag-holdem .seat.me .cards{height:calc(var(--bw)*1.22*1.4)}
.ag-holdem .seat.me .cards .pc{--w:calc(var(--bw)*1.22)}
.ag-holdem .seat.me .cards .pc+.pc{margin-left:calc(var(--bw)*-.18)}
.ag-holdem .plate{position:relative;z-index:2;display:flex;align-items:center;gap:7px;background:rgba(22,18,16,.94);border:1px solid var(--line);border-radius:12px;padding:4px 10px 4px 5px;min-width:122px;box-shadow:0 4px 14px rgba(0,0,0,.45);transition:box-shadow .2s,border-color .2s}
.ag-holdem .av{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px;background:var(--panel2);box-shadow:inset 0 0 0 2px var(--c,var(--line));flex:none}
.ag-holdem .nm{flex:1;min-width:0;line-height:1.1}
.ag-holdem .nm b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ag-holdem .nm small{display:block;font-size:10px;color:var(--c,var(--muted));white-space:nowrap;letter-spacing:.3px}
.ag-holdem .nm i{display:block;font-style:normal;font-family:var(--mono);font-size:12.5px;font-weight:700;color:var(--gold)}
.ag-holdem .seat.turn .plate{border-color:var(--ember);box-shadow:0 0 0 2px rgba(255,138,61,.55),0 0 18px rgba(255,138,61,.45)}
.ag-holdem .seat.fold{opacity:.42}
.ag-holdem .seat.fold .cards{visibility:hidden}
.ag-holdem .seat.win .plate{border-color:var(--gold);box-shadow:0 0 0 2px rgba(255,200,97,.7),0 0 24px rgba(255,200,97,.55)}
.ag-holdem .bub{position:absolute;top:100%;margin-top:4px;font-size:11.5px;font-weight:700;background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:1px 9px;white-space:nowrap;z-index:3;animation:aghebub .25s ease-out}
.ag-holdem .bub:empty{display:none}
.ag-holdem .bub.allin{background:var(--bad);color:#fff;border-color:transparent}
.ag-holdem .bub.raise{background:var(--ember);color:var(--ember-ink);border-color:transparent}
.ag-holdem .bub.fold{color:var(--muted)}
.ag-holdem .bub.hand{background:var(--gold);color:#2a1d02;border-color:transparent}
@keyframes aghebub{from{opacity:0;transform:translateY(-4px)}}
.ag-holdem .seat.me .bub{top:auto;bottom:100%;margin:0 0 6px}
.ag-holdem .bet{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:4px;font-family:var(--mono);font-size:12px;font-weight:700;z-index:4;transition:left .38s ease-in,top .38s ease-in,opacity .38s;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.8)}
.ag-holdem .bet.empty{opacity:0}
.ag-holdem .chip{width:16px;height:16px;border-radius:50%;background:radial-gradient(circle,#fff4ea 0 22%,#ff8a3d 24% 60%,#fff4ea 62% 70%,#c9530c 72%);box-shadow:0 1px 2px rgba(0,0,0,.6),0 -2px 0 #e56a1d,0 -3px 1px rgba(0,0,0,.35);flex:none}
.ag-holdem .chip.g{background:radial-gradient(circle,#fff 0 22%,#3fbf9a 24% 60%,#fff 62% 70%,#1d7a62 72%);box-shadow:0 1px 2px rgba(0,0,0,.6),0 -2px 0 #2a9c7c}
.ag-holdem .fly{position:absolute;z-index:20;transform:translate(-50%,-50%);display:flex;gap:2px;transition:left .6s cubic-bezier(.3,.7,.4,1),top .6s cubic-bezier(.3,.7,.4,1),opacity .3s;pointer-events:none}
.ag-holdem .dbtn{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:#fff4ea;color:#1b0d03;font-family:var(--display);font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,.5),inset 0 0 0 2px #e2d6c8;z-index:5;transition:left .45s,top .45s}
.ag-holdem .msg{position:absolute;left:50%;top:100%;margin-top:8px;transform:translateX(-50%);width:max-content;max-width:min(560px,70vw);z-index:8;background:rgba(20,16,14,.92);border:1px solid var(--line);border-radius:12px;padding:5px 14px;font-size:13.5px;line-height:1.4;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.5);animation:aghemsg .3s ease-out}
.ag-holdem .msg:empty{display:none}
.ag-holdem .msg b{color:var(--gold)}
@keyframes aghemsg{from{opacity:0;transform:translate(-50%,8px)}}
.ag-holdem .acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:10px 12px;min-height:62px}
.ag-holdem .acts .btn{min-width:92px;justify-content:center}
.ag-holdem .acts .btn.fold{background:var(--panel2);border:1px solid var(--line);color:var(--bad)}
.ag-holdem .acts .btn.allin{background:#3a1512;border:1px solid #6b2420;color:#ffb3ad}
.ag-holdem .acts .rz{display:flex;align-items:center;gap:6px;flex:1;min-width:250px;flex-wrap:wrap}
.ag-holdem .acts input[type=range]{flex:1;min-width:120px;accent-color:var(--ember)}
.ag-holdem .acts .amt{font-family:var(--mono);font-weight:700;min-width:62px;text-align:right;color:var(--ember)}
.ag-holdem .acts .pre{height:26px;padding:0 7px;border-radius:7px;font-size:11.5px;font-weight:600;color:var(--muted);background:var(--panel2);border:1px solid var(--line)}
.ag-holdem .acts .pre:hover{color:var(--fg)}
.ag-holdem .acts .wait{color:var(--muted);font-size:13.5px;flex:1}
.ag-holdem .acts kbd{font-family:var(--mono);font-size:10.5px;opacity:.65;margin-left:2px}
.ag-holdem aside{display:flex;flex-direction:column;gap:10px;min-width:0}
.ag-holdem .box{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 12px;font-size:13px}
.ag-holdem .box summary{cursor:pointer;font-weight:700;color:var(--fg);list-style:none;display:flex;align-items:center;gap:6px}
.ag-holdem .box summary::-webkit-details-marker{display:none}
.ag-holdem .box summary::after{content:"▾";margin-left:auto;color:var(--muted);transition:transform .2s}
.ag-holdem .box:not([open]) summary::after{transform:rotate(-90deg)}
.ag-holdem .coach .row{display:flex;justify-content:space-between;gap:8px;margin-top:6px;color:var(--muted)}
.ag-holdem .coach .row b{color:var(--fg);text-align:right}
.ag-holdem .coach .meter{height:7px;border-radius:5px;background:var(--panel2);margin-top:4px;position:relative;overflow:hidden}
.ag-holdem .coach .meter i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,var(--ember),var(--gold));border-radius:5px;transition:width .4s}
.ag-holdem .coach .meter u{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--cool)}
.ag-holdem .coach .sug{margin-top:9px;padding:8px 10px;border-radius:10px;background:rgba(111,211,199,.08);border:1px solid rgba(111,211,199,.25)}
.ag-holdem .coach .sug b{display:block;color:var(--cool);font-size:14px}
.ag-holdem .coach .sug span{color:var(--muted);font-size:12.5px;line-height:1.4;display:block;margin-top:2px}
.ag-holdem .coach .outs{font-size:12px;color:var(--muted);margin-top:3px;line-height:1.35}
.ag-holdem .coach .idle{color:var(--dim);margin-top:6px}
.ag-holdem .log{height:210px;overflow-y:auto;font-size:12px;line-height:1.45;color:var(--muted);margin-top:6px;padding-right:4px}
.ag-holdem .log div{padding:1px 0}
.ag-holdem .log .h{color:var(--fg);font-weight:700;margin-top:4px;border-top:1px solid var(--line);padding-top:4px}
.ag-holdem .log .w{color:var(--gold)}
.ag-holdem .log .y{color:var(--ember)}
.ag-holdem .tips{margin-top:10px}
.ag-holdem .tips ul{margin:6px 0 2px;padding-left:18px;color:var(--muted)}
.ag-holdem .tips li{margin:2px 0}
.ag-holdem .styles{display:flex;flex-direction:column;gap:5px;margin-top:6px}
.ag-holdem .styles div{display:flex;gap:8px;align-items:flex-start;color:var(--muted);font-size:12.5px}
.ag-holdem .styles b{color:var(--fg)}
`;

  let inst = null;

  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const opts = Object.assign({ opp: 4, fast: false, coach: true }, api.load('opts') || {});
    if ([3, 4, 5].indexOf(opts.opp) < 0) opts.opp = 4;
    const stats = Object.assign({ hands: 0, won: 0, biggest: 0, high: BUYIN, rebuys: 0 }, api.load('stats') || {});
    let soundOn = api.load('sound'); if (soundOn === null) soundOn = !!api.sound;
    let actx = null;
    function tone(f, d, type, vol, f2, delay) {
      if (!soundOn) return;
      try {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        const t = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(0.0001, actx.currentTime); g.gain.setValueAtTime(vol || 0.04, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
      } catch (e) { /* ignore */ }
    }
    const sfx = {
      card: () => tone(900, 0.03, 'triangle', 0.025, 600),
      chip: () => { tone(2200, 0.03, 'square', 0.012); tone(1800, 0.04, 'square', 0.01, null, 0.035); },
      check: () => tone(240, 0.05, 'sine', 0.05),
      fold: () => tone(300, 0.08, 'sine', 0.025, 180),
      turn: () => tone(660, 0.07, 'sine', 0.035, 880),
      win: () => { tone(523, 0.12, 'triangle', 0.05); tone(659, 0.12, 'triangle', 0.05, null, 0.12); tone(784, 0.2, 'triangle', 0.05, null, 0.24); },
      lose: () => tone(220, 0.25, 'sine', 0.035, 150),
      allin: () => { tone(330, 0.15, 'sawtooth', 0.025, 660); },
    };
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    // game-flow step: waits while the game is hidden
    const step = (fn, ms) => later(function run() { if (document.hidden || el.offsetParent === null) { later(run, 400); return; } fn(); }, ms);

    const root = document.createElement('div'); root.className = 'ag-holdem';
    root.innerHTML = `
<div class="hd"><div class="ttl"><h2>Texas <span>Hold'em</span></h2><div class="how">No-limit poker vs the Mule's card room. Make the best five-card hand from your two cards and the five on the board, or make everyone else fold. Blinds rise every ${HANDS_PER_LEVEL} hands; your chips carry over.</div></div>
<div class="stats"><div class="st sc"><b>CHIPS</b><i data-r="chips">0</i></div><div class="st"><b>BLINDS</b><i data-r="blinds">5/10</i><small data-r="lvl"></small></div><div class="st"><b>BEST</b><i data-r="best">0</i></div></div></div>
<div class="bar">
<button class="btn sec small" data-r="newtable" title="Fresh opponents, blinds back to the start (your chips stay)">New table</button>
<button class="btn pri small" data-r="rebuy" hidden>Rebuy ${fmtN(BUYIN)}</button>
<div class="seg" data-r="opp" title="Number of computer opponents"><label>Opponents</label><button data-v="3">3</button><button data-v="4">4</button><button data-v="5">5</button></div>
<div class="seg" data-r="speed"><button data-v="0">Normal</button><button data-v="1">Fast</button></div>
<span class="sp"></span><span class="rec" data-r="rec"></span>
<button class="btn sec small" data-r="snd"></button></div>
<div class="main">
 <div class="left">
  <div class="felt" data-r="felt"><div class="oval"></div>
   <div class="center"><div class="pot" data-r="pot"></div><div class="board" data-r="board"></div><div class="msg" data-r="msg"></div></div>
   <div class="dbtn" data-r="dbtn">D</div>
  </div>
  <div class="acts" data-r="acts"></div>
 </div>
 <aside>
  <details class="box coach" data-r="coachbox"><summary>🎓 Coach</summary><div data-r="coach"></div></details>
  <div class="box"><b style="font-size:13px">Hand log</b><div class="log" data-r="log"></div></div>
 </aside>
</div>
<details class="box tips"><summary>Rules, hand rankings &amp; opponents</summary><ul>
<li>Each player gets two private cards. Betting rounds: before the flop, after the flop (3 board cards), the turn (4th) and the river (5th). The best five-card hand at showdown wins; ties split the pot.</li>
<li>Hand ranks, best first: Straight flush · Four of a kind · Full house · Flush · Straight · Three of a kind · Two pair · Pair · High card. Equal hands are decided by kickers (the highest unpaired cards).</li>
<li>No-limit: bet anything from the minimum raise up to all your chips. If someone is all-in for less, side pots are made so they can only win what they covered.</li>
<li>Pot odds: if a call costs 50 into a 150 pot, you need to win at least 50 / (150 + 50) = 25% of the time to profit. The Coach compares that with your chances.</li>
<li>Keys: C or Space check/call · F or X fold · R or Z raise · A all-in · ←/→ adjust raise · Enter next hand.</li>
</ul><div class="styles" data-r="styles"></div></details>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const felt = $('felt'), boardEl = $('board'), acts = $('acts'), logEl = $('log');
    $('coachbox').open = !!opts.coach;
    $('styles').innerHTML = Object.keys(STY).map(k => { const s = STY[k]; return '<div><span>' + s.icon + '</span><span><b>' + s.name + '</b> · <span style="color:' + s.col + '">' + s.tag + '</span> — ' + s.desc + '</span></div>'; }).join('');

    /* ---------------------------------------------------------------- table state */
    let P = [];          // players, index 0 = you, clockwise
    let T = null;        // table: {lvl, handsAt, btn, handNo}
    let H = null;        // current hand
    let busted = false;
    let seatEls = [];
    let coachKey = '', coachData = null;

    function mkPlayer(style, stack, i) {
      const s = style ? STY[style] : null;
      return { i, you: !style, style, name: s ? s.name : 'You', icon: s ? s.icon : '🫏', tag: s ? s.tag : 'That\'s you', col: s ? s.col : 'var(--ember)', stack, hole: [], bet: 0, total: 0, folded: false, allin: false, acted: false, raiseId: -1, raises: 0, last: '', lastCls: '', shown: false };
    }
    function buildTable(saved) {
      const lineup = LINEUP[opts.opp];
      let youStack = BUYIN;
      if (saved && typeof saved.you === 'number') youStack = Math.max(0, Math.floor(saved.you));
      P = [mkPlayer(null, youStack, 0)];
      const sameLine = saved && saved.bots && saved.bots.length === lineup.length && saved.bots.every((b, k) => b.s === lineup[k]);
      lineup.forEach((s, k) => P.push(mkPlayer(s, sameLine ? Math.max(0, saved.bots[k].c) || BUYIN : BUYIN, k + 1)));
      T = sameLine ? { lvl: saved.lvl || 0, handsAt: saved.handsAt || 0, btn: (saved.btn || 0) % P.length, handNo: saved.handNo || 0 } : { lvl: 0, handsAt: 0, btn: Math.floor(Math.random() * P.length), handNo: 0 };
      T.lvl = Math.min(LEVELS.length - 1, Math.max(0, T.lvl));
      busted = P[0].stack <= 0;
      buildSeats();
    }
    function saveTable() {
      api.save('table', { you: P[0].stack, bots: P.slice(1).map(p => ({ s: p.style, c: p.stack })), lvl: T.lvl, handsAt: T.handsAt, btn: T.btn, handNo: T.handNo });
    }
    function bumpHigh() {
      if (P[0].stack > stats.high) { stats.high = P[0].stack; api.save('best', stats.high); }
      else if (api.load('best') == null) api.save('best', stats.high);
    }

    /* ---------------------------------------------------------------- DOM: seats */
    function buildSeats() {
      seatEls.forEach(s => { s.seat.remove(); s.bet.remove(); });
      seatEls = [];
      const pos = SEATS[P.length];
      P.forEach((p, i) => {
        const seat = document.createElement('div'); seat.className = 'seat' + (p.you ? ' me' : '');
        const [x, y] = pos[i];
        seat.style.left = x + '%'; seat.style.top = y + '%';
        seat.style.setProperty('--c', p.col);
        seat.innerHTML = '<div class="cards"></div><div class="plate"><div class="av">' + p.icon + '</div><div class="nm"><b>' + p.name + '</b><small>' + p.tag + '</small><i>0</i></div></div><div class="bub"></div>';
        if (!p.you) seat.title = STY[p.style].desc;
        const bet = document.createElement('div'); bet.className = 'bet empty';
        const bx = p.you ? 50 : x + (50 - x) * 0.42, by = p.you ? 63 : y + (45 - y) * (y < 30 ? 0.58 : 0.48);
        bet.style.left = bx + '%'; bet.style.top = by + '%';
        bet.innerHTML = '<span class="chip"></span><span>0</span>';
        felt.appendChild(seat); felt.appendChild(bet);
        seatEls.push({ seat, bet, bx, by, x, y, cards: seat.querySelector('.cards'), stk: seat.querySelector('.nm i'), bub: seat.querySelector('.bub'), key: '' });
      });
    }
    function cardHTML(c, extra) {
      if (c < 0) return '<div class="pc back ' + (extra || '') + '"></div>';
      const red = (c & 3) === 1 || (c & 3) === 2;
      return '<div class="pc' + (red ? ' red' : '') + ' ' + (extra || '') + '" data-c="' + c + '"><span class="r">' + RCH[c >> 2] + '</span><span class="s1">' + SUITS[c & 3] + '</span><span class="s2">' + SUITS[c & 3] + '</span></div>';
    }
    let hiCards = null; // showdown highlight set
    function renderSeats() {
      P.forEach((p, i) => {
        const s = seatEls[i];
        s.stk.textContent = p.allin && H && H.phase !== 'done' ? 'ALL-IN' : fmtN(p.stack);
        s.seat.classList.toggle('fold', p.folded && !!H);
        s.seat.classList.toggle('turn', !!H && H.toAct === i && H.phase === 'bet');
        s.seat.classList.toggle('win', !!(H && H.winners && H.winners.has(i)));
        s.bub.textContent = p.last; s.bub.className = 'bub ' + (p.lastCls || '');
        // cards
        let show = [];
        if (p.hole.length) show = (p.you || p.shown) ? p.hole : [-1, -1];
        const key = show.join(',') + (hiCards ? '|' + p.hole.filter(c => hiCards.has(c)).join(',') : '') + (p.folded ? 'f' : '');
        if (key !== s.key) {
          const fresh = !s.key || s.key.split('|')[0] === '' || (s.key.indexOf('-1') >= 0 && show[0] >= 0);
          s.cards.innerHTML = show.map((c, k) => cardHTML(c, (fresh ? 'deal ' : '') + (hiCards ? (hiCards.has(c) ? 'hi' : 'lo') : ''))).join('');
          if (fresh) s.cards.querySelectorAll('.pc').forEach((n, k) => { n.style.animationDelay = (p.you ? 0 : (i * 60)) + k * 120 + 'ms'; });
          s.key = key;
        }
        const b = p.bet;
        s.bet.classList.toggle('empty', !b);
        if (b) s.bet.lastChild.textContent = fmtN(b);
      });
    }
    let boardKey = null;
    function renderBoard() {
      const b = H ? H.board : [];
      const key = b.join(',') + (hiCards ? '|' + b.filter(c => hiCards.has(c)).join(',') : '');
      if (key === boardKey) return;
      const prevLen = boardKey ? boardKey.split('|')[0].split(',').filter(x => x !== '').length : 0;
      boardKey = key;
      let html = '';
      for (let k = 0; k < 5; k++) {
        if (k < b.length) html += cardHTML(b[k], (k >= prevLen ? 'deal ' : '') + (hiCards ? (hiCards.has(b[k]) ? 'hi' : 'lo') : ''));
        else html += '<div class="bslot"></div>';
      }
      boardEl.innerHTML = html;
      boardEl.querySelectorAll('.pc.deal').forEach((n, k) => { n.style.animationDelay = k * 110 + 'ms'; });
    }
    function renderPot() {
      if (!H || H.phase === 'done') { $('pot').innerHTML = ''; return; }
      const pots = computePots(true), total = potTotal();
      let html = '';
      if (pots.length > 1) {
        html = '<span class="chip"></span>Main ' + fmtN(pots[0].amt);
        for (let k = 1; k < pots.length; k++) html += '<span class="side">Side ' + fmtN(pots[k].amt) + '</span>';
      } else if (total > 0) html = '<span class="chip"></span>Pot ' + fmtN(total);
      $('pot').innerHTML = html;
    }
    function renderDealer() {
      const s = seatEls[T.btn]; if (!s) return;
      const d = $('dbtn');
      const dx = s.x + (50 - s.x) * 0.2 + (s.x < 50 ? 4 : s.x > 50 ? -4 : 9), dy = s.y + (45 - s.y) * 0.3 + (P[T.btn].you ? -2 : 0);
      d.style.left = dx + '%'; d.style.top = dy + '%';
    }
    function hud() {
      $('chips').textContent = fmtN(P[0].stack);
      const L = LEVELS[T.lvl];
      $('blinds').textContent = L[0] + '/' + L[1];
      $('lvl').textContent = T.lvl < LEVELS.length - 1 ? 'up in ' + (HANDS_PER_LEVEL - T.handsAt) : 'max level';
      $('best').textContent = fmtN(stats.high);
      $('rec').textContent = 'Hands won ' + stats.won + '/' + stats.hands + (stats.biggest ? ' · biggest pot ' + fmtN(stats.biggest) : '');
      $('rebuy').hidden = !busted;
      root.querySelectorAll('[data-r="opp"] button').forEach(b => b.classList.toggle('on', +b.dataset.v === opts.opp));
      root.querySelectorAll('[data-r="speed"] button').forEach(b => b.classList.toggle('on', (b.dataset.v === '1') === !!opts.fast));
      $('snd').textContent = soundOn ? '🔊' : '🔇';
    }
    function render() { renderSeats(); renderBoard(); renderPot(); renderDealer(); hud(); renderActs(); renderCoach(); }
    function msg(html) { const m = $('msg'); m.innerHTML = ''; void m.offsetWidth; m.innerHTML = html || ''; }
    function log(text, cls) {
      const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = text;
      logEl.appendChild(d);
      while (logEl.children.length > 120) logEl.removeChild(logEl.firstChild);
      logEl.scrollTop = logEl.scrollHeight;
    }
    function sizeFelt() {
      const w = felt.clientWidth || 760;
      root.classList.toggle('narrow', (root.clientWidth || 1000) < 940);
      const rt = felt.getBoundingClientRect();
      const availH = window.innerHeight - Math.max(0, rt.top) - 110;
      const h = Math.round(Math.max(400, Math.min(w * 0.6, 540, Math.max(400, availH))));
      felt.style.height = h + 'px';
      const bw = Math.round(Math.max(40, Math.min(62, Math.min(w * 0.065, h * 0.11))));
      root.style.setProperty('--bw', bw + 'px');
    }

    /* ---------------------------------------------------------------- betting engine */
    const nP = () => P.length;
    const nextIdx = i => (i + 1) % nP();
    const inHand = p => !p.folded;
    const canAct = p => !p.folded && !p.allin;
    function potTotal() { let s = H.pot; for (const p of P) s += p.bet; return s; }
    function pay(p, amt) {
      amt = Math.max(0, Math.min(amt, p.stack));
      p.stack -= amt; p.bet += amt; p.total += amt;
      if (p.stack === 0) p.allin = true;
      return amt;
    }
    function canRaise(p) {
      if (!canAct(p) || p.raiseId === H.raiseId) return false;
      if (p.stack <= H.cur - p.bet) return false;
      return P.some(q => q !== p && canAct(q));
    }
    function startHand() {
      if (busted) return;
      clearTimersOnly();
      msg(''); hiCards = null;
      const L = LEVELS[T.lvl];
      T.handNo++;
      // move the button
      T.btn = nextIdx(T.btn);
      const deck = []; for (let c = 0; c < 52; c++) deck.push(c);
      for (let i = 51; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
      H = { deck, board: [], pot: 0, cur: 0, minRaise: L[1], raiseId: 0, phase: 'bet', toAct: -1, sbAmt: L[0], bbAmt: L[1], winners: null, startStacks: P.map(p => p.stack), no: T.handNo };
      P.forEach(p => { Object.assign(p, { hole: [], bet: 0, total: 0, folded: false, allin: false, acted: false, raiseId: -1, raises: 0, last: '', lastCls: '', shown: false }); });
      seatEls.forEach(s => { s.key = ''; }); boardKey = null;
      log('Hand #' + T.handNo + ' · blinds ' + L[0] + '/' + L[1], 'h');
      // blinds
      const sb = nextIdx(T.btn), bb = nextIdx(sb);
      H.sb = sb; H.bb = bb;
      pay(P[sb], L[0]); P[sb].last = 'SB ' + P[sb].bet;
      pay(P[bb], L[1]); P[bb].last = 'BB ' + P[bb].bet;
      H.cur = L[1];
      // deal
      for (let r = 0; r < 2; r++) for (let k = 1; k <= nP(); k++) P[(T.btn + k) % nP()].hole.push(deck.pop());
      for (let k = 0; k < 4; k++) later(sfx.card, k * 90);
      saveTable();
      render();
      step(() => askNext(bb), 700);
    }
    function findNext(from) {
      for (let k = 1; k <= nP(); k++) {
        const i = (from + k) % nP(), p = P[i];
        if (canAct(p) && (!p.acted || p.bet < H.cur)) return i;
      }
      return -1;
    }
    function roundDone() {
      const able = P.filter(canAct);
      if (!able.length) return true;
      if (able.length === 1 && able[0].bet >= H.cur) return true;
      return able.every(p => p.acted && p.bet === H.cur);
    }
    function askNext(from) {
      if (P.filter(inHand).length === 1) { winByFold(); return; }
      if (roundDone()) { endStreet(); return; }
      const i = findNext(from);
      if (i < 0) { endStreet(); return; }
      H.toAct = i;
      if (P[i].you) { sfx.turn(); render(); }
      else {
        render();
        const d = opts.fast ? 260 + Math.random() * 160 : 650 + Math.random() * 550;
        step(() => { const a = botDecide(P[i]); act(i, a.a, a.amt); }, d);
      }
    }
    function act(i, a, amt) {
      if (!H || H.phase !== 'bet' || H.toAct !== i) return;
      const p = P[i], toCall = H.cur - p.bet, wasOpen = H.cur > 0;
      if (a === 'fold' && toCall <= 0) a = 'check';
      if (a === 'raise' && (amt == null || amt <= H.cur)) a = toCall > 0 ? 'call' : 'check';
      if (a === 'raise' && !canRaise(p)) a = toCall > 0 ? 'call' : 'check';
      if (a === 'check' && toCall > 0) a = 'call';
      let text = '', you = '';
      if (a === 'fold') { p.folded = true; p.last = 'Fold'; p.lastCls = 'fold'; sfx.fold(); text = 'folds'; you = 'fold'; }
      else if (a === 'check') { p.last = 'Check'; p.lastCls = ''; sfx.check(); text = 'checks'; you = 'check'; }
      else if (a === 'call') {
        const paid = pay(p, toCall);
        p.last = p.allin ? 'All-in ' + fmtN(p.bet) : 'Call ' + fmtN(paid); p.lastCls = p.allin ? 'allin' : '';
        text = p.allin ? 'calls all-in for ' + fmtN(paid) : 'calls ' + fmtN(paid); you = text.replace('calls', 'call');
        if (p.allin) sfx.allin(); else sfx.chip();
      } else {
        amt = Math.min(Math.floor(amt), p.bet + p.stack);
        pay(p, amt - p.bet);
        const by = amt - H.cur;
        if (by >= H.minRaise) { H.minRaise = by; H.raiseId++; }
        H.cur = Math.max(H.cur, amt);
        p.raises++;
        const verb = wasOpen ? 'raises to ' : 'bets ';
        p.last = p.allin ? 'All-in ' + fmtN(amt) : (wasOpen ? 'Raise ' : 'Bet ') + fmtN(amt);
        p.lastCls = p.allin ? 'allin' : 'raise';
        text = p.allin ? 'goes all-in for ' + fmtN(amt) : verb + fmtN(amt); you = p.allin ? 'go all-in for ' + fmtN(amt) : (wasOpen ? 'raise to ' : 'bet ') + fmtN(amt);
        if (p.allin) sfx.allin(); else sfx.chip();
      }
      p.acted = true; p.raiseId = H.raiseId;
      log(p.you ? 'You ' + you : p.name + ' ' + text, p.you ? 'y' : '');
      if (p.you) { saveTable(); coachKey = ''; }
      H.toAct = -1;
      render();
      step(() => askNext(i), 120);
    }
    function returnUncalled() {
      // the biggest bet nobody matched goes back to its owner
      let hi = -1, hiAmt = 0, second = 0;
      P.forEach((p, i) => { if (p.bet > hiAmt) { second = hiAmt; hiAmt = p.bet; hi = i; } else if (p.bet > second) second = p.bet; });
      if (hi >= 0 && hiAmt > second) {
        const back = hiAmt - second, p = P[hi];
        p.bet -= back; p.total -= back; p.stack += back; if (p.stack > 0) p.allin = false;
        if (back > 0 && P.filter(inHand).length > 1) log('Uncalled ' + fmtN(back) + ' returned to ' + (p.you ? 'you' : p.name));
      }
    }
    function collectBets(then) {
      returnUncalled();
      let any = false;
      seatEls.forEach((s, i) => { if (P[i].bet > 0) { any = true; s.bet.style.left = '50%'; s.bet.style.top = '36%'; s.bet.style.opacity = '0'; } });
      if (any) sfx.chip();
      step(() => {
        P.forEach(p => { H.pot += p.bet; p.bet = 0; });
        seatEls.forEach(s => { s.bet.classList.add('empty'); s.bet.style.transition = 'none'; s.bet.style.left = s.bx + '%'; s.bet.style.top = s.by + '%'; s.bet.style.opacity = ''; void s.bet.offsetWidth; s.bet.style.transition = ''; });
        render();
        then();
      }, any ? 420 : 10);
    }
    function endStreet() {
      H.toAct = -1;
      collectBets(() => {
        const live = P.filter(inHand);
        if (live.length === 1) { winByFold(); return; }
        if (H.board.length === 5) { showdown(); return; }
        const able = live.filter(canAct);
        const runout = able.length <= 1;
        if (runout && !H.revealed) {
          H.revealed = true; H.phase = 'runout';
          live.forEach(p => { p.shown = true; });
          log('All-in: cards are turned up');
        }
        // next street
        H.deck.pop(); // burn
        const n = H.board.length === 0 ? 3 : 1;
        for (let k = 0; k < n; k++) H.board.push(H.deck.pop());
        const name = H.board.length === 3 ? 'Flop' : H.board.length === 4 ? 'Turn' : 'River';
        log(name + ': ' + H.board.map(cstr).join(' '));
        for (let k = 0; k < n; k++) later(sfx.card, k * 110);
        P.forEach(p => { p.bet = 0; p.acted = false; p.raiseId = -1; p.raises = 0; if (!p.folded && !p.allin) { p.last = ''; p.lastCls = ''; } });
        H.cur = 0; H.minRaise = H.bbAmt; H.raiseId++;
        coachKey = '';
        render();
        if (runout) { step(endStreet, opts.fast ? 900 : 1400); return; }
        step(() => askNext(T.btn), 650);
      });
    }

    /* pots: layered by contribution; folded chips count but can't win */
    function computePots(liveOnly) {
      const contrib = P.map(p => liveOnly ? p.total - p.bet : p.total);
      const levels = [...new Set(P.filter((p, i) => !p.folded && contrib[i] > 0).map((p, i2) => contrib[P.indexOf(p)]))].sort((a, b) => a - b);
      const pots = []; let prev = 0;
      for (const lv of levels) {
        let amt = 0; P.forEach((p, i) => { amt += Math.min(contrib[i], lv) - Math.min(contrib[i], prev); });
        const elig = []; P.forEach((p, i) => { if (!p.folded && contrib[i] >= lv) elig.push(i); });
        if (amt > 0) {
          const last = pots[pots.length - 1];
          if (last && last.elig.length === elig.length) last.amt += amt; else pots.push({ amt, elig });
        }
        prev = lv;
      }
      let extra = 0; P.forEach((p, i) => { extra += Math.max(0, contrib[i] - prev); });
      if (extra > 0) { if (pots.length) pots[pots.length - 1].amt += extra; else pots.push({ amt: extra, elig: P.map((p, i) => i).filter(i => !P[i].folded) }); }
      return pots;
    }
    function flyChips(toIdx, amount) {
      const s = seatEls[toIdx]; if (!s) return;
      const f = document.createElement('div'); f.className = 'fly';
      const n = Math.min(5, 1 + Math.floor(Math.log10(Math.max(10, amount))));
      f.innerHTML = Array.from({ length: n }, (_, k) => '<span class="chip' + (k % 2 ? ' g' : '') + '"></span>').join('');
      f.style.left = '50%'; f.style.top = '36%';
      felt.appendChild(f); void f.offsetWidth;
      f.style.left = s.x + '%'; f.style.top = s.y + '%';
      later(() => { f.style.opacity = '0'; }, 560);
      later(() => f.remove(), 900);
    }
    function winByFold() {
      H.toAct = -1;
      collectBets(() => {
        const w = P.findIndex(inHand);
        const amt = H.pot;
        H.winners = new Set([w]);
        P[w].stack += amt; H.pot = 0;
        P[w].last = 'Wins ' + fmtN(amt); P[w].lastCls = 'hand';
        log((P[w].you ? 'You win ' : P[w].name + ' wins ') + fmtN(amt) + ' (everyone else folded)', 'w');
        msg('<b>' + (P[w].you ? 'You' : P[w].name) + '</b> ' + (P[w].you ? 'win ' : 'wins ') + fmtN(amt) + ' — everyone else folded');
        flyChips(w, amt);
        if (P[w].you) sfx.win(); else sfx.chip();
        finishHand(P[w].you ? amt : 0);
      });
    }
    function showdown() {
      H.phase = 'showdown'; H.toAct = -1;
      const live = P.map((p, i) => i).filter(i => !P[i].folded);
      live.forEach(i => { P[i].shown = true; });
      const score = {}; live.forEach(i => { score[i] = evalCards(P[i].hole.concat(H.board)); });
      live.forEach(i => { if (!P[i].you) P[i].last = describe(score[i]).replace(/,.*$/, ''); P[i].lastCls = ''; });
      if (P[0].folded === false) P[0].last = describe(score[0]).replace(/,.*$/, '');
      const pots = computePots(false);
      H.pot = 0;
      const won = P.map(() => 0);
      const lines = [];
      pots.forEach((pot, k) => {
        let best = -1; pot.elig.forEach(i => { if (score[i] > best) best = score[i]; });
        const winners = pot.elig.filter(i => score[i] === best);
        if (pot.elig.length === 1) { won[winners[0]] += pot.amt; return; } // uncontested remainder
        const share = Math.floor(pot.amt / winners.length / 5) * 5;
        let rest = pot.amt - share * winners.length;
        // odd chips go to the first winner left of the button
        const order = winners.slice().sort((a, b) => ((a - T.btn - 1 + nP()) % nP()) - ((b - T.btn - 1 + nP()) % nP()));
        order.forEach(i => { won[i] += share; });
        won[order[0]] += rest;
        const losers = pot.elig.filter(i => score[i] !== best);
        let runner = -1; losers.forEach(i => { if (score[i] > runner) runner = score[i]; });
        const kick = runner >= 0 ? kickerNote(best, runner) : '';
        const potName = pots.length > 1 ? (k === 0 ? 'main pot' : 'side pot' + (pots.length > 2 ? ' ' + k : '')) : 'the pot';
        const who = order.map(i => P[i].you ? 'You' : P[i].name).join(' & ');
        const split = winners.length > 1;
        lines.push({ who, potName, amt: pot.amt, hand: describe(best) + (kick ? ' (' + kick + ')' : ''), split, winners: order, best });
      });
      H.winners = new Set(); lines.forEach(l => l.winners.forEach(i => H.winners.add(i)));
      // highlight the winning five cards of the main pot winner
      if (lines.length) {
        const w = lines[0].winners[0];
        hiCards = new Set(best5(P[w].hole.concat(H.board)));
      }
      P.forEach((p, i) => { p.stack += won[i]; });
      lines.forEach(l => log((l.split ? l.who + ' split ' : l.who + (l.who === 'You' ? ' win ' : ' wins ')) + l.potName + ' ' + fmtN(l.amt) + ' — ' + l.hand, 'w'));
      live.forEach(i => { log((P[i].you ? 'You show ' : P[i].name + ' shows ') + P[i].hole.map(cstr).join(' ') + ' — ' + describe(score[i])); });
      if (lines.length) {
        msg(lines.map(l => '<b>' + l.who + '</b> ' + (l.split ? 'split ' : (l.who === 'You' ? 'win ' : 'wins ')) + (pots.length > 1 ? l.potName + ' ' : '') + fmtN(l.amt) + ' · ' + l.hand).join('<br>'));
      }
      H.winners.forEach(i => { flyChips(i, won[i]); P[i].lastCls = 'hand'; });
      if (H.winners.has(0)) sfx.win(); else if (!P[0].folded) sfx.lose(); else sfx.chip();
      finishHand(won[0]);
    }
    function finishHand(youWon) {
      H.phase = 'done'; H.toAct = -1;
      H.drift = P.reduce((t, p) => t + p.stack, 0) - H.startStacks.reduce((t, v) => t + v, 0); // chip conservation check (should be 0)
      stats.hands++;
      if (youWon > 0) { stats.won++; if (youWon > stats.biggest) stats.biggest = youWon; }
      // bots that went broke reload
      P.forEach(p => { if (!p.you && p.stack <= 0) { p.stack = BUYIN; log(p.name + ' reloads ' + fmtN(BUYIN)); } });
      busted = P[0].stack <= 0;
      if (busted) log('You are out of chips — rebuy to keep playing', 'y');
      bumpHigh();
      // blind level
      T.handsAt++;
      if (T.handsAt >= HANDS_PER_LEVEL && T.lvl < LEVELS.length - 1) {
        T.lvl++; T.handsAt = 0;
        const L = LEVELS[T.lvl];
        log('Blinds go up to ' + L[0] + '/' + L[1], 'h');
        api.toast('Blinds up: ' + L[0] + '/' + L[1]);
      } else if (T.handsAt >= HANDS_PER_LEVEL) T.handsAt = HANDS_PER_LEVEL;
      api.save('stats', stats);
      saveTable();
      coachKey = '';
      render();
    }

    /* ---------------------------------------------------------------- computer players */
    function botDecide(p) {
      const st = STY[p.style];
      const toCall = H.cur - p.bet;
      const potAll = potTotal();
      const opps = P.filter(q => q !== p && inHand(q)).length;
      const eq = mcEquity(p.hole, H.board, opps, 320);
      const adv = eq * (opps + 1);
      const r = Math.random();
      const pre = H.board.length === 0;
      const canR = canRaise(p) && p.raises < (st.aggr > 0.7 ? 3 : 2);
      const stackTot = p.stack + p.bet;
      const raise = () => ({ a: 'raise', amt: raiseSize(p, st, adv) });
      if (toCall <= 0) {
        if (canR && ((adv >= st.raiseAdv && r < 0.3 + st.aggr * 0.65) || (!pre && r < st.bluff) || (pre && adv >= st.vpip * 1.25 && r < st.aggr * 0.5))) return raise();
        return { a: 'check' };
      }
      const potOdds = toCall / (potAll + toCall);
      const commit = toCall / Math.max(1, stackTot);
      const need = potOdds - st.slack + commit * (st.slack > 0.1 ? 0.04 : 0.16);
      if (pre) {
        const cheap = toCall <= H.bbAmt;
        if (adv < st.vpip * (1 + commit * 0.8) && !(cheap && adv >= st.vpip * 0.8 && r < 0.5)) {
          if (canR && r < st.bluff * 0.5 && H.cur <= H.bbAmt * 3) return raise();
          return { a: 'fold' };
        }
        if (canR && adv >= st.raiseAdv * (1 + commit * 0.6) && r < st.aggr) return raise();
        if (eq >= need * 0.9 || cheap) return { a: 'call' };
        return { a: 'fold' };
      }
      if (canR && adv >= st.raiseAdv * (1 + commit * 0.5) && r < st.aggr) return raise();
      if (canR && r < st.bluff * 0.6 && commit < 0.25) return raise();
      if (eq >= need) return { a: 'call' };
      if (p.style === 'station' && r < 0.3 && commit < 0.3) return { a: 'call' };
      return { a: 'fold' };
    }
    function raiseSize(p, st, adv) {
      const pre = !H.board.length, toCall = H.cur - p.bet, potAll = potTotal();
      let to;
      if (pre) {
        if (H.cur <= H.bbAmt) { const limpers = P.filter(q => q.bet === H.bbAmt && q.acted).length; to = H.bbAmt * (2.5 + Math.random() * 1.2 + limpers); }
        else to = H.cur * (2.6 + Math.random() * 0.8);
      } else to = H.cur + (potAll + toCall) * st.size * (0.75 + Math.random() * 0.5);
      to = Math.max(round5(to), H.cur + H.minRaise);
      const max = p.stack + p.bet;
      if (to >= max * 0.6 || (adv > 2.6 && Math.random() < 0.12 * (st.aggr + 0.3))) to = max;
      return Math.min(to, max);
    }

    /* ---------------------------------------------------------------- your controls */
    let raiseAmt = 0;
    function myLimits() {
      const p = P[0];
      const max = p.bet + p.stack;
      const min = Math.min(H.cur + H.minRaise, max);
      return { min, max };
    }
    function renderActs() {
      if (!H || H.phase === 'done' || !H) {
        if (busted) acts.innerHTML = '<span class="wait">You\'re out of chips. Rebuy for ' + fmtN(BUYIN) + ' to sit back in.</span><button class="btn pri" data-a="rebuy">Rebuy &amp; deal <kbd>⏎</kbd></button>';
        else acts.innerHTML = '<span class="wait">' + (H ? 'Hand over.' : 'Take a seat — the Mule is shuffling.') + '</span><button class="btn pri" data-a="deal">' + (H ? 'Next hand' : 'Deal') + ' <kbd>⏎</kbd></button>';
        return;
      }
      const p = P[0];
      if (H.phase !== 'bet' || H.toAct !== 0) {
        let t = p.folded ? 'You folded — watching the hand play out.' : p.allin ? 'You\'re all-in. Good luck!' : H.phase === 'runout' ? 'Running out the board…' : (H.toAct > 0 ? P[H.toAct].name + ' is thinking…' : '…');
        acts.innerHTML = '<span class="wait">' + t + '</span>';
        return;
      }
      const toCall = H.cur - p.bet;
      const cr = canRaise(p);
      const lim = myLimits();
      if (raiseAmt < lim.min || raiseAmt > lim.max) raiseAmt = defaultRaise();
      let html = '';
      html += toCall > 0 ? '<button class="btn fold" data-a="fold">Fold <kbd>F</kbd></button>' : '';
      html += toCall > 0 ? '<button class="btn sec" data-a="call">' + (toCall >= p.stack ? 'Call all-in ' + fmtN(p.stack) : 'Call ' + fmtN(toCall)) + ' <kbd>C</kbd></button>'
        : '<button class="btn sec" data-a="check">Check <kbd>C</kbd></button>';
      if (cr) {
        const verb = H.cur > 0 ? 'Raise to' : 'Bet';
        html += '<div class="rz"><input type="range" data-a="slider" min="' + lim.min + '" max="' + lim.max + '" step="5" value="' + raiseAmt + '"><span class="amt" data-a="amt">' + fmtN(raiseAmt) + '</span>' +
          '<button class="pre" data-a="p" data-f="0.5">½ pot</button><button class="pre" data-a="p" data-f="0.75">¾</button><button class="pre" data-a="p" data-f="1">Pot</button></div>' +
          '<button class="btn pri" data-a="raise">' + verb + ' <span data-a="amt2">' + fmtN(raiseAmt) + '</span> <kbd>R</kbd></button>' +
          '<button class="btn allin" data-a="allin">All-in <kbd>A</kbd></button>';
      }
      acts.innerHTML = html;
    }
    function potRaise(f) {
      const p = P[0], toCall = H.cur - p.bet;
      return H.cur + Math.round((potTotal() + toCall) * f);
    }
    function defaultRaise() {
      const lim = myLimits();
      let v;
      if (!H.board.length) v = H.cur <= H.bbAmt ? H.bbAmt * 3 : H.cur * 3;
      else v = H.cur > 0 ? H.cur * 3 : potRaise(0.66);
      return clampRaise(v, lim);
    }
    function clampRaise(v, lim) { lim = lim || myLimits(); v = round5(v); return Math.max(lim.min, Math.min(lim.max, v)); }
    function setRaise(v) {
      raiseAmt = clampRaise(v);
      const s = acts.querySelector('[data-a="slider"]'); if (s) s.value = raiseAmt;
      const a1 = acts.querySelector('[data-a="amt"]'), a2 = acts.querySelector('[data-a="amt2"]');
      if (a1) a1.textContent = fmtN(raiseAmt); if (a2) a2.textContent = fmtN(raiseAmt);
    }
    function myAct(a) {
      if (!H || H.phase !== 'bet' || H.toAct !== 0) return;
      const p = P[0];
      if (a === 'fold') act(0, 'fold');
      else if (a === 'call' || a === 'check') act(0, H.cur - p.bet > 0 ? 'call' : 'check');
      else if (a === 'raise') { if (canRaise(p)) act(0, 'raise', raiseAmt); }
      else if (a === 'allin') { if (canRaise(p)) act(0, 'raise', p.bet + p.stack); else act(0, 'call'); }
      raiseAmt = 0;
    }
    function dealOrRebuy() {
      if (H && H.phase !== 'done') return;
      if (busted) { rebuy(); return; }
      if (H && H.phase === 'done' && T.handsAt >= HANDS_PER_LEVEL && T.lvl >= LEVELS.length - 1) { /* stay */ }
      if (P.length !== opts.opp + 1) { newTable(true); }
      startHand();
    }
    function rebuy() {
      if (!busted) return;
      P[0].stack = BUYIN; busted = false; stats.rebuys++;
      api.save('stats', stats); log('You rebuy for ' + fmtN(BUYIN), 'y');
      // a rebuy starts a fresh table so the blinds aren't huge
      T.lvl = 0; T.handsAt = 0;
      saveTable(); render();
      startHand();
    }
    function newTable(keepQuiet) {
      clearTimersOnly();
      const you = P.length ? P[0].stack : BUYIN;
      buildTable({ you });
      H = null; hiCards = null; boardKey = null;
      if (!keepQuiet) { log('New table: ' + P.slice(1).map(p => p.name).join(', '), 'h'); msg(''); }
      saveTable(); sizeFelt(); render();
    }

    /* ---------------------------------------------------------------- coach */
    function computeCoach() {
      const p = P[0];
      if (!H || !p.hole.length) return null;
      const opps = P.filter(q => q !== p && inHand(q)).length;
      const toCall = Math.max(0, H.cur - p.bet);
      const potAll = potTotal();
      const eq = mcEquity(p.hole, H.board, opps, 1600);
      const need = toCall > 0 ? toCall / (potAll + toCall) : 0;
      const out = { eq, need, opps, toCall, potAll };
      if (H.board.length) {
        const all = p.hole.concat(H.board), sc = evalCards(all);
        out.made = describe(sc);
        const bsc = evalCards(H.board);
        if (H.board.length === 5 && sc === bsc) out.made += ' (playing the board)';
        if (catOf(sc) === 1) {
          const pr = nib(sc, 0), bTop = Math.max(...H.board.map(c => c >> 2));
          const inHole = p.hole.some(c => (c >> 2) === pr);
          const pocket = (p.hole[0] >> 2) === (p.hole[1] >> 2);
          if (pocket && pr > bTop) out.made += ' — overpair';
          else if (inHole && pr === bTop) out.made += ' — top pair';
          else if (!inHole) out.made += ' — on the board';
        }
        // outs (only with cards to come)
        if (H.board.length < 5) {
          const used = new Set(all); const cat0 = catOf(sc), groups = {}; let n = 0;
          for (let c = 0; c < 52; c++) {
            if (used.has(c)) continue;
            const nv = evalCards(all.concat([c])), nc = catOf(nv);
            if (nc <= cat0) continue;
            const bc = catOf(evalCards(H.board.concat([c])));
            if (nc <= bc) continue; // improvement only on the board helps everyone
            if (nc === 1 && (c >> 2) < Math.max(...H.board.map(x => x >> 2))) continue; // pairing under the board is weak
            n++; groups[nc] = (groups[nc] || 0) + 1;
          }
          const unseen = 52 - all.length;
          out.outs = n;
          out.outList = Object.keys(groups).sort((a, b) => b - a).map(k => CAT[k] + ' ' + groups[k]).join(' · ');
          out.hitNext = n / unseen;
          out.hitRiver = H.board.length === 3 ? 1 - ((unseen - n) * (unseen - n - 1)) / (unseen * (unseen - 1)) : n / unseen;
        }
      } else {
        const t = startTier(p.hole);
        out.made = startName(p.hole) + ' — ' + t.t;
        out.tier = t;
      }
      out.sug = suggest(out);
      return out;
    }
    function suggest(o) {
      const p = P[0], bb = H.bbAmt, lim = myLimits(), cr = canRaise(p);
      const adv = o.eq * (o.opps + 1), pct = x => Math.round(x * 100) + '%';
      const R = v => fmtN(clampRaise(v, lim));
      const left = (() => { let n = 0; for (let k = 1; k < nP(); k++) { const q = P[k]; if (canAct(q) && (!q.acted || q.bet < H.cur)) n++; } return n; })();
      if (!H.board.length) {
        const t = o.tier, raisedPot = H.cur > bb;
        if (o.toCall === 0) {
          if (t.k >= 2 && cr) return { a: 'Raise to ' + R(bb * 3), why: 'Nobody raised and you\'re in the big blind with ' + t.d + ' — charge the limpers.' };
          return { a: 'Check', why: 'You see the flop for free. No reason to put more in with this hand.' };
        }
        if (t.k >= 4) return cr ? { a: 'Raise to ' + R(raisedPot ? H.cur * 3 : bb * 3), why: 'This is ' + t.d + '. Build the pot now while others will pay.' } : { a: 'Call', why: 'Premium hand — you can\'t re-raise here, so just call.' };
        if (t.k === 3) {
          if (!raisedPot && cr) return { a: 'Raise to ' + R(bb * 3), why: 'A strong hand in an unraised pot: raise to take control and thin the field.' };
          return o.toCall <= p.stack * 0.12 ? { a: 'Call', why: 'Strong enough to call a raise, but not to build a huge pot before the flop.' } : { a: 'Fold', why: 'The raise is a big part of your stack; ' + startName(p.hole) + ' isn\'t strong enough to risk it.' };
        }
        if (t.k === 2) {
          if (!raisedPot && cr && left <= 2) return { a: 'Raise to ' + R(bb * 2.5 + bb), why: 'Good hand and few players left to act — raising often wins the blinds right away.' };
          if (!raisedPot) return { a: 'Call', why: 'Decent hand; with several players still to act, a cheap look at the flop is fine.' };
          return o.toCall <= bb * 3 ? { a: 'Call', why: 'Playable against a small raise.' } : { a: 'Fold', why: 'Against a sizeable raise this hand is usually behind.' };
        }
        if (t.k === 1) return o.toCall <= bb * 1.01 || (o.toCall <= bb * 2 && p.stack > bb * 40)
          ? { a: 'Call', why: 'Speculative: cheap to see a flop, and you can win a big pot when you hit.' }
          : { a: 'Fold', why: 'Speculative hands need a cheap flop; this costs too much.' };
        return { a: 'Fold', why: startName(p.hole) + ' is a weak starting hand — folding it saves chips over time.' };
      }
      const drawy = (o.outs || 0) >= 8 && H.board.length < 5;
      if (o.toCall === 0) {
        if ((adv >= 1.6 || o.eq >= 0.62) && cr) return { a: 'Bet ' + R(potRaise(0.66)), why: 'You\'re likely ahead (' + pct(o.eq) + ' to win) — bet about ⅔ pot so worse hands pay you.' };
        if (drawy && cr && o.opps <= 2) return { a: 'Bet ' + R(potRaise(0.5)), why: 'A semi-bluff: you may win now, and you have ' + o.outs + ' outs if called.' };
        return { a: 'Check', why: drawy ? 'Take the free card for your draw.' : 'Not strong enough to bet for value; check and see what happens.' };
      }
      if (o.eq >= o.need) {
        if ((adv >= 1.9 || o.eq >= 0.68) && cr) return { a: 'Raise to ' + R(H.cur * 3), why: 'You\'re a big favourite (' + pct(o.eq) + '). Raise to win more.' };
        return { a: 'Call', why: 'Your ' + pct(o.eq) + ' chance beats the ' + pct(o.need) + ' the pot odds require.' };
      }
      if (drawy && o.toCall <= p.stack * 0.12 && o.eq >= o.need * 0.7) return { a: 'Call', why: 'A bit short on direct odds (' + pct(o.eq) + ' vs ' + pct(o.need) + '), but hitting your draw can win a bigger pot later (implied odds).' };
      return { a: 'Fold', why: 'You need ' + pct(o.need) + ' to call but have only about ' + pct(o.eq) + ' — calling loses chips in the long run.' };
    }
    function renderCoach() {
      const box = $('coach');
      if (!$('coachbox').open) return;
      const myTurn = H && H.phase === 'bet' && H.toAct === 0;
      if (!H || !P[0].hole.length || P[0].folded) { box.innerHTML = '<div class="idle">' + (P[0].folded ? 'You folded this hand.' : 'Advice appears when it\'s your turn.') + '</div>'; coachKey = ''; return; }
      if (H.phase === 'done') {
        const all = P[0].hole.concat(H.board);
        box.innerHTML = '<div class="row"><span>Your hand</span><b>' + (H.board.length ? describe(evalCards(all)) : startName(P[0].hole)) + '</b></div><div class="idle">Hand over — advice returns on your next turn.</div>';
        coachKey = ''; return;
      }
      const key = H.no + '|' + H.board.length + '|' + H.cur + '|' + P[0].bet + '|' + P.filter(inHand).length + '|' + (myTurn ? 1 : 0) + '|' + H.phase;
      if (key === coachKey) return;
      coachKey = key;
      coachData = computeCoach();
      const o = coachData; if (!o) return;
      const pct = x => (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%';
      let html = '<div class="row"><span>Your hand</span><b>' + o.made + '</b></div>';
      html += '<div class="row"><span>Win chance vs ' + o.opps + ' hand' + (o.opps > 1 ? 's' : '') + '</span><b>' + pct(o.eq) + '</b></div>';
      html += '<div class="meter"><i style="width:' + Math.round(o.eq * 100) + '%"></i>' + (o.toCall > 0 ? '<u style="left:' + Math.round(o.need * 100) + '%" title="equity needed"></u>' : '') + '</div>';
      if (o.outs != null) {
        html += '<div class="row"><span>Outs</span><b>' + o.outs + (o.outs ? ' · ' + pct(o.hitNext) + ' next card' + (H.board.length === 3 ? ', ' + pct(o.hitRiver) + ' by river' : '') : '') + '</b></div>';
        if (o.outList) html += '<div class="outs">' + o.outList + '</div>';
      }
      html += '<div class="row"><span>Pot odds</span><b>' + (o.toCall > 0 ? 'call ' + fmtN(o.toCall) + ' to win ' + fmtN(o.potAll) + ' → need ' + pct(o.need) : 'free to check') + '</b></div>';
      if (H.phase !== 'done') {
        if (myTurn) html += '<div class="sug"><b>Suggest: ' + o.sug.a + '</b><span>' + o.sug.why + '</span></div>';
        else html += '<div class="idle">Suggestion shows on your turn.</div>';
      }
      html += '<div class="outs" style="margin-top:6px;color:var(--dim)">Win chance assumes random opponent hands; tighten up against big bets from tight players.</div>';
      box.innerHTML = html;
    }

    /* ---------------------------------------------------------------- input */
    function onClick(e) {
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      const r = b.dataset.r, par = b.parentNode.dataset.r, a = b.dataset.a;
      if (a) {
        if (a === 'deal') dealOrRebuy();
        else if (a === 'rebuy') rebuy();
        else if (a === 'p') setRaise(potRaise(+b.dataset.f));
        else myAct(a);
        return;
      }
      if (r === 'newtable') {
        if (H && H.phase !== 'done' && !P[0].folded && P[0].total > 0) api.toast('You leave your chips in this hand behind.');
        newTable(); if (!busted) startHand();
      } else if (r === 'rebuy') rebuy();
      else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); hud(); tone(600, 0.05); }
      else if (par === 'opp') {
        const v = +b.dataset.v; if (v === opts.opp) return;
        opts.opp = v; api.save('opts', opts);
        if (H && H.phase !== 'done') { api.toast('Table changes after this hand'); hud(); }
        else { newTable(); if (!busted) step(startHand, 400); }
      } else if (par === 'speed') { opts.fast = b.dataset.v === '1'; api.save('opts', opts); hud(); }
    }
    function onInput(e) {
      if (e.target.dataset.a === 'slider') { raiseAmt = +e.target.value; setRaise(raiseAmt); }
    }
    function onToggle() { opts.coach = $('coachbox').open; api.save('opts', opts); coachKey = ''; renderCoach(); }
    function onKey(e) {
      if (el.offsetParent === null || document.hidden) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' && e.target.type !== 'range') return;
      if (tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      const myTurn = H && H.phase === 'bet' && H.toAct === 0;
      if (k === 'enter') { if (!H || H.phase === 'done') { e.preventDefault(); dealOrRebuy(); } return; }
      if (!myTurn) { if (k === ' ' && (!H || H.phase === 'done') && tg !== 'BUTTON') { e.preventDefault(); dealOrRebuy(); } return; }
      if (k === 'f' || k === 'x') { e.preventDefault(); if (H.cur - P[0].bet > 0) myAct('fold'); else api.toast('Nothing to call — check instead (C)'); }
      else if (k === 'c' || (k === ' ' && tg !== 'BUTTON')) { e.preventDefault(); myAct('call'); }
      else if (k === 'r' || k === 'z') { e.preventDefault(); myAct('raise'); }
      else if (k === 'a') { e.preventDefault(); myAct('allin'); }
      else if (k === 'arrowright' || k === 'arrowup') { e.preventDefault(); setRaise((raiseAmt || myLimits().min) + Math.max(5, H.bbAmt)); }
      else if (k === 'arrowleft' || k === 'arrowdown') { e.preventDefault(); setRaise((raiseAmt || myLimits().min) - Math.max(5, H.bbAmt)); }
    }
    let rsz = 0;
    function onResize() { if (rsz) return; rsz = requestAnimationFrame(() => { rsz = 0; if (document.hidden || el.offsetParent === null) return; sizeFelt(); }); }
    function clearTimersOnly() { timers.forEach(clearTimeout); timers.clear(); felt.querySelectorAll('.fly').forEach(n => n.remove()); }

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    $('coachbox').addEventListener('toggle', onToggle);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);

    buildTable(api.load('table'));
    if (P.length !== opts.opp + 1) buildTable(null);
    sizeFelt();
    bumpHigh();
    log('Welcome to the Mule\'s card room. Opponents: ' + P.slice(1).map(p => p.name + ' (' + p.tag.toLowerCase() + ')').join(', '), 'h');
    render();
    if (!busted) step(startHand, 500);

    return {
      destroy() {
        timers.forEach(clearTimeout); timers.clear();
        if (rsz) cancelAnimationFrame(rsz);
        root.removeEventListener('click', onClick);
        root.removeEventListener('input', onInput);
        $('coachbox').removeEventListener('toggle', onToggle);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        el.innerHTML = '';
      },
      _test: {
        get P() { return P; }, get H() { return H; }, get T() { return T; }, get busted() { return busted; }, get stats() { return stats; },
        get coach() { return coachData; },
        evalCards, describe, kickerNote, mcEquity, computePots, best5, myAct, startHand, dealOrRebuy, rebuy, newTable, setRaise,
        setOpts(o) { Object.assign(opts, o); },
      },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { inst.destroy(); inst = null; this._t = null; } },
  };
})();
