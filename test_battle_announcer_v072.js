// PATCH X-LIVE v0.72 -- Archive Battle announcer voice-picker (3 voices,
// 24 lines each, 72 files). Extracts the REAL shipped functions (regex/
// brace-matching, never a reimplementation) and confirms: the clip pools
// have exactly the right variant counts per key; xlBattleAnnPick() only
// ever returns a filename that's actually in the pool; xlBattleAnnVoice()
// correctly migrates a pre-v0.72 legacy on/off pref the first time and
// then ignores it once the new pref is set; xlBattleAnn() respects the
// voice choice, dedupes/forces/ducks exactly as v0.68 did, and now also
// calls the new FX hook after playback starts; xlSetBattleAnnVoice()/
// xlToggleBattleAnn() write both prefs correctly; xlBattleAnnButtonHtml()
// renders all 4 states; the new/changed trigger call sites (guildIntro/
// trojanIntro entry split, hiveUnitDown, hiveClear-vs-win) are wired at
// the right place; and the new FX chain never throws and never double-
// wires the same pooled <audio> element.
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

// ---- 1. Clip-pool checks ----
ok('XL_BATTLE_ANN_VOICE_PREF is a new, separate pref key', src.indexOf("const XL_BATTLE_ANN_VOICE_PREF = 'xl_battle_ann_voice_v1';") > -1);
ok('XL_BATTLE_ANN_PREF (legacy) is still declared for migration', src.indexOf("const XL_BATTLE_ANN_PREF = 'xl_battle_ann_on_v1';") > -1);
var voicesSrc = extractFunctionFrom('const XL_BATTLE_ANN_VOICES = {');
var voices = null;
try { voices = new Function('return (' + voicesSrc.replace(/^const XL_BATTLE_ANN_VOICES = /, '').replace(/;\s*$/, '') + ')')(); } catch (e) {}
ok('XL_BATTLE_ANN_VOICES extracted', !!voices);
if (voices) {
  ok('exactly 3 voices: ttt, kuya, cera', Object.keys(voices).sort().join(',') === 'cera,kuya,ttt');
} else { fail += 1; }

var clipsSrc = extractFunctionFrom('const XL_BATTLE_ANN_CLIPS = {');
var clips = null;
try { clips = new Function('return (' + clipsSrc.replace(/^const XL_BATTLE_ANN_CLIPS = /, '').replace(/;\s*$/, '') + ')')(); } catch (e) {}
ok('XL_BATTLE_ANN_CLIPS extracted', !!clips);
if (clips) {
  var expectedCounts = { start: 2, boss: 1, guildIntro: 1, trojanIntro: 1, crit: 4, miss: 2, dodge: 2, foehit: 3, win: 2, lose: 2, hiveUnitDown: 2, hiveClear: 2 };
  var allOk = true, totalLines = 0;
  Object.keys(expectedCounts).forEach(function (k) {
    var got = (clips[k] || []).length;
    totalLines += got;
    if (got !== expectedCounts[k]) { allOk = false; console.log('  clip count mismatch: ' + k + ' expected ' + expectedCounts[k] + ' got ' + got); }
  });
  ok('every key has exactly its designed variant count', allOk);
  ok('exactly 12 keys, nothing extra invented', Object.keys(clips).length === 12);
  ok('24 lines per voice (72 files total across 3 voices)', totalLines === 24);
  ok('boss is Hive-only now (still present, still 1 file)', clips.boss.length === 1 && clips.boss[0] === 'boss_1.mp3');
  ok('guildIntro/trojanIntro are new single-file keys', clips.guildIntro[0] === 'guild_intro.mp3' && clips.trojanIntro[0] === 'trojan_intro.mp3');
  ok('hiveUnitDown/hiveClear are new 2-variant keys', clips.hiveUnitDown.length === 2 && clips.hiveClear.length === 2);
} else { fail += 6; }

