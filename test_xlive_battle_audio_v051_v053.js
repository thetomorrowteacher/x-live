// Verifies PATCH X-LIVE v0.51 (battle music -> unused Orbit Drift loop),
// v0.52 (Dragon Ball hit/crit/foe-hit SFX wired into resolve()/foeAttack()),
// and v0.53 (smoother hover/click SFX, matching PATCH PLATFORM v243) against
// the REAL shipped index.html -- extracts real source and, for the
// behavioral half, executes the REAL resolve()/foeAttack() via a sandbox
// (same brace-counting + fake-timer pattern as
// test_xlive_archivebattle_presentation_v050.js) with a spy xlSfx().
const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('usage: node test_xlive_battle_audio_v051_v053.js <index.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

// ---- v0.51: battle music zone ----
check('XL_MUSIC.battle now points at the Orbit Drift drive loop (was the rush placeholder)',
  /battle:\s*\{\s*file:\s*'pflx-library\/10_Music_Loops\/loop_drive_8bar_orbit_drift_129bpm\.mp3'/.test(src));
check('XL_MUSIC.battle no longer reuses the midnight_mission_run placeholder file',
  !/battle:\s*\{\s*file:\s*'pflx-library\/10_Music_Loops\/loop_drive_8bar_midnight_mission_run_131bpm\.mp3'/.test(src));

// ---- v0.52: Dragon Ball battle SFX entries + wiring ----
check('XL_SFX.battleHit points at the cut Dragon Ball impact_025 clip', /battleHit:\s*'pflx-library\/04_Impacts_Hits\/impact_025\.mp3'/.test(src));
check('XL_SFX.battleCrit points at the cut Dragon Ball impact_022 clip', /battleCrit:\s*'pflx-library\/04_Impacts_Hits\/impact_022\.mp3'/.test(src));
check('XL_SFX.battleFoeHit points at the cut Dragon Ball impact_029 clip', /battleFoeHit:\s*'pflx-library\/04_Impacts_Hits\/impact_029\.mp3'/.test(src));
check('resolve() calls xlSfx with battleCrit/battleHit right where hitFoe/critFoe get set',
  /B\.hitFoe = true; if \(crit\) B\.critFoe = true; flashOff\([^)]*\], 480\); \/\/ PATCH X-LIVE v0\.50[^\n]*\n\s*if \(typeof xlSfx === 'function'\) xlSfx\(crit \? 'battleCrit' : 'battleHit'\)/.test(src));
check('foeAttack() calls xlSfx with battleFoeHit right where hitMe gets set',
  /B\.hitMe = true;[^\n]*flashOff\([^)]*\][^)]*\); \/\/ PATCH X-LIVE v0\.50[^\n]*\n\s*if \(typeof xlSfx === 'function'\) xlSfx\('battleFoeHit'\)/.test(src)); // PATCH X-LIVE v0.69 widened to tolerate the new B.critMe assignment + variable flashOff clear/delay list

// ---- v0.53: smoother hover/click ----
check('XL_SFX.uiHover now points at click_030 (crest factor 1.7 -- was ui_hover_soft.mp3)', /uiHover:\s*'pflx-library\/01_UI_Clicks\/click_030\.mp3'/.test(src));
check('XL_SFX.uiClick now points at click_041 (crest factor 2.6 -- was click_007.mp3, crest 8.5)', /uiClick:\s*'pflx-library\/01_UI_Clicks\/click_041\.mp3'/.test(src));
check('the old harsh click_007 uiClick assignment is gone', !/uiClick:\s*'pflx-library\/01_UI_Clicks\/click_007\.mp3'/.test(src));
check('the old ui_hover_soft.mp3 uiHover assignment is gone', !/uiHover:\s*'pflx-ui\/ui_hover_soft\.mp3'/.test(src));

