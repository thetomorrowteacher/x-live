// Unit tests for the Virtual Theater Production Crew patch.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error('start marker not found: ' + startMarker);
  const endIdx = src.indexOf(endMarker, start);
  if (endIdx === -1) throw new Error('end marker not found: ' + endMarker);
  return src.slice(start, endIdx + endMarker.length);
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}

function makeSandbox(rosterList) {
  const sandbox = {};
  const body = extractBetween(
    src,
    'var PFLX_CREW_ROLES = {',
    'window.pflxTheaterCrewPanelHtml = pflxTheaterCrewPanelHtml;\n'
  );
  sandbox.window = sandbox;
  sandbox.__toasts = [];
  sandbox.__saved = [];
  sandbox.__renders = 0;
  sandbox.toast = function (msg) { sandbox.__toasts.push(msg); };
  sandbox.render = function () { sandbox.__renders++; };
  sandbox.esc = function (s) { return String(s == null ? '' : s); };
  sandbox.saveSession = async function (s) { sandbox.__saved.push(JSON.parse(JSON.stringify(s))); return true; };
  sandbox.classRoster = function () { return rosterList || []; };
  sandbox.sortedRoster = function (list) { return list.slice().sort(function (a, b) { return (a.brand || '').localeCompare(b.brand || ''); }); };
  sandbox.L = { roster: rosterList || [], sessions: [] };
  const full = body + '\nsandbox.PFLX_CREW_ROLES = PFLX_CREW_ROLES;\nsandbox.pflxComputeCrewAssignment = pflxComputeCrewAssignment;\nsandbox.pflxCrewParticipantName = pflxCrewParticipantName;\nsandbox.pflxAssignCrewRole = pflxAssignCrewRole;\nsandbox.pflxUnassignCrewRole = pflxUnassignCrewRole;\nsandbox.pflxTheaterCrewPanelHtml = pflxTheaterCrewPanelHtml;\n';
  new Function('sandbox', 'with (sandbox) {\n' + full + '\n}')(sandbox);
  return sandbox;
}

// ---- PFLX_CREW_ROLES -- taxonomy sanity ----
{
  const sb = makeSandbox();
  const keys = Object.keys(sb.PFLX_CREW_ROLES);
  check('crew roles: exactly the 6 ported roles', keys.length === 6 &&
    ['director', 'presenter', 'sound-tech', 'dj', 'lighting-tech', 'media-tech'].every(function (k) { return keys.indexOf(k) !== -1; }));
  check('crew roles: director max is 3 (matches MC VT_ROLES)', sb.PFLX_CREW_ROLES.director.max === 3);
  check('crew roles: dj max is 1 (matches MC VT_ROLES)', sb.PFLX_CREW_ROLES.dj.max === 1);
}

// ---- pflxComputeCrewAssignment -- pure logic ----
{
  const sb = makeSandbox();
  const r = sb.pflxComputeCrewAssignment({}, 'p1', 'director');
  check('assign: first assignment to an empty map succeeds', r.ok === true && r.assignments.p1 === 'director');
}
{
  const sb = makeSandbox();
  const r = sb.pflxComputeCrewAssignment({}, 'p1', 'not-a-real-role');
  check('assign: unknown role key is rejected', r.ok === false && r.error === 'unknown_role');
}
{
  const sb = makeSandbox();
  const r = sb.pflxComputeCrewAssignment({ p1: 'director' }, 'p1', '');
  check('assign: falsy roleKey unassigns the player', r.ok === true && !('p1' in r.assignments));
}
{
  const sb = makeSandbox();
  // dj max is 1 -- p1 already holds it, p2 should be refused
  const r = sb.pflxComputeCrewAssignment({ p1: 'dj' }, 'p2', 'dj');
  check('assign: role at max capacity is refused for a NEW player', r.ok === false && r.error === 'role_full');
}
{
  const sb = makeSandbox();
  // director max is 3 -- reassigning the SAME player who already holds it must not count against capacity
  const r = sb.pflxComputeCrewAssignment({ p1: 'director', p2: 'director', p3: 'director' }, 'p1', 'director');
  check('assign: re-assigning a player to the role they already hold does not trip the capacity check', r.ok === true && r.assignments.p1 === 'director');
}
{
  const sb = makeSandbox();
  // a player switching from one role to another frees their old slot
  const r = sb.pflxComputeCrewAssignment({ p1: 'director', p2: 'dj' }, 'p1', 'sound-tech');
  check('assign: switching roles drops the player from their old role (single role per player)', r.assignments.p1 === 'sound-tech');
  check('assign: switching roles leaves other players untouched', r.assignments.p2 === 'dj');
}
{
  const sb = makeSandbox();
  const input = { p1: 'director' };
  const before = JSON.stringify(input);
  sb.pflxComputeCrewAssignment(input, 'p2', 'dj');
  check('assign: never mutates the input assignments object', JSON.stringify(input) === before);
}
{
  const sb = makeSandbox();
  const r = sb.pflxComputeCrewAssignment({}, 'p1', '');
  check('assign: unassigning a player who was never assigned is a safe no-op (still ok)', r.ok === true);
}

