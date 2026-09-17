// PATCH X-LIVE v0.38 -- announcer: static + pure-logic checks. Usage: node test_xlive_announcer_v038.js [index.html]
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } }
function between(a, b) { const i = src.indexOf(a); const j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('marker ' + a); return src.slice(i, j); }
check('header note v0.38', src.indexOf('X-LIVE v0.38, Sept 17 2026') > 0);
check('clips served by the Platform', src.indexOf("const XL_ANN_ROOT = XL_SOUND_ROOT + 'pflx-announcer/';") > 0);
check('host picker + pad in SHOW CONTROL and backstage', src.split('+ xlAnnPadHtml(s)').length === 3);
check('player VOICE button in the header', src.indexOf('id="xl-ann-btn"') > 0);
check('announcer follows the PFLX sound window', src.indexOf('if (!xlAnnOn() || !xlAudioHere) return false;') > 0 && src.indexOf('if (!h) xlAnnStop();') > 0);
check('pad events ride on fxEvents (never replayed on first sight)', src.indexOf("if (e.ann) { const line = XL_ANN_PAD.find(x => x[0] === e.ann);") > 0);
const ctx = { L: {}, played: [] };
vm.createContext(ctx);
vm.runInContext(between('const XL_ANN_PAD = [', 'function xlAnnOn()') + between('function xlAnnVoice(s)', 'const xlAnn = {') +
  between('function xlAnnWatch(s, prev, snap, sl, now) {', 'function xlToggleMusic()') +
  '\nfunction xlAnnounce(c, v) { played.push(v + ":" + c.join("+")); return true; }\nfunction xlTimerId(s, t) { return "xl:" + s.id + ":" + t.id; }\nfunction xlTimerInfo(t, now) { if (!t || !t.seconds) return null; const e = t.startedAt + t.seconds * 1000; return { running: !t.stoppedAt && now < e, endsAt: e }; }\nthis.W = xlAnnWatch; this.V = xlAnnVoice; this.PAD = XL_ANN_PAD;', ctx);
check('voice: default female, host can pick male/off', ctx.V({}) === 'female' && ctx.V({ announcer: 'male' }) === 'male' && ctx.V({ announcer: 'off' }) === 'off' && ctx.V(null) === 'female');
check('pad has 15 lines, keys unique', ctx.PAD.length === 15 && new Set(ctx.PAD.map(p => p[0])).size === 15);
const base = { idx: 0, slideId: 'a', total: 4, paused: false, held: false, status: 'active', raceAt: 0 };
const S = (o) => Object.assign({ id: 'S', hostControls: {}, slides: [] }, o || {});
ctx.played.length = 0; ctx.L.annDone = {};
ctx.W(S(), base, Object.assign({}, base, { idx: 3, slideId: 'd' }), null, 1000);
check('last slide -> final_round', ctx.played.join() === 'female:final_round', ctx.played);
ctx.played.length = 0;
ctx.W(S(), base, Object.assign({}, base, { idx: 1, slideId: 'b', raceAt: 900 }), null, 1000);
check('race start -> go (wins over other slide lines)', ctx.played.join() === 'female:go', ctx.played);
ctx.played.length = 0;
ctx.W(S(), base, Object.assign({}, base, { raceAt: 1 }), null, 100000);
check('stale race start is ignored', ctx.played.length === 0, ctx.played);
ctx.W(S({ announcer: 'male' }), base, Object.assign({}, base, { held: true }), null, 5000);
check('HOLD toggle -> war_hold in the host voice', ctx.played.join() === 'male:war_hold', ctx.played);
ctx.played.length = 0;
ctx.W(S({ announcer: 'off' }), base, Object.assign({}, base, { status: 'ended' }), null, 5000);
check('announcer off -> silent', ctx.played.length === 0);
ctx.W(S({ id: 'E' }), base, Object.assign({}, base, { status: 'ended' }), null, 5000);
ctx.W(S({ id: 'E' }), base, Object.assign({}, base, { status: 'ended' }), null, 6000);
check('session end -> mission_completed once', ctx.played.join() === 'female:mission_completed', ctx.played);
ctx.played.length = 0;
const T = { id: 't', seconds: 60, startedAt: 0 };
[29000, 30000, 31000, 36000].forEach(n => ctx.W(S({ id: 'H', showTimer: T }), base, base, null, n));
check('60 s timer -> hurry_up once, inside the 30 s window', ctx.played.join() === 'female:hurry_up', ctx.played);
ctx.played.length = 0;
ctx.W(S({ id: 'H2', showTimer: { id: 't2', seconds: 40, startedAt: 0 } }), base, base, null, 12000);
check('timers under 45 s never hurry', ctx.played.length === 0);
ctx.W(S({ id: 'H3', showTimer: T, hostControls: { paused: true } }), base, base, null, 31000);
check('paused timer never hurries', ctx.played.length === 0);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
