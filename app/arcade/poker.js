/* VanMule Arcade: Mule Draw, Jacks or Better video poker (9/6 full pay) with an exact hold optimizer. */
(function(){
  'use strict';
  var ID = 'poker';
  window.VanArcade = window.VanArcade || {};

  /* ---------------------------------------------------------------- evaluator */
  // card = rank*4 + suit ; rank 0..12 = 2..A ; suit 0..3 = spades, hearts, diamonds, clubs
  var RCH = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  var RNAME = ['2','3','4','5','6','7','8','9','10','Jack','Queen','King','Ace'];
  var SUITS = ['♠', '♥', '♦', '♣'];
  // categories
  var NOTHING = 0, JOB = 1, TWOPAIR = 2, TRIPS = 3, STRAIGHT = 4, FLUSH = 5, FULL = 6, QUADS = 7, SFLUSH = 8, ROYAL = 9;
  var CAT_NAMES = ['Nothing', 'Jacks or Better', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'];
  var PAY = [0, 1, 2, 3, 4, 6, 9, 25, 50, 250]; // per coin (royal is 800/coin at 5 coins)

  var BITS = new Uint8Array(8192), RSUM = new Uint8Array(8192), STR = new Uint8Array(8192);
  (function(){
    for (var m = 0; m < 8192; m++){
      var b = 0, s = 0;
      for (var r = 0; r < 13; r++) if (m & (1 << r)){ b++; s += r; }
      BITS[m] = b; RSUM[m] = s;
    }
    for (var lo = 0; lo <= 8; lo++) STR[31 << lo] = 1;
    STR[0x100F] = 1;          // A-2-3-4-5 wheel
    STR[0x1F00] = 2;          // 10-J-Q-K-A
  })();

  function cat(a, b, c, d, e){
    var ra = a >> 2, rb = b >> 2, rc = c >> 2, rd = d >> 2, re = e >> 2;
    var m = (1 << ra) | (1 << rb) | (1 << rc) | (1 << rd) | (1 << re);
    var n = BITS[m];
    if (n === 5){
      var fl = (((a ^ b) | (a ^ c) | (a ^ d) | (a ^ e)) & 3) === 0, st = STR[m];
      if (fl) return st === 2 ? ROYAL : st ? SFLUSH : FLUSH;
      return st ? STRAIGHT : NOTHING;
    }
    if (n === 4) return (ra + rb + rc + rd + re - RSUM[m]) >= 9 ? JOB : NOTHING;
    var p = (ra === rb) + (ra === rc) + (ra === rd) + (ra === re) + (rb === rc) + (rb === rd) + (rb === re) + (rc === rd) + (rc === re) + (rd === re);
    if (n === 3) return p === 3 ? TRIPS : TWOPAIR;
    return p === 6 ? QUADS : FULL;
  }
  function cat5(h){ return cat(h[0], h[1], h[2], h[3], h[4]); }
  function payTable(coins){ var p = PAY.slice(); p[ROYAL] = coins >= 5 ? 800 : 250; return p; }

  var C47 = [1, 47, 1081, 16215, 178365, 1533939];

  // Sum of payouts over all draws for held cards H (array), drawing n = 5-|H| from deck D, outer index range [i0,i1).
  function sumDraws(H, D, pay, i0, i1){
    var L = D.length, s = 0, i, j, k, l, m, n = 5 - H.length;
    var a = H[0], b = H[1], c = H[2], d = H[3], x, y, z, w;
    switch (n){
      case 0: return pay[cat(H[0], H[1], H[2], H[3], H[4])];
      case 1: for (i = i0; i < i1; i++) s += pay[cat(a, b, c, d, D[i])]; return s;
      case 2:
        for (i = i0; i < i1; i++){ x = D[i]; for (j = i + 1; j < L; j++) s += pay[cat(a, b, c, x, D[j])]; }
        return s;
      case 3:
        for (i = i0; i < i1; i++){ x = D[i]; for (j = i + 1; j < L; j++){ y = D[j]; for (k = j + 1; k < L; k++) s += pay[cat(a, b, x, y, D[k])]; } }
        return s;
      case 4:
        for (i = i0; i < i1; i++){ x = D[i]; for (j = i + 1; j < L; j++){ y = D[j]; for (k = j + 1; k < L; k++){ z = D[k]; for (l = k + 1; l < L; l++) s += pay[cat(a, x, y, z, D[l])]; } } }
        return s;
      default:
        for (i = i0; i < i1; i++){ x = D[i]; for (j = i + 1; j < L; j++){ y = D[j]; for (k = j + 1; k < L; k++){ z = D[k]; for (l = k + 1; l < L; l++){ w = D[l]; for (m = l + 1; m < L; m++) s += pay[cat(x, y, z, w, D[m])]; } } } }
        return s;
    }
  }

  // Builds the work list for analysing a dealt hand. Returns {jobs, sums, run(budgetMs) -> done?}
  function makeAnalysis(cards, coins){
    var pay = payTable(coins), inHand = {}, D = [], mask, i;
    for (i = 0; i < 5; i++) inHand[cards[i]] = 1;
    for (i = 0; i < 52; i++) if (!inHand[i]) D.push(i);
    var sums = new Float64Array(32), jobs = [];
    for (mask = 0; mask < 32; mask++){
      var H = [];
      for (i = 0; i < 5; i++) if (mask & (1 << i)) H.push(cards[i]);
      var n = 5 - H.length;
      if (n >= 3){ for (i = 0; i <= 47 - n; i++) jobs.push([mask, H, i, i + 1]); }
      else jobs.push([mask, H, 0, n === 0 ? 0 : 47]);
    }
    // cheap jobs first so partial results are useful
    jobs.sort(function(x, y){ return (5 - x[1].length) - (5 - y[1].length); });
    var next = 0;
    return {
      run: function(budget){
        var t0 = performance.now();
        while (next < jobs.length){
          var j = jobs[next++];
          sums[j[0]] += sumDraws(j[1], D, pay, j[2], j[3]);
          if ((next & 7) === 0 && performance.now() - t0 > budget) return false;
        }
        return true;
      },
      progress: function(){ return next / jobs.length; },
      result: function(){
        var evs = [], best = 0;
        for (var m2 = 0; m2 < 32; m2++){
          var k = 0; for (var b = 0; b < 5; b++) if (m2 & (1 << b)) k++;
          evs[m2] = sums[m2] / C47[5 - k];
          if (evs[m2] > evs[best] + 1e-12) best = m2;
        }
        return { best: best, ev: evs[best], evs: evs };
      }
    };
  }
  function bestHoldSync(cards, coins){ var a = makeAnalysis(cards, coins || 5); a.run(1e9); return a.result(); }

  /* ---------------------------------------------------------------- hold descriptions */
  function isHigh(r){ return r >= 9; } // J Q K A
  function describe(cards, mask){
    var H = [], i;
    for (i = 0; i < 5; i++) if (mask & (1 << i)) H.push(cards[i]);
    var k = H.length;
    if (k === 0) return 'discarding everything';
    var ranks = H.map(function(c){ return c >> 2; }).sort(function(a, b){ return a - b; });
    var suited = H.every(function(c){ return (c & 3) === (H[0] & 3); });
    var cnt = {}; ranks.forEach(function(r){ cnt[r] = (cnt[r] || 0) + 1; });
    var groups = Object.keys(cnt).map(function(r){ return cnt[r]; }).sort().reverse();
    var plural = function(r){ return r === 4 ? 'Sixes' : RNAME[r] + 's'; };
    if (k === 5){
      var c5 = cat5(H);
      if (c5 >= STRAIGHT) return 'pat ' + CAT_NAMES[c5].toLowerCase();
    }
    if (groups[0] === 4) return 'four of a kind';
    if (groups[0] === 3 && groups[1] === 2) return 'full house';
    if (groups[0] === 3 && k === 3) return 'three of a kind';
    if (groups[0] === 2 && groups[1] === 2 && k === 4) return 'two pair';
    if (groups[0] === 2 && k === 2){
      var pr = ranks[0];
      return (isHigh(pr) ? 'high pair (' : 'low pair (') + plural(pr) + ')';
    }
    if (groups[0] === 3) return 'three of a kind plus a kicker';
    if (groups[0] === 2 && groups[1] === 2) return 'two pair plus a kicker';
    if (groups[0] === 2){
      var pr2 = +Object.keys(cnt).filter(function(r){ return cnt[r] === 2; })[0];
      return (isHigh(pr2) ? 'high pair (' : 'low pair (') + plural(pr2) + ') plus ' + (k === 3 ? 'a kicker' : (k - 2) + ' kickers');
    }
    var distinct = groups[0] === 1;
    if (distinct){
      var lo = ranks[0], hi = ranks[k - 1];
      var wheelSpan = ranks[k - 1] === 12 && ranks.slice(0, k - 1).every(function(r){ return r <= 3; });
      var span = hi - lo, inWindow = span <= 4 || wheelSpan;
      var allRoyal = ranks.every(function(r){ return r >= 8; });
      if (suited && k >= 3 && allRoyal) return k + ' to a royal flush';
      if (suited && k >= 3 && inWindow) return k + ' to a straight flush';
      if (suited && k === 4) return '4 to a flush';
      if (k === 4 && inWindow){
        var gaps = span === 3 && !wheelSpan;
        return gaps && lo >= 0 && hi <= 11 ? '4 to an outside straight' : '4 to an inside straight';
      }
      var highs = ranks.filter(isHigh).length;
      if (suited && k === 2 && allRoyal) return highs === 2 ? '2 suited high cards' : 'suited ' + RCH[lo] + '/' + RCH[hi];
      if (k === 1) return isHigh(ranks[0]) ? 'single high card (' + RCH[ranks[0]] + ')' : 'a single ' + RCH[ranks[0]];
      if (highs === k) return k + ' unsuited high cards';
    }
    return k + ' cards (' + ranks.map(function(r){ return RCH[r]; }).join(' ') + ')';
  }

  /* ---------------------------------------------------------------- CSS */
  var CSS = [
'.ag-poker{--card-w:118px;--card-h:166px;font-family:var(--body);color:var(--fg);user-select:none;max-width:1100px}',
'.ag-poker *{box-sizing:border-box}',
'.ag-poker .pk-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:10px}',
'.ag-poker .pk-title{display:flex;align-items:center;gap:10px;flex:1 1 300px;min-width:0}',
'.ag-poker .pk-title h2{font-family:var(--display);font-size:20px;margin:0;line-height:1.1}',
'.ag-poker .pk-title h2 em{font-style:normal;color:var(--ember)}',
'.ag-poker .pk-how{color:var(--muted);font-size:13px}',
'.ag-poker .pk-bank{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:6px 14px;text-align:right;min-width:140px}',
'.ag-poker .pk-bank span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:1px}',
'.ag-poker .pk-bank b{font-family:var(--mono);font-size:22px;color:var(--gold)}',
'.ag-poker .pk-tops{display:flex;gap:6px;flex-wrap:wrap}',
'.ag-poker .pk-tog.on{border-color:var(--cool);color:var(--cool)}',
'.ag-poker .pk-machine{background:linear-gradient(180deg,#151a2c,#0c0f1c);border:3px solid #3a2416;border-radius:20px;padding:14px 16px 16px;box-shadow:inset 0 0 0 2px rgba(255,138,61,.25)}',
'.ag-poker table.pk-pay{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:13px;background:#0a0d33;border:2px solid #c99a2e;border-radius:6px}',
'.ag-poker table.pk-pay td{padding:2px 10px;color:#ffd760;text-align:right;border-left:1px solid rgba(201,154,46,.35);white-space:nowrap}',
'.ag-poker table.pk-pay td:first-child{text-align:left;border-left:0;font-family:var(--body);font-weight:700;letter-spacing:.5px;text-transform:uppercase;font-size:12px}',
'.ag-poker table.pk-pay td.col{background:rgba(255,64,64,.28)}',
'.ag-poker table.pk-pay tr.hit td{background:#ffd760;color:#0a0d33}',
'.ag-poker table.pk-pay tr.hit td.col{background:#fff2b0}',
'.ag-poker .pk-msg{height:34px;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-size:18px;color:#ffd760;margin:8px 0 4px;text-align:center}',
'.ag-poker .pk-msg.win{color:var(--ok)}',
'.ag-poker .pk-cards{display:flex;gap:12px;justify-content:center}',
'.ag-poker .pk-slot{display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer}',
'.ag-poker .pk-held{height:20px;font-family:var(--display);font-size:13px;letter-spacing:2px;color:#ffd760;visibility:hidden}',
'.ag-poker .pk-slot.hold .pk-held{visibility:visible}',
'.ag-poker .pk-c{width:var(--card-w);height:var(--card-h);perspective:900px;position:relative;border-radius:10px;transition:transform .15s}',
'.ag-poker .pk-slot.hold .pk-c{transform:translateY(-6px)}',
'.ag-poker .pk-slot.best .pk-c{box-shadow:0 0 0 3px var(--cool),0 0 18px rgba(111,211,199,.5)}',
'.ag-poker .pk-best{height:16px;font-size:11px;font-weight:700;color:var(--cool);letter-spacing:1px;visibility:hidden}',
'.ag-poker .pk-slot.best .pk-best{visibility:visible}',
'.ag-poker .pk-ci{position:absolute;inset:0;transform-style:preserve-3d}',
'.ag-poker .pk-c.flip .pk-ci{animation:agpk-flip .45s cubic-bezier(.3,.7,.3,1) both;animation-delay:var(--d,0ms)}',
'@keyframes agpk-flip{from{transform:rotateY(180deg)}to{transform:rotateY(0)}}',
'.ag-poker .pk-c.down .pk-ci{transform:rotateY(180deg)}',
'.ag-poker .pk-f,.ag-poker .pk-b{position:absolute;inset:0;border-radius:10px;backface-visibility:hidden;-webkit-backface-visibility:hidden;box-shadow:0 3px 10px rgba(0,0,0,.5)}',
'.ag-poker .pk-f{background:#fbf8f3;color:#1b1714;border:1px solid #d9d2c8}',
'.ag-poker .pk-f.red{color:#c8232c}',
'.ag-poker .pk-k{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:.95;font-weight:800}',
'.ag-poker .pk-k b{font-size:24px}.ag-poker .pk-k i{font-style:normal;font-size:20px}',
'.ag-poker .pk-k.tl{top:7px;left:8px}.ag-poker .pk-k.br{bottom:7px;right:8px;transform:rotate(180deg)}',
'.ag-poker .pk-pip{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:64px}',
'.ag-poker .pk-pip.face span{border:2px solid currentColor;border-radius:8px;padding:8px 10px;line-height:1;display:flex;flex-direction:column;align-items:center;font-family:var(--display);font-size:36px}',
'.ag-poker .pk-pip.face small{font-size:22px;font-family:var(--body)}',
'.ag-poker .pk-b{transform:rotateY(180deg);background:#24140a;border:3px solid #fbf8f3;overflow:hidden}',
'.ag-poker .pk-b:before{content:"";position:absolute;inset:6px;border-radius:6px;background:repeating-linear-gradient(45deg,var(--ember) 0 5px,#b9531a 5px 10px);border:1px solid rgba(255,255,255,.35)}',
'.ag-poker .pk-b:after{content:"VM";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:var(--display);font-size:20px;color:#1b0d03;background:#ffc861;border-radius:999px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px #1b0d03}',
'.ag-poker .pk-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}',
'.ag-poker .pk-controls .grow{flex:1}',
'.ag-poker .pk-led{font-family:var(--mono);color:var(--muted);font-size:14px;background:#06080f;border:1px solid var(--line);border-radius:8px;padding:5px 12px}',
'.ag-poker .pk-led b{color:#ff5a3d;font-size:18px}',
'.ag-poker .pk-kbd{font-family:var(--mono);font-size:10px;opacity:.6}',
'.ag-poker .pk-tip{margin-top:10px;background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--cool);border-radius:12px;padding:8px 14px;min-height:46px;font-size:14px}',
'.ag-poker .pk-tip .rec{color:var(--cool);font-weight:700}',
'.ag-poker .pk-tip .sub{font-size:13px;color:var(--muted);margin-top:2px}',
'.ag-poker .pk-tip .miss{color:var(--gold)}.ag-poker .pk-tip .ok{color:var(--ok)}',
'.ag-poker .pk-tip .ev{font-family:var(--mono)}',
'.ag-poker .pk-stats{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--muted)}',
'.ag-poker .pk-stats b{font-family:var(--mono);color:var(--fg);font-weight:600}',
'.ag-poker details{margin-top:10px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:0 14px}',
'.ag-poker summary{cursor:pointer;padding:10px 0;font-weight:700}',
'.ag-poker details[open] summary{border-bottom:1px solid var(--line);margin-bottom:10px}',
'.ag-poker ol.pk-strat{margin:0 0 10px;padding-left:26px;font-size:13.5px;columns:2;column-gap:30px}',
'.ag-poker ol.pk-strat li{margin:3px 0;break-inside:avoid}',
'.ag-poker ol.pk-strat li span{color:var(--muted);font-size:12px}',
'.ag-poker ul.pk-tipsl{margin:0 0 12px;padding-left:18px;font-size:13.5px}',
'.ag-poker ul.pk-tipsl li{margin:4px 0}.ag-poker ul.pk-tipsl b{color:var(--ember)}',
'.ag-poker .pk-note{font-size:12.5px;color:var(--muted);margin:0 0 10px}',
'@media (max-width:860px){.ag-poker{--card-w:96px;--card-h:136px}.ag-poker .pk-pip{font-size:50px}.ag-poker .pk-cards{gap:8px}.ag-poker table.pk-pay{font-size:12px}.ag-poker table.pk-pay td{padding:1px 6px}.ag-poker ol.pk-strat{columns:1}.ag-poker .pk-pip.face span{font-size:28px;padding:5px 7px}}'
  ].join('\n');

  function injectCSS(){
    if (document.getElementById('ag-' + ID + '-css')) return;
    var s = document.createElement('style'); s.id = 'ag-' + ID + '-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function fmt(n){ return Math.round(n).toLocaleString('en-US'); }

  var STRATEGY = [
    ['Royal flush, straight flush, four of a kind', 'keep the pat hand'],
    ['4 to a royal flush', 'even breaks up a made flush or straight'],
    ['Full house, flush, straight, three of a kind', ''],
    ['4 to a straight flush', ''],
    ['Two pair', ''],
    ['High pair (Jacks or better)', ''],
    ['3 to a royal flush', ''],
    ['4 to a flush', ''],
    ['Low pair (2s–10s)', 'beats 4 to an outside straight'],
    ['4 to an outside straight', 'e.g. 5-6-7-8'],
    ['2 suited high cards', 'e.g. J♠ Q♠'],
    ['3 to a straight flush', ''],
    ['2 unsuited high cards', 'with 3, keep the lowest 2 \u2014 except K-Q-J: hold all three'],
    ['Suited 10/J, 10/Q or 10/K', ''],
    ['One high card', 'Jack, Queen, King or Ace'],
    ['Discard everything', 'draw five new cards']
  ];
  var TIPS = '<ul class="pk-tipsl">' +
    '<li><b>Always play 5 coins.</b> The royal pays 4,000 at max bet (800 per coin) vs 250 per coin otherwise — that bonus is about 1.5% of the game’s return.</li>' +
    '<li><b>9/6 Jacks or Better returns 99.54%</b> with perfect strategy (house edge ~0.46%). “9/6” means Full House pays 9 and Flush pays 6 — avoid 8/5 or 7/5 machines, they return ~97% or less.</li>' +
    '<li><b>Never hold a kicker</b> with a pair — it only lowers your chance of trips or a full house.</li>' +
    '<li><b>Low pair beats 4 to an outside straight</b>, and <b>4 to a royal</b> beats a made flush or straight.</li>' +
    '<li><b>Variance is high:</b> most of the return comes from rare hands. A royal arrives about once every 40,000 hands, so pace your credits.</li>' +
    '</ul>';

  var MULE = '<svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true"><g fill="var(--ember)"><ellipse cx="13" cy="9" rx="3.4" ry="9" transform="rotate(-18 13 9)"/><ellipse cx="27" cy="9" rx="3.4" ry="9" transform="rotate(18 27 9)"/><ellipse cx="20" cy="22" rx="10" ry="11"/></g><ellipse cx="20" cy="30" rx="7.5" ry="6" fill="#ffc861"/><circle cx="16" cy="19" r="1.6" fill="#1b0d03"/><circle cx="24" cy="19" r="1.6" fill="#1b0d03"/><circle cx="17.5" cy="30.5" r="1.1" fill="#1b0d03"/><circle cx="22.5" cy="30.5" r="1.1" fill="#1b0d03"/></svg>';

  /* ---------------------------------------------------------------- game instance */
  var inst = null;

  function mount(el, api){
    if (inst) unmount();
    injectCSS();
    var saved = api.load('state') || {};
    var credits = typeof saved.credits === 'number' && isFinite(saved.credits) ? saved.credits : 1000;
    var coins = saved.coins >= 1 && saved.coins <= 5 ? saved.coins : 5;
    var tipsOn = !!saved.tips;
    var stats = { hands: 0, wagered: 0, won: 0, best: 0, royals: 0, quads: 0, holds: 0, optimal: 0, evLost: 0 };
    if (saved.stats) for (var k in stats) if (typeof saved.stats[k] === 'number') stats[k] = saved.stats[k];
    var sv = api.load('sound'); var soundOn = sv === null ? !!api.sound : !!sv;

    var phase = 'idle';   // idle | hold | over
    var hand = [-1, -1, -1, -1, -1], held = [false, false, false, false, false], deck = [];
    var lastCat = -1, lastWin = 0, msg = 'Press Deal to play', msgCls = '';
    var analysis = null, result = null, timer = 0, paused = false;
    var verdict = null;  // after draw: {text, cls}
    var animEnd = 0, dead = false, actx = null;
    var flipIdx = [];    // card slots to animate on next render
    var flipDelays = [];

    el.innerHTML =
      '<div class="ag-poker">' +
        '<div class="pk-top">' +
          '<div class="pk-title">' + MULE + '<div><h2>Mule Draw <em>Jacks or Better</em></h2><div class="pk-how">Deal 5 cards, click cards (or press 1–5) to HOLD, then Draw. Pair of Jacks or better pays.</div></div></div>' +
          '<div class="pk-bank"><span>Credits</span><b class="pk-cred"></b></div>' +
          '<div class="pk-tops">' +
            '<button class="btn sec small pk-tog" data-act="tips" title="Compute and highlight the optimal hold">Show best hold</button>' +
            '<button class="btn sec small" data-act="sound" title="Sound"></button>' +
            '<button class="btn sec small" data-act="reset">Reset credits</button>' +
          '</div>' +
        '</div>' +
        '<div class="pk-machine">' +
          '<table class="pk-pay"></table>' +
          '<div class="pk-msg"></div>' +
          '<div class="pk-cards"></div>' +
          '<div class="pk-controls">' +
            '<button class="btn sec" data-act="betone">Bet one</button>' +
            '<button class="btn sec" data-act="betmax">Bet max</button>' +
            '<span class="pk-led">BET <b class="pk-bet"></b></span>' +
            '<span class="pk-led">WIN <b class="pk-win"></b></span>' +
            '<span class="grow"></span>' +
            '<button class="btn pri pk-deal" data-act="deal" style="min-width:130px;justify-content:center"></button>' +
          '</div>' +
        '</div>' +
        '<div class="pk-tip"></div>' +
        '<div class="pk-stats"></div>' +
        '<details><summary>Strategy (9/6 Jacks or Better)</summary><p class="pk-note">Find the highest line that matches your hand and hold those cards. This simple ranking captures almost all of the 99.54% return; the “Show best hold” tips compute the exact answer for every hand.</p><ol class="pk-strat">' +
          STRATEGY.map(function(s){ return '<li>' + s[0] + (s[1] ? ' <span>— ' + s[1] + '</span>' : '') + '</li>'; }).join('') +
        '</ol></details>' +
        '<details><summary>Tips</summary>' + TIPS + '</details>' +
      '</div>';
    var root = el.firstChild;
    var $ = function(s){ return root.querySelector(s); };
    var payEl = $('.pk-pay'), msgEl = $('.pk-msg'), cardsEl = $('.pk-cards'), credEl = $('.pk-cred'), betEl = $('.pk-bet'),
        winEl = $('.pk-win'), dealBtn = $('.pk-deal'), tipEl = $('.pk-tip'), statsEl = $('.pk-stats');

    // card slots
    var slots = [];
    for (var s = 0; s < 5; s++){
      var sl = document.createElement('div'); sl.className = 'pk-slot'; sl.setAttribute('data-act', 'hold'); sl.setAttribute('data-i', s);
      sl.innerHTML = '<div class="pk-held">HELD</div><div class="pk-c down"><div class="pk-ci"><div class="pk-f"></div><div class="pk-b"></div></div></div><div class="pk-best">BEST HOLD</div>';
      cardsEl.appendChild(sl);
      slots.push({ el: sl, c: sl.querySelector('.pk-c'), f: sl.querySelector('.pk-f') });
    }

    /* ---------- sound */
    function ac(){
      if (!soundOn) return null;
      if (!actx){ try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }
    function blip(f, dur, type, vol, when){
      var a = ac(); if (!a) return;
      var t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
    }
    function sFlip(d){ blip(820, 0.04, 'triangle', 0.035, d / 1000); }
    function sWin(d, big){ var w = d / 1000, n = big ? 6 : 3; for (var i = 0; i < n; i++) blip(660 * Math.pow(1.26, i), 0.12, 'triangle', 0.05, w + i * 0.09); }

    function persist(){ api.save('state', { credits: credits, coins: coins, tips: tipsOn, stats: stats }); }

    /* ---------- deck */
    function rnd(n){
      if (window.crypto && crypto.getRandomValues){ var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
      return Math.floor(Math.random() * n);
    }
    function shuffle(){
      deck = []; for (var i = 0; i < 52; i++) deck.push(i);
      for (i = 51; i > 0; i--){ var j = rnd(i + 1), t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    }
    function busy(){ return performance.now() < animEnd - 80; }

    /* ---------- analysis (chunked, paused while hidden) */
    function visible(){ return !document.hidden && el.offsetParent !== null; }
    function stopAnalysis(){ if (timer){ clearTimeout(timer); timer = 0; } paused = false; }
    function startAnalysis(){
      stopAnalysis(); result = null;
      if (phase !== 'hold' || !tipsOn) { analysis = null; return; }
      analysis = makeAnalysis(hand, coins);
      if (analysis.run(150)) { result = analysis.result(); analysis = null; }
      else timer = setTimeout(tick, 0);
    }
    function tick(){
      timer = 0;
      if (dead || !analysis) return;
      if (!visible()){ paused = true; return; }
      if (analysis.run(30)){ result = analysis.result(); analysis = null; render(); }
      else { timer = setTimeout(tick, 0); renderTip(); }
    }
    function resume(){ if (paused && analysis && !dead && visible()){ paused = false; timer = setTimeout(tick, 0); } }
    var io = null;
    if (window.IntersectionObserver){ io = new IntersectionObserver(function(){ resume(); }); io.observe(root); }
    function onVis(){ resume(); }
    document.addEventListener('visibilitychange', onVis);

    /* ---------- game flow */
    function holdMask(){ var m = 0; for (var i = 0; i < 5; i++) if (held[i]) m |= 1 << i; return m; }

    function deal(){
      if (phase === 'hold') return draw();
      if (busy()) return;
      if (credits < coins){
        if (credits <= 0){ api.toast('Out of credits — press "Reset credits".'); return; }
        coins = Math.max(1, Math.min(5, credits));
      }
      credits -= coins; stats.wagered += coins;
      shuffle();
      hand = deck.splice(0, 5); held = [false, false, false, false, false];
      lastCat = cat5(hand); lastWin = 0; verdict = null;
      msg = lastCat > 0 ? CAT_NAMES[lastCat] : ''; msgCls = '';
      phase = 'hold';
      animEnd = performance.now();
      flipIdx = [0, 1, 2, 3, 4];
      persist();
      render();
      startAnalysis();
      render();
    }

    function draw(){
      if (phase !== 'hold' || busy()) return;
      var mask = holdMask();
      // verdict vs optimal
      if (result){
        stats.holds++;
        var ev = result.evs[mask], bev = result.ev;
        if (mask === result.best || Math.abs(ev - bev) < 1e-9){ stats.optimal++; verdict = { text: '✓ Optimal hold — EV ' + bev.toFixed(3) + ' per coin.', cls: 'ok' }; }
        else { stats.evLost += (bev - ev) * coins; verdict = { text: 'Your hold EV ' + ev.toFixed(3) + ' vs best ' + bev.toFixed(3) + ' per coin — best was ' + describe(hand, result.best) + '.', cls: 'miss' }; }
      } else verdict = null;
      stopAnalysis(); analysis = null;
      flipIdx = [];
      for (var i = 0; i < 5; i++) if (!held[i]){ hand[i] = deck.shift(); flipIdx.push(i); }
      animEnd = performance.now();
      var c = cat5(hand), pt = payTable(coins), win = pt[c] * coins;
      lastCat = c; lastWin = win;
      credits += win; stats.won += win; stats.hands++;
      if (win > stats.best) stats.best = win;
      if (c === ROYAL) stats.royals++;
      if (c === QUADS) stats.quads++;
      msg = c > 0 ? CAT_NAMES[c] + ' — wins ' + fmt(win) : 'Game over'; msgCls = c > 0 ? 'win' : '';
      phase = 'over';
      persist();
      render();
      if (win > 0) sWin(Math.max(0, animEnd - performance.now()), c >= QUADS);
      if (c === ROYAL) api.toast('ROYAL FLUSH! +' + fmt(win) + ' credits');
      if (credits <= 0) api.toast('Out of credits — press "Reset credits".');
    }

    function toggleHold(i){
      if (phase !== 'hold') return;
      held[i] = !held[i]; blip(held[i] ? 1200 : 700, 0.04, 'square', 0.025);
      render();
    }

    /* ---------- render */
    function cardFace(c){
      var r = c >> 2, s = c & 3, red = s === 1 || s === 2, rc = RCH[r], face = r >= 9 && r <= 11;
      return { red: red, html: '<div class="pk-k tl"><b>' + rc + '</b><i>' + SUITS[s] + '</i></div>' +
        '<div class="pk-pip' + (face ? ' face' : '') + '">' + (face ? '<span>' + rc + '<small>' + SUITS[s] + '</small></span>' : SUITS[s]) + '</div>' +
        '<div class="pk-k br"><b>' + rc + '</b><i>' + SUITS[s] + '</i></div>' };
    }

    function renderPay(){
      var pt = payTable(5), rows = '';
      var hitRow = lastCat > 0 ? lastCat : -1;
      for (var c = ROYAL; c >= JOB; c--){
        rows += '<tr' + (c === hitRow ? ' class="hit"' : '') + '><td>' + CAT_NAMES[c] + '</td>';
        for (var n = 1; n <= 5; n++){
          var v = c === ROYAL ? (n === 5 ? 4000 : 250 * n) : PAY[c] * n;
          rows += '<td' + (n === coins ? ' class="col"' : '') + '>' + fmt(v) + '</td>';
        }
        rows += '</tr>';
      }
      payEl.innerHTML = rows;
      void pt;
    }

    function renderTip(){
      if (!tipsOn){
        tipEl.innerHTML = '<div>Turn on <b>Show best hold</b> to see the mathematically optimal hold for every deal, with its expected value.</div>' +
          (stats.holds ? '<div class="sub">Optimal holds so far: ' + Math.round(100 * stats.optimal / stats.holds) + '% of ' + stats.holds + '.</div>' : '');
        return;
      }
      if (phase === 'hold'){
        if (!result){
          var pr = analysis ? Math.round(analysis.progress() * 100) : 0;
          tipEl.innerHTML = '<div><span class="rec">Thinking…</span> checking all 32 holds against every possible draw (' + pr + '%).</div>';
          return;
        }
        var mask = holdMask(), best = result.best, bd = describe(hand, best);
        var h = '<div><span class="rec">Best hold: ' + esc(bd.charAt(0).toUpperCase() + bd.slice(1)) + '</span> — EV <span class="ev">' + result.ev.toFixed(3) + '</span> per coin.</div>';
        var sub;
        if (mask === best) {
          // runner-up with a different description
          var order = result.evs.map(function(v, i){ return [v, i]; }).sort(function(a, b){ return b[0] - a[0]; });
          var alt = null;
          for (var i = 0; i < order.length; i++){ if (order[i][1] !== best && describe(hand, order[i][1]) !== bd){ alt = order[i]; break; } }
          sub = '<span class="ok">✓ Your hold matches.</span>' + (alt ? ' Keep the ' + esc(bd) + ' over ' + esc(article(describe(hand, alt[1]))) + ' (EV ' + alt[0].toFixed(3) + ').' : '');
        } else {
          var pd = describe(hand, mask), pev = result.evs[mask];
          sub = 'Your hold (' + esc(pd) + ') EV <span class="ev">' + pev.toFixed(3) + '</span>. ' +
            (pd === bd ? 'Hold exactly the highlighted cards.' : 'Keep the ' + esc(bd) + ' over ' + esc(article(pd)) + '.');
        }
        tipEl.innerHTML = h + '<div class="sub">' + sub + '</div>';
        return;
      }
      if (phase === 'over' && verdict){ tipEl.innerHTML = '<div class="' + verdict.cls + '">' + esc(verdict.text) + '</div><div class="sub">Optimal holds: ' + Math.round(100 * stats.optimal / Math.max(1, stats.holds)) + '% of ' + stats.holds + ' · EV given up: ' + stats.evLost.toFixed(1) + ' credits</div>'; return; }
      tipEl.innerHTML = '<div><span class="rec">Show best hold is on.</span> After each deal I’ll highlight the optimal cards to keep.</div>';
    }
    function article(d){ return /^(discarding|\d)/.test(d) ? d : 'the ' + d; }

    function render(){
      if (dead) return;
      credEl.textContent = fmt(credits);
      betEl.textContent = coins;
      winEl.textContent = lastWin ? fmt(lastWin) : '0';
      dealBtn.innerHTML = (phase === 'hold' ? 'Draw' : 'Deal') + ' <span class="pk-kbd">Space</span>';
      dealBtn.disabled = phase !== 'hold' && credits <= 0;
      root.querySelector('[data-act="betone"]').disabled = phase === 'hold';
      root.querySelector('[data-act="betmax"]').disabled = phase === 'hold';
      var tb = root.querySelector('[data-act="tips"]'); tb.classList.toggle('on', tipsOn); tb.textContent = 'Show best hold: ' + (tipsOn ? 'on' : 'off');
      root.querySelector('[data-act="sound"]').textContent = soundOn ? '🔊' : '🔇';
      renderPay();
      msgEl.textContent = msg; msgEl.className = 'pk-msg ' + msgCls;

      var base = Math.max(performance.now(), animEnd), now = performance.now();
      for (var i = 0; i < 5; i++){
        var sl = slots[i];
        sl.el.classList.toggle('hold', phase === 'hold' && held[i]);
        sl.el.classList.toggle('best', !!(phase === 'hold' && tipsOn && result && (result.best & (1 << i))));
        if (flipIdx.indexOf(i) >= 0 && hand[i] >= 0){
          var f = cardFace(hand[i]);
          // replace the card node to restart the flip animation
          var nc = sl.c.cloneNode(true);
          nc.className = 'pk-c flip';
          nc.querySelector('.pk-f').className = 'pk-f' + (f.red ? ' red' : '');
          nc.querySelector('.pk-f').innerHTML = f.html;
          var d = (base - now) + flipIdx.indexOf(i) * 110;
          nc.style.setProperty('--d', Math.round(d) + 'ms');
          sl.el.replaceChild(nc, sl.c); sl.c = nc;
          sFlip(d);
          animEnd = Math.max(animEnd, now + d + 300);
        }
      }
      flipIdx = [];
      renderTip();
      var ret = stats.wagered ? (100 * stats.won / stats.wagered).toFixed(1) + '%' : '—';
      statsEl.innerHTML = 'Hands <b>' + stats.hands + '</b> · Wagered <b>' + fmt(stats.wagered) + '</b> · Won <b>' + fmt(stats.won) + '</b> · Return <b>' + ret +
        '</b> · Best win <b>' + fmt(stats.best) + '</b> · Quads <b>' + stats.quads + '</b> · Royals <b>' + stats.royals + '</b>' +
        (stats.holds ? ' · Optimal holds <b>' + Math.round(100 * stats.optimal / stats.holds) + '%</b>' : '') +
        ' · <span>Keys: 1–5 hold · Space/Enter deal/draw · B bet one · M bet max</span>';
    }

    /* ---------- input */
    var confirmReset = false;
    function onClick(e){
      var b = e.target.closest('[data-act]'); if (!b || !root.contains(b) || b.disabled) return;
      var a = b.getAttribute('data-act');
      if (a !== 'reset' && confirmReset){ confirmReset = false; root.querySelector('[data-act="reset"]').textContent = 'Reset credits'; }
      switch (a){
        case 'hold': toggleHold(+b.getAttribute('data-i')); break;
        case 'deal': deal(); break;
        case 'betone': betOne(); break;
        case 'betmax': betMax(); break;
        case 'tips':
          tipsOn = !tipsOn; persist();
          if (tipsOn && phase === 'hold' && !result && !analysis) startAnalysis();
          if (!tipsOn){ stopAnalysis(); analysis = null; }
          render(); break;
        case 'sound': soundOn = !soundOn; api.save('sound', soundOn); if (soundOn) blip(880, 0.08, 'triangle', 0.05); render(); break;
        case 'reset':
          if (phase === 'hold'){ api.toast('Finish the hand first'); return; }
          if (!confirmReset){ confirmReset = true; b.textContent = 'Click again to reset'; return; }
          confirmReset = false; credits = 1000; for (var k2 in stats) stats[k2] = 0; lastWin = 0; lastCat = -1; verdict = null;
          msg = 'Credits reset to 1,000'; msgCls = ''; persist(); b.textContent = 'Reset credits'; render(); break;
      }
    }
    function betOne(){ if (phase === 'hold') return; coins = coins >= 5 ? 1 : coins + 1; blip(1000 + coins * 120, 0.05, 'square', 0.025); persist(); render(); }
    function betMax(){ if (phase === 'hold') return; coins = 5; persist(); render(); deal(); }

    function onKey(e){
      if (el.offsetParent === null || document.hidden) return;
      var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key.toLowerCase();
      resume();
      if (k >= '1' && k <= '5' && k.length === 1){ if (phase === 'hold'){ toggleHold(+k - 1); e.preventDefault(); } return; }
      if (k === ' ' || k === 'enter'){ e.preventDefault(); deal(); return; }
      if (k === 'b'){ e.preventDefault(); betOne(); return; }
      if (k === 'm'){ e.preventDefault(); betMax(); return; }
    }
    function onDown(){ resume(); }

    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    render();

    inst = {
      destroy: function(){
        dead = true;
        stopAnalysis(); analysis = null;
        // refund the bet if leaving mid-hand
        if (phase === 'hold'){ credits += coins; stats.wagered -= coins; persist(); }
        if (io){ io.disconnect(); io = null; }
        document.removeEventListener('visibilitychange', onVis);
        root.removeEventListener('click', onClick);
        root.removeEventListener('pointerdown', onDown);
        window.removeEventListener('keydown', onKey);
        if (actx){ try { actx.close(); } catch (e) {} actx = null; }
        el.innerHTML = '';
      }
    };
  }

  function unmount(){ if (inst){ var i = inst; inst = null; i.destroy(); } }

  // helpers exposed for testing
  function parse(str){ // "JS JH 4C 7D 9S"
    var R = '23456789TJQKA', S = 'SHDC';
    return str.trim().split(/\s+/).map(function(t){ t = t.toUpperCase().replace('10', 'T'); return R.indexOf(t[0]) * 4 + S.indexOf(t[1]); });
  }
  window.VanArcade[ID] = {
    mount: mount,
    unmount: unmount,
    bestHold: function(str, coins){
      var cards = typeof str === 'string' ? parse(str) : str;
      var r = bestHoldSync(cards, coins || 5);
      var keep = []; for (var i = 0; i < 5; i++) if (r.best & (1 << i)) keep.push(i);
      return { mask: r.best, keep: keep, ev: r.ev, evs: r.evs, desc: describe(cards, r.best) };
    },
    evaluate: function(str){ return CAT_NAMES[cat5(typeof str === 'string' ? parse(str) : str)]; },
    describe: function(str, mask){ return describe(parse(str), mask); }
  };
})();