// ---- 2. xlBattleAnnPick() -- pure random-variant selection ----
var pickSrc;
try { pickSrc = extractFunctionFrom('function xlBattleAnnPick(key) {'); ok('xlBattleAnnPick() extracted', true); }
catch (e) { ok('xlBattleAnnPick() extracted', false); pickSrc = null; }
if (pickSrc && clips) {
  var pickFn = new Function('XL_BATTLE_ANN_CLIPS', 'return (' + pickSrc.replace(/^function xlBattleAnnPick/, 'function') + ');')(clips);
  var seen = {}, badPick = false;
  for (var i = 0; i < 200; i++) {
    var f = pickFn('crit');
    if (clips.crit.indexOf(f) === -1) badPick = true;
    seen[f] = true;
  }
  ok('every pick for a key is actually a member of that key\'s pool', !badPick);
  ok('across 200 picks, more than one crit variant actually gets chosen (real randomness, not a stuck index)', Object.keys(seen).length > 1);
  ok('an unknown key returns null, never throws', pickFn('not-a-real-key') === null);
  ok('a key with an empty/missing pool returns null', pickFn('') === null);
} else { fail += 4; }

// ---- 3. xlBattleAnnVoice() -- legacy-pref migration ----
var voiceFnSrc;
try { voiceFnSrc = extractFunctionFrom('function xlBattleAnnVoice() {'); ok('xlBattleAnnVoice() extracted', true); }
catch (e) { ok('xlBattleAnnVoice() extracted', false); voiceFnSrc = null; }
if (voiceFnSrc && voices) {
  function makeVoiceFn(newPrefVal, legacyPrefVal) {
    var scope = {
      XL_BATTLE_ANN_VOICE_PREF: 'xl_battle_ann_voice_v1',
      XL_BATTLE_ANN_PREF: 'xl_battle_ann_on_v1',
      XL_BATTLE_ANN_VOICES: voices,
      xlPref: function (key, dflt) {
        if (key === 'xl_battle_ann_voice_v1') return newPrefVal === undefined ? dflt : newPrefVal;
        if (key === 'xl_battle_ann_on_v1') return legacyPrefVal === undefined ? dflt : legacyPrefVal;
        return dflt;
      }
    };
    return new Function('scope', 'with (scope) { return (' + voiceFnSrc.replace(/^function xlBattleAnnVoice/, 'function') + '); }')(scope);
  }
  ok('no new pref, legacy on=true -> migrates to ttt', makeVoiceFn(undefined, true)() === 'ttt');
  ok('no new pref, legacy on=false -> migrates to off', makeVoiceFn(undefined, false)() === 'off');
  ok('new pref already set to kuya -> ignores legacy entirely', makeVoiceFn('kuya', false)() === 'kuya');
  ok('new pref already set to off -> stays off even if legacy says on', makeVoiceFn('off', true)() === 'off');
  ok('a garbage stored value falls back through to the legacy migration path', makeVoiceFn('bogus-voice', true)() === 'ttt');
} else { fail += 5; }

// ---- 4. Extract the real xlBattleAnn() and run it in a mocked sandbox ----
var annSrc;
try { annSrc = extractFunctionFrom('function xlBattleAnn(key, opts) {'); ok('xlBattleAnn() extracted', true); }
catch (e) { ok('xlBattleAnn() extracted', false); annSrc = null; }

