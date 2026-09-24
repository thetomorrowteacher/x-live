// PATCH X-LIVE v0.65 -- host-adjustable question timer (5-60s, was fixed 12s)
// Extracts the REAL shipped functions verbatim (brace-counting), never a
// reimplementation. Run: node test_question_timer_v065.js index.html
'use strict';
var fs = require('fs');
var path = process.argv[2] || 'index.html';
var src = fs.readFileSync(path, 'utf8');

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}

// ---- extraction helper: brace-counting from a marker ----
function extractFunctionFrom(marker) {
  var idx = src.indexOf(marker);
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

// ---- 1. Extract pflxQuestionTimerSecs() verbatim ----
var timerFnSrc;
try {
  timerFnSrc = extractFunctionFrom('function pflxQuestionTimerSecs()');
  ok('pflxQuestionTimerSecs() extracted', true);
} catch (e) {
  ok('pflxQuestionTimerSecs() extracted', false);
  timerFnSrc = null;
}

// ---- 2. Static presence checks ----
ok('DEFAULT_CFG.archiveBattle field present', /archiveBattle:\s*\{\s*questionTimerSecs:\s*12\s*\}/.test(src));
ok('loadCfg() migration line present', /L\.cfg\.archiveBattle = Object\.assign\(\{\}, DEFAULT_CFG\.archiveBattle, L\.cfg\.archiveBattle \|\| \{\}\);/.test(src));
ok('rSetup() slider markup present (min=5 max=60)', /type="range" min="5" max="60" step="1"/.test(src));
ok('rSetup() slider wired to L.cfg.archiveBattle.questionTimerSecs', /L\.cfg\.archiveBattle\.questionTimerSecs=Math\.max\(5,Math\.min\(60,parseInt\(this\.value\)\|\|12\)\);saveCfg\(\)/.test(src));
ok('rSetup() hint text present', /How long players have to answer each Archive Battle \/ Spar question/.test(src));
ok('ask() no longer hardcodes secs = 12', !/var secs = 12, left = secs, done = false;/.test(src));
ok('ask() computes secs via pflxQuestionTimerSecs() before innerHTML', /var secs = pflxQuestionTimerSecs\(\);[\s\S]{0,150}q\.innerHTML/.test(src));
ok('ask() countdown span now uses real secs, not hardcoded 12', /<span id="evb-qt">' \+ secs \+ '<\/span>/.test(src));
ok('ask() left now derived from computed secs', /var left = secs, done = false;/.test(src));

// ---- 3. Behavioral checks: run the REAL extracted pflxQuestionTimerSecs() ----
if (timerFnSrc) {
  function makeTimerFn(cfgArchiveBattle) {
    var L = { cfg: { archiveBattle: cfgArchiveBattle } };
    var fn = new Function('L', 'Math', 'parseInt', 'isNaN',
      'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');'
    )(L, Math, parseInt, isNaN);
    return fn;
  }

  // default (12) when no config present
  ok('default 12 when L.cfg.archiveBattle is undefined', (function () {
    var L = { cfg: {} };
    var fn = new Function('L', 'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');')(L);
    return fn() === 12;
  })());

  ok('default 12 when L.cfg is undefined entirely', (function () {
    var L = {};
    var fn = new Function('L', 'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');')(L);
    return fn() === 12;
  })());

  ok('passthrough for a valid mid-range value (30)', (function () {
    var L = { cfg: { archiveBattle: { questionTimerSecs: 30 } } };
    var fn = new Function('L', 'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');')(L);
    return fn() === 30;
  })());

  ok('clamps a value below 5 up to 5', (function () {
    var L = { cfg: { archiveBattle: { questionTimerSecs: 2 } } };
    var fn = new Function('L', 'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');')(L);
    return fn() === 5;
  })());

  ok('clamps a value above 60 down to 60', (function () {
    var L = { cfg: { archiveBattle: { questionTimerSecs: 999 } } };
    var fn = new Function('L', 'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');')(L);
    return fn() === 60;
  })());

  ok('exactly 5 stays 5 (inclusive lower bound)', (function () {
    var L = { cfg: { archiveBattle: { questionTimerSecs: 5 } } };
    var fn = new Function('L', 'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');')(L);
    return fn() === 5;
  })());

  ok('exactly 60 stays 60 (inclusive upper bound)', (function () {
    var L = { cfg: { archiveBattle: { questionTimerSecs: 60 } } };
    var fn = new Function('L', 'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');')(L);
    return fn() === 60;
  })());

  ok('non-numeric string falls back to 12', (function () {
    var L = { cfg: { archiveBattle: { questionTimerSecs: 'banana' } } };
    var fn = new Function('L', 'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');')(L);
    return fn() === 12;
  })());

  ok('zero falls back to 12 (falsy guard)', (function () {
    var L = { cfg: { archiveBattle: { questionTimerSecs: 0 } } };
    var fn = new Function('L', 'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');')(L);
    return fn() === 12;
  })());

  ok('missing questionTimerSecs key falls back to 12', (function () {
    var L = { cfg: { archiveBattle: {} } };
    var fn = new Function('L', 'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');')(L);
    return fn() === 12;
  })());

  ok('numeric string "45" parses and passes through', (function () {
    var L = { cfg: { archiveBattle: { questionTimerSecs: '45' } } };
    var fn = new Function('L', 'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');')(L);
    return fn() === 45;
  })());

  ok('null falls back to 12', (function () {
    var L = { cfg: { archiveBattle: { questionTimerSecs: null } } };
    var fn = new Function('L', 'return (' + timerFnSrc.replace(/^function pflxQuestionTimerSecs/, 'function') + ');')(L);
    return fn() === 12;
  })());
} else {
  fail += 11;
  console.log('SKIPPED all behavioral checks -- extraction failed');
}

// ---- 4. Confirm DEFAULT_CFG object literal placement (right before the function) ----
ok('DEFAULT_CFG closes then pflxQuestionTimerSecs is declared immediately after', (function () {
  var defIdx = src.indexOf("archiveBattle: { questionTimerSecs: 12 }");
  var fnIdx = src.indexOf('function pflxQuestionTimerSecs()');
  return defIdx !== -1 && fnIdx !== -1 && fnIdx > defIdx && (fnIdx - defIdx) < 500;
})());

console.log('');
console.log(pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail > 0 ? 1 : 0);
