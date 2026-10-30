/* VanMule Arcade — Craps ("Mule Dice")
   Standalone, no dependencies. Turn-based: no loops; only a short timer chain while dice tumble. */
(function(){
  'use strict';
  window.VanArcade = window.VanArcade || {};

  var ID = 'craps';
  var POINTS = [4,5,6,8,9,10];
  var ODDS_MULT = {4:3,5:4,6:5,8:5,9:4,10:3};          // 3-4-5x odds
  var LAY_MULT = 6;                                     // lay up to 6x flat (wins 3/4/5x)
  var TRUE_ODDS = {4:[2,1],5:[3,2],6:[6,5],8:[6,5],9:[3,2],10:[2,1]};
  var PLACE_PAY = {4:[9,5],5:[7,5],6:[7,6],8:[7,6],9:[7,5],10:[9,5]};
  var HARD_PAY = {4:7,6:9,8:9,10:7};
  var CHIPS = [1,5,25,100,500];
  var START_BANK = 1000;

  // ---------- bet catalogue (name, payout text, house edge, how it works) ----------
  var INFO = {
    pass:{name:'Pass Line',pays:'1:1',edge:1.41,how:'Come-out: wins on 7/11, loses on 2/3/12. Otherwise the roll becomes the point; wins if the point repeats before a 7.'},
    dp:{name:"Don't Pass",pays:'1:1',edge:1.36,how:'Come-out: wins on 2/3, pushes on 12, loses on 7/11. After a point is set, wins if a 7 rolls before the point.'},
    passOdds:{name:'Pass Odds',pays:'True odds (2:1 · 3:2 · 6:5)',edge:0,how:'Backs your Pass bet once a point is set. Pays true odds: zero house edge. Max 3x on 4/10, 4x on 5/9, 5x on 6/8.'},
    dpOdds:{name:"Don't Pass Lay Odds",pays:'True odds (1:2 · 2:3 · 5:6)',edge:0,how:'Backs your Don\'t Pass after a point is set. Pays true odds: zero house edge. Lay up to 6x your flat bet.'},
    come:{name:'Come',pays:'1:1',edge:1.41,how:'Like a fresh Pass Line bet made while a point is on: 7/11 wins, 2/3/12 loses, any other number becomes this bet\'s own point.'},
    dc:{name:"Don't Come",pays:'1:1',edge:1.36,how:'Like a fresh Don\'t Pass made while a point is on: 2/3 wins, 12 pushes, 7/11 loses, other numbers become its point (then 7 wins).'},
    field:{name:'Field',pays:'1:1 · 2 and 12 pay 2:1',edge:5.56,how:'One roll. Wins on 2,3,4,9,10,11,12 (2 and 12 pay double); loses on 5,6,7,8. Looks like lots of numbers, but the losers come up more often.'},
    big6:{name:'Big 6',pays:'1:1',edge:9.09,how:'Wins if a 6 rolls before a 7. Pays even money: Place 6 is the same bet at 7:6 with a 1.52% edge.'},
    big8:{name:'Big 8',pays:'1:1',edge:9.09,how:'Wins if an 8 rolls before a 7. Pays even money: Place 8 is the same bet at 7:6 with a 1.52% edge.'},
    any7:{name:'Any 7',pays:'4:1',edge:16.67,how:'One roll: wins if the next roll is a 7. Worst bet on the table.'},
    anyCraps:{name:'Any Craps',pays:'7:1',edge:11.11,how:'One roll: wins if the next roll is 2, 3 or 12.'},
    yo:{name:'Yo (11)',pays:'15:1',edge:11.11,how:'One roll: wins if the next roll is 11.'},
    hard4:{name:'Hard 4',pays:'7:1',edge:11.11,how:'Wins on 2+2 before a 7 or an easy 4 (1+3). Off on the come-out unless “working” is on.'},
    hard10:{name:'Hard 10',pays:'7:1',edge:11.11,how:'Wins on 5+5 before a 7 or an easy 10 (4+6). Off on the come-out unless “working” is on.'},
    hard6:{name:'Hard 6',pays:'9:1',edge:9.09,how:'Wins on 3+3 before a 7 or an easy 6. Off on the come-out unless “working” is on.'},
    hard8:{name:'Hard 8',pays:'9:1',edge:9.09,how:'Wins on 4+4 before a 7 or an easy 8. Off on the come-out unless “working” is on.'}
  };
  POINTS.forEach(function(n){
    var pe = (n===6||n===8)?1.52:(n===5||n===9)?4.0:6.67;
    INFO['place'+n] = {name:'Place '+n,pays:PLACE_PAY[n].join(':'),edge:pe,
      how:'Wins every time a '+n+' rolls before a 7 (bet stays up). Off on the come-out unless “working” is on. Bet multiples of '+((n===6||n===8)?'$6':'$5')+' for exact payouts.'};
    INFO['comeOdds'+n] = {name:'Come Odds on '+n,pays:TRUE_ODDS[n].join(':'),edge:0,
      how:'Free odds behind a Come bet sitting on '+n+'. True odds, zero edge, up to '+ODDS_MULT[n]+'x. Off on the come-out roll (returned if a 7 rolls then).'};
    INFO['dcOdds'+n] = {name:'Don\'t Come Lay Odds on '+n,pays:TRUE_ODDS[n].slice().reverse().join(':'),edge:0,
      how:'Lay odds behind a Don\'t Come bet sitting on '+n+'. True odds, zero edge, lay up to 6x.'};
    INFO['come'+n] = {name:'Come bet on '+n,pays:'1:1',edge:1.41,how:'Your Come bet\'s point is '+n+': it wins if '+n+' rolls before a 7.'};
    INFO['dc'+n] = {name:'Don\'t Come on '+n,pays:'1:1',edge:1.36,how:'Your Don\'t Come point is '+n+': it wins if a 7 rolls before '+n+'.'};
  });

  // ---------- small helpers ----------
  function r2(x){ return Math.round(x*100)/100; }
  function payFloor(x){ return Math.floor(x*100+1e-6)/100; }
  function fmt(x){ x=r2(x); var neg=x<0; x=Math.abs(x);
    var s = (x%1===0) ? x.toLocaleString('en-US') : x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    return (neg?'-$':'$')+s; }
  function fmtShort(x){ x=r2(x); if(x>=10000) return '$'+(Math.round(x/100)/10)+'k'; return fmt(x); }
  function edgeTxt(e){ return e===0 ? '0% (no house edge)' : (e.toFixed(2).replace(/0$/,'')+'%'); }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  // ---------- game engine (pure-ish, operates on state S) ----------
  function freshState(){ return {bank:START_BANK, bets:{}, point:null,
    stats:{rolls:0,pointsMade:0,sevenOuts:0,net:0,best:0,wagered:0}, hist:[]}; }

  function oddsCap(S,id){
    var m;
    if(id==='passOdds') return S.point ? (S.bets.pass||0)*ODDS_MULT[S.point] : 0;
    if(id==='dpOdds') return S.point ? (S.bets.dp||0)*LAY_MULT : 0;
    if((m=/^comeOdds(\d+)$/.exec(id))) return (S.bets['come'+m[1]]||0)*ODDS_MULT[m[1]];
    if((m=/^dcOdds(\d+)$/.exec(id))) return (S.bets['dc'+m[1]]||0)*LAY_MULT;
    return Infinity;
  }
  // returns null if ok, otherwise reason string
  function placeBlock(S,id){
    var m;
    if(id==='pass'||id==='dp') return S.point ? 'Line bets go down on the come-out roll only (puck OFF). Use Come / Don\'t Come now.' : null;
    if(id==='come'||id==='dc') return S.point ? null : 'Come and Don\'t Come need a point (puck ON). On the come-out use the Pass / Don\'t Pass line.';
    if(id==='passOdds') return !S.point ? 'Odds can be taken once a point is set.' : !(S.bets.pass>0) ? 'You need a Pass Line bet to take odds.' : null;
    if(id==='dpOdds') return !S.point ? 'Lay odds can be placed once a point is set.' : !(S.bets.dp>0) ? 'You need a Don\'t Pass bet to lay odds.' : null;
    if((m=/^comeOdds(\d+)$/.exec(id))) return S.bets['come'+m[1]]>0 ? null : 'No Come bet on '+m[1]+' yet. Bet Come; when a '+m[1]+' rolls it moves here and you can add odds.';
    if((m=/^dcOdds(\d+)$/.exec(id))) return S.bets['dc'+m[1]]>0 ? null : 'No Don\'t Come bet on '+m[1]+' yet. Bet Don\'t Come; when a '+m[1]+' rolls it moves here and you can lay odds.';
    if(/^(come|dc)\d+$/.test(id)) return 'That bet moves here by itself.';
    return INFO[id] ? null : 'Unknown bet';
  }
  function removeBlock(S,id){
    if(id==='pass' && S.point) return 'Pass Line is a contract bet: it can\'t be taken down once a point is set.';
    if(/^come\d+$/.test(id)) return 'A Come bet on a number is a contract bet and stays until it wins or loses.';
    return null;
  }
  function addBet(S,id,amt){
    var why = placeBlock(S,id); if(why) return {ok:false,msg:why};
    var cur = S.bets[id]||0, cap = oddsCap(S,id);
    if(cur>=cap) return {ok:false,msg:'Max odds already on '+INFO[id].name+' ('+fmt(cap)+').'};
    var a = Math.min(amt, cap-cur);
    if(a > S.bank) a = Math.floor(S.bank*100)/100;
    if(!(a>0)) return {ok:false,msg:'Not enough bankroll. Use Reset for a fresh '+fmt(START_BANK)+'.'};
    S.bank = r2(S.bank-a); S.bets[id] = r2(cur+a); S.stats.wagered = r2(S.stats.wagered+a);
    return {ok:true,amt:a,capped:a<amt};
  }
  function takeDown(S,id,amt){
    var cur = S.bets[id]||0; if(!cur) return {ok:false,msg:'Nothing on '+(INFO[id]?INFO[id].name:id)+'.'};
    var why = removeBlock(S,id); if(why) return {ok:false,msg:why};
    var a = Math.min(cur, amt||cur);
    S.bets[id] = r2(cur-a); S.bank = r2(S.bank+a); S.stats.wagered = Math.max(0,r2(S.stats.wagered-a));
    if(!S.bets[id]) delete S.bets[id];
    // odds can't exceed their (now smaller) flat bet: return the excess
    var deps = id==='pass'?['passOdds']: id==='dp'?['dpOdds']: /^dc\d+$/.test(id)?['dcOdds'+id.slice(2)]:[];
    deps.forEach(function(d){ var c=oddsCap(S,d); if((S.bets[d]||0)>c){ S.bank=r2(S.bank+S.bets[d]-c); S.bets[d]=r2(c); if(!S.bets[d]) delete S.bets[d]; }});
    return {ok:true,amt:a};
  }

  // Resolve one roll. Returns {events:[{id,kind,amt}], net, note}
  function resolve(S,d1,d2,placeWorking){
    var t=d1+d2, hard=d1===d2, B=S.bets, ev=[], pointOn=!!S.point, net=0;
    function win(id,mult,keep){ var w=payFloor(B[id]*mult); net+=w; S.bank=r2(S.bank+w);
      ev.push({id:id,kind:'win',amt:w,stake:B[id]}); if(!keep){ S.bank=r2(S.bank+B[id]); delete B[id]; } }
    function lose(id){ net-=B[id]; ev.push({id:id,kind:'lose',amt:B[id]}); delete B[id]; }
    function push(id){ ev.push({id:id,kind:'push',amt:B[id]}); S.bank=r2(S.bank+B[id]); delete B[id]; }
    function has(id){ return B[id]>0; }
    var working = pointOn || !!placeWorking;

    // one-roll bets (bets stay up after a win, like at a real table)
    if(has('field')){ if(t===2||t===12) win('field',2,true); else if(t===3||t===4||t===9||t===10||t===11) win('field',1,true); else lose('field'); }
    if(has('any7')){ if(t===7) win('any7',4,true); else lose('any7'); }
    if(has('anyCraps')){ if(t===2||t===3||t===12) win('anyCraps',7,true); else lose('anyCraps'); }
    if(has('yo')){ if(t===11) win('yo',15,true); else lose('yo'); }
    // hardways
    [4,6,8,10].forEach(function(n){ var id='hard'+n; if(!has(id)||!working) return;
      if(t===n&&hard) win(id,HARD_PAY[n],true); else if(t===n||t===7) lose(id); });
    // place bets
    POINTS.forEach(function(n){ var id='place'+n; if(!has(id)||!working) return;
      if(t===n) win(id,PLACE_PAY[n][0]/PLACE_PAY[n][1],true); else if(t===7) lose(id); });
    // big 6/8 (always working)
    [6,8].forEach(function(n){ var id='big'+n; if(!has(id)) return; if(t===n) win(id,1,true); else if(t===7) lose(id); });
    // established come / don't come points (before the come box moves)
    POINTS.forEach(function(n){
      var c='come'+n, co='comeOdds'+n, d='dc'+n, dO='dcOdds'+n, to=TRUE_ODDS[n];
      if(t===n){
        if(has(c)) win(c,1,false);
        if(has(co)){ if(pointOn) win(co,to[0]/to[1],false); else push(co); }
        if(has(d)) lose(d); if(has(dO)) lose(dO);
      } else if(t===7){
        if(has(c)) lose(c);
        if(has(co)){ if(pointOn) lose(co); else push(co); }
        if(has(d)) win(d,1,false); if(has(dO)) win(dO,to[1]/to[0],false);
      }
    });
    // come box
    if(has('come')){
      if(t===7||t===11) win('come',1,true);
      else if(t===2||t===3||t===12) lose('come');
      else { B['come'+t]=B.come; delete B.come; ev.push({id:'come',kind:'move',to:t}); }
    }
    if(has('dc')){
      if(t===2||t===3) win('dc',1,true);
      else if(t===12) ev.push({id:'dc',kind:'bar'});
      else if(t===7||t===11) lose('dc');
      else { B['dc'+t]=B.dc; delete B.dc; ev.push({id:'dc',kind:'move',to:t}); }
    }
    // line bets + puck
    var note='';
    if(!pointOn){
      if(t===7||t===11){ if(has('pass')) win('pass',1,true); if(has('dp')) lose('dp'); note='natural'; }
      else if(t===2||t===3||t===12){ if(has('pass')) lose('pass'); if(has('dp')){ if(t===12) ev.push({id:'dp',kind:'bar'}); else win('dp',1,true);} note='craps'; }
      else { S.point=t; note='point'; }
    } else {
      var p=S.point, to2=TRUE_ODDS[p];
      if(t===p){ if(has('pass')) win('pass',1,true); if(has('passOdds')) win('passOdds',to2[0]/to2[1],false);
        if(has('dp')) lose('dp'); if(has('dpOdds')) lose('dpOdds'); S.point=null; S.stats.pointsMade++; note='made'; }
      else if(t===7){ if(has('pass')) lose('pass'); if(has('passOdds')) lose('passOdds');
        if(has('dp')) win('dp',1,true); if(has('dpOdds')) win('dpOdds',to2[1]/to2[0],false); S.point=null; S.stats.sevenOuts++; note='sevenout'; }
    }
    // come / don't come box can't sit through a come-out: return it
    if(!S.point){ ['come','dc'].forEach(function(id){ if(has(id)) push(id); }); }
    net=r2(net);
    S.stats.rolls++; S.stats.net=r2(S.stats.net+net); if(net>S.stats.best) S.stats.best=net;
    S.hist.unshift({d:[d1,d2],t:t,n:note,net:net}); if(S.hist.length>24) S.hist.length=24;
    return {events:ev,net:net,note:note,total:t,hard:hard};
  }

  // ---------- CSS ----------
  var CSS = '\
.ag-craps{--felt:#123a2c;--felt2:#0d2d22;--feltline:rgba(255,236,200,.55);color:var(--fg);font-family:var(--body);user-select:none;-webkit-user-select:none;position:relative}\
.ag-craps *{box-sizing:border-box}\
.ag-craps .cr-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:10px}\
.ag-craps .cr-title{font-family:var(--display);font-size:22px;font-weight:800;letter-spacing:.5px;margin:0;line-height:1}\
.ag-craps .cr-title b{color:var(--ember)}\
.ag-craps .cr-how{color:var(--muted);font-size:13px;flex:1;min-width:220px}\
.ag-craps .cr-bank{font-family:var(--mono);font-weight:700;font-size:20px;color:var(--gold);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 12px;white-space:nowrap}\
.ag-craps .cr-bank small{font-family:var(--body);font-size:11px;color:var(--muted);font-weight:600;margin-right:6px;text-transform:uppercase;letter-spacing:.08em}\
.ag-craps .cr-main{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:12px;align-items:start}\
.ag-craps .cr-felt{background:radial-gradient(ellipse at 50% 0%,#1a5641 0%,var(--felt) 45%,var(--felt2) 100%);border:6px solid #3a2416;border-radius:18px;box-shadow:inset 0 0 0 2px #5a3a22,inset 0 0 40px rgba(0,0,0,.45);padding:10px;display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:8px}\
.ag-craps .cr-lay{display:grid;gap:6px;grid-template-rows:auto auto auto auto auto}\
.ag-craps .ar{position:relative;border:2px solid var(--feltline);border-radius:8px;color:#f6efe2;cursor:pointer;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:13px;transition:background .15s,box-shadow .15s;min-height:44px;padding:4px 6px}\
.ag-craps .ar:hover{background:rgba(255,255,255,.07)}\
.ag-craps .ar.dis{opacity:.55}\
.ag-craps .ar.coach{box-shadow:0 0 0 3px var(--gold),0 0 18px rgba(255,200,97,.55);animation:agcr-pulse 1.4s ease-in-out infinite}\
@keyframes agcr-pulse{50%{box-shadow:0 0 0 3px var(--gold),0 0 6px rgba(255,200,97,.2)}}\
.ag-craps .ar.flash-win{background:rgba(74,222,128,.28)!important}\
.ag-craps .ar.flash-lose{background:rgba(255,90,82,.22)!important}\
.ag-craps .ar .lbl small{display:block;font-size:10px;font-weight:600;letter-spacing:.04em;color:rgba(246,239,226,.75);text-transform:none}\
.ag-craps .cr-nums{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px}\
.ag-craps .nb{display:grid;grid-template-rows:26px 1fr 26px;gap:3px;border:2px solid var(--feltline);border-radius:8px;padding:3px;position:relative}\
.ag-craps .nb .ar{border-width:1px;min-height:0;font-size:10px;padding:2px 3px;border-style:dashed;border-radius:5px}\
.ag-craps .nb .ar.pl{min-height:62px;flex-direction:column;border-style:solid;border-color:transparent}\
.ag-craps .nb .num{font-family:var(--display);font-size:28px;font-weight:800;line-height:1;color:#fff4dc}\
.ag-craps .nb .pp{font-size:10px;font-weight:600;color:rgba(246,239,226,.7);letter-spacing:0;text-transform:none}\
.ag-craps .nb.isPoint{border-color:var(--gold)}\
.ag-craps .puck{position:absolute;top:-10px;right:-8px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;font-family:var(--body);letter-spacing:.04em;box-shadow:0 2px 6px rgba(0,0,0,.6);z-index:4;pointer-events:none;transition:all .3s}\
.ag-craps .puck.on{background:#f8f4ea;color:#111;border:3px solid #111}\
.ag-craps .puck.off{background:#151515;color:#f8f4ea;border:3px solid #f8f4ea;position:static;flex:none}\
.ag-craps .cr-row{display:grid;gap:6px}\
.ag-craps .r-come{grid-template-columns:1fr 3fr}\
.ag-craps .r-field{grid-template-columns:1fr}\
.ag-craps .r-mid{grid-template-columns:1fr 1fr 2fr 1fr}\
.ag-craps .r-pass{grid-template-columns:3fr 1fr}\
.ag-craps .ar.come{min-height:58px;font-size:22px;font-family:var(--display);color:#ffd9b8}\
.ag-craps .ar.field{min-height:58px;color:#fff4dc;flex-direction:column;gap:2px}\
.ag-craps .ar.field .fn{font-family:var(--display);font-size:15px;letter-spacing:.12em}\
.ag-craps .ar.field .fn i{font-style:normal;display:inline-block;border:2px solid #ffc861;border-radius:50%;width:26px;height:26px;line-height:22px;font-size:12px;color:#ffc861}\
.ag-craps .ar.pass{min-height:52px;font-size:18px;font-family:var(--display);color:#fff4dc;border-color:#f6efe2}\
.ag-craps .ar.big{color:#ff8a8a;font-family:var(--display);font-size:13px}\
.ag-craps .ar.odds{font-size:11px;background:rgba(255,200,97,.06)}\
.ag-craps .cr-props{display:grid;grid-template-columns:1fr 1fr;gap:5px;align-content:start;border:2px solid rgba(255,138,138,.6);border-radius:10px;padding:6px;background:rgba(0,0,0,.18)}\
.ag-craps .cr-props h4{grid-column:1/-1;margin:0;font-size:10px;letter-spacing:.14em;color:#ff9f9f;text-align:center;font-weight:800}\
.ag-craps .cr-props .ar{min-height:50px;font-size:10px;flex-direction:column;gap:2px;border-color:rgba(255,138,138,.55);color:#ffe2e2;padding:3px}\
.ag-craps .cr-props .ar.wide{grid-column:1/-1;min-height:38px;flex-direction:row;gap:8px}\
.ag-craps .mini{display:inline-flex;gap:2px}\
.ag-craps .mini i{width:13px;height:13px;border-radius:3px;background:#f8f4ea;display:inline-block;position:relative}\
.ag-craps .mini i:after{content:attr(data-v);position:absolute;inset:0;font-size:9px;font-style:normal;color:#b00;line-height:13px;font-weight:900;font-family:var(--mono)}\
.ag-craps .stack{position:absolute;bottom:3px;right:3px;display:flex;align-items:center;gap:3px;z-index:3;pointer-events:none}\
.ag-craps .chip{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 5px;border-radius:13px;font-family:var(--mono);font-size:10px;font-weight:700;color:#fff;border:2px dashed rgba(255,255,255,.75);box-shadow:0 2px 4px rgba(0,0,0,.5);letter-spacing:0;text-transform:none}\
.ag-craps .chip.c1{background:#e9e4da;color:#222;border-color:#7a7166}.ag-craps .chip.c5{background:#c8322d}.ag-craps .chip.c25{background:#1f8a4c}.ag-craps .chip.c100{background:#1c1c1c}.ag-craps .chip.c500{background:#6a2fb1}\
.ag-craps .nb .stack{bottom:auto;top:50%;right:2px;transform:translateY(-50%)}\
.ag-craps .nb .ar.sub .stack{position:static;transform:none}\
.ag-craps .nb .ar.sub{justify-content:space-between;gap:2px}\
.ag-craps .nb .ar.sub .chip{height:18px;min-width:18px;font-size:9px;padding:0 3px;border-width:1px}\
.ag-craps .off-tag{position:absolute;top:3px;left:4px;font-size:9px;font-weight:900;background:#111;color:#fff;border-radius:4px;padding:1px 4px;letter-spacing:.06em;z-index:3}\
.ag-craps .cr-side{display:flex;flex-direction:column;gap:10px}\
.ag-craps .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px}\
.ag-craps .card h5{margin:0 0 8px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:700;display:flex;justify-content:space-between;align-items:center}\
.ag-craps .dice{display:flex;gap:12px;justify-content:center;align-items:center;height:76px;perspective:400px}\
.ag-craps .die{width:56px;height:56px;border-radius:11px;background:linear-gradient(145deg,#fffaf2,#e6ddcf);box-shadow:inset 0 -3px 0 rgba(0,0,0,.15),0 4px 10px rgba(0,0,0,.5);display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);padding:8px;gap:2px}\
.ag-craps .die.red{background:linear-gradient(145deg,#ff9a55,#e2601c)}\
.ag-craps .die b{border-radius:50%;background:transparent;margin:2px}\
.ag-craps .die b.p{background:#1b1310;box-shadow:inset 0 1px 1px rgba(255,255,255,.2)}\
.ag-craps .die.red b.p{background:#fff8ee}\
.ag-craps .dice.rolling .die{animation:agcr-tumble .18s linear infinite}\
.ag-craps .dice.rolling .die:nth-child(2){animation-duration:.22s;animation-direction:reverse}\
@keyframes agcr-tumble{0%{transform:rotate(0) translateY(0)}50%{transform:rotate(180deg) translateY(-8px) scale(.92)}100%{transform:rotate(360deg) translateY(0)}}\
.ag-craps .dice.landed .die{animation:agcr-land .35s ease-out}\
@keyframes agcr-land{0%{transform:scale(1.15)}100%{transform:scale(1)}}\
.ag-craps .total{text-align:center;font-family:var(--mono);font-size:13px;color:var(--muted);height:18px}\
.ag-craps .total b{color:var(--fg);font-size:15px}\
.ag-craps .rollbtn{width:100%;justify-content:center;height:46px;font-size:16px;font-family:var(--display);letter-spacing:.06em;margin-top:6px}\
.ag-craps .chips{display:flex;gap:6px;justify-content:space-between}\
.ag-craps .chips button.chip{min-width:38px;height:38px;border-radius:50%;font-size:11px;cursor:pointer;transition:transform .12s;padding:0}\
.ag-craps .chips button.chip.sel{transform:translateY(-4px) scale(1.08);box-shadow:0 0 0 3px var(--ember),0 4px 10px rgba(0,0,0,.6)}\
.ag-craps .hist{display:flex;flex-wrap:wrap;gap:4px}\
.ag-craps .hist span{font-family:var(--mono);font-size:12px;font-weight:700;width:26px;height:24px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;background:var(--panel2);border:1px solid var(--line)}\
.ag-craps .hist span.s7{background:rgba(255,90,82,.2);border-color:var(--bad);color:#ffb3ae}\
.ag-craps .hist span.made{background:rgba(74,222,128,.18);border-color:var(--ok);color:#b5f5cb}\
.ag-craps .hist span.pt{border-color:var(--gold);color:var(--gold)}\
.ag-craps .stats{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:12px;color:var(--muted)}\
.ag-craps .stats b{font-family:var(--mono);color:var(--fg);float:right;font-weight:700}\
.ag-craps .opts{display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--muted)}\
.ag-craps .opts label{display:flex;align-items:center;gap:8px;cursor:pointer}\
.ag-craps .opts input{accent-color:var(--ember)}\
.ag-craps .coachline{margin:0 0 10px;background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--ember);border-radius:10px;padding:9px 12px;font-size:14px;display:flex;gap:10px;align-items:flex-start;min-height:66px}\
.ag-craps .coachline .mule{font-size:20px;line-height:1}\
.ag-craps .coachline .st{color:var(--fg)}\
.ag-craps .coachline .rec{color:var(--gold);display:block;margin-top:2px}\
.ag-craps .coachline .warn{color:#ffb3ae;display:block;margin-top:2px}\
.ag-craps .lastres{font-size:13px;margin-top:4px;color:var(--muted);min-height:18px}\
.ag-craps .lastres .w{color:var(--ok);font-weight:700}.ag-craps .lastres .l{color:var(--bad);font-weight:700}\
.ag-craps details.tips{margin-top:10px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:0 12px}\
.ag-craps details.tips summary{cursor:pointer;padding:10px 0;font-weight:700;font-size:14px}\
.ag-craps details.tips .tb{font-size:13px;color:var(--muted);padding-bottom:12px;display:grid;grid-template-columns:1.2fr 1fr;gap:16px}\
.ag-craps details.tips ol,.ag-craps details.tips ul{margin:4px 0;padding-left:18px}\
.ag-craps details.tips li{margin:3px 0}\
.ag-craps details.tips b{color:var(--fg)}\
.ag-craps table.edges{width:100%;border-collapse:collapse;font-size:12px}\
.ag-craps table.edges td{padding:2px 4px;border-bottom:1px solid var(--line)}\
.ag-craps table.edges td:last-child{text-align:right;font-family:var(--mono)}\
.ag-craps table.edges tr.g td:last-child{color:var(--ok)}.ag-craps table.edges tr.m td:last-child{color:var(--gold)}.ag-craps table.edges tr.b td:last-child{color:var(--bad)}\
.ag-craps .tip{position:absolute;z-index:20;pointer-events:none;background:#0b0908;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:12.5px;max-width:270px;box-shadow:0 8px 24px rgba(0,0,0,.6);line-height:1.35}\
.ag-craps .tip .tn{font-weight:800;color:var(--fg);margin-bottom:2px}\
.ag-craps .tip .te{font-family:var(--mono);font-size:12px;margin:2px 0 4px}\
.ag-craps .tip .te .e0{color:var(--ok)}.ag-craps .tip .te .e1{color:var(--gold)}.ag-craps .tip .te .e2{color:var(--bad)}\
.ag-craps .tip .th{color:var(--muted)}\
.ag-craps .tip .tm{color:var(--cool);margin-top:4px;font-size:11.5px}\
.ag-craps .snd{min-width:40px;justify-content:center}\
@media (max-width:900px){.ag-craps .cr-main{grid-template-columns:1fr}.ag-craps .cr-side{display:grid;grid-template-columns:1fr 1fr;align-items:start}.ag-craps details.tips .tb{grid-template-columns:1fr}}\
@media (max-width:760px){.ag-craps .cr-felt{grid-template-columns:1fr}.ag-craps .cr-props{grid-template-columns:repeat(4,1fr)}.ag-craps .cr-props .ar.wide{grid-column:span 2}.ag-craps .nb .num{font-size:22px}}\
';

  // ---------- mount ----------
  var inst = null;
  var forced = [];       // queued forced dice for testing
  var instant = false;   // skip animation (testing)

  function mount(el, api){
    if(inst) unmount();
    if(!document.getElementById('ag-'+ID+'-css')){ var st=document.createElement('style'); st.id='ag-'+ID+'-css'; st.textContent=CSS; document.head.appendChild(st); }

    var saved = api.load('state');
    var S = freshState();
    if(saved && typeof saved.bank==='number'){
      S.bank = saved.bank; S.bets = saved.bets||{}; S.point = saved.point||null;
      S.stats = Object.assign(S.stats, saved.stats||{}); S.hist = saved.hist||[];
    }
    var O = Object.assign({coach:true, working:false, chip:5}, api.load('opts')||{});
    var sndSaved = api.load('sound'); var sound = (sndSaved===null||sndSaved===undefined) ? !!api.sound : !!sndSaved;
    var rolling=false, timers=[], actx=null, lastMsg='', lastRes=null, flashT=null;
    var listeners=[];
    function on(t,ev,fn,opt){ t.addEventListener(ev,fn,opt); listeners.push([t,ev,fn,opt]); }
    function later(fn,ms){ var id=setTimeout(function(){ timers=timers.filter(function(x){return x!==id;}); fn(); },ms); timers.push(id); return id; }
    function hiddenNow(){ return document.hidden || el.offsetParent===null; }

    // ----- audio -----
    function ac(){ if(!sound) return null; if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } } return actx; }
    function blip(f,d,type,vol,when){ var a=ac(); if(!a) return; var t=a.currentTime+(when||0); var o=a.createOscillator(), g=a.createGain();
      o.type=type||'sine'; o.frequency.setValueAtTime(f,t); g.gain.setValueAtTime(vol||0.06,t); g.gain.exponentialRampToValueAtTime(0.0001,t+d);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t+d+0.02); }
    function sChip(){ blip(1400,0.05,'triangle',0.05); blip(2100,0.04,'triangle',0.03,0.03); }
    function sRoll(){ for(var i=0;i<6;i++) blip(180+Math.random()*260,0.04,'square',0.025,i*0.07); }
    function sWin(){ blip(660,0.12,'triangle',0.06); blip(880,0.12,'triangle',0.06,0.1); blip(1320,0.18,'triangle',0.05,0.2); }
    function sLose(){ blip(220,0.25,'sawtooth',0.035); blip(160,0.3,'sawtooth',0.03,0.12); }

    // ----- DOM -----
    var root = document.createElement('div'); root.className='ag-craps'; el.appendChild(root);
    function chipHTML(a){ var c = a>=500?500:a>=100?100:a>=25?25:a>=5?5:1; return '<span class="chip c'+c+'">'+fmtShort(a).replace('$','')+'</span>'; }
    function mini(a,b){ return '<span class="mini"><i data-v="'+a+'"></i><i data-v="'+b+'"></i></span>'; }

    var numsHTML = POINTS.map(function(n){ return '<div class="nb" data-nb="'+n+'">'+
      '<div class="ar sub" data-bet="dcOdds'+n+'"><span class="lbl">Don\'t</span><span class="stack" data-st="dc'+n+'"></span></div>'+
      '<div class="ar pl" data-bet="place'+n+'"><span class="num">'+(n===6?'SIX':n===9?'NINE':n)+'</span><span class="pp">place '+PLACE_PAY[n].join(':')+'</span><span class="stack" data-st="place'+n+'"></span></div>'+
      '<div class="ar sub" data-bet="comeOdds'+n+'"><span class="lbl">Come</span><span class="stack" data-st="come'+n+'"></span></div>'+
      '</div>'; }).join('');
    // the big words SIX/NINE are traditional; keep digits for the rest
    numsHTML = numsHTML.replace('>SIX<','>6<').replace('>NINE<','>9<');

    root.innerHTML =
      '<div class="cr-top">'+
        '<h2 class="cr-title">Mule <b>Dice</b> Craps</h2>'+
        '<div class="cr-how">Pick a chip, click the felt to bet (right-click or Shift-click removes), then <b>Roll</b> (Space). Hover any bet to see its payout and house edge.</div>'+
        '<div class="cr-bank"><small>Bankroll</small><span data-r="bank"></span></div>'+
        '<button class="btn sec small snd" data-act="sound" title="Sound"></button>'+
        '<button class="btn sec small" data-act="reset" title="Reset bankroll to $1,000">Reset</button>'+
      '</div>'+
      '<div class="coachline"><span class="mule">🫏</span><div data-r="coach"></div></div>'+
      '<div class="cr-main">'+
        '<div class="cr-felt">'+
          '<div class="cr-lay">'+
            '<div class="cr-nums">'+numsHTML+'</div>'+
            '<div class="cr-row r-come">'+
              '<div class="ar" data-bet="dc"><span class="lbl">Don\'t Come<small>bar 12</small></span><span class="stack" data-st="dc"></span></div>'+
              '<div class="ar come" data-bet="come"><span class="lbl">Come</span><span class="stack" data-st="come"></span></div>'+
            '</div>'+
            '<div class="cr-row r-field">'+
              '<div class="ar field" data-bet="field"><span class="fn"><i>2</i> · 3 · 4 · 9 · 10 · 11 · <i>12</i></span><span class="lbl" style="font-size:11px">Field<small>2 and 12 pay double</small></span><span class="stack" data-st="field"></span></div>'+
            '</div>'+
            '<div class="cr-row r-mid">'+
              '<div class="ar big" data-bet="big6"><span class="lbl">Big 6</span><span class="stack" data-st="big6"></span></div>'+
              '<div class="ar big" data-bet="big8"><span class="lbl">Big 8</span><span class="stack" data-st="big8"></span></div>'+
              '<div class="ar" data-bet="dp"><span class="lbl">Don\'t Pass Bar<small>bar 12</small></span><span class="stack" data-st="dp"></span></div>'+
              '<div class="ar odds" data-bet="dpOdds"><span class="lbl">Lay Odds</span><span class="stack" data-st="dpOdds"></span></div>'+
            '</div>'+
            '<div class="cr-row r-pass">'+
              '<div class="ar pass" data-bet="pass"><span class="lbl">Pass Line</span><span class="stack" data-st="pass"></span></div>'+
              '<div class="ar odds" data-bet="passOdds"><span class="lbl">Pass Odds<small>3-4-5x</small></span><span class="stack" data-st="passOdds"></span></div>'+
            '</div>'+
          '</div>'+
          '<div class="cr-props"><h4>PROPOSITIONS</h4>'+
            '<div class="ar wide" data-bet="any7"><span class="lbl">Any 7 · 4:1</span><span class="stack" data-st="any7"></span></div>'+
            '<div class="ar" data-bet="hard6">'+mini(3,3)+'<span class="lbl">Hard 6 · 9:1</span><span class="stack" data-st="hard6"></span></div>'+
            '<div class="ar" data-bet="hard10">'+mini(5,5)+'<span class="lbl">Hard 10 · 7:1</span><span class="stack" data-st="hard10"></span></div>'+
            '<div class="ar" data-bet="hard8">'+mini(4,4)+'<span class="lbl">Hard 8 · 9:1</span><span class="stack" data-st="hard8"></span></div>'+
            '<div class="ar" data-bet="hard4">'+mini(2,2)+'<span class="lbl">Hard 4 · 7:1</span><span class="stack" data-st="hard4"></span></div>'+
            '<div class="ar wide" data-bet="yo">'+mini(5,6)+'<span class="lbl">Yo 11 · 15:1</span><span class="stack" data-st="yo"></span></div>'+
            '<div class="ar wide" data-bet="anyCraps"><span class="lbl">Any Craps · 7:1</span><span class="stack" data-st="anyCraps"></span></div>'+
          '</div>'+
        '</div>'+
        '<div class="cr-side">'+
          '<div class="card">'+
            '<div class="dice" data-r="dice"></div>'+
            '<div class="total" data-r="total"></div>'+
            '<button class="btn pri rollbtn" data-act="roll">ROLL</button>'+
            '<div class="lastres" data-r="lastres"></div>'+
          '</div>'+
          '<div class="card"><h5>Chip <span style="text-transform:none;letter-spacing:0">right-click removes</span></h5><div class="chips" data-r="chips"></div>'+
            '<div style="display:flex;gap:6px;margin-top:8px"><button class="btn sec small" data-act="clear" style="flex:1;justify-content:center">Take down bets</button></div></div>'+
          '<div class="card"><h5>Roll history</h5><div class="hist" data-r="hist"></div></div>'+
          '<div class="card"><h5>Stats</h5><div class="stats" data-r="stats"></div></div>'+
          '<div class="card opts">'+
            '<label><input type="checkbox" data-opt="coach"> Coach: highlight the best next bet</label>'+
            '<label><input type="checkbox" data-opt="working"> Place &amp; hardway bets working on come-out</label>'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<details class="tips"><summary>Tips &amp; strategy: how to play craps smart</summary><div class="tb">'+
        '<div><ol>'+
          '<li><b>Come-out roll (puck OFF):</b> bet the <b>Pass Line</b>. 7 or 11 wins, 2/3/12 loses, anything else becomes the <b>point</b>.</li>'+
          '<li><b>Point set (puck ON):</b> take <b>max odds</b> behind your Pass bet. Odds pay true odds, so they carry <b>0% house edge</b>, the only fair bet in the casino. Max 3x on 4/10, 4x on 5/9, 5x on 6/8.</li>'+
          '<li>Want more action? Make <b>Come</b> bets (each gets its own point) and take odds on those too.</li>'+
          '<li>Prefer to bet against the shooter? <b>Don\'t Pass / Don\'t Come with lay odds</b> has a slightly lower edge (1.36%). You risk more to win less on the odds, but it\'s still 0% edge.</li>'+
          '<li>Next best: <b>Place 6 and 8</b> (1.52%), in $6 units so the 7:6 payout is exact.</li>'+
          '<li><b>Avoid:</b> Field (5.56%), Big 6/8 (9.09%: Place 6/8 is the same bet at a better price), and all the center props (9–17%).</li>'+
          '<li>The 2-dice math: 7 is the most common roll (6 of 36 ways). 6 and 8 come 5 ways, 5/9 four, 4/10 three, 2 and 12 just one way each.</li>'+
          '<li>Size bets so you can survive swings: a flat bet of 1–2% of your bankroll plus odds.</li>'+
        '</ol></div>'+
        '<div><table class="edges" data-r="edges"></table></div>'+
      '</div></details>'+
      '<div class="tip" data-r="tip" hidden></div>';

    function q(sel){ return root.querySelector(sel); }
    function qa(sel){ return Array.prototype.slice.call(root.querySelectorAll(sel)); }
    var R = {}; qa('[data-r]').forEach(function(n){ R[n.getAttribute('data-r')]=n; });

    // edges table
    var EDGE_ROWS=[['Odds (behind Pass/Come/Don\'t)',0],['Don\'t Pass / Don\'t Come',1.36],['Pass / Come',1.41],['Place 6 / 8',1.52],['Place 5 / 9',4.0],['Field (2:1 on 2 and 12)',5.56],['Place 4 / 10',6.67],['Big 6 / Big 8',9.09],['Hard 6 / 8',9.09],['Hard 4 / 10',11.11],['Any Craps',11.11],['Yo 11',11.11],['Any 7',16.67]];
    R.edges.innerHTML = '<tr><td><b>Bet</b></td><td><b>House edge</b></td></tr>'+EDGE_ROWS.map(function(r){ var c=r[1]<=1.6?'g':r[1]<=6?'m':'b'; return '<tr class="'+c+'"><td>'+r[0]+'</td><td>'+(r[1]===0?'0%':r[1].toFixed(2)+'%')+'</td></tr>'; }).join('');

    R.chips.innerHTML = CHIPS.map(function(c){ return '<button class="chip c'+c+'" data-chip="'+c+'" title="$'+c+' chip">'+c+'</button>'; }).join('');

    function persist(){ api.save('state',{bank:S.bank,bets:S.bets,point:S.point,stats:S.stats,hist:S.hist}); }
    function persistOpts(){ api.save('opts',O); }

    function dieHTML(v,red){ var P={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]}[v]||[];
      var s='<div class="die'+(red?' red':'')+'">'; for(var i=0;i<9;i++) s+='<b class="'+(P.indexOf(i)>=0?'p':'')+'"></b>'; return s+'</div>'; }
    function showDice(a,b){ R.dice.innerHTML = dieHTML(a,false)+dieHTML(b,true); }

    // ----- coach -----
    function sideOf(){ var dont = (S.bets.dp>0) || POINTS.some(function(n){return S.bets['dc'+n]>0;}) || S.bets.dc>0;
      var doo = (S.bets.pass>0) || POINTS.some(function(n){return S.bets['come'+n]>0;}) || S.bets.come>0; return dont&&!doo?'dont':'do'; }
    function recommend(){
      var B=S.bets, side=sideOf(), canAfford=S.bank>=1;
      if(!S.point){
        if(side==='do' && !(B.pass>0)) return {id:'pass',msg:'Best first bet: the Pass Line (1.41% edge). Then take odds once a point is set.'};
        if(side==='dont' && !(B.dp>0)) return {id:'dp',msg:'Best first bet for a “dark side” player: Don\'t Pass (1.36%).'};
        return {id:null,msg:'You\'re set for the come-out. Roll (Space).'};
      }
      if(!canAfford) return {id:null,msg:'Bankroll is empty. Roll to resolve your bets, or Reset.'};
      if(B.pass>0 && (B.passOdds||0)<oddsCap(S,'passOdds')) return {id:'passOdds',msg:'Take odds behind your Pass bet: up to '+fmt(oddsCap(S,'passOdds'))+' ('+ODDS_MULT[S.point]+'x). Odds pay '+TRUE_ODDS[S.point].join(':')+' with 0% house edge.'};
      if(B.dp>0 && (B.dpOdds||0)<oddsCap(S,'dpOdds')) return {id:'dpOdds',msg:'Lay odds behind your Don\'t Pass: up to '+fmt(oddsCap(S,'dpOdds'))+'. Pays '+TRUE_ODDS[S.point].slice().reverse().join(':')+' at 0% edge.'};
      for(var i=0;i<POINTS.length;i++){ var n=POINTS[i];
        if(B['come'+n]>0 && (B['comeOdds'+n]||0)<oddsCap(S,'comeOdds'+n)) return {id:'comeOdds'+n,msg:'Your Come bet sits on '+n+'. Add odds up to '+fmt(oddsCap(S,'comeOdds'+n))+' (0% edge).'};
        if(B['dc'+n]>0 && (B['dcOdds'+n]||0)<oddsCap(S,'dcOdds'+n)) return {id:'dcOdds'+n,msg:'Your Don\'t Come sits on '+n+'. Lay odds up to '+fmt(oddsCap(S,'dcOdds'+n))+' (0% edge).'};
      }
      var cnt = POINTS.filter(function(n){ return B['come'+n]>0||B['dc'+n]>0; }).length + ((B.come>0||B.dc>0)?1:0);
      if(cnt<2){ return side==='dont' ? {id:'dc',msg:'Want more action? A Don\'t Come bet (1.36%) works like a new Don\'t Pass with its own point.'}
                                    : {id:'come',msg:'Want more action? A Come bet (1.41%) works like a new Pass Line bet with its own point.'}; }
      if(side==='do' && !(B.place6>0) && !(B.come6>0) && S.point!==6) return {id:'place6',msg:'Optional: Place 6 in $6 units, the next-best bet at 1.52%.'};
      if(side==='do' && !(B.place8>0) && !(B.come8>0) && S.point!==8) return {id:'place8',msg:'Optional: Place 8 in $6 units, the next-best bet at 1.52%.'};
      return {id:null,msg:'You\'re on the best bets on the table. Roll!'};
    }
    function stateLine(){
      var B=S.bets, p=S.point;
      if(!p){
        var s='<b>Come-out roll</b> (puck OFF). ';
        if(B.pass>0) s+='Your Pass bet wins on 7 or 11, loses on 2, 3 or 12; any other number becomes the point. ';
        else if(B.dp>0) s+='Your Don\'t Pass wins on 2 or 3, pushes on 12, loses on 7 or 11; other numbers set the point. ';
        else s+='Bet the Pass Line (or Don\'t Pass) before rolling. ';
        var offs = POINTS.filter(function(n){return B['place'+n]>0;}).length + [4,6,8,10].filter(function(n){return B['hard'+n]>0;}).length;
        if(offs && !O.working) s+='Your place/hardway bets are <b>OFF</b> this roll. ';
        if(POINTS.some(function(n){return B['comeOdds'+n]>0;})) s+='Come odds are off on the come-out. ';
        return s;
      }
      var s2='<b>Point is '+p+'</b> (puck ON). ';
      if(B.pass>0) s2+='Your Pass bet wins if a '+p+' rolls before a 7'+(B.passOdds>0?' (odds pay '+TRUE_ODDS[p].join(':')+')':'')+'. ';
      if(B.dp>0) s2+='Your Don\'t Pass wins if a 7 rolls before the '+p+'. ';
      if(!(B.pass>0)&&!(B.dp>0)) s2+='A '+p+' “makes the point”; a 7 “sevens out” and ends the hand. ';
      var cp = POINTS.filter(function(n){return B['come'+n]>0;}); if(cp.length) s2+='Come bet'+(cp.length>1?'s':'')+' on '+cp.join(', ')+'. ';
      return s2;
    }
    function warnLine(){
      var bad=[]; ['field','big6','big8','any7','anyCraps','yo','hard4','hard6','hard8','hard10'].forEach(function(id){ if(S.bets[id]>0) bad.push(INFO[id].name+' '+INFO[id].edge.toFixed(2).replace(/0$/,'')+'%'); });
      POINTS.forEach(function(n){ if((n===4||n===10||n===5||n===9) && S.bets['place'+n]>0) bad.push('Place '+n+' '+INFO['place'+n].edge.toFixed(2).replace(/0$/,'')+'%'); });
      return bad.length ? 'Heads up: high-edge bets on the table: '+bad.join(', ')+'.' : '';
    }

    // ----- render -----
    function render(){
      R.bank.textContent = fmt(S.bank);
      qa('[data-st]').forEach(function(n){
        var k=n.getAttribute('data-st'), a=S.bets[k]||0, html='';
        if(/^(come|dc)\d+$/.test(k)){ var oddsK = (k.indexOf('dc')===0?'dcOdds':'comeOdds')+k.replace(/\D/g,''); var o=S.bets[oddsK]||0;
          html = (a?chipHTML(a):'')+(o?'<span style="color:#ffc861;font-size:9px">+</span>'+chipHTML(o):''); }
        else html = a?chipHTML(a):'';
        if(n.innerHTML!==html) n.innerHTML=html;
      });
      // puck + point
      qa('.puck').forEach(function(p){ p.remove(); });
      qa('.nb').forEach(function(nb){ var n=+nb.getAttribute('data-nb'); nb.classList.toggle('isPoint',S.point===n);
        if(S.point===n){ var pk=document.createElement('div'); pk.className='puck on'; pk.textContent='ON'; nb.appendChild(pk); } });
      var offPuck = q('[data-bet="come"]');
      if(!S.point){ var pk2=document.createElement('div'); pk2.className='puck off'; pk2.style.position='absolute'; pk2.style.left='12px'; pk2.style.top='50%'; pk2.style.transform='translateY(-50%)'; pk2.textContent='OFF'; offPuck.appendChild(pk2); }
      // OFF tags on place/hard during come-out
      qa('.off-tag').forEach(function(t){ t.remove(); });
      if(!S.point && !O.working){
        POINTS.forEach(function(n){ if(S.bets['place'+n]>0){ var t=document.createElement('span'); t.className='off-tag'; t.textContent='OFF'; q('[data-bet="place'+n+'"]').appendChild(t);} });
        [4,6,8,10].forEach(function(n){ if(S.bets['hard'+n]>0){ var t=document.createElement('span'); t.className='off-tag'; t.textContent='OFF'; q('[data-bet="hard'+n+'"]').appendChild(t);} });
      }
      // disabled look for currently unbettable areas
      qa('.ar[data-bet]').forEach(function(a){ a.classList.toggle('dis', !!placeBlock(S,a.getAttribute('data-bet')) && !(S.bets[a.getAttribute('data-bet')]>0)); });
      // come/dc strips: show established bets even if no odds possible
      POINTS.forEach(function(n){ q('[data-bet="comeOdds'+n+'"]').classList.toggle('dis', !(S.bets['come'+n]>0));
        q('[data-bet="dcOdds'+n+'"]').classList.toggle('dis', !(S.bets['dc'+n]>0)); });
      // chips
      qa('[data-chip]').forEach(function(b){ b.classList.toggle('sel', +b.getAttribute('data-chip')===O.chip); });
      // history
      R.hist.innerHTML = S.hist.length ? S.hist.slice(0,24).map(function(h){ var c = h.n==='made'?'made':h.t===7&&h.n==='sevenout'?'s7':h.t===7?'s7':h.n==='point'?'pt':'';
        return '<span class="'+c+'" title="'+h.d[0]+' + '+h.d[1]+(h.d[0]===h.d[1]?' (hard)':'')+'">'+h.t+'</span>'; }).join('') : '<span style="width:auto;padding:0 8px;color:var(--dim)">no rolls yet</span>';
      var st=S.stats;
      R.stats.innerHTML = '<div>Rolls <b>'+st.rolls+'</b></div><div>Points made <b>'+st.pointsMade+'</b></div><div>Seven-outs <b>'+st.sevenOuts+'</b></div><div>Best roll <b>'+fmt(st.best)+'</b></div>'+
        '<div>Wagered <b>'+fmtShort(st.wagered)+'</b></div><div>Net <b style="color:'+(st.net>=0?'var(--ok)':'var(--bad)')+'">'+fmt(st.net)+'</b></div>';
      // options
      qa('[data-opt]').forEach(function(i){ i.checked=!!O[i.getAttribute('data-opt')]; });
      q('[data-act="sound"]').textContent = sound?'🔊':'🔇';
      q('[data-act="roll"]').disabled = rolling;
      // coach
      qa('.ar.coach').forEach(function(a){ a.classList.remove('coach'); });
      var rec = recommend(), warn = warnLine();
      if(O.coach && rec.id){ var t=q('[data-bet="'+rec.id+'"]'); if(t) t.classList.add('coach'); }
      R.coach.innerHTML = '<span class="st">'+stateLine()+'</span>'+(O.coach?'<span class="rec">Coach: '+esc(rec.msg)+'</span>':'')+(warn&&O.coach?'<span class="warn">'+esc(warn)+'</span>':'');
    }

    // ----- tooltip -----
    function showTip(area){
      var id=area.getAttribute('data-bet'), inf=INFO[id]; if(!inf) return;
      var m=/^(comeOdds|dcOdds)(\d+)$/.exec(id), extra='';
      if(m){ var flat=S.bets[(m[1]==='comeOdds'?'come':'dc')+m[2]]||0;
        if(flat) extra = (m[1]==='comeOdds'?'Come':'Don\'t Come')+' flat '+fmt(flat)+(S.bets[id]?' + odds '+fmt(S.bets[id]):'')+' · max odds '+fmt(oddsCap(S,id));
      } else if(id==='passOdds'||id==='dpOdds'){ if(S.point&&S.bets[id==='passOdds'?'pass':'dp']) extra='Max right now: '+fmt(oddsCap(S,id)); }
      var cls = inf.edge===0?'e0':inf.edge<=1.6?'e0':inf.edge<=6?'e1':'e2';
      var block = placeBlock(S,id);
      R.tip.innerHTML = '<div class="tn">'+esc(inf.name)+(S.bets[id]?' · on: '+fmt(S.bets[id]):'')+'</div><div class="te">Pays '+esc(inf.pays)+' · edge <span class="'+cls+'">'+edgeTxt(inf.edge)+'</span></div><div class="th">'+esc(inf.how)+'</div>'+
        (extra?'<div class="tm">'+esc(extra)+'</div>':'')+(block&&!m?'<div class="tm" style="color:var(--muted)">'+esc(block)+'</div>':'');
      R.tip.hidden=false;
      var rr=root.getBoundingClientRect(), ar=area.getBoundingClientRect(), tw=R.tip.offsetWidth, th=R.tip.offsetHeight;
      var x=ar.left-rr.left+ar.width/2-tw/2; x=Math.max(0,Math.min(x, rr.width-tw));
      var y=ar.top-rr.top-th-8; if(y<0) y=ar.bottom-rr.top+8;
      R.tip.style.left=x+'px'; R.tip.style.top=y+'px';
    }
    function hideTip(){ R.tip.hidden=true; }

    // ----- actions -----
    function say(msg){ if(msg && msg!==lastMsg){ api.toast(msg); } lastMsg=msg; later(function(){ lastMsg=''; },1500); }
    function bet(id, remove){
      if(rolling) return;
      var r = remove ? takeDown(S,id,O.chip) : addBet(S,id,O.chip);
      if(!r.ok){ say(r.msg); return; }
      if(r.capped && !remove) say('Odds capped at the max ('+fmt(S.bets[id])+').');
      sChip(); persist(); render();
    }
    function clearAll(){
      if(rolling) return; var n=0;
      Object.keys(S.bets).forEach(function(id){ if(/Odds/.test(id)) return; if(!removeBlock(S,id)){ var r=takeDown(S,id); if(r.ok) n++; } });
      Object.keys(S.bets).forEach(function(id){ if(/Odds/.test(id)&&!removeBlock(S,id)){ var r=takeDown(S,id); if(r.ok) n++; } });
      if(Object.keys(S.bets).length) say('Contract bets (Pass with a point, Come on a number) stay up.');
      sChip(); persist(); render();
    }
    function flash(evs){
      qa('.flash-win,.flash-lose').forEach(function(a){ a.classList.remove('flash-win','flash-lose'); });
      evs.forEach(function(e){ var id=e.id.replace(/^come(\d+)$/,'comeOdds$1').replace(/^dc(\d+)$/,'dcOdds$1'); var a=q('[data-bet="'+id+'"]'); if(!a) return;
        if(e.kind==='win') a.classList.add('flash-win'); else if(e.kind==='lose') a.classList.add('flash-lose'); });
      if(flashT) clearTimeout(flashT); flashT=later(function(){ flashT=null; qa('.flash-win,.flash-lose').forEach(function(a){ a.classList.remove('flash-win','flash-lose'); }); },1300);
    }
    function describe(res,d1,d2){
      var t=res.total, s='<b>'+d1+' + '+d2+' = '+t+'</b>'+(d1===d2&&t>2&&t<12?' (hard)':'')+': ';
      s += res.note==='natural'?'natural!':res.note==='craps'?'craps.':res.note==='point'?'point is '+t+'.':res.note==='made'?'point made!':res.note==='sevenout'?'seven out.':'no decision.';
      var w=0,l=0; res.events.forEach(function(e){ if(e.kind==='win') w+=e.amt; if(e.kind==='lose') l+=e.amt; });
      if(w) s+=' <span class="w">+'+fmt(w)+'</span>'; if(l) s+=' <span class="l">−'+fmt(l)+'</span>';
      return s;
    }
    function finishRoll(d1,d2,quiet){
      var res = resolve(S,d1,d2,O.working); lastRes=res;
      showDice(d1,d2); R.dice.classList.remove('rolling'); R.dice.classList.add('landed');
      R.total.innerHTML = 'Total <b>'+res.total+'</b>';
      R.lastres.innerHTML = describe(res,d1,d2);
      rolling=false; persist(); render(); flash(res.events);
      if(!quiet){ if(res.net>0) sWin(); else if(res.net<0) sLose(); }
      if(S.bank<1 && !Object.keys(S.bets).length) say('Out of chips! Hit Reset for a fresh '+fmt(START_BANK)+'.');
    }
    function roll(){
      if(rolling) return;
      var hasBet = Object.keys(S.bets).length>0;
      if(!hasBet && S.bank>=1){ say('Place a bet first (Pass Line is the best start).'); }
      var d1,d2; if(forced.length){ var f=forced.shift(); d1=f[0]; d2=f[1]; } else { d1=1+Math.floor(Math.random()*6); d2=1+Math.floor(Math.random()*6); }
      hideTip();
      if(instant){ finishRoll(d1,d2,true); return; }
      rolling=true; render(); sRoll();
      R.dice.classList.remove('landed'); R.dice.classList.add('rolling'); R.total.textContent='';
      var ticks=0;
      (function tick(){
        if(hiddenNow()){ finishRoll(d1,d2,true); return; }   // not visible: skip the rest of the animation
        ticks++;
        if(ticks>=11){ finishRoll(d1,d2,false); return; }
        showDice(1+Math.floor(Math.random()*6),1+Math.floor(Math.random()*6));
        later(tick, 55+ticks*6);
      })();
    }
    function reset(){
      if(rolling) return;
      S = freshState(); persist(); R.lastres.innerHTML=''; R.total.textContent=''; showDice(5,2);
      api.toast('Bankroll reset to '+fmt(START_BANK)+'.'); render();
    }

    // ----- events -----
    on(root,'click',function(e){
      var a=e.target.closest('.ar[data-bet]'); if(a){ bet(a.getAttribute('data-bet'), e.shiftKey); return; }
      var c=e.target.closest('[data-chip]'); if(c){ O.chip=+c.getAttribute('data-chip'); persistOpts(); sChip(); render(); return; }
      var b=e.target.closest('[data-act]'); if(!b) return;
      var act=b.getAttribute('data-act');
      if(act==='roll') roll(); else if(act==='clear') clearAll(); else if(act==='reset') reset();
      else if(act==='sound'){ sound=!sound; api.save('sound',sound); if(!sound&&actx){ try{actx.close();}catch(_){} actx=null; } render(); }
    });
    on(root,'contextmenu',function(e){ var a=e.target.closest('.ar[data-bet]'); if(!a) return; e.preventDefault(); bet(a.getAttribute('data-bet'), true); });
    on(root,'change',function(e){ var k=e.target.getAttribute('data-opt'); if(!k) return; O[k]=!!e.target.checked; persistOpts(); render(); });
    on(root,'mouseover',function(e){ var a=e.target.closest('.ar[data-bet]'); if(a) showTip(a); });
    on(root,'mouseout',function(e){ var a=e.target.closest('.ar[data-bet]'); if(a && !a.contains(e.relatedTarget)) hideTip(); });
    on(window,'keydown',function(e){
      if(el.offsetParent===null) return; var tg=e.target&&e.target.tagName; if(tg==='INPUT'||tg==='TEXTAREA'||tg==='SELECT') return;
      if(e.code==='Space'||e.key===' '){ e.preventDefault(); roll(); }
      else if(/^[1-5]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey){ O.chip=CHIPS[+e.key-1]; persistOpts(); render(); }
    });

    showDice(S.hist[0]?S.hist[0].d[0]:5, S.hist[0]?S.hist[0].d[1]:2);
    if(S.hist[0]) R.total.innerHTML='Last total <b>'+S.hist[0].t+'</b>';
    render();

    inst = {
      el:el,
      destroy:function(){
        timers.forEach(clearTimeout); timers=[]; if(flashT) clearTimeout(flashT);
        listeners.forEach(function(l){ l[0].removeEventListener(l[1],l[2],l[3]); }); listeners=[];
        if(actx){ try{ actx.close(); }catch(_){} actx=null; }
        el.innerHTML='';
      },
      state:function(){ return S; },
      roll:roll, bet:bet,
      setOpt:function(k,v){ O[k]=v; persistOpts(); render(); }
    };
  }

  function unmount(){ if(inst){ inst.destroy(); inst=null; } }

  window.VanArcade[ID] = {
    mount: mount,
    unmount: unmount,
    // ---- testing hooks (not used by the app) ----
    _force: function(d1,d2){ forced.push([d1,d2]); },     // queue the next roll's dice
    _instant: function(v){ instant=!!v; },               // skip dice animation
    _state: function(){ return inst ? JSON.parse(JSON.stringify(inst.state())) : null; },
    _bet: function(id,remove){ if(inst) inst.bet(id,remove); },
    _roll: function(){ if(inst) inst.roll(); },
    _opt: function(k,v){ if(inst) inst.setOpt(k,v); },
    _engine: {resolve:resolve, addBet:addBet, takeDown:takeDown, freshState:freshState, oddsCap:oddsCap, INFO:INFO}
  };
})();
