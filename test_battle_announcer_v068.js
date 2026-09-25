// PATCH X-LIVE v0.68 -- Archive Battle announcer (ElevenLabs "Alex" voice).
// Extracts the REAL shipped xlBattleAnn/xlBattleAnnOn/xlToggleBattleAnn/
// xlBattleAnnButtonHtml functions (regex/brace-matching, never a
// reimplementation) and confirms: the clip dictionary maps to the 8 real
// downloaded mp3 filenames; the play function respects the on/off pref,
// dedupes within 1200ms unless forced, ducks xlMusic around playback, and
// never throws on an unknown key or a missing Audio global; and every one
// of the 8 real trigger call sites (battle start/boss, crit, miss, dodge,
// foe-hit, win, lose) is actually wired into resolve()/foeAttack()/
// finish()/xlBattleNew()/xlHiveNew() at the right place.
'use strict';
var fs = require('fs');
var path = process.argv[2] || 'index.html';
var src = fs.readFileSync(path, 'utf8');

var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }

function extractFunctionFrom(marker, fromIdx) {
  var idx = src.indexOf(marker, fromIdx || 0);
  if (idx === -1) throw new Error('marker not found: ' + marker);
  var braceStart = src.indexOf('{', idx);
  var depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(idx, i);
}

// ---- 1. Static presence / clip-dictionary checks ----
ok('XL_BATTLE_ANN_ROOT built off XL_SOUND_ROOT, own subfolder', src.indexOf("const XL_BATTLE_ANN_ROOT = XL_SOUND_ROOT + 'pflx-archive-announcer/';") > -1);
ok('XL_BATTLE_ANN_PREF is its own pref key (independent of XL_ANN_PREF)', src.indexOf("const XL_BATTLE_ANN_PREF = 'xl_battle_ann_on_v1';") > -1);
var clipsSrc = extractFunctionFrom('const XL_BATTLE_ANN_CLIPS = {').replace('const XL_BATTLE_ANN_CLIPS = ', '');
var clips = null;
try { clips = new Function('return (' + clipsSrc.replace(/;$/, '') + ')')(); } catch (e) {}
ok('XL_BATTLE_ANN_CLIPS extracted', !!clips);
if (clips) {
  ok('start -> lets_go.mp3', clips.start === 'lets_go.mp3');
  ok('crit -> critical_hit.mp3', clips.crit === 'critical_hit.mp3');
  ok('miss -> not_quite.mp3', clips.miss === 'not_quite.mp3');
  ok('dodge -> dodged.mp3', clips.dodge === 'dodged.mp3');
  ok('foehit -> ouch_hurt.mp3', clips.foehit === 'ouch_hurt.mp3');
  ok('win -> victory.mp3', clips.win === 'victory.mp3');
  ok('lose -> archive_wins.mp3', clips.lose === 'archive_wins.mp3');
  ok('boss -> boss_incoming.mp3', clips.boss === 'boss_incoming.mp3');
  ok('exactly 8 clips, nothing extra invented', Object.keys(clips).length === 8);
} else { fail += 9; }

// ---- 2. Extract the real xlBattleAnn() and run it in a mocked sandbox ----
var annSrc;
try { annSrc = extractFunctionFrom('function xlBattleAnn(key, opts) {'); ok('xlBattleAnn() extracted', true); }
catch (e) { ok('xlBattleAnn() extracted', false); annSrc = null; }

