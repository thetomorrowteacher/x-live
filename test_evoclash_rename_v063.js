// PATCH X-LIVE v0.63 -- rename "Archive Battle" to "Evo Clash" (Ennis:
// the first official game mode of the new Evo card-lore system). Tests
// the real shipped source: every live, player-facing string that named
// the mode now says EVO CLASH, while the Archive faction name (the
// enemy roster, "FIGHT THE ARCHIVE", etc.) is untouched, and the old
// name is preserved verbatim in historical version-header changelog
// text (those describe what past patches did at the time and should
// never be silently rewritten).
// Run: node test_evoclash_rename_v063.js index.html
'use strict';
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.log('FAIL:', label); } }

// ---- Live, player-facing strings renamed ----
ok(src.indexOf("'\\u2694\\uFE0F EVO CLASH'") !== -1, 'the Studio Hub pill-row tab reads EVO CLASH');
ok(src.indexOf("'\\u2694\\uFE0F ARCHIVE BATTLE'") === -1, 'the old ARCHIVE BATTLE pill-row tab string is gone');
ok(src.indexOf(": { title: 'EVO CLASH', sub: 'PREPARE FOR BATTLE', tint: 'cyan' };") !== -1, 'the title-screen intro label (fight mode) reads EVO CLASH');
ok(src.indexOf('HOW TO PLAY \\u2014 EVO CLASH') !== -1, 'the tutorial modal header reads EVO CLASH');
ok(src.indexOf('EVO CLASH</div><div class="xl-hint" style="text-align:left">Hatch your Evo first') !== -1, "the Evo Bay's pre-hatch hint header reads EVO CLASH");
ok(src.indexOf('text-align:left">⚔️ EVO CLASH</div><div class="xl-hint">Turn based.') !== -1, 'the real mode-select landing card header reads EVO CLASH');
ok(src.indexOf("'award', 'Evo Clash: ' + (B.hive ? 'The Hive' : f.name) + ' down'") !== -1, 'the play-by-play win log line reads "Evo Clash: <foe> down"');
ok(src.indexOf('"archive-battle": {"name": "Evo Clash"') !== -1, 'the SMF_SEASON design-spec "archive-battle" game entry name reads Evo Clash');
ok(src.indexOf('"battle": {"name": "Evo Clash"') !== -1, 'the SMF_SEASON design-spec "battle" rules-block name reads Evo Clash');

// ---- The Archive faction name (the enemy roster) is untouched -- this is a rename of the GAME MODE, not the antagonist lore ----
ok(src.indexOf('FIGHT THE ARCHIVE') !== -1, 'the FIGHT THE ARCHIVE action button is untouched (Archive stays the enemy faction name)');
ok(src.indexOf('"name": "Archive Scout"') !== -1, 'the Archive Scout roster entry is untouched');
ok(src.indexOf('"name": "The Archive Core"') !== -1, 'The Archive Core season-boss entry is untouched');
ok(src.indexOf('HIVE ALERT') !== -1, 'the Hive Alert entry point is untouched (a separate boss-tier feature, not the mode name)');

// ---- Historical changelog text (old version-header entries) is preserved verbatim, not rewritten ----
ok(src.indexOf('treatment (ARCHIVE BATTLE / THE HIVE / PL') !== -1, 'the v0.60 changelog entry still describes the FX it shipped using the name that was live at the time (history is not rewritten)');
ok(src.indexOf('whenever the ARCHIVE BATTLE hub pane is ope') !== -1, 'the v0.50 changelog entry is preserved verbatim');

// ---- Wiring: xlBattleIntroLabel's non-fight branches (hive/spar) are untouched by this rename ----
ok(src.indexOf("{ title: 'THE HIVE', sub: 'SWARM ENCOUNTER', tint: 'crit' }") !== -1, 'the Hive intro label is unaffected by the mode rename');
ok(src.indexOf("{ title: 'PLAYER DUEL', sub: 'SPAR -- PRACTICE MATCH', tint: 'cyan' }") !== -1, 'the Spar intro label is unaffected by the mode rename');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
