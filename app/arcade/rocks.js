/* VanMule Arcade: Rock Drift - glowing vector space shooter.
   window.VanArcade.rocks.mount(el, api) / unmount() */
(function () {
  'use strict';
  const ID = 'rocks';
  const W = 960, H = 640, TAU = Math.PI * 2, STEP = 1 / 120;
  const ROT = 4.7, THRUST = 430, MAXV = 520, BULLET_V = 660, BULLET_LIFE = 0.92, MAX_BULLETS = 6;
  const ROCK_R = { 3: 46, 2: 25, 1: 13 }, ROCK_PTS = { 3: 20, 2: 50, 1: 100 }, ROCK_MASS = { 3: 7, 2: 3, 1: 1 };
  const EXTRA_LIFE = 10000;
  const C = { ember: '#ff8a3d', gold: '#ffc861', teal: '#6fd3c7', red: '#ff5a52', fg: '#f3ece5', muted: '#a3968a', bg: '#04060a' };
  const USED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'Escape', 'p', 'c', 'h', 'x', 'z', 'w', 'a', 'd']);
  const CSS = `
.ag-rocks{display:flex;gap:18px;align-items:flex-start;color:var(--fg);font-family:var(--body);user-select:none}
.ag-rocks.narrow{flex-direction:column;gap:10px}
.ag-rocks .ag-stage{flex:0 0 auto;line-height:0;position:relative}
.ag-rocks canvas{display:block;border-radius:14px;background:#04060a;box-shadow:0 0 0 1px var(--line),0 18px 40px rgba(0,0,0,.45);touch-action:none}
.ag-rocks .ag-side{flex:1 1 220px;min-width:210px;max-width:280px;display:flex;flex-direction:column;gap:12px}
.ag-rocks.narrow .ag-side{max-width:none;width:100%;order:-1}
.ag-rocks.narrow .ag-stats{grid-template-columns:repeat(4,1fr)}
.ag-rocks.narrow .ag-side{flex-direction:row;flex-wrap:wrap;align-items:center}
.ag-rocks.narrow .ag-side>*{flex:1 1 300px}
.ag-rocks.narrow details{display:none}
.ag-rocks h2{font-family:var(--display);font-size:22px;line-height:1.1;margin:0}
.ag-rocks h2 em{font-style:normal;color:var(--cool)}
.ag-rocks .ag-how{color:var(--muted);font-size:13px;margin:4px 0 0}
.ag-rocks .ag-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.ag-rocks .ag-stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.ag-rocks .ag-stat span{display:block;font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em}
.ag-rocks .ag-stat b{display:block;font-family:var(--mono);font-size:17px;font-weight:700}
.ag-rocks .ag-stat.hi b{color:var(--gold)}
.ag-rocks .ag-btns{display:flex;gap:8px;flex-wrap:wrap}
.ag-rocks .ag-keys{font-size:12px;color:var(--dim);line-height:1.8}
.ag-rocks kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-rocks details{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--muted)}
.ag-rocks summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-rocks details ul{margin:8px 0 2px;padding-left:18px}
.ag-rocks details li{margin:3px 0}
`;

  let el = null, api = null, root = null, cv = null, ctx = null, side = null, ui = {};
  let raf = 0, lastT = 0, acc = 0, ro = null, dpr = 1, sc = 1, S = null, AC = null, NOISE = null, soundOn = true, best = 0, FONT = 'system-ui';
  let stars = [], grads = null;
  const keys = {};
  const listeners = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };
  const visible = () => !!(el && !document.hidden && el.offsetParent !== null);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function wdx(ax, bx, size) { let d = bx - ax; if (d > size / 2) d -= size; else if (d < -size / 2) d += size; return d; }
  function wdist2(a, b) { const dx = wdx(a.x, b.x, W), dy = wdx(a.y, b.y, H); return dx * dx + dy * dy; }

  /* ---------- sound ---------- */
  function ensureAudio() {
    if (!soundOn || AC) return;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const len = AC.sampleRate | 0; NOISE = AC.createBuffer(1, len, AC.sampleRate);
      const d = NOISE.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { AC = null; }
  }
  function tone(type, f1, f2, dur, vol, at) {
    if (!AC || !soundOn) return;
    try {
      const t = AC.currentTime + (at || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.setValueAtTime(f1, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  function noise(dur, vol, freq, at) {
    if (!AC || !soundOn || !NOISE) return;
    try {
      const t = AC.currentTime + (at || 0), s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
      s.buffer = NOISE; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(AC.destination); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  function sfx(k) {
    switch (k) {
      case 'fire': tone('square', 1100, 260, 0.09, 0.035); break;
      case 'boom3': noise(0.7, 0.3, 1400); tone('sine', 90, 40, 0.5, 0.15); break;
      case 'boom2': noise(0.45, 0.24, 2000); break;
      case 'boom1': noise(0.25, 0.2, 3200); break;
      case 'ship': noise(1.1, 0.35, 1800); tone('sawtooth', 300, 40, 0.9, 0.08); break;
      case 'thrust': noise(0.12, 0.05, 500); break;
      case 'hyper': tone('sine', 200, 1600, 0.25, 0.08); tone('sine', 1600, 300, 0.25, 0.06, 0.3); break;
      case 'life': [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, 0, 0.12, 0.09, i * 0.08)); break;
      case 'beat0': tone('triangle', 62, 0, 0.11, 0.22); break;
      case 'beat1': tone('triangle', 55, 0, 0.11, 0.22); break;
      case 'siren0': tone('square', 880, 0, 0.07, 0.022); break;
      case 'siren1': tone('square', 1040, 0, 0.07, 0.022); break;
      case 'sirenS0': tone('square', 1320, 0, 0.05, 0.022); break;
      case 'sirenS1': tone('square', 1560, 0, 0.05, 0.022); break;
      case 'sfire': tone('sawtooth', 700, 200, 0.12, 0.03); break;
      case 'wave': [440, 660, 880].forEach((f, i) => tone('triangle', f, 0, 0.1, 0.06, i * 0.07)); break;
      case 'start': [330, 440, 660].forEach((f, i) => tone('square', f, 0, 0.08, 0.05, i * 0.07)); break;
    }
  }

  /* ---------- game ---------- */
  function newShip() { return { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, alive: true, inv: 2.4, cool: 0, hyperT: 0, hyperCool: 0, thrust: false, thrustSnd: 0 }; }
  function newGame() {
    S = { phase: 'ready', paused: false, autoPaused: false, ship: newShip(), bullets: [], rocks: [], saucer: null, sbullets: [], parts: [], debris: [], texts: [],
      score: 0, lives: 3, wave: 0, nextLife: EXTRA_LIFE, waveT: 0, waveStartMass: 1, saucerT: 18, beatT: 1, beatI: 0, shake: 0, time: 0, overT: 0,
      respawnT: 0, endT: 0, fireQueued: false, banner: null, newHi: false, frames: 0, kills: 0 };
    // attract-mode rocks drifting behind the title
    for (let i = 0; i < 6; i++) S.rocks.push(makeRock(rnd(0, W), rnd(0, H), 3 - (i % 3), 0.7));
    syncUI(); draw();
  }
  function makeRock(x, y, size, spdMul) {
    const r = ROCK_R[size], n = 9 + ((Math.random() * 5) | 0), verts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rnd(-0.18, 0.18); const rr = r * rnd(0.72, 1.08); verts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    const ang = rnd(0, TAU), sp = rnd(30, 70) * (size === 3 ? 1 : size === 2 ? 1.45 : 1.95) * (spdMul || 1);
    return { x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, size, r, verts, rot: rnd(0, TAU), spin: rnd(-1, 1) * (4 - size) * 0.5, hue: Math.random() < 0.18 };
  }
  function startGame() {
    newGame();
    S.rocks = []; S.phase = 'play'; S.ship = newShip(); S.saucerT = rnd(16, 24);
    sfx('start'); nextWave(); syncUI(); kick();
  }
  function nextWave() {
    S.wave++;
    const n = Math.min(4 + (S.wave - 1), 11), spd = Math.min(1 + (S.wave - 1) * 0.09, 1.9);
    for (let i = 0; i < n; i++) {
      let x, y, tries = 0;
      do {
        if (Math.random() < 0.5) { x = rnd(0, W); y = Math.random() < 0.5 ? rnd(-20, 40) : rnd(H - 40, H + 20); }
        else { y = rnd(0, H); x = Math.random() < 0.5 ? rnd(-20, 40) : rnd(W - 40, W + 20); }
        x = (x + W) % W; y = (y + H) % H;
      } while (tries++ < 20 && wdist2({ x, y }, S.ship) < 220 * 220);
      S.rocks.push(makeRock(x, y, 3, spd));
    }
    S.waveStartMass = n * 7; S.beatI = 0; S.beatT = 0.8;
    S.banner = { text: 'WAVE ' + S.wave, t: 0 };
    if (S.wave > 1) sfx('wave');
    syncUI();
  }
  function addScore(n) {
    S.score += n;
    if (S.score >= S.nextLife) {
      S.nextLife += EXTRA_LIFE; S.lives = Math.min(S.lives + 1, 9); sfx('life');
      S.texts.push({ x: W / 2, y: 70, s: 'EXTRA SHIP', t: 0, life: 1.8, color: C.gold, big: true });
    }
    if (S.score > best) { best = S.score; S.newHi = true; }
    syncUI();
  }
  function fire() {
    const sh = S.ship;
    if (!sh.alive || sh.hyperT > 0 || sh.cool > 0) return false;
    if (S.bullets.length >= MAX_BULLETS) return false;
    const ca = Math.cos(sh.a), sa = Math.sin(sh.a);
    S.bullets.push({ x: sh.x + ca * 17, y: sh.y + sa * 17, vx: ca * BULLET_V + sh.vx * 0.6, vy: sa * BULLET_V + sh.vy * 0.6, life: BULLET_LIFE });
    sh.cool = S.fireQueued ? 0.085 : 0.19; sh.vx -= ca * 6; sh.vy -= sa * 6;
    sfx('fire');
    return true;
  }
  function hyperspace() {
    const sh = S.ship;
    if (S.phase !== 'play' || S.paused || !sh.alive || sh.hyperT > 0 || sh.hyperCool > 0) return;
    sh.hyperT = 0.5; sh.hyperCool = 1.4; sh.vx = 0; sh.vy = 0;
    swirl(sh.x, sh.y, C.teal, true); sfx('hyper');
  }
  function swirl(x, y, color, inward) {
    for (let i = 0; i < 26; i++) {
      const a = rnd(0, TAU), v = rnd(60, 200), d = inward ? 50 : 0;
      S.parts.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * v * (inward ? -0.6 : 1), vy: Math.sin(a) * v * (inward ? -0.6 : 1), t: 0, life: rnd(0.3, 0.6), color, size: 2 });
    }
  }
  function explode(x, y, n, color, spd, life) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(spd * 0.2, spd);
      S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rnd(life * 0.5, life), color: Math.random() < 0.3 ? C.fg : color, size: rnd(1.4, 2.6) });
    }
  }
  function breakRock(i, byPlayer) {
    const r = S.rocks[i];
    S.rocks.splice(i, 1);
    explode(r.x, r.y, 8 + r.size * 7, r.hue ? C.ember : C.teal, 90 + r.size * 40, 0.5 + r.size * 0.15);
    S.shake = Math.max(S.shake, r.size * 2.5);
    sfx('boom' + r.size);
    if (byPlayer) { addScore(ROCK_PTS[r.size]); S.kills++; }
    if (r.size > 1) {
      const spd = Math.min(1 + (S.wave - 1) * 0.07, 1.7);
      for (let k = 0; k < 2; k++) {
        const nr = makeRock(r.x + rnd(-6, 6), r.y + rnd(-6, 6), r.size - 1, spd);
        nr.vx += r.vx * 0.35; nr.vy += r.vy * 0.35; nr.hue = r.hue;
        S.rocks.push(nr);
      }
    }
  }
  function killShip() {
    const sh = S.ship;
    if (!sh.alive) return;
    sh.alive = false; S.lives--;
    explode(sh.x, sh.y, 40, C.ember, 240, 1.1);
    const pts = shipPoly();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], ca = Math.cos(sh.a), sa = Math.sin(sh.a);
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      const wx = sh.x + mx * ca - my * sa, wy = sh.y + mx * sa + my * ca;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const ang = Math.atan2(wy - sh.y, wx - sh.x) + rnd(-0.6, 0.6), v = rnd(30, 90);
      S.debris.push({ x: wx, y: wy, vx: sh.vx * 0.3 + Math.cos(ang) * v, vy: sh.vy * 0.3 + Math.sin(ang) * v, a: Math.atan2(q[1] - p[1], q[0] - p[0]) + sh.a, spin: rnd(-4, 4), len, t: 0, life: rnd(1.4, 2.2) });
    }
    S.shake = 14; sfx('ship');
    S.respawnT = 2.2;
    if (S.lives <= 0) S.endT = 2.3;
    syncUI();
  }
  function gameOver() {
    S.phase = 'over'; S.overT = 0;
    if (S.score >= best && S.score > 0) { best = S.score; try { api.save('best', best); } catch (e) { /* ignore */ } }
    syncUI();
  }
  function spawnSaucer() {
    const small = S.wave >= 2 && Math.random() < Math.min(0.8, 0.14 * (S.wave - 1) + S.score / 40000);
    const fromLeft = Math.random() < 0.5, sp = (small ? 150 : 105) * Math.min(1 + S.wave * 0.03, 1.4);
    S.saucer = { x: fromLeft ? -30 : W + 30, y: rnd(60, H - 60), vx: fromLeft ? sp : -sp, vy: 0, small, r: small ? 11 : 21, fireT: rnd(0.6, 1.1), turnT: rnd(0.6, 1.4), sirenT: 0, sirenI: 0 };
  }
  function saucerFire() {
    const u = S.saucer, sh = S.ship;
    let a;
    if (u.small && sh.alive && sh.hyperT <= 0) {
      const dx = wdx(u.x, sh.x, W), dy = wdx(u.y, sh.y, H);
      const err = Math.max(0.06, 0.36 - S.score / 60000 - S.wave * 0.015);
      a = Math.atan2(dy, dx) + rnd(-err, err);
    } else a = rnd(0, TAU);
    S.sbullets.push({ x: u.x + Math.cos(a) * u.r, y: u.y + Math.sin(a) * u.r, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, life: 1.5 });
    sfx('sfire');
  }
  function destroySaucer(byPlayer) {
    const u = S.saucer; S.saucer = null;
    explode(u.x, u.y, 36, C.gold, 230, 0.9); S.shake = Math.max(S.shake, 8); sfx('boom2'); sfx('boom1');
    if (byPlayer) { const pts = u.small ? 1000 : 200; addScore(pts); S.texts.push({ x: u.x, y: u.y, s: String(pts), t: 0, life: 1.2, color: C.gold }); }
  }
  function centerClear() {
    for (const r of S.rocks) if (wdist2(r, { x: W / 2, y: H / 2 }) < (r.r + 110) ** 2) return false;
    for (const b of S.sbullets) if (wdist2(b, { x: W / 2, y: H / 2 }) < 120 * 120) return false;
    return true;
  }
  function wrapPos(o) { if (o.x < 0) o.x += W; else if (o.x >= W) o.x -= W; if (o.y < 0) o.y += H; else if (o.y >= H) o.y -= H; }

  function step(dt) {
    S.time += dt;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 30);
    for (const p of S.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.6; p.vy *= 1 - dt * 1.6; }
    if (S.parts.length) S.parts = S.parts.filter((p) => p.t < p.life);
    for (const d of S.debris) { d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.a += d.spin * dt; }
    if (S.debris.length) S.debris = S.debris.filter((d) => d.t < d.life);
    for (const t of S.texts) { t.t += dt; t.y -= dt * 22; }
    if (S.texts.length) S.texts = S.texts.filter((t) => t.t < t.life);
    if (S.banner) { S.banner.t += dt; if (S.banner.t > 2.2) S.banner = null; }
    // rocks drift in every phase (they are the title backdrop too)
    for (const r of S.rocks) { r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.spin * dt; wrapPos(r); }
    if (S.phase === 'over') { S.overT += dt; return; }
    if (S.phase !== 'play') return;

    const sh = S.ship;
    // ship
    if (sh.alive) {
      sh.cool -= dt; sh.hyperCool -= dt; if (sh.inv > 0) sh.inv -= dt;
      if (sh.hyperT > 0) {
        sh.hyperT -= dt;
        if (sh.hyperT <= 0) { sh.x = rnd(40, W - 40); sh.y = rnd(40, H - 40); swirl(sh.x, sh.y, C.teal, false); }
      } else {
        const L = keys.ArrowLeft || keys.a, R = keys.ArrowRight || keys.d, U = keys.ArrowUp || keys.w;
        sh.a += ((R ? 1 : 0) - (L ? 1 : 0)) * ROT * dt;
        sh.thrust = !!U;
        if (U) {
          const ca = Math.cos(sh.a), sa = Math.sin(sh.a);
          sh.vx += ca * THRUST * dt; sh.vy += sa * THRUST * dt;
          if (Math.random() < dt * 40) {
            const a = sh.a + Math.PI + rnd(-0.35, 0.35), v = rnd(80, 180);
            S.parts.push({ x: sh.x - ca * 9, y: sh.y - sa * 9, vx: Math.cos(a) * v + sh.vx, vy: Math.sin(a) * v + sh.vy, t: 0, life: rnd(0.15, 0.35), color: Math.random() < 0.5 ? C.gold : C.ember, size: 1.6 });
          }
          sh.thrustSnd -= dt; if (sh.thrustSnd <= 0) { sh.thrustSnd = 0.11; sfx('thrust'); }
        }
        const f = Math.pow(0.6, dt); sh.vx *= f; sh.vy *= f;
        const sp = Math.hypot(sh.vx, sh.vy); if (sp > MAXV) { sh.vx *= MAXV / sp; sh.vy *= MAXV / sp; }
        sh.x += sh.vx * dt; sh.y += sh.vy * dt; wrapPos(sh);
        if (S.fireQueued) { if (fire() || S.bullets.length >= MAX_BULLETS) S.fireQueued = false; }
        else if ((keys.Space || keys.z) && sh.cool <= 0) fire();
      }
    } else {
      S.fireQueued = false;
      if (S.lives <= 0) { S.endT -= dt; if (S.endT <= 0) { gameOver(); return; } }
      else { S.respawnT -= dt; if (S.respawnT <= 0 && (centerClear() || S.respawnT < -3)) { S.ship = newShip(); swirl(W / 2, H / 2, C.ember, true); } }
    }
    // bullets
    for (const b of S.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; wrapPos(b); }
    for (const b of S.sbullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; wrapPos(b); }
    // saucer
    if (!S.saucer && S.waveT <= 0 && S.ship.alive && S.rocks.length) { S.saucerT -= dt; if (S.saucerT <= 0) { spawnSaucer(); S.saucerT = Math.max(7, rnd(15, 24) - S.wave * 1.2); } }
    const u = S.saucer;
    if (u) {
      u.x += u.vx * dt; u.y += u.vy * dt;
      if (u.y < 0) u.y += H; else if (u.y >= H) u.y -= H;
      u.turnT -= dt; if (u.turnT <= 0) { u.turnT = rnd(0.7, 1.5); u.vy = [-1, 0, 1][(Math.random() * 3) | 0] * Math.abs(u.vx) * 0.7; }
      u.fireT -= dt; if (u.fireT <= 0) { u.fireT = u.small ? Math.max(0.55, 1.0 - S.wave * 0.04) : 1.15; saucerFire(); }
      u.sirenT -= dt; if (u.sirenT <= 0) { u.sirenT = u.small ? 0.09 : 0.13; u.sirenI ^= 1; sfx((u.small ? 'sirenS' : 'siren') + u.sirenI); }
      if (u.x < -40 || u.x > W + 40) S.saucer = null;
    }
    // collisions: player bullets
    for (let i = S.bullets.length - 1; i >= 0; i--) {
      const b = S.bullets[i];
      if (b.life <= 0) { S.bullets.splice(i, 1); continue; }
      let hit = false;
      for (let j = S.rocks.length - 1; j >= 0; j--) {
        const r = S.rocks[j];
        if (wdist2(b, r) < (r.r * 0.95) ** 2) { breakRock(j, true); hit = true; break; }
      }
      if (!hit && S.saucer && wdist2(b, S.saucer) < (S.saucer.r + 2) ** 2) { destroySaucer(true); hit = true; }
      if (hit) S.bullets.splice(i, 1);
    }
    for (let i = S.sbullets.length - 1; i >= 0; i--) {
      const b = S.sbullets[i];
      if (b.life <= 0) { S.sbullets.splice(i, 1); continue; }
      let hit = false;
      for (let j = S.rocks.length - 1; j >= 0; j--) { const r = S.rocks[j]; if (wdist2(b, r) < (r.r * 0.9) ** 2) { breakRock(j, false); hit = true; break; } }
      const s2 = S.ship;
      if (!hit && s2.alive && s2.hyperT <= 0 && s2.inv <= 0 && wdist2(b, s2) < 11 * 11) { killShip(); hit = true; }
      if (hit) S.sbullets.splice(i, 1);
    }
    // saucer vs rocks and ship
    if (S.saucer) {
      for (let j = S.rocks.length - 1; j >= 0; j--) { const r = S.rocks[j]; if (wdist2(S.saucer, r) < (r.r * 0.85 + S.saucer.r) ** 2) { breakRock(j, false); destroySaucer(false); break; } }
    }
    const s3 = S.ship;
    if (s3.alive && s3.hyperT <= 0 && s3.inv <= 0) {
      for (let j = S.rocks.length - 1; j >= 0; j--) {
        const r = S.rocks[j];
        if (wdist2(s3, r) < (r.r * 0.86 + 9) ** 2) { breakRock(j, true); killShip(); break; }
      }
      if (s3.alive && S.saucer && wdist2(s3, S.saucer) < (S.saucer.r + 10) ** 2) { destroySaucer(true); killShip(); }
    }
    // heartbeat
    if (S.ship.alive && S.rocks.length) {
      let mass = 0; for (const r of S.rocks) mass += ROCK_MASS[r.size];
      const iv = 0.26 + 0.74 * clamp(mass / S.waveStartMass, 0, 1);
      S.beatT -= dt; if (S.beatT <= 0) { S.beatT = iv; sfx('beat' + S.beatI); S.beatI ^= 1; }
    }
    // wave clear
    if (!S.rocks.length && !S.saucer) {
      if (S.waveT <= 0) S.waveT = 2.4;
      S.waveT -= dt; if (S.waveT <= 0) { S.waveT = 0; nextWave(); }
    }
  }

  /* ---------- loop ---------- */
  const animating = () => S && !S.paused && (S.phase === 'play' || S.parts.length > 0 || S.debris.length > 0 || S.phase === 'ready' || S.phase === 'over');
  function kick() { if (!raf && el) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    if (!visible()) { autoPause(); return; }
    S.frames++;
    if (!lastT) lastT = t;
    const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    if (!S.paused) { acc += dt; let n = 0; while (acc >= STEP && n++ < 14) { acc -= STEP; step(STEP); } if (acc > STEP) acc = 0; }
    draw();
    if (animating()) raf = requestAnimationFrame(frame);
  }
  function autoPause() {
    if (S && S.phase === 'play' && !S.paused) { S.paused = true; S.autoPaused = true; syncUI(); }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function setPaused(v) {
    if (!S || S.phase !== 'play') return;
    S.paused = v; S.autoPaused = false;
    if (v) for (const k in keys) keys[k] = false;
    syncUI();
    if (!v) kick(); else if (visible()) draw();
  }

  /* ---------- drawing ---------- */
  function shipPoly() { return [[17, 0], [-11, -11], [-6, 0], [-11, 11]]; }
  function wrapOffsets(x, y, r) {
    const xs = [0], ys = [0];
    if (x - r < 0) xs.push(W); else if (x + r > W) xs.push(-W);
    if (y - r < 0) ys.push(H); else if (y + r > H) ys.push(-H);
    const out = []; for (const ox of xs) for (const oy of ys) out.push([ox, oy]); return out;
  }
  function txt(s, x, y, size, color, weight, align, glow) {
    ctx.font = `${weight || 700} ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = (glow == null ? 12 : glow) * sc * dpr;
    ctx.fillText(s, x, y); ctx.shadowBlur = 0;
  }
  function drawShipShape(x, y, a, s, color, glow) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
    ctx.beginPath(); const p = shipPoly(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath();
    ctx.fillStyle = 'rgba(255,138,61,0.10)'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2 / s; ctx.lineJoin = 'round'; ctx.shadowColor = color; ctx.shadowBlur = glow * sc * dpr; ctx.stroke();
    ctx.restore();
  }
  function draw() {
    if (!ctx || !S) return;
    const k = sc * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, cv.width, cv.height);
    let ox = 0, oy = 0; if (S.shake > 0.2 && !S.paused) { ox = rnd(-1, 1) * S.shake; oy = rnd(-1, 1) * S.shake; }
    ctx.setTransform(k, 0, 0, k, ox * k, oy * k);
    // nebula + stars
    if (!grads) {
      const g1 = ctx.createRadialGradient(W * 0.2, H * 0.25, 0, W * 0.2, H * 0.25, 420); g1.addColorStop(0, 'rgba(111,211,199,0.07)'); g1.addColorStop(1, 'rgba(111,211,199,0)');
      const g2 = ctx.createRadialGradient(W * 0.82, H * 0.8, 0, W * 0.82, H * 0.8, 460); g2.addColorStop(0, 'rgba(255,138,61,0.07)'); g2.addColorStop(1, 'rgba(255,138,61,0)');
      grads = [g1, g2];
    }
    ctx.fillStyle = grads[0]; ctx.fillRect(-20, -20, W + 40, H + 40); ctx.fillStyle = grads[1]; ctx.fillRect(-20, -20, W + 40, H + 40);
    for (const s of stars) { ctx.globalAlpha = s.b * (0.6 + 0.4 * Math.sin(S.time * s.f + s.p)); ctx.fillStyle = s.c; ctx.fillRect(s.x, s.y, s.s, s.s); }
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // rocks
    const dimRocks = S.phase === 'ready' ? 0.55 : 1;
    for (const r of S.rocks) {
      const col = r.hue ? C.ember : C.teal;
      for (const [wx, wy] of wrapOffsets(r.x, r.y, r.r + 4)) {
        ctx.save(); ctx.translate(r.x + wx, r.y + wy); ctx.rotate(r.rot);
        ctx.beginPath(); ctx.moveTo(r.verts[0][0], r.verts[0][1]); for (let i = 1; i < r.verts.length; i++) ctx.lineTo(r.verts[i][0], r.verts[i][1]); ctx.closePath();
        ctx.globalAlpha = dimRocks;
        ctx.fillStyle = r.hue ? 'rgba(255,138,61,0.06)' : 'rgba(111,211,199,0.05)'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.shadowColor = col; ctx.shadowBlur = 10 * k; ctx.stroke();
        // a crater line for texture on big rocks
        if (r.size >= 2) { ctx.shadowBlur = 0; ctx.globalAlpha = 0.35 * dimRocks; ctx.beginPath(); ctx.arc(r.r * 0.2, -r.r * 0.15, r.r * 0.22, 0.3, 2.6); ctx.stroke(); }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    // saucer
    const u = S.saucer;
    if (u) {
      const s = u.r / 21;
      ctx.save(); ctx.translate(u.x, u.y); ctx.scale(s, s);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 1.8 / s; ctx.shadowColor = C.gold; ctx.shadowBlur = 12 * k;
      ctx.beginPath();
      ctx.moveTo(-21, 2); ctx.lineTo(-9, -5); ctx.lineTo(9, -5); ctx.lineTo(21, 2); ctx.lineTo(10, 9); ctx.lineTo(-10, 9); ctx.closePath();
      ctx.moveTo(-21, 2); ctx.lineTo(21, 2);
      ctx.moveTo(-7, -5); ctx.quadraticCurveTo(0, -17, 7, -5);
      ctx.fillStyle = 'rgba(255,200,97,0.10)'; ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = Math.floor(S.time * 8) % 2 ? C.red : C.gold;
      for (const lx of [-12, 0, 12]) { ctx.beginPath(); ctx.arc(lx, 5.5, 1.6, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    // bullets
    ctx.shadowBlur = 10 * k;
    ctx.shadowColor = C.gold; ctx.fillStyle = '#fff4d6';
    for (const b of S.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 2.4, 0, TAU); ctx.fill(); }
    ctx.shadowColor = C.red; ctx.fillStyle = '#ffb0a8';
    for (const b of S.sbullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 2.6, 0, TAU); ctx.fill(); }
    ctx.shadowBlur = 0;
    // ship
    const sh = S.ship;
    if (S.phase === 'play' && sh.alive && sh.hyperT <= 0) {
      const blink = sh.inv > 0 && Math.floor(sh.inv * 10) % 2 === 0;
      for (const [wx, wy] of wrapOffsets(sh.x, sh.y, 20)) {
        const x = sh.x + wx, y = sh.y + wy;
        if (sh.thrust && !S.paused && Math.random() < 0.85) {
          ctx.save(); ctx.translate(x, y); ctx.rotate(sh.a);
          const len = rnd(10, 20);
          ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(-8 - len, 0); ctx.lineTo(-8, 5);
          ctx.strokeStyle = C.gold; ctx.lineWidth = 1.8; ctx.shadowColor = C.ember; ctx.shadowBlur = 14 * k; ctx.stroke();
          ctx.restore();
        }
        drawShipShape(x, y, sh.a, 1, blink ? 'rgba(255,138,61,0.35)' : C.ember, blink ? 4 : 14);
        if (sh.inv > 0) {
          ctx.strokeStyle = 'rgba(111,211,199,' + (0.18 + 0.2 * Math.min(1, sh.inv)) + ')'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, 22 + Math.sin(S.time * 8) * 1.5, 0, TAU); ctx.stroke();
        }
      }
    }
    // debris + particles
    ctx.strokeStyle = C.ember; ctx.lineWidth = 1.8; ctx.shadowColor = C.ember; ctx.shadowBlur = 8 * k;
    for (const d of S.debris) {
      ctx.globalAlpha = Math.max(0, 1 - d.t / d.life);
      const c = Math.cos(d.a) * d.len / 2, s = Math.sin(d.a) * d.len / 2;
      ctx.beginPath(); ctx.moveTo(d.x - c, d.y - s); ctx.lineTo(d.x + c, d.y + s); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of S.parts) {
      const f = 1 - p.t / p.life; ctx.globalAlpha = f; ctx.fillStyle = p.color;
      const sz = p.size * (0.6 + f * 0.6); ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    for (const t of S.texts) { ctx.globalAlpha = Math.min(1, 2 * (1 - t.t / t.life)); txt(t.s, t.x, t.y, t.big ? 22 : 15, t.color, 700); }
    ctx.globalAlpha = 1;
    // HUD
    if (S.phase !== 'ready') {
      txt(String(S.score).padStart(2, '0'), 26, 30, 24, C.fg, 700, 'left', 8);
      for (let i = 0; i < Math.min(S.lives, 8); i++) drawShipShape(36 + i * 22, 62, -Math.PI / 2, 0.62, C.ember, 6);
      txt('WAVE ' + Math.max(1, S.wave), W - 26, 30, 15, C.teal, 600, 'right', 8);
      txt('BEST ' + best, W / 2, 26, 12, C.muted, 500, 'center', 0);
    }
    if (S.banner && S.phase === 'play') {
      const t = S.banner.t, a = t < 0.3 ? t / 0.3 : t > 1.7 ? Math.max(0, (2.2 - t) / 0.5) : 1;
      ctx.globalAlpha = a; txt(S.banner.text, W / 2, H / 2 - 90, 30, C.teal, 800); ctx.globalAlpha = 1;
    }
    if (S.phase === 'play' && !S.ship.alive && S.lives > 0 && S.respawnT <= 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(S.time * 6); txt('clearing space…', W / 2, H / 2 + 60, 13, C.muted, 500); ctx.globalAlpha = 1;
    }
    // overlays
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (S.phase === 'ready') {
      ctx.fillStyle = 'rgba(4,6,10,0.35)'; ctx.fillRect(0, 0, W, H);
      txt('ROCK', W / 2 - 4, H / 2 - 92, 62, C.ember, 800, 'right', 24);
      txt('DRIFT', W / 2 + 4, H / 2 - 92, 62, C.teal, 800, 'left', 24);
      txt('Press Enter or Space to launch', W / 2, H / 2 + 6, 20, C.fg, 600, 'center', 6);
      txt('←/→ rotate  ·  ↑ thrust  ·  Space fire  ·  C hyperspace  ·  P pause', W / 2, H / 2 + 46, 13, C.muted, 500, 'center', 0);
      txt('Rocks 20 / 50 / 100   ·   Saucers 200 / 1000   ·   Extra ship every 10,000', W / 2, H / 2 + 74, 12, C.muted, 500, 'center', 0);
      if (best) txt('BEST ' + best, W / 2, H / 2 + 120, 15, C.gold, 600);
    } else if (S.phase === 'over') {
      ctx.fillStyle = 'rgba(4,6,10,0.55)'; ctx.fillRect(0, 0, W, H);
      txt('GAME OVER', W / 2, H / 2 - 50, 46, C.red, 800, 'center', 20);
      txt(S.newHi ? 'New best: ' + S.score : 'Score ' + S.score + '  ·  Wave ' + S.wave, W / 2, H / 2 + 10, 20, S.newHi ? C.gold : C.fg, 600);
      if (S.overT > 1) txt('Press Enter or Space to fly again', W / 2, H / 2 + 52, 14, C.muted, 500, 'center', 0);
    } else if (S.paused) {
      ctx.fillStyle = 'rgba(4,6,10,0.6)'; ctx.fillRect(0, 0, W, H);
      txt('PAUSED', W / 2, H / 2 - 20, 40, C.gold, 800);
      txt('Press P, Enter or Space to resume', W / 2, H / 2 + 30, 14, C.muted, 500, 'center', 0);
    }
  }

  /* ---------- layout / ui ---------- */
  function fit() {
    if (!el || !cv || el.offsetParent === null) return;
    const narrow = el.clientWidth < 760;
    root.classList.toggle('narrow', narrow);
    const top = cv.parentNode.getBoundingClientRect().top;
    const availH = Math.max(240, window.innerHeight - top - 40);
    const availW = Math.max(280, narrow ? el.clientWidth : el.clientWidth - 18 - Math.max(210, side.offsetWidth || 230));
    const s = Math.max(0.3, Math.min(availW / W, availH / H, 1.2));
    const nd = window.devicePixelRatio || 1;
    if (Math.abs(s - sc) < 0.002 && nd === dpr && cv.width > 300) return;
    sc = s; dpr = nd;
    cv.style.width = Math.round(W * sc) + 'px'; cv.style.height = Math.round(H * sc) + 'px';
    cv.width = Math.round(W * sc * dpr); cv.height = Math.round(H * sc * dpr);
    draw();
  }
  function syncUI() {
    if (!ui.score || !S) return;
    ui.score.textContent = S.score; ui.best.textContent = best; ui.wave.textContent = Math.max(1, S.wave); ui.lives.textContent = Math.max(0, S.lives);
    ui.pause.textContent = S.paused ? 'Resume' : 'Pause'; ui.pause.disabled = S.phase !== 'play';
  }
  function keyName(e) {
    let k = e.key;
    if (k === ' ' || k === 'Spacebar') return 'Space';
    if (!k || k === 'Unidentified') { k = e.code || ''; if (k.startsWith('Key')) return k.slice(3).toLowerCase(); return k; }
    return k.length === 1 ? k.toLowerCase() : k;
  }
  function onKeyDown(e) {
    if (!el || el.offsetParent === null || !S) return;
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = keyName(e);
    if (!USED.has(k)) return;
    e.preventDefault(); ensureAudio();
    const first = !keys[k] && !e.repeat; keys[k] = true;
    if (!first) return;
    if (k === 'p' || k === 'Escape') { if (S.phase === 'play') setPaused(!S.paused); return; }
    if (S.phase === 'ready' || S.phase === 'over') {
      if (k === 'Enter' || (k === 'Space' && (S.phase === 'ready' || S.overT > 1))) startGame();
      return;
    }
    if (S.paused) { if (k === 'Enter' || k === 'Space') setPaused(false); return; }
    if (k === 'Enter') { setPaused(true); return; }
    if (k === 'Space' || k === 'z') S.fireQueued = true;
    else if (k === 'c' || k === 'h' || k === 'x') hyperspace();
  }
  function onKeyUp(e) { const k = keyName(e); if (k in keys) keys[k] = false; }

  function mount(container, theApi) {
    if (el) unmount();
    el = container; api = theApi || { load: () => null, save() {}, sound: false, toast() {} };
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    let b = null, sv = null;
    try { b = api.load('best'); sv = api.load('sound'); } catch (e) { /* ignore */ }
    best = typeof b === 'number' && isFinite(b) ? b : 0;
    soundOn = !!api.sound && sv !== false;
    for (const kk in keys) delete keys[kk];
    acc = 0; grads = null;
    stars = [];
    for (let i = 0; i < 140; i++) stars.push({ x: rnd(0, W), y: rnd(0, H), s: Math.random() < 0.15 ? 2 : 1, b: rnd(0.2, 0.75), f: rnd(0.5, 2.5), p: rnd(0, TAU), c: Math.random() < 0.2 ? '#ffd9b8' : Math.random() < 0.2 ? '#c4f1ea' : '#ffffff' });
    root = document.createElement('div'); root.className = 'ag-' + ID;
    root.innerHTML = `
      <div class="ag-stage"><canvas aria-label="Rock Drift playfield" tabindex="-1"></canvas></div>
      <div class="ag-side">
        <div><h2>Rock <em>Drift</em></h2><p class="ag-how">Pilot your drifting ship, blast the rocks into smaller and smaller pieces, and watch out for saucers.</p></div>
        <div class="ag-stats">
          <div class="ag-stat"><span>Score</span><b data-k="score">0</b></div>
          <div class="ag-stat hi"><span>Best</span><b data-k="best">0</b></div>
          <div class="ag-stat"><span>Wave</span><b data-k="wave">1</b></div>
          <div class="ag-stat"><span>Ships</span><b data-k="lives">3</b></div>
        </div>
        <div class="ag-btns">
          <button class="btn pri small" data-a="new">New game</button>
          <button class="btn sec small" data-a="pause">Pause</button>
          <button class="btn sec small" data-a="sound" title="Toggle sound"></button>
        </div>
        <div class="ag-keys">
          <kbd>←</kbd><kbd>→</kbd> rotate · <kbd>↑</kbd> thrust<br>
          <kbd>Space</kbd> fire (hold for auto-fire)<br>
          <kbd>C</kbd> hyperspace · <kbd>P</kbd> pause · <kbd>Enter</kbd> start
        </div>
        <details><summary>Tips</summary><ul>
          <li>Your ship keeps drifting: tap thrust, don't hold it, and turn to brake.</li>
          <li>Tapping Space fires faster than holding it.</li>
          <li>Big rocks are worth the least. Clear the small fast ones before they swarm you.</li>
          <li>The small saucer aims at you and is worth 1000. Shoot it first.</li>
          <li>Hyperspace drops you at a random spot. Use it when you're cornered, not for fun.</li>
          <li>An extra ship arrives every 10,000 points.</li>
        </ul></details>
      </div>`;
    el.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d'); side = root.querySelector('.ag-side');
    FONT = (getComputedStyle(root).getPropertyValue('--display').trim()) || 'system-ui';
    ui = { score: root.querySelector('[data-k=score]'), best: root.querySelector('[data-k=best]'), wave: root.querySelector('[data-k=wave]'), lives: root.querySelector('[data-k=lives]'),
      pause: root.querySelector('[data-a=pause]'), sound: root.querySelector('[data-a=sound]') };
    const setSoundLabel = () => { ui.sound.textContent = soundOn ? '🔊' : '🔇'; };
    setSoundLabel();
    on(root.querySelector('[data-a=new]'), 'click', (e) => { e.currentTarget.blur(); ensureAudio(); startGame(); });
    on(ui.pause, 'click', (e) => { e.currentTarget.blur(); setPaused(!S.paused); });
    on(ui.sound, 'click', (e) => { e.currentTarget.blur(); soundOn = !soundOn; setSoundLabel(); try { api.save('sound', soundOn); } catch (er) { /* ignore */ } if (soundOn) ensureAudio(); });
    on(cv, 'pointerdown', () => { ensureAudio(); if (S.phase === 'play' && S.paused) setPaused(false); else if (S.phase === 'ready' || (S.phase === 'over' && S.overT > 1)) startGame(); });
    on(window, 'keydown', onKeyDown);
    on(window, 'keyup', onKeyUp);
    on(window, 'resize', fit);
    on(window, 'blur', () => { for (const kk in keys) keys[kk] = false; if (S && el && S.phase === 'play' && !S.paused) { S.paused = true; S.autoPaused = true; syncUI(); if (visible()) draw(); } });
    on(document, 'visibilitychange', () => { if (document.hidden) autoPause(); else if (S && S.phase !== 'play') kick(); });
    if (window.ResizeObserver) { ro = new ResizeObserver(() => { fit(); if (S && S.phase !== 'play') kick(); }); ro.observe(el); }
    newGame(); fit(); draw(); kick();
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (S && S.newHi && api) { try { api.save('best', best); } catch (e) { /* ignore */ } }
    for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
    listeners.length = 0;
    if (ro) { ro.disconnect(); ro = null; }
    if (AC) { try { AC.close(); } catch (e) { /* ignore */ } AC = null; NOISE = null; }
    if (el) el.innerHTML = '';
    el = null; root = null; cv = null; ctx = null; ui = {}; S = null;
  }

  window.VanArcade = window.VanArcade || {};
  window.VanArcade[ID] = {
    mount, unmount,
    _debug: { get S() { return S; }, get raf() { return raf; }, start: () => startGame(), step: (n) => { for (let i = 0; i < (n || 1); i++) step(STEP); draw(); }, kill: () => killShip() },
  };
})();