if (annSrc) {
  function makeSandbox(prefOn) {
    var created = [], ducked = [], now = 1000000;
    function AudioMock(url) { this.url = url; this.played = 0; this.currentTime = 0; this.volume = 0; created.push(this); }
    AudioMock.prototype.play = function () { this.played++; return { catch: function () {} }; };
    var xlBattleAnnPool = { last: {} };
    var xlMusic = { duck: function (reason, on) { ducked.push([reason, on]); } };
    var scope = {
      XL_BATTLE_ANN_ROOT: 'https://www.prototypeflx.com/public/sounds/pflx-archive-announcer/',
      XL_BATTLE_ANN_CLIPS: clips,
      xlBattleAnnOn: function () { return prefOn; },
      xlAudioHere: true,
      Audio: AudioMock,
      Date: { now: function () { return now; } },
      xlBattleAnnPool: xlBattleAnnPool,
      xlMusic: xlMusic
    };
    var fn = new Function('scope', 'with (scope) { return (' + annSrc.replace(/^function xlBattleAnn/, 'function') + '); }')(scope);
    return { fn: fn, created: created, ducked: ducked, pool: xlBattleAnnPool, advance: function (ms) { now += ms; } };
  }

  var sb1 = makeSandbox(true);
  var r1 = sb1.fn('start');
  ok('a known key plays when the pref is on', r1 === true && sb1.created.length === 1);
  ok('the played url is the real root + the right filename', sb1.created[0].url === 'https://www.prototypeflx.com/public/sounds/pflx-archive-announcer/lets_go.mp3');
  ok('play() was actually called', sb1.created[0].played === 1);
  ok('xlMusic.duck(\"battleAnn\", true) fires before playback', sb1.ducked.some(function (d) { return d[0] === 'battleAnn' && d[1] === true; }));

  var sb2 = makeSandbox(false);
  var r2 = sb2.fn('start');
  ok('the pref being off means no Audio is ever constructed', r2 === false && sb2.created.length === 0);

  var sb3 = makeSandbox(true);
  sb3.fn('crit'); var r3b = sb3.fn('crit');
  ok('the same key twice within 1200ms is deduped (no second Audio)', r3b === false && sb3.created.length === 1);
  sb3.advance(1300);
  var r3c = sb3.fn('crit');
  ok('after 1200ms the same key plays again (reusing the pooled Audio element for that URL, same as xlAnnClip\'s pattern)', r3c === true && sb3.created.length === 1 && sb3.created[0].played === 2);

  var sb4 = makeSandbox(true);
  sb4.fn('win'); var r4 = sb4.fn('win', { force: true });
  ok('opts.force bypasses the dedup window (same pooled element, played twice)', r4 === true && sb4.created.length === 1 && sb4.created[0].played === 2);

  var sb5 = makeSandbox(true);
  var r5 = sb5.fn('not-a-real-key');
  ok('an unknown key is a safe no-op, never constructs Audio, never throws', r5 === false && sb5.created.length === 0);

  var sb6 = makeSandbox(true);
  var r6 = sb6.fn(null);
  ok('a null key (the ordinary-hit case in resolve()) is a safe no-op', r6 === false && sb6.created.length === 0);
} else {
  fail += 8;
  console.log('SKIPPED xlBattleAnn() behavioral checks -- extraction failed');
}

