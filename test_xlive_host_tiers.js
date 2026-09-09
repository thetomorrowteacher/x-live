// Unit tests for tiered host access (part 1: capability gating).
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
function extractVar(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('not found: ' + marker);
  const end = src.indexOf(';', start);
  return src.slice(start, end + 1);
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}

function makeSandbox() {
  const sandbox = {};
  const body =
    extractFunction(src, 'function pflxResolveHostTier(') + '\n' +
    'sandbox.pflxResolveHostTier = pflxResolveHostTier;\n' +
    extractVar(src, 'var PFLX_HOST_TIER_RANK = {') + '\n' +
    extractFunction(src, 'function pflxHostCapabilities(') + '\n' +
    'sandbox.pflxHostCapabilities = pflxHostCapabilities;\n' +
    extractFunction(src, 'function pflxHostTabAllowed(') + '\n' +
    'sandbox.pflxHostTabAllowed = pflxHostTabAllowed;\n';
  new Function('sandbox', 'with (sandbox) {\n' + body + '\n}')(sandbox);
  return sandbox;
}

// ── 1. pflxResolveHostTier -- mirrors the Console's own hostTier()
//      resolution order exactly ─────────────────────────────────────
(function () {
  const sb = makeSandbox();
  const f = sb.pflxResolveHostTier;

  check('explicit hostTier always wins over role', f('Admin', 'guest') === 'guest');
  check('explicit hostTier "instructor" passes through', f('Student', 'instructor') === 'instructor');
  check('explicit hostTier "cohost" passes through', f('Student', 'cohost') === 'cohost');
  check('unknown hostTier value falls back to role resolution', f('admin', 'not-a-real-tier') === 'master');

  check('role admin -> master (no explicit hostTier)', f('Admin', null) === 'master');
  check('role host -> admin', f('Host', null) === 'admin');
  check('role instructor -> instructor', f('Instructor', null) === 'instructor');
  check('role teacher -> instructor', f('Teacher', null) === 'instructor');
  check('role Student -> null (not a host)', f('Student', null) === null);
  check('role empty/undefined -> null', f(undefined, undefined) === null);
  check('case-insensitive role matching', f('ADMIN', null) === 'master');
})();

// ── 2. pflxHostCapabilities -- Ennis's confirmed Sept 9 scope ─────────
(function () {
  const sb = makeSandbox();
  const f = sb.pflxHostCapabilities;

  check('null tier -> null (not a host at all)', f(null) === null);

  const guest = f('guest');
  check('guest can build sessions', guest.buildSessions === true);
  check('guest can run sessions', guest.runSessions === true);
  check('guest CANNOT edit rewards', guest.editRewards === false);
  check('guest CANNOT delete sessions', guest.deleteSessions === false);
  check('guest CANNOT reach Teams tab', guest.teamsTab === false);
  check('guest CANNOT reach Setup tab', guest.setupTab === false);
  check('guest IS cohort-scoped (corrected Sept 9: Guest Host manages one MC Project AND one Cohort)', guest.scopedToCohorts === true);

  const instructor = f('instructor');
  check('instructor can build+run sessions', instructor.buildSessions === true && instructor.runSessions === true);
  check('instructor CAN edit rewards (everything except Setup)', instructor.editRewards === true);
  check('instructor CAN delete sessions', instructor.deleteSessions === true);
  check('instructor CAN reach Teams tab', instructor.teamsTab === true);
  check('instructor CANNOT reach Setup tab', instructor.setupTab === false);
  check('instructor IS cohort-scoped', instructor.scopedToCohorts === true);

  const cohost = f('cohost');
  check('cohost treated the same as instructor for capabilities', cohost.editRewards === true && cohost.teamsTab === true && cohost.setupTab === false);
  check('cohost is also cohort-scoped', cohost.scopedToCohorts === true);

  const admin = f('admin');
  check('admin gets everything including Setup', admin.setupTab === true && admin.deleteSessions === true && admin.editRewards === true);
  check('admin is not cohort-scoped (global)', admin.scopedToCohorts === false);

  const master = f('master');
  check('master gets everything including Setup', master.setupTab === true && master.deleteSessions === true);
})();

// ── 3. pflxHostTabAllowed ──────────────────────────────────────────────
(function () {
  const sb = makeSandbox();
  const caps = sb.pflxHostCapabilities;
  const allowed = sb.pflxHostTabAllowed;

  check('no caps (null) -> every tab allowed (fail-open only used pre-tier-resolution)', allowed('setup', null) === true);
  check('guest: class tab allowed (not gated)', allowed('class', caps('guest')) === true);
  check('guest: live tab allowed (not gated)', allowed('live', caps('guest')) === true);
  check('guest: teams tab BLOCKED', allowed('teams', caps('guest')) === false);
  check('guest: setup tab BLOCKED', allowed('setup', caps('guest')) === false);
  check('instructor: teams tab allowed', allowed('teams', caps('instructor')) === true);
  check('instructor: setup tab BLOCKED', allowed('setup', caps('instructor')) === false);
  check('admin: setup tab allowed', allowed('setup', caps('admin')) === true);
  check('admin: teams tab allowed', allowed('teams', caps('admin')) === true);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
