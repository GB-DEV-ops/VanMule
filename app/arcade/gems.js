/* VanMule Arcade: Gem Swap. Match-3 on an 8x8 board: specials (line blaster, bomb, color bomb),
   cascades with falling animation, hints, reshuffles, levels with targets and an endless Zen mode. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'gems';
  const N = 8;
  // color + distinct shape per gem type (color-blind friendly)
  const GEMS = [
    { name: 'Ruby', c1: '#ff8a8f', c2: '#e5243b', c3: '#7a0f1c', shape: 'cushion' },
    { name: 'Amber', c1: '#ffc27d', c2: '#ff7a1a', c3: '#8a3a05', shape: 'hex' },
    { name: 'Citrine', c1: '#fff1a0', c2: '#ffcc1f', c3: '#8a6400', shape: 'star' },
    { name: 'Emerald', c1: '#9ff5bf', c2: '#22b85a', c3: '#0a5427', shape: 'emerald' },
    { name: 'Sapphire', c1: '#9fd0ff', c2: '#2f7fff', c3: '#0d2f80', shape: 'tri' },
    { name: 'Amethyst', c1: '#e2b8ff', c2: '#9b4dff', c3: '#45137d', shape: 'rhombus' },
    { name: 'Pearl', c1: '#ffffff', c2: '#d9d4cf', c3: '#7d746c', shape: 'circle' },
  ];
  const PCOL = ['#ff5a66', '#ff8a3d', '#ffd23f', '#43d17a', '#4aa3ff', '#b36bff', '#f2efe9'];

  function levelInfo(n) {
    return {
      target: Math.round((1500 + (n - 1) * 260 + Math.pow(n - 1, 1.4) * 15) / 50) * 50,
      moves: Math.max(18, 24 - Math.floor((n - 1) / 3)),
      colors: n >= 15 ? 7 : 6,
    };
  }

  const CSS = `
.ag-gems{font-family:var(--body);color:var(--fg);user-select:none;-webkit-user-select:none;display:flex;gap:20px;align-items:flex-start;justify-content:center}
.ag-gems.narrow{flex-direction:column;align-items:center;gap:12px}
.ag-gems .stage{position:relative;flex:0 0 auto;line-height:0}
.ag-gems canvas{display:block;border-radius:16px;touch-action:none;cursor:pointer;box-shadow:0 0 0 1px var(--line),0 18px 44px rgba(0,0,0,.5)}
.ag-gems .side{flex:1 1 240px;min-width:230px;max-width:300px;display:flex;flex-direction:column;gap:12px}
.ag-gems.narrow .side{max-width:none;width:100%;order:-1}
.ag-gems.narrow .keys,.ag-gems.narrow details{display:none}
.ag-gems h2{font-family:var(--display);font-size:26px;margin:0;line-height:1.1}
.ag-gems h2 em{font-style:normal;color:var(--ember)}
.ag-gems .how{color:var(--muted);font-size:13px;margin:3px 0 0}
.ag-gems .seg{display:flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:3px;gap:3px}
.ag-gems .seg button{flex:1;height:30px;border-radius:7px;font-size:13px;font-weight:600;color:var(--muted)}
.ag-gems .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-gems .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.ag-gems .lv{display:flex;align-items:center;gap:8px}
.ag-gems .lv b{font-family:var(--display);font-size:18px;flex:1}
.ag-gems .lv button{width:30px;height:30px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);font-weight:700}
.ag-gems .lv button:disabled{opacity:.3;cursor:default}
.ag-gems .stats{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ag-gems .stat{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.ag-gems .stat span{display:block;font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em}
.ag-gems .stat b{display:block;font-family:var(--mono);font-size:20px;font-weight:700}
.ag-gems .stat.mv b{color:var(--cool)}
.ag-gems .stat.mv.low b{color:var(--bad)}
.ag-gems .prog{position:relative;margin-top:14px;height:12px;border-radius:7px;background:var(--panel2);border:1px solid var(--line);overflow:visible}
.ag-gems .prog i{position:absolute;left:0;top:0;bottom:0;border-radius:6px;background:linear-gradient(90deg,#ff8a3d,#ffc861);transition:width .35s ease-out;max-width:100%}
.ag-gems .prog s{position:absolute;top:-5px;width:2px;height:20px;background:var(--line);text-decoration:none}
.ag-gems .prog s::after{content:"★";position:absolute;top:-15px;left:-5px;font-size:11px;color:var(--dim)}
.ag-gems .prog s.got::after{color:var(--gold)}
.ag-gems .tgt{font-size:12px;color:var(--muted);display:flex;justify-content:space-between;margin-top:2px}
.ag-gems .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ag-gems .row .sp{flex:1}
.ag-gems .keys{font-size:12px;color:var(--dim);line-height:1.75}
.ag-gems kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-gems details{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--muted)}
.ag-gems summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-gems details ul{margin:8px 0 2px;padding-left:18px}
.ag-gems details li{margin:3px 0}
.ag-gems .ov{position:absolute;inset:0;border-radius:16px;background:rgba(14,12,11,.8);backdrop-filter:blur(3px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:5;text-align:center;padding:20px;line-height:1.4;animation:aggmfade .3s ease-out}
@keyframes aggmfade{from{opacity:0}}
.ag-gems .ov h3{font-family:var(--display);font-size:30px;margin:0;color:var(--gold)}
.ag-gems .ov p{margin:0;color:var(--muted)}
.ag-gems .ov .big{font-family:var(--mono);font-size:26px;color:var(--fg);font-weight:700}
.ag-gems .ov .stars{font-size:40px;letter-spacing:6px;color:#4a4039}
.ag-gems .ov .stars i{font-style:normal;display:inline-block;animation:aggmstar .5s ease-out backwards}
.ag-gems .ov .stars i.on{color:var(--gold);text-shadow:0 0 18px rgba(255,200,97,.6)}
@keyframes aggmstar{0%{transform:scale(0) rotate(-40deg)}70%{transform:scale(1.3)}100%{transform:scale(1)}}
`;

  let inst = null;
  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) { const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st); }
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const visible = () => !document.hidden && el.offsetParent !== null;
    let dead = false;

    /* ---------- sound ---------- */
    let soundOn = api.load('sound'); if (soundOn === null) soundOn = !!api.sound;
    let actx = null;
    function ac() { if (!soundOn) return null; try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } return actx; }
    function tone(f, d, type, vol, at, f2) {
      const A = ac(); if (!A) return;
      try {
        const t = A.currentTime + (at || 0), o = A.createOscillator(), g = A.createGain();
        o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol || 0.05, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(A.destination); o.start(t); o.stop(t + d + 0.03);
      } catch (e) { /* ignore */ }
    }
    function noise(d, vol, at, freq) {
      const A = ac(); if (!A) return;
      try {
        const len = Math.floor(A.sampleRate * d), buf = A.createBuffer(1, len, A.sampleRate), ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const s = A.createBufferSource(), f = A.createBiquadFilter(), g = A.createGain(), t = A.currentTime + (at || 0);
        f.type = 'lowpass'; f.frequency.setValueAtTime(freq || 1200, t); f.frequency.exponentialRampToValueAtTime(120, t + d);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        s.buffer = buf; s.connect(f); f.connect(g); g.connect(A.destination); s.start(t); s.stop(t + d + 0.02);
      } catch (e) { /* ignore */ }
    }
    const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
    const sfx = {
      sel: () => tone(880, 0.04, 'sine', 0.03),
      swap: () => tone(380, 0.1, 'sine', 0.035, 0, 600),
      bad: () => { tone(220, 0.09, 'square', 0.025); tone(180, 0.12, 'square', 0.025, 0.08); },
      match: (k) => { const f = SCALE[Math.min(SCALE.length - 1, k)]; tone(f, 0.16, 'triangle', 0.055); tone(f * 1.5, 0.12, 'sine', 0.025, 0.03); },
      make: () => [784, 1047, 1319].forEach((f, i) => tone(f, 0.12, 'triangle', 0.045, i * 0.05)),
      line: () => { tone(1400, 0.25, 'sawtooth', 0.025, 0, 300); noise(0.25, 0.06, 0, 3000); },
      boom: () => { noise(0.45, 0.14, 0, 900); tone(120, 0.35, 'sine', 0.08, 0, 45); },
      color: () => { for (let i = 0; i < 6; i++) tone(900 + i * 180, 0.08, 'square', 0.02, i * 0.035); noise(0.4, 0.05, 0.05, 5000); },
      land: () => tone(140 + Math.random() * 30, 0.04, 'sine', 0.018),
      shuffle: () => { for (let i = 0; i < 8; i++) tone(500 + Math.random() * 600, 0.05, 'sine', 0.02, i * 0.04); },
      win: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, k) => tone(f, 0.28, 'triangle', 0.06, k * 0.09)),
      lose: () => [392, 349, 294, 262].forEach((f, k) => tone(f, 0.3, 'sine', 0.05, k * 0.15)),
      bonus: (k) => tone(660 + k * 60, 0.08, 'triangle', 0.04),
    };

    /* ---------- persistence ---------- */
    const prog = Object.assign({ mode: 'levels', level: 1, unlocked: 1, stars: {}, zenBest: 0 }, api.load('prog') || {});
    function saveProg() { api.save('prog', prog); }

    /* ---------- DOM ---------- */
    const root = document.createElement('div');
    root.className = 'ag-gems';
    root.innerHTML = `
<div class="stage" data-r="stage"><canvas data-r="cv"></canvas></div>
<div class="side">
  <div><h2>Gem <em>Swap</em></h2><p class="how">Swap neighbouring gems to line up 3 or more of a kind. Bigger lines make special gems.</p></div>
  <div class="seg"><button data-mode="levels">Levels</button><button data-mode="zen">Zen</button></div>
  <div class="card" data-r="lvcard">
    <div class="lv"><button data-r="prev" title="Previous level">‹</button><b data-r="lvname">Level 1</b><button data-r="next" title="Next level">›</button></div>
    <div><div class="prog" data-r="prog"><i data-r="bar"></i><s data-r="s1"></s><s data-r="s2"></s><s data-r="s3"></s></div><div class="tgt"><span data-r="tgt">Target 0</span><span data-r="pct"></span></div></div>
  </div>
  <div class="stats"><div class="stat"><span>Score</span><b data-r="score">0</b></div><div class="stat mv" data-r="mvbox"><span data-r="mvlabel">Moves</span><b data-r="moves">0</b></div></div>
  <div class="row"><button class="btn pri small" data-r="restart">Restart</button><button class="btn sec small" data-r="hint">💡 Hint</button><button class="btn sec small" data-r="pause">Pause</button><span class="sp"></span><button class="btn sec small" data-r="snd"></button></div>
  <div class="keys"><kbd>Drag</kbd> or click two gems · <kbd>←↑→↓</kbd> move cursor · <kbd>Space</kbd> pick up, then an arrow to swap · <kbd>H</kbd> hint · <kbd>P</kbd> pause · <kbd>Enter</kbd> continue</div>
  <details><summary>Special gems</summary><ul>
    <li><b>4 in a row</b> → <b>Line blaster</b> (striped). Clears its whole row or column.</li>
    <li><b>L or T shape</b> → <b>Bomb</b> (glowing ring). Blasts a 3×3 area.</li>
    <li><b>5 in a row</b> → <b>Color bomb</b> (dark orb). Swap it with any gem to clear every gem of that color.</li>
    <li>Swap two specials together for big combos: line + line makes a cross, bomb + line clears three rows and columns, two color bombs clear the board.</li>
    <li>Each gem has its own shape as well as its own color.</li>
    <li>Work near the bottom: falling gems set up free cascades. Every cascade step scores more.</li></ul></details>
</div>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');

    /* ---------- state ---------- */
    let cs = 64, dpr = 1, sprites = null;
    let grid = Array.from({ length: N }, () => Array(N).fill(null)); // grid[r][c] = gem | null
    let nextId = 1;
    let S = null;              // {mode, level, info, score, moves, colors, done, won}
    let busy = false, paused = false, overlay = null;
    let sel = null, cursor = null; // {r,c}
    let hint = null, hintT = 0, hintTimer = 0;
    let tweens = [], parts = [], floats = [], beams = [], fallWaiters = [], shake = 0, clock = 0;
    let raf = 0, lastT = 0, drag = null, shownScore = 0;

    const inB = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    function mkGem(t, r, c, sp) { return { id: nextId++, t, sp: sp || null, x: c, y: r, sc: 1, al: 1, vy: 0, sq: 0, rot: 0 }; }

    /* ---------- sprites ---------- */
    function shapePath(g, shape, R) {
      g.beginPath();
      if (shape === 'cushion') { const s = R * 0.82, rr = R * 0.32; g.moveTo(-s + rr, -s); g.arcTo(s, -s, s, s, rr); g.arcTo(s, s, -s, s, rr); g.arcTo(-s, s, -s, -s, rr); g.arcTo(-s, -s, s, -s, rr); }
      else if (shape === 'hex') { for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95); } }
      else if (shape === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.5 : R * 1.0; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + R * 0.06); } }
      else if (shape === 'emerald') { const w = R * 0.66, h = R * 0.92, k = R * 0.3; g.moveTo(-w + k, -h); g.lineTo(w - k, -h); g.lineTo(w, -h + k); g.lineTo(w, h - k); g.lineTo(w - k, h); g.lineTo(-w + k, h); g.lineTo(-w, h - k); g.lineTo(-w, -h + k); }
      else if (shape === 'tri') { const rr = R * 1.08; for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + R * 0.18); } }
      else if (shape === 'rhombus') { g.moveTo(0, -R); g.lineTo(R * 0.78, 0); g.lineTo(0, R); g.lineTo(-R * 0.78, 0); }
      else g.arc(0, 0, R * 0.86, 0, Math.PI * 2);
      g.closePath();
    }
    function makeSprite(t) {
      const S2 = Math.ceil(cs * dpr), cvs = document.createElement('canvas'); cvs.width = cvs.height = S2;
      const g = cvs.getContext('2d'); g.translate(S2 / 2, S2 / 2); g.scale(dpr, dpr);
      const R = cs * 0.4, G = GEMS[t];
      g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = cs * 0.08; g.shadowOffsetY = cs * 0.04;
      shapePath(g, G.shape, R);
      const gr = g.createLinearGradient(-R, -R, R, R); gr.addColorStop(0, G.c1); gr.addColorStop(0.5, G.c2); gr.addColorStop(1, G.c3);
      g.fillStyle = gr; g.fill(); g.restore();
      g.lineWidth = Math.max(1, cs * 0.03); g.strokeStyle = G.c3; shapePath(g, G.shape, R); g.stroke();
      // facet: inner shape with a light sheen
      g.save(); g.scale(0.56, 0.56); g.translate(-R * 0.08, -R * 0.1); shapePath(g, G.shape, R);
      const gi = g.createLinearGradient(-R, -R, R, R); gi.addColorStop(0, 'rgba(255,255,255,.75)'); gi.addColorStop(0.6, 'rgba(255,255,255,.12)'); gi.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gi; g.fill(); g.restore();
      // facet lines from centre to vertices for a cut look
      g.save(); g.globalAlpha = 0.18; g.strokeStyle = '#fff'; g.lineWidth = Math.max(0.8, cs * 0.015);
      g.beginPath(); g.moveTo(-R * 0.55, -R * 0.55); g.lineTo(R * 0.55, R * 0.55); g.moveTo(R * 0.55, -R * 0.55); g.lineTo(-R * 0.55, R * 0.55); g.stroke(); g.restore();
      // specular
      const HL = { tri: [-0.2, 0.0], star: [-0.14, -0.18], rhombus: [-0.2, -0.3], hex: [-0.34, -0.4], emerald: [-0.26, -0.5] }[G.shape] || [-0.34, -0.42];
      g.save(); g.globalAlpha = 0.85; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(R * HL[0], R * HL[1], R * 0.17, R * 0.09, -0.6, 0, Math.PI * 2); g.fill(); g.restore();
      return cvs;
    }
    function makeColorBomb() {
      const S2 = Math.ceil(cs * dpr), cvs = document.createElement('canvas'); cvs.width = cvs.height = S2;
      const g = cvs.getContext('2d'); g.translate(S2 / 2, S2 / 2); g.scale(dpr, dpr);
      const R = cs * 0.38;
      g.save(); g.shadowColor = 'rgba(255,200,120,.55)'; g.shadowBlur = cs * 0.18;
      const gr = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
      gr.addColorStop(0, '#5a4a40'); gr.addColorStop(0.6, '#241c18'); gr.addColorStop(1, '#0c0907');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill(); g.restore();
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39996, rr = R * (0.25 + 0.6 * ((i * 37) % 11) / 11);
        g.fillStyle = PCOL[i % 7]; g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, cs * (0.035 + (i % 3) * 0.01), 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = 'rgba(255,220,180,.6)'; g.lineWidth = Math.max(1, cs * 0.025); g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(-R * 0.38, -R * 0.45, R * 0.18, R * 0.09, -0.6, 0, Math.PI * 2); g.fill();
      return cvs;
    }
    function buildSprites() { sprites = GEMS.map((_, t) => makeSprite(t)); sprites.bomb = makeColorBomb(); }

    /* ---------- layout ---------- */
    function fit() {
      if (el.offsetParent === null) return;
      const narrow = el.clientWidth < 780;
      root.classList.toggle('narrow', narrow);
      const top = stage.getBoundingClientRect().top;
      const availH = Math.max(320, window.innerHeight - Math.max(0, top) - 40);
      const availW = narrow ? el.clientWidth : el.clientWidth - 20 - 300;
      const size = Math.max(300, Math.min(availH, availW, 640));
      const ncs = Math.floor(size / N), nd = window.devicePixelRatio || 1;
      if (ncs === cs && nd === dpr && cv.width) return;
      cs = ncs; dpr = nd;
      cv.style.width = cs * N + 'px'; cv.style.height = cs * N + 'px';
      cv.width = Math.round(cs * N * dpr); cv.height = Math.round(cs * N * dpr);
      buildSprites(); draw();
    }

    /* ---------- board logic ---------- */
    const at = (r, c) => (inB(r, c) ? grid[r][c] : null);
    const same = (a, b) => a && b && a.t >= 0 && a.t === b.t;
    function randType() { return (Math.random() * S.colors) | 0; }
    function fillFresh() {
      for (let tries = 0; tries < 200; tries++) {
        grid = [];
        for (let r = 0; r < N; r++) {
          grid.push([]);
          for (let c = 0; c < N; c++) {
            let t, k = 0;
            do { t = randType(); k++; } while (k < 50 && ((c >= 2 && grid[r][c - 1].t === t && grid[r][c - 2].t === t) || (r >= 2 && grid[r - 1][c].t === t && grid[r - 2][c].t === t)));
            grid[r].push(mkGem(t, r, c));
          }
        }
        if (!findGroups().length && findMoves().length >= 3) return;
      }
    }
    function findRuns() {
      const runs = [];
      for (let r = 0; r < N; r++) { let c = 0; while (c < N) { let e = c + 1; while (e < N && same(grid[r][c], grid[r][e])) e++; if (e - c >= 3 && grid[r][c] && grid[r][c].t >= 0) { const cells = []; for (let k = c; k < e; k++) cells.push([r, k]); runs.push({ dir: 'h', cells }); } c = e; } }
      for (let c = 0; c < N; c++) { let r = 0; while (r < N) { let e = r + 1; while (e < N && same(grid[r][c], grid[e][c])) e++; if (e - r >= 3 && grid[r][c] && grid[r][c].t >= 0) { const cells = []; for (let k = r; k < e; k++) cells.push([k, c]); runs.push({ dir: 'v', cells }); } r = e; } }
      return runs;
    }
    function findGroups() {
      const runs = findRuns();
      if (!runs.length) return [];
      const parent = runs.map((_, i) => i);
      const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      const owner = {};
      runs.forEach((run, i) => run.cells.forEach(([r, c]) => { const k = r * N + c; if (owner[k] != null) parent[find(i)] = find(owner[k]); else owner[k] = i; }));
      const groups = {};
      runs.forEach((run, i) => { const g = find(i); (groups[g] = groups[g] || []).push(run); });
      return Object.values(groups).map(rs => {
        const keys = new Set(); rs.forEach(run => run.cells.forEach(([r, c]) => keys.add(r * N + c)));
        const maxLen = Math.max(...rs.map(x => x.cells.length));
        const hasH = rs.some(x => x.dir === 'h'), hasV = rs.some(x => x.dir === 'v');
        let make = null;
        if (maxLen >= 5) make = 'c'; else if (hasH && hasV) make = 'b'; else if (maxLen === 4) make = rs[0].dir === 'h' ? 'v' : 'h';
        // natural spot: intersection for L/T, else middle of the longest run
        let spot = null;
        if (hasH && hasV) { const hk = new Set(); rs.filter(x => x.dir === 'h').forEach(x => x.cells.forEach(([r, c]) => hk.add(r * N + c))); rs.filter(x => x.dir === 'v').forEach(x => x.cells.forEach(([r, c]) => { if (hk.has(r * N + c)) spot = r * N + c; })); }
        if (spot == null) { const lr = rs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a)); const m = lr.cells[Math.floor((lr.cells.length - 1) / 2)]; spot = m[0] * N + m[1]; }
        return { keys, make, spot, t: grid[(keys.values().next().value / N) | 0][keys.values().next().value % N].t };
      });
    }
    function wouldMatch(r, c) {
      const g = grid[r][c]; if (!g || g.t < 0) return false;
      let n = 1; for (let k = c - 1; k >= 0 && same(grid[r][k], g); k--) n++; for (let k = c + 1; k < N && same(grid[r][k], g); k++) n++; if (n >= 3) return true;
      n = 1; for (let k = r - 1; k >= 0 && same(grid[k][c], g); k--) n++; for (let k = r + 1; k < N && same(grid[k][c], g); k++) n++; return n >= 3;
    }
    function swapCells(a, b) { const t = grid[a.r][a.c]; grid[a.r][a.c] = grid[b.r][b.c]; grid[b.r][b.c] = t; }
    function findMoves() {
      const out = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr, c2 = c + dc; if (!inB(r2, c2)) continue;
        const A = grid[r][c], B = grid[r2][c2]; if (!A || !B) continue;
        if (A.sp === 'c' || B.sp === 'c' || (A.sp && B.sp)) { out.push({ a: { r, c }, b: { r: r2, c: c2 }, w: 5 }); continue; }
        if (A.t === B.t) continue;
        swapCells({ r, c }, { r: r2, c: c2 });
        const ok = wouldMatch(r, c) || wouldMatch(r2, c2);
        swapCells({ r, c }, { r: r2, c: c2 });
        if (ok) out.push({ a: { r, c }, b: { r: r2, c: c2 }, w: 1 });
      }
      return out;
    }

    /* ---------- animation primitives ---------- */
    const ease = { out: t => 1 - Math.pow(1 - t, 3), inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }, lin: t => t };
    function tween(o, props, dur, e) {
      return new Promise(res => {
        const from = {}; for (const k in props) from[k] = o[k];
        const mv = 'y' in props;
        if (mv) { o.tw = (o.tw || 0) + 1; o.vy = 0; }
        tweens.push({ o, from, to: props, t0: clock, d: dur, e: ease[e || 'out'], res: mv ? () => { o.tw--; res(); } : res });
        kick();
      });
    }
    const wait = ms => new Promise(res => { tweens.push({ o: {}, from: {}, to: {}, t0: clock, d: ms / 1000, e: ease.lin, res }); kick(); });
    function waitFall() { return new Promise(res => { fallWaiters.push(res); kick(); }); }
    function anyFalling() { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const g = grid[r][c]; if (g && !g.tw && (g.y < r - 0.001 || g.vy !== 0)) return true; } return false; }

    function burst(r, c, color, n, speed) {
      for (let i = 0; i < (n || 8); i++) {
        if (parts.length > 500) break;
        const a = Math.random() * Math.PI * 2, v = (speed || 3) * (0.4 + Math.random());
        parts.push({ x: c + 0.5, y: r + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, life: 0.45 + Math.random() * 0.4, t: 0, color, s: 0.05 + Math.random() * 0.07, star: Math.random() < 0.3 });
      }
    }
    function floatText(x, y, text, color, big) { floats.push({ x, y, text, color: color || '#fff', t: 0, life: big ? 1.4 : 0.9, big }); kick(); }

    /* ---------- loop ---------- */
    const animating = () => tweens.length || parts.length || floats.length || beams.length || shake > 0 || fallWaiters.length || anyFalling() || hintT > 0 || Math.abs(shownScore - (S ? S.score : 0)) > 0.5;
    function kick() { if (!raf && !dead) { lastT = 0; raf = requestAnimationFrame(frame); } }
    function frame(t) {
      raf = 0;
      if (dead) return;
      if (!visible()) return; // resumes on next input / visibility change
      if (!lastT) lastT = t;
      const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
      if (!paused) update(dt);
      draw();
      if (animating() && !paused) raf = requestAnimationFrame(frame);
    }
    function update(dt) {
      clock += dt;
      // tweens
      if (tweens.length) {
        const done = [];
        tweens = tweens.filter(tw => {
          const k = Math.min(1, (clock - tw.t0) / tw.d), e = tw.e(k);
          for (const p in tw.to) tw.o[p] = tw.from[p] + (tw.to[p] - tw.from[p]) * e;
          if (k >= 1) { done.push(tw.res); return false; }
          return true;
        });
        done.forEach(f => f());
      }
      // gravity
      let landed = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const g = grid[r][c]; if (!g) continue;
        if (!g.tw && (g.y < r || g.vy !== 0)) {
          g.vy += 48 * dt; g.y += g.vy * dt;
          if (g.y >= r) { if (g.vy > 4) { g.sq = Math.min(1, g.vy / 14); landed++; } g.y = r; g.vy = 0; }
        }
        if (g.sq > 0) g.sq = Math.max(0, g.sq - dt * 5);
      }
      if (landed) sfx.land();
      if (fallWaiters.length && !anyFalling()) { const w = fallWaiters; fallWaiters = []; w.forEach(f => f()); }
      // particles etc.
      for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 9 * dt; p.vx *= 0.98; }
      parts = parts.filter(p => p.t < p.life);
      for (const f of floats) { f.t += dt; f.y -= dt * (f.big ? 0.5 : 0.9); }
      floats = floats.filter(f => f.t < f.life);
      for (const b of beams) b.t += dt;
      beams = beams.filter(b => b.t < b.life);
      if (shake > 0) shake = Math.max(0, shake - dt * 2.2);
      if (hintT > 0) hintT = Math.max(0, hintT - dt);
      const target = S ? S.score : 0;
      if (shownScore !== target) { shownScore += (target - shownScore) * Math.min(1, dt * 10); if (Math.abs(target - shownScore) < 1) shownScore = target; $('score').textContent = Math.round(shownScore).toLocaleString(); }
    }

    /* ---------- drawing ---------- */
    function draw() {
      if (!sprites) return;
      const W = cs * N;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, W);
      // board
      const bg = ctx.createLinearGradient(0, 0, W, W); bg.addColorStop(0, '#231c18'); bg.addColorStop(1, '#16110e');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, W);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if ((r + c) & 1) { ctx.fillStyle = 'rgba(255,255,255,.028)'; ctx.fillRect(c * cs, r * cs, cs, cs); }
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * cs * 0.18, (Math.random() - 0.5) * shake * cs * 0.18);
      // selection / cursor / hint backgrounds
      if (sel) { ctx.fillStyle = 'rgba(255,138,61,.22)'; rr(sel.c * cs + 2, sel.r * cs + 2, cs - 4, cs - 4, cs * 0.18); ctx.fill(); }
      if (hint && !busy) {
        const pul = hintT > 0 ? 0.5 + 0.5 * Math.sin(clock * 9) : 0.6;
        for (const p of [hint.a, hint.b]) { ctx.fillStyle = 'rgba(255,200,97,' + (0.1 + 0.18 * pul) + ')'; rr(p.c * cs + 2, p.r * cs + 2, cs - 4, cs - 4, cs * 0.18); ctx.fill(); }
      }
      // gems
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, W); ctx.clip();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const g = grid[r][c]; if (g) drawGem(g, sel && sel.r === r && sel.c === c, hint && !busy && hintT > 0 && ((hint.a.r === r && hint.a.c === c) || (hint.b.r === r && hint.b.c === c))); }
      for (const g of dying) drawGem(g, false, false);
      ctx.restore();
      // beams
      for (const b of beams) {
        const k = b.t / b.life, a = 1 - k;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        if (b.kind === 'h' || b.kind === 'v') {
          const th = cs * (0.7 - 0.5 * k);
          const gr = b.kind === 'h' ? ctx.createLinearGradient(0, (b.r + 0.5) * cs - th / 2, 0, (b.r + 0.5) * cs + th / 2) : ctx.createLinearGradient((b.c + 0.5) * cs - th / 2, 0, (b.c + 0.5) * cs + th / 2, 0);
          gr.addColorStop(0, 'rgba(255,200,120,0)'); gr.addColorStop(0.5, 'rgba(255,240,210,' + a + ')'); gr.addColorStop(1, 'rgba(255,200,120,0)');
          ctx.fillStyle = gr;
          if (b.kind === 'h') ctx.fillRect(0, (b.r + 0.5) * cs - th / 2, W, th); else ctx.fillRect((b.c + 0.5) * cs - th / 2, 0, th, W);
        } else if (b.kind === 'ring') {
          ctx.strokeStyle = 'rgba(255,190,110,' + a + ')'; ctx.lineWidth = cs * 0.25 * a + 1;
          ctx.beginPath(); ctx.arc((b.c + 0.5) * cs, (b.r + 0.5) * cs, cs * (0.3 + b.rad * k), 0, Math.PI * 2); ctx.stroke();
        } else if (b.kind === 'zap') {
          ctx.strokeStyle = b.color; ctx.globalAlpha = a; ctx.lineWidth = Math.max(1.5, cs * 0.05);
          ctx.beginPath(); const x0 = (b.c + 0.5) * cs, y0 = (b.r + 0.5) * cs, x1 = (b.c2 + 0.5) * cs, y1 = (b.r2 + 0.5) * cs;
          ctx.moveTo(x0, y0); for (let i = 1; i < 6; i++) { const f = i / 6; ctx.lineTo(x0 + (x1 - x0) * f + (Math.random() - 0.5) * cs * 0.3, y0 + (y1 - y0) * f + (Math.random() - 0.5) * cs * 0.3); } ctx.lineTo(x1, y1); ctx.stroke();
        } else if (b.kind === 'flash') { ctx.fillStyle = 'rgba(255,230,190,' + a * 0.5 + ')'; ctx.fillRect(0, 0, W, W); }
        ctx.restore();
      }
      // particles
      for (const p of parts) {
        const a = 1 - p.t / p.life; ctx.globalAlpha = a; ctx.fillStyle = p.color;
        if (p.star) { ctx.save(); ctx.translate(p.x * cs, p.y * cs); ctx.rotate(p.t * 6); const s = p.s * cs * 1.4; ctx.fillRect(-s / 2, -s / 8, s, s / 4); ctx.fillRect(-s / 8, -s / 2, s / 4, s); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(p.x * cs, p.y * cs, p.s * cs * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      // cursor
      if (cursor) { ctx.strokeStyle = sel ? '#ffc861' : 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]); rr(cursor.c * cs + 3, cursor.r * cs + 3, cs - 6, cs - 6, cs * 0.18); ctx.stroke(); ctx.setLineDash([]); }
      ctx.restore();
      // floating texts
      for (const f of floats) {
        const k = f.t / f.life, a = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2, s = f.big ? 1 + Math.min(1, f.t * 6) * 0.15 : 1;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(f.x * cs, f.y * cs); ctx.scale(s, s);
        ctx.font = '800 ' + Math.round(cs * (f.big ? 0.62 : 0.38)) + 'px ' + getComputedStyle(root).getPropertyValue('--display');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = cs * 0.08; ctx.strokeStyle = 'rgba(20,12,6,.85)'; ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0); ctx.restore();
      }
    }
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function drawGem(g, isSel, isHint) {
      if (g.al <= 0.01 || g.sc <= 0.01) return;
      const cx = (g.x + 0.5) * cs, cy = (g.y + 0.5) * cs;
      let sx = g.sc, sy = g.sc;
      if (g.sq > 0) { sx *= 1 + g.sq * 0.18; sy *= 1 - g.sq * 0.18; }
      if (isSel) { const b = 1 + 0.06 * Math.sin(clock * 10); sx *= b; sy *= b; }
      if (isHint) { const b = 1 + 0.08 * Math.max(0, Math.sin(clock * 9)); sx *= b; sy *= b; }
      ctx.save(); ctx.globalAlpha = g.al; ctx.translate(cx, cy + (g.sq > 0 ? g.sq * cs * 0.06 : 0)); if (g.rot) ctx.rotate(g.rot); ctx.scale(sx, sy);
      const spr = g.sp === 'c' ? sprites.bomb : sprites[g.t];
      ctx.drawImage(spr, -cs / 2, -cs / 2, cs, cs);
      if (g.sp === 'h' || g.sp === 'v') {
        ctx.save(); if (g.sp === 'v') ctx.rotate(Math.PI / 2);
        ctx.globalAlpha = g.al * 0.9; ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = cs * 0.12;
        for (const o of [-0.17, 0, 0.17]) { ctx.fillRect(-cs * 0.3, o * cs - cs * 0.025, cs * 0.6, cs * 0.05); }
        ctx.beginPath(); ctx.moveTo(-cs * 0.44, 0); ctx.lineTo(-cs * 0.34, -cs * 0.08); ctx.lineTo(-cs * 0.34, cs * 0.08); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cs * 0.44, 0); ctx.lineTo(cs * 0.34, -cs * 0.08); ctx.lineTo(cs * 0.34, cs * 0.08); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (g.sp === 'b') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(0, 0, cs * 0.15, 0, 0, cs * 0.5); gr.addColorStop(0, 'rgba(255,240,200,.0)'); gr.addColorStop(0.7, 'rgba(255,200,120,.45)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, cs * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.strokeStyle = 'rgba(255,240,210,.95)'; ctx.lineWidth = cs * 0.05; ctx.beginPath(); ctx.arc(0, 0, cs * 0.43, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.arc(Math.cos(a) * cs * 0.43, Math.sin(a) * cs * 0.43, cs * 0.045, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    }

    /* ---------- game flow ---------- */
    let dying = [];
    function cellsOfEffect(g, r, c) {
      const out = [];
      if (g.sp === 'h') for (let k = 0; k < N; k++) out.push([r, k]);
      else if (g.sp === 'v') for (let k = 0; k < N; k++) out.push([k, c]);
      else if (g.sp === 'b') for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inB(r + dr, c + dc)) out.push([r + dr, c + dc]);
      else if (g.sp === 'c') { const t = commonType(); for (let rr2 = 0; rr2 < N; rr2++) for (let cc = 0; cc < N; cc++) if (grid[rr2][cc] && grid[rr2][cc].t === t) out.push([rr2, cc]); }
      return out;
    }
    function commonType() { const n = new Array(7).fill(0); for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const g = grid[r][c]; if (g && g.t >= 0) n[g.t]++; } let b = 0; for (let t = 1; t < 7; t++) if (n[t] > n[b]) b = t; return b; }
    function addEffectFX(g, r, c) {
      if (g.sp === 'h' || g.sp === 'v') { beams.push({ kind: g.sp, r, c, t: 0, life: 0.38 }); sfx.line(); shake = Math.max(shake, 0.35); }
      else if (g.sp === 'b') { beams.push({ kind: 'ring', r, c, rad: 1.3, t: 0, life: 0.42 }); sfx.boom(); shake = Math.max(shake, 0.8); }
      else if (g.sp === 'c') { beams.push({ kind: 'flash', t: 0, life: 0.3 }); sfx.color(); shake = Math.max(shake, 0.5); }
    }
    // Expand a set of cells to clear through chained specials. protect: keys that become new specials.
    function expand(keys, protect) {
      const set = new Set(keys), queue = [...keys], fired = new Set();
      while (queue.length) {
        const k = queue.shift(), r = (k / N) | 0, c = k % N, g = grid[r][c];
        if (!g || !g.sp || fired.has(k) || protect.has(k)) continue;
        fired.add(k); addEffectFX(g, r, c);
        if (g.sp === 'c') { for (const [r2, c2] of cellsOfEffect(g, r, c)) beams.push({ kind: 'zap', r, c, r2, c2, color: PCOL[grid[r2][c2].t] || '#fff', t: 0, life: 0.35 }); }
        for (const [r2, c2] of cellsOfEffect(g, r, c)) { const k2 = r2 * N + c2; if (!protect.has(k2) && !set.has(k2)) { set.add(k2); queue.push(k2); } }
      }
      return set;
    }
    async function clearCells(set, cascade, makes) {
      // makes: [{k, sp, t}] new specials placed after clearing
      let n = 0, sx = 0, sy = 0;
      const gone = [];
      for (const k of set) {
        const r = (k / N) | 0, c = k % N, g = grid[r][c]; if (!g) continue;
        n++; sx += c; sy += r;
        grid[r][c] = null; gone.push(g);
        burst(r, c, g.sp === 'c' ? '#ffffff' : PCOL[g.t], 7, 3.2);
      }
      dying.push(...gone);
      const pts = n * 20 * cascade + (makes || []).reduce((a, m) => a + (m.sp === 'c' ? 250 : m.sp === 'b' ? 120 : 80), 0);
      if (S) S.score += pts;
      if (n) floatText(sx / n + 0.5, sy / n + 0.5, '+' + pts, cascade > 1 ? '#ffc861' : '#fff', false);
      for (const m of makes || []) {
        const r = (m.k / N) | 0, c = m.k % N, g = grid[r][c];
        if (!g) continue;
        g.sp = m.sp; if (m.sp === 'c') g.t = -1;
        g.sc = 1.5; tween(g, { sc: 1 }, 0.3, 'back');
        burst(r, c, '#ffe7b0', 10, 2.5);
      }
      if (makes && makes.length) sfx.make();
      const ps = gone.map(g => tween(g, { sc: 0, al: 0 }, 0.22, 'inOut'));
      await Promise.all(ps);
      dying = dying.filter(g => gone.indexOf(g) < 0);
      updateHud();
    }
    function gravity() {
      for (let c = 0; c < N; c++) {
        let w = N - 1;
        for (let r = N - 1; r >= 0; r--) { const g = grid[r][c]; if (g) { grid[r][c] = null; grid[w][c] = g; g.x = c; w--; } }
        const missing = w + 1;
        for (let r = w; r >= 0; r--) { const g = mkGem(randType(), r, c); g.y = r - missing - 0.25; g.vy = 0.001; grid[r][c] = g; }
      }
    }
    async function cascadeLoop(swapped) {
      let cascade = 0;
      for (;;) {
        if (dead) return;
        const groups = findGroups();
        if (!groups.length) break;
        cascade++;
        const set = new Set(), makes = [], protect = new Set();
        for (const gr of groups) {
          for (const k of gr.keys) set.add(k);
          if (gr.make) {
            let spot = gr.spot;
            if (swapped) for (const p of swapped) { const k = p.r * N + p.c; if (gr.keys.has(k)) spot = k; }
            const g0 = grid[(spot / N) | 0][spot % N];
            if (g0 && g0.sp) { const alt = [...gr.keys].find(k => { const g = grid[(k / N) | 0][k % N]; return g && !g.sp && !protect.has(k); }); spot = alt != null ? alt : null; }
            if (spot != null && !protect.has(spot)) { protect.add(spot); makes.push({ k: spot, sp: gr.make }); }
          }
        }
        for (const k of protect) set.delete(k);
        const all = expand(set, protect);
        sfx.match(cascade - 1 + Math.min(3, groups.length - 1));
        if (cascade >= 2) floatText(N / 2, N / 2 - 1, cascade >= 5 ? 'Mule-tastic!' : cascade >= 4 ? 'Incredible!' : cascade === 3 ? 'Superb!' : 'Nice!', '#ffc861', true);
        await clearCells(all, cascade, makes);
        if (dead) return;
        gravity();
        await waitFall();
        swapped = null;
      }
    }
    async function comboSwap(a, b) {
      // a = moved gem position, b = target position (after swap both are in place)
      const A = grid[a.r][a.c], B = grid[b.r][b.c];
      const set = new Set();
      const add = (r, c) => { if (inB(r, c)) set.add(r * N + c); };
      if (A.sp === 'c' || B.sp === 'c') {
        const bombP = A.sp === 'c' ? a : b, other = A.sp === 'c' ? B : A, otherP = A.sp === 'c' ? b : a;
        if (other.sp === 'c') {
          beams.push({ kind: 'flash', t: 0, life: 0.5 }); sfx.color(); sfx.boom(); shake = 1;
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) add(r, c);
          // clear without triggering others (they're all going anyway)
          for (const k of set) { const g = grid[(k / N) | 0][k % N]; if (g && g.sp && g.t >= 0) g.sp = null; }
        } else {
          const t = other.t;
          sfx.color(); beams.push({ kind: 'flash', t: 0, life: 0.25 });
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
            const g = grid[r][c]; if (!g || g.t !== t) continue;
            beams.push({ kind: 'zap', r: bombP.r, c: bombP.c, r2: r, c2: c, color: PCOL[t], t: 0, life: 0.45 });
            if (other.sp === 'h' || other.sp === 'v') g.sp = Math.random() < 0.5 ? 'h' : 'v';
            else if (other.sp === 'b') g.sp = 'b';
            add(r, c);
          }
          add(otherP.r, otherP.c);
          grid[bombP.r][bombP.c].sp = null; grid[bombP.r][bombP.c].t = t; // bomb is consumed
          add(bombP.r, bombP.c);
          if (other.sp) { await wait(350); }
        }
      } else {
        const kinds = [A.sp, B.sp].sort().join('');
        const r = b.r, c = b.c;
        A.sp = null; B.sp = null;
        if (kinds === 'bb') {
          for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) add(r + dr, c + dc);
          beams.push({ kind: 'ring', r, c, rad: 2.6, t: 0, life: 0.55 }); sfx.boom(); shake = 1.2;
        } else if (kinds === 'bh' || kinds === 'bv') {
          for (let d = -1; d <= 1; d++) for (let k = 0; k < N; k++) { add(r + d, k); add(k, c + d); }
          for (let d = -1; d <= 1; d++) { beams.push({ kind: 'h', r: r + d, c, t: 0, life: 0.45 }); beams.push({ kind: 'v', r, c: c + d, t: 0, life: 0.45 }); }
          sfx.line(); sfx.boom(); shake = 1;
        } else {
          for (let k = 0; k < N; k++) { add(r, k); add(k, c); }
          beams.push({ kind: 'h', r, c, t: 0, life: 0.4 }); beams.push({ kind: 'v', r, c, t: 0, life: 0.4 }); sfx.line(); shake = 0.6;
        }
      }
      const all = expand(set, new Set());
      floatText(b.c + 0.5, b.r + 0.5 - 0.6, 'Combo!', '#ffc861', true);
      await clearCells(all, 2, []);
      if (dead) return;
      gravity();
      await waitFall();
    }

    async function trySwap(a, b) {
      if (busy || !S || S.done || paused) return;
      if (!inB(b.r, b.c)) return;
      clearHint();
      busy = true; sel = null;
      const A = grid[a.r][a.c], B = grid[b.r][b.c];
      sfx.swap();
      swapCells(a, b);
      await Promise.all([tween(A, { x: b.c, y: b.r }, 0.17, 'inOut'), tween(B, { x: a.c, y: a.r }, 0.17, 'inOut')]);
      if (dead) return;
      const special = A.sp === 'c' || B.sp === 'c' || (A.sp && B.sp);
      if (!special && !wouldMatch(a.r, a.c) && !wouldMatch(b.r, b.c)) {
        sfx.bad();
        swapCells(a, b);
        await Promise.all([tween(A, { x: a.c, y: a.r }, 0.2, 'inOut'), tween(B, { x: b.c, y: b.r }, 0.2, 'inOut')]);
        busy = false; armHint(); return;
      }
      if (S.mode === 'levels') S.moves--;
      updateHud();
      if (special) await comboSwap(b, a);
      if (dead) return;
      await cascadeLoop([a, b]);
      if (dead) return;
      await settle();
    }
    async function settle() {
      // after the board stops: check end states, reshuffle if stuck
      if (S.mode === 'levels' && !S.done) {
        if (S.score >= S.info.target) { await levelWon(); return; }
        if (S.moves <= 0) { levelLost(); return; }
      }
      if (!findMoves().length) await reshuffle();
      if (S.mode === 'zen') { if (S.score > prog.zenBest) { prog.zenBest = S.score; saveProg(); } saveZen(); }
      busy = false; updateHud(); armHint();
    }
    async function reshuffle() {
      floatText(N / 2, N / 2, 'No moves — shuffling', '#ffc861', true); sfx.shuffle();
      const gems = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) gems.push(grid[r][c]);
      for (let tries = 0; tries < 300; tries++) {
        for (let i = gems.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = gems[i]; gems[i] = gems[j]; gems[j] = t; }
        for (let k = 0; k < gems.length; k++) grid[(k / N) | 0][k % N] = gems[k];
        if (!findGroups().length && findMoves().length) break;
        if (tries === 299) { for (let k = 0; k < gems.length; k++) if (!gems[k].sp) gems[k].t = randType(); tries = 0; }
      }
      await wait(500);
      const ps = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) ps.push(tween(grid[r][c], { x: c, y: r }, 0.55, 'inOut'));
      await Promise.all(ps);
    }
    async function levelWon() {
      S.done = true; S.won = true;
      // leftover moves become bonus points
      const left = S.moves;
      for (let i = 0; i < left; i++) {
        if (dead) return;
        S.moves--; S.score += 100; updateHud(); sfx.bonus(i);
        const r = (Math.random() * N) | 0, c = (Math.random() * N) | 0; burst(r, c, '#ffc861', 10, 3); floatText(c + 0.5, r + 0.5, '+100', '#ffc861');
        await wait(110);
      }
      const st = starsFor(S.score, S.info.target);
      const lv = S.level;
      if (!prog.stars[lv] || prog.stars[lv] < st) prog.stars[lv] = st;
      if (prog.unlocked < lv + 1) prog.unlocked = lv + 1;
      saveProg();
      const cleared = prog.unlocked - 1;
      if (cleared > (api.load('bestN') || 0)) { api.save('bestN', cleared); api.save('best', 'Lv ' + cleared); }
      sfx.win();
      busy = false; updateHud();
      showOverlay(`<h3>Level ${lv} clear!</h3><div class="stars">${[1, 2, 3].map(i => `<i class="${i <= st ? 'on' : ''}" style="animation-delay:${i * 0.18}s">★</i>`).join('')}</div><div class="big">${S.score.toLocaleString()}</div><p>Target ${S.info.target.toLocaleString()}${left ? ' · ' + left + ' moves left → +' + (left * 100) : ''}</p><div class="row"><button class="btn pri small" data-a="nextlv">Next level ⏎</button><button class="btn sec small" data-a="replay">Replay</button></div>`);
    }
    function levelLost() {
      S.done = true; S.won = false; busy = false; sfx.lose(); updateHud();
      showOverlay(`<h3>Out of moves</h3><div class="big">${S.score.toLocaleString()} / ${S.info.target.toLocaleString()}</div><p>So close. The mule believes in you.</p><div class="row"><button class="btn pri small" data-a="replay">Try again ⏎</button></div>`);
    }
    function starsFor(score, target) { return score >= target * 2 ? 3 : score >= target * 1.5 ? 2 : score >= target ? 1 : 0; }

    function saveZen() { if (!S || S.mode !== 'zen') return; api.save('zen', { s: S.score, g: grid.map(row => row.map(g => (g.sp === 'c' ? 'c' : g.t + (g.sp || '')))) }); }
    function loadZen() {
      const z = api.load('zen');
      if (!z || !z.g || z.g.length !== N) return false;
      try {
        grid = z.g.map((row, r) => row.map((v, c) => { v = String(v); if (v === 'c') return mkGem(-1, r, c, 'c'); const t = parseInt(v, 10), sp = v.replace(/^\d+/, '') || null; return mkGem(t, r, c, sp); }));
        if (grid.some(row => row.length !== N || row.some(g => g.t > 6 || (g.t < 0 && g.sp !== 'c')))) return false;
        S.score = z.s || 0; return true;
      } catch (e) { return false; }
    }

    function start(mode, level) {
      hideOverlay(); clearHint();
      tweens.forEach(t => t.res && 0); tweens = []; fallWaiters = []; parts = []; floats = []; beams = []; dying = [];
      prog.mode = mode;
      if (mode === 'levels') { prog.level = Math.max(1, Math.min(level || prog.level || 1, prog.unlocked)); }
      saveProg();
      const info = mode === 'levels' ? levelInfo(prog.level) : { target: 0, moves: 0, colors: 6 };
      S = { mode, level: prog.level, info, score: 0, moves: info.moves, colors: info.colors, done: false, won: false };
      sel = null; busy = false; paused = false;
      if (!(mode === 'zen' && loadZen())) fillFresh();
      shownScore = S.score; $('score').textContent = S.score.toLocaleString();
      // entrance: drop the board in
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const g = grid[r][c]; g.y = r - N - (N - r) * 0.15 - Math.random() * 0.3; g.vy = 0.001; }
      busy = true;
      waitFall().then(() => { if (!dead && S) { busy = false; if (!findMoves().length) settle(); else armHint(); } });
      updateHud(); kick();
    }

    /* ---------- hints ---------- */
    function clearHint() { hint = null; hintT = 0; if (hintTimer) { clearTimeout(hintTimer); timers.delete(hintTimer); hintTimer = 0; } }
    function armHint() {
      if (hintTimer) { clearTimeout(hintTimer); timers.delete(hintTimer); }
      hintTimer = later(() => { hintTimer = 0; if (!visible() || busy || paused || !S || S.done) { armHint(); return; } showHint(); }, 6000);
    }
    function showHint() {
      if (busy || !S || S.done) return;
      const mv = findMoves(); if (!mv.length) return;
      mv.sort((x, y) => y.w - x.w);
      const best = mv.filter(m => m.w === mv[0].w);
      hint = best[(Math.random() * best.length) | 0]; hintT = 2.6; kick();
    }

    /* ---------- HUD / overlay ---------- */
    function updateHud() {
      if (!S) return;
      root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
      const lv = S.mode === 'levels';
      $('lvcard').hidden = !lv;
      $('mvlabel').textContent = lv ? 'Moves' : 'Zen best';
      $('moves').textContent = lv ? S.moves : Math.max(prog.zenBest, S.score).toLocaleString();
      $('mvbox').classList.toggle('low', lv && S.moves <= 3 && !S.done);
      if (lv) {
        $('lvname').textContent = 'Level ' + S.level + (prog.stars[S.level] ? '  ' + '★'.repeat(prog.stars[S.level]) : '');
        $('prev').disabled = S.level <= 1; $('next').disabled = S.level >= prog.unlocked;
        const T = S.info.target, max = T * 2.2;
        $('bar').style.width = Math.min(100, S.score / max * 100) + '%';
        [1, 1.5, 2].forEach((m, i) => { const s = $('s' + (i + 1)); s.style.left = (m * T / max * 100) + '%'; s.classList.toggle('got', S.score >= m * T); });
        $('tgt').textContent = 'Target ' + T.toLocaleString();
        $('pct').textContent = S.score >= T ? 'Target reached!' : (T - S.score).toLocaleString() + ' to go';
      }
      $('restart').textContent = lv ? 'Restart' : 'New board';
      $('pause').textContent = paused ? 'Resume' : 'Pause';
      $('snd').textContent = soundOn ? '🔊' : '🔇';
    }
    function hideOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
    function showOverlay(html) { hideOverlay(); overlay = document.createElement('div'); overlay.className = 'ov'; overlay.innerHTML = html; stage.appendChild(overlay); }
    function togglePause() {
      if (!S || S.done) return;
      paused = !paused;
      if (paused) showOverlay('<h3>Paused</h3><p>Take a breather.</p><div class="row"><button class="btn pri small" data-a="resume">Resume ⏎</button></div>');
      else { hideOverlay(); lastT = 0; kick(); }
      updateHud();
    }
    function enterAction() {
      if (paused) { togglePause(); return; }
      if (!S || !S.done) return;
      if (S.won) start('levels', S.level + 1); else start(S.mode, S.level);
    }

    /* ---------- input ---------- */
    function cellAt(e) {
      const rc = cv.getBoundingClientRect();
      const c = Math.floor((e.clientX - rc.left) / cs), r = Math.floor((e.clientY - rc.top) / cs);
      return inB(r, c) ? { r, c } : null;
    }
    function onDown(e) {
      kick();
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (busy || paused || !S || S.done) return;
      const p = cellAt(e); if (!p) return;
      cursor = null;
      if (sel && Math.abs(sel.r - p.r) + Math.abs(sel.c - p.c) === 1) { const a = sel; sel = null; trySwap(a, p); return; }
      if (sel && sel.r === p.r && sel.c === p.c) { drag = { p, x: e.clientX, y: e.clientY, id: e.pointerId, wasSel: true }; }
      else { sel = p; sfx.sel(); drag = { p, x: e.clientX, y: e.clientY, id: e.pointerId, wasSel: false }; }
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      clearHint(); armHint(); kick();
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < cs * 0.35) return;
      const p = drag.p; drag = null;
      const t = Math.abs(dx) > Math.abs(dy) ? { r: p.r, c: p.c + (dx > 0 ? 1 : -1) } : { r: p.r + (dy > 0 ? 1 : -1), c: p.c };
      if (inB(t.r, t.c)) { sel = null; trySwap(p, t); }
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.wasSel) { sel = null; kick(); }
      drag = null;
    }
    function onClick(e) {
      const b = e.target.closest('button'); if (!b) return;
      kick();
      const r = b.getAttribute('data-r'), a = b.getAttribute('data-a');
      if (b.dataset.mode) { if (!S || S.mode !== b.dataset.mode) start(b.dataset.mode); }
      else if (r === 'restart') { if (S.mode === 'zen') api.save('zen', null); start(S.mode, S.level); }
      else if (r === 'prev') start('levels', S.level - 1);
      else if (r === 'next') start('levels', S.level + 1);
      else if (r === 'hint') { clearHint(); showHint(); }
      else if (r === 'pause' || a === 'resume') togglePause();
      else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); updateHud(); sfx.sel(); }
      else if (a === 'nextlv') start('levels', S.level + 1);
      else if (a === 'replay') start(S.mode, S.level);
      b.blur();
    }
    function onKey(e) {
      if (el.offsetParent === null || document.hidden) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const k = e.key;
      kick();
      if (k === 'p' || k === 'P' || (k === 'Escape' && paused)) { e.preventDefault(); togglePause(); return; }
      if (k === 'Enter') { e.preventDefault(); if (paused || (S && S.done)) enterAction(); else if (cursor) keySelect(); return; }
      if (paused || !S || S.done) return;
      const D = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
      if (D) {
        e.preventDefault();
        if (!cursor) { cursor = sel ? { r: sel.r, c: sel.c } : { r: 4, c: 3 }; kick(); return; }
        if (sel && !busy) {
          const t = { r: sel.r + D[0], c: sel.c + D[1] };
          if (inB(t.r, t.c)) { const a = sel; sel = null; cursor = { r: t.r, c: t.c }; trySwap(a, t); }
          return;
        }
        cursor = { r: Math.max(0, Math.min(N - 1, cursor.r + D[0])), c: Math.max(0, Math.min(N - 1, cursor.c + D[1])) };
        clearHint(); armHint(); kick(); return;
      }
      if (k === ' ') { e.preventDefault(); keySelect(); return; }
      if (k === 'h' || k === 'H' || k === 'c') { e.preventDefault(); clearHint(); showHint(); return; }
      if (k === 'x' || k === 'Escape') { if (sel) { e.preventDefault(); sel = null; kick(); } }
    }
    function keySelect() {
      if (busy || !S || S.done) return;
      if (!cursor) { cursor = { r: 4, c: 3 }; kick(); return; }
      if (sel && sel.r === cursor.r && sel.c === cursor.c) sel = null;
      else if (sel && Math.abs(sel.r - cursor.r) + Math.abs(sel.c - cursor.c) === 1) { const a = sel; sel = null; trySwap(a, { r: cursor.r, c: cursor.c }); return; }
      else { sel = { r: cursor.r, c: cursor.c }; sfx.sel(); }
      clearHint(); armHint(); kick();
    }
    function onResize() { if (el.offsetParent === null || document.hidden) return; fit(); kick(); }
    function onVis() { if (!document.hidden) { lastT = 0; kick(); } }
    root.addEventListener('click', onClick);
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerenter', kick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);

    fit();
    start(prog.mode === 'zen' ? 'zen' : 'levels', prog.level);

    return {
      destroy() {
        dead = true;
        if (S && S.mode === 'zen' && !busy) saveZen();
        root.removeEventListener('click', onClick);
        cv.removeEventListener('pointerdown', onDown);
        cv.removeEventListener('pointermove', onMove);
        cv.removeEventListener('pointerup', onUp);
        cv.removeEventListener('pointercancel', onUp);
        cv.removeEventListener('pointerenter', kick);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        timers.forEach(clearTimeout); timers.clear();
        tweens = []; fallWaiters = []; parts = []; floats = []; beams = [];
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        el.innerHTML = '';
      },
      _test: {
        get S() { return S; }, get busy() { return busy; }, get grid() { return grid; }, findMoves, trySwap, start, showHint, get hint() { return hint; }, prog,
        setGrid(rows) { grid = rows.map((row, r) => row.map((v, c) => { if (v === 'c') return mkGem(-1, r, c, 'c'); const t = parseInt(v, 10); const sp = String(v).replace(/^\d+/, '') || null; return mkGem(t, r, c, sp); })); kick(); },
        get anim() { return !!raf; },
      },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { const i = inst; inst = null; i.destroy(); this._t = null; } },
  };
})();
