// PATCH X-LIVE v0.35 -- gameshow mode: pure logic, extracted from index.html.
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } }
function between(a, b) { const i = src.indexOf(a); const j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('marker ' + a); return src.slice(i, j); }
check('engine embedded', src.indexOf('root.PflxFx = {') !== -1);
check('sounds served by the Platform', src.indexOf("const XL_SOUND_ROOT = 'https://www.prototypeflx.com/public/sounds/';") !== -1);
check('header comment for v0.35', src.indexOf('X-LIVE v0.35, Sept 15 2026') !== -1);
const merge = between('function mergeSession(local, incoming) {', 'function mergeSessionList(');
const mod = between('function xlTimerInfo(t, now) {', 'function xlFmt(sec) {') +
  between('function xlSessionZone(s, now) {', 'window.xlMusicZone = xlMusicZone;') +
  between('function xlSlideTimerExpired(s, sl, now) {', 'window.xlSlideTimerExpired') +
  between('function xlTimerId(s, t) {', 'async function xlShowTimerStart') +
  between('function xlWantedCountdowns(s, now, extra) {', 'window.xlWantedCountdowns');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(merge + mod + '\nthis.mergeSession = mergeSession; this.info = xlTimerInfo; this.zone = xlSessionZone; this.expired = xlSlideTimerExpired; this.want = xlWantedCountdowns;', ctx);
const T = { id: 't1', seconds: 30, startedAt: 1000, stoppedAt: null, slideId: 's1' };
let i = ctx.info(T, 11000);
check('timer: 20s left, running', i.running && Math.round(i.remaining) === 20 && i.endsAt === 31000, i);
i = ctx.info(T, 40000);
check('timer: past the end = expired', i.expired && !i.running && i.remaining === 0);
i = ctx.info(Object.assign({}, T, { stoppedAt: 6000 }), 40000);
check('timer: stopped keeps its remaining time', i.stopped && !i.running && !i.expired && Math.round(i.remaining) === 25);
check('timer: none -> null', ctx.info(null) === null && ctx.info({ startedAt: 1, seconds: 0 }) === null);
const sess = (o) => Object.assign({ id: 'S', status: 'active', hostControls: {}, currentSlideIndex: 0, slides: [{ id: 's1', type: 'mc' }] }, o);
check('expired: slide-bound timer out -> answers lock', ctx.expired(sess({ showTimer: T }), { id: 's1' }, 40000));
check('expired: a quick timer never locks answers', !ctx.expired(sess({ showTimer: Object.assign({}, T, { slideId: null }) }), { id: 's1' }, 40000));
check('expired: another slide is unaffected', !ctx.expired(sess({ showTimer: T }), { id: 's2' }, 40000));
check('expired: still running -> open', !ctx.expired(sess({ showTimer: T }), { id: 's1' }, 5000));
let w = ctx.want(sess({ showTimer: T }), 11000);
check('wanted: running session timer', w['xl:S:t1'] && w['xl:S:t1'].endsAt === 31000);
w = ctx.want(sess({ showTimer: Object.assign({}, T, { stoppedAt: 5000 }) }), 11000);
check('wanted: stopped timer is not wanted', !w['xl:S:t1']);
w = ctx.want(sess({ showTimer: T }), 36000);
check('wanted: finished more than 3s ago is dropped', !w['xl:S:t1']);
w = ctx.want(sess({ slides: [{ id: 'r1', type: 'quiz_race', seconds: 20, startedAt: 1000 }] }), 5000);
check('wanted: X-Rush question clock', w['xl-race:r1'] && w['xl-race:r1'].endsAt === 21000 && w['xl-race:r1'].label === 'X-Rush');
w = ctx.want(sess({ hostControls: { paused: true }, slides: [{ id: 'r1', type: 'quiz_race', seconds: 20, startedAt: 1000 }] }), 5000);
check('wanted: paused X-Rush has no countdown', !w['xl-race:r1']);
w = ctx.want(sess({ status: 'ended', showTimer: T }), 11000);
check('wanted: ended session -> nothing', Object.keys(w).length === 0);
w = ctx.want(null, 11000, [{ id: 'tool', endsAt: 20000 }]);
check('wanted: tool/agenda timers pass through', w.tool && w.tool.endsAt === 20000);
check('zone: X-Rush = rush', ctx.zone(sess({ slides: [{ id: 'r', type: 'quiz_race' }] }), 0) === 'rush');
check('zone: paused = lobby', ctx.zone(sess({ hostControls: { paused: true } }), 0) === 'lobby');
check('zone: frozen = silence', ctx.zone(sess({ hostControls: { slideFrozen: true } }), 0) === null);
check('zone: open question = think', ctx.zone(sess({}), 0) === 'think');
check('zone: revealed text slide = quiet', ctx.zone(sess({ slides: [{ id: 'x', type: 'text' }] }), 0) === null);
check('zone: timer running = think', ctx.zone(sess({ slides: [{ id: 'x', type: 'text' }], showTimer: T }), 5000) === 'think');
// merge
const base = { id: 'S', updatedAt: 100, slides: [], liveParticipants: [], awardedTo: [] };
let m = ctx.mergeSession(Object.assign({}, base, { updatedAt: 200, showTimer: { id: 'a', updatedAt: 1 } }), Object.assign({}, base, { showTimer: { id: 'b', updatedAt: 5 } }));
check('merge: showTimer is last-write-wins on its OWN stamp (not the session stamp)', m.showTimer.id === 'b');
m = ctx.mergeSession(Object.assign({}, base, { showTimer: { id: 'a', updatedAt: 9 } }), Object.assign({}, base, {}));
check('merge: one side missing keeps the other', m.showTimer.id === 'a');
m = ctx.mergeSession(Object.assign({}, base, { updatedAt: 300, fxEvents: [{ id: 'f1', at: 1 }] }), Object.assign({}, base, { fxEvents: [{ id: 'f2', at: 2 }, { id: 'f1', at: 1 }] }));
check('merge: fxEvents union by id, time order', m.fxEvents.map(e => e.id).join() === 'f1,f2');
const many = []; for (let k = 0; k < 40; k++) many.push({ id: 'e' + k, at: k });
m = ctx.mergeSession(Object.assign({}, base, { fxEvents: many.slice(0, 20) }), Object.assign({}, base, { fxEvents: many.slice(20) }));
check('merge: fxEvents capped at newest 30', m.fxEvents.length === 30 && m.fxEvents[0].id === 'e10');
// wiring
check('slide moves start/stop slide timers', (src.match(/xlSlideAutoTimer\(s, (j|i)\); xlSfx\('next'\);/g) || []).length === 2);
check('GO LIVE auto-timer + intro FX', src.indexOf("if (typeof xlSlideAutoTimer === 'function') xlSlideAutoTimer(s, 0);") !== -1 && src.indexOf("xlShowFx('intro'); // PATCH X-LIVE v0.35") !== -1);
check('answers refused after time-up (choice + text)', (src.match(/xlSlideTimerExpired\(s, sl, Date\.now\(\)\)\) return; \/\/ PATCH X-LIVE v0\.35/g) || []).length === 2);
check('tools timer = synced ring timer', src.indexOf("xlToolTimerStart(Math.round(mins * 60)); return;") !== -1);
check('render runs the effects sync on every path', (src.match(/xlAfterRender\(\);/g) || []).length === 3);
check('in-platform countdowns are handed to the Platform', src.indexOf("type: 'pflx_countdown', action: 'start', id: id, endsAt: endsAt, label: label, announce: true, broadcast: true") !== -1);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
