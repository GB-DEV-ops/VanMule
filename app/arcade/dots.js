/* VanMule Arcade: Dots & Boxes - 3x3 to 7x7 boxes, vs computer (easy / medium / hard with
   chain & double-cross endgame play) or two players. SVG board, no loops (turn-based). */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'dots';
  const SZ = 100, MG = 34;           // svg units: box size, margin
  const COL = ['#ff8a3d', '#6fd3c7'];
  const LV = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const LV_KEYS = ['easy', 'medium', 'hard'];

  /* ---------------- engine ----------------
     Lines: horizontal h(r,c) r=0..N, c=0..N-1 -> index r*N+c ; vertical v(r,c) r=0..N-1, c=0..N -> HN + r*(N+1)+c.
     lines[i]: 0 undrawn, 1 drawn by player 0, 2 drawn by player 1. owner[b]: -1 free, 0/1. */
  function makeGeo(N) {
    const HN = (N + 1) * N, L = HN + N * (N + 1), B = N * N;
    const hIdx = (r, c) => r * N + c, vIdx = (r, c) => HN + r * (N + 1) + c;
    const boxLines = [], lineBoxes = [];
    for (let i = 0; i < L; i++) lineBoxes.push([]);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const b = r * N + c, ls = [hIdx(r, c), hIdx(r + 1, c), vIdx(r, c), vIdx(r, c + 1)];
      boxLines.push(ls); for (const l of ls) lineBoxes[l].push(b);
    }
    const lineInfo = [];
    for (let i = 0; i < L; i++) {
      if (i < HN) { const r = (i / N) | 0, c = i % N; lineInfo.push({ h: true, r, c, x1: c, y1: r, x2: c + 1, y2: r }); }
      else { const k = i - HN, r = (k / (N + 1)) | 0, c = k % (N + 1); lineInfo.push({ h: false, r, c, x1: c, y1: r, x2: c, y2: r + 1 }); }
    }
    return { N, HN, L, B, boxLines, lineBoxes, lineInfo, hIdx, vIdx };
  }
  function boxCount(g, lines, b) { const ls = g.boxLines[b]; return (lines[ls[0]] ? 1 : 0) + (lines[ls[1]] ? 1 : 0) + (lines[ls[2]] ? 1 : 0) + (lines[ls[3]] ? 1 : 0); }
  // draws line l for player p; returns number of boxes completed
  function apply(g, lines, owner, l, p) {
    lines[l] = p + 1; let n = 0;
    for (const b of g.lineBoxes[l]) if (owner[b] < 0 && boxCount(g, lines, b) === 4) { owner[b] = p; n++; }
    return n;
  }
  function safeMoves(g, lines) {
    const out = [];
    for (let l = 0; l < g.L; l++) {
      if (lines[l]) continue;
      let ok = true;
      for (const b of g.lineBoxes[l]) if (boxCount(g, lines, b) >= 2) { ok = false; break; }
      if (ok) out.push(l);
    }
    return out;
  }
  function capturable(g, lines, owner) { const out = []; for (let b = 0; b < g.B; b++) if (owner[b] < 0 && boxCount(g, lines, b) === 3) out.push(b); return out; }
  const undrawnOf = (g, lines, b) => g.boxLines[b].filter(l => !lines[l]);
  const across = (g, l, b) => { const bs = g.lineBoxes[l]; return bs.length === 2 ? (bs[0] === b ? bs[1] : bs[0]) : -1; }; // -1 = ground

  // components of the free region (chains / loops); boxes with fewer than 2 sides make a "junction" (treated as a chain)
  function components(g, lines, owner) {
    const seen = new Uint8Array(g.B), out = [];
    for (let s = 0; s < g.B; s++) {
      if (owner[s] >= 0 || seen[s]) continue;
      const q = [s], boxes = []; seen[s] = 1; let ground = 0, odd = false;
      while (q.length) {
        const b = q.pop(); boxes.push(b);
        const u = undrawnOf(g, lines, b); if (u.length !== 2) odd = true;
        for (const l of u) { const nb = across(g, l, b); if (nb < 0) ground++; else if (!seen[nb] && owner[nb] < 0) { seen[nb] = 1; q.push(nb); } }
      }
      out.push({ loop: !ground && !odd && boxes.length >= 4, n: boxes.length, boxes });
    }
    return out;
  }
  /* Endgame model (strings & coins): junction boxes (3-4 open sides) joined by "arms" (runs of
     2-sided boxes) that end at the ground or at a junction, plus pure loops. fS() = net score for the
     player who must open something, assuming best play with all-or-double-deal captures. */
  function structure(g, lines, owner) {
    const deg = new Int8Array(g.B);
    for (let b = 0; b < g.B; b++) deg[b] = owner[b] < 0 ? 4 - boxCount(g, lines, b) : 0;
    const isJ = b => deg[b] >= 3;
    const used = new Uint8Array(g.B), usedE = new Set(), arms = [], loops = [];
    // walk from `from` (box id, or -1 = ground) along undrawn edge e through 2-sided boxes
    function walk(from, e) {
      const boxes = []; let cur = from, edge = e;
      for (let k = 0; k <= g.B; k++) {
        const nb = cur < 0 ? g.lineBoxes[edge][0] : across(g, edge, cur);
        if (nb < 0) return { end: -1, boxes, last: edge };
        if (isJ(nb) || deg[nb] < 2) return { end: nb, boxes, last: edge };
        if (used[nb]) return { end: nb, boxes, last: edge, loop: true };
        boxes.push(nb); used[nb] = 1;
        const u = undrawnOf(g, lines, nb); edge = u[0] === edge ? u[1] : u[0]; cur = nb;
      }
      return { end: -1, boxes, last: edge };
    }
    for (let j = 0; j < g.B; j++) {
      if (!isJ(j)) continue;
      for (const e of undrawnOf(g, lines, j)) {
        if (usedE.has(e)) continue;
        usedE.add(e);
        const w = walk(j, e); usedE.add(w.last);
        arms.push({ a: j, b: w.end, n: w.boxes.length, boxes: w.boxes, e1: e, e2: w.last });
      }
    }
    for (let b = 0; b < g.B; b++) {
      if (used[b] || deg[b] !== 2) continue;
      // find a ground edge to start from; none -> loop
      let ge = -1;
      const q = [b], comp = [b], seen = new Set([b]);
      while (q.length) { const x = q.pop(); for (const l of undrawnOf(g, lines, x)) { const nb = across(g, l, x); if (nb < 0) { if (ge < 0) ge = l; } else if (!seen.has(nb) && deg[nb] === 2) { seen.add(nb); q.push(nb); comp.push(nb); } } }
      if (ge >= 0) { const w = walk(-1, ge); arms.push({ a: -1, b: w.end, n: w.boxes.length, boxes: w.boxes, e1: ge, e2: w.last }); }
      else { comp.forEach(x => { used[x] = 1; }); loops.push({ n: comp.length, boxes: comp }); }
    }
    return { arms, loops };
  }
  const fMemo = new Map();
  let fBudget = 0;
  const OVER = { over: 1 };
  function fKey(A, L) {
    const S = A.slice().sort((p, q) => p[2] - q[2] || ((p[0] < 0) + (p[1] < 0)) - ((q[0] < 0) + (q[1] < 0)));
    const map = new Map(); let k = 0;
    const lab = j => { if (j < 0) return 'G'; if (!map.has(j)) map.set(j, 'j' + (k++)); return map.get(j); };
    return L.slice().sort((a, b) => a - b).join('.') + '|' + S.map(x => { const a = lab(x[0]), b = lab(x[1]); return (a < b ? a + b : b + a) + x[2]; }).join(',');
  }
  // remove arm i; merge junctions that drop to 2 open sides; returns [arms, loops, extra boxes captured]
  function removeArm(A, L, i) {
    const arm = A[i]; let R = A.filter((_, k) => k !== i); const L2 = L.slice(); let extra = 0;
    const pend = [...new Set([arm[0], arm[1]].filter(j => j >= 0))];
    while (pend.length) {
      const j = pend.pop();
      const inc = []; let d = 0;
      R.forEach((x, k) => { const c = (x[0] === j) + (x[1] === j); if (c) { inc.push(k); d += c; } });
      if (d >= 3) continue;
      if (d === 2) {
        if (inc.length === 1) { const x = R[inc[0]]; R.splice(inc[0], 1); L2.push(x[2] + 1); }
        else {
          const x1 = R[inc[0]], x2 = R[inc[1]];
          const o1 = x1[0] === j ? x1[1] : x1[0], o2 = x2[0] === j ? x2[1] : x2[0];
          R = R.filter((_, k) => k !== inc[0] && k !== inc[1]); R.push([o1, o2, x1[2] + x2[2] + 1]);
        }
      } else if (d === 1) {
        const x = R[inc[0]], o = x[0] === j ? x[1] : x[0];
        R.splice(inc[0], 1); extra += x[2] + 1; if (o >= 0) pend.push(o);
      } else extra += 1;
    }
    return [R, L2, extra];
  }
  function fS(A, L) {
    if (!A.length && !L.length) return 0;
    const key = fKey(A, L);
    const m = fMemo.get(key); if (m !== undefined) return m;
    if (--fBudget < 0) throw OVER;
    let best = -Infinity;
    const seenL = new Set();
    for (let i = 0; i < L.length; i++) {
      if (seenL.has(L[i])) continue; seenL.add(L[i]);
      const rest = L.slice(0, i).concat(L.slice(i + 1)), fr = fS(A, rest), n = L[i];
      best = Math.max(best, -Math.max(n + fr, n - 8 - fr));
    }
    for (let i = 0; i < A.length; i++) best = Math.max(best, -armG(A, L, i));
    if (fMemo.size > 300000) fMemo.clear();
    fMemo.set(key, best); return best;
  }
  // net for the controller when arm i is opened
  function armG(A, L, i) {
    const [R, L2, extra] = removeArm(A, L, i);
    const fr = fS(R, L2), n = A[i][2] + extra;
    if (A[i][2] <= 2 && !extra) return n + fr;
    return Math.max(n + fr, n - 4 - fr);
  }
  const absOf = st => [st.arms.map(a => [a.a, a.b, a.n]), st.loops.map(l => l.n)];
  // safe wrapper: value of a board where the player to move must open something; null if too big
  function endValue(g, lines, owner, budget) {
    fBudget = budget || 60000;
    try { const [A, L] = absOf(structure(g, lines, owner)); return fS(A, L); } catch (e) { if (e === OVER) return null; throw e; }
  }

  // path of capturable boxes starting at a 3-sided box
  function capPath(g, lines, owner, b) {
    const path = [b]; let cur = b, via = undrawnOf(g, lines, b)[0], type = 'ground', endBox = -1;
    const guard = g.B + 2;
    for (let i = 0; i < guard; i++) {
      const nb = across(g, via, cur);
      if (nb < 0) { type = 'ground'; break; }
      const u = undrawnOf(g, lines, nb);
      if (u.length === 1) { path.push(nb); type = 'both'; break; }
      if (u.length !== 2) { type = 'junction'; endBox = nb; break; }
      path.push(nb); via = u[0] === via ? u[1] : u[0]; cur = nb;
    }
    return { path, type, first: undrawnOf(g, lines, b)[0], last: via, endBox };
  }

  function rnd(a) { return a[(Math.random() * a.length) | 0]; }
  function cloneArr(a) { return a.slice(); }

  // ---------- computer move ----------
  function aiPick(g, lines, owner, level) {
    const caps = capturable(g, lines, owner);
    const und = []; for (let l = 0; l < g.L; l++) if (!lines[l]) und.push(l);
    if (level === 'easy') {
      if (caps.length && Math.random() < 0.8) return undrawnOf(g, lines, rnd(caps))[0];
      const sm = safeMoves(g, lines);
      if (sm.length && Math.random() < 0.7) return rnd(sm);
      return rnd(und);
    }
    if (caps.length) {
      if (level === 'hard') { const d = hardCapture(g, lines, owner, caps); if (d !== null) return d; }
      return undrawnOf(g, lines, caps[0])[0];
    }
    const sm = safeMoves(g, lines);
    if (sm.length) {
      if (level === 'hard' && sm.length <= 16) { const m = searchSafe(g, lines, owner, sm); if (m !== null) return m; }
      return rnd(sm);
    }
    if (level === 'hard') { const m = hardOpen(g, lines, owner); if (m !== null) return m; }
    // medium (or fallback): open the smallest region
    const cs = components(g, lines, owner);
    cs.sort((a, b) => a.n - b.n);
    return openComp(g, lines, cs[0]);
  }
  function openComp(g, lines, comp) {
    const bs = comp.boxes;
    if (!comp.loop && comp.n === 2) { const [a, b] = bs; for (const l of undrawnOf(g, lines, a)) if (across(g, l, a) === b) return l; }
    for (const b of bs) for (const l of undrawnOf(g, lines, b)) if (across(g, l, b) < 0) return l;
    return undrawnOf(g, lines, bs[0])[0];
  }
  function hardOpen(g, lines, owner) {
    const st = structure(g, lines, owner), [A, L] = absOf(st);
    fBudget = 120000;
    let best = -Infinity, pick = null;
    try {
      st.loops.forEach((lp, i) => {
        const rest = L.slice(0, i).concat(L.slice(i + 1)), fr = fS(A, rest), n = lp.n;
        const v = -Math.max(n + fr, n - 8 - fr) + Math.random() * 0.01;
        if (v > best) { best = v; pick = undrawnOf(g, lines, lp.boxes[0])[0]; }
      });
      st.arms.forEach((arm, i) => {
        const v = -armG(A, L, i) + Math.random() * 0.01;
        if (v > best) {
          best = v;
          if (arm.n === 2) { const [a, b] = arm.boxes; pick = undrawnOf(g, lines, a).find(l => across(g, l, a) === b); }
          else pick = arm.b < 0 ? arm.e2 : arm.e1;
          if (pick === undefined || lines[pick]) pick = undrawnOf(g, lines, arm.boxes[0])[0];
        }
      });
    } catch (e) { if (e === OVER) return null; throw e; }
    return pick;
  }
  // hard: decide whether to keep control with a double-dealing move
  function hardCapture(g, lines, owner, caps) {
    const paths = []; const used = new Set();
    for (const b of caps) { if (used.has(b)) continue; const p = capPath(g, lines, owner, b); p.path.forEach(x => used.add(x)); paths.push(p); }
    const decisive = p => ((p.type === 'ground' || p.type === 'junction') && p.path.length === 2) || (p.type === 'both' && p.path.length === 4);
    // cash everything that is not a decision point first; keep one decision for last
    const others = paths.filter(p => !decisive(p));
    if (others.length) return others[0].first;
    if (paths.length > 1) return paths[0].first;
    const p = paths[0];
    // board after taking every box in this path
    const L2 = cloneArr(lines), O2 = cloneArr(owner);
    for (const b of p.path) for (const l of g.boxLines[b]) if (!L2[l]) apply(g, L2, O2, l, 0);
    if (O2.every(o => o >= 0)) return null;
    if (safeMoves(g, L2).length) return null;
    if (capturable(g, L2, O2).length) return null;
    const fr = endValue(g, L2, O2);
    if (fr === null) return null;
    const n = p.path.length, give = p.type === 'both' ? 4 : 2;
    const take = n + fr, dd = (n - give) - give - fr;
    if (dd <= take) return null;
    if (p.type === 'ground' || p.type === 'junction') return p.last; // far edge of the 2nd box
    const b2 = p.path[1], b3 = p.path[2];
    for (const l of undrawnOf(g, lines, b2)) if (across(g, l, b2) === b3) return l;
    return null;
  }
  // hard: exact search over the remaining safe moves, scoring each resulting endgame
  function searchSafe(g, lines, owner, sm) {
    const memo = new Map(), t0 = performance.now(); let abort = false, nodes = 0;
    const L = cloneArr(lines);
    function val() {
      if (abort) return 0;
      if ((++nodes & 63) === 0 && performance.now() - t0 > 500) { abort = true; return 0; }
      const key = L.join('');
      const m = memo.get(key); if (m !== undefined) return m;
      const s = safeMoves(g, L);
      let v;
      if (!s.length) { v = endValue(g, L, owner, 20000); if (v === null) { abort = true; return 0; } }
      else { v = -Infinity; for (const l of s) { L[l] = 1; const x = -val(); L[l] = 0; if (abort) return 0; if (x > v) v = x; } }
      memo.set(key, v); return v;
    }
    let best = -Infinity, bestL = [];
    for (const l of sm) {
      L[l] = 1; const x = -val(); L[l] = 0;
      if (abort) return null;
      if (x > best) { best = x; bestL = [l]; } else if (x === best) bestL.push(l);
    }
    return bestL.length ? rnd(bestL) : null;
  }

  /* ---------------- UI ---------------- */
  const CSS = `
.ag-dots{font-family:var(--body);color:var(--fg);max-width:1060px;margin:0 auto;user-select:none;-webkit-user-select:none}
.ag-dots .main{display:flex;gap:20px;align-items:flex-start;justify-content:center}
.ag-dots.narrow .main{flex-direction:column;align-items:center}
.ag-dots .stage{position:relative;flex:none;line-height:0}
.ag-dots svg{display:block;border-radius:16px;background:radial-gradient(ellipse at 50% 40%,#211a16 0%,#161210 75%);box-shadow:0 0 0 1px var(--line),0 18px 40px rgba(0,0,0,.45);touch-action:manipulation}
.ag-dots .side{flex:1 1 270px;min-width:250px;max-width:330px;display:flex;flex-direction:column;gap:10px}
.ag-dots.narrow .side{max-width:none;width:100%}
.ag-dots h2{font-family:var(--display);font-size:26px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-dots h2 span{color:var(--ember)}
.ag-dots .how{color:var(--muted);font-size:13px;margin:3px 0 0}
.ag-dots .sc{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ag-dots .pl{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:7px 12px;position:relative;transition:box-shadow .25s,border-color .25s}
.ag-dots .pl b{display:block;font-size:10.5px;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase}
.ag-dots .pl i{font-style:normal;font-family:var(--display);font-weight:800;font-size:28px;line-height:1.15;color:var(--c)}
.ag-dots .pl.turn{border-color:var(--c);box-shadow:0 0 0 1px var(--c),0 0 18px color-mix(in srgb,var(--c) 35%,transparent)}
.ag-dots .pl .dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--c);margin-right:6px;vertical-align:0}
.ag-dots .status{font-weight:700;font-size:15px;min-height:22px}
.ag-dots .status.p0{color:#ff8a3d}.ag-dots .status.p1{color:#6fd3c7}.ag-dots .status.w{color:var(--gold)}
.ag-dots .sub{font-size:12.5px;color:var(--muted);min-height:18px;margin-top:2px}
.ag-dots .btns{display:flex;gap:8px;flex-wrap:wrap}
.ag-dots .opt{display:flex;flex-direction:column;gap:4px}
.ag-dots .opt>span{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em}
.ag-dots .seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px;align-self:flex-start}
.ag-dots .seg button{height:28px;padding:0 10px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-dots .seg button:hover{color:var(--fg)}
.ag-dots .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-dots .seg.dis{opacity:.35;pointer-events:none}
.ag-dots .rec{font-size:12px;color:var(--dim);font-family:var(--mono)}
.ag-dots .keys{font-size:12px;color:var(--dim);line-height:1.8}
.ag-dots kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-dots details{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--muted)}
.ag-dots summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-dots details ul{margin:6px 0 2px;padding-left:18px}
.ag-dots details li{margin:3px 0}
.ag-dots details b{color:var(--fg)}
.ag-dots .guide{stroke:rgba(255,255,255,.07);stroke-width:3;stroke-linecap:round;stroke-dasharray:2 10}
.ag-dots .dr{stroke-width:9;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;animation:agdtdraw .22s ease-out forwards}
.ag-dots .dr.nt{animation:none;stroke-dashoffset:0}
.ag-dots .dr.last{filter:drop-shadow(0 0 6px currentColor)}
.ag-dots .dr.last.p0{stroke:#ffb27a}.ag-dots .dr.last.p1{stroke:#a5efe6}
@keyframes agdtdraw{to{stroke-dashoffset:0}}
.ag-dots .pv{stroke-width:9;stroke-linecap:round;opacity:0;transition:opacity .12s;pointer-events:none}
.ag-dots .pv.on{opacity:.42}
.ag-dots .pv.kb{opacity:.6;stroke-dasharray:12 9}
.ag-dots .pv.bad{stroke:#ff5a52!important}
.ag-dots .hit{fill:transparent;cursor:pointer}
.ag-dots svg.wait .hit{cursor:default}
.ag-dots .dt{fill:#f3ece5;filter:drop-shadow(0 0 3px rgba(255,255,255,.35))}
.ag-dots .bx{transform-box:fill-box;transform-origin:center;animation:agdtpop .38s cubic-bezier(.2,1.6,.4,1) both}
.ag-dots .bx.nt{animation:none}
.ag-dots .bx text{font-family:var(--display);font-weight:800;text-anchor:middle;dominant-baseline:central}
@keyframes agdtpop{0%{transform:scale(.2);opacity:0}100%{transform:scale(1);opacity:1}}
.ag-dots .threat{fill:rgba(255,200,97,.1);stroke:rgba(255,200,97,.35);stroke-width:2;stroke-dasharray:6 6;pointer-events:none}
.ag-dots .ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;line-height:1.4}
.ag-dots .ov .box{pointer-events:auto;background:rgba(22,18,16,.94);border:1px solid var(--line);border-radius:16px;padding:16px 26px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.6);animation:agdtin .35s ease-out}
.ag-dots .ov h3{font-family:var(--display);font-size:24px;margin:0 0 4px}
.ag-dots .ov p{margin:0 0 12px;color:var(--muted);font-size:13.5px}
@keyframes agdtin{from{opacity:0;transform:translateY(10px)}}
`;

  let inst = null;
  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const opts = Object.assign({ mode: 'cpu', level: 'medium', size: 4 }, api.load('opts') || {});
    if (!LV[opts.level]) opts.level = 'medium';
    if (!(opts.size >= 3 && opts.size <= 7)) opts.size = 4;
    if (opts.mode !== '2p') opts.mode = 'cpu';
    const stats = Object.assign({ played: 0 }, api.load('stats') || {});
    for (const k of LV_KEYS) stats[k] = Object.assign({ w: 0, l: 0, d: 0 }, stats[k] || {});
    let bestRank = +(api.load('bestRank') || 0);
    let soundOn = api.load('sound'); if (soundOn === null) soundOn = !!api.sound;
    let actx = null;
    function tone(f, d, type, vol, f2, at) {
      if (!soundOn) return;
      try {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        const t = actx.currentTime + (at || 0), o = actx.createOscillator(), gn = actx.createGain();
        o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        gn.gain.setValueAtTime(vol || 0.04, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(gn); gn.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
      } catch (e) { /* ignore */ }
    }
    const sfx = {
      line: p => tone(p ? 520 : 440, 0.06, 'triangle', 0.04, p ? 640 : 560),
      box: k => tone(660 + k * 90, 0.12, 'square', 0.03, 990 + k * 90),
      bad: () => tone(170, 0.08, 'square', 0.02),
      undo: () => tone(330, 0.06, 'sine', 0.03, 260),
      win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.15, 'triangle', 0.05, 0, i * 0.1)); },
      lose: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.18, 'triangle', 0.045, 0, i * 0.13)); },
      click: () => tone(700, 0.03, 'sine', 0.025),
    };
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const visible = () => !document.hidden && el.offsetParent !== null;
    function step(fn, ms) { later(function run() { if (!visible()) { later(run, 600); return; } fn(); }, ms); }

    const root = document.createElement('div'); root.className = 'ag-dots';
    root.innerHTML = `
<div class="main">
  <div class="stage" data-r="stage"></div>
  <div class="side">
    <div><h2>Dots <span>&amp;</span> Boxes</h2><p class="how">Take turns drawing a line between two dots. Close the fourth side of a box to claim it and move again. Most boxes wins.</p></div>
    <div class="sc"><div class="pl" data-r="pl0" style="--c:${COL[0]}"><b><span class="dot"></span><span data-r="n0">You</span></b><i data-r="s0">0</i></div>
      <div class="pl" data-r="pl1" style="--c:${COL[1]}"><b><span class="dot"></span><span data-r="n1">Computer</span></b><i data-r="s1">0</i></div></div>
    <div><div class="status" data-r="status"></div><div class="sub" data-r="sub"></div></div>
    <div class="btns"><button class="btn pri small" data-r="new">New game</button><button class="btn sec small" data-r="undo">↶ Undo</button><button class="btn sec small" data-r="snd" title="Toggle sound"></button></div>
    <div class="opt"><span>Opponent</span><div class="seg" data-r="mode"><button data-v="cpu">Computer</button><button data-v="2p">2 players</button></div></div>
    <div class="opt"><span>Computer level</span><div class="seg" data-r="level"><button data-v="easy">Easy</button><button data-v="medium">Medium</button><button data-v="hard">Hard</button></div></div>
    <div class="opt"><span>Board (boxes)</span><div class="seg" data-r="size"><button data-v="3">3×3</button><button data-v="4">4×4</button><button data-v="5">5×5</button><button data-v="6">6×6</button><button data-v="7">7×7</button></div></div>
    <div class="rec" data-r="rec"></div>
    <div class="keys"><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> move the line cursor · <kbd>Space</kbd>/<kbd>Enter</kbd> draw · <kbd>U</kbd> undo</div>
    <details><summary>Strategy</summary><ul>
      <li>Never draw the <b>third side</b> of a box unless you must: your opponent just takes it. Lines that would do so show red.</li>
      <li>Late in the game every move gives something away. Hand over the <b>shortest chain</b> you can.</li>
      <li><b>Double-cross:</b> when taking a long chain, you can leave the last two boxes (four in a loop) for your opponent with one line. They take them, but then must open the next chain for you.</li>
      <li><b>Long-chain rule:</b> who gets control at the end depends on the parity of long chains (3+ boxes). Hard plays this out exactly near the end.</li>
    </ul></details>
  </div>
</div>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const stage = $('stage');
    const NS = 'http://www.w3.org/2000/svg';
    const sv = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

    let G = null, S = null, svg = null, gBox, gLines, gHit, gDots, pv, threatG, ovEl = null;
    let lineEls = [], undoStack = [], busy = false, hover = -1, kcur = -1, firstNext = 0;

    const names = () => opts.mode === 'cpu' ? ['You', 'Computer'] : ['Player 1', 'Player 2'];
    const isCpu = p => opts.mode === 'cpu' && p === 1;

    function newGame() {
      timers.forEach(clearTimeout); timers.clear(); busy = false;
      if (ovEl) { ovEl.remove(); ovEl = null; }
      G = makeGeo(opts.size);
      S = { lines: new Int8Array(G.L), owner: new Int8Array(G.B).fill(-1), score: [0, 0], turn: firstNext, last: -1, over: false, moves: 0 };
      firstNext = 1 - firstNext;
      undoStack = []; hover = -1; kcur = -1;
      build(); hud();
      if (isCpu(S.turn)) { busy = true; hud(); step(aiStep, 650); }
    }

    function build() {
      stage.innerHTML = '';
      const N = G.N, VB = N * SZ + MG * 2;
      svg = sv('svg', { viewBox: '0 0 ' + VB + ' ' + VB, role: 'img', 'aria-label': 'Dots and boxes board' }, stage);
      const X = c => MG + c * SZ;
      gBox = sv('g', {}, svg);
      threatG = sv('g', {}, svg);
      const gGuide = sv('g', {}, svg);
      gLines = sv('g', {}, svg);
      pv = sv('line', { class: 'pv', x1: 0, y1: 0, x2: 0, y2: 0 }, svg);
      gHit = sv('g', {}, svg);
      gDots = sv('g', {}, svg);
      lineEls = [];
      for (let l = 0; l < G.L; l++) {
        const li = G.lineInfo[l], x1 = X(li.x1), y1 = X(li.y1), x2 = X(li.x2), y2 = X(li.y2);
        sv('line', { class: 'guide', x1, y1, x2, y2 }, gGuide);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, h = SZ / 2;
        const pts = li.h ? [x1, y1, mx, my - h, x2, y2, mx, my + h] : [x1, y1, mx + h, my, x2, y2, mx - h, my];
        const hp = sv('polygon', { class: 'hit', points: pts.join(' ') }, gHit); hp.dataset.l = l;
        lineEls.push(null);
      }
      for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) sv('circle', { class: 'dt', cx: X(c), cy: X(r), r: 7 }, gDots);
      // redraw existing state (used after undo / resize)
      for (let l = 0; l < G.L; l++) if (S.lines[l]) drawLine(l, S.lines[l] - 1, true);
      for (let b = 0; b < G.B; b++) if (S.owner[b] >= 0) drawBox(b, S.owner[b], true);
      markLast(); fit();
    }
    function drawLine(l, p, instant) {
      const li = G.lineInfo[l], X = c => MG + c * SZ;
      const e = sv('line', { class: 'dr p' + p + (instant ? ' nt' : ''), x1: X(li.x1), y1: X(li.y1), x2: X(li.x2), y2: X(li.y2), stroke: COL[p], pathLength: 1 }, gLines);
      e.style.color = COL[p];
      lineEls[l] = e;
    }
    function drawBox(b, p, instant) {
      const r = (b / G.N) | 0, c = b % G.N, x = MG + c * SZ, y = MG + r * SZ;
      const g = sv('g', { class: 'bx' + (instant ? ' nt' : '') }, gBox);
      sv('rect', { x: x + 9, y: y + 9, width: SZ - 18, height: SZ - 18, rx: 10, fill: COL[p], 'fill-opacity': 0.26, stroke: COL[p], 'stroke-opacity': 0.5, 'stroke-width': 2 }, g);
      const t = sv('text', { x: x + SZ / 2, y: y + SZ / 2 + 2, fill: COL[p], 'font-size': 34 }, g);
      t.textContent = opts.mode === 'cpu' ? (p === 0 ? 'Y' : 'C') : (p === 0 ? '1' : '2');
    }
    function markLast() {
      for (const e of lineEls) if (e) e.classList.remove('last');
      if (S.last >= 0 && lineEls[S.last]) lineEls[S.last].classList.add('last');
    }
    function threats() {
      threatG.innerHTML = '';
      if (S.over) return;
      for (const b of capturable(G, S.lines, S.owner)) {
        const r = (b / G.N) | 0, c = b % G.N;
        sv('rect', { class: 'threat', x: MG + c * SZ + 12, y: MG + r * SZ + 12, width: SZ - 24, height: SZ - 24, rx: 10 }, threatG);
      }
    }

    function fit() {
      if (!svg || el.offsetParent === null) return;
      const narrow = root.clientWidth < 720;
      root.classList.toggle('narrow', narrow);
      const top = stage.getBoundingClientRect().top;
      const availH = Math.max(300, window.innerHeight - top - 30);
      const availW = narrow ? root.clientWidth : root.clientWidth - 20 - 280;
      const s = Math.floor(Math.max(280, Math.min(availH, availW, 720)));
      svg.style.width = s + 'px'; svg.style.height = s + 'px';
    }

    /* ---------- moves ---------- */
    function snapshot() { return { lines: S.lines.slice(), owner: S.owner.slice(), score: S.score.slice(), turn: S.turn, last: S.last, moves: S.moves }; }
    function play(l, by) {
      if (S.over || S.lines[l]) return 0;
      const p = S.turn;
      const before = S.owner.slice();
      const n = apply(G, S.lines, S.owner, l, p);
      S.last = l; S.moves++;
      drawLine(l, p, false); markLast();
      if (n) {
        let k = 0;
        for (let b = 0; b < G.B; b++) if (before[b] < 0 && S.owner[b] >= 0) { drawBox(b, p, false); k++; }
        S.score[p] += n; sfx.box(Math.min(4, S.score[p] % 5));
      } else { sfx.line(p); S.turn = 1 - p; }
      if (S.score[0] + S.score[1] === G.B) finish();
      threats(); hud();
      return n;
    }
    function humanMove(l) {
      if (busy || S.over || isCpu(S.turn) || S.lines[l]) return;
      undoStack.push(snapshot());
      if (undoStack.length > 200) undoStack.shift();
      hidePreview();
      play(l);
      if (!S.over && isCpu(S.turn)) { busy = true; hud(); step(aiStep, 520); }
      else updatePreview();
    }
    function aiStep() {
      if (!S || S.over || !isCpu(S.turn)) { busy = false; hud(); return; }
      const l = aiPick(G, S.lines, S.owner, opts.level);
      const n = play(l);
      if (S.over) { busy = false; hud(); return; }
      if (isCpu(S.turn)) step(aiStep, n ? 300 : 450);
      else { busy = false; hud(); updatePreview(); }
    }
    function undo() {
      if (!undoStack.length || (busy && !S.over && !isCpu(S.turn))) { sfx.bad(); return; }
      timers.forEach(clearTimeout); timers.clear(); busy = false;
      if (ovEl) { ovEl.remove(); ovEl = null; }
      const s = undoStack.pop();
      if (S.over && S.counted) { // a finished game was undone: take back the recorded result
        const st = S.counted; if (st.k) stats[st.k][st.r]--; stats.played--; S.counted = null; try { api.save('stats', stats); } catch (e) { /* ignore */ }
      }
      Object.assign(S, { lines: Int8Array.from(s.lines), owner: Int8Array.from(s.owner), score: s.score, turn: s.turn, last: s.last, moves: s.moves, over: false });
      build(); threats(); hud(); sfx.undo();
    }
    function finish() {
      S.over = true; busy = false; hidePreview();
      const [a, b] = S.score, nm = names();
      let head, sub, cls = 'w';
      stats.played++;
      S.counted = { k: null, r: null };
      if (opts.mode === 'cpu') {
        const r = a > b ? 'w' : a < b ? 'l' : 'd'; stats[opts.level][r]++; S.counted = { k: opts.level, r };
        if (r === 'w') {
          head = 'You win!'; sfx.win();
          const rank = (LV_KEYS.indexOf(opts.level) + 1) * 100 + opts.size * 10 + Math.min(9, a - b);
          if (rank > bestRank) { bestRank = rank; try { api.save('best', 'Beat ' + LV[opts.level] + ' ' + opts.size + '×' + opts.size); api.save('bestRank', bestRank); } catch (e) { /* ignore */ } sub = 'New best: beat ' + LV[opts.level] + ' on ' + opts.size + '×' + opts.size + '!'; }
        } else if (r === 'l') { head = 'Computer wins'; cls = ''; sfx.lose(); } else { head = 'A draw!'; sfx.win(); }
      } else { head = a === b ? 'A draw!' : (a > b ? nm[0] : nm[1]) + ' wins!'; sfx.win(); }
      try { api.save('stats', stats); } catch (e) { /* ignore */ }
      later(() => {
        if (!S || !S.over) return;
        ovEl = document.createElement('div'); ovEl.className = 'ov';
        ovEl.innerHTML = '<div class="box"><h3 style="color:' + (a > b ? COL[0] : a < b ? COL[1] : 'var(--gold)') + '">' + head + '</h3><p>' + a + ' – ' + b + (sub ? '<br><b style="color:var(--gold)">' + sub + '</b>' : '') + '</p><button class="btn pri small" data-r="again">Play again</button></div>';
        stage.appendChild(ovEl);
      }, 650);
      if (cls) { /* status colouring handled in hud */ }
    }

    /* ---------- preview / hover ---------- */
    const wouldGive = l => G.lineBoxes[l].some(b => S.owner[b] < 0 && boxCount(G, S.lines, b) === 2);
    function showPreview(l, kb) {
      const li = G.lineInfo[l], X = c => MG + c * SZ;
      pv.setAttribute('x1', X(li.x1)); pv.setAttribute('y1', X(li.y1)); pv.setAttribute('x2', X(li.x2)); pv.setAttribute('y2', X(li.y2));
      pv.setAttribute('stroke', COL[S.turn]);
      const completes = G.lineBoxes[l].some(b => boxCount(G, S.lines, b) === 3);
      pv.classList.toggle('bad', !completes && wouldGive(l));
      pv.classList.add('on'); pv.classList.toggle('kb', !!kb);
    }
    function hidePreview() { if (pv) pv.classList.remove('on', 'kb'); }
    function canHuman() { return S && !S.over && !busy && !isCpu(S.turn); }
    function updatePreview() {
      if (!canHuman()) { hidePreview(); return; }
      if (kcur >= 0 && !S.lines[kcur]) showPreview(kcur, true);
      else if (hover >= 0 && !S.lines[hover]) showPreview(hover, false);
      else hidePreview();
    }

    /* ---------- hud ---------- */
    function hud() {
      const nm = names();
      $('n0').textContent = nm[0]; $('n1').textContent = nm[1];
      $('s0').textContent = S.score[0]; $('s1').textContent = S.score[1];
      $('pl0').classList.toggle('turn', !S.over && S.turn === 0); $('pl1').classList.toggle('turn', !S.over && S.turn === 1);
      const st = $('status'), sub = $('sub');
      const left = G.B - S.score[0] - S.score[1];
      if (S.over) {
        const [a, b] = S.score;
        st.className = 'status w';
        st.textContent = a === b ? 'Draw ' + a + '–' + b : (a > b ? nm[0] : nm[1]) + (opts.mode === 'cpu' && a > b ? ' win ' : ' wins ') + Math.max(a, b) + '–' + Math.min(a, b);
        sub.textContent = 'New game, or Undo to take back your last move.';
      } else {
        st.className = 'status p' + S.turn;
        st.textContent = isCpu(S.turn) ? 'Computer is thinking…' : (opts.mode === 'cpu' ? 'Your move' : nm[S.turn] + "'s move");
        const caps = capturable(G, S.lines, S.owner).length;
        sub.textContent = caps && !isCpu(S.turn) ? caps + ' box' + (caps > 1 ? 'es' : '') + ' ready to take — claim and go again.' : left + ' of ' + G.B + ' boxes left' + (opts.mode === 'cpu' ? ' · ' + LV[opts.level] : '');
      }
      $('undo').disabled = !undoStack.length;
      svg && svg.classList.toggle('wait', !canHuman());
      root.querySelectorAll('[data-r="mode"] button').forEach(b => b.classList.toggle('on', b.dataset.v === opts.mode));
      root.querySelectorAll('[data-r="level"] button').forEach(b => b.classList.toggle('on', b.dataset.v === opts.level));
      root.querySelectorAll('[data-r="size"] button').forEach(b => b.classList.toggle('on', +b.dataset.v === opts.size));
      $('level').classList.toggle('dis', opts.mode !== 'cpu');
      $('snd').textContent = soundOn ? '🔊' : '🔇';
      const s = stats[opts.level];
      $('rec').textContent = opts.mode === 'cpu' ? LV[opts.level] + ': W ' + s.w + ' · L ' + s.l + ' · D ' + s.d : 'Two players on one screen';
    }

    /* ---------- input ---------- */
    function onClick(e) {
      const b = e.target.closest('button');
      if (b && root.contains(b)) {
        const r = b.dataset.r, par = b.parentNode.dataset.r;
        b.blur();
        if (r === 'new' || r === 'again') { sfx.click(); newGame(); return; }
        if (r === 'undo') { undo(); return; }
        if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); hud(); sfx.click(); return; }
        if (par === 'mode' || par === 'level' || par === 'size') {
          const v = par === 'size' ? +b.dataset.v : b.dataset.v;
          if (opts[par] === v) return;
          opts[par] = v; api.save('opts', opts); firstNext = 0; newGame(); return;
        }
        return;
      }
      const h = e.target.closest('.hit');
      if (h) { kcur = -1; humanMove(+h.dataset.l); }
    }
    function onOver(e) {
      const h = e.target.closest && e.target.closest('.hit');
      if (!h || !svg || !svg.contains(h)) return;
      hover = +h.dataset.l; kcur = -1; updatePreview();
    }
    function onLeave() { hover = -1; if (kcur < 0) hidePreview(); }
    // keyboard lattice: (y,x) with y,x in 0..2N; h-edges at (even, odd), v-edges at (odd, even)
    function latOf(l) { const li = G.lineInfo[l]; return li.h ? { y: 2 * li.r, x: 2 * li.c + 1 } : { y: 2 * li.r + 1, x: 2 * li.c }; }
    function lineAt(y, x) { const N = G.N; if (y < 0 || x < 0 || y > 2 * N || x > 2 * N) return -1; if (y % 2 === 0 && x % 2 === 1) return G.hIdx(y / 2, (x - 1) / 2); if (y % 2 === 1 && x % 2 === 0) return G.vIdx((y - 1) / 2, x / 2); return -1; }
    function moveCursor(k) {
      const N = G.N;
      if (kcur < 0) { kcur = hover >= 0 ? hover : G.hIdx(0, 0); return; }
      const p = latOf(kcur); let y = p.y, x = p.x;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { const d = k === 'ArrowLeft' ? -2 : 2; x += d; if (x < 0) x = y % 2 ? 2 * N : 2 * N - 1; if (x > 2 * N) x = y % 2 ? 0 : 1; }
      else {
        const d = k === 'ArrowUp' ? -1 : 1; y += d;
        if (y < 0) y = 2 * N; if (y > 2 * N) y = 0;
        if (y % 2 === 1) x = x - 1 >= 0 ? x - 1 : x + 1; else x = x + 1 <= 2 * N - 1 ? x + 1 : x - 1;
      }
      const l = lineAt(y, x); if (l >= 0) kcur = l;
    }
    function onKey(e) {
      if (el.offsetParent === null || document.hidden || !S) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.altKey || e.metaKey) return;
      const k = e.key;
      if (e.ctrlKey) { if (k === 'z' || k === 'Z') { e.preventDefault(); undo(); } return; }
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault(); if (S.over) return; moveCursor(k); sfx.click(); updatePreview(); return;
      }
      if (k === ' ' || (k === 'Enter' && tg !== 'BUTTON')) {
        e.preventDefault();
        if (S.over) { newGame(); return; }
        if (kcur >= 0 && canHuman()) { if (S.lines[kcur]) { sfx.bad(); return; } const l = kcur; humanMove(l); if (canHuman()) updatePreview(); }
        else if (kcur < 0) { moveCursor('ArrowRight'); updatePreview(); }
        return;
      }
      if (k === 'u' || k === 'U' || k === 'x' || k === 'Backspace') { e.preventDefault(); undo(); }
    }
    let rsz = 0;
    function onResize() { if (rsz) return; rsz = requestAnimationFrame(() => { rsz = 0; if (document.hidden || el.offsetParent === null) return; fit(); }); }

    root.addEventListener('click', onClick);
    stage.addEventListener('mouseover', onOver);
    stage.addEventListener('mouseleave', onLeave);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    newGame();

    return {
      destroy() {
        timers.forEach(clearTimeout); timers.clear();
        if (rsz) cancelAnimationFrame(rsz);
        root.removeEventListener('click', onClick);
        stage.removeEventListener('mouseover', onOver);
        stage.removeEventListener('mouseleave', onLeave);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        el.innerHTML = ''; S = null;
      },
      _test: { get S() { return S; }, get G() { return G; }, get busy() { return busy; }, humanMove, undo, newGame, aiPick: (lv) => aiPick(G, S.lines, S.owner, lv) },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { inst.destroy(); inst = null; this._t = null; } },
    _engine: { makeGeo, apply, safeMoves, capturable, components, structure, endValue, aiPick, boxCount },
  };
})();
