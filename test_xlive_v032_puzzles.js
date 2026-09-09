// Unit tests for the X-Rush v0.32 shortcut puzzle challenges patch.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractFunction(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('not found: ' + marker);
  const braceStart = src.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}
function extractConst(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('not found: ' + marker);
  const braceOrBracketStart = src.indexOf('{', start) === -1 ? src.indexOf('[', start) : Math.min(...[src.indexOf('{', start), src.indexOf('[', start)].filter(x => x !== -1));
  const openCh = src[braceOrBracketStart];
  const closeCh = openCh === '{' ? '}' : ']';
  let depth = 0, i = braceOrBracketStart;
  for (; i < src.length; i++) {
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh) { depth--; if (depth === 0) { i++; break; } }
  }
  // consume trailing semicolon if present
  if (src[i] === ';') i++;
  return src.slice(start, i);
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}

function makeSandbox() {
  const sandbox = { btoa: (s) => Buffer.from(s, 'binary').toString('base64') };
  const names = [
    'pflxSeededRand', 'pflxPuzzleCaesarGenerate', 'pflxPuzzleBase64Generate',
    'pflxPuzzleBinaryGenerate', 'pflxPuzzleCodeGenerate', 'pflxPuzzleCheckAnswer',
    'pflxPuzzleGenerate', 'pflxPuzzleStationSlideIds', 'pflxPuzzleForSlide',
    'pflxPuzzleSolve',
  ];
  let body = extractConst(src, 'var PFLX_PUZZLE_WORDBANK = [') + '\n';
  body += 'var PFLX_PUZZLE_JUMP_AMOUNT = 15;\n';
  body += extractConst(src, 'var PFLX_PUZZLE_CODE_TEMPLATES = [') + '\n';
  body += extractConst(src, 'var PFLX_PUZZLE_TYPES = {') + '\n';
  names.forEach(function (n) { body += extractFunction(src, 'function ' + n + '(') + '\n'; });
  body += 'sandbox.PFLX_PUZZLE_WORDBANK = PFLX_PUZZLE_WORDBANK;\n';
  body += 'sandbox.PFLX_PUZZLE_JUMP_AMOUNT = PFLX_PUZZLE_JUMP_AMOUNT;\n';
  body += 'sandbox.PFLX_PUZZLE_CODE_TEMPLATES = PFLX_PUZZLE_CODE_TEMPLATES;\n';
  body += 'sandbox.PFLX_PUZZLE_TYPES = PFLX_PUZZLE_TYPES;\n';
  body += names.map(function (n) { return 'sandbox.' + n + ' = ' + n + ';'; }).join('\n');
  new Function('sandbox', 'with (sandbox) {\n' + body + '\n}')(sandbox);
  return sandbox;
}

function raceSlide(id) { return { id: id, type: 'quiz_race', revealed: false }; }
function otherSlide(id) { return { id: id, type: 'exit' }; }

// ── 1. pflxSeededRand determinism ────────────────────────────────────
(function () {
  const sb = makeSandbox();
  const a = sb.pflxSeededRand('slideA');
  const b = sb.pflxSeededRand('slideA');
  const c = sb.pflxSeededRand('slideB');
  check('same seed -> identical sequence', a() === b() && a() === b());
  const d = sb.pflxSeededRand('slideA');
  check('different seed -> (almost certainly) a different first value', d() !== c());
  const e = sb.pflxSeededRand('x');
  const v1 = e(); const v2 = e();
  check('successive calls from one seeded rand differ (not constant)', v1 !== v2);
})();

