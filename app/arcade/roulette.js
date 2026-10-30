/* VanMule Arcade — Roulette ("Mule Wheel")
   Standalone, no dependencies. requestAnimationFrame runs only while the wheel spins. */
(function(){
  'use strict';
  window.VanArcade = window.VanArcade || {};

  var ID = 'roulette';
  var START_BANK = 1000;
  var CHIPS = [1,5,25,100,500];
  var ORDER = {
    eu: ['0','32','15','19','4','21','2','25','17','34','6','27','13','36','11','30','8','23','10','5','24','16','33','1','20','14','31','9','22','18','29','7','28','12','35','3','26'],
    us: ['0','28','9','26','30','11','7','20','32','17','5','22','34','15','3','24','36','13','1','00','27','10','25','29','12','8','19','31','18','6','21','33','16','4','23','35','14','2']
  };
  var REDS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  function colorOf(l){ if(l==='0'||l==='00') return 'g'; return REDS.indexOf(+l)>=0 ? 'r' : 'b'; }
  function ord(l){ return l==='0'?-2 : l==='00'?-1 : +l; }
  function keyOf(nums){ return 'n:'+nums.slice().sort(function(a,b){return ord(a)-ord(b);}).join(','); }
  var PAY_BY_COUNT = {1:35,2:17,3:11,4:8,5:6,6:5};

  // ---------- bet catalogue for a wheel type ----------
  function buildDefs(wheel){
    var D = {};
    function inside(nums,name,kind){ var k=keyOf(nums); D[k]={key:k,nums:nums.map(String),pay:PAY_BY_COUNT[nums.length],name:name,kind:kind,even:false}; return k; }
    function range(a,b){ var r=[]; for(var i=a;i<=b;i++) r.push(String(i)); return r; }
    var all = range(1,36);
    all.forEach(function(n){ inside([n],'Straight '+n,'straight'); });
    inside(['0'],'Straight 0','straight'); if(wheel==='us') inside(['00'],'Straight 00','straight');
    for(var n=1;n<=36;n++){
      if(n<=33) inside([String(n),String(n+3)],'Split '+n+'/'+(n+3),'split');
      if(n%3!==0) inside([String(n),String(n+1)],'Split '+n+'/'+(n+1),'split');
      if(n%3!==0 && n<=32) inside([String(n),String(n+1),String(n+3),String(n+4)],'Corner '+n+'-'+(n+1)+'-'+(n+3)+'-'+(n+4),'corner');
    }
    for(var s=0;s<12;s++){ var a=3*s+1; inside([String(a),String(a+1),String(a+2)],'Street '+a+'-'+(a+2),'street');
      if(s<11) inside(range(a,a+5),'Six line '+a+'-'+(a+5),'line'); }
    if(wheel==='eu'){
      inside(['0','1'],'Split 0/1','split'); inside(['0','2'],'Split 0/2','split'); inside(['0','3'],'Split 0/3','split');
      inside(['0','1','2'],'Trio 0-1-2','street'); inside(['0','2','3'],'Trio 0-2-3','street');
      inside(['0','1','2','3'],'First four 0-1-2-3','corner');
    } else {
      inside(['0','00'],'Split 0/00','split'); inside(['0','1'],'Split 0/1','split'); inside(['0','2'],'Split 0/2','split');
      inside(['00','2'],'Split 00/2','split'); inside(['00','3'],'Split 00/3','split');
      inside(['0','1','2'],'Trio 0-1-2','street'); inside(['00','2','3'],'Trio 00-2-3','street');
      inside(['0','00','1','2','3'],'Five-number (basket) 0-00-1-2-3','basket');
    }
    function outside(k,name,nums,pay){ D[k]={key:k,nums:nums,pay:pay,name:name,kind:'outside',even:pay===1}; }
    outside('red','Red',all.filter(function(x){return colorOf(x)==='r';}),1);
    outside('black','Black',all.filter(function(x){return colorOf(x)==='b';}),1);
    outside('odd','Odd',all.filter(function(x){return x%2===1;}),1);
    outside('even','Even',all.filter(function(x){return x%2===0;}),1);
    outside('low','1 to 18',range(1,18),1);
    outside('high','19 to 36',range(19,36),1);
    outside('doz1','1st dozen (1-12)',range(1,12),2); outside('doz2','2nd dozen (13-24)',range(13,24),2); outside('doz3','3rd dozen (25-36)',range(25,36),2);
    outside('col1','Column 1 (1, 4 … 34)',all.filter(function(x){return x%3===1;}),2);
    outside('col2','Column 2 (2, 5 … 35)',all.filter(function(x){return x%3===2;}),2);
    outside('col3','Column 3 (3, 6 … 36)',all.filter(function(x){return x%3===0;}),2);
    return D;
  }
  var DEFS = {eu:buildDefs('eu'), us:buildDefs('us')};

  function edgeOf(def, wheel, partage){
    var N = wheel==='us'?38:37;
    var ev = (def.nums.length*(def.pay+1))/N - 1;       // expected return per unit staked
    if(def.even && partage && wheel==='eu') ev += 0.5/N;  // half back on zero
    return -ev*100;
  }
  function edgeStr(e){ return (Math.round(e*100)/100).toFixed(2)+'%'; }

  // Resolve a spin: bets {key:amount} -> {returned, net, wins:[...]}; doesn't touch bank.
  function settle(bets, result, wheel, partage){
    var D=DEFS[wheel], back=0, staked=0, wins=[];
    Object.keys(bets).forEach(function(k){ var a=bets[k], d=D[k]; if(!d||!(a>0)) return; staked+=a;
      if(d.nums.indexOf(result)>=0){ back += a*(d.pay+1); wins.push({key:k,amt:a*d.pay}); }
      else if(d.even && partage && wheel==='eu' && result==='0'){ back += a/2; wins.push({key:k,amt:-a/2,partage:true}); }
    });
    back=Math.round(back*100)/100;
    return {returned:back, staked:staked, net:Math.round((back-staked)*100)/100, wins:wins};
  }

  function fmt(x){ x=Math.round(x*100)/100; var neg=x<0; x=Math.abs(x);
    var s=(x%1===0)?x.toLocaleString('en-US'):x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); return (neg?'-$':'$')+s; }
  function fmtShort(x){ if(x>=10000) return (Math.round(x/100)/10)+'k'; if(x>=1000) return (Math.round(x/100)/10)+'k'; return String(Math.round(x*100)/100); }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  // ---------- CSS ----------
  var CSS = '\
.ag-roulette{color:var(--fg);font-family:var(--body);user-select:none;-webkit-user-select:none;--felt:#12392b;--fline:rgba(255,240,215,.55);--rred:#c4302b;--rblack:#191514;--rgreen:#138a52}\
.ag-roulette *{box-sizing:border-box}\
.ag-roulette .rt-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:10px}\
.ag-roulette .rt-title{font-family:var(--display);font-size:22px;font-weight:800;margin:0;line-height:1}\
.ag-roulette .rt-title b{color:var(--ember)}\
.ag-roulette .rt-how{color:var(--muted);font-size:13px;flex:1;min-width:220px}\
.ag-roulette .rt-bank{font-family:var(--mono);font-weight:700;font-size:20px;color:var(--gold);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:6px 12px;white-space:nowrap}\
.ag-roulette .rt-bank small{font-family:var(--body);font-size:11px;color:var(--muted);font-weight:600;margin-right:6px;text-transform:uppercase;letter-spacing:.08em}\
.ag-roulette .rt-upper{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:stretch}\
.ag-roulette .rt-wheelbox{position:relative;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 45%,#2a1d14 0%,#140f0c 70%);border:1px solid var(--line);border-radius:16px;padding:8px}\
.ag-roulette canvas{display:block}\
.ag-roulette .rt-res{position:absolute;left:10px;top:10px;font-family:var(--display);font-weight:800;font-size:20px;min-width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;padding:0 8px;box-shadow:0 3px 10px rgba(0,0,0,.6);transition:transform .25s}\
.ag-roulette .rt-res.pop{transform:scale(1.18)}\
.ag-roulette .c-r{background:var(--rred);color:#fff}.ag-roulette .c-b{background:var(--rblack);color:#fff;border:1px solid #444}.ag-roulette .c-g{background:var(--rgreen);color:#fff}\
.ag-roulette .rt-panel{display:flex;flex-direction:column;gap:8px;min-width:0}\
.ag-roulette .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:9px 11px}\
.ag-roulette .card h5{margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:700;display:flex;justify-content:space-between;gap:8px}\
.ag-roulette .card h5 span{text-transform:none;letter-spacing:0;font-weight:500;color:var(--dim)}\
.ag-roulette .hist{display:flex;gap:4px;flex-wrap:wrap;min-height:26px}\
.ag-roulette .hist span,.ag-roulette .hc span{font-family:var(--mono);font-weight:700;font-size:12px;min-width:26px;height:26px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;padding:0 3px}\
.ag-roulette .hist span:first-child{outline:2px solid var(--gold);outline-offset:1px}\
.ag-roulette .hc{display:grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:center;font-size:12px;color:var(--muted)}\
.ag-roulette .hc div{display:flex;gap:4px;flex-wrap:wrap}\
.ag-roulette .hc span{position:relative}\
.ag-roulette .hc span i{position:absolute;top:-6px;right:-5px;font-style:normal;font-size:9px;background:var(--panel2);color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:0 3px;line-height:12px}\
.ag-roulette .ctrl{display:flex;flex-wrap:wrap;gap:8px;align-items:center}\
.ag-roulette .chips{display:flex;gap:6px}\
.ag-roulette .chip{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-family:var(--mono);font-weight:700;color:#fff;border:2px dashed rgba(255,255,255,.75);box-shadow:0 2px 4px rgba(0,0,0,.55)}\
.ag-roulette .chip.c1{background:#e9e4da;color:#222;border-color:#7a7166}.ag-roulette .chip.c5{background:#c8322d}.ag-roulette .chip.c25{background:#1f8a4c}.ag-roulette .chip.c100{background:#1c1c1c}.ag-roulette .chip.c500{background:#6a2fb1}\
.ag-roulette .chips button.chip{width:36px;height:36px;font-size:11px;padding:0;transition:transform .12s;cursor:pointer}\
.ag-roulette .chips button.chip.sel{transform:translateY(-3px) scale(1.08);box-shadow:0 0 0 3px var(--ember),0 4px 10px rgba(0,0,0,.6)}\
.ag-roulette .spin{font-family:var(--display);letter-spacing:.06em;min-width:110px;justify-content:center}\
.ag-roulette .seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}\
.ag-roulette .seg button{padding:5px 10px;font-size:12.5px;font-weight:700;background:var(--panel2);color:var(--muted)}\
.ag-roulette .seg button.on{background:var(--ember);color:var(--ember-ink)}\
.ag-roulette .opts{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:var(--muted);align-items:center}\
.ag-roulette .opts label{display:inline-flex;gap:6px;align-items:center;cursor:pointer}\
.ag-roulette .opts label.off{opacity:.45;cursor:default}\
.ag-roulette .opts input{accent-color:var(--ember)}\
.ag-roulette .stats{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted)}\
.ag-roulette .stats b{font-family:var(--mono);color:var(--fg);margin-left:4px}\
.ag-roulette .info{margin:10px 0 8px;background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--ember);border-radius:10px;padding:8px 12px;font-size:13.5px;min-height:58px;display:flex;gap:10px}\
.ag-roulette .info .mule{font-size:20px;line-height:1}\
.ag-roulette .info .hv{color:var(--fg)}\
.ag-roulette .info .hv b{color:var(--gold);font-family:var(--mono);font-weight:700}\
.ag-roulette .info .co{display:block;color:var(--gold);margin-top:2px}\
.ag-roulette .info .wn{display:block;color:#ffb3ae;margin-top:2px}\
.ag-roulette .tbl{background:radial-gradient(ellipse at 50% 0%,#1a5641 0%,var(--felt) 55%,#0c2b20 100%);border:6px solid #3a2416;border-radius:16px;box-shadow:inset 0 0 0 2px #5a3a22,inset 0 0 40px rgba(0,0,0,.45);padding:12px 14px 12px 12px}\
.ag-roulette .tgrid{display:grid;grid-template-columns:52px minmax(0,1fr) 54px;grid-template-rows:auto 40px 40px;gap:0}\
.ag-roulette .zeros{grid-row:1;grid-column:1;display:flex;flex-direction:column;position:relative}\
.ag-roulette .nums{grid-row:1;grid-column:2;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:repeat(3,50px);position:relative}\
.ag-roulette .cols{grid-row:1;grid-column:3;display:grid;grid-template-rows:repeat(3,50px)}\
.ag-roulette .cell{border:1px solid var(--fline);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;font-family:var(--display);font-weight:700;font-size:15px;color:#fff;transition:filter .12s,box-shadow .12s}\
.ag-roulette .cell .lab{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center}\
.ag-roulette .cell.r .lab{background:var(--rred)}.ag-roulette .cell.b .lab{background:var(--rblack)}\
.ag-roulette .zeros .cell{flex:1;background:var(--rgreen);border-radius:0;font-size:17px}\
.ag-roulette .zeros .cell:first-child{border-top-left-radius:24px}.ag-roulette .zeros .cell:last-child{border-bottom-left-radius:24px}\
.ag-roulette .cell:hover,.ag-roulette .cell.hl{filter:brightness(1.3);background-color:rgba(255,200,97,.2);box-shadow:inset 0 0 0 3px var(--gold)}\
.ag-roulette .cell.win{box-shadow:inset 0 0 0 3px var(--gold),0 0 16px rgba(255,200,97,.8);z-index:1;animation:agrt-win 1s ease-in-out 3}\
@keyframes agrt-win{50%{filter:brightness(1.6)}}\
.ag-roulette .outs{font-family:var(--body);font-weight:800;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase}\
.ag-roulette .dozens{grid-row:2;grid-column:2;display:grid;grid-template-columns:repeat(3,1fr)}\
.ag-roulette .evens{grid-row:3;grid-column:2;display:grid;grid-template-columns:repeat(6,1fr)}\
.ag-roulette .diamond{width:22px;height:22px;transform:rotate(45deg);border-radius:3px;border:1px solid rgba(255,255,255,.6)}\
.ag-roulette .hot{position:absolute;width:16px;height:16px;transform:translate(-50%,-50%);border-radius:50%;z-index:3;cursor:pointer}\
.ag-roulette .hot:hover,.ag-roulette .hot.hlx{background:rgba(255,200,97,.55);box-shadow:0 0 0 2px var(--gold)}\
.ag-roulette .hot.sm{width:12px;height:12px}\
.ag-roulette .stk{position:absolute;z-index:4;pointer-events:none;left:50%;top:50%;transform:translate(-50%,-50%)}\
.ag-roulette .stk .chip{width:24px;height:24px;font-size:9px;border-width:2px}\
.ag-roulette .hot .stk .chip{width:22px;height:22px}\
.ag-roulette .cell .stk{left:auto;right:1px;top:auto;bottom:1px;transform:none}\
.ag-roulette .outs .stk,.ag-roulette .cols .stk{left:auto;right:4px;transform:translateY(-50%)}\
.ag-roulette .bot{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}\
.ag-roulette .bot .grow{flex:1}\
.ag-roulette .tb-sum{font-size:13px;color:var(--muted)}\
.ag-roulette .tb-sum b{font-family:var(--mono);color:var(--fg)}\
.ag-roulette details.tips{margin-top:10px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:0 12px}\
.ag-roulette details.tips summary{cursor:pointer;padding:10px 0;font-weight:700;font-size:14px}\
.ag-roulette details.tips .tb{font-size:13px;color:var(--muted);padding-bottom:12px;display:grid;grid-template-columns:1.25fr 1fr;gap:16px}\
.ag-roulette details.tips ul{margin:4px 0;padding-left:18px}.ag-roulette details.tips li{margin:4px 0}\
.ag-roulette details.tips b{color:var(--fg)}\
.ag-roulette table.pt{width:100%;border-collapse:collapse;font-size:12px}\
.ag-roulette table.pt td{padding:2px 4px;border-bottom:1px solid var(--line)}\
.ag-roulette table.pt td:nth-child(n+2){text-align:right;font-family:var(--mono)}\
.ag-roulette table.pt tr.bad td{color:var(--bad)}\
.ag-roulette .mg{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-family:var(--mono);font-size:11.5px;line-height:1.5;margin-top:4px}\
@media (max-width:860px){.ag-roulette .rt-upper{grid-template-columns:1fr}.ag-roulette .rt-wheelbox{justify-self:center;width:100%}.ag-roulette details.tips .tb{grid-template-columns:1fr}.ag-roulette .cell{font-size:13px}.ag-roulette .cell .lab{width:26px;height:26px}.ag-roulette .outs{font-size:10.5px;letter-spacing:.02em}}\
';

  var inst=null, forced=[], instant=false;

  function mount(el, api){
    if(inst) unmount();
    if(!document.getElementById('ag-'+ID+'-css')){ var st=document.createElement('style'); st.id='ag-'+ID+'-css'; st.textContent=CSS; document.head.appendChild(st); }

    var sv = api.load('state')||{};
    var S = {
      bank: typeof sv.bank==='number'?sv.bank:START_BANK,
      wheel: sv.wheel==='us'?'us':'eu',
      partage: !!sv.partage,
      coach: sv.coach!==false,
      chip: CHIPS.indexOf(sv.chip)>=0?sv.chip:5,
      bets: {}, stack: [], last: sv.last||null,
      results: Array.isArray(sv.results)?sv.results.slice(0,200):[],
      stats: Object.assign({spins:0,wagered:0,net:0,best:0}, sv.stats||{})
    };
    // bets left on the table at last close are refunded on mount
    if(sv.bets){ Object.keys(sv.bets).forEach(function(k){ S.bank+=sv.bets[k]; }); S.bank=Math.round(S.bank*100)/100; }
    var sndSaved = api.load('sound'); var sound = (sndSaved===null||sndSaved===undefined)?!!api.sound:!!sndSaved;
    var listeners=[], timers=[], raf=0, actx=null, spinning=null, wheelRot=0, ballPos=null, lastToast='', winTimer=null;
    function on(t,ev,fn,o){ t.addEventListener(ev,fn,o); listeners.push([t,ev,fn,o]); }
    function later(fn,ms){ var id=setTimeout(function(){ timers=timers.filter(function(x){return x!==id;}); fn(); },ms); timers.push(id); return id; }
    function hiddenNow(){ return document.hidden || el.offsetParent===null; }
    function persist(){ api.save('state',{bank:S.bank,wheel:S.wheel,partage:S.partage,coach:S.coach,chip:S.chip,last:S.last,results:S.results.slice(0,200),stats:S.stats,bets:S.bets}); }

    // ----- audio -----
    function ac(){ if(!sound) return null; if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } } return actx; }
    function blip(f,d,type,vol,when){ var a=ac(); if(!a) return; var t=a.currentTime+(when||0), o=a.createOscillator(), g=a.createGain();
      o.type=type||'sine'; o.frequency.setValueAtTime(f,t); g.gain.setValueAtTime(vol||0.05,t); g.gain.exponentialRampToValueAtTime(0.0001,t+d);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t+d+0.02); }
    function sChip(){ blip(1400,0.05,'triangle',0.05); blip(2100,0.04,'triangle',0.03,0.03); }
    function sTick(){ blip(2600+Math.random()*600,0.015,'square',0.012); }
    function sWin(){ blip(660,0.12,'triangle',0.06); blip(880,0.12,'triangle',0.06,0.1); blip(1320,0.2,'triangle',0.05,0.2); }
    function sLose(){ blip(240,0.22,'sawtooth',0.03); }

    // ----- DOM -----
    var root=document.createElement('div'); root.className='ag-roulette'; el.appendChild(root);
    root.innerHTML =
      '<div class="rt-top"><h2 class="rt-title">Mule <b>Wheel</b> Roulette</h2>'+
        '<div class="rt-how">Pick a chip and click the layout: numbers, lines between them, corners, or the outside boxes. Right-click removes. <b>Spin</b> with Space.</div>'+
        '<div class="rt-bank"><small>Bankroll</small><span data-r="bank"></span></div>'+
        '<button class="btn sec small" data-act="sound" title="Sound" style="min-width:40px;justify-content:center"></button>'+
        '<button class="btn sec small" data-act="reset" title="Reset bankroll to $1,000">Reset</button></div>'+
      '<div class="rt-upper">'+
        '<div class="rt-wheelbox"><canvas data-r="cv"></canvas><div class="rt-res" data-r="res" hidden></div></div>'+
        '<div class="rt-panel">'+
          '<div class="card"><h5>Wheel <span data-r="edge"></span></h5><div class="opts">'+
            '<span class="seg"><button data-wheel="eu">European · 0</button><button data-wheel="us">American · 0 00</button></span>'+
            '<label data-r="partlbl"><input type="checkbox" data-opt="partage"> La Partage (half back on 0)</label>'+
            '<label><input type="checkbox" data-opt="coach"> Coach</label></div></div>'+
          '<div class="card"><h5>Last results <span data-r="nres"></span></h5><div class="hist" data-r="hist"></div></div>'+
          '<div class="card"><h5>Hot &amp; cold <span>last 100 spins · for fun, the wheel has no memory</span></h5><div class="hc" data-r="hc"></div><div class="stats" data-r="stats" style="margin-top:8px;padding-top:7px;border-top:1px solid var(--line)"></div></div>'+
        '</div>'+
      '</div>'+
      '<div class="info"><span class="mule">🫏</span><div data-r="info"></div></div>'+
      '<div class="tbl"><div class="tgrid" data-r="tgrid"></div></div>'+
      '<div class="bot">'+
        '<div class="chips" data-r="chips"></div>'+
        '<button class="btn sec small" data-act="undo" title="Undo (Z)">Undo</button>'+
        '<button class="btn sec small" data-act="clear">Clear</button>'+
        '<button class="btn sec small" data-act="rebet" title="Rebet (R)">Rebet</button>'+
        '<span class="tb-sum grow" data-r="sum"></span>'+
        '<button class="btn pri spin" data-act="spin">SPIN</button>'+
      '</div>'+
      '<details class="tips"><summary>Tips &amp; strategy: playing roulette smart</summary><div class="tb" data-r="tips"></div></details>';
    function q(s){ return root.querySelector(s); } function qa(s){ return Array.prototype.slice.call(root.querySelectorAll(s)); }
    var R={}; qa('[data-r]').forEach(function(n){ R[n.getAttribute('data-r')]=n; });
    R.chips.innerHTML = CHIPS.map(function(c){ return '<button class="chip c'+c+'" data-chip="'+c+'" title="$'+c+' chip (key '+(CHIPS.indexOf(c)+1)+')">'+c+'</button>'; }).join('');

    // ----- betting layout -----
    function numAt(r,c){ return String(3*c+(3-r)); }   // r=0 top row (3,6,...), c=0..11
    function buildTable(){
      var w=S.wheel, h='';
      // zero column
      h+='<div class="zeros">'+(w==='us'?'<div class="cell g" data-bet="'+keyOf(['00'])+'" data-num="00">00</div>':'')+'<div class="cell g" data-bet="'+keyOf(['0'])+'" data-num="0">0</div>';
      if(w==='us') h+=hot(['0','00'],'50%','50%','left:calc(50% - 0px)');
      h+='</div>';
      // numbers
      h+='<div class="nums">';
      for(var r=0;r<3;r++) for(var c=0;c<12;c++){ var n=numAt(r,c); h+='<div class="cell '+colorOf(n)+'" data-bet="'+keyOf([n])+'" data-num="'+n+'" style="grid-row:'+(r+1)+';grid-column:'+(c+1)+'"><span class="lab">'+n+'</span></div>'; }
      for(r=0;r<3;r++) for(c=0;c<12;c++){
        var a=numAt(r,c);
        if(c<11) h+=hot([a,numAt(r,c+1)], pct((c+1)/12), pct((r+.5)/3));            // split →
        if(r<2) h+=hot([a,numAt(r+1,c)], pct((c+.5)/12), pct((r+1)/3));             // split ↓
        if(r<2&&c<11) h+=hot([a,numAt(r,c+1),numAt(r+1,c),numAt(r+1,c+1)], pct((c+1)/12), pct((r+1)/3)); // corner
      }
      for(c=0;c<12;c++){ h+=hot([numAt(0,c),numAt(1,c),numAt(2,c)], pct((c+.5)/12), '100%');   // street (outer edge)
        if(c<11) h+=hot([numAt(0,c),numAt(1,c),numAt(2,c),numAt(0,c+1),numAt(1,c+1),numAt(2,c+1)], pct((c+1)/12), '100%'); } // six line
      if(w==='eu'){
        h+=hot(['0','3'],'0%',pct(1/6)); h+=hot(['0','2'],'0%','50%'); h+=hot(['0','1'],'0%',pct(5/6));
        h+=hot(['0','2','3'],'0%',pct(1/3)); h+=hot(['0','1','2'],'0%',pct(2/3)); h+=hot(['0','1','2','3'],'0%','100%');
      } else {
        h+=hot(['00','3'],'0%',pct(1/6)); h+=hot(['00','2','3'],'0%',pct(1/3)); h+=hot(['00','2'],'0%','42%','sm');
        h+=hot(['0','2'],'0%','58%','sm'); h+=hot(['0','1','2'],'0%',pct(2/3)); h+=hot(['0','1'],'0%',pct(5/6));
        h+=hot(['0','00','1','2','3'],'0%','100%');
      }
      h+='</div>';
      h+='<div class="cols">'+['col3','col2','col1'].map(function(k){ return '<div class="cell outs" data-bet="'+k+'">2 to 1</div>'; }).join('')+'</div>';
      h+='<div class="dozens">'+[['doz1','1st 12'],['doz2','2nd 12'],['doz3','3rd 12']].map(function(x){ return '<div class="cell outs" data-bet="'+x[0]+'">'+x[1]+'</div>'; }).join('')+'</div>';
      h+='<div class="evens">'+[['low','1–18'],['even','Even'],['red','<span class="diamond" style="background:var(--rred)"></span>'],['black','<span class="diamond" style="background:var(--rblack)"></span>'],['odd','Odd'],['high','19–36']]
        .map(function(x){ return '<div class="cell outs" data-bet="'+x[0]+'" title="'+x[0]+'">'+x[1]+'</div>'; }).join('')+'</div>';
      R.tgrid.innerHTML=h;
      function pct(v){ return (v*100).toFixed(3)+'%'; }
      function hot(nums,x,y,extra){ var k=keyOf(nums); var cls='hot'+(extra==='sm'?' sm':''); var st=(extra&&extra!=='sm')?extra:'left:'+x;
        return '<div class="'+cls+'" data-bet="'+k+'" style="'+st+';top:'+y+'"></div>'; }
    }

    // ----- wheel canvas -----
    var cv=R.cv, ctx=cv.getContext('2d'), size=280, dpr=1, wheelImg=null, bgImg=null;
    function makeCanvas(w,h){ var c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
    function layoutCanvas(){
      var avail = root.clientWidth || 900;
      var narrow = avail < 860;
      var top = el.getBoundingClientRect().top;
      var hAvail = window.innerHeight - Math.max(0,top) - 40 - 440;   // keep table visible
      size = Math.round(Math.max(220, Math.min(320, narrow ? Math.min(avail-40, 320) : Math.min(avail*0.36, hAvail))));
      dpr = Math.min(3, window.devicePixelRatio||1);
      cv.width=Math.round(size*dpr); cv.height=Math.round(size*dpr); cv.style.width=size+'px'; cv.style.height=size+'px';
      prerender(); draw();
    }
    function prerender(){
      var W=Math.round(size*dpr), Rr=W/2, order=ORDER[S.wheel], N=order.length, step=Math.PI*2/N;
      // static bowl
      bgImg=makeCanvas(W,W); var g=bgImg.getContext('2d');
      var gr=g.createRadialGradient(Rr,Rr,Rr*0.7,Rr,Rr,Rr); gr.addColorStop(0,'#5a3519'); gr.addColorStop(0.6,'#3b2010'); gr.addColorStop(1,'#1c0e06');
      g.fillStyle=gr; g.beginPath(); g.arc(Rr,Rr,Rr*0.995,0,Math.PI*2); g.fill();
      g.strokeStyle='rgba(255,200,140,.25)'; g.lineWidth=Rr*0.01; g.beginPath(); g.arc(Rr,Rr,Rr*0.95,0,Math.PI*2); g.stroke();
      var tr=g.createRadialGradient(Rr,Rr,Rr*0.76,Rr,Rr,Rr*0.9); tr.addColorStop(0,'#2a1a10'); tr.addColorStop(1,'#120a05');
      g.fillStyle=tr; g.beginPath(); g.arc(Rr,Rr,Rr*0.9,0,Math.PI*2); g.fill();
      // diamonds (deflectors)
      g.fillStyle='#d9c08a'; for(var i=0;i<8;i++){ var a=i*Math.PI/4+Math.PI/8; g.save(); g.translate(Rr+Math.cos(a)*Rr*0.835,Rr+Math.sin(a)*Rr*0.835); g.rotate(a); g.beginPath(); g.moveTo(-Rr*0.025,0); g.lineTo(0,-Rr*0.012); g.lineTo(Rr*0.025,0); g.lineTo(0,Rr*0.012); g.closePath(); g.fill(); g.restore(); }
      // rotating wheel head
      wheelImg=makeCanvas(W,W); var w=wheelImg.getContext('2d');
      w.translate(Rr,Rr);
      for(i=0;i<N;i++){
        var a0=-Math.PI/2+i*step-step/2, a1=a0+step, lab=order[i], col=colorOf(lab);
        w.fillStyle = col==='g'?'#138a52':col==='r'?'#c4302b':'#171313';
        w.beginPath(); w.arc(0,0,Rr*0.78,a0,a1); w.arc(0,0,Rr*0.5,a1,a0,true); w.closePath(); w.fill();
        // pocket floor darker
        w.fillStyle='rgba(0,0,0,.28)'; w.beginPath(); w.arc(0,0,Rr*0.62,a0,a1); w.arc(0,0,Rr*0.5,a1,a0,true); w.closePath(); w.fill();
        // frets
        w.strokeStyle='#e6c47a'; w.lineWidth=Math.max(1,Rr*0.008); w.beginPath(); w.moveTo(Math.cos(a0)*Rr*0.5,Math.sin(a0)*Rr*0.5); w.lineTo(Math.cos(a0)*Rr*0.78,Math.sin(a0)*Rr*0.78); w.stroke();
        // number
        w.save(); w.rotate(-Math.PI/2+i*step+Math.PI/2); w.fillStyle='#fff'; w.font='700 '+Math.round(Rr*0.075)+'px '+getComputedStyle(root).getPropertyValue('--body').split(',')[0].replace(/"/g,'')+',sans-serif';
        w.textAlign='center'; w.textBaseline='middle'; w.fillText(lab,0,-Rr*0.70); w.restore();
      }
      w.strokeStyle='#e6c47a'; w.lineWidth=Math.max(1,Rr*0.012);
      [0.78,0.62,0.5].forEach(function(f){ w.beginPath(); w.arc(0,0,Rr*f,0,Math.PI*2); w.stroke(); });
      // cone + turret
      var cg=w.createRadialGradient(-Rr*0.1,-Rr*0.12,Rr*0.02,0,0,Rr*0.5); cg.addColorStop(0,'#8a5a32'); cg.addColorStop(0.7,'#4a2c16'); cg.addColorStop(1,'#2b170a');
      w.fillStyle=cg; w.beginPath(); w.arc(0,0,Rr*0.49,0,Math.PI*2); w.fill();
      w.strokeStyle='#d9b56a'; w.lineWidth=Rr*0.035; w.lineCap='round';
      for(i=0;i<4;i++){ var aa=i*Math.PI/2; w.beginPath(); w.moveTo(Math.cos(aa)*Rr*0.06,Math.sin(aa)*Rr*0.06); w.lineTo(Math.cos(aa)*Rr*0.3,Math.sin(aa)*Rr*0.3); w.stroke();
        w.fillStyle='#f0d48e'; w.beginPath(); w.arc(Math.cos(aa)*Rr*0.31,Math.sin(aa)*Rr*0.31,Rr*0.03,0,Math.PI*2); w.fill(); }
      var tg=w.createRadialGradient(-Rr*0.02,-Rr*0.03,0,0,0,Rr*0.09); tg.addColorStop(0,'#ffe9b0'); tg.addColorStop(1,'#a87a2c');
      w.fillStyle=tg; w.beginPath(); w.arc(0,0,Rr*0.085,0,Math.PI*2); w.fill();
      // ember "VM" mark
      w.fillStyle='#ff8a3d'; w.font='800 '+Math.round(Rr*0.06)+'px sans-serif'; w.textAlign='center'; w.textBaseline='middle'; w.fillText('VM',0,Rr*0.2);
    }
    function pocketAngle(i){ return i*Math.PI*2/ORDER[S.wheel].length; }  // relative to wheel rotation, 0 = top
    function draw(){
      var W=cv.width, Rr=W/2;
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,W,W);
      if(bgImg) ctx.drawImage(bgImg,0,0);
      ctx.save(); ctx.translate(Rr,Rr); ctx.rotate(wheelRot); ctx.drawImage(wheelImg,-Rr,-Rr); ctx.restore();
      if(ballPos){ var a=ballPos.a-Math.PI/2, r=ballPos.r*Rr, x=Rr+Math.cos(a)*r, y=Rr+Math.sin(a)*r, br=Rr*0.032;
        ctx.fillStyle='rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(x+br*0.35,y+br*0.45,br,0,Math.PI*2); ctx.fill();
        var bg=ctx.createRadialGradient(x-br*0.4,y-br*0.4,br*0.1,x,y,br); bg.addColorStop(0,'#ffffff'); bg.addColorStop(1,'#b9b4ad');
        ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(x,y,br,0,Math.PI*2); ctx.fill(); }
      // pointer marker at top
      ctx.fillStyle='#ff8a3d'; ctx.beginPath(); ctx.moveTo(Rr-Rr*0.04,Rr*0.015); ctx.lineTo(Rr+Rr*0.04,Rr*0.015); ctx.lineTo(Rr,Rr*0.085); ctx.closePath(); ctx.fill();
    }

    // ----- info / coach -----
    var hoverKey=null;
    function wheelEdge(){ return S.wheel==='us'?5.26:(S.partage?'1.35 (even-money) / 2.70':2.70); }
    function infoFor(k){
      var d=DEFS[S.wheel][k]; if(!d) return '';
      var e=edgeOf(d,S.wheel,S.partage), cov=d.nums.length;
      var p = d.pay+':1', cur = S.bets[k]?' · on it: <b>'+fmt(S.bets[k])+'</b>':'';
      var chance = (cov/(S.wheel==='us'?38:37)*100).toFixed(1);
      return '<span class="hv"><b style="font-family:var(--body);color:var(--fg)">'+esc(d.name)+'</b> · pays <b>'+p+'</b> · covers '+cov+' number'+(cov>1?'s':'')+' ('+chance+'% to hit) · house edge <b style="color:'+(e>6?'var(--bad)':e>3?'#ffb3ae':'var(--ok)')+'">'+edgeStr(e)+'</b>'+cur+
        (d.kind==='basket'?' <span style="color:var(--bad)">· worst bet on the table</span>':'')+(d.even&&S.partage&&S.wheel==='eu'?' · La Partage: half back on 0':'')+'</span>';
    }
    function coachHTML(){
      var out='';
      var tot=total(), share = S.bank+tot>0 ? tot/(S.bank+tot)*100 : 0;
      if(S.coach){
        var co=[];
        if(S.wheel==='us') co.push('You\'re on the American wheel (5.26% edge). The European wheel has one zero and only 2.70%: switch for the same game at half the cost.');
        else if(!S.partage) co.push('European wheel: 2.70% edge on every bet. Turn on La Partage to cut even-money bets (red/black, odd/even, 1-18/19-36) to 1.35%.');
        else co.push('Best setup: European + La Partage. Even-money bets now cost just 1.35%; every other bet is 2.70%.');
        if(tot>0 && share>5) co.push('Bet sizing: '+share.toFixed(0)+'% of your bankroll is on this spin. Around 1–2% per spin ('+fmt(Math.max(1,Math.round((S.bank+tot)*0.015)))+') makes your session last.');
        else if(tot===0) co.push('Suggested unit: about '+fmt(Math.max(1,Math.round(S.bank*0.015)))+' per spin (1–2% of bankroll).');
        out += '<span class="co">Coach: '+co.join(' ')+'</span>';
        var basket = keyOf(['0','00','1','2','3']);
        if(S.wheel==='us' && S.bets[basket]) out += '<span class="wn">Warning: the five-number bet (0-00-1-2-3) has a 7.89% edge, the worst on the table. Every other bet is 5.26%.</span>';
      }
      return out;
    }
    function total(){ var t=0; Object.keys(S.bets).forEach(function(k){ t+=S.bets[k]; }); return Math.round(t*100)/100; }
    function renderInfo(){
      var top = hoverKey ? infoFor(hoverKey) : (spinning?'<span class="hv">No more bets, the ball is rolling…</span>':
        (S.lastMsg?'<span class="hv">'+S.lastMsg+'</span>':'<span class="hv">Hover any spot on the layout to see what it covers, its payout and its house edge.</span>'));
      R.info.innerHTML = top + coachHTML();
    }

    // ----- render -----
    function chipEl(a){ var c=a>=500?500:a>=100?100:a>=25?25:a>=5?5:1; return '<span class="stk"><span class="chip c'+c+'">'+fmtShort(a)+'</span></span>'; }
    function render(){
      R.bank.textContent=fmt(S.bank);
      qa('[data-bet]').forEach(function(n){ var k=n.getAttribute('data-bet'), a=S.bets[k], s=n.querySelector(':scope > .stk');
        if(a){ var html=chipEl(a); if(!s){ n.insertAdjacentHTML('beforeend',html); } else if(s.outerHTML!==html){ s.outerHTML=html; } } else if(s) s.remove(); });
      qa('[data-wheel]').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-wheel')===S.wheel); b.disabled=!!spinning; });
      var pin=q('[data-opt="partage"]'); pin.checked=S.partage; pin.disabled=S.wheel!=='eu'||!!spinning; R.partlbl.classList.toggle('off',S.wheel!=='eu');
      R.partlbl.title = S.wheel!=='eu'?'La Partage applies to the single-zero wheel':'';
      q('[data-opt="coach"]').checked=S.coach;
      R.edge.textContent = 'house edge '+(S.wheel==='us'?'5.26%':(S.partage?'2.70% · 1.35% even-money':'2.70%'));
      qa('[data-chip]').forEach(function(b){ b.classList.toggle('sel', +b.getAttribute('data-chip')===S.chip); });
      q('[data-act="sound"]').textContent = sound?'🔊':'🔇';
      q('[data-act="spin"]').disabled = !!spinning;
      ['undo','clear','rebet'].forEach(function(a){ q('[data-act="'+a+'"]').disabled = !!spinning; });
      var res=S.results;
      R.hist.innerHTML = res.length ? res.slice(0,18).map(function(l){ return '<span class="c-'+colorOf(l)+'">'+l+'</span>'; }).join('') : '<span style="color:var(--dim);font-family:var(--body);font-weight:500">no spins yet</span>';
      R.nres.textContent = res.length? res.length+(res.length>=200?'+':'')+' spins logged' : '';
      // hot / cold over last 100
      var last=res.slice(0,100), cnt={}; ORDER[S.wheel].forEach(function(l){ cnt[l]=0; }); last.forEach(function(l){ if(l in cnt) cnt[l]++; });
      if(last.length>=5){
        var labs=Object.keys(cnt), hot=labs.slice().sort(function(a,b){ return cnt[b]-cnt[a] || ord(a)-ord(b); }).slice(0,5),
          cold=labs.slice().sort(function(a,b){ return cnt[a]-cnt[b] || ord(a)-ord(b); }).slice(0,5);
        function chipsOf(arr){ return arr.map(function(l){ return '<span class="c-'+colorOf(l)+'">'+l+'<i>'+cnt[l]+'</i></span>'; }).join(''); }
        var rs=last.filter(function(l){return colorOf(l)==='r';}).length, bs=last.filter(function(l){return colorOf(l)==='b';}).length, zs=last.length-rs-bs;
        R.hc.innerHTML='<span>🔥 Hot</span><div>'+chipsOf(hot)+'</div><span>❄ Cold</span><div>'+chipsOf(cold)+'</div><span>Split</span><div style="font-family:var(--mono)">red '+rs+' · black '+bs+' · green '+zs+'</div>';
      } else R.hc.innerHTML='<span style="grid-column:1/-1;color:var(--dim)">Spin a few times to see hot and cold numbers.</span>';
      var st=S.stats;
      R.stats.innerHTML='<span>Spins<b>'+st.spins+'</b></span><span>Wagered<b>'+fmt(st.wagered)+'</b></span><span>Net<b style="color:'+(st.net>=0?'var(--ok)':'var(--bad)')+'">'+fmt(st.net)+'</b></span><span>Best spin<b>'+fmt(st.best)+'</b></span>';
      var t=total(); R.sum.innerHTML = t ? 'On the table: <b>'+fmt(t)+'</b>' : (S.last?'Rebet: <b>'+fmt(sumOf(S.last))+'</b>':'');
      renderInfo();
    }
    function sumOf(b){ var t=0; Object.keys(b||{}).forEach(function(k){ t+=b[k]; }); return Math.round(t*100)/100; }

    // ----- tips -----
    function renderTips(){
      // Martingale example: $10 on red, how long a losing run until you can't cover
      var pLoseEu=19/37, pLoseUs=20/38, n7eu=Math.pow(pLoseEu,7)*100, n7us=Math.pow(pLoseUs,7)*100;
      // probability of 7 losses in a row somewhere within 100 spins (rough, by DP)
      function runProb(p,run,spins){ var dp=[1]; for(var i=1;i<run;i++) dp.push(0); var bust=0;
        for(var s=0;s<spins;s++){ var nd=new Array(run).fill(0); for(var k=0;k<run;k++){ if(!dp[k]) continue; nd[0]+=dp[k]*(1-p); if(k+1>=run) bust+=dp[k]*p; else nd[k+1]+=dp[k]*p; } dp=nd; } return bust*100; }
      var r100=runProb(pLoseEu,7,100);
      R.tips.innerHTML =
        '<div><ul>'+
        '<li><b>Play the European wheel.</b> One green zero means a <b>2.70%</b> house edge. The American wheel adds 00: <b>5.26%</b>, almost double, for the exact same payouts.</li>'+
        '<li><b>Every bet costs the same.</b> On a given wheel, a straight-up number and red/black have the same edge. Pick bets for the ride you want (big swings vs. steady), not for “better odds”.</li>'+
        '<li><b>Except the five-number bet</b> (0-00-1-2-3, American only): it pays 6:1 but should pay 6.6:1, so its edge is <b>7.89%</b>. Avoid it.</li>'+
        '<li><b>La Partage</b> (French rule): when 0 hits, even-money bets lose only half. That halves their edge to <b>1.35%</b>, the best bet in roulette.</li>'+
        '<li><b>Betting systems don\'t change the math.</b> Martingale (double after every loss) turns many small wins into a rare huge loss. Each spin still has the same edge, and no pattern of bets can add up to a positive one.'+
          '<div class="mg">$10 on red, double after a loss:<br>10 → 20 → 40 → 80 → 160 → 320 → 640<br>7 losses in a row = <b>−$1,270</b> to chase a <b>$10</b> win.<br>Odds of 7 straight losses: '+n7eu.toFixed(2)+'% per sequence (EU), '+n7us.toFixed(2)+'% (US).<br>Over 100 spins: ~'+r100.toFixed(0)+'% chance it happens at least once.</div></li>'+
        '<li><b>Hot and cold numbers are just for fun.</b> The wheel has no memory; a “cold” number isn\'t “due”.</li>'+
        '<li><b>Bet sizing:</b> pick a unit of about 1–2% of your bankroll (with $1,000 that\'s $10–$20 per spin) and stick to it. Expected loss ≈ total wagered × edge: 100 spins × $10 on European ≈ $27.</li>'+
        '</ul></div>'+
        '<div><table class="pt"><tr><td><b>Bet</b></td><td><b>Pays</b></td><td><b>EU</b></td><td><b>US</b></td></tr>'+
        [['Straight (1 number)','35:1'],['Split (2)','17:1'],['Street / trio (3)','11:1'],['Corner / first four (4)','8:1'],['Six line (6)','5:1'],['Dozen / column (12)','2:1'],['Red/black, odd/even, 1-18/19-36','1:1']]
          .map(function(r){ return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td>2.70%</td><td>5.26%</td></tr>'; }).join('')+
        '<tr><td>Even-money with La Partage</td><td>1:1</td><td>1.35%</td><td>–</td></tr>'+
        '<tr class="bad"><td>Five-number 0-00-1-2-3</td><td>6:1</td><td>–</td><td>7.89%</td></tr></table>'+
        '<p style="margin:8px 0 0">Keys: <b>Space</b> spin · <b>Z</b> undo · <b>R</b> rebet · <b>1–5</b> chips. Right-click a bet to remove one chip.</p></div>';
    }

    // ----- actions -----
    function toast(m){ if(m===lastToast) return; lastToast=m; api.toast(m); later(function(){ lastToast=''; },1200); }
    function clearWin(){ qa('.cell.win').forEach(function(c){ c.classList.remove('win'); }); }
    function place(k, amt){
      if(spinning) return false;
      var d=DEFS[S.wheel][k]; if(!d) return false;
      var a=Math.min(amt||S.chip, S.bank); a=Math.floor(a*100)/100;
      if(!(a>0)){ toast('Not enough bankroll. Use Reset for a fresh '+fmt(START_BANK)+'.'); return false; }
      S.bank=Math.round((S.bank-a)*100)/100; S.bets[k]=Math.round(((S.bets[k]||0)+a)*100)/100; S.stack.push([k,a]);
      if(S.coach && d.kind==='basket') toast('Coach: the five-number bet has a 7.89% house edge, the worst bet in roulette.');
      clearWin(); sChip(); persist(); render(); return true;
    }
    function remove(k){
      if(spinning||!S.bets[k]) return;
      var a=Math.min(S.chip,S.bets[k]); S.bets[k]=Math.round((S.bets[k]-a)*100)/100; S.bank=Math.round((S.bank+a)*100)/100;
      if(!S.bets[k]) delete S.bets[k];
      // trim the undo stack for that key
      var left=a; for(var i=S.stack.length-1;i>=0&&left>0;i--){ if(S.stack[i][0]!==k) continue; var t=Math.min(left,S.stack[i][1]); S.stack[i][1]-=t; left-=t; if(S.stack[i][1]<=0) S.stack.splice(i,1); }
      sChip(); persist(); render();
    }
    function undo(){ if(spinning) return; var u=S.stack.pop(); if(!u) return; var k=u[0], a=Math.min(u[1],S.bets[k]||0);
      S.bets[k]=Math.round(((S.bets[k]||0)-a)*100)/100; if(!(S.bets[k]>0)) delete S.bets[k]; S.bank=Math.round((S.bank+a)*100)/100; sChip(); persist(); render(); }
    function clearBets(){ if(spinning) return; S.bank=Math.round((S.bank+total())*100)/100; S.bets={}; S.stack=[]; persist(); render(); }
    function rebet(){
      if(spinning||!S.last) return;
      var need=sumOf(S.last); if(need>S.bank){ toast('Not enough bankroll to rebet '+fmt(need)+'.'); return; }
      var D=DEFS[S.wheel], skipped=0;
      Object.keys(S.last).forEach(function(k){ if(!D[k]){ skipped++; return; } S.bank=Math.round((S.bank-S.last[k])*100)/100; S.bets[k]=Math.round(((S.bets[k]||0)+S.last[k])*100)/100; S.stack.push([k,S.last[k]]); });
      if(skipped) toast('Some bets don\'t exist on this wheel and were skipped.');
      clearWin(); sChip(); persist(); render();
    }
    function setWheel(w){
      if(spinning||w===S.wheel) return;
      // refund bets that don't exist on the other wheel
      var D=DEFS[w]; Object.keys(S.bets).forEach(function(k){ if(!D[k]){ S.bank=Math.round((S.bank+S.bets[k])*100)/100; delete S.bets[k]; } });
      S.stack=S.stack.filter(function(x){ return !!D[x[0]]; });
      S.wheel=w; ballPos=null; R.res.hidden=true; buildTable(); prerender(); draw(); persist(); render();
      if(S.coach && w==='us') toast('Coach: the American wheel has a 5.26% edge vs 2.70% on European.');
    }

    function finishSpin(){
      var sp=spinning; if(!sp) return; spinning=null; if(raf){ cancelAnimationFrame(raf); raf=0; }
      var i=sp.idx, lab=ORDER[S.wheel][i];
      wheelRot=sp.wEnd%(Math.PI*2); ballPos={a:wheelRot+pocketAngle(i), r:0.565};
      if(!hiddenNow()) draw();
      var r=settle(sp.bets, lab, S.wheel, S.partage);
      S.bank=Math.round((S.bank+r.returned)*100)/100;
      S.results.unshift(lab); if(S.results.length>200) S.results.length=200;
      S.stats.spins++; S.stats.wagered=Math.round((S.stats.wagered+r.staked)*100)/100; S.stats.net=Math.round((S.stats.net+r.net)*100)/100; if(r.net>S.stats.best) S.stats.best=r.net;
      if(Object.keys(sp.bets).length) S.last=sp.bets; S.bets={}; S.stack=[];
      var col=colorOf(lab), cname=col==='r'?'red':col==='b'?'black':'green';
      R.res.hidden=false; R.res.className='rt-res c-'+col+' pop'; R.res.textContent=lab; later(function(){ R.res.classList.remove('pop'); },300);
      clearWin(); var cell=q('.cell[data-num="'+lab+'"]'); if(cell) cell.classList.add('win');
      var msg='<b style="font-family:var(--display)">'+lab+' '+cname+'</b>. ';
      if(r.staked){ msg += r.net>0?'You win <b style="color:var(--ok)">+'+fmt(r.net)+'</b> (returned '+fmt(r.returned)+').':r.net<0?'You lose <b style="color:var(--bad)">'+fmt(r.net)+'</b>'+(r.returned?' (got back '+fmt(r.returned)+')':'')+'.':'Break even.';
        if(r.wins.some(function(w){return w.partage;})) msg+=' La Partage returned half your even-money bets.'; }
      else msg+='No bets were down.';
      S.lastMsg=msg; hoverKey=null;
      persist(); render();
      if(!sp.quiet){ if(r.net>0) sWin(); else if(r.staked) sLose(); }
      if(S.bank<1) toast('Out of chips! Hit Reset for a fresh '+fmt(START_BANK)+'.');
    }
    function spin(){
      if(spinning) return;
      if(!total() && S.last && S.coach){ /* allow free spins, just a hint */ }
      var order=ORDER[S.wheel], N=order.length, idx;
      if(forced.length){ var f=String(forced.shift()); idx=order.indexOf(f); if(idx<0) idx=Math.floor(Math.random()*N); }
      else idx=Math.floor(Math.random()*N);
      var bets=JSON.parse(JSON.stringify(S.bets));
      var T=instant?0:4800, Tb=T*0.82;
      var w0=wheelRot, wEnd=w0+Math.PI*2*(1.1+Math.random()*0.5);
      var wAt=function(t){ var u=Math.min(1,t/T); return w0+(wEnd-w0)*(1-Math.pow(1-u,2.2)); };
      var b0 = ballPos ? ballPos.a : -Math.PI*0.25;
      var target = wAt(Tb)+pocketAngle(idx);
      // ball travels counter to the wheel: b(t)=b0 - B*ease ; need b0-B ≡ target (mod 2π), B > 5 turns
      var B = b0 - target; B = ((B%(Math.PI*2))+Math.PI*2)%(Math.PI*2); B += Math.PI*2*5;
      spinning={idx:idx,bets:bets,t0:performance.now(),T:T,Tb:Tb,wAt:wAt,wEnd:wEnd,b0:b0,B:B,lastPocket:-1,quiet:instant};
      S.lastMsg=''; hoverKey=null; clearWin(); R.res.hidden=true; render();
      if(instant){ finishSpin(); return; }
      blip(520,0.08,'triangle',0.04);
      raf=requestAnimationFrame(frame);
    }
    function frame(now){
      raf=0; var sp=spinning; if(!sp) return;
      if(hiddenNow()){ sp.quiet=true; finishSpin(); return; }   // not visible: stop animating, settle immediately
      var t=now-sp.t0;
      if(t>=sp.T){ finishSpin(); return; }
      wheelRot=sp.wAt(t);
      if(t<sp.Tb){
        var u=t/sp.Tb, e=1-Math.pow(1-u,2.6), a=sp.b0-sp.B*e;
        // radius: on the track, then drops in over the last 30% with a couple of bounces
        var r=0.82; if(u>0.7){ var v=(u-0.7)/0.3; r=0.82-(0.82-0.565)*Math.min(1,v*1.25) + Math.abs(Math.sin(v*Math.PI*3))*0.035*(1-v); }
        ballPos={a:a,r:r};
        var pk=Math.floor(((a-wheelRot)/(Math.PI*2/ORDER[S.wheel].length))%1000); if(u>0.7 && pk!==sp.lastPocket){ sp.lastPocket=pk; sTick(); }
      } else ballPos={a:wheelRot+pocketAngle(sp.idx), r:0.565};
      draw();
      raf=requestAnimationFrame(frame);
    }
    function reset(){ if(spinning) return; S.bank=START_BANK; S.bets={}; S.stack=[]; S.last=null; S.results=[]; S.stats={spins:0,wagered:0,net:0,best:0}; S.lastMsg='';
      clearWin(); R.res.hidden=true; persist(); render(); api.toast('Bankroll reset to '+fmt(START_BANK)+'.'); }

    // ----- events -----
    function highlight(k){ qa('.cell.hl').forEach(function(c){ c.classList.remove('hl'); }); if(!k) return; var d=DEFS[S.wheel][k]; if(!d) return;
      d.nums.forEach(function(l){ var c=q('.cell[data-num="'+l+'"]'); if(c) c.classList.add('hl'); }); }
    on(root,'click',function(e){
      var b=e.target.closest('[data-bet]'); if(b){ if(e.shiftKey) remove(b.getAttribute('data-bet')); else place(b.getAttribute('data-bet')); return; }
      var c=e.target.closest('[data-chip]'); if(c){ S.chip=+c.getAttribute('data-chip'); sChip(); persist(); render(); return; }
      var w=e.target.closest('[data-wheel]'); if(w){ setWheel(w.getAttribute('data-wheel')); return; }
      var a=e.target.closest('[data-act]'); if(!a) return; var act=a.getAttribute('data-act');
      if(act==='spin') spin(); else if(act==='undo') undo(); else if(act==='clear') clearBets(); else if(act==='rebet') rebet(); else if(act==='reset') reset();
      else if(act==='sound'){ sound=!sound; api.save('sound',sound); if(!sound&&actx){ try{actx.close();}catch(_){} actx=null; } render(); }
    });
    on(root,'contextmenu',function(e){ var b=e.target.closest('[data-bet]'); if(!b) return; e.preventDefault(); remove(b.getAttribute('data-bet')); });
    on(root,'change',function(e){ var k=e.target.getAttribute('data-opt'); if(!k) return; S[k]=!!e.target.checked; persist(); render(); });
    on(root,'mouseover',function(e){ var b=e.target.closest('[data-bet]'); var k=b?b.getAttribute('data-bet'):null; if(k===hoverKey) return; hoverKey=k; highlight(k); renderInfo(); });
    on(root,'mouseleave',function(){ hoverKey=null; highlight(null); renderInfo(); });
    on(window,'keydown',function(e){
      if(el.offsetParent===null) return; var tg=e.target&&e.target.tagName; if(tg==='INPUT'||tg==='TEXTAREA'||tg==='SELECT') return;
      if(e.ctrlKey||e.metaKey||e.altKey) return;
      if(e.code==='Space'||e.key===' '){ e.preventDefault(); spin(); }
      else if(e.key==='z'||e.key==='Z'){ e.preventDefault(); undo(); }
      else if(e.key==='r'||e.key==='R'){ e.preventDefault(); rebet(); }
      else if(/^[1-5]$/.test(e.key)){ S.chip=CHIPS[+e.key-1]; persist(); render(); }
    });
    var rzT=null;
    on(window,'resize',function(){ if(rzT) clearTimeout(rzT); rzT=later(function(){ rzT=null; if(hiddenNow()) return; layoutCanvas(); },150); });

    buildTable(); renderTips(); render(); layoutCanvas();
    if(S.results[0]){ var li=ORDER[S.wheel].indexOf(S.results[0]); if(li>=0){ ballPos={a:wheelRot+pocketAngle(li),r:0.565}; draw(); } }

    inst={
      destroy:function(){
        if(raf){ cancelAnimationFrame(raf); raf=0; } spinning=null;
        timers.forEach(clearTimeout); timers=[];
        listeners.forEach(function(l){ l[0].removeEventListener(l[1],l[2],l[3]); }); listeners=[];
        if(actx){ try{actx.close();}catch(_){} actx=null; }
        el.innerHTML='';
      },
      state:function(){ return S; }, place:place, spin:spin, setWheel:setWheel,
      view:function(){ return {rot:wheelRot, ball:ballPos, spinning:!!spinning, raf:!!raf}; },
      setOpt:function(k,v){ S[k]=v; persist(); render(); }
    };
  }
  function unmount(){ if(inst){ inst.destroy(); inst=null; } }

  window.VanArcade[ID] = {
    mount:mount, unmount:unmount,
    // ---- testing hooks (not used by the app) ----
    _force:function(label){ forced.push(String(label)); },   // next spin lands on this pocket ('0','00','17'...)
    _instant:function(v){ instant=!!v; },
    _state:function(){ return inst?JSON.parse(JSON.stringify(inst.state())):null; },
    _place:function(key,amt){ return inst?inst.place(key,amt):false; },
    _spin:function(){ if(inst) inst.spin(); },
    _wheel:function(w){ if(inst) inst.setWheel(w); },
    _view:function(){ return inst?inst.view():null; },
    _opt:function(k,v){ if(inst) inst.setOpt(k,v); },
    _engine:{DEFS:DEFS, ORDER:ORDER, settle:settle, edgeOf:edgeOf, keyOf:keyOf, colorOf:colorOf}
  };
})();
