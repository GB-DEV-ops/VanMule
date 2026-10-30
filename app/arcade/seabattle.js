/* VanMule Arcade: "Sea Battle" - hide five ships, then trade shots with the Mule's fleet on a 10x10 grid.
   Drag / rotate / random placement, three AI levels (random+follow-up, hunt/target with parity, probability density). */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'seabattle';
  const N = 10;
  const FLEET = [
    { name: 'Flagship', len: 5 },
    { name: 'Cruiser', len: 4 },
    { name: 'Destroyer', len: 3 },
    { name: 'Submarine', len: 3 },
    { name: 'Patrol boat', len: 2 },
  ];
  const COLS = 'ABCDEFGHIJ';
  const cellName = i => COLS[i % N] + (((i / N) | 0) + 1);
  const LV = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

  /* ---------------- pure helpers ---------------- */
  function cellsOf(r, c, len, vert) {
    const out = [];
    for (let k = 0; k < len; k++) {
      const rr = vert ? r + k : r, cc = vert ? c : c + k;
      if (rr < 0 || cc < 0 || rr >= N || cc >= N) return null;
      out.push(rr * N + cc);
    }
    return out;
  }
  function fits(occ, cells, ignore) {
    if (!cells) return false;
    for (const i of cells) if (occ[i] && occ[i] !== ignore) return false;
    return true;
  }
  function randomFleet(rng) {
    rng = rng || Math.random;
    for (;;) {
      const occ = new Int8Array(N * N), ships = [];
      let ok = true;
      for (let s = 0; s < FLEET.length && ok; s++) {
        let placed = false;
        for (let t = 0; t < 400 && !placed; t++) {
          const vert = rng() < 0.5, r = (rng() * N) | 0, c = (rng() * N) | 0;
          const cells = cellsOf(r, c, FLEET[s].len, vert);
          if (fits(occ, cells)) { cells.forEach(i => { occ[i] = s + 1; }); ships.push({ r, c, vert }); placed = true; }
        }
        if (!placed) ok = false;
      }
      if (ok) return ships;
    }
  }
  // AI: view[i] 0 unknown, 1 miss, 2 hit (ship not yet sunk), 3 sunk ship cell. remaining: lengths of ships still afloat.
  function neighbours(i) {
    const r = (i / N) | 0, c = i % N, out = [];
    if (r > 0) out.push(i - N); if (r < N - 1) out.push(i + N); if (c > 0) out.push(i - 1); if (c < N - 1) out.push(i + 1);
    return out;
  }
  const pick = a => a[(Math.random() * a.length) | 0];
  function aiEasy(view) {
    const hits = [], unk = [];
    for (let i = 0; i < N * N; i++) { if (view[i] === 2) hits.push(i); else if (!view[i]) unk.push(i); }
    if (hits.length && Math.random() < 0.4) {
      const cand = [];
      hits.forEach(h => neighbours(h).forEach(n => { if (!view[n]) cand.push(n); }));
      if (cand.length) return pick(cand);
    }
    return pick(unk);
  }
  function aiMedium(view, remaining) {
    const hits = [];
    for (let i = 0; i < N * N; i++) if (view[i] === 2) hits.push(i);
    if (hits.length) {
      // extend lines of two or more hits first
      const line = [];
      for (const h of hits) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const r = (h / N) | 0, c = h % N;
          const nr = r + dr, nc = c + dc;
          if (nr >= N || nc >= N || view[nr * N + nc] !== 2) continue;
          // walk both ends
          for (const s of [-1, 1]) {
            let rr = r, cc = c;
            while (rr >= 0 && cc >= 0 && rr < N && cc < N && view[rr * N + cc] === 2) { rr += dr * s; cc += dc * s; }
            if (rr >= 0 && cc >= 0 && rr < N && cc < N && !view[rr * N + cc]) line.push(rr * N + cc);
          }
        }
      }
      if (line.length) return pick(line);
      const cand = [];
      hits.forEach(h => neighbours(h).forEach(n => { if (!view[n]) cand.push(n); }));
      if (cand.length) return pick(cand);
    }
    const m = Math.min.apply(null, remaining);
    const par = [], unk = [];
    for (let i = 0; i < N * N; i++) {
      if (view[i]) continue;
      unk.push(i);
      if ((((i / N) | 0) + (i % N)) % m === 0) par.push(i);
    }
    return pick(par.length ? par : unk);
  }
  function density(view, remaining) {
    const d = new Float64Array(N * N);
    let anyHit = false;
    for (let i = 0; i < N * N; i++) if (view[i] === 2) { anyHit = true; break; }
    for (const len of remaining) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (let v = 0; v < 2; v++) {
        const cells = cellsOf(r, c, len, !!v);
        if (!cells) continue;
        let ok = true, h = 0;
        for (const i of cells) { const s = view[i]; if (s === 1 || s === 3) { ok = false; break; } if (s === 2) h++; }
        if (!ok) continue;
        if (anyHit && !h) continue;
        const w = anyHit ? Math.pow(30, h) : 1;
        for (const i of cells) if (!view[i]) d[i] += w;
      }
    }
    return d;
  }
  function aiHard(view, remaining) {
    let d = density(view, remaining), best = -1, cand = [];
    let total = 0;
    for (let i = 0; i < N * N; i++) total += d[i];
    if (!total) d = density(view.map(v => (v === 2 ? 0 : v)), remaining); // hits we can't explain: fall back to hunting
    for (let i = 0; i < N * N; i++) {
      if (view[i]) continue;
      let v = d[i];
      // in hunt mode, a slight checkerboard preference breaks ties toward efficient coverage
      if (v > best + 1e-9) { best = v; cand = [i]; } else if (Math.abs(v - best) <= 1e-9) cand.push(i);
    }
    if (!cand.length) { for (let i = 0; i < N * N; i++) if (!view[i]) cand.push(i); }
    return pick(cand);
  }

  /* ---------------- UI ---------------- */
  const CSS = `
.ag-seabattle{--cs:34px;position:relative;font-family:var(--body);color:var(--fg);max-width:1080px;margin:0 auto;user-select:none;-webkit-user-select:none}
.ag-seabattle .hd{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px}
.ag-seabattle .ttl{flex:1;min-width:240px}
.ag-seabattle h2{font-family:var(--display);font-size:28px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-seabattle h2 span{color:var(--cool)}
.ag-seabattle .how{color:var(--muted);font-size:13px;margin-top:4px;max-width:640px}
.ag-seabattle .tally{display:flex;gap:6px}
.ag-seabattle .tl{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:5px 12px;text-align:center;min-width:64px}
.ag-seabattle .tl b{display:block;font-size:10px;letter-spacing:1.3px;color:var(--muted)}
.ag-seabattle .tl i{font-style:normal;font-family:var(--display);font-weight:700;font-size:19px}
.ag-seabattle .tl.w i{color:var(--ok)} .ag-seabattle .tl.l i{color:var(--bad)} .ag-seabattle .tl.b i{color:var(--gold)}
.ag-seabattle .bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.ag-seabattle .seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px}
.ag-seabattle .seg button{height:28px;padding:0 10px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-seabattle .seg button:hover{color:var(--fg)}
.ag-seabattle .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-seabattle .lbl{font-size:12px;color:var(--dim);margin-left:4px}
.ag-seabattle .sp{flex:1}
.ag-seabattle .status{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:9px 14px;margin-bottom:12px;display:flex;align-items:center;gap:12px;min-height:44px}
.ag-seabattle .status .msg{font-weight:700;font-size:15px;flex:1}
.ag-seabattle .status .msg small{display:block;font-weight:500;font-size:12.5px;color:var(--muted)}
.ag-seabattle .status.you .msg{color:var(--cool)} .ag-seabattle .status.cpu .msg{color:var(--ember)} .ag-seabattle .status.end .msg{color:var(--gold)}
.ag-seabattle .main{display:flex;gap:22px;justify-content:center;align-items:flex-start;flex-wrap:wrap}
.ag-seabattle .pane{display:flex;flex-direction:column;gap:8px}
.ag-seabattle .pane h3{margin:0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:8px;padding-left:var(--cs)}
.ag-seabattle .pane h3 em{font-style:normal;color:var(--fg)}
.ag-seabattle .pane.act h3 em{color:var(--cool)}
.ag-seabattle .gw{display:grid;grid-template-columns:var(--cs) calc(var(--cs) * 10);grid-template-rows:calc(var(--cs) * .7) calc(var(--cs) * 10)}
.ag-seabattle .gl{display:flex;font:600 calc(var(--cs) * .32)/1 var(--mono);color:var(--dim)}
.ag-seabattle .gl span{flex:1;display:flex;align-items:center;justify-content:center}
.ag-seabattle .gl.v{flex-direction:column}
.ag-seabattle .grid{position:relative;width:calc(var(--cs) * 10);height:calc(var(--cs) * 10);border-radius:8px;overflow:hidden;
  background:radial-gradient(ellipse at 30% 20%,#1d5a73 0%,#123d52 45%,#0b2636 100%);box-shadow:0 0 0 1px #2a5468,0 14px 34px rgba(0,0,0,.45);touch-action:none}
.ag-seabattle .grid::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;
  background:repeating-radial-gradient(ellipse at 70% 120%,transparent 0 18px,rgba(255,255,255,.035) 19px 20px,transparent 21px 38px)}
.ag-seabattle .cells{position:absolute;inset:0;display:grid;grid-template-columns:repeat(10,1fr);grid-template-rows:repeat(10,1fr)}
.ag-seabattle .cell{position:relative;border-right:1px solid rgba(160,220,240,.09);border-bottom:1px solid rgba(160,220,240,.09)}
.ag-seabattle .foe .cell.can{cursor:crosshair}
.ag-seabattle .foe .cell.can:hover,.ag-seabattle .cell.cur{background:rgba(111,211,199,.18);box-shadow:inset 0 0 0 2px rgba(111,211,199,.7)}
.ag-seabattle .cell.miss::after{content:"";position:absolute;left:36%;top:36%;width:28%;height:28%;border-radius:50%;background:rgba(220,240,250,.75);box-shadow:0 0 0 calc(var(--cs) * .07) rgba(220,240,250,.18)}
.ag-seabattle .cell.hit::after{content:"";position:absolute;inset:14%;border-radius:50%;z-index:3;
  background:radial-gradient(circle,#fff3c4 0 14%,#ffc861 24%,#ff8a3d 46%,rgba(255,90,82,.85) 62%,rgba(255,90,82,0) 72%);filter:drop-shadow(0 0 6px rgba(255,120,60,.8))}
.ag-seabattle .cell.sunk::after{background:radial-gradient(circle,#5b4a40 0 22%,#3b2f29 40%,rgba(30,20,16,0) 70%);filter:none}
.ag-seabattle .cell.last{box-shadow:inset 0 0 0 2px rgba(255,200,97,.8)}
.ag-seabattle .ships{position:absolute;inset:0;pointer-events:none}
.ag-seabattle .ship{position:absolute;left:0;top:0;--len:3;width:calc(var(--cs) * var(--len));height:var(--cs);padding:calc(var(--cs) * .14) calc(var(--cs) * .08);transition:transform .15s,opacity .3s}
.ag-seabattle .ship.v{width:var(--cs);height:calc(var(--cs) * var(--len));padding:calc(var(--cs) * .08) calc(var(--cs) * .14)}
.ag-seabattle .hull{position:relative;width:100%;height:100%;border-radius:calc(var(--cs) * .16) calc(var(--cs) * .5) calc(var(--cs) * .5) calc(var(--cs) * .16);
  background:linear-gradient(180deg,#b9c4cc 0%,#8996a1 45%,#5d6973 100%);box-shadow:0 3px 6px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.12);display:flex;align-items:center;justify-content:space-evenly}
.ag-seabattle .ship.v .hull{flex-direction:column;border-radius:calc(var(--cs) * .5) calc(var(--cs) * .5) calc(var(--cs) * .16) calc(var(--cs) * .16);background:linear-gradient(90deg,#b9c4cc 0%,#8996a1 45%,#5d6973 100%)}
.ag-seabattle .hull i{width:calc(var(--cs) * .26);height:calc(var(--cs) * .26);border-radius:50%;background:#4a545d;box-shadow:inset 0 1px 0 rgba(255,255,255,.2)}
.ag-seabattle .hull i:first-child{background:var(--ember);box-shadow:0 0 4px rgba(255,138,61,.6)}
.ag-seabattle .grid.foe .hull{background:linear-gradient(180deg,#9b8c82,#6e6058 50%,#463c36)}
.ag-seabattle .grid.foe .hull i:first-child{background:#efe3d0;box-shadow:none}
.ag-seabattle .ship.wreck{opacity:.75}
.ag-seabattle .ship.wreck .hull{filter:grayscale(.7) brightness(.55)}
.ag-seabattle .ship.ghost{opacity:.45}
.ag-seabattle .ship.reveal{opacity:.55}
.ag-seabattle .ship.reveal .hull{filter:brightness(1.1);outline:2px dashed rgba(239,227,208,.5);outline-offset:1px}
.ag-seabattle .ship.sinking{animation:agsbsink .7s ease-in}
@keyframes agsbsink{0%{transform:translate(var(--x),var(--y)) rotate(0)}25%{transform:translate(var(--x),var(--y)) rotate(-2deg) scale(1.04)}60%{transform:translate(var(--x),var(--y)) rotate(1.5deg)}100%{transform:translate(var(--x),var(--y)) rotate(0)}}
.ag-seabattle .mine.placing .ship.mv{pointer-events:auto;cursor:grab}
.ag-seabattle .drag{position:absolute;z-index:20;pointer-events:none;transition:none!important}
.ag-seabattle .drag.bad .hull{background:linear-gradient(180deg,#ff8a80,#d6463e);opacity:.85}
.ag-seabattle .drag.ok .hull{box-shadow:0 0 0 2px var(--cool),0 8px 16px rgba(0,0,0,.5)}
.ag-seabattle .snap{position:absolute;pointer-events:none;border-radius:6px;z-index:4;transition:none}
.ag-seabattle .snap.ok{background:rgba(111,211,199,.22);box-shadow:inset 0 0 0 2px rgba(111,211,199,.8)}
.ag-seabattle .snap.bad{background:rgba(255,90,82,.22);box-shadow:inset 0 0 0 2px rgba(255,90,82,.8)}
.ag-seabattle .fx{position:absolute;width:var(--cs);height:var(--cs);pointer-events:none;z-index:6}
.ag-seabattle .fx .shell{position:absolute;left:35%;top:35%;width:30%;height:30%;border-radius:50%;background:#20262b;box-shadow:0 0 0 2px rgba(255,255,255,.3);animation:agsbshell .26s ease-in forwards}
@keyframes agsbshell{from{transform:translate(-60%,-260%) scale(2.6);opacity:.2}to{transform:none;opacity:1}}
.ag-seabattle .fx .ring{position:absolute;inset:20%;border-radius:50%;border:2px solid rgba(220,245,255,.9);opacity:0;animation:agsbring .7s ease-out forwards}
@keyframes agsbring{0%{opacity:1;transform:scale(.3)}100%{opacity:0;transform:scale(2.2)}}
.ag-seabattle .fx .drop{position:absolute;left:46%;top:46%;width:8%;height:8%;border-radius:50%;background:#dff4ff;opacity:0;animation:agsbdrop .55s ease-out forwards}
@keyframes agsbdrop{0%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}
.ag-seabattle .fx .boom{position:absolute;inset:-30%;border-radius:50%;opacity:0;background:radial-gradient(circle,#fff6d0 0 12%,#ffc861 28%,#ff8a3d 48%,rgba(255,90,82,.7) 62%,rgba(255,90,82,0) 72%);animation:agsbboom .6s ease-out forwards}
@keyframes agsbboom{0%{opacity:1;transform:scale(.2)}40%{opacity:1;transform:scale(1.15)}100%{opacity:0;transform:scale(1.5)}}
.ag-seabattle .fx .spark{position:absolute;left:46%;top:46%;width:9%;height:9%;border-radius:2px;background:#ffc861;opacity:0;animation:agsbdrop .6s ease-out forwards}
.ag-seabattle .grid.shake{animation:agsbshake .35s}
@keyframes agsbshake{0%,100%{transform:none}20%{transform:translate(-4px,2px)}40%{transform:translate(4px,-2px)}60%{transform:translate(-3px,-1px)}80%{transform:translate(2px,1px)}}
.ag-seabattle .fleet{display:flex;gap:6px;flex-wrap:wrap;padding-left:var(--cs);max-width:calc(var(--cs) * 11)}
.ag-seabattle .fl{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:3px 7px}
.ag-seabattle .fl i{display:flex;gap:2px}
.ag-seabattle .fl i b{width:7px;height:7px;border-radius:2px;background:#8996a1}
.ag-seabattle .fl i b.h{background:var(--ember)}
.ag-seabattle .fl.dead{opacity:.45;text-decoration:line-through}
.ag-seabattle .dock{width:calc(var(--cs) * 10);margin-left:var(--cs);min-height:calc(var(--cs) * 10);background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px}
.ag-seabattle .dock h4{margin:0;font-size:14px}
.ag-seabattle .dock p{margin:0;font-size:12.5px;color:var(--muted)}
.ag-seabattle .dk{display:flex;align-items:center;gap:10px;cursor:grab;border-radius:8px;padding:4px 6px;border:1px solid transparent}
.ag-seabattle .dk:hover{background:var(--panel2);border-color:var(--line)}
.ag-seabattle .dk.sel{border-color:var(--cool);background:rgba(111,211,199,.08)}
.ag-seabattle .dk.done{opacity:.35;cursor:default}
.ag-seabattle .dk .ship{position:relative;transform:none!important;flex:none}
.ag-seabattle .dk span{font-size:12.5px;color:var(--muted)}
.ag-seabattle .dock .btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
.ag-seabattle .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
.ag-seabattle .st{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.ag-seabattle .st b{display:block;font-size:10px;letter-spacing:1.2px;color:var(--muted)}
.ag-seabattle .st i{font-style:normal;font-family:var(--mono);font-size:17px;font-weight:700}
.ag-seabattle .keys{font-size:12px;color:var(--dim);line-height:1.7;margin-top:10px}
.ag-seabattle kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-seabattle details{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 14px;font-size:13px;color:var(--muted);margin-top:10px}
.ag-seabattle summary{cursor:pointer;color:var(--fg);font-weight:700}
.ag-seabattle details ul{margin:6px 0 2px;padding-left:18px}
.ag-seabattle details li{margin:3px 0;line-height:1.45}
.ag-seabattle details b{color:var(--fg)}
.ag-seabattle .gover{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(10,18,24,.93);border:1px solid var(--line);border-radius:14px;padding:14px 22px;text-align:center;z-index:9;box-shadow:0 16px 40px rgba(0,0,0,.6);animation:agsbo .35s ease-out;white-space:nowrap}
@keyframes agsbo{from{opacity:0;transform:translate(-50%,-40%)}}
.ag-seabattle .gover b{display:block;font-family:var(--display);font-size:20px;color:var(--gold)}
.ag-seabattle .gover span{display:block;color:var(--muted);font-size:12.5px;margin:4px 0 10px}
`;

  let inst = null;
  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
    const opts = Object.assign({ level: 'medium', bonus: false }, api.load('opts') || {});
    if (!LV[opts.level]) opts.level = 'medium';
    const stats = Object.assign({ best: 0 }, api.load('stats') || {});
    for (const k in LV) stats[k] = Object.assign({ w: 0, l: 0 }, stats[k] || {});
    stats.shots = stats.shots || 0; stats.hits = stats.hits || 0;
    let soundOn = api.load('sound'); if (soundOn === null) soundOn = !!api.sound;

    /* ---- sound ---- */
    let actx = null, noiseBuf = null;
    function ac() {
      if (!soundOn) return null;
      try {
        if (!actx) {
          actx = new (window.AudioContext || window.webkitAudioContext)();
          const len = actx.sampleRate | 0; noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
          const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }
      } catch (e) { actx = null; }
      return actx;
    }
    function tone(f, d, type, vol, f2, at) {
      const a = ac(); if (!a) return;
      try {
        const t = a.currentTime + (at || 0), o = a.createOscillator(), g = a.createGain();
        o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol || 0.05, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
      } catch (e) { /* ignore */ }
    }
    function noise(d, vol, ftype, f1, f2, at, q) {
      const a = ac(); if (!a) return;
      try {
        const t = a.currentTime + (at || 0), s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
        s.buffer = noiseBuf; fl.type = ftype; fl.Q.value = q || 0.8;
        fl.frequency.setValueAtTime(f1, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        s.connect(fl); fl.connect(g); g.connect(a.destination); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
      } catch (e) { /* ignore */ }
    }
    const sfx = {
      fire() { noise(0.12, 0.18, 'lowpass', 900, 200); tone(140, 0.12, 'sine', 0.12, 50); noise(0.25, 0.05, 'bandpass', 2500, 600, 0.04, 2); },
      splash() { noise(0.45, 0.16, 'lowpass', 2600, 400, 0, 0.6); noise(0.3, 0.06, 'highpass', 3000, 0, 0.02); [0, 0.08, 0.15].forEach((d, k) => tone(600 + k * 180 + Math.random() * 80, 0.06, 'sine', 0.025, 1200, 0.1 + d)); },
      hit() { noise(0.6, 0.3, 'lowpass', 700, 90); tone(90, 0.45, 'sine', 0.2, 35); noise(0.2, 0.08, 'highpass', 1800, 0, 0.02); },
      sunk() { this.hit(); [440, 370, 294, 220].forEach((f, k) => tone(f, 0.18, 'triangle', 0.05, 0, 0.25 + k * 0.13)); noise(1.1, 0.1, 'lowpass', 400, 60, 0.3); },
      place() { tone(520, 0.05, 'triangle', 0.05, 380); },
      bad() { tone(170, 0.08, 'square', 0.03); },
      rotate() { tone(700, 0.04, 'sine', 0.04, 900); },
      win() { [523, 659, 784, 1046, 1318].forEach((f, k) => tone(f, 0.18, 'triangle', 0.06, 0, k * 0.11)); },
      lose() { tone(330, 0.5, 'sawtooth', 0.04, 110); noise(0.9, 0.08, 'lowpass', 300, 60); },
    };

    const root = document.createElement('div'); root.className = 'ag-seabattle';
    root.innerHTML = `
<div class="hd"><div class="ttl"><h2>Sea <span>Battle</span></h2><div class="how">Hide your five ships, then take turns firing at the Mule's hidden grid. A hit shows fire, a miss a splash; a ship sinks when every square of it is hit. Sink the whole fleet first to win.</div></div>
<div class="tally"><div class="tl w"><b>WON</b><i data-r="tw">0</i></div><div class="tl l"><b>LOST</b><i data-r="tl">0</i></div><div class="tl b"><b>FEWEST SHOTS</b><i data-r="best">-</i></div></div></div>
<div class="bar">
<button class="btn pri small" data-r="new">New game</button>
<span class="lbl">Mule</span><div class="seg" data-r="level"><button data-v="easy">Easy</button><button data-v="medium">Medium</button><button data-v="hard">Hard</button></div>
<span class="lbl">On a hit</span><div class="seg" data-r="bonus"><button data-v="0">Turn passes</button><button data-v="1">Fire again</button></div>
<span class="sp"></span><button class="btn sec small" data-r="snd" title="Sound"></button></div>
<div class="status" data-r="status"><div class="msg" data-r="msg"></div></div>
<div class="main">
<div class="pane mine" data-r="mineP"><h3><em>Your fleet</em><span data-r="mineSub"></span></h3>
<div class="gw"><div></div><div class="gl" data-r="lc1"></div><div class="gl v" data-r="lr1"></div><div class="grid mine" data-r="g0"><div class="cells"></div><div class="ships"></div></div></div>
<div class="fleet" data-r="f0"></div></div>
<div class="pane foe" data-r="foeP"><h3><em data-r="foeTitle">Mule's waters</em><span data-r="foeSub"></span></h3>
<div data-r="foeBox"><div class="gw"><div></div><div class="gl" data-r="lc2"></div><div class="gl v" data-r="lr2"></div><div class="grid foe" data-r="g1"><div class="cells"></div><div class="ships"></div></div></div>
<div class="fleet" data-r="f1"></div></div>
<div class="dock" data-r="dock"><h4>Deploy your fleet</h4><p>Drag ships onto your grid. Click a placed ship (or press <b>R</b> while dragging) to rotate it; drag it again to move it.</p><div data-r="dockList"></div>
<div class="btns"><button class="btn sec small" data-r="rand">🎲 Random</button><button class="btn sec small" data-r="clear">Clear</button><span class="sp"></span><button class="btn pri small" data-r="start">Start battle ▸</button></div></div>
</div></div>
<div class="stats"><div class="st"><b>YOUR SHOTS</b><i data-r="sShots">0</i></div><div class="st"><b>YOUR HITS</b><i data-r="sHits">0</i></div><div class="st"><b>ACCURACY</b><i data-r="sAcc">-</i></div><div class="st"><b>LIFETIME ACCURACY</b><i data-r="sLife">-</i></div></div>
<div class="keys">Mouse, or keyboard: <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> move the cursor, <kbd>Space</kbd> place a ship / fire, <kbd>R</kbd> or <kbd>Z</kbd> rotate, <kbd>C</kbd> random fleet, <kbd>Enter</kbd> start the battle (or a new game when it's over).</div>
<details><summary>Tips &amp; strategy</summary><ul>
<li><b>Hunt on a checkerboard.</b> Every ship is at least two squares long, so firing only at squares of one colour still finds them all with half the shots.</li>
<li><b>After a hit, probe the four neighbours</b>; once you have two hits in a line, keep going along that line in both directions.</li>
<li><b>Think about where the big ships can still fit.</b> Long empty runs are where the Flagship and Cruiser hide; gaps of one or two squares can only hold small boats.</li>
<li><b>Spread your fleet</b> and avoid predictable patterns. Ships touching each other can confuse an attacker who assumes one ship per cluster of hits.</li>
<li>The <b>Hard</b> Mule counts every possible position of your remaining ships and fires where they are most likely to be. Expect it to win in around 45 shots.</li></ul></details>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const grids = [$('g0'), $('g1')], cellEls = [[], []], shipLayers = [grids[0].querySelector('.ships'), grids[1].querySelector('.ships')];
    for (let g = 0; g < 2; g++) {
      const ce = grids[g].querySelector('.cells');
      for (let i = 0; i < N * N; i++) { const c = document.createElement('div'); c.className = 'cell'; c.dataset.i = i; ce.appendChild(c); cellEls[g].push(c); }
      $('lc' + (g + 1)).innerHTML = COLS.split('').map(x => `<span>${x}</span>`).join('');
      $('lr' + (g + 1)).innerHTML = Array.from({ length: N }, (_, k) => `<span>${k + 1}</span>`).join('');
    }

    // state
    let phase, fleets, turn, gameId = 0, busy, cursor, kbdUsed = false, last = [-1, -1], msg, sub, dockSel, dockVert, drag = null, shotCount, sinking = -1;
    const shipHTML = (len, vert, cls) => `<div class="ship${vert ? ' v' : ''} ${cls || ''}" style="--len:${len}"><div class="hull">${'<i></i>'.repeat(Math.max(1, len - 1))}</div></div>`;
    function makeFleet(layout) {
      const f = { ships: [], occ: new Int8Array(N * N), shots: new Int8Array(N * N) };
      FLEET.forEach((s, k) => {
        const sh = { name: s.name, len: s.len, placed: false, r: 0, c: 0, vert: false, cells: [], hits: 0, sunk: false };
        f.ships.push(sh);
        if (layout && layout[k]) setShip(f, k, layout[k].r, layout[k].c, layout[k].vert);
      });
      return f;
    }
    function setShip(f, k, r, c, vert) {
      const s = f.ships[k], cells = cellsOf(r, c, s.len, vert);
      if (!fits(f.occ, cells, k + 1)) return false;
      s.cells.forEach(i => { if (f.occ[i] === k + 1) f.occ[i] = 0; });
      Object.assign(s, { r, c, vert, cells, placed: true });
      cells.forEach(i => { f.occ[i] = k + 1; });
      return true;
    }
    function unsetShip(f, k) { const s = f.ships[k]; s.cells.forEach(i => { if (f.occ[i] === k + 1) f.occ[i] = 0; }); s.cells = []; s.placed = false; }
    const allPlaced = () => fleets[0].ships.every(s => s.placed);
    const afloat = f => f.ships.filter(s => !s.sunk);

    function newGame() {
      gameId++; clearTimers();
      phase = 'place'; turn = 0; busy = false; drag = null; dockVert = false; last = [-1, -1]; shotCount = [0, 0]; sinking = -1;
      fleets = [makeFleet(null), makeFleet(randomFleet())];
      dockSel = 0; cursor = 44;
      msg = 'Deploy your fleet'; sub = 'Drag each ship onto your grid, or press Random. Then start the battle.';
      removeDrag();
      render();
    }
    function startBattle() {
      if (phase !== 'place') return;
      if (!allPlaced()) { api.toast('Place all five ships first (or press Random).'); sfx.bad(); return; }
      phase = 'battle'; turn = 0; cursor = 44; dockSel = -1;
      msg = 'Your turn: fire at the Mule\'s waters'; sub = 'Click a square on the right-hand grid.';
      tone(392, 0.12, 'triangle', 0.05); tone(523, 0.18, 'triangle', 0.05, 0, 0.12);
      render();
    }

    /* ---- rendering ---- */
    function placeShipEl(layer, s, cls) {
      const d = document.createElement('div');
      d.innerHTML = shipHTML(s.len, s.vert, cls);
      const e = d.firstChild;
      const x = `calc(var(--cs) * ${s.c})`, y = `calc(var(--cs) * ${s.r})`;
      e.style.transform = `translate(${x},${y})`; e.style.setProperty('--x', x); e.style.setProperty('--y', y);
      layer.appendChild(e);
      return e;
    }
    function render() {
      const placing = phase === 'place';
      root.querySelector('.mine').classList.toggle('placing', placing);
      $('foeBox').hidden = placing; $('dock').hidden = !placing;
      // my grid
      const f0 = fleets[0], f1 = fleets[1];
      shipLayers[0].innerHTML = '';
      f0.ships.forEach((s, k) => {
        if (!s.placed || (drag && drag.k === k && drag.from === 'grid')) return;
        const e = placeShipEl(shipLayers[0], s, (placing ? 'mv' : '') + (s.sunk ? ' wreck' : ''));
        e.dataset.k = k;
      });
      for (let i = 0; i < N * N; i++) {
        const c = cellEls[0][i], sh = f0.shots[i], occ = f0.occ[i];
        c.className = 'cell' + (sh === 1 ? ' miss' : sh === 2 ? ' hit' + (occ && f0.ships[occ - 1].sunk ? ' sunk' : '') : '') + (i === last[0] ? ' last' : '') +
          (placing && kbdUsed && i === cursor ? ' cur' : '');
      }
      // keyboard placement preview
      if (placing && kbdUsed && dockSel >= 0 && !drag) {
        const s = f0.ships[dockSel], cells = cellsOf((cursor / N) | 0, cursor % N, s.len, dockVert);
        const ok = fits(f0.occ, cells, dockSel + 1);
        const e = placeShipEl(shipLayers[0], { len: s.len, vert: dockVert, r: (cursor / N) | 0, c: cursor % N }, 'ghost');
        if (!ok) e.querySelector('.hull').style.background = 'linear-gradient(180deg,#ff8a80,#d6463e)';
      }
      // foe grid
      shipLayers[1].innerHTML = '';
      f1.ships.forEach((s, k) => {
        if (s.sunk) { const e = placeShipEl(shipLayers[1], s, 'wreck' + (sinking === k ? ' sinking' : '')); e.dataset.k = k; }
        else if (phase === 'over') placeShipEl(shipLayers[1], s, 'reveal');
      });
      const canFire = phase === 'battle' && turn === 0 && !busy;
      for (let i = 0; i < N * N; i++) {
        const c = cellEls[1][i], sh = f1.shots[i], occ = f1.occ[i];
        c.className = 'cell' + (sh === 1 ? ' miss' : sh === 2 ? ' hit' + (occ && f1.ships[occ - 1].sunk ? ' sunk' : '') : '') +
          (!sh && canFire ? ' can' : '') + (i === last[1] ? ' last' : '') + (phase === 'battle' && kbdUsed && i === cursor && turn === 0 ? ' cur' : '');
      }
      // fleets status
      for (let g = 0; g < 2; g++) {
        $('f' + g).innerHTML = fleets[g].ships.map(s => {
          const known = g === 0 || s.sunk;
          const hitCells = s.cells.filter(i => fleets[g].shots[i] === 2).length;
          return `<div class="fl${s.sunk ? ' dead' : ''}"><i>${Array.from({ length: s.len }, (_, j) => `<b class="${(g === 0 && j < hitCells) || s.sunk ? 'h' : ''}"></b>`).join('')}</i>${s.name}${known ? '' : ''}</div>`;
        }).join('');
      }
      $('mineSub').textContent = phase === 'place' ? '' : afloat(f0).length + ' afloat';
      $('foeSub').textContent = phase === 'place' ? '' : afloat(f1).length + ' afloat';
      root.querySelector('.pane.foe').classList.toggle('act', phase === 'battle' && turn === 0);
      root.querySelector('.pane.mine').classList.toggle('act', phase === 'battle' && turn === 1);
      // dock
      if (placing) {
        $('dockList').innerHTML = f0.ships.map((s, k) => `<div class="dk${s.placed ? ' done' : ''}${k === dockSel && !s.placed ? ' sel' : ''}" data-k="${k}">${shipHTML(s.len, false)}<span>${s.name} (${s.len})</span></div>`).join('');
        $('start').disabled = !allPlaced();
      }
      // game over overlay
      const old = root.querySelector('.gover'); if (old) old.remove();
      if (phase === 'over') {
        const d = document.createElement('div'); d.className = 'gover';
        d.innerHTML = `<b>${msg}</b><span>${sub}</span><button class="btn pri small" data-r="again">Play again</button>`;
        grids[1].appendChild(d);
      }
      hud();
    }
    function hud() {
      const t = stats[opts.level];
      $('tw').textContent = t.w; $('tl').textContent = t.l;
      $('best').textContent = stats.best || '-';
      root.querySelectorAll('[data-r="level"] button').forEach(b => b.classList.toggle('on', b.dataset.v === opts.level));
      root.querySelectorAll('[data-r="bonus"] button').forEach(b => b.classList.toggle('on', (b.dataset.v === '1') === !!opts.bonus));
      $('snd').textContent = soundOn ? '🔊' : '🔇';
      const st = $('status');
      st.className = 'status ' + (phase === 'over' ? 'end' : phase === 'battle' ? (turn === 0 ? 'you' : 'cpu') : '');
      $('msg').innerHTML = msg + (sub ? `<small>${sub}</small>` : '');
      const shots = shotCount[0], hits = fleets[1].shots.reduce((a, v) => a + (v === 2 ? 1 : 0), 0);
      $('sShots').textContent = shots; $('sHits').textContent = hits;
      $('sAcc').textContent = shots ? Math.round(hits / shots * 100) + '%' : '-';
      $('sLife').textContent = stats.shots ? Math.round(stats.hits / stats.shots * 100) + '%' : '-';
    }

    /* ---- firing ---- */
    function fx(g, i, hit) {
      const r = (i / N) | 0, c = i % N, e = document.createElement('div');
      e.className = 'fx';
      e.style.left = `calc(var(--cs) * ${c})`; e.style.top = `calc(var(--cs) * ${r})`;
      let h = '<div class="shell"></div>';
      if (hit) {
        h += '<div class="boom" style="animation-delay:.24s"></div>';
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.random() * 0.4, d = 120 + Math.random() * 80; h += `<div class="spark" style="animation-delay:.25s;--dx:${Math.cos(a) * d}%;--dy:${Math.sin(a) * d}%"></div>`; }
      } else {
        h += '<div class="ring" style="animation-delay:.25s"></div><div class="ring" style="animation-delay:.38s"></div>';
        for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, d = 70 + Math.random() * 90; h += `<div class="drop" style="animation-delay:.25s;--dx:${Math.cos(a) * d}%;--dy:${Math.sin(a) * d}%"></div>`; }
      }
      e.innerHTML = h;
      grids[g].appendChild(e);
      const gid = gameId;
      later(() => { e.remove(); }, 1100);
      if (hit) later(() => { if (gid !== gameId) return; grids[g].classList.remove('shake'); void grids[g].offsetWidth; grids[g].classList.add('shake'); }, 250);
      return gid;
    }
    // side 'who' (0 you, 1 mule) fires at the other fleet
    function fire(who, i) {
      const tgt = fleets[1 - who];
      if (tgt.shots[i]) return false;
      const occ = tgt.occ[i], hit = occ > 0;
      tgt.shots[i] = hit ? 2 : 1;
      shotCount[who]++;
      last[1 - who] = i;
      busy = true;
      sfx.fire();
      // keep the cell looking untouched until the shell lands
      const g = 1 - who, cell = cellEls[g][i];
      render();
      cell.classList.remove('miss', 'hit', 'sunk');
      const gid = fx(g, i, hit);
      let sunkShip = null;
      if (hit) { const s = tgt.ships[occ - 1]; s.hits++; if (s.hits >= s.len) { s.sunk = true; sunkShip = s; } }
      later(() => {
        if (gid !== gameId) return;
        if (sunkShip) { sfx.sunk(); sinking = who === 0 ? occ - 1 : -1; }
        else if (hit) sfx.hit(); else sfx.splash();
        const nm = cellName(i);
        if (who === 0) {
          stats.shots++; if (hit) stats.hits++;
          msg = sunkShip ? `You sank the Mule's ${sunkShip.name}!` : hit ? `${nm}: Hit!` : `${nm}: Splash. Miss.`;
          if (sunkShip) api.toast(`You sank the Mule's ${sunkShip.name}!`);
        } else {
          msg = sunkShip ? `The Mule sank your ${sunkShip.name}!` : hit ? `The Mule hit you at ${nm}.` : `The Mule fired at ${nm}: miss.`;
          if (sunkShip) api.toast(`The Mule sank your ${sunkShip.name}.`);
        }
        sub = '';
        render();
      }, 260);
      later(() => {
        if (gid !== gameId) return;
        sinking = -1;
        if (!afloat(tgt).length) { finish(who); return; }
        const again = opts.bonus && hit;
        turn = again ? who : 1 - who;
        busy = false;
        if (turn === 0) { sub = again ? 'Hit! Fire again.' : 'Your turn: pick a square on the Mule\'s waters.'; render(); }
        else { sub = again ? 'The Mule fires again…' : 'The Mule is taking aim…'; render(); muleTurn(); }
      }, sunkShip ? 1200 : 850);
      return true;
    }
    function aiView() {
      const f = fleets[0], v = new Int8Array(N * N);
      for (let i = 0; i < N * N; i++) {
        if (f.shots[i] === 1) v[i] = 1;
        else if (f.shots[i] === 2) v[i] = f.ships[f.occ[i] - 1].sunk ? 3 : 2;
      }
      return v;
    }
    function muleTurn() {
      busy = true; render();
      const gid = gameId;
      later(() => {
        if (gid !== gameId || phase !== 'battle') return;
        const v = aiView(), rem = afloat(fleets[0]).map(s => s.len);
        const i = opts.level === 'easy' ? aiEasy(v) : opts.level === 'medium' ? aiMedium(v, rem) : aiHard(v, rem);
        busy = false;
        fire(1, i);
      }, 520);
    }
    function finish(who) {
      phase = 'over'; busy = false;
      const won = who === 0;
      if (won) {
        stats[opts.level].w++;
        const n = shotCount[0];
        msg = 'Victory! Fleet destroyed.';
        sub = `You sank all five ships in ${n} shots` + ((!stats.best || n < stats.best) ? ' (new record!)' : '') + '.';
        if (!stats.best || n < stats.best) { stats.best = n; api.save('best', n + ' shots'); }
        sfx.win();
      } else {
        stats[opts.level].l++;
        msg = 'Defeat. Your fleet is sunk.';
        const left = fleets[1].ships.filter(s => !s.sunk).length;
        sub = `The Mule needed ${shotCount[1]} shots. ${left} of its ship${left === 1 ? '' : 's'} survived (shown dashed).`;
        sfx.lose();
      }
      api.save('stats', stats);
      render();
    }
    function playerFire(i) {
      if (phase !== 'battle' || turn !== 0 || busy) return;
      if (fleets[1].shots[i]) { sfx.bad(); return; }
      fire(0, i);
    }

    /* ---- placement: drag & drop, click to rotate, keyboard ---- */
    function cellFromPoint(g, x, y) {
      const r = grids[g].getBoundingClientRect(), cs = r.width / N;
      return { c: Math.floor((x - r.left) / cs), r: Math.floor((y - r.top) / cs), inside: x >= r.left && x < r.right && y >= r.top && y < r.bottom, cs, rect: r };
    }
    function removeDrag() {
      if (drag && drag.el) drag.el.remove();
      if (drag && drag.snap) drag.snap.remove();
      drag = null;
    }
    function beginDrag(k, from, e, grabOff) {
      const s = fleets[0].ships[k];
      drag = { k, from, vert: from === 'grid' ? s.vert : dockVert, off: grabOff, x0: e.clientX, y0: e.clientY, moved: false, el: null, snap: null, target: null };
    }
    function dragVisual(e) {
      const s = fleets[0].ships[drag.k], cs = grids[0].getBoundingClientRect().width / N;
      if (!drag.el) {
        const d = document.createElement('div'); d.innerHTML = shipHTML(s.len, drag.vert, 'drag'); drag.el = d.firstChild;
        root.appendChild(drag.el);
        drag.snap = document.createElement('div'); drag.snap.className = 'snap'; grids[0].appendChild(drag.snap);
        if (drag.from === 'grid') render();
      }
      drag.el.className = 'ship drag' + (drag.vert ? ' v' : '');
      const rr = root.getBoundingClientRect();
      const ox = drag.vert ? 0.5 : drag.off + 0.5, oy = drag.vert ? drag.off + 0.5 : 0.5;
      drag.el.style.transform = `translate(${e.clientX - rr.left - ox * cs}px,${e.clientY - rr.top - oy * cs}px)`;
      const p = cellFromPoint(0, e.clientX, e.clientY);
      const r0 = drag.vert ? p.r - drag.off : p.r, c0 = drag.vert ? p.c : p.c - drag.off;
      const cells = p.inside ? cellsOf(r0, c0, s.len, drag.vert) : null;
      const ok = cells && fits(fleets[0].occ, cells, drag.k + 1);
      drag.target = ok ? { r: r0, c: c0 } : null;
      drag.el.classList.toggle('ok', !!ok); drag.el.classList.toggle('bad', p.inside && !ok);
      if (p.inside) {
        const rc = Math.max(0, r0), cc = Math.max(0, c0);
        const w = drag.vert ? 1 : Math.min(s.len, N - cc), h = drag.vert ? Math.min(s.len, N - rc) : 1;
        Object.assign(drag.snap.style, { display: 'block', left: cc * cs + 'px', top: rc * cs + 'px', width: w * cs + 'px', height: h * cs + 'px' });
        drag.snap.className = 'snap ' + (ok ? 'ok' : 'bad');
      } else drag.snap.style.display = 'none';
      drag.lastE = { clientX: e.clientX, clientY: e.clientY };
    }
    function onDown(e) {
      if (e.button !== 0 && e.button !== 2) return;
      if (phase === 'place') {
        const se = e.target.closest('.mine .ship.mv'), dk = e.target.closest('.dk');
        if (e.button === 2) {
          if (se) { e.preventDefault(); rotatePlaced(+se.dataset.k); }
          return;
        }
        if (se) {
          const k = +se.dataset.k, s = fleets[0].ships[k], p = cellFromPoint(0, e.clientX, e.clientY);
          const off = s.vert ? p.r - s.r : p.c - s.c;
          beginDrag(k, 'grid', e, Math.max(0, Math.min(s.len - 1, off)));
          e.preventDefault(); return;
        }
        if (dk && !dk.classList.contains('done')) {
          const k = +dk.dataset.k;
          dockSel = k;
          const hr = dk.querySelector('.ship').getBoundingClientRect(), cs = hr.height;
          beginDrag(k, 'dock', e, Math.max(0, Math.min(fleets[0].ships[k].len - 1, Math.floor((e.clientX - hr.left) / cs))));
          drag.vert = false;
          e.preventDefault(); return;
        }
        // click on an empty own-grid cell with a selected dock ship places it there
        const ce = e.target.closest('.mine .cell');
        if (ce && dockSel >= 0 && !fleets[0].ships[dockSel].placed) {
          const i = +ce.dataset.i;
          if (setShip(fleets[0], dockSel, (i / N) | 0, i % N, dockVert)) { sfx.place(); nextDock(); render(); } else sfx.bad();
        }
        return;
      }
      if (phase === 'battle' && e.button === 0) {
        const ce = e.target.closest('.foe .cell');
        if (ce) { kbdUsed = false; playerFire(+ce.dataset.i); }
      }
    }
    function onMove(e) {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.moved = true;
      dragVisual(e);
    }
    function onUp(e) {
      if (!drag) return;
      const d = drag;
      if (!d.moved) {
        removeDrag();
        if (d.from === 'grid') rotatePlaced(d.k);
        else { dockSel = d.k; render(); }
        return;
      }
      if (d.target) {
        setShip(fleets[0], d.k, d.target.r, d.target.c, d.vert);
        sfx.place();
        if (d.from === 'dock') nextDock();
      } else if (d.from === 'grid') {
        // dropped outside the grid: send back to the dock
        const p = cellFromPoint(0, e.clientX, e.clientY);
        if (!p.inside) { unsetShip(fleets[0], d.k); dockSel = d.k; } else sfx.bad();
      }
      removeDrag();
      render();
    }
    function nextDock() {
      const f = fleets[0];
      if (dockSel >= 0 && !f.ships[dockSel].placed) return;
      dockSel = f.ships.findIndex(s => !s.placed);
    }
    function rotatePlaced(k) {
      const s = fleets[0].ships[k];
      // rotate around the first cell; if that doesn't fit, try shifting back along the new axis
      for (let sh = 0; sh < s.len; sh++) {
        const r = !s.vert ? s.r - sh : s.r, c = s.vert ? s.c - sh : s.c;
        if (r < 0 || c < 0) break;
        if (setShip(fleets[0], k, r, c, !s.vert)) { sfx.rotate(); render(); return; }
      }
      sfx.bad(); api.toast('No room to rotate that ship there.');
    }
    function onContext(e) { if (phase === 'place' && e.target.closest('.ag-seabattle .mine')) e.preventDefault(); }
    function randomize() {
      if (phase !== 'place') return;
      const lay = randomFleet();
      fleets[0] = makeFleet(lay);
      dockSel = -1; sfx.place(); render();
    }
    function clearFleet() { if (phase !== 'place') return; fleets[0] = makeFleet(null); dockSel = 0; render(); }

    function onClick(e) {
      const b = e.target.closest('button'); if (!b) return;
      b.blur();
      const r = b.dataset.r, par = b.parentNode.dataset.r;
      if (r === 'new' || r === 'again') newGame();
      else if (r === 'rand') randomize();
      else if (r === 'clear') clearFleet();
      else if (r === 'start') startBattle();
      else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); hud(); tone(600, 0.05); }
      else if (par === 'level') { if (opts.level !== b.dataset.v) { opts.level = b.dataset.v; api.save('opts', opts); if (phase !== 'place') newGame(); else render(); } }
      else if (par === 'bonus') { opts.bonus = b.dataset.v === '1'; api.save('opts', opts); render(); }
    }
    function onKey(e) {
      if (el.offsetParent === null || document.hidden) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (drag && (k === 'r' || k === 'R' || k === 'z' || k === 'Z')) {
        e.preventDefault(); drag.vert = !drag.vert; sfx.rotate(); if (drag.moved && drag.lastE) dragVisual(drag.lastE); return;
      }
      const mv = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[k];
      if (mv) {
        if (phase === 'over') return;
        e.preventDefault(); kbdUsed = true;
        const r = Math.min(N - 1, Math.max(0, ((cursor / N) | 0) + mv[0])), c = Math.min(N - 1, Math.max(0, (cursor % N) + mv[1]));
        cursor = r * N + c;
        if (phase === 'place' && dockSel < 0) nextDock();
        render(); return;
      }
      if (k === 'Enter') {
        e.preventDefault();
        if (phase === 'over') newGame();
        else if (phase === 'place') { if (allPlaced()) startBattle(); else { randomize(); } }
        return;
      }
      if (k === ' ') {
        e.preventDefault();
        if (phase === 'over') { newGame(); return; }
        if (!kbdUsed) { kbdUsed = true; if (phase === 'place') nextDock(); render(); return; }
        if (phase === 'place') {
          if (dockSel < 0) { nextDock(); if (dockSel < 0) { startBattle(); return; } }
          if (setShip(fleets[0], dockSel, (cursor / N) | 0, cursor % N, dockVert)) { sfx.place(); dockSel = -1; nextDock(); } else sfx.bad();
          render();
        } else playerFire(cursor);
        return;
      }
      if (phase === 'place' && (k === 'r' || k === 'R' || k === 'z' || k === 'Z')) { e.preventDefault(); dockVert = !dockVert; sfx.rotate(); render(); return; }
      if (phase === 'place' && (k === 'c' || k === 'C')) { e.preventDefault(); randomize(); }
    }
    function fit() {
      const w = root.clientWidth || 900, top = el.getBoundingClientRect().top;
      const hAvail = window.innerHeight - Math.max(0, top) - 290;
      const byW = (w - 30) / 22, byH = hAvail / 10.8;
      root.style.setProperty('--cs', Math.floor(Math.max(24, Math.min(42, byW, Math.max(26, byH)))) + 'px');
    }
    function onResize() { if (el.offsetParent === null || document.hidden) return; fit(); }
    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('contextmenu', onContext);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    fit();
    newGame();

    return {
      destroy() {
        gameId++;
        root.removeEventListener('click', onClick);
        root.removeEventListener('pointerdown', onDown);
        root.removeEventListener('contextmenu', onContext);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        clearTimers();
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        el.innerHTML = '';
      },
      _test: {
        get state() { return { phase, turn, busy, shots: shotCount.slice(), placed: fleets[0].ships.map(s => s.placed), foeOcc: Array.from(fleets[1].occ), myShots: Array.from(fleets[1].shots), afloat: [afloat(fleets[0]).length, afloat(fleets[1]).length] }; },
        randomize, startBattle, newGame, fire: i => playerFire(i), opts,
      },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { inst.destroy(); inst = null; this._t = null; } },
    ai: { aiEasy, aiMedium, aiHard, randomFleet, cellsOf },
  };
})();
