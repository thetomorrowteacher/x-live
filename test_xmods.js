// Unit test for X-Mods (PFLX_XMODS + pure validator/derived functions),
// built against the REAL shipped index.html via brace-counting extraction
// -- same technique every other test_v0*.js in this repo uses (never a
// reimplementation of the real code).
const fs = require('fs');
const vm = require('vm');

const SRC = fs.readFileSync(__dirname + '/index.html', 'utf8');

function extractFn(name) {
  const marker = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = marker.exec(SRC);
  if (!m) throw new Error('function not found: ' + name);
  let i = m.index;
  const start = i;
  // find first '{' after signature
  let brace = SRC.indexOf('{', i);
  let depth = 0, j = brace;
  for (; j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return SRC.slice(start, j);
}

function extractVar(name) {
  // extracts `var NAME = ... ;` for a single-line or object-literal var decl,
  // by brace/paren-balance scanning from the `=` to the terminating `;`.
  const marker = new RegExp('var\\s+' + name + '\\s*=');
  const m = marker.exec(SRC);
  if (!m) throw new Error('var not found: ' + name);
  let i = SRC.indexOf('=', m.index) + 1;
  let depth = 0, j = i;
  for (; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) break;
  }
  return 'var ' + name + ' =' + SRC.slice(i, j) + ';';
}

function extractMergeSessionXmodBlock() {
  // mergeSession is huge (reads L.cfg etc.) -- rather than extracting the
  // whole function (and all its external deps), extract just the raceEvents
  // + xmodEvents union block and test the union logic directly, which is
  // exactly what the patch touched.
  const startMarker = '// PATCH X-LIVE v0.31 -- raceEvents';
  const endMarker = '// PATCH X-LIVE v0.35 -- showTimer';
  const s = SRC.indexOf(startMarker);
  const e = SRC.indexOf(endMarker);
  if (s === -1 || e === -1) throw new Error('mergeSession xmod block markers not found');
  return SRC.slice(s, e);
}

const code = [
  extractVar('PFLX_POWERUPS'),
  extractFn('pflxRaceTeamMembers'),
  extractFn('pflxRaceNitroEarned'),
  extractFn('pflxRaceNitroSpent'),
  extractFn('pflxRaceNitroBalance'),
  extractFn('pflxRaceActiveEffects'),
  extractFn('pflxRaceScore'),
  extractFn('pflxRacePowerupBonus'),
  extractFn('pflxRaceTriggerPowerup'),
  extractFn('pflxSeededRand'),
  extractVar('PFLX_XMODS'),
  extractVar('PFLX_XMOD_DARK_TYPES'),
  extractVar('PFLX_XMOD_VAULT_GUARANTEED'),
  extractVar('PFLX_XMOD_VAULT_RISK_WIN'),
  extractVar('PFLX_XMOD_DAILY_LIMIT'),
  extractFn('pflxXModDayStr'),
  extractFn('pflxXModDailyCount'),
  extractFn('pflxXModUsableNow'),
  extractFn('pflxXModEliminatedOptions'),
  extractFn('pflxXModInterceptActive'),
  extractFn('pflxXModTrigger'),
].join('\n\n');

const sandbox = { console, L: { cfg: { teams: {} } } };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const {
  PFLX_XMODS, PFLX_XMOD_DARK_TYPES, PFLX_XMOD_VAULT_GUARANTEED, PFLX_XMOD_VAULT_RISK_WIN, PFLX_XMOD_DAILY_LIMIT,
  pflxXModDayStr, pflxXModDailyCount, pflxXModUsableNow, pflxXModEliminatedOptions, pflxXModInterceptActive,
  pflxXModTrigger, pflxRaceTriggerPowerup, pflxRacePowerupBonus, pflxRaceScore,
} = sandbox;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}
function eq(name, a, b) { ok(name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')', JSON.stringify(a) === JSON.stringify(b)); }

// ── Registry ─────────────────────────────────────────────────────────
ok('registry has exactly the 5 competitor mods', Object.keys(PFLX_XMODS).length === 5);
['cerebro_scan', 'vault_deal', 'chrono_shift', 'intercept', 'all_in'].forEach(function (k) {
  ok('registry has ' + k, !!PFLX_XMODS[k]);
});
Object.keys(PFLX_XMODS).forEach(function (k) {
  var m = PFLX_XMODS[k];
  ok(k + ' cost in [20,40]', m.cost >= 20 && m.cost <= 40);
  ok(k + ' role is competitor', m.role === 'competitor');
  ok(k + ' has worksIn array', Array.isArray(m.worksIn) && m.worksIn.length > 0);
});
ok('no audience mods shipped this patch', !PFLX_XMODS.signal_link && !PFLX_XMODS.hive_mind && !PFLX_XMODS.nexus_drop && !PFLX_XMODS.fan_surge && !PFLX_XMODS.overdrive);
eq('dark types list matches spec item 3', PFLX_XMOD_DARK_TYPES.slice().sort(), ['google_doc', 'google_slides', 'html_embed', 'mindful', 'screenshare'].sort());

