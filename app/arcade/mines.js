/* VanMule Arcade: Mine Field (Minesweeper). */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'mines';
  const LEVELS = {
    beginner: { r: 9, c: 9, m: 10, label: 'Beginner' },
    intermediate: { r: 16, c: 16, m: 40, label: 'Intermediate' },
    expert: { r: 16, c: 30, m: 99, label: 'Expert' },
  };
  const HIDDEN = 0, OPEN = 1, FLAG = 2, QUES = 3;

  const CSS = `
.ag-mines{font-family:var(--body);color:var(--fg);user-select:none;-webkit-user-select:none}
.ag-mines .hd{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px}
.ag-mines .ttl{flex:1;min-width:240px}
.ag-mines h2{font-family:var(--display);font-size:28px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-mines h2 span{color:var(--ember)}
.ag-mines .how{color:var(--muted);font-size:13px;margin-top:4px}
.ag-mines .bests{font-size:12px;color:var(--muted);text-align:right;line-height:1.55;font-family:var(--mono)}
.ag-mines .bests b{color:var(--gold);font-weight:500}
.ag-mines .bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.ag-mines .seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px;flex-wrap:wrap}
.ag-mines .seg button{height:28px;padding:0 10px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-mines .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-mines .sp{flex:1}
.ag-mines .tog.on{background:rgba(255,138,61,.16);border-color:var(--ember);color:var(--ember)}
.ag-mines .cust{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:13px;color:var(--muted)}
.ag-mines .cust input{width:62px;height:30px;border-radius:7px;border:1px solid var(--line);background:var(--bg);padding:0 8px;font-family:var(--mono)}
.ag-mines .box{display:inline-block;background:linear-gradient(160deg,#2b241f,#1e1916);border:1px solid var(--line);border-radius:14px;padding:10px;box-shadow:0 14px 40px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.04)}
.ag-mines .center{display:flex;justify-content:center;overflow-x:auto;padding-bottom:4px}
.ag-mines .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px}
.ag-mines .led{position:relative;background:#0a0605;border-radius:7px;padding:3px 8px;font-family:var(--mono);font-weight:700;font-size:26px;line-height:1.1;letter-spacing:2px;box-shadow:inset 0 2px 6px rgba(0,0,0,.8),0 0 0 1px #3a2c22}
.ag-mines .led .gh{color:rgba(255,90,40,.09)}
.ag-mines .led .vv{position:absolute;right:8px;top:3px;color:#ff6a2a;text-shadow:0 0 8px rgba(255,90,30,.7)}
.ag-mines .face{width:46px;height:46px;border-radius:10px;background:linear-gradient(#3d342d,#2a231e);box-shadow:inset 1px 1px 0 rgba(255,255,255,.12),inset -1px -2px 0 rgba(0,0,0,.45),0 2px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:0}
.ag-mines .face:active{box-shadow:inset 1px 2px 4px rgba(0,0,0,.6)}
.ag-mines .face svg{width:38px;height:38px;display:block}
.ag-mines .grid{display:grid;gap:0;border-radius:6px;overflow:hidden;box-shadow:0 0 0 1px #120e0c;touch-action:manipulation}
.ag-mines .grid.shake{animation:agmshake .45s}
@keyframes agmshake{20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
.ag-mines .c{width:var(--cs);height:var(--cs);position:relative;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:700;font-size:calc(var(--cs)*.58);cursor:default;
  background:linear-gradient(150deg,#4a3f36,#362e28);box-shadow:inset 2px 2px 0 rgba(255,236,214,.13),inset -2px -2px 0 rgba(0,0,0,.42),inset 0 0 0 1px rgba(0,0,0,.2)}
.ag-mines .c.h:hover{background:linear-gradient(150deg,#56493e,#3f352e)}
.ag-mines .c.pr{background:#1a1512;box-shadow:inset 0 0 0 1px rgba(255,255,255,.035)}
.ag-mines .c.o{background:#1a1512;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.06)}
.ag-mines .c.o.an{animation:agmopen .2s ease-out backwards}
@keyframes agmopen{from{background:#4a3f36;transform:scale(.55);opacity:.3}}
.ag-mines .c.n1{color:#6fb6ff}.ag-mines .c.n2{color:#4ade80}.ag-mines .c.n3{color:#ff6b6b}.ag-mines .c.n4{color:#b79cff}
.ag-mines .c.n5{color:#ff9f43}.ag-mines .c.n6{color:#6fd3c7}.ag-mines .c.n7{color:#f3ece5}.ag-mines .c.n8{color:#a3968a}
.ag-mines .c.f::before{content:"";position:absolute;left:47%;top:20%;width:2px;height:58%;background:#e6d9cc;border-radius:1px}
.ag-mines .c.f::after{content:"";position:absolute;left:calc(47% + 2px);top:20%;width:0;height:0;border-top:calc(var(--cs)*.15) solid transparent;border-bottom:calc(var(--cs)*.15) solid transparent;border-left:calc(var(--cs)*.3) solid var(--ember);filter:drop-shadow(0 0 3px rgba(255,138,61,.5))}
.ag-mines .c.f i{position:absolute;left:30%;right:30%;bottom:18%;height:2px;background:#e6d9cc;border-radius:1px}
.ag-mines .c.f.flagin::after{animation:agmflag .18s ease-out}
@keyframes agmflag{from{transform:scaleX(0);transform-origin:left}}
.ag-mines .c.q{color:var(--gold);font-size:calc(var(--cs)*.55)}
.ag-mines .c.mine::before{content:"";position:absolute;width:48%;height:48%;border-radius:50%;background:radial-gradient(circle at 35% 35%,#b9aea4,#2a2420 45%,#0a0807 75%);box-shadow:0 0 0 1px #000}
.ag-mines .c.mine::after{content:"";position:absolute;width:72%;height:72%;background:linear-gradient(#141110,#141110) center/100% 2px no-repeat,linear-gradient(#141110,#141110) center/2px 100% no-repeat;transform:rotate(45deg);z-index:-0}
.ag-mines .c.mine i{position:absolute;width:72%;height:72%;background:linear-gradient(#141110,#141110) center/100% 2px no-repeat,linear-gradient(#141110,#141110) center/2px 100% no-repeat}
.ag-mines .c.o.mine{background:#2e2622}
.ag-mines .c.boom{background:radial-gradient(circle,#ff5a52,#9c1f19)!important}
.ag-mines .c.wrong::before,.ag-mines .c.wrong::after{opacity:.35}
.ag-mines .c.wrong b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--bad);font-size:calc(var(--cs)*.75);font-family:var(--body)}
.ag-mines .msg{text-align:center;margin-top:10px;font-weight:700;min-height:22px}
.ag-mines .msg.w{color:var(--gold)} .ag-mines .msg.l{color:var(--bad)}
.ag-mines details{margin:12px auto 0;max-width:640px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:13px;color:var(--muted)}
.ag-mines summary{cursor:pointer;color:var(--fg);font-weight:600}
.ag-mines details ul{margin:6px 0 2px;padding-left:18px}
`;

  function faceSVG(state) {
    let eyes, mouth;
    if (state === 'press') {
      eyes = '<circle cx="15" cy="17" r="2.6" fill="#fff"/><circle cx="25" cy="17" r="2.6" fill="#fff"/><circle cx="15" cy="17" r="1.3" fill="#1b0d03"/><circle cx="25" cy="17" r="1.3" fill="#1b0d03"/>';
      mouth = '<ellipse cx="20" cy="31.5" rx="2.3" ry="2.8" fill="#3a1d10"/>';
    } else if (state === 'win') {
      eyes = '<path d="M9 15.2h22v1.6l-1.2 1.2c-.4 3-2.4 4.2-4.6 4.2s-3.8-1.6-4-4h-2.4c-.2 2.4-1.8 4-4 4s-4.2-1.2-4.6-4.2L9 16.8z" fill="#111"/><path d="M11.5 17h4M24.5 17h4" stroke="#6fd3c7" stroke-width="1" opacity=".7"/>';
      mouth = '<path d="M16 30.5q4 3.5 8 0" stroke="#3a1d10" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
    } else if (state === 'lose') {
      eyes = '<path d="M12.5 14.5l5 5M17.5 14.5l-5 5M22.5 14.5l5 5M27.5 14.5l-5 5" stroke="#1b0d03" stroke-width="1.7" stroke-linecap="round"/>';
      mouth = '<path d="M16 32q2-2 4 0t4 0" stroke="#3a1d10" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    } else {
      eyes = '<circle cx="15" cy="17.3" r="1.8" fill="#1b0d03"/><circle cx="25" cy="17.3" r="1.8" fill="#1b0d03"/><circle cx="15.6" cy="16.7" r=".6" fill="#fff"/><circle cx="25.6" cy="16.7" r=".6" fill="#fff"/>';
      mouth = '<path d="M16.5 30.5q3.5 2.5 7 0" stroke="#3a1d10" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    }
    return '<svg viewBox="0 0 40 40" aria-hidden="true">' +
      '<ellipse cx="11" cy="7.5" rx="3.6" ry="8" transform="rotate(-18 11 7.5)" fill="#8b6c55"/><ellipse cx="11" cy="8" rx="1.7" ry="5.5" transform="rotate(-18 11 8)" fill="#e0a487"/>' +
      '<ellipse cx="29" cy="7.5" rx="3.6" ry="8" transform="rotate(18 29 7.5)" fill="#8b6c55"/><ellipse cx="29" cy="8" rx="1.7" ry="5.5" transform="rotate(18 29 8)" fill="#e0a487"/>' +
      '<path d="M8 19c0-7 5-11 12-11s12 4 12 11c0 3-1 5-2 7l-20 0c-1-2-2-4-2-7z" fill="#9b7a61"/>' +
      '<path d="M17 8.5c1-2 5-2 6 0l-1 4h-4z" fill="#ff8a3d"/>' +
      '<ellipse cx="20" cy="29" rx="10.5" ry="8" fill="#d8bfa6"/>' +
      '<ellipse cx="16.3" cy="27" rx="1.3" ry="1" fill="#6b4a36"/><ellipse cx="23.7" cy="27" rx="1.3" ry="1" fill="#6b4a36"/>' +
      eyes + mouth + '</svg>';
  }

  let inst = null;
  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const opts = Object.assign({ level: 'beginner', custom: { r: 12, c: 20, m: 40 }, ques: false }, api.load('opts') || {});
    const bests = Object.assign({}, api.load('bests') || {});
    const stats = Object.assign({ played: 0, won: 0 }, api.load('stats') || {});
    let soundOn = api.load('sound'); if (soundOn === null) soundOn = !!api.sound;
    let actx = null;
    function tone(f, d, type, vol, f2) {
      if (!soundOn) return;
      try {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'square'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(vol || 0.04, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
      } catch (e) { /* ignore */ }
    }

    const root = document.createElement('div'); root.className = 'ag-mines';
    root.innerHTML = `
<div class="hd"><div class="ttl"><h2>Mine <span>Field</span></h2><div class="how">Clear every safe tile. Numbers count neighbouring mines. Left-click to dig, right-click to flag, click a number to clear around it.</div></div>
<div class="bests" data-r="bests"></div></div>
<div class="bar">
<button class="btn pri small" data-r="new">New game</button>
<div class="seg" data-r="lvl"><button data-v="beginner">Beginner</button><button data-v="intermediate">Intermediate</button><button data-v="expert">Expert</button><button data-v="custom">Custom</button></div>
<span class="sp"></span>
<button class="btn sec small tog" data-r="fmode" title="Flag mode: taps place flags (for touch)">🚩 Flag mode</button>
<button class="btn sec small tog" data-r="ques" title="Right-click cycles flag → ? → blank">? marks</button>
<button class="btn sec small" data-r="snd"></button></div>
<div class="cust" data-r="cust" hidden>Rows <input type="number" min="5" max="24" data-r="cr"> Columns <input type="number" min="5" max="30" data-r="cc"> Mines <input type="number" min="1" max="600" data-r="cm"> <button class="btn sec small" data-r="apply">Apply</button></div>
<div class="center"><div class="box"><div class="top"><div class="led" data-r="cnt"><span class="gh">888</span><span class="vv"></span></div>
<button class="face" data-r="face" title="New game"></button>
<div class="led" data-r="tim"><span class="gh">888</span><span class="vv"></span></div></div>
<div class="grid" data-r="grid"></div></div></div>
<div class="msg" data-r="msg"></div>
<details><summary>Tips</summary><ul>
<li>Your first click is always safe and opens up an area.</li>
<li>Chording: click a revealed number (or middle-click / press both buttons) when it has that many flags around it to open all other neighbours.</li>
<li>A "1" touching only one hidden tile means that tile is a mine. Look for 1-2-1 and 1-2-2-1 patterns along walls.</li>
<li>Flag mode makes plain clicks / taps place flags — handy on touch screens.</li></ul></details>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const grid = $('grid');

    let R, C, M, cells, nodes, state, firstClick, opened, flags, time, timerId = null, faceState = 'idle', flagMode = false, levelKey;
    let press = null; // {btn0, chord, idx}
    let pressedIdx = [];

    function setFace(s) { if (s !== faceState) { faceState = s; $('face').innerHTML = faceSVG(s); } }
    function led(r, v) { const s = v < 0 ? '-' + String(Math.min(99, -v)).padStart(2, '0') : String(Math.min(999, v)).padStart(3, '0'); $(r).querySelector('.vv').textContent = s; }
    function hud() {
      led('cnt', M - flags); led('tim', time);
      root.querySelectorAll('[data-r="lvl"] button').forEach(b => b.classList.toggle('on', b.dataset.v === opts.level));
      $('cust').hidden = opts.level !== 'custom';
      $('fmode').classList.toggle('on', flagMode);
      $('ques').classList.toggle('on', !!opts.ques);
      $('snd').textContent = soundOn ? '🔊' : '🔇';
      const f = s => (s == null ? '—' : s + 's');
      $('bests').innerHTML = 'Best &nbsp;Beg <b>' + f(bests.beginner) + '</b> · Int <b>' + f(bests.intermediate) + '</b> · Exp <b>' + f(bests.expert) + '</b><br>Won ' + stats.won + ' / ' + stats.played;
    }
    function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
    function startTimer() {
      stopTimer();
      timerId = setInterval(() => {
        if (document.hidden || el.offsetParent === null) return;
        if (state !== 'play') return stopTimer();
        time++; led('tim', time);
      }, 1000);
    }
    function sizeCells() {
      const avW = Math.max(300, (el.clientWidth || 900) - 30);
      const top = el.getBoundingClientRect().top + window.scrollY;
      const avH = Math.max(260, window.innerHeight - Math.max(0, top) - 260);
      let cs = Math.floor(Math.min(avW / C, avH / R));
      cs = Math.max(20, Math.min(34, cs));
      grid.style.setProperty('--cs', cs + 'px');
      grid.style.gridTemplateColumns = 'repeat(' + C + ',' + cs + 'px)';
    }
    function cfg() {
      if (opts.level === 'custom') {
        const cu = opts.custom; const r = Math.max(5, Math.min(24, cu.r | 0)), c = Math.max(5, Math.min(30, cu.c | 0));
        const m = Math.max(1, Math.min(r * c - 1, cu.m | 0)); return { r, c, m };
      }
      return LEVELS[opts.level] || LEVELS.beginner;
    }
    function newGame() {
      stopTimer();
      const L = cfg(); R = L.r; C = L.c; M = L.m; levelKey = opts.level;
      cells = []; for (let i = 0; i < R * C; i++) cells.push({ m: false, n: 0, s: HIDDEN });
      state = 'ready'; firstClick = true; opened = 0; flags = 0; time = 0; press = null; pressedIdx = [];
      grid.innerHTML = ''; grid.classList.remove('shake');
      const frag = document.createDocumentFragment(); nodes = [];
      for (let i = 0; i < R * C; i++) { const d = document.createElement('div'); d.className = 'c h'; d.dataset.i = i; frag.appendChild(d); nodes.push(d); }
      grid.appendChild(frag);
      sizeCells();
      setFace('idle'); $('msg').textContent = ''; $('msg').className = 'msg';
      if (opts.level === 'custom') { $('cr').value = R; $('cc').value = C; $('cm').value = M; }
      hud();
    }
    function nbrs(i) {
      const r = (i / C) | 0, c = i % C, out = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue; const y = r + dr, x = c + dc;
        if (y >= 0 && y < R && x >= 0 && x < C) out.push(y * C + x);
      }
      return out;
    }
    function placeMines(safe) {
      const excl = new Set([safe]);
      if (R * C - 9 >= M) nbrs(safe).forEach(j => excl.add(j));
      const pool = []; for (let i = 0; i < R * C; i++) if (!excl.has(i)) pool.push(i);
      for (let k = 0; k < M; k++) { const j = k + Math.floor(Math.random() * (pool.length - k)); const t = pool[k]; pool[k] = pool[j]; pool[j] = t; cells[pool[k]].m = true; }
      for (let i = 0; i < R * C; i++) cells[i].n = nbrs(i).reduce((a, j) => a + (cells[j].m ? 1 : 0), 0);
    }
    function paint(i, anim, delay) {
      const cl = cells[i], d = nodes[i];
      if (cl.s === OPEN) {
        d.className = 'c o' + (cl.n ? ' n' + cl.n : '') + (anim ? ' an' : '');
        d.textContent = cl.n ? cl.n : '';
        if (anim) d.style.animationDelay = delay + 'ms';
      } else if (cl.s === FLAG) { d.className = 'c f' + (anim ? ' flagin' : ''); d.innerHTML = '<i></i>'; }
      else if (cl.s === QUES) { d.className = 'c h q'; d.textContent = '?'; }
      else { d.className = 'c h'; d.textContent = ''; }
    }
    function reveal(i) {
      if (state === 'won' || state === 'lost') return;
      const cl = cells[i]; if (cl.s === OPEN || cl.s === FLAG) return;
      if (firstClick) {
        firstClick = false; placeMines(i); state = 'play'; startTimer();
        stats.played++; api.save('stats', stats);
      }
      if (cl.m) return lose(i);
      // BFS flood
      const q = [i], dist = new Map([[i, 0]]);
      cl.s = OPEN; opened++;
      let n = 0;
      while (q.length) {
        const j = q.shift(); const dj = dist.get(j);
        paint(j, true, Math.min(dj * 22, 420)); n++;
        if (cells[j].n === 0) for (const k of nbrs(j)) {
          const ck = cells[k];
          if (ck.s === OPEN || ck.s === FLAG || ck.m) continue;
          ck.s = OPEN; opened++; dist.set(k, dj + 1); q.push(k);
        }
      }
      tone(n > 1 ? 520 : 440, n > 1 ? 0.09 : 0.03, 'triangle', 0.035, n > 1 ? 880 : 0);
      checkWin();
    }
    function chord(i) {
      if (state !== 'play') return;
      const cl = cells[i]; if (cl.s !== OPEN || !cl.n) return;
      const ns = nbrs(i);
      const f = ns.filter(j => cells[j].s === FLAG).length;
      if (f !== cl.n) { tone(160, 0.05, 'square', 0.02); return; }
      for (const j of ns) if (cells[j].s === HIDDEN || cells[j].s === QUES) { reveal(j); if (state !== 'play') return; }
    }
    function toggleFlag(i) {
      if (state === 'won' || state === 'lost') return;
      const cl = cells[i]; if (cl.s === OPEN) return;
      if (cl.s === HIDDEN) { cl.s = FLAG; flags++; tone(660, 0.04, 'square', 0.03); }
      else if (cl.s === FLAG) { flags--; cl.s = opts.ques ? QUES : HIDDEN; tone(330, 0.04, 'square', 0.025); }
      else cl.s = HIDDEN;
      paint(i, cl.s === FLAG); hud();
    }
    function checkWin() {
      if (opened !== R * C - M || state !== 'play') return;
      state = 'won'; stopTimer();
      for (let i = 0; i < R * C; i++) if (cells[i].m && cells[i].s !== FLAG) { cells[i].s = FLAG; paint(i, true); }
      flags = M; setFace('win');
      stats.won++; api.save('stats', stats);
      let rec = '';
      if (levelKey !== 'custom' && (bests[levelKey] == null || time < bests[levelKey])) { bests[levelKey] = time; api.save('bests', bests); rec = ' New best time!'; }
      $('msg').textContent = 'Field cleared in ' + time + 's.' + rec; $('msg').className = 'msg w';
      hud();
      [523, 659, 784, 1046].forEach((f, k) => setTimeoutT(() => tone(f, 0.12, 'triangle', 0.05), k * 110));
    }
    function lose(i) {
      state = 'lost'; stopTimer(); setFace('lose');
      for (let j = 0; j < R * C; j++) {
        const cl = cells[j], d = nodes[j];
        if (cl.m && cl.s !== FLAG) { d.className = 'c o mine' + (j === i ? ' boom' : ''); d.innerHTML = '<i></i>'; }
        else if (!cl.m && cl.s === FLAG) { d.className = 'c o f wrong'; d.innerHTML = '<i></i><b>✕</b>'; }
      }
      grid.classList.add('shake');
      $('msg').textContent = 'Boom! The mule stepped on a mine.'; $('msg').className = 'msg l';
      tone(180, 0.4, 'sawtooth', 0.05, 50);
      hud();
    }
    const tmo = new Set();
    function setTimeoutT(fn, ms) { const t = setTimeout(() => { tmo.delete(t); fn(); }, ms); tmo.add(t); }

    // -------- pointer handling --------
    function cellAt(e) { const t = e.target.closest && e.target.closest('.c'); return t && grid.contains(t) ? +t.dataset.i : -1; }
    function clearPressed() { for (const j of pressedIdx) if (cells[j] && (cells[j].s === HIDDEN || cells[j].s === QUES)) nodes[j].classList.remove('pr'); pressedIdx = []; }
    function showPressed(i) {
      clearPressed(); if (i < 0 || !press || state === 'won' || state === 'lost') return;
      const list = press.chord || cells[i].s === OPEN ? [i].concat(nbrs(i)) : [i];
      for (const j of list) if (cells[j].s === HIDDEN || cells[j].s === QUES) { nodes[j].classList.add('pr'); pressedIdx.push(j); }
    }
    function onDown(e) {
      if (state === 'won' || state === 'lost') return;
      const i = cellAt(e); if (i < 0) return;
      if (e.button === 2) {
        if (e.buttons & 1) { if (press) { press.chord = true; showPressed(i); } return; }
        if (flagMode) return;
        toggleFlag(i); return;
      }
      if (e.button !== 0 && e.button !== 1) return;
      if (e.button === 1) e.preventDefault();
      press = { first: e.button, chord: e.button === 1 || (e.buttons & 3) === 3, idx: i };
      setFace('press'); showPressed(i);
    }
    function onMove(e) {
      if (!press && (e.buttons & 3) === 3 && state !== 'won' && state !== 'lost') {
        const i0 = cellAt(e); if (i0 >= 0) { press = { first: 2, chord: true, idx: -1 }; setFace('press'); }
      }
      if (!press) return;
      if ((e.buttons & 3) === 3) press.chord = true;
      const i = cellAt(e);
      if (i !== press.idx || (press.chord && !pressedIdx.length)) { press.idx = i; showPressed(i); }
    }
    function onUpWin(e) {
      if (!press) return;
      if (e.type === 'pointerup' && e.buttons) { // another button still held: keep pressing (chord in progress)
        if ((e.buttons & 3) || press.chord) { press.chord = press.chord || true; return; }
      }
      const p = press; press = null; clearPressed();
      if (state !== 'won' && state !== 'lost') setFace('idle');
      const i = e.type === 'pointerup' ? cellAt(e) : -1;
      if (i < 0) return;
      if (p.chord) { chord(i); return; }
      if (p.first === 0) {
        if (flagMode) { if (cells[i].s === OPEN) chord(i); else toggleFlag(i); return; }
        if (cells[i].s === OPEN) chord(i); else if (cells[i].s !== FLAG) reveal(i);
      }
    }
    function onCtx(e) { if (grid.contains(e.target)) e.preventDefault(); }
    function onAux(e) { if (e.button === 1 && grid.contains(e.target)) e.preventDefault(); }
    function onCancel() { press = null; clearPressed(); if (state !== 'won' && state !== 'lost') setFace('idle'); }
    function onClick(e) {
      const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      const r = b.dataset.r, par = b.parentNode.dataset.r;
      if (r === 'new' || r === 'face') newGame();
      else if (r === 'fmode') { flagMode = !flagMode; hud(); }
      else if (r === 'ques') {
        opts.ques = !opts.ques; api.save('opts', opts);
        if (!opts.ques && cells) cells.forEach((c, i) => { if (c.s === QUES) { c.s = HIDDEN; paint(i); } });
        hud();
      } else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); hud(); tone(600, 0.05); }
      else if (r === 'apply') {
        const rr = Math.max(5, Math.min(24, +$('cr').value || 9)), cc = Math.max(5, Math.min(30, +$('cc').value || 9));
        const mm = Math.max(1, Math.min(rr * cc - 1, +$('cm').value || 10));
        opts.custom = { r: rr, c: cc, m: mm }; api.save('opts', opts); newGame();
        if (mm !== +$('cm').value) api.toast('Mines clamped to ' + mm);
      } else if (par === 'lvl') { opts.level = b.dataset.v; api.save('opts', opts); newGame(); }
    }
    let rsz = null;
    function onResize() { if (rsz) return; rsz = requestAnimationFrame(() => { rsz = null; if (el.offsetParent === null || document.hidden) return; sizeCells(); }); }

    grid.addEventListener('pointerdown', onDown);
    grid.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUpWin);
    window.addEventListener('pointercancel', onCancel);
    root.addEventListener('contextmenu', onCtx);
    root.addEventListener('auxclick', onAux);
    root.addEventListener('mousedown', onAux);
    root.addEventListener('click', onClick);
    window.addEventListener('resize', onResize);
    newGame();

    return {
      destroy() {
        stopTimer(); tmo.forEach(clearTimeout); tmo.clear();
        if (rsz) cancelAnimationFrame(rsz);
        grid.removeEventListener('pointerdown', onDown);
        grid.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUpWin);
        window.removeEventListener('pointercancel', onCancel);
        root.removeEventListener('contextmenu', onCtx);
        root.removeEventListener('auxclick', onAux);
        root.removeEventListener('mousedown', onAux);
        root.removeEventListener('click', onClick);
        window.removeEventListener('resize', onResize);
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        el.innerHTML = '';
      },
      _test: {
        get info() { return { R, C, M, state, opened, flags, time, mines: cells.map((c, i) => (c.m ? i : -1)).filter(i => i >= 0), cells: cells.map(c => ({ m: c.m, n: c.n, s: c.s })) }; },
        // place mines at given indices (for deterministic tests), as if the first click happened elsewhere
        rig(mines) { M = mines.length; cells.forEach(c => { c.m = false; }); mines.forEach(i => { cells[i].m = true; }); for (let i = 0; i < R * C; i++) cells[i].n = nbrs(i).reduce((a, j) => a + (cells[j].m ? 1 : 0), 0); firstClick = false; state = 'play'; startTimer(); },
      },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { inst.destroy(); inst = null; this._t = null; } },
  };
})();
