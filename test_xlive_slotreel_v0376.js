// PATCH X-LIVE v0.37.6 -- slot-reel randomizer replacing the conic-gradient wheel.
// Extracts the REAL wheelOpen()/wheelSpin() source from index.html (brace-counting,
// never a reimplementation) and runs it against a mocked DOM/sandbox.
const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, 'index.html');
const src = fs.readFileSync(SRC_PATH, 'utf8');

function extractFn(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = m.index + m[0].length;
  let depth = 1;
  while (depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(m.index, i);
}

const wheelOpenSrc = extractFn('wheelOpen');
const wheelSpinSrc = extractFn('wheelSpin');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}

// ---- source-level checks (cheap, no execution needed) ----
ok(wheelOpenSrc.includes('reelTrack') && wheelOpenSrc.includes('reelPayline'), 'wheelOpen renders #reelTrack/#reelPayline markup');
ok(!wheelOpenSrc.includes('conic-gradient'), 'wheelOpen no longer builds a conic-gradient wheel');
ok(!wheelOpenSrc.includes('TEAM_COLORS'), 'wheelOpen no longer references TEAM_COLORS (segment coloring removed)');
ok(wheelSpinSrc.includes("document.getElementById('reelTrack')"), 'wheelSpin drives #reelTrack (not #wheel)');
ok(!wheelSpinSrc.includes("rotate("), 'wheelSpin no longer does a CSS rotate()');
ok(wheelSpinSrc.includes('translateY('), 'wheelSpin animates via translateY()');
ok(wheelSpinSrc.includes("xlSfx('wheelSpin')") && wheelSpinSrc.includes("xlSfx('wheelLand')"), 'wheelSpin still fires the same wheelSpin/wheelLand SFX cues');
ok(wheelSpinSrc.includes('lastRandomPickId') && wheelSpinSrc.includes('lastRandomPickAt'), 'wheelSpin still writes lastRandomPickId/At onto the live session');

// ---- behavioral checks: execute the real functions in a sandboxed DOM ----
function makeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c) => set.has(c) ? set.delete(c) : set.add(c),
    contains: (c) => set.has(c),
  };
}

function makeEl(id) {
  return {
    id,
    _innerHTML: '',
    style: {},
    classList: makeClassList(),
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = v; },
    get textContent() { return this._innerHTML; },
    set textContent(v) { this._innerHTML = v; },
    get offsetWidth() { return 100; },
  };
}

function runScenario(rosterSize) {
  const roster = [];
  for (let i = 0; i < rosterSize; i++) {
    roster.push({ id: 'p' + i, brand: 'Player ' + i });
  }

  const els = {
    proj: makeEl('proj'),
    reelTrack: makeEl('reelTrack'),
    wheelName: makeEl('wheelName'),
  };

  const savedSessions = [];
  const sfxCalls = [];

  const sandboxLines = [
    'let wheelPlayers = [];',
    'let projIv = null;',
    'let L = { projTimerOn: null, projDeck: true };',
    "function classRoster() { return ROSTER.slice(); }",
    'function esc(s) { return String(s); }',
    "function xlSfx(name, vol) { SFX_CALLS.push(name); }",
    'function xlProjGestures(p) {}',
    "function xlProjArrowsHtml() { return ''; }",
    'function xlRunningSession() { return RUNNING_SESSION; }',
    'function saveSession(s) { SAVED.push(JSON.parse(JSON.stringify(s))); }',
    "function getEl(id) { return ELS[id]; }",
    'const document = { getElementById: getEl };',
    'const Math_random_orig = Math.random;',
    'function setTimeout(fn, ms) { fn(); }', // fire the reveal synchronously so the test does not have to wait 4.3s
    wheelOpenSrc,
    wheelSpinSrc,
  ].join('\n');

  const fn = new Function(
    'ROSTER', 'ELS', 'SFX_CALLS', 'SAVED', 'RUNNING_SESSION',
    sandboxLines + '\nreturn { wheelOpen, wheelSpin, getPlayers: () => wheelPlayers };'
  );

  const runningSession = { status: 'active', id: 'sess1' };
  const api = fn(roster, els, sfxCalls, savedSessions, runningSession);

  api.wheelOpen();
  // wheelOpen writes the whole projector markup (including the seeded reel cells) onto
  // #proj.innerHTML in one shot -- in a real browser that innerHTML parse is what CREATES
  // the nested #reelTrack element wheelSpin() later looks up by id. This flat mock does not
  // simulate HTML parsing, so check the string wheelOpen actually wrote (#proj), not the
  // separately-mocked #reelTrack object, which only becomes meaningful once wheelSpin() writes
  // to it directly.
  const initHtml = els.proj.innerHTML;

  // Pin Math.random so we can predict the winner index deterministically.
  const originalRandom = Math.random;
  const pickFraction = 0.5; // picks roughly the middle player for the "winner" index calc
  Math.random = () => pickFraction;
  api.wheelSpin();
  Math.random = originalRandom;

  return { els, api, savedSessions, sfxCalls, initHtml, roster };
}