// ── pflxXModDayStr ───────────────────────────────────────────────────
eq('dayStr format', pflxXModDayStr(new Date(2026, 9, 1, 14, 30).getTime()), '2026-10-01');
eq('dayStr same day, different time', pflxXModDayStr(new Date(2026, 9, 1, 0, 1).getTime()), pflxXModDayStr(new Date(2026, 9, 1, 23, 59).getTime()));

// ── pflxXModDailyCount (cross-session) ──────────────────────────────
(function () {
  var today = pflxXModDayStr(Date.now());
  var todayTs = Date.now();
  var yestTs = todayTs - 24 * 3600 * 1000 - 1000;
  var sessions = [
    { id: 's1', xmodEvents: [{ pid: 'p1', at: todayTs }, { pid: 'p1', at: todayTs }, { pid: 'p2', at: todayTs }] },
    { id: 's2', xmodEvents: [{ pid: 'p1', at: todayTs }, { pid: 'p1', at: yestTs }] },
  ];
  eq('daily count sums across sessions, same day only', pflxXModDailyCount(sessions, 'p1', today), 3);
  eq('daily count ignores other players', pflxXModDailyCount(sessions, 'p2', today), 1);
  eq('daily count 0 for a player with no events', pflxXModDailyCount(sessions, 'p9', today), 0);
  eq('daily count safe on empty/missing sessions list', pflxXModDailyCount([], 'p1', today), 0);
  eq('daily count safe on a session with no xmodEvents at all', pflxXModDailyCount([{ id: 's3' }], 'p1', today), 0);
})();

// ── pflxXModUsableNow ────────────────────────────────────────────────
(function () {
  var s = {};
  ok('cerebro_scan usable on unrevealed quiz_race', pflxXModUsableNow(PFLX_XMODS.cerebro_scan, s, { type: 'quiz_race', revealed: false }));
  ok('cerebro_scan NOT usable on revealed quiz_race', !pflxXModUsableNow(PFLX_XMODS.cerebro_scan, s, { type: 'quiz_race', revealed: true }));
  ok('cerebro_scan NOT usable on a poll', !pflxXModUsableNow(PFLX_XMODS.cerebro_scan, s, { type: 'poll', revealed: false }));
  ok('all_in NOT usable on revealed quiz_race', !pflxXModUsableNow(PFLX_XMODS.all_in, s, { type: 'quiz_race', revealed: true }));
  ok('intercept usable on quiz_race regardless of reveal (defensive purchase)', pflxXModUsableNow(PFLX_XMODS.intercept, s, { type: 'quiz_race', revealed: false }));
  ok('chrono_shift usable on timer/project/social', pflxXModUsableNow(PFLX_XMODS.chrono_shift, s, { type: 'timer' }) && pflxXModUsableNow(PFLX_XMODS.chrono_shift, s, { type: 'project' }) && pflxXModUsableNow(PFLX_XMODS.chrono_shift, s, { type: 'social' }));
  ok('chrono_shift NOT usable on quiz_race', !pflxXModUsableNow(PFLX_XMODS.chrono_shift, s, { type: 'quiz_race' }));
  ok('vault_deal usable only when current slide is revealed ("between activities")', pflxXModUsableNow(PFLX_XMODS.vault_deal, s, { type: 'text', revealed: true }));
  ok('vault_deal NOT usable while a slide is still live/unrevealed', !pflxXModUsableNow(PFLX_XMODS.vault_deal, s, { type: 'text', revealed: false }));
  PFLX_XMOD_DARK_TYPES.forEach(function (t) {
    ok('nothing usable on dark type ' + t, !pflxXModUsableNow(PFLX_XMODS.cerebro_scan, s, { type: t, revealed: false }) &&
      !pflxXModUsableNow(PFLX_XMODS.vault_deal, s, { type: t, revealed: true }));
  });
  ok('usableNow false with no slide', !pflxXModUsableNow(PFLX_XMODS.cerebro_scan, s, null));
  ok('usableNow false with no mod', !pflxXModUsableNow(null, s, { type: 'quiz_race' }));
})();

