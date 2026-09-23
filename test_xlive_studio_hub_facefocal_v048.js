// Verifies PATCH X-LIVE v0.48 (per-stage/per-line Evo face-crop focal points)
// against the REAL shipped index.html source -- extracts the real
// EXO_FACE_FOCAL table and exoFaceFocalOrigin() function via brace-counting
// and executes them for real, rather than reimplementing the logic.
const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('usage: node test_xlive_studio_hub_facefocal_v048.js <index.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

const focalStart = src.indexOf('const EXO_FACE_FOCAL = {');
check('EXO_FACE_FOCAL declaration found', focalStart !== -1);
let focalSrc = '';
if (focalStart !== -1) {
  const braceStart = src.indexOf('{', focalStart);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  focalSrc = src.slice(braceStart, i);
}
check('EXO_FACE_FOCAL braces balanced (non-empty extraction)', focalSrc.length > 10);

const fnStart = src.indexOf('function exoFaceFocalOrigin(exo) {');
check('exoFaceFocalOrigin() declaration found', fnStart !== -1);
let fnSrc = '';
if (fnStart !== -1) {
  const braceStart = src.indexOf('{', fnStart);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  fnSrc = src.slice(fnStart, i);
}
check('exoFaceFocalOrigin() braces balanced (non-empty extraction)', fnSrc.length > 10);

let EXO_FACE_FOCAL, exoFaceFocalOrigin;
try {
  EXO_FACE_FOCAL = new Function('return ' + focalSrc + ';')();
  exoFaceFocalOrigin = new Function(
    'EXO_FACE_FOCAL',
    fnSrc + '\nreturn exoFaceFocalOrigin;'
  )(EXO_FACE_FOCAL);
} catch (e) {
  fail++;
  console.log('FAIL: extracted code evaluates without throwing -- ' + e.message);
}

if (typeof exoFaceFocalOrigin === 'function') {
  ['ironwright', 'resonant', 'mythweaver', 'neonborn'].forEach(function (line) {
    check('EXO_FACE_FOCAL has line "' + line + '"', !!EXO_FACE_FOCAL[line]);
    if (EXO_FACE_FOCAL[line]) {
      [1, 2, 4].forEach(function (st) {
        check('EXO_FACE_FOCAL.' + line + ' has stage ' + st, !!EXO_FACE_FOCAL[line][st]);
      });
    }
  });

  const cases = [
    { line: 'ironwright', stage: 1, x: 53, y: 35 },
    { line: 'mythweaver', stage: 1, x: 29, y: 27 },
    { line: 'neonborn', stage: 1, x: 78, y: 57 },
    { line: 'resonant', stage: 4, x: 38, y: 28 }
  ];
  cases.forEach(function (c) {
    const expectedY = Math.max(0, Math.min(100, (c.y - 7) / 67 * 100));
    const expectedX = Math.max(0, Math.min(100, c.x));
    const got = exoFaceFocalOrigin({ line: c.line, stage: c.stage });
    const expected = expectedX.toFixed(1) + '% ' + expectedY.toFixed(1) + '%';
    check(c.line + ' stage ' + c.stage + ' resolves to ' + expected, got === expected);
  });

  const a = exoFaceFocalOrigin({ line: 'mythweaver', stage: 1 });
  const b = exoFaceFocalOrigin({ line: 'neonborn', stage: 1 });
  const c = exoFaceFocalOrigin({ line: 'ironwright', stage: 2 });
  check('mythweaver stage1 differs from neonborn stage1 (not a fixed origin)', a !== b);
  check('ironwright stage1 differs from ironwright stage2 (varies by stage too)',
    exoFaceFocalOrigin({ line: 'ironwright', stage: 1 }) !== c);

  check('unknown line falls back to "50% 40%"', exoFaceFocalOrigin({ line: 'nope', stage: 1 }) === '50% 40%');
  check('missing exo object falls back to "50% 40%"', exoFaceFocalOrigin(undefined) === '50% 40%');
  check('missing stage defaults to stage 1', exoFaceFocalOrigin({ line: 'ironwright' }) === exoFaceFocalOrigin({ line: 'ironwright', stage: 1 }));

  check('stage 3 (no real art) falls back to "50% 40%"', exoFaceFocalOrigin({ line: 'ironwright', stage: 3 }) === '50% 40%');
  check('stage 5 (no real art) falls back to "50% 40%"', exoFaceFocalOrigin({ line: 'ironwright', stage: 5 }) === '50% 40%');

  Object.keys(EXO_FACE_FOCAL).forEach(function (line) {
    Object.keys(EXO_FACE_FOCAL[line]).forEach(function (stage) {
      const out = exoFaceFocalOrigin({ line: line, stage: Number(stage) });
      const m = /^(-?[\d.]+)% (-?[\d.]+)%$/.exec(out);
      check(line + ' stage ' + stage + ' output format is "N% N%"', !!m);
      if (m) {
        const xv = parseFloat(m[1]), yv = parseFloat(m[2]);
        check(line + ' stage ' + stage + ' x in [0,100]', xv >= 0 && xv <= 100);
        check(line + ' stage ' + stage + ' y in [0,100]', yv >= 0 && yv <= 100);
      }
    });
  });
} else {
  fail++;
  console.log('FAIL: exoFaceFocalOrigin did not extract as a callable function -- skipping behavioral checks');
}

check('rMe() Evo portrait wrapper calls exoFaceFocalOrigin(ex) with a safe fallback',
  /transform-origin:'\s*\+\s*\(ex \? exoFaceFocalOrigin\(ex\) : '50% 40%'\)/.test(src));
check('rMe() no longer uses the old fixed 50% 30% transform-origin for the Evo portrait',
  !/transform-origin:'50% 30%'/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
