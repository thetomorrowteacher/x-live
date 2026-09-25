// PATCH X-LIVE v0.64 -- Ennis: "There should be a animation representing a
// swing....then an animation for a hit, miss, critical hit, etc. This
// should happen for the Archive move and for the Evo's move. Add SFX."
// The player's side (resolve()) already had swing + PflxFx.slam()
// HIT/CRITICAL HIT/MISS banners + SFX since v0.60. The Archive's own
// counter-attack (foeAttack()) had swing (B.actFoe) and a hit-flash + SFX
// on a landed hit, but NO PflxFx.slam() banner at all, and the B.dodge > 0
// miss branch had ZERO feedback beyond a text log line. This patch closes
// that gap. Extracts the REAL shipped foeAttack() function (brace-counting,
// same technique used all session) and runs it end-to-end against a small
// hand-rolled fake battle state -- not a reimplementation of the logic.
// Run: node test_foe_battle_fx_v064.js index.html
'use strict';
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.log('FAIL:', label); } }

// ---- extract the real foeAttack(scale) function verbatim, via brace counting ----
function extractFunction(source, signature) {
  const startIdx = source.indexOf(signature);
  if (startIdx === -1) throw new Error('signature not found: ' + signature);
  const braceStart = source.indexOf('{', startIdx);
  let depth = 0, i = braceStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  return source.slice(startIdx, i + 1);
}

const foeAttackSrc = extractFunction(src, 'function foeAttack(scale) {');
const resolveSrc = extractFunction(src, 'function resolve(a, correct) {');

// ---- static checks on the extracted real source ----
ok(foeAttackSrc.indexOf("xlSfx('battleDodge');") !== -1, 'the dodge branch now plays a real SFX cue (updated PATCH X-LIVE v0.69: battleDodge, a dedicated swoosh, not the old generic freeze cue)');
ok(foeAttackSrc.indexOf("window.PflxFx.slam('MISS', { sub: 'DODGED', tint: 'cyan' });") !== -1, 'the dodge branch now shows a real MISS/DODGED banner');
ok(foeAttackSrc.indexOf("say(f.name + ' attacks and misses.', 'fo');") !== -1, 'the original dodge text-log line is untouched (regression guard)');
ok(foeAttackSrc.indexOf('var foeCrit = false;') !== -1, 'a foeCrit flag now exists');
ok(foeAttackSrc.indexOf('foeCrit = true;') !== -1, "Probe-charged sets foeCrit true (the foe's one existing \"bigger hit\" mechanic)");
ok(foeAttackSrc.indexOf("window.PflxFx.slam(foeCrit ? 'CRITICAL HIT' : 'HIT', { sub: dmg + ' DMG', tint: foeCrit ? 'crit' : 'fail', shake: foeCrit });") !== -1, 'the landed-hit branch now shows a real HIT/CRITICAL HIT banner keyed off foeCrit');
ok(foeAttackSrc.indexOf("if (typeof xlSfx === 'function') xlSfx('battleFoeHit');") !== -1, 'the original v0.52 battleFoeHit SFX call is untouched (regression guard)');
ok(foeAttackSrc.indexOf("window.PflxFx.slam('HIT', { sub: dmg2 + ' DMG', tint: 'fail' });") !== -1, "Vector's second strike also shows a HIT banner");
ok(foeAttackSrc.indexOf('B.actFoe = true;') !== -1, "the foe's existing v0.50 swing animation trigger is untouched (regression guard)");

ok(resolveSrc.indexOf("window.PflxFx.slam(crit ? 'CRITICAL HIT' : (correct ? 'HIT' : 'MISS'), { sub: Math.round(mult * 100) + '% DMG', tint: crit ? 'crit' : (correct ? 'cyan' : 'fail'), shake: crit });") !== -1, "the player's own v0.60 HIT/CRITICAL HIT/MISS banner in resolve() is completely untouched by this patch");

// ---- behavioral: run the real extracted foeAttack() against a fake battle state ----
function makeSandbox(overrides) {
  const calls = { xlSfx: [], slam: [], say: [], flashOff: [] };
  const B = Object.assign({
    foe: { id: 'scout', attack: 20, name: 'Archive Scout' },
    sv: { GUARD: 0 },
    dodge: 0, guard: 0, foeSilenced: false, disabled: null, hp: 100, actFoe: false, hitMe: false, turn: 0
  }, overrides || {});
  function say(t, cls) { calls.say.push({ t: t, cls: cls }); }
  function flashOff(keys, ms) { calls.flashOff.push({ keys: keys, ms: ms }); }
  function xlSfx(name) { calls.xlSfx.push(name); return null; }
  function abilities() { return [{ id: 'stub-ability', name: 'Stub Ability' }]; }
  const window = { PflxFx: { slam: function (text, opts) { calls.slam.push({ text: text, opts: opts }); return true; } } };
  const fn = new Function('B', 'say', 'flashOff', 'xlSfx', 'abilities', 'window', 'Math', 'Object',
    'return (' + foeAttackSrc.replace('function foeAttack', 'function ') + ')');
  const foeAttack = fn(B, say, flashOff, xlSfx, abilities, window, Math, Object);
  return { B: B, calls: calls, foeAttack: foeAttack };
}