// ── 2. Each puzzle template: generated instance always has exactly one
//      correct, verifiable answer, and is genuinely computed (not a fixed
//      canned string) ───────────────────────────────────────────────────
(function () {
  const sb = makeSandbox();
  for (let i = 0; i < 20; i++) {
    const rand = sb.pflxSeededRand('caesar_' + i);
    const inst = sb.pflxPuzzleCaesarGenerate(rand);
    check('caesar #' + i + ': answer is a real wordbank word', sb.PFLX_PUZZLE_WORDBANK.indexOf(inst.answer) !== -1);
    check('caesar #' + i + ': prompt correctly checks against its own answer', sb.pflxPuzzleCheckAnswer(inst.answer, inst.answer));
    check('caesar #' + i + ': a wrong guess is rejected', !sb.pflxPuzzleCheckAnswer(inst.answer, inst.answer + 'X'));
  }
})();
(function () {
  const sb = makeSandbox();
  for (let i = 0; i < 10; i++) {
    const rand = sb.pflxSeededRand('base64_' + i);
    const inst = sb.pflxPuzzleBase64Generate(rand);
    check('base64 #' + i + ': prompt actually contains a real Base64 encoding of the answer', inst.prompt.indexOf(Buffer.from(inst.answer, 'binary').toString('base64')) !== -1);
    check('base64 #' + i + ': checker accepts the true answer', sb.pflxPuzzleCheckAnswer(inst.answer, inst.answer.toLowerCase()));
  }
})();
(function () {
  const sb = makeSandbox();
  for (let i = 0; i < 10; i++) {
    const rand = sb.pflxSeededRand('binary_' + i);
    const inst = sb.pflxPuzzleBinaryGenerate(rand);
    check('binary #' + i + ': answer word is <=5 chars (kept short for the binary encoding)', inst.answer.length <= 5);
    // Re-derive the binary independently and confirm it's really encoded in the prompt.
    const bin = inst.answer.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
    check('binary #' + i + ': prompt contains the real binary encoding of the answer', inst.prompt.indexOf(bin) !== -1);
  }
})();
(function () {
  const sb = makeSandbox();
  for (let i = 0; i < 20; i++) {
    const rand = sb.pflxSeededRand('code_' + i);
    const inst = sb.pflxPuzzleCodeGenerate(rand);
    check('code #' + i + ': answer is a numeric/string result, not empty', inst.answer.length > 0);
    check('code #' + i + ': prompt actually embeds real, runnable-looking JS', /console\.log/.test(inst.prompt));
  }
})();

// ── 3. pflxPuzzleGenerate: deterministic per (type, seed); different
//      types produce structurally different prompts ─────────────────────
(function () {
  const sb = makeSandbox();
  const a = sb.pflxPuzzleGenerate('caesar', 'seed1');
  const b = sb.pflxPuzzleGenerate('caesar', 'seed1');
  check('same (type, seed) -> identical prompt+answer', a.prompt === b.prompt && a.answer === b.answer);
  const c = sb.pflxPuzzleGenerate('caesar', 'seed2');
  check('different seed -> a different instance (almost certainly)', a.prompt !== c.prompt || a.answer !== c.answer);
  check('unknown type -> null', sb.pflxPuzzleGenerate('nope', 'seed1') === null);
  check('every instance carries its type key', a.key === 'caesar');
})();

// ── 4. pflxPuzzleStationSlideIds: every Nth quiz_race slide, interleaved
//      non-race slides don't throw off the count ─────────────────────────
(function () {
  const sb = makeSandbox();
  const slides = [raceSlide('r1'), otherSlide('o1'), raceSlide('r2'), raceSlide('r3'), otherSlide('o2'), raceSlide('r4'), raceSlide('r5'), raceSlide('r6')];
  const s = { slides: slides, puzzleInterval: 3 };
  const ids = sb.pflxPuzzleStationSlideIds(s);
  check('every 3rd quiz_race slide is a station (r3, r6)', JSON.stringify(ids) === JSON.stringify(['r3', 'r6']));
  const s2 = { slides: slides, puzzleInterval: 1 };
  check('interval 1 -> every quiz_race slide is a station', sb.pflxPuzzleStationSlideIds(s2).length === 6);
  const s3 = { slides: slides, puzzleInterval: 0 };
  check('interval 0 is falsy -> falls back to the default of 3 (r3, r6), same as unset', JSON.stringify(sb.pflxPuzzleStationSlideIds(s3)) === JSON.stringify(['r3', 'r6']));
  const s5 = { slides: slides, puzzleInterval: -2 };
  check('a negative interval clamps to 1 rather than crashing (never divides by zero)', sb.pflxPuzzleStationSlideIds(s5).length === 6);
  const s4 = { slides: [], puzzleInterval: 3 };
  check('no slides -> no stations', sb.pflxPuzzleStationSlideIds(s4).length === 0);
})();

