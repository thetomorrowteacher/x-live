// PATCH X-LIVE v0.61 -- title screen + skippable tutorial before every
// Archive Battle match. Tests the real shipped code: a pure standalone
// extraction of xlBattleIntroLabel() (zero external deps, run directly),
// plus structural assertions against the real source proving the wiring
// is correct (the exact class of bug this patch itself shipped once --
// a bad nested-quote escape that broke every FIGHT/HIVE/SPAR button --
// is specifically covered below so it can never regress silently).
// Run: node test_title_screen_v061.js index.html
'use strict';
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.log('FAIL:', label); } }

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
function extractWindowFn(name) {
  const marker = 'window.' + name + ' = function';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('not found: window.' + name);
  const braceStart = src.indexOf('{', idx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}

// ---- xlBattleIntroLabel() is a pure function -- extract and run for real ----
const labelSrc = extractFn('xlBattleIntroLabel');
const labelFn = new Function('mode', labelSrc + '\nreturn xlBattleIntroLabel(mode);');

const fight = labelFn('fight');
ok(fight.title === 'EVO CLASH' && fight.tint === 'cyan', 'xlBattleIntroLabel("fight") returns the real EVO CLASH / cyan label (renamed from Archive Battle in PATCH X-LIVE v0.63)');

const hive = labelFn('hive');
ok(hive.title === 'THE HIVE' && hive.tint === 'crit', 'xlBattleIntroLabel("hive") returns the real THE HIVE / crit label, distinct from a normal fight');

const spar = labelFn('spar');
ok(spar.title === 'PLAYER DUEL' && spar.tint === 'cyan', 'xlBattleIntroLabel("spar") returns the real PLAYER DUEL label');

const unknown = labelFn('bogus');
ok(unknown.title === 'EVO CLASH', 'an unrecognized mode falls back to the plain EVO CLASH label (fails safe, never blank)');

// ---- xlBattleStartSequence: real wiring checks ----
const startSeqSrc = extractWindowFn('xlBattleStartSequence');
ok(startSeqSrc.indexOf('clearTimeout(xlBattleIntroTimer)') !== -1, 'starting a new intro sequence cancels any prior pending auto-advance timer (never two intros racing)');
ok(startSeqSrc.indexOf("mode || 'fight'") !== -1, 'a missing/falsy mode safely defaults to a fight intro rather than showing a blank state');
ok(startSeqSrc.indexOf('window.PflxFx.slam') !== -1, 'the intro reuses the real PflxFx.slam() primitive shipped in v0.60, not a separate new animation');
ok(startSeqSrc.indexOf("setTimeout(function () { xlBattleShowAutoTutorial(); }, 1600)") !== -1, 'PATCH X-LIVE v0.71 -- the intro now auto-opens the how-to-play tutorial 1.6s after the title card (previously it advanced straight into the match)');

// ---- xlBattleSkipIntro: real wiring checks ----
const skipSrc = extractWindowFn('xlBattleSkipIntro');
ok(skipSrc.indexOf('clearTimeout(xlBattleIntroTimer)') !== -1, 'SKIP cancels the pending auto-advance timer (does not double-fire the match start)');
ok(skipSrc.indexOf('xlBattleAdvanceIntro()') !== -1, 'SKIP immediately advances into the real match rather than just hiding the intro');

// ---- xlBattleAdvanceIntro: dispatches to the right real starter per mode ----
const advanceSrc = extractFn('xlBattleAdvanceIntro');
ok(advanceSrc.indexOf("mode === 'hive'") !== -1 && advanceSrc.indexOf('xlHiveNew()') !== -1, 'a hive intro advances into the real xlHiveNew()');
ok(advanceSrc.indexOf("mode === 'spar'") !== -1 && advanceSrc.indexOf('xlSparOpen()') !== -1, 'a spar intro advances into the real xlSparOpen()');
ok(advanceSrc.indexOf('else xlBattleNew();') !== -1, 'a plain fight intro (the else branch) advances into the real xlBattleNew()');
ok(advanceSrc.indexOf('xlBattleIntro = null; xlBattleIntroTimer = null;') !== -1, 'advancing always clears both intro state vars so the intro never lingers/re-triggers');

// ---- xlBattleTutorial: real modal wiring ----
// PATCH X-LIVE v0.71 -- the tutorial's actual content moved into a new
// shared xlBattleTutorialHtml(confirmOnclick, confirmLabel) builder,
// reused identically by both this manual-open path and the new
// auto-tutorial path (xlBattleShowAutoTutorial). xlBattleTutorial() itself
// is now just a thin caller of that shared builder.
const tutorialSrc = extractWindowFn('xlBattleTutorial');
ok(tutorialSrc.indexOf('modal(') !== -1, 'the tutorial reuses the real, existing modal() primitive rather than a bespoke popup');
ok(tutorialSrc.indexOf("xlBattleTutorialHtml('modalClose()', 'GOT IT')") !== -1, 'the manual tutorial open reuses the shared xlBattleTutorialHtml builder, dismissible via the real modalClose()');
function extractPlainFn(name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx === -1) throw new Error('not found: ' + name);
  const braceStart = src.indexOf('{', idx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } }
  return src.slice(idx, i + 1);
}
const tutHtmlSrc = extractPlainFn('xlBattleTutorialHtml');
ok(tutHtmlSrc.indexOf('HOW TO PLAY') !== -1, 'the shared tutorial builder has a real title');
ok(/1\. Pick a move.*2\. Answer the question.*3\. Watch for crits.*4\. Orbs are your energy.*5\. Win to level up/s.test(tutHtmlSrc), 'the shared tutorial builder covers all 5 real steps in order (moves, questions, crits, orbs, progression)');

