/* VanMule Arcade: Sudoku. Unique-solution generator graded by a logic solver (Easy..Expert),
   pencil notes, highlights, explained hints, undo, timer, best times, resume. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'sudoku';

  /* ---------------- engine (pure) ---------------- */
  const ROW = i => (i / 9) | 0, COL = i => i % 9, BOX = i => ((ROW(i) / 3) | 0) * 3 + ((COL(i) / 3) | 0);
  const UNITS = [];
  for (let r = 0; r < 9; r++) { const u = []; for (let c = 0; c < 9; c++) u.push(r * 9 + c); UNITS.push(u); }
  for (let c = 0; c < 9; c++) { const u = []; for (let r = 0; r < 9; r++) u.push(r * 9 + c); UNITS.push(u); }
  for (let b = 0; b < 9; b++) { const u = []; const r0 = ((b / 3) | 0) * 3, c0 = (b % 3) * 3; for (let k = 0; k < 9; k++) u.push((r0 + ((k / 3) | 0)) * 9 + c0 + (k % 3)); UNITS.push(u); }
  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const s = new Set();
    for (const u of [UNITS[ROW(i)], UNITS[9 + COL(i)], UNITS[18 + BOX(i)]]) for (const j of u) if (j !== i) s.add(j);
    PEERS.push([...s]);
  }
  const ALL = 0x3fe; // bits 1..9
  const bit = d => 1 << d;
  const pc = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const digitsOf = m => { const o = []; for (let d = 1; d <= 9; d++) if (m & bit(d)) o.push(d); return o; };
  const unitName = u => u < 9 ? 'row ' + (u + 1) : u < 18 ? 'column ' + (u - 8) : 'box ' + (u - 17);
  const cellName = i => 'R' + (ROW(i) + 1) + 'C' + (COL(i) + 1);
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // Count solutions (stops at limit). vals: array of 81 ints (0 = empty). Optionally fills `out` with first solution.
  function countSolutions(vals, limit, out) {
    const g = vals.slice();
    const rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);
    for (let i = 0; i < 81; i++) if (g[i]) {
      const b = bit(g[i]);
      if ((rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & b) return 0;
      rows[ROW(i)] |= b; cols[COL(i)] |= b; boxes[BOX(i)] |= b;
    }
    let count = 0;
    function rec() {
      let best = -1, bestM = 0, bestN = 10;
      for (let i = 0; i < 81; i++) if (!g[i]) {
        const m = ALL & ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]);
        const n = pc(m);
        if (n < bestN) { best = i; bestM = m; bestN = n; if (n <= 1) break; }
      }
      if (best < 0) { count++; if (out && count === 1) for (let i = 0; i < 81; i++) out[i] = g[i]; return count >= limit; }
      if (!bestN) return false;
      const r = ROW(best), c = COL(best), b = BOX(best);
      for (let d = 1; d <= 9; d++) if (bestM & bit(d)) {
        g[best] = d; rows[r] |= bit(d); cols[c] |= bit(d); boxes[b] |= bit(d);
        const stop = rec();
        g[best] = 0; rows[r] &= ~bit(d); cols[c] &= ~bit(d); boxes[b] &= ~bit(d);
        if (stop) return true;
      }
      return false;
    }
    rec();
    return count;
  }
  function randomFull() {
    const g = new Array(81).fill(0);
    // seed the three diagonal boxes randomly, then solve with random digit order
    for (const b of [0, 4, 8]) { const ds = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]); UNITS[18 + b].forEach((i, k) => { g[i] = ds[k]; }); }
    const out = new Array(81);
    countSolutions(g, 1, out);
    // relabel digits randomly for variety
    const map = [0].concat(shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    return out.map(v => map[v]);
  }

  function candsFrom(vals) {
    const c = new Int32Array(81);
    for (let i = 0; i < 81; i++) {
      if (vals[i]) { c[i] = 0; continue; }
      let m = ALL;
      for (const j of PEERS[i]) if (vals[j]) m &= ~bit(vals[j]);
      c[i] = m;
    }
    return c;
  }

  // Technique levels
  const LV = { naked: 1, hidden: 2, locked: 3, pair: 4, triple: 5, xwing: 6 };
  const TECH_NAME = { naked: 'Naked single', hidden: 'Hidden single', pointing: 'Pointing pair', claiming: 'Box/line reduction', npair: 'Naked pair', hpair: 'Hidden pair', ntriple: 'Naked triple', xwing: 'X-Wing' };

  // Find one logical step. Returns {kind, level, place:[i,d]} or {kind, level, elim:[[i,d],...], ...info}
  function findStep(vals, cands, maxLevel) {
    // naked single
    for (let i = 0; i < 81; i++) if (!vals[i] && pc(cands[i]) === 1) return { kind: 'naked', level: 1, place: [i, digitsOf(cands[i])[0]] };
    // hidden single
    for (let u = 0; u < 27; u++) {
      const U = UNITS[u];
      for (let d = 1; d <= 9; d++) {
        let where = -1, n = 0, placed = false;
        for (const i of U) { if (vals[i] === d) { placed = true; break; } if (!vals[i] && (cands[i] & bit(d))) { n++; where = i; } }
        if (!placed && n === 1) return { kind: 'hidden', level: 2, place: [where, d], unit: u };
      }
    }
    if (maxLevel < 3) return null;
    // locked candidates: pointing (box -> line)
    for (let b = 0; b < 9; b++) {
      const U = UNITS[18 + b];
      for (let d = 1; d <= 9; d++) {
        const cells = U.filter(i => !vals[i] && (cands[i] & bit(d)));
        if (cells.length < 2) continue;
        for (const [fn, off] of [[ROW, 0], [COL, 9]]) {
          const k = fn(cells[0]);
          if (!cells.every(i => fn(i) === k)) continue;
          const elim = UNITS[off + k].filter(i => BOX(i) !== b && !vals[i] && (cands[i] & bit(d))).map(i => [i, d]);
          if (elim.length) return { kind: 'pointing', level: 3, elim, d, box: b, line: off + k, cells };
        }
      }
    }
    // claiming (line -> box)
    for (let u = 0; u < 18; u++) {
      const U = UNITS[u];
      for (let d = 1; d <= 9; d++) {
        const cells = U.filter(i => !vals[i] && (cands[i] & bit(d)));
        if (cells.length < 2) continue;
        const b = BOX(cells[0]);
        if (!cells.every(i => BOX(i) === b)) continue;
        const elim = UNITS[18 + b].filter(i => U.indexOf(i) < 0 && !vals[i] && (cands[i] & bit(d))).map(i => [i, d]);
        if (elim.length) return { kind: 'claiming', level: 3, elim, d, box: b, line: u, cells };
      }
    }
    if (maxLevel < 4) return null;
    // naked pair
    for (let u = 0; u < 27; u++) {
      const U = UNITS[u].filter(i => !vals[i]);
      for (let a = 0; a < U.length; a++) {
        const m = cands[U[a]]; if (pc(m) !== 2) continue;
        for (let b = a + 1; b < U.length; b++) if (cands[U[b]] === m) {
          const elim = [];
          for (const i of U) if (i !== U[a] && i !== U[b]) for (const d of digitsOf(m)) if (cands[i] & bit(d)) elim.push([i, d]);
          if (elim.length) return { kind: 'npair', level: 4, elim, unit: u, cells: [U[a], U[b]], digits: digitsOf(m) };
        }
      }
    }
    // hidden pair
    for (let u = 0; u < 27; u++) {
      const U = UNITS[u];
      const pos = {};
      for (let d = 1; d <= 9; d++) { if (U.some(i => vals[i] === d)) continue; pos[d] = U.filter(i => !vals[i] && (cands[i] & bit(d))); }
      const ds = Object.keys(pos).map(Number).filter(d => pos[d].length === 2);
      for (let a = 0; a < ds.length; a++) for (let b = a + 1; b < ds.length; b++) {
        const pa = pos[ds[a]], pb = pos[ds[b]];
        if (pa[0] !== pb[0] || pa[1] !== pb[1]) continue;
        const keep = bit(ds[a]) | bit(ds[b]);
        const elim = [];
        for (const i of pa) for (const d of digitsOf(cands[i] & ~keep)) elim.push([i, d]);
        if (elim.length) return { kind: 'hpair', level: 4, elim, unit: u, cells: pa, digits: [ds[a], ds[b]] };
      }
    }
    if (maxLevel < 5) return null;
    // naked triple
    for (let u = 0; u < 27; u++) {
      const U = UNITS[u].filter(i => !vals[i] && pc(cands[i]) <= 3);
      for (let a = 0; a < U.length; a++) for (let b = a + 1; b < U.length; b++) for (let c = b + 1; c < U.length; c++) {
        const m = cands[U[a]] | cands[U[b]] | cands[U[c]];
        if (pc(m) !== 3) continue;
        const trio = [U[a], U[b], U[c]];
        const elim = [];
        for (const i of UNITS[u]) if (!vals[i] && trio.indexOf(i) < 0) for (const d of digitsOf(m)) if (cands[i] & bit(d)) elim.push([i, d]);
        if (elim.length) return { kind: 'ntriple', level: 5, elim, unit: u, cells: trio, digits: digitsOf(m) };
      }
    }
    if (maxLevel < 6) return null;
    // X-Wing (rows then columns)
    for (const base of [0, 9]) {
      for (let d = 1; d <= 9; d++) {
        const lines = [];
        for (let k = 0; k < 9; k++) {
          const cells = UNITS[base + k].filter(i => !vals[i] && (cands[i] & bit(d)));
          if (cells.length === 2) lines.push({ k, cells });
        }
        const cross = base === 0 ? COL : ROW, crossOff = base === 0 ? 9 : 0;
        for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
          const A = lines[a], B = lines[b];
          if (cross(A.cells[0]) !== cross(B.cells[0]) || cross(A.cells[1]) !== cross(B.cells[1])) continue;
          const corners = A.cells.concat(B.cells), elim = [];
          for (const x of [cross(A.cells[0]), cross(A.cells[1])]) for (const i of UNITS[crossOff + x]) if (corners.indexOf(i) < 0 && !vals[i] && (cands[i] & bit(d))) elim.push([i, d]);
          if (elim.length) return { kind: 'xwing', level: 6, elim, d, cells: corners, lines: [base + A.k, base + B.k] };
        }
      }
    }
    return null;
  }
  function applyStep(vals, cands, st) {
    if (st.place) {
      const [i, d] = st.place; vals[i] = d; cands[i] = 0;
      for (const j of PEERS[i]) cands[j] &= ~bit(d);
    } else for (const [i, d] of st.elim) cands[i] &= ~bit(d);
  }
  // Grade a puzzle: returns {solved, max} where max is the highest technique level needed (7 = beyond our logic).
  function grade(puz, maxLevel) {
    const vals = puz.slice(), cands = candsFrom(vals);
    let max = 0, guard = 0;
    while (guard++ < 400) {
      if (vals.every(v => v)) return { solved: true, max };
      const st = findStep(vals, cands, maxLevel == null ? 6 : maxLevel);
      if (!st) return { solved: false, max: 7 };
      if (st.level > max) max = st.level;
      applyStep(vals, cands, st);
    }
    return { solved: false, max: 7 };
  }

  const DIFFS = [
    { k: 'easy', name: 'Easy', allow: 2, minGiven: 36, need: 1 },
    { k: 'medium', name: 'Medium', allow: 3, minGiven: 30, need: 2, maxGiven: 32 },
    { k: 'hard', name: 'Hard', allow: 5, minGiven: 22, need: 3, maxGiven: 28 },
    { k: 'expert', name: 'Expert', allow: 7, minGiven: 17, need: 6, maxGiven: 26 },
  ];
  // One generation attempt. Returns {puzzle, solution, level}
  function attempt(diff) {
    const sol = randomFull();
    const puz = sol.slice();
    const order = shuffle([...Array(81).keys()]);
    let given = 81;
    for (const i of order) {
      if (given <= diff.minGiven) break;
      const keep = puz[i];
      puz[i] = 0;
      if (countSolutions(puz, 2) !== 1) { puz[i] = keep; continue; }
      if (diff.allow < 7) {
        const g = grade(puz, diff.allow);
        if (!g.solved) { puz[i] = keep; continue; }
      }
      given--;
    }
    const g = grade(puz, 6);
    return { puzzle: puz, solution: sol, level: g.max, given };
  }
  function goodFor(diff, a) {
    if (a.level < diff.need && diff.k !== 'easy') {
      if (!(diff.k === 'medium' && a.given <= 32)) return false;
    }
    if (diff.maxGiven && a.given > diff.maxGiven) return false;
    if (diff.k === 'easy' && a.level > 2) return false;
    return true;
  }

  /* ---------------- UI ---------------- */
  const CSS = `
.ag-sudoku{font-family:var(--body);color:var(--fg);user-select:none;-webkit-user-select:none;display:flex;gap:22px;align-items:flex-start;justify-content:center;flex-wrap:wrap}
.ag-sudoku .bwrap{position:relative;flex:0 0 auto}
.ag-sudoku .board{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:3px;padding:3px;background:#5a4c41;border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.45);width:calc(var(--cs)*9 + 18px);height:calc(var(--cs)*9 + 18px)}
.ag-sudoku .box{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);min-width:0;min-height:0;gap:1px;background:#3a312a;border-radius:4px;overflow:hidden}
.ag-sudoku .board>.box:nth-child(1){border-top-left-radius:9px}.ag-sudoku .board>.box:nth-child(3){border-top-right-radius:9px}
.ag-sudoku .board>.box:nth-child(7){border-bottom-left-radius:9px}.ag-sudoku .board>.box:nth-child(9){border-bottom-right-radius:9px}
.ag-sudoku .cell{position:relative;min-width:0;min-height:0;overflow:hidden;background:#1f1a17;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-size:calc(var(--cs)*.5);font-weight:600;cursor:pointer;transition:background .12s}
.ag-sudoku .cell:hover{background:#2a231f}
.ag-sudoku .cell.giv{color:var(--fg)}
.ag-sudoku .cell.usr{color:var(--cool);font-weight:500}
.ag-sudoku .cell.peer{background:#28211d}
.ag-sudoku .cell.same{background:#4a3519}
.ag-sudoku .cell.same.usr{color:#8fe6db}
.ag-sudoku .cell.sel{background:#6b3a14;box-shadow:inset 0 0 0 2px var(--ember)}
.ag-sudoku .cell.bad{color:var(--bad)!important;background:#3a1714}
.ag-sudoku .cell.bad.sel{background:#5a1e18}
.ag-sudoku .cell.conf::after{content:"";position:absolute;inset:3px;border-radius:4px;box-shadow:inset 0 0 0 1.5px rgba(255,90,82,.6)}
.ag-sudoku .cell.hint,.ag-sudoku .cell.hint.sel{box-shadow:inset 0 0 0 2px var(--gold);animation:agsdkpulse 1s ease-in-out infinite alternate}
.ag-sudoku .cell.hunit{background:#2d2a1a}
.ag-sudoku .cell.helim .nt i.x{color:var(--bad);text-decoration:line-through}
@keyframes agsdkpulse{to{box-shadow:inset 0 0 0 3px var(--gold),0 0 14px rgba(255,200,97,.45)}}
.ag-sudoku .cell.pop{animation:agsdkpop .28s ease-out}
@keyframes agsdkpop{0%{transform:scale(.6)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
.ag-sudoku .cell.flash{animation:agsdkflash .6s ease-out backwards}
@keyframes agsdkflash{0%{background:#7a4a1d}100%{}}
.ag-sudoku .cell.wave{animation:agsdkwave .7s ease-out backwards}
@keyframes agsdkwave{0%{background:#1f1a17}40%{background:#ff8a3d;color:#1b0d03}100%{}}
.ag-sudoku .nt{position:absolute;inset:1px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);font-family:var(--mono);font-size:calc(var(--cs)*.22);font-weight:600;color:var(--muted);line-height:1}
.ag-sudoku .nt i{font-style:normal;display:flex;align-items:center;justify-content:center;border-radius:3px}
.ag-sudoku .nt i.hl{background:var(--ember);color:var(--ember-ink)}
.ag-sudoku .side{flex:1 1 260px;min-width:250px;max-width:330px;display:flex;flex-direction:column;gap:12px}
.ag-sudoku h2{font-family:var(--display);font-size:26px;margin:0;line-height:1.1}
.ag-sudoku h2 em{font-style:normal;color:var(--ember)}
.ag-sudoku .how{color:var(--muted);font-size:13px;margin:2px 0 0}
.ag-sudoku .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.ag-sudoku .stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.ag-sudoku .stat span{display:block;font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em}
.ag-sudoku .stat b{display:block;font-family:var(--mono);font-size:17px;font-weight:700}
.ag-sudoku .stat.best b{color:var(--gold)}
.ag-sudoku .seg{display:flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:3px;gap:3px}
.ag-sudoku .seg button{flex:1;height:30px;border-radius:7px;font-size:13px;font-weight:600;color:var(--muted)}
.ag-sudoku .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-sudoku .seg button:hover{color:var(--fg)}
.ag-sudoku .pad{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.ag-sudoku .pad button{height:52px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);font-family:var(--display);font-size:22px;font-weight:600;position:relative;transition:transform .08s,background .12s}
.ag-sudoku .pad button:hover{background:#2e2823}
.ag-sudoku .pad button:active{transform:scale(.95)}
.ag-sudoku .pad button small{position:absolute;right:5px;bottom:3px;font-family:var(--mono);font-size:10px;color:var(--dim);font-weight:500}
.ag-sudoku .pad button.done{opacity:.3}
.ag-sudoku .pad button.cur{border-color:var(--ember);color:var(--ember)}
.ag-sudoku .pad button.er{font-family:var(--body);font-size:20px}
.ag-sudoku.notes .pad button:not(.er){font-size:15px;color:var(--gold)}
.ag-sudoku .tools{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.ag-sudoku .tools button{height:50px;border-radius:10px;background:var(--panel);border:1px solid var(--line);font-size:12px;font-weight:600;color:var(--muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;line-height:1.1}
.ag-sudoku .tools button b{font-size:17px;color:var(--fg);font-weight:600}
.ag-sudoku .tools button:hover{color:var(--fg)}
.ag-sudoku .tools button.on{border-color:var(--gold);color:var(--gold);background:#2b2416}
.ag-sudoku .tools button:disabled{opacity:.4;cursor:default}
.ag-sudoku .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ag-sudoku .row .sp{flex:1}
.ag-sudoku .chk{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--muted);cursor:pointer}
.ag-sudoku .chk input{accent-color:var(--ember);width:15px;height:15px;margin:0}
.ag-sudoku .hintbox{background:linear-gradient(160deg,#2b2416,#1f1a14);border:1px solid #5a4a24;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.45;color:#eadfca;animation:agsdkfade .25s ease-out}
.ag-sudoku .hintbox b.t{display:block;color:var(--gold);font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px}
.ag-sudoku .hintbox p{margin:0 0 6px}
.ag-sudoku .hintbox .row{margin-top:4px}
@keyframes agsdkfade{from{opacity:0;transform:translateY(-4px)}}
.ag-sudoku .ov{position:absolute;inset:0;border-radius:12px;background:rgba(14,12,11,.82);backdrop-filter:blur(3px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:5;text-align:center;padding:20px;animation:agsdkfade .3s ease-out}
.ag-sudoku .ov h3{font-family:var(--display);font-size:28px;margin:0;color:var(--gold)}
.ag-sudoku .ov p{margin:0;color:var(--muted)}
.ag-sudoku .ov .big{font-family:var(--mono);font-size:30px;color:var(--fg);font-weight:700}
.ag-sudoku .ov .row{justify-content:center}
.ag-sudoku .spin{width:34px;height:34px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--ember);animation:agsdkspin .8s linear infinite}
@keyframes agsdkspin{to{transform:rotate(360deg)}}
.ag-sudoku .keys{font-size:12px;color:var(--dim);line-height:1.75}
.ag-sudoku kbd{font-family:var(--mono);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;color:var(--fg)}
.ag-sudoku details{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--muted)}
.ag-sudoku summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-sudoku details ul{margin:8px 0 2px;padding-left:18px}
.ag-sudoku details li{margin:3px 0}
.ag-sudoku .bests{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:11px;text-align:center;color:var(--dim)}
.ag-sudoku .bests b{display:block;font-family:var(--mono);font-size:13px;color:var(--fg);font-weight:600}
`;

  const fmt = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

  let inst = null;
  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) { const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st); }
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    let ticker = 0;
    const visible = () => !document.hidden && el.offsetParent !== null;

    // sound
    let soundOn = api.load('sound'); if (soundOn === null) soundOn = !!api.sound;
    let actx = null;
    function tone(f, d, type, vol, at, f2) {
      if (!soundOn) return;
      try {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        const t = actx.currentTime + (at || 0), o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
      } catch (e) { /* ignore */ }
    }
    const sfx = {
      place: () => tone(560, 0.06, 'triangle', 0.05),
      note: () => tone(880, 0.03, 'sine', 0.025),
      erase: () => tone(300, 0.05, 'sine', 0.03),
      bad: () => tone(180, 0.18, 'sawtooth', 0.035, 0, 120),
      unit: () => [660, 880, 1100].forEach((f, k) => tone(f, 0.12, 'triangle', 0.04, k * 0.05)),
      hint: () => tone(740, 0.12, 'sine', 0.04, 0, 980),
      win: () => [523, 659, 784, 1047, 1319].forEach((f, k) => tone(f, 0.22, 'triangle', 0.06, k * 0.09)),
      move: () => tone(420, 0.015, 'sine', 0.012),
    };

    const opts = Object.assign({ diff: 'medium', check: true, autoClean: true }, api.load('opts') || {});
    let bests = api.load('bests') || {};

    const root = document.createElement('div');
    root.className = 'ag-sudoku';
    root.innerHTML = `
<div class="bwrap" data-r="bwrap"><div class="board" data-r="board"></div></div>
<div class="side">
  <div><h2>Mule <em>Sudoku</em></h2><p class="how">Fill every row, column and 3×3 box with 1–9. Each puzzle has exactly one solution.</p></div>
  <div class="seg" data-r="diffs">${DIFFS.map(d => `<button data-diff="${d.k}">${d.name}</button>`).join('')}</div>
  <div class="stats"><div class="stat"><span>Time</span><b data-r="time">0:00</b></div><div class="stat"><span>Mistakes</span><b data-r="mist">0</b></div><div class="stat best"><span>Best</span><b data-r="best">–</b></div></div>
  <div class="pad" data-r="pad">${[1, 2, 3, 4, 5].map(d => `<button data-d="${d}">${d}<small></small></button>`).join('')}${[6, 7, 8, 9].map(d => `<button data-d="${d}">${d}<small></small></button>`).join('')}<button class="er" data-d="0" title="Erase">⌫</button></div>
  <div class="tools"><button data-r="undo" title="Undo (U / Ctrl+Z)"><b>↶</b>Undo</button><button data-r="notes" title="Notes (N)"><b>✎</b>Notes</button><button data-r="fill" title="Fill all candidate notes"><b>⋯</b>Auto-notes</button><button data-r="hint" title="Hint (H)"><b>💡</b>Hint</button></div>
  <div data-r="hintwrap"></div>
  <div class="row"><button class="btn pri small" data-r="new">New puzzle</button><button class="btn sec small" data-r="pause">Pause</button><span class="sp"></span><button class="btn sec small" data-r="snd"></button></div>
  <label class="chk"><input type="checkbox" data-r="check"> Show mistakes as you go</label>
  <div class="keys"><kbd>←↑→↓</kbd> move · <kbd>1</kbd>–<kbd>9</kbd> place · <kbd>⌫</kbd> erase · <kbd>N</kbd> notes · <kbd>H</kbd> hint · <kbd>U</kbd> undo · <kbd>Space</kbd> cycle digit</div>
  <details><summary>Best times</summary><div class="bests" data-r="bests" style="margin-top:8px"></div></details>
  <details><summary>Tips &amp; techniques</summary><ul>
    <li><b>Naked single:</b> a cell where only one digit is still possible.</li>
    <li><b>Hidden single:</b> a digit that fits in only one cell of a row, column or box.</li>
    <li><b>Pointing pair:</b> if a digit in a box is confined to one row/column, remove it from the rest of that line.</li>
    <li><b>Naked / hidden pair:</b> two cells in a unit that must hold the same two digits lock those digits out of the rest.</li>
    <li><b>X-Wing:</b> a digit limited to the same two columns in two rows can be removed from the rest of those columns.</li>
    <li>Scan digits that already appear often first. Use notes once singles run dry.</li></ul></details>
</div>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const boardEl = $('board'), bwrap = $('bwrap');
    const cellEls = new Array(81);
    for (let b = 0; b < 9; b++) {
      const bx = document.createElement('div'); bx.className = 'box';
      for (const i of UNITS[18 + b]) { const c = document.createElement('div'); c.className = 'cell'; c.dataset.i = i; bx.appendChild(c); cellEls[i] = c; }
      boardEl.appendChild(bx);
    }
    const padBtns = [...root.querySelectorAll('.pad button')];

    // game state
    let G = null;           // {diff, puzzle[], solution[], vals[], notes[], elapsed, mistakes, hints, done}
    let sel = 40, notesMode = false, undoStack = [], hint = null, paused = false, overlay = null, generating = false, genToken = 0;
    let lastTick = 0;

    function persist() { if (G) api.save('game', { diff: G.diff, p: G.puzzle.join(''), s: G.solution.join(''), v: G.vals.join(''), n: G.notes.slice(), e: Math.round(G.elapsed), m: G.mistakes, h: G.hints, done: G.done }); }
    function saveOpts() { api.save('opts', opts); }

    function fit() {
      const top = bwrap.getBoundingClientRect().top;
      const availH = Math.max(300, window.innerHeight - Math.max(0, top) - 40);
      const w = el.clientWidth || 900;
      const availW = w >= 860 ? w - 330 - 22 : w;
      const cs = Math.max(34, Math.min(66, Math.floor((Math.min(availH, availW) - 20) / 9)));
      root.style.setProperty('--cs', cs + 'px');
    }

    function conflicts(i) {
      const v = G.vals[i]; if (!v) return false;
      for (const j of PEERS[i]) if (G.vals[j] === v) return true;
      return false;
    }
    function render() {
      if (!G) return;
      const sv = G.vals[sel];
      const hl = hint ? hint.hl : null;
      for (let i = 0; i < 81; i++) {
        const c = cellEls[i], v = G.vals[i];
        let cls = 'cell';
        const giv = G.puzzle[i] !== 0;
        if (v) cls += giv ? ' giv' : ' usr';
        if (i === sel) cls += ' sel';
        else if (ROW(i) === ROW(sel) || COL(i) === COL(sel) || BOX(i) === BOX(sel)) cls += ' peer';
        if (sv && v === sv && i !== sel) cls += ' same';
        if (!giv && v && opts.check && v !== G.solution[i]) cls += ' bad';
        else if (!giv && v && conflicts(i)) cls += ' conf';
        if (hl) { if (hl.target === i) cls += ' hint'; else if (hl.unit && hl.unit.has(i)) cls += ' hunit'; }
        if (c.className.indexOf(' pop') >= 0) cls += ' pop';
        if (c.className.indexOf(' flash') >= 0) cls += ' flash';
        if (c.className.indexOf(' wave') >= 0) cls += ' wave';
        c.className = cls;
        if (v) { if (c.textContent !== String(v) || c.firstChild && c.firstChild.nodeType !== 3) c.textContent = v; }
        else {
          const n = G.notes[i];
          if (!n) { if (c.childNodes.length) c.textContent = ''; }
          else {
            let h = '<div class="nt">';
            for (let d = 1; d <= 9; d++) h += '<i' + ((n & bit(d)) && d === sv ? ' class="hl"' : '') + '>' + ((n & bit(d)) ? d : '') + '</i>';
            c.innerHTML = h + '</div>';
          }
        }
      }
      // pad counts
      const cnt = new Array(10).fill(0);
      for (let i = 0; i < 81; i++) if (G.vals[i] && G.vals[i] === G.solution[i]) cnt[G.vals[i]]++;
      padBtns.forEach(b => {
        const d = +b.dataset.d; if (!d) return;
        b.querySelector('small').textContent = 9 - cnt[d] > 0 ? 9 - cnt[d] : '';
        b.classList.toggle('done', cnt[d] >= 9);
        b.classList.toggle('cur', d === sv);
      });
      $('mist').textContent = G.mistakes;
      $('undo').disabled = !undoStack.length || G.done;
      $('notes').classList.toggle('on', notesMode);
      root.classList.toggle('notes', notesMode);
      DIFFS.forEach(d => root.querySelector('[data-diff="' + d.k + '"]').classList.toggle('on', d.k === opts.diff));
      const b = bests[G.diff]; $('best').textContent = b ? fmt(b) : '–';
      $('time').textContent = fmt(G.elapsed);
      $('pause').textContent = paused ? 'Resume' : 'Pause';
      $('bests').innerHTML = DIFFS.map(d => `<div>${d.name}<b>${bests[d.k] ? fmt(bests[d.k]) : '–'}</b></div>`).join('');
    }
    function anim(i, cls, ms, delay) {
      const c = cellEls[i];
      const go = () => { c.classList.remove(cls); void c.offsetWidth; c.classList.add(cls); later(() => c.classList.remove(cls), ms + 30); };
      if (delay) later(go, delay); else go();
    }
    function sndLabel() { $('snd').textContent = soundOn ? '🔊' : '🔇'; $('snd').title = soundOn ? 'Sound on' : 'Sound off'; }

    // timer: a light 500ms ticker that only counts while visible, unpaused and unfinished
    function startTicker() {
      if (ticker) return;
      lastTick = performance.now();
      ticker = setInterval(() => {
        const now = performance.now();
        if (!visible() || !G || G.done || paused || generating) { lastTick = now; return; }
        G.elapsed += (now - lastTick) / 1000; lastTick = now;
        $('time').textContent = fmt(G.elapsed);
        if (Math.floor(G.elapsed) % 10 === 0) persist();
      }, 500);
    }

    function snapshot() { return { v: G.vals.slice(), n: G.notes.slice(), sel }; }
    function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 300) undoStack.shift(); }
    function undo() {
      if (!G || G.done || paused || !undoStack.length) return;
      const s = undoStack.pop(); G.vals = s.v; G.notes = s.n; sel = s.sel; clearHint(); sfx.erase(); render(); persist();
    }

    function clearHint() { hint = null; $('hintwrap').innerHTML = ''; }
    function unitDone(u) { return UNITS[u].every(i => G.vals[i] && G.vals[i] === G.solution[i]); }

    function setValue(i, d, fromHint) {
      if (!G || G.done || paused || generating) return;
      if (G.puzzle[i]) { sfx.bad(); return; }
      if (notesMode && d && !fromHint) {
        if (G.vals[i]) return;
        pushUndo(); G.notes[i] ^= bit(d); sfx.note(); clearHintIfStale(); render(); persist(); return;
      }
      if (d === 0) {
        if (!G.vals[i] && !G.notes[i]) return;
        pushUndo(); G.vals[i] = 0; G.notes[i] = 0; sfx.erase(); clearHintIfStale(); render(); persist(); return;
      }
      if (G.vals[i] === d) return;
      pushUndo();
      const before = [];
      for (let u = 0; u < 27; u++) before.push(unitDone(u));
      G.vals[i] = d; G.notes[i] = 0;
      const right = d === G.solution[i];
      if (!right && opts.check) { G.mistakes++; sfx.bad(); }
      else sfx.place();
      if (opts.autoClean && (right || !opts.check)) for (const j of PEERS[i]) G.notes[j] &= ~bit(d);
      if (hint && hint.hl && hint.hl.target === i) clearHint(); else clearHintIfStale();
      anim(i, 'pop', 280);
      // completed units flash
      let flashed = false;
      for (const u of [ROW(i), 9 + COL(i), 18 + BOX(i)]) if (!before[u] && unitDone(u)) {
        flashed = true;
        UNITS[u].forEach((j, k) => anim(j, 'flash', 600, k * 30));
      }
      if (flashed) sfx.unit();
      render();
      if (G.vals.every((v, k) => v === G.solution[k])) win();
      else if (G.vals.every(v => v) && !opts.check) api.toast('Board is full, but something is not right yet.');
      persist();
    }
    function clearHintIfStale() { if (hint && hint.hl && G.vals[hint.hl.target]) clearHint(); }

    function fillNotes() {
      if (!G || G.done || paused) return;
      pushUndo();
      const c = candsFrom(G.vals);
      for (let i = 0; i < 81; i++) G.notes[i] = G.vals[i] ? 0 : c[i];
      sfx.note(); render(); persist();
    }

    // ---- hints ----
    function doHint() {
      if (!G || G.done || paused || generating) return;
      if (hint && hint.place) { applyHint(); return; }
      // mistakes first
      const wrong = [];
      for (let i = 0; i < 81; i++) if (G.vals[i] && G.vals[i] !== G.solution[i]) wrong.push(i);
      if (wrong.length) {
        const i = wrong.indexOf(sel) >= 0 ? sel : wrong[0];
        hint = { hl: { target: i, unit: new Set() }, place: null };
        sel = i;
        showHint('Fix a mistake', `<p>${cellName(i)} holds a <b>${G.vals[i]}</b>, which isn’t part of the solution. ${wrong.length > 1 ? 'There are ' + wrong.length + ' wrong digits on the board.' : ''} Clear it before going on.</p>`, '<button class="btn sec small" data-a="clearbad">Clear wrong digits</button>');
        G.hints++; sfx.hint(); render(); persist(); return;
      }
      const vals = G.vals.slice(), cands = candsFrom(vals);
      const pre = [];
      let st = null, guard = 0;
      while (guard++ < 60) {
        st = findStep(vals, cands, 6);
        if (!st) break;
        if (st.place) break;
        pre.push(st); applyStep(vals, cands, st);
      }
      let title, body, target, unit = new Set();
      if (!st || !st.place) {
        // beyond our logic: reveal the selected cell (or the most constrained one)
        let best = -1, bn = 10;
        if (!G.vals[sel]) best = sel;
        else for (let i = 0; i < 81; i++) if (!G.vals[i] && pc(cands[i]) < bn) { bn = pc(cands[i]); best = i; }
        target = best;
        title = 'Tough spot';
        body = `<p>No simple technique cracks the next step here (it needs advanced chains or trial and error). Here’s a free one: ${cellName(target)} is <b>${G.solution[target]}</b>.</p>`;
        hint = { hl: { target, unit }, place: [target, G.solution[target]] };
      } else {
        const [i, d] = st.place;
        target = i;
        const parts = [];
        if (pre.length) {
          const first = pre.slice(0, 3).map(explainElim);
          parts.push('<p>' + first.join(' ') + (pre.length > 3 ? ' (and ' + (pre.length - 3) + ' more eliminations of the same kind)' : '') + '</p>');
          for (const p of pre) for (const c of (p.cells || [])) unit.add(c);
        }
        if (st.kind === 'naked') {
          title = (pre.length ? TECH_NAME[pre[pre.length - 1].kind] + ' → ' : '') + 'Naked single';
          const seen = [];
          for (let k = 1; k <= 9; k++) if (k !== d) seen.push(k);
          parts.push(`<p>${pre.length ? 'That leaves ' + cellName(i) + ' with' : cellName(i) + ' has'} only one candidate: <b>${d}</b>. ${pre.length ? '' : 'Every other digit already appears in its row, column or box.'}</p>`);
          for (const j of PEERS[i]) if (G.vals[j]) unit.add(j);
        } else {
          title = (pre.length ? TECH_NAME[pre[pre.length - 1].kind] + ' → ' : '') + 'Hidden single';
          parts.push(`<p>${pre.length ? 'Now, in ' : 'In '}${unitName(st.unit)}, the digit <b>${d}</b> fits in only one cell: ${cellName(i)}. Every other open cell there already sees ${d === 8 ? 'an' : 'a'} ${d}.</p>`);
          for (const j of UNITS[st.unit]) unit.add(j);
        }
        body = parts.join('');
        hint = { hl: { target: i, unit }, place: [i, d] };
      }
      G.hints++;
      sel = target;
      showHint(title, body, '<button class="btn pri small" data-a="hintplace">Place it</button><span style="font-size:12px;color:var(--dim)">or press H again</span>');
      sfx.hint(); render(); persist();
    }
    function explainElim(s) {
      const ds = s.d;
      if (s.kind === 'pointing') return `<b>Pointing pair:</b> in box ${s.box + 1}, every ${ds} lies in ${unitName(s.line)}, so ${ds} can be removed from the rest of ${unitName(s.line)}.`;
      if (s.kind === 'claiming') return `<b>Box/line reduction:</b> in ${unitName(s.line)}, every ${ds} lies inside box ${s.box + 1}, so ${ds} can be removed from the rest of that box.`;
      if (s.kind === 'npair') return `<b>Naked pair:</b> ${s.cells.map(cellName).join(' and ')} can only be ${s.digits.join('/')}, so those digits leave the rest of ${unitName(s.unit)}.`;
      if (s.kind === 'hpair') return `<b>Hidden pair:</b> in ${unitName(s.unit)}, ${s.digits.join(' and ')} only fit in ${s.cells.map(cellName).join(' and ')}, so those cells hold nothing else.`;
      if (s.kind === 'ntriple') return `<b>Naked triple:</b> ${s.cells.map(cellName).join(', ')} share just ${s.digits.join('/')}, so those digits leave the rest of ${unitName(s.unit)}.`;
      if (s.kind === 'xwing') return `<b>X-Wing:</b> in ${unitName(s.lines[0])} and ${unitName(s.lines[1])}, ${ds} sits only in the same two ${s.lines[0] < 9 ? 'columns' : 'rows'}, so ${ds} is removed from the rest of those ${s.lines[0] < 9 ? 'columns' : 'rows'}.`;
      return '';
    }
    function showHint(title, body, actions) {
      $('hintwrap').innerHTML = `<div class="hintbox"><b class="t">${title}</b>${body}<div class="row">${actions || ''}<span class="sp"></span><button class="btn sec small" data-a="hintclose">✕</button></div></div>`;
    }
    function applyHint() {
      if (!hint || !hint.place) return;
      const [i, d] = hint.place;
      const nm = notesMode; notesMode = false;
      sel = i;
      if (G.vals[i] !== d) setValue(i, d, true);
      notesMode = nm;
      clearHint(); render();
    }

    // ---- flow ----
    function hideOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
    function showOverlay(html) { hideOverlay(); overlay = document.createElement('div'); overlay.className = 'ov'; overlay.innerHTML = html; bwrap.appendChild(overlay); }

    function newGame(diffKey) {
      if (diffKey) { opts.diff = diffKey; saveOpts(); }
      const diff = DIFFS.find(d => d.k === opts.diff) || DIFFS[1];
      generating = true; paused = false; clearHint(); undoStack = [];
      const token = ++genToken;
      showOverlay('<div class="spin"></div><p>Mule is building a ' + diff.name.toLowerCase() + ' puzzle…</p>');
      render();
      const t0 = performance.now();
      let bestA = null;
      const step = () => {
        if (token !== genToken || !inst) return;
        const sliceEnd = performance.now() + 60;
        let found = null;
        while (performance.now() < sliceEnd) {
          const a = attempt(diff);
          if (goodFor(diff, a)) { found = a; break; }
          if (!bestA || a.level > bestA.level || (a.level === bestA.level && a.given < bestA.given)) bestA = a;
        }
        if (!found && performance.now() - t0 > 2500 && bestA) found = bestA;
        if (!found) { later(step, 0); return; }
        G = { diff: diff.k, puzzle: found.puzzle, solution: found.solution, vals: found.puzzle.slice(), notes: new Array(81).fill(0), elapsed: 0, mistakes: 0, hints: 0, done: false };
        generating = false; sel = 40; notesMode = false;
        hideOverlay(); render(); persist(); lastTick = performance.now();
        for (let i = 0; i < 81; i++) if (G.puzzle[i]) anim(i, 'pop', 280, (ROW(i) + COL(i)) * 18);
      };
      later(step, 30);
    }
    function win() {
      G.done = true; clearHint();
      const t = Math.round(G.elapsed);
      const prev = bests[G.diff];
      const rec = !prev || t < prev;
      if (rec) { bests[G.diff] = t; api.save('bests', bests); }
      // tile best: the best time on the hardest difficulty solved so far
      for (let k = DIFFS.length - 1; k >= 0; k--) if (bests[DIFFS[k].k]) { api.save('best', fmt(bests[DIFFS[k].k]) + ' ' + DIFFS[k].name); break; }
      persist();
      for (let i = 0; i < 81; i++) anim(i, 'wave', 700, (ROW(i) + COL(i)) * 35);
      sfx.win();
      const dn = (DIFFS.find(d => d.k === G.diff) || DIFFS[1]).name;
      later(() => {
        showOverlay(`<h3>Solved!</h3><div class="big">${fmt(t)}</div><p>${dn} · ${G.mistakes} mistake${G.mistakes === 1 ? '' : 's'} · ${G.hints} hint${G.hints === 1 ? '' : 's'}${rec ? '<br><b style="color:var(--gold)">New best time!</b>' : prev ? '<br>Best: ' + fmt(prev) : ''}</p>