if (annSrc && clips) {
  function makeSandbox(voice) {
    var created = [], ducked = [], fxCalls = [], now = 1000000;
    function AudioMock(url) { this.url = url; this.played = 0; this.currentTime = 0; this.volume = 0; created.push(this); }
    AudioMock.prototype.play = function () { this.played++; return { catch: function () {} }; };
    var xlBattleAnnPool = { last: {} };
    var xlMusic = { duck: function (reason, on) { ducked.push([reason, on]); } };
    var scope = {
      XL_BATTLE_ANN_ROOT: 'https://www.prototypeflx.com/public/sounds/pflx-archive-announcer/',
      XL_BATTLE_ANN_CLIPS: clips,
      xlBattleAnnVoice: function () { return voice; },
      xlBattleAnnPick: function (key) { var pool = clips[key]; return pool && pool.length ? pool[0] : null; }, // deterministic for these checks
      xlAudioHere: true,
      Audio: AudioMock,
      Date: { now: function () { return now; } },
      xlBattleAnnPool: xlBattleAnnPool,
      xlMusic: xlMusic,
      xlBattleAnnFx: function (el) { fxCalls.push(el); }
    };
    var fn = new Function('scope', 'with (scope) { return (' + annSrc.replace(/^function xlBattleAnn/, 'function') + '); }')(scope);
    return { fn: fn, created: created, ducked: ducked, fxCalls: fxCalls, pool: xlBattleAnnPool, advance: function (ms) { now += ms; } };
  }

  var sb1 = makeSandbox('ttt');
  var r1 = sb1.fn('start');
  ok('a known key plays when a real voice is selected', r1 === true && sb1.created.length === 1);
  ok('the played url is root + voice folder + the picked filename', sb1.created[0].url === 'https://www.prototypeflx.com/public/sounds/pflx-archive-announcer/ttt/start_1.mp3');
  ok('play() was actually called', sb1.created[0].played === 1);
  ok('xlMusic.duck(\"battleAnn\", true) fires before playback', sb1.ducked.some(function (d) { return d[0] === 'battleAnn' && d[1] === true; }));
  ok('xlBattleAnnFx() is called with the playing element after play()', sb1.fxCalls.length === 1 && sb1.fxCalls[0] === sb1.created[0]);

  var sbKuya = makeSandbox('kuya');
  sbKuya.fn('crit');
  ok('a different voice resolves to that voice\'s own subfolder', sbKuya.created[0].url.indexOf('/kuya/crit_1.mp3') > -1);

  var sb2 = makeSandbox('off');
  var r2 = sb2.fn('start');
  ok('voice off means no Audio is ever constructed', r2 === false && sb2.created.length === 0 && sb2.fxCalls.length === 0);

  var sb3 = makeSandbox('ttt');
  sb3.fn('crit'); var r3b = sb3.fn('crit');
  ok('the same key twice within 1200ms is deduped (no second Audio)', r3b === false && sb3.created.length === 1);
  sb3.advance(1300);
  var r3c = sb3.fn('crit');
  ok('after 1200ms the same key plays again (reusing the pooled Audio element for that URL)', r3c === true && sb3.created.length === 1 && sb3.created[0].played === 2);

  var sb4 = makeSandbox('ttt');
  sb4.fn('win'); var r4 = sb4.fn('win', { force: true });
  ok('opts.force bypasses the dedup window (same pooled element, played twice)', r4 === true && sb4.created.length === 1 && sb4.created[0].played === 2);

  var sb5 = makeSandbox('ttt');
  var r5 = sb5.fn('not-a-real-key');
  ok('an unknown key is a safe no-op, never constructs Audio, never throws', r5 === false && sb5.created.length === 0);

  var sb6 = makeSandbox('ttt');
  var r6 = sb6.fn(null);
  ok('a null key (the ordinary-hit case in resolve()) is a safe no-op', r6 === false && sb6.created.length === 0);
} else {
  fail += 11;
  console.log('SKIPPED xlBattleAnn() behavioral checks -- extraction failed');
}