// 1. Dodge branch: MISS banner + freeze SFX, no damage applied, returns early
{
  const s = makeSandbox({ dodge: 1, hp: 100 });
  s.foeAttack(1);
  ok(s.B.dodge === 0, 'dodge counter decremented on a dodge');
  ok(s.B.hp === 100, 'no damage applied on a dodge');
  ok(s.calls.xlSfx.indexOf('battleDodge') !== -1, 'battleDodge SFX fired on a dodge (updated PATCH X-LIVE v0.69: was freeze)');
  ok(s.calls.slam.length === 1 && s.calls.slam[0].text === 'MISS' && s.calls.slam[0].opts.sub === 'DODGED' && s.calls.slam[0].opts.tint === 'cyan', 'exactly one MISS/DODGED/cyan slam banner fired on a dodge');
  ok(s.calls.xlSfx.indexOf('battleFoeHit') === -1, 'battleFoeHit SFX never fires on a dodge (regression guard -- dodge and landed-hit paths stay mutually exclusive)');
}

// 2. Normal landed hit (non-scout, non-crit-turn): HIT banner, no shake
{
  const s = makeSandbox({ foe: { id: 'drone', attack: 20, name: 'Archive Drone' }, dodge: 0, hp: 100 });
  s.foeAttack(1);
  ok(s.B.hp < 100, 'damage applied on a normal landed hit');
  ok(s.calls.slam.length === 1, 'exactly one slam banner fired on a normal hit');
  ok(s.calls.slam[0].text === 'HIT', 'a normal landed hit shows HIT, not CRITICAL HIT');
  ok(s.calls.slam[0].opts.tint === 'fail', 'a normal landed hit uses the fail (red/danger) tint');
  ok(s.calls.slam[0].opts.shake === false, 'a normal landed hit does not shake');
  ok(/^\d+ DMG$/.test(s.calls.slam[0].opts.sub), 'the HIT banner subtitle is a real "N DMG" figure, not an invented number');
  ok(s.calls.xlSfx.indexOf('battleFoeHit') !== -1, 'battleFoeHit SFX still fires on a normal landed hit (regression guard)');
}

// 3. Scout's Probe-charged turn (B.turn % 3 === 2): CRITICAL HIT banner, shake true
{
  const s = makeSandbox({ foe: { id: 'scout', attack: 20, name: 'Archive Scout' }, dodge: 0, hp: 100, turn: 2 });
  s.foeAttack(1);
  ok(s.calls.slam.length === 1 && s.calls.slam[0].text === 'CRITICAL HIT', 'Probe-charged fires a CRITICAL HIT banner');
  ok(s.calls.slam[0].opts.tint === 'crit', 'a foe crit uses the crit (gold) tint, matching the player-side convention');
  ok(s.calls.slam[0].opts.shake === true, 'a foe crit shakes the screen');
}

// 4. Non-Probe-charged scout turn: still just a normal HIT (foeCrit only true on the exact charged turn)
{
  const s = makeSandbox({ foe: { id: 'scout', attack: 20, name: 'Archive Scout' }, dodge: 0, hp: 100, turn: 1 });
  s.foeAttack(1);
  ok(s.calls.slam[0].text === 'HIT', 'a scout turn that is NOT the Probe-charged turn is a normal HIT, not a crit');
}

// 5. Vector's second strike also fires its own HIT banner (parity across every Archive move within a turn)
{
  const s = makeSandbox({ foe: { id: 'vector', attack: 20, name: 'Vector' }, dodge: 0, hp: 200, guard: 0 });
  s.foeAttack(1);
  ok(s.calls.slam.length === 2, "Vector's turn fires two slam banners (main strike + second strike)");
  ok(s.calls.slam[0].text === 'HIT' && s.calls.slam[1].text === 'HIT', 'both of Vector\'s strikes show HIT banners');
}

// 6. Vector's second strike does NOT fire on a scaled-down (wrong-answer free hit) turn -- regression guard on existing v0.54 gating
{
  const s = makeSandbox({ foe: { id: 'vector', attack: 20, name: 'Vector' }, dodge: 0, hp: 200, guard: 0 });
  s.foeAttack(0.7);
  ok(s.calls.slam.length === 1, "Vector's second strike is correctly gated off on a scale !== 1 turn (unchanged v0.54 behavior)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
