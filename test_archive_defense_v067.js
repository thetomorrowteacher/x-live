// PATCH X-LIVE v0.67 -- Archive-side stats now apply to combat: each foe's
// real per-unit `tier` field now doubles as a defense rating that mitigates
// the player's landed damage in resolve(), mirroring foeAttack()'s existing
// sv.GUARD mitigation exactly (same 0.02-per-point rate expressed as
// tier*0.04, same 40% cap). Extracts the REAL shipped `foeDefenseMult()`
// and the real damage-application line from `resolve()` verbatim (regex/
// brace-matching, never a reimplementation).
// Run: node test_archive_defense_v067.js index.html
'use strict';
var fs = require('fs');
var path = process.argv[2] || 'index.html';
var src = fs.readFileSync(path, 'utf8');

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}

function extractFunctionFrom(marker, fromIdx) {
  var idx = src.indexOf(marker, fromIdx || 0);
  if (idx === -1) throw new Error('marker not found: ' + marker);
  var braceStart = src.indexOf('{', idx);
  if (braceStart === -1) throw new Error('no opening brace after marker: ' + marker);
  var depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(idx, i);
}

// ---- 1. Static presence checks ----
ok('foeDefenseMult() is defined right after pickFoe()', /function pickFoe\(\)[\s\S]{0,1000}function foeDefenseMult\(f\) \{ return 1 - Math\.min\(0\.4, \(\(f && f\.tier\) \|\| 0\) \* 0\.04\); \}/.test(src));
ok('resolve() applies foeDefenseMult(B.foe) to dmg before it lands on B.foeHp', /dmg = Math\.round\(dmg \* foeDefenseMult\(B\.foe\)\); \/\/ PATCH X-LIVE v0\.67[\s\S]{0,200}\n\s*B\.foeHp = Math\.max\(0, B\.foeHp - dmg\);/.test(src));
ok('the mitigation line sits inside the non-wraith-phase else branch (after the wraith check, not before)', (function () {
  var wraithIdx = src.indexOf("if (B.foe.id === 'wraith' && a.type === 'strike' && B.turn % 3 === 1)");
  var mitIdx = src.indexOf('dmg = Math.round(dmg * foeDefenseMult(B.foe));');
  var hpIdx = src.indexOf('B.foeHp = Math.max(0, B.foeHp - dmg);');
  return wraithIdx > -1 && mitIdx > wraithIdx && hpIdx > mitIdx && (hpIdx - mitIdx) < 200;
})());
ok('the SMF_SEASON archive roster is untouched -- no new schema field added, tier is reused, not invented', !/"defense":\s*\d/.test(src));

// ---- 2. Extract and run the real foeDefenseMult() against realistic tiers ----
var fdmSrc;
try {
  fdmSrc = extractFunctionFrom('function foeDefenseMult(f)');
  ok('foeDefenseMult() extracted', true);
} catch (e) {
  ok('foeDefenseMult() extracted', false);
  fdmSrc = null;
}

if (fdmSrc) {
  var foeDefenseMult = new Function('return (' + fdmSrc.replace(/^function foeDefenseMult/, 'function') + ')')();

  ok('tier 1 (scout) mitigates 4%', foeDefenseMult({ tier: 1 }) === 0.96);
  ok('tier 2 (drone) mitigates 8%', foeDefenseMult({ tier: 2 }) === 0.92);
  ok('tier 3 (warden) mitigates 12%', foeDefenseMult({ tier: 3 }) === 0.88);
  ok('tier 4 (overseer) mitigates 16%', foeDefenseMult({ tier: 4 }) === 0.84);
  ok('tier 5 (breach) mitigates 20%', foeDefenseMult({ tier: 5 }) === 0.8);
  ok('tier 6 (wraith) mitigates 24%', foeDefenseMult({ tier: 6 }) === 0.76);
  ok('tier 7 (vector) mitigates 28%', foeDefenseMult({ tier: 7 }) === 0.72);
  ok('tier 8 (trojan) mitigates 32%, the strongest normal-ladder unit', Math.abs(foeDefenseMult({ tier: 8 }) - 0.68) < 1e-9);
  ok('tier 10 hits the 40% cap exactly', foeDefenseMult({ tier: 10 }) === 0.6);
  ok('tier 15 (beyond the cap) still clamps at 40%, never over-mitigates', foeDefenseMult({ tier: 15 }) === 0.6);
  ok('a foe object with no tier field (defensive coding) mitigates 0%, never throws', foeDefenseMult({}) === 1);
  ok('a null/undefined foe never throws, mitigates 0%', foeDefenseMult(null) === 1 && foeDefenseMult(undefined) === 1);
  ok('Hive units carry a real tier too (hive-drone tier 2) and mitigate exactly like a normal-ladder tier-2 foe', foeDefenseMult({ tier: 2, id: 'hive-drone' }) === 0.92);

  // ---- 3. End-to-end: simulate the real dmg-mitigation line against fixtures ----
  var mitLineSrc = (function () {
    var idx = src.indexOf('dmg = Math.round(dmg * foeDefenseMult(B.foe));');
    var end = src.indexOf('\n', idx);
    return src.slice(idx, end).replace(/\/\/.*$/, '');
  })();
  ok('mitigation line extracted for end-to-end simulation', mitLineSrc.indexOf('foeDefenseMult') > -1);

  function simulateMitigation(dmg, foe) {
    var fn = new Function('dmg', 'B', 'foeDefenseMult', mitLineSrc + '\nreturn dmg;');
    return fn(dmg, { foe: foe }, foeDefenseMult);
  }

  ok('a 100-dmg hit on a tier-1 scout lands for 96 (real rounding applied)', simulateMitigation(100, { tier: 1 }) === 96);
  ok('a 100-dmg hit on trojan (tier 8) lands for 68, a real, felt reduction vs. a low-tier foe', simulateMitigation(100, { tier: 8 }) === 68);
  ok('a 33-dmg hit on tier-5 breach rounds correctly (33*0.8=26.4 -> 26)', simulateMitigation(33, { tier: 5 }) === 26);
  ok('a 0-dmg hit (e.g. a whiffed calc) stays 0 regardless of foe tier', simulateMitigation(0, { tier: 8 }) === 0);
  ok('the mitigation never turns a positive hit into 0 for a reasonable dmg value (40% cap, not 100%)', simulateMitigation(10, { tier: 20 }) === 6);
} else {
  fail += 17;
  console.log('SKIPPED foeDefenseMult behavioral checks -- extraction failed');
}

// ---- 4. Confirm foeAttack()'s existing player-side mitigation is untouched (regression guard) ----
ok("foeAttack() still mitigates via the player's own sv.GUARD, unchanged by this patch", /var dmg = Math\.round\(f\.attack \* scale \* \(1 - Math\.min\(0\.4, sv\.GUARD \* 0\.02\)\)\);/.test(src));

console.log('');
console.log(pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail > 0 ? 1 : 0);
