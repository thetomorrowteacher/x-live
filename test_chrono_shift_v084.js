// PATCH X-LIVE v0.84 -- Chrono Shift wiring, unit tests.
// Extracts the REAL shipped functions from index.html via brace-counting
// (never a reimplementation) and tests them against realistic fixtures.
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractFunction(src, name) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('not found: ' + name);
  let i = src.indexOf('{', start);
  let depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('unterminated: ' + name);
  return src.slice(start, end);
}

function extractVar(src, name) {
  const re = new RegExp('var\\s+' + name + '\\s*=\\s*([^;]+);');
  const m = src.match(re);
  if (!m) throw new Error('var not found: ' + name);
  return m[1].trim();
}

// Pull the real source text for each piece under test.
const chronoBonusSrc = extractVar(SRC, 'PFLX_XMOD_CHRONO_BONUS_SECONDS'); // "120"
const applyChronoSrc = extractFunction(SRC, 'pflxXModApplyChronoShift');
const timerInfoSrc = extractFunction(SRC, 'xlTimerInfo');

// Also pull the mergeSession showTimer-merge block (the last-write-wins
// block itself), extracted as a standalone function so we can round-trip
// test it without needing the entire mergeSession (which depends on many
// other fields/helpers not relevant here). We re-derive the exact logic
// from the matched line, asserting the source text found matches what we
// expect before using it -- this keeps the test honest (it fails loudly
// if mergeSession's showTimer logic ever changes shape) rather than
// silently testing a stale copy.
const mergeSessionSrc = extractFunction(SRC, 'mergeSession');
const showTimerLineMatch = mergeSessionSrc.match(/merged\.showTimer = \(!lt \? it : \(!it \? lt : \(\(it\.updatedAt \|\| 0\) > \(lt\.updatedAt \|\| 0\) \? it : lt\)\)\) \|\| null;/);
if (!showTimerLineMatch) throw new Error('mergeSession showTimer merge line not found/changed shape -- update this test');

// Build a sandboxed module exposing xlTimerInfo + pflxXModApplyChronoShift,
// using the REAL extracted source.
const sandboxSrc = `
var PFLX_XMOD_CHRONO_BONUS_SECONDS = ${chronoBonusSrc};
${timerInfoSrc}
${applyChronoSrc}
module.exports = { xlTimerInfo, pflxXModApplyChronoShift, PFLX_XMOD_CHRONO_BONUS_SECONDS: PFLX_XMOD_CHRONO_BONUS_SECONDS };
`;
const Module = require('module');
const m = new Module('sandbox', null);
m.filename = path.join(__dirname, 'sandbox.js');
m.paths = Module._nodeModulePaths(__dirname);
m._compile(sandboxSrc, m.filename);
const { xlTimerInfo, pflxXModApplyChronoShift, PFLX_XMOD_CHRONO_BONUS_SECONDS } = m.exports;

// Mini merge-showTimer function, derived from the verified real line above,
// so the round-trip test proves the shipped merge logic (not a guess).
function mergeShowTimer(lt, it) {
  return (!lt ? it : (!it ? lt : ((it.updatedAt || 0) > (lt.updatedAt || 0) ? it : lt))) || null;
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}

// ---- Case group 1: bonus constant sane ----
check('bonus seconds is a positive number', typeof PFLX_XMOD_CHRONO_BONUS_SECONDS === 'number' && PFLX_XMOD_CHRONO_BONUS_SECONDS > 0);
check('bonus seconds is 120 (documented spec)', PFLX_XMOD_CHRONO_BONUS_SECONDS === 120);

// ---- Case group 2: extend-while-running ----
{
  const now = 1000000;
  const sl = { id: 'slide1', title: 'Project Work' };
  const s = { showTimer: { id: 't1', seconds: 60, startedAt: now - 10000, stoppedAt: null, slideId: 'slide1', label: 'Project Work', updatedAt: now - 10000 } };
  const before = s.showTimer.seconds;
  const result = pflxXModApplyChronoShift(s, sl, now);
  check('extend: mode is extended', result && result.mode === 'extended');
  check('extend: seconds increased by bonus', s.showTimer.seconds === before + PFLX_XMOD_CHRONO_BONUS_SECONDS);
  check('extend: same timer id (not replaced)', s.showTimer.id === 't1');
  check('extend: updatedAt bumped', s.showTimer.updatedAt === now);
  check('extend: startedAt unchanged', s.showTimer.startedAt === now - 10000);
}

// ---- Case group 3: start-fresh (never started) ----
{
  const now = 2000000;
  const sl = { id: 'slide2', title: 'Social Sprint' };
  const s = {}; // no showTimer at all
  const result = pflxXModApplyChronoShift(s, sl, now);
  check('fresh/never-started: mode is started', result && result.mode === 'started');
  check('fresh/never-started: seconds == bonus', s.showTimer.seconds === PFLX_XMOD_CHRONO_BONUS_SECONDS);
  check('fresh/never-started: bound to purchasing slide', s.showTimer.slideId === 'slide2');
  check('fresh/never-started: startedAt == now', s.showTimer.startedAt === now);
  check('fresh/never-started: label from slide title', s.showTimer.label === 'Social Sprint');
}

