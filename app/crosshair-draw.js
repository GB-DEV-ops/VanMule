/* VanMule crosshair drawing, shared by the designer, the saved list and the on-screen crosshair window.
   A crosshair is { name, layers: [...] }. Layers draw bottom to top. Sizes are in screen pixels. */
(function () {
  const SHAPE = { type: 'shape', name: 'Crosshair', hidden: false, x: 0, y: 0, scale: 1, shape: 'cross', color: '#00ff00', opacity: 1, len: 6, thick: 2, gap: 3, rotate: 0, blur: 0,
    dot: false, dotStyle: 'square', dotColor: '', dotOpacity: 1, dotSize: 2, dotBlur: 0, outline: true, oColor: '#000000', oOpacity: 1, oThick: 1, oBlur: 0,
    ring: false, ringR: 10, ringThick: 1, anim: 'none', animSpeed: 1 };
  const IMAGE = { type: 'image', name: 'Image', hidden: false, x: 0, y: 0, scale: 1, src: '', w: 32, h: 32, opacity: 1, rotate: 0, blur: 0, anim: 'none', animSpeed: 1 };
  const TEXT = { type: 'text', name: 'Text', hidden: false, x: 0, y: 0, scale: 1, text: 'TEXT', size: 12, weight: 700, color: '#ffffff', opacity: 1, rotate: 0, blur: 0, outline: true, oColor: '#000000', oThick: 2, anim: 'none', animSpeed: 1 };
  const DEF_FOR = { shape: SHAPE, image: IMAGE, text: TEXT };
  function layer(l) { const t = (l && l.type) || 'shape'; return Object.assign({}, DEF_FOR[t] || SHAPE, l || {}, { type: t }); }
  function norm(c) {
    c = c || {};
    if (Array.isArray(c.layers)) return { name: c.name || 'Crosshair', layers: c.layers.map(layer) };
    const l = {}; for (const k of Object.keys(SHAPE)) if (k in c && k !== 'name' && k !== 'type') l[k] = c[k];
    return { name: c.name || 'Crosshair', layers: [layer(l)] };
  }
  const IMG = new Map();
  function img(src, onload) { let e = IMG.get(src); if (!e) { e = new Image(); e.onload = () => { e._ok = true; if (onload) onload(); }; e.src = src; IMG.set(src, e); } else if (!e._ok && onload) e.addEventListener('load', onload, { once: true }); return e._ok ? e : null; }
  function extent(L) { // half-size of a layer around its own center, in px
    if (L.type === 'image') return { ex: L.w / 2 * L.scale, ey: L.h / 2 * L.scale };
    if (L.type === 'text') return { ex: (L.size * Math.max(1, String(L.text).length) * 0.33 + (L.outline ? L.oThick : 0)) * L.scale, ey: (L.size * 0.62 + (L.outline ? L.oThick : 0)) * L.scale };
    let e = L.shape === 'dot' ? L.dotSize / 2 : L.shape === 'circle' ? L.gap + L.len / 2 + L.thick : L.shape === 'square' ? (L.gap + L.len / 2) * 1.42 : L.gap + L.len + 1;
    if (L.dot) e = Math.max(e, L.dotSize / 2); if (L.ring) e = Math.max(e, L.ringR + L.ringThick);
    return (e + (L.outline ? L.oThick : 0) + Math.max(L.blur, L.oBlur || 0)) * L.scale;
  }
  function bounds(c, only) { const n = norm(c); let x0 = 0, y0 = 0, x1 = 0, y1 = 0, any = false;
    n.layers.forEach((L, i) => { if (L.hidden || (only != null && i !== only)) return; const e0 = extent(L), ex = typeof e0 === 'number' ? e0 : e0.ex, ey = typeof e0 === 'number' ? e0 : e0.ey; x0 = Math.min(any ? x0 : Infinity, L.x - ex); y0 = Math.min(any ? y0 : Infinity, L.y - ey); x1 = Math.max(any ? x1 : -Infinity, L.x + ex); y1 = Math.max(any ? y1 : -Infinity, L.y + ey); any = true; });
    return any ? { x0, y0, x1, y1, w: Math.round(x1 - x0), h: Math.round(y1 - y0), r: Math.max(Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1)) } : { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0, r: 1 }; }
  const animated = (c) => norm(c).layers.some((L) => !L.hidden && L.anim && L.anim !== 'none');
  function drawShape(g, L, k) {
    const len = L.len * k, T = Math.max(1, Math.round(L.thick * k)), G = L.gap * k, O = L.outline ? Math.max(1, Math.round(L.oThick * k)) : 0, h = Math.floor(T / 2);
    const rects = [], paths = [], rings = [];
    const arms = (ds) => { for (const d of ds) { if (d === 'r') rects.push([1 + G, -h, len, T]); if (d === 'l') rects.push([-G - len, -h, len, T]); if (d === 'd') rects.push([-h, 1 + G, T, len]); if (d === 'u') rects.push([-h, -G - len, T, len]); } };
    if (L.shape === 'cross') arms(['l', 'r', 'u', 'd']);
    if (L.shape === 't') arms(['l', 'r', 'd']);
    if (L.shape === 'x') { const a = G / Math.SQRT2, b = (G + len) / Math.SQRT2; for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) paths.push([[sx * a, sy * a], [sx * b, sy * b]]); }
    if (L.shape === 'chevron') { const s = len + G; paths.push([[-s, s * 0.6], [0, 0], [s, s * 0.6]]); }
    if (L.shape === 'square') { const s = G + len / 2; paths.push([[-s, -s], [s, -s], [s, s], [-s, s], [-s, -s]]); }
    if (L.shape === 'circle') rings.push([G + len / 2, T]);
    if (L.ring) rings.push([L.ringR * k, Math.max(1, Math.round(L.ringThick * k))]);
    const stroke = (extra, col) => { g.strokeStyle = col; g.lineCap = 'butt'; g.lineJoin = 'miter';
      for (const p of paths) { g.lineWidth = T + extra; g.beginPath(); g.moveTo(p[0][0] + 0.5, p[0][1] + 0.5); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0] + 0.5, p[i][1] + 0.5); g.stroke(); }
      for (const [r, w] of rings) { g.lineWidth = w + extra; g.beginPath(); g.arc(0.5, 0.5, Math.max(1, r), 0, Math.PI * 2); g.stroke(); } };
    const dotOn = L.shape === 'dot' || L.dot, ds = Math.max(1, Math.round(L.dotSize * k));
    const dotPath = (grow) => { const s = ds + grow * 2; if (L.dotStyle === 'circle') { g.beginPath(); g.arc(0.5, 0.5, s / 2, 0, Math.PI * 2); g.fill(); } else g.fillRect(-Math.floor(ds / 2) - grow, -Math.floor(ds / 2) - grow, s, s); };
    const base = g.globalAlpha;
    if (O) { g.globalAlpha = base * L.oOpacity; g.filter = L.oBlur ? `blur(${L.oBlur * k}px)` : 'none'; g.fillStyle = L.oColor;
      for (const r of rects) g.fillRect(r[0] - O, r[1] - O, r[2] + O * 2, r[3] + O * 2); stroke(O * 2, L.oColor); if (dotOn) dotPath(O); }
    g.globalAlpha = base * L.opacity; g.filter = L.blur ? `blur(${L.blur * k}px)` : 'none'; g.fillStyle = L.color;
    for (const r of rects) g.fillRect(r[0], r[1], r[2], r[3]); stroke(0, L.color);
    if (dotOn) { g.globalAlpha = base * (L.shape === 'dot' ? L.opacity : L.dotOpacity); g.filter = L.dotBlur ? `blur(${L.dotBlur * k}px)` : 'none'; g.fillStyle = L.shape === 'dot' ? L.color : (L.dotColor || L.color); dotPath(0); }
    g.filter = 'none'; g.globalAlpha = base;
  }
  function draw(g, c, cx, cy, k, t, onload) {
    const n = norm(c); k = k || 1; t = t || 0; let pending = false;
    for (const L of n.layers) {
      if (L.hidden) continue;
      g.save(); g.translate(cx + Math.round(L.x * k), cy + Math.round(L.y * k));
      let a = 1, sc = L.scale; const sp = Math.max(0.1, L.animSpeed || 1);
      if (L.anim === 'spin') g.rotate((t * sp * 0.5 % 1) * Math.PI * 2);
      if (L.anim === 'pulse') sc *= 1 + 0.18 * Math.sin(t * sp * Math.PI * 2);
      if (L.anim === 'blink') a = Math.sin(t * sp * Math.PI * 2) > 0 ? 1 : 0.15;
      if (L.anim === 'breathe') a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * sp * Math.PI * 2));
      if (L.rotate) g.rotate(L.rotate * Math.PI / 180);
      if (sc !== 1) g.scale(sc, sc);
      g.globalAlpha = a;
      if (L.type === 'shape') drawShape(g, L, k);
      else if (L.type === 'image') { const im = L.src ? img(L.src, onload) : null; if (im) { g.globalAlpha = a * L.opacity; g.filter = L.blur ? `blur(${L.blur * k}px)` : 'none'; g.imageSmoothingEnabled = k < 2; g.drawImage(im, -L.w * k / 2, -L.h * k / 2, L.w * k, L.h * k); g.filter = 'none'; } else if (L.src) pending = true; }
      else if (L.type === 'text') { g.font = `${L.weight} ${L.size * k}px "Segoe UI", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = a * L.opacity; g.filter = L.blur ? `blur(${L.blur * k}px)` : 'none';
        if (L.outline) { g.lineWidth = L.oThick * k; g.strokeStyle = L.oColor; g.lineJoin = 'round'; g.strokeText(L.text, 0, 0); } g.fillStyle = L.color; g.fillText(L.text, 0, 0); g.filter = 'none'; }
      g.restore();
    }
    return pending;
  }
  /* VanMule share codes: VMX-<base64 of the settings>. Valorant codes import too. */
  function toCode(c) { const n = norm(c); return 'VMX-' + btoa(unescape(encodeURIComponent(JSON.stringify(n)))).replace(/=+$/, ''); }
  const VAL_COLORS = ['#ffffff', '#00ff00', '#7fff00', '#dfff00', '#ffff00', '#00ffff', '#ff00ff', '#ff0000'];
  function fromValorant(code) {
    const p = String(code).trim().split(';'); if (p.length < 3 || p[0] !== '0') return null;
    const m = {}; let sec = '';
    for (let i = 1; i < p.length; i++) { const k = p[i]; if (k === 'P' || k === 'A' || k === 'S') { sec = k; continue; } if (sec === 'P' || sec === '') m[k] = p[++i]; else i++; }
    const col = m.c === '8' && m.u ? '#' + String(m.u).slice(0, 6) : VAL_COLORS[+m.c || 0] || '#ffffff';
    const noLines = m['0b'] === '0' && m['1b'] === '0';
    const L = { shape: noLines ? 'dot' : 'cross', color: col, opacity: m['0a'] != null ? +m['0a'] : 1, len: m['0l'] != null ? +m['0l'] : 6, thick: m['0t'] != null ? +m['0t'] : 2, gap: m['0o'] != null ? +m['0o'] : 3,
      outline: m.h !== '0', oThick: m.t != null ? +m.t : 1, oOpacity: m.o != null ? +m.o : 0.5, dot: !noLines && m.d === '1', dotSize: m.z != null ? +m.z : 2, dotOpacity: m.a != null ? +m.a : 1 };
    return { name: 'Valorant crosshair', layers: [L] };
  }
  function fromCode(code) {
    code = String(code || '').trim();
    if (/^VMX-/i.test(code)) { try { return norm(JSON.parse(decodeURIComponent(escape(atob(code.slice(4)))))); } catch { return null; } }
    if (/^0;/.test(code)) { const v = fromValorant(code); return v ? norm(v) : null; }
    return null;
  }
  const api = { draw, norm, layer, bounds, animated, toCode, fromCode, SHAPE, IMAGE, TEXT };
  if (typeof window !== 'undefined') window.CrosshairDraw = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
