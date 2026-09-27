// PATCH X-LIVE v0.79 -- Evo Clash open from the start. Extracts the shipped
// starter-hatch code and runs it in a sandbox. Run: node test_v079_evoclash_start.js index.html
'use strict';
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; if (!c) console.log('FAIL:', m); };
const a = src.indexOf('  var STUDIO_LINE = {'), b = src.indexOf('  /* ---------- Evo Bay pane ---------- */');
ok(a > 0 && b > a, 'starter block present');
const posts = [];
const ctx = { window: {}, L: { me: { id: 'p1' }, roster: [{ id: 'p1', studioId: 'studio-mindforge' }], exo: {} },
  EXO_LINES: { ironwright: { name: 'IRONWRIGHT', stages: ['Cogling'] }, resonant: { name: 'RESONANT', stages: ['Emberling'] },
    mythweaver: { name: 'MYTHWEAVER', stages: ['Sketchling'] }, neonborn: { name: 'NEONBORN', stages: ['Bitling'] } },
  esc: s => String(s), SUPABASE_URL: 'x', SB_HEADERS: {}, rendered: 0, started: '',
  fetch: (u, o) => { posts.push([u, JSON.parse(o.body)]); return Promise.resolve({}); } };
ctx.render = () => ctx.rendered++;
ctx.window.xlBattleStartSequence = m => { ctx.started = m; };
vm.createContext(ctx);
vm.runInContext('var myId=function(){return (L.me&&L.me.id)||""};var exoRow=function(){return (L.exo&&L.exo[myId()])||null};' + src.slice(a, b), ctx);
const card = ctx.xlEvoStarterCard('clash');
ok(/HATCH EMBERLING &amp; FIGHT/.test(card), 'MindForge player gets an Emberling hatch-and-fight button');
ctx.window.xlEvoHatch('resonant', 'clash');
ok(ctx.L.exo.p1 && ctx.L.exo.p1.line === 'resonant' && ctx.L.exo.p1.stage === 1, 'hatch writes a Stage 1 row locally');
ok(posts.length === 1 && /player_avatars/.test(posts[0][0]) && posts[0][1].player_id === 'p1', 'hatch upserts player_avatars');
ok(ctx.started === 'fight', 'hatch from Evo Clash goes straight to the fight');
ctx.window.xlEvoHatch('ironwright', 'clash');
ok(posts.length === 1 && ctx.L.exo.p1.line === 'resonant', 'a second hatch never overwrites an existing Evo');
ctx.L.me.id = 'p2'; ctx.L.roster.push({ id: 'p2', studioId: '' });
const pick = ctx.xlEvoStarterCard('bay');
ok((pick.match(/xlEvoHatch/g) || []).length === 4, 'no Studio yet: choose from the four lines');
ok(src.includes("if (!ex && g) return '<div class=\"evb-stage\">' + xlEvoStarterCard('clash')"), 'Evo Clash renders the starter card');
ok(src.includes("if (!ex && g) return xlEvoStarterCard('bay')"), 'Evo Bay renders the starter card');
console.log(pass + ' passed, ' + fail + ' failed');