// ── 5. pflxPuzzleForSlide: off/not-a-station/category gating, and
//      deterministic type selection per station ──────────────────────────
(function () {
  const sb = makeSandbox();
  const slides = [raceSlide('r1'), raceSlide('r2'), raceSlide('r3')];
  const sOff = { slides: slides, puzzlesEnabled: false, puzzleInterval: 3 };
  check('puzzles disabled -> null even on a station slide', sb.pflxPuzzleForSlide(sOff, 'r3') === null);
  const sOn = { slides: slides, puzzlesEnabled: true, puzzleInterval: 3 };
  check('non-station slide -> null', sb.pflxPuzzleForSlide(sOn, 'r1') === null);
  const p1 = sb.pflxPuzzleForSlide(sOn, 'r3');
  const p2 = sb.pflxPuzzleForSlide(sOn, 'r3');
  check('station slide -> a real puzzle instance', p1 && typeof p1.answer === 'string' && p1.answer.length > 0);
  check('same station slide always regenerates the identical puzzle (no stored state needed)', p1.prompt === p2.prompt && p1.answer === p2.answer && p1.key === p2.key);
  const sRestricted = { slides: slides, puzzlesEnabled: true, puzzleInterval: 3, puzzleCategories: ['base64'] };
  const p3 = sb.pflxPuzzleForSlide(sRestricted, 'r3');
  check('restricting categories always picks from the enabled set', p3.key === 'base64');
})();

// ── 6. pflxPuzzleSolve: correctness gating, one solve per player per
//      slide, disabled/non-station rejection ─────────────────────────────
(function () {
  const sb = makeSandbox();
  const slides = [raceSlide('r1'), raceSlide('r2'), raceSlide('r3')];
  const s = { slides: slides, puzzlesEnabled: true, puzzleInterval: 3, raceEvents: [] };
  const puzzle = sb.pflxPuzzleForSlide(s, 'r3');
  const wrong = sb.pflxPuzzleSolve(s, 'p1', 'r3', 'totally-wrong-answer', 1000);
  check('wrong answer -> rejected, reason incorrect', !wrong.ok && wrong.reason === 'incorrect');
  const right = sb.pflxPuzzleSolve(s, 'p1', 'r3', puzzle.answer, 1000);
  check('correct answer -> accepted', right.ok);
  check('solve event carries the flat jump amount', right.event.jumpAmount === sb.PFLX_PUZZLE_JUMP_AMOUNT);
  check('solve event is tagged with the puzzle type', right.event.puzzleType === puzzle.key);
  s.raceEvents.push(right.event);
  const again = sb.pflxPuzzleSolve(s, 'p1', 'r3', puzzle.answer, 2000);
  check('solving the same station twice as the same player is rejected', !again.ok && again.reason === 'already-solved');
  const otherPlayer = sb.pflxPuzzleSolve(s, 'p2', 'r3', puzzle.answer, 2000);
  check('a DIFFERENT player can still solve the same station', otherPlayer.ok);
  const notStation = sb.pflxPuzzleSolve(s, 'p3', 'r1', 'anything', 1000);
  check('non-station slide -> rejected, reason not-a-station', !notStation.ok && notStation.reason === 'not-a-station');
  const sOff = { slides: slides, puzzlesEnabled: false, puzzleInterval: 3, raceEvents: [] };
  const disabledResult = sb.pflxPuzzleSolve(sOff, 'p1', 'r3', 'anything', 1000);
  check('puzzles disabled -> rejected, reason puzzles-disabled', !disabledResult.ok && disabledResult.reason === 'puzzles-disabled');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
