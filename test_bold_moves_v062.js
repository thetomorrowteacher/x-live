// PATCH X-LIVE v0.62 -- bold, standout move-selection buttons for the
// Archive Battle move panel. Tests the real shipped code: extracts the
// real AB_TYPE_INFO map and abBattleHTML() function (brace/string
// matching against the actual source, never a reimplementation), and
// proves the battle move panel actually calls abBattleHTML() now, not
// the old, still-intact abHTML() (which stays wired to the Evo Bay's
// plain ability-list display, untouched).
// Run: node test_bold_moves_v062.js index.html
'use strict';
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.log('FAIL:', label); } }

function extractVar(name) {
  const marker = 'var ' + name + ' = {';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('not found: var ' + name);
  const braceStart = src.indexOf('{', idx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}
function extractFn(name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx === -1) throw new Error('not found: ' + name);
  const braceStart = src.indexOf('{', idx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}

// ---- AB_TYPE_INFO is a real, complete, pure data map -- extract and run ----
const typeInfoSrc = extractVar('AB_TYPE_INFO');
const abBattleSrc = extractFn('abBattleHTML');

function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

function makeSandbox(orbs) {
  const g = new Function('esc', 'story', typeInfoSrc + '\n' + abBattleSrc + '\nreturn { AB_TYPE_INFO: AB_TYPE_INFO, abBattleHTML: abBattleHTML };');
  return g(esc, function () { return { orbs: orbs }; });
}

// ---- Real type registry checks (accurate, not fabricated) ----
const sb0 = makeSandbox(0);
ok(sb0.AB_TYPE_INFO.strike.label === 'STRIKE' && sb0.AB_TYPE_INFO.strike.tag === 'DMG', 'strike maps to a real STRIKE/DMG descriptor');
ok(sb0.AB_TYPE_INFO.guard.label === 'GUARD' && sb0.AB_TYPE_INFO.guard.tag === 'DEF', 'guard maps to a real GUARD/DEF descriptor');
ok(sb0.AB_TYPE_INFO.support.label === 'SUPPORT' && sb0.AB_TYPE_INFO.support.tag === 'BUFF', 'support maps to a real SUPPORT/BUFF descriptor');
ok(sb0.AB_TYPE_INFO.hack.label === 'HACK' && sb0.AB_TYPE_INFO.hack.tag === 'DEBUFF', 'hack maps to a real HACK/DEBUFF descriptor');
ok(typeof sb0.AB_TYPE_INFO.strike.color === 'string' && /^#[0-9a-f]{6}$/i.test(sb0.AB_TYPE_INFO.strike.color), 'each type carries a real hex accent color for the --ab-color CSS var');

// ---- abBattleHTML(): real ability objects (matching game data shapes) ----
const strikeAb = { id: 'gear-bite', name: 'Gear Bite', type: 'strike', power: 12, cost: 0, text: 'A quick bite. Always available.' };
const guardAb = { id: 'plate-up', name: 'Plate Up', type: 'guard', power: 0, cost: 2, text: 'Halve the next hit taken.' };
const supportAb = { id: 'harmonize', name: 'Harmonize', type: 'support', power: 12, cost: 2, text: 'Recover HP equal to power.' };
const hackAb = { id: 'arc-lance', name: 'Arc Lance', type: 'hack', power: 20, cost: 4, text: 'A line of welding light. Ignores Archive shields.' };
const unknownTypeAb = { id: 'mystery', name: 'Mystery Move', type: 'zzz', power: 5, cost: 0, text: 'An undocumented move type.' };

const sbPlenty = makeSandbox(99);
const strikeHtml = sbPlenty.abBattleHTML(strikeAb);
ok(strikeHtml.indexOf('class="ab-bold"') !== -1, 'a battle move button uses the new bold class, not the old plain .ab class');
ok(strikeHtml.indexOf('data-ab="gear-bite"') !== -1, 'the real data-ab id is preserved (click wiring depends on this exact attribute)');
ok(strikeHtml.indexOf('--ab-color:#ff5a3c') !== -1, 'the strike button carries its real per-type accent color as an inline CSS var');
ok(strikeHtml.indexOf('⚔️ STRIKE') !== -1, 'the strike button shows a real STRIKE type descriptor with its icon');
ok(strikeHtml.indexOf('FREE') !== -1, 'a zero-cost move is labeled FREE, not "0 ORBS"');
ok(strikeHtml.indexOf('DMG 12') !== -1, 'the strike button shows its real power number tagged DMG (damage), read off the real ability object');
ok(strikeHtml.indexOf('Gear Bite') !== -1, 'the real move name is shown');
ok(strikeHtml.indexOf('A quick bite. Always available.') !== -1, "the ability's real, unfabricated effect text is shown, not a generic description");
ok(strikeHtml.indexOf('disabled') === -1, 'an affordable move (99 orbs available, cost 0) does not render disabled');

const guardHtml = sbPlenty.abBattleHTML(guardAb);
ok(guardHtml.indexOf('DEF 0') === -1 && guardHtml.indexOf('<span class="ab-bold-power">') === -1, 'a zero-power move (Plate Up, a pure guard effect) does not show a fabricated "DEF 0" power badge');
ok(guardHtml.indexOf('2 ORBS') !== -1, 'a real >1 cost move is pluralized correctly (2 ORBS)');
ok(guardHtml.indexOf('🛡️ GUARD') !== -1, 'the guard button shows a real GUARD type descriptor with its icon');
ok(guardHtml.indexOf('Halve the next hit taken.') !== -1, "guard's real effect text is shown, matching the shield/defense descriptor Ennis asked for");

const supportHtml = sbPlenty.abBattleHTML(supportAb);
ok(supportHtml.indexOf('💫 SUPPORT') !== -1, 'the support button shows a real SUPPORT type descriptor with its icon');
ok(supportHtml.indexOf('BUFF 12') !== -1, 'a support move shows its real power tagged BUFF, not DMG (type-specific tag, not hardcoded)');

const hackHtml = sbPlenty.abBattleHTML(hackAb);
ok(hackHtml.indexOf('🖥️ HACK') !== -1, 'the hack button shows a real HACK type descriptor with its icon');
ok(hackHtml.indexOf('DEBUFF 20') !== -1, 'a hack move shows its real power tagged DEBUFF');
ok(hackHtml.indexOf('4 ORBS') !== -1, 'a real cost of 4 renders as "4 ORBS"');

const unknownHtml = sbPlenty.abBattleHTML(unknownTypeAb);
ok(unknownHtml.indexOf('STRIKE') !== -1 && unknownHtml.indexOf('--ab-color:#ff5a3c') !== -1, 'an unrecognized ability type falls back safely to the strike descriptor rather than rendering undefined/blank');

// ---- Affordability gating (the real spend-check, matching abHTML()'s own logic) ----
const sbPoor = makeSandbox(1);
const unaffordableHtml = sbPoor.abBattleHTML(guardAb); // costs 2, only 1 orb available
ok(unaffordableHtml.indexOf(' disabled') !== -1, 'a move costing more than the available orbs renders disabled');
const affordableHtml = sbPoor.abBattleHTML(strikeAb); // free
ok(affordableHtml.indexOf(' disabled') === -1, 'a free move stays enabled even with 1 orb available');
const sbExact = makeSandbox(2);
ok(sbExact.abBattleHTML(guardAb).indexOf(' disabled') === -1, 'a move costing exactly the available orbs is NOT disabled (afford is <=, matching abHTML()\'s own > check)');

// ---- XSS-safety: name/text still pass through the real esc() ----
const evilAb = { id: 'x', name: '<script>bad</script>', type: 'strike', power: 1, cost: 0, text: '<img onerror=1>' };
const evilHtml = sbPlenty.abBattleHTML(evilAb);
ok(evilHtml.indexOf('<script>') === -1 && evilHtml.indexOf('&lt;script&gt;') !== -1, 'a malicious ability name is escaped, not rendered as raw HTML');
ok(evilHtml.indexOf('<img onerror=1>') === -1, 'malicious ability text is escaped too');

// ---- Real wiring: the battle move panel call site uses abBattleHTML(), not abHTML() ----
const callSiteIdx = src.indexOf('class="abil abil-bold"');
ok(callSiteIdx !== -1, 'the battle move panel container carries the new abil-bold modifier class');
const callSiteWindow = src.slice(callSiteIdx, callSiteIdx + 260);
ok(callSiteWindow.indexOf('abBattleHTML(a)') !== -1, 'the battle move panel maps abilities() through the new abBattleHTML(), not the old abHTML(a, true)');
ok(callSiteWindow.indexOf('abHTML(a, true)') === -1, 'the old asButton=true call is gone from the battle move panel (fully replaced, not left dangling)');
ok(callSiteWindow.indexOf("B.disabled === a.id") !== -1 && callSiteWindow.indexOf("s.replace('<button ', '<button disabled ')") !== -1, 'the existing foe-disabled-my-ability mechanic (B.disabled) is preserved unchanged on top of the new button markup');

// ---- Regression guard: abHTML() itself (Evo Bay's plain list) is untouched ----
const abHtmlSrc = extractFn('abHTML');
ok(abHtmlSrc.indexOf("class=\"ab\"") !== -1 || abHtmlSrc.indexOf('class=\\"ab\\"') !== -1 || /class=.ab./.test(abHtmlSrc), 'abHTML() still emits the original plain .ab class (Evo Bay display unaffected by this patch)');
const evoBayCallIdx = src.indexOf("abilities().map(function (a) { return abHTML(a, false); })");
ok(evoBayCallIdx !== -1, "the Evo Bay's own ability-list render (abHTML(a, false)) is completely unchanged by this patch");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