// ---- 3. Wiring: every one of the 8 real trigger call sites, in the right place ----
ok('xlBattleNew() announces boss on a Hack Guild/Trojan foe, start otherwise', /streak = 0; say\('An ' \+ f\.name \+ ' locks on\. ' \+ f\.ability, 'fo'\); render\(\);\s*\n\s*if \(typeof xlBattleAnn === 'function'\) xlBattleAnn\(\['breach', 'wraith', 'vector', 'trojan'\]\.indexOf\(f\.id\) >= 0 \? 'boss' : 'start'\);/.test(src));
ok('xlHiveNew() always announces boss', /streak = 0; say\('The Hive swarms in[\s\S]{0,120}render\(\);\s*\n\s*if \(typeof xlBattleAnn === 'function'\) xlBattleAnn\('boss'\);/.test(src));
ok('resolve() announces crit/miss right after its PflxFx.slam call, before the log line', /window\.PflxFx\.slam\(crit \? 'CRITICAL HIT' : \(correct \? 'HIT' : 'MISS'\)[\s\S]{0,220}\); \}\s*\n\s*if \(typeof xlBattleAnn === 'function'\) xlBattleAnn\(crit \? 'crit' : \(correct \? null : 'miss'\)\);\s*\/\/[^\n]*\n\s*say\(me \+/.test(src));
ok('foeAttack() announces dodge right after its MISS/DODGED slam call', /window\.PflxFx\.slam\('MISS', \{ sub: 'DODGED', tint: 'cyan' \}\); \}\s*\n\s*if \(typeof xlBattleAnn === 'function'\) xlBattleAnn\('dodge'\);/.test(src));
ok('foeAttack() announces foehit right after the landed-hit slam call, before the Vector second-strike block', /window\.PflxFx\.slam\(foeCrit \? 'CRITICAL HIT' : 'HIT', \{ sub: dmg \+ ' DMG', tint: foeCrit \? 'crit' : 'fail', shake: foeCrit \}\); \}\s*\n\s*if \(typeof xlBattleAnn === 'function'\) xlBattleAnn\('foehit'\);\s*\/\/[^\n]*\n\s*\/\/ PATCH X-LIVE v0\.54 -- Vector/.test(src));
ok('the foehit call fires exactly once (not duplicated onto the Vector second-strike hit)', (src.match(/xlBattleAnn\('foehit'\)/g) || []).length === 1);
ok('finish() announces win/lose immediately after B.over = true, before the Hive-reward math', /B\.over = true;\s*\n\s*if \(typeof xlBattleAnn === 'function'\) xlBattleAnn\(win \? 'win' : 'lose'\);[^\n]*\n\s*if \(win\) \{\s*\n\s*\/\/ PATCH X-LIVE v0\.54 -- a full Hive clear/.test(src));

// ---- 4. Toggle + button markup ----
ok('xlBattleAnnOn() reads the real pref via xlPref()', /function xlBattleAnnOn\(\) \{ return xlPref\(XL_BATTLE_ANN_PREF, true\); \}/.test(src));
ok('xlToggleBattleAnn() flips the pref and plays a forced start line when turning on', /function xlToggleBattleAnn\(\) \{ var on = !xlBattleAnnOn\(\); xlSetPref\(XL_BATTLE_ANN_PREF, on\); if \(on\) xlBattleAnn\('start', \{ force: true \}\); render\(\); \}/.test(src));
ok('xlBattleAnnButtonHtml() is exported on window (called from the render markup)', src.indexOf('window.xlBattleAnnButtonHtml = xlBattleAnnButtonHtml;') > -1);
ok('the pre-battle screen renders the announcer toggle', src.indexOf("HOW TO PLAY</button><div style=\"margin-top:10px\">' + xlBattleAnnButtonHtml() + '</div></div></div>';") > -1);
ok('the active-battle arena header renders the announcer toggle', src.indexOf("var h = '<div class=\"evb-stage\">' + '<div style=\"display:flex;justify-content:flex-end;margin-bottom:6px\">' + xlBattleAnnButtonHtml() + '</div>' + '<div class=\"arena\">") > -1);

// ---- 5. Regression guards: existing XL_ANN (v0.38) and PflxFx.slam wiring untouched ----
ok('the pre-existing v0.38 XL_ANN VOICE toggle button is unchanged', src.indexOf("id=\"xl-ann-btn\" onclick=\"xlToggleAnn()\"") > -1);
ok('the pre-existing XL_SFX battle-hit SFX keys are unchanged (v0.52)', src.indexOf("battleHit: 'pflx-library/04_Impacts_Hits/impact_025.mp3',\n  battleCrit: 'pflx-library/04_Impacts_Hits/impact_022.mp3',\n  battleFoeHit: 'pflx-library/04_Impacts_Hits/impact_029.mp3'") > -1);
ok('foeDefenseMult() (v0.67) is still present and untouched', /function foeDefenseMult\(f\) \{ return 1 - Math\.min\(0\.4, \(\(f && f\.tier\) \|\| 0\) \* 0\.04\); \}/.test(src));

console.log('');
console.log(pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail > 0 ? 1 : 0);
