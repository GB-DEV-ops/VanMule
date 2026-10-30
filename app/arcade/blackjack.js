/* VanMule Arcade: Mule's 21 (Blackjack vs the dealer) with a basic-strategy coach. */
(function(){
  'use strict';
  var ID = 'blackjack';
  window.VanArcade = window.VanArcade || {};

  /* ---------------------------------------------------------------- rules / strategy */
  var SUITS = ['♠', '♥', '♦', '♣'];
  var RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  var DECKS = 6, SHOE_SIZE = DECKS * 52, CUT = Math.round(SHOE_SIZE * 0.25); // reshuffle at 75% penetration
  var NAMES = { H:'Hit', S:'Stand', D:'Double', P:'Split', R:'Surrender' };

  function val(r){ return r === 'A' ? 11 : (r === 'J' || r === 'Q' || r === 'K') ? 10 : +r; }
  function handTotal(cards){
    var t = 0, a = 0;
    for (var i = 0; i < cards.length; i++){ t += val(cards[i].r); if (cards[i].r === 'A') a++; }
    while (t > 21 && a > 0){ t -= 10; a--; }
    return { total: t, soft: a > 0 };
  }

  // Multi-deck (4-8), dealer Stands on soft 17, Double After Split, Late surrender.
  // Columns: dealer up card 2,3,4,5,6,7,8,9,10,A
  // H hit, S stand, D double (else hit), X double (else stand), P split, R surrender (else hit)
  var COLS = ['2','3','4','5','6','7','8','9','10','A'];
  var HARD = {
    8:  'HHHHHHHHHH', 9:  'HDDDDHHHHH', 10: 'DDDDDDDDHH', 11: 'DDDDDDDDDH',
    12: 'HHSSSHHHHH', 13: 'SSSSSHHHHH', 14: 'SSSSSHHHHH', 15: 'SSSSSHHHRH',
    16: 'SSSSSHHRRR', 17: 'SSSSSSSSSS'
  };
  var SOFT = {
    13: 'HHHDDHHHHH', 14: 'HHHDDHHHHH', 15: 'HHDDDHHHHH', 16: 'HHDDDHHHHH',
    17: 'HDDDDHHHHH', 18: 'SXXXXSSHHH', 19: 'SSSSSSSSSS', 20: 'SSSSSSSSSS'
  };
  var PAIR = {
    2: 'PPPPPPHHHH', 3: 'PPPPPPHHHH', 4: 'HHHPPHHHHH', 5: 'DDDDDDDDHH', 6: 'PPPPPHHHHH',
    7: 'PPPPPPHHHH', 8: 'PPPPPPPPPP', 9: 'PPPPPSPPSS', 10: 'SSSSSSSSSS', 11: 'PPPPPPPPPP'
  };

  function upName(u){ return u === 11 ? 'Ace' : String(u); }

  // cards: [{r}], up: dealer up-card value 2..11, o: {canDouble, canSplit, canSurrender}
  function recommend(cards, up, o){
    o = o || {};
    var i = up - 2, dn = upName(up), info = handTotal(cards), t = info.total;
    var weak = up >= 2 && up <= 6;
    if (cards.length === 2 && val(cards[0].r) === val(cards[1].r)){
      var v = val(cards[0].r);
      if (o.canSplit && PAIR[v][i] === 'P'){
        var why;
        if (v === 11) why = 'Always split Aces — two shots at 21 beat one soft 12.';
        else if (v === 8) why = 'Always split 8s — 16 is the worst hand; two 8s are a fresh start.';
        else if (v === 9) why = 'Split 9s vs ' + dn + ' — two hands starting at 9 beat a lone 18 here.';
        else if (v === 4) why = 'Split 4s only vs 5–6 (double after split makes it pay).';
        else why = 'Dealer ' + dn + ' is weak — split ' + v + 's and make them pay twice.';
        return { act: 'P', reason: why };
      }
      if (v === 10 && o.canSplit) return { act: 'S', reason: 'Never split 10s — 20 is already a strong winner.' };
      if (v === 5 && PAIR[5][i] === 'D' && o.canDouble) return { act: 'D', reason: 'Never split 5s — play it as hard 10 and double vs ' + dn + '.' };
      if (v === 9 && o.canSplit && (up === 7 || up >= 10)) return { act: 'S', reason: up === 7 ? 'Stand on 9,9 vs 7 — your 18 already beats the dealer’s likely 17.' : 'Stand on 9,9 vs ' + dn + ' — splitting into a strong card loses more.' };
    }
    if (info.soft){
      if (t >= 19) return { act: 'S', reason: 'Stand on soft ' + t + ' — it’s already a strong hand.' };
      if (t <= 12) return { act: 'H', reason: 'Hit soft 12 — you can’t bust with one card.' };
      var c = SOFT[t][i];
      if (c === 'D' || c === 'X'){
        if (o.canDouble) return { act: 'D', reason: 'Double soft ' + t + ' vs ' + dn + ' — the dealer is weak and you can’t bust.' };
        if (c === 'X') return { act: 'S', reason: 'Soft 18 vs ' + dn + ': doubling is best, but if you can’t, stand.' };
        return { act: 'H', reason: 'Soft ' + t + ' vs ' + dn + ': double if allowed, otherwise hit — no bust risk.' };
      }
      if (c === 'S') return { act: 'S', reason: 'Soft 18 vs ' + dn + ': stand — 18 is good enough here.' };
      if (t === 18) return { act: 'H', reason: 'Hit soft 18 vs ' + dn + ' — 18 loses to the dealer’s likely 19–20, and you can’t bust.' };
      return { act: 'H', reason: 'Hit soft ' + t + ' — you can’t bust with one card and ' + t + ' is too weak to stand.' };
    }
    var row = t <= 8 ? 8 : t >= 17 ? 17 : t, code = HARD[row][i];
    if (code === 'R'){
      if (o.canSurrender) return { act: 'R', reason: 'Hard ' + t + ' vs ' + dn + ' loses well over half the time — give up half the bet.' };
      code = 'H';
    }
    if (code === 'D'){
      if (o.canDouble){
        if (t === 9) return { act: 'D', reason: 'Double 9 vs 3–6 — the dealer is weak enough to press.' };
        return { act: 'D', reason: 'Double ' + t + ' vs ' + dn + ' — you’re the favorite to draw a strong hand.' };
      }
      return { act: 'H', reason: 'Hard ' + t + ': doubling is best but not allowed now, so hit.' };
    }
    if (code === 'S'){
      if (t >= 17) return { act: 'S', reason: 'Stand on hard 17 or more — hitting busts too often.' };
      return { act: 'S', reason: 'Dealer ' + dn + ' is weak — let them bust. Stand on ' + (t === 12 ? '12 vs 4–6' : '12–16 vs 2–6') + '.' };
    }
    if (t <= 8) return { act: 'H', reason: 'Always hit 8 or less — no card can bust you.' };
    if (t === 9 || t === 10) return { act: 'H', reason: 'Hit ' + t + ' vs ' + dn + ' — too strong a dealer card to double.' };
    if (t === 11) return { act: 'H', reason: 'Hit 11 vs Ace — with the dealer standing on soft 17, doubling is slightly worse.' };
    if (t === 12 && weak) return { act: 'H', reason: 'Hit 12 vs ' + dn + ' — only 10s bust you and the dealer isn’t weak enough.' };
    if (code === 'H' && row === 16 && !o.canSurrender && up >= 9) return { act: 'H', reason: 'Hard 16 vs ' + dn + ': surrender if allowed, otherwise hit — standing loses more.' };
    if (code === 'H' && row === 15 && !o.canSurrender && up === 10) return { act: 'H', reason: 'Hard 15 vs 10: surrender if allowed, otherwise hit.' };
    return { act: 'H', reason: 'Dealer ' + dn + ' likely makes 17+ — hit hard 12–16 vs 7–A.' };
  }

  /* ---------------------------------------------------------------- CSS */
  var CHIP_COL = { 1: '#8a8f98', 5: '#c8323b', 25: '#1f8a54', 100: '#23262e', 500: '#7a3fc0' };
  var CSS = [
'.ag-blackjack{--felt:#14453a;--felt2:#0a2a22;--card-w:84px;--card-h:118px;--rail:#4a2c18;font-family:var(--body);color:var(--fg);user-select:none;-webkit-user-select:none;max-width:1180px;margin:0 auto;position:relative}',
'.ag-blackjack *{box-sizing:border-box}',
/* header */
'.ag-blackjack .bj-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}',
'.ag-blackjack .bj-title{display:flex;align-items:center;gap:10px;flex:1 1 320px;min-width:0}',
'.ag-blackjack .bj-title h2{font-family:var(--display);font-size:20px;margin:0;letter-spacing:.5px;line-height:1.1}',
'.ag-blackjack .bj-title h2 em{font-style:normal;color:var(--ember)}',
'.ag-blackjack .bj-how{color:var(--muted);font-size:13px;line-height:1.35}',
'.ag-blackjack .bj-tops{display:flex;gap:6px;flex-wrap:wrap}',
'.ag-blackjack .bj-tog.bj-on{border-color:var(--cool);color:var(--cool)}',
/* table */
'.ag-blackjack .bj-felt{position:relative;border-radius:200px 200px 26px 26px / 120px 120px 26px 26px;padding:16px 22px 0;background:radial-gradient(ellipse at 50% 30%,var(--felt) 0%,var(--felt2) 78%);border:4px solid #3a2416;box-shadow:inset 0 0 0 2px rgba(255,200,97,.18),inset 0 0 80px rgba(0,0,0,.5),0 18px 40px rgba(0,0,0,.45);overflow:hidden;display:flex;flex-direction:column}',
'.ag-blackjack .bj-felt:before{content:"";position:absolute;inset:7px 7px 0;border-radius:inherit;border:1px solid rgba(255,200,97,.16);border-bottom:0;pointer-events:none}',
/* shoe + discard + dealer rack */
'.ag-blackjack .bj-shoe{position:absolute;top:30px;right:34px;display:flex;flex-direction:column;align-items:center;gap:5px;font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.6);z-index:1}',
'.ag-blackjack .bj-shoebox{width:70px;height:62px;border-radius:8px 8px 6px 6px;background:linear-gradient(#2b1a10,#1a0f08);border:2px solid #5a3a24;box-shadow:0 6px 12px rgba(0,0,0,.4);position:relative;display:flex;align-items:center;justify-content:center;transform:perspective(200px) rotateX(18deg)}',
'.ag-blackjack .bj-shoecard{width:46px;height:40px;border-radius:4px;background:#24140a;border:2px solid #fbf8f3;position:relative;overflow:hidden}',
'.ag-blackjack .bj-shoecard:after{content:"";position:absolute;inset:2px;border-radius:2px;background:repeating-linear-gradient(45deg,var(--ember) 0 3px,#b9531a 3px 6px)}',
'.ag-blackjack .bj-shoeinfo b{color:#fff;font-weight:700}',
'.ag-blackjack .bj-discard{position:absolute;top:34px;left:44px;width:70px;height:50px;border-radius:6px;border:1px dashed rgba(255,255,255,.18);display:flex;align-items:flex-end;justify-content:center;font-size:8px;letter-spacing:1px;color:rgba(255,255,255,.3);padding-bottom:3px;font-family:var(--display)}',
'.ag-blackjack .bj-rack{align-self:center;display:flex;gap:3px;padding:4px 8px;border-radius:8px;background:linear-gradient(#2a1a10,#1a0f08);border:1px solid #5a3a24;margin-bottom:8px;box-shadow:inset 0 2px 6px rgba(0,0,0,.6)}',
'.ag-blackjack .bj-rack i{display:block;width:12px;height:22px;border-radius:3px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.35),inset 0 -6px 0 rgba(0,0,0,.18)}',
/* dealer */
'.ag-blackjack .bj-dealer{display:flex;flex-direction:column;align-items:center;min-height:calc(var(--card-h) + 34px)}',
'.ag-blackjack .bj-cards{display:flex;min-height:var(--card-h);justify-content:center}',
'.ag-blackjack .bj-cards .bj-c+.bj-c{margin-left:calc(var(--card-w) * -0.45)}',
'.ag-blackjack .bj-hand.bj-many .bj-cards .bj-c+.bj-c{margin-left:calc(var(--card-w) * -0.62)}',
'.ag-blackjack .bj-spots{display:flex;gap:10px}',
'.ag-blackjack .bj-spot{width:var(--card-w);height:var(--card-h);border-radius:8px;border:2px dashed rgba(255,220,160,.2)}',
'.ag-blackjack .bj-lbl{font-family:var(--display);font-size:10px;letter-spacing:2.5px;color:rgba(255,230,190,.5);display:flex;gap:8px;align-items:center;min-height:26px;margin-top:6px}',
'.ag-blackjack .bj-tot{font-family:var(--mono);font-size:13px;letter-spacing:0;background:rgba(0,0,0,.5);color:#fff;border-radius:999px;padding:1px 10px;display:inline-block;border:1px solid rgba(255,255,255,.15)}',
'.ag-blackjack .bj-tot:empty{display:none}',
'.ag-blackjack .bj-tot.bust{background:var(--bad);color:#1b0303}',
'.ag-blackjack .bj-tot.bj{background:var(--gold);color:#2a1a00}',
/* printed middle + banner */
'.ag-blackjack .bj-mid{position:relative;flex:1 1 auto;min-height:84px;display:flex;align-items:center;justify-content:center}',
'.ag-blackjack .bj-print{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}',
'.ag-blackjack .bj-print text{font-family:var(--display);font-weight:700;letter-spacing:4px;fill:rgba(255,210,130,.30)}',
'.ag-blackjack .bj-print .big{font-size:30px;fill:rgba(255,210,130,.36)}',
'.ag-blackjack .bj-print .ins{font-size:17px}',
'.ag-blackjack .bj-print .sm{font-size:13px;letter-spacing:3px;fill:rgba(255,255,255,.2)}',
'.ag-blackjack .bj-print path.band{fill:none;stroke:rgba(255,210,130,.22);stroke-width:2}',
'.ag-blackjack .bj-banner{position:relative;z-index:3;font-family:var(--display);font-size:19px;padding:8px 22px;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.4)}',
'.ag-blackjack .bj-banner:empty{display:none}',
'.ag-blackjack .bj-banner.win{background:var(--ok);color:#03200c}',
'.ag-blackjack .bj-banner.lose{background:rgba(255,90,82,.95);color:#200303}',
'.ag-blackjack .bj-banner.push{background:var(--panel2);color:var(--fg)}',
'.ag-blackjack .bj-banner.bj{background:var(--gold);color:#2a1a00}',
/* player zone: toast | hands | coach bubble */
'.ag-blackjack .bj-pzone{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:14px;align-items:center}',
'.ag-blackjack .bj-hands{display:flex;gap:14px;justify-content:center;align-items:flex-end}',
'.ag-blackjack .bj-hand{display:flex;flex-direction:column;align-items:center;padding:6px 8px 4px;border-radius:16px;border:2px solid transparent;transition:border-color .2s,background .2s;min-width:calc(var(--card-w) * 1.6);position:relative}',
'.ag-blackjack .bj-hand.bj-act{border-color:rgba(255,138,61,.85);background:rgba(255,138,61,.08)}',
'.ag-blackjack .bj-hinfo{display:flex;gap:6px;align-items:center;min-height:24px;margin-bottom:4px}',
'.ag-blackjack .bj-res{font-family:var(--display);font-size:10.5px;padding:2px 8px;border-radius:6px;letter-spacing:.5px}',
'.ag-blackjack .bj-res:empty{display:none}',
'.ag-blackjack .bj-res.win{background:var(--ok);color:#03200c}.ag-blackjack .bj-res.lose{background:var(--bad);color:#200303}.ag-blackjack .bj-res.push{background:var(--panel2);color:var(--fg)}.ag-blackjack .bj-res.bj{background:var(--gold);color:#2a1a00}',
/* betting circle + chip stacks */
'.ag-blackjack .bj-circle{position:relative;width:96px;height:72px;margin-top:8px;margin-bottom:18px;border-radius:50%;border:2px solid rgba(255,220,160,.42);box-shadow:inset 0 0 0 5px rgba(0,0,0,.12),inset 0 0 0 6px rgba(255,220,160,.16);display:flex;align-items:center;justify-content:center;gap:4px}',
'.ag-blackjack .bj-circle.bj-click{cursor:pointer}',
'.ag-blackjack .bj-circle.bj-click:hover{border-color:var(--gold)}',
'.ag-blackjack .bj-circle.bj-empty:before{content:"BET";font-family:var(--display);font-size:11px;letter-spacing:3px;color:rgba(255,220,160,.35)}',
'.ag-blackjack .bj-amt{position:absolute;left:50%;bottom:-19px;transform:translateX(-50%);font-family:var(--mono);font-size:12px;font-weight:700;color:var(--gold);white-space:nowrap;text-shadow:0 1px 2px #000}',
'.ag-blackjack .bj-amt:empty{display:none}',
'.ag-blackjack .bj-stk{position:relative;width:34px;height:34px;margin-top:-6px}',
'.ag-blackjack .bj-stk.bj-win .bj-sc{box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 8px rgba(255,200,97,.7)}',
'.ag-blackjack .bj-stk.bj-ins{transform:scale(.8)}',
'.ag-blackjack .bj-sc{position:absolute;left:0;width:34px;height:34px;border-radius:50%;border:3px dashed rgba(255,255,255,.8);box-shadow:0 2px 0 rgba(0,0,0,.55),inset 0 0 0 3px rgba(0,0,0,.25);font-family:var(--mono);font-weight:800;font-size:10px;color:#fff;display:flex;align-items:center;justify-content:center;line-height:1}',
/* coach bubble + feedback toast */
'.ag-blackjack .bj-bubcol{display:flex;justify-content:flex-start;align-items:center;min-width:0}',
'.ag-blackjack .bj-toastcol{display:flex;justify-content:flex-end;align-items:center;min-width:0}',
'.ag-blackjack .bj-bubble{position:relative;max-width:300px;background:#f6efe4;color:#22180f;border-radius:14px;padding:8px 12px 9px;font-size:13px;line-height:1.35;box-shadow:0 8px 22px rgba(0,0,0,.45)}',
'.ag-blackjack .bj-bubble:before{content:"";position:absolute;left:-8px;top:50%;margin-top:-8px;border:8px solid transparent;border-left:0;border-right-color:#f6efe4}',
'.ag-blackjack .bj-bubble b{display:flex;align-items:center;gap:6px;font-size:12px;color:#0f6c60;margin-bottom:2px;font-family:var(--display);letter-spacing:.3px}',
'.ag-blackjack .bj-bubble.bj-quiet{background:rgba(0,0,0,.35);color:rgba(255,255,255,.7);box-shadow:none}',
'.ag-blackjack .bj-bubble.bj-quiet:before{border-right-color:rgba(0,0,0,.35)}',
'.ag-blackjack .bj-bubble.bj-quiet b{color:var(--cool)}',
'.ag-blackjack .bj-bubble[hidden],.ag-blackjack .bj-toast[hidden]{display:none}',
'.ag-blackjack .bj-toast{position:relative;max-width:280px;border-radius:12px;padding:7px 11px;font-size:12.5px;line-height:1.35;background:rgba(10,10,10,.78);border:1px solid rgba(255,255,255,.12);color:#fff;box-shadow:0 8px 22px rgba(0,0,0,.4);animation:agbj-toast 6s ease both}',
'.ag-blackjack .bj-toast:after{content:"";position:absolute;right:-8px;top:50%;margin-top:-7px;border:7px solid transparent;border-right:0;border-left-color:rgba(10,10,10,.78)}',
'.ag-blackjack .bj-toast.ok{border-color:rgba(74,222,128,.5)}.ag-blackjack .bj-toast.ok i{color:var(--ok)}',
'.ag-blackjack .bj-toast.miss{border-color:rgba(255,200,97,.55)}.ag-blackjack .bj-toast.miss i{color:var(--gold)}',
'.ag-blackjack .bj-toast i{font-style:normal;font-weight:700}',
'@keyframes agbj-toast{0%{opacity:0;transform:translateY(6px) scale(.96)}5%{opacity:1;transform:none}85%{opacity:1}100%{opacity:0;visibility:hidden}}',
/* action plaques */
'.ag-blackjack .bj-acts{display:flex;gap:10px;justify-content:center;align-items:flex-end;min-height:64px;padding:16px 0 10px;flex-wrap:wrap}',
'.ag-blackjack .bj-plq{position:relative;min-width:92px;height:42px;padding:0 14px;border-radius:10px;font-family:var(--display);font-size:13px;letter-spacing:.5px;color:#2a1a08;background:linear-gradient(#ffe2a8,#e7b866);border:1px solid #8a5a22;box-shadow:0 3px 0 #7a4a1a,0 6px 12px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.6);display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .08s,filter .15s}',
'.ag-blackjack .bj-plq:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-1px)}',
'.ag-blackjack .bj-plq:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 #7a4a1a,0 3px 6px rgba(0,0,0,.35)}',
'.ag-blackjack .bj-plq:disabled{opacity:.32;cursor:default;filter:grayscale(.6)}',
'.ag-blackjack .bj-plq.bj-alt{background:linear-gradient(#2c3a35,#1c2925);color:#e9f2ee;border-color:#0d1714;box-shadow:0 3px 0 #08100e,0 6px 12px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.12)}',
'.ag-blackjack .bj-plq kbd{font-family:var(--mono);font-size:10px;opacity:.6;font-weight:600;background:rgba(0,0,0,.12);border-radius:4px;padding:0 4px}',
'.ag-blackjack .bj-plq.bj-alt kbd{background:rgba(255,255,255,.1)}',
'.ag-blackjack .bj-plq.bj-rec{animation:agbj-glow 1.3s ease-in-out infinite;border-color:var(--cool)}',
'@keyframes agbj-glow{0%,100%{box-shadow:0 3px 0 #7a4a1a,0 0 0 2px var(--cool),0 0 6px 1px rgba(111,211,199,.45)}50%{box-shadow:0 3px 0 #7a4a1a,0 0 0 3px var(--cool),0 0 20px 6px rgba(111,211,199,.6)}}',
'.ag-blackjack .bj-ctag{position:absolute;top:-17px;left:50%;transform:translateX(-50%);font-family:var(--body);font-size:10px;font-weight:700;letter-spacing:.4px;background:var(--cool);color:#03201c;border-radius:999px;padding:1px 7px;white-space:nowrap;pointer-events:none}',
'.ag-blackjack .bj-ask{font-size:13px;color:rgba(255,255,255,.75);align-self:center;margin-right:4px}',
'.ag-blackjack .bj-hint{font-size:12.5px;color:rgba(255,235,200,.5);align-self:center;letter-spacing:.3px}',
/* rail */
'.ag-blackjack .bj-rail{margin:0 -22px;padding:12px 22px 14px;background:linear-gradient(#5b3820,#3d2412 55%,#2d1a0c);border-top:3px solid #6e4628;box-shadow:inset 0 2px 0 rgba(255,255,255,.08),0 -8px 18px rgba(0,0,0,.35);display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center}',
'.ag-blackjack .bj-bank{min-width:120px;line-height:1.15}',
'.ag-blackjack .bj-bank span,.ag-blackjack .bj-betinfo span{display:block;color:rgba(255,230,200,.6);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700}',
'.ag-blackjack .bj-bank b{font-family:var(--mono);font-size:21px;color:var(--gold);display:inline-block}',
'.ag-blackjack .bj-tray{display:flex;gap:6px;padding:6px 10px;border-radius:12px;background:linear-gradient(#1b0f07,#2a170b);box-shadow:inset 0 3px 8px rgba(0,0,0,.7),0 1px 0 rgba(255,255,255,.08)}',
'.ag-blackjack .bj-chip{width:46px;height:46px;border-radius:50%;font-family:var(--mono);font-weight:800;font-size:12.5px;color:#fff;position:relative;border:4px dashed rgba(255,255,255,.8);box-shadow:0 3px 0 rgba(0,0,0,.55),inset 0 0 0 3px rgba(0,0,0,.25);transition:transform .12s}',
'.ag-blackjack .bj-chip:hover:not(:disabled){transform:translateY(-3px)}',
'.ag-blackjack .bj-chip:disabled{opacity:.3;cursor:default}',
'.ag-blackjack .bj-railbtns{display:flex;flex-direction:column;gap:4px}',
'.ag-blackjack .bj-railbtns button{height:24px;padding:0 10px;border-radius:6px;font-size:12px;font-weight:600;color:rgba(255,235,210,.85);background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.12);white-space:nowrap}',
'.ag-blackjack .bj-railbtns button:hover:not(:disabled){background:rgba(0,0,0,.45)}',
'.ag-blackjack .bj-railbtns button:disabled{opacity:.35;cursor:default}',
'.ag-blackjack .bj-betinfo{min-width:84px;text-align:right;line-height:1.15;margin-left:auto}',
'.ag-blackjack .bj-betinfo b{font-family:var(--mono);font-size:19px;color:#fff}',
'.ag-blackjack .bj-deal{height:46px;min-width:120px;justify-content:center;font-size:15px}',
'.ag-blackjack .bj-kbd{font-family:var(--mono);font-size:10px;opacity:.6;margin-left:2px}',
'.ag-blackjack .bj-railsp{flex:0 0 0}',
/* cards */
'.ag-blackjack .bj-c{width:var(--card-w);height:var(--card-h);perspective:700px;flex:0 0 auto;position:relative}',
'.ag-blackjack .bj-c.deal{animation:agbj-deal .42s cubic-bezier(.2,.7,.3,1) both;animation-delay:var(--d,0ms)}',
'@keyframes agbj-deal{from{transform:translate(var(--fx,300px),var(--fy,-160px)) rotate(-25deg) scale(.7);opacity:0}15%{opacity:1}to{transform:none;opacity:1}}',
'.ag-blackjack .bj-ci{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.3,.7,.3,1)}',
'.ag-blackjack .bj-c.down .bj-ci{transform:rotateY(180deg)}',
'.ag-blackjack .bj-f,.ag-blackjack .bj-b{position:absolute;inset:0;border-radius:8px;backface-visibility:hidden;-webkit-backface-visibility:hidden;box-shadow:0 3px 8px rgba(0,0,0,.45)}',
'.ag-blackjack .bj-f{background:#fbf8f3;color:#1b1714;border:1px solid #d9d2c8}',
'.ag-blackjack .bj-f.red{color:#c8232c}',
'.ag-blackjack .bj-k{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:.95;font-weight:700;font-family:var(--body)}',
'.ag-blackjack .bj-k b{font-size:calc(var(--card-w) * .23)}.ag-blackjack .bj-k i{font-style:normal;font-size:calc(var(--card-w) * .19)}',
'.ag-blackjack .bj-k.tl{top:5px;left:6px}.ag-blackjack .bj-k.br{bottom:5px;right:6px;transform:rotate(180deg)}',
'.ag-blackjack .bj-pip{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:calc(var(--card-w) * .52)}',
'.ag-blackjack .bj-pip.face span{border:2px solid currentColor;border-radius:6px;padding:4px 7px;line-height:1;display:flex;flex-direction:column;align-items:center;font-family:var(--display);font-size:calc(var(--card-w) * .3)}',
'.ag-blackjack .bj-pip.face span small{font-size:calc(var(--card-w) * .2);font-family:var(--body)}',
'.ag-blackjack .bj-b{transform:rotateY(180deg);background:#24140a;border:2px solid #fbf8f3;overflow:hidden}',
'.ag-blackjack .bj-b:before{content:"";position:absolute;inset:4px;border-radius:5px;background:repeating-linear-gradient(45deg,var(--ember) 0 4px,#b9531a 4px 8px),var(--ember);background-blend-mode:multiply;border:1px solid rgba(255,255,255,.35)}',
'.ag-blackjack .bj-b:after{content:"VM";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:var(--display);font-size:15px;color:#1b0d03;background:#ffc861;border-radius:999px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px #1b0d03}',
/* stats + details */
'.ag-blackjack .bj-stats{margin-top:8px;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11.5px;color:var(--dim);justify-content:center}',
'.ag-blackjack .bj-stats b{font-family:var(--mono);color:var(--muted);font-weight:600}',
'.ag-blackjack .fadein{animation:agbj-fade .28s ease-out both}',
'@keyframes agbj-fade{from{opacity:0;visibility:hidden;transform:translateY(4px)}to{opacity:1;visibility:visible;transform:none}}',
'.ag-blackjack details{margin-top:10px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:0 14px}',
'.ag-blackjack summary{cursor:pointer;padding:10px 0;font-weight:700;color:var(--fg)}',
'.ag-blackjack details[open] summary{border-bottom:1px solid var(--line);margin-bottom:10px}',
'.ag-blackjack .bj-charts{display:flex;gap:18px;flex-wrap:wrap;padding-bottom:12px}',
'.ag-blackjack table.bj-tab{border-collapse:collapse;font-family:var(--mono);font-size:11px}',
'.ag-blackjack table.bj-tab caption{text-align:left;font-family:var(--body);font-weight:700;font-size:13px;padding-bottom:4px}',
'.ag-blackjack table.bj-tab th{color:var(--muted);font-weight:600;padding:2px 4px;text-align:center}',
'.ag-blackjack table.bj-tab td{width:26px;height:20px;text-align:center;font-weight:700;border:1px solid var(--bg)}',
'.ag-blackjack .k-H{background:#3a3430;color:#f3ece5}.ag-blackjack .k-S{background:#d9b44a;color:#251a00}.ag-blackjack .k-D,.ag-blackjack .k-Ds{background:#ff8a3d;color:#1b0d03}.ag-blackjack .k-P{background:#4fb3a7;color:#03201c}.ag-blackjack .k-R{background:#e25a52;color:#200303}',
'.ag-blackjack .bj-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--muted);padding-bottom:12px}',
'.ag-blackjack .bj-legend span i{display:inline-block;width:22px;text-align:center;font-style:normal;font-family:var(--mono);font-weight:700;border-radius:3px;margin-right:4px}',
'.ag-blackjack .bj-tipsl{margin:0 0 12px;padding-left:18px;font-size:13.5px;color:var(--fg)}',
'.ag-blackjack .bj-tipsl li{margin:4px 0}.ag-blackjack .bj-tipsl b{color:var(--ember)}',
/* narrow tables */
'.ag-blackjack.bj-narrow .bj-pzone{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:8px}',
'.ag-blackjack.bj-narrow .bj-bubble,.ag-blackjack.bj-narrow .bj-toast{max-width:200px;font-size:12px}',
'.ag-blackjack.bj-narrow .bj-chip{width:40px;height:40px;font-size:11px}',
'.ag-blackjack.bj-narrow .bj-plq{min-width:78px;padding:0 10px;font-size:12px}',
'.ag-blackjack.bj-narrow .bj-discard{display:none}',
'.ag-blackjack.bj-narrow .bj-shoe{right:22px}',
'.ag-blackjack.bj-narrow .bj-rail{gap:10px;padding-left:16px;padding-right:16px;margin:0 -22px}',
'.ag-blackjack.bj-narrow .bj-bank{min-width:0}.ag-blackjack.bj-narrow .bj-bank b{font-size:18px}',
'.ag-blackjack.bj-narrow .bj-tray{gap:4px;padding:5px 7px}',
'.ag-blackjack.bj-narrow .bj-betinfo{min-width:60px}.ag-blackjack.bj-narrow .bj-betinfo b{font-size:16px}',
'.ag-blackjack.bj-narrow .bj-deal{min-width:92px;padding:0 12px}',
/* short windows */
'.ag-blackjack.bj-tight .bj-felt{padding-top:10px}',
'.ag-blackjack.bj-tight .bj-rack{display:none}',
'.ag-blackjack.bj-tight .bj-shoe{top:18px}.ag-blackjack.bj-tight .bj-discard{top:20px}',
'.ag-blackjack.bj-tight .bj-lbl{margin-top:3px;min-height:24px}',
'.ag-blackjack.bj-tight .bj-mid{min-height:46px}',
'.ag-blackjack.bj-tight .bj-hinfo{min-height:22px;margin-bottom:2px}',
'.ag-blackjack.bj-tight .bj-circle{width:82px;height:58px;margin-top:5px;margin-bottom:16px}',
'.ag-blackjack.bj-tight .bj-acts{min-height:50px;padding:12px 0 6px}',
'.ag-blackjack.bj-tight .bj-plq{height:38px}',
'.ag-blackjack.bj-tight .bj-rail{padding:8px 22px 9px}',
'.ag-blackjack.bj-tight .bj-chip{width:40px;height:40px;font-size:11px}',
'.ag-blackjack.bj-narrow .bj-felt{border-radius:150px 150px 24px 24px / 90px 90px 24px 24px}',
'.ag-blackjack.bj-narrow .bj-shoe{right:34px;top:34px}'
  ].join('\n');

  function injectCSS(){
    if (document.getElementById('ag-' + ID + '-css')) return;
    var s = document.createElement('style'); s.id = 'ag-' + ID + '-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function money(n){ var neg = n < 0; n = Math.abs(n); var s = (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }); return (neg ? '−' : '') + '$' + s; }

  function chartHTML(){
    function cell(c){ var k = c === 'X' ? 'Ds' : c; return '<td class="k-' + k + '">' + (c === 'X' ? 'Ds' : c) + '</td>'; }
    function head(){ var h = '<tr><th></th>'; for (var i = 0; i < COLS.length; i++) h += '<th>' + COLS[i] + '</th>'; return h + '</tr>'; }
    var hard = '<table class="bj-tab"><caption>Hard totals</caption>' + head(), r, i;
    for (r = 17; r >= 8; r--){
      hard += '<tr><th>' + (r === 17 ? '17+' : r === 8 ? '5–8' : r) + '</th>';
      for (i = 0; i < 10; i++) hard += cell(HARD[r][i]);
      hard += '</tr>';
    }
    hard += '</table>';
    var soft = '<table class="bj-tab"><caption>Soft totals</caption>' + head();
    for (r = 20; r >= 13; r--){
      soft += '<tr><th>A,' + (r - 11) + '</th>';
      for (i = 0; i < 10; i++) soft += cell(SOFT[r][i]);
      soft += '</tr>';
    }
    soft += '</table>';
    var pair = '<table class="bj-tab"><caption>Pairs</caption>' + head();
    for (r = 11; r >= 2; r--){
      var lab = r === 11 ? 'A,A' : r === 10 ? '10,10' : r + ',' + r;
      pair += '<tr><th>' + lab + '</th>';
      for (i = 0; i < 10; i++){ var c = PAIR[r][i]; pair += cell(c); }
      pair += '</tr>';
    }
    pair += '</table>';
    return '<div class="bj-legend">' +
      '<span><i class="k-H">H</i>Hit</span><span><i class="k-S">S</i>Stand</span><span><i class="k-D">D</i>Double (else hit)</span>' +
      '<span><i class="k-Ds">Ds</i>Double (else stand)</span><span><i class="k-P">P</i>Split</span><span><i class="k-R">R</i>Surrender (else hit)</span>' +
      '<span>6 decks · dealer stands soft 17 · double after split · late surrender</span></div>' +
      '<div class="bj-charts">' + hard + soft + pair + '</div>';
  }

  var TIPS = '<ul class="bj-tipsl">' +
    '<li><b>Why basic strategy?</b> It’s the mathematically best play for every hand vs every dealer card, worked out by simulating billions of hands. It doesn’t guarantee a win, it just loses the least.</li>' +
    '<li><b>House edge ≈ 0.5%</b> with perfect basic strategy under these rules. Guessing or “playing like the dealer” costs 2–5%.</li>' +
    '<li><b>Never take insurance.</b> It’s a side bet that the hole card is a 10, and it carries a ~7% house edge. Even money on your blackjack is the same bet in disguise.</li>' +
    '<li><b>Always split Aces and 8s; never split 10s or 5s.</b> Double 11 vs 2–10, and 10 vs 2–9.</li>' +
    '<li><b>Dealer 2–6 is weak</b> (high bust chance): stand on stiff hands and double more. <b>Dealer 7–A is strong</b>: keep hitting stiffs.</li>' +
    '<li><b>Bankroll:</b> bet 1–2% of your bankroll per hand so normal swings don’t wipe you out. Set a stop-loss and a win goal, and never chase losses by raising bets.</li>' +
    '<li><b>No system beats the shoe.</b> Progressions like doubling after a loss don’t change the edge — they just make the swings bigger.</li>' +
    '</ul>';

  var MULE = '<svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true"><g fill="var(--ember)"><ellipse cx="13" cy="9" rx="3.4" ry="9" transform="rotate(-18 13 9)"/><ellipse cx="27" cy="9" rx="3.4" ry="9" transform="rotate(18 27 9)"/><ellipse cx="20" cy="22" rx="10" ry="11"/></g><ellipse cx="20" cy="30" rx="7.5" ry="6" fill="#ffc861"/><circle cx="16" cy="19" r="1.6" fill="#1b0d03"/><circle cx="24" cy="19" r="1.6" fill="#1b0d03"/><circle cx="17.5" cy="30.5" r="1.1" fill="#1b0d03"/><circle cx="22.5" cy="30.5" r="1.1" fill="#1b0d03"/></svg>';

  /* ---------------------------------------------------------------- chips */
  var DENOMS = [500, 100, 25, 5, 1], TRAY = [1, 5, 25, 100, 500], MAX_STACK = 12;
  function breakdown(n){ var out = []; n = Math.floor(n + 1e-9); for (var i = 0; i < DENOMS.length; i++) while (n >= DENOMS[i]){ out.push(DENOMS[i]); n -= DENOMS[i]; } return out; }
  function sum(a){ var t = 0; for (var i = 0; i < a.length; i++) t += a[i]; return t; }
  function compact(chips){ if (chips.length <= MAX_STACK) return chips.slice(); var b = breakdown(sum(chips)); return b.length > MAX_STACK ? b.slice(b.length - MAX_STACK) : b; }

  var PRINT = '<svg class="bj-print" viewBox="0 0 1000 192" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
    '<path id="agbj-a1" d="M120 22 Q500 150 880 22" fill="none"/>' +
    '<path class="band" d="M215 70 Q500 178 785 70"/><path class="band" d="M245 104 Q500 206 755 104"/>' +
    '<path id="agbj-a2" d="M228 92 Q500 196 772 92" fill="none"/>' +
    '<text class="big"><textPath href="#agbj-a1" startOffset="50%" text-anchor="middle">BLACKJACK PAYS 3 TO 2</textPath></text>' +
    '<text class="ins"><textPath href="#agbj-a2" startOffset="50%" text-anchor="middle">INSURANCE PAYS 2 TO 1</textPath></text>' +
    '<text class="sm" x="500" y="186" text-anchor="middle">DEALER MUST STAND ON ALL 17s</text></svg>';

  /* ---------------------------------------------------------------- game instance */
  var inst = null;

  function mount(el, api){
    if (inst) unmount();
    injectCSS();
    var saved = api.load('state') || {};
    var bankroll = typeof saved.bankroll === 'number' && isFinite(saved.bankroll) ? saved.bankroll : 1000;
    var stats = { hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, decisions: 0, correct: 0, net: 0 };
    if (saved.stats) for (var k in stats) if (typeof saved.stats[k] === 'number') stats[k] = saved.stats[k];
    var coachOn = saved.coach !== false;
    var lastBet = saved.lastBet || 0;
    var sv = api.load('sound'); var soundOn = sv === null ? !!api.sound : !!sv;

    var shoe = [], cid = 0;
    var phase = 'bet';           // bet | insurance | play | dealer | done
    var betChips = [];           // pending bet, in the order the chips were placed
    var dealer = [], holeDown = false, holeFlipDelay = null;
    var hands = [], active = 0;
    var insurance = 0, wagered = 0, roundPay = 0;
    var banner = { text: '', cls: '' };
    var lastNote = null;         // {text, cls, n}
    var noteN = 0;
    var animEnd = 0;
    var dead = false;
    var actx = null;
    var fx = [];                 // chip animations to run after the next render
    var anims = new Set();

    var smallMule = MULE.replace('width="38" height="38"', 'width="18" height="18"');
    el.innerHTML =
      '<div class="ag-blackjack" tabindex="-1">' +
        '<div class="bj-top">' +
          '<div class="bj-title">' + MULE + '<div><h2>Mule’s <em>21</em></h2><div class="bj-how">Get closer to 21 than the dealer without going over. Drop chips in the circle, Deal, then Hit / Stand / Double / Split / Surrender.</div></div></div>' +
          '<div class="bj-tops">' +
            '<button class="btn sec small bj-tog" data-act="coach" title="Show the basic-strategy play before each decision">Coach</button>' +
            '<button class="btn sec small" data-act="sound" title="Sound"></button>' +
            '<button class="btn sec small" data-act="reset">Reset bankroll</button>' +
          '</div>' +
        '</div>' +
        '<div class="bj-felt">' +
          '<div class="bj-discard">DISCARD</div>' +
          '<div class="bj-shoe" title="6-deck shoe"><div class="bj-shoebox"><div class="bj-shoecard"></div></div><span class="bj-shoeinfo"></span></div>' +
          '<div class="bj-rack" title="Dealer’s chip rack">' + [500, 100, 25, 5, 1, 1, 5, 25, 100, 500].map(function(v){ return '<i style="background:' + CHIP_COL[v] + '"></i>'; }).join('') + '</div>' +
          '<div class="bj-dealer"><div class="bj-cards bj-dcards"></div><div class="bj-spots bj-dspots"><div class="bj-spot"></div><div class="bj-spot"></div></div><div class="bj-lbl">DEALER <span class="bj-tot bj-dtot"></span></div></div>' +
          '<div class="bj-mid">' + PRINT + '<div class="bj-banner"></div></div>' +
          '<div class="bj-pzone"><div class="bj-toastcol"><div class="bj-toast" hidden></div></div><div class="bj-hands"></div><div class="bj-bubcol"><div class="bj-bubble" hidden></div></div></div>' +
          '<div class="bj-acts"></div>' +
          '<div class="bj-rail">' +
            '<div class="bj-bank"><span>Bankroll</span><b class="bj-roll"></b></div>' +
            '<div class="bj-tray">' + TRAY.map(function(v){ return '<button class="bj-chip" data-act="chip" data-v="' + v + '" style="background:' + CHIP_COL[v] + '" title="Add a $' + v + ' chip">' + v + '</button>'; }).join('') + '</div>' +
            '<div class="bj-railbtns"><button data-act="clear" title="Take your bet back (Backspace removes the last chip)">Clear</button><button data-act="repeat">Repeat</button></div>' +
            '<div class="bj-betinfo"><span class="bj-betlbl">Bet</span><b class="bj-betamt"></b></div>' +
            '<button class="btn pri bj-deal" data-act="deal">Deal <span class="bj-kbd">Space</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="bj-stats"></div>' +
        '<details class="bj-chartd"><summary>Strategy chart</summary>' + chartHTML() + '</details>' +
        '<details class="bj-tipsd"><summary>Tips</summary>' + TIPS + '</details>' +
      '</div>';

    var root = el.firstChild;
    var $ = function(s){ return root.querySelector(s); };
    var felt = $('.bj-felt'), rollEl = $('.bj-roll'), dTot = $('.bj-dtot'), dCards = $('.bj-dcards'), dSpots = $('.bj-dspots'), bannerEl = $('.bj-banner'),
        handsEl = $('.bj-hands'), bubbleEl = $('.bj-bubble'), toastEl = $('.bj-toast'), actsEl = $('.bj-acts'), statsEl = $('.bj-stats'),
        shoeInfo = $('.bj-shoeinfo'), shoeCard = $('.bj-shoecard'), rackEl = $('.bj-rack'), trayEl = $('.bj-tray'),
        betAmt = $('.bj-betamt'), betLbl = $('.bj-betlbl'), dealBtn = $('.bj-deal'), clearBtn = $('[data-act="clear"]'), repeatBtn = $('[data-act="repeat"]');
    var nodes = new Map(); // card id -> element
    var handEls = [];
    var lastActsKey = '';

    /* ---------- sound */
    function ac(){
      if (!soundOn) return null;
      if (!actx){ try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }
    function blip(f, dur, type, vol, when){
      var a = ac(); if (!a) return;
      var t = a.currentTime + (when || 0);
      var o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
      o.onended = function(){ o.disconnect(); g.disconnect(); };
    }
    function sCard(delayMs){ blip(900, 0.05, 'triangle', 0.04, delayMs / 1000); blip(520, 0.04, 'square', 0.015, delayMs / 1000 + 0.01); }
    function sChip(d){ var w = (d || 0) / 1000; blip(1500, 0.05, 'square', 0.03, w); blip(2100, 0.04, 'sine', 0.03, w + 0.03); }
    function sWin(d){ var w = d / 1000; blip(660, 0.12, 'triangle', 0.06, w); blip(880, 0.12, 'triangle', 0.06, w + 0.1); blip(1320, 0.2, 'triangle', 0.06, w + 0.2); }
    function sLose(d){ var w = d / 1000; blip(300, 0.18, 'sawtooth', 0.03, w); blip(220, 0.25, 'sawtooth', 0.03, w + 0.15); }

    /* ---------- persistence */
    function persist(){ api.save('state', { bankroll: Math.round(bankroll * 100) / 100, stats: stats, coach: coachOn, lastBet: lastBet }); }

    /* ---------- shoe */
    function rnd(n){
      if (window.crypto && crypto.getRandomValues){ var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
      return Math.floor(Math.random() * n);
    }
    function newShoe(){
      shoe = [];
      for (var d = 0; d < DECKS; d++) for (var s = 0; s < 4; s++) for (var r = 0; r < 13; r++) shoe.push({ r: RANKS[r], s: s, id: ++cid });
      for (var i = shoe.length - 1; i > 0; i--){ var j = rnd(i + 1), t = shoe[i]; shoe[i] = shoe[j]; shoe[j] = t; }
    }
    function slot(step){ var now = performance.now(), st = Math.max(now, animEnd); animEnd = st + step; return st - now; }
    function draw(){
      if (!shoe.length) newShoe();
      var c = shoe.pop(); c.dly = slot(240); sCard(c.dly); return c;
    }
    function busy(){ return performance.now() < animEnd - 60; }

    /* ---------- card DOM */
    function makeCard(c){
      var red = c.s === 1 || c.s === 2, suit = SUITS[c.s];
      var face = (c.r === 'J' || c.r === 'Q' || c.r === 'K');
      var d = document.createElement('div');
      d.className = 'bj-c';
      d.innerHTML = '<div class="bj-ci"><div class="bj-f' + (red ? ' red' : '') + '">' +
        '<div class="bj-k tl"><b>' + c.r + '</b><i>' + suit + '</i></div>' +
        '<div class="bj-pip' + (face ? ' face' : '') + '">' + (face ? '<span>' + c.r + '<small>' + suit + '</small></span>' : suit) + '</div>' +
        '<div class="bj-k br"><b>' + c.r + '</b><i>' + suit + '</i></div>' +
        '</div><div class="bj-b"></div></div>';
      d.addEventListener('animationend', function(){ d.classList.remove('deal'); });
      return d;
    }
    function syncCards(container, cards, isDealer){
      for (var i = 0; i < cards.length; i++){
        var c = cards[i], n = nodes.get(c.id), fresh = false;
        if (!n){ n = makeCard(c); nodes.set(c.id, n); fresh = true; }
        if (isDealer && i === 1 && (holeDown || fresh)) n.classList.add('down');
        if (container.children[i] !== n) container.insertBefore(n, container.children[i] || null);
        if (fresh){
          var r = n.getBoundingClientRect(), sr = shoeCard.getBoundingClientRect();
          n.style.setProperty('--fx', Math.round(sr.left - r.left) + 'px');
          n.style.setProperty('--fy', Math.round(sr.top - r.top) + 'px');
          n.style.setProperty('--d', Math.max(0, Math.round(c.dly || 0)) + 'ms');
          n.classList.add('deal');
          c.dly = 0;
        }
      }
      while (container.children.length > cards.length) container.removeChild(container.lastChild);
    }

    /* ---------- chip stacks + chip animations (Web Animations, no timers) */
    function syncStack(stk, chips, cls){
      var key = chips.join(',') + '|' + cls;
      if (stk._k === key) return;
      stk._k = key;
      stk.className = 'bj-stk ' + cls;
      stk.hidden = !chips.length;
      stk.innerHTML = '';
      for (var i = 0; i < chips.length; i++){
        var d = document.createElement('div');
        d.className = 'bj-sc'; d.style.background = CHIP_COL[chips[i]] || '#888';
        d.style.top = (-i * 4) + 'px'; d.style.zIndex = i + 1;
        if (i === chips.length - 1) d.textContent = chips[i];
        stk.appendChild(d);
      }
    }
    function track(a){ anims.add(a); a.onfinish = a.oncancel = function(){ anims.delete(a); }; return a; }
    function center(r){ return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    function flyIn(node, fromRect, delay){
      if (!node.animate) return;
      var a = center(node.getBoundingClientRect()), b = center(fromRect);
      track(node.animate([{ transform: 'translate(' + (b.x - a.x) + 'px,' + (b.y - a.y) + 'px) scale(1.15)', opacity: 0.85 }, { transform: 'none', opacity: 1 }],
        { duration: 420, delay: delay || 0, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' }));
    }
    function flyOut(node, toRect, delay){
      if (!node.animate) return;
      var a = center(node.getBoundingClientRect()), b = center(toRect);
      track(node.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(' + (b.x - a.x) + 'px,' + (b.y - a.y) + 'px) scale(.7)', opacity: 0 }],
        { duration: 480, delay: delay || 0, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' }));
    }
    // a loose chip flying from one spot to another (used when taking a chip back to the tray)
    function ghostChip(v, fromRect, toRect){
      var rr = root.getBoundingClientRect(), g = document.createElement('div');
      g.className = 'bj-sc'; g.style.background = CHIP_COL[v]; g.textContent = v;
      g.style.position = 'absolute'; g.style.zIndex = 20; g.style.pointerEvents = 'none';
      g.style.left = (fromRect.left - rr.left + fromRect.width / 2 - 17) + 'px'; g.style.top = (fromRect.top - rr.top + fromRect.height / 2 - 17) + 'px';
      root.appendChild(g);
      if (!g.animate){ g.remove(); return; }
      var a = track(g.animate([{ transform: 'none' }, { transform: 'translate(' + (toRect.left + toRect.width / 2 - fromRect.left - fromRect.width / 2) + 'px,' + (toRect.top + toRect.height / 2 - fromRect.top - fromRect.height / 2) + 'px) scale(.9)', opacity: 0.6 }],
        { duration: 300, easing: 'cubic-bezier(.3,.6,.4,1)' }));
      var done = a.onfinish;
      a.onfinish = a.oncancel = function(){ done && done(); g.remove(); };
    }
    function trayRect(v){ var b = trayEl.querySelector('[data-v="' + v + '"]'); return (b || trayEl).getBoundingClientRect(); }
    function runFx(){
      var list = fx; fx = [];
      list.forEach(function(f){
        var he = handEls[f.h]; if (!he) return;
        var stk = he.stk[f.col]; if (!stk || stk.hidden) return;
        var chips = Array.prototype.slice.call(stk.children);
        if (f.top) chips = chips.slice(-f.top);
        chips.forEach(function(n, i){
          var stagger = f.out ? (chips.length - 1 - i) * 40 : i * 55;
          if (f.out) flyOut(n, rackEl.getBoundingClientRect(), (f.delay || 0) + stagger);
          else flyIn(n, f.from === 'rack' ? rackEl.getBoundingClientRect() : f.from === 'tray' ? trayEl.getBoundingClientRect() : f.from, (f.delay || 0) + stagger);
        });
        if (f.sound) sChip(f.delay || 0);
      });
    }
    function stopAnims(){ anims.forEach(function(a){ try { a.cancel(); } catch (e) {} }); anims.clear(); }

    /* ---------- text helpers with delayed fade-in */
    function textDelay(){ var d = animEnd - performance.now(); return d > 0 ? d + 200 : 0; }
    function fade(node, delay){ node.classList.remove('fadein'); void node.offsetWidth; node.style.animationDelay = Math.round(delay) + 'ms'; node.classList.add('fadein'); }
    function setTxt(node, txt, cls, delay, html){
      var key = txt + '|' + (cls || '');
      if (node._k === key) return;
      node._k = key;
      if (html) node.innerHTML = txt; else node.textContent = txt;
      if (cls !== undefined) node.className = cls;
      if (txt) fade(node, delay);
    }

    /* ---------- hand helpers */
    function totalLabel(cards, natural){
      if (!cards.length) return '';
      var h = handTotal(cards);
      if (natural) return 'Blackjack';
      if (h.total > 21) return 'Bust ' + h.total;
      return (h.soft && h.total < 21 ? 'Soft ' : '') + h.total;
    }
    function isNatural(hand){ return hand.cards.length === 2 && !hand.split && handTotal(hand.cards).total === 21; }
    function dealerUp(){ return val(dealer[0].r); }
    function canDouble(h){ return h.cards.length === 2 && !h.splitAces && bankroll >= h.bet; }
    function canSplit(h){ return h.cards.length === 2 && val(h.cards[0].r) === val(h.cards[1].r) && hands.length < 4 && !h.splitAces && bankroll >= h.bet; }
    function canSurrender(h){ return hands.length === 1 && h.cards.length === 2 && !h.split; }
    function curRec(){
      var h = hands[active]; if (!h) return null;
      return recommend(h.cards, dealerUp(), { canDouble: canDouble(h), canSplit: canSplit(h), canSurrender: canSurrender(h) });
    }
    function newHand(cards, bet, chips){ return { cards: cards, bet: bet, chips: chips, dbl: [], win: [], ins: [], split: false, splitAces: false, done: false, doubled: false, surrendered: false, result: null, lost: false }; }
    function note(text, cls){ lastNote = { text: text, cls: cls, n: ++noteN }; }

    /* ---------- betting */
    // leave the finished round and start building a new bet on a cleared table
    function startBetting(){
      if (phase !== 'done') return phase === 'bet';
      stopAnims();
      phase = 'bet';
      nodes.clear(); dCards.innerHTML = ''; handsEl.innerHTML = ''; handEls = [];
      hands = []; dealer = []; holeDown = false; banner = { text: '', cls: '' }; lastNote = null;
      return true;
    }
    function addChip(v, fromRect){
      if (!startBetting()) return;
      if (sum(betChips) + v > bankroll){ api.toast('Not enough bankroll for that chip'); return; }
      betChips.push(v); sChip();
      if (betChips.length > MAX_STACK) betChips = compact(betChips);
      fx.push({ h: 0, col: 'main', top: 1, from: fromRect });
      render();
    }
    function removeChip(){
      if (phase !== 'bet' || !betChips.length) return;
      var he = handEls[0], top = he && he.stk.main.lastChild, from = top ? top.getBoundingClientRect() : null;
      var v = betChips.pop(); sChip();
      render();
      if (from) ghostChip(v, from, trayRect(v));
    }

    /* ---------- round flow */
    function deal(){
      if (phase !== 'bet' && phase !== 'done') return;
      if (busy()) return;
      var fromTray = false;
      if (phase === 'done') betChips = [];
      if (!betChips.length){
        if (lastBet > 0 && lastBet <= bankroll){ betChips = breakdown(lastBet); fromTray = true; }
        else { api.toast(bankroll < 1 ? 'Out of chips — hit "Reset bankroll" to get $1,000.' : 'Place a bet first — click the chips on the rail.'); return; }
      }
      var bet = sum(betChips);
      if (bet > bankroll){ betChips = []; render(); return; }
      if (shoe.length < CUT){ newShoe(); api.toast('Shuffling a fresh 6-deck shoe'); }
      // clear table
      stopAnims();
      nodes.clear(); dCards.innerHTML = ''; handsEl.innerHTML = ''; handEls = [];
      animEnd = performance.now();
      bankroll -= bet; wagered = bet; roundPay = 0; insurance = 0; lastBet = bet;
      hands = [newHand([], bet, compact(betChips))];
      betChips = [];
      active = 0; dealer = []; holeDown = true; holeFlipDelay = null; banner = { text: '', cls: '' }; lastNote = null;
      if (fromTray){ fx.push({ h: 0, col: 'main', from: 'tray' }); sChip(); }
      hands[0].cards.push(draw()); dealer.push(draw()); hands[0].cards.push(draw()); dealer.push(draw());
      persist();
      var up = dealer[0].r;
      if (up === 'A'){ phase = 'insurance'; render(); return; } // insurance / even money offered
      afterPeek();
    }

    function afterPeek(){
      var dBJ = handTotal(dealer).total === 21;
      var up = val(dealer[0].r);
      var pBJ = isNatural(hands[0]);
      if (insurance){
        if (dBJ){ hands[0].win = breakdown(insurance * 2); }
        else fx.push({ h: 0, col: 'ins', out: true, delay: 500 });
      }
      if ((up === 10 || up === 11) && dBJ){
        flipHole();
        if (insurance) roundPay += insurance * 3;
        var h = hands[0];
        if (pBJ){ h.result = 'push'; roundPay += h.bet; }
        else h.result = 'lose';
        banner = { text: 'Dealer has Blackjack' + (insurance ? ' — insurance pays 2:1' : ''), cls: pBJ ? 'push' : 'lose' };
        finish();
        return;
      }
      if (pBJ){
        flipHole();
        var hb = hands[0]; hb.result = 'bj'; roundPay += hb.bet * 2.5;
        banner = { text: 'Blackjack! Pays 3:2', cls: 'bj' };
        finish();
        return;
      }
      phase = 'play';
      render();
    }

    function flipHole(){
      if (!holeDown) return;
      holeDown = false; holeFlipDelay = slot(420);
      blip(700, 0.06, 'triangle', 0.04, holeFlipDelay / 1000);
    }

    function nextHand(){
      while (active < hands.length){
        var h = hands[active];
        if (h.cards.length === 1){
          h.cards.push(draw());
          if (h.splitAces) h.done = true;
        }
        if (!h.done && handTotal(h.cards).total >= 21) h.done = true;
        if (!h.done) break;
        active++;
      }
      if (active >= hands.length) dealerTurn(); else render();
    }

    function act(a){
      if (phase !== 'play' || busy()) return;
      var h = hands[active]; if (!h) return;
      var ok = { H: true, S: true, D: canDouble(h), P: canSplit(h), R: canSurrender(h) };
      if (!ok[a]) return;
      var rec = curRec();
      stats.decisions++;
      if (rec && rec.act === a){ stats.correct++; note('✓ ' + NAMES[a] + ' matches basic strategy.', 'ok'); }
      else if (rec) note('Basic strategy says ' + NAMES[rec.act] + ' here — ' + rec.reason, 'miss');
      if (a === 'H'){
        h.cards.push(draw());
        if (handTotal(h.cards).total >= 21){ h.done = true; active++; nextHand(); return; }
      } else if (a === 'S'){
        h.done = true; active++; nextHand(); return;
      } else if (a === 'D'){
        bankroll -= h.bet; wagered += h.bet; h.dbl = compact(h.chips); h.bet *= 2; h.doubled = true; sChip();
        fx.push({ h: active, col: 'dbl', from: 'tray' });
        h.cards.push(draw()); h.done = true; active++; nextHand(); return;
      } else if (a === 'P'){
        bankroll -= h.bet; wagered += h.bet; sChip();
        var aces = h.cards[0].r === 'A';
        var nh = newHand([h.cards.pop()], h.bet, h.chips.slice());
        nh.split = true; nh.splitAces = aces;
        h.split = true; h.splitAces = aces;
        hands.splice(active + 1, 0, nh);
        fx.push({ h: active + 1, col: 'main', from: 'tray' });
        h.cards.push(draw());
        if (aces){ h.done = true; nh.cards.push(draw()); nh.done = true; active = hands.length; dealerTurn(); return; }
        if (handTotal(h.cards).total === 21){ h.done = true; active++; nextHand(); return; }
      } else if (a === 'R'){
        h.surrendered = true; h.done = true; h.result = 'surr'; roundPay += h.bet / 2;
        active++; dealerTurn(); return;
      }
      render();
    }

    function insure(take){
      if (phase !== 'insurance' || busy()) return;
      stats.decisions++;
      var pBJ = isNatural(hands[0]);
      if (take){
        var cost = hands[0].bet / 2;
        if (bankroll < cost){ api.toast('Not enough bankroll for insurance'); stats.decisions--; return; }
        bankroll -= cost; wagered += cost; insurance = cost; sChip();
        hands[0].ins = breakdown(cost); if (!hands[0].ins.length) hands[0].ins = [1];
        fx.push({ h: 0, col: 'ins', from: 'tray' });
        note('Basic strategy says decline ' + (pBJ ? 'even money' : 'insurance') + ' — it’s a side bet with about a 7% house edge.', 'miss');
      } else {
        stats.correct++;
        note('✓ Declining insurance matches basic strategy.', 'ok');
      }
      afterPeek();
    }

    function dealerTurn(){
      phase = 'dealer';
      flipHole();
      var live = hands.some(function(h){ return !h.surrendered && handTotal(h.cards).total <= 21; });
      if (live){
        while (true){
          var t = handTotal(dealer);
          if (t.total >= 17) break; // stands on all 17s including soft 17
          dealer.push(draw());
        }
      }
      var dt = handTotal(dealer).total, dBust = dt > 21;
      var wins = 0, losses = 0;
      hands.forEach(function(h){
        if (h.result === 'surr') return;
        var pt = handTotal(h.cards).total;
        if (pt > 21) { h.result = 'bust'; losses++; return; }
        if (dBust || pt > dt){ h.result = 'win'; roundPay += h.bet * 2; wins++; }
        else if (pt === dt){ h.result = 'push'; roundPay += h.bet; }
        else { h.result = 'lose'; losses++; }
      });
      var net = roundPay - wagered;
      if (hands.length === 1 && hands[0].result === 'surr') banner = { text: 'Surrendered — half your bet back', cls: 'push' };
      else if (dBust && live) banner = { text: 'Dealer busts with ' + dt + '!', cls: 'win' };
      else if (net > 0) banner = { text: 'You win ' + money(net), cls: 'win' };
      else if (net < 0) banner = { text: (losses && !wins && hands.every(function(h){ return h.result === 'bust'; }) ? 'Bust — ' : 'You lose ') + money(-net).replace('−', ''), cls: 'lose' };
      else banner = { text: 'Push', cls: 'push' };
      if (dBust && live && net !== 0) banner.text += '  ' + (net > 0 ? '+' : '') + money(net);
      finish();
    }

    function finish(){
      phase = 'done';
      bankroll += roundPay;
      var net = roundPay - wagered;
      stats.net += net;
      var d = textDelay();
      hands.forEach(function(h, i){
        stats.hands++;
        if (h.result === 'win' || h.result === 'bj') stats.wins++;
        else if (h.result === 'push') stats.pushes++;
        else stats.losses++;
        if (h.result === 'bj') stats.blackjacks++;
        // chips: winnings slide in from the dealer's rack, losing bets slide over to it
        var dl = d + 150 + i * 160;
        if (h.result === 'win' || h.result === 'bj'){
          h.win = h.win.concat(breakdown(h.result === 'bj' ? h.bet * 1.5 : h.bet));
          fx.push({ h: i, col: 'win', from: 'rack', delay: dl, sound: true });
        } else if (h.result === 'lose' || h.result === 'bust'){
          h.lost = true;
          fx.push({ h: i, col: 'main', out: true, delay: dl, sound: true });
          fx.push({ h: i, col: 'dbl', out: true, delay: dl });
        } else if (h.result === 'surr'){
          fx.push({ h: i, col: 'main', out: true, top: Math.ceil(h.chips.length / 2), delay: dl, sound: true });
        }
        if (insurance && h.win.length && h.result !== 'win' && h.result !== 'bj' && i === 0) fx.push({ h: 0, col: 'win', from: 'rack', delay: dl, sound: true });
      });
      if (net > 0) sWin(d); else if (net < 0) sLose(d);
      if (sum(betChips) > bankroll) betChips = [];
      persist();
      render();
      if (bankroll < 1) api.toast('Out of chips — hit "Reset bankroll" to get $1,000.');
    }

    /* ---------- render */
    function makeHandEl(){
      var box = document.createElement('div'); box.className = 'bj-hand';
      box.innerHTML = '<div class="bj-hinfo"><span class="bj-tot"></span><span class="bj-res"></span></div><div class="bj-cards"></div>' +
        '<div class="bj-spots"><div class="bj-spot"></div></div>' +
        '<div class="bj-circle"><div class="bj-stk" data-c="ins" hidden></div><div class="bj-stk" data-c="main" hidden></div><div class="bj-stk" data-c="dbl" hidden></div><div class="bj-stk" data-c="win" hidden></div><span class="bj-amt"></span></div>';
      var q = function(s){ return box.querySelector(s); };
      return { box: box, cards: q('.bj-cards'), spots: q('.bj-spots'), tot: q('.bj-tot'), res: q('.bj-res'), circle: q('.bj-circle'), amt: q('.bj-amt'),
        stk: { ins: q('[data-c="ins"]'), main: q('[data-c="main"]'), dbl: q('[data-c="dbl"]'), win: q('[data-c="win"]') } };
    }

    function render(){
      if (dead) return;
      var td = textDelay();
      var betting = phase === 'bet' || phase === 'done';
      setTxt(rollEl, money(bankroll), undefined, td);
      shoeInfo.innerHTML = '<b>' + shoe.length + '</b> left';
      var tops = root.querySelector('[data-act="coach"]');
      tops.classList.toggle('bj-on', coachOn); tops.textContent = 'Coach: ' + (coachOn ? 'on' : 'off');
      root.querySelector('[data-act="sound"]').textContent = soundOn ? '🔊' : '🔇';

      // dealer
      syncCards(dCards, dealer, true);
      dSpots.hidden = dealer.length > 0;
      dCards.hidden = !dealer.length;
      if (dealer[1]){
        var hn = nodes.get(dealer[1].id);
        if (hn){
          if (holeDown) hn.classList.add('down');
          else if (hn.classList.contains('down')){
            hn.firstChild.style.transitionDelay = Math.round(holeFlipDelay || 0) + 'ms';
            hn.classList.remove('down');
          }
        }
      }
      var dl = '';
      if (dealer.length){
        if (holeDown) dl = 'Shows ' + (dealer[0].r === 'A' ? 'A' : val(dealer[0].r));
        else dl = totalLabel(dealer, dealer.length === 2 && handTotal(dealer).total === 21);
      }
      var dt = handTotal(dealer).total;
      setTxt(dTot, dl, 'bj-tot bj-dtot' + (!holeDown && dt > 21 ? ' bust' : '') + (!holeDown && dl === 'Blackjack' ? ' bj' : ''), td);

      // player hands (a pending bet shows as an empty hand with the betting circle)
      var view = phase === 'bet' ? [{ pending: true, cards: [], chips: compact(betChips), dbl: [], win: [], ins: [], bet: sum(betChips) }] : hands;
      while (handEls.length < view.length) handEls.push(makeHandEl());
      for (var i = 0; i < handEls.length; i++){
        var he = handEls[i];
        if (!view[i]){ if (he.box.parentNode) he.box.parentNode.removeChild(he.box); continue; }
        if (handsEl.children[i] !== he.box) handsEl.insertBefore(he.box, handsEl.children[i] || null);
      }
      handEls.length = Math.min(handEls.length, view.length);
      for (i = 0; i < view.length; i++){
        he = handEls[i]; var h = view[i];
        he.box.classList.toggle('bj-act', phase === 'play' && i === active);
        he.box.classList.toggle('bj-many', view.length > 2 || h.cards.length > 4);
        he.spots.hidden = !h.pending; he.cards.hidden = !!h.pending;
        syncCards(he.cards, h.cards, false);
        var nat = !h.pending && isNatural(h), ht = handTotal(h.cards).total;
        setTxt(he.tot, totalLabel(h.cards, nat), 'bj-tot' + (ht > 21 ? ' bust' : nat ? ' bj' : ''), td);
        var rt = '', rc = '';
        if (h.result){
          rt = { win: 'WIN', lose: 'LOSE', push: 'PUSH', bust: 'BUST', bj: 'BLACKJACK', surr: 'SURRENDER' }[h.result];
          rc = { win: 'win', lose: 'lose', push: 'push', bust: 'lose', bj: 'bj', surr: 'push' }[h.result];
        }
        setTxt(he.res, rt, 'bj-res ' + rc, td);
        syncStack(he.stk.ins, h.ins, 'bj-ins');
        syncStack(he.stk.main, h.chips, '');
        syncStack(he.stk.dbl, h.dbl, '');
        syncStack(he.stk.win, h.win, 'bj-win');
        var empty = !h.chips.length && !h.win.length && !h.ins.length;
        he.circle.classList.toggle('bj-empty', empty);
        he.circle.classList.toggle('bj-click', !!h.pending && h.chips.length > 0);
        he.circle.title = h.pending ? (h.chips.length ? 'Click to take back the last chip' : 'Click the chips on the rail to bet') : '';
        he.circle.setAttribute('data-act', h.pending ? 'unchip' : '');
        var amt = '';
        if (h.pending) amt = h.bet ? money(h.bet) : '';
        else if (h.lost) amt = '';
        else if (h.win.length && (h.result === 'win' || h.result === 'bj')) amt = money(h.bet) + ' + ' + money(sum(h.win));
        else amt = money(h.bet) + (h.doubled ? ' (×2)' : '') + (insurance && i === 0 && phase !== 'done' ? ' · ins ' + money(insurance) : '');
        he.amt.textContent = amt;
      }
      setTxt(bannerEl, banner.text, 'bj-banner ' + banner.cls, td);

      // coach bubble (next to the hand) and strategy feedback toast
      var rec = phase === 'play' ? curRec() : null, bub = '', quiet = false;
      if (coachOn){
        if (phase === 'play' && rec) bub = '<b>' + smallMule + 'Coach: ' + NAMES[rec.act] + '</b>' + esc(rec.reason);
        else if (phase === 'insurance') bub = '<b>' + smallMule + 'Coach: No thanks</b>Basic strategy never takes ' + (isNatural(hands[0]) ? 'even money' : 'insurance') + ' — it’s a side bet with a ~7% house edge.';
        else if (betting && !hands.length){
          quiet = true;
          bub = '<b>Coach</b>' + (stats.decisions ? 'Accuracy ' + Math.round(100 * stats.correct / stats.decisions) + '% over ' + stats.decisions + ' decisions.' : 'I’ll suggest the best play before every decision.');
        }
      }
      bubbleEl.hidden = !bub;
      setTxt(bubbleEl, bub, 'bj-bubble' + (quiet ? ' bj-quiet' : ''), phase === 'play' || phase === 'insurance' ? td : 0, true);
      var tn = coachOn && lastNote ? lastNote : null;
      toastEl.hidden = !tn;
      if (tn && toastEl._n !== tn.n){
        toastEl._n = tn.n;
        toastEl.className = 'bj-toast ' + tn.cls;
        toastEl.innerHTML = tn.cls === 'ok' ? '<i>✓</i> ' + esc(tn.text.replace(/^✓\s*/, '')) : '<i>Coach:</i> ' + esc(tn.text);
        toastEl.style.animation = 'none'; void toastEl.offsetWidth; toastEl.style.animation = '';
      }

      // action plaques on the felt
      var hc = '', key = phase + '|' + coachOn;
      if (betting){
        hc = '<span class="bj-hint">' + (phase === 'done'
          ? (lastBet && lastBet <= bankroll ? 'Space deals again for ' + money(lastBet) + ' · or click chips for a new bet' : 'Click chips on the rail to bet')
          : (betChips.length ? 'Space to deal · click the circle to take a chip back' : 'Click chips on the rail to bet' + (lastBet && lastBet <= bankroll ? ' · Space repeats ' + money(lastBet) : ''))) + '</span>';
        key += '|' + betChips.length + '|' + lastBet + '|' + (bankroll >= lastBet);
      } else if (phase === 'insurance'){
        var pbj = isNatural(hands[0]);
        hc = '<span class="bj-ask">Dealer shows an Ace. ' + (pbj ? 'Take even money?' : 'Insurance for ' + money(hands[0].bet / 2) + '?') + '</span>';
        hc += plaque('insyes', pbj ? 'Even money' : 'Insure', 'Y', bankroll >= hands[0].bet / 2, false, true);
        hc += plaque('insno', 'No thanks', 'N', true, coachOn, false);
      } else if (phase === 'play'){
        var h0 = hands[active];
        var list = [['H', 'Hit', true], ['S', 'Stand', true], ['D', 'Double', canDouble(h0)], ['P', 'Split', canSplit(h0)], ['R', 'Surrender', canSurrender(h0)]];
        list.forEach(function(x){ hc += plaque(x[0], x[1], x[0], x[2], coachOn && rec && rec.act === x[0], x[0] === 'R'); key += x[2] ? 1 : 0; });
        if (hands.length > 1) hc += '<span class="bj-hint">Hand ' + (active + 1) + ' of ' + hands.length + '</span>';
        key += '|' + active + '|' + hands.length + '|' + (rec && rec.act);
      }
      if (key !== lastActsKey){ lastActsKey = key; actsEl.innerHTML = hc; fade(actsEl, phase === 'play' || phase === 'insurance' ? td : 0); }

      // rail
      var pend = sum(betChips);
      Array.prototype.forEach.call(trayEl.children, function(b){ var v = +b.getAttribute('data-v'); b.disabled = !betting || (phase === 'bet' ? pend : 0) + v > bankroll; });
      clearBtn.disabled = !(phase === 'bet' && betChips.length);
      repeatBtn.disabled = !(betting && lastBet && lastBet <= bankroll);
      repeatBtn.textContent = 'Repeat' + (lastBet ? ' ' + money(lastBet) : '');
      betLbl.textContent = betting ? 'Bet' : 'In play';
      betAmt.textContent = money(betting ? (phase === 'bet' ? pend : 0) : wagered);
      var canDeal = phase === 'bet' ? (pend > 0 && pend <= bankroll) || (!pend && lastBet && lastBet <= bankroll) : phase === 'done' && lastBet && lastBet <= bankroll;
      dealBtn.style.visibility = betting ? '' : 'hidden';
      dealBtn.disabled = !canDeal;

      // stats
      var acc = stats.decisions ? Math.round(100 * stats.correct / stats.decisions) + '%' : '—';
      statsEl.innerHTML = '<span>Hands <b>' + stats.hands + '</b></span><span>Wins <b>' + stats.wins + '</b></span><span>Losses <b>' + stats.losses + '</b></span><span>Pushes <b>' + stats.pushes +
        '</b></span><span>Blackjacks <b>' + stats.blackjacks + '</b></span><span>Strategy accuracy <b>' + acc + '</b></span><span>Net <b>' + money(stats.net) + '</b></span>' +
        '<span>Keys: H hit · S stand · D double · P split · R surrender · Space deal · Backspace take back a chip</span>';

      if (fx.length) runFx();
    }
    function plaque(a, label, kb, enabled, isRec, alt){
      return '<button class="bj-plq' + (alt ? ' bj-alt' : '') + (isRec ? ' bj-rec' : '') + '" data-act="' + a + '"' + (enabled ? '' : ' disabled') + '>' +
        (isRec ? '<span class="bj-ctag">Coach</span>' : '') + label + ' <kbd>' + kb + '</kbd></button>';
    }

    /* ---------- layout: size the cards to the window */
    function fit(){
      if (dead || el.offsetParent === null) return;
      var w = root.clientWidth || 900;
      root.classList.toggle('bj-narrow', w < 900);
      var avail = window.innerHeight - felt.getBoundingClientRect().top - 40 - 24;
      // fixed parts of the table (rack, labels, printed band, circles, plaques, rail) take ~480px; cards get the rest
      var tight = avail < 480 + 2 * 92;
      root.classList.toggle('bj-tight', tight);
      var ch = Math.max(66, Math.min(124, Math.floor((avail - (tight ? 380 : 480)) / 2)));
      if (w < 900) ch = Math.min(ch, 106);
      root.style.setProperty('--card-h', ch + 'px');
      root.style.setProperty('--card-w', Math.round(ch * 0.71) + 'px');
      felt.style.minHeight = Math.max(0, Math.min(avail, 2 * ch + (tight ? 400 : 520))) + 'px';
    }

    /* ---------- input */
    function onClick(e){
      var b = e.target.closest('[data-act]'); if (!b || !root.contains(b) || b.disabled) return;
      var a = b.getAttribute('data-act');
      switch (a){
        case 'chip':
          if (phase !== 'bet' && phase !== 'done') return;
          addChip(+b.getAttribute('data-v'), b.getBoundingClientRect()); break;
        case 'unchip': removeChip(); break;
        case 'clear':
          if (phase !== 'bet' || !betChips.length) return;
          var he = handEls[0], stk = he && he.stk.main, rects = stk ? Array.prototype.map.call(stk.children, function(n){ return n.getBoundingClientRect(); }) : [];
          var old = betChips.slice(); betChips = []; sChip(); render();
          rects.slice(-6).forEach(function(r, i){ var v = old[old.length - rects.slice(-6).length + i] || 1; ghostChip(v, r, trayRect(v)); });
          break;
        case 'repeat':
          if (!startBetting()) return;
          if (lastBet <= bankroll){ betChips = breakdown(lastBet); sChip(); fx.push({ h: 0, col: 'main', from: 'tray' }); }
          render(); break;
        case 'deal': deal(); break;
        case 'H': case 'S': case 'D': case 'P': case 'R': act(a); break;
        case 'insyes': insure(true); break;
        case 'insno': insure(false); break;
        case 'coach': coachOn = !coachOn; persist(); render(); break;
        case 'sound': soundOn = !soundOn; api.save('sound', soundOn); if (soundOn) blip(880, 0.08, 'triangle', 0.05); render(); break;
        case 'reset':
          if (phase === 'play' || phase === 'insurance' || phase === 'dealer'){ api.toast('Finish the hand first'); return; }
          if (!confirmReset){ confirmReset = true; b.textContent = 'Click again to reset'; return; }
          confirmReset = false; bankroll = 1000; betChips = [];
          for (var k2 in stats) stats[k2] = 0;
          lastNote = null; persist(); render(); b.textContent = 'Reset bankroll'; api.toast('Bankroll reset to $1,000');
          break;
      }
      if (a !== 'reset' && confirmReset){ confirmReset = false; var rb = root.querySelector('[data-act="reset"]'); if (rb) rb.textContent = 'Reset bankroll'; }
    }
    var confirmReset = false;

    function onKey(e){
      if (el.offsetParent === null || document.hidden) return;
      var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key.toLowerCase(), used = true;
      if (phase === 'play' && 'hsdpr'.indexOf(k) >= 0 && k.length === 1) act(k.toUpperCase());
      else if (phase === 'insurance' && (k === 'y' || k === 'n' || k === 'i')) insure(k !== 'n');
      else if ((phase === 'bet' || phase === 'done') && (k === ' ' || k === 'enter')){ if (t && t.tagName === 'BUTTON' && k === 'enter') return; if (!e.repeat) deal(); }
      else if (phase === 'bet' && k === 'backspace') removeChip();
      else used = false;
      if (used) e.preventDefault();
    }

    function onResize(){ fit(); }
    var ro = window.ResizeObserver ? new ResizeObserver(function(){ fit(); }) : null;

    newShoe();
    root.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    if (ro) ro.observe(el);
    fit();
    render();

    inst = {
      el: el,
      destroy: function(){
        dead = true;
        // return chips on the table if unmounted mid-round
        if (phase === 'play' || phase === 'insurance'){ bankroll += wagered; persist(); }
        root.removeEventListener('click', onClick);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        if (ro) ro.disconnect();
        stopAnims();
        if (actx){ try { actx.close(); } catch (e) {} actx = null; }
        nodes.clear();
        el.innerHTML = '';
      },
      test: {
        get state(){ return { phase: phase, bankroll: bankroll, betChips: betChips.slice(), hands: hands, dealer: dealer, shoe: shoe.length, stats: stats, anims: anims.size, coachOn: coachOn }; },
        rig: function(cards){ // put cards on top of the shoe (first in the list is dealt first)
          for (var i = cards.length - 1; i >= 0; i--){ var c = cards[i]; shoe.push({ r: c[0], s: c[1] || 0, id: ++cid }); }
        }
      }
    };
  }

  function unmount(){
    if (inst){ var i = inst; inst = null; i.destroy(); }
  }

  window.VanArcade[ID] = {
    mount: mount,
    unmount: unmount,
    get _t(){ return inst && inst.test; },
    // exposed for testing: recommend([{r:'10'},{r:'6'}], 10, {canSurrender:true}) -> {act:'R', reason}
    recommend: function(ranks, up, opts){
      var cards = ranks.map(function(r){ return typeof r === 'string' ? { r: r } : r; });
      return recommend(cards, typeof up === 'string' ? val(up) : up, opts);
    }
  };
})();
