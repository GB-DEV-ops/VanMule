/* VanMule Arcade: "Flip Discs" - the classic 8x8 disc-flipping game.
   Play the Mule (alpha-beta search in a Web Worker, 4 levels) or a friend on the same PC. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'reversi';

  /* ---------------- engine (self-contained so it can also run inside a Blob worker) ----------------
     Public board: 64 cells, index = row * 8 + col, row 0 at the top. 1 = ember (moves first), -1 = cream, 0 = empty.
     Internally a 10x10 mailbox with a wall value of 3 around the edge. */
  function engineFactory() {
    const DIRS = [-11, -10, -9, -1, 1, 9, 10, 11];
    const M = i => ((i >> 3) + 1) * 10 + (i & 7) + 1;
    const U = new Int8Array(100).fill(-1);
    const WT = [
      120, -20, 20, 5, 5, 20, -20, 120,
      -20, -40, -5, -5, -5, -5, -40, -20,
      20, -5, 15, 3, 3, 15, -5, 20,
      5, -5, 3, 3, 3, 3, -5, 5,
      5, -5, 3, 3, 3, 3, -5, 5,
      20, -5, 15, 3, 3, 15, -5, 20,
      -20, -40, -5, -5, -5, -5, -40, -20,
      120, -20, 20, 5, 5, 20, -20, 120];
    const W = new Int16Array(100);
    for (let i = 0; i < 64; i++) { W[M(i)] = WT[i]; U[M(i)] = i; }
    const ORDER = [];
    for (let i = 0; i < 64; i++) ORDER.push(M(i));
    ORDER.sort((a, b) => W[b] - W[a]);
    const CORN = [[0, [1, 8, 9]], [7, [6, 15, 14]], [56, [48, 57, 49]], [63, [62, 55, 54]]].map(([c, a]) => [M(c), a.map(M)]);
    const stk = new Int16Array(16384);
    let sp = 0;
    const bufs = [];
    for (let i = 0; i < 128; i++) bufs.push(new Int16Array(40));
    const keyBuf = [];
    for (let i = 0; i < 128; i++) keyBuf.push(new Int16Array(40));
    const WIN = 100000, INF = 1e9;

    function toMB(b64) { const b = new Int8Array(100).fill(3); for (let i = 0; i < 64; i++) b[M(i)] = b64[i]; return b; }
    function can(b, sq, p) {
      const o = -p;
      for (let k = 0; k < 8; k++) {
        const d = DIRS[k];
        let x = sq + d;
        if (b[x] !== o) continue;
        x += d;
        while (b[x] === o) x += d;
        if (b[x] === p) return true;
      }
      return false;
    }
    function gen(b, p, out) {
      let n = 0;
      for (let i = 0; i < 64; i++) { const sq = ORDER[i]; if (b[sq] === 0 && can(b, sq, p)) out[n++] = sq; }
      return n;
    }
    function count(b, p) {
      let n = 0;
      for (let i = 0; i < 64; i++) { const sq = ORDER[i]; if (b[sq] === 0 && can(b, sq, p)) n++; }
      return n;
    }
    function make(b, sq, p) {
      const o = -p;
      let n = 0;
      for (let k = 0; k < 8; k++) {
        const d = DIRS[k];
        let x = sq + d, c = 0;
        while (b[x] === o) { x += d; c++; }
        if (!c || b[x] !== p) continue;
        x = sq + d;
        while (c--) { b[x] = p; stk[sp++] = x; n++; x += d; }
      }
      b[sq] = p;
      return n;
    }
    function unmake(b, sq, n, p) { b[sq] = 0; while (n--) b[stk[--sp]] = -p; }
    function discDiff(b) { let d = 0; for (let i = 0; i < 64; i++) d += b[ORDER[i]]; return d; }
    function final(b, p) { const d = discDiff(b) * p; return d > 0 ? WIN + d : d < 0 ? -WIN + d : 0; }
    // static evaluation from ember's (1) point of view, returned for side p
    function evaluate(b, p, empties) {
      let pos = 0, d = 0, fr = 0;
      for (let i = 0; i < 64; i++) {
        const sq = ORDER[i], v = b[sq];
        if (!v) continue;
        pos += v * W[sq]; d += v;
        for (let k = 0; k < 8; k++) if (b[sq + DIRS[k]] === 0) { fr += v; break; }
      }
      for (let c = 0; c < 4; c++) {
        const cv = b[CORN[c][0]];
        if (!cv) continue;
        const a = CORN[c][1];
        // once a corner is taken its neighbours are no longer dangerous; same-colour ones are good (stable edges)
        for (let j = 0; j < 3; j++) { const v = b[a[j]]; if (v) pos += v * (-W[a[j]] + (v === cv ? 12 : 0)); }
      }
      const m1 = count(b, 1), m2 = count(b, -1);
      let s = pos + 9 * (m1 - m2) - 5 * fr;
      if (m1 === 0 && m2 > 0) s -= 30; else if (m2 === 0 && m1 > 0) s += 30;
      if (empties <= 18) s += d * (19 - empties) * 2;
      return s * p;
    }
    let nodes = 0, stop = false, deadline = 0;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    function orderMoves(b, p, mv, n, ply) {
      // fastest-first: prefer moves that leave the opponent few replies, then the positional table
      const ks = keyBuf[ply];
      for (let i = 0; i < n; i++) {
        const sq = mv[i], k = make(b, sq, p);
        ks[i] = count(b, -p) * 64 - (W[sq] >> 2);
        unmake(b, sq, k, p);
      }
      for (let i = 1; i < n; i++) {
        const m = mv[i], kk = ks[i];
        let j = i - 1;
        while (j >= 0 && ks[j] > kk) { mv[j + 1] = mv[j]; ks[j + 1] = ks[j]; j--; }
        mv[j + 1] = m; ks[j + 1] = kk;
      }
    }
    function negamax(b, p, depth, alpha, beta, ply, passed, empties) {
      if ((++nodes & 1023) === 0 && now() > deadline) stop = true;
      if (stop) return 0;
      if (empties === 0) return final(b, p);
      if (depth <= 0) return evaluate(b, p, empties);
      const mv = bufs[ply], n = gen(b, p, mv);
      if (n === 0) {
        if (passed) return final(b, p);
        return -negamax(b, -p, depth, -beta, -alpha, ply + 1, true, empties);
      }
      if (depth >= 3 && n > 1) orderMoves(b, p, mv, n, ply);
      let best = -INF;
      for (let i = 0; i < n; i++) {
        const sq = mv[i], k = make(b, sq, p);
        const v = -negamax(b, -p, depth - 1, -beta, -alpha, ply + 1, false, empties - 1);
        unmake(b, sq, k, p);
        if (stop) return 0;
        if (v > best) { best = v; if (v > alpha) { alpha = v; if (alpha >= beta) break; } }
      }
      return best;
    }
    function rootSearch(b, p, root, d, empties, full) {
      const sc = [];
      let alpha = -INF;
      for (let i = 0; i < root.length; i++) {
        const sq = root[i], k = make(b, sq, p);
        const v = -negamax(b, -p, d - 1, -INF, full ? INF : -alpha, 1, false, empties - 1);
        unmake(b, sq, k, p);
        if (stop) return null;
        sc.push(v);
        if (v > alpha) alpha = v;
      }
      return sc;
    }
    function search(b64, p, opt) {
      const b = toMB(b64), t0 = now(), time = opt.time || 500;
      deadline = t0 + time; nodes = 0; stop = false; sp = 0;
      let empties = 0;
      for (let i = 0; i < 64; i++) if (!b64[i]) empties++;
      const mv = new Int16Array(40), n = gen(b, p, mv);
      if (!n) return { move: -1, score: 0, depth: 0, nodes: 0 };
      let root = Array.from(mv.slice(0, n));
      // initial order: fastest-first
      const tmp = new Int16Array(root);
      orderMoves(b, p, tmp, n, 0);
      root = Array.from(tmp);
      if (n === 1 && !opt.full) return { move: U[root[0]], score: 0, depth: 0, nodes: 0 };
      const noise = opt.noise || 0, full = noise > 0;
      let bestM = root[0], bestS = 0, scores = null, done = 0, exact = false;
      const resort = sc => {
        const idx = root.map((m, i) => i).sort((x, y) => sc[y] - sc[x]);
        root = idx.map(i => root[i]); scores = idx.map(i => sc[i]);
        bestM = root[0]; bestS = scores[0];
      };
      if (opt.solve && empties <= opt.solve) {
        const sc = rootSearch(b, p, root, empties + 1, empties, full);
        if (sc) { resort(sc); done = empties; exact = true; }
        else { stop = false; nodes = 0; sp = 0; deadline = now() + 220; }
      }
      if (!exact) {
        const t1 = now(), budget = deadline - t1;
        const maxD = Math.min(opt.depth || 30, empties);
        for (let d = 1; d <= maxD; d++) {
          const sc = rootSearch(b, p, root, d, empties, full);
          if (!sc) break;
          resort(sc); done = d;
          if (Math.abs(bestS) > WIN / 2 && !full) break;
          if (now() - t1 > budget * 0.42) break;
        }
      }
      if (noise && scores) {
        let bv = -INF;
        root.forEach((m, i) => {
          if (i >= scores.length) return;
          const v = scores[i] + (Math.random() * 2 - 1) * noise;
          if (v > bv && (scores[i] > -WIN / 2 || bestS <= -WIN / 2)) { bv = v; bestM = m; bestS = scores[i]; }
        });
      }
      return { move: U[bestM], score: bestS, depth: done, exact, nodes, ms: Math.round(now() - t0) };
    }
    // helpers on the public 64-board
    function legal(b64, p) { const b = toMB(b64), mv = new Int16Array(40), n = gen(b, p, mv); const out = []; for (let i = 0; i < n; i++) out.push(U[mv[i]]); return out.sort((x, y) => x - y); }
    function flips(b64, i, p) {
      const b = toMB(b64), sq = M(i);
      if (b[sq] !== 0) return [];
      const out = [];
      for (let k = 0; k < 8; k++) {
        const d = DIRS[k];
        let x = sq + d;
        const run = [];
        while (b[x] === -p) { run.push(U[x]); x += d; }
        if (run.length && b[x] === p) for (const r of run) out.push(r);
      }
      return out;
    }
    return { search, legal, flips, WIN };
  }
  const ENG = engineFactory();
  const WORKER_SRC = 'var E=(' + engineFactory.toString() + ')();onmessage=function(e){var d=e.data;var r=E.search(d.board,d.side,d.opt);postMessage({id:d.id,r:r});};';

  /* ---------------- UI ---------------- */
  const LV = {
    easy: { label: 'Easy', depth: 1, time: 150, noise: 90 },
    medium: { label: 'Medium', depth: 3, time: 300, noise: 18 },
    hard: { label: 'Hard', depth: 6, time: 600, solve: 12 },
    expert: { label: 'Expert', depth: 40, time: 800, solve: 15 },
  };
  const LV_KEYS = Object.keys(LV);
  const COLS = 'abcdefgh';
  const sqName = i => COLS[i & 7] + ((i >> 3) + 1);
  const CSS = `
.ag-reversi{--bs:520px;font-family:var(--body);color:var(--fg);max-width:1040px;margin:0 auto;user-select:none;-webkit-user-select:none}
.ag-reversi .hd{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px}
.ag-reversi .ttl{flex:1;min-width:240px}
.ag-reversi h2{font-family:var(--display);font-size:28px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-reversi h2 span{color:var(--ember)}
.ag-reversi .how{color:var(--muted);font-size:13px;margin-top:4px;max-width:620px}
.ag-reversi .tally{display:flex;gap:6px}
.ag-reversi .tl{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:5px 12px;text-align:center;min-width:64px}
.ag-reversi .tl b{display:block;font-size:10px;letter-spacing:1.3px;color:var(--muted)}
.ag-reversi .tl i{font-style:normal;font-family:var(--display);font-weight:700;font-size:19px}
.ag-reversi .tl.w i{color:var(--ok)} .ag-reversi .tl.l i{color:var(--bad)} .ag-reversi .tl.bst i{color:var(--gold);font-size:14px;line-height:27px}
.ag-reversi .bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.ag-reversi .seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px}
.ag-reversi .seg button{height:28px;padding:0 10px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-reversi .seg button:hover{color:var(--fg)}
.ag-reversi .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-reversi .seg.dis{opacity:.4;pointer-events:none}
.ag-reversi .lbl{font-size:12px;color:var(--dim);margin-left:4px}
.ag-reversi .sp{flex:1}
.ag-reversi .main{display:flex;gap:18px;align-items:flex-start;justify-content:center;flex-wrap:wrap}
.ag-reversi .bwrap{position:relative;flex:none;padding:calc(var(--bs)/26);border-radius:14px;background:linear-gradient(160deg,#3a2c22,#21180f);box-shadow:0 0 0 1px #4a3a2e,0 18px 40px rgba(0,0,0,.5)}
.ag-reversi .board{position:relative;width:var(--bs);height:var(--bs);display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);gap:2px;background:#0d2a24;border-radius:6px;padding:2px;touch-action:manipulation;perspective:900px}
.ag-reversi .cell{position:relative;perspective:300px;background:radial-gradient(circle at 40% 30%,#1d5246,#16443a 70%);border-radius:3px;cursor:default}
.ag-reversi .cell.dot::before{content:"";position:absolute;width:5px;height:5px;border-radius:50%;background:#0d2a24;right:-4px;bottom:-4px;z-index:1}
.ag-reversi .cell.lg{cursor:pointer}
.ag-reversi .cell.lg::after{content:"";position:absolute;left:39%;top:39%;width:22%;height:22%;border-radius:50%;background:rgba(255,200,97,.35);transition:all .12s}
.ag-reversi .cell.lg.p1:hover::after,.ag-reversi .cell.lg.p1.cur::after{left:12%;top:12%;width:76%;height:76%;background:rgba(255,138,61,.45)}
.ag-reversi .cell.lg.p2:hover::after,.ag-reversi .cell.lg.p2.cur::after{left:12%;top:12%;width:76%;height:76%;background:rgba(239,227,208,.4)}
.ag-reversi .cell.nolg::after{display:none}
.ag-reversi .cell.cur{box-shadow:inset 0 0 0 2px var(--cool)}
.ag-reversi .cell.last{box-shadow:inset 0 0 0 2px rgba(255,200,97,.55)}
.ag-reversi .cell.cur.last{box-shadow:inset 0 0 0 2px var(--cool)}
.ag-reversi .cell.hint{animation:agrvh .7s ease-in-out infinite alternate}
@keyframes agrvh{from{box-shadow:inset 0 0 0 2px rgba(255,200,97,.2)}to{box-shadow:inset 0 0 0 4px var(--gold),0 0 14px rgba(255,200,97,.6)}}
.ag-reversi .dk{position:absolute;inset:9%;transform-style:preserve-3d;transition:transform .42s cubic-bezier(.3,.6,.35,1);pointer-events:none}
.ag-reversi .dk.c{transform:rotateY(180deg)}
.ag-reversi .dk .f,.ag-reversi .dk .k{position:absolute;inset:0;border-radius:50%;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.ag-reversi .dk .f{background:radial-gradient(circle at 35% 30%,#ffc08f,#ff8a3d 48%,#c4520f 100%);box-shadow:0 3px 0 #7a3208,0 6px 9px rgba(0,0,0,.45)}
.ag-reversi .dk .k{transform:rotateY(180deg);background:radial-gradient(circle at 35% 30%,#ffffff,#efe3d0 48%,#b9a68c 100%);box-shadow:0 3px 0 #75644f,0 6px 9px rgba(0,0,0,.45)}
.ag-reversi .dk .f::after,.ag-reversi .dk .k::after{content:"";position:absolute;inset:20%;border-radius:50%;border:2px solid rgba(0,0,0,.13)}
.ag-reversi .dk.new{animation:agrvd .28s cubic-bezier(.3,1.6,.5,1)}
@keyframes agrvd{from{transform:scale(1.5) translateY(-8%);opacity:0}to{opacity:1}}
.ag-reversi .dk.c.new{animation:agrvdc .28s cubic-bezier(.3,1.6,.5,1)}
@keyframes agrvdc{from{transform:rotateY(180deg) scale(1.5);opacity:0}to{transform:rotateY(180deg);opacity:1}}
.ag-reversi .co{position:absolute;font:600 calc(var(--bs)/52)/1 var(--mono);color:rgba(239,227,208,.38);pointer-events:none;z-index:2}
.ag-reversi .co.r{left:4%;top:4%}.ag-reversi .co.c{right:5%;bottom:4%}
.ag-reversi .gover{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(18,14,12,.93);border:1px solid var(--line);border-radius:14px;padding:16px 26px;text-align:center;z-index:9;box-shadow:0 16px 40px rgba(0,0,0,.6);pointer-events:none;animation:agrvo .35s ease-out}
@keyframes agrvo{from{opacity:0;transform:translate(-50%,-40%)}}
.ag-reversi .gover b{display:block;font-family:var(--display);font-size:22px;color:var(--gold)}
.ag-reversi .gover span{color:var(--muted);font-size:13px}
.ag-reversi .side{flex:1 1 260px;max-width:460px;min-width:250px;display:flex;flex-direction:column;gap:10px}
.ag-reversi .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.ag-reversi .score{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ag-reversi .pl{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:8px 10px;display:flex;align-items:center;gap:10px;transition:box-shadow .2s,border-color .2s}
.ag-reversi .pl.on{border-color:var(--ember);box-shadow:0 0 0 1px var(--ember),0 0 16px rgba(255,138,61,.25)}
.ag-reversi .pl .chip{width:26px;height:26px;border-radius:50%;flex:none}
.ag-reversi .chip.p1{background:radial-gradient(circle at 35% 30%,#ffc08f,#ff8a3d 48%,#c4520f 100%)}
.ag-reversi .chip.p2{background:radial-gradient(circle at 35% 30%,#ffffff,#efe3d0 48%,#b9a68c 100%)}
.ag-reversi .pl b{display:block;font-size:10px;letter-spacing:1.2px;color:var(--muted)}
.ag-reversi .pl i{font-style:normal;font-family:var(--display);font-weight:700;font-size:24px;line-height:1.1}
.ag-reversi .meter{height:8px;border-radius:5px;background:#efe3d0;overflow:hidden;margin-top:8px}
.ag-reversi .meter div{height:100%;background:linear-gradient(90deg,#c4520f,#ff8a3d);transition:width .4s}
.ag-reversi .status{font-weight:700;font-size:15px;min-height:22px}
.ag-reversi .status.y{color:var(--ember)} .ag-reversi .status.c{color:#efe3d0} .ag-reversi .status.w{color:var(--gold)}
.ag-reversi .sub{font-size:12.5px;color:var(--muted);margin-top:3px;min-height:18px}
.ag-reversi .think{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid rgba(239,227,208,.25);border-top-color:#efe3d0;vertical-align:-2px;margin-left:8px;animation:agrvs .7s linear infinite}
@keyframes agrvs{to{transform:rotate(360deg)}}
.ag-reversi .log{font-family:var(--mono);font-size:12.5px;color:var(--muted);max-height:110px;overflow:auto;line-height:1.6}
.ag-reversi .log span{display:inline-block;min-width:78px}
.ag-reversi .keys{font-size:12px;color:var(--dim);line-height:1.7}
.ag-reversi kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-reversi details{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 14px;font-size:13px;color:var(--muted)}
.ag-reversi summary{cursor:pointer;color:var(--fg);font-weight:700}
.ag-reversi details ul{margin:6px 0 2px;padding-left:18px}
.ag-reversi details li{margin:3px 0;line-height:1.45}
.ag-reversi details b{color:var(--fg)}
`;

  let inst = null;
  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
    const opts = Object.assign({ mode: 'cpu', level: 'medium', side: 'ember', moves: true }, api.load('opts') || {});
    if (!LV[opts.level]) opts.level = 'medium';
    const stats = Object.assign({}, api.load('stats') || {});
    for (const k in LV) stats[k] = Object.assign({ w: 0, l: 0, d: 0 }, stats[k] || {});
    let bestRec = api.load('bestRec');
    let soundOn = api.load('sound'); if (soundOn === null) soundOn = !!api.sound;
    let actx = null;
    function tone(f, d, type, vol, f2, at) {
      if (!soundOn) return;
      try {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        const t = actx.currentTime + (at || 0), o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol || 0.05, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
      } catch (e) { /* ignore */ }
    }

    // ---- worker (created lazily from a Blob; falls back to a time-limited synchronous search) ----
    let worker = null, workerURL = null, workerOK = true, reqId = 0;
    const pending = new Map();
    function getWorker() {
      if (worker || !workerOK) return worker;
      try {
        workerURL = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
        worker = new Worker(workerURL);
        worker.onmessage = e => { const cb = pending.get(e.data.id); pending.delete(e.data.id); if (cb) cb(e.data.r); };
        worker.onerror = () => { workerOK = false; killWorker(); };
      } catch (e) { workerOK = false; worker = null; }
      return worker;
    }
    function killWorker() {
      if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; }
      if (workerURL) { try { URL.revokeObjectURL(workerURL); } catch (e) { /* ignore */ } workerURL = null; }
      // anything that was waiting gets answered synchronously
      const waiting = Array.from(pending.values()); pending.clear();
      waiting.forEach(fn => fn(null));
    }
    function think(b, side, opt, cb) {
      const id = ++reqId, w = getWorker();
      if (w) {
        pending.set(id, r => cb(r || ENG.search(b, side, Object.assign({}, opt, { time: Math.min(opt.time, 400) }))));
        try { w.postMessage({ id, board: Array.from(b), side, opt }); return; } catch (e) { pending.delete(id); }
      }
      later(() => cb(ENG.search(b, side, opt)), 30);
    }

    const root = document.createElement('div'); root.className = 'ag-reversi';
    root.innerHTML = `
<div class="hd"><div class="ttl"><h2>Flip <span>Discs</span></h2><div class="how">Place a disc so that it sandwiches a straight line of your opponent's discs (across, down or diagonal) between it and another of yours; every sandwiched disc flips to your colour. No legal move means you pass. Most discs when the board fills wins.</div></div>
<div class="tally"><div class="tl w"><b>WON</b><i data-r="tw">0</i></div><div class="tl l"><b>LOST</b><i data-r="tl">0</i></div><div class="tl"><b>DRAWN</b><i data-r="td">0</i></div><div class="tl bst"><b>BEST WIN</b><i data-r="best">-</i></div></div></div>
<div class="bar">
<button class="btn pri small" data-r="new">New game</button>
<div class="seg" data-r="mode"><button data-v="cpu">vs Mule</button><button data-v="two">2 players</button></div>
<span class="lbl">Level</span><div class="seg" data-r="level">${LV_KEYS.map(k => `<button data-v="${k}">${LV[k].label}</button>`).join('')}</div>
<span class="lbl">You play</span><div class="seg" data-r="side"><button data-v="ember" title="Ember moves first">Ember</button><button data-v="cream">Cream</button></div>
<span class="sp"></span>
<button class="btn sec small" data-r="undo" title="Undo (Z)">↶ Undo</button><button class="btn sec small" data-r="hint" title="Hint (C)">💡 Hint</button><button class="btn sec small" data-r="mv" title="Show legal moves"></button><button class="btn sec small" data-r="snd" title="Sound"></button></div>
<div class="main">
<div class="bwrap" data-r="bwrap"><div class="board" data-r="board"></div></div>
<div class="side">
<div class="card"><div class="score"><div class="pl" data-r="pl1"><span class="chip p1"></span><div><b data-r="n1">EMBER</b><i data-r="c1">2</i></div></div><div class="pl" data-r="pl2"><span class="chip p2"></span><div><b data-r="n2">CREAM</b><i data-r="c2">2</i></div></div></div><div class="meter"><div data-r="meter" style="width:50%"></div></div></div>
<div class="card"><div class="status" data-r="status"></div><div class="sub" data-r="sub"></div></div>
<div class="card"><div class="log" data-r="log"></div></div>
<div class="keys">Click a glowing square, or <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> + <kbd>Space</kbd>. <kbd>Z</kbd> undo · <kbd>C</kbd> hint · <kbd>Enter</kbd> new game when it's over</div>
<details data-r="tips"><summary>Tips &amp; strategy</summary><ul>
<li><b>Corners are gold.</b> A disc in a corner can never be flipped, and it anchors whole edges.</li>
<li><b>Avoid the squares next to an empty corner</b>, especially the diagonal one: playing there usually hands your opponent the corner.</li>
<li><b>Fewer discs early is often better.</b> What matters in the middle game is <b>mobility</b>: having many safe moves while your opponent has few.</li>
<li><b>Play quiet moves</b> that flip few discs and stay inside your territory, rather than ones that build long walls facing empty squares (frontier discs give your opponent options).</li>
<li><b>Force passes:</b> if your opponent has no legal move you get to play twice in a row.</li>
<li><b>Parity:</b> late on, try to make the last move in each empty region.</li>
<li>The Mule on <b>Expert</b> reads the last 14 moves perfectly. Good luck.</li></ul></details>
</div></div>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const boardEl = $('board'), wrapEl = $('bwrap');
    const cells = [], disks = new Array(64).fill(null);
    for (let i = 0; i < 64; i++) {
      const c = document.createElement('div'); c.className = 'cell'; c.dataset.i = i;
      if (i === 18 || i === 21 || i === 42 || i === 45) c.classList.add('dot');
      if ((i & 7) === 0) c.insertAdjacentHTML('beforeend', '<span class="co r">' + ((i >> 3) + 1) + '</span>');
      if (i >> 3 === 7) c.insertAdjacentHTML('beforeend', '<span class="co c">' + COLS[i & 7] + '</span>');
      boardEl.appendChild(c); cells.push(c);
    }

    let board, turn, over, busy, hist, moveLog, human, gameId = 0, hintSq = -1, lastSq = -1, cursor = 27, subMsg = '', thinking = false;
    const isHuman = p => opts.mode === 'two' || p === human;
    const pname = p => p === 1 ? 'Ember' : 'Cream';
    const counts = () => { let a = 0, b = 0; for (let i = 0; i < 64; i++) { if (board[i] === 1) a++; else if (board[i] === -1) b++; } return [a, b]; };

    function syncDisks(flipped, placed) {
      const order = new Map();
      if (flipped) {
        const pr = placed >> 3, pc = placed & 7;
        flipped.forEach(i => order.set(i, Math.max(Math.abs((i >> 3) - pr), Math.abs((i & 7) - pc))));
      }
      for (let i = 0; i < 64; i++) {
        const v = board[i];
        let d = disks[i];
        if (!v) { if (d) { d.remove(); disks[i] = null; } continue; }
        if (!d) {
          d = document.createElement('div'); d.className = 'dk' + (v < 0 ? ' c' : '') + (i === placed ? ' new' : '');
          d.innerHTML = '<div class="f"></div><div class="k"></div>';
          cells[i].appendChild(d); disks[i] = d;
          continue;
        }
        d.classList.remove('new');
        const isC = d.classList.contains('c');
        if (isC !== (v < 0)) {
          d.style.transitionDelay = order.has(i) ? (order.get(i) - 1) * 70 + 90 + 'ms' : '0ms';
          d.classList.toggle('c', v < 0);
        }
      }
    }
    function render() {
      const canAct = !over && !busy && isHuman(turn);
      const lg = canAct ? new Set(ENG.legal(board, turn)) : new Set();
      for (let i = 0; i < 64; i++) {
        const c = cells[i];
        c.classList.toggle('lg', lg.has(i));
        c.classList.toggle('nolg', !opts.moves);
        c.classList.toggle('p1', turn === 1); c.classList.toggle('p2', turn === -1);
        c.classList.toggle('last', i === lastSq);
        c.classList.toggle('hint', i === hintSq);
        c.classList.toggle('cur', canAct && i === cursor && kbdUsed);
      }
      const old = wrapEl.querySelector('.gover'); if (old) old.remove();
      if (over) {
        const d = document.createElement('div'); d.className = 'gover';
        d.innerHTML = `<b>${over.t}</b><span>${over.why}</span>`;
        wrapEl.appendChild(d);
      }
      hud();
    }
    function hud() {
      const t = stats[opts.level];
      $('tw').textContent = t.w; $('tl').textContent = t.l; $('td').textContent = t.d;
      $('best').textContent = bestRec ? bestRec.mine + '-' + bestRec.theirs + ' ' + LV[bestRec.lvl].label : '-';
      for (const k of ['mode', 'level', 'side']) root.querySelectorAll('[data-r="' + k + '"] button').forEach(b => b.classList.toggle('on', b.dataset.v === opts[k]));
      $('level').classList.toggle('dis', opts.mode === 'two'); $('side').classList.toggle('dis', opts.mode === 'two');
      $('snd').textContent = soundOn ? '🔊' : '🔇';
      $('mv').textContent = opts.moves ? '◉ Moves' : '○ Moves';
      const [a, b] = counts();
      $('c1').textContent = a; $('c2').textContent = b;
      $('meter').style.width = (a + b ? a / (a + b) * 100 : 50) + '%';
      $('n1').textContent = opts.mode === 'cpu' ? (human === 1 ? 'YOU' : 'MULE') : 'EMBER';
      $('n2').textContent = opts.mode === 'cpu' ? (human === -1 ? 'YOU' : 'MULE') : 'CREAM';
      $('pl1').classList.toggle('on', !over && turn === 1); $('pl2').classList.toggle('on', !over && turn === -1);
      const st = $('status'), sub = $('sub');
      if (over) { st.textContent = over.t; st.className = 'status w'; sub.textContent = over.why; }
      else if (!isHuman(turn)) { st.innerHTML = 'The Mule is thinking…<span class="think"></span>'; st.className = 'status c'; sub.textContent = subMsg; }
      else {
        st.textContent = opts.mode === 'two' ? pname(turn) + ' to move' : 'Your move (' + pname(turn) + ')';
        st.className = 'status ' + (turn === 1 ? 'y' : 'c');
        sub.textContent = subMsg;
      }
      let lg = '';
      for (let k = 0; k < moveLog.length; k += 2) lg += `<span>${k / 2 + 1}. ${moveLog[k]}${moveLog[k + 1] ? ' ' + moveLog[k + 1] : ''}</span> `;
      $('log').innerHTML = lg || 'No moves yet. Ember moves first.';
      $('log').scrollTop = 1e6;
      $('undo').disabled = opts.mode === 'two' ? !hist.length : !hist.some(x => x.p === human);
      $('hint').disabled = !!over || busy || !isHuman(turn);
    }
    function startBoard() { const b = new Int8Array(64); b[27] = -1; b[36] = -1; b[28] = 1; b[35] = 1; return b; }
    function newGame() {
      gameId++; clearTimers(); reqId++;
      board = startBoard(); turn = 1; over = null; busy = false; hist = []; moveLog = []; hintSq = -1; lastSq = -1; subMsg = '';
      human = opts.mode === 'two' ? 1 : (opts.side === 'ember' ? 1 : -1);
      for (let i = 0; i < 64; i++) if (disks[i]) { disks[i].remove(); disks[i] = null; }
      syncDisks(); render();
      nextTurn();
    }
    function apply(i) {
      const p = turn, fl = ENG.flips(board, i, p);
      if (!fl.length) return false;
      hist.push({ board: Int8Array.from(board), p, lastSq, log: moveLog.length });
      board[i] = p; for (const f of fl) board[f] = p;
      moveLog.push(sqName(i));
      lastSq = i; hintSq = -1; subMsg = fl.length > 1 ? `${sqName(i)} flipped ${fl.length} discs.` : `${sqName(i)} flipped 1 disc.`;
      syncDisks(fl, i);
      tone(p > 0 ? 210 : 260, 0.07, 'sine', 0.09, 120);
      let maxDist = 1;
      fl.forEach(f => { maxDist = Math.max(maxDist, Math.max(Math.abs((f >> 3) - (i >> 3)), Math.abs((f & 7) - (i & 7)))); });
      for (let d = 1; d <= maxDist; d++) tone(700 + d * 90 + (p > 0 ? 0 : 60), 0.04, 'triangle', 0.035, 0, 0.09 + (d - 1) * 0.07 + 0.12);
      turn = -p; busy = true;
      render();
      const gid = gameId;
      later(() => { if (gid !== gameId) return; busy = false; afterMove(); }, 260 + maxDist * 70);
      return true;
    }
    function afterMove() {
      const mine = ENG.legal(board, turn);
      if (mine.length) { nextTurn(); return; }
      const theirs = ENG.legal(board, -turn);
      if (!theirs.length) { finish(); return; }
      // pass
      const who = opts.mode === 'cpu' ? (turn === human ? 'You have' : 'The Mule has') : pname(turn) + ' has';
      subMsg = who + ' no legal move and must pass.';
      api.toast(who + ' no legal move: pass.');
      tone(300, 0.12, 'sine', 0.05, 220);
      moveLog.push('pass');
      busy = true; render();
      const gid = gameId;
      later(() => { if (gid !== gameId) return; busy = false; turn = -turn; render(); nextTurn(); }, 1100);
    }
    function finish() {
      const [a, b] = counts();
      const winner = a > b ? 1 : b > a ? -1 : 0;
      let t;
      if (winner === 0) t = 'Draw ' + a + '-' + b;
      else if (opts.mode === 'two') t = pname(winner) + ' wins ' + Math.max(a, b) + '-' + Math.min(a, b);
      else t = (winner === human ? 'You win ' : 'The Mule wins ') + Math.max(a, b) + '-' + Math.min(a, b);
      const why = a + b < 64 ? 'Neither side can move.' : 'The board is full.';
      over = { t, why, winner };
      if (opts.mode === 'cpu') {
        const s = stats[opts.level];
        if (winner === 0) s.d++; else if (winner === human) s.w++; else s.l++;
        api.save('stats', stats);
        if (winner === human) {
          const mine = human === 1 ? a : b, theirs = human === 1 ? b : a, li = LV_KEYS.indexOf(opts.level);
          const better = !bestRec || li > LV_KEYS.indexOf(bestRec.lvl) || (li === LV_KEYS.indexOf(bestRec.lvl) && mine - theirs > bestRec.mine - bestRec.theirs);
          if (better) {
            bestRec = { lvl: opts.level, mine, theirs };
            api.save('bestRec', bestRec);
            api.save('best', mine + '-' + theirs + ' ' + LV[opts.level].label);
            over.why += ' New best win!';
          }
        }
      }
      if (winner === 0) tone(420, 0.25, 'sine', 0.05);
      else if (opts.mode === 'two' || winner === human) { [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.16, 'triangle', 0.06, 0, k * 0.11)); }
      else tone(330, 0.35, 'sawtooth', 0.035, 140);
      render();
    }
    function nextTurn() {
      if (over) return;
      subMsg = subMsg || '';
      if (isHuman(turn)) { render(); return; }
      busy = true; render();
      const gid = gameId, t0 = performance.now(), L = LV[opts.level];
      think(board, turn, { depth: L.depth, time: L.time, noise: L.noise || 0, solve: L.solve || 0 }, r => {
        if (gid !== gameId || over) return;
        const wait = Math.max(0, 420 - (performance.now() - t0));
        later(() => {
          if (gid !== gameId) return;
          busy = false;
          if (r && r.move >= 0) apply(r.move);
          else afterMove();
        }, wait);
      });
    }
    function clickSq(i) {
      if (over || busy || !isHuman(turn)) return;
      if (!apply(i)) { tone(160, 0.06, 'square', 0.025); }
    }
    function undo() {
      if (!hist.length) return;
      if (opts.mode === 'cpu' && !hist.some(x => x.p === human)) return;
      gameId++; clearTimers(); reqId++;
      let h;
      do { h = hist.pop(); } while (opts.mode === 'cpu' && h.p !== human && hist.length);
      board = Int8Array.from(h.board); turn = h.p; lastSq = h.lastSq; moveLog.length = h.log;
      over = null; busy = false; hintSq = -1; subMsg = 'Move taken back.';
      for (let i = 0; i < 64; i++) if (disks[i]) disks[i].style.transitionDelay = '0ms';
      syncDisks(); tone(380, 0.06, 'triangle', 0.04, 300);
      render(); nextTurn();
    }
    function hint() {
      if (over || busy || !isHuman(turn)) return;
      const gid = gameId, mv = hist.length;
      $('hint').disabled = true; subMsg = 'Thinking about a hint…'; hud();
      think(board, turn, { depth: 40, time: 500, solve: 12 }, r => {
        if (gid !== gameId || mv !== hist.length || busy || over || !r || r.move < 0) return;
        hintSq = r.move; cursor = r.move;
        subMsg = 'Hint: try ' + sqName(r.move) + '.';
        tone(880, 0.08, 'sine', 0.04);
        render();
      });
    }
    let kbdUsed = false;
    function onClick(e) {
      const c = e.target.closest('.cell');
      if (c && boardEl.contains(c)) { kbdUsed = false; clickSq(+c.dataset.i); return; }
      const b = e.target.closest('button'); if (!b) return;
      b.blur();
      const r = b.dataset.r, par = b.parentNode.dataset.r;
      if (r === 'new') newGame();
      else if (r === 'undo') undo();
      else if (r === 'hint') hint();
      else if (r === 'mv') { opts.moves = !opts.moves; api.save('opts', opts); render(); }
      else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); hud(); tone(600, 0.05); }
      else if (par === 'mode' || par === 'level' || par === 'side') {
        if (opts[par] !== b.dataset.v) { opts[par] = b.dataset.v; api.save('opts', opts); newGame(); }
      }
    }
    function onKey(e) {
      if (el.offsetParent === null || document.hidden) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const mv = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[k];
      if (mv) {
        e.preventDefault(); kbdUsed = true;
        const r = Math.min(7, Math.max(0, (cursor >> 3) + mv[0])), c = Math.min(7, Math.max(0, (cursor & 7) + mv[1]));
        cursor = r * 8 + c; render(); return;
      }
      if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        if (over) { if (k === 'Enter' || k === ' ') newGame(); return; }
        if (!kbdUsed) { kbdUsed = true; render(); return; }
        clickSq(cursor); return;
      }
      if (k === 'z' || k === 'Z' || k === 'x' || k === 'X' || k === 'Backspace') { e.preventDefault(); undo(); return; }
      if (k === 'c' || k === 'C' || k === 'h' || k === 'H') { e.preventDefault(); hint(); }
    }
    function fit() {
      const w = root.clientWidth || 900, top = el.getBoundingClientRect().top;
      const hAvail = window.innerHeight - Math.max(0, top) - 190;
      const maxW = w >= 800 ? w - 300 : w - 40;
      root.style.setProperty('--bs', Math.max(288, Math.floor(Math.min(560, maxW, Math.max(288, hAvail)) / 8) * 8) + 'px');
    }
    function onResize() { if (el.offsetParent === null || document.hidden) return; fit(); }
    root.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    fit();
    newGame();

    return {
      destroy() {
        gameId++; reqId++;
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        root.removeEventListener('click', onClick);
        clearTimers();
        pending.clear();
        if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; }
        if (workerURL) { try { URL.revokeObjectURL(workerURL); } catch (e) { /* ignore */ } workerURL = null; }
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        el.innerHTML = '';
      },
      _test: {
        get state() { return { board: Array.from(board), turn, over, busy, moves: moveLog.slice(), human, hintSq, hasWorker: !!worker }; },
        setBoard(arr, t) { gameId++; clearTimers(); board = Int8Array.from(arr); turn = t || 1; over = null; busy = false; hist = []; moveLog = []; hintSq = -1; syncDisks(); render(); afterMove(); },
        play: i => clickSq(i), newGame, undo, hint, opts,
      },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { inst.destroy(); inst = null; this._t = null; } },
    engine: ENG,
  };
})();