// ── pflxXModEliminatedOptions (Cerebro Scan) ────────────────────────
(function () {
  var sl = { id: 'sl1', type: 'quiz_race', revealed: false, options: ['A', 'B', 'C', 'D'], correctIndex: 2 };
  var sNoBuy = { xmodEvents: [] };
  eq('no purchase -> nothing eliminated', pflxXModEliminatedOptions(sNoBuy, sl, 'p1'), []);
  var sBuy = { xmodEvents: [{ key: 'cerebro_scan', pid: 'p1', slideId: 'sl1', id: 'e1' }] };
  var elim = pflxXModEliminatedOptions(sBuy, sl, 'p1');
  eq('eliminates exactly 2', elim.length, 2);
  ok('never eliminates the correct index', elim.indexOf(2) === -1);
  elim.forEach(function (i) { ok('eliminated index ' + i + ' is in range', i >= 0 && i < 4); });
  ok('deterministic -- same inputs give same output', JSON.stringify(elim) === JSON.stringify(pflxXModEliminatedOptions(sBuy, sl, 'p1')));
  // different player, no purchase for them -> nothing eliminated even on the same slide
  eq('a different player with no purchase sees nothing eliminated', pflxXModEliminatedOptions(sBuy, sl, 'p2'), []);
  // revealed slide -> never eliminates (post-hoc)
  eq('revealed slide -> nothing eliminated', pflxXModEliminatedOptions(sBuy, Object.assign({}, sl, { revealed: true }), 'p1'), []);
  // only 2 options total (correct + 1 wrong) -> can't eliminate without removing the only wrong option entirely
  var sl2 = { id: 'sl2', type: 'quiz_race', revealed: false, options: ['A', 'B'], correctIndex: 0 };
  var sBuy2 = { xmodEvents: [{ key: 'cerebro_scan', pid: 'p1', slideId: 'sl2', id: 'e2' }] };
  eq('2-option slide -> clamps to 0 eliminated (floor stays correct+1 wrong)', pflxXModEliminatedOptions(sBuy2, sl2, 'p1'), []);
  // 3 options (correct + 2 wrong) -> clamps to 1 eliminated, not 2
  var sl3 = { id: 'sl3', type: 'quiz_race', revealed: false, options: ['A', 'B', 'C'], correctIndex: 0 };
  var sBuy3 = { xmodEvents: [{ key: 'cerebro_scan', pid: 'p1', slideId: 'sl3', id: 'e3' }] };
  eq('3-option slide -> clamps to 1 eliminated', pflxXModEliminatedOptions(sBuy3, sl3, 'p1').length, 1);
})();

// ── pflxXModInterceptActive + pflxRaceTriggerPowerup integration ───
(function () {
  // thief1 needs enough earned Nitro to afford Steal's own 35-cost -- give
  // them a revealed, correctly-answered quiz_race slide worth plenty.
  var earnedSlide = { id: 'earn1', type: 'quiz_race', revealed: true, correctIndex: 0, rewardXc: 100, seconds: 0, responses: { thief1: { value: 0 } } };
  var s = { powerupsEnabled: true, sabotageEnabled: true, xmodEvents: [{ id: 'xe1', key: 'intercept', pid: 'target1', at: 1000 }], raceEvents: [], slides: [earnedSlide, { id: 'sl1' }], currentSlideIndex: 1 };
  ok('intercept armed right after purchase', pflxXModInterceptActive(s, 'target1', 2000));
  ok('intercept not active for a different player', !pflxXModInterceptActive(s, 'other', 2000));

  // Trigger a steal against the intercepted player -- should block AND redirect.
  var result = pflxRaceTriggerPowerup(s, 'thief1', 'steal', 'target1', 3000);
  ok('steal vs intercepted target succeeds (purchase itself is valid)', result.ok);
  ok('steal is blocked by intercept', result.event.blocked === true);
  eq('interceptedBy set to the target', result.event.interceptedBy, 'target1');
  ok('stolenAmount computed for the redirect', typeof result.event.stolenAmount === 'number');

  // After that steal consumes it, intercept should no longer be active.
  var s2raceEvents = s.raceEvents.concat([result.event]);
  var s2 = Object.assign({}, s, { raceEvents: s2raceEvents });
  ok('intercept consumed after absorbing one steal', !pflxXModInterceptActive(s2, 'target1', 4000));

  // A steal against a NON-intercepted player is completely unaffected (regression check).
  var earnedSlide3 = { id: 'earn3', type: 'quiz_race', revealed: true, correctIndex: 0, rewardXc: 100, seconds: 0, responses: { thief2: { value: 0 } } };
  var s3 = { powerupsEnabled: true, sabotageEnabled: true, xmodEvents: [], raceEvents: [], slides: [earnedSlide3, { id: 'sl1' }], currentSlideIndex: 1 };
  var r3 = pflxRaceTriggerPowerup(s3, 'thief2', 'steal', 'plainTarget', 5000);
  ok('plain steal with no intercept/shield is not blocked', r3.ok && !r3.event.blocked && !r3.event.interceptedBy);
})();

