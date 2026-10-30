/* VanMule Pinball "Night Run": an original 90s-style space table drawn on a canvas.
   VanPinball.mount(container, {hs, onHs, vol, onVol}) / VanPinball.unmount() */
(function () {
  'use strict';
  const W = 440, H = 800, R = 8, G = 980, SUB = 12, TAU = Math.PI * 2, REPLAY = 1000000;
  const RANKS = ['Cadet', 'Rookie Mule', 'Road Mule', 'Turbo Mule', 'Star Mule', 'Comet Mule', 'Galaxy Mule', 'Legend'];
  const MISSIONS = [
    { id: 'boost', name: 'Boost Charge', desc: 'Knock down the 3 blue BOOST targets', goal: 3 },
    { id: 'bump', name: 'Bumper Burn', desc: 'Hit the pop bumpers 20 times', goal: 20 },
    { id: 'orbit', name: 'Orbit Run', desc: 'Shoot the right orbit lane 2 times', goal: 2 },
    { id: 'ramp', name: 'Skyway Rider', desc: 'Ride the Skyway ramp 2 times', goal: 2 },
    { id: 'warp', name: 'Warp Jump', desc: 'Sink the warp hole 2 times', goal: 2 },
    { id: 'spin', name: 'Spin Cycle', desc: 'Spin the left lane spinner 30 times', goal: 30 },
    { id: 'rocket', name: 'Rocket Fuel', desc: 'Knock down the 3 red ROCKET targets', goal: 3 },
    { id: 'lanes', name: 'Lane Patrol', desc: 'Light all four M·U·L·E lanes', goal: 4 },
    { id: 'tour', name: 'Grand Tour', desc: 'Make the ramp, the orbit and the warp hole', goal: 3 },
  ];
  const v2 = (x, y) => ({ x, y });
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const AXC = 219, AYC = 210, ARX = 201, ARY = 180;
  const ell = (t, off) => [AXC + (ARX - off) * Math.cos(t), AYC + (ARY - off) * Math.sin(t)];
  const LANEX = [170, 212, 254, 296], SAVEX = [33, 63, 347, 378];
  const BK = { p: [84, 448], d: [0.9001, -0.4355], n: [0.4355, 0.9001] };
  const STAND = [[80, 198], [104, 174], [128, 150]];
  const SAUCER = { x: 205, y: 405 };
  const SPIN = { x: 39, y: 330 };
  const FONT_D = 'Unbounded, "Arial Black", sans-serif', FONT_B = 'Figtree, system-ui, sans-serif', FONT_M = '"JetBrains Mono", ui-monospace, monospace';

  /* ---------- guided paths (ramp, orbit, hyperspace launch, kickback) ---------- */
  function mkPath(pts, speed, exitV, kind, elev) { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, L, len: L[L.length - 1], speed, exitV, kind, elev: !!elev }; }
  function arcPts(t0, t1, off, n) { const a = []; for (let i = 0; i <= n; i++) a.push(ell(t0 + ((t1 - t0) * i) / n, off)); return a; }
  const LEFT_DOWN = [[34, 262], [35, 420], [46, 476], [62, 516]];
  const PATHS = {
    ramp: mkPath([[142, 292], [142, 236], [124, 186], [110, 140], [128, 104], [166, 80], [220, 68], [282, 70], [328, 86], [358, 110], [377, 146], [381, 200], [381, 300], [380, 396], [373, 446], [357, 488], [347, 528]], 720, [0, 300], 'ramp', true),
    orbit: mkPath([[379, 340], [379, 250]].concat(arcPts(-0.53, -Math.PI, 16, 28), LEFT_DOWN), 1000, [0, 300], 'orbit'),
    hyper: mkPath([[407, 290], [407, 215]].concat(arcPts(-0.12, -Math.PI, 12, 32), LEFT_DOWN), 1150, [0, 300], 'hyper'),
    kick: mkPath([[33, 700], [33, 545], [44, 522], [62, 506]], 1100, [380, -520], 'kick'),
  };

  /* ---------- table geometry ---------- */
  function buildTable() {
    const segs = [];
    const add = (a, b, o) => {
      const s = Object.assign({ a: v2(a[0], a[1]), b: v2(b[0], b[1]), e: 0.4, t: 2, on: true, kind: 'wall', st: 'rail' }, o || {});
      const p = s.t + R + 4; s.x0 = Math.min(s.a.x, s.b.x) - p; s.x1 = Math.max(s.a.x, s.b.x) + p; s.y0 = Math.min(s.a.y, s.b.y) - p; s.y1 = Math.max(s.a.y, s.b.y) + p;
      segs.push(s); return s;
    };
    const poly = (pts, o) => { for (let i = 0; i < pts.length - 1; i++) add(pts[i], pts[i + 1], o); };
    const arc = arcPts(Math.PI, TAU, 0, 44);
    add([18, 830], [18, 210], { st: 'outer' }); poly(arc, { st: 'outer' }); add([420, 210], [420, 830], { st: 'outer' });
    add([394, 830], [394, 252], { st: 'rail' });
    add([394, 252], [420, 226], { kind: 'cap', on: false, st: 'cap' });                     // closes the shooter lane once the ball is out
    for (const x of [149, 191, 233, 275, 317]) add([x, 90], [x, 124], { t: 3, e: 0.3, st: 'post' });
    add([60, 232], [60, 420], { st: 'rail' });                                                // left (spinner) lane
    add([18, 440], [54, 492], { st: 'rail' });                                                // left lane deflector -> left inlane
    poly([[48, 540], [48, 650], [123, 688]], { st: 'rail', e: 0.3 });                         // left inlane guide
    poly([[362, 540], [362, 650], [287, 688]], { st: 'rail', e: 0.3 });                       // right inlane guide
    add([364, 252], [364, 420], { st: 'rail' });                                              // right orbit lane wall
    add([394, 440], [356, 492], { st: 'rail' });                                              // right orbit deflector
    poly([[117, 662], [80, 637], [80, 567]], { t: 3, st: 'rubber', e: 0.5 }); add([80, 567], [117, 662], { kind: 'sling', t: 3, side: 0, e: 0.5, st: 'none' });
    poly([[293, 662], [330, 637], [330, 567]], { t: 3, st: 'rubber', e: 0.5 }); add([330, 567], [293, 662], { kind: 'sling', t: 3, side: 1, e: 0.5, st: 'none' });
    add([122, 314], [122, 256], { t: 3, st: 'metal' }); add([122, 256], [162, 256], { t: 3, st: 'metal' }); add([162, 256], [162, 314], { t: 3, st: 'metal' }); // Skyway ramp mouth
    // BOOST drop bank (blue) with its backing wall
    const P = BK.p, d = BK.d, n = BK.n, bl = 68.9;
    add([P[0] - n[0] * 7, P[1] - n[1] * 7], [P[0] + d[0] * bl - n[0] * 7, P[1] + d[1] * bl - n[1] * 7], { st: 'rail' });
    for (let i = 0; i < 3; i++) { const s0 = i * 23 + 2, s1 = s0 + 19; add([P[0] + d[0] * s0, P[1] + d[1] * s0], [P[0] + d[0] * s1, P[1] + d[1] * s1], { kind: 'drop', bank: 0, i, t: 4, e: 0.3, st: 'none' }); }
    // ROCKET drop bank (red) on the orbit wall
    for (let i = 0; i < 3; i++) add([357, 292 + i * 31], [357, 316 + i * 31], { kind: 'drop', bank: 1, i, t: 4, e: 0.3, st: 'none' });
    // mission standups
    STAND.forEach((c, i) => add([c[0] - 6.4, c[1] + 6.4], [c[0] + 6.4, c[1] - 6.4], { kind: 'stand', i, t: 4, e: 0.5, st: 'none' }));
    add([394, 770], [420, 770], { kind: 'plunger', t: 2, e: 0.1, st: 'none' });
    return {
      segs, cap: segs.find((s) => s.kind === 'cap'),
      bumpers: [{ x: 167, y: 168, r: 18, k: 0, f: 0 }, { x: 243, y: 168, r: 18, k: 0, f: 0 }, { x: 205, y: 222, r: 18, k: 0, f: 0 }, { x: 283, y: 214, r: 15, k: 1, f: 0 }, { x: 322, y: 176, r: 15, k: 1, f: 0 }],
      lanes: LANEX.map((x) => ({ x, y: 108, lit: false, f: 0 })),
      flips: [{ p: v2(128, 700), side: 0, a: 0.5, prev: null, L: 64 }, { p: v2(282, 700), side: 1, a: 0.5, prev: null, L: 64 }],
      spin: { a: 0, v: 0, n: 0 },
    };
  }
  const flipTip = (f) => ({ x: f.p.x + (f.side ? -1 : 1) * f.L * Math.cos(f.a), y: f.p.y + f.L * Math.sin(f.a) });

  /* ---------- insert lights ---------- */
  function buildInserts() {
    const I = [], ins = (id, o) => { o.id = id; I.push(o); return o; };
    'MULE'.split('').forEach((ch, i) => ins('lane' + i, { sh: 'circ', x: LANEX[i], y: 108, r: 7, col: '#ffd166', txt: ch }));
    const RC = ['#ff5a52', '#ff8a3d', '#ffd166', '#4ade80', '#6fd3c7', '#60a5fa', '#a78bfa', '#f472b6'];
    for (let i = 0; i < 16; i++) { const a0 = -Math.PI / 2 + (i * TAU) / 16 + 0.05, a1 = a0 + TAU / 16 - 0.1, am = (a0 + a1) / 2; ins('ring' + i, { sh: 'wedge', cx: SAUCER.x, cy: SAUCER.y, r0: 25, r1: 39, a0, a1, x: SAUCER.x + 32 * Math.cos(am), y: SAUCER.y + 32 * Math.sin(am), col: RC[i % 8] }); }
    for (let i = 0; i < 8; i++) { const a = ((-162 + (i * 144) / 7) * Math.PI) / 180; ins('rank' + i, { sh: 'dia', x: SAUCER.x + 52 * Math.cos(a), y: SAUCER.y + 52 * Math.sin(a), s: 6, col: '#ffd166' }); }
    const arr = (id, x, y, deg, col) => ins(id, { sh: 'arrow', x, y, a: (deg * Math.PI) / 180, s: 11, col });
    arr('arRamp', 142, 336, -90, '#ffd166'); arr('arOrbit', 342, 448, -62, '#6fd3c7'); arr('arLane', 76, 470, -118, '#a78bfa');
    arr('arWarp', 205, 462, -90, '#f472b6'); arr('arBoost', 130, 474, -109, '#60a5fa'); arr('arRocket', 326, 336, 0, '#ff5a52');
    arr('arStand', 186, 270, -131, '#ffd166'); arr('arBump', 205, 290, -90, '#f472b6');
    ins('insJack', { sh: 'rect', x: 140, y: 360, w: 52, h: 11, col: '#ffd166', txt: 'JACKPOT', fs: 7 });
    ins('insMB', { sh: 'rect', x: 140, y: 377, w: 56, h: 11, col: '#f472b6', txt: 'MULTIBALL', fs: 7 });
    ins('insXB', { sh: 'rect', x: 205, y: 482, w: 62, h: 11, col: '#4ade80', txt: 'EXTRA BALL', fs: 7 });
    for (let i = 0; i < 4; i++) ins('mult' + i, { sh: 'circ', x: 166 + i * 26, y: 512, r: 9, col: '#ff8a3d', txt: i + 2 + 'X', fs: 7.5 });
    for (let i = 0; i < 5; i++) ins('hyp' + i, { sh: 'chev', x: 39, y: 300 - i * 12, a: -Math.PI / 2, s: 9, col: '#6fd3c7' });
    ins('kick', { sh: 'circ', x: 33, y: 648, r: 6.5, col: '#ff5a52', txt: 'K', fs: 7 });
    'SAVE'.split('').forEach((ch, i) => ins('save' + i, { sh: 'circ', x: SAVEX[i], y: 606, r: 6.5, col: '#4ade80', txt: ch, fs: 7 }));
    STAND.forEach((c, i) => ins('mt' + i, { sh: 'circ', x: c[0] + 12, y: c[1] + 12, r: 4.5, col: '#ffd166' }));
    for (let i = 0; i < 3; i++) { const s = i * 23 + 11.5; ins('bk0' + i, { sh: 'circ', x: BK.p[0] + BK.d[0] * s + BK.n[0] * 15, y: BK.p[1] + BK.d[1] * s + BK.n[1] * 15, r: 4.5, col: '#60a5fa' }); }
    for (let i = 0; i < 3; i++) ins('bk1' + i, { sh: 'circ', x: 342, y: 304 + i * 31, r: 4.5, col: '#ff5a52' });
    ins('again', { sh: 'rect', x: 205, y: 776, w: 92, h: 14, col: '#ff5a52', txt: 'SHOOT AGAIN', fs: 8, apron: true });
    for (const n of I) {
      let x0, y0, x1, y1;
      if (n.sh === 'circ') { x0 = n.x - n.r; x1 = n.x + n.r; y0 = n.y - n.r; y1 = n.y + n.r; }
      else if (n.sh === 'rect') { x0 = n.x - n.w / 2; x1 = n.x + n.w / 2; y0 = n.y - n.h / 2; y1 = n.y + n.h / 2; }
      else if (n.sh === 'wedge') { x0 = y0 = 1e9; x1 = y1 = -1e9; for (let k = 0; k <= 4; k++) for (const rr of [n.r0, n.r1]) { const a = n.a0 + ((n.a1 - n.a0) * k) / 4, px = n.cx + rr * Math.cos(a), py = n.cy + rr * Math.sin(a); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); } }
      else { x0 = n.x - n.s; x1 = n.x + n.s; y0 = n.y - n.s; y1 = n.y + n.s; }
      n.bb = { x: x0 - 9, y: y0 - 9, w: x1 - x0 + 18, h: y1 - y0 + 18 };
    }
    return I;
  }

  /* ---------- sound ---------- */
  let AC = null, NB = null, vol = 0.5, simming = false; const sndLast = {};
  function snd(kind) {
    if (!vol || simming || !root) return; const now = performance.now(); if (sndLast[kind] && now - sndLast[kind] < 35) return; sndLast[kind] = now;
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      const t = AC.currentTime, out = AC.createGain(); out.gain.value = vol; out.connect(AC.destination);
      const tone = (type, f1, f2, dur, v, at = 0) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f1, t + at); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + at + dur); g.gain.setValueAtTime(v, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur); o.connect(g); g.connect(out); o.start(t + at); o.stop(t + at + dur + 0.02); };
      const noise = (dur, v, f = 1800, at = 0) => {
        if (!NB) { NB = AC.createBuffer(1, Math.floor(AC.sampleRate * 0.4), AC.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
        const s = AC.createBufferSource(), g = AC.createGain(), bq = AC.createBiquadFilter(); s.buffer = NB; bq.type = 'bandpass'; bq.frequency.value = f; g.gain.setValueAtTime(v, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur); s.connect(bq); bq.connect(g); g.connect(out); s.start(t + at); s.stop(t + at + dur + 0.02);
      };
      const arp = (fs, gap, type, v) => fs.forEach((f, i) => tone(type, f, 0, gap * 1.7, v, i * gap));
      switch (kind) {
        case 'bump': tone('square', 540, 180, 0.12, 0.16); tone('sine', 110, 50, 0.12, 0.3); break;
        case 'bump2': tone('square', 760, 260, 0.1, 0.14); tone('sine', 140, 60, 0.1, 0.25); break;
        case 'sling': noise(0.07, 0.35, 900); tone('sawtooth', 300, 90, 0.1, 0.14); break;
        case 'flip': tone('triangle', 150, 60, 0.05, 0.22); noise(0.03, 0.12, 600); break;
        case 'drop': tone('square', 880, 440, 0.09, 0.14); noise(0.04, 0.2, 2500); break;
        case 'bank': arp([660, 880, 1175, 1568], 0.07, 'square', 0.11); break;
        case 'stand': tone('triangle', 990, 660, 0.1, 0.2); break;
        case 'lane': tone('sine', 1200, 1700, 0.08, 0.16); break;
        case 'spin': tone('square', 1900, 1700, 0.018, 0.06); break;
        case 'rampUp': tone('sawtooth', 110, 520, 0.7, 0.1); tone('triangle', 220, 1040, 0.7, 0.1); break;
        case 'ramp': arp([523, 659, 784, 1047], 0.07, 'triangle', 0.18); break;
        case 'orbit': tone('sine', 300, 1400, 0.55, 0.16); noise(0.4, 0.08, 3000); break;
        case 'hyper': tone('sawtooth', 70, 2400, 0.9, 0.12); tone('sine', 140, 3200, 0.9, 0.12); break;
        case 'warp': tone('sine', 1400, 160, 0.5, 0.22); tone('triangle', 700, 80, 0.5, 0.12); break;
        case 'kick': noise(0.08, 0.35, 700); tone('square', 160, 70, 0.12, 0.18); break;
        case 'launch': tone('sawtooth', 90, 420, 0.25, 0.16); noise(0.12, 0.25, 1200); break;
        case 'drain': tone('triangle', 420, 55, 0.8, 0.26); break;
        case 'mission': arp([523, 659, 784, 1047, 1319], 0.09, 'square', 0.12); break;
        case 'accept': arp([392, 523, 659, 784], 0.1, 'triangle', 0.18); break;
        case 'prog': tone('sine', 880, 1320, 0.12, 0.14); break;
        case 'save': arp([784, 988, 1175], 0.1, 'sine', 0.18); break;
        case 'xb': arp([1047, 1319, 1568, 2093, 1568, 2093], 0.07, 'triangle', 0.16); break;
        case 'mb': arp([262, 330, 392, 523, 659, 784, 1047, 1319], 0.07, 'sawtooth', 0.09); break;
        case 'jackpot': arp([1047, 784, 1047, 1319, 1568, 2093], 0.08, 'square', 0.13); break;
        case 'skill': arp([1568, 2093, 2637], 0.08, 'sine', 0.2); break;
        case 'tilt': tone('sawtooth', 110, 55, 0.8, 0.25); break;
        case 'nudge': noise(0.1, 0.25, 300); break;
        case 'start': arp([392, 523, 659, 784, 1047], 0.09, 'triangle', 0.15); break;
        case 'over': arp([523, 392, 330, 262, 196], 0.16, 'triangle', 0.18); break;
      }
    } catch (e) { /* audio unavailable */ }
  }

  /* ---------- game state ---------- */
  let T, INS, st, cv, ctx, bg, fg, panel, root, logoCv, raf = 0, last = 0, opts = {}, scale = 1, dpr = 1, idleT = 0, SPR = {}, uid = 0;
  const keys = {};
  function blankState(mode) {
    return { mode, time: 0, score: 0, ball: 1, balls: 3, extra: 0, rank: 0, mult: 1, bonus: 0, mis: -1, sel: Math.floor(Math.random() * MISSIONS.length), prog: 0, tour: {}, done: [],
      mt: [false, false, false], drops: [[false, false, false], [false, false, false]], sv: [false, false, false, false], kick: true, mbLit: false, mb: false, jpLit: false, jp: 100000, xbLit: false,
      hyper: 0, skill: -1, skillT: 0, save: 0, started: false, between: false, tilted: false, nudges: [], power: 0, bl: [], parts: [], floats: [], timers: [], msgs: [], msg: '', msgHot: false, msgT: 0,
      ejectQ: 0, ejectT: 0, replayGot: false, hsDone: false, paused: false, rampN: 0, stats: { unstick: 0, esc: 0, ramps: 0, orbits: 0, hypers: 0, warps: 0, kicks: 0, saves: 0, mbs: 0, jackpots: 0, missions: 0, drains: 0 } };
  }
  function newGame() {
    T = buildTable(); st = blankState('play'); snd('start');
    say('Welcome, Cadet! Hit mission targets to select a mission', 3);
    startBall();
  }
  function newBallObj(x, y) { return { id: ++uid, x, y, vx: 0, vy: 0, px: x, py: y, shooter: false, path: null, hold: 0, still: 0, cool: {}, hyper: false, ax: x, ay: y, at: 0 }; }
  function startBall() {
    const b = newBallObj(407, 760); b.shooter = true; st.bl = [b]; st.started = false; st.save = 0; st.tilted = false; st.nudges = []; st.mb = false; st.ejectQ = 0;
    st.between = false; st.skill = -1; st.bonus = 0; st.mult = 1; st.power = 0; T.lanes.forEach((l) => (l.lit = false));
    say(`Ball ${st.ball}: hold Space to pull the plunger`, 2.5);
  }
  function later(s, fn) { st.timers.push({ t: s, fn }); }
  function say(m, s = 2.2, hot = false) { if (simming && !st) return; st.msgs.push({ m, s, hot }); if (st.msgs.length > 3) st.msgs.splice(0, st.msgs.length - 3); if (st.msgs.length > 1 && st.msgT > 1) st.msgT = 1; }
  function pts(n) {
    if (st.tilted || st.mode !== 'play') return; st.score += Math.round(n); st.bonus += Math.round(n / 25);
    if (!st.replayGot && st.score >= REPLAY) { st.replayGot = true; st.extra++; say('REPLAY! Extra ball awarded', 3, true); snd('xb'); }
  }
  function floatTxt(txt, x, y, col) { st.floats.push({ txt, x, y, t: 1.3, col: col || '#ffd166' }); if (st.floats.length > 8) st.floats.shift(); }
  function burst(x, y, c, n = 10) { if (simming) return; for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 60 + Math.random() * 200; st.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.5, c }); } if (st.parts.length > 160) st.parts.splice(0, st.parts.length - 160); }
  function activeShots() {
    const s = {}; if (st.mode !== 'play') return s;
    if (st.mis < 0) s.stand = 1;
    else { const id = MISSIONS[st.mis].id; if (id === 'tour') { for (const k of ['ramp', 'orbit', 'warp']) if (!st.tour[k]) s[k] = 1; } else s[id] = 1; }
    return s;
  }
  function progress(id, n = 1) {
    if (st.mis < 0 || st.tilted || st.mode !== 'play') return; const m = MISSIONS[st.mis];
    if (m.id === 'tour') { if (!['ramp', 'orbit', 'warp'].includes(id) || st.tour[id]) return; st.tour[id] = true; st.prog++; }
    else if (m.id !== id) return; else st.prog += n;
    pts(2500); if (m.goal <= 4 || st.prog % 5 === 0) { snd('prog'); if (st.prog < m.goal) say(`${m.name}: ${st.prog} of ${m.goal}`, 1.6); }
    if (st.prog >= m.goal) missionDone();
  }
  function missionDone() {
    const m = MISSIONS[st.mis]; st.stats.missions++; st.done.push(m.id); if (st.done.length >= MISSIONS.length) st.done = [];
    const prev = st.rank; st.rank = Math.min(RANKS.length - 1, st.rank + 1); const award = 50000 * (st.rank + 1); pts(award);
    snd('mission'); say('Mission complete! +' + fmt(award), 2.4, true); floatTxt('MISSION COMPLETE', SAUCER.x, SAUCER.y - 70, '#4ade80');
    if (st.rank !== prev) { say('Promoted to ' + RANKS[st.rank].toUpperCase(), 2.4, true); later(0.6, () => snd('accept')); }
    const r = st.rank;
    if (r === 1 || r === 4) { st.kick = true; say('Kickback lit', 1.8); }
    if (r % 2 === 0 && !st.mb) { st.mbLit = true; say('MULTIBALL LIT: shoot the Skyway ramp', 3, true); }
    if (r === 3 || r === 6) { st.xbLit = true; say('EXTRA BALL AVAILABLE: sink the warp hole', 3, true); }
    if (r === RANKS.length - 1 && prev === r) pts(250000);
    st.mis = -1; st.prog = 0; st.mt = [false, false, false]; st.sel = nextMission(st.sel);
  }
  function nextMission(cur) { for (let k = 1; k <= MISSIONS.length; k++) { const i = (cur + k) % MISSIONS.length; if (!st.done.includes(MISSIONS[i].id)) return i; } return (cur + 1) % MISSIONS.length; }
  function acceptMission() {
    st.mis = st.sel; st.prog = 0; st.tour = {}; st.mt = [false, false, false]; const m = MISSIONS[st.mis];
    if (m.id === 'boost') st.drops[0] = [false, false, false]; if (m.id === 'rocket') st.drops[1] = [false, false, false]; if (m.id === 'lanes') T.lanes.forEach((l) => (l.lit = false));
    snd('accept'); pts(10000); say('Mission accepted: ' + m.name, 2.4, true); say(m.desc, 3);
  }

  /* ---------- physics ---------- */
  function hitSeg(b, s) {
    const ax = s.a.x, ay = s.a.y, dx = s.b.x - ax, dy = s.b.y - ay, l2 = dx * dx + dy * dy;
    const u = clamp(((b.x - ax) * dx + (b.y - ay) * dy) / l2, 0, 1), qx = ax + u * dx, qy = ay + u * dy;
    let nx = b.x - qx, ny = b.y - qy; const d = Math.hypot(nx, ny), RR = R + s.t; if (d >= RR || d === 0) return 0;
    nx /= d; ny /= d; b.x += nx * (RR - d); b.y += ny * (RR - d);
    const vn = b.vx * nx + b.vy * ny; if (vn >= 0) return 0;
    b.vx -= (1 + s.e) * vn * nx; b.vy -= (1 + s.e) * vn * ny; s._n = [nx, ny]; return -vn;
  }
  function hitFlip(b, f, dt) {
    const tip = flipTip(f), prev = f.prev || tip, tvx = (tip.x - prev.x) / dt, tvy = (tip.y - prev.y) / dt;
    const ax = f.p.x, ay = f.p.y, dx = tip.x - ax, dy = tip.y - ay, l2 = dx * dx + dy * dy;
    const u = clamp(((b.x - ax) * dx + (b.y - ay) * dy) / l2, 0, 1), qx = ax + u * dx, qy = ay + u * dy, th = 8 - 3 * u;
    let nx = b.x - qx, ny = b.y - qy; const d = Math.hypot(nx, ny), RR = R + th; if (d >= RR || d === 0) return;
    nx /= d; ny /= d; b.x += nx * (RR - d); b.y += ny * (RR - d);
    const cvx = tvx * u, cvy = tvy * u, rvx = b.vx - cvx, rvy = b.vy - cvy, vn = rvx * nx + rvy * ny;
    if (vn < 0) { b.vx -= 1.35 * vn * nx; b.vy -= 1.35 * vn * ny; }
  }
  function startPath(b, key) {
    const P = PATHS[key], pts2 = [[b.x, b.y]].concat(P.pts.slice(1));
    b.path = Object.assign(mkPath(pts2, P.speed, P.exitV, P.kind, P.elev), { s: 0, i: 0 }); b.shooter = false; b.hyper = false; b.vx = b.vy = 0;
    if (key === 'ramp') { snd('rampUp'); pts(5000); }
    else if (key === 'orbit') { snd('orbit'); pts(5000); }
    else if (key === 'hyper') snd('hyper');
    else if (key === 'kick') { snd('kick'); st.stats.kicks++; }
  }
  function followPath(b, dt) {
    const p = b.path; p.s += p.speed * dt;
    if (p.s >= p.len) { const e = p.pts[p.pts.length - 1]; b.x = e[0]; b.y = e[1]; b.vx = p.exitV[0]; b.vy = p.exitV[1]; b.path = null; b.still = 0; b.ax = b.x; b.ay = b.y; b.at = 0; pathDone(b, p.kind); return; }
    while (p.i < p.pts.length - 2 && p.L[p.i + 1] < p.s) p.i++;
    const a = p.pts[p.i], c = p.pts[p.i + 1], u = (p.s - p.L[p.i]) / Math.max(1e-6, p.L[p.i + 1] - p.L[p.i]);
    b.x = a[0] + (c[0] - a[0]) * u; b.y = a[1] + (c[1] - a[1]) * u;
  }
  function pathDone(b, kind) {
    if (kind === 'ramp') {
      st.stats.ramps++; st.rampN++; const v = 15000 + 5000 * Math.min(6, st.rampN - 1); pts(v); snd('ramp'); floatTxt('SKYWAY +' + fmt(v), 300, 520); progress('ramp');
      if (st.mb && st.jpLit) { const j = st.jp; pts(j); st.stats.jackpots++; st.jpLit = false; say('JACKPOT! ' + fmt(j), 2.6, true); say('Sink the warp hole to relight the jackpot', 2.6); floatTxt('JACKPOT', 205, 330, '#ffd166'); snd('jackpot'); st.jp += 50000; burst(b.x, b.y, '#ffd166', 24); }
      else if (st.mbLit) startMultiball();
    } else if (kind === 'orbit') { st.stats.orbits++; pts(10000); snd('lane'); floatTxt('ORBIT +10,000', 90, 470, '#6fd3c7'); progress('orbit'); }
    else if (kind === 'hyper') {
      st.stats.hypers++; st.hyper++; const v = 20000 * st.hyper; pts(v); snd('skill'); say(`Hyperspace launch! Level ${st.hyper} +${fmt(v)}`, 2.4, true); floatTxt('HYPERSPACE', 90, 470, '#6fd3c7');
      if (st.hyper >= 5) { pts(250000); say('MAX HYPERSPACE +250,000', 2.6, true); st.hyper = 0; snd('jackpot'); }
    }
  }
  function startMultiball() { st.mbLit = false; st.mb = true; st.jpLit = true; st.stats.mbs++; st.ejectQ += 2; st.ejectT = 0.6; st.save = Math.max(st.save, 12); say('MULTIBALL!', 2.6, true); say('Shoot the Skyway ramp for the JACKPOT', 3); snd('mb'); floatTxt('MULTIBALL', 205, 330, '#f472b6'); }
  function kickSaucer(b) { const dir = Math.random() < 0.5 ? -1 : 1; b.vx = dir * (150 + Math.random() * 120); b.vy = 240 + Math.random() * 80; b.cool.W = st.time + 0.9; b.hold = 0; snd('kick'); burst(b.x, b.y, '#a78bfa', 10); }
  function onSegHit(b, s, imp) {
    if (s.kind === 'sling' && imp > 40) {
      const [nx, ny] = s._n; b.vx += nx * 340; b.vy += ny * 340; pts(110); snd('sling'); s.f = 0.15; burst(b.x, b.y, '#ffb347', 6);
    } else if (s.kind === 'drop' && imp > 60) {
      const bk = st.drops[s.bank]; bk[s.i] = true; pts(2500); snd('drop'); burst(b.x, b.y, s.bank ? '#ff5a52' : '#60a5fa', 8); progress(s.bank ? 'rocket' : 'boost');
      if (bk.every(Boolean)) {
        pts(25000); snd('bank');
        if (s.bank === 0) { st.kick = true; say('BOOST bank complete! Kickback lit', 2.2, true); }
        else { pts(25000); st.jp += 25000; say('ROCKET bank complete! +50,000', 2.2, true); }
        const bank = s.bank; later(1.6, () => { st.drops[bank] = [false, false, false]; });
      }
    } else if (s.kind === 'stand' && imp > 30) {
      s.f = 0.25; snd('stand'); pts(2000); burst(b.x, b.y, '#ffd166', 6);
      if (st.mis < 0) {
        st.mt[s.i] = true; st.sel = nextMission(st.sel);
        if (st.mt.every(Boolean)) acceptMission(); else say('Mission select: ' + MISSIONS[st.sel].name, 2);
      } else pts(3000);
    }
  }
  function sensors(b) {
    const t = st.time, cd = (k, s) => { if ((b.cool[k] || 0) > t) return false; b.cool[k] = t + s; return true; };
    if (b.y > 94 && b.y < 122) for (let i = 0; i < 4; i++) if (Math.abs(b.x - LANEX[i]) < 13 && cd('L' + i, 0.7)) laneHit(i);
    if (b.y > 596 && b.y < 616) for (let i = 0; i < 4; i++) if (Math.abs(b.x - SAVEX[i]) < 10 && cd('S' + i, 0.8)) saveLane(i);
    if (b.x < 47 && b.y > 684 && b.y < 716 && b.vy > 0 && st.kick && !st.tilted) { st.kick = false; b.x = 33; startPath(b, 'kick'); say('KICKBACK!', 1.5); return; }
    if (b.x > 126 && b.x < 158 && b.y > 262 && b.y < 300 && b.vy < -220) { startPath(b, 'ramp'); return; }
    if (b.x > 366 && b.x < 392 && b.y > 300 && b.y < 350 && b.vy < -220) { startPath(b, 'orbit'); return; }
    if (b.hyper && b.x > 396 && b.y > 250 && b.y < 310 && b.vy < 0) { startPath(b, 'hyper'); ballLive(); return; }
    if (b.x > 18 && b.x < 60 && (b.py - SPIN.y) * (b.y - SPIN.y) <= 0 && b.py !== b.y) { T.spin.v += clamp(-b.vy / 26, -42, 42); }
    const dx = b.x - SAUCER.x, dy = b.y - SAUCER.y;
    if (dx * dx + dy * dy < 100 && !(st.ejectQ > 0) && (b.cool.W || 0) < t && b.vx * b.vx + b.vy * b.vy < 520 * 520) {
      b.hold = 0.9; b.x = SAUCER.x; b.y = SAUCER.y; b.vx = b.vy = 0; st.stats.warps++; pts(7500); snd('warp'); burst(SAUCER.x, SAUCER.y, '#a78bfa', 14); floatTxt('WARP +7,500', SAUCER.x, SAUCER.y - 50, '#a78bfa'); progress('warp');
      if (st.mb && !st.jpLit) { st.jpLit = true; say('JACKPOT RELIT: shoot the ramp', 2.2, true); }
      if (st.xbLit && !st.tilted) { st.xbLit = false; st.extra++; say('EXTRA BALL!', 2.6, true); snd('xb'); floatTxt('EXTRA BALL', 205, 330, '#4ade80'); }
    }
  }
  function laneHit(i) {
    const ln = T.lanes[i]; ln.f = 0.3;
    if (st.skill >= 0) { if (i === st.skill && st.skillT > 0) { pts(75000); say('SKILL SHOT! +75,000', 2.4, true); snd('skill'); floatTxt('SKILL SHOT', LANEX[i], 150, '#ffd166'); } st.skill = -1; }
    if (!ln.lit) { ln.lit = true; pts(2500); snd('lane'); progress('lanes'); } else pts(500);
    if (T.lanes.every((l) => l.lit)) { st.mult = Math.min(5, st.mult + 1); pts(20000); say(`M·U·L·E complete! Bonus ${st.mult}X`, 2.2, true); snd('bank'); later(0.8, () => T.lanes.forEach((l) => (l.lit = false))); }
  }
  function saveLane(i) {
    if (st.sv[i]) { pts(500); return; } st.sv[i] = true; pts(3000); snd('lane');
    if (st.sv.every(Boolean)) { st.save = Math.max(st.save, 15); pts(15000); say('S·A·V·E complete! Ball save 15s', 2.2, true); snd('save'); later(1, () => { st.sv = [false, false, false, false]; }); }
  }
  function ballLive() { if (!st.started) { st.started = true; st.save = Math.max(st.save, 10); } }
  function moveBall(b, dt) {
    if (b.path) { followPath(b, dt); return; }
    if (b.hold > 0) { b.hold -= dt; b.x = SAUCER.x; b.y = SAUCER.y; b.vx = b.vy = 0; if (b.hold <= 0) kickSaucer(b); return; }
    b.px = b.x; b.py = b.y;
    b.vy += G * dt; const damp = 1 - 0.06 * dt; b.vx *= damp; b.vy *= damp; b.x += b.vx * dt; b.y += b.vy * dt;
    const sp = b.vx * b.vx + b.vy * b.vy; if (sp > 1900 * 1900) { const k = 1900 / Math.sqrt(sp); b.vx *= k; b.vy *= k; }
    if (b.shooter && b.x < 392 && b.y < 250) { b.shooter = false; b.hyper = false; ballLive(); }
    for (const s of T.segs) {
      if (!s.on || b.x < s.x0 || b.x > s.x1 || b.y < s.y0 || b.y > s.y1) continue; if (s.kind === 'drop' && st.drops[s.bank][s.i]) continue;
      const imp = hitSeg(b, s); if (imp) onSegHit(b, s, imp);
    }
    for (const bu of T.bumpers) {
      const dx = b.x - bu.x, dy = b.y - bu.y, d = Math.hypot(dx, dy), RR = R + bu.r;
      if (d < RR && d > 0) {
        const nx = dx / d, ny = dy / d; b.x = bu.x + nx * RR; b.y = bu.y + ny * RR; const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= 1.5 * vn * nx; b.vy -= 1.5 * vn * ny; }
        b.vx += nx * 300; b.vy += ny * 300; bu.f = 0.18; pts(bu.k ? 750 : 500); if (st.mb) st.jp += 2500; progress('bump'); snd(bu.k ? 'bump2' : 'bump'); burst(b.x, b.y, bu.k ? '#6fd3c7' : '#f472b6', 8);
      }
    }
    for (const f of T.flips) hitFlip(b, f, dt);
    sensors(b);
    if (b.y > H + 20) b.dead = true;
  }
  function step(dt) {
    for (const f of T.flips) {
      const want = !st.tilted && !st.between && (f.side ? keys.R : keys.L), target = want ? -0.45 : 0.5, sp = want ? 26 : 16;
      f.prev = flipTip(f); f.a += clamp(target - f.a, -sp * dt, sp * dt);
    }
    const bl = st.bl;
    for (const b of bl) moveBall(b, dt);
    for (let i = 0; i < bl.length; i++) for (let j = i + 1; j < bl.length; j++) {
      const a = bl[i], c = bl[j]; if (a.path || c.path || a.hold > 0 || c.hold > 0) continue;
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy); if (d >= 2 * R || d === 0) continue;
      const nx = dx / d, ny = dy / d, o = (2 * R - d) / 2; a.x -= nx * o; a.y -= ny * o; c.x += nx * o; c.y += ny * o;
      const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny; if (vn < 0) { const j2 = -0.95 * vn; a.vx -= j2 * nx; a.vy -= j2 * ny; c.vx += j2 * nx; c.vy += j2 * ny; }
    }
    if (bl.some((b) => b.dead)) { const dead = bl.filter((b) => b.dead); st.bl = bl.filter((b) => !b.dead); for (const b of dead) drainBall(b); }
  }
  function drainBall(b) {
    st.stats.drains++;
    if (st.save > 0 && !st.tilted) {
      st.stats.saves++; snd('save'); say('Ball saved!', 2, true);
      if (st.bl.length || st.mb) { st.ejectQ++; st.ejectT = Math.min(st.ejectT || 0.6, 0.6); }
      else { const nb = newBallObj(407, 760); nb.shooter = true; st.bl.push(nb); }
      return;
    }
    if (st.bl.length > 0 || st.ejectQ > 0) { if (st.bl.length + st.ejectQ === 1 && st.mb) { st.mb = false; say('Multiball over', 1.8); } return; }
    endOfBall();
  }
  function endOfBall() {
    snd('drain'); st.mb = false; st.between = true; const bonus = st.tilted ? 0 : st.bonus * st.mult;
    say(bonus ? `End of ball bonus ${fmt(st.bonus)} x ${st.mult}` : 'Ball lost', 2.2); floatTxt(bonus ? 'BONUS ' + fmt(bonus) : 'BALL LOST', 205, 560, '#ff8a3d');
    later(1.6, () => {
      if (!st.tilted) st.score += bonus;
      if (st.extra > 0) { st.extra--; say('SHOOT AGAIN!', 2.2, true); snd('xb'); startBall(); }
      else { st.ball++; if (st.ball > st.balls) gameOver(); else startBall(); }
    });
  }
  function gameOver() { st.msgs = []; st.msgT = 0; st.mode = 'over'; st.ball = st.balls; st.bl = []; st.between = false; saveHs(); snd('over'); say('GAME OVER', 4, true); }
  function saveHs() {
    if (st.hsDone) return; st.hsDone = true; const hs = (opts.hs || []).slice(); const isTop = !hs.length || st.score > hs[0].s;
    hs.push({ s: st.score, r: RANKS[st.rank], d: Date.now() }); hs.sort((a, b) => b.s - a.s); opts.hs = hs.slice(0, 5);
    if (isTop && st.score > 0) say('NEW HIGH SCORE!', 4, true);
    try { opts.onHs && opts.onHs(opts.hs); } catch (e) { /* ignore */ }
  }
  function launch() {
    const bs = st.bl.filter((b) => b.shooter && b.y > 700 && Math.abs(b.vy) < 60); if (!bs.length || st.between) { st.power = 0; return; }
    const pw = st.power; for (const b of bs) { b.vy = -(520 + 1280 * pw); b.hyper = pw >= 0.9; }
    if (pw < 0.9 && pw > 0.35) { st.skill = Math.floor(Math.random() * 4); st.skillT = 6; say('Skill shot: roll through the flashing lane', 2); }
    st.power = 0; snd('launch');
  }
  function nudge(dir) {
    if (st.mode !== 'play' || st.tilted) return; const now = st.time; st.nudges = st.nudges.filter((t) => now - t < 3.5); st.nudges.push(now); snd('nudge');
    for (const b of st.bl) if (!b.path && !(b.hold > 0) && !b.shooter) { b.vx += dir * 70; b.vy -= 50; }
    if (root && !simming) { root.classList.add('vpb-shake'); setTimeout(() => root && root.classList.remove('vpb-shake'), 160); }
    if (st.nudges.length >= 4) { st.tilted = true; snd('tilt'); say('TILT', 3, true); } else if (st.nudges.length === 3) say('DANGER!', 1.2, true);
  }

  /* ---------- per-frame update (shared by the real loop and the test simulator) ---------- */
  function update(dt) {
    if (st.paused) return;
    st.time += dt;
    for (let i = st.timers.length - 1; i >= 0; i--) { const tm = st.timers[i]; tm.t -= dt; if (tm.t <= 0) { st.timers.splice(i, 1); tm.fn(); } }
    if (st.mode === 'play') {
      T.cap.on = !st.bl.some((b) => b.shooter);
      const h = dt / SUB; for (let i = 0; i < SUB; i++) step(h);
      if (st.save > 0 && st.started && !st.between) st.save = Math.max(0, st.save - dt);
      if (st.skillT > 0) { st.skillT -= dt; if (st.skillT <= 0) st.skill = -1; }
      if (keys.P && st.bl.some((b) => b.shooter && b.y > 700)) st.power = Math.min(1, st.power + dt * 1.1);
      if (st.ejectQ > 0) { st.ejectT -= dt; if (st.ejectT <= 0) { st.ejectQ--; st.ejectT = 1.1; const nb = newBallObj(SAUCER.x, SAUCER.y); nb.hold = 0.35; st.bl.push(nb); snd('kick'); } }
      const sp = T.spin; if (Math.abs(sp.v) > 0.05) { const before = Math.floor(sp.a / Math.PI); sp.a += sp.v * dt; sp.v *= Math.exp(-1.5 * dt); const after = Math.floor(sp.a / Math.PI); if (after !== before) { pts(250); snd('spin'); progress('spin'); } }
      for (const b of st.bl) {
        if (!isFinite(b.x + b.y + b.vx + b.vy) || (!b.path && !(b.hold > 0) && (b.x < 12 || b.x > 426 || b.y < 22))) { st.stats.esc++; b.path = null; b.x = SAUCER.x; b.y = SAUCER.y; b.vx = b.vy = 0; b.hold = 0.5; continue; }
        if (b.path || b.hold > 0 || b.shooter) { b.still = 0; b.at = 0; b.ax = b.x; b.ay = b.y; continue; }
        if (Math.abs(b.vx) + Math.abs(b.vy) < 10 && b.y < 650) b.still += dt; else b.still = 0;
        if (b.still > 1.2) { b.vx += (b.x < 205 ? 1 : -1) * 140; b.vy -= 90; b.still = 0; st.stats.unstick++; }
        b.at += dt; if (Math.hypot(b.x - b.ax, b.y - b.ay) > 30) { b.ax = b.x; b.ay = b.y; b.at = 0; }
        else if (b.at > 5 && b.y < 650) { b.vx += (Math.random() - 0.5) * 300; b.vy -= 150; b.at = 0; st.stats.unstick++; }
        if (b.shooter === false && b.x > 396 && b.y > 600 && Math.abs(b.vy) < 30) b.shooter = true; // a ball that fell back into the shooter lane
      }
    }
    for (const bu of T.bumpers) bu.f = Math.max(0, bu.f - dt);
    for (const ln of T.lanes) ln.f = Math.max(0, ln.f - dt);
    for (const s of T.segs) if (s.f) s.f = Math.max(0, s.f - dt);
    if (!simming) {
      for (const p of st.parts) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; } st.parts = st.parts.filter((p) => p.t > 0);
      for (const f of st.floats) { f.t -= dt; f.y -= 22 * dt; } st.floats = st.floats.filter((f) => f.t > 0);
    }
    if (st.msgT > 0) st.msgT -= dt;
    if (st.msgT <= 0) { const m = st.msgs.shift(); if (m) { st.msg = m.m; st.msgHot = m.hot; st.msgT = m.s; } else { st.msg = ''; st.msgHot = false; } }
  }

  /* ---------- static art ---------- */
  function mkCanvas(w, h) { const k = scale * dpr, c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k)); const x = c.getContext('2d'); x.scale(k, k); return [c, x]; }
  function shade(hex, k) { const n = parseInt(hex.slice(1), 16); return `rgb(${((n >> 16) & 255) * k | 0},${((n >> 8) & 255) * k | 0},${(n & 255) * k | 0})`; }
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function insShape(c, n) {
    c.beginPath();
    if (n.sh === 'circ') c.arc(n.x, n.y, n.r, 0, TAU);
    else if (n.sh === 'rect') rrect(c, n.x - n.w / 2, n.y - n.h / 2, n.w, n.h, n.h / 2);
    else if (n.sh === 'dia') { c.moveTo(n.x, n.y - n.s); c.lineTo(n.x + n.s * 0.72, n.y); c.lineTo(n.x, n.y + n.s); c.lineTo(n.x - n.s * 0.72, n.y); c.closePath(); }
    else if (n.sh === 'wedge') { c.arc(n.cx, n.cy, n.r1, n.a0, n.a1); c.arc(n.cx, n.cy, n.r0, n.a1, n.a0, true); c.closePath(); }
    else {
      const fx = Math.cos(n.a), fy = Math.sin(n.a), s = n.s, P = (f, p) => [n.x + (fx * f - fy * p) * s, n.y + (fy * f + fx * p) * s];
      const q = n.sh === 'arrow' ? [P(1, 0), P(-0.75, 0.8), P(-0.35, 0), P(-0.75, -0.8)] : [P(0.55, 0), P(-0.45, 0.95), P(-0.45, 0.45), P(0.05, 0), P(-0.45, -0.45), P(-0.45, -0.95)];
      c.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) c.lineTo(q[i][0], q[i][1]); c.closePath();
    }
  }
  function drawInsert(c, n, lit) {
    const sz = n.r || n.s || Math.max(n.w || 0, n.h || 0) / 2 || 10;
    c.save();
    if (lit) {
      c.shadowColor = n.col; c.shadowBlur = 14; insShape(c, n); c.fillStyle = n.col; c.fill(); c.shadowBlur = 0;
      const g = c.createRadialGradient(n.x - sz * 0.2, n.y - sz * 0.25, 0, n.x, n.y, sz * 1.1); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.45, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      insShape(c, n); c.fillStyle = g; c.fill(); insShape(c, n); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.75)'; c.stroke();
    } else {
      insShape(c, n); c.fillStyle = shade(n.col, 0.3); c.fill();
      const g = c.createRadialGradient(n.x - sz * 0.35, n.y - sz * 0.4, 0, n.x, n.y, sz * 1.2); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      insShape(c, n); c.fillStyle = g; c.fill(); insShape(c, n); c.lineWidth = 1.2; c.strokeStyle = 'rgba(0,0,0,.75)'; c.stroke();
    }
    if (n.txt) { const fs = n.fs || 8; c.font = `800 ${fs}px ${FONT_B}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = lit ? '#1a0b02' : 'rgba(255,255,255,.5)'; c.fillText(n.txt, n.x, n.y + 0.5); }
    c.restore();
  }
  function drawMule(c, x, y, s, alpha) {
    c.save(); c.translate(x, y); c.scale(s, s); c.globalAlpha = alpha == null ? 1 : alpha;
    // suit collar
    c.fillStyle = '#d9dbe4'; rrect(c, -24, 24, 48, 16, 7); c.fill(); c.fillStyle = '#ff8a3d'; c.fillRect(-24, 30, 48, 4);
    // ears
    for (const sd of [-1, 1]) { c.save(); c.translate(sd * 11, -20); c.rotate(sd * 0.32); c.fillStyle = '#7a4a2c'; c.beginPath(); c.ellipse(0, 0, 6, 16, 0, 0, TAU); c.fill(); c.fillStyle = '#e8a184'; c.beginPath(); c.ellipse(0, 2, 3, 11, 0, 0, TAU); c.fill(); c.restore(); }
    // head
    c.fillStyle = '#93603f'; c.beginPath(); c.ellipse(0, 2, 15, 18, 0, 0, TAU); c.fill();
    c.fillStyle = '#3b2416'; c.beginPath(); c.moveTo(-6, -15); c.lineTo(-2, -22); c.lineTo(0, -15); c.lineTo(3, -22); c.lineTo(6, -14); c.closePath(); c.fill();
    c.fillStyle = '#dcb38c'; c.beginPath(); c.ellipse(0, 12, 11, 8.5, 0, 0, TAU); c.fill();
    c.fillStyle = '#5a3520'; c.beginPath(); c.arc(-4, 12, 1.6, 0, TAU); c.arc(4, 12, 1.6, 0, TAU); c.fill();
    c.strokeStyle = '#5a3520'; c.lineWidth = 1.3; c.beginPath(); c.arc(0, 15, 4, 0.3, Math.PI - 0.3); c.stroke();
    for (const sd of [-1, 1]) { c.fillStyle = '#fff'; c.beginPath(); c.arc(sd * 6, -3, 3.4, 0, TAU); c.fill(); c.fillStyle = '#120a06'; c.beginPath(); c.arc(sd * 6 + 0.6, -2.6, 1.8, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(sd * 6 + 1.2, -3.4, 0.6, 0, TAU); c.fill(); }
    // helmet bubble
    const g = c.createRadialGradient(-10, -14, 2, 0, 0, 34); g.addColorStop(0, 'rgba(200,235,255,.35)'); g.addColorStop(0.7, 'rgba(120,170,255,.10)'); g.addColorStop(1, 'rgba(120,170,255,.28)');
    c.fillStyle = g; c.beginPath(); c.arc(0, -2, 31, 0, TAU); c.fill(); c.strokeStyle = 'rgba(220,235,255,.85)'; c.lineWidth = 2.2; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.arc(0, -2, 25, -2.6, -1.9); c.stroke();
    c.restore();
  }
  function drawPlanet(c, x, y, r, col1, col2, ring) {
    c.save(); const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r); g.addColorStop(0, col1); g.addColorStop(1, col2);
    if (ring) { c.strokeStyle = 'rgba(255,209,102,.35)'; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y, r * 1.7, r * 0.42, -0.35, Math.PI, TAU); c.stroke(); }
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.globalAlpha = 0.25; c.strokeStyle = '#000'; c.lineWidth = r * 0.12; for (const k of [-0.35, 0.1, 0.45]) { c.beginPath(); c.ellipse(x, y + r * k, r * Math.sqrt(1 - k * k) * 0.95, r * 0.08, -0.2, 0, TAU); c.stroke(); } c.globalAlpha = 1;
    if (ring) { c.strokeStyle = 'rgba(255,209,102,.5)'; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y, r * 1.7, r * 0.42, -0.35, 0, Math.PI); c.stroke(); }
    c.restore();
  }
  function tableOutline(c) { c.beginPath(); c.moveTo(18, 830); c.lineTo(18, AYC); c.ellipse(AXC, AYC, ARX, ARY, 0, Math.PI, TAU); c.lineTo(420, 830); c.closePath(); }
  function strokeLine(c, s, w, col, ox = 0, oy = 0) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(s.a.x + ox, s.a.y + oy); c.lineTo(s.b.x + ox, s.b.y + oy); c.stroke(); }
  function post(c, x, y, r, col) { const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, 0.5, x, y, r); g.addColorStop(0, '#fff'); g.addColorStop(0.35, col); g.addColorStop(1, shade(col.length === 7 ? col : '#888888', 0.45)); c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.arc(x + 2, y + 3, r, 0, TAU); c.fill(); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function drawBg() {
    const [cvs, c] = mkCanvas(W, H); bg = cvs;
    // cabinet wood around the playfield
    const wg = c.createLinearGradient(0, 0, W, 0); wg.addColorStop(0, '#24140b'); wg.addColorStop(0.5, '#3a2213'); wg.addColorStop(1, '#1d1009'); c.fillStyle = wg; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.12; c.strokeStyle = '#000'; for (let x = 2; x < W; x += 5) { c.lineWidth = 0.6 + ((x * 7) % 3) * 0.4; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 6, H * 0.3, x - 6, H * 0.6, x + 3, H); c.stroke(); } c.globalAlpha = 1;
    // playfield
    c.save(); tableOutline(c); c.clip();
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1f1748'); g.addColorStop(0.45, '#150f36'); g.addColorStop(1, '#0b0820'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (const [x, y, r, col] of [[205, 400, 190, 'rgba(255,122,61,.16)'], [90, 250, 140, 'rgba(167,139,250,.18)'], [330, 300, 140, 'rgba(56,189,248,.14)'], [205, 640, 170, 'rgba(244,114,182,.12)'], [250, 120, 120, 'rgba(111,211,199,.10)']]) { const rg = c.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = rg; c.fillRect(0, 0, W, H); }
    let seed = 11; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 170; i++) { const x = 20 + rnd() * 400, y = 30 + rnd() * 760, a = 0.15 + rnd() * 0.6, s = rnd() < 0.1 ? 2 : 1.1; c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(x, y, s, s); }
    for (let i = 0; i < 9; i++) { const x = 30 + rnd() * 360, y = 60 + rnd() * 640; c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x + 5, y); c.moveTo(x, y - 5); c.lineTo(x, y + 5); c.stroke(); }
    // decals: planets, speed streaks
    drawPlanet(c, 292, 452, 22, '#7dd3fc', '#1e3a8a', true); drawPlanet(c, 300, 300, 12, '#fda4af', '#7f1d1d', false); drawPlanet(c, 260, 610, 11, '#fde68a', '#92400e', false);
    // shooter lane plate & orbit / spinner lane floors
    const lane = (x, y, w, h, col) => { const lg = c.createLinearGradient(x, 0, x + w, 0); lg.addColorStop(0, 'rgba(0,0,0,.35)'); lg.addColorStop(0.5, col); lg.addColorStop(1, 'rgba(0,0,0,.35)'); c.fillStyle = lg; c.fillRect(x, y, w, h); };
    lane(394, 240, 26, 560, 'rgba(255,138,61,.10)'); lane(364, 252, 30, 190, 'rgba(111,211,199,.12)'); lane(18, 232, 42, 190, 'rgba(167,139,250,.14)');
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.moveTo(18, 540); c.lineTo(48, 540); c.lineTo(48, 800); c.lineTo(18, 800); c.fill(); c.beginPath(); c.moveTo(362, 540); c.lineTo(394, 540); c.lineTo(394, 800); c.lineTo(362, 800); c.fill();
    for (let i = 0; i < 6; i++) { c.fillStyle = `rgba(255,138,61,${0.12 + i * 0.05})`; const y = 690 - i * 46; c.beginPath(); c.moveTo(400, y); c.lineTo(407, y - 9); c.lineTo(414, y); c.lineTo(414, y + 4); c.lineTo(407, y - 5); c.lineTo(400, y + 4); c.fill(); }
    // reactor: rings and rays behind the warp hole
    c.save(); c.translate(SAUCER.x, SAUCER.y);
    const rg = c.createRadialGradient(0, 0, 10, 0, 0, 70); rg.addColorStop(0, 'rgba(167,139,250,.35)'); rg.addColorStop(1, 'rgba(167,139,250,0)'); c.fillStyle = rg; c.beginPath(); c.arc(0, 0, 70, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; for (let i = 0; i < 32; i++) { const a = (i * TAU) / 32; c.beginPath(); c.moveTo(Math.cos(a) * 42, Math.sin(a) * 42); c.lineTo(Math.cos(a) * 64, Math.sin(a) * 64); c.stroke(); }
    for (const [r, a] of [[22, 0.5], [42, 0.4], [62, 0.2]]) { c.strokeStyle = `rgba(200,180,255,${a})`; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
    c.restore();
    // mule astronaut decal + title
    drawMule(c, 205, 598, 1.05, 0.9);
    c.save(); c.textAlign = 'center'; c.font = `800 15px ${FONT_D}`; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText('NIGHT RUN', 205, 660); const tg = c.createLinearGradient(0, 646, 0, 662); tg.addColorStop(0, '#ffd166'); tg.addColorStop(1, '#ff6a2a'); c.fillStyle = tg; c.fillText('NIGHT RUN', 205, 660); c.restore();
    // labels
    const lbl = (txt, x, y, rot, col, size) => { c.save(); c.translate(x, y); c.rotate(rot || 0); c.font = `800 ${size || 8}px ${FONT_B}`; c.textAlign = 'center'; c.fillStyle = col || 'rgba(255,255,255,.55)'; c.fillText(txt, 0, 0); c.restore(); };
    lbl('SKYWAY', 142, 324, 0, 'rgba(255,209,102,.8)', 7.5); lbl('ORBIT', 334, 476, -1.08, 'rgba(111,211,199,.85)', 7); lbl('HYPERSPACE', 51, 360, -Math.PI / 2, 'rgba(111,211,199,.7)', 6.5);
    lbl('BOOST', 132, 420, -0.45, 'rgba(96,165,250,.85)', 7); lbl('ROCKET', 340, 392, 0, 'rgba(255,90,82,.85)', 7); lbl('MISSION', 66, 160, -0.785, 'rgba(255,209,102,.8)', 7);
    lbl('WARP', SAUCER.x, SAUCER.y + 52, 0, 'rgba(244,114,182,.75)', 7); lbl('BONUS', 205, 532, 0, 'rgba(255,138,61,.7)', 6.5); lbl('RANK', SAUCER.x, SAUCER.y - 62, 0, 'rgba(255,209,102,.6)', 6.5);
    lbl('KICK', 33, 662, 0, 'rgba(255,90,82,.7)', 6);
    // unlit inserts
    for (const n of INS) if (!n.apron) drawInsert(c, n, false);
    // warp hole (saucer)
    c.save(); const sg = c.createRadialGradient(SAUCER.x, SAUCER.y, 2, SAUCER.x, SAUCER.y, 13); sg.addColorStop(0, '#000'); sg.addColorStop(0.7, '#160a2c'); sg.addColorStop(1, '#6d5bd0'); c.fillStyle = sg; c.beginPath(); c.arc(SAUCER.x, SAUCER.y, 13, 0, TAU); c.fill();
    c.strokeStyle = '#c9d2e3'; c.lineWidth = 2.5; c.beginPath(); c.arc(SAUCER.x, SAUCER.y, 14, 0, TAU); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.beginPath(); c.arc(SAUCER.x, SAUCER.y, 14, -2.6, -1.4); c.stroke(); c.restore();
    // bumper skirts
    for (const bu of T.bumpers) { c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.arc(bu.x + 3, bu.y + 5, bu.r + 5, 0, TAU); c.fill(); c.fillStyle = '#0d0b1a'; c.beginPath(); c.arc(bu.x, bu.y, bu.r + 5, 0, TAU); c.fill(); c.strokeStyle = '#aeb6c8'; c.lineWidth = 2; c.stroke(); for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; c.fillStyle = '#e8ecf5'; c.beginPath(); c.arc(bu.x + Math.cos(a) * (bu.r + 3), bu.y + Math.sin(a) * (bu.r + 3), 1, 0, TAU); c.fill(); } }
    c.restore();
    // wall shadows
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const s of T.segs) { if (s.st === 'none' || s.st === 'cap' || s.st === 'outer') continue; strokeLine(c, s, s.t * 2 + 5, 'rgba(0,0,0,.45)', 3, 5); }
    // outer rail (beveled metal band)
    const outer = () => { c.beginPath(); c.moveTo(18, 830); c.lineTo(18, AYC); c.ellipse(AXC, AYC, ARX, ARY, 0, Math.PI, TAU); c.lineTo(420, 830); };
    outer(); c.strokeStyle = '#0b0c10'; c.lineWidth = 13; c.stroke(); outer(); c.strokeStyle = '#4b5263'; c.lineWidth = 9; c.stroke(); outer(); c.strokeStyle = '#8f98ad'; c.lineWidth = 4.5; c.stroke();
    c.save(); c.translate(-0.8, -0.8); outer(); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.2; c.stroke(); c.restore();
    for (const s of T.segs) {
      if (s.st === 'rail' || s.st === 'metal') { strokeLine(c, s, s.t * 2 + 3, '#15171e'); strokeLine(c, s, s.t * 2 + 1, s.st === 'metal' ? '#b9c2d6' : '#7d869b'); strokeLine(c, s, 1.2, 'rgba(255,255,255,.85)', -0.6, -0.6); }
      else if (s.st === 'rubber') { strokeLine(c, s, s.t * 2 + 2, '#1b1b1b'); strokeLine(c, s, s.t * 2, '#ececec'); strokeLine(c, s, 1, '#fff', -0.5, -0.7); }
      else if (s.st === 'post') { strokeLine(c, s, 8, '#1a0d05'); strokeLine(c, s, 6, '#ff8a3d'); strokeLine(c, s, 1.5, 'rgba(255,240,220,.9)', -1, 0); }
    }
    // sling bodies (static rubber faces; the kicking face flashes dynamically)
    for (const s of T.segs) if (s.kind === 'sling') { strokeLine(c, s, 9, '#1b1b1b'); strokeLine(c, s, 7, '#e8e8e8'); }
    // posts at joints
    for (const [x, y] of [[48, 540], [123, 688], [362, 540], [287, 688], [60, 232], [60, 420], [54, 492], [364, 252], [364, 420], [356, 492], [80, 567], [117, 662], [80, 637], [330, 567], [293, 662], [330, 637], [122, 314], [162, 314]]) post(c, x, y, 4, '#ff5a52');
    for (const x of [149, 191, 233, 275, 317]) { post(c, x, 90, 4, '#ffd166'); post(c, x, 124, 4, '#ffd166'); }
    // drop target backing and standup bases
    for (const p of STAND) { c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.arc(p[0] - 6, p[1] - 6, 4, 0, TAU); c.fill(); }
    // flipper pivot plates and kickback
    for (const [x, y] of [[128, 700], [282, 700]]) { c.fillStyle = '#20232d'; c.beginPath(); c.arc(x, y, 12, 0, TAU); c.fill(); c.strokeStyle = '#7d869b'; c.lineWidth = 1.5; c.stroke(); }
    c.fillStyle = '#3a3f4d'; c.fillRect(24, 716, 18, 10); c.fillStyle = '#ff5a52'; c.fillRect(27, 712, 12, 5);
    c.restore();
  }
  function drawFg() {
    const [cvs, c] = mkCanvas(W, H); fg = cvs; c.lineCap = 'round'; c.lineJoin = 'round';
    // Skyway habitrail (elevated wire ramp)
    const P = PATHS.ramp.pts, side = (off) => { c.beginPath(); for (let i = 0; i < P.length; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, x = P[i][0] - (dy / l) * off, y = P[i][1] + (dx / l) * off; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); };
    c.save(); c.translate(7, 10); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 20; side(0); c.restore();
    c.save(); c.strokeStyle = 'rgba(255,209,102,.07)'; c.lineWidth = 16; side(0); c.restore();
    for (let i = 1; i < P.length - 1; i++) { const a = P[i - 1], b = P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l; c.strokeStyle = '#59627a'; c.lineWidth = 2; c.beginPath(); c.moveTo(P[i][0] + nx * 9, P[i][1] + ny * 9); c.lineTo(P[i][0] - nx * 9, P[i][1] - ny * 9); c.stroke(); }
    for (const off of [-8, 8]) { c.strokeStyle = '#2b3040'; c.lineWidth = 3.6; side(off); c.strokeStyle = '#b8c1d6'; c.lineWidth = 2.2; side(off); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 0.8; side(off - 0.6); }
    // ramp entrance flap (translucent plastic)
    c.save(); const fl = c.createLinearGradient(0, 256, 0, 284); fl.addColorStop(0, 'rgba(255,209,102,.75)'); fl.addColorStop(1, 'rgba(255,138,61,.35)'); c.fillStyle = fl; rrect(c, 120, 244, 44, 26, 6); c.fill(); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1; c.stroke(); c.font = `800 7px ${FONT_B}`; c.textAlign = 'center'; c.fillStyle = '#2a1405'; c.fillText('▲ SKYWAY', 142, 260); c.restore();
    // sling plastics
    for (const tri of [[[86, 584], [86, 632], [108, 650]], [[324, 584], [324, 632], [302, 650]]]) { c.save(); c.beginPath(); c.moveTo(...tri[0]); c.lineTo(...tri[1]); c.lineTo(...tri[2]); c.closePath(); const pg = c.createLinearGradient(tri[0][0], 584, tri[2][0], 650); pg.addColorStop(0, 'rgba(255,138,61,.75)'); pg.addColorStop(1, 'rgba(244,114,182,.6)'); c.fillStyle = pg; c.fill(); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1; c.stroke(); c.restore(); }
    // orbit lane cover and left lane cover plastics
    c.save(); c.fillStyle = 'rgba(111,211,199,.35)'; rrect(c, 366, 254, 26, 18, 5); c.fill(); c.fillStyle = 'rgba(167,139,250,.35)'; rrect(c, 20, 234, 38, 14, 5); c.fill(); c.restore();
    // apron
    c.save(); c.beginPath(); c.moveTo(16, 724); c.lineTo(108, 724); c.quadraticCurveTo(126, 728, 146, 748); c.lineTo(264, 748); c.quadraticCurveTo(284, 728, 302, 724); c.lineTo(396, 724); c.lineTo(396, H + 2); c.lineTo(16, H + 2); c.closePath();
    c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = 10; c.shadowOffsetY = -3; const ag = c.createLinearGradient(0, 724, 0, H); ag.addColorStop(0, '#3a3f4d'); ag.addColorStop(0.08, '#262a35'); ag.addColorStop(1, '#14161d'); c.fillStyle = ag; c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.strokeStyle = '#9aa3b8'; c.lineWidth = 1.5; c.stroke(); c.restore();
    c.save(); c.textAlign = 'center'; c.font = `800 9px ${FONT_D}`; const lg = c.createLinearGradient(0, 752, 0, 762); lg.addColorStop(0, '#ffd166'); lg.addColorStop(1, '#ff6a2a'); c.fillStyle = lg; c.fillText('VANMULE', 205, 762);
    c.font = `700 5.5px ${FONT_B}`; c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText('NIGHT RUN  •  SPACE PINBALL', 205, 793);
    c.textAlign = 'left'; c.fillStyle = 'rgba(255,255,255,.5)'; c.font = `700 5.6px ${FONT_B}`;
    ['HIT THE 3 MISSION TARGETS', 'TO SELECT A MISSION.', 'COMPLETE IT TO RANK UP.'].forEach((l, i) => c.fillText(l, 24, 742 + i * 8));
    c.textAlign = 'right'; ['REPLAY AT 1,000,000', 'RAMP LIGHTS MULTIBALL', 'WARP HOLE = EXTRA BALL'].forEach((l, i) => c.fillText(l, 390, 742 + i * 8)); c.restore();
    c.save(); c.translate(205, 776); c.fillStyle = 'rgba(0,0,0,.4)'; rrect(c, -50, -10, 100, 20, 9); c.fill(); c.restore();
    drawInsert(c, INS.find((n) => n.id === 'again'), false);
  }
  function mkSprites() {
    SPR = {};
    for (const n of INS) { const [cvs, c] = mkCanvas(n.bb.w, n.bb.h); c.translate(-n.bb.x, -n.bb.y); drawInsert(c, n, true); n.spr = cvs; }
    const cap = (r, col, lit) => {
      const p = 12, [cvs, c] = mkCanvas(2 * (r + p), 2 * (r + p)); c.translate(r + p, r + p);
      if (lit) { c.shadowColor = col; c.shadowBlur = 18; }
      const g = c.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r); g.addColorStop(0, lit ? '#ffffff' : shade(col, 1.0)); g.addColorStop(0.5, lit ? col : shade(col, 0.75)); g.addColorStop(1, shade(col, lit ? 0.7 : 0.35));
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.shadowBlur = 0;
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r * 0.62, 0, TAU); c.stroke();
      c.fillStyle = lit ? '#fff' : 'rgba(255,255,255,.75)'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.2 : r * 0.45; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.ellipse(-r * 0.35, -r * 0.5, r * 0.32, r * 0.16, -0.5, 0, TAU); c.fill();
      return cvs;
    };
    SPR.bump = [[cap(18, '#ff4fa3', false), cap(18, '#ff4fa3', true)], [cap(15, '#2dd4bf', false), cap(15, '#2dd4bf', true)]];
    const [bc, b] = mkCanvas(2 * R + 2, 2 * R + 2); b.translate(R + 1, R + 1); const g = b.createRadialGradient(-R * 0.35, -R * 0.4, 0.5, 0, 0, R); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#dfe4ee'); g.addColorStop(0.75, '#7b8395'); g.addColorStop(1, '#3a3f4d'); b.fillStyle = g; b.beginPath(); b.arc(0, 0, R, 0, TAU); b.fill();
    b.fillStyle = 'rgba(255,170,110,.35)'; b.beginPath(); b.ellipse(R * 0.2, R * 0.55, R * 0.55, R * 0.22, 0, 0, TAU); b.fill(); SPR.ball = bc;
  }
  function drawStatic() { if (!T) return; drawBg(); drawFg(); mkSprites(); }

  /* ---------- dynamic drawing ---------- */
  const LV = {};
  function computeLights(t) {
    for (const n of INS) LV[n.id] = 0;
    const blinkS = Math.sin(t * 6) > 0 ? 1 : 0.15, blinkF = Math.sin(t * 14) > 0 ? 1 : 0.1;
    if (st.mode !== 'play') { INS.forEach((n, i) => { const v = Math.sin(t * 4 - i * 0.5); LV[n.id] = v > 0.55 ? 1 : v > 0 ? 0.25 : 0; }); const k = Math.floor(t * 14) % 16; for (let i = 0; i < 16; i++) LV['ring' + i] = (i - k + 16) % 16 < 4 ? 1 : 0.05; return; }
    T.lanes.forEach((l, i) => { LV['lane' + i] = l.lit ? 1 : st.skill === i ? blinkF : 0; });
    if (st.mis >= 0) { const m = MISSIONS[st.mis], n = Math.floor((16 * st.prog) / m.goal); for (let i = 0; i < 16; i++) LV['ring' + i] = i < n ? 1 : i === n ? blinkS * 0.8 : 0; if (m.id === 'lanes') T.lanes.forEach((l, i) => { if (!l.lit) LV['lane' + i] = blinkS; }); }
    else { const k = Math.floor(t * 8) % 16; for (let i = 0; i < 16; i++) LV['ring' + i] = i === k || i === (k + 8) % 16 ? 0.7 : 0; }
    for (let i = 0; i < 8; i++) LV['rank' + i] = i < st.rank ? 1 : i === st.rank ? blinkS : 0;
    const sh = activeShots(), A = { ramp: 'arRamp', orbit: 'arOrbit', spin: 'arLane', warp: 'arWarp', boost: 'arBoost', rocket: 'arRocket', stand: 'arStand', bump: 'arBump' };
    for (const k in sh) if (A[k]) LV[A[k]] = blinkS;
    if (st.mb) { LV.insMB = 1; if (st.jpLit) { LV.arRamp = blinkF; LV.insJack = blinkF; } else LV.arWarp = blinkF; } else if (st.mbLit) { LV.arRamp = Math.max(LV.arRamp, blinkS); LV.insMB = blinkS; }
    if (st.xbLit) { LV.arWarp = Math.max(LV.arWarp, blinkS); LV.insXB = blinkS; }
    for (let i = 0; i < 4; i++) { LV['mult' + i] = st.mult >= i + 2 ? 1 : 0; LV['save' + i] = st.sv[i] ? 1 : 0; }
    const inShooter = st.bl.some((b) => b.shooter);
    for (let i = 0; i < 5; i++) LV['hyp' + i] = i < st.hyper ? 1 : inShooter && i === st.hyper ? blinkS : 0;
    LV.kick = st.kick ? 1 : 0;
    for (let i = 0; i < 3; i++) { LV['mt' + i] = st.mt[i] ? 1 : st.mis < 0 ? blinkS * 0.7 : 0; LV['bk0' + i] = st.drops[0][i] ? 1 : 0; LV['bk1' + i] = st.drops[1][i] ? 1 : 0; }
    LV.again = st.save > 0 && st.started ? (st.save < 3 ? blinkF : blinkS) : st.extra > 0 ? 1 : 0;
  }
  function drawBall(c, b, big) {
    const k = big ? 1.12 : 1, r = R * k;
    c.fillStyle = 'rgba(0,0,0,.42)'; c.beginPath(); c.ellipse(b.x + (big ? 8 : 3), b.y + (big ? 11 : 5), r, r * 0.85, 0, 0, TAU); c.fill();
    c.drawImage(SPR.ball, b.x - r - 1, b.y - r - 1, 2 * r + 2, 2 * r + 2);
  }
  function draw() {
    const c = ctx, t = performance.now() / 1000;
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(bg, 0, 0); c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0); c.lineCap = 'round';
    computeLights(t);
    for (const n of INS) { if (n.apron) continue; const a = LV[n.id]; if (a > 0.02) { c.globalAlpha = a; c.drawImage(n.spr, n.bb.x, n.bb.y, n.bb.w, n.bb.h); } } c.globalAlpha = 1;
    // spinner
    const sp = T.spin, sw = Math.abs(Math.cos(sp.a)); c.fillStyle = '#20232d'; c.fillRect(19, SPIN.y - 1.5, 40, 3);
    c.fillStyle = sw > 0.3 ? '#dfe6f5' : '#8f98ad'; c.fillRect(22, SPIN.y - 5 * sw - 0.5, 34, 10 * sw + 1); c.fillStyle = '#ff8a3d'; c.fillRect(22, SPIN.y - 1, 34, 2);
    // drop targets & standups & sling flashes
    for (const s of T.segs) {
      if (s.kind === 'drop') {
        const down = st.drops[s.bank][s.i], col = s.bank ? '#ff5a52' : '#60a5fa';
        if (down) { c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3; c.beginPath(); c.moveTo(s.a.x, s.a.y); c.lineTo(s.b.x, s.b.y); c.stroke(); continue; }
        c.lineCap = 'butt'; c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 9; c.beginPath(); c.moveTo(s.a.x + 2, s.a.y + 3); c.lineTo(s.b.x + 2, s.b.y + 3); c.stroke();
        c.strokeStyle = shade(col, 0.6); c.lineWidth = 8; c.beginPath(); c.moveTo(s.a.x, s.a.y); c.lineTo(s.b.x, s.b.y); c.stroke();
        c.strokeStyle = col; c.lineWidth = 4.5; c.beginPath(); c.moveTo(s.a.x - 0.8, s.a.y - 0.8); c.lineTo(s.b.x - 0.8, s.b.y - 0.8); c.stroke(); c.lineCap = 'round';
      } else if (s.kind === 'stand') {
        const on = s.f > 0 || st.mt[s.i]; c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 9; c.beginPath(); c.moveTo(s.a.x + 2, s.a.y + 3); c.lineTo(s.b.x + 2, s.b.y + 3); c.stroke();
        c.strokeStyle = on ? '#fff3c4' : '#d9a520'; c.lineWidth = 8; c.beginPath(); c.moveTo(s.a.x, s.a.y); c.lineTo(s.b.x, s.b.y); c.stroke(); c.strokeStyle = on ? '#ffd166' : '#8a6510'; c.lineWidth = 3; c.beginPath(); c.moveTo(s.a.x, s.a.y); c.lineTo(s.b.x, s.b.y); c.stroke();
      } else if (s.kind === 'sling' && s.f > 0) { c.strokeStyle = '#fff'; c.lineWidth = 7; c.beginPath(); c.moveTo(s.a.x, s.a.y); c.lineTo(s.b.x, s.b.y); c.stroke(); c.strokeStyle = 'rgba(255,179,71,.55)'; c.lineWidth = 14; c.stroke(); }
      else if (s.kind === 'cap' && s.on) { c.strokeStyle = '#ff8a3d'; c.lineWidth = 4; c.beginPath(); c.moveTo(s.a.x, s.a.y); c.lineTo(s.b.x, s.b.y); c.stroke(); }
    }
    // bumpers
    const attract = st.mode !== 'play';
    T.bumpers.forEach((bu, i) => { const lit = bu.f > 0 || (attract && Math.floor(t * 3) % 5 === i); const s = SPR.bump[bu.k][lit ? 1 : 0], r = bu.r + 12; c.drawImage(s, bu.x - r, bu.y - r, 2 * r, 2 * r); });
    // warp hole swirl
    const wf = st.bl.some((b) => b.hold > 0); for (let i = 0; i < 3; i++) { c.strokeStyle = `rgba(196,181,253,${(wf ? 0.95 : 0.55) - i * 0.15})`; c.lineWidth = 1.6; c.beginPath(); c.arc(SAUCER.x, SAUCER.y, 11 - i * 3, t * (3 + i) + i, t * (3 + i) + i + 3.6); c.stroke(); }
    // balls on the playfield
    for (const b of st.bl) if (!(b.path && b.path.elev)) drawBall(c, b, false);
    // flippers
    for (const f of T.flips) {
      const tip = flipTip(f), ang = Math.atan2(tip.y - f.p.y, tip.x - f.p.x), shape = (ox, oy) => { c.beginPath(); c.arc(f.p.x + ox, f.p.y + oy, 9, ang + Math.PI / 2, ang - Math.PI / 2); c.arc(tip.x + ox, tip.y + oy, 5, ang - Math.PI / 2, ang + Math.PI / 2); c.closePath(); };
      shape(3, 5); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill();
      shape(0, 0); const fgd = c.createLinearGradient(f.p.x, f.p.y - 9, f.p.x, f.p.y + 9); fgd.addColorStop(0, '#ffffff'); fgd.addColorStop(1, '#c9ccd6'); c.fillStyle = fgd; c.fill(); c.strokeStyle = '#ff5a2a'; c.lineWidth = 2.6; c.stroke();
      c.strokeStyle = 'rgba(255,138,61,.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(f.p.x, f.p.y); c.lineTo(tip.x, tip.y); c.stroke();
      c.fillStyle = '#3a3f4d'; c.beginPath(); c.arc(f.p.x, f.p.y, 3.2, 0, TAU); c.fill(); c.fillStyle = '#c9d2e3'; c.beginPath(); c.arc(f.p.x - 0.8, f.p.y - 0.8, 1.3, 0, TAU); c.fill();
    }
    // plunger
    const py = 772 + st.power * 24; c.strokeStyle = '#9aa3b8'; c.lineWidth = 1.4; c.beginPath(); for (let i = 0; i <= 8; i++) { const y = py + 4 + (i * (800 - py - 4)) / 8; c.lineTo(i % 2 ? 401 : 413, y); } c.stroke();
    c.fillStyle = '#c9d2e3'; c.fillRect(397, py - 2, 20, 5); c.fillStyle = '#ff8a3d'; c.fillRect(403, py + 3, 8, 30);
    // particles
    for (const p of st.parts) { c.globalAlpha = Math.min(1, p.t * 2); c.fillStyle = p.c; c.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); } c.globalAlpha = 1;
    // foreground (habitrail, plastics, apron) then apron light and ramp balls
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(fg, 0, 0); c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    const ag = INS.find((n) => n.id === 'again'); if (LV.again > 0.02) { c.globalAlpha = LV.again; c.drawImage(ag.spr, ag.bb.x, ag.bb.y, ag.bb.w, ag.bb.h); c.globalAlpha = 1; }
    for (const b of st.bl) if (b.path && b.path.elev) drawBall(c, b, true);
    if (st.power > 0 && st.mode === 'play') { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(398, 600, 18, 104); const pg = c.createLinearGradient(0, 700, 0, 600); pg.addColorStop(0, '#4ade80'); pg.addColorStop(0.85, '#ffd166'); pg.addColorStop(0.9, '#6fd3c7'); pg.addColorStop(1, '#a78bfa'); c.fillStyle = pg; c.fillRect(401, 702 - 100 * st.power, 12, 100 * st.power); c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.moveTo(398, 612); c.lineTo(416, 612); c.stroke(); }
    // floating award text
    c.textAlign = 'center'; c.font = `800 13px ${FONT_D}`; for (const f of st.floats) { c.globalAlpha = Math.min(1, f.t * 1.5); c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.75)'; c.strokeText(f.txt, f.x, f.y); c.fillStyle = f.col; c.fillText(f.txt, f.x, f.y); } c.globalAlpha = 1;
    if (st.mode === 'play' && !st.started && st.bl.some((b) => b.shooter)) { c.fillStyle = `rgba(255,209,102,${0.5 + 0.5 * Math.sin(t * 6)})`; c.font = `800 8px ${FONT_B}`; c.fillText('HOLD', 407, 585); c.fillText('SPACE', 407, 595); }
    if (st.mode !== 'play') {
      c.fillStyle = 'rgba(5,3,15,.55)'; rrect(c, 70, 330, 270, 112, 16); c.fill(); c.strokeStyle = 'rgba(255,138,61,.6)'; c.lineWidth = 1.5; c.stroke();
      c.font = `800 22px ${FONT_D}`; const tg = c.createLinearGradient(0, 350, 0, 380); tg.addColorStop(0, '#ffd166'); tg.addColorStop(1, '#ff6a2a'); c.fillStyle = tg; c.fillText(st.mode === 'over' ? 'GAME OVER' : 'NIGHT RUN', 205, 376);
      c.font = `700 12px ${FONT_B}`; c.fillStyle = `rgba(255,255,255,${0.6 + 0.4 * Math.sin(t * 5)})`; c.fillText('Press Space or click to play', 205, 404);
      if (st.mode === 'over') { c.font = `700 12px ${FONT_M}`; c.fillStyle = '#6fd3c7'; c.fillText('Score ' + fmt(st.score), 205, 426); }
    }
    if (st.tilted) { c.fillStyle = 'rgba(239,68,68,.88)'; c.font = `800 54px ${FONT_D}`; c.fillText('TILT', 205, 360); }
    if (st.paused) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = `800 30px ${FONT_D}`; c.fillText('PAUSED', 205, 360); c.font = `600 14px ${FONT_B}`; c.fillText('Press P or click to keep playing', 205, 390); }
  }

  /* ---------- side panel ---------- */
  function drawLogo() {
    if (!logoCv) return; const Wl = 320, Hl = 150, k = window.devicePixelRatio || 1; logoCv.width = Wl * k; logoCv.height = Hl * k; const c = logoCv.getContext('2d'); c.scale(k, k);
    const g = c.createLinearGradient(0, 0, 0, Hl); g.addColorStop(0, '#120b2e'); g.addColorStop(1, '#05040d'); c.fillStyle = g; c.fillRect(0, 0, Wl, Hl);
    for (const [x, y, r, col] of [[250, 40, 110, 'rgba(255,122,61,.22)'], [60, 120, 90, 'rgba(167,139,250,.25)']]) { const rg = c.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = rg; c.fillRect(0, 0, Wl, Hl); }
    let seed = 5; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280); for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.7})`; c.fillRect(rnd() * Wl, rnd() * Hl, 1.2, 1.2); }
    drawPlanet(c, 286, 120, 26, '#7dd3fc', '#1e3a8a', true);
    // rocket with the mule astronaut riding it
    c.save(); c.translate(70, 78); c.rotate(-0.5);
    const fl = c.createLinearGradient(-70, 0, -30, 0); fl.addColorStop(0, 'rgba(255,90,40,0)'); fl.addColorStop(0.6, 'rgba(255,170,60,.9)'); fl.addColorStop(1, '#fff6c8'); c.fillStyle = fl; c.beginPath(); c.moveTo(-34, -9); c.quadraticCurveTo(-80, 0, -34, 9); c.closePath(); c.fill();
    c.fillStyle = '#c1121f'; c.beginPath(); c.moveTo(-26, -10); c.lineTo(-40, -24); c.lineTo(-18, -12); c.closePath(); c.fill(); c.beginPath(); c.moveTo(-26, 10); c.lineTo(-40, 24); c.lineTo(-18, 12); c.closePath(); c.fill();
    const bgd = c.createLinearGradient(0, -14, 0, 14); bgd.addColorStop(0, '#ffd8a8'); bgd.addColorStop(0.5, '#ff8a3d'); bgd.addColorStop(1, '#a8430f'); c.fillStyle = bgd; c.beginPath(); c.moveTo(-34, -12); c.lineTo(18, -12); c.quadraticCurveTo(44, -8, 50, 0); c.quadraticCurveTo(44, 8, 18, 12); c.lineTo(-34, 12); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.stroke(); c.fillStyle = '#fff'; c.font = `800 8px ${FONT_D}`; c.textAlign = 'center'; c.fillText('VM', -14, 3);
    c.restore();
    drawMule(c, 86, 54, 0.78, 1);
    c.save(); c.textAlign = 'left';
    c.font = `700 11px ${FONT_D}`; c.fillStyle = '#6fd3c7'; c.shadowColor = 'rgba(111,211,199,.8)'; c.shadowBlur = 8; c.fillText('VANMULE', 136, 38); c.shadowBlur = 0;
    c.font = `800 34px ${FONT_D}`; const tg = c.createLinearGradient(0, 46, 0, 112); tg.addColorStop(0, '#fff3c4'); tg.addColorStop(0.35, '#ffd166'); tg.addColorStop(1, '#ff5a1f');
    for (const [txt, y] of [['NIGHT', 74], ['RUN', 110]]) { c.lineWidth = 6; c.strokeStyle = '#2a0e02'; c.strokeText(txt, 134, y); c.fillStyle = tg; c.fillText(txt, 134, y); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.5)'; c.strokeText(txt, 134, y - 0.5); }
    c.font = `700 9px ${FONT_B}`; c.fillStyle = 'rgba(255,255,255,.6)'; c.fillText('S P A C E   P I N B A L L', 136, 132); c.restore();
  }
  const PANEL_HTML = `<canvas class="vpb-logo" width="320" height="150"></canvas>
    <div class="vpb-disp"><div class="vpb-row1"><span data-f="ball">BALL 1</span><span data-f="player">PLAYER 1</span></div>
      <div class="vpb-score"><span class="g">88888888888</span><span class="v" data-f="score"></span></div>
      <div class="vpb-msg" data-f="msg"></div></div>
    <div class="vpb-card"><div class="vpb-h"><span>Mission</span><span class="vpb-rank" data-f="rank"></span></div><b data-f="mname"></b><span class="vpb-desc" data-f="mdesc"></span><div class="vpb-bar"><i data-f="mbar"></i></div></div>
    <div class="vpb-stats"><div><small>Bonus</small><b data-f="mult"></b></div><div><small>Extra</small><b data-f="extra"></b></div><div><small>Save</small><b data-f="save"></b></div><div><small>Replay</small><b data-f="replay"></b></div></div>
    <div class="vpb-btns"><button class="btn small pri" data-pb="new">New game</button><button class="btn small sec" data-pb="pause">Pause</button><button class="btn small sec" data-pb="sound"></button></div>
    <details class="vpb-box" open><summary>High scores</summary><ol data-f="hs"></ol></details>
    <details class="vpb-box"><summary>How to play</summary>
      <p><kbd>Z</kbd>/<kbd>←</kbd> left flipper · <kbd>/</kbd>/<kbd>→</kbd> right flipper · hold <kbd>Space</kbd>/<kbd>↓</kbd> to pull the plunger. <kbd>X</kbd>/<kbd>.</kbd> nudge (too much = TILT) · <kbd>P</kbd> pause · <kbd>F2</kbd> new game. Mouse: click the left or right half of the table.</p>
      <p>Hit the 3 yellow <b>mission targets</b> (upper left) to pick a mission; the flashing arrows show the shot that advances it. Each mission promotes your rank and lights rewards: kickback, <b>multiball</b> (shoot the Skyway ramp, then the ramp scores the jackpot) and <b>extra balls</b> (warp hole).</p>
      <p>A full plunger pull is a <b>hyperspace launch</b>; a softer pull is a <b>skill shot</b> into the flashing M·U·L·E lane. M·U·L·E lanes raise the bonus multiplier (flippers move the lit lanes); S·A·V·E lanes re-light ball save.</p></details>`;
  const pf = {};
  function setF(k, v, html) { const e = pf[k]; if (!e || e._v === v) return; e._v = v; if (html === 'bar') e.style.width = v + '%'; else if (html) e.innerHTML = v; else e.textContent = v; }
  function renderPanel() {
    if (!panel) return; const t = performance.now() / 1000;
    setF('ball', st.mode === 'play' ? 'BALL ' + Math.min(st.ball, st.balls) + (st.extra ? ' +' + st.extra : '') : st.mode === 'over' ? 'GAME OVER' : 'INSERT MULE');
    setF('player', st.mb ? 'MULTIBALL' : st.tilted ? 'TILT' : 'PLAYER 1');
    setF('score', String(st.score).padStart(11, ' '));
    let msg = st.msg, hot = st.msgHot;
    if (!msg) {
      if (st.mode === 'attract') { const ph = Math.floor(t / 2.6) % 3, best = (opts.hs || [])[0]; msg = ph === 0 ? 'VanMule Night Run' : ph === 1 ? 'Press Space to start a game' : best ? 'High score ' + fmt(best.s) : 'Become a Legend Mule'; }
      else if (st.mode === 'over') msg = Math.floor(t / 2.6) % 2 ? 'Press Space to play again' : 'Game over · ' + fmt(st.score);
      else if (st.tilted) msg = 'TILT - ball lost';
      else if (st.bl.some((b) => b.shooter) && !st.started) msg = 'Pull the plunger · full pull = hyperspace launch';
      else if (st.mb) msg = st.jpLit ? 'Multiball! Ramp = jackpot ' + fmt(st.jp) : 'Multiball! Warp hole relights jackpot';
      else if (st.xbLit && Math.floor(t / 2.5) % 2) msg = 'Extra ball available · shoot the warp hole';
      else if (st.mbLit && Math.floor(t / 2.5) % 2) msg = 'Multiball lit · shoot the Skyway ramp';
      else if (st.mis < 0) msg = Math.floor(t / 2.5) % 2 && st.mt.some(Boolean) ? 'Mission select: ' + MISSIONS[st.sel].name : 'Hit mission targets to select mission';
      else { const m = MISSIONS[st.mis]; msg = m.name + ' · ' + st.prog + ' / ' + m.goal; }
    }
    setF('msg', msg); if (pf.msg) pf.msg.classList.toggle('hot', !!hot);
    setF('rank', RANKS[st.rank]);
    if (st.mode === 'play' && st.mis >= 0) { const m = MISSIONS[st.mis]; setF('mname', m.name); setF('mdesc', m.id === 'tour' ? m.desc + ' (' + ['ramp', 'orbit', 'warp'].filter((k) => !st.tour[k]).join(', ') + ' left)' : m.desc); setF('mbar', Math.round((100 * st.prog) / m.goal), 'bar'); }
    else if (st.mode === 'play') { setF('mname', 'No mission selected'); setF('mdesc', 'Hit the 3 yellow mission targets (upper left). Next up: ' + MISSIONS[st.sel].name + '.'); setF('mbar', Math.round((100 * st.mt.filter(Boolean).length) / 3), 'bar'); }
    else { setF('mname', st.mode === 'over' ? 'Final rank: ' + RANKS[st.rank] : 'Ready for launch'); setF('mdesc', 'Complete missions to climb from Cadet to Legend.'); setF('mbar', 0, 'bar'); }
    setF('mult', st.mult + 'X'); setF('extra', String(st.extra)); setF('save', st.save > 0 && st.started ? Math.ceil(st.save) + 's' : st.kick ? 'Kick' : '—'); setF('replay', st.replayGot ? 'Got it' : '1M');
    setF('hs', (opts.hs || []).map((h, i) => `<li><span>${i + 1}.</span><b>${fmt(h.s)}</b><small>${escapeHtml(h.r || '')}</small></li>`).join('') || '<li class="vpb-dim">No scores yet</li>', true);
    const pb = panel.querySelector('[data-pb="pause"]'); if (pb) { const v = st.paused ? 'Resume' : 'Pause'; if (pb.textContent !== v) pb.textContent = v; }
    const sb = panel.querySelector('[data-pb="sound"]'); if (sb) { const v = vol ? '🔊 Sound' : '🔇 Muted'; if (sb.textContent !== v) sb.textContent = v; }
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CSS = `.vpb-wrap{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;margin-bottom:40px}
.vpb-table{flex:0 0 auto;max-width:100%;padding:9px;border-radius:18px;background:linear-gradient(150deg,#4a3324,#1a110b 45%,#2e1f15);box-shadow:0 18px 50px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.12),inset 0 -2px 0 rgba(0,0,0,.5)}
.vpb-cv{display:block;border-radius:10px;outline:none;touch-action:none;cursor:pointer;box-shadow:0 0 0 2px #0b0806}
.vpb-shake .vpb-cv{transform:translate(3px,-2px)}
.vpb-panel{flex:1;min-width:270px;max-width:350px;display:flex;flex-direction:column;gap:10px}
.vpb-logo{display:block;width:100%;height:auto;aspect-ratio:32/15;border-radius:12px;border:2px solid #2c2140;box-shadow:0 8px 24px rgba(0,0,0,.45)}
.vpb-disp{background:#060403;border:2px solid #2b211a;border-radius:10px;padding:9px 12px 10px;box-shadow:inset 0 0 22px rgba(0,0,0,.95),0 0 0 1px #000;background-image:radial-gradient(rgba(255,255,255,.035) 1px,transparent 1.3px);background-size:3px 3px}
.vpb-row1{display:flex;justify-content:space-between;font-family:var(--mono,monospace);font-size:12px;font-weight:700;color:#ff9a4d;text-shadow:0 0 6px rgba(255,138,61,.85);letter-spacing:.14em}
.vpb-score{position:relative;font-family:var(--mono,monospace);font-weight:700;font-size:31px;line-height:1.15;text-align:right;letter-spacing:.04em;margin:3px 0 6px;white-space:pre}
.vpb-score .g{color:rgba(255,138,61,.07)}.vpb-score .v{position:absolute;right:0;top:0;color:#ffb347;text-shadow:0 0 10px rgba(255,138,61,.9),0 0 2px rgba(255,255,255,.4)}
.vpb-msg{font-family:var(--mono,monospace);font-weight:700;font-size:12.5px;line-height:1.4;min-height:2.8em;color:#6fd3c7;text-shadow:0 0 8px rgba(111,211,199,.85);text-transform:uppercase;letter-spacing:.07em;border-top:1px dashed #2a2622;padding-top:6px}
.vpb-msg.hot{color:#ffd166;text-shadow:0 0 10px rgba(255,209,102,.95);animation:vpbBlink .45s steps(2) infinite}
@keyframes vpbBlink{50%{opacity:.55}}
.vpb-card,.vpb-stats>div,.vpb-box{background:var(--panel,#1a1614);border:1px solid var(--line,#332d28);border-radius:10px;padding:8px 10px}
.vpb-h{display:flex;justify-content:space-between;align-items:center;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim,#6f655c);font-weight:700}
.vpb-rank{color:#ffd166;font-family:var(--mono,monospace);letter-spacing:.04em}
.vpb-card b{display:block;font-size:15px;margin-top:2px}.vpb-desc{color:var(--muted,#a3968a);font-size:12.5px;line-height:1.35;display:block}
.vpb-bar{height:6px;border-radius:99px;background:var(--panel2,#24201c);margin-top:7px;overflow:hidden}.vpb-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff8a3d,#ffd166);transition:width .3s}
.vpb-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.vpb-stats small{display:block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim,#6f655c);font-weight:700}.vpb-stats b{font-family:var(--mono,monospace);font-size:14px}
.vpb-btns{display:flex;gap:8px;flex-wrap:wrap}
.vpb-box summary{cursor:pointer;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim,#6f655c);font-weight:700}
.vpb-box ol{margin:4px 0 0;padding:0;list-style:none}.vpb-box li{display:flex;gap:8px;align-items:baseline;padding:2px 0}.vpb-box li b{font-family:var(--mono,monospace)}.vpb-box li small{color:var(--muted,#a3968a);font-size:12px;margin-left:auto}.vpb-dim{color:var(--muted,#a3968a)}
.vpb-box p{margin:6px 0;font-size:12.5px;color:var(--muted,#a3968a);line-height:1.45}.vpb-box kbd{font-family:var(--mono,monospace);font-size:11px;background:var(--panel2,#24201c);border:1px solid var(--line,#332d28);border-radius:4px;padding:0 4px;color:var(--fg,#eee)}`;

  /* ---------- loop, input, mount ---------- */
  function frame(now) {
    if (!root || !document.body.contains(root)) { unmount(); return; }
    if (document.hidden || root.offsetParent === null) { // not visible: no drawing, just peek twice a second
      keys.L = keys.R = keys.P = false; if (st && st.mode === 'play' && st.bl.some((b) => !b.shooter)) st.paused = true; raf = 0; last = 0;
      idleT = setTimeout(() => { idleT = 0; raf = requestAnimationFrame(frame); }, 500); return;
    }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, (now - (last || now)) / 1000); last = now;
    update(dt); draw();
    renderPanel.t = (renderPanel.t || 0) + dt; if (renderPanel.t > 0.1) { renderPanel.t = 0; renderPanel(); }
  }
  function fit() {
    if (!root || !cv) return; const wrap = cv.parentElement, top = wrap.getBoundingClientRect().top + (window.scrollY || 0) * 0;
    const hAvail = Math.max(420, Math.min(window.innerHeight - top - 60, 1000)), rw = root.clientWidth || 800, wAvail = Math.max(280, (rw > 900 ? rw - 380 : rw) - 20);
    scale = Math.min(hAvail / H, wAvail / W); dpr = window.devicePixelRatio || 1;
    cv.style.width = Math.round(W * scale) + 'px'; cv.style.height = Math.round(H * scale) + 'px'; cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr); drawStatic();
  }
  const KL = ['KeyZ', 'ArrowLeft', 'ShiftLeft'], KR = ['Slash', 'ArrowRight', 'ShiftRight'], KP = ['Space', 'ArrowDown', 'Enter'];
  function flipKey(side, down) { if (down && !keys[side] && st.mode === 'play' && !st.tilted) { snd('flip'); laneShift(side === 'L' ? -1 : 1); } keys[side] = down; }
  function onKey(e) {
    if (!root || !document.body.contains(root) || root.offsetParent === null) return;
    const tag = (e.target && e.target.tagName) || ''; if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    const down = e.type === 'keydown', c = e.code; let used = true;
    if (KL.includes(c)) { if (!e.repeat || !down) flipKey('L', down); }
    else if (KR.includes(c)) { if (!e.repeat || !down) flipKey('R', down); }
    else if (KP.includes(c)) { if (st.mode !== 'play') { if (down && !e.repeat) newGame(); } else { if (!down && keys.P) launch(); keys.P = down; } }
    else if (down && (c === 'KeyX' || c === 'ArrowUp')) nudge(1);
    else if (down && c === 'Period') nudge(-1);
    else if (down && c === 'KeyP') st.paused = !st.paused;
    else if (down && c === 'F2') newGame();
    else used = false;
    if (used) e.preventDefault();
  }
  function laneShift(d) { if (st.mode !== 'play' || !T) return; const l = T.lanes.map((x) => x.lit); T.lanes.forEach((x, i) => (x.lit = l[(i - d + 4) % 4])); }
  function onPointer(e) {
    if (e.type === 'pointerdown' && e.target !== cv) return; if (e.target === cv) e.preventDefault();
    if (e.type === 'pointerdown') {
      if (st.paused) { st.paused = false; return; }
      if (st.mode !== 'play') { newGame(); return; }
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
      if (st.bl.some((b) => b.shooter) && x > r.width * 0.86) { keys.P = true; return; }
      flipKey(x < r.width * 0.5 ? 'L' : 'R', true);
    } else { if (keys.P) { launch(); keys.P = false; } keys.L = keys.R = false; }
  }
  function onClick(e) {
    const b = e.target.closest && e.target.closest('[data-pb]'); if (!b || !panel || !panel.contains(b)) return; const k = b.dataset.pb;
    if (k === 'new') newGame(); if (k === 'pause' && st.mode === 'play') st.paused = !st.paused;
    if (k === 'sound') { vol = vol ? 0 : 0.5; try { opts.onVol && opts.onVol(vol); } catch (er) { /* ignore */ } }
    renderPanel(); b.blur();
  }
  function onBlur() { keys.L = keys.R = keys.P = false; if (st && st.mode === 'play' && st.bl.some((b) => !b.shooter)) st.paused = true; }
  function mount(el, o) {
    unmount(); opts = Object.assign({}, o || {}); vol = opts.vol != null ? opts.vol : 0.5; root = el;
    if (!document.getElementById('ag-pinball-css')) { const s = document.createElement('style'); s.id = 'ag-pinball-css'; s.textContent = CSS; document.head.appendChild(s); }
    el.innerHTML = `<div class="vpb-wrap"><div class="vpb-table"><canvas class="vpb-cv" tabindex="0" aria-label="Pinball table"></canvas></div><div class="vpb-panel">${PANEL_HTML}</div></div>`;
    cv = el.querySelector('.vpb-cv'); ctx = cv.getContext('2d'); panel = el.querySelector('.vpb-panel'); logoCv = el.querySelector('.vpb-logo');
    for (const k in pf) delete pf[k]; panel.querySelectorAll('[data-f]').forEach((e) => (pf[e.dataset.f] = e));
    T = buildTable(); INS = buildInserts(); st = blankState('attract'); fit(); drawLogo(); renderPanel();
    try { if (document.fonts && document.fonts.load) Promise.all([document.fonts.load(`800 20px ${FONT_D}`), document.fonts.load(`700 20px ${FONT_D}`), document.fonts.load(`800 10px ${FONT_B}`), document.fonts.load(`700 10px ${FONT_M}`)]).then(() => { if (root === el && cv) { drawStatic(); drawLogo(); } }, () => {}); } catch (e) { /* ignore */ }
    window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true); window.addEventListener('resize', fit);
    cv.addEventListener('pointerdown', onPointer); window.addEventListener('pointerup', onPointer); el.addEventListener('click', onClick); window.addEventListener('blur', onBlur);
    last = 0; raf = requestAnimationFrame(frame); setTimeout(() => cv && cv.focus(), 50);
  }
  function unmount() {
    cancelAnimationFrame(raf); raf = 0; clearTimeout(idleT); idleT = 0;
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true); window.removeEventListener('resize', fit); window.removeEventListener('pointerup', onPointer); window.removeEventListener('blur', onBlur);
    if (root) { root.removeEventListener('click', onClick); root.classList.remove('vpb-shake'); root.innerHTML = ''; } if (cv) cv.removeEventListener('pointerdown', onPointer);
    if (AC) { try { AC.close(); } catch (e) { /* ignore */ } AC = null; NB = null; }
    keys.L = keys.R = keys.P = false; root = cv = ctx = panel = logoCv = null; bg = fg = null; SPR = {};
  }
  /* fast headless simulation used by tests: runs the game logic at 60 Hz without drawing; bot(state, table) may press keys */
  function sim(seconds, bot) { simming = true; try { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) { if (bot) bot(st, T, i); update(1 / 60); } } finally { simming = false; } return st; }
  window.VanPinball = { mount, unmount, get state() { return st; }, get table() { return T; }, _keys: keys, _sim: sim, _paths: PATHS, refit: () => fit(),
    press: (k, d) => { if (!st) return; if (st.mode !== 'play') { if (d && k === 'P') newGame(); return; } if (k === 'L' || k === 'R') { flipKey(k, d); return; } if (k === 'P' && !d && keys.P) launch(); keys[k] = d; } };
})();
/* Arcade adapter */
(function () {
  const P = window.VanPinball; window.VanArcade = window.VanArcade || {};
  window.VanArcade.pinball = {
    mount(el, api) { P.mount(el, { hs: api.load('hs') || [], vol: api.sound ? (api.load('vol') ?? 0.5) : 0, onHs: (h) => { api.save('hs', h); if (h[0]) api.save('best', h[0].s.toLocaleString()); }, onVol: (v) => api.save('vol', v) }); },
    unmount() { P.unmount(); },
  };
})();
