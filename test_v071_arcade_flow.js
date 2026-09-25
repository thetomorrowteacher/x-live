// PATCH X-LIVE v0.71 -- Evo Clash arcade-flow: auto-tutorial popup after
// the title, a dim/screen-view theater overlay with a warp starfield behind
// the fight, a GAME OVER -> YOU WIN/YOU LOSE title sequence, and a 10s
// arcade-style auto-continue popup.
//
// Extracts the REAL shipped functions (brace/marker matching, same
// technique as test_v069_battle_fx.js) and runs/asserts against them --
// never a reimplementation. Run: node test_v071_arcade_flow.js index.html'
'use strict';
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.log('FAIL:', label); } }

function extractFn(name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx === -1) throw new Error('not found: function ' + name);
  const braceStart = src.indexOf('{', idx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}
function extractWindowFn(name) {
  const marker = 'window.' + name + ' = function';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('not found: ' + marker);
  const braceStart = src.indexOf('{', idx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}

// ---- 1. THE CRITICAL SCOPE-REACHABILITY FIX ----
// xlBattleTheaterSync must be a real global (window.xlBattleTheaterSync),
// not a plain top-level `function xlBattleTheaterSync(){}` local to the
// Archive Battle module's own wrapping IIFE -- otherwise xlAfterRender()
// (a different <script> block entirely) can never see it, and theater
// mode would silently never activate (typeof check just reads 'undefined').
ok(src.indexOf('window.xlBattleTheaterSync = function () {') !== -1,
  'xlBattleTheaterSync is exposed as a real global (window.xlBattleTheaterSync), reachable from xlAfterRender() in a different <script> block');
ok(src.indexOf('function xlBattleTheaterSync() {') === -1,
  'the old scope-broken plain-local declaration is gone -- only the window.-prefixed version remains');

const theaterSyncSrc = extractWindowFn('xlBattleTheaterSync');
ok(theaterSyncSrc.indexOf("document.getElementById('evb-theater')") !== -1, 'xlBattleTheaterSync looks up the real #evb-theater overlay element');
ok(theaterSyncSrc.indexOf('xlBattleTheaterActive()') !== -1, 'xlBattleTheaterSync gates on the real xlBattleTheaterActive()');
ok(theaterSyncSrc.indexOf("el.classList.toggle('on', active)") !== -1, 'xlBattleTheaterSync toggles the .on class that drives the dim overlay (#evb-theater.on{display:flex})');
ok(theaterSyncSrc.indexOf("box.innerHTML = (typeof xlBattleHTML === 'function') ? xlBattleHTML() : ''") !== -1, 'xlBattleTheaterSync mirrors the real xlBattleHTML() output into the theater box');

// ---- 2. xlAfterRender wiring ----
const afterRenderSrc = extractFn('xlAfterRender');
ok(afterRenderSrc.indexOf("if (typeof xlBattleTheaterSync === 'function') xlBattleTheaterSync();") !== -1,
  'xlAfterRender() calls xlBattleTheaterSync() on every render, guarded by a safe typeof check');
ok(/try \{ if \(typeof xlBattleTheaterSync === 'function'\) xlBattleTheaterSync\(\); \} catch \(e\) \{\}/.test(afterRenderSrc),
  'the call is wrapped in its own try/catch so a theater-sync failure can never break the rest of xlAfterRender()');

// ---- 3. xlBattleTheaterActive / xlBattleTheaterExit ----
const activeSrc = extractWindowFn('xlBattleTheaterActive');
ok(activeSrc.indexOf('return !!(xlBattleIntro || B || sparView);') !== -1, 'xlBattleTheaterActive() is true whenever an intro, a live fight, or a live spar is in flight');
const exitSrc = extractWindowFn('xlBattleTheaterExit');
ok(exitSrc.indexOf('B = null; sparView = null;') !== -1, 'xlBattleTheaterExit() clears both B and sparView');
ok(exitSrc.indexOf('if (sparPoll) { clearInterval(sparPoll); sparPoll = null; }') !== -1, 'xlBattleTheaterExit() also tears down a live spar poll interval, not just the state flags');

// ---- 4. widened click delegation (theater mirror must be clickable) ----
ok(src.indexOf("closest('#evb-battle [data-ab], #evb-theater-box [data-ab]')") !== -1,
  'the delegated ability-button click handler now also matches buttons inside the theater mirror (#evb-theater-box), not just the embedded pane');

// ---- 5. xlBattleStartSequence / xlBattleSkipIntro ----
const startSeqSrc = extractWindowFn('xlBattleStartSequence');
ok(startSeqSrc.indexOf('if (xlBattleIntroTimer) { clearTimeout(xlBattleIntroTimer); xlBattleIntroTimer = null; }') !== -1, 'xlBattleStartSequence() clears any pending intro timer first (no stale double-fire)');
ok(startSeqSrc.indexOf('if (xlBattleTutorialTimer) { clearTimeout(xlBattleTutorialTimer); xlBattleTutorialTimer = null; }') !== -1, 'xlBattleStartSequence() also clears any pending tutorial timer first');
ok(startSeqSrc.indexOf("xlBattleIntro = mode || 'fight';") !== -1, 'xlBattleStartSequence() defaults to fight mode when none is given');
ok(startSeqSrc.indexOf('window.PflxFx.slam(lab.title, { sub: lab.sub, tint: lab.tint });') !== -1, 'xlBattleStartSequence() shows the real title card via the real PflxFx.slam()');
ok(startSeqSrc.indexOf('render();') !== -1, 'xlBattleStartSequence() re-renders so the theater overlay picks up the new xlBattleIntro state');
ok(startSeqSrc.indexOf('xlBattleIntroTimer = setTimeout(function () { xlBattleShowAutoTutorial(); }, 1600);') !== -1,
  'xlBattleStartSequence() auto-opens the how-to-play tutorial 1.6s after the title card ("popup after the title")');

const skipIntroSrc = extractWindowFn('xlBattleSkipIntro');
ok(skipIntroSrc.indexOf('clearTimeout(xlBattleIntroTimer)') !== -1 && skipIntroSrc.indexOf('clearTimeout(xlBattleTutorialTimer)') !== -1, 'xlBattleSkipIntro() clears both timers');
ok(skipIntroSrc.indexOf('modalClose();') !== -1 && skipIntroSrc.indexOf('xlBattleAdvanceIntro();') !== -1, 'xlBattleSkipIntro() closes any open modal and advances straight to the fight');

// ---- 6. xlBattleShowAutoTutorial / xlBattleTutorialAdvance / xlBattleTutorial ----
const autoTutSrc = extractWindowFn('xlBattleShowAutoTutorial');
ok(autoTutSrc.indexOf("modal(xlBattleTutorialHtml('xlBattleTutorialAdvance()', 'START ▶'));") !== -1,
  'xlBattleShowAutoTutorial() opens the SAME shared tutorial builder, wired to auto-advance on confirm, labeled START');
ok(autoTutSrc.indexOf('xlBattleTutorialTimer = setTimeout(function () { xlBattleTutorialAdvance(); }, 13000);') !== -1,
  'xlBattleShowAutoTutorial() auto-advances after 13s -- the middle of Ennis\'s requested 10-15s range');

const tutAdvSrc = extractWindowFn('xlBattleTutorialAdvance');
ok(tutAdvSrc.indexOf('clearTimeout(xlBattleTutorialTimer)') !== -1, 'xlBattleTutorialAdvance() clears the auto-advance timer (whether it fired itself or a manual click beat it)');
ok(tutAdvSrc.indexOf('modalClose();') !== -1 && tutAdvSrc.indexOf('xlBattleAdvanceIntro();') !== -1, 'xlBattleTutorialAdvance() closes the modal and advances into the actual fight');

const tutHtmlSrc = extractFn('xlBattleTutorialHtml');
ok(tutHtmlSrc.indexOf('function xlBattleTutorialHtml(confirmOnclick, confirmLabel) {') !== -1, 'xlBattleTutorialHtml() is a shared, parameterized builder (confirm handler + label), not two copy-pasted modals');
ok(tutHtmlSrc.indexOf('HOW TO PLAY') !== -1, 'the tutorial content is real how-to-play instructions');
ok(tutHtmlSrc.indexOf("onclick=\"' + confirmOnclick + '\"") !== -1 && tutHtmlSrc.indexOf("' + confirmLabel + '") !== -1, 'the confirm button wires the caller-supplied onclick + label, not a hardcoded one');

const tutorialManualSrc = extractWindowFn('xlBattleTutorial');
ok(tutorialManualSrc.indexOf("xlBattleTutorialHtml('modalClose()', 'GOT IT')") !== -1, 'the pre-existing manual (?) button reuses the SAME xlBattleTutorialHtml builder, just with a plain-close confirm action -- confirms the auto and manual paths never drift apart');

// ---- 7. xlBattleContinueHtml / xlBattleArcadeCountdown ----
const continueHtmlSrc = extractFn('xlBattleContinueHtml');
ok(continueHtmlSrc.indexOf('evb-continue-countdown') !== -1, 'xlBattleContinueHtml() renders the countdown span the ticker below will update');
ok(continueHtmlSrc.indexOf('>10<') !== -1, 'the countdown starts its displayed text at 10');

const arcadeCountdownSrc = extractFn('xlBattleArcadeCountdown');
ok(arcadeCountdownSrc.indexOf('var ref = B, secs = 10;') !== -1, 'xlBattleArcadeCountdown() captures the battle reference and starts the real counter at 10 seconds');
ok(arcadeCountdownSrc.indexOf('if (B !== ref || !B || !B.over) return;') !== -1, 'each tick is guarded against a stale/replaced/cleared battle object (the flashOff() async-safety idiom), so a fresh fight or an EVO BAY exit can never leave a stray timer ticking');
ok(arcadeCountdownSrc.indexOf("document.querySelector('#evb-theater #evb-continue-countdown')") !== -1, 'the ticker also updates the mirrored countdown node inside the theater overlay, not just the embedded pane');
ok(arcadeCountdownSrc.indexOf("if (secs <= 0) { xlBattleStartSequence('fight'); return; }") !== -1, 'at zero the countdown auto-continues by calling the SAME xlBattleStartSequence(\'fight\') the gold button already calls -- consistent default action');
ok(arcadeCountdownSrc.indexOf('secs--; setTimeout(tick, 1000);') !== -1, 'the countdown decrements once per real second');

// Behavioral run of the countdown against a tiny fake DOM + fake timers,
// proving the tick loop actually reaches zero and calls xlBattleStartSequence.
(function () {
  const calls = [];
  const fakeEls = {};
  function makeEl(id) { const e = { id, _text: '', set textContent(v) { this._text = v; }, get textContent() { return this._text; } }; fakeEls[id] = e; return e; }
  makeEl('evb-continue-countdown'); makeEl('evb-theater-continue-countdown');
  const fakeDocument = {
    getElementById: function (id) { return fakeEls[id] || null; },
    querySelector: function (sel) { return sel.indexOf('#evb-theater') !== -1 ? fakeEls['evb-continue-countdown'] : null; }
  };
  const timers = [];
  const fakeSetTimeout = function (fn, ms) { timers.push({ fn, ms }); return timers.length; };
  const B = { over: true };
  const sandboxSrc = arcadeCountdownSrc + '\nreturn xlBattleArcadeCountdown;';
  const factory = new Function('document', 'setTimeout', 'B', 'xlBattleStartSequence', sandboxSrc);
  let startSequenceCalls = 0;
  const fn = factory(fakeDocument, fakeSetTimeout, B, function (mode) { startSequenceCalls++; calls.push(mode); });
  fn();
  // drain the queued ticks manually (simulating 10 real seconds passing)
  let guard = 0;
  while (timers.length && guard++ < 20) { const t = timers.shift(); t.fn(); }
  ok(startSequenceCalls === 1, 'the countdown reaches zero and calls xlBattleStartSequence exactly once');
  ok(calls[0] === 'fight', 'the auto-continue call restarts a normal fight, not some other mode');
})();

(function () {
  // A stale/replaced battle object must stop the loop dead, never call
  // through. B is a variable in the enclosing module scope in the real
  // file (not a function parameter), so the extracted function's closure
  // reads whatever B currently IS at tick time. Reproduce that with a
  // real mutable outer binding (same technique as the game-over test
  // below) rather than a Function-param snapshot, which would freeze B's
  // value at the moment the sandbox factory was invoked and could never
  // observe a later reassignment -- exactly the bug this rewrite fixes.
  const fakeEls = {};
  function makeEl(id) { const e = { id, _text: '' }; fakeEls[id] = e; return e; }
  makeEl('evb-continue-countdown');
  const fakeDocument = { getElementById: function (id) { return fakeEls[id] || null; }, querySelector: function () { return null; } };
  const timers = [];
  const fakeSetTimeout = function (fn) { timers.push(fn); return timers.length; };
  let calls = 0;
  const wrapperSrc =
    'var B = { over: true };\n' +
    arcadeCountdownSrc + '\n' +
    'function run(){ xlBattleArcadeCountdown(); }\n' +
    'function clearB(){ B = null; }\n' +
    'return { run: run, clearB: clearB };';
  const factory = new Function('document', 'setTimeout', 'xlBattleStartSequence', wrapperSrc);
  const api = factory(fakeDocument, fakeSetTimeout, function () { calls++; });
  api.run();
  api.clearB(); // battle exited mid-countdown (e.g. EVO BAY click), before the first tick's own setTimeout fires
  let guard = 0;
  while (timers.length && guard++ < 20) { const t = timers.shift(); t(); }
  ok(calls === 0, 'if the battle object is cleared mid-countdown (stale ref), the loop stops and never auto-continues into a dead battle');
})();

// ---- 8. xlBattleGameOverSequence ----
const gameOverSrc = extractFn('xlBattleGameOverSequence');
ok(gameOverSrc.indexOf('function xlBattleGameOverSequence(win) {') !== -1, 'xlBattleGameOverSequence() takes the real win/lose outcome');
ok(gameOverSrc.indexOf('var ref = B;') !== -1, 'xlBattleGameOverSequence() also captures a stale-battle guard reference');
ok(gameOverSrc.indexOf("slam('GAME OVER', { sub: win ? 'VICTORY' : 'DEFEAT', tint: win ? 'win' : 'fail' });") !== -1, 'the first beat is a real GAME OVER title with a correct VICTORY/DEFEAT subtitle and win/fail tint');
ok(gameOverSrc.indexOf("slam(win ? 'YOU WIN' : 'YOU LOSE', { sub: win ? 'ARCHIVE DOWN' : 'EVO DOWN', tint: win ? 'win' : 'fail', shake: true });") !== -1,
  'the second beat is the real YOU WIN/YOU LOSE title with a correct sub/tint, and shakes the screen');
ok(/setTimeout\(function \(\) \{ slam\('GAME OVER'/.test(gameOverSrc), 'the GAME OVER beat fires on a stagger (setTimeout), not instantly');
const t1 = gameOverSrc.match(/slam\('GAME OVER'.*?\}, (\d+)\);/s);
const t2 = gameOverSrc.match(/slam\(win \? 'YOU WIN'.*?\}, (\d+)\);/s);
ok(t1 && t2 && Number(t1[1]) < Number(t2[1]), 'GAME OVER fires strictly before YOU WIN/YOU LOSE (a real sequenced two-beat announcement, not simultaneous)');

// Behavioral run: confirms the stale-ref guard actually suppresses a slam
// call if B is swapped out between the two staggered beats (e.g. player
// immediately started a new fight before the second beat's timer fired).
(function () {
  const timers = [];
  const fakeSetTimeout = function (fn, ms) { timers.push({ fn, ms }); return timers.length; };
  let B = { id: 'battle-1' };
  const slamCalls = [];
  const fakeWindow = { PflxFx: { slam: function (text, opts) { slamCalls.push({ text, opts }); } } };
  const sandboxSrc = gameOverSrc + '\nreturn xlBattleGameOverSequence;';
  const factory = new Function('setTimeout', 'B', 'window', sandboxSrc);
  const fn = factory(fakeSetTimeout, B, fakeWindow);
  fn(true);
  ok(timers.length === 2, 'xlBattleGameOverSequence schedules exactly two staggered beats');
  timers[0].fn(); // GAME OVER fires while B is still the same battle
  ok(slamCalls.length === 1 && slamCalls[0].text === 'GAME OVER', 'the first beat fires normally while the battle ref is unchanged');
  B = null; // battle cleared before the second beat's timer elapses
  // NOTE: the closure's `ref` still points at the original object; re-run
  // with a fresh factory call sharing the same outer B variable to prove
  // the guard reads the CURRENT B, not a frozen snapshot -- see below.
})();

(function () {
  // Proper mutable-B guard test: B is a variable in the enclosing module
  // scope in the real file (not a param), so the extracted function reads
  // whatever `B` currently is at call time via closure. Reproduce that here
  // with a real mutable outer binding instead of a Function-param snapshot.
  const timers = [];
  const fakeSetTimeout = function (fn) { timers.push(fn); return timers.length; };
  const slamCalls = [];
  const fakeWindow = { PflxFx: { slam: function (text, opts) { slamCalls.push({ text, opts }); } } };
  const wrapperSrc =
    'var B = { id: "battle-1" };\n' +
    gameOverSrc + '\n' +
    'function run(win){ xlBattleGameOverSequence(win); }\n' +
    'function clearB(){ B = null; }\n' +
    'return { run: run, clearB: clearB, fireAll: function(){ while(timers.length){ timers.shift()(); } } };';
  const factory = new Function('setTimeout', 'window', 'timers', wrapperSrc);
  const api = factory(fakeSetTimeout, fakeWindow, timers);
  api.run(false);
  ok(timers.length === 2, 'two beats scheduled for a loss sequence too');
  timers.shift()(); // GAME OVER beat
  ok(slamCalls.length === 1 && slamCalls[0].opts.sub === 'DEFEAT', 'a loss shows DEFEAT as the GAME OVER subtitle');
  api.clearB(); // battle object cleared before the second beat fires
  timers.shift()(); // YOU LOSE beat, but B is now null/replaced
  ok(slamCalls.length === 1, 'the second beat is suppressed once the battle it belongs to has been cleared -- no YOU WIN/YOU LOSE slam lands against a dead/replaced battle');
})();

// ---- 9. finish() wiring: continue-countdown HTML + theater-aware EVO BAY buttons ----
const finishSrc = extractFn('finish');
ok(finishSrc.indexOf('xlBattleGameOverSequence(win);') !== -1, 'finish() triggers the GAME OVER -> YOU WIN/YOU LOSE sequence on every real match end');
ok(finishSrc.indexOf("xlBattleContinueHtml(true)") !== -1, 'the win branch\'s result HTML includes the continue-countdown widget');
ok(finishSrc.indexOf("xlBattleContinueHtml(false)") !== -1, 'the lose branch\'s result HTML also includes the continue-countdown widget');
ok((finishSrc.match(/onclick="xlBattleTheaterExit\(\);xlHubGo\(1\)"/g) || []).length === 2, 'BOTH the win and lose EVO BAY buttons now exit theater mode before navigating home, so a player leaving via EVO BAY does not get stuck in the dimmed overlay');
ok(finishSrc.indexOf('onclick="xlHubGo(1)"') === -1, 'no EVO BAY button still uses the old theater-unaware onclick');
ok(/render\(\);\s*xlBattleArcadeCountdown\(\);\s*\}/.test(finishSrc), 'finish() renders the result screen and then starts the real 10s arcade countdown, in that order');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