// ---- behavioral: extract the REAL flashOff/resolve/foeAttack and confirm
//      xlSfx is genuinely invoked (not just present as a string) at the
//      right moments, with a spy xlSfx() in the sandbox scope. ----
function extractFn(marker) {
  const start = src.indexOf(marker);
  if (start === -1) return '';
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
// PATCH X-LIVE v0.67 forward-compat -- resolve() now calls foeDefenseMult(),
// a real shipped dependency this sandbox must provide too.
const foeDefenseMultSrc = extractFn('function foeDefenseMult(f) {');
check('flashOff() extracted', flashOffSrc.length > 10);
check('resolve() extracted', resolveSrc.length > 10);
check('foeAttack() extracted', foeAttackSrc.length > 10);
check('foeDefenseMult() extracted (PATCH X-LIVE v0.67 dependency)', foeDefenseMultSrc.length > 10);

let sandbox = null;
if (flashOffSrc && resolveSrc && foeAttackSrc && foeDefenseMultSrc) {
  const factory = new Function('deps', `
    let B = null, streak = 0;
    const calls = deps.calls;
    function say(t, cls) { calls.say.push([t, cls]); }
    function finish(win) { calls.finish.push(win); if (B) B.over = true; }
    function render() { calls.render++; }
    function saveStory() { calls.saveStory++; }
    function cardName(n, b) { return 'Card' + n + '-' + b; }
    function stage() { return deps.stageVal; }
    function activeBuild() { return deps.buildVal; }
    function story() { return deps.storyVal; }
    function xlSfx(name, gain) { calls.sfx.push(name); }
    ${foeDefenseMultSrc}
    ${flashOffSrc}
    ${resolveSrc}
    ${foeAttackSrc}
    return {
      setB: function (b) { B = b; },
      getB: function () { return B; },
      setStreak: function (s) { streak = s; },
      getStreak: function () { return streak; },
      resolve: resolve,
      foeAttack: foeAttack
    };
  `);
  try {
    sandbox = factory({ calls: { say: [], finish: [], render: 0, saveStory: 0, sfx: [] }, stageVal: 1, buildVal: 'BASE', storyVal: { orbs: 50 } });
  } catch (e) {
    fail++; console.log('FAIL: sandbox build threw -- ' + e.message);
  }
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
  const realSetTimeout = global.setTimeout;
  global.setTimeout = function (fn) { /* let flashOff's timers fire eventually; we don't need them for these checks */ };
  try {
    const calls = { say: [], finish: [], render: 0, saveStory: 0, sfx: [] };
    const s2 = (new Function('deps', `
      let B = null, streak = 0;
      const calls = deps.calls;
      function say(t, cls) { calls.say.push([t, cls]); }
      function finish(win) { calls.finish.push(win); if (B) B.over = true; }
      function render() { calls.render++; }
      function saveStory() { calls.saveStory++; }
      function cardName(n, b) { return 'Card' + n + '-' + b; }
      function stage() { return deps.stageVal; }
      function activeBuild() { return deps.buildVal; }
      function story() { return deps.storyVal; }
      function xlSfx(name, gain) { calls.sfx.push(name); }
      ${foeDefenseMultSrc}
      ${flashOffSrc}
      ${resolveSrc}
      ${foeAttackSrc}
      return { setB: function (b) { B = b; }, getB: function () { return B; }, setStreak: function (s) { streak = s; }, getStreak: function () { return streak; }, resolve: resolve, foeAttack: foeAttack };
    `))({ calls: calls, stageVal: 1, buildVal: 'BASE', storyVal: { orbs: 50 } });

    // 1) A correct, non-crit strike plays 'battleHit' (not 'battleCrit').
    s2.setB(freshB()); s2.setStreak(0);
    s2.resolve(strikeAbility(), true);
    check('a correct non-crit strike plays battleHit', calls.sfx.indexOf('battleHit') !== -1);
    check('a correct non-crit strike does NOT play battleCrit', calls.sfx.indexOf('battleCrit') === -1);
    check("the Archive's own counter-hit plays battleFoeHit in the same turn", calls.sfx.indexOf('battleFoeHit') !== -1);

    // 2) A 3-hit streak (crit) plays 'battleCrit' instead of 'battleHit' for that swing.
    calls.sfx.length = 0;
    s2.setB(freshB()); s2.setStreak(2);
    s2.resolve(strikeAbility(), true);
    check('a 3-hit streak crit plays battleCrit', calls.sfx.indexOf('battleCrit') !== -1);
    check('a crit swing does not ALSO play battleHit for the same strike', calls.sfx.indexOf('battleHit') === -1);

    // 3) A wrong answer (reduced-power hit, per v0.50's real mult=0.4 logic)
    //    still plays battleHit -- the strike really does land, just softer.
    calls.sfx.length = 0;
    s2.setB(freshB()); s2.setStreak(5);
    s2.resolve(strikeAbility(), false);
    check('a wrong answer (reduced hit) still plays battleHit', calls.sfx.indexOf('battleHit') !== -1);

    // 4) A dodged Archive attack never plays battleFoeHit (no damage landed).
    calls.sfx.length = 0;
    s2.setB(freshB({ dodge: 1 }));
    s2.foeAttack(1);
    check('a dodged attack does not play battleFoeHit', calls.sfx.indexOf('battleFoeHit') === -1);
  } finally {
    global.setTimeout = realSetTimeout;
  }
} else {
  fail++;
  console.log('FAIL: sandbox did not build -- skipping behavioral checks');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
