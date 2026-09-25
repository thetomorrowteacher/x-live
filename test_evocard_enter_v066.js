// PATCH X-LIVE v0.66 -- larger player Evo card + one-shot card entrance
// animation during battle. Extracts the REAL shipped functions verbatim
// (brace-counting), never a reimplementation.
// Run: node test_evocard_enter_v066.js index.html
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
ok('xlBattleNew() sets entered:false on a fresh B', /entered: false \}; \/\/ PATCH X-LIVE v0\.66[\s\S]{0,5}one-shot card-entrance flag[\s\S]{0,60}\n\s*streak = 0; say\('/.test(src));
ok('xlHiveNew() sets entered:false on a fresh B', /hive: true, hiveFoes: foes[\s\S]{0,400}entered: false \};/.test(src));
ok('xlBattleHTML() computes enterCls before foeCls', /var enterCls = ''; if \(!B\.entered\) \{ enterCls = ' enter'; B\.entered = true; \}/.test(src));
ok('foeCls now includes enterCls', /var foeCls = \(B\.actFoe \? ' act' : ''\) \+ \(B\.hitFoe \? ' hit' : ''\) \+ \(B\.critFoe \? ' crit' : ''\) \+ enterCls;/.test(src));
ok('myCard wrapper now includes enterCls', /class="evb-float' \+ enterCls \+ '"/.test(src));
ok('player card max-width raised from 190px to 260px', /style="max-width:260px;margin:0 auto"/.test(src));
ok('old 190px cap is gone', !/max-width:190px;margin:0 auto/.test(src));
ok('evbCardEnter keyframes defined', /@keyframes evbCardEnter\{/.test(src));
ok('evbCardEnter starts hidden/scaled/blurred', /@keyframes evbCardEnter\{0%\{opacity:0;transform:translateY\(36px\) scale\(\.82\);filter:blur\(6px\)\}/.test(src));
ok('.evb-foe.enter layers evbCardEnter onto the existing evbfloat idle animation', /\.evb \.evb-foe\.enter\{animation:evbCardEnter \.6s cubic-bezier\(\.2,1\.2,\.35,1\) both,evbfloat 3\.6s ease-in-out infinite\}/.test(src));
ok('.evb-float.enter layers evbCardEnter onto evbfloat with the original -1.8s float delay preserved', /\.evb \.evb-float\.enter\{animation:evbCardEnter \.6s cubic-bezier\(\.2,1\.2,\.35,1\) both,evbfloat 3\.6s ease-in-out infinite;animation-delay:0s,-1\.8s\}/.test(src));
ok('the original always-on evbfloat rules are untouched (not replaced, only extended)', /\.evb \.evb-foe\{animation:evbfloat 3\.6s ease-in-out infinite\}\n\.evb \.evb-float\{animation:evbfloat 3\.6s ease-in-out infinite;animation-delay:-1\.8s\}/.test(src));

// ---- 2. Behavioral: simulate xlBattleHTML()'s enter-class gating logic ----
// Extracted as a pure fragment (can't run the whole 200-line render fn
// without the entire app's DOM/global surface) -- but the exact gating
// expression is extracted verbatim and exercised directly.
var gateExpr;
try {
  var idx = src.indexOf("var enterCls = ''; if (!B.entered) { enterCls = ' enter'; B.entered = true; }");
  if (idx === -1) throw new Error('gate expression not found');
  var end = src.indexOf('\n', idx);
  gateExpr = src.slice(idx, end);
  ok('gate expression extracted', true);
} catch (e) {
  ok('gate expression extracted', false);
  gateExpr = null;
}

if (gateExpr) {
  // strip the trailing comment for the Function body
  var bodySrc = gateExpr.replace(/\/\/.*$/, '');

  ok('first call on a fresh B (entered=false) yields enterCls=" enter" and flips B.entered to true', (function () {
    var B = { entered: false };
    var fn = new Function('B', bodySrc + '\nreturn { enterCls: enterCls, entered: B.entered };');
    var r = fn(B);
    return r.enterCls === ' enter' && r.entered === true;
  })());

  ok('second call on the same B (now entered=true) yields enterCls="" and leaves B.entered true', (function () {
    var B = { entered: true };
    var fn = new Function('B', bodySrc + '\nreturn { enterCls: enterCls, entered: B.entered };');
    var r = fn(B);
    return r.enterCls === '' && r.entered === true;
  })());

  ok('gate never throws on B.entered undefined (treated as falsy, same as fresh-battle default)', (function () {
    var B = {};
    var fn = new Function('B', bodySrc + '\nreturn { enterCls: enterCls, entered: B.entered };');
    var r = fn(B);
    return r.enterCls === ' enter' && r.entered === true;
  })());

  ok('sequential calls: only the FIRST of three renders gets the entrance class (one-shot, not re-triggered)', (function () {
    var B = { entered: false };
    var fn = new Function('B', bodySrc + '\nreturn enterCls;');
    var r1 = fn(B), r2 = fn(B), r3 = fn(B);
    return r1 === ' enter' && r2 === '' && r3 === '';
  })());
} else {
  fail += 4;
  console.log('SKIPPED gate behavioral checks -- extraction failed');
}

// ---- 3. Confirm both B-construction sites are consistent (xlBattleNew + xlHiveNew) ----
ok('xlBattleNew() and xlHiveNew() both declare entered:false exactly once each', (function () {
  var m = src.match(/entered: false \};/g);
  return m && m.length === 2;
})());

console.log('');
console.log(pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail > 0 ? 1 : 0);