// ── pflxRacePowerupBonus: intercept redirect + All In ───────────────
(function () {
  // Intercept redirect: thief gets 0, target gets 0 (never actually hit), interceptor gets the full amount.
  var s = {
    raceEvents: [{ key: 'steal', pid: 'thief', targetPid: 'victimSelected', blocked: true, interceptedBy: 'defender', stolenAmount: 15 }],
    xmodEvents: [], slides: [],
  };
  eq('thief gets nothing from an intercepted steal', pflxRacePowerupBonus(s, 'thief'), 0);
  eq('original target gets nothing from an intercepted steal (never actually hit)', pflxRacePowerupBonus(s, 'victimSelected'), 0);
  eq('intercepting defender gets the full redirected amount', pflxRacePowerupBonus(s, 'defender'), 15);

  // All In: correct answer + won -> +score; correct answer + lost -> -score; wrong answer -> no effect either way.
  var sl = { id: 'slA', revealed: true, correctIndex: 1, rewardXc: 20, seconds: 0, responses: { pWin: { value: 1 }, pLose: { value: 1 }, pWrong: { value: 0 } } };
  var sAllIn = { slides: [sl], raceEvents: [], xmodEvents: [
    { key: 'all_in', pid: 'pWin', slideId: 'slA', won: true },
    { key: 'all_in', pid: 'pLose', slideId: 'slA', won: false },
    { key: 'all_in', pid: 'pWrong', slideId: 'slA', won: true },
  ] };
  var score = pflxRaceScore(sl, { value: 1 });
  eq('All In win on a correct answer doubles that slide\'s score', pflxRacePowerupBonus(sAllIn, 'pWin'), score);
  eq('All In loss on a correct answer negates that slide\'s score', pflxRacePowerupBonus(sAllIn, 'pLose'), -score);
  eq('All In has no effect when the answer was wrong, win or lose', pflxRacePowerupBonus(sAllIn, 'pWrong'), 0);

  // Backward compatibility: an empty/absent xmodEvents array must not change pre-existing behavior.
  var sNoXmods = { slides: [sl], raceEvents: [{ key: 'speed_boost', pid: 'z' }] };
  ok('pflxRacePowerupBonus still works with no xmodEvents field at all (pre-X-Mods fixture)', typeof pflxRacePowerupBonus(sNoXmods, 'z') === 'number');
})();

