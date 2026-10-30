/* VanMule Arcade: "Mule Gambit" - chess vs the computer with a built-in coach.
   Engine: 0x88 board, PVS alpha-beta + iterative deepening, Zobrist transposition table,
   quiescence, MVV-LVA / killer / history ordering, null-move + late-move reductions,
   tapered evaluation. The search runs in a Web Worker built from a Blob URL. */
(function () {
  'use strict';
  window.VanArcade = window.VanArcade || {};
  const ID = 'chess';

  /* =====================================================================================
     CORE (pure; stringified into the worker, also used on the UI thread)
     ===================================================================================== */
  function chessCore() {
    'use strict';
    const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
    const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8;
    const MATE = 30000, INF = 32000;
    const NDIR = [33, 31, 18, 14, -14, -18, -31, -33];
    const KDIR = [1, -1, 16, -16, 15, 17, -15, -17];
    const BDIR = [15, 17, -15, -17];
    const RDIR = [1, -1, 16, -16];
    const SQ64 = new Int32Array(64);
    for (let i = 0; i < 64; i++) SQ64[i] = (i >> 3) * 16 + (i & 7);
    const sqName = s => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
    const parseSq = n => (n.charCodeAt(0) - 97) + (n.charCodeAt(1) - 49) * 16;
    const mk = (f, t, fl, pr) => f | (t << 7) | ((pr || 0) << 14) | ((fl || 0) << 17);
    const mFrom = m => m & 127, mTo = m => (m >> 7) & 127, mPromo = m => (m >> 14) & 7, mFlags = m => m >> 17;

    /* ---- Zobrist keys (two 32-bit halves) ---- */
    let seed = 0x2545F491;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
    const ZLO = new Int32Array(16 * 128), ZHI = new Int32Array(16 * 128);
    for (let i = 0; i < ZLO.length; i++) { ZLO[i] = rnd(); ZHI[i] = rnd(); }
    const ZCLO = new Int32Array(16), ZCHI = new Int32Array(16);
    for (let i = 0; i < 16; i++) { ZCLO[i] = rnd(); ZCHI[i] = rnd(); }
    const ZELO = new Int32Array(8), ZEHI = new Int32Array(8);
    for (let i = 0; i < 8; i++) { ZELO[i] = rnd(); ZEHI[i] = rnd(); }
    const ZSLO = rnd(), ZSHI = rnd();
    // castling rights: 1 white O-O, 2 white O-O-O, 4 black O-O, 8 black O-O-O
    const CRM = new Uint8Array(128).fill(15);
    CRM[0] = 13; CRM[7] = 14; CRM[4] = 12; CRM[112] = 7; CRM[119] = 11; CRM[116] = 3;

    /* ---- Position ---- */
    const STK = 1400;
    function Position() {
      this.b = new Uint8Array(128); this.side = 0; this.castle = 0; this.ep = -1; this.half = 0; this.full = 1;
      this.ks = new Int32Array(2); this.hlo = 0; this.hhi = 0; this.sp = 0;
      this.uMove = new Int32Array(STK); this.uCap = new Uint8Array(STK); this.uCastle = new Uint8Array(STK);
      this.uEp = new Int16Array(STK); this.uHalf = new Int16Array(STK);
      this.hLo = new Int32Array(STK); this.hHi = new Int32Array(STK);
    }
    const PP = Position.prototype;
    PP.rehash = function () {
      let lo = 0, hi = 0;
      for (let i = 0; i < 64; i++) { const s = SQ64[i], p = this.b[s]; if (p) { lo ^= ZLO[p * 128 + s]; hi ^= ZHI[p * 128 + s]; } }
      lo ^= ZCLO[this.castle]; hi ^= ZCHI[this.castle];
      if (this.ep >= 0) { lo ^= ZELO[this.ep & 7]; hi ^= ZEHI[this.ep & 7]; }
      if (this.side) { lo ^= ZSLO; hi ^= ZSHI; }
      this.hlo = lo; this.hhi = hi;
    };
    PP.epUseful = function (e) {
      // can the side to move actually capture en passant on e?
      const b = this.b, own = PAWN | (this.side << 3);
      const a1 = this.side ? e + 15 : e - 15, a2 = this.side ? e + 17 : e - 17;
      return (!(a1 & 0x88) && b[a1] === own) || (!(a2 & 0x88) && b[a2] === own);
    };
    PP.setFen = function (fen) {
      const parts = String(fen).trim().split(/\s+/);
      this.b.fill(0); this.sp = 0; this.ks[0] = this.ks[1] = -1;
      let r = 7, f = 0;
      for (const ch of parts[0]) {
        if (ch === '/') { r--; f = 0; continue; }
        if (ch >= '1' && ch <= '8') { f += +ch; continue; }
        const lower = ch.toLowerCase(), t = 'pnbrqk'.indexOf(lower) + 1;
        if (t <= 0 || r < 0 || f > 7) continue;
        const black = ch === lower, s = r * 16 + f;
        this.b[s] = t | (black ? 8 : 0);
        if (t === KING) this.ks[black ? 1 : 0] = s;
        f++;
      }
      this.side = parts[1] === 'b' ? 1 : 0;
      const c = parts[2] || '-'; this.castle = 0;
      if (c.indexOf('K') >= 0 && this.b[4] === KING && this.b[7] === ROOK) this.castle |= 1;
      if (c.indexOf('Q') >= 0 && this.b[4] === KING && this.b[0] === ROOK) this.castle |= 2;
      if (c.indexOf('k') >= 0 && this.b[116] === (KING | 8) && this.b[119] === (ROOK | 8)) this.castle |= 4;
      if (c.indexOf('q') >= 0 && this.b[116] === (KING | 8) && this.b[112] === (ROOK | 8)) this.castle |= 8;
      this.ep = (parts[3] && parts[3] !== '-') ? parseSq(parts[3]) : -1;
      if (this.ep >= 0 && !this.epUseful(this.ep)) this.ep = -1;
      this.half = parseInt(parts[4] || '0', 10) || 0;
      this.full = parseInt(parts[5] || '1', 10) || 1;
      this.rehash();
      return this;
    };
    PP.fen = function () {
      let s = '';
      for (let r = 7; r >= 0; r--) {
        let e = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.b[r * 16 + f];
          if (!p) { e++; continue; }
          if (e) { s += e; e = 0; }
          const ch = ' pnbrqk'[p & 7]; s += (p & 8) ? ch : ch.toUpperCase();
        }
        if (e) s += e;
        if (r) s += '/';
      }
      let c = '';
      if (this.castle & 1) c += 'K'; if (this.castle & 2) c += 'Q'; if (this.castle & 4) c += 'k'; if (this.castle & 8) c += 'q';
      return s + ' ' + (this.side ? 'b' : 'w') + ' ' + (c || '-') + ' ' + (this.ep >= 0 ? sqName(this.ep) : '-') + ' ' + this.half + ' ' + this.full;
    };
    PP.clone = function () {
      const p = new Position();
      p.b.set(this.b); p.side = this.side; p.castle = this.castle; p.ep = this.ep; p.half = this.half; p.full = this.full;
      p.ks.set(this.ks); p.hlo = this.hlo; p.hhi = this.hhi; p.sp = this.sp;
      p.uMove.set(this.uMove); p.uCap.set(this.uCap); p.uCastle.set(this.uCastle); p.uEp.set(this.uEp); p.uHalf.set(this.uHalf);
      p.hLo.set(this.hLo); p.hHi.set(this.hHi);
      return p;
    };
    PP.attacked = function (sq, by) {
      const b = this.b;
      if (by === 0) {
        let s = sq - 15; if (!(s & 0x88) && b[s] === PAWN) return true;
        s = sq - 17; if (!(s & 0x88) && b[s] === PAWN) return true;
      } else {
        let s = sq + 15; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
        s = sq + 17; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
      }
      const c8 = by << 3, kn = KNIGHT | c8, kg = KING | c8, bi = BISHOP | c8, ro = ROOK | c8, qu = QUEEN | c8;
      for (let k = 0; k < 8; k++) { const s = sq + NDIR[k]; if (!(s & 0x88) && b[s] === kn) return true; }
      for (let k = 0; k < 8; k++) { const s = sq + KDIR[k]; if (!(s & 0x88) && b[s] === kg) return true; }
      for (let k = 0; k < 4; k++) {
        const d = BDIR[k]; let s = sq + d;
        while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === bi || p === qu) return true; break; } s += d; }
      }
      for (let k = 0; k < 4; k++) {
        const d = RDIR[k]; let s = sq + d;
        while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === ro || p === qu) return true; break; } s += d; }
      }
      return false;
    };
    PP.inCheck = function () { return this.attacked(this.ks[this.side], this.side ^ 1); };
    // pseudo-legal move generation into mv[n..]; returns the new n
    PP.gen = function (mv, n, caps) {
      const b = this.b, us = this.side, them = us ^ 1;
      for (let i = 0; i < 64; i++) {
        const s = SQ64[i], p = b[s];
        if (!p || (p >> 3) !== us) continue;
        const t = p & 7;
        if (t === PAWN) {
          const fw = us ? -16 : 16, r = s >> 4, last = us ? 1 : 6, start = us ? 6 : 1, t1 = s + fw;
          if (!b[t1]) {
            if (r === last) {
              mv[n++] = mk(s, t1, 0, QUEEN);
              if (!caps) { mv[n++] = mk(s, t1, 0, ROOK); mv[n++] = mk(s, t1, 0, BISHOP); mv[n++] = mk(s, t1, 0, KNIGHT); }
            } else if (!caps) {
              mv[n++] = mk(s, t1, 0, 0);
              if (r === start && !b[t1 + fw]) mv[n++] = mk(s, t1 + fw, F_DOUBLE, 0);
            }
          }
          for (let k = -1; k <= 1; k += 2) {
            const t2 = t1 + k;
            if (t2 & 0x88) continue;
            const q = b[t2];
            if (q && (q >> 3) === them) {
              if (r === last) { mv[n++] = mk(s, t2, F_CAP, QUEEN); mv[n++] = mk(s, t2, F_CAP, ROOK); mv[n++] = mk(s, t2, F_CAP, BISHOP); mv[n++] = mk(s, t2, F_CAP, KNIGHT); }
              else mv[n++] = mk(s, t2, F_CAP, 0);
            } else if (t2 === this.ep) mv[n++] = mk(s, t2, F_CAP | F_EP, 0);
          }
        } else if (t === KNIGHT || t === KING) {
          const D = t === KNIGHT ? NDIR : KDIR;
          for (let k = 0; k < 8; k++) {
            const t2 = s + D[k];
            if (t2 & 0x88) continue;
            const q = b[t2];
            if (!q) { if (!caps) mv[n++] = mk(s, t2, 0, 0); } else if ((q >> 3) === them) mv[n++] = mk(s, t2, F_CAP, 0);
          }
          if (t === KING && !caps) {
            if (us === 0 && s === 4) {
              if ((this.castle & 1) && !b[5] && !b[6] && b[7] === ROOK && !this.attacked(4, 1) && !this.attacked(5, 1)) mv[n++] = mk(4, 6, F_CASTLE, 0);
              if ((this.castle & 2) && !b[3] && !b[2] && !b[1] && b[0] === ROOK && !this.attacked(4, 1) && !this.attacked(3, 1)) mv[n++] = mk(4, 2, F_CASTLE, 0);
            } else if (us === 1 && s === 116) {
              if ((this.castle & 4) && !b[117] && !b[118] && b[119] === (ROOK | 8) && !this.attacked(116, 0) && !this.attacked(117, 0)) mv[n++] = mk(116, 118, F_CASTLE, 0);
              if ((this.castle & 8) && !b[115] && !b[114] && !b[113] && b[112] === (ROOK | 8) && !this.attacked(116, 0) && !this.attacked(115, 0)) mv[n++] = mk(116, 114, F_CASTLE, 0);
            }
          }
        } else {
          const D = t === BISHOP ? BDIR : t === ROOK ? RDIR : KDIR;
          for (let k = 0; k < D.length; k++) {
            const d = D[k]; let t2 = s + d;
            while (!(t2 & 0x88)) {
              const q = b[t2];
              if (!q) { if (!caps) mv[n++] = mk(s, t2, 0, 0); }
              else { if ((q >> 3) === them) mv[n++] = mk(s, t2, F_CAP, 0); break; }
              t2 += d;
            }
          }
        }
      }
      return n;
    };
    // returns false (and leaves the position unchanged) if the move leaves the mover in check
    PP.make = function (m) {
      const b = this.b, us = this.side, them = us ^ 1, i = this.sp;
      const from = m & 127, to = (m >> 7) & 127, pr = (m >> 14) & 7, fl = m >> 17;
      const pc = b[from];
      let lo = this.hlo, hi = this.hhi;
      this.uMove[i] = m; this.uCastle[i] = this.castle; this.uEp[i] = this.ep; this.uHalf[i] = this.half;
      this.hLo[i] = lo; this.hHi[i] = hi;
      if (this.ep >= 0) { lo ^= ZELO[this.ep & 7]; hi ^= ZEHI[this.ep & 7]; }
      lo ^= ZCLO[this.castle]; hi ^= ZCHI[this.castle];
      let cap = 0;
      if (fl & F_EP) {
        const cs = us ? to + 16 : to - 16;
        cap = b[cs]; b[cs] = 0; lo ^= ZLO[cap * 128 + cs]; hi ^= ZHI[cap * 128 + cs];
      } else if ((cap = b[to])) { lo ^= ZLO[cap * 128 + to]; hi ^= ZHI[cap * 128 + to]; }
      this.uCap[i] = cap;
      const np = pr ? (pr | (us << 3)) : pc;
      b[from] = 0; b[to] = np;
      lo ^= ZLO[pc * 128 + from] ^ ZLO[np * 128 + to]; hi ^= ZHI[pc * 128 + from] ^ ZHI[np * 128 + to];
      if (fl & F_CASTLE) {
        let rf, rt;
        if (to > from) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
        const rk = b[rf]; b[rf] = 0; b[rt] = rk;
        lo ^= ZLO[rk * 128 + rf] ^ ZLO[rk * 128 + rt]; hi ^= ZHI[rk * 128 + rf] ^ ZHI[rk * 128 + rt];
      }
      if ((pc & 7) === KING) this.ks[us] = to;
      this.castle &= CRM[from] & CRM[to];
      lo ^= ZCLO[this.castle]; hi ^= ZCHI[this.castle];
      this.ep = -1;
      if (fl & F_DOUBLE) {
        const e = (from + to) >> 1, ep = PAWN | (them << 3), a = to - 1, c = to + 1;
        if ((!(a & 0x88) && b[a] === ep) || (!(c & 0x88) && b[c] === ep)) { this.ep = e; lo ^= ZELO[e & 7]; hi ^= ZEHI[e & 7]; }
      }
      this.half = ((pc & 7) === PAWN || cap) ? 0 : this.half + 1;
      if (us) this.full++;
      this.side = them; lo ^= ZSLO; hi ^= ZSHI;
      this.hlo = lo; this.hhi = hi; this.sp = i + 1;
      if (this.attacked(this.ks[us], them)) { this.unmake(); return false; }
      return true;
    };
    PP.unmake = function () {
      const i = --this.sp, m = this.uMove[i], b = this.b;
      const from = m & 127, to = (m >> 7) & 127, pr = (m >> 14) & 7, fl = m >> 17;
      this.side ^= 1;
      const us = this.side, pc = pr ? (PAWN | (us << 3)) : b[to], cap = this.uCap[i];
      b[from] = pc; b[to] = 0;
      if (fl & F_EP) b[us ? to + 16 : to - 16] = cap; else b[to] = cap;
      if (fl & F_CASTLE) {
        if (to > from) { b[from + 3] = b[from + 1]; b[from + 1] = 0; } else { b[from - 4] = b[from - 1]; b[from - 1] = 0; }
      }
      if ((pc & 7) === KING) this.ks[us] = from;
      this.castle = this.uCastle[i]; this.ep = this.uEp[i]; this.half = this.uHalf[i];
      this.hlo = this.hLo[i]; this.hhi = this.hHi[i];
      if (us) this.full--;
    };
    PP.makeNull = function () {
      const i = this.sp;
      this.uMove[i] = 0; this.uCastle[i] = this.castle; this.uEp[i] = this.ep; this.uHalf[i] = this.half;
      this.hLo[i] = this.hlo; this.hHi[i] = this.hhi;
      let lo = this.hlo, hi = this.hhi;
      if (this.ep >= 0) { lo ^= ZELO[this.ep & 7]; hi ^= ZEHI[this.ep & 7]; }
      this.ep = -1; this.half = 0; this.side ^= 1; lo ^= ZSLO; hi ^= ZSHI;
      this.hlo = lo; this.hhi = hi; this.sp = i + 1;
    };
    PP.unmakeNull = function () {
      const i = --this.sp;
      this.side ^= 1; this.ep = this.uEp[i]; this.half = this.uHalf[i]; this.hlo = this.hLo[i]; this.hhi = this.hHi[i];
    };
    const GBUF = new Int32Array(256);
    PP.legal = function () {
      const n = this.gen(GBUF, 0, false), tmp = Array.from(GBUF.subarray(0, n)), out = [];
      for (let i = 0; i < n; i++) { const m = tmp[i]; if (this.make(m)) { this.unmake(); out.push(m); } }
      return out;
    };
    // how many times the current position occurred before (same side to move, since last irreversible move)
    PP.repCount = function () {
      let c = 0;
      for (let i = this.sp - 2; i >= 0 && i >= this.sp - this.half; i -= 2) if (this.hLo[i] === this.hlo && this.hHi[i] === this.hhi) c++;
      return c;
    };
    PP.insufficient = function () {
      let minors = 0, bishops = 0, colors = 0;
      for (let i = 0; i < 64; i++) {
        const s = SQ64[i], p = this.b[s];
        if (!p) continue;
        const t = p & 7;
        if (t === KING) continue;
        if (t === PAWN || t === ROOK || t === QUEEN) return false;
        minors++;
        if (t === BISHOP) { bishops++; colors |= 1 << (((s >> 4) + (s & 7)) & 1); }
      }
      if (minors <= 1) return true;
      return bishops === minors && colors !== 3;
    };

    /* ---- notation ---- */
    function toUci(m) { return sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? ' pnbrqk'[mPromo(m)] : ''); }
    function parseUci(pos, u) {
      if (!u || u.length < 4) return 0;
      const f = parseSq(u.slice(0, 2)), t = parseSq(u.slice(2, 4)), pr = u.length > 4 ? 'pnbrqk'.indexOf(u[4]) + 1 : 0;
      for (const m of pos.legal()) if (mFrom(m) === f && mTo(m) === t && mPromo(m) === pr) return m;
      return 0;
    }
    function san(pos, m, legal, noCheck) {
      legal = legal || pos.legal();
      const from = mFrom(m), to = mTo(m), pr = mPromo(m), fl = mFlags(m), p = pos.b[from], t = p & 7;
      let s;
      if (fl & F_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
      else if (t === PAWN) {
        s = (fl & F_CAP) ? 'abcdefgh'[from & 7] + 'x' + sqName(to) : sqName(to);
        if (pr) s += '=' + ' PNBRQK'[pr];
      } else {
        s = ' PNBRQK'[t];
        let amb = false, sameFile = false, sameRank = false;
        for (const o of legal) {
          const of = mFrom(o);
          if (o === m || of === from || mTo(o) !== to || pos.b[of] !== p) continue;
          amb = true;
          if ((of & 7) === (from & 7)) sameFile = true;
          if ((of >> 4) === (from >> 4)) sameRank = true;
        }
        if (amb) s += !sameFile ? 'abcdefgh'[from & 7] : !sameRank ? String((from >> 4) + 1) : sqName(from);
        if (fl & F_CAP) s += 'x';
        s += sqName(to);
      }
      if (!noCheck) { pos.make(m); if (pos.inCheck()) s += pos.legal().length ? '+' : '#'; pos.unmake(); }
      return s;
    }
    function parseSan(pos, str) {
      const clean = String(str).replace(/[+#!?]/g, '').replace(/0/g, 'O');
      const legal = pos.legal();
      for (const m of legal) if (san(pos, m, legal, true) === clean) return m;
      return 0;
    }
    function perft(pos, d) {
      if (d === 0) return 1;
      const buf = new Int32Array(256), n = pos.gen(buf, 0, false);
      let c = 0;
      for (let i = 0; i < n; i++) if (pos.make(buf[i])) { c += d === 1 ? 1 : perft(pos, d - 1); pos.unmake(); }
      return c;
    }

    /* ---- evaluation ---- */
    const VMG = [0, 88, 320, 335, 480, 960, 0], VEG = [0, 112, 295, 320, 525, 950, 0];
    const PHW = [0, 0, 1, 1, 2, 4, 0];
    // piece-square tables from White's point of view, rank 8 first (as on a diagram)
    const T_PM = [
      0, 0, 0, 0, 0, 0, 0, 0,
      45, 50, 50, 55, 55, 50, 50, 45,
      10, 12, 20, 30, 30, 20, 12, 10,
      4, 6, 12, 25, 25, 12, 6, 4,
      0, 0, 8, 22, 22, 6, 0, 0,
      4, -2, -6, 4, 4, -8, -2, 4,
      4, 8, 8, -18, -18, 10, 10, 4,
      0, 0, 0, 0, 0, 0, 0, 0];
    const T_PE = [
      0, 0, 0, 0, 0, 0, 0, 0,
      70, 70, 65, 60, 60, 65, 70, 70,
      38, 36, 32, 28, 28, 32, 36, 38,
      18, 16, 12, 10, 10, 12, 16, 18,
      8, 6, 4, 2, 2, 4, 6, 8,
      2, 0, 0, 0, 0, 0, 0, 2,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0];
    const T_N = [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -30, 5, 12, 18, 18, 12, 5, -30,
      -30, 5, 18, 24, 24, 18, 5, -30,
      -30, 0, 16, 22, 22, 16, 0, -30,
      -30, 5, 12, 12, 12, 12, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -35, -30, -30, -30, -30, -35, -50];
    const T_B = [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 8, 0, 0, 0, 0, 8, -10,
      -20, -10, -12, -10, -10, -12, -10, -20];
    const T_R = [
      0, 0, 0, 0, 0, 0, 0, 0,
      10, 15, 15, 15, 15, 15, 15, 10,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -4, -2, 2, 7, 7, 4, -2, -4];
    const T_Q = [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20];
    const T_KM = [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      12, 12, -6, -12, -12, -6, 12, 12,
      18, 32, 10, -12, 0, -10, 36, 20];
    const T_KE = [
      -50, -30, -20, -20, -20, -20, -30, -50,
      -30, -10, 0, 10, 10, 0, -10, -30,
      -20, 0, 20, 30, 30, 20, 0, -20,
      -20, 5, 30, 40, 40, 30, 5, -20,
      -20, 5, 30, 40, 40, 30, 5, -20,
      -20, 0, 20, 30, 30, 20, 0, -20,
      -30, -20, 0, 0, 0, 0, -20, -30,
      -50, -40, -30, -20, -20, -30, -40, -50];
    const PMG = new Int16Array(16 * 128), PEG = new Int16Array(16 * 128);
    (function () {
      const tm = [null, T_PM, T_N, T_B, T_R, T_Q, T_KM], te = [null, T_PE, T_N, T_B, T_R, T_Q, T_KE];
      for (let t = 1; t <= 6; t++) for (let i = 0; i < 64; i++) {
        const s = SQ64[i], r = s >> 4, f = s & 7, iw = (7 - r) * 8 + f, ib = r * 8 + f;
        PMG[t * 128 + s] = VMG[t] + tm[t][iw]; PEG[t * 128 + s] = VEG[t] + te[t][iw];
        PMG[(t | 8) * 128 + s] = VMG[t] + tm[t][ib]; PEG[(t | 8) * 128 + s] = VEG[t] + te[t][ib];
      }
    })();
    const PC = new Int8Array(16), RMIN = new Int8Array(16);
    const PATT = new Uint8Array(128), ZONE = new Uint8Array(128);
    const PASS_MG = [0, 5, 8, 14, 28, 50, 80, 0], PASS_EG = [0, 12, 18, 32, 56, 95, 145, 0];
    const ATTW = [0, 0, 2, 2, 3, 5, 0];
    const SAFETY = []; for (let i = 0; i <= 40; i++) SAFETY.push(Math.min(420, Math.round(i * i * 1.5)));
    const kdist = (a, b) => Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 4) - (b >> 4)));
    const cdist = s => Math.max(3 - (s & 7), (s & 7) - 4, 3 - (s >> 4), (s >> 4) - 4);
    function kingShield(c, k) {
      const f = k & 7, r = c ? 7 - (k >> 4) : (k >> 4);
      if (r > 1) return -22;
      let pen = 0;
      if (f === 3 || f === 4) {
        for (let ff = 2; ff <= 5; ff++) if (!PC[c * 8 + ff]) pen -= 12;
        return pen;
      }
      for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
        const k2 = c * 8 + ff;
        if (!PC[k2]) { pen -= 26; if (!PC[(c ^ 1) * 8 + ff]) pen -= 14; }
        else { const rm = RMIN[k2]; if (rm === 2) pen -= 9; else if (rm > 2) pen -= 20; }
      }
      return pen;
    }
    // static evaluation from the side to move's point of view (centipawns)
    function evaluate(pos) {
      const b = pos.b;
      PC.fill(0); RMIN.fill(8); PATT.fill(0); ZONE.fill(0);
      let mg = 0, eg = 0, phase = 0, bW = 0, bB = 0, npW = 0, npB = 0, pW = 0, pB = 0, qW = 0, qB = 0;
      for (let i = 0; i < 64; i++) {
        const s = SQ64[i], p = b[s];
        if (!p) continue;
        const t = p & 7;
        if (p < 8) { mg += PMG[p * 128 + s]; eg += PEG[p * 128 + s]; } else { mg -= PMG[p * 128 + s]; eg -= PEG[p * 128 + s]; }
        phase += PHW[t];
        if (t === PAWN) {
          const c = p >> 3, f = s & 7, rr = c ? 7 - (s >> 4) : (s >> 4), k = c * 8 + f;
          PC[k]++; if (rr < RMIN[k]) RMIN[k] = rr;
          if (!c) { pW++; if (!((s + 15) & 0x88)) PATT[s + 15] |= 1; if (!((s + 17) & 0x88)) PATT[s + 17] |= 1; }
          else { pB++; if (!((s - 15) & 0x88)) PATT[s - 15] |= 2; if (!((s - 17) & 0x88)) PATT[s - 17] |= 2; }
        } else if (t !== KING) {
          if (p < 8) { npW += VMG[t]; if (t === BISHOP) bW++; else if (t === QUEEN) qW++; }
          else { npB += VMG[t]; if (t === BISHOP) bB++; else if (t === QUEEN) qB++; }
        }
      }
      if (bW >= 2) { mg += 28; eg += 48; }
      if (bB >= 2) { mg -= 28; eg -= 48; }
      const wk = pos.ks[0], bk = pos.ks[1];
      ZONE[bk] |= 1; ZONE[wk] |= 2;
      for (let k = 0; k < 8; k++) {
        let z = bk + KDIR[k]; if (!(z & 0x88)) ZONE[z] |= 1;
        z = wk + KDIR[k]; if (!(z & 0x88)) ZONE[z] |= 2;
      }
      let aU0 = 0, aN0 = 0, aU1 = 0, aN1 = 0;
      for (let i = 0; i < 64; i++) {
        const s = SQ64[i], p = b[s];
        if (!p) continue;
        const t = p & 7;
        if (t === KING) continue;
        const c = p >> 3, sg = c ? -1 : 1, f = s & 7, r = s >> 4, rr = c ? 7 - r : r, e = c ^ 1, ek = e * 8;
        if (t === PAWN) {
          if ((f === 0 || !PC[c * 8 + f - 1]) && (f === 7 || !PC[c * 8 + f + 1])) { mg -= sg * 12; eg -= sg * 16; }
          const need = 7 - rr;
          if (RMIN[ek + f] >= need && (f === 0 || RMIN[ek + f - 1] >= need) && (f === 7 || RMIN[ek + f + 1] >= need)) {
            mg += sg * PASS_MG[rr];
            let pe = PASS_EG[rr];
            const fwd = c ? s - 16 : s + 16;
            if (b[fwd]) pe = (pe * 2 / 3) | 0;
            const ownK = c ? bk : wk, oppK = c ? wk : bk;
            if (rr > 2) pe += (kdist(oppK, fwd) * 5 - kdist(ownK, fwd) * 2) * (rr - 2);
            eg += sg * pe;
          }
          if (PATT[s] & (c ? 2 : 1)) { mg += sg * 6; eg += sg * 8; }
          continue;
        }
        const ebit = c ? 1 : 2, zbit = c ? 2 : 1;
        let mob = 0, za = 0;
        if (t === KNIGHT) {
          for (let k = 0; k < 8; k++) {
            const d = s + NDIR[k];
            if (d & 0x88) continue;
            const q = b[d];
            if (q && (q >> 3) === c) continue;
            if (ZONE[d] & zbit) za++;
            if (!(PATT[d] & ebit)) mob++;
          }
          mg += sg * (mob - 4) * 4; eg += sg * (mob - 4) * 4;
          if (rr >= 3 && rr <= 5 && (PATT[s] & (c ? 2 : 1))) {
            const need = 7 - rr;
            if ((f === 0 || RMIN[ek + f - 1] >= need) && (f === 7 || RMIN[ek + f + 1] >= need)) { mg += sg * 22; eg += sg * 10; }
          }
        } else {
          const D = t === BISHOP ? BDIR : t === ROOK ? RDIR : KDIR;
          for (let k = 0; k < D.length; k++) {
            const dd = D[k]; let d = s + dd;
            while (!(d & 0x88)) {
              const q = b[d];
              if (ZONE[d] & zbit) za++;
              if (!q) { if (t === QUEEN || !(PATT[d] & ebit)) mob++; }
              else { if ((q >> 3) !== c) mob++; break; }
              d += dd;
            }
          }
          if (t === BISHOP) { mg += sg * (mob - 6) * 4; eg += sg * (mob - 6) * 5; }
          else if (t === ROOK) {
            mg += sg * (mob - 6) * 2; eg += sg * (mob - 6) * 4;
            if (!PC[c * 8 + f]) { if (!PC[ek + f]) { mg += sg * 26; eg += sg * 12; } else { mg += sg * 12; eg += sg * 6; } }
            if (rr === 6) {
              const ekr = c ? 7 - (wk >> 4) : (bk >> 4);
              if (ekr === 7) { mg += sg * 18; eg += sg * 28; }
            }
          } else { mg += sg * (mob - 12); eg += sg * (mob - 12) * 2; }
        }
        if (za) { if (!c) { aN0++; aU0 += ATTW[t] + za - 1; } else { aN1++; aU1 += ATTW[t] + za - 1; } }
      }
      for (let f = 0; f < 8; f++) {
        if (PC[f] > 1) { mg -= 10 * (PC[f] - 1); eg -= 20 * (PC[f] - 1); }
        if (PC[8 + f] > 1) { mg += 10 * (PC[8 + f] - 1); eg += 20 * (PC[8 + f] - 1); }
      }
      mg += kingShield(0, wk) - kingShield(1, bk);
      if (aN0 >= 2) mg += qW ? SAFETY[Math.min(aU0, 40)] : SAFETY[Math.min(aU0, 40)] >> 1;
      if (aN1 >= 2) mg -= qB ? SAFETY[Math.min(aU1, 40)] : SAFETY[Math.min(aU1, 40)] >> 1;
      const ph = phase > 24 ? 24 : phase;
      let sc = ((mg * ph + eg * (24 - ph)) / 24) | 0;
      if (sc > 0 && pW === 0 && npW - npB < 400) sc = (sc / 4) | 0;
      if (sc < 0 && pB === 0 && npB - npW < 400) sc = (sc / 4) | 0;
      // mop-up: drive a bare king to the edge
      if (pB === 0 && npB === 0 && npW >= 480) sc += cdist(bk) * 12 + (14 - kdist(wk, bk) * 2) * 4;
      if (pW === 0 && npW === 0 && npB >= 480) sc -= cdist(wk) * 12 + (14 - kdist(wk, bk) * 2) * 4;
      return (pos.side ? -sc : sc) + 10;
    }

    /* ---- search ---- */
    function makeSearcher() {
      const TTB = 20, TTN = 1 << TTB, TTM = TTN - 1;
      const tKey = new Int32Array(TTN), tMove = new Int32Array(TTN), tScore = new Int16Array(TTN), tDepth = new Int8Array(TTN), tFlag = new Uint8Array(TTN);
      const MAXP = 64, W = MAXP + 1;
      const killers = new Int32Array(MAXP * 2), hist = new Int32Array(16 * 128);
      const pvLen = new Int32Array(W), pvT = new Int32Array(W * W);
      const mb = new Int32Array(MAXP * 256), sb = new Int32Array(MAXP * 256);
      let pos = null, nodes = 0, deadline = 0, stopped = false, canStop = false;
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      function clear() { tKey.fill(0); tMove.fill(0); tDepth.fill(0); tFlag.fill(0); hist.fill(0); killers.fill(0); }
      function isRep() {
        const p = pos;
        for (let i = p.sp - 2, lim = p.sp - p.half; i >= 0 && i >= lim; i -= 2) if (p.hLo[i] === p.hlo && p.hHi[i] === p.hhi) return true;
        return false;
      }
      function hasPieces(side) {
        const b = pos.b;
        for (let i = 0; i < 64; i++) { const p = b[SQ64[i]]; if (p && (p >> 3) === side) { const t = p & 7; if (t !== PAWN && t !== KING) return true; } }
        return false;
      }
      function scoreMoves(base, end, ttMv, ply) {
        const b = pos.b, k1 = killers[ply * 2], k2 = killers[ply * 2 + 1];
        for (let i = base; i < end; i++) {
          const m = mb[i];
          let s;
          if (m === ttMv) s = 3000000;
          else {
            const fl = m >> 17, pr = (m >> 14) & 7;
            if (fl & F_CAP) { const v = (fl & F_EP) ? PAWN : (b[(m >> 7) & 127] & 7); s = 1000000 + v * 100 - (b[m & 127] & 7) + pr * 10; }
            else if (pr) s = 900000 + pr;
            else if (m === k1) s = 800000;
            else if (m === k2) s = 790000;
            else s = hist[b[m & 127] * 128 + ((m >> 7) & 127)];
          }
          sb[i] = s;
        }
      }
      function pick(i, end) {
        let bi = i, bs = sb[i];
        for (let j = i + 1; j < end; j++) if (sb[j] > bs) { bs = sb[j]; bi = j; }
        if (bi !== i) { const tm = mb[i]; mb[i] = mb[bi]; mb[bi] = tm; const ts = sb[i]; sb[i] = sb[bi]; sb[bi] = ts; }
        return mb[i];
      }
      function ttStore(depth, flag, score, mv, ply) {
        const i = pos.hlo & TTM;
        if (tKey[i] !== pos.hhi || depth >= tDepth[i] || flag === 1) {
          if (score > MATE - 500) score += ply; else if (score < -MATE + 500) score -= ply;
          tKey[i] = pos.hhi; tMove[i] = mv; tScore[i] = score; tDepth[i] = depth; tFlag[i] = flag;
        }
      }
      function quiesce(alpha, beta, ply) {
        pvLen[ply] = ply;
        if ((++nodes & 2047) === 0 && canStop && now() > deadline) stopped = true;
        if (stopped) return 0;
        const stand = evaluate(pos);
        if (ply >= MAXP - 1) return stand;
        if (stand >= beta) return stand;
        if (stand > alpha) alpha = stand;
        const base = ply * 256, end = pos.gen(mb, base, true), b = pos.b;
        scoreMoves(base, end, 0, ply);
        for (let i = base; i < end; i++) {
          const m = pick(i, end), fl = m >> 17;
          if ((fl & F_CAP) && !((m >> 14) & 7)) {
            const v = (fl & F_EP) ? PAWN : (b[(m >> 7) & 127] & 7);
            if (stand + VEG[v] + 180 < alpha) continue;
          }
          if (!pos.make(m)) continue;
          const s = -quiesce(-beta, -alpha, ply + 1);
          pos.unmake();
          if (stopped) return 0;
          if (s > alpha) { alpha = s; if (s >= beta) return s; }
        }
        return alpha;
      }
      function negamax(depth, alpha, beta, ply, canNull) {
        pvLen[ply] = ply;
        if (pos.half >= 100 || isRep()) return 0;
        const mA = MATE - ply; if (mA < beta) { beta = mA; if (alpha >= beta) return beta; }
        const mB = -MATE + ply; if (mB > alpha) { alpha = mB; if (alpha >= beta) return alpha; }
        const inC = pos.inCheck();
        if (inC) depth++;
        if (depth <= 0) return quiesce(alpha, beta, ply);
        if (ply >= MAXP - 2) return evaluate(pos);
        if ((++nodes & 2047) === 0 && canStop && now() > deadline) stopped = true;
        if (stopped) return 0;
        const pvNode = beta - alpha > 1;
        const ti = pos.hlo & TTM;
        let ttMv = 0;
        if (tFlag[ti] && tKey[ti] === pos.hhi) {
          ttMv = tMove[ti];
          if (!pvNode && tDepth[ti] >= depth) {
            let s = tScore[ti];
            if (s > MATE - 500) s -= ply; else if (s < -MATE + 500) s += ply;
            const f = tFlag[ti];
            if (f === 1 || (f === 2 && s >= beta) || (f === 3 && s <= alpha)) return s;
          }
        }
        let ev = 0;
        const prune = !inC && !pvNode;
        if (prune) {
          ev = evaluate(pos);
          if (depth <= 3 && ev - 100 * depth >= beta && Math.abs(beta) < MATE - 500) return ev;
          if (canNull && depth >= 3 && ev >= beta && hasPieces(pos.side)) {
            const R = depth > 6 ? 3 : 2;
            pos.makeNull();
            const s = -negamax(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
            pos.unmakeNull();
            if (stopped) return 0;
            if (s >= beta) return s > MATE - 500 ? beta : s;
          }
        }
        const base = ply * 256, end = pos.gen(mb, base, false);
        scoreMoves(base, end, ttMv, ply);
        const a0 = alpha, futile = prune && depth <= 2 && ev + (depth === 1 ? 150 : 330) <= alpha;
        let legal = 0, best = -INF, bestMv = 0;
        for (let i = base; i < end; i++) {
          const m = pick(i, end);
          if (!pos.make(m)) continue;
          legal++;
          const fl = m >> 17, quiet = !(fl & F_CAP) && !((m >> 14) & 7), gives = pos.inCheck();
          if (futile && quiet && legal > 1 && !gives) { pos.unmake(); continue; }
          let s;
          if (legal === 1) s = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
          else {
            let r = 0;
            if (depth >= 3 && legal > 3 && quiet && !inC && !gives && m !== killers[ply * 2] && m !== killers[ply * 2 + 1]) {
              r = legal > 10 ? 2 : 1;
              if (pvNode) r--;
            }
            s = -negamax(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
            if (s > alpha && r) s = -negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
            if (s > alpha && s < beta) s = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
          }
          pos.unmake();
          if (stopped) return 0;
          if (s > best) {
            best = s; bestMv = m;
            if (s > alpha) {
              alpha = s;
              const row = ply * W, nrow = (ply + 1) * W, L = pvLen[ply + 1];
              pvT[row + ply] = m;
              for (let k = ply + 1; k < L; k++) pvT[row + k] = pvT[nrow + k];
              pvLen[ply] = L > ply + 1 ? L : ply + 1;
              if (s >= beta) {
                if (quiet) {
                  if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
                  const hi = pos.b[m & 127] * 128 + ((m >> 7) & 127);
                  hist[hi] += depth * depth;
                  if (hist[hi] > 700000) for (let k = 0; k < hist.length; k++) hist[k] >>= 1;
                }
                break;
              }
            }
          }
        }
        if (!legal) return inC ? -MATE + ply : 0;
        ttStore(depth, best >= beta ? 2 : best > a0 ? 1 : 3, best, bestMv, ply);
        return best;
      }
      // o: {time (ms), depth (max), noise (cp of random spread at the root)}
      function think(p, o) {
        pos = p; nodes = 0; stopped = false; canStop = false;
        o = o || {};
        const t0 = now(), tl = o.time || 1000, maxD = Math.max(1, Math.min(o.depth || 60, MAXP - 6)), noise = o.noise || 0;
        deadline = t0 + tl;
        for (let i = 0; i < hist.length; i++) hist[i] >>= 2;
        killers.fill(0);
        const legal = pos.legal();
        if (!legal.length) return { move: 0, score: pos.inCheck() ? -MATE : 0, depth: 0, pv: [], nodes: 0, ms: 0 };
        let root = legal.slice();
        // initial ordering: TT move first, then captures by MVV-LVA
        {
          const ti = pos.hlo & TTM, ttMv = (tFlag[ti] && tKey[ti] === pos.hhi) ? tMove[ti] : 0, b = pos.b;
          const key = m => m === ttMv ? 1e7 : (mFlags(m) & F_CAP) ? 1e5 + (b[mTo(m)] & 7) * 100 - (b[mFrom(m)] & 7) : mPromo(m) * 1000;
          root.sort((x, y) => key(y) - key(x));
        }
        let best = root[0], bestScore = -INF, bestPv = [root[0]], done = 0, lastScores = null;
        for (let d = 1; d <= maxD; d++) {
          let alpha = -INF, iBest = 0, iScore = -INF, iPv = null;
          const sc = new Array(root.length).fill(-INF);
          for (let i = 0; i < root.length; i++) {
            const m = root[i];
            pos.make(m);
            let s;
            if (noise) s = -negamax(d - 1, -INF, INF, 1, true);
            else if (i === 0) s = -negamax(d - 1, -INF, -alpha, 1, true);
            else {
              s = -negamax(d - 1, -alpha - 1, -alpha, 1, true);
              if (s > alpha && !stopped) s = -negamax(d - 1, -INF, -alpha, 1, true);
            }
            pos.unmake();
            if (stopped) break;
            sc[i] = s;
            if (s > iScore) {
              iScore = s; iBest = m; iPv = [m];
              for (let k = 1; k < pvLen[1]; k++) iPv.push(pvT[W + k]);
            }
            if (s > alpha) alpha = s;
          }
          if (stopped) {
            if (iBest && !noise) { best = iBest; bestScore = iScore; bestPv = iPv; }
            break;
          }
          best = iBest; bestScore = iScore; bestPv = iPv; done = d;
          const idx = root.map((m, i) => i).sort((a, b) => sc[b] - sc[a]);
          root = idx.map(i => root[i]); lastScores = idx.map(i => sc[i]);
          canStop = true;
          if (!noise && Math.abs(bestScore) > MATE - 500 && MATE - Math.abs(bestScore) <= d) break;
          if (now() - t0 > tl * 0.5) break;
        }
        if (noise && lastScores && Math.abs(bestScore) < MATE - 500) {
          let bi = 0, bv = -Infinity;
          for (let i = 0; i < root.length; i++) {
            if (lastScores[i] < -MATE + 500) continue;
            const v = lastScores[i] + (Math.random() * 2 - 1) * noise;
            if (v > bv) { bv = v; bi = i; }
          }
          best = root[bi]; bestScore = lastScores[bi]; bestPv = [best];
        }
        return { move: best, score: bestScore, depth: done, pv: bestPv, nodes, ms: now() - t0 };
      }
      return { think, clear };
    }

    return {
      PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, F_CAP, F_EP, F_CASTLE, F_DOUBLE, MATE, INF,
      NDIR, KDIR, BDIR, RDIR, SQ64, sqName, parseSq, mFrom, mTo, mPromo, mFlags,
      Position, toUci, parseUci, san, parseSan, perft, evaluate, makeSearcher, kdist, cdist,
    };
  }

  function workerMain(C) {
    const S = C.makeSearcher();
    self.onmessage = function (e) {
      const d = e.data || {};
      if (d.cmd === 'clear') { S.clear(); return; }
      if (d.cmd !== 'search') return;
      const pos = new C.Position().setFen(d.fen);
      for (const u of d.moves || []) { const m = C.parseUci(pos, u); if (!m) break; pos.make(m); }
      const r = S.think(pos, d);
      self.postMessage({ id: d.id, move: r.move ? C.toUci(r.move) : null, score: r.score, depth: r.depth, pv: r.pv.map(C.toUci), nodes: r.nodes, ms: r.ms, side: pos.side });
    };
  }

  /* =====================================================================================
     UI-THREAD HELPERS: openings, coach analysis
     ===================================================================================== */
  const C = chessCore();
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const MATE = C.MATE;
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const ORDV = [0, 1, 3, 3, 5, 9, 50];
  const PN = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
  const sqN = C.sqName;
  const LEVELS = {
    beginner: { label: 'Beginner', time: 300, depth: 2, noise: 170 },
    casual: { label: 'Casual', time: 600, depth: 4, noise: 45 },
    club: { label: 'Club', time: 1100, depth: 40, noise: 0 },
    strong: { label: 'Strong', time: 2400, depth: 60, noise: 0 },
  };
  const LVL_KEYS = ['beginner', 'casual', 'club', 'strong'];

  const OPENING_LINES = [
    ["King's Pawn Opening", 'e4'], ['Open Game', 'e4 e5'], ["King's Knight Opening", 'e4 e5 Nf3'],
    ['Italian Game', 'e4 e5 Nf3 Nc6 Bc4'],
    ['Italian Game: Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
    ['Italian Game: Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O'],
    ['Italian Game: Giuoco Pianissimo', 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6 O-O d6 c3 a6'],
    ['Italian Game: Two Knights Defense', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
    ['Italian Game: Two Knights Defense', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6'],
    ['Italian Game: Evans Gambit', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4'],
    ['Ruy Lopez', 'e4 e5 Nf3 Nc6 Bb5'],
    ['Ruy Lopez: Morphy Defense', 'e4 e5 Nf3 Nc6 Bb5 a6'],
    ['Ruy Lopez: Closed', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3'],
    ['Ruy Lopez: Marshall Attack', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5'],
    ['Ruy Lopez: Exchange Variation', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6'],
    ['Ruy Lopez: Berlin Defense', 'e4 e5 Nf3 Nc6 Bb5 Nf6'],
    ['Ruy Lopez: Berlin Defense', 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5'],
    ['Scotch Game', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4'],
    ['Scotch Game', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7'],
    ['Scotch Game: Classical', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3'],
    ['Four Knights Game', 'e4 e5 Nf3 Nc6 Nc3 Nf6'],
    ['Four Knights Game', 'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O d3'],
    ["Petrov's Defense", 'e4 e5 Nf3 Nf6'],
    ["Petrov's Defense", 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3'],
    ['Philidor Defense', 'e4 e5 Nf3 d6'], ['Philidor Defense', 'e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7'],
    ["King's Gambit", 'e4 e5 f4'], ["King's Gambit Accepted", 'e4 e5 f4 exf4 Nf3 g5'],
    ["King's Gambit Declined", 'e4 e5 f4 Bc5 Nf3 d6'],
    ['Vienna Game', 'e4 e5 Nc3'], ['Vienna Game', 'e4 e5 Nc3 Nf6 f4 d5'],
    ['Sicilian Defense', 'e4 c5'],
    ['Sicilian Defense: Open', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3'],
    ['Sicilian Defense: Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'],
    ['Sicilian Defense: Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6'],
    ['Sicilian Defense: Dragon', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6'],
    ['Sicilian Defense: Dragon', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6'],
    ['Sicilian Defense: Classical', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6'],
    ['Sicilian Defense: Classical', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Bg5 e6'],
    ['Sicilian Defense: Scheveningen', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6'],
    ['Sicilian Defense: Scheveningen', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6 Be2 Be7'],
    ['Sicilian Defense: Sveshnikov', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5'],
    ['Sicilian Defense: Sveshnikov', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5'],
    ['Sicilian Defense: Taimanov', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6'],
    ['Sicilian Defense: Taimanov', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7'],
    ['Sicilian Defense: Kan', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6'],
    ['Sicilian Defense: Accelerated Dragon', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6'],
    ['Sicilian Defense: Accelerated Dragon', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Bg7'],
    ['Sicilian Defense: Alapin', 'e4 c5 c3'], ['Sicilian Defense: Alapin', 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3'],
    ['Sicilian Defense: Closed', 'e4 c5 Nc3'], ['Sicilian Defense: Closed', 'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6'],
    ['Sicilian Defense: Rossolimo', 'e4 c5 Nf3 Nc6 Bb5'], ['Sicilian Defense: Rossolimo', 'e4 c5 Nf3 Nc6 Bb5 g6 O-O Bg7'],
    ['French Defense', 'e4 e6'], ['French Defense', 'e4 e6 d4 d5'],
    ['French Defense: Winawer', 'e4 e6 d4 d5 Nc3 Bb4'],
    ['French Defense: Winawer', 'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7'],
    ['French Defense: Classical', 'e4 e6 d4 d5 Nc3 Nf6'], ['French Defense: Classical', 'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7'],
    ['French Defense: Advance', 'e4 e6 d4 d5 e5'], ['French Defense: Advance', 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6'],
    ['French Defense: Tarrasch', 'e4 e6 d4 d5 Nd2'], ['French Defense: Tarrasch', 'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5'],
    ['French Defense: Exchange', 'e4 e6 d4 d5 exd5 exd5'],
    ['French Defense: Rubinstein', 'e4 e6 d4 d5 Nc3 dxe4 Nxe4 Nd7'],
    ['Caro-Kann Defense', 'e4 c6'], ['Caro-Kann Defense', 'e4 c6 d4 d5'],
    ['Caro-Kann Defense: Classical', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'],
    ['Caro-Kann Defense: Classical', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6'],
    ['Caro-Kann Defense: Advance', 'e4 c6 d4 d5 e5'], ['Caro-Kann Defense: Advance', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2'],
    ['Caro-Kann Defense: Exchange', 'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3'],
    ['Caro-Kann Defense: Panov Attack', 'e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3'],
    ['Pirc Defense', 'e4 d6 d4 Nf6 Nc3 g6'], ['Pirc Defense', 'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O'],
    ['Modern Defense', 'e4 g6'], ['Modern Defense', 'e4 g6 d4 Bg7 Nc3 d6'],
    ['Scandinavian Defense', 'e4 d5'], ['Scandinavian Defense', 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6'],
    ['Scandinavian Defense: Modern', 'e4 d5 exd5 Nf6 d4 Nxd5'],
    ["Alekhine's Defense", 'e4 Nf6'], ["Alekhine's Defense", 'e4 Nf6 e5 Nd5 d4 d6 Nf3'],
    ["Queen's Pawn Opening", 'd4'], ["Queen's Pawn Game", 'd4 d5'],
    ["Queen's Gambit", 'd4 d5 c4'],
    ["Queen's Gambit Declined", 'd4 d5 c4 e6'],
    ["Queen's Gambit Declined", 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6'],
    ["Queen's Gambit Declined: Exchange", 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6'],
    ["Queen's Gambit Accepted", 'd4 d5 c4 dxc4'], ["Queen's Gambit Accepted", 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5'],
    ['Slav Defense', 'd4 d5 c4 c6'], ['Slav Defense', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5'],
    ['Semi-Slav Defense', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6'], ['Semi-Slav Defense', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4'],
    ['London System', 'd4 d5 Bf4'], ['London System', 'd4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2'],
    ['London System', 'd4 Nf6 Bf4'], ['London System', 'd4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O'],
    ['London System', 'd4 d5 Nf3 Nf6 Bf4'], ['London System', 'd4 Nf6 Nf3 d5 Bf4'],
    ['Colle System', 'd4 d5 Nf3 Nf6 e3 e6 Bd3 c5 c3'],
    ['Indian Defense', 'd4 Nf6'],
    ["King's Indian Defense", 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6'],
    ["King's Indian Defense", 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7'],
    ["King's Indian Defense: Samisch", 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3'],
    ['Grunfeld Defense', 'd4 Nf6 c4 g6 Nc3 d5'], ['Grunfeld Defense', 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7'],
    ['Nimzo-Indian Defense', 'd4 Nf6 c4 e6 Nc3 Bb4'], ['Nimzo-Indian Defense', 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5'],
    ['Nimzo-Indian Defense: Classical', 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3'],
    ["Queen's Indian Defense", 'd4 Nf6 c4 e6 Nf3 b6'], ["Queen's Indian Defense", 'd4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7'],
    ['Bogo-Indian Defense', 'd4 Nf6 c4 e6 Nf3 Bb4+'],
    ['Catalan Opening', 'd4 Nf6 c4 e6 g3 d5 Bg2'], ['Catalan Opening', 'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O'],
    ['Benoni Defense', 'd4 Nf6 c4 c5 d5 e6'], ['Benoni Defense', 'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6'],
    ['Benko Gambit', 'd4 Nf6 c4 c5 d5 b5'], ['Benko Gambit', 'd4 Nf6 c4 c5 d5 b5 cxb5 a6'],
    ['Dutch Defense', 'd4 f5'], ['Dutch Defense', 'd4 f5 g3 Nf6 Bg2 e6 Nf3'],
    ['Trompowsky Attack', 'd4 Nf6 Bg5'], ['Trompowsky Attack', 'd4 Nf6 Bg5 Ne4 Bf4'],
    ['English Opening', 'c4'],
    ['English Opening: Reversed Sicilian', 'c4 e5'], ['English Opening: Reversed Sicilian', 'c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2'],
    ['English Opening: Symmetrical', 'c4 c5'], ['English Opening: Symmetrical', 'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7'],
    ['Reti Opening', 'Nf3'], ['Reti Opening', 'Nf3 d5 c4 e6 g3 Nf6 Bg2'],
    ["King's Indian Attack", 'Nf3 d5 g3'], ["King's Indian Attack", 'Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 d3'],
    ["Bird's Opening", 'f4'], ["Bird's Opening", 'f4 d5 Nf3 Nf6 e3 g6'],
  ];
  const posKey = p => p.fen().split(' ').slice(0, 4).join(' ');
  let OPEN = null;
  function initOpenings() {
    if (OPEN) return OPEN;
    const exact = new Map(), through = new Map(), book = new Map();
    for (const [name, line] of OPENING_LINES) {
      const pos = new C.Position().setFen(START), sans = line.split(' ');
      for (let i = 0; i < sans.length; i++) {
        const key = posKey(pos), m = C.parseSan(pos, sans[i]);
        if (!m) break;
        const u = C.toUci(m), arr = book.get(key) || [];
        arr.push(u); book.set(key, arr);
        pos.make(m);
        const k2 = posKey(pos);
        if (i === sans.length - 1) { if (!exact.has(k2)) exact.set(k2, name); }
        else { let s = through.get(k2); if (!s) through.set(k2, s = new Set()); s.add(name); }
      }
    }
    OPEN = { exact, through, book };
    return OPEN;
  }
  function openingAt(key) {
    const O = initOpenings(), e = O.exact.get(key);
    if (e) return e;
    const t = O.through.get(key);
    if (!t) return null;
    const names = [...t];
    if (names.length === 1) return names[0];
    const fam = names.map(n => n.split(':')[0]);
    return fam.every(f => f === fam[0]) ? fam[0] : null;
  }

  /* ---------- tactical / positional helpers for the coach ---------- */
  function attacksFrom(pos, s) {
    const b = pos.b, p = b[s], out = [];
    if (!p) return out;
    const t = p & 7, c = p >> 3;
    if (t === 1) { for (const d of (c ? [-15, -17] : [15, 17])) { const x = s + d; if (!(x & 0x88)) out.push(x); } }
    else if (t === 2 || t === 6) { for (const d of (t === 2 ? C.NDIR : C.KDIR)) { const x = s + d; if (!(x & 0x88)) out.push(x); } }
    else {
      for (const d of (t === 3 ? C.BDIR : t === 4 ? C.RDIR : C.KDIR)) {
        let x = s + d;
        while (!(x & 0x88)) { out.push(x); if (b[x]) break; x += d; }
      }
    }
    return out;
  }
  function piecesOf(pos, c) {
    const out = [];
    for (let i = 0; i < 64; i++) { const s = C.SQ64[i], p = pos.b[s]; if (p && (p >> 3) === c) out.push(s); }
    return out;
  }
  const attackersOf = (pos, sq, c) => piecesOf(pos, c).filter(s => attacksFrom(pos, s).indexOf(sq) >= 0);
  // material the side to move wins by capturing on sq with best play (>= 0)
  function seeSq(pos, sq, depth) {
    depth = depth || 0;
    const target = pos.b[sq];
    if (depth > 14 || !target || (target >> 3) === pos.side || (target & 7) === 6) return 0;
    let bm = 0, bv = 1e9;
    for (const m of pos.legal()) {
      if (C.mTo(m) !== sq || (C.mFlags(m) & C.F_EP)) continue;
      const v = ORDV[pos.b[C.mFrom(m)] & 7] * 10 - C.mPromo(m);
      if (v < bv) { bv = v; bm = m; }
    }
    if (!bm) return 0;
    let gain = VAL[target & 7];
    if (C.mPromo(bm)) gain += VAL[C.mPromo(bm)] - 100;
    pos.make(bm);
    const r = seeSq(pos, sq, depth + 1);
    pos.unmake();
    return Math.max(0, gain - r);
  }
  // static exchange value of move m for the side to move
  function seeMove(pos, m) {
    const fl = C.mFlags(m);
    let g = (fl & C.F_EP) ? 100 : (fl & C.F_CAP) ? VAL[pos.b[C.mTo(m)] & 7] : 0;
    if (C.mPromo(m)) g += VAL[C.mPromo(m)] - 100;
    if (!pos.make(m)) return -1e9;
    const r = seeSq(pos, C.mTo(m));
    pos.unmake();
    return g - r;
  }
  function withNull(pos, fn) {
    if (pos.inCheck()) return null;
    pos.makeNull();
    try { return fn(pos); } finally { pos.unmakeNull(); }
  }
  // pieces of colour c that the side to move (c^1) can win
  function hangingFor(pos, c) {
    const out = [];
    for (const s of piecesOf(pos, c)) {
      const t = pos.b[s] & 7;
      if (t === 6) continue;
      const g = seeSq(pos, s);
      if (g > 0) out.push({ sq: s, t, gain: g });
    }
    return out.sort((a, b) => b.gain - a.gain);
  }
  function listNames(pos, sqs) {
    const n = sqs.slice().sort((a, b) => ORDV[pos.b[b] & 7] - ORDV[pos.b[a] & 7]).map(s => PN[pos.b[s] & 7]);
    return n.length <= 1 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  }
  // targets of a fork by the piece on sq (its owner just moved; the victim is to move)
  function forkTargets(pos, sq) {
    const p = pos.b[sq];
    if (!p) return null;
    const X = p >> 3, t = p & 7;
    if (pos.side === X) return null;
    const tg = [];
    for (const d of attacksFrom(pos, sq)) {
      const q = pos.b[d];
      if (!q || (q >> 3) === X) continue;
      const qt = q & 7;
      if (qt === 1) continue;
      if (qt === 6 || VAL[qt] > VAL[t] + 50 || !attackersOf(pos, d, X ^ 1).length) tg.push(d);
    }
    if (tg.length < 2) return null;
    if (seeSq(pos, sq) > 0) return null;
    return tg;
  }
  // pin or skewer created by the slider on sq
  function lineTactic(pos, sq) {
    const p = pos.b[sq];
    if (!p) return null;
    const t = p & 7, X = p >> 3;
    if (t < 3 || t > 5) return null;
    let best = null;
    for (const d of (t === 3 ? C.BDIR : t === 4 ? C.RDIR : C.KDIR)) {
      let x = sq + d, a = -1, bq = -1;
      while (!(x & 0x88)) { if (pos.b[x]) { if (a < 0) a = x; else { bq = x; break; } } x += d; }
      if (a < 0 || bq < 0) continue;
      const A = pos.b[a], B = pos.b[bq];
      if ((A >> 3) === X || (B >> 3) === X) continue;
      const at = A & 7, bt = B & 7;
      const loose = s => !attackersOf(pos, s, X ^ 1).length;
      let r = null;
      if (bt === 6 && at !== 6 && at !== 1) r = { kind: 'pin', abs: true, a, b: bq, w: VAL[at] + 50 };
      else if (at === 6 && bt !== 1 && (VAL[bt] >= 500 || loose(bq))) r = { kind: 'skewer', a, b: bq, w: VAL[bt] };
      else if (at !== 6 && bt !== 6 && at !== 1 && VAL[bt] > VAL[at] && VAL[bt] > VAL[t]) r = { kind: 'pin', abs: false, a, b: bq, w: VAL[at] / 2 };
      else if (at !== 6 && bt !== 1 && VAL[at] > VAL[bt] && VAL[at] > VAL[t] && (VAL[bt] >= 500 || loose(bq))) r = { kind: 'skewer', a, b: bq, w: VAL[bt] };
      if (r && (!best || r.w > best.w)) best = r;
    }
    if (best && pos.side !== X && seeSq(pos, sq) > 0) return null;
    return best;
  }
  // a new attack by a line piece that the move uncovered
  function discovered(before, m, after) {
    if (C.mFlags(m) & C.F_CASTLE) return null;
    const X = before.side, to = C.mTo(m), res = [];
    for (const s of piecesOf(after, X)) {
      if (s === to) continue;
      const t = after.b[s] & 7;
      if (t < 3 || t > 5) continue;
      const pre = new Set(attacksFrom(before, s));
      for (const d of attacksFrom(after, s)) {
        if (pre.has(d)) continue;
        const q = after.b[d];
        if (!q || (q >> 3) === X) continue;
        const qt = q & 7;
        if (qt === 6 || VAL[qt] > VAL[t] || (VAL[qt] >= 300 && !attackersOf(after, d, X ^ 1).length)) res.push({ by: s, target: d, check: qt === 6 });
      }
    }
    if (!res.length) return null;
    res.sort((a, b) => (b.check - a.check) || (VAL[after.b[b.target] & 7] - VAL[after.b[a.target] & 7]));
    return res[0];
  }
  function pawnInfo(pos, c) {
    const files = [[], []];
    for (let f = 0; f < 8; f++) { files[0].push([]); files[1].push([]); }
    for (let i = 0; i < 64; i++) { const s = C.SQ64[i], p = pos.b[s]; if ((p & 7) === 1) files[p >> 3][s & 7].push(s >> 4); }
    const my = files[c], op = files[c ^ 1];
    let doubled = 0, isolated = 0, count = 0;
    const passed = [];
    for (let f = 0; f < 8; f++) {
      count += my[f].length;
      if (my[f].length > 1) doubled += my[f].length - 1;
      const iso = (f === 0 || !my[f - 1].length) && (f === 7 || !my[f + 1].length);
      for (const r of my[f]) {
        if (iso) isolated++;
        let free = true;
        for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1) && free; ff++) for (const r2 of op[ff]) if (c === 0 ? r2 > r : r2 < r) { free = false; break; }
        if (free) passed.push(r * 16 + f);
      }
    }
    return { doubled, isolated, passed, count, files: my, opp: op };
  }
  const relRank = (s, c) => c ? 7 - (s >> 4) : (s >> 4);
  function material(pos, c) { let m = 0; for (const s of piecesOf(pos, c)) m += VAL[pos.b[s] & 7]; return m; }
  function nonPawn(pos, c) { let m = 0; for (const s of piecesOf(pos, c)) { const t = pos.b[s] & 7; if (t > 1 && t < 6) m += VAL[t]; } return m; }
  const hasQueens = pos => piecesOf(pos, 0).some(s => (pos.b[s] & 7) === 5) || piecesOf(pos, 1).some(s => (pos.b[s] & 7) === 5);
  const isEndgame = pos => nonPawn(pos, 0) + nonPawn(pos, 1) <= 2600 && (!hasQueens(pos) || nonPawn(pos, 0) + nonPawn(pos, 1) <= 1900);
  function undeveloped(pos, c) {
    const home = c ? [113, 118, 114, 117] : [1, 6, 2, 5], want = [2, 2, 3, 3];
    let n = 0;
    home.forEach((s, i) => { if (pos.b[s] === (want[i] | (c << 3))) n++; });
    return n;
  }
  function mobility(pos, c) {
    let n = 0;
    for (const s of piecesOf(pos, c)) { const t = pos.b[s] & 7; if (t > 1 && t < 6) n += attacksFrom(pos, s).filter(x => !pos.b[x] || (pos.b[x] >> 3) !== c).length; }
    return n;
  }
  function wing(pos, c) { const k = pos.ks[c], f = k & 7; if (relRank(k, c) > 1) return null; return f >= 5 ? 'k' : f <= 2 ? 'q' : null; }
  function backRankWeak(pos, c) {
    const k = pos.ks[c];
    if (relRank(k, c) !== 0 || (k & 7) === 3 || (k & 7) === 4) return false;
    const enemyHeavy = piecesOf(pos, c ^ 1).some(s => (pos.b[s] & 7) === 4 || (pos.b[s] & 7) === 5);
    if (!enemyHeavy) return false;
    const fw = c ? -16 : 16;
    for (const d of [-1, 0, 1]) {
      const x = k + fw + d;
      if (x & 0x88) continue;
      const q = pos.b[x];
      if ((!q || (q >> 3) !== c) && !pos.attacked(x, c ^ 1)) return false;
    }
    return true;
  }
  function isOutpost(pos, s, c) {
    const rr = relRank(s, c), f = s & 7;
    if (rr < 3 || rr > 5) return false;
    const own = 1 | (c << 3), back = c ? 16 : -16;
    const prot = [-1, 1].some(d => { const x = s + back + d; return !(x & 0x88) && pos.b[x] === own; });
    if (!prot) return false;
    const pi = pawnInfo(pos, c);
    for (const ff of [f - 1, f + 1]) { if (ff < 0 || ff > 7) continue; for (const r2 of pi.opp[ff]) if (c === 0 ? r2 > (s >> 4) : r2 < (s >> 4)) return false; }
    return true;
  }
  function trappedPiece(pos, X) {
    // pos: X to move. A piece of X that is attacked and has no safe square.
    const threats = withNull(pos, q => hangingFor(q, X)) || [];
    for (const h of threats) {
      if (h.t < 2 || h.t > 5) continue;
      let safe = false;
      for (const m of pos.legal()) {
        if (C.mFrom(m) !== h.sq) continue;
        if (seeMove(pos, m) > -VAL[h.t] + 80) { safe = true; break; }
      }
      if (!safe) return h.sq;
    }
    return -1;
  }
  function pvLoss(pos, pv, X) {
    const p = pos.clone(), start = material(p, X) - material(p, X ^ 1), orig = {};
    for (const s of piecesOf(p, X)) orig[s] = s;
    let lost = null;
    for (let i = 0; i < Math.min(6, pv.length); i++) {
      const m = C.parseUci(p, pv[i]);
      if (!m) break;
      const capSq = (C.mFlags(m) & C.F_EP) ? C.mTo(m) + (p.side ? 16 : -16) : C.mTo(m), q = p.b[capSq];
      if (q && (q >> 3) === X && orig[capSq] !== undefined && (!lost || VAL[q & 7] > VAL[lost.t])) lost = { t: q & 7, sq: orig[capSq] };
      if (p.side === X && orig[C.mFrom(m)] !== undefined) { orig[C.mTo(m)] = orig[C.mFrom(m)]; delete orig[C.mFrom(m)]; }
      else if (p.side !== X) delete orig[capSq];
      p.make(m);
    }
    const delta = material(p, X) - material(p, X ^ 1) - start;
    return delta <= -80 && lost ? lost : null;
  }
  function backRankMate(pos, pv) {
    const p = pos.clone();
    let last = 0;
    for (const u of pv) { const m = C.parseUci(p, u); if (!m) break; last = m; p.make(m); }
    if (!last || p.legal().length || !p.inCheck()) return false;
    const k = p.ks[p.side], s = C.mTo(last), t = p.b[s] & 7;
    return relRank(k, p.side) === 0 && (t === 4 || t === 5) && (s >> 4) === (k >> 4);
  }
  const cap1 = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  // why a move is good (used for hints, praise and "better was ...")
  function goodReasons(before, m, ply) {
    const X = before.side, from = C.mFrom(m), to = C.mTo(m), fl = C.mFlags(m), pr = C.mPromo(m);
    const t = before.b[from] & 7, capT = (fl & C.F_EP) ? 1 : (fl & C.F_CAP) ? before.b[to] & 7 : 0;
    const after = before.clone();
    if (!after.make(m)) return [];
    const out = [];
    if (!after.legal().length) return after.inCheck() ? ['delivers checkmate'] : ['forces stalemate'];
    const see = seeMove(before, m);
    if (pr) out.push('promotes to a ' + PN[pr]);
    if (capT) {
      if (see >= VAL[capT] - 20) out.push((attackersOf(before, to, X ^ 1).length ? 'wins the ' : 'grabs the undefended ') + PN[capT] + ' on ' + sqN(to));
      else if (see > 40) out.push('wins material in the exchange on ' + sqN(to));
      else if (see >= 0) out.push(capT === t ? 'trades ' + PN[t] + 's' : 'trades ' + PN[t] + ' for ' + PN[capT]);
    }
    const fk = forkTargets(after, to);
    if (fk) out.push('forks the ' + listNames(after, fk));
    const lt = lineTactic(after, to);
    if (lt) out.push(lt.kind === 'pin' ? 'pins the ' + PN[after.b[lt.a] & 7] + ' to the ' + PN[after.b[lt.b] & 7]
      : 'skewers the ' + PN[after.b[lt.a] & 7] + ', hitting the ' + PN[after.b[lt.b] & 7] + ' behind it');
    const dc = discovered(before, m, after);
    if (dc) out.push(dc.check ? 'unleashes a discovered check from the ' + PN[after.b[dc.by] & 7] : 'opens a discovered attack on the ' + PN[after.b[dc.target] & 7]);
    if (after.inCheck() && !out.length) out.push('gives check');
    if (fl & C.F_CASTLE) out.push('castles, tucking the king away and connecting the rooks');
    // escaping or defending
    const th0 = withNull(before.clone(), q => hangingFor(q, X)) || [];
    if (th0.length) {
      const h = th0[0];
      if (h.sq === from && !seeSq(after, to)) out.push('moves the attacked ' + PN[t] + ' to safety');
      else if (h.sq !== from && !hangingFor(after, X).some(x => x.sq === h.sq)) out.push('defends the ' + PN[h.t] + ' on ' + sqN(h.sq));
    }
    // mate threats
    if (!out.length) {
      const mt = withNull(after.clone(), q => {
        for (const mm of q.legal()) { q.make(mm); const mate = q.inCheck() && !q.legal().length; q.unmake(); if (mate) return C.san(q, mm); }
        return null;
      });
      if (mt) out.push('threatens mate (' + mt + ')');
    }
    // new threats
    if (!out.length) {
      const was = new Set(hangingFor(before, X ^ 1).map(h => h.sq));
      const thr = withNull(after.clone(), q => hangingFor(q, X ^ 1)) || [];
      const nw = thr.filter(h => !was.has(h.sq));
      if (nw.length) out.push('threatens to win the ' + PN[nw[0].t] + ' on ' + sqN(nw[0].sq));
    }
    const opening = (ply || 0) < 20, eg = isEndgame(after);
    if (opening && (t === 2 || t === 3) && relRank(from, X) === 0) out.push('develops the ' + PN[t] + ([2, 3, 4, 5].indexOf(to & 7) >= 0 ? ' toward the center' : ''));
    if (t === 1 && opening && !capT && [51, 52, 67, 68, 50, 66].indexOf(to) >= 0) out.push('stakes a claim in the center');
    if (t === 4 && !capT && (from & 7) !== (to & 7)) {
      const pi = pawnInfo(after, X), f = to & 7;
      if (!pi.files[f].length) out.push(!pi.opp[f].length ? 'seizes the open ' + 'abcdefgh'[f] + '-file' : 'puts the rook on the half-open ' + 'abcdefgh'[f] + '-file');
    }
    if (t === 2 && isOutpost(after, to, X)) out.push('plants the knight on an outpost no pawn can chase it from');
    if (t === 1) {
      const p0 = pawnInfo(before, X).passed, p1 = pawnInfo(after, X).passed;
      if (p0.indexOf(from) >= 0) out.push('pushes the passed pawn');
      else if (p1.length > p0.length) out.push('creates a passed pawn');
    }
    if (eg && t === 6 && C.cdist(to) < C.cdist(from)) out.push('activates the king, a fighting piece in the endgame');
    if (t === 4) {
      for (const c of [X, X ^ 1]) for (const ps of pawnInfo(after, c).passed) {
        if ((ps & 7) !== (to & 7)) continue;
        const behind = c === 0 ? (to >> 4) < (ps >> 4) : (to >> 4) > (ps >> 4);
        if (behind) { out.push(c === X ? 'puts the rook behind its passed pawn' : 'gets the rook behind the enemy passed pawn'); break; }
      }
    }
    if (t === 1 && backRankWeak(before, X) && !backRankWeak(after, X)) out.push('makes luft, so the back rank is no longer a mating target');
    if (!out.length) {
      if (mobility(after, X) > mobility(before, X) + 2) out.push('improves your piece activity');
      else if (eg) out.push('keeps the position under control');
      else out.push('a solid, useful move');
    }
    return out;
  }
  // positional faults of move m (for the mover X)
  function strategicFaults(before, m, after, ply) {
    const X = before.side, from = C.mFrom(m), to = C.mTo(m), fl = C.mFlags(m), t = before.b[from] & 7;
    const capT = (fl & C.F_CAP) ? 1 : 0, out = [], eg = isEndgame(before), rights = X ? 12 : 3;
    if ((before.castle & rights) && !(after.castle & rights) && !(fl & C.F_CASTLE) && hasQueens(before) && !eg) out.push('it gives up the right to castle');
    if (t === 6 && !(fl & C.F_CASTLE) && !eg && hasQueens(before) && relRank(to, X) > relRank(from, X)) out.push('the king leaves its shelter while the queens are on');
    const w = wing(before, X);
    if (t === 1 && w && !eg && Math.abs((from & 7) - (before.ks[X] & 7)) <= 1 && relRank(from, X) <= 2) out.push('it loosens the pawn shield in front of your king');
    if (t === 1 || capT) {
      const a = pawnInfo(before, X), b = pawnInfo(after, X), oa = pawnInfo(before, X ^ 1), ob = pawnInfo(after, X ^ 1);
      if (b.doubled > a.doubled) out.push('it leaves you with doubled pawns');
      if (b.isolated > a.isolated) out.push('it creates an isolated pawn');
      if (ob.passed.length > oa.passed.length) out.push('it hands your opponent a passed pawn');
    }
    if (t === 1) {
      const bish = piecesOf(after, X).filter(s => (after.b[s] & 7) === 3);
      if (bish.length === 1) {
        const col = ((bish[0] >> 4) + (bish[0] & 7)) & 1, toCol = ((to >> 4) + (to & 7)) & 1;
        const same = piecesOf(after, X).filter(s => (after.b[s] & 7) === 1 && (((s >> 4) + (s & 7)) & 1) === col).length;
        if (toCol === col && same >= 4) out.push('another pawn lands on your bishop\'s colour, making it a "bad bishop"');
      }
    }
    if ((ply || 0) < 16 && t === 5 && undeveloped(before, X) >= 2 && !capT) out.push(from === (X ? 115 : 3) ? 'it brings the queen out early; she can be chased around with tempo' : 'it moves the queen again instead of developing your pieces');
    if (t === 2 && !capT && ((to & 7) === 0 || (to & 7) === 7) && !isEndgame(after)) out.push('a knight on the rim is dim: from the edge it controls only a few squares');
    if (t === 1 && (from & 7) === 5 && relRank(from, X) === 1 && !eg && relRank(before.ks[X], X) === 0 && (before.ks[X] & 7) >= 4) out.push('pushing the f-pawn weakens the diagonal to your king' + (before.b[X ? 118 : 6] === (2 | (X << 3)) && relRank(to, X) === 2 ? ' and takes f' + (X ? 6 : 3) + ' away from your knight' : ''));
    if (t === 1 && (from & 7) === 2 && relRank(to, X) === 2 && (ply || 0) < 12 && before.b[X ? 113 : 1] === (2 | (X << 3)) && [3, 4].indexOf(before.ks[X] & 7) >= 0) out.push('it takes the c' + (X ? 6 : 3) + ' square away from your queen\'s knight');
    if ((ply || 0) < 14 && (t === 2 || t === 3) && relRank(from, X) > 0 && undeveloped(before, X) >= 2 && !capT) out.push('it moves the same piece twice while others are still at home');
    if ((t >= 2 && t <= 5) && !capT && attacksFrom(after, to).length + 3 < attacksFrom(before, from).length) out.push('the ' + PN[t] + ' becomes passive');
    return out;
  }
  // why a move is bad (X = mover). ctx: before, m, after, best (move), evalB/evalA (mover POV), reply (uci pv), ply
  function badReasons(ctx) {
    const { before, m, after } = ctx, X = before.side, from = C.mFrom(m), to = C.mTo(m), t = before.b[from] & 7;
    const out = [];
    if (ctx.evalA < -MATE + 500) {
      const n = Math.max(1, Math.ceil((MATE + ctx.evalA) / 2));
      let s = 'it allows mate in ' + n;
      if (backRankMate(after, ctx.reply || [])) s += ', a back-rank mate';
      if (ctx.reply && ctx.reply[0]) { const rm = C.parseUci(after, ctx.reply[0]); if (rm) s += ' (starting ' + C.san(after, rm) + ')'; }
      out.push(s);
      return out;
    }
    const reply = ctx.reply && ctx.reply[0] ? C.parseUci(after, ctx.reply[0]) : 0;
    if (reply) {
      const rto = C.mTo(reply), rfl = C.mFlags(reply), rcap = (rfl & C.F_CAP) ? ((rfl & C.F_EP) ? 1 : after.b[rto] & 7) : 0;
      const rs = C.san(after, reply), a2 = after.clone();
      a2.make(reply);
      if (rcap && seeMove(after, reply) > 0) {
        if (rto === to) out.push('your ' + PN[after.b[to] & 7] + ' on ' + sqN(to) + ' is left hanging: ' + rs + ' wins it');
        else {
          const wasSafe = (withNull(before.clone(), q => seeSq(q, rto)) || 0) <= 0;
          const guarded = attacksFrom(before, from).indexOf(rto) >= 0;
          if (wasSafe && guarded) out.push('your ' + PN[t] + ' stopped guarding the ' + PN[rcap] + ' on ' + sqN(rto) + ', and ' + rs + ' wins it');
          else if (wasSafe) out.push('it drops the ' + PN[rcap] + ' on ' + sqN(rto) + ' to ' + rs);
          else out.push('the ' + PN[rcap] + ' on ' + sqN(rto) + ' was under attack and is still loose: ' + rs);
        }
      }
      const fk = forkTargets(a2, rto);
      if (fk) out.push('it allows ' + rs + ', forking your ' + listNames(a2, fk));
      const lt = lineTactic(a2, rto);
      if (lt) out.push('it allows ' + rs + (lt.kind === 'pin' ? ', pinning your ' + PN[a2.b[lt.a] & 7] + ' to the ' + PN[a2.b[lt.b] & 7] : ', skewering your ' + PN[a2.b[lt.a] & 7] + ' and ' + PN[a2.b[lt.b] & 7]));
      const dc = discovered(after, reply, a2);
      if (dc && !out.length) out.push('it walks into a discovered ' + (dc.check ? 'check' : 'attack') + ' with ' + rs);
      if (!out.length) { const tp = trappedPiece(a2, X); if (tp >= 0) out.push('after ' + rs + ' your ' + PN[a2.b[tp] & 7] + ' on ' + sqN(tp) + ' is trapped'); }
      if (!out.length) {
        const lost = pvLoss(after, ctx.reply, X);
        if (lost) out.push('after ' + rs + ' the opponent wins your ' + PN[lost.t] + (lost.sq >= 0 ? ' on ' + sqN(lost.sq) : ''));
      }
      if (!out.length && ctx.evalA < -250 && a2.inCheck()) out.push('it allows the strong check ' + rs);
    }
    if (ctx.best && ctx.best !== m) {
      const bm = ctx.best, bs = C.san(before, bm);
      if (ctx.evalB > MATE - 500) out.push('you missed mate in ' + Math.max(1, Math.ceil((MATE - ctx.evalB) / 2)) + ' starting with ' + bs);
      else {
        const bfl = C.mFlags(bm), bcap = (bfl & C.F_EP) ? 1 : (bfl & C.F_CAP) ? before.b[C.mTo(bm)] & 7 : 0, gain = seeMove(before, bm);
        const ba = before.clone(); ba.make(bm);
        if (bcap && gain > 60) out.push('you missed ' + bs + ', which wins ' + (gain >= VAL[bcap] - 20 ? 'a ' + PN[bcap] : 'material'));
        else {
          const fk = forkTargets(ba, C.mTo(bm));
          if (fk) out.push('you missed the fork ' + bs + ' hitting the ' + listNames(ba, fk));
          else { const lt = lineTactic(ba, C.mTo(bm)); if (lt) out.push('you missed ' + bs + ', ' + (lt.kind === 'pin' ? 'pinning' : 'skewering') + ' the ' + PN[ba.b[lt.a] & 7]); }
        }
      }
    }
    for (const s of strategicFaults(before, m, after, ctx.ply)) out.push(s);
    if (!out.length && isEndgame(before) && t !== 6 && ctx.best && (before.b[C.mFrom(ctx.best)] & 7) === 6 && C.cdist(before.ks[X]) >= 2) out.push('in the endgame your king must join the fight');
    return out;
  }
  // contextual plan tip for player c to move in pos
  function planTip(pos, c, ply) {
    const eg = isEndgame(pos), kw = wing(pos, c), ow = wing(pos, c ^ 1);
    if (!eg && ply < 16 && (undeveloped(pos, c) >= 2 || (relRank(pos.ks[c], c) === 0 && (pos.ks[c] & 7) === 4)))
      return 'Opening: develop knights before bishops, castle early, and avoid moving the same piece twice.';
    if (backRankWeak(pos, c) && !eg) return 'Your back rank is weak: a pawn move such as h3/h6 gives the king air and kills back-rank tricks.';
    if (!eg && kw && ow && kw !== ow && hasQueens(pos)) return 'Opposite-side castling: storm the enemy king with pawns; speed matters more than material.';
    const onlyPawns = nonPawn(pos, 0) + nonPawn(pos, 1) === 0;
    if (onlyPawns) {
      const a = pos.ks[0], b = pos.ks[1];
      if ((((a & 7) === (b & 7)) && Math.abs((a >> 4) - (b >> 4)) === 2) || (((a >> 4) === (b >> 4)) && Math.abs((a & 7) - (b & 7)) === 2))
        return 'Opposition: kings face each other with one square between; the side NOT to move holds the opposition.';
      const pi = pawnInfo(pos, c);
      if (pi.passed.some(s => (s & 7) <= 1 || (s & 7) >= 6)) return 'Use your outside passed pawn as a decoy: it drags the enemy king away while yours eats the other side.';
      return 'Pawn endgame: king activity decides. Aim your king at the key squares in front of your pawns.';
    }
    if (eg) {
      const rooks = piecesOf(pos, c).some(s => (pos.b[s] & 7) === 4);
      if (rooks && (pawnInfo(pos, 0).passed.length || pawnInfo(pos, 1).passed.length)) return 'Rook endgame: rooks belong behind passed pawns, yours or the opponent\'s.';
      return 'Endgame: centralize your king, create a passed pawn, and trade pieces (not pawns) when ahead.';
    }
    const pi = pawnInfo(pos, c);
    for (let f = 0; f < 8; f++) {
      if (!pi.files[f].length && !pi.opp[f].length && piecesOf(pos, c).some(s => (pos.b[s] & 7) === 4 && (s & 7) !== f))
        return 'The ' + 'abcdefgh'[f] + '-file is open: put a rook on it (and double them) before your opponent does.';
    }
    if (ply < 30) return 'Middlegame: find the pawn break that opens lines where you are stronger, and improve your worst piece.';
    return 'Ask what your opponent wants before each move (prophylaxis), then improve your worst-placed piece.';
  }
  // annotation for a move: pre/post are analyses ({s: score from White's view, b: best uci, pv})
  const cpEff = s => Math.abs(s) > MATE - 500 ? Math.sign(s) * (1000 + Math.max(0, 50 - (MATE - Math.abs(s)))) : Math.max(-1000, Math.min(1000, s));
  const cpWide = s => Math.abs(s) > MATE - 500 ? Math.sign(s) * (3000 + Math.max(0, 50 - (MATE - Math.abs(s)))) : Math.max(-2500, Math.min(2500, s));
  const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  const LABELS = ['Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'];
  function labelFor(cpl, drop, isBest) {
    if (isBest || cpl <= 8) return 'Best';
    let i = cpl <= 25 ? 1 : cpl <= 60 ? 2 : cpl <= 120 ? 3 : cpl <= 260 ? 4 : 5;
    if (drop < 2 && cpl > 60 && i > 2) return 'Good';
    if (drop < 2 && i > 2) i = 2;
    else if (drop < 6 && i > 3) i = 3;
    else if (drop < 12 && i > 4) i = 4;
    return LABELS[i];
  }
  function annotate(beforeFen, uci, pre, post, ply) {
    const before = new C.Position().setFen(beforeFen), X = before.side, m = C.parseUci(before, uci);
    if (!m) return null;
    const after = before.clone(); after.make(m);
    const sg = X ? -1 : 1, evalB = pre.s * sg, evalA = post.s * sg;
    const best = pre.b ? C.parseUci(before, pre.b) : 0;
    const isBest = best === m;
    const cpl = isBest ? 0 : Math.max(0, cpWide(evalB) - cpWide(evalA));
    const drop = Math.max(0, winPct(cpEff(evalB)) - winPct(cpEff(evalA)));
    const label = labelFor(cpl, drop, isBest);
    const bestSan = best ? C.san(before, best) : '';
    let text;
    if (label === 'Best' || label === 'Excellent') {
      const r = goodReasons(before, m, ply);
      text = (label === 'Best' ? (isBest ? 'Best move! ' : 'Top move, as strong as the engine\'s choice. ') : 'Excellent. ') + cap1(r.slice(0, 2).join(' and ')) + '.';
    } else if (label === 'Good') {
      const r = goodReasons(before, m, ply);
      const bad = strategicFaults(before, m, after, ply);
      text = 'Good. ' + cap1(r[0]) + '.' + (bad.length ? ' Note: ' + bad[0] + '.' : '');
      if (best && !isBest) text += ' Slightly stronger: ' + bestSan + ' (' + goodReasons(before, best, ply)[0] + ').';
    } else {
      const reasons = badReasons({ before, m, after, best, evalB, evalA, reply: post.pv || (post.b ? [post.b] : []), ply });
      const lost = (cpl / 100).toFixed(1);
      text = label + ': ' + (reasons.length ? cap1(reasons.slice(0, 2).join('; ')) + '.' : 'This lets about ' + lost + ' pawns of value slip away.');
      if (best && !isBest && !/missed/.test(reasons.slice(0, 2).join(' '))) text += ' Better was ' + bestSan + ': it ' + goodReasons(before, best, ply)[0].replace(/^a solid/, 'is a solid') + '.';
      else if (best && !isBest && !reasons.length) text += ' Better was ' + bestSan + '.';
    }
    return { l: label, c: Math.round(cpl), t: text, b: bestSan };
  }

  /* =====================================================================================
     PIECES (original SVG drawings, 100x100 viewBox)
     ===================================================================================== */
  const BASE = (x1, x2) => `<rect class="b" x="${x1}" y="81" width="${x2 - x1}" height="9" rx="4"/>`;
  const FOOT = '<path class="b" d="M30 81q1-8 7-10h26q6 2 7 10z"/>';
  const SHAPE = {
    1: BASE(26, 74) + '<path class="b" d="M36 81C36 70 42 63 44 57h12c2 6 8 13 8 24z"/><ellipse class="b" cx="50" cy="57" rx="14" ry="4.5"/><circle class="b" cx="50" cy="40" r="13"/>',
    2: BASE(22, 80) + '<path class="b" d="M34 81c-1-10 6-17 11-23-7 2-14 3-20 1-6-2-10-6-9-12 1-4 5-7 10-11l9-8 2-12 8 7c15-2 29 8 32 24 3 14 0 26-5 34z"/><circle class="df" cx="36" cy="36" r="2.8"/><circle class="df" cx="21" cy="48" r="1.7"/><path class="d" d="M47 24c13 2 23 12 25 26"/>',
    3: BASE(22, 78) + '<path class="b" d="M31 81q2-9 11-11h16q9 2 11 11z"/><path class="b" d="M42 70l3-10h10l3 10z"/><ellipse class="b" cx="50" cy="60" rx="13" ry="4"/><path class="b" d="M50 20C38 30 33 42 37 53q13 6 26 0c4-11-1-23-13-33z"/><circle class="b" cx="50" cy="15" r="5"/><path class="d" d="M55 31l-9 12"/>',
    4: BASE(20, 80) + '<path class="b" d="M29 81l3-9 4-26h28l4 26 3 9z"/><path class="b" d="M30 46V24h9v7h7v-7h8v7h7v-7h9v22z"/><path class="d" d="M33 72h34M36 46h28"/>',
    5: BASE(20, 80) + FOOT + '<path class="b" d="M37 71L20 34l14 18 2-26 9 23 5-27 5 27 9-23 2 26 14-18-17 37z"/><circle class="b" cx="20" cy="31" r="4.5"/><circle class="b" cx="36" cy="23" r="4.5"/><circle class="b" cx="50" cy="19" r="4.5"/><circle class="b" cx="64" cy="23" r="4.5"/><circle class="b" cx="80" cy="31" r="4.5"/><path class="d" d="M36 64q14-4 28 0"/>',
    6: BASE(20, 80) + FOOT + '<path class="b" d="M37 71C26 64 18 52 24 44c6-7 18-4 26 8 8-12 20-15 26-8 6 8-2 20-13 27z"/><path class="b" d="M44 52c0-8 3-14 6-18 3 4 6 10 6 18z"/><path class="b" d="M47 9h6v7h7v6h-7v12h-6V22h-7v-6h7z"/><path class="d" d="M36 64q14-4 28 0"/>',
  };
  const pieceSVG = p => `<svg viewBox="0 0 100 100" class="${p & 8 ? 'pb' : 'pw'}">${SHAPE[p & 7]}</svg>`;

  const GUIDE = `
<details><summary>Opening principles</summary><ul>
<li><b>Center first.</b> Pawns on e4/d4 (or c4) and pieces aimed at d4, e4, d5, e5. A space edge in the center lets your pieces switch wings faster than your opponent's.</li>
<li><b>Develop with purpose.</b> Knights before bishops, one move per piece, castle by about move 10, then connect the rooks. Every tempo spent moving the queen early or grabbing a flank pawn is a tempo your opponent invests in development.</li>
<li><b>Learn structures, not just moves.</b> Carlsbad (QGD Exchange): White's plan is the minority attack b4-b5. King's Indian: White expands with c5 on the queenside, Black storms with ...f5-f4-g5. French: Black breaks with ...c5 and ...f6 against the e5 chain.</li>
<li><b>Gambits buy time.</b> If you accept a pawn, give it back when your development lags; if you offer one, use the tempi to open lines immediately.</li></ul></details>
<details><summary>Middlegame plans</summary><ul>
<li><b>Pawn breaks</b> decide where the game is played. Before each plan ask: which pawn move opens lines where my pieces are better? (...d5 in the Sicilian, ...c5 in the French, f4-f5 against a kingside fianchetto).</li>
<li><b>Minor piece battles.</b> Bishops want open diagonals and pawns on both wings; knights want outposts: protected squares that no enemy pawn can attack. Trade your "bad" bishop (blocked by its own pawns) for the opponent's good one, or put pawns on the other colour.</li>
<li><b>Attacking the king.</b> Count attackers vs. defenders near the king. Open lines with pawn levers (g4-g5, h4-h5). With opposite-side castling it is a race: push pawns at once and avoid defensive moves. Classic sacrifices (Bxh7+, Nf5/Nd5, Rxf6) work when more attackers than defenders arrive.</li>
<li><b>Prophylaxis.</b> Before moving, ask "what does my opponent want?" and take it away first. Luft (h3) removes back-rank tricks; a timely a3 stops ...Bb4 or ...Nb4.</li>
<li><b>Weaknesses.</b> Blockade an isolated pawn with a knight on the square in front of it; attack backward pawns on half-open files. One weakness can be defended, so create a second one on the other wing.</li>
<li><b>Trades.</b> When ahead in material, trade pieces, not pawns. With less space, trade to relieve the cramp; with more space, keep pieces on.</li></ul></details>
<details><summary>Tactical patterns</summary><ul>
<li><b>Fork:</b> one piece hits two. <i>Nc7+</i> hitting king on e8 and rook on a8; a pawn push e4-e5 hitting knight f6 and bishop d6.</li>
<li><b>Pin:</b> <i>Bb5</i> vs. Nc6 with the king on e8: the knight cannot move (absolute pin). Pile up on the pinned piece, often with a pawn (d4-d5).</li>
<li><b>Skewer:</b> attack the bigger piece so the one behind falls: <i>Bb2+</i> with the king on g7 and a rook on h8: once the king steps aside, Bxh8.</li>
<li><b>Discovered attack / double check:</b> moving a piece unmasks a rook or bishop; the moving piece is free to capture anything. A double check can only be met by a king move.</li>
<li><b>Removing the defender / overloading / deflection:</b> capture or decoy the piece that guards a key square, then strike that square.</li>
<li><b>Back-rank mate:</b> <i>Re8#</i> against a king boxed by its own f/g/h pawns. Prevent with luft or a rook on the first rank.</li>
<li><b>Greek gift:</b> <i>Bxh7+ Kxh7 Ng5+</i> then Qh5, when there is no knight on f6 and the bishop can't be ignored.</li>
<li><b>Smothered mate:</b> <i>Qg8+ Rxg8 Nf7#</i>: the king's own pieces take its last squares.</li>
<li><b>Zwischenzug:</b> before an "obvious" recapture, look for an in-between check or bigger threat.</li></ul></details>
<details><summary>Endgame technique</summary><ul>
<li><b>Activate the king.</b> With queens off it is worth about a minor piece: centralize it before pushing pawns.</li>
<li><b>Opposition:</b> kings facing with one square between; the side <i>not</i> to move holds it and keeps the other king out.</li>
<li><b>Key squares:</b> for a pawn not yet past the 4th rank, the key squares are two ranks in front of it (and the adjacent files). If the attacking king reaches one, the pawn promotes whatever the defender does.</li>
<li><b>Rule of the square:</b> draw a square from the pawn to its promotion rank; if the defending king can step into it, it catches the pawn.</li>
<li><b>Lucena (winning):</b> king on the promotion square, own rook cutting the enemy king off: bring your rook to the 4th rank and "build a bridge" to block checks with it.</li>
<li><b>Philidor (drawing):</b> defend with the rook on your 3rd rank so the enemy king can't advance; once the pawn steps forward, drop the rook to the back and check from behind.</li>
<li><b>Rooks behind passed pawns</b>, yours or the opponent's. An <b>outside passed pawn</b> decoys the enemy king while your king feasts on the other wing.</li>
<li><b>Bishop vs. knight:</b> the bishop is better with pawns on both wings; the knight with pawns on one side. Wrong-coloured bishop + rook pawn is a draw.</li>
<li><b>Don't hurry:</b> improve every piece first, then break through.</li></ul></details>`;

  /* =====================================================================================
     STYLE
     ===================================================================================== */
  const CSS = `
.ag-chess{--bs:520px;font-family:var(--body);color:var(--fg);max-width:1100px;margin:0 auto;user-select:none;-webkit-user-select:none}
.ag-chess .hd{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px}
.ag-chess .ttl{flex:1;min-width:260px}
.ag-chess h2{font-family:var(--display);font-size:28px;font-weight:800;margin:0;line-height:1.1;letter-spacing:-.5px}
.ag-chess h2 span{color:var(--ember)}
.ag-chess .how{color:var(--muted);font-size:13px;margin-top:4px}
.ag-chess .tally{display:flex;gap:6px;align-items:stretch}
.ag-chess .tl{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:5px 12px;text-align:center;min-width:64px}
.ag-chess .tl b{display:block;font-size:10px;letter-spacing:1.3px;color:var(--muted)}
.ag-chess .tl i{font-style:normal;font-family:var(--display);font-weight:700;font-size:19px}
.ag-chess .tl.w i{color:var(--ok)} .ag-chess .tl.l i{color:var(--bad)}
.ag-chess .tl.lv{display:flex;align-items:center;font-size:11px;color:var(--muted);min-width:0}
.ag-chess .bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.ag-chess .seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px}
.ag-chess .seg button{height:28px;padding:0 10px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ag-chess .seg button.on{background:var(--panel2);color:var(--fg);box-shadow:inset 0 0 0 1px var(--line)}
.ag-chess .lbl{font-size:12px;color:var(--dim);margin-left:4px}
.ag-chess .sp{flex:1}
.ag-chess .btn.tog.on{border-color:var(--ember);color:var(--ember)}
.ag-chess .main{display:flex;gap:18px;align-items:flex-start;justify-content:center;flex-wrap:wrap}
.ag-chess .bcol{flex:none}
.ag-chess .plr{display:flex;align-items:center;gap:8px;height:32px;font-size:13px;padding-left:22px}
.ag-chess .plr .nm{font-weight:700}
.ag-chess .plr .chip{width:13px;height:13px;border-radius:4px;box-shadow:0 0 0 1px var(--line)}
.ag-chess .plr .chip.w{background:#f6ecdf} .ag-chess .plr .chip.b{background:#2a221d}
.ag-chess .plr .turn{width:7px;height:7px;border-radius:50%;background:var(--ember);box-shadow:0 0 8px var(--ember);opacity:0;transition:opacity .2s}
.ag-chess .plr .turn.on{opacity:1}
.ag-chess .caps{display:flex;align-items:center;margin-left:6px}
.ag-chess .caps svg{width:19px;height:19px;margin-right:-6px}
.ag-chess .caps .pb .b{stroke:#a8968a;stroke-width:5}
.ag-chess .caps .pw .b{stroke-width:5}
.ag-chess .adv{font-family:var(--mono);color:var(--muted);font-size:12px;margin-left:10px}
.ag-chess .brow{display:flex;gap:8px}
.ag-chess .evb{width:14px;height:var(--bs);border-radius:7px;background:#3a302a;position:relative;overflow:hidden;box-shadow:inset 0 0 0 1px var(--line);flex:none}
.ag-chess .evb .fill{position:absolute;left:0;right:0;bottom:0;height:50%;background:linear-gradient(90deg,#fffaf2,#e2d0bb);transition:height .45s ease}
.ag-chess .evb.flip .fill{bottom:auto;top:0}
.ag-chess .evb .mid{position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:var(--ember);opacity:.7}
.ag-chess .evb.off{visibility:hidden}
.ag-chess .board{position:relative;width:var(--bs);height:var(--bs);border-radius:6px;overflow:hidden;box-shadow:0 0 0 3px #2b211b,0 0 0 4px #4a3a2e,0 18px 40px rgba(0,0,0,.5);touch-action:none;cursor:pointer;flex:none}
.ag-chess .sqs{position:absolute;inset:0;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr)}
.ag-chess .sq{position:relative}
.ag-chess .sq.l{background:#ecdcc2} .ag-chess .sq.d{background:#a9774f}
.ag-chess .sq.last::before,.ag-chess .sq.sel::before,.ag-chess .sq.chk::before,.ag-chess .sq.hov::before{content:"";position:absolute;inset:0}
.ag-chess .sq.last::before{background:rgba(255,196,80,.42)}
.ag-chess .sq.sel::before{background:rgba(255,138,61,.6)}
.ag-chess .sq.hov::before{box-shadow:inset 0 0 0 calc(var(--bs)/130) rgba(255,255,255,.75)}
.ag-chess .sq.chk::before{background:radial-gradient(circle,rgba(255,50,40,1) 0,rgba(255,50,40,.7) 30%,rgba(255,50,40,0) 72%)}
.ag-chess .sq.dot::after{content:"";position:absolute;left:37%;top:37%;width:26%;height:26%;border-radius:50%;background:rgba(43,24,10,.32)}
.ag-chess .sq.cap::after{content:"";position:absolute;inset:3%;border-radius:50%;box-shadow:inset 0 0 0 calc(var(--bs)/95) rgba(43,24,10,.32)}
.ag-chess .co{position:absolute;font:700 calc(var(--bs)/50)/1 var(--body);pointer-events:none;opacity:.9}
.ag-chess .co.f{right:5%;bottom:4%} .ag-chess .co.r{left:5%;top:5%}
.ag-chess .sq.l .co{color:#a9774f} .ag-chess .sq.d .co{color:#ecdcc2}
.ag-chess .pcs{position:absolute;inset:0;pointer-events:none}
.ag-chess .pc{position:absolute;left:0;top:0;width:12.5%;height:12.5%;transition:transform .2s cubic-bezier(.3,.7,.3,1)}
.ag-chess .pc svg{width:100%;height:100%;display:block;filter:drop-shadow(0 2px 2px rgba(0,0,0,.4))}
.ag-chess .pc.drag{transition:none;z-index:5}
.ag-chess .pc.drag svg{transform:scale(1.14);filter:drop-shadow(0 8px 8px rgba(0,0,0,.45))}
.ag-chess .pw .b{fill:url(#agc-gw);stroke:#2b1d13;stroke-width:3;stroke-linejoin:round}
.ag-chess .pb .b{fill:url(#agc-gb);stroke:#0b0806;stroke-width:3;stroke-linejoin:round}
.ag-chess .pw .d{fill:none;stroke:#2b1d13;stroke-width:3;stroke-linecap:round}
.ag-chess .pb .d{fill:none;stroke:#e6d4bc;stroke-width:3;stroke-linecap:round}
.ag-chess .pw .df{fill:#2b1d13} .ag-chess .pb .df{fill:#e6d4bc}
.ag-chess .arw{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4}
.ag-chess .promo{position:absolute;width:12.5%;z-index:8;background:#fff7ec;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.65),0 0 0 2px var(--ember);display:flex;flex-direction:column;overflow:hidden}
.ag-chess .promo button{width:100%;aspect-ratio:1;display:block;padding:6%}
.ag-chess .promo button:hover{background:#ffd8b5}
.ag-chess .gover{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(18,14,12,.93);border:1px solid var(--line);border-radius:14px;padding:16px 26px;text-align:center;z-index:9;box-shadow:0 16px 40px rgba(0,0,0,.6);animation:agcpop .25s ease-out;pointer-events:none}
.ag-chess .gover b{display:block;font-family:var(--display);font-size:22px;color:var(--gold)}
.ag-chess .gover span{color:var(--muted);font-size:13px}
@keyframes agcpop{from{opacity:0;transform:translate(-50%,-44%)}to{opacity:1;transform:translate(-50%,-50%)}}
.ag-chess{container-type:inline-size}.ag-chess .main{display:grid!important;grid-template-columns:auto minmax(280px,1fr);align-items:start}@container (max-width:900px){.ag-chess .main{grid-template-columns:1fr;justify-items:center}.ag-chess .side{width:100%}}.ag-chess .side{min-width:0;max-width:620px;display:flex;flex-direction:column;gap:10px;padding-top:32px}
.ag-chess .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.ag-chess .status{font-weight:700;font-size:15px;display:flex;align-items:center;gap:8px;min-height:22px}
.ag-chess .status.think::after{content:"";width:12px;height:12px;border-radius:50%;border:2px solid var(--cool);border-right-color:transparent;animation:agcspin .8s linear infinite}
@keyframes agcspin{to{transform:rotate(360deg)}}
.ag-chess .opn{font-size:12.5px;color:var(--muted);margin-top:3px;min-height:18px}
.ag-chess .opn b{color:var(--gold);font-weight:600}
.ag-chess .evt{font-family:var(--mono);font-size:12px;color:var(--muted);float:right}
.ag-chess .coach .hdr{display:flex;align-items:center;gap:8px;font-size:10.5px;letter-spacing:1.3px;color:var(--muted);font-weight:800}
.ag-chess .coach .hdr .mule{width:20px;height:20px;border-radius:6px;background:var(--ember);color:var(--ember-ink);display:grid;place-items:center;font-size:11px;letter-spacing:0}
.ag-chess .badge{display:inline-block;padding:1px 9px;border-radius:999px;font-size:11.5px;font-weight:800;letter-spacing:.3px;margin-left:auto}
.ag-chess .ctext{font-size:13.5px;line-height:1.5;margin-top:7px;min-height:40px}
.ag-chess .ctext .mvn{font-family:var(--mono);font-weight:700}
.ag-chess .plan{font-size:12.5px;color:var(--muted);margin-top:8px;border-top:1px dashed var(--line);padding-top:7px}
.ag-chess .plan b{color:var(--cool);font-weight:700}
.ag-chess .mlist{max-height:190px;overflow:auto;font-family:var(--mono);font-size:13px;display:grid;grid-template-columns:34px 1fr 1fr;row-gap:1px;align-content:start}
.ag-chess .mlist .no{color:var(--dim);padding:2px 0}
.ag-chess .mv{cursor:pointer;padding:2px 6px;border-radius:5px;white-space:nowrap;justify-self:start}
.ag-chess .mv:hover{background:var(--panel2)}
.ag-chess .mv.cur{background:var(--panel2);box-shadow:inset 0 0 0 1px var(--ember)}
.ag-chess .mv i{font-style:normal;font-weight:800;margin-left:2px}
.ag-chess .nav{display:flex;gap:6px;margin-top:8px;align-items:center}
.ag-chess .nav .note{flex:1;font-size:12px;color:var(--gold)}
.ag-chess .review h4{margin:0 0 6px;font-size:12px;letter-spacing:1.2px;color:var(--muted)}
.ag-chess .acc{display:flex;gap:10px}
.ag-chess .acc div{flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:6px 10px;text-align:center}
.ag-chess .acc b{display:block;font-size:10px;letter-spacing:1.2px;color:var(--muted)}
.ag-chess .acc i{font-style:normal;font-family:var(--display);font-size:20px;font-weight:700}
.ag-chess .rvl{display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:170px;overflow:auto}
.ag-chess .rvl button{display:flex;gap:8px;align-items:center;text-align:left;padding:5px 8px;border-radius:8px;background:var(--panel2);font-size:12.5px}
.ag-chess .rvl button:hover{box-shadow:inset 0 0 0 1px var(--ember)}
.ag-chess .rvl .mvn{font-family:var(--mono);font-weight:700;min-width:84px}
.ag-chess .muted{color:var(--muted);font-size:12.5px}
.ag-chess details.guide{margin-top:14px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 14px;font-size:13px;color:var(--muted)}
.ag-chess details.guide>summary{cursor:pointer;color:var(--fg);font-weight:700;font-size:14px}
.ag-chess details.guide details{margin:8px 0 0 4px}
.ag-chess details.guide details summary{cursor:pointer;color:var(--ember);font-weight:700}
.ag-chess details.guide ul{margin:6px 0 4px;padding-left:18px}
.ag-chess details.guide li{margin:3px 0;line-height:1.45}
.ag-chess details.guide b{color:var(--fg)}
.ag-chess details.guide i{color:var(--gold);font-style:normal;font-family:var(--mono);font-size:12px}
`;
  const LBL = { Best: ['★', 'var(--ok)'], Excellent: ['!', 'var(--cool)'], Good: ['', '#d6c9bb'], Inaccuracy: ['?!', 'var(--gold)'], Mistake: ['?', 'var(--ember)'], Blunder: ['??', 'var(--bad)'] };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* =====================================================================================
     GAME UI
     ===================================================================================== */
  const WORKER_SRC = '(' + workerMain.toString() + ')((' + chessCore.toString() + ')());';
    let inst = null;

  function create(el, api) {
    if (!document.getElementById('ag-' + ID + '-css')) {
      const st = document.createElement('style'); st.id = 'ag-' + ID + '-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    initOpenings();
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const opts = Object.assign({ level: 'casual', side: 'white', coach: true, flip: false }, api.load('opts') || {});
    if (!LEVELS[opts.level]) opts.level = 'casual';
    if (['white', 'black', 'random'].indexOf(opts.side) < 0) opts.side = 'white';
    const stats = {}, ls = api.load('stats') || {};
    for (const k of LVL_KEYS) stats[k] = Object.assign({ w: 0, l: 0, d: 0 }, ls[k] || {});
    let soundOn = api.load('sound'); if (soundOn === null) soundOn = !!api.sound;
    let actx = null;
    function tone(f, d, type, vol, f2) {
      if (!soundOn) return;
      try {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
      } catch (e) { /* ignore */ }
    }

    /* ---------- search worker ---------- */
    let worker = null, wurl = null, reqId = 0, local = null, alive = true;
    const pending = new Map();
    function runLocal(msg) {
      if (!local) local = C.makeSearcher();
      const pos = new C.Position().setFen(msg.fen);
      for (const u of msg.moves || []) { const m = C.parseUci(pos, u); if (!m) break; pos.make(m); }
      const r = local.think(pos, Object.assign({}, msg, { time: Math.min(msg.time || 500, 600) }));
      return { id: msg.id, move: r.move ? C.toUci(r.move) : null, score: r.score, depth: r.depth, pv: r.pv.map(C.toUci), nodes: r.nodes, side: pos.side };
    }
    function startWorker() {
      try {
        if (!wurl) wurl = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
        const w = new Worker(wurl);
        w.onmessage = e => { const d = e.data, r = pending.get(d.id); if (r) { pending.delete(d.id); r.res(d); } };
        w.onerror = ev => {
          if (ev && ev.preventDefault) ev.preventDefault();
          if (worker !== w) return;
          try { w.terminate(); } catch (e) { /* ignore */ }
          worker = null;
          const left = [...pending.values()]; pending.clear();
          for (const p of left) later(() => p.res(runLocal(p.msg)), 10);
        };
        worker = w;
      } catch (e) { worker = null; }
    }
    function ask(msg) {
      return new Promise(res => {
        msg.id = ++reqId;
        if (worker) { pending.set(msg.id, { res, msg }); worker.postMessage(msg); }
        else later(() => { if (alive) res(runLocal(msg)); }, 20);
      });
    }
    function resetWorker() {
      if (worker && pending.size) { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; pending.clear(); startWorker(); }
      analP = {};
    }
    startWorker();

    /* ---------- DOM ---------- */
    const root = document.createElement('div'); root.className = 'ag-chess';
    root.innerHTML = `
<div class="hd"><div class="ttl"><h2>Mule <span>Gambit</span></h2><div class="how">Chess against the Mule. Click or drag a piece to move; your coach grades every move and explains why. Use ← → to step through the game.</div></div>
<div class="tally"><div class="tl lv" data-r="tlv"></div><div class="tl w"><b>WON</b><i data-r="tw">0</i></div><div class="tl l"><b>LOST</b><i data-r="tl">0</i></div><div class="tl"><b>DRAWN</b><i data-r="td">0</i></div></div></div>
<div class="bar">
<button class="btn pri small" data-r="new">New game</button>
<span class="lbl">Play as</span><div class="seg" data-r="side"><button data-v="white">White</button><button data-v="black">Black</button><button data-v="random">Random</button></div>
<span class="lbl">Level</span><div class="seg" data-r="lvl">${LVL_KEYS.map(k => `<button data-v="${k}">${LEVELS[k].label}</button>`).join('')}</div>
<span class="sp"></span>
<button class="btn sec small" data-r="undo" title="Take back your last move">↶ Undo</button>
<button class="btn sec small" data-r="hint" title="Show the best move">💡 Hint</button>
<button class="btn sec small" data-r="flip" title="Flip the board">⇅ Flip</button>
<button class="btn sec small tog" data-r="coach" title="Toggle the coach"></button>
<button class="btn sec small" data-r="snd" title="Sound"></button></div>
<div class="main">
<div class="bcol"><div class="plr" data-r="ptop"></div>
<div class="brow"><div class="evb" data-r="evb"><div class="fill" data-r="evf"></div><div class="mid"></div></div>
<div class="board" data-r="board"><div class="sqs" data-r="sqs"></div><div class="pcs" data-r="pcs"></div><svg class="arw" data-r="arw" viewBox="0 0 8 8"></svg></div></div>
<div class="plr" data-r="pbot"></div></div>
<div class="side">
<div class="card"><div class="status" data-r="status"></div><div class="opn"><span class="evt" data-r="evt"></span><span data-r="opn"></span></div></div>
<div class="card coach"><div class="hdr"><span class="mule">VM</span>COACH<span class="badge" data-r="badge" hidden></span></div><div class="ctext" data-r="ctext"></div><div class="plan" data-r="plan" hidden></div></div>
<div class="card review" data-r="review" hidden></div>
<div class="card"><div class="mlist" data-r="ml"></div><div class="nav"><button class="btn sec small" data-r="first" title="Start">⏮</button><button class="btn sec small" data-r="prev" title="Back (←)">◀</button><button class="btn sec small" data-r="next" title="Forward (→)">▶</button><button class="btn sec small" data-r="last" title="Current position">⏭</button><span class="note" data-r="vnote"></span></div></div>
</div></div>
<details class="guide" data-r="guide"><summary>Strategy guide</summary>${GUIDE}</details>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<linearGradient id="agc-gw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf8"/><stop offset="1" stop-color="#dcc7ad"/></linearGradient>
<linearGradient id="agc-gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5e4f45"/><stop offset="1" stop-color="#17110e"/></linearGradient></defs></svg>`;
    el.appendChild(root);
    const $ = r => root.querySelector('[data-r="' + r + '"]');
    const boardEl = $('board'), sqsEl = $('sqs'), pcsEl = $('pcs'), arwEl = $('arw'), evbEl = $('evb'), evfEl = $('evf');

    /* ---------- state ---------- */
    let G = null, gen = 0, analP = {}, thinking = false, viewPly = null, sel = -1, drag = null, promo = null;
    let arrows = [], focusAnn = -1, coachBusy = false, hintInfo = null, review = null, reviewing = 0, sqEl = {}, builtFlip = null, legalCache = null;

    const sideAt = i => (G.startSide + i) & 1;
    const flipped = () => (G.user === 1) !== !!opts.flip;
    const curPly = () => viewPly === null ? G.moves.length : viewPly;
    const live = () => viewPly === null;
    function replay(start, moves) {
      const pos = new C.Position().setFen(start), fens = [pos.fen()], sans = [];
      for (const u of moves) {
        const m = C.parseUci(pos, u);
        if (!m) return null;
        sans.push(C.san(pos, m)); pos.make(m); fens.push(pos.fen());
      }
      return { pos, fens, sans };
    }
    function save() {
      if (!G) return;
      api.save('game', { st: G.start, u: G.user, lv: G.level, mv: G.moves, an: G.anal.map(a => a ? [a.s, a.d, a.b] : null), nn: G.ann, ov: G.over, ct: G.counted });
    }
    function restore(s) {
      try {
        if (!s || !Array.isArray(s.mv) || !LEVELS[s.lv]) return false;
        const r = replay(s.st || START, s.mv);
        if (!r) return false;
        G = { start: s.st || START, startSide: new C.Position().setFen(s.st || START).side, user: s.u ? 1 : 0, level: s.lv, moves: s.mv.slice(), sans: r.sans, fens: r.fens,
          anal: (s.an || []).map(a => a ? { s: a[0], d: a[1], b: a[2], pv: null } : null), ann: (s.nn || []).slice(0, s.mv.length), over: s.ov || null, counted: !!s.ct, pos: r.pos, opn: [] };
        if (G.anal.length > G.moves.length + 1) G.anal.length = G.moves.length + 1;
        return true;
      } catch (e) { return false; }
    }
    function resetView() { viewPly = null; sel = -1; arrows = []; focusAnn = -1; hintInfo = null; closePromo(); legalCache = null; }
    function newGame(o) {
      o = o || {};
      gen++; resetWorker(); timers.forEach(clearTimeout); timers.clear();
      if (worker) worker.postMessage({ cmd: 'clear' });
      const start = o.start || START, pos = new C.Position().setFen(start);
      let side = o.side || opts.side;
      if (side === 'random') side = Math.random() < 0.5 ? 'white' : 'black';
      G = { start, startSide: pos.side, user: side === 'black' ? 1 : 0, level: o.level || opts.level, moves: [], sans: [], fens: [pos.fen()], anal: [], ann: [], over: null, counted: false, pos, opn: [] };
      thinking = false; coachBusy = false; review = null; reviewing = 0;
      resetView(); save(); render(); nextTurn();
    }
    function legalNow() {
      if (!legalCache || legalCache.n !== G.moves.length) legalCache = { n: G.moves.length, list: G.pos.legal() };
      return legalCache.list;
    }
    const canUserMove = () => G && !G.over && !thinking && live() && !promo && sideAt(G.moves.length) === G.user;
    const targetsOf = s => legalNow().filter(m => C.mFrom(m) === s).map(m => C.mTo(m));

    /* ---------- analysis / coach ---------- */
    function analyze(i, o) {
      if (G.anal[i]) return Promise.resolve(G.anal[i]);
      if (analP[i]) return analP[i];
      const g = gen;
      const p = ask({ cmd: 'search', fen: G.start, moves: G.moves.slice(0, i), time: (o && o.time) || 450, depth: (o && o.depth) || 14, noise: 0 }).then(r => {
        if (g !== gen || !G) return null;
        delete analP[i];
        const e = { s: r.side ? -r.score : r.score, d: r.depth, b: r.move, pv: r.pv };
        G.anal[i] = e;
        fixTerminal(i);
        return G.anal[i];
      });
      analP[i] = p;
      return p;
    }
    function fixTerminal(i) {
      const e = G.anal[i];
      if (!e || i !== G.moves.length || !G.over) return;
      if (G.over.why !== 'checkmate') { e.s = 0; e.b = null; }
      else { e.s = sideAt(i) ? MATE : -MATE; e.b = null; }
    }
    async function coachMove(i) {
      const g = gen;
      coachBusy = true; renderSide();
      const pre = await analyze(i);
      if (g !== gen || !pre) return;
      const post = await analyze(i + 1, { depth: Math.max(1, pre.d - 1), time: 1500 });
      if (g !== gen || !post) return;
      coachBusy = false;
      const a = annotate(G.fens[i], G.moves[i], pre, post, i);
      if (a) { G.ann[i] = a; if (focusAnn === -1 || focusAnn < i) focusAnn = i; }
      save(); renderSide();
    }
    function bookMove() {
      if (G.start !== START || G.moves.length > 24) return null;
      const arr = OPEN.book.get(posKey(G.pos));
      return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
    }
    async function engineTurn() {
      const g = gen, n = G.moves.length, t0 = performance.now();
      thinking = true; renderSide();
      if (opts.coach && n > 0 && sideAt(n - 1) === G.user && !G.ann[n - 1]) {
        await coachMove(n - 1);
        if (g !== gen) return;
      }
      let u = bookMove();
      if (!u) {
        const L = LEVELS[G.level];
        const depth = G.level === 'beginner' ? (Math.random() < 0.5 ? 1 : 2) : L.depth;
        const r = await ask({ cmd: 'search', fen: G.start, moves: G.moves.slice(), time: L.time, depth, noise: L.noise });
        if (g !== gen) return;
        u = r.move;
      }
      if (!u) { thinking = false; renderSide(); return; }
      later(() => { if (g !== gen) return; thinking = false; playMove(u, true); }, Math.max(0, 420 - (performance.now() - t0)));
    }
    function nextTurn() {
      if (!G || G.over) { thinking = false; renderSide(); return; }
      const n = G.moves.length;
      if (sideAt(n) === G.user) {
        thinking = false; renderSide();
        if (opts.coach) { const g = gen; analyze(n).then(e => { if (e && g === gen) { renderEval(); renderSide(); } }); }
      } else engineTurn();
    }
    function checkOver() {
      const p = G.pos;
      let o = null;
      if (!p.legal().length) o = p.inCheck() ? { r: p.side ? '1-0' : '0-1', why: 'checkmate' } : { r: 'draw', why: 'stalemate' };
      else if (p.half >= 100) o = { r: 'draw', why: '50-move rule' };
      else if (p.repCount() >= 2) o = { r: 'draw', why: 'threefold repetition' };
      else if (p.insufficient()) o = { r: 'draw', why: 'insufficient material' };
      G.over = o;
    }
    function playMove(u, anim) {
      const m = C.parseUci(G.pos, u);
      if (!m) return false;
      const san = C.san(G.pos, m, legalNow()), fl = C.mFlags(m), byUser = sideAt(G.moves.length) === G.user;
      G.pos.make(m);
      G.moves.push(u); G.sans.push(san); G.fens.push(G.pos.fen());
      legalCache = null; viewPly = null; sel = -1; arrows = []; hintInfo = null; closePromo();
      if (byUser) { focusAnn = -1; coachBusy = !!opts.coach; }
      if (/#/.test(san)) { tone(660, 0.12, 'triangle', 0.06); later(() => tone(990, 0.2, 'triangle', 0.06), 110); }
      else if (/\+/.test(san)) tone(880, 0.09, 'sine', 0.05);
      else if (fl & C.F_CAP) tone(260, 0.08, 'square', 0.035, 160);
      else tone(byUser ? 540 : 430, 0.05, 'triangle', 0.05, byUser ? 420 : 340);
      checkOver();
      save();
      renderBoard(anim ? m : 0); renderSide();
      if (G.over) finish(); else nextTurn();
      return true;
    }
    function userMove(u, anim) { if (!canUserMove()) return false; return playMove(u, anim); }
    function finish() {
      const o = G.over;
      if (!G.counted) {
        const s = stats[G.level], won = (o.r === '1-0' && G.user === 0) || (o.r === '0-1' && G.user === 1);
        if (o.r === 'draw') { s.d++; tone(420, 0.2, 'sine', 0.04); }
        else if (won) { s.w++; tone(523, 0.12, 'triangle', 0.06); later(() => tone(659, 0.12, 'triangle', 0.06), 120); later(() => tone(784, 0.25, 'triangle', 0.06), 240); }
        else { s.l++; tone(330, 0.25, 'sawtooth', 0.035, 150); }
        G.counted = true; api.save('stats', stats);
      }
      thinking = false; coachBusy = false; save(); render();
      runReview();
    }
    async function runReview() {
      const g = gen, n = G.moves.length;
      let lastUser = -1;
      for (let i = n - 1; i >= 0; i--) if (sideAt(i) === G.user) { lastUser = i; break; }
      if (opts.coach && lastUser >= 0 && !G.ann[lastUser]) { await coachMove(lastUser); if (g !== gen) return; }
      reviewing = 0.001; renderSide();
      for (let i = 0; i <= n; i++) {
        if (!G.anal[i]) { await analyze(i, { time: 220, depth: 10 }); if (g !== gen) return; }
        reviewing = Math.max(0.001, i / Math.max(1, n)); renderReview();
      }
      fixTerminal(n);
      for (let i = 0; i < n; i++) if (sideAt(i) === G.user && !G.ann[i] && G.anal[i] && G.anal[i + 1]) G.ann[i] = annotate(G.fens[i], G.moves[i], G.anal[i], G.anal[i + 1], i);
      reviewing = 0; computeReview(); save(); renderSide();
    }
    function computeReview() {
      const acc = [[], []];
      for (let i = 0; i < G.moves.length; i++) {
        const a = G.anal[i], b = G.anal[i + 1];
        if (!a || !b) continue;
        const s = sideAt(i), sg = s ? -1 : 1;
        const d = Math.max(0, winPct(cpEff(a.s * sg)) - winPct(cpEff(b.s * sg)));
        acc[s].push(Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * d) - 3.1669)));
      }
      const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
      const mistakes = [];
      for (let i = 0; i < G.moves.length; i++) if (sideAt(i) === G.user && G.ann[i] && ['Inaccuracy', 'Mistake', 'Blunder'].indexOf(G.ann[i].l) >= 0) mistakes.push(i);
      review = { you: avg(acc[G.user]), mule: avg(acc[G.user ^ 1]), mistakes };
    }
    function undo() {
      if (!G || promo) return;
      let userMoves = 0;
      for (let i = 0; i < G.moves.length; i++) if (sideAt(i) === G.user) userMoves++;
      if (!userMoves) return;
      gen++; resetWorker(); timers.forEach(clearTimeout); timers.clear();
      thinking = false; coachBusy = false; review = null; reviewing = 0;
      do {
        G.moves.pop(); G.sans.pop(); G.fens.pop();
      } while (G.moves.length && sideAt(G.moves.length) !== G.user);
      G.ann.length = Math.min(G.ann.length, G.moves.length);
      if (G.anal.length > G.moves.length + 1) G.anal.length = G.moves.length + 1;
      G.opn.length = Math.min(G.opn.length, G.moves.length + 1);
      G.pos = replay(G.start, G.moves).pos; G.over = null;
      resetView();
      for (let i = G.moves.length - 1; i >= 0; i--) if (G.ann[i]) { focusAnn = i; break; }
      tone(380, 0.06, 'triangle', 0.04, 300);
      save(); render(); nextTurn();
    }
    async function hint() {
      if (!canUserMove()) return;
      const g = gen, n = G.moves.length;
      hintInfo = { wait: true }; renderSide();
      const e = await analyze(n);
      if (g !== gen || !e || !e.b || G.moves.length !== n) { hintInfo = null; renderSide(); return; }
      const m = C.parseUci(G.pos, e.b);
      if (!m) { hintInfo = null; renderSide(); return; }
      arrows = [{ f: C.mFrom(m), t: C.mTo(m), c: 'hint' }];
      hintInfo = { san: C.san(G.pos, m), why: goodReasons(G.pos.clone(), m, n).slice(0, 2).join(' and ') };
      tone(880, 0.08, 'sine', 0.04);
      renderBoard(); renderSide();
    }
    function openingName(ply) {
      if (G.start !== START) return null;
      let name = null;
      for (let i = 0; i <= ply && i < G.fens.length; i++) {
        if (G.opn[i] === undefined) G.opn[i] = openingAt(G.fens[i].split(' ').slice(0, 4).join(' ')) || null;
        if (G.opn[i]) name = G.opn[i];
      }
      return name;
    }

    /* ---------- rendering ---------- */
    function dispXY(s) { const f = s & 7, r = s >> 4; return flipped() ? [7 - f, r] : [f, 7 - r]; }
    function buildSquares() {
      const fl = flipped();
      let h = '';
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const f = fl ? 7 - col : col, r = fl ? row : 7 - row, s = r * 16 + f;
        let co = '';
        if (row === 7) co += `<span class="co f">${'abcdefgh'[f]}</span>`;
        if (col === 0) co += `<span class="co r">${r + 1}</span>`;
        h += `<div class="sq ${(f + r) & 1 ? 'l' : 'd'}" data-s="${s}">${co}</div>`;
      }
      sqsEl.innerHTML = h;
      sqEl = {};
      sqsEl.querySelectorAll('.sq').forEach(d => { sqEl[+d.dataset.s] = d; });
      builtFlip = fl;
    }
    function viewPos() { return live() ? G.pos : new C.Position().setFen(G.fens[viewPly]); }
    function renderBoard(anim) {
      if (builtFlip !== flipped()) buildSquares();
      const p = viewPos(), ply = curPly(), lu = ply > 0 ? G.moves[ply - 1] : null;
      const lf = lu ? C.parseSq(lu.slice(0, 2)) : -1, lt = lu ? C.parseSq(lu.slice(2, 4)) : -1;
      const chk = p.inCheck() ? p.ks[p.side] : -1;
      const tg = sel >= 0 && live() ? targetsOf(sel) : [];
      for (const k in sqEl) {
        const s = +k, d = sqEl[k], isT = tg.indexOf(s) >= 0;
        d.classList.toggle('last', s === lf || s === lt);
        d.classList.toggle('sel', s === sel);
        d.classList.toggle('chk', s === chk);
        d.classList.toggle('dot', isT && !p.b[s]);
        d.classList.toggle('cap', isT && !!p.b[s]);
        d.classList.remove('hov');
      }
      let h = '';
      for (let i = 0; i < 64; i++) {
        const s = C.SQ64[i], q = p.b[s];
        if (!q) continue;
        const [x, y] = dispXY(s);
        h += `<div class="pc" data-s="${s}" style="transform:translate(${x * 100}%,${y * 100}%)">${pieceSVG(q)}</div>`;
      }
      pcsEl.innerHTML = h;
      if (anim) {
        const go = (from, to) => {
          const e = pcsEl.querySelector('.pc[data-s="' + to + '"]');
          if (!e) return;
          const [x0, y0] = dispXY(from), [x1, y1] = dispXY(to);
          e.style.transition = 'none'; e.style.transform = `translate(${x0 * 100}%,${y0 * 100}%)`;
          void e.offsetWidth;
          e.style.transition = ''; e.style.transform = `translate(${x1 * 100}%,${y1 * 100}%)`;
        };
        go(C.mFrom(anim), C.mTo(anim));
        if (C.mFlags(anim) & C.F_CASTLE) { const f = C.mFrom(anim), t = C.mTo(anim); if (t > f) go(f + 3, f + 1); else go(f - 4, f - 1); }
      }
      const old = boardEl.querySelector('.gover');
      if (old) old.remove();
      if (G.over && live()) {
        const o = G.over, won = (o.r === '1-0' && G.user === 0) || (o.r === '0-1' && G.user === 1);
        const d = document.createElement('div'); d.className = 'gover';
        d.innerHTML = `<b>${o.r === 'draw' ? 'Draw' : won ? 'You win!' : 'Mule wins'}</b><span>${esc(o.why)} · ${o.r === 'draw' ? '½-½' : o.r}</span>`;
        boardEl.appendChild(d);
      }
      drawArrows();
      renderEval();
    }
    function drawArrows() {
      let h = '';
      for (const a of arrows) {
        const [x0, y0] = dispXY(a.f), [x1, y1] = dispXY(a.t);
        const cx0 = x0 + 0.5, cy0 = y0 + 0.5, cx1 = x1 + 0.5, cy1 = y1 + 0.5;
        const dx = cx1 - cx0, dy = cy1 - cy0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
        const sx = cx0 + ux * 0.25, sy = cy0 + uy * 0.25, ex = cx1 - ux * 0.1, ey = cy1 - uy * 0.1, bx = ex - ux * 0.42, by = ey - uy * 0.42, w = 0.085, hw = 0.25;
        const pts = [[sx + nx * w, sy + ny * w], [bx + nx * w, by + ny * w], [bx + nx * hw, by + ny * hw], [ex, ey], [bx - nx * hw, by - ny * hw], [bx - nx * w, by - ny * w], [sx - nx * w, sy - ny * w]];
        const col = a.c === 'hint' ? 'rgba(255,200,97,.9)' : a.c === 'best' ? 'rgba(111,211,199,.92)' : 'rgba(255,90,82,.8)';
        h += `<polygon points="${pts.map(q => q[0].toFixed(3) + ',' + q[1].toFixed(3)).join(' ')}" fill="${col}" stroke="rgba(0,0,0,.35)" stroke-width=".025" stroke-linejoin="round"/>`;
      }
      arwEl.innerHTML = h;
    }
    const fmtEval = s => {
      if (Math.abs(s) > MATE - 500) { const n = Math.ceil((MATE - Math.abs(s)) / 2); return n === 0 ? (s > 0 ? '1-0' : '0-1') : (s > 0 ? '+M' : '-M') + n; }
      return (s > 0 ? '+' : s < 0 ? '−' : '') + (Math.abs(s) / 100).toFixed(1);
    };
    function renderEval() {
      evbEl.classList.toggle('off', !opts.coach);
      evbEl.classList.toggle('flip', flipped());
      const ev = $('evt');
      if (!opts.coach) { ev.textContent = ''; return; }
      const ply = curPly();
      let e = G.anal[ply];
      if (!e && ply > 0) e = G.anal[ply - 1];
      if (!e) { if (!G.moves.length) { evfEl.style.height = '50%'; ev.textContent = ''; } return; }
      const s = e.s, pct = Math.abs(s) > MATE - 500 ? (s > 0 ? 100 : 0) : winPct(s);
      evfEl.style.height = pct.toFixed(1) + '%';
      ev.textContent = fmtEval(s);
      ev.title = 'Evaluation (White’s view, in pawns)';
    }
    function resultText() {
      const o = G.over, won = (o.r === '1-0' && G.user === 0) || (o.r === '0-1' && G.user === 1);
      if (o.r === 'draw') return 'Draw by ' + o.why;
      return (won ? 'You win by ' : 'The Mule wins by ') + o.why;
    }
    function renderPlayers() {
      const count = pp => { const c = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]]; for (let i = 0; i < 64; i++) { const q = pp.b[C.SQ64[i]]; if (q) c[q >> 3][q & 7]++; } return c; };
      if (!G.startCnt) G.startCnt = count(new C.Position().setFen(G.start));
      const p = viewPos(), cnt = count(p), sc = G.startCnt;
      const mat = c => cnt[c].reduce((s, n, t) => s + n * VAL[t], 0), diff = mat(0) - mat(1);
      const row = c => {
        const o = c ^ 1, caps = [];
        for (const t of [5, 4, 3, 2, 1]) for (let k = cnt[o][t]; k < sc[o][t]; k++) caps.push(t | (o << 3));
        const adv = c ? -diff : diff;
        return `<span class="chip ${c ? 'b' : 'w'}"></span><span class="nm">${c === G.user ? 'You' : 'Mule · ' + LEVELS[G.level].label}</span><span class="turn${!G.over && sideAt(curPly()) === c ? ' on' : ''}"></span><span class="caps">${caps.map(pieceSVG).join('')}</span>${adv > 0 ? `<span class="adv">+${Math.round(adv / 100)}</span>` : ''}`;
      };
      const top = flipped() ? 0 : 1;
      $('ptop').innerHTML = row(top); $('pbot').innerHTML = row(top ^ 1);
    }
    function renderCoach() {
      const badge = $('badge'), ct = $('ctext'), plan = $('plan');
      badge.hidden = true; plan.hidden = true;
      const n = G.moves.length;
      if (hintInfo && live()) {
        ct.innerHTML = hintInfo.wait ? 'Looking for the best move…' : `Hint: <span class="mvn">${esc(hintInfo.san)}</span> — it ${esc(hintInfo.why)}.`;
        badge.hidden = false; badge.textContent = 'HINT'; badge.style.background = 'var(--gold)'; badge.style.color = '#1b1203';
        return;
      }
      let idx = focusAnn;
      if (!live()) idx = G.ann[curPly()] && review && review.mistakes.indexOf(curPly()) >= 0 && focusAnn === curPly() ? curPly() : curPly() - 1;
      const a = idx >= 0 ? G.ann[idx] : null;
      if (a) {
        const L = LBL[a.l] || LBL.Good;
        badge.hidden = false; badge.textContent = a.l.toUpperCase(); badge.style.background = L[1]; badge.style.color = '#160d06';
        const no = Math.floor((G.startSide + idx) / 2) + 1;
        ct.innerHTML = `<span class="mvn">${no}${sideAt(idx) ? '…' : '.'} ${esc(G.sans[idx])}</span> — ${esc(a.t)}`;
      } else if (coachBusy && opts.coach && live()) ct.textContent = 'Looking at your move…';
      else if (!opts.coach) ct.innerHTML = '<span class="muted">The coach is off. Turn it on for move-by-move feedback, the evaluation bar, and a full post-game review. Hints still work.</span>';
      else if (!n || (n === 1 && sideAt(0) !== G.user)) ct.textContent = 'Play your move. I will grade each one (Best → Blunder), explain why, and point out the stronger idea when there is one.';
      else if (!live()) ct.innerHTML = '<span class="muted">Viewing an earlier position.</span>';
      else ct.textContent = 'Your move.';
      if (opts.coach && live() && !G.over && sideAt(n) === G.user) { plan.hidden = false; plan.innerHTML = '<b>Plan:</b> ' + esc(planTip(G.pos, G.user, n)); }
    }
    function renderMoves() {
      const ml = $('ml'), cp = curPly();
      let h = '';
      for (let i = 0; i < G.moves.length; i++) {
        const side = sideAt(i), no = Math.floor((G.startSide + i) / 2) + 1;
        if (side === 0 || i === 0) { h += `<span class="no">${no}.</span>`; if (side === 1) h += '<span class="mv">…</span>'; }
        const a = G.ann[i], g = a ? LBL[a.l] : null;
        h += `<span class="mv${cp === i + 1 ? ' cur' : ''}" data-p="${i + 1}">${esc(G.sans[i])}${g && g[0] ? `<i style="color:${g[1]}">${g[0]}</i>` : ''}</span>`;
      }
      ml.innerHTML = h || '<span class="muted" style="grid-column:1/-1">No moves yet.</span>';
      if (live()) ml.scrollTop = ml.scrollHeight;
      else { const c = ml.querySelector('.mv.cur'); if (c) { const top = c.offsetTop - ml.offsetTop; if (top < ml.scrollTop || top > ml.scrollTop + ml.clientHeight - 20) ml.scrollTop = top - 60; } }
      $('vnote').textContent = live() ? '' : 'Viewing move ' + cp + ' of ' + G.moves.length;
      $('first').disabled = cp === 0; $('prev').disabled = cp === 0;
      $('next').disabled = live(); $('last').disabled = live();
    }
    function renderReview() {
      const rv = $('review');
      if (!G.over) { rv.hidden = true; return; }
      rv.hidden = false;
      if (reviewing) { rv.innerHTML = `<h4>GAME REVIEW</h4><div class="muted">Analyzing the game… ${Math.round(reviewing * 100)}%</div>`; return; }
      if (!review) { rv.innerHTML = '<h4>GAME REVIEW</h4><div class="muted">Preparing…</div>'; return; }
      const f = v => v === null ? '–' : v.toFixed(1) + '%';
      let h = `<h4>GAME REVIEW</h4><div class="acc"><div><b>YOUR ACCURACY</b><i style="color:var(--ember)">${f(review.you)}</i></div><div><b>MULE</b><i style="color:var(--cool)">${f(review.mule)}</i></div></div>`;
      if (review.mistakes.length) {
        h += '<div class="rvl">' + review.mistakes.map(i => {
          const a = G.ann[i], L = LBL[a.l], no = Math.floor((G.startSide + i) / 2) + 1;
          return `<button data-rv="${i}"><span class="mvn">${no}${sideAt(i) ? '…' : '.'} ${esc(G.sans[i])}<i style="color:${L[1]};font-style:normal"> ${L[0]}</i></span><span style="color:${L[1]};font-weight:700">${a.l}</span><span class="muted">${a.b ? 'best ' + esc(a.b) : ''}</span></button>`;
        }).join('') + '</div><div class="muted" style="margin-top:6px">Click a move to see the position and the better idea.</div>';
      } else h += '<div class="muted" style="margin-top:8px">No inaccuracies, mistakes or blunders. Clean game!</div>';
      rv.innerHTML = h;
    }
    function hud() {
      const t = stats[G.level];
      $('tlv').textContent = LEVELS[G.level].label;
      $('tw').textContent = t.w; $('tl').textContent = t.l; $('td').textContent = t.d;
      root.querySelectorAll('[data-r="lvl"] button').forEach(b => b.classList.toggle('on', b.dataset.v === opts.level));
      root.querySelectorAll('[data-r="side"] button').forEach(b => b.classList.toggle('on', b.dataset.v === opts.side));
      $('snd').textContent = soundOn ? '🔊' : '🔇';
      const cb = $('coach'); cb.textContent = opts.coach ? '🎓 Coach on' : '🎓 Coach off'; cb.classList.toggle('on', !!opts.coach);
      $('hint').disabled = !canUserMove();
      let um = false; for (let i = 0; i < G.moves.length; i++) if (sideAt(i) === G.user) { um = true; break; }
      $('undo').disabled = !um || !!promo;
      boardEl.style.cursor = canUserMove() ? 'pointer' : 'default';
    }
    function renderSide() {
      const st = $('status'), n = G.moves.length;
      let s = '', cls = '';
      if (G.over) s = resultText();
      else if (thinking) { s = 'Mule is thinking'; cls = ' think'; }
      else if (sideAt(n) === G.user) s = G.pos.inCheck() ? 'Check! Your move' : 'Your move';
      st.textContent = s; st.className = 'status' + cls;
      const on = openingName(curPly());
      $('opn').innerHTML = on ? 'Opening: <b>' + esc(on) + '</b>' : (curPly() === 0 && G.start === START ? 'Opening: <b>starting position</b>' : '');
      renderCoach(); renderMoves(); renderReview(); renderPlayers(); renderEval(); hud();
    }
    function render() { renderBoard(0); renderSide(); }
    function fit() {
      const w = root.clientWidth || 1000, top = el.getBoundingClientRect().top;
      const hAvail = window.innerHeight - Math.max(0, top) - 200;
      const maxW = w >= 900 ? w - 340 : w - 30;
      const bs = Math.max(304, Math.floor(Math.min(600, maxW, Math.max(304, hAvail)) / 8) * 8);
      root.style.setProperty('--bs', bs + 'px');
    }

    /* ---------- input ---------- */
    function sqAt(e) {
      const r = boardEl.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * 8), y = Math.floor((e.clientY - r.top) / r.height * 8);
      if (x < 0 || x > 7 || y < 0 || y > 7) return -1;
      return flipped() ? y * 16 + (7 - x) : (7 - y) * 16 + x;
    }
    function closePromo() { if (promo) { promo.el.remove(); promo = null; } }
    function openPromo(from, to) {
      const [x, y] = dispXY(to), d = document.createElement('div');
      d.className = 'promo'; d.style.left = (x * 12.5) + '%';
      if (y === 0) d.style.top = '0'; else d.style.bottom = '0';
      d.innerHTML = [5, 4, 3, 2].map(t => `<button data-pr="${' pnbrqk'[t]}" title="${PN[t]}">${pieceSVG(t | (G.user << 3))}</button>`).join('');
      boardEl.appendChild(d);
      promo = { el: d, u: sqN(from) + sqN(to) };
      hud();
    }
    function tryMove(from, to, dragged) {
      const ms = legalNow().filter(m => C.mFrom(m) === from && C.mTo(m) === to);
      if (!ms.length) return false;
      if (ms.length > 1) { renderBoard(); openPromo(from, to); return true; }
      return userMove(C.toUci(ms[0]), !dragged);
    }
    function onDown(e) {
      if (e.button !== 0 || !G) return;
      if (promo) {
        const b = e.target.closest('[data-pr]');
        const u = promo.u; closePromo();
        if (b) userMove(u + b.dataset.pr, false); else { sel = -1; renderBoard(); }
        hud(); e.preventDefault(); return;
      }
      if (!live()) { viewPly = null; arrows = []; focusAnn = -1; for (let i = G.moves.length - 1; i >= 0; i--) if (G.ann[i]) { focusAnn = i; break; } render(); return; }
      const s = sqAt(e);
      if (s < 0 || !canUserMove()) return;
      if (sel >= 0 && s !== sel && targetsOf(sel).indexOf(s) >= 0) { tryMove(sel, s, false); e.preventDefault(); return; }
      const p = G.pos.b[s];
      if (p && (p >> 3) === G.user) {
        const was = sel === s;
        sel = s; renderBoard();
        const pe = pcsEl.querySelector('.pc[data-s="' + s + '"]');
        drag = { from: s, el: pe, x0: e.clientX, y0: e.clientY, moved: false, was, hov: -1 };
        try { boardEl.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
        e.preventDefault();
      } else if (sel >= 0) { sel = -1; renderBoard(); }
    }
    function onMoveP(e) {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.moved = true;
      const r = boardEl.getBoundingClientRect(), q = r.width / 8;
      if (drag.el) { drag.el.classList.add('drag'); drag.el.style.transform = `translate(${e.clientX - r.left - q / 2}px,${e.clientY - r.top - q / 2}px)`; }
      const s = sqAt(e);
      if (s !== drag.hov) {
        if (drag.hov >= 0 && sqEl[drag.hov]) sqEl[drag.hov].classList.remove('hov');
        drag.hov = s;
        if (s >= 0 && sqEl[s]) sqEl[s].classList.add('hov');
      }
    }
    function onUp(e) {
      if (!drag) return;
      const d = drag; drag = null;
      try { boardEl.releasePointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      if (!d.moved) { if (d.was) { sel = -1; renderBoard(); } return; }
      const s = sqAt(e);
      if (s >= 0 && s !== d.from && targetsOf(d.from).indexOf(s) >= 0) { if (tryMove(d.from, s, true)) return; }
      renderBoard();
    }
    function onCancel() { if (drag) { drag = null; renderBoard(); } }
    function go(ply) {
      if (!G) return;
      const n = G.moves.length;
      ply = Math.max(0, Math.min(n, ply));
      closePromo(); sel = -1; hintInfo = null;
      viewPly = ply === n ? null : ply;
      arrows = [];
      focusAnn = viewPly === null ? -1 : ply - 1;
      if (viewPly === null) for (let i = n - 1; i >= 0; i--) if (G.ann[i]) { focusAnn = i; break; }
      render();
    }
    function onClick(e) {
      const rv = e.target.closest('[data-rv]');
      if (rv) {
        const i = +rv.dataset.rv;
        viewPly = i; focusAnn = i; sel = -1; hintInfo = null;
        const m = C.parseUci(new C.Position().setFen(G.fens[i]), G.moves[i]);
        arrows = [];
        if (m) arrows.push({ f: C.mFrom(m), t: C.mTo(m), c: 'bad' });
        const a = G.anal[i];
        if (a && a.b) { const bm = C.parseUci(new C.Position().setFen(G.fens[i]), a.b); if (bm) arrows.push({ f: C.mFrom(bm), t: C.mTo(bm), c: 'best' }); }
        render();
        renderCoach();
        return;
      }
      const mv = e.target.closest('.mv[data-p]');
      if (mv) { go(+mv.dataset.p); return; }
      const b = e.target.closest('button');
      if (!b || !root.contains(b)) return;
      const r = b.dataset.r, par = b.parentNode && b.parentNode.dataset ? b.parentNode.dataset.r : null;
      if (r === 'new') { newGame(); tone(600, 0.05); }
      else if (r === 'undo') undo();
      else if (r === 'hint') hint();
      else if (r === 'flip') { opts.flip = !opts.flip; api.save('opts', opts); sel = -1; render(); }
      else if (r === 'coach') {
        opts.coach = !opts.coach; api.save('opts', opts);
        if (opts.coach && !G.over && sideAt(G.moves.length) === G.user) { const g = gen; analyze(G.moves.length).then(x => { if (x && g === gen) renderSide(); }); }
        render();
      }
      else if (r === 'snd') { soundOn = !soundOn; api.save('sound', soundOn); hud(); tone(600, 0.05); }
      else if (r === 'first') go(0);
      else if (r === 'prev') go(curPly() - 1);
      else if (r === 'next') go(curPly() + 1);
      else if (r === 'last') go(G.moves.length);
      else if (par === 'lvl' || par === 'side') {
        const key = par === 'lvl' ? 'level' : 'side', v = b.dataset.v;
        if (opts[key] === v) return;
        opts[key] = v; api.save('opts', opts);
        let um = false; for (let i = 0; i < G.moves.length; i++) if (sideAt(i) === G.user) { um = true; break; }
        if (!um || G.over) newGame(); else { api.toast(key === 'level' ? 'New level applies from your next game' : 'Side choice applies from your next game'); hud(); }
      }
    }
    function onKey(e) {
      if (el.offsetParent === null || document.hidden || !G) return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(curPly() - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(curPly() + 1); }
      else if (e.key === 'Escape' && (promo || sel >= 0)) { e.preventDefault(); closePromo(); sel = -1; renderBoard(); hud(); }
    }
    function onResize() { if (el.offsetParent === null || document.hidden) return; fit(); }
    root.addEventListener('click', onClick);
    boardEl.addEventListener('pointerdown', onDown);
    boardEl.addEventListener('pointermove', onMoveP);
    boardEl.addEventListener('pointerup', onUp);
    boardEl.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    fit();

    if (restore(api.load('game'))) {
      resetView();
      for (let i = G.moves.length - 1; i >= 0; i--) if (G.ann[i]) { focusAnn = i; break; }
      render();
      if (G.over) { if (G.anal.length > G.moves.length && G.ann.length) { computeReview(); renderSide(); } else runReview(); }
      else nextTurn();
    } else newGame();

    return {
      destroy() {
        alive = false; gen++;
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        root.removeEventListener('click', onClick);
        boardEl.removeEventListener('pointerdown', onDown);
        boardEl.removeEventListener('pointermove', onMoveP);
        boardEl.removeEventListener('pointerup', onUp);
        boardEl.removeEventListener('pointercancel', onCancel);
        timers.forEach(clearTimeout); timers.clear();
        if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; }
        pending.clear();
        if (wurl) { URL.revokeObjectURL(wurl); wurl = null; }
        if (actx) { try { actx.close(); } catch (e) { /* ignore */ } actx = null; }
        local = null;
        el.innerHTML = '';
      },
      _test: {
        C, annotate, goodReasons, openingAt,
        get G() { return G; },
        get busy() { return thinking || coachBusy || reviewing > 0 || pending.size > 0; },
        get hasWorker() { return !!worker; },
        state() { return { fen: G.pos.fen(), moves: G.moves.slice(), sans: G.sans.slice(), user: G.user, over: G.over, thinking, ann: G.ann.slice(), opening: openingName(G.moves.length), review }; },
        newGame, undo, hint,
        play(u) { return userMove(u, true); },
        search(fen, moves, time, depth) { return ask({ cmd: 'search', fen, moves: moves || [], time: time || 1000, depth: depth || 60, noise: 0 }); },
        async explain(fen, uci, time) {
          const p0 = await ask({ cmd: 'search', fen, moves: [], time: time || 700, depth: 14, noise: 0 });
          const pre = { s: p0.side ? -p0.score : p0.score, d: p0.depth, b: p0.move, pv: p0.pv };
          const p1 = await ask({ cmd: 'search', fen, moves: [uci], time: 1500, depth: Math.max(1, p0.depth - 1), noise: 0 });
          const post = { s: p1.side ? -p1.score : p1.score, d: p1.depth, b: p1.move, pv: p1.pv };
          return annotate(fen, uci, pre, post, 10);
        },
        loadLine(sans) {
          gen++; resetWorker(); timers.forEach(clearTimeout); timers.clear();
          const pos = new C.Position().setFen(START), moves = [];
          for (const s of sans) { const m = C.parseSan(pos, s); if (!m) break; moves.push(C.toUci(m)); pos.make(m); }
          const r = replay(START, moves);
          G = { start: START, startSide: 0, user: moves.length % 2, level: opts.level, moves, sans: r.sans, fens: r.fens, anal: [], ann: [], over: null, counted: true, pos: r.pos, opn: [] };
          thinking = false; coachBusy = false; review = null; reviewing = 0; resetView(); render();
          return openingName(moves.length);
        },
      },
    };
  }

  window.VanArcade[ID] = {
    mount(el, api) { if (inst) this.unmount(); inst = create(el, api); this._t = inst._test; },
    unmount() { if (inst) { inst.destroy(); inst = null; this._t = null; } },
    core: C,
  };

})();
