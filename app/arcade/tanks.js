/* VanMule Arcade: Tank Duel, a turn-based artillery game on destructible terrain. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};

  const ID = 'tanks';
  const W = 960, H = 540;            // logical canvas size
  const G = 260;                     // gravity px/s^2
  const VMAX = 520;                  // muzzle speed at power 100
  const WINDK = 4.5;                 // wind accel per wind unit
  const DT = 1 / 120;                // fixed physics step
  const FIRST_TO = 3;
  const BEDROCK = H - 4;
  const BARREL = 18;

  const WEAPONS = [
    { id: 'std', name: 'Shell', ammo: Infinity, r: 26, dmg: 42, desc: 'Reliable standard shell' },
    { id: 'big', name: 'Big One', ammo: 2, r: 58, dmg: 72, desc: 'Huge blast radius' },
    { id: 'tri', name: 'Triple', ammo: 3, r: 20, dmg: 28, spread: 4, desc: 'Three shells in a spread' },
    { id: 'dirt', name: 'Dirt Bomb', ammo: 2, r: 46, dmg: 0, dirt: true, desc: 'Piles up a mound of dirt' },
    { id: 'roll', name: 'Roller', ammo: 3, r: 30, dmg: 46, roll: true, desc: 'Rolls downhill, then explodes' },
  ];
  const DIFF = {
    easy: { ang: 7, pow: 11, floor: 0.4, decay: 0.8, special: 0.15 },
    normal: { ang: 3, pow: 5, floor: 0.22, decay: 0.68, special: 0.3 },
    hard: { ang: 1.1, pow: 1.8, floor: 0.08, decay: 0.5, special: 0.45 },
  };
  const NAMES = ['Ember', 'Teal'];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
  const rad = (d) => (d * Math.PI) / 180;

  const CSS = `
.ag-tanks{display:flex;flex-direction:column;gap:10px;user-select:none;-webkit-user-select:none}
.ag-tanks .agt-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
.ag-tanks .agt-title{font-family:var(--display);font-size:24px;font-weight:700;letter-spacing:-.01em;margin:0;line-height:1.1}
.ag-tanks .agt-how{color:var(--muted);font-size:13px;margin-top:4px}
.ag-tanks .agt-score{font-family:var(--display);font-size:20px;display:flex;align-items:center;gap:10px;white-space:nowrap}
.ag-tanks .agt-score .p0{color:var(--ember)} .ag-tanks .agt-score .p1{color:var(--cool)}
.ag-tanks .agt-score small{display:block;font-family:var(--body);font-size:11px;color:var(--dim);font-weight:500;text-align:center}
.ag-tanks .agt-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ag-tanks select{height:32px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);padding:0 8px;font-size:13px}
.ag-tanks .agt-stage{position:relative;align-self:center;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:#0b0d1c;line-height:0}
.ag-tanks canvas{display:block}
.ag-tanks .agt-banner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(8,6,10,.45);line-height:1.4}
.ag-tanks .agt-banner>div{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px 28px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.5);max-width:80%}
.ag-tanks .agt-banner h3{font-family:var(--display);font-size:22px;margin:0 0 6px}
.ag-tanks .agt-banner p{margin:0 0 14px;color:var(--muted);font-size:14px}
.ag-tanks .agt-ctrl{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 14px}
.ag-tanks .agt-who{display:flex;align-items:center;gap:8px;min-width:120px;line-height:1.15}
.ag-tanks .agt-who i{width:12px;height:12px;border-radius:50%;background:var(--ember);flex:none}
.ag-tanks .agt-who b{font-family:var(--display);font-size:14px;display:block}
.ag-tanks .agt-who small{color:var(--muted);font-size:12px}
.ag-tanks.t1 .agt-who i{background:var(--cool)}
.ag-tanks .agt-sl{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
.ag-tanks .agt-sl input{width:120px;accent-color:var(--ember)}
.ag-tanks.t1 .agt-sl input{accent-color:var(--cool)}
.ag-tanks .agt-sl span{font-family:var(--mono);color:var(--fg);min-width:38px;font-size:14px}
.ag-tanks .agt-weps{display:flex;gap:4px;flex-wrap:wrap}
.ag-tanks .agt-wep{height:32px;padding:0 9px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:6px}
.ag-tanks .agt-wep em{font-style:normal;font-family:var(--mono);font-size:11px;color:var(--muted)}
.ag-tanks .agt-wep.on{border-color:var(--ember);box-shadow:inset 0 0 0 1px var(--ember)}
.ag-tanks.t1 .agt-wep.on{border-color:var(--cool);box-shadow:inset 0 0 0 1px var(--cool)}
.ag-tanks .agt-wep:disabled{opacity:.35;cursor:default}
.ag-tanks .agt-fire{margin-left:auto;min-width:96px;justify-content:center}
.ag-tanks.t1 .agt-fire{background:var(--cool)}
.ag-tanks .agt-ctrl.busy .agt-sl,.ag-tanks .agt-ctrl.busy .agt-weps{opacity:.5;pointer-events:none}
.ag-tanks details{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 14px;font-size:13px;color:var(--muted)}
.ag-tanks summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-tanks details ul{margin:8px 0 4px;padding-left:18px}
.ag-tanks kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-radius:4px;padding:0 4px;color:var(--fg)}
`;

  let el = null, api = null, root = null, cv = null, ctx = null, stage = null, ui = {};
  let raf = 0, last = 0, mounted = false, sleeping = false, ro = null, actx = null, soundOn = true;
  let S = null;
  let colors = { ember: '#ff8a3d', cool: '#6fd3c7', mono: 'monospace', display: 'sans-serif', body: 'sans-serif' };

  /* ---------------- state ---------------- */
  function isAI(i) { return S.mode !== 'pvp' && i === 1; }
  function pname(i) { return isAI(i) ? 'Mulebot' : NAMES[i]; }

  function newTank(i) {
    return { i, x: 0, y: 0, angle: i ? 135 : 45, power: 60, hp: 100, weapon: 0, ammo: WEAPONS.map((w) => w.ammo), vy: 0, falling: false, fallFrom: 0, dead: false };
  }

  function genTerrain() {
    const top = S.top, base = H * rand(0.56, 0.68);
    const waves = [[rand(40, 75), rand(0.6, 1.6)], [rand(20, 45), rand(2, 3.5)], [rand(8, 20), rand(4, 7)], [rand(3, 8), rand(10, 16)], [rand(1, 3), rand(25, 40)]]
      .map(([a, f]) => ({ a, f, p: rand(0, Math.PI * 2) }));
    const bump = Math.random() < 0.55 ? rand(40, 140) : 0, bx = W * rand(0.42, 0.58), bw = rand(70, 140);
    for (let x = 0; x <= W; x++) {
      let y = base;
      for (const w of waves) y += w.a * Math.sin((Math.PI * 2 * w.f * x) / W + w.p);
      y -= bump * Math.exp(-((x - bx) * (x - bx)) / (2 * bw * bw));
      top[x] = clamp(y, H * 0.22, H - 24);
    }
    S.target.set(top);
    S.colV.fill(0);
    S.settling = false;
    // place tanks and flatten a pad under each
    const xs = [Math.round(rand(70, 250)), Math.round(W - rand(70, 250))];
    S.tanks.forEach((t, i) => {
      t.x = xs[i];
      let avg = 0, n = 0;
      for (let x = t.x - 6; x <= t.x + 6; x++) { avg += top[x]; n++; }
      avg /= n;
      for (let x = t.x - 22; x <= t.x + 22; x++) {
        const d = Math.abs(x - t.x), k = d <= 14 ? 1 : 1 - (d - 14) / 8;
        top[x] = S.target[x] = top[x] * (1 - k) + avg * k;
      }
      t.y = groundAt(t.x);
    });
    // decorative layers
    S.stars = [];
    for (let i = 0; i < 110; i++) S.stars.push({ x: rand(0, W), y: rand(0, H * 0.6), r: Math.random() < 0.12 ? 1.4 : 0.8, a: rand(0.25, 0.9) });
    const hills = (n, base, amp) => { const a = []; const ph = rand(0, 6), ph2 = rand(0, 6); for (let i = 0; i <= n; i++) a.push(base - amp * (0.5 + 0.35 * Math.sin(i * 0.45 + ph) + 0.15 * Math.sin(i * 1.3 + ph2))); return a; };
    S.far = hills(40, H * 0.62, 150);
    S.mid = hills(40, H * 0.7, 110);
    S.moon = { x: rand(W * 0.15, W * 0.85), y: rand(50, 110) };
  }

  function groundAt(x) {
    const xi = Math.round(x);
    let m = H;
    for (let i = Math.max(0, xi - 8); i <= Math.min(W, xi + 8); i++) if (S.top[i] < m) m = S.top[i];
    return m;
  }

  function newWind() {
    if (Math.random() < 0.2) S.wind = Math.round(rand(-10, 10));
    else S.wind = clamp(Math.round(S.wind + rand(-4.5, 4.5)), -10, 10);
  }

  function initState(saved) {
    S = {
      mode: 'ai', diff: 'normal', score: [0, 0], wins: [0, 0], round: 1, starter: 0,
      turn: 0, wind: 0, phase: 'aim', tanks: [newTank(0), newTank(1)],
      top: new Float32Array(W + 1), target: new Float32Array(W + 1), colV: new Float32Array(W + 1), settling: false,
      projs: [], booms: [], parts: [], floats: [], paths: [null, null], camX: 0, shake: 0, acc: 0,
      ai: null, aiErr: 1, banner: null, stars: [], far: [], mid: [], moon: { x: 200, y: 80 }, shots: 0,
    };
    if (saved && typeof saved === 'object') {
      if (['ai', 'pvp'].includes(saved.mode)) S.mode = saved.mode;
      if (DIFF[saved.diff]) S.diff = saved.diff;
      if (Array.isArray(saved.score) && saved.score.length === 2 && Math.max(...saved.score) < FIRST_TO) S.score = saved.score.map((n) => n | 0);
      if (Array.isArray(saved.wins) && saved.wins.length === 2) S.wins = saved.wins.map((n) => n | 0);
      if (saved.round > 0) S.round = saved.round | 0;
      if (saved.starter === 1) S.starter = 1;
    }
  }

  function persist() {
    api.save('state', { mode: S.mode, diff: S.diff, score: S.score, wins: S.wins, round: S.round, starter: S.starter });
  }

  function startRound() {
    S.tanks = [newTank(0), newTank(1)];
    S.projs = []; S.booms = []; S.parts = []; S.floats = []; S.paths = [null, null];
    S.aiErr = 1; S.ai = null; S.banner = null; S.shake = 0; S.camX = 0; S.acc = 0;
    S.wind = Math.round(rand(-6, 6));
    genTerrain();
    S.turn = S.starter;
    beginTurn();
  }

  function newMatch() {
    S.score = [0, 0]; S.round = 1; S.starter = 0;
    persist();
    startRound();
  }

  function beginTurn() {
    S.banner = null;
    if (isAI(S.turn)) startAI();
    else S.phase = 'aim';
    syncUI(); render(); kick();
  }

  /* ---------------- physics ---------------- */
  function makeProj(t, angle, power, wi, owner) {
    const a = rad(angle), v = (clamp(power, 0, 100) / 100) * VMAX;
    const px = t.x + Math.cos(a) * BARREL, py = t.y - 13 - Math.sin(a) * BARREL;
    return { x: px, y: py, vx: Math.cos(a) * v, vy: -Math.sin(a) * v, age: 0, owner, w: wi, rolling: false, dir: 1, rollT: 0, rec: null, n: 0 };
  }

  // advance one projectile one step. Returns null or an event {type, i}
  function stepProj(p, dt, top, tanks, wind) {
    p.age += dt;
    if (p.rolling) {
      p.rollT += dt;
      const nx = p.x + p.dir * 105 * dt, xi = Math.round(nx);
      if (xi < 0 || xi > W) return { type: 'off' };
      const ny = top[xi];
      for (const t of tanks) if (!t.dead && Math.abs(nx - t.x) < 13 && Math.abs(ny - t.y) < 18) { p.x = nx; return { type: 'tank', i: t.i }; }
      if (ny < p.y - 2.2 || p.rollT > 5) return { type: 'stop' };
      p.x = nx; p.y = ny;
      return null;
    }
    p.vx += wind * WINDK * dt;
    p.vy += G * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < -60 || p.x > W + 60 || p.y > H + 40 || p.age > 20) return { type: 'off' };
    for (const t of tanks) {
      if (t.dead || (t.i === p.owner && p.age < 0.3)) continue;
      const dx = p.x - t.x, dy = p.y - (t.y - 7);
      if (dx * dx + dy * dy < 13 * 13) return { type: 'tank', i: t.i };
    }
    const xi = Math.round(p.x);
    if (xi >= 0 && xi <= W && p.y >= top[xi]) {
      if (WEAPONS[p.w].roll) {
        const l = top[Math.max(0, xi - 4)], r = top[Math.min(W, xi + 4)];
        p.dir = r > l + 0.5 ? 1 : l > r + 0.5 ? -1 : p.vx >= 0 ? 1 : -1;
        p.rolling = true; p.y = top[xi]; p.x = xi;
        return { type: 'land' };
      }
      return { type: 'ground' };
    }
    return null;
  }

  // full-shot simulation used by the AI (and tests). Does not touch game state.
  function simulate(ti, angle, power, wi, wind) {
    const t = S.tanks[ti];
    const p = makeProj(t, angle, power, wi == null ? 0 : wi, ti);
    const w = wind == null ? S.wind : wind;
    for (let n = 0; n < 3000; n++) {
      const ev = stepProj(p, DT, S.target, S.tanks, w);
      if (ev && ev.type !== 'land') return { x: p.x, y: p.y, type: ev.type, i: ev.i, t: p.age };
    }
    return { x: p.x, y: p.y, type: 'off', t: p.age };
  }

  function fire() {
    if (S.phase !== 'aim' && S.phase !== 'ai') return false;
    const t = S.tanks[S.turn], wi = t.weapon, w = WEAPONS[wi];
    if (!(t.ammo[wi] > 0)) return false;
    t.ammo[wi]--;
    const angs = w.spread ? [t.angle - w.spread, t.angle, t.angle + w.spread] : [t.angle];
    S.projs = angs.map((a) => makeProj(t, a, t.power, wi, S.turn));
    const main = S.projs[w.spread ? 1 : 0];
    main.rec = [[main.x, main.y]];
    S.paths[S.turn] = main.rec;
    S.phase = 'fly';
    S.shots++;
    S.ai = null;
    sfxFire();
    for (let i = 0; i < 8; i++) {
      const a = rad(t.angle + rand(-25, 25)), v = rand(30, 90);
      S.parts.push({ x: main.x, y: main.y, vx: Math.cos(a) * v, vy: -Math.sin(a) * v, life: 0, max: rand(0.2, 0.45), c: '#ffd9a8', s: 2, g: 0 });
    }
    syncUI(); kick();
    return true;
  }

  function explode(x, y, wi, opts) {
    const w = WEAPONS[wi];
    const r = (opts && opts.r) || w.r;
    if (w.dirt) addDirt(x, y, r);
    else crater(x, y, r);
    const dmgMax = opts && opts.noDamage ? 0 : w.dmg;
    if (dmgMax) {
      for (const t of S.tanks) {
        if (t.dead) continue;
        const d = Math.hypot(x - t.x, y - (t.y - 7));
        if (d < r + 10) {
          const dmg = Math.round(dmgMax * clamp(1 - Math.max(0, d - 8) / (r + 2), 0, 1));
          if (dmg > 0) hurt(t, dmg);
        }
      }
    }
    S.booms.push({ x, y, r, t: 0, dur: w.dirt ? 0.45 : 0.6, dirt: !!w.dirt });
    const n = Math.min(40, Math.round(r * 0.7));
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(40, 60 + r * 4);
      S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0, max: rand(0.5, 1.2), c: w.dirt ? '#8a5a36' : Math.random() < 0.5 ? '#ffb347' : '#7a4a2e', s: rand(1.5, 3.2), g: 1 });
    }
    S.shake = Math.max(S.shake, Math.min(9, r / 6));
    sfxBoom(r);
  }

  function hurt(t, dmg) {
    t.hp = Math.max(0, t.hp - dmg);
    S.floats.push({ x: t.x, y: t.y - 34, text: '-' + dmg, t: 0, c: t.i ? colors.cool : colors.ember });
  }

  function crater(cx, cy, r) {
    const { top, target } = S;
    for (let x = Math.max(0, Math.ceil(cx - r)); x <= Math.min(W, Math.floor(cx + r)); x++) {
      const dy = Math.sqrt(r * r - (x - cx) * (x - cx)), a = cy - dy, b = cy + dy;
      const tp = target[x], overlap = Math.min(b, BEDROCK) - Math.max(a, tp);
      if (overlap <= 0) continue;
      const nt = Math.min(BEDROCK, tp + overlap);
      target[x] = nt;
      if (top[x] >= a - 0.5) top[x] = Math.max(top[x], nt); // surface itself carved
      else S.settling = true;                                 // dirt above the hole will slide down
    }
  }

  function addDirt(cx, cy, r) {
    const { top, target } = S;
    for (let x = Math.max(0, Math.ceil(cx - r)); x <= Math.min(W, Math.floor(cx + r)); x++) {
      const dy = Math.sqrt(r * r - (x - cx) * (x - cx)), a = cy - dy, b = cy + dy;
      const tp = target[x], add = Math.max(0, Math.min(b, tp) - a);
      if (add <= 0) continue;
      target[x] = Math.max(16, tp - add);
      top[x] = Math.min(top[x], target[x]);
    }
  }

  function quiet() {
    return !S.projs.length && !S.booms.length && !S.settling && !S.tanks.some((t) => t.falling);
  }

  function stepWorld(dt) {
    // projectiles
    for (let k = S.projs.length - 1; k >= 0; k--) {
      const p = S.projs[k];
      const ev = stepProj(p, dt, S.top, S.tanks, S.wind);
      if (p.rec && ++p.n % 3 === 0) p.rec.push([p.x, p.y]);
      if (!ev) continue;
      if (ev.type === 'land') { sfxBlip(180, 0.06, 'triangle', 0.08); continue; }
      if (p.rec) p.rec.push([p.x, p.y]);
      S.projs.splice(k, 1);
      if (ev.type !== 'off') explode(p.x, p.y, p.w);
    }
    // explosions
    for (let k = S.booms.length - 1; k >= 0; k--) if ((S.booms[k].t += dt) >= S.booms[k].dur) S.booms.splice(k, 1);
    // terrain settling
    if (S.settling) {
      let any = false;
      const { top, target, colV } = S;
      for (let x = 0; x <= W; x++) {
        if (top[x] < target[x]) {
          colV[x] += 900 * dt;
          top[x] = Math.min(target[x], top[x] + colV[x] * dt);
          if (top[x] < target[x]) any = true; else colV[x] = 0;
        }
      }
      S.settling = any;
    }
    // tanks settle / fall
    for (const t of S.tanks) {
      const g = groundAt(t.x);
      if (t.y < g - 0.5) {
        if (!t.falling) { t.falling = true; t.fallFrom = t.y; t.vy = 0; }
        t.vy += G * 1.4 * dt;
        t.y = Math.min(g, t.y + t.vy * dt);
      } else {
        if (g < t.y) t.y = g;
        if (t.falling) {
          t.vy = 0;
          if (!S.settling && !S.booms.length) {
            t.falling = false;
            const fd = t.y - t.fallFrom;
            if (fd > 18 && !t.dead) { hurt(t, Math.min(35, Math.round((fd - 18) * 0.35))); sfxBlip(90, 0.12, 'square', 0.1); }
          }
        }
      }
    }
    // particles / floaters
    for (let k = S.parts.length - 1; k >= 0; k--) {
      const q = S.parts[k];
      q.life += dt;
      if (q.life >= q.max) { S.parts.splice(k, 1); continue; }
      q.vy += G * q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
    }
    for (let k = S.floats.length - 1; k >= 0; k--) if ((S.floats[k].t += dt) > 1.3) S.floats.splice(k, 1);
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 22);
    // camera drift for parallax
    const focus = S.projs.length ? S.projs[0].x : W / 2;
    S.camX += (focus - W / 2 - S.camX) * Math.min(1, dt * 3);
    if (!S.projs.length && Math.abs(S.camX) < 0.3) S.camX = 0;

    if ((S.phase === 'fly' || S.phase === 'dying') && quiet()) endTurn();
  }

  function endTurn() {
    const newly = S.tanks.filter((t) => t.hp <= 0 && !t.dead);
    if (newly.length) {
      for (const t of newly) {
        t.dead = true;
        explode(t.x, t.y - 6, 0, { r: 30, noDamage: true });
        for (let i = 0; i < 24; i++) {
          const a = rand(-Math.PI, 0), v = rand(80, 260);
          S.parts.push({ x: t.x, y: t.y - 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rand(0.6, 1.4), c: t.i ? colors.cool : colors.ember, s: rand(2, 3.5), g: 1 });
        }
      }
      S.phase = 'dying';
      return;
    }
    if (S.tanks.some((t) => t.dead)) return finishRound();
    S.turn = 1 - S.turn;
    newWind();
    beginTurn();
  }

  function finishRound() {
    const alive = S.tanks.filter((t) => !t.dead);
    S.phase = 'over';
    S.starter = 1 - S.starter;
    let title, sub, btn;
    if (alive.length === 1) {
      const w = alive[0].i;
      S.score[w]++;
      if (S.score[w] >= FIRST_TO) {
        S.wins[w]++;
        title = pname(w) + ' wins the match!';
        sub = 'Final score ' + S.score[0] + ' – ' + S.score[1] + '. Match wins: ' + S.wins[0] + ' – ' + S.wins[1] + '.';
        btn = 'New match';
        S.banner = { title, sub, btn, match: true, c: w };
        if (api.toast) api.toast(pname(w) + ' wins Tank Duel ' + S.score[w] + '–' + S.score[1 - w]);
        sfxWin(!isAI(w));
      } else {
        title = pname(w) + ' takes round ' + S.round;
        sub = 'Score ' + S.score[0] + ' – ' + S.score[1] + ' · first to ' + FIRST_TO;
        btn = 'Next round';
        S.banner = { title, sub, btn, c: w };
        sfxWin(!isAI(w));
      }
    } else {
      S.banner = { title: 'Mutual destruction', sub: 'No point awarded. Score ' + S.score[0] + ' – ' + S.score[1], btn: 'Next round', c: -1 };
    }
    S.round++;
    persist();
    if (S.banner.match) { const s = S.score; S.score = [0, 0]; S.round = 1; S.starter = 0; persist(); S.score = s; }
    syncUI(); render();
  }

  function bannerAction() {
    if (S.phase !== 'over') return;
    if (S.banner && S.banner.match) newMatch();
    else startRound();
  }

  /* ---------------- AI ---------------- */
  function aiEval(r, foe, me) {
    if (r.type === 'tank' && r.i === foe.i) return 0;
    if (r.type === 'tank' && r.i === me.i) return 5000;
    if (r.type === 'off') return 3000 + Math.abs(r.x - foe.x);
    let d = Math.hypot(r.x - foe.x, r.y - (foe.y - 7));
    if (Math.hypot(r.x - me.x, r.y - me.y) < 40) d += 2000;
    return d;
  }

  function aiPlan() {
    const me = S.tanks[S.turn], foe = S.tanks[1 - S.turn];
    const dir = foe.x > me.x ? 1 : -1, toAng = (a) => (dir > 0 ? a : 180 - a);
    let best = { e: Infinity, a: 45, p: 60 };
    for (let a = 12; a <= 86; a += 4) {
      for (let pw = 18; pw <= 100; pw += 4) {
        const e = aiEval(simulate(me.i, toAng(a), pw, 0), foe, me) + Math.abs(a - 55) * 0.05;
        if (e < best.e) best = { e, a, p: pw };
      }
    }
    for (const st of [2, 1, 0.5, 0.25]) {
      let improved = true, guard = 0;
      while (improved && guard++ < 12) {
        improved = false;
        for (const [da, dp] of [[st, 0], [-st, 0], [0, st], [0, -st]]) {
          const a = clamp(best.a + da, 2, 88), pw = clamp(best.p + dp, 5, 100);
          const e = aiEval(simulate(me.i, toAng(a), pw, 0), foe, me) + Math.abs(a - 55) * 0.05;
          if (e < best.e) { best = { e, a, p: pw }; improved = true; }
        }
      }
    }
    const d = DIFF[S.diff], k = Math.max(d.floor, S.aiErr);
    S.aiErr *= d.decay;
    // weapon choice
    let wi = 0;
    if (best.e < 30 && Math.random() < d.special) {
      if (me.ammo[1] > 0 && Math.random() < 0.6) wi = 1;
      else if (me.ammo[2] > 0) wi = 2;
    }
    const ang = toAng(clamp(best.a + gauss() * d.ang * k, 1, 89));
    const pow = clamp(Math.round((best.p + gauss() * d.pow * k) * 2) / 2, 5, 100);
    return { ang, pow, wi, ideal: { a: toAng(best.a), p: best.p, e: best.e } };
  }

  function startAI() {
    S.phase = 'ai';
    const me = S.tanks[S.turn];
    const plan = aiPlan();
    me.weapon = plan.wi;
    S.ai = { plan, t: 0, fromA: me.angle, fromP: me.power };
  }

  function stepAI(dt) {
    const a = S.ai;
    if (!a) return;
    a.t += dt;
    const me = S.tanks[S.turn];
    const k = clamp((a.t - 0.45) / 0.9, 0, 1), e = k * k * (3 - 2 * k);
    me.angle = a.fromA + (a.plan.ang - a.fromA) * e;
    me.power = a.fromP + (a.plan.pow - a.fromP) * e;
    if (a.t > 1.6) { me.angle = a.plan.ang; me.power = a.plan.pow; fire(); }
  }

  /* ---------------- loop ---------------- */
  let inFrame = false;
  function kick() {
    if (!mounted || raf || inFrame) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function busy() {
    return S.phase === 'ai' || S.projs.length || S.booms.length || S.parts.length || S.floats.length || S.settling || S.tanks.some((t) => t.falling) || S.shake > 0 || Math.abs(S.camX) > 0.3;
  }

  function frame(ts) {
    raf = 0;
    if (!mounted) return;
    if (document.hidden || el.offsetParent === null) { sleeping = true; return; }
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
    last = ts;
    S.acc += dt;
    inFrame = true;
    let n = 0;
    while (S.acc >= DT && n++ < 12) {
      S.acc -= DT;
      if (S.phase === 'ai') stepAI(DT);
      stepWorld(DT);
    }
    inFrame = false;
    if (S.phase === 'ai' || S.phase === 'fly') syncSliders();
    render();
    if (busy()) raf = requestAnimationFrame(frame);
    else last = 0;
  }

  function wake() {
    if (!mounted) return;
    if (sleeping && !document.hidden && el.offsetParent !== null) { sleeping = false; layout(); kick(); }
  }

  /* ---------------- rendering ---------------- */
  function render() {
    if (!ctx) return;
    const k = cv.width / W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const sx = S.shake ? rand(-S.shake, S.shake) : 0, sy = S.shake ? rand(-S.shake, S.shake) : 0;
    ctx.save();
    ctx.translate(sx, sy);
    drawBackdrop();
    drawTerrain();
    drawPaths();
    S.tanks.forEach(drawTank);
    drawProjs();
    drawBooms();
    drawParts();
    ctx.restore();
    drawHUD();
  }

  function drawBackdrop() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#070a1c'); g.addColorStop(0.45, '#1a1636'); g.addColorStop(0.75, '#3b2240'); g.addColorStop(1, '#5a2f34');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    const cx = -S.camX * 0.01;
    for (const s of S.stars) { ctx.globalAlpha = s.a; ctx.fillStyle = '#fff6e8'; ctx.fillRect(s.x + cx, s.y, s.r, s.r); }
    ctx.globalAlpha = 1;
    // moon
    const m = S.moon, mx = m.x - S.camX * 0.015;
    const mg = ctx.createRadialGradient(mx, m.y, 4, mx, m.y, 60);
    mg.addColorStop(0, 'rgba(255,214,170,.35)'); mg.addColorStop(1, 'rgba(255,214,170,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, m.y, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe2bf'; ctx.beginPath(); ctx.arc(mx, m.y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(220,170,130,.45)'; ctx.beginPath(); ctx.arc(mx - 5, m.y - 3, 3.5, 0, Math.PI * 2); ctx.arc(mx + 5, m.y + 5, 2.5, 0, Math.PI * 2); ctx.fill();
    hillLayer(S.far, 0.03, '#2a2044', '#231a3a');
    hillLayer(S.mid, 0.07, '#3a2440', '#2b1b31');
  }

  function hillLayer(pts, par, c1, c2) {
    const off = -40 - S.camX * par, step = (W + 80) / (pts.length - 1);
    ctx.beginPath();
    ctx.moveTo(off, H);
    for (let i = 0; i < pts.length; i++) ctx.lineTo(off + i * step, pts[i]);
    ctx.lineTo(off + W + 80, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  function drawTerrain() {
    const top = S.top;
    ctx.beginPath();
    ctx.moveTo(-20, H + 20);
    ctx.lineTo(-20, top[0]);
    for (let x = 0; x <= W; x++) ctx.lineTo(x, top[x]);
    ctx.lineTo(W + 20, top[W]);
    ctx.lineTo(W + 20, H + 20);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, H * 0.25, 0, H);
    g.addColorStop(0, '#6b4129'); g.addColorStop(0.5, '#47291c'); g.addColorStop(1, '#22140e');
    ctx.fillStyle = g;
    ctx.fill();
    // strata lines
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,.14)';
    ctx.lineWidth = 1;
    for (let y = 330; y < H; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= W; x += 48) ctx.lineTo(x, y + Math.sin(x * 0.02 + y) * 4); ctx.stroke(); }
    ctx.restore();
    // rim
    ctx.beginPath();
    ctx.moveTo(0, top[0]);
    for (let x = 1; x <= W; x++) ctx.lineTo(x, top[x]);
    ctx.strokeStyle = '#c47a45';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,190,130,.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawPaths() {
    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const p = S.paths[i];
      if (!p || p.length < 2) continue;
      const live = S.projs.find((q) => q.rec);
      if (live && live.rec === p) continue;
      ctx.globalAlpha = i === S.turn ? 0.38 : 0.14;
      ctx.strokeStyle = i ? colors.cool : colors.ember;
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let k = 1; k < p.length; k++) ctx.lineTo(p[k][0], p[k][1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTank(t, i) {
    const c = i ? colors.cool : colors.ember, x = t.x, y = t.y;
    ctx.save();
    if (t.dead) {
      ctx.fillStyle = '#1b1715';
      ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 10, y - 8); ctx.lineTo(x + 9, y - 6); ctx.lineTo(x + 14, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 2, y - 7); ctx.lineTo(x + 12, y - 2); ctx.stroke();
      ctx.restore();
      return;
    }
    // barrel
    const a = rad(t.angle), px = x, py = y - 13;
    ctx.strokeStyle = '#2b2622'; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * BARREL, py - Math.sin(a) * BARREL); ctx.stroke();
    ctx.strokeStyle = i ? '#c8f3ee' : '#ffd0a8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * BARREL, py - Math.sin(a) * BARREL); ctx.stroke();
    // treads
    ctx.fillStyle = '#1e1a18';
    rr(x - 15, y - 7, 30, 7, 3.5); ctx.fill();
    ctx.fillStyle = '#4a423c';
    for (let k = -10; k <= 10; k += 5) { ctx.beginPath(); ctx.arc(x + k, y - 3.5, 1.7, 0, Math.PI * 2); ctx.fill(); }
    // hull
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(x - 13, y - 6); ctx.lineTo(x + 13, y - 6); ctx.lineTo(x + 9, y - 12); ctx.lineTo(x - 9, y - 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.fillRect(x - 12, y - 8, 24, 2);
    // dome
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x, y - 12, 6.5, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.arc(x - 2, y - 14, 2, 0, Math.PI * 2); ctx.fill();
    // health bar
    const bw = 34, bx = x - bw / 2, by = y - 36;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(bx - 1, by - 1, bw + 2, 6, 3); ctx.fill();
    ctx.fillStyle = t.hp > 50 ? '#4ade80' : t.hp > 25 ? '#ffc861' : '#ff5a52';
    rr(bx, by, (bw * t.hp) / 100, 4, 2); ctx.fill();
    // active marker
    if (i === S.turn && S.phase !== 'over') {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(x, by - 4); ctx.lineTo(x - 5, by - 11); ctx.lineTo(x + 5, by - 11); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (w <= 0) return;
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawProjs() {
    for (const p of S.projs) {
      const c = p.owner ? colors.cool : colors.ember;
      // live trail
      if (p.rec && p.rec.length > 1) {
        ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.globalAlpha = 0.55;
        ctx.beginPath();
        const st = Math.max(0, p.rec.length - 60);
        ctx.moveTo(p.rec[st][0], p.rec[st][1]);
        for (let k = st + 1; k < p.rec.length; k++) ctx.lineTo(p.rec[k][0], p.rec[k][1]);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (!p.rolling) {
        ctx.strokeStyle = c; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (p.y < 0) {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(p.x, 4); ctx.lineTo(p.x - 5, 12); ctx.lineTo(p.x + 5, 12); ctx.closePath(); ctx.fill();
        ctx.font = '10px ' + colors.mono; ctx.textAlign = 'center'; ctx.fillText(Math.round(-p.y) + '', p.x, 24);
        continue;
      }
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 8);
      g.addColorStop(0, 'rgba(255,240,200,.9)'); g.addColorStop(1, 'rgba(255,160,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3dc';
      ctx.beginPath(); ctx.arc(p.x, p.rolling ? p.y - 3 : p.y, p.rolling ? 3.5 : 2.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawBooms() {
    for (const b of S.booms) {
      const k = b.t / b.dur, e = 1 - (1 - k) * (1 - k), r = b.r * (0.35 + 0.75 * e);
      ctx.globalAlpha = 1 - k;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      if (b.dirt) { g.addColorStop(0, 'rgba(190,140,90,.9)'); g.addColorStop(1, 'rgba(110,70,40,0)'); }
      else { g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.35, 'rgba(255,190,90,.95)'); g.addColorStop(0.7, 'rgba(255,110,50,.7)'); g.addColorStop(1, 'rgba(160,40,30,0)'); }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
      if (!b.dirt) {
        ctx.strokeStyle = 'rgba(255,220,170,' + (0.6 * (1 - k)) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.5 + e), 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawParts() {
    for (const q of S.parts) {
      ctx.globalAlpha = 1 - q.life / q.max;
      ctx.fillStyle = q.c;
      ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = '700 15px ' + colors.display;
    for (const f of S.floats) {
      ctx.globalAlpha = Math.min(1, 1.6 - f.t);
      ctx.fillStyle = '#000';
      ctx.fillText(f.text, f.x + 1, f.y - f.t * 26 + 1);
      ctx.fillStyle = f.c === colors.ember ? '#ffb27a' : '#b5f0e8';
      ctx.fillText(f.text, f.x, f.y - f.t * 26);
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    // players
    for (let i = 0; i < 2; i++) {
      const t = S.tanks[i], c = i ? colors.cool : colors.ember, x = i ? W - 196 : 16, y = 14;
      ctx.fillStyle = 'rgba(10,8,14,.55)'; rr(x, y, 180, 46, 10); ctx.fill();
      if (i === S.turn && S.phase !== 'over') { ctx.strokeStyle = c; ctx.lineWidth = 1.5; rr(x, y, 180, 46, 10); ctx.stroke(); }
      ctx.textAlign = 'left';
      ctx.fillStyle = c; ctx.font = '700 12px ' + colors.display;
      ctx.fillText(pname(i).toUpperCase(), x + 12, y + 18);
      ctx.textAlign = 'right'; ctx.fillStyle = '#f3ece5'; ctx.font = '600 12px ' + colors.mono;
      ctx.fillText(Math.ceil(t.hp) + ' HP', x + 168, y + 18);
      ctx.fillStyle = 'rgba(255,255,255,.1)'; rr(x + 12, y + 27, 156, 6, 3); ctx.fill();
      ctx.fillStyle = c; rr(x + 12, y + 27, (156 * t.hp) / 100, 6, 3); ctx.fill();
      ctx.textAlign = 'left'; ctx.fillStyle = '#a3968a'; ctx.font = '10px ' + colors.mono;
      ctx.fillText(WEAPONS[t.weapon].name + '  ' + Math.round(t.angle) + '°  ' + Math.round(t.power), x + 12, y + 44);
    }
    // wind
    const cx = W / 2, cy = 26;
    ctx.fillStyle = 'rgba(10,8,14,.55)'; rr(cx - 70, 12, 140, 38, 10); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#a3968a'; ctx.font = '600 9px ' + colors.body;
    ctx.fillText('WIND', cx, cy - 2);
    const w = S.wind, len = Math.abs(w) * 5;
    ctx.fillStyle = '#f3ece5'; ctx.font = '600 13px ' + colors.mono;
    if (!w) ctx.fillText('calm', cx, cy + 16);
    else {
      const d = w > 0 ? 1 : -1, ay = cy + 11, x0 = cx - (d * len) / 2 - d * 10, x1 = cx + (d * len) / 2 - d * 10;
      ctx.strokeStyle = '#ffc861'; ctx.fillStyle = '#ffc861'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, ay); ctx.lineTo(x1, ay); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1 + d * 6, ay); ctx.lineTo(x1 - d * 1, ay - 5); ctx.lineTo(x1 - d * 1, ay + 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f3ece5'; ctx.textAlign = d > 0 ? 'left' : 'right';
      ctx.fillText(Math.abs(w) + '', d > 0 ? x1 + 12 : x1 - 12, ay + 4.5);
    }
    // turn / status line
    if (S.phase !== 'over') {
      ctx.textAlign = 'center'; ctx.font = '600 12px ' + colors.body;
      ctx.fillStyle = S.turn ? colors.cool : colors.ember;
      const msg = S.phase === 'ai' ? 'Mulebot is aiming…' : S.phase === 'aim' ? pname(S.turn) + ' to fire' : '';
      if (msg) ctx.fillText(msg, cx, 68);
    }
    ctx.textAlign = 'left';
  }

  /* ---------------- UI ---------------- */
  function buildUI() {
    root = document.createElement('div');
    root.className = 'ag-tanks';
    root.innerHTML = `
      <div class="agt-head">
        <div><h2 class="agt-title">Tank Duel</h2>
          <div class="agt-how">Take turns lobbing shells over the hills. Mind the wind. First to ${FIRST_TO} rounds wins.</div></div>
        <div class="agt-score"><span class="p0" data-r="n0">Ember</span><span data-r="s0">0</span><span style="color:var(--dim)">:</span><span data-r="s1">0</span><span class="p1" data-r="n1">Teal</span>
          <div><small data-r="sub"></small></div></div>
        <div class="agt-actions">
          <select data-r="mode" aria-label="Mode">
            <option value="ai-easy">vs Computer · Easy</option><option value="ai-normal">vs Computer · Normal</option>
            <option value="ai-hard">vs Computer · Hard</option><option value="pvp">2 players · same PC</option></select>
          <button class="btn sec small" data-r="new">New match</button>
          <button class="btn sec small" data-r="snd" aria-label="Sound"></button>
        </div>
      </div>
      <div class="agt-stage" data-r="stage"><canvas></canvas>
        <div class="agt-banner" data-r="banner" hidden><div><h3 data-r="bt"></h3><p data-r="bs"></p><button class="btn pri" data-r="bb"></button></div></div>
      </div>
      <div class="agt-ctrl" data-r="ctrl">
        <div class="agt-who"><i></i><div><b data-r="who">Ember</b><small data-r="whos">your turn</small></div></div>
        <label class="agt-sl">Angle <input type="range" min="0" max="180" step="1" data-r="ang"><span data-r="angv">45°</span></label>
        <label class="agt-sl">Power <input type="range" min="5" max="100" step="1" data-r="pow"><span data-r="powv">60</span></label>
        <div class="agt-weps" data-r="weps"></div>
        <button class="btn pri agt-fire" data-r="fire">Fire</button>
      </div>
      <details class="agt-tips"><summary>Tips &amp; controls</summary><ul>
        <li><kbd>←</kbd> <kbd>→</kbd> aim the barrel (hold <kbd>Shift</kbd> for 5°), <kbd>↑</kbd> <kbd>↓</kbd> power, <kbd>Space</kbd> or <kbd>Enter</kbd> fire, <kbd>1</kbd>–<kbd>5</kbd> pick a weapon.</li>
        <li>Your last shot's path stays on screen as a faint dotted line: nudge from it instead of guessing again.</li>
        <li>Wind pushes shells sideways the whole flight. Higher lobs stay up longer and drift further.</li>
        <li>Blasting the ground under a tank drops it, and falls hurt. Dirt Bomb can bury a shot lane or rebuild cover.</li>
        <li>Roller lands, then rolls downhill until it hits a tank or a rise. Great when the enemy sits in a valley.</li>
        <li>Big One, Triple, Dirt Bomb and Roller have limited ammo each round.</li>
      </ul></details>`;
    el.appendChild(root);
    root.querySelectorAll('[data-r]').forEach((n) => (ui[n.dataset.r] = n));
    cv = root.querySelector('canvas');
    ctx = cv.getContext('2d');
    stage = ui.stage;
    ui.weps.innerHTML = WEAPONS.map((w, i) => `<button class="agt-wep" data-w="${i}" title="${w.desc} (key ${i + 1})">${w.name}<em></em></button>`).join('');
    ui.wepBtns = [...ui.weps.querySelectorAll('button')];

    root.addEventListener('click', onClick);
    ui.ang.addEventListener('input', () => { if (canAim()) { cur().angle = 180 - +ui.ang.value; syncSliders(); render(); } });
    ui.pow.addEventListener('input', () => { if (canAim()) { cur().power = +ui.pow.value; syncSliders(); render(); } });
    ui.mode.addEventListener('change', () => {
      const v = ui.mode.value;
      if (v === 'pvp') S.mode = 'pvp'; else { S.mode = 'ai'; S.diff = v.slice(3); }
      ui.mode.blur();
      newMatch();
    });
    for (const s of [ui.ang, ui.pow]) s.addEventListener('pointerup', () => s.blur());
  }

  function onClick(e) {
    ensureAudio();
    const b = e.target.closest('button');
    if (!b) return;
    b.blur();
    const r = b.dataset.r;
    if (r === 'new') newMatch();
    else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); syncUI(); if (soundOn) sfxBlip(660, 0.08, 'sine', 0.1); }
    else if (r === 'fire') { if (canAim()) fire(); }
    else if (r === 'bb') bannerAction();
    else if (b.dataset.w != null) selectWeapon(+b.dataset.w);
  }

  const cur = () => S.tanks[S.turn];
  const canAim = () => S.phase === 'aim' && !isAI(S.turn);

  function selectWeapon(i) {
    if (!canAim()) return;
    if (!(cur().ammo[i] > 0)) return;
    cur().weapon = i;
    sfxBlip(520, 0.05, 'square', 0.05);
    syncUI(); render();
  }

  function syncSliders() {
    const t = cur();
    ui.ang.value = String(Math.round(180 - t.angle));
    ui.pow.value = String(Math.round(t.power));
    ui.angv.textContent = Math.round(t.angle) + '°';
    ui.powv.textContent = String(Math.round(t.power));
  }

  function syncUI() {
    if (!root) return;
    const t = cur(), ai = isAI(S.turn), aim = canAim();
    root.classList.toggle('t1', S.turn === 1);
    ui.n0.textContent = pname(0); ui.n1.textContent = pname(1);
    ui.s0.textContent = S.score[0]; ui.s1.textContent = S.score[1];
    ui.sub.textContent = 'Round ' + Math.min(S.round, 99) + ' · first to ' + FIRST_TO + ' · match wins ' + S.wins[0] + '–' + S.wins[1];
    ui.mode.value = S.mode === 'pvp' ? 'pvp' : 'ai-' + S.diff;
    ui.snd.textContent = soundOn ? '🔊' : '🔇';
    ui.who.textContent = pname(S.turn);
    ui.whos.textContent = S.phase === 'over' ? 'round over' : ai ? 'computer is aiming' : S.phase === 'aim' ? (S.mode === 'pvp' ? 'your turn' : 'your turn') : 'shot in flight';
    ui.ctrl.classList.toggle('busy', !aim);
    ui.fire.disabled = !aim;
    ui.ang.disabled = ui.pow.disabled = !aim;
    ui.wepBtns.forEach((b, i) => {
      const n = t.ammo[i];
      b.classList.toggle('on', t.weapon === i);
      b.disabled = !(n > 0);
      b.querySelector('em').textContent = n === Infinity ? '∞' : n > 0 ? '×' + n : 'out';
    });
    syncSliders();
    if (S.banner && S.phase === 'over') {
      ui.banner.hidden = false;
      ui.bt.textContent = S.banner.title;
      ui.bt.style.color = S.banner.c === 0 ? 'var(--ember)' : S.banner.c === 1 ? 'var(--cool)' : '';
      ui.bs.textContent = S.banner.sub;
      ui.bb.textContent = S.banner.btn;
    } else ui.banner.hidden = true;
  }

  function layout() {
    if (!root || el.offsetParent === null) return;
    const ctrlH = ui.ctrl.offsetHeight + 60;
    const top = stage.getBoundingClientRect().top;
    const availH = Math.max(260, window.innerHeight - top - ctrlH - 40);
    const availW = root.clientWidth || 900;
    const cssW = Math.floor(Math.min(availW, (availH * W) / H, 1100));
    const cssH = Math.round((cssW * H) / W);
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    const bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    render();
  }

  function onResize() { if (mounted && el.offsetParent !== null) layout(); }

  /* ---------------- input ---------------- */
  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', '1', '2', '3', '4', '5'];
  function ignoreEvent(e) {
    if (!mounted || el.offsetParent === null) return true;
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return true;
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    return false;
  }

  function onKey(e) {
    if (ignoreEvent(e) || !KEYS.includes(e.key)) return;
    e.preventDefault();
    ensureAudio();
    if (S.phase === 'over') { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) bannerAction(); return; }
    if (!canAim()) return;
    const t = cur(), st = e.shiftKey ? 5 : 1;
    switch (e.key) {
      case 'ArrowLeft': t.angle = clamp(Math.round(t.angle) + st, 0, 180); break;
      case 'ArrowRight': t.angle = clamp(Math.round(t.angle) - st, 0, 180); break;
      case 'ArrowUp': t.power = clamp(Math.round(t.power) + st, 5, 100); break;
      case 'ArrowDown': t.power = clamp(Math.round(t.power) - st, 5, 100); break;
      case ' ': case 'Enter': if (!e.repeat) fire(); return;
      default: selectWeapon(+e.key - 1); return;
    }
    syncSliders(); render();
  }

  function onKeyUp(e) {
    if (ignoreEvent(e)) return;
    if (e.key === ' ' || e.key === 'Enter') e.preventDefault();
  }

  /* ---------------- sound ---------------- */
  function ensureAudio() {
    if (actx || !soundOn) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { actx = new AC(); } catch (e) { actx = null; }
  }
  function sfxBlip(f, d, type, vol, f2) {
    if (!soundOn || !actx) return;
    try {
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(vol || 0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    } catch (e) { /* ignore */ }
  }
  function sfxNoise(d, f0, f1, vol) {
    if (!soundOn || !actx) return;
    try {
      const t = actx.currentTime, len = Math.floor(actx.sampleRate * d), buf = actx.createBuffer(1, len, actx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = actx.createBufferSource(), fl = actx.createBiquadFilter(), g = actx.createGain();
      src.buffer = buf; fl.type = 'lowpass'; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + d);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      src.connect(fl); fl.connect(g); g.connect(actx.destination); src.start(t);
      src.onended = () => { src.disconnect(); fl.disconnect(); g.disconnect(); };
    } catch (e) { /* ignore */ }
  }
  function sfxFire() { sfxNoise(0.18, 3000, 300, 0.18); sfxBlip(220, 0.18, 'square', 0.06, 70); }
  function sfxBoom(r) { sfxNoise(0.35 + r / 120, 900 + r * 10, 60, 0.35); sfxBlip(90, 0.3, 'sine', 0.18, 35); }
  function sfxWin(good) { [0, 0.12, 0.24].forEach((d, i) => setTimeoutSafe(() => sfxBlip(good ? 440 * (1 + i * 0.25) : 330 / (1 + i * 0.2), 0.14, 'triangle', 0.08), d * 1000)); }
  let timers = [];
  function setTimeoutSafe(fn, ms) { const id = setTimeout(() => { timers = timers.filter((x) => x !== id); if (mounted) fn(); }, ms); timers.push(id); }

  function onVis() { wake(); }

  /* ---------------- mount ---------------- */
  window.VanArcade[ID] = {
    mount(container, a) {
      if (mounted) this.unmount();
      el = container; api = a; mounted = true; sleeping = false; ui = {};
      if (!document.getElementById('ag-' + ID + '-css')) {
        const st = document.createElement('style');
        st.id = 'ag-' + ID + '-css';
        st.textContent = CSS;
        document.head.appendChild(st);
      }
      const cs = getComputedStyle(el);
      const v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
      colors = { ember: v('--ember', '#ff8a3d'), cool: v('--cool', '#6fd3c7'), mono: v('--mono', 'monospace'), display: v('--display', 'sans-serif'), body: v('--body', 'sans-serif') };
      const snd = api.load('sound');
      soundOn = snd == null ? !!api.sound : !!snd;
      initState(api.load('state'));
      buildUI();
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', onVis);
      if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (!mounted) return; onResize(); wake(); }); ro.observe(el); }
      startRound();
      layout();
    },
    unmount() {
      mounted = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      timers.forEach(clearTimeout); timers = [];
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      if (ro) { ro.disconnect(); ro = null; }
      if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
      if (root) root.removeEventListener('click', onClick);
      if (el) el.innerHTML = '';
      root = cv = ctx = stage = null; ui = {};
    },
    // test/debug hooks
    _debug: {
      get state() { return S; },
      simulate: (ti, a, p, wi, wind) => simulate(ti, a, p, wi, wind),
      fire: () => fire(),
      aiPlan: () => aiPlan(),
      explode: (x, y, wi) => { explode(x, y, wi || 0); kick(); },
      busy: () => !!busy(),
      raf: () => raf,
      WEAPONS,
    },
  };
})();
