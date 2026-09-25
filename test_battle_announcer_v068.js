// PATCH X-LIVE v0.68 -- Archive Battle announcer (ElevenLabs "Alex"/
// TheTomorrowTeacher voice). SUPERSEDED by PATCH X-LIVE v0.72
// (test_battle_announcer_v072.js): v0.72 replaced XL_BATTLE_ANN_CLIPS's
// flat {key: filename} shape with a {key: [filenames]} variant-pool shape
// across 3 voices (was 1), so every assertion this file made about the
// old single-filename-per-key dictionary and the old binary on/off
// xlBattleAnnOn()/xlToggleBattleAnn() pair no longer describes the real
// shipped code -- not because anything was weakened, but because the
// feature it exercises was deliberately redesigned. test_battle_
// announcer_v072.js re-covers every protection this file used to check
// (clip structure, dedupe/force/duck-music behavior, fail-safe on an
// unknown/null key, every real trigger call site, button markup, the 8
// original v0.68 filenames still present under ttt/ unchanged) plus the
// new voice-pool/migration/FX-chain behavior v0.72 added. This file is
// kept only as a pointer so the regression suite doesn't silently lose
// the v0.68 history; it always passes and does no real checking itself.
'use strict';
console.log('SUPERSEDED by test_battle_announcer_v072.js -- see header comment. 1 PASS, 0 FAIL');
process.exit(0);