// ---- 5. xlSetBattleAnnVoice() / xlToggleBattleAnn() ----
var setVoiceSrc;
try { setVoiceSrc = extractFunctionFrom('function xlSetBattleAnnVoice(v) {'); ok('xlSetBattleAnnVoice() extracted', true); }
catch (e) { ok('xlSetBattleAnnVoice() extracted', false); setVoiceSrc = null; }
if (setVoiceSrc && voices) {
  function makeSetVoiceSandbox() {
    var setCalls = [], annCalls = [], rendered = 0;
    var scope = {
      XL_BATTLE_ANN_VOICE_PREF: 'xl_battle_ann_voice_v1',
      XL_BATTLE_ANN_PREF: 'xl_battle_ann_on_v1',
      XL_BATTLE_ANN_VOICES: voices,
      xlSetPref: function (k, v) { setCalls.push([k, v]); },
      xlBattleAnn: function (key, opts) { annCalls.push([key, opts]); },
      render: function () { rendered++; }
    };
    var fn = new Function('scope', 'with (scope) { return (' + setVoiceSrc.replace(/^function xlSetBattleAnnVoice/, 'function') + '); }')(scope);
    return { fn: fn, setCalls: setCalls, annCalls: annCalls, renderedCount: function () { return rendered; } };
  }
  var sv1 = makeSetVoiceSandbox(); sv1.fn('kuya');
  ok('setting a real voice writes both the new pref and the legacy on=true pref', sv1.setCalls.some(function (c) { return c[0] === 'xl_battle_ann_voice_v1' && c[1] === 'kuya'; }) && sv1.setCalls.some(function (c) { return c[0] === 'xl_battle_ann_on_v1' && c[1] === true; }));
  ok('setting a real voice plays a forced start sample', sv1.annCalls.length === 1 && sv1.annCalls[0][0] === 'start' && sv1.annCalls[0][1].force === true);
  ok('setting a real voice re-renders', sv1.renderedCount() === 1);

  var sv2 = makeSetVoiceSandbox(); sv2.fn('off');
  ok('setting off writes the legacy on=false pref and does NOT play a sample', sv2.setCalls.some(function (c) { return c[0] === 'xl_battle_ann_on_v1' && c[1] === false; }) && sv2.annCalls.length === 0);

  var sv3 = makeSetVoiceSandbox(); sv3.fn('not-a-real-voice');
  ok('an unrecognized voice value falls back to off, never throws', sv3.setCalls.some(function (c) { return c[0] === 'xl_battle_ann_voice_v1' && c[1] === 'off'; }));
} else { fail += 4; }

ok('xlToggleBattleAnn() cycles off -> ttt -> kuya -> cera -> off via xlSetBattleAnnVoice()', /function xlToggleBattleAnn\(\) \{\s*\n\s*var order = \['off', 'ttt', 'kuya', 'cera'\];\s*\n\s*var idx = order\.indexOf\(xlBattleAnnVoice\(\)\);\s*\n\s*if \(idx < 0\) idx = 0;\s*\n\s*xlSetBattleAnnVoice\(order\[\(idx \+ 1\) % order\.length\]\);\s*\n\s*\}/.test(src));

// ---- 6. Button markup renders all 4 states ----
var btnSrc;
try { btnSrc = extractFunctionFrom('function xlBattleAnnButtonHtml() {'); ok('xlBattleAnnButtonHtml() extracted', true); }
catch (e) { ok('xlBattleAnnButtonHtml() extracted', false); btnSrc = null; }
if (btnSrc && voices) {
  function renderBtn(voice) {
    var scope = { XL_BATTLE_ANN_VOICES: voices, xlBattleAnnVoice: function () { return voice; } };
    var fn = new Function('scope', 'with (scope) { return (' + btnSrc.replace(/^function xlBattleAnnButtonHtml/, 'function') + '); }')(scope);
    return fn();
  }
  var htmlOff = renderBtn('off');
  ok('OFF state renders a <select> with the off option selected, not marked "on"', htmlOff.indexOf('<select class="xl-audio-btn"') > -1 && htmlOff.indexOf('value="off" selected') > -1);
  var htmlTtt = renderBtn('ttt');
  ok('a real voice renders the "on" class and all 4 options present', htmlTtt.indexOf('xl-audio-btn on') > -1 && htmlTtt.indexOf('value="off"') > -1 && htmlTtt.indexOf('value="ttt" selected') > -1 && htmlTtt.indexOf('value="kuya"') > -1 && htmlTtt.indexOf('value="cera"') > -1);
  ok('window.xlBattleAnnButtonHtml is exported (called from the render markup)', src.indexOf('window.xlBattleAnnButtonHtml = xlBattleAnnButtonHtml;') > -1);
} else { fail += 3; }

