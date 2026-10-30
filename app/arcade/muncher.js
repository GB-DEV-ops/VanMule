/* VanMule Arcade: Mule Muncher - an original maze-chase game.
   window.VanArcade.muncher.mount(el, api) / unmount() */
(function () {
  'use strict';
  const ID = 'muncher';

  /* ---------- maze (left half, mirrored) ----------
     # wall   . hay pellet   o golden carrot   (space) open, no pellet   G gremlin pen   - pen door */
  const HALF = [
    '##############',
    '#.............',
    '#.###.######.#',
    '#o###.######.#',
    '#.............',
    '#.###.##.#####',
    '#.###.##.#####',
    '#.....##....##',
    '#####.#####.##',
    '#####.#####.##',
    '#####.###     ',
    '#####.### ###-',
    '#####.### #GGG',
    '     .    #GGG',
    '#####.### #GGG',
    '#####.### ####',
    '#####.###     ',
    '#####.###.####',
    '#####.###.####',
    '#............#',
    '#.###.##.###.#',
    '#o###.##.###.#',
    '#...#....#....',
    '###.#.####.###',
    '###.#.####.###',
    '#.....#......#',
    '#.#####.####.#',
    '#.#####.####.#',
    '#.#####.####.#',
    '#.............',
    '##############',
  ];
  const MAZE = HALF.map((r) => r + r.split('').reverse().join(''));
  const COLS = 28, ROWS = 31, HUD = 2, TROW = 13;
  const DOOR_Y = 10, PEN_Y = 13, FRUIT = { x: 13.5, y: 16 }, START = { x: 13.5, y: 22 };
  const DIRS = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
  const ORDER = ['up', 'left', 'down', 'right'];
  const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };
  const STEP = 1 / 120, BASE = 9.4;
  const GREMS = [
    { name: 'Scorch', color: '#ff4d5e', kind: 'chase', corner: { x: 25, y: -3 }, home: { x: 13.5, y: DOOR_Y } },
    { name: 'Hex', color: '#b57bff', kind: 'ambush', corner: { x: 2, y: -3 }, home: { x: 13.5, y: PEN_Y } },
    { name: 'Fern', color: '#9be34a', kind: 'flank', corner: { x: 27, y: 32 }, home: { x: 11.5, y: PEN_Y } },
    { name: 'Dusty', color: '#e0b98a', kind: 'wander', corner: { x: 0, y: 32 }, home: { x: 15.5, y: PEN_Y } },
  ];
  const ITEMS = [
    { kind: 'apple', pts: 100 }, { kind: 'carrot', pts: 300 }, { kind: 'carrot', pts: 300 }, { kind: 'hay', pts: 500 },
    { kind: 'hay', pts: 500 }, { kind: 'shoe', pts: 700 }, { kind: 'shoe', pts: 700 }, { kind: 'star', pts: 1000 },
    { kind: 'star', pts: 1000 }, { kind: 'bell', pts: 2000 },
  ];
  const itemFor = (lv) => ITEMS[Math.min(lv - 1, ITEMS.length - 1)];
  const CSS = `
.ag-muncher{display:flex;gap:18px;align-items:flex-start;color:var(--fg);font-family:var(--body);user-select:none}
.ag-muncher.narrow{flex-direction:column;gap:10px}
.ag-muncher .ag-stage{flex:0 0 auto;position:relative;line-height:0}
.ag-muncher canvas{display:block;border-radius:14px;background:#06080a;box-shadow:0 0 0 1px var(--line),0 18px 40px rgba(0,0,0,.45)}
.ag-muncher .ag-side{flex:1 1 220px;min-width:210px;max-width:300px;display:flex;flex-direction:column;gap:12px}
.ag-muncher.narrow .ag-side{max-width:none;width:100%;order:-1}
.ag-muncher h2{font-family:var(--display);font-size:22px;line-height:1.1;margin:0;letter-spacing:.3px}
.ag-muncher h2 em{font-style:normal;color:var(--ember)}
.ag-muncher .ag-how{color:var(--muted);font-size:13px;margin:0}
.ag-muncher .ag-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.ag-muncher .ag-stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.ag-muncher .ag-stat span{display:block;font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em}
.ag-muncher .ag-stat b{display:block;font-family:var(--mono);font-size:17px;font-weight:700;color:var(--fg)}
.ag-muncher .ag-stat.hi b{color:var(--gold)}
.ag-muncher .ag-btns{display:flex;gap:8px;flex-wrap:wrap}
.ag-muncher .ag-keys{font-size:12px;color:var(--dim);line-height:1.7}
.ag-muncher kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-muncher details{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--muted)}
.ag-muncher summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-muncher details ul{margin:8px 0 2px;padding-left:18px}
.ag-muncher details li{margin:3px 0}
.ag-muncher .ag-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:0}
`;

  /* ---------- module state ---------- */
  let el = null, api = null, root = null, cv = null, ctx = null, bgCv = null, flashCv = null, side = null;
  let raf = 0, lastT = 0, acc = 0, ro = null, dpr = 1, ts = 18, S = null, hi = 0, soundOn = true, AC = null;
  let ui = {};
  const listeners = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };

  const visible = () => !!(el && !document.hidden && el.offsetParent !== null);
  const tileAt = (x, y) => (y < 0 || y >= ROWS ? '#' : MAZE[y][((x % COLS) + COLS) % COLS]);
  const open = (x, y) => { const c = tileAt(x, y); return c !== '#' && c !== 'G' && c !== '-'; };
  const inTunnel = (e) => Math.round(e.y) === TROW && (e.x < 5.5 || e.x > 21.5);

  /* ---------- sound ---------- */
  function ensureAudio() {
    if (!soundOn || AC) return;
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
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
  let munchAlt = false;
  function sfx(k) {
    if (!AC || !soundOn) return;
    switch (k) {
      case 'munch': munchAlt = !munchAlt; tone('triangle', munchAlt ? 420 : 300, munchAlt ? 300 : 420, 0.06, 0.07); break;
      case 'power': tone('sawtooth', 200, 900, 0.3, 0.08); break;
      case 'eat': tone('square', 300, 1500, 0.25, 0.08); break;
      case 'fruit': tone('sine', 700, 1400, 0.18, 0.12); tone('sine', 1400, 1800, 0.12, 0.1, 0.12); break;
      case 'die': tone('sawtooth', 700, 80, 1.2, 0.1); break;
      case 'life': [880, 1100, 1320].forEach((f, i) => tone('square', f, 0, 0.1, 0.06, i * 0.1)); break;
      case 'start': [392, 523, 659, 784, 659, 784].forEach((f, i) => tone('square', f, 0, 0.12, 0.06, i * 0.13)); break;
      case 'clear': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, 0, 0.14, 0.1, i * 0.1)); break;
    }
  }

  /* ---------- game setup ---------- */
  function newState() {
    return { phase: 'title', phaseT: 0, paused: false, score: 0, lives: 3, level: 1, extra: false, dots: null, dotsLeft: 0,
      eaten: 0, sinceReset: 0, afterDeath: false, idleT: 0, modeIdx: 0, modeT: 0, frT: 0, chain: 0, fruit: null, fruitsSpawned: 0,
      pops: [], p: null, g: [], time: 0, frames: 0, steps: 0 };
  }
  function resetDots() {
    S.dots = MAZE.map((r) => r.split('').map((c) => (c === '.' || c === 'o' ? c : '')));
    S.dotsLeft = S.dots.reduce((n, r) => n + r.filter(Boolean).length, 0);
    S.eaten = 0; S.fruitsSpawned = 0;
  }
  function resetActors() {
    S.p = { x: START.x, y: START.y, px: START.x, py: START.y, dir: 'left', face: 'left', next: 'left', moving: true, mouth: 0, dead: 0 };
    S.g = GREMS.map((d, i) => ({ i, d, x: d.home.x, y: d.home.y, px: d.home.x, py: d.home.y, dir: i === 0 ? 'left' : (i === 2 ? 'down' : 'up'),
      state: i === 0 ? 'active' : 'house', fr: false, wt: { x: 14, y: 14 }, wtT: 0, bob: i * 0.7 }));
    S.modeIdx = 0; S.modeT = 0; S.frT = 0; S.chain = 0; S.fruit = null; S.idleT = 0; S.sinceReset = 0; S.pops = [];
  }
  function startGame() {
    S = newState();
    resetDots(); resetActors();
    setPhase('ready', 2.4); sfx('start'); syncUI(); kick();
  }
  function setPhase(ph, t) { S.phase = ph; S.phaseT = t || 0; }
  const lvlMul = () => Math.min(S.level, 8) - 1;
  const pSpeed = () => BASE * (0.8 + 0.025 * lvlMul()) * (S.frT > 0 ? 1.1 : 1);
  function gSpeed(g) {
    if (g.state === 'eyes' || g.state === 'entering') return BASE * 1.7;
    if (g.state === 'house' || g.state === 'leaving') return BASE * 0.45;
    let s = BASE * (0.74 + 0.035 * lvlMul());
    if (inTunnel(g)) return s * 0.5;
    if (g.fr) return s * 0.62;
    if (g.d.kind === 'chase' && S.dotsLeft < 24) s *= 1.08;
    return s;
  }
  function modeTable() {
    if (S.level === 1) return [7, 20, 7, 20, 5, 20, 5, Infinity];
    if (S.level < 5) return [7, 20, 7, 20, 5, 60, 1, Infinity];
    return [5, 20, 5, 20, 5, 60, 1, Infinity];
  }
  const frightTime = () => Math.max(1.5, 6.6 - S.level * 0.6);
  const curMode = () => (S.modeIdx % 2 === 0 ? 'scatter' : 'chase');

  /* ---------- grid movement ---------- */
  function wrapX(e) { if (e.x < -0.5) { e.x += COLS; e.jump = true; } else if (e.x > COLS - 0.5) { e.x -= COLS; e.jump = true; } }
  function moveGrid(e, dist, decide) {
    let guard = 0;
    while (dist > 1e-9 && guard++ < 8) {
      const cx = Math.round(e.x), cy = Math.round(e.y);
      if (Math.abs(e.x - cx) < 1e-6 && Math.abs(e.y - cy) < 1e-6) {
        e.x = cx; e.y = cy;
        decide(e, cx, cy);
        if (!e.moving) return;
      }
      const d = DIRS[e.dir];
      let target;
      if (d.x) target = d.x > 0 ? Math.floor(e.x + 1e-6) + 1 : Math.ceil(e.x - 1e-6) - 1;
      else target = d.y > 0 ? Math.floor(e.y + 1e-6) + 1 : Math.ceil(e.y - 1e-6) - 1;
      const cur = d.x ? e.x : e.y, step = Math.min(dist, Math.abs(target - cur));
      if (d.x) e.x += d.x * step; else e.y += d.y * step;
      dist -= step;
      if (Math.abs((d.x ? e.x : e.y) - target) < 1e-6) { if (d.x) e.x = target; else e.y = target; }
      wrapX(e);
    }
  }
  function playerDecide(p, cx, cy) {
    const n = DIRS[p.next];
    if (p.next && open(cx + n.x, cy + n.y)) { p.dir = p.next; p.moving = true; }
    else { const d = DIRS[p.dir]; p.moving = open(cx + d.x, cy + d.y); }
    if (p.moving) p.face = p.dir;
  }
  function gremTarget(g) {
    const p = S.p, px = Math.round(p.x), py = Math.round(p.y), pd = DIRS[p.face];
    if (g.state === 'eyes') return { x: 13, y: DOOR_Y };
    if (curMode() === 'scatter') return g.d.corner;
    switch (g.d.kind) {
      case 'chase': return { x: px, y: py };
      case 'ambush': return { x: px + pd.x * 4, y: py + pd.y * 4 };
      case 'flank': {
        const r = S.g[0], vx = px + pd.x * 2, vy = py + pd.y * 2;
        return { x: vx + (vx - Math.round(r.x)), y: vy + (vy - Math.round(r.y)) };
      }
      default: {
        const dx = px - g.x, dy = py - g.y;
        if (dx * dx + dy * dy < 36) return g.d.corner;
        return g.wt;
      }
    }
  }
  function gremDecide(g, cx, cy) {
    g.moving = true;
    if (g.state === 'eyes' && cy === DOOR_Y && (cx === 13 || cx === 14)) { g.state = 'entering'; g.moving = false; return; }
    const opts = ORDER.filter((k) => k !== OPP[g.dir] && open(cx + DIRS[k].x, cy + DIRS[k].y));
    if (!opts.length) { g.dir = OPP[g.dir]; return; }
    if (g.fr && g.state === 'active') { g.dir = opts[(Math.random() * opts.length) | 0]; return; }
    const t = gremTarget(g);
    let best = opts[0], bd = Infinity;
    for (const k of opts) {
      const nx = cx + DIRS[k].x, ny = cy + DIRS[k].y, dd = (nx - t.x) ** 2 + (ny - t.y) ** 2;
      if (dd < bd - 1e-9) { bd = dd; best = k; }
    }
    g.dir = best;
  }
  function moveToward(e, tx, ty, dist) {
    const dx = tx - e.x, dy = ty - e.y;
    if (Math.abs(dx) > 1e-6) { const s = Math.min(dist, Math.abs(dx)); e.x += Math.sign(dx) * s; e.dir = dx > 0 ? 'right' : 'left'; return dist - s; }
    if (Math.abs(dy) > 1e-6) { const s = Math.min(dist, Math.abs(dy)); e.y += Math.sign(dy) * s; e.dir = dy > 0 ? 'down' : 'up'; return dist - s; }
    return dist;
  }

  /* ---------- simulation ---------- */
  function step(dt) {
    S.steps++;
    S.time += dt;
    for (const pp of S.pops) pp.t -= dt;
    S.pops = S.pops.filter((pp) => pp.t > 0);
    if (S.phase === 'ready' || S.phase === 'freeze' || S.phase === 'clear' || S.phase === 'dying') {
      S.phaseT -= dt;
      if (S.phase === 'dying' && S.phaseT < 1.6) S.p.dead = Math.min(1, S.p.dead + dt / 1.4);
      if (S.phase === 'freeze') { // eaten gremlin eyes keep moving while frozen
        for (const g of S.g) if (g.state === 'eyes' || g.state === 'entering') { g.px = g.x; g.py = g.y; moveGremlin(g, dt); }
      }
      if (S.phaseT > 0) return;
      if (S.phase === 'ready' || S.phase === 'freeze') setPhase('play');
      else if (S.phase === 'clear') { S.level++; resetDots(); resetActors(); S.afterDeath = false; setPhase('ready', 1.8); syncUI(); }
      else if (S.phase === 'dying') {
        S.lives--; syncUI();
        if (S.lives <= 0) { setPhase('over'); S.paused = false; saveHi(); return; }
        resetActors(); S.afterDeath = true; setPhase('ready', 1.8);
      }
      return;
    }
    if (S.phase !== 'play') return;
    const p = S.p;
    p.px = p.x; p.py = p.y; p.jump = false;
    for (const g of S.g) { g.px = g.x; g.py = g.y; g.jump = false; }

    // modes
    if (S.frT > 0) {
      S.frT -= dt;
      if (S.frT <= 0) { S.frT = 0; S.chain = 0; for (const g of S.g) g.fr = false; }
    } else {
      S.modeT += dt;
      const tbl = modeTable();
      if (S.modeT >= tbl[S.modeIdx]) { S.modeT = 0; S.modeIdx = Math.min(S.modeIdx + 1, tbl.length - 1); reverseAll(); }
    }

    // player: instant reverse + forgiving cornering, then grid move
    if (p.next === OPP[p.dir]) { p.dir = p.next; p.face = p.dir; p.moving = true; }
    else if (p.next !== p.dir && p.moving) {
      const n = DIRS[p.next], d = DIRS[p.dir];
      if (n.x !== -d.x || n.y !== -d.y) {
        const cx = Math.round(p.x), cy = Math.round(p.y);
        const off = d.x ? Math.abs(p.x - cx) : Math.abs(p.y - cy);
        if (off > 1e-6 && off < 0.22 && open(cx + n.x, cy + n.y)) { p.x = cx; p.y = cy; }
      }
    } else if (!p.moving) {
      const n = DIRS[p.next], cx = Math.round(p.x), cy = Math.round(p.y);
      if (open(cx + n.x, cy + n.y)) { p.dir = p.next; p.moving = true; }
    }
    moveGrid(p, pSpeed() * dt, playerDecide);
    if (p.moving) p.mouth += dt * 14;
    eatAt(Math.round(p.x), Math.round(p.y));
    if (S.phase !== 'play') return;

    // gremlins
    S.idleT += dt;
    releaseGremlins();
    for (const g of S.g) moveGremlin(g, dt);

    // fruit
    if (S.fruit) {
      S.fruit.t -= dt;
      if (S.fruit.t <= 0) S.fruit = null;
      else if (Math.abs(p.x - FRUIT.x) < 0.8 && Math.abs(p.y - FRUIT.y) < 0.5) {
        addScore(S.fruit.pts); pop(S.fruit.pts, FRUIT.x, FRUIT.y, '#ffc861'); sfx('fruit'); S.fruit = null;
      }
    }
    collide();
  }
  function reverseAll() { for (const g of S.g) if (g.state === 'active') g.dir = OPP[g.dir]; }
  function releaseGremlins() {
    const thr = S.afterDeath ? [0, 0, 7, 17] : S.level === 1 ? [0, 0, 30, 60] : S.level === 2 ? [0, 0, 0, 30] : [0, 0, 0, 0];
    const idleLimit = S.level < 5 ? 4 : 3;
    const g = S.g.find((x) => x.state === 'house');
    if (!g) return;
    if ((S.sinceReset >= thr[g.i] && S.time > 0.4) || S.idleT > idleLimit) { g.state = 'leaving'; S.idleT = 0; }
  }
  function moveGremlin(g, dt) {
    const sp = gSpeed(g) * dt;
    if (g.state === 'house') {
      g.bob += dt; const ty = PEN_Y + (Math.sin(g.bob * 5) * 0.35);
      g.dir = ty < g.y ? 'up' : 'down'; g.y = ty; return;
    }
    if (g.state === 'leaving') {
      let left = moveToward(g, 13.5, g.y, sp);
      if (Math.abs(g.x - 13.5) < 1e-6) left = moveToward(g, 13.5, DOOR_Y, left);
      if (Math.abs(g.x - 13.5) < 1e-6 && Math.abs(g.y - DOOR_Y) < 1e-6) { g.state = 'active'; g.dir = 'left'; g.moving = true; }
      return;
    }
    if (g.state === 'entering') {
      let left = moveToward(g, 13.5, DOOR_Y, sp);
      if (Math.abs(g.x - 13.5) < 1e-6) left = moveToward(g, 13.5, PEN_Y, left);
      if (Math.abs(g.y - PEN_Y) < 1e-6) { g.state = 'leaving'; g.fr = false; }
      return;
    }
    if (g.d.kind === 'wander') { g.wtT -= dt; if (g.wtT <= 0) { g.wtT = 2 + Math.random() * 3; g.wt = { x: (Math.random() * COLS) | 0, y: (Math.random() * ROWS) | 0 }; } }
    moveGrid(g, sp, gremDecide);
  }
  function eatAt(tx, ty) {
    if (ty < 0 || ty >= ROWS) return;
    tx = ((tx % COLS) + COLS) % COLS;
    const c = S.dots[ty][tx];
    if (!c) return;
    S.dots[ty][tx] = ''; S.dotsLeft--; S.eaten++; S.sinceReset++; S.idleT = 0;
    if (c === 'o') {
      addScore(50); sfx('power');
      S.frT = frightTime(); S.chain = 0;
      for (const g of S.g) if (g.state !== 'eyes' && g.state !== 'entering') { if (g.state === 'active') g.dir = OPP[g.dir]; g.fr = true; }
    } else { addScore(10); sfx('munch'); }
    if ((S.eaten === 70 || S.eaten === 170) && !S.fruit) { const it = itemFor(S.level); S.fruit = { kind: it.kind, pts: it.pts, t: 9.5 }; }
    if (S.dotsLeft <= 0) { setPhase('clear', 2.2); S.frT = 0; for (const g of S.g) g.fr = false; sfx('clear'); }
  }
  function collide() {
    const p = S.p;
    for (const g of S.g) {
      if (g.state !== 'active') continue;
      let dx = Math.abs(g.x - p.x); dx = Math.min(dx, COLS - dx);
      if (dx < 0.55 && Math.abs(g.y - p.y) < 0.55) {
        if (g.fr) {
          const pts = 200 * Math.pow(2, Math.min(S.chain, 3)); S.chain++;
          addScore(pts); pop(pts, g.x, g.y, '#6fd3c7'); g.state = 'eyes'; g.fr = false; sfx('eat');
          setPhase('freeze', 0.6);
        } else {
          setPhase('dying', 2.4); p.dead = 0; S.fruit = null; sfx('die'); return;
        }
      }
    }
  }
  function addScore(n) {
    const before = S.score; S.score += n;
    if (!S.extra && before < 10000 && S.score >= 10000) { S.extra = true; S.lives++; sfx('life'); if (api) api.toast('Extra mule! +1 life'); }
    if (S.score > hi) hi = S.score;
    syncUI();
  }
  function pop(n, x, y, c) { S.pops.push({ txt: String(n), x, y, c, t: 1.1 }); }
  function saveHi() { if (S.score >= hi && S.score > 0) { hi = S.score; try { api.save('hi', hi); } catch (e) { /* ignore */ } } syncUI(); }

  /* ---------- loop ---------- */
  const needsLoop = () => S && !S.paused && S.phase !== 'title' && S.phase !== 'over';
  function kick() { if (!raf && el) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    if (!visible()) { autoPause(); return; } // stop completely; resumes on user input
    S.frames++;
    if (!lastT) lastT = t;
    let dt = (t - lastT) / 1000; lastT = t;
    if (dt > 0.1) dt = 0.1;
    if (needsLoop()) {
      acc += dt; let n = 0;
      while (acc >= STEP && n++ < 14) { step(STEP); acc -= STEP; }
      if (n >= 14) acc = 0;
    }
    draw(needsLoop() ? acc / STEP : 1);
    if (needsLoop()) raf = requestAnimationFrame(frame);
  }
  function autoPause() {
    if (S && !S.paused && S.phase !== 'title' && S.phase !== 'over') { S.paused = true; S.autoPaused = true; syncUI(); }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function setPaused(v) {
    if (!S || S.phase === 'title' || S.phase === 'over') return;
    S.paused = v; S.autoPaused = false; syncUI();
    if (!v) { acc = 0; kick(); } else redraw();
  }
  function redraw() { if (visible() && ctx) draw(1); }

  /* ---------- drawing ---------- */
  function wallPath(m) {
    const path = new Path2D(), W = (x, y) => (y === TROW && (x < 0 || x >= COLS)) ? false : (x < 0 || x >= COLS || y < 0 || y >= ROWS) ? true : MAZE[y][x] === '#';
    const c = 1 - 2 * m;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!W(x, y)) continue;
      const L = W(x - 1, y), R = W(x + 1, y), U = W(x, y - 1), D = W(x, y + 1);
      path.rect(x + m, y + m, c, c);
      if (L) path.rect(x, y + m, m, c);
      if (R) path.rect(x + 1 - m, y + m, m, c);
      if (U) path.rect(x + m, y, c, m);
      if (D) path.rect(x + m, y + 1 - m, c, m);
      if (L && U && W(x - 1, y - 1)) path.rect(x, y, m, m);
      if (R && U && W(x + 1, y - 1)) path.rect(x + 1 - m, y, m, m);
      if (L && D && W(x - 1, y + 1)) path.rect(x, y + 1 - m, m, m);
      if (R && D && W(x + 1, y + 1)) path.rect(x + 1 - m, y + 1 - m, m, m);
    }
    return path;
  }
  function buildBg() {
    const pw = Math.round(COLS * ts * dpr), ph = Math.round(ROWS * ts * dpr), s = ts * dpr;
    const outer = wallPath(0.2), inner = wallPath(0.29);
    const mk = (color, glow) => {
      const o = document.createElement('canvas'); o.width = pw; o.height = ph;
      const line = document.createElement('canvas'); line.width = pw; line.height = ph;
      const lc = line.getContext('2d'); lc.setTransform(s, 0, 0, s, 0, 0);
      lc.fillStyle = color; lc.fill(outer); lc.globalCompositeOperation = 'destination-out'; lc.fill(inner);
      const c = o.getContext('2d');
      c.fillStyle = '#06080a'; c.fillRect(0, 0, pw, ph);
      c.setTransform(s, 0, 0, s, 0, 0); c.fillStyle = glow; c.fill(inner);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.shadowColor = color; c.shadowBlur = s * 0.6; c.drawImage(line, 0, 0); c.shadowBlur = s * 0.25; c.drawImage(line, 0, 0);
      c.shadowBlur = 0;
      // pen door
      c.setTransform(s, 0, 0, s, 0, 0); c.fillStyle = '#ffb27a'; c.fillRect(13, 11.42, 2, 0.16);
      return o;
    };
    bgCv = mk('#6fd3c7', 'rgba(111,211,199,0.07)');
    flashCv = mk('#ffffff', 'rgba(255,255,255,0.10)');
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  function ipos(e, a) {
    if (e.jump || Math.abs(e.x - e.px) > 2) return { x: e.x, y: e.y };
    return { x: lerp(e.px, e.x, a), y: lerp(e.py, e.y, a) };
  }
  function txt(str, x, y, size, color, align) {
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `700 ${Math.round(size * ts)}px ${getVar('--display', 'system-ui')}`;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.fillText(str, x * ts, y * ts); ctx.restore();
  }
  let varCache = {};
  function getVar(n, fb) { if (!(n in varCache)) { const v = getComputedStyle(root || document.documentElement).getPropertyValue(n).trim(); varCache[n] = v || fb; } return varCache[n]; }

  function draw(a) {
    if (!ctx || !S) return;
    const s = ts * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#06080a'; ctx.fillRect(0, 0, cv.width, cv.height);
    const flash = S.phase === 'clear' && S.phaseT < 1.8 && Math.floor(S.phaseT * 5) % 2 === 0;
    if (bgCv) ctx.drawImage(flash ? flashCv : bgCv, 0, 0);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // pellets
    const pulse = 0.75 + 0.25 * Math.sin(S.time * 8);
    ctx.fillStyle = '#f4d58d';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (S.dots[y][x] === '.') ctx.fillRect(x + 0.4, y + 0.4, 0.2, 0.2);
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (S.dots[y][x] === 'o' && (S.phase !== 'play' || pulse > 0.6 || S.paused)) drawCarrot(x + 0.5, y + 0.5, 0.55 * (S.phase === 'play' ? pulse : 1) + 0.2);
    }
    if (S.fruit) drawItem(S.fruit.kind, FRUIT.x + 0.5, FRUIT.y + 0.5, 1);
    // gremlins
    const showG = S.phase !== 'clear' && !(S.phase === 'dying' && S.phaseT < 1.6) && S.phase !== 'title' && S.phase !== 'over';
    if (showG) for (const g of S.g) {
      if (S.phase === 'freeze' && g.state === 'eyes' && S.pops.length && S.pops[S.pops.length - 1].t > 0.5 && Math.abs(g.x - S.pops[S.pops.length - 1].x) < 0.6 && Math.abs(g.y - S.pops[S.pops.length - 1].y) < 0.6) continue;
      const q = ipos(g, a);
      drawWrapped(q.x, q.y, (x, y) => drawGremlin(g, x + 0.5, y + 0.5));
    }
    // player
    if (S.phase !== 'title' && S.phase !== 'over') {
      const q = ipos(S.p, a);
      drawWrapped(q.x, q.y, (x, y) => drawMule(x + 0.5, y + 0.5, S.p.face, S.p.moving && S.phase === 'play' ? Math.abs(Math.sin(S.p.mouth)) : 0.35, S.phase === 'dying' && S.phaseT < 1.6 ? S.p.dead : 0, 1));
    }
    // score pops
    for (const pp of S.pops) txt(pp.txt, pp.x + 0.5, pp.y + 0.5 - (1.1 - pp.t) * 0.6, 0.62, pp.c);
    // hud
    ctx.setTransform(s, 0, 0, s, 0, 0);
    for (let i = 0; i < Math.min(S.lives - (S.phase === 'title' || S.phase === 'over' ? 0 : 1), 6); i++) drawMule(1.6 + i * 1.8, ROWS + 1, 'right', 0.35, 0, 0.8);
    for (let i = 0; i < Math.min(S.level, 7); i++) drawItem(itemFor(S.level - i).kind, COLS - 1.6 - i * 1.8, ROWS + 1, 0.85);
    // messages
    if (S.phase === 'ready') txt('READY!', 14, FRUIT.y + 0.5, 0.95, '#ffc861');
    if (S.phase === 'title') { txt('PRESS SPACE', 14, FRUIT.y + 0.5, 0.8, '#ffc861'); txt('MULE MUNCHER', 14, 7.5, 1.0, '#ff8a3d'); }
    if (S.phase === 'over') txt('GAME  OVER', 14, FRUIT.y + 0.5, 0.95, '#ff5a52');
    if (S.paused) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(6,8,10,0.6)'; ctx.fillRect(0, 0, cv.width, cv.height);
      txt('PAUSED', 14, 14.5, 1.3, '#ffc861'); txt(S.autoPaused ? 'press P or click to resume' : 'press P to resume', 14, 16.3, 0.55, '#a3968a');
    }
  }
  function drawWrapped(x, y, fn) { fn(x, y); if (x < 0.6) fn(x + COLS, y); else if (x > COLS - 1.6) fn(x - COLS, y); }

  function drawCarrot(cx, cy, sc) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.6); ctx.scale(sc, sc);
    ctx.shadowColor = '#ffb23d'; ctx.shadowBlur = ts * dpr * 0.5;
    ctx.fillStyle = '#ffae2b';
    ctx.beginPath(); ctx.moveTo(-0.32, -0.32); ctx.quadraticCurveTo(0, -0.42, 0.32, -0.32); ctx.lineTo(0, 0.62); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(120,60,0,0.6)'; ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.moveTo(-0.16, -0.05); ctx.lineTo(0.06, -0.03); ctx.moveTo(-0.08, 0.2); ctx.lineTo(0.08, 0.22); ctx.stroke();
    ctx.fillStyle = '#4ade80';
    for (const k of [-0.18, 0, 0.18]) { ctx.beginPath(); ctx.ellipse(k, -0.55, 0.08, 0.22, k * 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function drawItem(kind, cx, cy, sc) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
    if (kind === 'apple') {
      ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(-0.2, 0.08, 0.38, 0, Math.PI * 2); ctx.arc(0.2, 0.08, 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(-0.28, -0.05, 0.09, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7a4a1e'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(0, -0.25); ctx.lineTo(0.08, -0.55); ctx.stroke();
      ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.ellipse(0.25, -0.45, 0.18, 0.08, -0.4, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'carrot') { ctx.restore(); drawCarrot(cx, cy, 0.95 * sc); return; }
    else if (kind === 'hay') {
      ctx.fillStyle = '#e6c25a'; ctx.fillRect(-0.55, -0.35, 1.1, 0.7);
      ctx.strokeStyle = '#a7832a'; ctx.lineWidth = 0.06;
      for (let i = -0.25; i <= 0.26; i += 0.17) { ctx.beginPath(); ctx.moveTo(-0.55, i); ctx.lineTo(0.55, i + 0.03); ctx.stroke(); }
      ctx.strokeStyle = '#ff5a52'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(-0.2, -0.35); ctx.lineTo(-0.2, 0.35); ctx.moveTo(0.2, -0.35); ctx.lineTo(0.2, 0.35); ctx.stroke();
    } else if (kind === 'shoe') {
      ctx.strokeStyle = '#ffc861'; ctx.lineWidth = 0.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -0.05, 0.36, Math.PI * 0.85, Math.PI * 2.15, false); ctx.stroke();
      ctx.fillStyle = '#7a5a20'; for (const a of [1.0, 1.35, 1.65, 2.0]) { ctx.beginPath(); ctx.arc(Math.cos(a * Math.PI) * 0.36, -0.05 + Math.sin(a * Math.PI) * 0.36, 0.04, 0, 7); ctx.fill(); }
    } else if (kind === 'star') {
      ctx.fillStyle = '#ffc861'; ctx.shadowColor = '#ffc861'; ctx.shadowBlur = ts * dpr * 0.4; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.22 : 0.52, an = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#6fd3c7'; ctx.beginPath(); ctx.moveTo(-0.4, 0.3); ctx.quadraticCurveTo(-0.4, -0.45, 0, -0.45); ctx.quadraticCurveTo(0.4, -0.45, 0.4, 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffc861'; ctx.beginPath(); ctx.arc(0, 0.38, 0.1, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  function drawMule(cx, cy, face, mouth, dead, sc) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc * 0.92, sc * 0.92);
    if (dead) { ctx.rotate(dead * Math.PI * 4); const k = Math.max(0, 1 - dead); ctx.scale(k, k); ctx.globalAlpha = Math.max(0, 1 - dead * 0.6); }
    if (face === 'left') ctx.scale(-1, 1);
    else if (face === 'up') ctx.rotate(-Math.PI / 2);
    else if (face === 'down') ctx.rotate(Math.PI / 2);
    // ears
    ctx.fillStyle = '#d9692a';
    ctx.beginPath(); ctx.ellipse(-0.38, -0.62, 0.13, 0.38, -0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath(); ctx.ellipse(-0.14, -0.66, 0.14, 0.4, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcfa8';
    ctx.beginPath(); ctx.ellipse(-0.13, -0.66, 0.06, 0.26, -0.15, 0, Math.PI * 2); ctx.fill();
    // head
    ctx.fillStyle = '#ff8a3d'; ctx.shadowColor = 'rgba(255,138,61,.7)'; ctx.shadowBlur = ts * dpr * 0.35;
    ctx.beginPath(); ctx.ellipse(-0.12, -0.02, 0.52, 0.44, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    // mane tuft
    ctx.fillStyle = '#7a3412';
    ctx.beginPath(); ctx.moveTo(-0.55, -0.2); ctx.lineTo(-0.42, -0.5); ctx.lineTo(-0.32, -0.3); ctx.lineTo(-0.22, -0.48); ctx.lineTo(-0.15, -0.36); ctx.closePath(); ctx.fill();
    // lower jaw (opens)
    ctx.save(); ctx.translate(0.12, 0.2); ctx.rotate(mouth * 0.55);
    ctx.fillStyle = '#e8925a'; ctx.beginPath(); ctx.ellipse(0.26, 0.05, 0.3, 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (mouth > 0.05) { ctx.fillStyle = '#3a1406'; ctx.beginPath(); ctx.ellipse(0.4, 0.22, 0.24, 0.07 + mouth * 0.12, 0.3 * mouth, 0, Math.PI * 2); ctx.fill(); }
    // muzzle
    ctx.fillStyle = '#ffb27a'; ctx.beginPath(); ctx.ellipse(0.36, 0.06, 0.33, 0.24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a3412'; ctx.beginPath(); ctx.ellipse(0.58, -0.02, 0.05, 0.07, 0.3, 0, Math.PI * 2); ctx.fill();
    // eye
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0.02, -0.16, 0.11, 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b0d03'; ctx.beginPath(); ctx.arc(0.05, -0.15, 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawGremlin(g, cx, cy) {
    const sc = 0.82;
    const wig = Math.sin(S.time * 16 + g.i) > 0 ? 1 : 0;
    const flashing = g.fr && S.frT < 2 && Math.floor(S.frT * 5) % 2 === 0;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
    if (g.state !== 'eyes' && g.state !== 'entering') {
      const col = g.fr ? (flashing ? '#f3ece5' : '#2f55ff') : g.d.color;
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = ts * dpr * 0.45;
      // horns
      ctx.beginPath(); ctx.moveTo(-0.5, -0.38); ctx.lineTo(-0.62, -0.86); ctx.lineTo(-0.22, -0.56); ctx.closePath();
      ctx.moveTo(0.5, -0.38); ctx.lineTo(0.62, -0.86); ctx.lineTo(0.22, -0.56); ctx.closePath(); ctx.fill();
      // body with jagged hem
      ctx.beginPath(); ctx.arc(0, -0.05, 0.66, Math.PI, 0);
      ctx.lineTo(0.66, 0.62);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x0 = 0.66 - (i * 1.32) / n, x1 = 0.66 - ((i + 0.5) * 1.32) / n, x2 = 0.66 - ((i + 1) * 1.32) / n;
        ctx.lineTo(x1, wig ? 0.38 : 0.46); ctx.lineTo(x2, 0.68); void x0;
      }
      ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
      if (g.fr) {
        ctx.fillStyle = flashing ? '#ff5a52' : '#ffd9c0';
        ctx.fillRect(-0.3, -0.22, 0.16, 0.16); ctx.fillRect(0.14, -0.22, 0.16, 0.16);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.08; ctx.beginPath();
        for (let i = 0; i <= 6; i++) ctx.lineTo(-0.42 + i * 0.14, 0.2 + (i % 2 ? -0.08 : 0.04));
        ctx.stroke(); ctx.restore(); return;
      }
    }
    const d = DIRS[g.dir] || DIRS.left;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-0.26, -0.12, 0.19, 0.24, 0, 0, Math.PI * 2); ctx.ellipse(0.26, -0.12, 0.19, 0.24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g.state === 'eyes' || g.state === 'entering' ? '#2f55ff' : '#14101a';
    ctx.beginPath(); ctx.arc(-0.26 + d.x * 0.09, -0.12 + d.y * 0.11, 0.1, 0, Math.PI * 2); ctx.arc(0.26 + d.x * 0.09, -0.12 + d.y * 0.11, 0.1, 0, Math.PI * 2); ctx.fill();
    if (g.state !== 'eyes' && g.state !== 'entering') { // angry brows
      ctx.strokeStyle = '#14101a'; ctx.lineWidth = 0.08; ctx.beginPath();
      ctx.moveTo(-0.46, -0.42); ctx.lineTo(-0.1, -0.32); ctx.moveTo(0.46, -0.42); ctx.lineTo(0.1, -0.32); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- layout ---------- */
  function fit() {
    if (!el || !cv || el.offsetParent === null) return;
    const narrow = el.clientWidth < 560;
    root.classList.toggle('narrow', narrow);
    const top = cv.parentNode.getBoundingClientRect().top;
    const availH = Math.max(320, window.innerHeight - top - 40);
    const availW = Math.max(260, narrow ? el.clientWidth : el.clientWidth - 18 - Math.min(300, Math.max(210, side.offsetWidth || 230)));
    let t = Math.min(availH / (ROWS + HUD), availW / COLS, 22);
    t = Math.max(9, Math.floor(t * 4) / 4);
    const nd = window.devicePixelRatio || 1;
    if (t === ts && nd === dpr && bgCv) return;
    ts = t; dpr = nd;
    cv.style.width = COLS * ts + 'px'; cv.style.height = (ROWS + HUD) * ts + 'px';
    cv.width = Math.round(COLS * ts * dpr); cv.height = Math.round((ROWS + HUD) * ts * dpr);
    buildBg(); draw(1);
  }

  function syncUI() {
    if (!ui.score || !S) return;
    ui.score.textContent = S.score; ui.hi.textContent = Math.max(hi, S.score); ui.level.textContent = S.level;
    ui.pause.textContent = S.paused ? 'Resume' : 'Pause';
    ui.pause.disabled = S.phase === 'title' || S.phase === 'over';
  }

  /* ---------- input ---------- */
  const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' };
  function onKey(e) {
    if (!el || el.offsetParent === null) return;
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dir = KEYMAP[e.code];
    if (dir) {
      e.preventDefault(); ensureAudio();
      if (S.phase === 'title' || S.phase === 'over') { startGame(); S.p.next = dir; return; }
      if (S.paused) setPaused(false);
      S.p.next = dir; return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (e.code === 'Escape' && (!S.paused && (S.phase === 'title' || S.phase === 'over'))) return;
      e.preventDefault(); setPaused(!S.paused); return;
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault(); ensureAudio();
      if (S.phase === 'title' || S.phase === 'over') startGame(); else if (S.paused) setPaused(false);
    }
  }

  function mount(container, theApi) {
    if (el) unmount();
    el = container; api = theApi || { load: () => null, save() {}, sound: false, toast() {} };
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    let h = null, sv = null;
    try { h = api.load('hi'); sv = api.load('sound'); } catch (e) { /* ignore */ }
    hi = typeof h === 'number' ? h : 0;
    soundOn = !!api.sound && sv !== false;
    varCache = {};
    root = document.createElement('div'); root.className = 'ag-' + ID;
    root.innerHTML = `
      <div class="ag-stage"><canvas aria-label="Mule Muncher playfield"></canvas></div>
      <div class="ag-side">
        <div><h2>Mule <em>Muncher</em></h2>
        <p class="ag-how">Steer the mule through the maze, munch every hay pellet and dodge the Gremlins. Grab a golden carrot to turn the tables.</p></div>
        <div class="ag-stats">
          <div class="ag-stat"><span>Score</span><b data-k="score">0</b></div>
          <div class="ag-stat hi"><span>High</span><b data-k="hi">0</b></div>
          <div class="ag-stat"><span>Level</span><b data-k="level">1</b></div>
        </div>
        <div class="ag-btns">
          <button class="btn pri small" data-a="new">New game</button>
          <button class="btn sec small" data-a="pause">Pause</button>
          <button class="btn sec small" data-a="sound" title="Toggle sound"></button>
        </div>
        <div class="ag-keys"><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> steer (press early to pre-turn) · <kbd>P</kbd> pause · <kbd>Space</kbd> start</div>
        <details><summary>Tips</summary><ul>
          <li><span class="ag-dot" style="background:#ff4d5e"></span><b>Scorch</b> chases you directly and speeds up when few pellets remain.</li>
          <li><span class="ag-dot" style="background:#b57bff"></span><b>Hex</b> ambushes the spot ahead of you.</li>
          <li><span class="ag-dot" style="background:#9be34a"></span><b>Fern</b> flanks, working with Scorch to cut you off.</li>
          <li><span class="ag-dot" style="background:#e0b98a"></span><b>Dusty</b> wanders, and backs off when you get close.</li>
          <li>Gremlins regroup in their corners now and then; that is the time to clear tough areas.</li>
          <li>Chain all four Gremlins on one carrot for 200, 400, 800, 1600.</li>
          <li>Gremlins crawl through the side tunnels; use them to escape.</li>
          <li>A bonus snack appears below the pen twice per level. Extra life at 10,000.</li>
        </ul></details>
      </div>`;
    el.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d'); side = root.querySelector('.ag-side');
    ui = { score: root.querySelector('[data-k=score]'), hi: root.querySelector('[data-k=hi]'), level: root.querySelector('[data-k=level]'),
      pause: root.querySelector('[data-a=pause]'), sound: root.querySelector('[data-a=sound]') };
    const setSoundLabel = () => { ui.sound.textContent = soundOn ? '🔊' : '🔇'; };
    setSoundLabel();
    on(root.querySelector('[data-a=new]'), 'click', (e) => { e.currentTarget.blur(); ensureAudio(); startGame(); });
    on(ui.pause, 'click', (e) => { e.currentTarget.blur(); setPaused(!S.paused); });
    on(ui.sound, 'click', (e) => {
      e.currentTarget.blur(); soundOn = !soundOn; setSoundLabel();
      try { api.save('sound', soundOn); } catch (er) { /* ignore */ }
      if (soundOn) ensureAudio();
    });
    on(cv, 'pointerdown', () => { ensureAudio(); if (S.phase === 'title' || S.phase === 'over') startGame(); else if (S.paused) setPaused(false); });
    on(window, 'keydown', onKey);
    on(window, 'resize', fit);
    on(window, 'blur', () => { if (S && el && S.phase !== 'title' && S.phase !== 'over' && !S.paused) { S.paused = true; S.autoPaused = true; syncUI(); redraw(); } });
    on(document, 'visibilitychange', () => { if (document.hidden) autoPause(); });
    if (window.ResizeObserver) { ro = new ResizeObserver(() => fit()); ro.observe(el); }
    S = newState(); resetDots(); resetActors();
    syncUI(); fit(); draw(1);
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
    listeners.length = 0;
    if (ro) { ro.disconnect(); ro = null; }
    if (AC) { try { AC.close(); } catch (e) { /* ignore */ } AC = null; }
    if (S && S.score >= hi && S.score > 0 && api) { try { api.save('hi', S.score); } catch (e) { /* ignore */ } }
    if (el) el.innerHTML = '';
    el = null; root = null; cv = null; ctx = null; bgCv = null; flashCv = null; ui = {}; S = null;
  }

  window.VanArcade = window.VanArcade || {};
  window.VanArcade[ID] = {
    mount, unmount,
    _debug: { get S() { return S; }, step(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) step(STEP); draw(1); }, MAZE, open, get raf() { return raf; } },
  };
})();