<div class="row">${DIFFS.map(d => `<button class="btn ${d.k === G.diff ? 'pri' : 'sec'} small" data-a="newd" data-diff2="${d.k}">${d.name}</button>`).join('')}</div>`);
      }, 1200);
      render();
    }
    function togglePause() {
      if (!G || G.done || generating) return;
      paused = !paused;
      if (paused) showOverlay('<h3>Paused</h3><p>The clock is stopped.</p><div class="row"><button class="btn pri small" data-a="resume">Resume</button></div>');
      else { hideOverlay(); lastTick = performance.now(); }
      render();
    }

    // ---- events ----
    function onClick(e) {
      const c = e.target.closest('.cell');
      if (c && boardEl.contains(c)) {
        if (paused || generating || !G) return;
        const i = +c.dataset.i;
        if (sel === i && !G.vals[i] && hint && hint.hl && hint.hl.target === i) { /* keep */ }
        sel = i; render(); return;
      }
      const b = e.target.closest('button'); if (!b) return;
      const r = b.getAttribute('data-r'), a = b.getAttribute('data-a');
      if (b.dataset.d != null) { setValue(sel, +b.dataset.d); return; }
      if (b.dataset.diff) {
        if (b.dataset.diff === opts.diff && G && !G.done) return;
        if (G && !G.done && G.vals.some((v, i) => v && !G.puzzle[i])) { if (!confirmSwitch(b.dataset.diff)) return; }
        newGame(b.dataset.diff); return;
      }
      if (a === 'newd') { newGame(b.dataset.diff2); return; }
      if (r === 'new') { newGame(); return; }
      if (r === 'undo') undo();
      else if (r === 'notes') { notesMode = !notesMode; sfx.note(); render(); }
      else if (r === 'fill') fillNotes();
      else if (r === 'hint') doHint();
      else if (r === 'pause' || a === 'resume') togglePause();
      else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); sndLabel(); sfx.place(); }
      else if (a === 'hintplace') applyHint();
      else if (a === 'hintclose') { clearHint(); render(); }
      else if (a === 'clearbad') {
        pushUndo();
        for (let i = 0; i < 81; i++) if (G.vals[i] && G.vals[i] !== G.solution[i]) G.vals[i] = 0;
        clearHint(); sfx.erase(); render(); persist();
      }
    }
    let pendingSwitch = null;
    function confirmSwitch(k) {
      // two-click confirm via toast to avoid losing progress by accident
      if (pendingSwitch === k) { pendingSwitch = null; return true; }
      pendingSwitch = k; api.toast('Click again to abandon this puzzle and start a new one.');
      later(() => { if (pendingSwitch === k) pendingSwitch = null; }, 3000);
      return false;
    }
    function onChange(e) {
      if (e.target === $('check')) { opts.check = e.target.checked; saveOpts(); render(); }
    }
    function onKey(e) {
      if (el.offsetParent === null || document.hidden) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.altKey || e.metaKey) return;
      const k = e.key;
      if (e.ctrlKey) { if (k === 'z' || k === 'Z') { e.preventDefault(); undo(); } return; }
      if (k === 'p' || k === 'P' || k === 'Escape') { if (k !== 'Escape' || paused) { e.preventDefault(); togglePause(); } return; }
      if (!G || generating) return;
      if (G.done || paused) { if (k === 'Enter') { e.preventDefault(); if (paused) togglePause(); else newGame(); } return; }
      let handled = true;
      const r = ROW(sel), c = COL(sel);
      if (k === 'ArrowUp') sel = ((r + 8) % 9) * 9 + c;
      else if (k === 'ArrowDown') sel = ((r + 1) % 9) * 9 + c;
      else if (k === 'ArrowLeft') sel = r * 9 + (c + 8) % 9;
      else if (k === 'ArrowRight') sel = r * 9 + (c + 1) % 9;
      else if (/^[1-9]$/.test(k)) { setValue(sel, +k); return void e.preventDefault(); }
      else if (/^Numpad[1-9]$/.test(e.code)) { setValue(sel, +e.code.slice(6)); return void e.preventDefault(); }
      else if (k === 'Backspace' || k === 'Delete' || k === '0' || k === 'x' || k === 'X') { setValue(sel, 0); return void e.preventDefault(); }
      else if (k === 'n' || k === 'N' || k === 'z' || k === 'Z') { notesMode = !notesMode; sfx.note(); }
      else if (k === 'h' || k === 'H' || k === 'c' || k === 'C') { e.preventDefault(); doHint(); return; }
      else if (k === 'u' || k === 'U') { e.preventDefault(); undo(); return; }
      else if (k === ' ' || k === 'Enter') {
        // controller-friendly: cycle the digit (or note) in the selected cell
        e.preventDefault();
        if (G.puzzle[sel]) return;
        if (hint && hint.place && hint.place[0] === sel && k === 'Enter') { applyHint(); return; }
        if (notesMode) return;
        const nv = (G.vals[sel] % 9) + 1;
        const nm = notesMode; notesMode = false;
        if (G.vals[sel] === 9) setValue(sel, 0); else setValue(sel, nv);
        notesMode = nm; return;
      }
      else handled = false;
      if (handled) { e.preventDefault(); if (k.startsWith('Arrow')) sfx.move(); render(); }
    }
    function onResize() { if (el.offsetParent === null || document.hidden) return; fit(); }
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);

    sndLabel();
    $('check').checked = !!opts.check;
    fit();
    startTicker();
    const saved = api.load('game');
    if (saved && !saved.done && saved.p && saved.p.length === 81 && saved.s && saved.v) {
      G = { diff: saved.diff || 'medium', puzzle: saved.p.split('').map(Number), solution: saved.s.split('').map(Number), vals: saved.v.split('').map(Number), notes: (saved.n || []).slice(0, 81), elapsed: saved.e || 0, mistakes: saved.m || 0, hints: saved.h || 0, done: false };
      while (G.notes.length < 81) G.notes.push(0);
      opts.diff = G.diff;
      render();
      later(() => api.toast('Resumed your ' + G.diff + ' puzzle.'), 50);
    } else newGame();

    return {
      destroy() {
        genToken++;
        root.removeEventListener('click', onClick);
        root.removeEventListener('change', onChange);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        if (ticker) { clearInterval(ticker); ticker = 0; }
        timers.forEach(clearTimeout); timers.clear();
        if (G && !G.done) persist();
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        el.innerHTML = '';
      },
      _test: {
        get G() { return G; }, get generating() { return generating; }, get hint() { return hint; },
        set sel(v) { sel = v; }, get sel() { return sel; }, setValue, doHint, newGame, undo, render,
      },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { const i = inst; inst = null; i.destroy(); this._t = null; } },
    _engine: { countSolutions, grade, attempt, DIFFS, findStep, candsFrom, goodFor },
  };
})();
