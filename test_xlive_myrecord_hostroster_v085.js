// PATCH X-LIVE v0.85 -- myRecord() host/admin fallback fix, unit tests.
// Extracts the REAL shipped myRecord() line from index.html (string marker,
// single-statement function) and runs it against realistic L fixtures --
// never a reimplementation.
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractStatement(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('marker not found: ' + marker);
  // myRecord is a single-line function ending in "; }" followed by a newline
  // or another statement. Find the end of this specific function body by
  // brace-counting from the first "{" after the marker.
  let i = src.indexOf('{', start);
  let depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('unterminated function at marker');
  return src.slice(start, end);
}

const myRecordSrc = extractStatement(SRC, 'function myRecord()');
if (!/L\.hostRoster/.test(myRecordSrc)) {
  throw new Error('myRecord() does not reference L.hostRoster -- fix not present, update this test or the source');
}

const sandboxSrc = `
var L = __L__;
${myRecordSrc}
module.exports = { myRecord };
`;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}

function buildSandbox(L) {
  const Module = require('module');
  const m = new Module('sandbox', null);
  m.filename = path.join(__dirname, 'sandbox_myrecord.js');
  m.paths = Module._nodeModulePaths(__dirname);
  m._compile(sandboxSrc.replace('__L__', JSON.stringify(L)), m.filename);
  return m.exports;
}

// ---- Case group 1: a real player IS in L.roster -- unchanged behavior ----
{
  const L = {
    me: { id: 'player-1', brand: 'VYBE' },
    roster: [{ id: 'player-1', brand: 'VYBE', studioId: 'studio-emagination', xc: 50, totalXc: 500, badges: 3 }],
    hostRoster: [],
  };
  const { myRecord } = buildSandbox(L);
  const rec = myRecord();
  check('player case: returns the real roster record', rec.id === 'player-1' && rec.studioId === 'studio-emagination');
  check('player case: never falls through to dummy', rec.xc === 50 && rec.totalXc === 500 && rec.badges === 3);
}

// ---- Case group 2: THE BUG -- a host/admin account, previously always got
// the dummy fallback since loadRoster() filters admins OUT of L.roster ----
{
  const L = {
    me: { id: 'admin-1', brand: 'THETOMORROWTEACHER' },
    roster: [{ id: 'player-2', brand: 'OTHER', studioId: 'studio-gentech', xc: 10, totalXc: 10, badges: 0 }],
    hostRoster: [{ id: 'admin-1', brand: 'THETOMORROWTEACHER', studioId: 'studio-innov8', xc: 0, totalXc: 0, badges: 0, role: 'admin', isHost: true }],
  };
  const { myRecord } = buildSandbox(L);
  const rec = myRecord();
  check('host/admin case: now finds the REAL hostRoster record, not the dummy', rec.id === 'admin-1');
  check('host/admin case: real studioId comes through (was lost before this fix)', rec.studioId === 'studio-innov8');
  check('host/admin case: did not accidentally match the unrelated roster entry', rec.brand === 'THETOMORROWTEACHER');
}

// ---- Case group 3: host/admin present in NEITHER array -- still falls back
// safely to the dummy object, never throws ----
{
  const L = { me: { id: 'ghost-1', brand: 'GHOST' }, roster: [], hostRoster: [] };
  const { myRecord } = buildSandbox(L);
  const rec = myRecord();
  check('no-match case: falls back to the dummy object', rec.id === 'ghost-1' && rec.brand === 'GHOST' && rec.xc === 0 && rec.totalXc === 0 && rec.badges === 0);
}

// ---- Case group 4: L.hostRoster is undefined entirely (older/odd state) --
// must not throw a TypeError reading .find on undefined ----
{
  const L = { me: { id: 'x-1', brand: 'X' }, roster: [] };
  const { myRecord } = buildSandbox(L);
  let threw = false, rec = null;
  try { rec = myRecord(); } catch (e) { threw = true; }
  check('missing hostRoster: does not throw', !threw);
  check('missing hostRoster: still returns a sane dummy', rec && rec.id === 'x-1');
}

// ---- Case group 5: L.me is null/undefined -- does not throw, dummy id/brand default ----
{
  const L = { me: null, roster: [], hostRoster: [] };
  const { myRecord } = buildSandbox(L);
  const rec = myRecord();
  check('no L.me: defaults id to "me" and brand to "Player"', rec.id === 'me' && rec.brand === 'Player');
}

// ---- Case group 6: roster lookup still takes priority over hostRoster even
// if (hypothetically) the same id existed in both -- order of || matters ----
{
  const L = {
    me: { id: 'dual-1', brand: 'DUAL' },
    roster: [{ id: 'dual-1', brand: 'DUAL', studioId: 'FROM_ROSTER', xc: 1, totalXc: 1, badges: 1 }],
    hostRoster: [{ id: 'dual-1', brand: 'DUAL', studioId: 'FROM_HOSTROSTER', xc: 2, totalXc: 2, badges: 2 }],
  };
  const { myRecord } = buildSandbox(L);
  const rec = myRecord();
  check('roster wins over hostRoster when both match (L.roster.find is first in the || chain)', rec.studioId === 'FROM_ROSTER');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