// ---- pflxCrewParticipantName ----
{
  const roster = [{ id: 'p1', brand: 'Kaitlin' }, { id: 'p2', brand: 'Marcus' }];
  const sb = makeSandbox(roster);
  check('participant name: resolves a real roster id to its brand name', sb.pflxCrewParticipantName('p1') === 'Kaitlin');
  check('participant name: falls back to the raw id when not found on the roster', sb.pflxCrewParticipantName('ghost-id') === 'ghost-id');
}

// ---- pflxAssignCrewRole / pflxUnassignCrewRole -- side-effecting wrappers ----
async function runAsyncTests() {
  {
    const roster = [{ id: 'p1', brand: 'Kaitlin' }];
    const sb = makeSandbox(roster);
    const s = { id: 's1', title: 'Friday Show', crewAssignments: {} };
    sb.L.sessions = [s];
    await sb.pflxAssignCrewRole('s1', 'p1', 'director');
    check('assign wrapper: sets crewAssignments on the real session object', s.crewAssignments.p1 === 'director');
    check('assign wrapper: calls saveSession with the updated session', sb.__saved.length === 1 && sb.__saved[0].crewAssignments.p1 === 'director');
    check('assign wrapper: re-renders after a successful assignment', sb.__renders === 1);
    check('assign wrapper: toasts a confirmation naming the role', sb.__toasts[0].indexOf('Director') !== -1 && sb.__toasts[0].indexOf('Kaitlin') !== -1);
  }
  {
    // role_full path -- must toast the capacity warning, re-render (to reset the <select>), and NOT save
    const roster = [{ id: 'p1', brand: 'A' }, { id: 'p2', brand: 'B' }];
    const sb = makeSandbox(roster);
    const s = { id: 's1', title: 'Show', crewAssignments: { p1: 'dj' } };
    sb.L.sessions = [s];
    await sb.pflxAssignCrewRole('s1', 'p2', 'dj');
    check('assign wrapper: role-full does NOT mutate crewAssignments', !('p2' in s.crewAssignments));
    check('assign wrapper: role-full does NOT call saveSession', sb.__saved.length === 0);
    check('assign wrapper: role-full still re-renders (resets the dropdown)', sb.__renders === 1);
    check('assign wrapper: role-full toasts a capacity message', sb.__toasts[0].indexOf('max capacity') !== -1);
  }
  {
    // unassign wrapper delegates to assign with an empty roleKey
    const roster = [{ id: 'p1', brand: 'Kaitlin' }];
    const sb = makeSandbox(roster);
    const s = { id: 's1', title: 'Show', crewAssignments: { p1: 'presenter' } };
    sb.L.sessions = [s];
    await sb.pflxUnassignCrewRole('s1', 'p1');
    check('unassign wrapper: removes the player from crewAssignments', !('p1' in s.crewAssignments));
    check('unassign wrapper: saves the session after removal', sb.__saved.length === 1);
    check('unassign wrapper: toasts a removal message (not an assignment message)', sb.__toasts[0].indexOf('Removed') !== -1);
  }
  {
    // missing session id -- must fail closed, no throw, no save/render
    const sb = makeSandbox([{ id: 'p1', brand: 'A' }]);
    sb.L.sessions = [];
    let threw = false;
    try { await sb.pflxAssignCrewRole('nope', 'p1', 'director'); } catch (e) { threw = true; }
    check('assign wrapper: unknown session id does not throw', threw === false);
    check('assign wrapper: unknown session id performs no save', sb.__saved.length === 0);
  }
  {
    // missing playerId -- must fail closed
    const sb = makeSandbox([]);
    const s = { id: 's1', crewAssignments: {} };
    sb.L.sessions = [s];
    await sb.pflxAssignCrewRole('s1', '', 'director');
    check('assign wrapper: empty playerId performs no save', sb.__saved.length === 0);
  }

  // ---- pflxTheaterCrewPanelHtml -- rendering sanity (no crash, reflects state) ----
  {
    const roster = [{ id: 'p1', brand: 'Kaitlin' }, { id: 'p2', brand: 'Marcus' }];
    const sb = makeSandbox(roster);
    const s = { id: 's1', title: 'Friday Show', crewAssignments: { p1: 'director' } };
    const html = sb.pflxTheaterCrewPanelHtml(s);
    check('panel html: renders all 6 role cards', (html.match(/<select/g) || []).length === 6);
    check('panel html: shows the assigned player as a chip', html.indexOf('Kaitlin') !== -1);
    check('panel html: shows the session title', html.indexOf('Friday Show') !== -1);
    check('panel html: an unassigned role shows 0/N capacity', html.indexOf('0/1') !== -1); // dj, unassigned
  }
  {
    // empty roster must not crash the renderer
    const sb = makeSandbox([]);
    const s = { id: 's1', title: 'Empty Room', crewAssignments: {} };
    let threw = false, html = '';
    try { html = sb.pflxTheaterCrewPanelHtml(s); } catch (e) { threw = true; }
    check('panel html: empty roster does not throw', threw === false);
    check('panel html: empty roster still renders the 6 role cards', (html.match(/<select/g) || []).length === 6);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

runAsyncTests();