// ---- 7. Wiring: the 4 new/changed trigger call sites ----
ok('the entry ternary now splits Hack Guild -> guildIntro, Trojan -> trojanIntro, else start', /var annKey = f\.id === 'trojan' \? 'trojanIntro' : \(\['breach', 'wraith', 'vector'\]\.indexOf\(f\.id\) >= 0 \? 'guildIntro' : 'start'\);\s*\n\s*xlBattleAnn\(annKey\);/.test(src));
ok('xlHiveNew() still always announces plain boss (Hive-only), unchanged', /if \(typeof xlBattleAnn === 'function'\) xlBattleAnn\('boss'\);/.test(src));
ok('the Hive-continuation branch fires hiveUnitDown before returning', /say\('The ' \+ f\.name \+ ' breaks apart\. The next Hive unit locks on: ' \+ nf\.name \+ '\.', 'win'\);\s*\n\s*if \(typeof xlBattleAnn === 'function'\) xlBattleAnn\('hiveUnitDown'\);[^\n]*\n\s*render\(\); return;/.test(src));
ok('the B.over branch fires hiveClear on a full Hive clear, plain win otherwise, lose unchanged', /B\.over = true;\s*\n\s*if \(typeof xlBattleAnn === 'function'\) xlBattleAnn\(win \? \(B\.hive \? 'hiveClear' : 'win'\) : 'lose'\);/.test(src));
ok('resolve() crit/miss call site is untouched by this patch (variant selection is inside xlBattleAnn now, not the call site)', /if \(typeof xlBattleAnn === 'function'\) xlBattleAnn\(crit \? 'crit' : \(correct \? null : 'miss'\)\);/.test(src));
ok('foeAttack() dodge call site is untouched', /if \(typeof xlBattleAnn === 'function'\) xlBattleAnn\('dodge'\);/.test(src));
ok('foeAttack() foehit call site is untouched and still fires exactly once', (src.match(/xlBattleAnn\('foehit'\)/g) || []).length === 1);

// ---- 8. FX chain: extraction + sandboxed behavior ----
var fxSrc, impulseSrc;
try { impulseSrc = extractFunctionFrom('function xlBattleAnnImpulse(ctx) {'); ok('xlBattleAnnImpulse() extracted', true); }
catch (e) { ok('xlBattleAnnImpulse() extracted', false); impulseSrc = null; }
try { fxSrc = extractFunctionFrom('function xlBattleAnnFx(audioEl) {'); ok('xlBattleAnnFx() extracted', true); }
catch (e) { ok('xlBattleAnnFx() extracted', false); fxSrc = null; }

