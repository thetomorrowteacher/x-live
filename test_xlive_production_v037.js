// PATCH X-LIVE v0.37 -- live production mode: pure logic, extracted from index.html.
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } }
function between(a, b) { const i = src.indexOf(a); const j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('marker ' + a); return src.slice(i, j); }
check('header comment for v0.37', src.indexOf('X-LIVE v0.37, Sept 16 2026') !== -1);
if (src.indexOf('PATCH X-LIVE v0.37 -- live production mode') === -1) { check('v0.37 module present', false); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }
const merge = between('function mergeSession(local, incoming) {', 'function mergeSessionList(');
const types = between('const SLIDE_TYPES = [', 'function pflxSlideTypePickerHtml(');
const mod = between('const XL_STRICT_MODES = [', '// ── segment bookkeeping (host) ──') +
  between('function xlSegmentMark(s, fromIdx, toIdx, now) {', 'function xlTouchHost(s) {') +
  between('function xlShouldPull(s, myId, seenSeq, now) {', 'function xlPushSeenKey(s) {') +
  between('function xlIsCoHost(s, id) {', 'function xlToggleCoHost(') +
  between('function xlSegClockState(s, now) {', 'function xlBackstageInner(') +
  between('function xlNorm(c) {', 'function nativeSessionsForMe() {');
const scope = between('function pflxSessionInCohortScope(session, managedCohorts) {', 'window.pflxSessionInCohortScope');
const role = between('function pflxSyncScreenForRoleChange(', 'window.pflxSyncScreenForRoleChange');
const ctx = { window: {}, L: { me: null } };
vm.createContext(ctx);
vm.runInContext(types + merge + mod + scope + role + '\nthis.api = { mergeSession, xlStrictMode, xlSegSeconds, xlSegmentEndsAt, xlRunOfShow, xlClock, xlSegmentMark, xlShouldPull, xlIsCoHost, xlSegClockState, xlCohortsOf, xlSessionForCohorts, pflxSessionInCohortScope, pflxSyncScreenForRoleChange };', ctx);
const A = ctx.api;
check('strict mode: default is lock + alert; auto/manual kept', A.xlStrictMode({}) === 'alert' && A.xlStrictMode({ strictTimer: 'auto' }) === 'auto' && A.xlStrictMode({ strictTimer: 'manual' }) === 'manual' && A.xlStrictMode({ strictTimer: 'x' }) === 'alert');
check('segment: timed types use their time limit', A.xlSegSeconds({ type: 'mc', seconds: 20 }) === 20);
check('segment: text slides ignore the legacy seconds field', A.xlSegSeconds({ type: 'text', seconds: 30 }) === 0);
check('segment: duration wins for any type', A.xlSegSeconds({ type: 'text', duration: 90 }) === 90 && A.xlSegSeconds({ type: 'mc', seconds: 20, duration: 45 }) === 45);
const S = (o) => Object.assign({ id: 'S', status: 'active', currentSlideIndex: 0, hostControls: {}, liveStartedAt: 1,
  slides: [{ id: 'a', type: 'mc', seconds: 60 }, { id: 'b', type: 'text', duration: 120 }, { id: 'c', type: 'text' }] }, o);