// ---- Case group 4: start-fresh (stopped timer bound to this slide) ----
{
  const now = 3000000;
  const sl = { id: 'slide3', title: 'Timer' };
  const s = { showTimer: { id: 'tOld', seconds: 30, startedAt: now - 50000, stoppedAt: now - 20000, slideId: 'slide3', label: 'Timer', updatedAt: now - 20000 } };
  const result = pflxXModApplyChronoShift(s, sl, now);
  check('stopped: mode is started (not extended)', result && result.mode === 'started');
  check('stopped: fresh timer gets a NEW id', s.showTimer.id !== 'tOld');
  check('stopped: seconds reset to just the bonus', s.showTimer.seconds === PFLX_XMOD_CHRONO_BONUS_SECONDS);
  check('stopped: stoppedAt cleared on the new timer', s.showTimer.stoppedAt === null);
}

// ---- Case group 5: start-fresh (naturally expired timer bound to this slide) ----
{
  const now = 4000000;
  const sl = { id: 'slide4', title: 'Project Work' };
  // A timer that ran out naturally (no stoppedAt, but remaining <= 0).
  const s = { showTimer: { id: 'tExpired', seconds: 10, startedAt: now - 20000, stoppedAt: null, slideId: 'slide4', label: 'Project Work', updatedAt: now - 20000 } };
  // Sanity: xlTimerInfo should say this is expired, not running.
  const info = xlTimerInfo(s.showTimer, now);
  check('expired fixture is actually expired per xlTimerInfo', info.expired === true && info.running === false);
  const result = pflxXModApplyChronoShift(s, sl, now);
  check('expired: mode is started (not extended)', result && result.mode === 'started');
  check('expired: seconds reset to just the bonus', s.showTimer.seconds === PFLX_XMOD_CHRONO_BONUS_SECONDS);
}

// ---- Case group 6: timer running but bound to a DIFFERENT slide ----
{
  const now = 5000000;
  const sl = { id: 'slideB', title: 'Social Sprint' };
  const s = { showTimer: { id: 'tOtherSlide', seconds: 90, startedAt: now - 5000, stoppedAt: null, slideId: 'slideA', label: 'Project Work', updatedAt: now - 5000 } };
  const result = pflxXModApplyChronoShift(s, sl, now);
  check('other-slide: mode is started, not extended (different slideId)', result && result.mode === 'started');
  check('other-slide: new timer is bound to the purchasing slide', s.showTimer.slideId === 'slideB');
  check('other-slide: the old running timer object is replaced wholesale', s.showTimer.id !== 'tOtherSlide');
}

// ---- Case group 7: binding correctly recoverable via result.event.slideId ----
// (mirrors pflxXModTrigger's real behavior: event.slideId = currentSlide.id,
// which liveTriggerXModUi uses to find slForTimer -- confirm the function's
// own contract: it only extends when t.slideId === sl.id passed in.)
{
  const now = 6000000;
  const slPurchased = { id: 'slideX' };
  const sRunningOnSameSlide = { showTimer: { id: 'tX', seconds: 40, startedAt: now - 1000, stoppedAt: null, slideId: 'slideX', updatedAt: now - 1000 } };
  const r1 = pflxXModApplyChronoShift(sRunningOnSameSlide, slPurchased, now);
  check('binding: extends when slideId matches the purchase slide exactly', r1.mode === 'extended');
}

// ---- Case group 8: pure function safety (no s/sl) ----
{
  check('null s returns null, no throw', pflxXModApplyChronoShift(null, { id: 'x' }, 1) === null);
  check('null sl returns null, no throw', pflxXModApplyChronoShift({}, null, 1) === null);
  check('defaults now via Date.now() when omitted', (function () {
    const s = {};
    const r = pflxXModApplyChronoShift(s, { id: 'y' }, undefined);
    return r && r.mode === 'started' && typeof s.showTimer.startedAt === 'number' && s.showTimer.startedAt > 0;
  })());
}

// ---- Case group 9: mergeSession round-trip -- the extension survives the
// existing showTimer last-write-wins merge block unchanged ----
{
  const now = 7000000;
  // Local client has an older showTimer (pre-Chrono-Shift).
  const local = { id: 'tY', seconds: 60, startedAt: now - 10000, stoppedAt: null, slideId: 'slideZ', label: 'Timer', updatedAt: now - 10000 };
  // Simulate a player's client applying Chrono Shift and producing a NEWER showTimer.
  const sIncoming = { showTimer: JSON.parse(JSON.stringify(local)) };
  pflxXModApplyChronoShift(sIncoming, { id: 'slideZ' }, now);
  const incoming = sIncoming.showTimer;
  check('incoming (post-chrono-shift) has newer updatedAt', incoming.updatedAt > local.updatedAt);
  check('incoming (post-chrono-shift) has more seconds', incoming.seconds > local.seconds);

  const mergedForward = mergeShowTimer(local, incoming);
  check('merge: newer (chrono-shifted) timer wins over stale local', mergedForward === incoming);
  check('merge: merged seconds reflect the extension', mergedForward.seconds === local.seconds + PFLX_XMOD_CHRONO_BONUS_SECONDS);

  // Reverse direction: local already has the chrono-shift, incoming is stale --
  // merge must NOT clobber the extension with the older copy.
  const mergedReverse = mergeShowTimer(incoming, local);
  check('merge: stale incoming never clobbers a newer chrono-shifted local', mergedReverse === incoming);

  // Null-local case (first-ever timer on this session from a fresh client).
  const mergedFromNull = mergeShowTimer(null, incoming);
  check('merge: null local + incoming -> incoming', mergedFromNull === incoming);
  // Null-incoming case.
  const mergedToNull = mergeShowTimer(incoming, null);
  check('merge: incoming null + local -> local (fallback || null not triggered since local truthy)', mergedToNull === incoming);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
