// Verifies PATCH X-LIVE v0.54 (Phase B: Boss-tier Archives) against the
// REAL shipped index.html -- structural regex checks on the archive/hive
// JSON and the pickFoe()/xlBattleHTML wiring, plus sandboxed behavioral
// checks executing the REAL pickFoe()/pickHive()/hiveUnlocked()/
// xlHiveNew()/resolve()/foeAttack()/finish() extracted via the same
// brace-counting + fake-timer pattern as
// test_xlive_battle_audio_v051_v053.js, with a spy xlSfx() and stubbed
// free variables (say/render/saveStory/cardName/stage/activeBuild/
// story/G/exoRow/earnXc/saveExo/liteLog/toast/myId/stats).
const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('usage: node test_xlive_bosstier_hive_v054.js <index.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

// ---- structural: Hack Guild + Trojan roster data ----
check('breach entry: tier 5, stage 5, Hack Guild', /"id": "breach", "name": "Breach, of the Hack Guild", "tier": 5, "stages": \[5\]/.test(src));
check('wraith entry: tier 6, stage 5, Hack Guild', /"id": "wraith", "name": "Wraith, of the Hack Guild", "tier": 6, "stages": \[5\]/.test(src));
check('vector entry: tier 7, stage 5, Hack Guild', /"id": "vector", "name": "Vector, of the Hack Guild", "tier": 7, "stages": \[5\]/.test(src));
check('trojan entry: tier 8, stage 5', /"id": "trojan", "name": "Trojan", "tier": 8, "stages": \[5\]/.test(src));
check('core is now flagged exhibitOnly (stays out of the normal ladder)', /"id": "core", "name": "The Archive Core"[^}]*"exhibitOnly": true/.test(src));
check('hive array exists with 3 swarm units', /"hive": \[\{"id": "hive-drone"[\s\S]{0,400}\{"id": "hive-sentinel"[\s\S]{0,400}\{"id": "hive-matron"/.test(src));

// ---- structural: pickFoe() filter switched from tier<5 to !exhibitOnly ----
check('pickFoe() now filters on !f.exhibitOnly (not the old f.tier < 5)',
  /function pickFoe\(\) \{ var g = G\(\), st = story\(\); var c = g\.archive\.filter\(function \(f\) \{ return f\.stages\.indexOf\(stage\(\)\) >= 0 && !f\.exhibitOnly; \}\)/.test(src));
check('the old f.tier < 5 filter is gone from pickFoe()', !/f\.stages\.indexOf\(stage\(\)\) >= 0 && f\.tier < 5/.test(src));

// ---- structural: xlHiveNew / pickHive / hiveUnlocked wiring ----
check('pickHive() reads g.hive', /function pickHive\(\) \{ var g = G\(\); return \(g\.hive \|\| \[\]\)\.slice\(\); \}/.test(src));
check('hiveUnlocked() gates on wins >= 9', /function hiveUnlocked\(\) \{ return \(story\(\)\.wins \|\| 0\) >= 9; \}/.test(src));
check('window.xlHiveNew is a real exported function', /window\.xlHiveNew = function \(\) \{/.test(src));
// PATCH X-LIVE v0.61 -- the HIVE ALERT button now routes through the
// new title-screen intro sequence (xlBattleStartSequence('hive')) instead
// of calling xlHiveNew() directly; xlHiveNew() itself is unchanged and is
// still the real function the intro sequence advances into (see the
// dedicated test_title_screen_v061.js for that wiring).
check('xlBattleHTML shows a HIVE ALERT button gated on hiveUnlocked()', /hiveUnlocked\(\) \? ' <button class="bigbtn ghost" onclick="xlBattleStartSequence\(\\'hive\\'\)">/.test(src));

// ---- structural: Hack Guild boss mechanics wired into resolve()/foeAttack()/finish() ----
check("resolve() has Breach's guard-nullify branch", /B\.foe\.id === 'breach' && !B\.breached/.test(src));
check("resolve() has Wraith's phase-through branch", /B\.foe\.id === 'wraith' && a\.type === 'strike' && B\.turn % 3 === 1/.test(src));
check("resolve() has Trojan's double free-hit branch", /B\.foe\.id === 'trojan' && B\.hp > 0/.test(src));
check("foeAttack() has Vector's second-strike branch", /f\.id === 'vector' && scale === 1 && B\.hp > 0/.test(src));
check('finish() advances to the next Hive unit instead of ending the encounter', /if \(win && B\.hive && B\.hiveIdx < B\.hiveFoes\.length - 1\) \{/.test(src));
check('finish() multiplies the reward by hive size on a full clear', /var hiveMult = B\.hive \? B\.hiveFoes\.length : 1;/.test(src));

// ---- behavioral: extract the REAL functions and execute them in a sandbox ----
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
function extractAssign(marker) {
  // for "window.xlHiveNew = function () { ... };" -- find the function body
  // by locating "function (" right after marker, then brace-count, then
  // include the trailing ';'.
  const start = src.indexOf(marker);
  if (start === -1) return '';
  const fnStart = src.indexOf('function', start);
  const braceStart = src.indexOf('{', fnStart);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return 'var xlHiveNew = ' + src.slice(fnStart, i) + ';';
}
const flashOffSrc = extractFn('function flashOff(keys, ms) {');
const resolveSrc = extractFn('function resolve(a, correct) {');
const foeAttackSrc = extractFn('function foeAttack(scale) {');
const finishSrc = extractFn('function finish(win) {');
const pickFoeSrc = extractFn('function pickFoe() {');
const pickHiveSrc = extractFn('function pickHive() {');
const hiveUnlockedSrc = extractFn('function hiveUnlocked() {');
const xlHiveNewSrc = extractAssign('window.xlHiveNew = function () {');
check('flashOff() extracted', flashOffSrc.length > 10);
check('resolve() extracted', resolveSrc.length > 10);
check('foeAttack() extracted', foeAttackSrc.length > 10);
check('finish() extracted', finishSrc.length > 10);
check('pickFoe() extracted', pickFoeSrc.length > 10);
check('pickHive() extracted', pickHiveSrc.length > 10);
check('hiveUnlocked() extracted', hiveUnlockedSrc.length > 10);
check('xlHiveNew() extracted', xlHiveNewSrc.length > 20);

const ARCHIVE_FIXTURE = [
  { id: 'overseer', name: 'Archive Overseer', tier: 4, stages: [4, 5], hp: 220, attack: 22 },
  { id: 'breach', name: 'Breach', tier: 5, stages: [5], hp: 250, attack: 24 },
  { id: 'wraith', name: 'Wraith', tier: 6, stages: [5], hp: 270, attack: 25 },
  { id: 'vector', name: 'Vector', tier: 7, stages: [5], hp: 290, attack: 20 },
  { id: 'trojan', name: 'Trojan', tier: 8, stages: [5], hp: 360, attack: 28 },
  { id: 'core', name: 'The Archive Core', tier: 5, stages: [5], hp: 320, attack: 26, exhibitOnly: true }
];
const HIVE_FIXTURE = [
  { id: 'hive-drone', name: 'Hive Drone', tier: 2, hp: 80, attack: 10 },
  { id: 'hive-sentinel', name: 'Hive Sentinel', tier: 3, hp: 95, attack: 12 },
  { id: 'hive-matron', name: 'Hive Matron', tier: 4, hp: 130, attack: 16 }
];
const REWARDS = { win: { xc: 40, orbs: 15, syncXp: 30, perTier: { xc: 10, orbs: 5, syncXp: 10 } }, lose: { syncXp: 5 } };

function buildSandbox(extraState) {
  const calls = { say: [], render: 0, saveStory: 0, sfx: [], earnXc: [], saveExo: [], liteLog: [] };
  const storyVal = Object.assign({ orbs: 50, wins: 0 }, (extraState && extraState.story) || {});
  const exoVal = Object.assign({ sync_xp: 0 }, (extraState && extraState.exo) || {});
  const factory = new Function('deps', `
    let B = null, streak = 0;
    const calls = deps.calls;
    function say(t, cls) { calls.say.push([t, cls]); if (B) B.log.unshift({ t: t, c: cls || '' }); }
    function render() { calls.render++; }
    function saveStory() { calls.saveStory++; }
    function cardName(n, b) { return 'Card' + n + '-' + b; }
    function stage() { return deps.stageVal; }
    function activeBuild() { return deps.buildVal; }
    function story() { return deps.storyVal; }
    function exoRow() { return deps.exoVal; }
    function G() { return { archive: deps.archiveFixture, hive: deps.hiveFixture, battle: { rewards: deps.rewards } }; }
    function stats() { return deps.statsVal; }
    function myId() { return 'p1'; }
    function toast() {}
    function nextThreshold() { return null; }
    function earnXc(xc, reason) { calls.earnXc.push([xc, reason]); }
    function saveExo(patch) { calls.saveExo.push(patch); Object.assign(deps.exoVal, patch); }
    function liteLog(id, kind, label, xc) { calls.liteLog.push([id, kind, label, xc]); }
    function xlSfx(name, gain) { calls.sfx.push(name); }
    ${flashOffSrc}
    ${resolveSrc}
    ${foeAttackSrc}
    ${finishSrc}
    ${pickFoeSrc}
    ${pickHiveSrc}
    ${hiveUnlockedSrc}
    ${xlHiveNewSrc}
    return {
      setB: function (b) { B = b; }, getB: function () { return B; },
      setStreak: function (s) { streak = s; }, getStreak: function () { return streak; },
      resolve: resolve, foeAttack: foeAttack, finish: finish,
      pickFoe: pickFoe, pickHive: pickHive, hiveUnlocked: hiveUnlocked,
      xlHiveNew: function () { xlHiveNew(); return B; }
    };
  `);
  const obj = factory({
    calls: calls, stageVal: 5, buildVal: 'BASE', storyVal: storyVal, exoVal: exoVal,
    archiveFixture: JSON.parse(JSON.stringify(ARCHIVE_FIXTURE)), hiveFixture: JSON.parse(JSON.stringify(HIVE_FIXTURE)), rewards: REWARDS,
    statsVal: { GUARD: 5, HACK: 5, POWER: 10, LUCK: 5 }
  });
  obj.__calls = calls;
  return obj;
}

function freshB(overrides) {
  return Object.assign({
    foe: { id: 'scout', name: 'Archive Scout', attack: 10, tier: 1, hp: 70 },
    foeHp: 70, foeMax: 70, hp: 100, max: 100, guard: 0, dodge: 0, shield: false,
    turn: 0, twice: false, marked: false, disabled: null, over: false,
    sv: { GUARD: 5, HACK: 5, POWER: 10, LUCK: 5 }, log: [], result: null
  }, overrides || {});
}
function strikeAbility() { return { id: 'quill-flick', type: 'strike', power: 10, cost: 0 }; }
function guardAbility() { return { id: 'ink-veil-guard', type: 'guard', power: 0, cost: 2 }; }

const canRunBehavioral = flashOffSrc && resolveSrc && foeAttackSrc && finishSrc && pickFoeSrc && pickHiveSrc && hiveUnlockedSrc && xlHiveNewSrc;
if (canRunBehavioral) {
  const realSetTimeout = global.setTimeout;
  global.setTimeout = function () {};
  try {
    // ---- pickFoe() ladder progression ----
    let sb = buildSandbox({ story: { wins: 0 } });
    check('pickFoe() at wins=0 picks overseer (index 0)', sb.pickFoe().id === 'overseer');
    sb = buildSandbox({ story: { wins: 3 } });
    check('pickFoe() at wins=3 picks breach (index 1)', sb.pickFoe().id === 'breach');
    sb = buildSandbox({ story: { wins: 5 } });
    check('pickFoe() at wins=5 picks wraith (index 2)', sb.pickFoe().id === 'wraith');
    sb = buildSandbox({ story: { wins: 7 } });
    check('pickFoe() at wins=7 picks vector (index 3)', sb.pickFoe().id === 'vector');
    sb = buildSandbox({ story: { wins: 9 } });
    check('pickFoe() at wins=9 picks trojan (index 4)', sb.pickFoe().id === 'trojan');
    sb = buildSandbox({ story: { wins: 100 } });
    check('pickFoe() at wins=100 stays capped at trojan (never returns the exhibitOnly core)', sb.pickFoe().id === 'trojan');

    // ---- hiveUnlocked() gating ----
    sb = buildSandbox({ story: { wins: 8 } });
    check('hiveUnlocked() is false at wins=8', sb.hiveUnlocked() === false);
    sb = buildSandbox({ story: { wins: 9 } });
    check('hiveUnlocked() is true at wins=9', sb.hiveUnlocked() === true);

    // ---- pickHive() returns a real 3-unit copy ----
    sb = buildSandbox({});
    const hiveList = sb.pickHive();
    check('pickHive() returns 3 units', hiveList.length === 3);
    check('pickHive() returns them in order (drone, sentinel, matron)', hiveList[0].id === 'hive-drone' && hiveList[1].id === 'hive-sentinel' && hiveList[2].id === 'hive-matron');
    check('pickHive() returns a fresh array each call (not the same array identity)', sb.pickHive() !== hiveList);

    // ---- xlHiveNew() wiring ----
    sb = buildSandbox({});
    let B0 = sb.xlHiveNew();
    check('xlHiveNew() sets B.hive = true', B0.hive === true);
    check('xlHiveNew() starts at hiveIdx 0', B0.hiveIdx === 0);
    check('xlHiveNew() seeds B.foe as the first hive unit (Hive Drone)', B0.foe.id === 'hive-drone');
    check('xlHiveNew() sets foeHp/foeMax from the first units hp', B0.foeHp === 80 && B0.foeMax === 80);
    check('xlHiveNew() derives player hp from stats() (60 + GUARD*8 = 100)', B0.hp === 100 && B0.max === 100);

    // ---- resolve(): Breach nullifies the first free guard move, once ----
    sb = buildSandbox({});
    sb.setB(freshB({ foe: { id: 'breach', name: 'Breach', attack: 24, tier: 5, hp: 250 } }));
    sb.resolve(guardAbility(), true);
    let b = sb.getB();
    check('Breach: first guard use is nullified (B.guard stays 0)', b.guard === 0);
    check('Breach: B.breached flips true after the first nullified guard', b.breached === true);
    check('Breach: the nullify is logged', b.log.some(l => l.t.indexOf('Breach corrupts') !== -1));
    sb.resolve(guardAbility(), true);
    b = sb.getB();
    // Guard halves the very next hit taken -- which, on this same turn, is
    // the foe's own counter-attack a few lines later in resolve() itself,
    // so B.guard is already consumed by the time resolve() returns (real,
    // pre-existing "next hit is halved" mechanic). The log message proves
    // the SECOND guard use took the normal branch, not the Breach one.
    check('Breach: the SECOND guard use in the same fight takes the normal branch (logged as halved, not corrupted)', b.log.some(l => l.t.indexOf('the next hit is halved') !== -1));

    // ---- resolve(): Wraith phases through every third strike ----
    sb = buildSandbox({});
    sb.setB(freshB({ foe: { id: 'wraith', name: 'Wraith', attack: 25, tier: 6, hp: 270 }, foeHp: 270, foeMax: 270, turn: 1 }));
    sb.resolve(strikeAbility(), true);
    b = sb.getB();
    check('Wraith: on B.turn % 3 === 1, the strike phases through (foeHp unchanged)', b.foeHp === 270);
    check('Wraith: the phase-through is logged', b.log.some(l => l.t.indexOf('phases through') !== -1));
    sb = buildSandbox({});
    sb.setB(freshB({ foe: { id: 'wraith', name: 'Wraith', attack: 25, tier: 6, hp: 270 }, foeHp: 270, foeMax: 270, turn: 0 }));
    sb.resolve(strikeAbility(), true);
    b = sb.getB();
    check('Wraith: on a non-matching turn, the strike lands normally (foeHp drops)', b.foeHp < 270);

    // ---- resolve(): Trojan doubles a wrong-answer free hit ----
    sb = buildSandbox({});
    sb.setB(freshB({ foe: { id: 'trojan', name: 'Trojan', attack: 28, tier: 8, hp: 360 }, hp: 500, max: 500 }));
    sb.resolve(strikeAbility(), false);
    const trojanHpLoss = 500 - sb.getB().hp;
    sb = buildSandbox({});
    sb.setB(freshB({ foe: { id: 'scout', name: 'Archive Scout', attack: 28, tier: 1, hp: 70 }, hp: 500, max: 500 }));
    sb.resolve(strikeAbility(), false);
    const scoutHpLoss = 500 - sb.getB().hp;
    check('Trojan: a wrong answer costs strictly more HP than the same setup against a non-Trojan foe (double free hit)', trojanHpLoss > scoutHpLoss);
    sb = buildSandbox({});
    sb.setB(freshB({ foe: { id: 'trojan', name: 'Trojan', attack: 28, tier: 8, hp: 360 }, hp: 500, max: 500 }));
    sb.resolve(strikeAbility(), false);
    check('Trojan: the double-hit is logged', sb.getB().log.some(l => l.t.indexOf('Trojan doubles down') !== -1));

    // ---- foeAttack(): Vector strikes twice on scale===1, once on scale!==1 ----
    sb = buildSandbox({});
    sb.setB(freshB({ foe: { id: 'vector', name: 'Vector', attack: 20, tier: 7, hp: 290 }, hp: 500, max: 500 }));
    sb.foeAttack(1);
    b = sb.getB();
    check('Vector: a main-turn attack (scale=1) logs two "fo" hits', b.log.filter(l => l.c === 'fo').length === 2);
    check('Vector: the second strike is logged as "strikes again"', b.log.some(l => l.t.indexOf('strikes again') !== -1));
    sb = buildSandbox({});
    sb.setB(freshB({ foe: { id: 'vector', name: 'Vector', attack: 20, tier: 7, hp: 290 }, hp: 500, max: 500 }));
    sb.foeAttack(0.7);
    b = sb.getB();
    check('Vector: a wrong-answer free hit (scale=0.7) logs only ONE "fo" hit (no second strike)', b.log.filter(l => l.c === 'fo').length === 1);

    // ---- finish(): Hive sequencing across 3 units, single payout at the end ----
    sb = buildSandbox({});
    let hb = sb.xlHiveNew();
    hb.foeHp = 0; // drone down
    sb.finish(true);
    b = sb.getB();
    check('Hive unit 1 down: does NOT end the encounter (B.over stays falsy)', !b.over);
    check('Hive unit 1 down: advances to unit 2 (hiveIdx = 1)', b.hiveIdx === 1);
    check('Hive unit 1 down: foe becomes Hive Sentinel', b.foe.id === 'hive-sentinel');
    check('Hive unit 1 down: no reward posted yet (still mid-swarm)', sb.__calls.earnXc.length === 0);
    b.foeHp = 0; // sentinel down
    sb.finish(true);
    b = sb.getB();
    check('Hive unit 2 down: still does NOT end the encounter', !b.over);
    check('Hive unit 2 down: advances to unit 3 (hiveIdx = 2)', b.hiveIdx === 2);
    check('Hive unit 2 down: foe becomes Hive Matron', b.foe.id === 'hive-matron');
    b.foeHp = 0; // matron (final unit) down
    sb.finish(true);
    b = sb.getB();
    check('Hive unit 3 (final) down: NOW ends the encounter (B.over = true)', b.over === true);
    check('Hive full clear: exactly ONE payout posted across the whole 3-unit fight', sb.__calls.earnXc.length === 1);
    // reward = (40 + 10*(matron.tier-1)) * hiveMult(3) = (40 + 10*3) * 3 = 210
    check('Hive full clear: reward is multiplied by swarm size (210 XC for a 3-unit clear ending on tier-4 Hive Matron)', sb.__calls.earnXc[0][0] === 210);

    // ---- finish(): non-hive regression -- unaffected by the hive multiplier ----
    sb = buildSandbox({});
    sb.setB(freshB({ foe: { id: 'scout', name: 'Archive Scout', attack: 10, tier: 1, hp: 70 }, foeHp: 0 }));
    sb.finish(true);
    b = sb.getB();
    check('Non-hive win: ends the encounter immediately (B.over = true)', b.over === true);
    check('Non-hive win: reward is NOT multiplied (40 XC for a tier-1 scout, same as before v0.54)', sb.__calls.earnXc[0][0] === 40);
  } finally {
    global.setTimeout = realSetTimeout;
  }
} else {
  fail++;
  console.log('FAIL: sandbox did not build -- skipping behavioral checks');
}

console.log('\\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