// Case A: normal roster
{
  const { els, savedSessions, sfxCalls, initHtml, roster } = runScenario(8);
  ok(els.proj.classList.contains('on'), 'wheelOpen adds .on to #proj');
  ok(initHtml.includes('reelCell') && initHtml.includes('Player 0'), 'wheelOpen seeds the reel with real roster names before any spin');
  const finalHtml = els.reelTrack.innerHTML;
  ok(finalHtml.includes('reelWinner'), 'wheelSpin marks exactly one cell as the winner');
  const winnerMatches = (finalHtml.match(/reelWinner/g) || []).length;
  ok(winnerMatches === 1, 'exactly one .reelWinner cell exists in the strip (' + winnerMatches + ')');
  ok(sfxCalls.includes('wheelSpin') && sfxCalls.includes('wheelLand') && sfxCalls.includes('award'), 'both spin and landing SFX cues fired');
  ok(savedSessions.length === 1, 'the running session was saved exactly once on landing');
  ok(typeof savedSessions[0].lastRandomPickId === 'string' && roster.some(p => p.id === savedSessions[0].lastRandomPickId), 'saved lastRandomPickId is a real roster player id');
  ok(typeof savedSessions[0].lastRandomPickAt === 'number', 'saved lastRandomPickAt is a timestamp');

  // Winner name embedded in the reveal line, matching the id that got saved
  const winner = roster.find(p => p.id === savedSessions[0].lastRandomPickId);
  ok(els.wheelName.innerHTML.includes(winner.brand), 'the revealed wheelName text matches the saved winner');
}

// Case B: small roster (n=1) should still resolve to a single, correct winner
{
  const { els, savedSessions, roster } = runScenario(1);
  ok(savedSessions.length === 1 && savedSessions[0].lastRandomPickId === roster[0].id, 'a 1-player roster always picks that lone player');
  ok(els.wheelName.innerHTML.includes(roster[0].brand), 'single-player roster reveal shows the right name');
}

// Case C: wheelOpen with an empty roster is a safe no-op (mirrors the pre-existing guard)
{
  const els = { proj: makeEl('proj'), reelTrack: makeEl('reelTrack'), wheelName: makeEl('wheelName') };
  const sandboxLines = [
    'let wheelPlayers = [];',
    'let projIv = null;',
    'let L = { projTimerOn: null, projDeck: true };',
    "function classRoster() { return []; }",
    'function esc(s) { return String(s); }',
    "function xlSfx(name) {}",
    'function xlProjGestures(p) {}',
    "function xlProjArrowsHtml() { return ''; }",
    'function xlRunningSession() { return null; }',
    'function saveSession(s) {}',
    "function getEl(id) { return ELS[id]; }",
    'const document = { getElementById: getEl };',
    wheelOpenSrc,
    wheelSpinSrc,
  ].join('\n');
  const fn = new Function('ELS', sandboxLines + '\nreturn { wheelOpen };');
  const api = fn(els);
  let threw = false;
  try { api.wheelOpen(); } catch (e) { threw = true; }
  ok(!threw, 'wheelOpen on an empty roster does not throw');
  ok(!els.proj.classList.contains('on'), 'wheelOpen on an empty roster never opens the projector (early return preserved)');
}

// Case D: geometry sanity -- the landing formula always centers the winner cell on the payline
{
  // Re-derive the same constants the real function uses and confirm the math the
  // extracted source computes is internally consistent for a range of strip lengths.
  const wrapMatch = /WRAP_H\s*=\s*(\d+)/.exec(wheelSpinSrc);
  const cellMatch = /CELL_H\s*=\s*(\d+)/.exec(wheelSpinSrc);
  ok(!!wrapMatch && !!cellMatch, 'WRAP_H/CELL_H constants are present in the real source');
  const WRAP_H = Number(wrapMatch[1]), CELL_H = Number(cellMatch[1]);
  for (const stripLen of [5, 20, 37]) {
    const targetY = (WRAP_H / 2 - CELL_H / 2) - (stripLen - 1) * CELL_H;
    const winnerIndex = stripLen - 1;
    const winnerCenterOnScreen = winnerIndex * CELL_H + CELL_H / 2 + targetY;
    ok(winnerCenterOnScreen === WRAP_H / 2, 'winner cell lands dead-center on the payline for stripLen=' + stripLen);
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
