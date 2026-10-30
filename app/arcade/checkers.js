/* VanMule Arcade: "Mule Hop" - American / English checkers (8x8).
   Forced captures, multi-jumps, kings; vs the Mule (alpha-beta) or two players on one PC. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'checkers';

  /* ---------------- engine (pure) ----------------
     32 playable squares, index i: row r = i >> 2 (0 = top), col c = (i & 3) * 2 + (r even ? 1 : 0).
     Values: 1 ember man, 2 ember king (moves up, plays first), -1 cream man, -2 cream king. */
  const P1 = 1, P2 = -1;
  const rowOf = i => i >> 2, colOf = i => ((i & 3) << 1) + ((i >> 2) % 2 === 0 ? 1 : 0);
  const idxOf = (r, c) => (r < 0 || r > 7 || c < 0 || c > 7 || ((r + c) & 1) === 0) ? -1 : r * 4 + (c >> 1);
  const DR = [-1, -1, 1, 1], DC = [-1, 1, -1, 1];
  const ADJ = new Int8Array(128), JMP = new Int8Array(128);
  for (let i = 0; i < 32; i++) for (let d = 0; d < 4; d++) {
    const r = rowOf(i), c = colOf(i);
    ADJ[i * 4 + d] = idxOf(r + DR[d], c + DC[d]);
    JMP[i * 4 + d] = idxOf(r + 2 * DR[d], c + 2 * DC[d]);
  }
  const DIRS_UP = [0, 1], DIRS_DOWN = [2, 3], DIRS_ALL = [0, 1, 2, 3];
  const dirsFor = v => Math.abs(v) === 2 ? DIRS_ALL : v > 0 ? DIRS_UP : DIRS_DOWN;
  const kingRow = (i, p) => p > 0 ? rowOf(i) === 0 : rowOf(i) === 7;

  function jumpsFrom(b, sq, v, p, path, caps, out) {
    let found = false;
    const king = Math.abs(v) === 2;
    for (const d of dirsFor(v)) {
      const mid = ADJ[sq * 4 + d], land = JMP[sq * 4 + d];
      if (land < 0 || b[mid] * p >= 0 || b[land] !== 0 || caps.indexOf(mid) >= 0) continue;
      found = true;
      path.push(land); caps.push(mid);
      if (!king && kingRow(land, p)) out.push({ path: path.slice(), caps: caps.slice(), crown: true });
      else jumpsFrom(b, land, v, p, path, caps, out);
      path.pop(); caps.pop();
    }
    if (!found && caps.length) out.push({ path: path.slice(), caps: caps.slice(), crown: false });
  }
  // all legal moves for side p (captures are mandatory)
  function genMoves(b, p) {
    const caps = [];
    for (let i = 0; i < 32; i++) {
      const v = b[i];
      if (v * p <= 0) continue;
      b[i] = 0;
      jumpsFrom(b, i, v, p, [i], [], caps);
      b[i] = v;
    }
    if (caps.length) return caps;
    const out = [];
    for (let i = 0; i < 32; i++) {
      const v = b[i];
      if (v * p <= 0) continue;
      for (const d of dirsFor(v)) {
        const t = ADJ[i * 4 + d];
        if (t >= 0 && b[t] === 0) out.push({ path: [i, t], caps: [], crown: Math.abs(v) === 1 && kingRow(t, p) });
      }
    }
    return out;
  }
  function makeMove(b, m) {
    const f = m.path[0], t = m.path[m.path.length - 1], v = b[f], undo = { v, capv: m.caps.map(c => b[c]) };
    b[f] = 0;
    for (const c of m.caps) b[c] = 0;
    b[t] = m.crown ? 2 * Math.sign(v) : v;
    return undo;
  }
  function unmakeMove(b, m, u) {
    const f = m.path[0], t = m.path[m.path.length - 1];
    b[t] = 0;
    m.caps.forEach((c, k) => { b[c] = u.capv[k]; });
    b[f] = u.v;
  }
  const CENTER = new Int8Array(32);
  for (let i = 0; i < 32; i++) { const r = rowOf(i), c = colOf(i); CENTER[i] = (r >= 2 && r <= 5 && c >= 2 && c <= 5) ? 1 : 0; }
  // evaluation from side p's point of view
  function evaluate(b, p) {
    let s = 0, m1 = 0, m2 = 0, n = 0, k1 = [], k2 = [];
    for (let i = 0; i < 32; i++) {
      const v = b[i];
      if (!v) continue;
      n++;
      const r = rowOf(i), c = colOf(i);
      if (v === 1) { m1 += 100; s += 100 + (7 - r) * 3 + (r === 7 ? 9 : 0) + CENTER[i] * 5 + ((c === 0 || c === 7) ? -3 : 0); }
      else if (v === -1) { m2 += 100; s -= 100 + r * 3 + (r === 0 ? 9 : 0) + CENTER[i] * 5 + ((c === 0 || c === 7) ? -3 : 0); }
      else if (v === 2) { m1 += 160; s += 160 + CENTER[i] * 8; k1.push(i); }
      else { m2 += 160; s -= 160 + CENTER[i] * 8; k2.push(i); }
    }
    // when ahead, trading down is good
    if (m1 !== m2) s += Math.sign(m1 - m2) * (24 - n) * 5;
    // endgame: the stronger side's kings hunt the enemy pieces
    if (n <= 8 && m1 !== m2) {
      const hunters = m1 > m2 ? k1 : k2, sg = m1 > m2 ? 1 : -1;
      for (const k of hunters) {
        let best = 9;
        for (let i = 0; i < 32; i++) if (b[i] * sg < 0) best = Math.min(best, Math.max(Math.abs(rowOf(i) - rowOf(k)), Math.abs(colOf(i) - colOf(k))));
        s += sg * (9 - best) * 3;
      }
    }
    return s * p;
  }
  const WIN = 100000;
  function search(board, p, opt) {
    const b = Int8Array.from(board), t0 = performance.now(), deadline = t0 + (opt.time || 400);
    const maxD = opt.depth || 30, noise = opt.noise || 0;
    let nodes = 0, stop = false;
    function negamax(d, alpha, beta, side, ply, ext) {
      if ((++nodes & 1023) === 0 && performance.now() > deadline) stop = true;
      if (stop) return 0;
      const ms = genMoves(b, side);
      if (!ms.length) return -WIN + ply;
      const forced = ms[0].caps.length > 0;
      if (d <= 0 && (!forced || ext >= 8)) return evaluate(b, side);
      if (d <= 0) { d = 1; ext++; }
      ms.sort((x, y) => y.caps.length - x.caps.length);
      let best = -Infinity;
      for (const m of ms) {
        const u = makeMove(b, m);
        const v = -negamax(d - 1, -beta, -alpha, -side, ply + 1, ext);
        unmakeMove(b, m, u);
        if (stop) return 0;
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      return best;
    }
    let root = genMoves(b, p);
    if (!root.length) return { move: null, score: -WIN };
    if (root.length === 1) return { move: root[0], score: 0, depth: 0 };
    let bestM = root[0], bestS = -Infinity, lastScores = null, done = 0;
    for (let d = 1; d <= maxD; d++) {
      const sc = [];
      let alpha = -Infinity;
      for (const m of root) {
        const u = makeMove(b, m);
        const v = -negamax(d - 1, -Infinity, noise ? Infinity : -alpha, -p, 1, 0);
        unmakeMove(b, m, u);
        if (stop) break;
        sc.push(v);
        if (v > alpha) alpha = v;
      }
      if (stop) break;
      const idx = root.map((m, i) => i).sort((x, y) => sc[y] - sc[x]);
      root = idx.map(i => root[i]); lastScores = idx.map(i => sc[i]);
      bestM = root[0]; bestS = lastScores[0]; done = d;
      if (Math.abs(bestS) > WIN / 2) break;
      if (performance.now() - t0 > (opt.time || 400) * 0.45) break;
    }
    if (noise && lastScores && Math.abs(bestS) < WIN / 2) {
      let bv = -Infinity;
      root.forEach((m, i) => { const v = lastScores[i] + (Math.random() * 2 - 1) * noise; if (v > bv && lastScores[i] > -WIN / 2) { bv = v; bestM = m; bestS = lastScores[i]; } });
    }
    return { move: bestM, score: bestS, depth: done, nodes };
  }
  function startBoard() {
    const b = new Int8Array(32);
    for (let i = 0; i < 12; i++) b[i] = -1;
    for (let i = 20; i < 32; i++) b[i] = 1;
    return b;
  }

  /* ---------------- UI ---------------- */
  const LV = { easy: { label: 'Easy', depth: 2, time: 200, noise: 70 }, medium: { label: 'Medium', depth: 6, time: 300, noise: 6 }, hard: { label: 'Hard', depth: 40, time: 700, noise: 0 } };
  const CROWN = '<svg viewBox="0 0 40 40" class="crown"><path d="M8 28l-3-15 9 7 6-11 6 11 9-7-3 15z"/><rect x="8" y="29" width="24" height="4" rx="1.5"/><circle cx="5" cy="12" r="2.4"/><circle cx="20" cy="8" r="2.4"/><circle cx="35" cy="12" r="2.4"/></svg>';
  const CSS = `
.ag-checkers{--bs:520px;font-family:var(--body);color:var(--fg);max-width:1000px;margin:0 auto;user-select:none;-webkit-user-select:none}
.ag-checkers .hd{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px}
.ag-checkers .ttl{flex:1;min-width:240px}
.ag-checkers h2{font-family:var(--display);font-size:28px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-checkers h2 span{color:var(--ember)}
.ag-checkers .how{color:var(--muted);font-size:13px;margin-top:4px}
.ag-checkers .tally{display:flex;gap:6px}
.ag-checkers .tl{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:5px 12px;text-align:center;min-width:64px}
.ag-checkers .tl b{display:block;font-size:10px;letter-spacing:1.3px;color:var(--muted)}
.ag-checkers .tl i{font-style:normal;font-family:var(--display);font-weight:700;font-size:19px}
.ag-checkers .tl.w i{color:var(--ok)} .ag-checkers .tl.l i{color:var(--bad)}
.ag-checkers .bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.ag-checkers .seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px}
.ag-checkers .seg button{height:28px;padding:0 10px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-checkers .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-checkers .seg.dis{opacity:.4;pointer-events:none}
.ag-checkers .lbl{font-size:12px;color:var(--dim);margin-left:4px}
.ag-checkers .sp{flex:1}
.ag-checkers .main{display:flex;gap:18px;align-items:flex-start;justify-content:center;flex-wrap:wrap}
.ag-checkers .board{position:relative;width:var(--bs);height:var(--bs);border-radius:8px;overflow:hidden;flex:none;touch-action:none;
  box-shadow:0 0 0 4px #2b211b,0 0 0 5px #4a3a2e,0 18px 40px rgba(0,0,0,.5)}
.ag-checkers .sqs{position:absolute;inset:0;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr)}
.ag-checkers .sq{position:relative}
.ag-checkers .sq.l{background:#e9dcc6}
.ag-checkers .sq.d{background:#4a382c;background-image:radial-gradient(circle at 30% 20%,rgba(255,255,255,.05),transparent 70%)}
.ag-checkers .sq.last::before{content:"";position:absolute;inset:0;background:rgba(255,200,97,.22)}
.ag-checkers .sq.sel::before{content:"";position:absolute;inset:0;background:rgba(255,138,61,.35)}
.ag-checkers .sq.tgt::after{content:"";position:absolute;left:36%;top:36%;width:28%;height:28%;border-radius:50%;background:rgba(255,200,97,.55);box-shadow:0 0 10px rgba(255,200,97,.6)}
.ag-checkers .sq.hint::before{content:"";position:absolute;inset:6%;border-radius:50%;border:3px dashed var(--gold);animation:agkp .8s ease-in-out infinite alternate}
.ag-checkers .sq .num{position:absolute;left:5%;top:4%;font:600 calc(var(--bs)/62)/1 var(--mono);color:rgba(233,220,198,.28)}
.ag-checkers .pcs{position:absolute;inset:0;pointer-events:none}
.ag-checkers .pc{position:absolute;left:0;top:0;width:12.5%;height:12.5%;transition:transform .16s ease-out,opacity .25s}
.ag-checkers .pc .disc{position:absolute;inset:11%;border-radius:50%}
.ag-checkers .pc.p1 .disc{background:radial-gradient(circle at 35% 30%,#ffc08f,#ff8a3d 48%,#c4520f 100%);box-shadow:0 4px 0 #7a3208,0 7px 10px rgba(0,0,0,.5),inset 0 0 0 calc(var(--bs)/90) rgba(255,255,255,.12)}
.ag-checkers .pc.p2 .disc{background:radial-gradient(circle at 35% 30%,#ffffff,#efe3d0 48%,#b9a68c 100%);box-shadow:0 4px 0 #75644f,0 7px 10px rgba(0,0,0,.5),inset 0 0 0 calc(var(--bs)/90) rgba(0,0,0,.06)}
.ag-checkers .pc .disc::after{content:"";position:absolute;inset:18%;border-radius:50%;border:2px solid rgba(0,0,0,.16)}
.ag-checkers .pc .crown{position:absolute;left:27%;top:24%;width:46%;height:46%;z-index:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))}
.ag-checkers .pc.p1 .crown{fill:#fff3c4} .ag-checkers .pc.p2 .crown{fill:#c98a16}
.ag-checkers .pc.must .disc{outline:3px solid var(--gold);outline-offset:2px;animation:agkp .7s ease-in-out infinite alternate}
.ag-checkers .pc.gone{opacity:0;transform-origin:center}
.ag-checkers .pc.drag{transition:none;z-index:5}
.ag-checkers .pc.drag .disc{transform:scale(1.1)}
.ag-checkers .pc.crowned .disc{animation:agkc .5s ease-out}
@keyframes agkp{from{outline-color:rgba(255,200,97,.35)}to{outline-color:rgba(255,200,97,1)}}
@keyframes agkc{0%{transform:scale(1)}50%{transform:scale(1.18)}100%{transform:scale(1)}}
.ag-checkers .gover{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(18,14,12,.93);border:1px solid var(--line);border-radius:14px;padding:16px 26px;text-align:center;z-index:9;box-shadow:0 16px 40px rgba(0,0,0,.6);pointer-events:none}
.ag-checkers .gover b{display:block;font-family:var(--display);font-size:22px;color:var(--gold)}
.ag-checkers .gover span{color:var(--muted);font-size:13px}
.ag-checkers .side{flex:1 1 260px;max-width:560px;min-width:250px;display:flex;flex-direction:column;gap:10px}
.ag-checkers .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.ag-checkers .status{font-weight:700;font-size:15px;min-height:22px}
.ag-checkers .status.y{color:var(--ember)} .ag-checkers .status.c{color:#efe3d0} .ag-checkers .status.w{color:var(--gold)}
.ag-checkers .sub{font-size:12.5px;color:var(--muted);margin-top:3px;min-height:18px}
.ag-checkers .stats{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ag-checkers .st{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.ag-checkers .st b{display:block;font-size:10px;letter-spacing:1.2px;color:var(--muted)}
.ag-checkers .st i{font-style:normal;font-family:var(--mono);font-size:18px;font-weight:700}
.ag-checkers .st .chip{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.ag-checkers .chip.p1{background:#ff8a3d} .ag-checkers .chip.p2{background:#efe3d0}
.ag-checkers .log{font-family:var(--mono);font-size:12.5px;color:var(--muted);max-height:120px;overflow:auto;line-height:1.6}
.ag-checkers .log span{display:inline-block;min-width:92px}
.ag-checkers details{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 14px;font-size:13px;color:var(--muted)}
.ag-checkers summary{cursor:pointer;color:var(--fg);font-weight:700}
.ag-checkers details ul{margin:6px 0 2px;padding-left:18px}
.ag-checkers details li{margin:3px 0;line-height:1.45}
.ag-checkers details b{color:var(--fg)}
`;

  let inst = null;
  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const opts = Object.assign({ mode: 'cpu', level: 'medium', first: 'you' }, api.load('opts') || {});
    if (!LV[opts.level]) opts.level = 'medium';
    const stats = Object.assign({}, api.load('stats') || {});
    for (const k in LV) stats[k] = Object.assign({ w: 0, l: 0, d: 0 }, stats[k] || {});
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
      } catch (e) { /* ignore */ }
    }

    const root = document.createElement('div'); root.className = 'ag-checkers';
    root.innerHTML = `
<div class="hd"><div class="ttl"><h2>Mule <span>Hop</span></h2><div class="how">Checkers. Move diagonally forward; jump to capture (captures are compulsory and multi-jumps must be finished). Reach the far row to crown a king. Take every piece or leave your opponent with no moves to win.</div></div>
<div class="tally"><div class="tl w"><b>WON</b><i data-r="tw">0</i></div><div class="tl l"><b>LOST</b><i data-r="tl">0</i></div><div class="tl"><b>DRAWN</b><i data-r="td">0</i></div></div></div>
<div class="bar">
<button class="btn pri small" data-r="new">New game</button>
<div class="seg" data-r="mode"><button data-v="cpu">vs Mule</button><button data-v="two">2 players</button></div>
<span class="lbl">Level</span><div class="seg" data-r="level"><button data-v="easy">Easy</button><button data-v="medium">Medium</button><button data-v="hard">Hard</button></div>
<span class="lbl">First</span><div class="seg" data-r="first"><button data-v="you">You</button><button data-v="mule">Mule</button></div>
<span class="sp"></span>
<button class="btn sec small" data-r="undo">↶ Undo</button><button class="btn sec small" data-r="hint">💡 Hint</button><button class="btn sec small" data-r="snd"></button></div>
<div class="main">
<div class="board" data-r="board"><div class="sqs" data-r="sqs"></div><div class="pcs" data-r="pcs"></div></div>
<div class="side">
<div class="card"><div class="status" data-r="status"></div><div class="sub" data-r="sub"></div></div>
<div class="stats"><div class="st"><b>MOVE</b><i data-r="mvn">1</i></div><div class="st"><b>NO-CAPTURE COUNT</b><i data-r="nc">0</i></div>
<div class="st"><b><span class="chip p1"></span><span data-r="n1">EMBER</span> CAPTURED</b><i data-r="c1">0</i></div><div class="st"><b><span class="chip p2"></span><span data-r="n2">CREAM</span> CAPTURED</b><i data-r="c2">0</i></div></div>
<div class="card"><div class="log" data-r="log"></div></div>
<details data-r="tips"><summary>Tips &amp; strategy</summary><ul>
<li><b>Control the center.</b> Pieces on the middle squares have more options and support each other; edge pieces are safe but passive.</li>
<li><b>Keep your back row</b> as long as you can. It stops enemy men from crowning; the bridge (the two back squares with a gap) is a strong guard.</li>
<li><b>Move in pairs and keep pieces backed up</b> so a jump into your line can be answered with a counter-jump.</li>
<li><b>Forced captures are a weapon:</b> offer one man to pull an enemy piece into a spot where you jump two (a "shot").</li>
<li><b>Trade when ahead.</b> Every even exchange makes your extra piece count for more; when behind, avoid trades and keep things blocked.</li>
<li><b>Crown early and use your kings</b>: a king can attack from behind and hunt stragglers. Don't bring a king into a corner it can be trapped in.</li>
<li><b>Tempo and the opposition</b> decide endgames: count who will run out of safe moves first.</li>
<li>Draws: the same position three times, or 40 moves each with no capture and no man move.</li></ul></details>
</div></div>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const boardEl = $('board'), sqsEl = $('sqs'), pcsEl = $('pcs');

    let board, turn, over, busy, hist, moveLog, quiet, reps, sel, prefix, drag, hintMove, gameId = 0, capCount, human;
    const isHuman = p => opts.mode === 'two' || p === human;
    const flipped = () => opts.mode === 'cpu' && human === P2;
    const pname = p => p === P1 ? 'Ember' : 'Cream';
    const key = () => Array.from(board).join(',') + '|' + turn;

    // squares
    function buildSquares() {
      let h = '';
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const rr = flipped() ? 7 - r : r, cc = flipped() ? 7 - c : c, i = idxOf(rr, cc);
        h += `<div class="sq ${i < 0 ? 'l' : 'd'}"${i >= 0 ? ` data-i="${i}"` : ''}>${i >= 0 ? `<span class="num">${i + 1}</span>` : ''}</div>`;
      }
      sqsEl.innerHTML = h;
    }
    const pos = i => { let r = rowOf(i), c = colOf(i); if (flipped()) { r = 7 - r; c = 7 - c; } return [c, r]; };
    const sqEls = () => sqsEl.querySelectorAll('.sq[data-i]');

    function legal() { return genMoves(board, turn); }
    function candidates() {
      return legal().filter(m => prefix.every((s, k) => m.path[k] === s));
    }
    function render(anim) {
      const ms = over ? [] : legal();
      const mustCap = ms.length && ms[0].caps.length > 0;
      const canAct = !over && !busy && isHuman(turn);
      const cand = canAct && sel >= 0 ? candidates() : [];
      const tgts = new Set(cand.map(m => m.path[prefix.length]).filter(x => x !== undefined));
      const last = hist.length ? hist[hist.length - 1].m : null;
      const lastSet = new Set(last ? last.path : []);
      const hintSet = new Set(hintMove ? [hintMove.path[0], hintMove.path[hintMove.path.length - 1]] : []);
      sqEls().forEach(d => {
        const i = +d.dataset.i;
        d.classList.toggle('sel', prefix.indexOf(i) >= 0);
        d.classList.toggle('tgt', tgts.has(i));
        d.classList.toggle('last', lastSet.has(i));
        d.classList.toggle('hint', hintSet.has(i));
      });
      const movable = new Set(canAct ? ms.map(m => m.path[0]) : []);
      let h = '';
      for (let i = 0; i < 32; i++) {
        const v = board[i];
        if (!v) continue;
        const [x, y] = pos(i);
        const cls = 'pc ' + (v > 0 ? 'p1' : 'p2') + (mustCap && movable.has(i) && sel < 0 ? ' must' : '');
        h += `<div class="${cls}" data-i="${i}" style="transform:translate(${x * 100}%,${y * 100}%)"><div class="disc"></div>${Math.abs(v) === 2 ? CROWN : ''}</div>`;
      }
      pcsEl.innerHTML = h;
      if (anim) anim();
      const old = boardEl.querySelector('.gover'); if (old) old.remove();
      if (over) {
        const d = document.createElement('div'); d.className = 'gover';
        d.innerHTML = `<b>${over.t}</b><span>${over.why}</span>`;
        boardEl.appendChild(d);
      }
      hud(mustCap);
    }
    function hud(mustCap) {
      const t = stats[opts.level];
      $('tw').textContent = t.w; $('tl').textContent = t.l; $('td').textContent = t.d;
      for (const k of ['mode', 'level', 'first']) root.querySelectorAll('[data-r="' + k + '"] button').forEach(b => b.classList.toggle('on', b.dataset.v === opts[k]));
      $('level').classList.toggle('dis', opts.mode === 'two'); $('first').classList.toggle('dis', opts.mode === 'two');
      $('snd').textContent = soundOn ? '🔊' : '🔇';
      const st = $('status'), sub = $('sub');
      if (over) { st.textContent = over.t; st.className = 'status w'; sub.textContent = over.why; }
      else if (busy && !isHuman(turn)) { st.textContent = 'The Mule is thinking…'; st.className = 'status c'; sub.textContent = ''; }
      else {
        st.textContent = opts.mode === 'two' ? pname(turn) + ' to move' : 'Your move';
        st.className = 'status ' + (turn === P1 ? 'y' : 'c');
        sub.textContent = mustCap ? 'You must capture! Pieces that can jump are outlined.' : prefix.length > 1 ? 'Keep jumping: the capture sequence must be completed.' : '';
      }
      $('mvn').textContent = Math.floor(hist.length / 2) + 1;
      $('nc').textContent = Math.floor(quiet / 2) + ' / 40';
      $('c1').textContent = capCount[0]; $('c2').textContent = capCount[1];
      $('n1').textContent = opts.mode === 'cpu' ? (human === P1 ? 'YOU' : 'MULE') : 'EMBER';
      $('n2').textContent = opts.mode === 'cpu' ? (human === P2 ? 'YOU' : 'MULE') : 'CREAM';
      let lg = '';
      for (let k = 0; k < moveLog.length; k += 2) lg += `<span>${k / 2 + 1}. ${moveLog[k]}${moveLog[k + 1] ? ' ' + moveLog[k + 1] : ''}</span> `;
      $('log').innerHTML = lg || 'No moves yet.';
      $('log').scrollTop = 1e6;
      $('undo').disabled = opts.mode === 'two' ? !hist.length : !hist.some(x => x.p === human);
      $('hint').disabled = !!over || busy || !isHuman(turn);
      boardEl.style.cursor = !over && !busy && isHuman(turn) ? 'pointer' : 'default';
    }
    function newGame() {
      gameId++;
      timers.forEach(clearTimeout); timers.clear();
      board = startBoard(); turn = P1; over = null; busy = false; hist = []; moveLog = []; quiet = 0; reps = new Map(); capCount = [0, 0];
      sel = -1; prefix = []; drag = null; hintMove = null;
      human = opts.mode === 'two' ? P1 : (opts.first === 'you' ? P1 : P2);
      reps.set(key(), 1);
      buildSquares(); render();
      nextTurn();
    }
    function notation(m) { return m.path.map(i => i + 1).join(m.caps.length ? 'x' : '-'); }
    function apply(m, animate) {
      const p = turn, before = Array.from(board);
      const u = makeMove(board, m);
      hist.push({ m, u, p, quiet, board: before });
      moveLog.push(notation(m));
      const manMove = Math.abs(u.v) === 1;
      quiet = (m.caps.length || manMove) ? 0 : quiet + 1;
      capCount[p > 0 ? 0 : 1] += m.caps.length;
      turn = -turn; sel = -1; prefix = []; hintMove = null;
      const k = key(); reps.set(k, (reps.get(k) || 0) + 1);
      // animation: hop along the path
      const gid = gameId;
      busy = true;
      const steps = m.path.length - 1, stepMs = m.caps.length ? 170 : 150;
      render(() => {
        const t = m.path[m.path.length - 1], e = pcsEl.querySelector('.pc[data-i="' + t + '"]');
        if (!e || !animate) return;
        const at = i => { const [x, y] = pos(i); return `translate(${x * 100}%,${y * 100}%)`; };
        e.style.transition = 'none'; e.style.transform = at(m.path[0]); void e.offsetWidth; e.style.transition = '';
        // ghosts of captured pieces fade out as they are jumped
        m.caps.forEach((c, k) => {
          const g = document.createElement('div'); const v = u.capv[k];
          g.className = 'pc ' + (v > 0 ? 'p1' : 'p2'); g.style.transform = at(c);
          g.innerHTML = '<div class="disc"></div>' + (Math.abs(v) === 2 ? CROWN : '');
          pcsEl.appendChild(g);
          later(() => { if (gid === gameId) g.classList.add('gone'); }, stepMs * (k + 1) - 40);
        });
        for (let s = 1; s <= steps; s++) later(() => { if (gid === gameId) e.style.transform = at(m.path[s]); }, stepMs * (s - 1) + 10);
        if (m.crown) later(() => { if (gid === gameId) e.classList.add('crowned'); }, stepMs * steps);
      });
      if (m.caps.length) { for (let k = 0; k < m.caps.length; k++) later(() => tone(300 - k * 30, 0.07, 'square', 0.04, 160), stepMs * (k + 1) - 30); }
      else tone(p > 0 ? 520 : 420, 0.05, 'triangle', 0.05, p > 0 ? 400 : 330);
      if (m.crown) later(() => { tone(660, 0.1, 'triangle', 0.05); later(() => tone(990, 0.15, 'triangle', 0.05), 90); }, stepMs * steps);
      later(() => {
        if (gid !== gameId) return;
        busy = false;
        const ms = genMoves(board, turn);
        if (!ms.length) finish(-turn, board.some(v => v * turn > 0) ? pname(turn) + ' has no legal moves' : 'all of ' + pname(turn) + '’s pieces were captured');
        else if (reps.get(key()) >= 3) finish(0, 'same position three times');
        else if (quiet >= 80) finish(0, '40 moves each without a capture or man move');
        else { render(); nextTurn(); }
      }, animate ? stepMs * steps + 60 : 0);
    }
    function finish(winner, why) {
      let t;
      if (winner === 0) t = 'Draw';
      else if (opts.mode === 'two') t = pname(winner) + ' wins!';
      else t = winner === human ? 'You win!' : 'The Mule wins';
      over = { t, why, winner };
      if (opts.mode === 'cpu') {
        const s = stats[opts.level];
        if (winner === 0) s.d++; else if (winner === human) s.w++; else s.l++;
        api.save('stats', stats);
      }
      if (winner === 0) tone(420, 0.2, 'sine', 0.04);
      else if (opts.mode === 'two' || winner === human) { tone(523, 0.12, 'triangle', 0.06); later(() => tone(659, 0.12, 'triangle', 0.06), 120); later(() => tone(784, 0.25, 'triangle', 0.06), 240); }
      else tone(330, 0.25, 'sawtooth', 0.035, 150);
      render();
    }
    function nextTurn() {
      if (over) return;
      if (isHuman(turn)) { render(); return; }
      busy = true; render();
      const gid = gameId;
      later(() => {
        if (gid !== gameId) return;
        const L = LV[opts.level];
        const r = search(board, turn, { depth: L.depth, time: L.time, noise: L.noise });
        busy = false;
        if (r.move) apply(r.move, true);
      }, 280);
    }
    function play(m) {
      if (over || busy || !isHuman(turn)) return false;
      const lm = legal().find(x => x.path.join() === m.path.join());
      if (!lm) return false;
      apply(lm, true);
      return true;
    }
    // click / tap on square i
    function choose(i) {
      if (over || busy || !isHuman(turn)) return;
      const ms = legal();
      if (prefix.length) {
        const cand = candidates();
        const next = cand.filter(m => m.path[prefix.length] === i);
        if (next.length) {
          prefix.push(i);
          const full = next.filter(m => m.path.length === prefix.length);
          if (full.length) { apply(full[0], true); return; }
          // allow clicking the final square directly when unique
          render(); return;
        }
        const direct = cand.filter(m => m.path[m.path.length - 1] === i);
        if (direct.length === 1) { apply(direct[0], true); return; }
        if (prefix.length > 1) { tone(200, 0.06, 'square', 0.03); return; } // mid-jump: must continue
      }
      if (ms.some(m => m.path[0] === i)) { sel = i; prefix = [i]; hintMove = null; tone(700, 0.03, 'sine', 0.03); render(); return; }
      if (board[i] * turn > 0 && ms.length && ms[0].caps.length) { api.toast('A capture is available: you must jump.'); tone(200, 0.08, 'square', 0.03); }
      sel = -1; prefix = []; render();
    }
    function sqAt(e) {
      const r = boardEl.getBoundingClientRect();
      let x = Math.floor((e.clientX - r.left) / r.width * 8), y = Math.floor((e.clientY - r.top) / r.height * 8);
      if (x < 0 || x > 7 || y < 0 || y > 7) return -1;
      if (flipped()) { x = 7 - x; y = 7 - y; }
      return idxOf(y, x);
    }
    function onDown(e) {
      if (e.button !== 0) return;
      const i = sqAt(e);
      if (i < 0) return;
      const wasPrefix = prefix.length;
      choose(i);
      if (!over && !busy && prefix.length === 1 && prefix[0] === i && !wasPrefix) {
        drag = { from: i, el: pcsEl.querySelector('.pc[data-i="' + i + '"]'), x0: e.clientX, y0: e.clientY, moved: false };
        try { boardEl.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      }
      e.preventDefault();
    }
    function onMove(e) {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.moved = true;
      const r = boardEl.getBoundingClientRect(), q = r.width / 8;
      if (drag.el) { drag.el.classList.add('drag'); drag.el.style.transform = `translate(${e.clientX - r.left - q / 2}px,${e.clientY - r.top - q / 2}px)`; }
    }
    function onUp(e) {
      if (!drag) return;
      const d = drag; drag = null;
      try { boardEl.releasePointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      if (!d.moved) return;
      const i = sqAt(e);
      if (i >= 0 && i !== d.from) {
        // dropping on the final square of a unique path (or the next hop) plays it
        const cand = candidates(), full = cand.filter(m => m.path[m.path.length - 1] === i);
        if (full.length === 1) { apply(full[0], true); return; }
        if (cand.some(m => m.path[1] === i)) { choose(i); return; }
      }
      render();
    }
    function undo() {
      if (!hist.length) return;
      gameId++; timers.forEach(clearTimeout); timers.clear();
      const pop = () => { const h = hist.pop(); board = Int8Array.from(h.board); quiet = h.quiet; turn = h.p; moveLog.pop(); capCount[h.p > 0 ? 0 : 1] -= h.m.caps.length; };
      const stepBack = () => { reps.set(key(), (reps.get(key()) || 1) - 1); pop(); };
      if (opts.mode === 'two') stepBack();
      else {
        if (!hist.some(x => x.p === human)) return;
        stepBack();
        while (hist.length && turn !== human) stepBack();
      }
      over = null; busy = false; sel = -1; prefix = []; hintMove = null;
      tone(380, 0.06, 'triangle', 0.04, 300);
      render(); nextTurn();
    }
    function hint() {
      if (over || busy || !isHuman(turn)) return;
      const r = search(board, turn, { depth: 30, time: 250 });
      if (!r.move) return;
      hintMove = r.move; sel = -1; prefix = [];
      render();
      $('sub').textContent = 'Hint: ' + notation(r.move) + (r.move.caps.length ? ' (capture)' : '');
      tone(880, 0.08, 'sine', 0.04);
    }
    function onClick(e) {
      const b = e.target.closest('button'); if (!b) return;
      const r = b.dataset.r, par = b.parentNode.dataset.r;
      if (r === 'new') newGame();
      else if (r === 'undo') undo();
      else if (r === 'hint') hint();
      else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); hud(); tone(600, 0.05); }
      else if (par === 'mode' || par === 'level' || par === 'first') {
        if (opts[par] !== b.dataset.v) { opts[par] = b.dataset.v; api.save('opts', opts); newGame(); }
      }
    }
    function onKey(e) {
      if (el.offsetParent === null || document.hidden) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.key === 'Escape' && prefix.length === 1) { e.preventDefault(); sel = -1; prefix = []; render(); }
    }
    function fit() {
      const w = root.clientWidth || 900, top = el.getBoundingClientRect().top;
      const hAvail = window.innerHeight - Math.max(0, top) - 170;
      const maxW = w >= 820 ? w - 290 : w - 12;
      root.style.setProperty('--bs', Math.max(296, Math.floor(Math.min(560, maxW, Math.max(296, hAvail)) / 8) * 8) + 'px');
    }
    function onResize() { if (el.offsetParent === null || document.hidden) return; fit(); }
    root.addEventListener('click', onClick);
    boardEl.addEventListener('pointerdown', onDown);
    boardEl.addEventListener('pointermove', onMove);
    boardEl.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    fit();
    newGame();

    return {
      destroy() {
        gameId++;
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        root.removeEventListener('click', onClick);
        boardEl.removeEventListener('pointerdown', onDown);
        boardEl.removeEventListener('pointermove', onMove);
        boardEl.removeEventListener('pointerup', onUp);
        timers.forEach(clearTimeout); timers.clear();
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        el.innerHTML = '';
      },
      _test: {
        get state() { return { board: Array.from(board), turn, over, busy, moves: moveLog.slice(), quiet, capCount: capCount.slice(), human, prefix: prefix.slice() }; },
        legal: () => legal().map(m => ({ path: m.path, caps: m.caps, crown: m.crown })),
        setBoard(arr, t) { gameId++; timers.forEach(clearTimeout); timers.clear(); board = Int8Array.from(arr); turn = t || P1; over = null; busy = false; hist = []; moveLog = []; quiet = 0; reps = new Map([[key(), 1]]); sel = -1; prefix = []; render(); nextTurn(); },
        play: path => play({ path }),
        newGame, undo, hint, opts,
      },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { inst.destroy(); inst = null; this._t = null; } },
    genMoves, search, idxOf,
  };
})();
