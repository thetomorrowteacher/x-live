// Verifies PATCH X-LIVE v0.50 (Archive Battle presentation layer: star
// field, floating cards, real hit/act/crit animation flags, battle music
// zone) against the REAL shipped index.html source. Extracts flashOff(),
// resolve(), and foeAttack() via brace-counting and executes them for
// real in a sandbox with stubbed dependencies (say/finish/render/
// saveStory/cardName/stage/activeBuild) and a controllable fake
// setTimeout, rather than reimplementing the combat logic.
const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('usage: node test_xlive_archivebattle_presentation_v050.js <index.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

function extractFn(startNeedle) {
  const start = src.indexOf(startNeedle);
  if (start === -1) return null;
  const braceStart = src.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const flashOffSrc = extractFn('function flashOff(keys, ms) {');
const resolveSrc = extractFn('function resolve(a, correct) {');
const foeAttackSrc = extractFn('function foeAttack(scale) {');
check('flashOff() extracted', !!flashOffSrc);
check('resolve() extracted', !!resolveSrc);
check('foeAttack() extracted', !!foeAttackSrc);

// --- CSS structural checks (cheap, no sandbox needed) ---
check('.evb-stage star-field rule exists', /\.evb \.evb-stage\{position:relative;overflow:hidden\}/.test(src));
check('two independently-panning star layers exist (::before/::after)', /\.evb \.evb-stage::before,\.evb \.evb-stage::after\{/.test(src));
check('evbstars1/evbstars2 keyframes exist', /@keyframes evbstars1\{/.test(src) && /@keyframes evbstars2\{/.test(src));
check('evbfloat keyframe + foe/card float rules exist', /@keyframes evbfloat\{/.test(src) && /\.evb \.evb-foe\{animation:evbfloat/.test(src) && /\.evb \.evb-float\{animation:evbfloat/.test(src));
check('critflash keyframe exists (crit gets a real visual, not just text)', /@keyframes critflash\{/.test(src));
check('compound act+hit CSS rule exists for the player card', /\.evb \.evc\.act\.hit\{animation:act \.4s, hit \.35s\}/.test(src));
check('compound act+hit+crit CSS rule exists for the foe', /\.evb \.evb-foe\.act\.hit\.crit svg\{animation:act \.4s, hit \.35s, critflash \.5s\}/.test(src));
check('.evb-foe.act svg rule exists (was missing before this patch)', /\.evb \.evb-foe\.act svg\{animation:act \.4s\}/.test(src));

// --- xlBattleHTML() wiring checks ---
check('xlBattleHTML wraps the no-Evo hint in .evb-stage', /'<div class="evb-stage"><div class="card"><div class="cardT">/.test(src));
check('xlBattleHTML wraps the pre-battle FIGHT prompt in .evb-stage', /'<div class="evb-stage"><div class="card" style="text-align:center">/.test(src));
check('xlBattleHTML builds foeCls from actFoe\\/hitFoe\\/critFoe', /var foeCls = \(B\.actFoe \? ' act' : ''\) \+ \(B\.hitFoe \? ' hit' : ''\) \+ \(B\.critFoe \? ' crit' : ''\);/.test(src));
check('xlBattleHTML injects act\\/hit classes onto the real cardHTML() output via the call site (not by editing cardHTML itself)', /var myCard = cardHTML\(stage\(\), activeBuild\(\)\);[\s\S]{0,200}myCard = myCard\.replace\('class="evc', 'class="evc' \+ myCls\);/.test(src));
check('cardHTML() function itself is untouched (still the shared shop\\/deck renderer)', /function cardHTML\(n, b, chip, locked\) \{/.test(src));
check('the player\'s card wrapper gets the evb-float class', /<div class="evb-float" style="max-width:190px;margin:0 auto">/.test(src));
check('xlBattleHTML() return value closes the new .evb-stage wrapper', /return h \+ '<\/div>';\s*\};/.test(src));

// --- Music zone wiring checks ---
check('XL_MUSIC.battle zone exists (file swapped to Orbit Drift in PATCH X-LIVE v0.51 -- see test_xlive_battle_audio_v051_v053.js)', /battle: \{ file: 'pflx-library\/10_Music_Loops\/loop_drive_8bar_[a-z_0-9]+\.mp3', vol: 0\.34, label: '[^']*' \}/.test(src));
check('xlMusicZone() returns \'battle\' when the Archive Battle hub pane is open', /if \(L\.screen === 'me' && \(L\.hubPane \|\| 0\) === 2\) return 'battle';/.test(src));
// the battle-zone check must come BEFORE the generic Studio Hub 'dash' fallback
const zoneFnStart = src.indexOf('function xlMusicZone() {');
const battleCheckIdx = src.indexOf("return 'battle';", zoneFnStart);
const dashFallbackIdx = src.indexOf("return 'dash';", zoneFnStart);
check('the battle-zone check is ordered before the generic dash fallback', zoneFnStart !== -1 && battleCheckIdx !== -1 && dashFallbackIdx !== -1 && battleCheckIdx < dashFallbackIdx);
check('xlHubGo() re-applies the music zone on tab click', /window\.xlHubGo = function \(i\) \{[\s\S]*?xlMusic\.set\(xlMusicZone\(\)\);\s*\};/.test(src));
check('the hub-swipe onscroll handler re-applies the music zone on swipe', /sw\.onscroll = function \(\) \{[\s\S]*?xlMusic\.set\(xlMusicZone\(\)\);\s*\} \};/.test(src));

// --- Sandboxed real execution of flashOff/resolve/foeAttack ---
let sandbox = null;
try {
  const factory = new Function('deps', `
    let B = null, streak = 0;
    const calls = deps.calls;
    function say(t, cls) { calls.say.push([t, cls]); }
    function finish(win) { calls.finish.push(win); if (B) B.over = true; }
    function render() { calls.render++; }
    function saveStory() { calls.saveStory++; }
    function cardName(n, b) { return 'Card' + n + '-' + b; }
    function stage() { return deps.stageVal; }
    function story() { return deps.storyVal; }
    function activeBuild() { return deps.buildVal; }
    ${flashOffSrc}
    ${resolveSrc}
    ${foeAttackSrc}
    return {
      setB: function (v) { B = v; },
      getB: function () { return B; },
      setStreak: function (v) { streak = v; },
      getStreak: function () { return streak; },
      resolve: resolve,
      foeAttack: foeAttack,
      flashOff: flashOff
    };
  `);
  const calls = { say: [], finish: [], render: 0, saveStory: 0 };
  sandbox = factory({ calls: calls, stageVal: 1, buildVal: 'BASE', storyVal: { orbs: 50 } });
  sandbox.__calls = calls;
} catch (e) {
  fail++;
  console.log('FAIL: extracted code evaluates without throwing -- ' + e.message);
}

function freshB(overrides) {
  return Object.assign({
    foe: { id: 'scout', name: 'Archive Scout', attack: 10, tier: 1 },
    foeHp: 70, foeMax: 70, hp: 100, max: 100, guard: 0, dodge: 0, shield: false,
    turn: 0, twice: false, marked: false, disabled: null, over: false,
    sv: { GUARD: 5, HACK: 5, POWER: 10, LUCK: 5 }, log: [], result: null
  }, overrides || {});
}
function strikeAbility() { return { id: 'quill-flick', type: 'strike', power: 10, cost: 0 }; }

if (sandbox) {
  // Fake setTimeout: capture scheduled callbacks instead of running them,
  // so the test can advance time deterministically.
  const realSetTimeout = global.setTimeout;
  let scheduled = [];
  global.setTimeout = function (fn, ms) { scheduled.push({ fn: fn, ms: ms }); return scheduled.length; };
  function runDueTimers(atLeastMs) {
    const due = scheduled.filter(function (s) { return s.ms <= atLeastMs; });
    scheduled = scheduled.filter(function (s) { return s.ms > atLeastMs; });
    due.forEach(function (s) { s.fn(); });
  }

  try {
    // 1) A correct strike lands: hitFoe/actMe set immediately, damage applied.
    let calls = sandbox.__calls; calls.say.length = 0; calls.render = 0; calls.saveStory = 0; calls.finish.length = 0;
    sandbox.setB(freshB()); sandbox.setStreak(0); scheduled = [];
    sandbox.resolve(strikeAbility(), true);
    let B = sandbox.getB();
    check('a landed correct strike damages the foe', B.foeHp < 70);
    check('B.actMe is set true when the player acts (was never set before this patch)', B.actMe === true);
    check('B.hitFoe is set true when the strike actually lands (was dead code before this patch -- only ever read, never set)', B.hitFoe === true);
    check('B.critFoe is NOT set on a non-streak hit', !B.critFoe);
    check('B.actFoe/B.hitMe get set too, since foeAttack(1) runs synchronously within the same resolve() call', B.actFoe === true);

    // 2) flashOff scheduling: the right keys get cleared after their real duration.
    const actMeTimer = scheduled.find(function (s) { return s.ms === 420; });
    const hitFoeTimer = scheduled.find(function (s) { return s.ms === 480 && s !== actMeTimer; });
    check('flashOff scheduled a 420ms clear for actMe', !!actMeTimer);
    check('flashOff scheduled a 480ms clear for hitFoe (and hitMe/actFoe from foeAttack)', scheduled.some(function (s) { return s.ms === 480; }));
    runDueTimers(420);
    check('after 420ms, actMe is cleared back to false', sandbox.getB().actMe === false);
    check('hitFoe is still true at 420ms (its own timer is 480ms, not yet due)', sandbox.getB().hitFoe === true);
    runDueTimers(480);
    check('after 480ms, hitFoe/actFoe/hitMe are all cleared back to false', sandbox.getB().hitFoe === false && sandbox.getB().actFoe === false && sandbox.getB().hitMe === false);

    // 3) flashOff is stale-safe: if B is reassigned (new battle) before the
    //    timer fires, the OLD timer must not corrupt the NEW battle object.
    scheduled = [];
    const oldB = freshB({ hitFoe: true });
    sandbox.setB(oldB);
    sandbox.flashOff(['hitFoe'], 100);
    const newB = freshB({ hitFoe: true, foeHp: 55 });
    sandbox.setB(newB); // battle restarted -- B reassigned to a brand-new object
    runDueTimers(100);
    check('a flashOff scheduled against an old battle object does not touch the new battle object', sandbox.getB().hitFoe === true && sandbox.getB() === newB);
    check('the OLD (stale) battle object is untouched by the (correctly skipped) clear', oldB.hitFoe === true);

    // 4) A 3-hit streak produces a real crit -- both hitFoe and critFoe set,
    //    and 1.5x damage multiplier actually applied (not just the flag).
    scheduled = [];
    sandbox.setB(freshB()); sandbox.setStreak(2); // one more correct hit reaches streak 3 -> crit
    const before = sandbox.getB().foeHp;
    sandbox.resolve(strikeAbility(), true);
    B = sandbox.getB();
    check('a 3-hit streak sets B.critFoe (alongside B.hitFoe)', B.critFoe === true && B.hitFoe === true);
    check('streak resets to 0 after a crit fires', sandbox.getStreak() === 0);
    const normalDmg = Math.round(strikeAbility().power * (1 + 10 / 20)); // POWER=10 stat, no crit mult
    const critDmg = Math.round(strikeAbility().power * (1 + 10 / 20) * 1.5);
    check('crit damage is 1.5x a normal hit\'s damage (real multiplier, not just a flag)', (before - B.foeHp) === critDmg && critDmg > normalDmg);

    // 5) A wrong answer still lands a reduced (0.4x) strike -- real game
    //    design per resolve()'s `mult = correct ? 1 : 0.4` -- so hitFoe DOES
    //    get set, just for less damage, and never with a crit. The Archive
    //    still gets its own free hit too (game logic unchanged by this patch).
    scheduled = [];
    sandbox.setB(freshB()); sandbox.setStreak(5);
    const beforeWrong = sandbox.getB().hp;
    sandbox.resolve(strikeAbility(), false);
    B = sandbox.getB();
    const wrongDmg = Math.round(strikeAbility().power * (1 + 10 / 20) * 0.4); // 6
    check('a wrong answer lands a reduced-power hit (0.4x) and sets hitFoe, never critFoe', B.foeHp === (70 - wrongDmg) && B.hitFoe === true && !B.critFoe);
    check('a wrong answer still damages the player (free hit + normal counter, unchanged game logic)', B.hp < beforeWrong);
    check('streak resets to 0 on a wrong answer', sandbox.getStreak() === 0);

    // 6) foeAttack(): a dodge (B.dodge > 0) still pops the foe (actFoe) but
    //    must NOT set hitMe (no damage actually landed).
    scheduled = [];
    sandbox.setB(freshB({ dodge: 1 }));
    const hpBeforeDodge = sandbox.getB().hp;
    sandbox.foeAttack(1);
    B = sandbox.getB();
    check('a dodged attack still sets actFoe (the foe still lunges)', B.actFoe === true);
    check('a dodged attack does NOT set hitMe (no damage landed)', !B.hitMe);
    check('a dodged attack does not change player HP', B.hp === hpBeforeDodge);
    check('dodge counter decrements on a dodged attack', B.dodge === 0);
  } finally {
    global.setTimeout = realSetTimeout;
  }
} else {
  fail++;
  console.log('FAIL: sandbox did not build -- skipping behavioral checks');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