// ── pflxXModTrigger (pure validator) ────────────────────────────────
(function () {
  var slRace = { id: 'r1', type: 'quiz_race', revealed: false, options: ['A', 'B', 'C', 'D'], correctIndex: 0 };
  var s = { slides: [slRace], currentSlideIndex: 0, xmodEvents: [] };

  // unknown mod
  eq('unknown mod rejected', pflxXModTrigger(s, 'p1', 'not_a_real_mod', {}, 1000).reason, 'unknown-xmod');

  // xmods disabled
  var sOff = Object.assign({}, s, { xmodsEnabled: false });
  eq('disabled session rejected', pflxXModTrigger(sOff, 'p1', 'cerebro_scan', { xcBalance: 999 }, 1000).reason, 'xmods-disabled');

  // not usable now (wrong type)
  var sPoll = { slides: [{ id: 'p1', type: 'poll', revealed: false }], currentSlideIndex: 0, xmodEvents: [] };
  eq('cerebro_scan rejected on a poll', pflxXModTrigger(sPoll, 'p1', 'cerebro_scan', { xcBalance: 999 }, 1000).reason, 'not-usable-now');

  // insufficient XC
  eq('insufficient XC rejected', pflxXModTrigger(s, 'p1', 'cerebro_scan', { xcBalance: 5 }, 1000).reason, 'insufficient-xc');

  // daily limit
  var manyEvents = [{ pid: 'p1', at: 1000 }, { pid: 'p1', at: 2000 }, { pid: 'p1', at: 3000 }];
  eq('daily limit rejected at 3/3', pflxXModTrigger(s, 'p1', 'cerebro_scan', { xcBalance: 999, sessionsList: [{ xmodEvents: manyEvents }] }, 4000).reason, 'daily-limit');
  eq('daily limit NOT rejected at 2/3', pflxXModTrigger(s, 'p1', 'cerebro_scan', { xcBalance: 999, sessionsList: [{ xmodEvents: manyEvents.slice(0, 2) }] }, 4000).ok, true);

  // success shape
  var r = pflxXModTrigger(s, 'p1', 'cerebro_scan', { xcBalance: 999, sessionsList: [s] }, 5000);
  ok('successful trigger returns ok + event', r.ok && r.event && r.event.key === 'cerebro_scan' && r.event.pid === 'p1' && r.event.slideId === 'r1' && r.event.cost === 30);
  ok('event has a unique id', typeof r.event.id === 'string' && r.event.id.indexOf('xmev_') === 0);

  // vault_deal guaranteed vs risk, deterministic via injected rand
  var sBetween = { slides: [{ id: 'b1', type: 'text', revealed: true }], currentSlideIndex: 0, xmodEvents: [] };
  var rG = pflxXModTrigger(sBetween, 'p1', 'vault_deal', { xcBalance: 999, sessionsList: [sBetween], choice: 'guaranteed' }, 1000);
  eq('vault_deal guaranteed payout is fixed', rG.event.payout, PFLX_XMOD_VAULT_GUARANTEED);
  var rRWin = pflxXModTrigger(sBetween, 'p1', 'vault_deal', { xcBalance: 999, sessionsList: [sBetween], choice: 'risk', rand: function () { return 0.1; } }, 1000);
  ok('vault_deal risk with low rand() wins', rRWin.event.won === true && rRWin.event.payout === PFLX_XMOD_VAULT_RISK_WIN);
  var rRLose = pflxXModTrigger(sBetween, 'p1', 'vault_deal', { xcBalance: 999, sessionsList: [sBetween], choice: 'risk', rand: function () { return 0.9; } }, 1000);
  ok('vault_deal risk with high rand() loses', rRLose.event.won === false && rRLose.event.payout === 0);
  eq('vault_deal rejected while a slide is still live (not "between")', pflxXModTrigger(s, 'p1', 'vault_deal', { xcBalance: 999, sessionsList: [s] }, 1000).reason, 'not-usable-now');

  // all_in win/lose via injected rand, only valid pre-reveal on quiz_race
  var rWin = pflxXModTrigger(s, 'p1', 'all_in', { xcBalance: 999, sessionsList: [s], rand: function () { return 0.2; } }, 1000);
  eq('all_in with low rand() wins', rWin.event.won, true);
  var rLose = pflxXModTrigger(s, 'p1', 'all_in', { xcBalance: 999, sessionsList: [s], rand: function () { return 0.8; } }, 1000);
  eq('all_in with high rand() loses', rLose.event.won, false);
  var sRevealed = { slides: [Object.assign({}, slRace, { revealed: true })], currentSlideIndex: 0, xmodEvents: [] };
  eq('all_in rejected once the slide is revealed', pflxXModTrigger(sRevealed, 'p1', 'all_in', { xcBalance: 999, sessionsList: [sRevealed] }, 1000).reason, 'not-usable-now');
})();

// ── mergeSession's xmodEvents union block (extracted directly from the
// real mergeSession() body, not reimplemented) ─────────────────────
(function () {
  var block = extractMergeSessionXmodBlock();
  ok('extracted block contains the xmodEvents union code', block.indexOf('merged.xmodEvents') !== -1);
  var mergeSandbox = { console };
  vm.createContext(mergeSandbox);
  var local = { xmodEvents: [{ id: 'a', pid: 'p1' }, { id: 'b', pid: 'p1' }] };
  var incoming = { xmodEvents: [{ id: 'b', pid: 'p1', stale: false }, { id: 'c', pid: 'p2' }] };
  var merged = {};
  mergeSandbox.local = local; mergeSandbox.incoming = incoming; mergeSandbox.merged = merged;
  vm.runInContext(block + '\nthis.result = merged.xmodEvents;', mergeSandbox);
  var resultIds = mergeSandbox.result.map(function (e) { return e.id; }).sort();
  eq('merge unions local-only, incoming-only, and shared ids with no duplicates/drops', resultIds, ['a', 'b', 'c']);

  // A stale poll (empty incoming.xmodEvents) must never drop a local purchase.
  var merged2 = {};
  var sandbox2 = { console, local: { xmodEvents: [{ id: 'z', pid: 'p1' }] }, incoming: { xmodEvents: [] }, merged: merged2 };
  vm.createContext(sandbox2);
  vm.runInContext(block + '\nthis.result = merged.xmodEvents;', sandbox2);
  eq('a stale/empty incoming never drops a local X-Mod purchase', sandbox2.result.map(function (e) { return e.id; }), ['z']);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
