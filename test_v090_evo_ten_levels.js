const fs=require('fs'),vm=require('vm');const h=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'index.html'),'utf8');
function block(id){const i=h.indexOf('<script id="'+id+'">');const j=h.indexOf('</script>',i);return h.slice(h.indexOf('>',i)+1,j);}
const evoSrc=h.slice(h.indexOf('/* EVO10 -- ten-level'),h.indexOf("const EXO_ART_BASE"));
const linesSrc=h.slice(h.indexOf('const EXO_LINES'),h.indexOf('// ── Evo art (PATCH evo-art v1)'));
const seasonLine=h.slice(h.indexOf('window.SMF_SEASON = '),h.indexOf('\n',h.indexOf('window.SMF_SEASON = ')));
let saved=[],toasts=[],modals=[];
const ctx={console,Math,JSON,Date,Object,Array,String,Number,setTimeout:()=>0,clearTimeout:()=>0,
 window:{},document:{addEventListener(){},querySelector(){return null},getElementById(){return null}},
 L:{me:{id:'p1'},exo:{},story:{byId:{}},roster:[{id:'p1',studioId:'studio-innov8',xc:9999}],hostRoster:[]},
 esc:s=>String(s),toast:t=>toasts.push(t),modal:m=>modals.push(m),modalClose(){},render(){},liteLog(){},kvSave(){},postAward(){},
 myRecord:()=>ctx.L.roster[0],SUPABASE_URL:'x',SB_HEADERS:{},fetch:(u,o)=>{saved.push(JSON.parse(o.body));return Promise.resolve({ok:true})},go(){}};
ctx.window=ctx; vm.createContext(ctx);
vm.runInContext(evoSrc.replace('const EXO_ART_BASE','')+';'+linesSrc.replace('const EXO_LINES','var EXO_LINES')+';'+seasonLine,ctx);
vm.runInContext(block('xl-evb'),ctx);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('FAIL',m))};
const W=ctx.window;
// hatch
W.xlEvoHatch('neonborn','bay'); const row=ctx.L.exo.p1; ok(row.level===1&&row.branch==='BASE','hatch writes level 1 BASE');
let html=W.xlEvoBayHTML(); ok(/Your Evo · Level 1/.test(html),'bay shows level 1'); ok((html.match(/evb-divider/g)||[]).length===10,'10-level deck');
ok(/1-base-default-standard\.web\.jpg/.test(html),'L1 web art'); ok(!/\.png/.test(html),'no PNG masters'); ok(!/BUY ·/.test(html),'no build shop');
// level up to 2 via feeding
ctx.L.story.byId.p1.orbs=500; row.sync_xp=240; W.xlEvoFeed(); ok(row.level>=2,'feed levels up: lv '+row.level+' xp '+row.sync_xp);
html=W.xlEvoBayHTML(); ok(/Choose your path/.test(html),'path choice shown at L2'); ok((html.match(/xlEvoChoose\('/g)||[]).length===3,'3 choices');
W.xlEvoChoose('B'); W.xlEvoChooseConfirm('B'); ok(row.branch==='B','branch B saved'); ok(saved.some(s=>s.branch==='B'),'branch posted');
html=W.xlEvoBayHTML(); ok(/l0?2-b-default|2-b-default-standard\.web\.jpg/.test(html),'L2 B art: '+(html.match(/[\w\/-]*2-b-default-standard\.web\.jpg/)||[])[0]); ok(!/xlEvoChoose\('/.test(html),'no pending');
// jump XP to L5 via battle-style patch: simulate
row.sync_xp=2499; ctx.L.story.byId.p1.orbs=500; ctx.L.story.byId.p1.lastCare=0; W.xlEvoFeed(); ok(row.level===5&&row.stage===3,'L5 tier3: '+row.level+'/'+row.stage);
html=W.xlEvoBayHTML(); ok(/xlEvoChoose\('B1'\)/.test(html)&&/xlEvoChoose\('B2'\)/.test(html)&&!/xlEvoChoose\('A1'\)/.test(html),'L5 offers B1/B2 only');
ok(/l04-b-default-standard\.web\.jpg/.test(html),'shows L4 B card until choice');
W.xlEvoChooseConfirm('B2'); html=W.xlEvoBayHTML(); ok(/l05-b2-default-standard\.web\.jpg/.test(html),'L5 B2 card');
row.sync_xp=19999; ctx.L.story.byId.p1.lastCare=0; W.xlEvoFeed(); ok(row.level===9,'L9 by xp '+row.level);
html=W.xlEvoBayHTML(); ok(/Hybrid path open/.test(html),'hybrid offered'); ok(/l09-b2/.test(html),'L9 B2 art');
row.sync_xp=99999; ctx.L.story.byId.p1.lastCare=0; W.xlEvoFeed(); ok(row.level===9,'no auto L10'); html=W.xlEvoBayHTML(); ok(/Level 10 is host granted/.test(html),'host-grant note');
W.xlEvoChooseConfirm('H'); ok(row.branch==='H','hybrid taken'); html=W.xlEvoBayHTML(); ok(/l09-h-default/.test(html),'L9 H art');
const st=W.pflxExoState?1:0;
console.log(pass+' passed, '+fail+' failed; toasts:',toasts.slice(0,3));