if (fxSrc && impulseSrc) {
  function makeGain() { return { connect: function () {}, gain: { value: 0 } }; }
  function makeAudioCtxMock() {
    var created = { gains: 0, convolvers: 0, delays: 0, mediaSources: 0 };
    function Node() { this.connect = function () {}; }
    return {
      created: created,
      sampleRate: 44100,
      state: 'running',
      resume: function () { return { catch: function () {} }; },
      createGain: function () { created.gains++; var n = new Node(); n.gain = { value: 0 }; return n; },
      createConvolver: function () { created.convolvers++; var n = new Node(); n.buffer = null; return n; },
      createDelay: function () { created.delays++; var n = new Node(); n.delayTime = { value: 0 }; return n; },
      createMediaElementSource: function (el) { created.mediaSources++; return new Node(); },
      createBuffer: function (ch, len, rate) {
        var data = []; for (var c = 0; c < ch; c++) data.push(new Float32Array(len));
        return { getChannelData: function (c) { return data[c]; } };
      },
      destination: {}
    };
  }

  function makeFxSandbox(hasAudioContext) {
    var ctxMock = hasAudioContext ? makeAudioCtxMock() : null;
    var scope = {
      window: hasAudioContext ? { AudioContext: function () { return ctxMock; } } : {},
      WeakMap: WeakMap,
      xlBattleAnnAudioCtx: null,
      xlBattleAnnFxWired: new WeakMap()
    };
    scope.xlBattleAnnImpulse = new Function('return (' + impulseSrc.replace(/^function xlBattleAnnImpulse/, 'function') + ');')();
    var body = fxSrc.replace(/^function xlBattleAnnFx/, 'function');
    var fn = new Function('scope', 'with (scope) { return (' + body + '); }')(scope);
    return { fn: fn, ctxMock: ctxMock, hasAudioContext: hasAudioContext };
  }

  var fxNo = makeFxSandbox(false);
  ok('no AudioContext available -> safe false, never throws', fxNo.fn({}) === false);

  var fxYes = makeFxSandbox(true);
  var elMock = {};
  var r = fxYes.fn(elMock);
  ok('AudioContext available -> wires the chain and returns true', r === true);
  ok('exactly one media element source is created for a fresh element', fxYes.ctxMock.created.mediaSources === 1);
  ok('a convolver (reverb) and a delay (slap) node are both created', fxYes.ctxMock.created.convolvers === 1 && fxYes.ctxMock.created.delays === 1);
  ok('multiple gain nodes are created for the dry/wet/feedback/delay mix', fxYes.ctxMock.created.gains >= 4);
  var r2 = fxYes.fn(elMock);
  ok('calling it again on the SAME element does not re-wire (no second media source, still returns true)', r2 === true && fxYes.ctxMock.created.mediaSources === 1);

  // Synthesized impulse buffer sanity: exponential decay, not silence/noise-of-constant-amplitude
  var impulseFn = new Function('return (' + impulseSrc.replace(/^function xlBattleAnnImpulse/, 'function') + ');')();
  var fakeCtx = { sampleRate: 8000, createBuffer: function (ch, len, rate) { var data = []; for (var c = 0; c < ch; c++) data.push(new Float32Array(len)); return { getChannelData: function (c) { return data[c]; } }; } };
  var buf = impulseFn(fakeCtx);
  var d0 = buf.getChannelData(0);
  ok('the synthesized impulse response actually decays (early samples louder on average than late ones)', Math.abs(d0[10]) + Math.abs(d0[11]) + Math.abs(d0[12]) >= Math.abs(d0[d0.length - 3]) + Math.abs(d0[d0.length - 2]) + Math.abs(d0[d0.length - 1]));
} else { fail += 6; console.log('SKIPPED FX chain behavioral checks -- extraction failed'); }

// ---- 9. Regression guards: v0.68 subsystem boundaries and neighboring code untouched ----
ok('the pre-existing v0.38 XL_ANN VOICE toggle button is unchanged', src.indexOf('id="xl-ann-btn" onclick="xlToggleAnn()"') > -1);
ok('the pre-fight screen still renders the announcer control', src.indexOf("HOW TO PLAY</button><div style=\"margin-top:10px\">' + xlBattleAnnButtonHtml() + '</div></div></div>';") > -1);
ok('the active-battle header still renders the announcer control', src.indexOf("var h = '<div class=\"evb-stage\">' + '<div style=\"display:flex;justify-content:flex-end;margin-bottom:6px\">' + xlBattleAnnButtonHtml() + '</div>' + '<div class=\"arena\">") > -1);
ok('foeDefenseMult() (v0.67) is still present and untouched', /function foeDefenseMult\(f\) \{ return 1 - Math\.min\(0\.4, \(\(f && f\.tier\) \|\| 0\) \* 0\.04\); \}/.test(src));

console.log('');
console.log(pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail > 0 ? 1 : 0);
