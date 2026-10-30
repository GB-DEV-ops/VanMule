/* VanMule Arcade: Blob Hoops. Standalone; no imports, no network. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  /* ===================== Blob Hoops ===================== */
  var ID = 'blobhoops', TITLE = 'Blob Hoops', TITLE_HTML = 'Blob <b>Hoops</b>';
  var HOW = 'Bump the ball through the hoop on the right. Move ←/→ (A/D), jump ↑ (W). P or Esc pauses.';
  var SUB = 'Bounce it in from above. Touch it from beyond the arc for three.';
  var START_LABEL = 'Tip off';
  var TIPS = [
    'Baskets only count when the ball drops through the rim from above.',
    'Your last touch decides the value: hit it from beyond the dashed 3-point line on the far side for <b>3 points</b>.',
    'Nothing but net — a shot that touches no rim or board is a <b>swish</b>.',
    'A jump into a falling ball launches it high; get under it and nudge it with the side of your dome to aim the arc.',
    'Shots off the backboard can still drop in. Shots into your own hoop count for the other side!',
    'Defend by getting under the ball before it reaches your hoop — any touch resets the shot value.'
  ];
  var W = 1000, H = 520, GROUND = 452, R = 46, BR = 13;
  var SPEED = 350, JUMP = 660, BLOB_G = 1900, BALL_G = 900, VMAX = 1000;
  var E_BLOB = 0.86, GROUND_E = 0.74, WALL_E = 0.7, ROLL = 0.997;
  var BOARD = 10, WALL_L = BOARD, WALL_R = W - BOARD;
  var RIMY = GROUND - 215, RC = 4, RIM_GAP = 76;
  var HOOPS = [
    { back: BOARD + RC, front: BOARD + RC + RIM_GAP },
    { back: W - BOARD - RC, front: W - BOARD - RC - RIM_GAP }
  ];
  HOOPS.forEach(function (h) { h.cx = (h.back + h.front) / 2; h.lo = Math.min(h.back, h.front); h.hi = Math.max(h.back, h.front); });
  var THREE_D = 400;
  var THREE_X = [HOOPS[0].cx + THREE_D, HOOPS[1].cx - THREE_D]; // line in front of hoop 0 / hoop 1
  var START_X = [W * 0.3, W * 0.7], DROP_Y = 170;
  var READY_T = 0.9, GOAL_T = 1.9;
  var LENS = [['11', 'To 11'], ['21', 'To 21'], ['t3', '3 min']], DEFAULT_LEN = '21';
  var GOLDEN_TEXT = 'SUDDEN DEATH', GOLDEN_SUB = 'Next basket wins', GOLDEN_SHORT = 'SUDDEN DEATH';

  function CONSTS() { return { W: W, H: H, GROUND: GROUND, R: R, BR: BR, RIMY: RIMY, HOOPS: HOOPS, THREE_X: THREE_X }; }
  function matchSetup(len) { return len === 't3' ? { time: 180 } : { target: +len || 21 }; }
  function nextDrop(scorer) { S.possess = 1 - scorer; return START_X[1 - scorer]; }

  // optional core hooks (unused by this game)
  function firstDrop() { return W / 2; }
  function blobRange() { return [R, W - R]; }
  function predStatic() {}
  function extraRows() { return ''; }
  function loadOpts() {}
  function aiErrX(i, e) { return e; }
  var DRAWS = true;
  var PLAN_DT = 1 / 60, PLAN_N = 150, PLAN_OV = 0.97, AIR_AWARE = false;
  // check ball: the defending blob must give the possessing side room until they've touched it
  function checkActive() {
    if (S.possess < 0) return false;
    if (S.phase === 'goal' || S.ball.last === S.possess || (S.phase === 'live' && S.phaseT > 1.6)) { S.possess = -1; return false; }
    return true;
  }
  function readyClamp(b) {
    if (b.i === S.possess || !checkActive()) return;
    if (b.i === 0) b.x = Math.min(b.x, S.hold.x - 230); else b.x = Math.max(b.x, S.hold.x + 230);
  }

  // team 0 attacks hoop 1 (right); team 1 attacks hoop 0 (left)
  function isThree(team, x) { return team === 0 ? x < THREE_X[1] : x > THREE_X[0]; }

  function checkScore() {
    var B = S.ball;
    for (var h = 0; h < 2; h++) {
      var hp = HOOPS[h], inX = B.x > hp.lo && B.x < hp.hi;
      if (B.py >= RIMY && B.y < RIMY && B.vy < 0 && inX) B.up = h;      // came up through: doesn't count
      if (B.py < RIMY && B.y >= RIMY && B.vy > 0 && inX) {
        if (B.up === h) { B.up = -1; continue; }
        var team = 1 - h, three = B.last === team && isThree(team, B.lastX), pts = three ? 3 : 2;
        var who = S.mode === 'cpu' ? (team === 0 ? 'You' : 'Computer') : (team === 0 ? 'Ember' : 'Teal');
        var title = B.clean ? 'SWISH!' : three ? 'THREE!' : 'BUCKET!';
        var sub = '+' + pts + ' ' + who + (B.last === h ? ' (own basket)' : three && B.clean ? ' · from downtown' : '');
        S.net[h] = 1;
        B.vx *= 0.3; B.vy *= 0.5;
        if (B.clean) sfx('swish');
        scored(team, pts, title, sub);
        return;
      }
    }
    if (B.up >= 0 && (B.y > RIMY + 40 || B.x < HOOPS[B.up].lo - 40 || B.x > HOOPS[B.up].hi + 40)) B.up = -1;
  }
  function partLive() {}
  function partAI() {}
  function fallbackX(i, x) { return x; }
  function blobStatic() {}
  function ballStatic(B) {
    var hit = 0;
    for (var h = 0; h < 2; h++) {
      hit = Math.max(hit, circleCollide(B, HOOPS[h].back, RIMY, RC, 0.55), circleCollide(B, HOOPS[h].front, RIMY, RC, 0.55));
    }
    if (hit > 0) { B.clean = false; if (hit > 60) sfx('rim', hit); }
  }

  function evalShot(team, x, y, vx, vy) {
    var tg = HOOPS[1 - team], own = HOOPS[team], o = { x: x, y: y, vx: vx, vy: vy }, dt = 1 / 60, t, py;
    var lim = RIM_GAP / 2 - RC - BR;
    for (t = 0; t < 2.4; t += dt) {
      py = o.y; ballistic(o, dt);
      if (py < RIMY && o.y >= RIMY) {
        if (Math.abs(o.x - own.cx) < lim + 6) return 3000;
        var miss = Math.abs(o.x - tg.cx);
        if (miss < lim) return -400 + miss * 4 + t * 40;
        return miss;
      }
    }
    return 600 + Math.abs(o.x - tg.cx) * 0.4;
  }

  /* ----- art ----- */
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function drawArena(g) {
    var wall = g.createLinearGradient(0, 0, 0, GROUND);
    wall.addColorStop(0, '#0f0c0a'); wall.addColorStop(1, '#221912');
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    // ceiling lights
    for (var lx = 120; lx < W; lx += 190) {
      var rg = g.createRadialGradient(lx, 0, 0, lx, 0, 230);
      rg.addColorStop(0, 'rgba(255,220,170,.13)'); rg.addColorStop(1, 'rgba(255,220,170,0)');
      g.fillStyle = rg; g.fillRect(lx - 230, 0, 460, 240);
      g.fillStyle = 'rgba(255,236,205,.8)'; g.fillRect(lx - 16, 4, 32, 3);
    }
    // bleachers + crowd
    var r = rng(11), x, y;
    g.fillStyle = '#130f0c'; g.fillRect(0, 80, W, 200);
    for (y = 90; y < 272; y += 12) {
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(0, y + 7, W, 2);
      for (x = -4 + (y % 3) * 3; x < W + 6; x += 10) {
        if (r() < 0.16) continue;
        var c = r(), col = c < 0.1 ? '255,138,61' : c < 0.2 ? '111,211,199' : c < 0.25 ? '255,200,97' : c < 0.62 ? '122,100,84' : '80,68,58';
        var a = 0.16 + (y - 90) / 182 * 0.34, jx = x + (r() - 0.5) * 3, jy = y + (r() - 0.5) * 2;
        g.fillStyle = 'rgba(' + col + ',' + a.toFixed(2) + ')';
        g.beginPath(); g.arc(jx, jy, 3.3, 0, Math.PI * 2); g.fill();
        g.fillRect(jx - 3.7, jy + 3.2, 7.4, 4.5);
      }
    }
    // pennants
    for (x = 180; x < W - 120; x += 160) {
      var pc = (x / 160) % 2 < 1 ? '#ff8a3d' : '#6fd3c7';
      g.fillStyle = pc; g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(x, 68); g.lineTo(x + 34, 68); g.lineTo(x + 17, 84); g.closePath(); g.fill();
      g.globalAlpha = 1;
    }
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.moveTo(0, 68.5); g.lineTo(W, 68.5); g.stroke();
    // padded wall band
    g.fillStyle = '#1c1511'; g.fillRect(0, 282, W, 58);
    g.fillStyle = 'rgba(255,138,61,.09)'; g.fillRect(0, 282, W, 58);
    g.font = '700 14px ' + F.display; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (x = 250; x < W; x += 250) { g.fillStyle = 'rgba(255,138,61,.35)'; g.fillText('VANMULE', x, 311); }
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, 340, W, 1);
    // far floor (wood)
    var ff = g.createLinearGradient(0, 341, 0, GROUND);
    ff.addColorStop(0, '#3b2516'); ff.addColorStop(1, '#5e3c22');
    g.fillStyle = ff; g.fillRect(0, 341, W, GROUND - 341);
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
    for (y = 348; y < GROUND; y += (y - 330) * 0.16 + 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // keys (paint) tinted by defending team
    for (var h = 0; h < 2; h++) {
      var kx = h === 0 ? 0 : W - 190;
      g.fillStyle = h === 0 ? 'rgba(255,138,61,.13)' : 'rgba(111,211,199,.12)';
      g.fillRect(kx, 352, 190, GROUND - 352);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.5; g.strokeRect(kx + 0.75, 352.75, 188.5, GROUND - 353.5);
    }
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(W / 2, 352); g.lineTo(W / 2, GROUND); g.stroke();
    g.beginPath(); g.ellipse(W / 2, 400, 70, 22, 0, 0, Math.PI * 2); g.stroke();
    // near floor
    var nf = g.createLinearGradient(0, GROUND, 0, H);
    nf.addColorStop(0, '#8a5a32'); nf.addColorStop(1, '#4a2f1b');
    g.fillStyle = nf; g.fillRect(0, GROUND, W, H - GROUND);
    g.strokeStyle = 'rgba(0,0,0,.18)';
    for (x = 0; x < W; x += 37) { g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x - 6, H); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, GROUND, W, 2);
    g.fillRect(W / 2 - 1, GROUND, 2, H - GROUND);
    // 3-point lines (dashed, through both floor bands) + labels
    for (h = 0; h < 2; h++) {
      var tx = THREE_X[h];
      g.strokeStyle = 'rgba(255,200,97,.55)'; g.lineWidth = 2; g.setLineDash([7, 6]);
      g.beginPath(); g.moveTo(tx, 352); g.lineTo(tx, H); g.stroke(); g.setLineDash([]);
      g.font = '700 12px ' + F.display; g.fillStyle = 'rgba(255,200,97,.7)';
      g.fillText('3', tx + (h === 0 ? 12 : -12), GROUND + 34);
      g.font = '600 9px ' + F.body; g.fillStyle = 'rgba(255,200,97,.5)';
      g.fillText(h === 0 ? '3PT →' : '← 3PT', tx + (h === 0 ? 24 : -24), 364);
    }
    // hoop supports (behind everything)
    for (h = 0; h < 2; h++) {
      var sgn = h === 0 ? 1 : -1, bx0 = h === 0 ? 0 : W - BOARD;
      g.fillStyle = '#2a2420'; g.fillRect(h === 0 ? 0 : W - 6, RIMY - 140, 6, 140 + 30);
      g.fillStyle = 'rgba(235,242,248,.92)'; g.fillRect(bx0, RIMY - 98, BOARD, 118);
      g.fillStyle = '#ff8a3d'; g.fillRect(bx0 + (h === 0 ? BOARD - 3 : 0), RIMY - 60, 3, 52);
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.strokeRect(bx0 + 0.5, RIMY - 97.5, BOARD - 1, 117);
      void sgn;
    }
  }
  function drawMid() {}
  function drawFront(g) {
    for (var h = 0; h < 2; h++) {
      var hp = HOOPS[h], sw = S.net[h], t = S.clock;
      var sway = sw > 0 ? Math.sin(t * 22) * 5 * sw : 0, len = 58 + sw * 14;
      var x0 = hp.lo + 1, x1 = hp.hi - 1, wTop = x1 - x0, inset = wTop * 0.2;
      // net
      g.strokeStyle = 'rgba(244,240,234,.78)'; g.lineWidth = 1.3; g.beginPath();
      var n = 6, k;
      for (k = 0; k <= n; k++) {
        var tx = x0 + wTop * k / n, bx = x0 + inset + (wTop - 2 * inset) * k / n + sway;
        g.moveTo(tx, RIMY); g.quadraticCurveTo((tx + bx) / 2 + sway * 0.4, RIMY + len * 0.55, bx, RIMY + len);
      }
      for (var row = 1; row <= 4; row++) {
        var f = row / 4, yy = RIMY + len * f, ins = inset * f, xa = x0 + ins + sway * f, xb = x1 - ins + sway * f;
        for (k = 0; k < n; k++) {
          var ax = xa + (xb - xa) * k / n, cx2 = xa + (xb - xa) * (k + 1) / n;
          g.moveTo(ax, yy); g.lineTo((ax + cx2) / 2, yy + 5); g.lineTo(cx2, yy);
        }
      }
      g.stroke();
      // bracket + rim
      g.fillStyle = '#3a3330'; g.fillRect(h === 0 ? BOARD : W - BOARD - 10, RIMY + 2, 10, 6);
      g.strokeStyle = '#ff5a2a'; g.lineWidth = RC * 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(hp.back, RIMY); g.lineTo(hp.front, RIMY); g.stroke();
      g.strokeStyle = 'rgba(255,220,200,.5)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(hp.back, RIMY - 2); g.lineTo(hp.front, RIMY - 2); g.stroke();
      g.lineCap = 'butt';
    }
    if (S.possess >= 0 && (S.phase === 'ready' || S.phase === 'live')) {
      var lx = S.hold.x + (S.possess === 0 ? 230 - R : -230 + R);
      g.strokeStyle = S.possess === 0 ? 'rgba(111,211,199,.35)' : 'rgba(255,138,61,.35)'; g.lineWidth = 2; g.setLineDash([4, 6]);
      g.beginPath(); g.moveTo(lx, GROUND - 90); g.lineTo(lx, GROUND); g.stroke(); g.setLineDash([]);
      g.font = '700 9px ' + F.body; g.textAlign = 'center'; g.fillStyle = 'rgba(243,236,229,.55)'; g.fillText('CHECK BALL', lx, GROUND - 96);
    }
    // shot value tag next to the ball while in flight
    var B = S.ball;
    if (S.phase === 'live' && B.last >= 0 && B.y < GROUND - BR - 30 && isThree(B.last, B.lastX)) {
      g.font = '700 11px ' + F.mono; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      rr(g, B.x - 15, B.y - BR - 22, 30, 15, 7); g.fillStyle = 'rgba(0,0,0,.55)'; g.fill();
      g.fillStyle = '#ffc861'; g.fillText('3PT', B.x, B.y - BR - 11);
    }
  }
  function drawBall(g, B) {
    g.save(); g.translate(B.x, B.y); g.rotate(B.rot);
    var gr = g.createRadialGradient(-BR * 0.35, -BR * 0.4, 1, 0, 0, BR);
    gr.addColorStop(0, '#f09a52'); gr.addColorStop(1, '#a8481a');
    g.beginPath(); g.arc(0, 0, BR, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(30,14,6,.85)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-BR, 0); g.lineTo(BR, 0); g.moveTo(0, -BR); g.lineTo(0, BR); g.stroke();
    g.beginPath(); g.arc(-BR * 1.25, 0, BR * 0.95, -0.9, 0.9); g.stroke();
    g.beginPath(); g.arc(BR * 1.25, 0, BR * 0.95, Math.PI - 0.9, Math.PI + 0.9); g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, BR, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  /* ===================== shared blob-sports core ===================== */
  /* Each game part defines: constants (W, H, GROUND, R, BR, ...), CONSTS, matchSetup, firstDrop, nextDrop,
     readyClamp, checkScore, partLive, partAI, fallbackX, blobRange, blobStatic, ballStatic, predStatic,
     evalShot, aiErrX, extraRows, loadOpts, DRAWS, PLAN_DT/PLAN_N/PLAN_OV (AI search resolution), AIR_AWARE and the art (drawArena, drawMid, drawFront, drawBall). */
  var STEP = 1 / 120;
  var DIFFS = {
    easy:   { react: 0.34, err: 16, terr: 0.035, replan: 0.4,  vnoise: 160, modes: [[0, null], [0, 0.2]] },
    normal: { react: 0.17, err: 6,  terr: 0.012, replan: 0.2,  vnoise: 30,  modes: null },
    hard:   { react: 0.06, err: 1.5, terr: 0.004, replan: 0.1, vnoise: 0,   modes: null }
  };
  var ALL_MODES = (function () {
    var m = [];
    [0, -1, 1].forEach(function (v) { [null, 0.1, 0.18, 0.28].forEach(function (t) { m.push([v, t]); }); });
    return m;
  })();
  var TEAM = [
    { name: 'EMBER', col: '#ff8a3d', hi: '#ffc08f', lo: '#b9501a' },
    { name: 'TEAL', col: '#6fd3c7', hi: '#b8f4ec', lo: '#2a8279' }
  ];
  var GAME_KEYS = { KeyA: 1, KeyD: 1, KeyW: 1, ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, Space: 1 };

  var host, api, root, ui, canvas, ctx, bg, S, opts, tally, keys, listeners, alive, ro;
  var raf, lastTs, acc, rafCount, dpr, scale, cssW, cssH, ovKind;
  var AC, master, noiseBuf, soundOn, lastSfx, F;

  function on(t, type, fn, o) { t.addEventListener(type, fn, o); listeners.push([t, type, fn, o]); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function visible() { return !document.hidden && host && host.offsetParent !== null; }

  /* ---------- state ---------- */
  function mkBlob(i) { return { i: i, x: START_X[i], y: GROUND, vx: 0, vy: 0, hang: 0, squash: 0 }; }
  function mkBall(x, y) {
    return { x: x, y: y, px: x, py: y, vx: 0, vy: 0, rot: 0, last: -1, lastX: 0, touchSeq: 0,
      still: 0, clean: false, up: -1, touching: false };
  }
  function mkAI() { return { plan: null, next: 0, seq: 0, replanAt: 0 }; }
  function newState() {
    var m = matchSetup(opts.len);
    return {
      phase: 'menu', paused: false, clock: 0, phaseT: 0, time: m.time || 0, timed: !!m.time,
      target: m.target || 0, golden: false, ending: false, score: [0, 0],
      blobs: [mkBlob(0), mkBlob(1)], ball: mkBall(W / 2, DROP_Y), hold: { x: W / 2, y: DROP_Y },
      ai: [mkAI(), mkAI()], parts: [], banner: null, demo: false, mode: opts.mode, diff: opts.diff,
      net: [0, 0], possess: -1, setup: m
    };
  }
  function isRunning() {
    return alive && S && !S.paused && (S.phase === 'ready' || S.phase === 'live' || S.phase === 'goal');
  }
  function inMatch() { return S && (S.phase === 'ready' || S.phase === 'live' || S.phase === 'goal'); }

  /* ---------- loop ---------- */
  function frame(ts) {
    raf = 0; rafCount++;
    if (!alive) return;
    if (!visible()) { autoPause(); return; }
    if (!isRunning()) { draw(); return; }
    var dt = (ts - lastTs) / 1000; lastTs = ts;
    if (!(dt > 0)) dt = 0; if (dt > 0.1) dt = 0.1;
    acc += dt;
    var n = 0;
    while (acc >= STEP && n < 24) { step(); acc -= STEP; n++; if (!isRunning()) break; }
    draw();
    if (isRunning()) raf = requestAnimationFrame(frame);
  }
  function startLoop() {
    if (!raf && isRunning() && visible()) { lastTs = performance.now(); acc = 0; raf = requestAnimationFrame(frame); }
  }
  function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function autoPause() {
    stopLoop();
    if (inMatch() && !S.paused) { S.paused = true; keys = {}; showOverlay('pause'); updateButtons(); }
  }
  function togglePause() {
    if (!inMatch()) return;
    if (S.paused) { S.paused = false; hideOverlay(); startLoop(); }
    else { S.paused = true; keys = {}; stopLoop(); showOverlay('pause'); draw(); }
    updateButtons();
  }

  /* ---------- match flow ---------- */
  function startMatch() {
    stopLoop();
    S = newState();
    kickoff(firstDrop());
    hideOverlay(); updateButtons(); sfx('whistle');
    try { canvas.focus({ preventScroll: true }); } catch (e) {}
    draw(); startLoop();
  }
  function kickoff(dropX) {
    S.blobs = [mkBlob(0), mkBlob(1)];
    S.ball = mkBall(dropX, DROP_Y); S.hold = { x: dropX, y: DROP_Y };
    S.ai = [mkAI(), mkAI()];
    S.phase = 'ready'; S.phaseT = 0;
  }
  function scored(team, pts, title, sub) {
    S.score[team] += pts;
    S.phase = 'goal'; S.phaseT = 0; S.lastScorer = team;
    S.banner = { text: title, sub: sub, col: TEAM[team].col, t: 0, dur: GOAL_T - 0.1 };
    confetti(S.ball.x, S.ball.y, team);
    sfx('cheer');
    if (S.golden || (S.target && S.score[team] >= S.target && S.score[team] - S.score[1 - team] >= (S.setup.winBy || 1))) S.ending = true;
  }
  function afterScore() {
    if (S.ending) { endMatch(); return; }
    kickoff(nextDrop(S.lastScorer));
  }
  function timeUp() {
    if (S.score[0] === S.score[1]) {
      S.golden = true;
      S.banner = { text: GOLDEN_TEXT, sub: GOLDEN_SUB, col: '#ffc861', t: 0, dur: 1.8 };
      sfx('whistle');
    } else endMatch();
  }
  function endMatch() {
    S.phase = 'over'; stopLoop();
    var w = S.score[0] > S.score[1] ? 0 : S.score[1] > S.score[0] ? 1 : -1;
    if (!S.demo) {
      if (S.mode === 'cpu') tally.cpu[w === 0 ? 'w' : w === 1 ? 'l' : 'd']++;
      else tally.pvp[w === 0 ? 'p1' : w === 1 ? 'p2' : 'd']++;
      api.save('tally', tally);
    }
    updateTally(); updateButtons();
    sfx('buzz');
    var msg = w < 0 ? 'Draw ' : (S.mode === 'cpu' ? (w === 0 ? 'You win ' : 'Computer wins ') : (TEAM[w].name.charAt(0) + TEAM[w].name.slice(1).toLowerCase() + ' wins '));
    try { api.toast(TITLE + ': ' + msg + S.score[0] + '–' + S.score[1]); } catch (e) {}
    showOverlay('over'); draw();
  }

  /* ---------- physics ---------- */
  function step() {
    S.clock += STEP; S.phaseT += STEP;
    var i0 = inputFor(0), i1 = inputFor(1);
    stepBlob(S.blobs[0], i0); stepBlob(S.blobs[1], i1);
    blobsCollide();
    for (var k = 0; k < 2; k++) { var bb = S.blobs[k]; bb.rvx = (bb.x - bb.px) / STEP; bb.rvy = (bb.y - bb.py) / STEP; }
    var B = S.ball;
    if (S.phase === 'ready') {
      B.x = S.hold.x; B.y = S.hold.y; B.vx = 0; B.vy = 0; B.px = B.x; B.py = B.y;
      if (S.phaseT >= READY_T) { S.phase = 'live'; S.phaseT = 0; }
    } else {
      B.px = B.x; B.py = B.y;
      stepBall();
      if (S.phase === 'live') checkScore();
    }
    if (S.phase === 'live') {
      partLive();
      if (S.phase === 'live' && S.timed && !S.golden) {
        S.time -= STEP;
        if (S.time <= 0) { S.time = 0; timeUp(); }
      }
    } else if (S.phase === 'goal' && S.phaseT >= GOAL_T) afterScore();
    updateParts();
    if (S.banner) { S.banner.t += STEP; if (S.banner.t > S.banner.dur) S.banner = null; }
    if (S.net[0] > 0) S.net[0] = Math.max(0, S.net[0] - STEP * 0.9);
    if (S.net[1] > 0) S.net[1] = Math.max(0, S.net[1] - STEP * 0.9);
  }

  function stepBlob(b, inp) {
    var onG = b.y >= GROUND - 0.5;
    b.px = b.x; b.py = b.y;
    b.vx = ((inp.r ? 1 : 0) - (inp.l ? 1 : 0)) * SPEED;
    if (inp.j && onG && b.vy >= 0) { b.vy = -JUMP; sfx('jump'); }
    b.vy += BLOB_G * STEP;
    b.x += b.vx * STEP; b.y += b.vy * STEP;
    if (b.y >= GROUND) { if (b.vy > 250) b.squash = Math.min(1, b.vy / 700); b.y = GROUND; b.vy = 0; }
    if (b.x < R) b.x = R; if (b.x > W - R) b.x = W - R;
    blobStatic(b);
    readyClamp(b);
    b.squash *= 0.88;
  }

  function blobsCollide() {
    var a = S.blobs[0], b = S.blobs[1], dy = b.y - a.y;
    if (Math.abs(dy) >= R) return;
    var need = R + Math.sqrt(R * R - dy * dy), dx = b.x - a.x;
    if (Math.abs(dx) >= need) return;
    var s = dx > 0 ? 1 : dx < 0 ? -1 : (a.x < W / 2 ? 1 : -1);
    var push = (need - Math.abs(dx)) / 2;
    a.x -= s * push; b.x += s * push;
    a.x = clamp(a.x, R, W - R); b.x = clamp(b.x, R, W - R);
    if (Math.abs(b.x - a.x) < need - 0.01) {
      if (a.x <= R + 0.01 || a.x >= W - R - 0.01) b.x = clamp(a.x + s * need, R, W - R);
      else a.x = clamp(b.x - s * need, R, W - R);
    }
  }

  // one ballistic step shared by the real ball and AI predictions
  function ballistic(o, dt) {
    o.vy += BALL_G * dt; o.x += o.vx * dt; o.y += o.vy * dt;
    var hit = 0;
    if (o.x < WALL_L + BR) { o.x = WALL_L + BR; if (o.vx < 0) { hit = -o.vx; o.vx = -o.vx * WALL_E; } }
    else if (o.x > WALL_R - BR) { o.x = WALL_R - BR; if (o.vx > 0) { hit = o.vx; o.vx = -o.vx * WALL_E; } }
    if (o.y < BR) { o.y = BR; if (o.vy < 0) o.vy = -o.vy * 0.8; }
    if (o.y > GROUND - BR) {
      o.y = GROUND - BR;
      if (o.vy > 0) { if (o.vy > 140) hit = -o.vy; o.vy = o.vy < 70 ? 0 : -o.vy * GROUND_E; }
      o.vx *= Math.pow(ROLL, dt * 120);
    }
    predStatic(o);
    return hit;
  }

  function stepBall() {
    var B = S.ball;
    B.vy += BALL_G * STEP; B.x += B.vx * STEP; B.y += B.vy * STEP;
    B.touching = false;
    collideBlob(B, S.blobs[0]); collideBlob(B, S.blobs[1]);
    ballStatic(B);
    walls(B);
    var sp = Math.sqrt(B.vx * B.vx + B.vy * B.vy);
    if (sp > VMAX) { B.vx *= VMAX / sp; B.vy *= VMAX / sp; }
    B.rot += B.vx * STEP / BR;
    // unstick: resting somewhere off the floor and not on a blob (top of a bar / board)
    if (sp < 30 && B.y < GROUND - BR - 2 && !B.touching) {
      B.still += STEP;
      if (B.still > 1.2) { B.still = 0; B.vx = (B.x < W / 2 ? 1 : -1) * 240; B.vy = -160; }
    } else B.still = 0;
  }
  function walls(B) {
    if (B.x < WALL_L + BR) { B.x = WALL_L + BR; if (B.vx < 0) { if (B.vx < -120) sfx('wall', -B.vx); B.vx = -B.vx * WALL_E; B.clean = false; } }
    else if (B.x > WALL_R - BR) { B.x = WALL_R - BR; if (B.vx > 0) { if (B.vx > 120) sfx('wall', B.vx); B.vx = -B.vx * WALL_E; B.clean = false; } }
    if (B.y < BR) { B.y = BR; if (B.vy < 0) B.vy = -B.vy * 0.8; }
    if (B.y > GROUND - BR) {
      B.y = GROUND - BR;
      if (B.vy > 0) { if (B.vy > 140) sfx('floor', B.vy); B.vy = B.vy < 70 ? 0 : -B.vy * GROUND_E; }
      B.vx *= ROLL;
    }
  }

  // circle (ball) vs semicircle (blob dome + flat base)
  function collideBlob(B, b) {
    var dx = B.x - b.x, dy = B.y - b.y, D = R + BR, nx, ny, d;
    if (dy <= 0) {
      d = Math.sqrt(dx * dx + dy * dy);
      if (d >= D) return;
      if (d < 1e-6) { nx = 0; ny = -1; } else { nx = dx / d; ny = dy / d; }
      B.x = b.x + nx * D; B.y = b.y + ny * D;
    } else {
      if (dy >= BR) return;
      if (Math.abs(dx) <= R) {
        nx = 0; ny = 1; B.y = b.y + BR;
        if (B.y > GROUND - BR) { // squeezed under a landing blob: pop out sideways
          var s = dx >= 0 ? 1 : -1; B.y = GROUND - BR; B.x = b.x + s * (R + BR); nx = s; ny = 0;
        }
      } else {
        var cx = b.x + (dx > 0 ? R : -R), ex = B.x - cx;
        d = Math.sqrt(ex * ex + dy * dy);
        if (d >= BR || d < 1e-6) return;
        nx = ex / d; ny = dy / d; B.x = cx + nx * BR; B.y = b.y + ny * BR;
      }
    }
    B.touching = true;
    // use the blob's actual motion this step (it may be blocked by a wall or the other blob)
    var rvx = B.vx - (b.rvx || 0), rvy = B.vy - (b.rvy || 0), vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      B.vx -= (1 + E_BLOB) * vn * nx; B.vy -= (1 + E_BLOB) * vn * ny;
      B.last = b.i; B.lastX = b.x; B.touchSeq++; B.clean = true;
      if (-vn > 90) sfx('hit', -vn);
    }
  }

  function circleCollide(B, cx, cy, rad, e) {
    var dx = B.x - cx, dy = B.y - cy, D = rad + BR, d2 = dx * dx + dy * dy;
    if (d2 >= D * D) return 0;
    var d = Math.sqrt(d2), nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
    B.x = cx + nx * D; B.y = cy + ny * D;
    var vn = B.vx * nx + B.vy * ny;
    if (vn < 0) { B.vx -= (1 + e) * vn * nx; B.vy -= (1 + e) * vn * ny; return -vn; }
    return 0.001;
  }
  function segCollide(B, ax, ay, bx, by, rad, e) {
    var abx = bx - ax, aby = by - ay, t = ((B.x - ax) * abx + (B.y - ay) * aby) / (abx * abx + aby * aby);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return circleCollide(B, ax + abx * t, ay + aby * t, rad, e);
  }

  /* ---------- input / AI ---------- */
  function humanInput(i) {
    var k = keys;
    if (S.mode === '2p') {
      if (i === 0) return { l: !!k.KeyA, r: !!k.KeyD, j: !!k.KeyW };
      return { l: !!k.ArrowLeft, r: !!k.ArrowRight, j: !!k.ArrowUp };
    }
    return { l: !!(k.KeyA || k.ArrowLeft), r: !!(k.KeyD || k.ArrowRight), j: !!(k.KeyW || k.ArrowUp || k.Space) };
  }
  function inputFor(i) {
    if (S.demo || (S.mode === 'cpu' && i === 1)) return aiInput(i);
    return humanInput(i);
  }
  function moveToward(b, x, inp, tol) {
    var d = x - b.x;
    if (d > (tol || 2.5)) inp.r = true; else if (d < -(tol || 2.5)) inp.l = true;
  }
  function aiInput(i) {
    var ai = S.ai[i], b = S.blobs[i], cfg = DIFFS[(S.aiDiff && S.aiDiff[i]) || S.diff] || DIFFS.normal, now = S.clock, B = S.ball;
    var inp = { l: false, r: false, j: false };
    if (B.touchSeq !== ai.seq) { ai.seq = B.touchSeq; ai.replanAt = now + (B.last === i ? 0.03 : cfg.react); }
    var need = !ai.plan;
    if (ai.replanAt && now >= ai.replanAt) { need = true; ai.replanAt = 0; }
    else if (!ai.replanAt && ai.plan) {
      var p0 = ai.plan;
      if (p0.fallback || now < p0.tm - 0.06) { if (now >= ai.next) need = true; }
      else if (now > p0.tc + 0.12) need = true;
    }
    if (need) { ai.plan = plan(i, cfg); ai.next = now + cfg.replan; }
    var p = ai.plan, dir = i === 0 ? 1 : -1;
    if (p.fallback || now < p.tm) {
      moveToward(b, p.xp, inp, p.fallback ? 6 : 2.5);
      if (p.fallback && S.phase !== 'ready') {
        // ball between me and where I want to be, and low: hop over it rather than push it backwards
        var between = (B.x - b.x) * (p.xp - B.x) > 0;
        if (between && B.y > GROUND - R - BR - 30 && Math.abs(B.x - b.x) < R + BR + 40) inp.j = true;
      }
    } else {
      if (p.mv) { if (p.mv < 0) inp.l = true; else inp.r = true; } else moveToward(b, p.xp, inp);
      if (p.tau != null && !p.jumped && now >= p.tc - p.tau) { inp.j = true; p.jumped = true; }
    }
    // blocked (pushing against the other blob / a wall)? hop out of the stalemate
    if ((inp.l || inp.r) && Math.abs(b.x - (ai.lx == null ? -99 : ai.lx)) < 0.3 && b.y >= GROUND - 0.5) ai.stuck = (ai.stuck || 0) + STEP;
    else ai.stuck = 0;
    ai.lx = b.x;
    if (ai.stuck > 0.45) { inp.j = true; ai.stuck = 0; }
    partAI(i, inp, b, dir);
    return inp;
  }

  // Search over (contact time, blob manoeuvre, side of dome) for the touch that sends the ball where we want.
  function plan(i, cfg) {
    var b = S.blobs[i], B = S.ball, modes = cfg.modes || ALL_MODES;
    var tOff = S.phase === 'ready' ? Math.max(0, READY_T - S.phaseT) : 0;
    var o = S.phase === 'ready' ? { x: S.hold.x, y: S.hold.y, vx: 0, vy: 0 } : { x: B.x, y: B.y, vx: B.vx, vy: B.vy };
    var dt = PLAN_DT, N = PLAN_N, tr = [{ x: o.x, y: o.y, vx: o.vx, vy: o.vy }], k, j, m, back = Math.round(0.2 / PLAN_DT);
    for (k = 1; k <= N; k++) { ballistic(o, dt); tr.push({ x: o.x, y: o.y, vx: o.vx, vy: o.vy }); }
    var best = null, D = R + BR, rg = blobRange(i), lo = rg[0], hi = rg[1];
    // AIR_AWARE: if I'm mid-air, follow my current arc and don't plan a jump before I land
    var air = AIR_AWARE && b.y < GROUND - 0.5 && S.phase !== 'ready', b0y = b.y, b0vy = b.vy, landT = 0;
    if (air) landT = (-b0vy + Math.sqrt(b0vy * b0vy + 2 * BLOB_G * (GROUND - b0y))) / BLOB_G;
    for (m = 0; m < modes.length; m++) {
      var mv = modes[m][0] * SPEED, tau = modes[m][1];
      var runT = mv ? Math.max(0.16, tau || 0) : (tau || 0);
      var by = GROUND, bvy = 0;
      if (tau != null) { by = GROUND - (JUMP * tau - 0.5 * BLOB_G * tau * tau); bvy = -JUMP + BLOB_G * tau; }
      for (j = 1; j <= N; j++) {
        var tc = j * dt + tOff, pt = tr[j];
        if (tc < runT + 0.02) continue;
        var byj = by, bvyj = bvy;
        if (air) {
          if (tau == null) { if (tc < landT) { byj = b0y + b0vy * tc + 0.5 * BLOB_G * tc * tc; bvyj = b0vy + BLOB_G * tc; } }
          else if (tc - tau < landT + STEP) continue;
        }
        var ny = (pt.y - byj) / D;
        if (ny > -0.08 || ny < -1) continue;
        var nxa = Math.sqrt(1 - ny * ny);
        for (var sg = -1; sg <= 1; sg += 2) {
          var nx = sg * nxa, tx = pt.x - nx * D;
          if (tx < lo || tx > hi) continue;
          var rvx = pt.vx - mv, rvy = pt.vy - bvyj, vn = rvx * nx + rvy * ny;
          if (vn >= -20) continue;
          var xp = tx - mv * runT;
          if (xp < lo || xp > hi) continue;
          var tm = tc - runT, needT = Math.abs(xp - b.x) / SPEED;
          if (needT > tm + 0.01) continue;
          // the ball must not already overlap the blob in the moments before this contact
          var ok = true;
          for (var q = Math.max(0, j - back); q < j; q++) {
            var tq = (q - j) * dt, bxq = tx + mv * tq, byq = GROUND;
            if (tau != null) { var tt = tau + tq; if (tt > 0) byq = GROUND - (JUMP * tt - 0.5 * BLOB_G * tt * tt); }
            else if (air) { var ta = tc + tq; if (ta < landT) byq = b0y + b0vy * ta + 0.5 * BLOB_G * ta * ta; }
            if (mv && tq < -runT) bxq = xp;
            var ex = tr[q].x - bxq, ey = tr[q].y - byq;
            if (ey <= 0 && ex * ex + ey * ey < D * D * PLAN_OV) { ok = false; break; }
          }
          if (!ok) continue;
          var ovx = pt.vx - (1 + E_BLOB) * vn * nx, ovy = pt.vy - (1 + E_BLOB) * vn * ny;
          var sp = Math.sqrt(ovx * ovx + ovy * ovy);
          if (sp > VMAX) { ovx *= VMAX / sp; ovy *= VMAX / sp; }
          var val = evalShot(i, pt.x, pt.y, ovx, ovy, nx, ny, pt.vx, pt.vy, mv, bvyj) + tc * 25 + needT * 15 + (tau != null ? 6 : 0);
          if (cfg.vnoise) val += (Math.random() * 2 - 1) * cfg.vnoise;
          if (!best || val < best.val) best = { val: val, xp: xp, mv: mv, tau: tau, tm: tm, tc: tc, ov: [ovx, ovy, nx, ny, pt.x, pt.y, tx, byj] };
        }
      }
    }
    var dir = i === 0 ? 1 : -1;
    if (!best) {
      // can't make a useful touch: get under where it lands, on the side that pushes it forward
      var land = tr[N].x;
      for (j = 1; j <= N; j++) if (tr[j].y >= GROUND - D && tr[j].vy > 0) { land = tr[j].x; break; }
      var xp2 = land - dir * R * 0.5;
      if (Math.abs(B.vx) < 40 && B.y > GROUND - BR - 4) xp2 = B.x - dir * (D - 10); // still ball: walk into it
      return { fallback: true, xp: clamp(fallbackX(i, xp2, land), lo, hi) };
    }
    var e = (Math.random() * 2 - 1);
    return { xp: clamp(best.xp + aiErrX(i, e) * cfg.err, lo, hi), mv: best.mv, tau: best.tau, jumped: false,
      tm: S.clock + best.tm + e * cfg.terr, tc: S.clock + best.tc + e * cfg.terr, val: best.val, ov: best.ov };
  }

  /* ---------- particles ---------- */
  function confetti(x, y, team) {
    var cols = [TEAM[team].col, TEAM[team].hi, '#ffc861', '#f3ece5'];
    for (var k = 0; k < 70; k++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 200 + Math.random() * 420;
      S.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.2 + Math.random() * 0.9,
        col: cols[k % 4], w: 3 + Math.random() * 4, h: 2 + Math.random() * 3, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
    }
  }
  function updateParts() {
    var P = S.parts;
    for (var k = P.length - 1; k >= 0; k--) {
      var p = P[k];
      p.vy += 700 * STEP; p.vx *= 0.995; p.x += p.vx * STEP; p.y += p.vy * STEP; p.rot += p.vr * STEP; p.life -= STEP;
      if (p.y > GROUND - 2) { p.y = GROUND - 2; p.vy *= -0.3; p.vx *= 0.7; }
      if (p.life <= 0) P.splice(k, 1);
    }
  }

  /* ---------- drawing ---------- */
  function buildBg() {
    bg = document.createElement('canvas');
    bg.width = canvas.width; bg.height = canvas.height;
    var g = bg.getContext('2d');
    g.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    drawArena(g);
  }
  function draw() {
    if (!ctx || !canvas.width) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (bg) ctx.drawImage(bg, 0, 0);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    if (!S) return;
    var B = S.ball, k;
    drawMid(ctx);
    // shadows
    for (k = 0; k < 2; k++) {
      var bl = S.blobs[k], hgt = GROUND - bl.y, f = Math.max(0.35, 1 - hgt / 260);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.38 * f).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(bl.x, GROUND + 3, R * f, 6 * f, 0, 0, Math.PI * 2); ctx.fill();
    }
    var bh = GROUND - B.y, bf = Math.max(0.2, 1 - bh / 420);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.32 * bf).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(B.x, GROUND + 3, BR * 1.2 * bf, 4 * bf, 0, 0, Math.PI * 2); ctx.fill();
    for (k = 0; k < 2; k++) drawBlob(S.blobs[k]);
    if (S.phase === 'ready') {
      var pr = 0.5 + 0.5 * Math.sin(S.phaseT * 14);
      ctx.strokeStyle = 'rgba(255,200,97,' + (0.25 + 0.4 * pr).toFixed(3) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(B.x, B.y, BR + 6 + pr * 3, 0, Math.PI * 2); ctx.stroke();
    }
    drawBall(ctx, B);
    drawFront(ctx);
    for (k = 0; k < S.parts.length; k++) {
      var p = S.parts[k];
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life * 1.5); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    drawHUD();
    if (S.banner) drawBanner(S.banner);
  }
  function drawBlob(b) {
    var t = TEAM[b.i], sq = b.squash, sx = 1 + sq * 0.1, sy = 1 - sq * 0.14;
    ctx.save(); ctx.translate(b.x, b.y); ctx.scale(sx, sy);
    var g = ctx.createLinearGradient(0, -R, 0, 0);
    g.addColorStop(0, t.hi); g.addColorStop(0.5, t.col); g.addColorStop(1, t.lo);
    ctx.beginPath(); ctx.moveTo(-R, 0); ctx.arc(0, 0, R, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, R - 7, Math.PI * 1.16, Math.PI * 1.38); ctx.stroke();
    var f = b.i === 0 ? 1 : -1, ex = f * R * 0.44, ey = -R * 0.56, er = R * 0.2;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke();
    var ax = S.ball.x - (b.x + ex * sx), ay = S.ball.y - (b.y + ey * sy), al = Math.sqrt(ax * ax + ay * ay) || 1;
    var px = ex + ax / al * er * 0.48, py = ey + ay / al * er * 0.48;
    ctx.fillStyle = '#16110e'; ctx.beginPath(); ctx.arc(px, py, er * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(px - er * 0.18, py - er * 0.2, er * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function fmtTime(s) { s = Math.ceil(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function drawHUD() {
    var cx = W / 2, y = 10, w = 300, h = 52;
    rr(ctx, cx - w / 2, y, w, h, 12); ctx.fillStyle = 'rgba(12,10,9,.78)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1; ctx.stroke();
    var names = S.mode === 'cpu' ? ['YOU', 'CPU · ' + S.diff.toUpperCase()] : ['P1 ' + TEAM[0].name, 'P2 ' + TEAM[1].name];
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (var k = 0; k < 2; k++) {
      var x = cx + (k ? 1 : -1) * 98;
      ctx.font = '700 10px ' + F.body; ctx.fillStyle = TEAM[k].col; ctx.fillText(names[k], x, y + 18);
      ctx.font = '700 25px ' + F.mono; ctx.fillStyle = '#f3ece5'; ctx.fillText(String(S.score[k]), x, y + 45);
    }
    ctx.font = '600 9px ' + F.body; ctx.fillStyle = '#a3968a';
    var label, val;
    if (S.golden) { label = GOLDEN_SHORT; val = '∞'; }
    else if (S.timed) { label = 'TIME'; val = fmtTime(S.time); }
    else { label = S.setup.label || 'FIRST TO'; val = String(S.target); }
    ctx.fillText(label, cx, y + 18);
    ctx.font = '700 19px ' + F.mono; ctx.fillStyle = S.golden ? '#ffc861' : (S.timed && S.time < 10 && S.phase !== 'over' ? '#ff5a52' : '#ffc861');
    ctx.fillText(val, cx, y + 42);
  }
  function easeOutBack(t) { var c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function drawBanner(b) {
    var t = b.t, s = t < 0.3 ? easeOutBack(t / 0.3) : 1 + Math.sin((t - 0.3) * 6) * 0.015;
    var a = t > b.dur - 0.35 ? Math.max(0, (b.dur - t) / 0.35) : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * 0.4); ctx.scale(Math.max(0.01, s), Math.max(0.01, s));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 62px ' + F.display; ctx.lineJoin = 'round';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(b.text, 0, 0);
    ctx.fillStyle = b.col; ctx.fillText(b.text, 0, 0);
    if (b.sub) {
      ctx.font = '600 18px ' + F.body; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.strokeText(b.sub, 0, 48); ctx.fillStyle = '#f3ece5'; ctx.fillText(b.sub, 0, 48);
    }
    ctx.restore();
  }

  /* ---------- sound ---------- */
  function ensureAudio() {
    if (AC || !soundOn) return;
    try {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      AC = new C(); master = AC.createGain(); master.gain.value = 0.7; master.connect(AC.destination);
    } catch (e) { AC = null; }
  }
  function tone(f, dur, type, vol, f2, delay) {
    var t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, ftype, freq, q, attack, delay) {
    if (!noiseBuf) {
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    }
    var t = AC.currentTime + (delay || 0), s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = noiseBuf; fl.type = ftype; fl.frequency.value = freq; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function sfx(name, v) {
    if (!soundOn || !AC || !alive) return;
    var now = performance.now();
    if (lastSfx[name] && now - lastSfx[name] < (name === 'hit' ? 45 : 70)) return;
    lastSfx[name] = now;
    try {
      if (AC.state === 'suspended') AC.resume();
      switch (name) {
        case 'hit': var f = 240 + Math.min(v || 0, 1000) * 0.35; tone(f, 0.08, 'triangle', 0.11, f * 0.7); break;
        case 'floor': tone(120, 0.07, 'sine', Math.min(0.08, (v || 0) / 9000), 70); break;
        case 'wall': tone(170, 0.06, 'sine', Math.min(0.06, (v || 0) / 12000), 110); break;
        case 'jump': tone(330, 0.09, 'sine', 0.025, 520); break;
        case 'bar': tone(1180, 0.16, 'square', 0.022, 900); tone(1770, 0.1, 'sine', 0.02); break;
        case 'rim': tone(620, 0.14, 'triangle', 0.05, 480); tone(1240, 0.08, 'sine', 0.02); break;
        case 'whistle': tone(2100, 0.12, 'sine', 0.035); tone(2350, 0.18, 'sine', 0.035, null, 0.13); break;
        case 'swish': noise(0.32, 0.07, 'highpass', 2600, 0.5, 0.03); break;
        case 'cheer':
          noise(1.7, 0.06, 'bandpass', 1100, 0.45, 0.25);
          noise(1.3, 0.035, 'bandpass', 2300, 0.8, 0.18, 0.1);
          tone(520, 0.22, 'triangle', 0.035, 780); tone(660, 0.26, 'triangle', 0.03, 990, 0.12); break;
        case 'buzz': tone(150, 0.55, 'sawtooth', 0.03, 140); tone(225, 0.55, 'square', 0.012, 220); break;
        case 'click': tone(700, 0.04, 'sine', 0.03); break;
        case 'net': noise(0.12, Math.min(0.07, (v || 0) / 9000), 'lowpass', 700, 0.8, 0.005); tone(180, 0.08, 'sine', 0.025, 120); break;
      }
    } catch (e) {}
  }

  /* ---------- UI ---------- */
  function injectCSS() {
    var id = 'ag-' + ID + '-css';
    if (document.getElementById(id)) return;
    var s = document.createElement('style'); s.id = id;
    var P = '.ag-' + ID;
    s.textContent = [
      P + '{font-family:var(--body);color:var(--fg);-webkit-user-select:none;user-select:none;outline:none}',
      P + ' .g-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;margin-bottom:10px}',
      P + ' .g-title{font-family:var(--display);font-size:22px;font-weight:700;letter-spacing:.01em;line-height:1.1}',
      P + ' .g-title b{color:var(--ember)}',
      P + ' .g-how{color:var(--muted);font-size:13px;margin-top:4px}',
      P + ' .g-ctrls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      P + ' .g-tally{font-family:var(--mono);font-size:12px;color:var(--muted);padding:0 4px;white-space:nowrap}',
      P + ' .g-tally b{color:var(--fg);font-weight:600}',
      P + ' .g-stage{position:relative;margin:0 auto;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:#0b0a09;box-shadow:0 14px 40px rgba(0,0,0,.35)}',
      P + ' canvas{display:block;width:100%;height:100%;outline:none}',
      P + ' .g-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,8,7,.58);backdrop-filter:blur(2px);padding:12px}',
      P + ' .g-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px 20px 20px;width:min(430px,100%);text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.55);max-height:100%;overflow:auto}',
      P + ' .g-ctitle{font-family:var(--display);font-size:22px;font-weight:700;margin-bottom:2px}',
      P + ' .g-sub{color:var(--muted);font-size:13px;margin-bottom:8px}',
      P + ' .g-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:9px 0}',
      P + ' .g-lab{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.09em;font-weight:600}',
      P + ' .g-seg{display:inline-flex;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:2px;gap:2px}',
      P + ' .g-seg button{height:28px;padding:0 10px;border-radius:8px;font-size:13px;color:var(--muted);font-weight:600}',
      P + ' .g-seg button:hover{color:var(--fg)}',
      P + ' .g-seg button.on{background:var(--ember);color:var(--ember-ink)}',
      P + ' .g-seg.dis{opacity:.4;pointer-events:none}',
      P + ' .g-keys{font-size:12px;color:var(--muted);margin:12px 0 14px;line-height:1.9}',
      P + ' kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:1px 5px;color:var(--fg)}',
      P + ' .g-btns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px}',
      P + ' .g-big{font-family:var(--mono);font-size:40px;font-weight:700;margin:6px 0 2px;letter-spacing:.04em}',
      P + ' .g-big .a{color:var(--ember)} ' + P + ' .g-big .b{color:var(--cool)}',
      P + ' .g-res{font-family:var(--display);font-size:24px;font-weight:700}',
      P + ' .g-tips{margin:10px auto 0;color:var(--muted);font-size:13px;max-width:1100px}',
      P + ' .g-tips summary{cursor:pointer;color:var(--fg);font-weight:600;font-size:13px;width:max-content}',
      P + ' .g-tips ul{margin:6px 0 0;padding-left:18px;line-height:1.6}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function seg(k, items, cur, dis) {
    return '<div class="g-seg' + (dis ? ' dis' : '') + '" data-k="' + k + '">' + items.map(function (it) {
      return '<button type="button" data-v="' + it[0] + '"' + (String(it[0]) === String(cur) ? ' class="on"' : '') + '>' + it[1] + '</button>';
    }).join('') + '</div>';
  }
  function row(l, c) { return '<div class="g-row"><span class="g-lab">' + l + '</span>' + c + '</div>'; }
  function keysHint(mode) {
    if (mode === '2p') return '<span style="color:var(--ember)">Ember</span> <kbd>A</kbd> <kbd>D</kbd> move · <kbd>W</kbd> jump<br>' +
      '<span style="color:var(--cool)">Teal</span> <kbd>←</kbd> <kbd>→</kbd> move · <kbd>↑</kbd> jump<br><kbd>P</kbd> / <kbd>Esc</kbd> pause';
    return 'Move <kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd> · Jump <kbd>W</kbd> or <kbd>↑</kbd><br><kbd>P</kbd> / <kbd>Esc</kbd> pause';
  }
  function showOverlay(kind) {
    ovKind = kind; var h = '';
    if (kind === 'menu') {
      h = '<div class="g-card"><div class="g-ctitle">' + TITLE + '</div><div class="g-sub">' + SUB + '</div>' +
        row('Mode', seg('mode', [['cpu', 'vs Computer'], ['2p', '2 Players']], opts.mode)) +
        row('Computer', seg('diff', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], opts.diff, opts.mode !== 'cpu')) +
        row('Match', seg('len', LENS, opts.len)) + extraRows() +
        '<div class="g-keys">' + keysHint(opts.mode) + '</div>' +
        '<button type="button" class="btn pri" data-a="start">' + START_LABEL + '</button></div>';
    } else if (kind === 'pause') {
      h = '<div class="g-card"><div class="g-ctitle">Paused</div><div class="g-sub">Press <kbd>P</kbd> or <kbd>Esc</kbd> to resume.</div>' +
        '<div class="g-keys">' + keysHint(S.mode) + '</div>' +
        '<div class="g-btns"><button type="button" class="btn pri" data-a="resume">Resume</button><button type="button" class="btn sec" data-a="menu">Quit to menu</button></div></div>';
    } else if (kind === 'over') {
      var w = S.score[0] > S.score[1] ? 0 : S.score[1] > S.score[0] ? 1 : -1, res;
      if (w < 0) res = 'It’s a draw';
      else if (S.mode === 'cpu') res = w === 0 ? 'You win!' : 'Computer wins';
      else res = (w === 0 ? 'Ember' : 'Teal') + ' wins!';
      var tl = S.mode === 'cpu' ? ('vs Computer: <b>' + tally.cpu.w + '</b> W · <b>' + tally.cpu.l + '</b> L' + (DRAWS ? ' · <b>' + tally.cpu.d + '</b> D' : ''))
        : ('Ember <b>' + tally.pvp.p1 + '</b> · Teal <b>' + tally.pvp.p2 + '</b>' + (DRAWS ? ' · Draws <b>' + tally.pvp.d + '</b>' : ''));
      h = '<div class="g-card"><div class="g-res" style="color:' + (w < 0 ? 'var(--gold)' : TEAM[w].col) + '">' + res + '</div>' +
        '<div class="g-big"><span class="a">' + S.score[0] + '</span> – <span class="b">' + S.score[1] + '</span></div>' +
        '<div class="g-sub">' + tl + '</div>' +
        '<div class="g-btns"><button type="button" class="btn pri" data-a="start">Play again</button><button type="button" class="btn sec" data-a="menu">Change settings</button></div></div>';
    }
    ui.ov.innerHTML = h; ui.ov.hidden = false;
  }
  function hideOverlay() { ui.ov.hidden = true; ui.ov.innerHTML = ''; ovKind = null; }
  function updateButtons() {
    ui.pause.disabled = !inMatch();
    ui.pause.textContent = S && S.paused ? 'Resume' : 'Pause';
    ui.snd.textContent = soundOn ? '🔊' : '🔇';
    ui.snd.title = soundOn ? 'Sound on' : 'Sound off';
  }
  function updateTally() {
    ui.tally.innerHTML = 'vs CPU <b>' + tally.cpu.w + '</b>W <b>' + tally.cpu.l + '</b>L' + (DRAWS ? ' <b>' + tally.cpu.d + '</b>D' : '');
  }
  function toMenu() {
    stopLoop();
    if (S) { S.phase = 'menu'; S.paused = false; }
    showOverlay('menu'); updateButtons(); draw();
  }
  function onOvClick(e) {
    ensureAudio();
    var b = e.target.closest('button'); if (!b || !ui.ov.contains(b)) return;
    var sg = b.parentNode && b.parentNode.getAttribute && b.parentNode.getAttribute('data-k');
    if (sg) {
      opts[sg] = b.getAttribute('data-v'); api.save('opts', opts); sfx('click');
      showOverlay('menu'); return;
    }
    var a = b.getAttribute('data-a');
    if (a === 'start') startMatch();
    else if (a === 'resume') togglePause();
    else if (a === 'menu') toMenu();
  }

  function onKeyDown(e) {
    if (!alive || host.offsetParent === null) return;
    var t = e.target, tn = t && t.tagName;
    if (tn === 'INPUT' || tn === 'TEXTAREA' || tn === 'SELECT' || (t && t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (inMatch()) { e.preventDefault(); ensureAudio(); togglePause(); }
      return;
    }
    if (GAME_KEYS[e.code] && isRunning()) {
      e.preventDefault(); ensureAudio(); keys[e.code] = true;
    }
  }
  function onKeyUp(e) { if (keys[e.code]) { keys[e.code] = false; } }

  function fit() {
    if (!alive || !root) return;
    var w = root.clientWidth || host.clientWidth || 900;
    var top = ui.stage.getBoundingClientRect().top;
    var tipsH = (ui.tips.offsetHeight || 24) + 10;
    var avail = (window.innerHeight || 800) - top - 40 - tipsH;
    var hh = clamp(avail, 280, 640);
    var cw = Math.min(w, hh * W / H, 1100);
    cw = Math.max(cw, Math.min(w, 460));
    cssW = Math.floor(cw); cssH = Math.round(cssW * H / W);
    ui.stage.style.width = cssW + 'px'; ui.stage.style.height = cssH + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    scale = cssW / W;
    buildBg(); draw();
  }

  function readFonts() {
    var cs = getComputedStyle(host);
    F = {
      display: (cs.getPropertyValue('--display') || '').trim() || 'system-ui, sans-serif',
      body: (cs.getPropertyValue('--body') || '').trim() || 'system-ui, sans-serif',
      mono: (cs.getPropertyValue('--mono') || '').trim() || 'monospace'
    };
  }

  /* ---------- module ---------- */
  var mod = {
    mount: function (el, a) {
      host = el; api = a; alive = true; listeners = []; keys = {}; raf = 0; rafCount = 0; acc = 0;
      AC = null; master = null; noiseBuf = null; lastSfx = {}; ui = {}; ovKind = null;
      var sv = null; try { sv = api.load('sound'); } catch (e) {}
      soundOn = (sv === null || sv === undefined) ? !!api.sound : !!sv;
      opts = { mode: 'cpu', diff: 'normal', len: DEFAULT_LEN };
      var so = api.load('opts');
      if (so && typeof so === 'object') {
        if (so.mode === 'cpu' || so.mode === '2p') opts.mode = so.mode;
        if (DIFFS[so.diff]) opts.diff = so.diff;
        if (LENS.some(function (l) { return l[0] === so.len; })) opts.len = so.len;
      }
      loadOpts(opts, so && typeof so === 'object' ? so : {});
      tally = { cpu: { w: 0, l: 0, d: 0 }, pvp: { p1: 0, p2: 0, d: 0 } };
      var st = api.load('tally');
      if (st && st.cpu && st.pvp) tally = st;
      injectCSS(); readFonts();
      root = document.createElement('div'); root.className = 'ag-' + ID;
      root.innerHTML =
        '<div class="g-head"><div><div class="g-title">' + TITLE_HTML + '</div><div class="g-how">' + HOW + '</div></div>' +
        '<div class="g-ctrls"><span class="g-tally"></span>' +
        '<button type="button" class="btn sec small g-snd"></button>' +
        '<button type="button" class="btn sec small g-pause">Pause</button>' +
        '<button type="button" class="btn pri small g-new">New game</button></div></div>' +
        '<div class="g-stage"><canvas tabindex="0" aria-label="' + TITLE + ' playfield"></canvas><div class="g-ov"></div></div>' +
        '<details class="g-tips"><summary>Tips</summary><ul>' + TIPS.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></details>';
      host.appendChild(root);
      ui.stage = root.querySelector('.g-stage'); ui.ov = root.querySelector('.g-ov');
      ui.tips = root.querySelector('.g-tips'); ui.tally = root.querySelector('.g-tally');
      ui.snd = root.querySelector('.g-snd'); ui.pause = root.querySelector('.g-pause'); ui.newb = root.querySelector('.g-new');
      canvas = root.querySelector('canvas'); ctx = canvas.getContext('2d');
      S = newState();
      on(ui.ov, 'click', onOvClick);
      on(ui.snd, 'click', function () {
        soundOn = !soundOn; api.save('sound', soundOn);
        if (soundOn) { ensureAudio(); sfx('click'); }
        updateButtons();
      });
      on(ui.pause, 'click', function () { ensureAudio(); togglePause(); });
      on(ui.newb, 'click', function () { ensureAudio(); toMenu(); });
      on(ui.tips, 'toggle', function () { fit(); });
      on(root, 'pointerdown', function () { ensureAudio(); });
      on(window, 'keydown', onKeyDown);
      on(window, 'keyup', onKeyUp);
      on(window, 'blur', function () { keys = {}; });
      on(window, 'resize', function () { if (visible()) fit(); });
      on(document, 'visibilitychange', function () { if (document.hidden) autoPause(); });
      if (window.ResizeObserver) {
        var lastW = 0;
        ro = new ResizeObserver(function () { var cw = root.clientWidth; if (cw && cw !== lastW && visible()) { lastW = cw; fit(); } });
        ro.observe(root);
      }
      updateTally(); updateButtons();
      showOverlay('menu');
      fit();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (alive) { buildBg(); draw(); } });
    },
    unmount: function () {
      alive = false; stopLoop();
      for (var k = 0; k < listeners.length; k++) { var L = listeners[k]; L[0].removeEventListener(L[1], L[2], L[3]); }
      listeners = [];
      if (ro) { ro.disconnect(); ro = null; }
      if (AC) { try { AC.close(); } catch (e) {} AC = null; master = null; noiseBuf = null; }
      keys = {};
      if (host) host.innerHTML = '';
      root = null; canvas = null; ctx = null; bg = null; S = null; ui = {};
    },
    // test hooks
    _debug: {
      state: function () { return S; },
      step: function (n, nodraw) { for (var k = 0; k < (n || 1); k++) { if (!inMatch()) break; step(); } if (!nodraw) draw(); },
      setBall: function (x, y, vx, vy) { var B = S.ball; B.x = B.px = x; B.y = B.py = y; B.vx = vx || 0; B.vy = vy || 0; if (S.phase === 'ready') { S.phase = 'live'; S.phaseT = 0; } },
      demo: function (on) { S.demo = !!on; },
      keys: function (k) { keys = k || {}; },
      start: function (o) { if (o) for (var k in o) opts[k] = o[k]; startMatch(); },
      rafCount: function () { return rafCount; },
      looping: function () { return !!raf; },
      consts: function () { return CONSTS(); },
      draw: function () { draw(); }
    }
  };
  window.VanArcade[ID] = mod;
})();
