/* VanMule Arcade: "Mini Golf" - top-down canvas mini golf, 18 original holes, 1-4 players hot-seat.
   Drag back to aim (mouse) or arrows + Space (keyboard / controller). */
(function () {
  'use strict';
  const ID = 'minigolf';
  const WW = 800, WH = 500;            // world size
  const BR = 7, CUP = 11, WALL = 4;    // ball radius, cup radius, wall half-thickness
  const CR = BR + WALL;                // collision radius against walls
  const MAXV = 1050, MAX_STROKES = 10;
  const PCOL = ['#ff8a3d', '#6fd3c7', '#ffc861', '#ff7eb6'];
  const PNAME = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

  /* ---------------- holes ---------------- */
  const R = (x, y, w, h) => [x, y, x + w, y, x + w, y + h, x, y + h];
  const HOLES = [
    { name: 'Warm-Up', par: 2, tee: [150, 250], cup: [650, 250], outer: [R(90, 160, 620, 180)] },
    { name: 'Dogleg', par: 3, tee: [120, 135], cup: [650, 385],
      outer: [[60, 60, 740, 60, 740, 440, 560, 440, 560, 210, 60, 210]],
      rubber: [[680, 60, 740, 120]], sand: [[640, 270, 34]] },
    { name: 'Bunker Pass', par: 3, tee: [110, 250], cup: [680, 250],
      outer: [R(60, 90, 680, 320)], blocks: [R(300, 90, 24, 110), R(300, 300, 24, 110)],
      sand: [[565, 250, 52], [460, 150, 36], [460, 350, 36]] },
    { name: 'The Windmill', par: 3, tee: [110, 250], cup: [690, 250],
      outer: [R(60, 150, 680, 200)], mills: [{ x: 420, y: 250, len: 92, n: 3, w: 1.25, hub: 16 }] },
    { name: 'Bank Shot', par: 2, tee: [200, 130], cup: [600, 130],
      outer: [[60, 60, 740, 60, 740, 370, 670, 440, 130, 440, 60, 370]], blocks: [R(390, 60, 20, 280)],
      rubber: [[60, 370, 130, 440], [740, 370, 670, 440]] },
    { name: 'The Bridge', par: 3, tee: [110, 250], cup: [690, 165],
      outer: [R(60, 110, 680, 280)], water: [R(320, 110, 160, 115), R(320, 275, 160, 115)] },
    { name: 'Uphill', par: 3, tee: [110, 250], cup: [680, 250],
      outer: [R(60, 170, 680, 160)], slopes: [{ p: R(260, 170, 300, 160), f: [-240, 0] }], sand: [[220, 250, 30]] },
    { name: 'Bumper Alley', par: 3, tee: [110, 250], cup: [690, 250],
      outer: [R(60, 70, 680, 360)],
      bumpers: [[260, 170, 18], [260, 330, 18], [370, 250, 22], [480, 140, 18], [480, 360, 18], [590, 250, 18]] },
    { name: 'Wormhole', par: 2, tee: [110, 250], cup: [680, 175],
      outer: [R(60, 120, 300, 260), R(440, 120, 300, 260)], tunnels: [{ a: [310, 250], b: [490, 250] }] },
    { name: 'Zig-Zag', par: 4, tee: [130, 120], cup: [670, 380],
      outer: [R(60, 60, 680, 380)], blocks: [R(270, 60, 20, 270), R(510, 170, 20, 270)],
      rubber: [[60, 400, 100, 440], [700, 60, 740, 100]] },
    { name: 'The Hill', par: 3, tee: [110, 250], cup: [670, 250],
      outer: [R(60, 100, 680, 300)], hills: [[380, 250, 125, 520], [670, 250, 55, -110]], bumpers: [[560, 180, 14], [560, 320, 14]] },
    { name: 'Sliding Gate', par: 3, tee: [110, 250], cup: [690, 250],
      outer: [R(60, 100, 680, 300)], blocks: [R(390, 100, 20, 100), R(390, 300, 20, 100)],
      gates: [{ p: R(386, 200, 28, 100), axis: [0, 1], amp: 100, w: 1.5 }], sand: [[600, 160, 34], [600, 340, 34]] },
    { name: 'Island Green', par: 3, tee: [120, 250], cup: [575, 250],
      outer: [R(60, 80, 680, 340)], water: [[560, 250, 150]], land: [[560, 250, 64], R(400, 226, 140, 48)] },
    { name: 'Pinball', par: 3, tee: [400, 420], cup: [400, 105],
      outer: [[200, 40, 600, 40, 700, 140, 700, 460, 100, 460, 100, 140]],
      bumpers: [[300, 230, 20], [500, 230, 20], [400, 310, 24], [400, 185, 13]],
      rubber: [[120, 300, 185, 400], [680, 300, 615, 400], [200, 40, 100, 140], [600, 40, 700, 140]] },
    { name: 'Tunnel Trio', par: 3, tee: [130, 250], cup: [690, 250],
      outer: [R(60, 60, 680, 380)], blocks: [R(400, 60, 20, 380)],
      tunnels: [{ a: [355, 130], b: [470, 250] }, { a: [355, 250], b: [470, 120] }, { a: [355, 370], b: [470, 380] }],
      sand: [R(560, 70, 170, 90)], water: [R(580, 380, 150, 50)] },
    { name: 'Downhill', par: 2, tee: [110, 250], cup: [625, 250],
      outer: [R(60, 180, 680, 140)], slopes: [{ p: R(200, 180, 360, 140), f: [170, 0] }], water: [R(680, 180, 60, 140)] },
    { name: 'Hairpin', par: 3, tee: [120, 150], cup: [120, 352],
      outer: [R(60, 60, 680, 380)], blocks: [R(60, 240, 560, 24)],
      rubber: [[680, 60, 740, 120], [740, 380, 680, 440]], slopes: [{ p: R(220, 264, 380, 176), f: [150, 0] }] },
    { name: 'Grand Finale', par: 4, tee: [100, 400], cup: [670, 390],
      outer: [R(40, 40, 720, 420)], blocks: [R(260, 40, 24, 250), R(520, 210, 24, 250)],
      mills: [{ x: 402, y: 175, len: 80, n: 4, w: -1.1, hub: 14 }], water: [[400, 410, 42]],
      bumpers: [[640, 300, 16]], sand: [[650, 140, 40]] },
  ];

  /* ---------------- geometry / physics (pure) ---------------- */
  function inPoly(p, x, y) {
    let c = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const inShape = (s, x, y) => s.length === 3 ? (x - s[0]) ** 2 + (y - s[1]) ** 2 < s[2] * s[2] : inPoly(s, x, y);
  function prepHole(h) {
    const segs = [];
    const addLoop = (p, closed, kind) => {
      const n = p.length / 2;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const j = (i + 1) % n;
        segs.push({ ax: p[i * 2], ay: p[i * 2 + 1], bx: p[j * 2], by: p[j * 2 + 1], kind });
      }
    };
    (h.outer || []).forEach(p => addLoop(p, true, 'wall'));
    (h.blocks || []).forEach(p => addLoop(p, true, 'wall'));
    (h.rubber || []).forEach(s => segs.push({ ax: s[0], ay: s[1], bx: s[2], by: s[3], kind: 'rubber' }));
    h.segs = segs;
    h.sand = h.sand || []; h.water = h.water || []; h.land = h.land || []; h.slopes = h.slopes || []; h.hills = h.hills || [];
    h.bumpers = h.bumpers || []; h.mills = h.mills || []; h.gates = h.gates || []; h.tunnels = h.tunnels || [];
    h.moving = h.mills.length + h.gates.length + h.slopes.length > 0;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    h.outer.forEach(p => { for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); } });
    y0 -= 50; // room for the flag and the banner
    const M = 26, z = Math.min(WW / (x1 - x0 + M * 2), WH / (y1 - y0 + M * 2), 1.4);
    h.view = { z, ox: (x0 + x1) / 2 - WW / 2 / z, oy: (y0 + y1) / 2 - WH / 2 / z };
    return h;
  }
  HOLES.forEach(prepHole);
  const inSand = (h, x, y) => h.sand.some(s => inShape(s, x, y));
  const inWater = (h, x, y) => h.water.some(s => inShape(s, x, y)) && !h.land.some(s => inShape(s, x, y));
  function gateOffset(g, t) { const o = Math.sin(t * g.w) * g.amp, v = Math.cos(t * g.w) * g.amp * g.w; return { ox: g.axis[0] * o, oy: g.axis[1] * o, vx: g.axis[0] * v, vy: g.axis[1] * v }; }
  function millBlades(m, t) {
    const out = [], a0 = t * m.w;
    for (let k = 0; k < m.n; k++) { const a = a0 + k * Math.PI * 2 / m.n; out.push([Math.cos(a), Math.sin(a)]); }
    return out;
  }
  // collide ball with segment; svx/svy is the segment's velocity at the contact (moving obstacles); returns impact speed
  function collideSeg(b, ax, ay, bx, by, rad, e, svx, svy) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((b.x - ax) * dx + (b.y - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t, py = ay + dy * t;
    let nx = b.x - px, ny = b.y - py;
    const d2 = nx * nx + ny * ny;
    if (d2 >= rad * rad) return -1;
    let d = Math.sqrt(d2);
    if (d < 1e-6) { const L = Math.sqrt(l2) || 1; nx = -dy / L; ny = dx / L; d = 1e-6; } else { nx /= d; ny /= d; }
    b.x = px + nx * rad; b.y = py + ny * rad;
    const rvx = b.vx - (svx || 0), rvy = b.vy - (svy || 0), vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
      // a little tangential friction on impact
      const tx = -ny, ty = nx, vt = (b.vx - (svx || 0)) * tx + (b.vy - (svy || 0)) * ty;
      b.vx -= vt * 0.04 * tx; b.vy -= vt * 0.04 * ty;
      return -vn;
    }
    return 0;
  }
  function collideCircle(b, cx, cy, rad, e, boost) {
    let nx = b.x - cx, ny = b.y - cy;
    const d2 = nx * nx + ny * ny;
    if (d2 >= rad * rad) return -1;
    const d = Math.sqrt(d2) || 1e-6; nx /= d; ny /= d;
    b.x = cx + nx * rad; b.y = cy + ny * rad;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
      if (boost) { const out = b.vx * nx + b.vy * ny; if (out < boost) { b.vx += (boost - out) * nx; b.vy += (boost - out) * ny; } }
      return -vn;
    }
    return 0;
  }
  // advance the ball by dt seconds at world time t; ev collects events
  function step(h, b, t, dt, ev) {
    const sand = inSand(h, b.x, b.y);
    let ax = 0, ay = 0;
    for (const s of h.slopes) if (inPoly(s.p, b.x, b.y)) { ax += s.f[0]; ay += s.f[1]; }
    for (const hl of h.hills) {
      const dx = b.x - hl[0], dy = b.y - hl[1], d = Math.hypot(dx, dy);
      if (d < hl[2] && d > 0.5) { const f = hl[3] * Math.sin(Math.PI * d / hl[2]) ; ax += dx / d * f; ay += dy / d * f; }
    }
    // cup: gentle pull when over the hole
    const cdx = h.cup[0] - b.x, cdy = h.cup[1] - b.y, cd = Math.hypot(cdx, cdy);
    if (cd < CUP && cd > 0.01) { const f = 1500 * (1 - cd / CUP) + 200; ax += cdx / cd * f; ay += cdy / cd * f; }
    b.vx += ax * dt; b.vy += ay * dt;
    let sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const mu = sand ? 760 : 105, drag = sand ? 1.6 : 0.33;
      const ns = Math.max(0, sp - (mu + drag * sp) * dt);
      b.vx *= ns / sp; b.vy *= ns / sp; sp = ns;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    // moving obstacles first, static walls last (static always wins)
    if (b.ghost > 0) b.ghost -= dt;
    else {
      for (const m of h.mills) {
        const bl = millBlades(m, t);
        for (const [cx, cy] of bl) {
          const ex = m.x + cx * m.len, ey = m.y + cy * m.len;
          // velocity of the blade at the closest point
          const px = b.x - m.x, py = b.y - m.y, along = Math.max(0, Math.min(m.len, px * cx + py * cy));
          const vx = -cy * along * m.w, vy = cx * along * m.w;
          const imp = collideSeg(b, m.x, m.y, ex, ey, CR, 0.55, vx, vy);
          if (imp > 0) ev.push({ k: 'mill', v: imp });
        }
        const imp = collideCircle(b, m.x, m.y, m.hub + BR, 0.6, 0);
        if (imp > 0) ev.push({ k: 'mill', v: imp });
      }
      for (const g of h.gates) {
        const o = gateOffset(g, t), p = g.p, n = p.length / 2;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const imp = collideSeg(b, p[i * 2] + o.ox, p[i * 2 + 1] + o.oy, p[j * 2] + o.ox, p[j * 2 + 1] + o.oy, CR, 0.6, o.vx, o.vy);
          if (imp > 0) ev.push({ k: 'wall', v: imp });
        }
      }
    }
    for (const s of h.segs) {
      const rub = s.kind === 'rubber';
      const imp = collideSeg(b, s.ax, s.ay, s.bx, s.by, CR, rub ? 0.95 : 0.72, 0, 0);
      if (imp > 0) ev.push({ k: rub ? 'rubber' : 'wall', v: imp });
    }
    for (let i = 0; i < h.bumpers.length; i++) {
      const bp = h.bumpers[i];
      const imp = collideCircle(b, bp[0], bp[1], bp[2] + BR, 0.92, 140);
      if (imp > 0) ev.push({ k: 'bumper', v: imp, i });
    }
    // squashed by a moving obstacle? let it slip through for a moment
    if (b.ghost <= 0) {
      for (const m of h.mills) for (const [cx, cy] of millBlades(m, t)) {
        const ex = m.x + cx * m.len, ey = m.y + cy * m.len, px = b.x - m.x, py = b.y - m.y;
        const along = Math.max(0, Math.min(m.len, px * cx + py * cy)), qx = m.x + cx * along - b.x, qy = m.y + cy * along - b.y;
        if (qx * qx + qy * qy < (CR * 0.55) ** 2 && ex) b.ghost = 0.25;
      }
      for (const g of h.gates) { const o = gateOffset(g, t); if (inPoly(g.p, b.x - o.ox, b.y - o.oy)) b.ghost = 0.25; }
    }
    // tunnels
    if (b.tcool > 0) b.tcool -= dt;
    else for (const tn of h.tunnels) {
      if ((b.x - tn.a[0]) ** 2 + (b.y - tn.a[1]) ** 2 < 15 * 15) {
        const s = Math.max(Math.hypot(b.vx, b.vy), 120), d = Math.hypot(b.vx, b.vy) || 1;
        const dx = b.vx / d || 1, dy = b.vy / d || 0;
        b.x = tn.b[0] + dx * 20; b.y = tn.b[1] + dy * 20; b.vx = dx * s * 0.9; b.vy = dy * s * 0.9;
        b.tcool = 0.35; ev.push({ k: 'tunnel', a: tn.a, b: tn.b });
        break;
      }
    }
    // cup
    const cd2 = Math.hypot(h.cup[0] - b.x, h.cup[1] - b.y), sp2 = Math.hypot(b.vx, b.vy);
    if (cd2 < CUP - 2.5 && sp2 < 330) { ev.push({ k: 'cup' }); return 'cup'; }
    if (inWater(h, b.x, b.y)) { ev.push({ k: 'water' }); return 'water'; }
    // stop
    if (sp2 < 4) {
      const fm = Math.hypot(ax, ay);
      if (fm < (sand ? 760 : 105)) { b.vx = 0; b.vy = 0; return 'stop'; }
    }
    return null;
  }
  // run the simulation until the ball stops (for tests / solvability checks)
  function simulate(hi, x, y, ang, pow, t0) {
    const h = HOLES[hi], b = { x, y, vx: Math.cos(ang) * pow * MAXV, vy: Math.sin(ang) * pow * MAXV, ghost: 0, tcool: 0 };
    let t = t0 || 0, res = null;
    const ev = [];
    for (let k = 0; k < 240 * 30 && !res; k++) {
      const sp = Math.hypot(b.vx, b.vy), n = Math.max(1, Math.ceil(sp / 240 / 2));
      for (let s = 0; s < n && !res; s++) res = step(h, b, t, 1 / 240 / n, ev);
      t += 1 / 240;
    }
    return { res: res || 'timeout', x: b.x, y: b.y, t };
  }

  /* ---------------- UI ---------------- */
  const CSS = `
.ag-minigolf{font-family:var(--body);color:var(--fg);user-select:none;-webkit-user-select:none;max-width:1100px;margin:0 auto}
.ag-minigolf .hd{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px}
.ag-minigolf .ttl{flex:1;min-width:240px}
.ag-minigolf h2{font-family:var(--display);font-size:26px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-minigolf h2 span{color:var(--ok)}
.ag-minigolf .how{color:var(--muted);font-size:13px;margin-top:3px}
.ag-minigolf .btns{display:flex;gap:6px;flex-wrap:wrap}
.ag-minigolf .hud{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:stretch}
.ag-minigolf .hb{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:4px 11px;min-width:62px}
.ag-minigolf .hb b{display:block;font-size:9.5px;letter-spacing:1.3px;color:var(--dim);text-transform:uppercase}
.ag-minigolf .hb i{font-style:normal;font-family:var(--mono);font-size:16px;font-weight:700;white-space:nowrap}
.ag-minigolf .hb.pl i{font-family:var(--body)}
.ag-minigolf .hb.pl .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:0}
.ag-minigolf .hb.best i{color:var(--gold)}
.ag-minigolf .hb.grow{flex:1;min-width:120px}
.ag-minigolf .stage{position:relative;line-height:0;margin:0 auto;width:max-content;max-width:100%}
.ag-minigolf canvas{display:block;border-radius:14px;background:#0b0d0b;box-shadow:0 0 0 1px var(--line),0 18px 40px rgba(0,0,0,.45);touch-action:none;cursor:crosshair}
.ag-minigolf .ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,12,10,.72);border-radius:14px;line-height:1.45;padding:12px}
.ag-minigolf .box{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 20px;max-width:100%;max-height:100%;overflow:auto;box-shadow:0 16px 40px rgba(0,0,0,.6)}
.ag-minigolf .box h3{margin:0 0 4px;font-family:var(--display);font-size:20px}
.ag-minigolf .box h3 span{color:var(--ok)}
.ag-minigolf .box p{margin:0 0 10px;color:var(--muted);font-size:13px}
.ag-minigolf .row{display:flex;align-items:center;gap:10px;margin:8px 0;flex-wrap:wrap}
.ag-minigolf .row>span{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em;min-width:64px}
.ag-minigolf .seg{display:inline-flex;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px}
.ag-minigolf .seg button{height:28px;padding:0 11px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-minigolf .seg button:hover{color:var(--fg)}
.ag-minigolf .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-minigolf .names{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0 4px}
.ag-minigolf .names label{display:flex;align-items:center;gap:6px}
.ag-minigolf .names .dot{width:12px;height:12px;border-radius:50%;flex:none}
.ag-minigolf .names input{width:100%;min-width:0;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--bg);padding:0 8px;font-size:13px}
.ag-minigolf .names label.off{opacity:.3;pointer-events:none}
.ag-minigolf .go{display:flex;gap:8px;align-items:center;margin-top:12px}
.ag-minigolf .go .note{font-size:12px;color:var(--dim);flex:1}
.ag-minigolf table{border-collapse:collapse;font-family:var(--mono);font-size:12px;margin:6px 0}
.ag-minigolf th,.ag-minigolf td{padding:3px 5px;text-align:center;border-bottom:1px solid var(--line);min-width:24px}
.ag-minigolf th{color:var(--dim);font-weight:600}
.ag-minigolf td.nm,.ag-minigolf th.nm{text-align:left;font-family:var(--body);font-weight:700;white-space:nowrap;padding-right:10px}
.ag-minigolf td.tot{font-weight:800;color:var(--fg);background:var(--panel2)}
.ag-minigolf td.cur{background:rgba(111,211,199,.12)}
.ag-minigolf td.ace{color:var(--gold);font-weight:800}
.ag-minigolf td.u{color:var(--ok)} .ag-minigolf td.o{color:#ff9d8a}
.ag-minigolf .win{font-family:var(--display);color:var(--gold);font-size:18px;margin:4px 0 6px}
.ag-minigolf .keys{font-size:12px;color:var(--dim);line-height:1.7;margin-top:8px}
.ag-minigolf kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-minigolf details{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--muted);margin-top:8px}
.ag-minigolf summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-minigolf details ul{margin:8px 0 2px;padding-left:18px}
.ag-minigolf details li{margin:3px 0}
.ag-minigolf details b{color:var(--fg)}
`;

  let el = null, api = null, root = null, cv = null, ctx = null, stage = null, ui = {}, ov = null;
  let raf = 0, lastT = 0, ro = null, dpr = 1, scale = 1, cssW = 800, staticCv = null, staticKey = '';
  let AC = null, noiseBuf = null, soundOn = true;
  let G = null;           // game state
  let opts = { n: 1, names: PNAME.slice(), course: 'all' };
  let best = { all: 0, front: 0, back: 0 };
  const listeners = [];
  const keys = new Set();
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };
  const visible = () => !!(el && !document.hidden && el.offsetParent !== null);
  const courseHoles = c => c === 'front' ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : c === 'back' ? [9, 10, 11, 12, 13, 14, 15, 16, 17] : HOLES.map((h, i) => i);
  const COURSE_LABEL = { front: 'Front 9', back: 'Back 9', all: 'All 18' };

  /* ---------- sound ---------- */
  function ensureAudio() {
    if (!soundOn || AC) return;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const len = AC.sampleRate | 0; noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { AC = null; }
  }
  function tone(f, d, type, vol, f2, at) {
    if (!AC || !soundOn) return;
    try {
      const t = AC.currentTime + (at || 0), o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (e) { /* ignore */ }
  }
  function noise(d, vol, ftype, f1, f2, at, q) {
    if (!AC || !soundOn || !noiseBuf) return;
    try {
      const t = AC.currentTime + (at || 0), s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
      s.buffer = noiseBuf; fl.type = ftype; fl.Q.value = q || 0.8;
      fl.frequency.setValueAtTime(f1, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(AC.destination); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
    } catch (e) { /* ignore */ }
  }
  let lastHitSnd = 0;
  function sfx(k, v) {
    const now = performance.now();
    if (k === 'putt') { noise(0.05, 0.25, 'bandpass', 2400, 0, 0, 1.5); tone(900, 0.05, 'sine', 0.06 + v * 0.06, 500); }
    else if (k === 'wall' || k === 'mill') {
      if (now - lastHitSnd < 40) return; lastHitSnd = now;
      const a = Math.min(1, v / 600);
      if (a < 0.04) return;
      tone(k === 'mill' ? 180 : 320, 0.07, 'triangle', 0.03 + a * 0.09, k === 'mill' ? 120 : 210); noise(0.04, 0.05 + a * 0.12, 'bandpass', 1300, 0, 0, 2);
    } else if (k === 'rubber') { if (now - lastHitSnd < 40) return; lastHitSnd = now; tone(420, 0.12, 'sine', 0.07, 760); }
    else if (k === 'bumper') { if (now - lastHitSnd < 40) return; lastHitSnd = now; tone(300, 0.16, 'square', 0.04, 900); tone(600, 0.1, 'sine', 0.05, 1200, 0.03); }
    else if (k === 'tunnel') { noise(0.35, 0.12, 'bandpass', 300, 2400, 0, 3); tone(200, 0.3, 'sine', 0.05, 800); }
    else if (k === 'sand') noise(0.18, 0.08, 'lowpass', 1200, 300);
    else if (k === 'water') { noise(0.5, 0.22, 'lowpass', 2600, 300, 0, 0.6); [0, 0.07, 0.15, 0.24].forEach((d, i) => tone(500 + i * 170 + Math.random() * 90, 0.06, 'sine', 0.03, 1100, 0.08 + d)); }
    else if (k === 'cup') { [0, 0.07, 0.13, 0.18].forEach((d, i) => tone(1400 - i * 150, 0.05, 'triangle', 0.05, 900, d)); tone(140, 0.22, 'sine', 0.12, 70, 0.2); }
    else if (k === 'ace') { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.2, 'triangle', 0.06, 0, 0.3 + i * 0.1)); for (let i = 0; i < 10; i++) noise(0.06, 0.05, 'bandpass', 3000 + Math.random() * 2000, 0, 0.35 + Math.random() * 0.9, 1); }
    else if (k === 'good') { [659, 784, 988].forEach((f, i) => tone(f, 0.15, 'triangle', 0.05, 0, 0.25 + i * 0.09)); }
    else if (k === 'tick') tone(700, 0.025, 'sine', 0.025);
    else if (k === 'bad') tone(170, 0.08, 'square', 0.03);
    else if (k === 'end') { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.06, 0, i * 0.12)); }
  }

  /* ---------- game flow ---------- */
  function newGame() {
    const list = courseHoles(opts.course);
    G = { phase: 'setup', list, hp: 0, pl: 0, n: opts.n, names: opts.names.slice(0, opts.n), scores: Array.from({ length: opts.n }, () => list.map(() => null)),
      strokes: 0, ball: null, prev: null, t: 0, time: 0, paused: false, auto: false, drag: null, aimA: 0, aimP: 0.45, kbd: false, banner: null,
      parts: [], trail: [], flash: {}, sink: 0, splash: 0, intro: 0, done: false, showCard: false, holeEndT: 0, acc: 0 };
    showSetup();
    draw(); syncUI();
  }
  const hole = () => HOLES[G.list[G.hp]];
  function startRound() {
    G.n = opts.n; G.names = opts.names.slice(0, opts.n).map((s, i) => (s || '').trim() || PNAME[i]);
    G.scores = Array.from({ length: G.n }, () => G.list.map(() => null));
    G.hp = 0; G.pl = 0;
    hideOverlay();
    startTurn(true);
  }
  function startTurn(newHole) {
    const h = hole();
    G.phase = 'aim'; G.strokes = 0; G.sink = 0; G.splash = 0; G.trail = []; G.parts = []; G.drag = null;
    G.ball = { x: h.tee[0], y: h.tee[1], vx: 0, vy: 0, ghost: 0, tcool: 0, z: 1 };
    G.prev = { x: h.tee[0], y: h.tee[1] };
    G.aimA = Math.atan2(h.cup[1] - h.tee[1], h.cup[0] - h.tee[0]);
    if (newHole && G.hp === 0) G.aimP = 0.45;
    G.intro = 1.8;
    G.banner = { big: (newHole ? 'Hole ' + (G.hp + 1) : G.names[G.pl]), small: newHole ? `${h.name} · Par ${h.par}` + (G.n > 1 ? ` · ${G.names[G.pl]} to play` : '') : `Hole ${G.hp + 1} · ${h.name} · Par ${h.par}`, t: 1.8, col: PCOL[G.pl] };
    if (newHole) G.time = 0;
    syncUI(); kick();
  }
  function shoot(ang, pow) {
    if (G.phase !== 'aim' || G.paused) return;
    pow = Math.max(0.02, Math.min(1, pow));
    ensureAudio();
    G.prev = { x: G.ball.x, y: G.ball.y };
    G.ball.vx = Math.cos(ang) * pow * MAXV; G.ball.vy = Math.sin(ang) * pow * MAXV;
    G.strokes++; G.phase = 'roll'; G.drag = null; G.banner = null; G.intro = 0; G.rollT = 0;
    G.aimA = ang; G.aimP = pow;
    G.wasSand = inSand(hole(), G.ball.x, G.ball.y);
    sfx('putt', pow);
    syncUI(); kick();
  }
  function ballStopped() {
    if (G.strokes >= MAX_STROKES) { holeOut(true); return; }
    G.phase = 'aim';
    const h = hole();
    G.aimA = Math.atan2(h.cup[1] - G.ball.y, h.cup[0] - G.ball.x);
    syncUI();
  }
  function holeOut(maxed) {
    const h = hole(), s = G.strokes, d = s - h.par;
    G.scores[G.pl][G.hp] = s;
    G.phase = 'holed'; G.holeEndT = maxed ? 1.6 : 2.0;
    let word;
    if (maxed) word = 'Max strokes';
    else if (s === 1) word = 'Hole in one!';
    else if (d <= -3) word = 'Albatross!';
    else if (d === -2) word = 'Eagle!';
    else if (d === -1) word = 'Birdie!';
    else if (d === 0) word = 'Par';
    else if (d === 1) word = 'Bogey';
    else if (d === 2) word = 'Double bogey';
    else word = '+' + d;
    G.banner = { big: word, small: (G.n > 1 ? G.names[G.pl] + ' · ' : '') + s + (s === 1 ? ' stroke' : ' strokes') + ' · Par ' + h.par, t: 99, col: s === 1 || d < 0 ? '#ffc861' : '#f3ece5' };
    if (!maxed) {
      if (s === 1) { sfx('ace'); confetti(h.cup[0], h.cup[1], 70); try { const n = (api.load('aces') || 0) + 1; api.save('aces', n); } catch (e) { /* ignore */ } }
      else if (d < 0) { sfx('good'); confetti(h.cup[0], h.cup[1], 36); }
    }
    syncUI(); kick();
  }
  function advance() {
    // after a player's hole result banner
    G.banner = null;
    if (G.pl < G.n - 1) { G.pl++; startTurn(false); return; }
    if (G.n > 1 && !G.showCard) { G.phase = 'card'; showCard(false); return; }
    nextHole();
  }
  function nextHole() {
    hideOverlay();
    if (G.hp >= G.list.length - 1) { finishRound(); return; }
    G.hp++; G.pl = 0; startTurn(true);
  }
  function finishRound() {
    G.phase = 'over';
    const tots = G.scores.map(r => r.reduce((a, v) => a + (v || 0), 0));
    const low = Math.min.apply(null, tots);
    let rec = false;
    if (!best[opts.course] || low < best[opts.course]) { best[opts.course] = low; rec = true; }
    try {
      api.save('bests', best);
      if (rec) api.save('best', best.all ? String(best.all) : best.front ? 'F9 ' + best.front : 'B9 ' + best.back);
    } catch (e) { /* ignore */ }
    G.newRecord = rec;
    sfx('end');
    showCard(true);
    syncUI(); draw();
  }

  /* ---------- particles ---------- */
  function confetti(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 260;
      G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 + Math.random() * 0.8, t: 0, c: ['#ff8a3d', '#ffc861', '#6fd3c7', '#ff7eb6', '#f3ece5'][i % 5], sz: 3 + Math.random() * 3, kind: 'conf', rot: Math.random() * 6 });
    }
  }
  function splashFx(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (spd || 60) * (0.4 + Math.random());
      G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.4, t: 0, c: color, sz: 1.5 + Math.random() * 2, kind: 'dot' });
    }
  }

  /* ---------- update ---------- */
  function update(dt) {
    G.time += dt;
    G.t += dt;
    for (const p of G.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; if (p.kind === 'conf') p.rot += dt * 6; }
    G.parts = G.parts.filter(p => p.t < p.life);
    for (const k in G.flash) { G.flash[k] -= dt; if (G.flash[k] <= 0) delete G.flash[k]; }
    if (G.banner && G.banner.t < 50) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
    if (G.intro > 0) G.intro -= dt;
    const h = G.phase === 'setup' || G.phase === 'over' ? null : hole();
    // keyboard aim
    if (G.phase === 'aim' && !G.drag) {
      const fine = keys.has('Shift') ? 0.25 : 1;
      if (keys.has('ArrowLeft')) { G.aimA -= dt * 1.6 * fine * accel('ArrowLeft', dt); G.kbd = true; }
      if (keys.has('ArrowRight')) { G.aimA += dt * 1.6 * fine * accel('ArrowRight', dt); G.kbd = true; }
      if (keys.has('ArrowUp')) { G.aimP = Math.min(1, G.aimP + dt * 0.5 * fine); G.kbd = true; }
      if (keys.has('ArrowDown')) { G.aimP = Math.max(0.03, G.aimP - dt * 0.5 * fine); G.kbd = true; }
    }
    if (G.phase === 'roll') {
      const b = G.ball, ev = [];
      G.rollT += dt;
      let res = null;
      const steps = Math.max(1, Math.ceil(dt * 240));
      for (let s = 0; s < steps && !res; s++) {
        const sdt = dt / steps, sp = Math.hypot(b.vx, b.vy), n = Math.max(1, Math.ceil(sp * sdt / 2));
        for (let k = 0; k < n && !res; k++) res = step(h, b, G.t - dt + (s * sdt), sdt / n, ev);
      }
      const inS = inSand(h, b.x, b.y);
      if (inS && !G.wasSand && Math.hypot(b.vx, b.vy) > 30) { sfx('sand'); splashFx(b.x, b.y, '#e8d3a0', 10, 70); }
      G.wasSand = inS;
      for (const e of ev) {
        if (e.k === 'bumper') { G.flash['b' + e.i] = 0.25; sfx('bumper', e.v); }
        else if (e.k === 'tunnel') { sfx('tunnel'); splashFx(e.a[0], e.a[1], '#ff8a3d', 12, 80); splashFx(e.b[0], e.b[1], '#6fd3c7', 14, 90); G.trail = []; }
        else if (e.k !== 'cup' && e.k !== 'water') sfx(e.k, e.v);
      }
      G.trail.push({ x: b.x, y: b.y }); if (G.trail.length > 14) G.trail.shift();
      if (G.rollT > 25 && !res) { b.vx = 0; b.vy = 0; res = 'stop'; }
      if (res === 'cup') { G.phase = 'sink'; G.sink = 0; sfx('cup'); G.sinkFrom = { x: b.x, y: b.y }; }
      else if (res === 'water') { G.phase = 'splash'; G.splash = 0; sfx('water'); splashFx(b.x, b.y, '#a8dcff', 26, 120); G.strokes++; syncUI(); }
      else if (res === 'stop') { G.trail = []; ballStopped(); }
    } else if (G.phase === 'sink') {
      G.sink += dt;
      const k = Math.min(1, G.sink / 0.25);
      G.ball.x = G.sinkFrom.x + (h.cup[0] - G.sinkFrom.x) * k; G.ball.y = G.sinkFrom.y + (h.cup[1] - G.sinkFrom.y) * k;
      G.ball.z = Math.max(0, 1 - G.sink / 0.35);
      if (G.sink > 0.45) holeOut(false);
    } else if (G.phase === 'splash') {
      G.splash += dt;
      G.ball.z = Math.max(0, 1 - G.splash / 0.3);
      if (G.splash > 1.0) {
        if (G.strokes >= MAX_STROKES) { holeOut(true); return; }
        G.ball = { x: G.prev.x, y: G.prev.y, vx: 0, vy: 0, ghost: 0, tcool: 0, z: 1 };
        G.banner = { big: 'Splash! +1', small: 'Penalty stroke. Ball back to where it was.', t: 1.6, col: '#a8dcff' };
        G.trail = []; ballStopped();
      }
    } else if (G.phase === 'holed') {
      G.holeEndT -= dt;
      if (G.holeEndT <= 0) advance();
    }
  }
  const held = {};
  function accel(k, dt) { held[k] = (held[k] || 0) + dt; return Math.min(2.2, 0.35 + held[k] * 1.4); }

  /* ---------- loop ---------- */
  function animating() {
    if (!G || G.paused) return false;
    if (G.phase === 'setup' || G.phase === 'over' || G.phase === 'card') return G.parts.length > 0;
    return true;
  }
  function kick() { if (!raf && el) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    if (!visible()) { autoPause(); return; }
    if (!lastT) lastT = t;
    const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    if (!G.paused) update(dt);
    draw();
    if (animating()) raf = requestAnimationFrame(frame);
  }
  function autoPause() {
    if (G && !G.paused && (G.phase === 'aim' || G.phase === 'roll' || G.phase === 'sink' || G.phase === 'splash' || G.phase === 'holed')) { G.paused = true; G.auto = true; syncUI(); }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function setPaused(v) {
    if (!G || G.phase === 'setup' || G.phase === 'over' || G.phase === 'card') return;
    G.paused = v; G.auto = false; G.drag = null; keys.clear();
    syncUI();
    if (!v) kick(); else draw();
  }

  /* ---------- drawing ---------- */
  function turf(c, clip) {
    c.save();
    c.beginPath(); clip(c); c.clip();
    c.fillStyle = '#2b7a45'; c.fillRect(0, 0, WW, WH);
    c.fillStyle = 'rgba(255,255,255,0.045)';
    c.translate(WW / 2, WH / 2); c.rotate(-0.5);
    for (let x = -700; x < 700; x += 56) c.fillRect(x, -700, 28, 1400);
    c.restore();
  }
  function pathPoly(c, p) { c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); }
  function pathShape(c, s) { if (s.length === 3) { c.moveTo(s[0] + s[2], s[1]); c.arc(s[0], s[1], s[2], 0, Math.PI * 2); } else pathPoly(c, s); }
  let sandPat = null;
  function sandPattern(c) {
    if (sandPat) return sandPat;
    const pc = document.createElement('canvas'); pc.width = pc.height = 48;
    const x = pc.getContext('2d');
    x.fillStyle = '#d8bd85'; x.fillRect(0, 0, 48, 48);
    for (let i = 0; i < 90; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(120,90,40,.25)' : 'rgba(255,245,215,.35)'; x.fillRect(Math.random() * 48, Math.random() * 48, 1.2, 1.2); }
    sandPat = c.createPattern(pc, 'repeat');
    return sandPat;
  }
  function renderStatic() {
    const h = hole();
    if (!staticCv) staticCv = document.createElement('canvas');
    staticCv.width = cv.width; staticCv.height = cv.height;
    const c = staticCv.getContext('2d');
    sandPat = null;
    c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    // backdrop
    c.fillStyle = '#0d110e'; c.fillRect(0, 0, WW, WH);
    c.fillStyle = 'rgba(255,255,255,0.025)';
    for (let x = 10; x < WW; x += 20) for (let y = 10; y < WH; y += 20) c.fillRect(x, y, 1.2, 1.2);
    worldTf(c, h);
    // drop shadow of the course
    c.save(); c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 24 * scale * dpr; c.shadowOffsetY = 6 * scale * dpr;
    c.fillStyle = '#2b7a45'; c.beginPath(); h.outer.forEach(p => pathPoly(c, p)); c.fill(); c.restore();
    turf(c, cc => h.outer.forEach(p => pathPoly(cc, p)));
    // slopes
    for (const s of h.slopes) {
      c.save(); c.beginPath(); pathPoly(c, s.p); c.clip();
      const a = Math.atan2(s.f[1], s.f[0]), cx = s.p[0], cy = s.p[1];
      const g = c.createLinearGradient(cx, cy, cx + Math.cos(a) * 300, cy + Math.sin(a) * 300);
      g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.16)');
      c.fillStyle = g; c.fillRect(0, 0, WW, WH); c.restore();
      c.save(); c.setLineDash([6, 6]); c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.5; c.beginPath(); pathPoly(c, s.p); c.stroke(); c.restore();
    }
    for (const hl of h.hills) {
      const g = c.createRadialGradient(hl[0], hl[1], 0, hl[0], hl[1], hl[2]);
      if (hl[3] > 0) { g.addColorStop(0, 'rgba(255,255,230,0.22)'); g.addColorStop(0.6, 'rgba(255,255,230,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0.12)'); }
      else { g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(0.7, 'rgba(0,0,0,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
      c.fillStyle = g; c.beginPath(); c.arc(hl[0], hl[1], hl[2], 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 1; c.setLineDash([3, 5]);
      for (let k = 1; k <= 3; k++) { c.beginPath(); c.arc(hl[0], hl[1], hl[2] * k / 3.3, 0, Math.PI * 2); c.stroke(); }
      c.setLineDash([]);
    }
    // water
    if (h.water.length) {
      c.save();
      c.beginPath(); h.water.forEach(s => pathShape(c, s)); c.clip();
      const g = c.createLinearGradient(0, 0, 0, WH); g.addColorStop(0, '#2c78a8'); g.addColorStop(1, '#1d5a86');
      c.fillStyle = g; c.fillRect(0, 0, WW, WH);
      c.strokeStyle = 'rgba(200,235,255,0.18)'; c.lineWidth = 1.5;
      for (let y = 8; y < WH; y += 16) for (let x = ((y / 16) % 2) * 20; x < WW; x += 40) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 6, y - 4, x + 12, y); c.stroke(); }
      c.restore();
      c.save(); c.strokeStyle = 'rgba(160,215,245,0.5)'; c.lineWidth = 2; c.beginPath(); h.water.forEach(s => pathShape(c, s)); c.stroke(); c.restore();
      if (h.land.length) {
        turf(c, cc => h.land.forEach(s => pathShape(cc, s)));
        c.save(); c.strokeStyle = 'rgba(30,60,30,0.6)'; c.lineWidth = 2; c.beginPath(); h.land.forEach(s => pathShape(c, s)); c.stroke(); c.restore();
      }
    }
    // sand
    if (h.sand.length) {
      c.save(); c.fillStyle = sandPattern(c); c.beginPath(); h.sand.forEach(s => pathShape(c, s)); c.fill();
      c.strokeStyle = 'rgba(150,115,60,0.7)'; c.lineWidth = 2; c.stroke(); c.restore();
    }
    // inner shadow along walls
    c.save(); c.beginPath(); h.outer.forEach(p => pathPoly(c, p)); c.clip();
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 22; c.beginPath(); h.outer.forEach(p => pathPoly(c, p)); c.stroke();
    c.restore();
    // tee mat
    c.fillStyle = 'rgba(15,50,28,0.55)'; c.beginPath(); c.roundRect ? c.roundRect(h.tee[0] - 18, h.tee[1] - 18, 36, 36, 6) : c.rect(h.tee[0] - 18, h.tee[1] - 18, 36, 36); c.fill();
    c.fillStyle = '#f3ece5'; c.beginPath(); c.arc(h.tee[0] - 12, h.tee[1] - 12, 2.2, 0, 7); c.arc(h.tee[0] + 12, h.tee[1] + 12, 2.2, 0, 7); c.fill();
    // cup
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(h.cup[0], h.cup[1], CUP + 3, 0, Math.PI * 2); c.fill();
    const cg = c.createRadialGradient(h.cup[0] - 3, h.cup[1] - 3, 1, h.cup[0], h.cup[1], CUP);
    cg.addColorStop(0, '#000'); cg.addColorStop(1, '#1b221d');
    c.fillStyle = cg; c.beginPath(); c.arc(h.cup[0], h.cup[1], CUP, 0, Math.PI * 2); c.fill();
    // tunnels
    h.tunnels.forEach((tn, k) => {
      const g = c.createRadialGradient(tn.a[0], tn.a[1], 2, tn.a[0], tn.a[1], 17); g.addColorStop(0, '#000'); g.addColorStop(0.75, '#14100c'); g.addColorStop(1, '#ff8a3d');
      c.fillStyle = g; c.beginPath(); c.arc(tn.a[0], tn.a[1], 17, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#6fd3c7'; c.lineWidth = 3; c.beginPath(); c.arc(tn.b[0], tn.b[1], 15, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(111,211,199,0.18)'; c.fill();
      c.fillStyle = '#f3ece5'; c.font = '700 10px ' + fontOf('--mono'); c.textAlign = 'center'; c.textBaseline = 'middle';
      const lab = h.tunnels.length > 1 ? String.fromCharCode(65 + k) : '';
      if (lab) { c.fillText(lab, tn.a[0], tn.a[1] - 25); c.fillText(lab, tn.b[0], tn.b[1] - 24); }
    });
    // walls
    c.lineJoin = 'round'; c.lineCap = 'round';
    const wallPaths = cc => { h.outer.forEach(p => pathPoly(cc, p)); };
    c.strokeStyle = '#4a2c17'; c.lineWidth = WALL * 2 + 3; c.beginPath(); wallPaths(c); c.stroke();
    c.strokeStyle = '#a0612f'; c.lineWidth = WALL * 2 - 1; c.beginPath(); wallPaths(c); c.stroke();
    c.strokeStyle = 'rgba(255,200,140,0.35)'; c.lineWidth = 1.5; c.beginPath(); wallPaths(c); c.stroke();
    for (const p of (h.blocks || [])) {
      c.fillStyle = '#7d4a25'; c.strokeStyle = '#4a2c17'; c.lineWidth = WALL * 2 + 3; c.beginPath(); pathPoly(c, p); c.stroke(); c.fill();
      c.strokeStyle = '#a0612f'; c.lineWidth = WALL * 2 - 1; c.beginPath(); pathPoly(c, p); c.stroke();
      c.fillStyle = '#93582c'; c.beginPath(); pathPoly(c, p); c.fill();
      c.strokeStyle = 'rgba(255,200,140,0.3)'; c.lineWidth = 1.5; c.beginPath(); pathPoly(c, p); c.stroke();
    }
    for (const s of (h.rubber || [])) {
      c.strokeStyle = '#1f6f68'; c.lineWidth = WALL * 2 + 3; c.beginPath(); c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); c.stroke();
      c.strokeStyle = '#6fd3c7'; c.lineWidth = WALL * 2 - 2; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.5; c.stroke();
    }
    staticKey = G.list[G.hp] + ':' + cv.width;
  }
  function worldTf(c, h) { const v = h.view, k = scale * dpr * v.z; c.setTransform(k, 0, 0, k, -v.ox * k, -v.oy * k); }
  let fontCache = {};
  function fontOf(v) {
    if (fontCache[v]) return fontCache[v];
    const f = (root && getComputedStyle(root).getPropertyValue(v).trim()) || 'system-ui';
    fontCache[v] = f; return f;
  }
  function txt(s, x, y, size, color, weight, font, glow) {
    ctx.font = `${weight || 700} ${size}px ${fontOf(font || '--display')}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (glow) { ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 8; }
    ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.shadowBlur = 0;
  }
  function draw() {
    if (!ctx || !G) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (G.phase === 'setup' || !G.ball) {
      // attract screen: show a hole preview behind the setup box
      const keep = G.hp; G.hp = 0;
      if (staticKey !== G.list[0] + ':' + cv.width) renderStatic();
      G.hp = keep;
      ctx.drawImage(staticCv, 0, 0);
      return;
    }
    const h = hole();
    if (staticKey !== G.list[G.hp] + ':' + cv.width) renderStatic();
    ctx.drawImage(staticCv, 0, 0);
    worldTf(ctx, h);
    const T = G.t;
    // slope chevrons (animated)
    for (const s of h.slopes) {
      ctx.save(); ctx.beginPath(); pathPoly(ctx, s.p); ctx.clip();
      const a = Math.atan2(s.f[1], s.f[0]), mag = Math.hypot(s.f[0], s.f[1]);
      const xs = s.p.filter((v, i) => i % 2 === 0), ys = s.p.filter((v, i) => i % 2 === 1);
      const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ext = Math.hypot(x1 - x0, y1 - y0) / 2 + 40;
      ctx.translate(cx, cy); ctx.rotate(a);
      const off = (T * mag * 0.12) % 46;
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let x = -ext + off; x < ext; x += 46) for (let y = -ext; y < ext; y += 40) {
        ctx.beginPath(); ctx.moveTo(x - 7, y - 9); ctx.lineTo(x + 3, y); ctx.lineTo(x - 7, y + 9); ctx.stroke();
      }
      ctx.restore();
    }
    // bumpers
    h.bumpers.forEach((bp, i) => {
      const f = G.flash['b' + i] || 0, r = bp[2] * (1 + f * 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(bp[0] + 2, bp[1] + 4, r, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(bp[0] - r * 0.3, bp[1] - r * 0.3, 1, bp[0], bp[1], r);
      g.addColorStop(0, f > 0 ? '#fff6d0' : '#fff'); g.addColorStop(1, f > 0 ? '#ffc861' : '#d9cbb6');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bp[0], bp[1], r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = f > 0 ? '#ffc861' : '#ff8a3d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(bp[0], bp[1], r - 2, 0, Math.PI * 2); ctx.stroke();
      if (f > 0) { ctx.strokeStyle = `rgba(255,200,97,${f * 3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bp[0], bp[1], r + 8 * (1 - f * 4), 0, Math.PI * 2); ctx.stroke(); }
    });
    // gates
    for (const g of h.gates) {
      const o = gateOffset(g, T);
      ctx.save(); ctx.translate(o.ox, o.oy);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); pathPoly(ctx, g.p.map((v, i) => v + (i % 2 ? 4 : 2))); ctx.fill();
      ctx.fillStyle = '#c4743d'; ctx.strokeStyle = '#4a2c17'; ctx.lineWidth = 3; ctx.beginPath(); pathPoly(ctx, g.p); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,170,0.6)'; ctx.lineWidth = 2;
      const xs = g.p.filter((v, i) => i % 2 === 0), ys = g.p.filter((v, i) => i % 2 === 1);
      const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      for (let y = y0 + 12; y < y1 - 6; y += 14) { ctx.beginPath(); ctx.moveTo(x0 + 5, y); ctx.lineTo(x1 - 5, y + 6); ctx.stroke(); }
      ctx.restore();
    }
    // flag (lowered when the ball is close)
    const bd = Math.hypot(G.ball.x - h.cup[0], G.ball.y - h.cup[1]);
    if (bd > 60 || G.phase === 'aim') {
      const fx = h.cup[0], fy = h.cup[1];
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 22, fy + 8); ctx.stroke();
      ctx.strokeStyle = '#f3ece5'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 40); ctx.stroke();
      const wv = Math.sin(T * 5) * 2.5;
      ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(fx, fy - 40); ctx.quadraticCurveTo(fx + 12, fy - 36 + wv, fx + 24, fy - 34 + wv * 0.6); ctx.quadraticCurveTo(fx + 12, fy - 29 + wv, fx, fy - 26); ctx.fill();
      txt(String(G.hp + 1), fx + 10, fy - 33.5 + wv * 0.4, 7, '#1b0d03', 800, '--mono');
    }
    // ball trail
    if (G.trail.length > 1) {
      for (let i = 1; i < G.trail.length; i++) {
        const a = i / G.trail.length;
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.25})`; ctx.lineWidth = BR * 1.4 * a; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(G.trail[i - 1].x, G.trail[i - 1].y); ctx.lineTo(G.trail[i].x, G.trail[i].y); ctx.stroke();
      }
    }
    // ball
    const b = G.ball, z = b.z === undefined ? 1 : b.z;
    if (z > 0.01) {
      const r = BR * (0.55 + 0.45 * z);
      ctx.fillStyle = `rgba(0,0,0,${0.35 * z})`; ctx.beginPath(); ctx.ellipse(b.x + 2.5, b.y + 3, r, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, 0.5, b.x, b.y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#ece6de'); g.addColorStop(1, '#b8aea2');
      ctx.globalAlpha = Math.min(1, z * 1.5);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PCOL[G.pl]; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(b.x, b.y, r - 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // water rings
    if (G.phase === 'splash') {
      for (let k = 0; k < 3; k++) {
        const s = G.splash - k * 0.12; if (s <= 0) continue;
        ctx.strokeStyle = `rgba(220,245,255,${Math.max(0, 0.8 - s)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, 4 + s * 40, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // windmills (above the ball: blades sweep over it)
    for (const m of h.mills) {
      const bl = millBlades(m, T);
      for (const [cx, cy] of bl) {
        ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(Math.atan2(cy, cx));
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(m.hub - 2 + 3, -WALL - 1 + 5, m.len - m.hub + 4, WALL * 2 + 2);
        ctx.fillStyle = '#e9dcc6'; ctx.fillRect(m.hub - 2, -WALL - 1, m.len - m.hub + 4, WALL * 2 + 2);
        ctx.fillStyle = '#c4743d'; ctx.fillRect(m.hub - 2, -1.5, m.len - m.hub + 4, 3);
        ctx.strokeStyle = 'rgba(74,44,23,0.7)'; ctx.lineWidth = 1;
        for (let x = m.hub + 10; x < m.len; x += 12) { ctx.beginPath(); ctx.moveTo(x, -WALL - 1); ctx.lineTo(x, WALL + 1); ctx.stroke(); }
        ctx.restore();
      }
      const g = ctx.createRadialGradient(m.x - 4, m.y - 4, 1, m.x, m.y, m.hub);
      g.addColorStop(0, '#ffb27a'); g.addColorStop(1, '#a8501b');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, m.hub, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4a2c17'; ctx.lineWidth = 2; ctx.stroke();
      // tiny mule ears on the hub: the VanMule touch
      ctx.fillStyle = '#4a2c17';
      ctx.beginPath(); ctx.ellipse(m.x - 5, m.y - m.hub * 0.25, 2.2, 5, -0.3, 0, Math.PI * 2); ctx.ellipse(m.x + 5, m.y - m.hub * 0.25, 2.2, 5, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b0d03'; ctx.beginPath(); ctx.arc(m.x - 3.5, m.y + 3, 1.3, 0, 7); ctx.arc(m.x + 3.5, m.y + 3, 1.3, 0, 7); ctx.fill();
    }
    // particles
    for (const p of G.parts) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.c;
      if (p.kind === 'conf') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.sz / 2, -p.sz / 4, p.sz, p.sz / 2); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    // aiming
    if (G.phase === 'aim' && !G.paused) drawAim();
    // banner / overlays (screen space in world units)
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    if (G.banner && G.phase !== 'card' && G.phase !== 'over') {
      const bn = G.banner, a = bn.t < 50 ? Math.min(1, bn.t / 0.3, (1.8 - Math.min(1.8, bn.t)) / 0.2 + 0.0001) : 1;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = 'rgba(10,12,10,0.72)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(WW / 2 - 190, 18, 380, 70, 14) : ctx.rect(WW / 2 - 190, 18, 380, 70); ctx.fill();
      txt(bn.big, WW / 2, 44, 24, bn.col || '#f3ece5', 800);
      txt(bn.small, WW / 2, 72, 12.5, '#a3968a', 600, '--body');
      ctx.globalAlpha = 1;
    }
    if (G.paused) {
      ctx.fillStyle = 'rgba(8,10,8,0.6)'; ctx.fillRect(0, 0, WW, WH);
      txt('PAUSED', WW / 2, WH / 2 - 14, 34, '#ffc861', 800);
      txt(G.auto ? 'Press P, Space or click to resume' : 'Press P or Space to resume', WW / 2, WH / 2 + 24, 14, '#a3968a', 600, '--body');
    }
  }
  function drawAim() {
    const b = G.ball;
    let ang, pow, active;
    if (G.drag && G.drag.moved) { ang = G.drag.ang; pow = G.drag.pow; active = true; }
    else { ang = G.aimA; pow = G.aimP; active = G.kbd; }
    const pulse = 0.5 + 0.5 * Math.sin(G.time * 4);
    if (!active) {
      // idle hint ring
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + pulse * 0.25})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, BR + 6 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    const col = pow < 0.5 ? `rgb(${Math.round(80 + pow * 2 * 175)},222,128)` : `rgb(255,${Math.round(222 - (pow - 0.5) * 2 * 150)},${Math.round(128 - (pow - 0.5) * 2 * 60)})`;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    // pull-back band (mouse)
    if (G.drag && G.drag.moved) {
      const L = 16 + pow * 70;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - dx * L, b.y - dy * L); ctx.stroke(); ctx.setLineDash([]);
    }
    // direction dots
    const len = 30 + pow * 150;
    ctx.fillStyle = col;
    for (let d = BR + 8; d < len; d += 9) {
      const a = 1 - d / (len + 20);
      ctx.globalAlpha = 0.25 + a * 0.75; ctx.beginPath(); ctx.arc(b.x + dx * d, b.y + dy * d, 2.3 * a + 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // arrow head
    const hx = b.x + dx * len, hy = b.y + dy * len;
    ctx.beginPath(); ctx.moveTo(hx + dx * 8, hy + dy * 8); ctx.lineTo(hx - dy * 6, hy + dx * 6); ctx.lineTo(hx + dy * 6, hy - dx * 6); ctx.closePath(); ctx.fill();
    // power meter beside the ball
    const mx = b.x + (b.x > WW - 70 ? -34 : 22), my = b.y - 30, mh = 60;
    ctx.fillStyle = 'rgba(10,12,10,0.7)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(mx - 2, my - 2, 12, mh + 4, 4) : ctx.rect(mx - 2, my - 2, 12, mh + 4); ctx.fill();
    const g = ctx.createLinearGradient(0, my + mh, 0, my); g.addColorStop(0, '#50de80'); g.addColorStop(0.5, '#ffde80'); g.addColorStop(1, '#ff5a52');
    ctx.fillStyle = g; ctx.fillRect(mx, my + mh * (1 - pow), 8, mh * pow);
    txt(Math.round(pow * 100) + '%', mx + 4, my + mh + 12, 9, '#f3ece5', 700, '--mono', true);
  }

  /* ---------- DOM: setup, scorecard, HUD ---------- */
  function showOverlay(html) { hideOverlay(); ov = document.createElement('div'); ov.className = 'ov'; ov.innerHTML = '<div class="box">' + html + '</div>'; stage.appendChild(ov); return ov; }
  function hideOverlay() { if (ov) { ov.remove(); ov = null; } }
  function showSetup() {
    const parT = c => courseHoles(c).reduce((a, i) => a + HOLES[i].par, 0);
    const o = showOverlay(`<h3>Mini <span>Golf</span></h3><p>18 original holes. Fewest strokes wins; each hole is capped at ${MAX_STROKES}.</p>
      <div class="row"><span>Players</span><div class="seg" data-g="n">${[1, 2, 3, 4].map(n => `<button data-v="${n}">${n}</button>`).join('')}</div></div>
      <div class="names">${[0, 1, 2, 3].map(i => `<label data-i="${i}"><span class="dot" style="background:${PCOL[i]}"></span><input maxlength="12" value="${(opts.names[i] || PNAME[i]).replace(/"/g, '&quot;')}" aria-label="Name of player ${i + 1}"></label>`).join('')}</div>
      <div class="row"><span>Course</span><div class="seg" data-g="course">${['front', 'back', 'all'].map(c => `<button data-v="${c}">${COURSE_LABEL[c]} <small style="opacity:.6">(par ${parT(c)})</small></button>`).join('')}</div></div>
      <div class="row"><span>Best</span><span style="text-transform:none;letter-spacing:0;font-size:12.5px;color:var(--muted)">Front 9: <b style="color:var(--gold)">${best.front || '-'}</b> · Back 9: <b style="color:var(--gold)">${best.back || '-'}</b> · All 18: <b style="color:var(--gold)">${best.all || '-'}</b></span></div>
      <div class="go"><span class="note">Press <kbd>Enter</kbd> to tee off</span><button class="btn pri" data-a="start">Tee off ▸</button></div>`);
    const refresh = () => {
      o.querySelectorAll('[data-g="n"] button').forEach(b => b.classList.toggle('on', +b.dataset.v === opts.n));
      o.querySelectorAll('[data-g="course"] button').forEach(b => b.classList.toggle('on', b.dataset.v === opts.course));
      o.querySelectorAll('.names label').forEach(l => l.classList.toggle('off', +l.dataset.i >= opts.n));
    };
    refresh();
    o.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const g = b.parentNode.dataset.g;
      if (g === 'n') { opts.n = +b.dataset.v; save(); refresh(); sfx('tick'); }
      else if (g === 'course') { opts.course = b.dataset.v; save(); G.list = courseHoles(opts.course); G.scores = []; staticKey = ''; draw(); refresh(); sfx('tick'); syncUI(); }
      else if (b.dataset.a === 'start') { ensureAudio(); readNames(); startRound(); }
    });
    o.addEventListener('input', () => readNames());
  }
  function readNames() {
    if (!ov) return;
    ov.querySelectorAll('.names input').forEach((inp, i) => { opts.names[i] = inp.value.slice(0, 12); });
    save();
  }
  function save() { try { api.save('opts', opts); } catch (e) { /* ignore */ } }
  function cardHTML() {
    const L = G.list, parRow = L.map(i => HOLES[i].par), parT = parRow.reduce((a, b) => a + b, 0);
    let h = '<table><tr><th class="nm">Hole</th>' + L.map((_, k) => `<th>${k + 1}</th>`).join('') + '<th>Tot</th><th>±</th></tr>';
    h += '<tr><td class="nm" style="color:var(--dim)">Par</td>' + parRow.map(p => `<td>${p}</td>`).join('') + `<td class="tot">${parT}</td><td></td></tr>`;
    for (let p = 0; p < G.n; p++) {
      let tot = 0, pp = 0;
      h += `<tr><td class="nm" style="color:${PCOL[p]}">${esc(G.names[p])}</td>`;
      L.forEach((hi, k) => {
        const v = G.scores[p] ? G.scores[p][k] : null;
        if (v != null) { tot += v; pp += HOLES[hi].par; }
        const cls = v == null ? (k === G.hp && G.phase !== 'over' ? 'cur' : '') : v === 1 ? 'ace' : v < HOLES[hi].par ? 'u' : v > HOLES[hi].par ? 'o' : '';
        h += `<td class="${cls}">${v == null ? '' : v}</td>`;
      });
      const d = tot - pp;
      h += `<td class="tot">${tot || '-'}</td><td>${pp ? (d > 0 ? '+' + d : d === 0 ? 'E' : d) : ''}</td></tr>`;
    }
    return h + '</table>';
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function showCard(final) {
    let head;
    if (final) {
      const tots = G.scores.map(r => r.reduce((a, v) => a + (v || 0), 0)), low = Math.min.apply(null, tots);
      const winners = tots.map((t, i) => t === low ? i : -1).filter(i => i >= 0);
      const parT = G.list.reduce((a, i) => a + HOLES[i].par, 0), d = low - parT, rel = d > 0 ? '+' + d : d === 0 ? 'even par' : d;
      head = `<h3>Round <span>complete</span></h3><div class="win">${G.n === 1 ? `You shot ${low} (${rel})` : winners.length > 1 ? 'Tie: ' + winners.map(i => esc(G.names[i])).join(' & ') + ` with ${low}` : esc(G.names[winners[0]]) + ` wins with ${low} (${rel})`}${G.newRecord ? ' · New best!' : ''}</div>`;
    } else head = `<h3>Hole ${G.hp + 1} <span>done</span></h3><p>${esc(HOLES[G.list[G.hp]].name)} · Par ${HOLES[G.list[G.hp]].par}</p>`;
    const btn = final ? '<button class="btn sec" data-a="setup">Change players</button><button class="btn pri" data-a="again">Play again ▸</button>'
      : G.phase === 'card' ? `<button class="btn pri" data-a="next">${G.hp >= G.list.length - 1 ? 'Finish ▸' : 'Next hole ▸'}</button>` : '<button class="btn pri" data-a="close">Back to the game</button>';
    const o = showOverlay(head + cardHTML() + `<div class="go"><span class="note">${final ? '<kbd>Enter</kbd> play again' : '<kbd>Space</kbd> / <kbd>Enter</kbd> continue'}</span>${btn}</div>`);
    o.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'next') nextHole();
      else if (a === 'close') { G.showCard = false; hideOverlay(); }
      else if (a === 'again') { newGame(); startRound(); }
      else if (a === 'setup') newGame();
    });
  }
  function syncUI() {
    if (!ui.hole || !G) return;
    const playing = G.phase !== 'setup';
    const h = playing && G.phase !== 'over' ? hole() : null;
    ui.hole.textContent = h ? `${G.hp + 1}/${G.list.length}` : '-';
    ui.name.textContent = h ? h.name : COURSE_LABEL[opts.course];
    ui.par.textContent = h ? h.par : '-';
    ui.strokes.textContent = h ? G.strokes : '-';
    const p = G.pl;
    ui.player.innerHTML = playing && G.names[p] ? `<span class="dot" style="background:${PCOL[p]}"></span>${esc(G.names[p])}` : '-';
    let tot = 0, pp = 0;
    if (playing && G.scores[p]) G.scores[p].forEach((v, k) => { if (v != null) { tot += v; pp += HOLES[G.list[k]].par; } });
    const d = tot - pp;
    ui.total.textContent = playing && pp ? `${tot} (${d > 0 ? '+' + d : d === 0 ? 'E' : d})` : '-';
    ui.best.textContent = best[opts.course] || '-';
    ui.pause.textContent = G.paused ? 'Resume' : 'Pause';
    ui.pause.disabled = !(G.phase === 'aim' || G.phase === 'roll' || G.phase === 'holed' || G.phase === 'sink' || G.phase === 'splash');
    ui.card.disabled = !playing;
    ui.sound.textContent = soundOn ? '🔊' : '🔇';
  }

  /* ---------- input ---------- */
  function worldPt(e) {
    const r = cv.getBoundingClientRect(), v = G && G.list ? hole().view : { z: 1, ox: 0, oy: 0 };
    return { x: (e.clientX - r.left) / r.width * WW / v.z + v.ox, y: (e.clientY - r.top) / r.height * WH / v.z + v.oy };
  }
  function onDown(e) {
    ensureAudio();
    if (!G) return;
    if (G.paused) { setPaused(false); return; }
    if (G.phase === 'holed') { advance(); return; }
    if (G.phase !== 'aim' || e.button === 2) { if (G.drag) G.drag = null; return; }
    if (e.button !== 0) return;
    const p = worldPt(e);
    G.drag = { sx: p.x, sy: p.y, moved: false, ang: G.aimA, pow: 0 };
    G.kbd = false;
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    e.preventDefault(); kick();
  }
  function onMove(e) {
    if (!G || !G.drag) return;
    const p = worldPt(e), dx = G.drag.sx - p.x, dy = G.drag.sy - p.y, d = Math.hypot(dx, dy);
    if (!G.drag.moved && d < 4) return;
    G.drag.moved = true;
    G.drag.ang = Math.atan2(dy, dx); G.drag.pow = Math.min(1, d / 190);
    kick();
  }
  function onUp(e) {
    if (!G || !G.drag) return;
    const d = G.drag; G.drag = null;
    try { cv.releasePointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    if (d.moved && d.pow > 0.03 && G.phase === 'aim') shoot(d.ang, d.pow);
    else draw();
  }
  function onKey(e) {
    if (!el || el.offsetParent === null) return;
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (!G) return;
    if (k === 'Enter') {
      e.preventDefault(); ensureAudio();
      if (G.phase === 'setup') { readNames(); startRound(); }
      else if (G.phase === 'over') { newGame(); startRound(); }
      else if (G.phase === 'card') nextHole();
      else if (G.phase === 'holed') advance();
      else if (G.paused) setPaused(false);
      else if (ov && G.showCard) { G.showCard = false; hideOverlay(); }
      return;
    }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (k === 'Escape' && G.drag) { G.drag = null; draw(); e.preventDefault(); return; }
      if (k === 'Escape' && ov && G.showCard) { G.showCard = false; hideOverlay(); e.preventDefault(); return; }
      if (G.phase === 'setup' || G.phase === 'over' || G.phase === 'card') return;
      e.preventDefault(); setPaused(!G.paused); return;
    }
    if (k === ' ') {
      e.preventDefault(); ensureAudio();
      if (e.repeat) return;
      if (G.paused) { setPaused(false); return; }
      if (G.phase === 'card') { nextHole(); return; }
      if (G.phase === 'holed') { advance(); return; }
      if (G.phase === 'over') { newGame(); startRound(); return; }
      if (ov && G.showCard) { G.showCard = false; hideOverlay(); return; }
      if (G.phase === 'aim') { if (!G.kbd) { G.kbd = true; kick(); return; } shoot(G.aimA, G.aimP); }
      return;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      if (G.phase === 'setup' || G.phase === 'over' || G.phase === 'card') return;
      e.preventDefault();
      if (!keys.has(k)) held[k] = 0;
      keys.add(k);
      if (G.phase === 'aim') { G.kbd = true; G.drag = null; }
      kick(); return;
    }
    if (k === 'Shift') keys.add('Shift');
    if (k === 'Tab' && G.phase !== 'setup') {
      e.preventDefault();
      if (G.phase === 'card' || G.phase === 'over') return;
      if (ov) { G.showCard = false; hideOverlay(); } else { G.showCard = true; showCard(false); }
    }
  }
  function onKeyUp(e) { keys.delete(e.key); if (e.key === 'Shift') keys.delete('Shift'); }

  /* ---------- layout ---------- */
  function fit() {
    if (!el || !cv || el.offsetParent === null) return;
    const top = stage.getBoundingClientRect().top;
    const availH = Math.max(240, window.innerHeight - Math.max(0, top) - 40);
    const availW = Math.max(300, root.clientWidth || el.clientWidth);
    let w = Math.min(availW, availH * WW / WH, 1100);
    w = Math.max(300, Math.floor(w));
    const nd = window.devicePixelRatio || 1;
    if (w === cssW && nd === dpr && cv.width) return;
    cssW = w; dpr = nd; scale = w / WW;
    cv.style.width = w + 'px'; cv.style.height = Math.round(w * WH / WW) + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(w * WH / WW * dpr);
    staticKey = ''; fontCache = {};
    draw();
  }

  function mount(container, theApi) {
    if (el) unmount();
    el = container; api = theApi || { load: () => null, save() {}, sound: false, toast() {} };
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    let o = null, bs = null, sv = null;
    try { o = api.load('opts'); bs = api.load('bests'); sv = api.load('sound'); } catch (e) { /* ignore */ }
    opts = { n: 1, names: PNAME.slice(), course: 'all' };
    if (o && typeof o === 'object') {
      opts.n = [1, 2, 3, 4].indexOf(o.n) >= 0 ? o.n : 1;
      opts.course = COURSE_LABEL[o.course] ? o.course : 'all';
      if (Array.isArray(o.names)) for (let i = 0; i < 4; i++) if (typeof o.names[i] === 'string') opts.names[i] = o.names[i].slice(0, 12);
    }
    best = Object.assign({ all: 0, front: 0, back: 0 }, bs && typeof bs === 'object' ? bs : {});
    soundOn = sv === null || sv === undefined ? !!api.sound : !!sv;
    root = document.createElement('div'); root.className = 'ag-' + ID;
    root.innerHTML = `
      <div class="hd"><div class="ttl"><h2>Mini <span>Golf</span></h2><div class="how">Drag back from anywhere on the course and release to putt (further = harder), or aim with <kbd>←</kbd><kbd>→</kbd>, set power with <kbd>↑</kbd><kbd>↓</kbd> and press <kbd>Space</kbd>. Sand slows you, water costs a stroke, slopes push the ball.</div></div>
        <div class="btns"><button class="btn pri small" data-a="new">New game</button><button class="btn sec small" data-a="card">Scorecard</button><button class="btn sec small" data-a="pause">Pause</button><button class="btn sec small" data-a="sound" title="Sound"></button></div></div>
      <div class="hud">
        <div class="hb"><b>Hole</b><i data-k="hole">-</i></div>
        <div class="hb grow"><b>Course</b><i data-k="name" style="font-family:var(--body)">-</i></div>
        <div class="hb"><b>Par</b><i data-k="par">-</i></div>
        <div class="hb pl"><b>Player</b><i data-k="player">-</i></div>
        <div class="hb"><b>Strokes</b><i data-k="strokes">-</i></div>
        <div class="hb"><b>Total</b><i data-k="total">-</i></div>
        <div class="hb best"><b>Best</b><i data-k="best">-</i></div>
      </div>
      <div class="stage"><canvas aria-label="Mini golf course"></canvas></div>
      <div class="keys"><kbd>Shift</kbd> + arrows for fine aim · <kbd>Tab</kbd> scorecard · <kbd>P</kbd> pause · <kbd>Esc</kbd> cancel a drag · <kbd>Enter</kbd> start / continue</div>
      <details><summary>Tips</summary><ul>
        <li><b>Walls bounce true:</b> the angle in equals the angle out, so bank shots are reliable. Teal rubber rails are extra bouncy.</li>
        <li><b>Slopes</b> (moving chevrons) push the ball the way the arrows point; <b>hills</b> push it away from the bright centre and <b>bowls</b> pull it in.</li>
        <li>The ball only drops if it is rolling gently enough; a screaming putt will lip out.</li>
        <li><b>Tunnels:</b> roll into a dark hole and pop out of the teal ring with the same direction and most of your speed.</li>
        <li>Time the <b>windmill</b> and the <b>sliding gate</b>: watch a full cycle before you putt.</li>
        <li>Water: one penalty stroke and the ball goes back to where you hit it from.</li>
      </ul></details>`;
    el.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d'); stage = root.querySelector('.stage');
    ui = {}; root.querySelectorAll('[data-k]').forEach(n => { ui[n.dataset.k] = n; });
    ui.pause = root.querySelector('[data-a=pause]'); ui.sound = root.querySelector('[data-a=sound]'); ui.card = root.querySelector('[data-a=card]');
    on(root.querySelector('[data-a=new]'), 'click', ev => { ev.currentTarget.blur(); ensureAudio(); if (raf) { cancelAnimationFrame(raf); raf = 0; } newGame(); });
    on(ui.pause, 'click', ev => { ev.currentTarget.blur(); setPaused(!G.paused); });
    on(ui.card, 'click', ev => { ev.currentTarget.blur(); if (!G || G.phase === 'setup' || G.phase === 'card' || G.phase === 'over') return; if (ov) { G.showCard = false; hideOverlay(); } else { G.showCard = true; showCard(false); } });
    on(ui.sound, 'click', ev => { ev.currentTarget.blur(); soundOn = !soundOn; try { api.save('sound', soundOn); } catch (er) { /* ignore */ } if (soundOn) ensureAudio(); syncUI(); });
    on(cv, 'pointerdown', onDown);
    on(cv, 'pointermove', onMove);
    on(cv, 'pointerup', onUp);
    on(cv, 'pointercancel', () => { if (G) G.drag = null; });
    on(cv, 'contextmenu', ev => ev.preventDefault());
    on(window, 'keydown', onKey);
    on(window, 'keyup', onKeyUp);
    on(window, 'resize', fit);
    on(window, 'blur', () => { keys.clear(); if (G && G.drag) G.drag = null; if (G && !G.paused && (G.phase === 'roll' || G.phase === 'aim')) { G.paused = true; G.auto = true; syncUI(); if (visible()) draw(); } });
    on(document, 'visibilitychange', () => { if (document.hidden) autoPause(); });
    if (window.ResizeObserver) { ro = new ResizeObserver(() => fit()); ro.observe(el); }
    newGame(); fit(); draw(); syncUI();
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
    listeners.length = 0; keys.clear();
    if (ro) { ro.disconnect(); ro = null; }
    if (AC) { try { AC.close(); } catch (e) { /* ignore */ } AC = null; noiseBuf = null; }
    if (el) el.innerHTML = '';
    el = null; root = null; cv = null; ctx = null; ui = {}; G = null; ov = null; stage = null; staticCv = null; staticKey = ''; cssW = 0;
  }

  window.VanArcade = window.VanArcade || {};
  window.VanArcade[ID] = {
    mount, unmount,
    _debug: {
      HOLES, simulate, MAXV,
      get G() { return G; }, get raf() { return raf; },
      start(n, course) { opts.n = n || 1; opts.course = course || 'all'; newGame(); startRound(); },
      shoot, goHole(k) { G.hp = k; G.pl = 0; hideOverlay(); startTurn(true); },
    },
  };
})();