check('endsAt: slide-bound running clock', A.xlSegmentEndsAt(S({ showTimer: { slideId: 'a', startedAt: 1000, seconds: 60 } })) === 61000);
check('endsAt: stopped clock = open-ended', A.xlSegmentEndsAt(S({ showTimer: { slideId: 'a', startedAt: 1000, seconds: 60, stoppedAt: 5000 } })) === null);
check('endsAt: clock for another slide is ignored', A.xlSegmentEndsAt(S({ showTimer: { slideId: 'b', startedAt: 1000, seconds: 60 } })) === null);
check('endsAt: X-Rush uses its own clock', A.xlSegmentEndsAt(S({ slides: [{ id: 'r', type: 'quiz_race', seconds: 10, startedAt: 500 }] })) === 10500);
// run of show
let s = S({ segmentLog: { a: { startedAt: 0, endedAt: 70000, spentMs: 70000 }, b: { startedAt: 70000, endedAt: null, spentMs: 0 } }, currentSlideIndex: 1 });
let r = A.xlRunOfShow(s, 100000);
check('ros: planned starts are cumulative', r.rows[0].plannedStartMs === 0 && r.rows[1].plannedStartMs === 60000 && r.rows[2].plannedStartMs === 180000);
check('ros: total planned', r.totalPlannedMs === 180000);
check('ros: states done/live/next', r.rows.map(x => x.state).join() === 'done,live,next');
check('ros: actual incl. the live segment', r.rows[0].spentMs === 70000 && r.rows[1].spentMs === 30000);
check('ros: over/under per segment', r.rows[0].deltaMs === 10000);
check('ros: pace = 10s behind', r.driftMs === 9999, r.driftMs);
r = A.xlRunOfShow(S({ segmentLog: { a: { startedAt: 0, endedAt: 30000, spentMs: 30000 }, b: { startedAt: 30000, spentMs: 0 } }, currentSlideIndex: 1 }), 40000);
check('ros: finishing a segment 30s early = 30s ahead', r.driftMs === -30001, r.driftMs);
check('clock format', A.xlClock(65000) === '1:05' && A.xlClock(-5000, true) === '−0:05' && A.xlClock(3725000) === '1:02:05' && A.xlClock(0, true) === '+0:00');
// segment log
s = S({ segmentLog: {}, hostControls: { hold: true } });
A.xlSegmentMark(s, -1, 0, 1000);
check('mark: start', s.segmentLog.a.startedAt === 1000 && s.segmentLog.a.spentMs === 0 && s.segmentLog.a.endedAt === null);
A.xlSegmentMark(s, 0, 1, 6000);
check('mark: move closes the old segment and opens the next', s.segmentLog.a.spentMs === 5000 && s.segmentLog.a.endedAt === 6000 && s.segmentLog.b.startedAt === 6000);
check('mark: moving releases HOLD', s.hostControls.hold === false);
A.xlSegmentMark(s, 1, 0, 9000); A.xlSegmentMark(s, 0, 1, 10000);
check('mark: revisits accumulate', s.segmentLog.a.spentMs === 6000 && s.segmentLog.b.spentMs === 3000);
// clock state
let c = A.xlSegClockState(S({ strictTimer: 'auto', showTimer: { slideId: 'a', startedAt: 1000, seconds: 60 } }), 21000);
check('clock: 40s left, auto', c.text === '0:40' && c.cls === 'ok' && /AUTO-ADVANCES/.test(c.sub), c);
c = A.xlSegClockState(S({ showTimer: { slideId: 'a', startedAt: 1000, seconds: 60 } }), 56000);
check('clock: last 10s hot', c.cls === 'hot');
c = A.xlSegClockState(S({ showTimer: { slideId: 'a', startedAt: 1000, seconds: 60 } }), 76000);
check('clock: over time counts up with +', c.cls === 'over' && c.text === '+0:15' && /OVER TIME/.test(c.sub), c);
c = A.xlSegClockState(S({ strictTimer: 'auto', hostControls: { hold: true }, showTimer: { slideId: 'a', startedAt: 1000, seconds: 60 } }), 76000);
check('clock: hold is shown', /HOLDING/.test(c.sub));
c = A.xlSegClockState(S({ currentSlideIndex: 2, segmentLog: { c: { startedAt: 1000 } } }), 31000);
check('clock: open segment counts elapsed', c.cls === 'open' && c.text === '0:30');
// push / pull
const P = (o) => Object.assign({ status: 'active', liveParticipants: [{ id: 'p1' }], push: { seq: 3, at: 100000 } }, o);
check('pull: joined player, new push', A.xlShouldPull(P(), 'p1', 2, 110000));
check('pull: already seen', !A.xlShouldPull(P(), 'p1', 3, 110000));
check('pull: not joined -> never pulled', !A.xlShouldPull(P(), 'p9', 0, 110000));
check('pull: stale push (>2 min) ignored', !A.xlShouldPull(P(), 'p1', 0, 100000 + 121000));
check('pull: ended session ignored', !A.xlShouldPull(P({ status: 'ended' }), 'p1', 0, 110000));
// merge: host-owned production fields + booth
const base = { id: 'S', updatedAt: 10, hostUpdatedAt: 10, slides: [], liveParticipants: [], awardedTo: [] };
const host = Object.assign({}, base, { updatedAt: 20, hostUpdatedAt: 20, push: { seq: 2 }, strictTimer: 'auto', segmentLog: { a: { spentMs: 5 } }, hostsSeen: { h1: 20 }, screenShare: { active: true } });
const stalePlayer = Object.assign({}, base, { updatedAt: 30, push: { seq: 1 }, liveParticipants: [{ id: 'p1', joinedAt: 30 }], hostsSeen: { h2: 5 } });
const m = A.mergeSession(stalePlayer, host);
check('merge: a player save never rolls back push/strict/segments/share', m.push.seq === 2 && m.strictTimer === 'auto' && m.segmentLog.a.spentMs === 5 && m.screenShare.active === true);
check('merge: join still lands', m.liveParticipants.length === 1);
check('merge: booth presence unions', m.hostsSeen.h1 === 20 && m.hostsSeen.h2 === 5);
// cohorts
check('cohorts: case-insensitive + comma split', JSON.stringify(A.xlCohortsOf({ cohort: 'Falcon Studios , Class B', cohorts: ['class b', 'X'] })) === '["falcon studios","class b","x"]');
check('match: player in one of the session cohorts', A.xlSessionForCohorts({ status: 'active', cohorts: ['FALCON STUDIOS'] }, ['falcon studios']));
check('match: other cohort -> no', !A.xlSessionForCohorts({ status: 'active', cohorts: ['Core 1'] }, ['falcon studios']));
check('match: all-cohort session applies', A.xlSessionForCohorts({ status: 'active', allCohorts: true, cohorts: ['Core 1'] }, []));
check('match: inactive never applies', !A.xlSessionForCohorts({ status: 'scheduled', allCohorts: true }, []));
// co-hosts
const sess = { cohorts: ['Core 1'], coHosts: [{ id: 'h2', name: 'Two' }] };
check('co-host listed', A.xlIsCoHost(sess, 'h2') && !A.xlIsCoHost(sess, 'h3'));
ctx.L.me = { id: 'h2' };
check('scope: a co-host reaches the show outside their cohorts', A.pflxSessionInCohortScope(sess, ['Other']));
ctx.L.me = { id: 'h3' };
check('scope: others still need a cohort match', !A.pflxSessionInCohortScope(sess, ['Other']) && A.pflxSessionInCohortScope(sess, ['core 1']));
check('role toggle from Backstage lands on the live screen', A.pflxSyncScreenForRoleChange(false, 'backstage', true) === 'livenative' && A.pflxSyncScreenForRoleChange(false, 'backstage', false) === 'me');
// structure
check('screen share slide type added', /key: 'screenshare', label: 'Screen Share'/.test(src) && /'text', 'media', 'screenshare'/.test(src));
check('new sessions default to auto-advance', /strictTimer: 'auto', coHosts: \[\], shareProvider: 'p2p'/.test(src));
check('GO LIVE opens Backstage', /L\.screen = 'backstage'; \/\/ PATCH X-LIVE v0\.37/.test(src));
check('stage display + PiP routes', /if \(L\.stageMode\) \{/.test(src) && /if \(L\.pipMode && L\.cfg\)/.test(src));
check('stage display is silent', /function xlFxSync\(\) \{\n  if \(L\.stageMode\) return;/.test(src));
check('player sees every applicable session', /return nativeSessionsForMe\(\)\[0\] \|\| null;/.test(src));
check('segment clock uses segment length', /seconds: segSec, startedAt: now/.test(src));
check('P2P signalling over a broadcast channel', /xlive-share-/.test(src) && /viewer-hello/.test(src) && /RTCPeerConnection/.test(src));
check('LiveKit provider needs host config', /function xlLiveKitCfg\(\)/.test(src) && /livekit-client@2/.test(src));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
