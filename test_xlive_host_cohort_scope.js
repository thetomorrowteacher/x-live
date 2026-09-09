// Unit tests for tiered host access (part 2: cohort scoping).
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

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}

function makeSandbox() {
  const sandbox = {};
  const body =
    extractFunction(src, 'function pflxSessionInCohortScope(') + '\n' +
    'sandbox.pflxSessionInCohortScope = pflxSessionInCohortScope;\n' +
    extractFunction(src, 'function pflxVisibleSessions(') + '\n' +
    'sandbox.pflxVisibleSessions = pflxVisibleSessions;\n' +
    extractFunction(src, 'function pflxHostCapabilities(') + '\n' +
    'sandbox.pflxHostCapabilities = pflxHostCapabilities;\n';
  // pflxHostCapabilities needs PFLX_HOST_TIER_RANK in scope too
  const rankStart = src.indexOf('var PFLX_HOST_TIER_RANK = {');
  const rankEnd = src.indexOf(';', rankStart);
  const rankVar = src.slice(rankStart, rankEnd + 1);
  new Function('sandbox', 'with (sandbox) {\n' + rankVar + '\n' + body + '\n}')(sandbox);
  return sandbox;
}

// ── 1. pflxSessionInCohortScope ────────────────────────────────────────
(function () {
  const sb = makeSandbox();
  const f = sb.pflxSessionInCohortScope;

  check('no session -> false', f(null, ['Alpha']) === false);
  check('All Players session -> ALWAYS out of scope, even with matching cohorts', f({ allCohorts: true, cohorts: ['Alpha'] }, ['Alpha']) === false);
  check('session cohort matches managed cohort -> in scope', f({ allCohorts: false, cohorts: ['Alpha'] }, ['Alpha']) === true);
  check('session cohort does not match -> out of scope', f({ allCohorts: false, cohorts: ['Beta'] }, ['Alpha']) === false);
  check('session has multiple cohorts, one matches -> in scope', f({ allCohorts: false, cohorts: ['Beta', 'Alpha'] }, ['Alpha']) === true);
  check('managed has multiple cohorts, one matches -> in scope', f({ allCohorts: false, cohorts: ['Gamma'] }, ['Alpha', 'Gamma']) === true);
  check('case-insensitive matching', f({ allCohorts: false, cohorts: ['alpha'] }, ['ALPHA']) === true);
  check('scoped host with EMPTY managedCohorts -> manages nothing (strict, not permissive)', f({ allCohorts: false, cohorts: ['Alpha'] }, []) === false);
  check('scoped host with no managedCohorts at all (undefined) -> manages nothing', f({ allCohorts: false, cohorts: ['Alpha'] }, undefined) === false);
  check('session with no cohorts set -> out of scope (nothing to match)', f({ allCohorts: false, cohorts: [] }, ['Alpha']) === false);
})();

// ── 2. pflxVisibleSessions ──────────────────────────────────────────────
(function () {
  const sb = makeSandbox();
  const f = sb.pflxVisibleSessions;
  const caps = sb.pflxHostCapabilities;

  const sessions = [
    { id: 's1', allCohorts: true, cohorts: [] },
    { id: 's2', allCohorts: false, cohorts: ['Alpha'] },
    { id: 's3', allCohorts: false, cohorts: ['Beta'] },
    { id: 's4', allCohorts: false, cohorts: ['Alpha', 'Beta'] }
  ];

  check('null caps -> everything visible (unchanged pre-tier behavior)', f(sessions, null, []).length === 4);
  check('admin (unscoped) -> everything visible', f(sessions, caps('admin'), []).length === 4);
  check('master (unscoped) -> everything visible', f(sessions, caps('master'), []).length === 4);

  const guestAlpha = f(sessions, caps('guest'), ['Alpha']);
  check('guest scoped to Alpha sees only Alpha-cohort sessions (s2, s4), not All-Players or Beta-only', guestAlpha.length === 2 && guestAlpha.every(s => s.id === 's2' || s.id === 's4'));

  const instructorBeta = f(sessions, caps('instructor'), ['Beta']);
  check('instructor scoped to Beta sees only Beta-cohort sessions (s3, s4)', instructorBeta.length === 2 && instructorBeta.every(s => s.id === 's3' || s.id === 's4'));

  const cohostMulti = f(sessions, caps('cohost'), ['Alpha', 'Beta']);
  check('cohost scoped to multiple cohorts sees every session that matches either (s2, s3, s4)', cohostMulti.length === 3);

  const guestUnassigned = f(sessions, caps('guest'), []);
  check('guest with no cohort assigned yet sees nothing (strict, safe default)', guestUnassigned.length === 0);

  check('empty/missing sessions array -> empty result, no throw', f(undefined, caps('guest'), ['Alpha']).length === 0);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