// ---- Landing card wiring: THIS is the exact bug class this patch shipped
// and fixed once already (unescaped single quotes inside an onclick
// attribute broke every button) -- assert the real, fixed, correctly-
// escaped call sites so a future edit can never silently reintroduce it. ----
const htmlSrc = extractWindowFn('xlBattleHTML');
ok(htmlSrc.indexOf("onclick=\"xlBattleStartSequence(\\'fight\\')\"") !== -1, 'FIGHT THE ARCHIVE calls xlBattleStartSequence with correctly ESCAPED nested quotes (regression guard for the exact quoting bug this patch fixed)');
ok(htmlSrc.indexOf("onclick=\"xlBattleStartSequence(\\'hive\\')\"") !== -1, 'the HIVE ALERT button routes through the intro sequence with correctly escaped quotes');
ok(htmlSrc.indexOf("onclick=\"xlBattleStartSequence(\\'spar\\')\"") !== -1, 'the SPAR A PLAYER button routes through the intro sequence with correctly escaped quotes');
ok(htmlSrc.indexOf('onclick="xlBattleTutorial()"') !== -1, 'a real HOW TO PLAY button is present on the landing card');
ok(htmlSrc.indexOf('if (xlBattleIntro)') !== -1 && htmlSrc.indexOf('xlBattleSkipIntro()') !== -1, 'the render function shows a real SKIP button while an intro is active');
// The intro-screen render branch must come BEFORE the !B landing-card
// branch, or a fresh page load would never see the very first intro.
const introIdx = htmlSrc.indexOf('if (xlBattleIntro)');
const landingIdx = htmlSrc.indexOf("if (!B) return");
ok(introIdx !== -1 && landingIdx !== -1 && introIdx < landingIdx, 'the intro-screen check is ordered before the plain landing-card check');

// ---- Result-screen replay buttons also go through the title sequence,
// not straight back into combat (Ennis: "before the match starts", which
// reasonably includes a replay, not just the player's very first fight). ----
ok(src.indexOf("onclick=\"xlBattleStartSequence(\\'fight\\')\">KEEP PLAYING") !== -1, 'KEEP PLAYING (after a win) restarts through the real title sequence, not straight back into combat');
ok(src.indexOf("onclick=\"xlBattleStartSequence(\\'fight\\')\">TRY AGAIN") !== -1, 'TRY AGAIN (after a loss) restarts through the real title sequence, not straight back into combat');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
