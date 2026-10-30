/* Shared drawing for VanMule performance overlays and widgets: text, dials, bars and graphs */
(function () {
  'use strict';
  const LBL = { fps: 'FPS', low1: '1% low', frametime: 'Frame', cpu: 'CPU', cpuTemp: 'CPU °C', gpu: 'GPU', gpuTemp: 'GPU °C', vram: 'VRAM', ram: 'RAM', gpuClock: 'GPU MHz', gpuPower: 'GPU W', fan: 'Fan', ping: 'Ping', app: 'App', time: 'Time' };
  // numeric value, max for the dial, unit, text
  function num(k, s, o) {
    o = o || {}; const gb = (b) => (b / 1073741824);
    switch (k) {
      case 'fps': return s.fps != null ? { v: s.fps, max: o.fpsMax || 165, t: String(s.fps), u: 'fps', good: 'high' } : { v: null, t: s.fpsState === 'on' ? '–' : 'off' };
      case 'low1': return s.low1 != null ? { v: s.low1, max: o.fpsMax || 165, t: String(s.low1), u: 'fps', good: 'high' } : { v: null, t: '–' };
      case 'frametime': return s.frameMs != null ? { v: s.frameMs, max: 50, t: s.frameMs.toFixed(1), u: 'ms' } : { v: null, t: '–' };
      case 'cpu': return s.cpu != null ? { v: s.cpu, max: 100, t: Math.round(s.cpu) + '%', u: '%' } : { v: null, t: '–' };
      case 'gpu': return s.gpu != null ? { v: s.gpu, max: 100, t: Math.round(s.gpu) + '%', u: '%' } : { v: null, t: '–' };
      case 'cpuTemp': return s.cpuTemp != null ? { v: s.cpuTemp, max: 100, t: s.cpuTemp + '°', u: '°C', hot: [80, 90] } : { v: null, t: '–' };
      case 'gpuTemp': return s.gpuTemp != null ? { v: s.gpuTemp, max: 100, t: s.gpuTemp + '°', u: '°C', hot: [78, 86] } : { v: null, t: '–' };
      case 'vram': return s.vramUsed != null ? { v: gb(s.vramUsed), max: s.vramTotal ? gb(s.vramTotal) : 16, t: gb(s.vramUsed).toFixed(1) + (s.vramTotal ? '/' + gb(s.vramTotal).toFixed(0) : '') + 'G', short: gb(s.vramUsed).toFixed(1), u: 'GB' } : { v: null, t: '–' };
      case 'ram': return s.ramUsed != null ? { v: gb(s.ramUsed), max: gb(s.ramTotal), t: gb(s.ramUsed).toFixed(1) + '/' + gb(s.ramTotal).toFixed(0) + 'G', short: gb(s.ramUsed).toFixed(1), u: 'GB' } : { v: null, t: '–' };
      case 'gpuClock': return s.gpuClock != null ? { v: s.gpuClock, max: 3000, t: String(s.gpuClock), u: 'MHz' } : { v: null, t: '–' };
      case 'gpuPower': return s.gpuPower != null ? { v: s.gpuPower, max: 450, t: Math.round(s.gpuPower) + 'W', short: String(Math.round(s.gpuPower)), u: 'W' } : { v: null, t: '–' };
      case 'fan': return s.fan != null ? { v: s.fan, max: 100, t: s.fan + '%', u: '%' } : { v: null, t: '–' };
      case 'ping': return s.ping != null ? { v: s.ping, max: 200, t: s.ping + 'ms', short: String(s.ping), u: 'ms', hot: [80, 150] } : { v: null, t: '–' };
      case 'app': return { v: null, t: String(s.fpsApp || s.fg || '–').replace(/\.exe$/i, '').slice(0, 18), text: true };
      case 'time': return { v: null, t: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), text: true };
    }
    return { v: null, t: '–' };
  }
  // color for a value: by load (green → yellow → red) or the fixed color
  function tint(k, n, c) {
    if (!c.byLoad || n.v == null) return c.color;
    let f = Math.min(1, n.v / (n.max || 100));
    if (n.good === 'high') f = 1 - f;
    if (n.hot) f = n.v >= n.hot[1] ? 1 : n.v >= n.hot[0] ? 0.6 : Math.min(0.4, f);
    const h = 130 - 130 * f; return `hsl(${h},85%,55%)`;
  }
  const H = {}; // history for graphs
  function push(s, items) { for (const k of items) { const n = num(k, s); if (n.v == null) continue; (H[k] = H[k] || []).push(n.v); if (H[k].length > 90) H[k].shift(); } }
  function canvas(w, h) { const c = document.createElement('canvas'), d = window.devicePixelRatio || 1; c.width = Math.ceil(w * d); c.height = Math.ceil(h * d); c.style.width = w + 'px'; c.style.height = h + 'px'; const x = c.getContext('2d'); x.scale(d, d); return [c, x]; }
  function dial(k, n, c, size) {
    const [cv, x] = canvas(size, size * 0.92), r = size / 2 - 6, cx = size / 2, cy = size / 2 + 2, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, col = tint(k, n, c);
    x.lineCap = 'round'; x.lineWidth = Math.max(4, size / 11);
    x.strokeStyle = 'rgba(255,255,255,.14)'; x.beginPath(); x.arc(cx, cy, r, a0, a1); x.stroke();
    if (n.v != null) { const f = Math.max(0, Math.min(1, n.v / (n.max || 100))); x.strokeStyle = col; x.shadowColor = col; x.shadowBlur = c.glow ? 10 : 0; x.beginPath(); x.arc(cx, cy, r, a0, a0 + (a1 - a0) * f); x.stroke(); x.shadowBlur = 0;
      if (c.needle) { const a = a0 + (a1 - a0) * f; x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); x.stroke(); x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, 3, 0, 6.283); x.fill(); } }
    x.textAlign = 'center'; x.fillStyle = c.textColor || '#fff'; x.font = `800 ${Math.round(size / 4.6)}px "JetBrains Mono",monospace`; x.fillText(n.short || n.t.replace(/[%°]$/, ''), cx, cy + (c.needle ? size / 3.2 : size / 14));
    x.font = `700 ${Math.round(size / 9.5)}px Figtree,sans-serif`; x.globalAlpha = 0.75; x.fillText(c.labels !== false ? LBL[k] : (n.u || ''), cx, cy + (c.needle ? size / 2.25 : size / 4)); x.globalAlpha = 1;
    return cv;
  }
  function bar(k, n, c, w, fs) {
    const h = Math.round(fs * 1.9), [cv, x] = canvas(w, h), col = tint(k, n, c), lw = c.labels !== false ? fs * 4.2 : 0, bw = w - lw - fs * 4.5;
    x.font = `700 ${fs}px Figtree,sans-serif`; x.fillStyle = c.textColor || '#fff'; x.globalAlpha = 0.8; if (lw) x.fillText(LBL[k], 0, h * 0.66); x.globalAlpha = 1;
    x.fillStyle = 'rgba(255,255,255,.13)'; const by = h * 0.3, bh = h * 0.42; rr(x, lw, by, bw, bh, bh / 2); x.fill();
    if (n.v != null) { x.fillStyle = col; rr(x, lw, by, Math.max(bh, bw * Math.min(1, n.v / (n.max || 100))), bh, bh / 2); x.fill(); }
    x.textAlign = 'right'; x.font = `800 ${fs}px "JetBrains Mono",monospace`; x.fillStyle = col; x.fillText(n.t, w, h * 0.68);
    return cv;
  }
  function graph(k, n, c, w, fs) {
    const h = Math.round(fs * 3.2), [cv, x] = canvas(w, h), col = tint(k, n, c), d = H[k] || [], max = Math.max(n.max || 100, ...d);
    x.fillStyle = 'rgba(255,255,255,.06)'; rr(x, 0, 0, w, h, 6); x.fill();
    if (d.length > 1) { x.beginPath(); d.forEach((v, i) => { const px = (i / 89) * w, py = h - 4 - (v / max) * (h - 10); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.strokeStyle = col; x.lineWidth = 2; x.stroke();
      x.lineTo(((d.length - 1) / 89) * w, h); x.lineTo(0, h); x.closePath(); x.globalAlpha = 0.18; x.fillStyle = col; x.fill(); x.globalAlpha = 1; }
    x.font = `700 ${Math.round(fs * 0.85)}px Figtree,sans-serif`; x.fillStyle = c.textColor || '#fff'; x.globalAlpha = 0.8; if (c.labels !== false) x.fillText(LBL[k], 6, fs); x.globalAlpha = 1;
    x.textAlign = 'right'; x.font = `800 ${fs}px "JetBrains Mono",monospace`; x.fillStyle = col; x.fillText(n.t, w - 6, fs + 1);
    return cv;
  }
  function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  // render into el. c = {style, items, color, textColor, byLoad, glow, needle, size, labels, layout, fpsMax}
  function render(el, s, c) {
    s = s || {}; const items = c.items || []; push(s, items); el.innerHTML = '';
    const style = c.style || 'text', fs = c.size || 14;
    el.style.display = 'flex'; el.style.flexWrap = c.layout === 'row' ? 'nowrap' : 'wrap'; el.style.flexDirection = style === 'text' && c.layout !== 'row' ? 'column' : c.layout === 'row' ? 'row' : (style === 'dials' ? 'row' : 'column'); el.style.gap = style === 'dials' ? '6px' : style === 'text' ? (c.layout === 'row' ? '14px' : '1px') : '6px'; el.style.alignItems = style === 'text' ? 'stretch' : 'center';
    if (style === 'dials') el.style.maxWidth = c.layout === 'row' ? 'none' : (fs * 5 + 6) * (c.cols || 3) + 'px'; else el.style.maxWidth = '';
    for (const k of items) {
      const n = num(k, s, c);
      if (style === 'text' || n.text) { const d = document.createElement('div'); d.style.cssText = `display:flex;gap:8px;justify-content:space-between;font:700 ${fs}px "JetBrains Mono",monospace;color:${tint(k, n, c)};white-space:nowrap`; d.innerHTML = (c.labels !== false ? `<span style="opacity:.7;font-weight:600;color:${c.textColor || 'inherit'}">${LBL[k]}</span>` : '') + `<span>${n.t}</span>`; el.appendChild(d); continue; }
      if (style === 'dials') el.appendChild(dial(k, n, c, fs * 5));
      else if (style === 'bars') el.appendChild(bar(k, n, c, fs * 15, fs));
      else if (style === 'graph') el.appendChild(graph(k, n, c, fs * 15, fs));
    }
  }
  window.PerfDraw = { render, num, LBL };
})();
