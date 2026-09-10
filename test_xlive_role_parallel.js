// Unit tests for the Host/Player mode "should be parallel" patch.
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

function makeSandbox() {
  const sandbox = {};
  sandbox.window = sandbox;
  const helpers = extractBetween(
    src,
    'function pflxResolveDisplayHost(realIsHost, broadcastRole) {',
    'window.pflxSyncScreenForRoleChange = pflxSyncScreenForRoleChange;\n'
  );
  const scope = extractBetween(
    src,
    'function pflxSessionInCohortScope(session, managedCohorts) {',
    'window.pflxSessionInCohortScope = pflxSessionInCohortScope;\n'
  );
  const applies = extractBetween(
    src,
    'function nativeSessionAppliesToMe() {',
    '\n}',
  );
  const full = helpers + '\n' + scope + '\n' + applies +
    '\nsandbox.pflxResolveDisplayHost = pflxResolveDisplayHost;' +
    '\nsandbox.pflxSyncScreenForRoleChange = pflxSyncScreenForRoleChange;' +
    '\nsandbox.pflxSessionInCohortScope = pflxSessionInCohortScope;' +
    '\nsandbox.nativeSessionAppliesToMe = nativeSessionAppliesToMe;\n';
  new Function('sandbox', 'with (sandbox) {\n' + full + '\n}')(sandbox);
  return sandbox;
}

// ---- pflxResolveDisplayHost ----
{
  const sb = makeSandbox();
  check('display host: a real player (realIsHost=false) is always false, regardless of a spoofed role', sb.pflxResolveDisplayHost(false, 'host') === false);
}
{
  const sb = makeSandbox();
  check('display host: a real host with role "player" displays as player', sb.pflxResolveDisplayHost(true, 'player') === false);
}
{
  const sb = makeSandbox();
  check('display host: a real host with role "host" displays as host', sb.pflxResolveDisplayHost(true, 'host') === true);
}
{
  const sb = makeSandbox();
  check('display host: a real host with NO role given at all defaults to host (unchanged legacy behavior)', sb.pflxResolveDisplayHost(true, undefined) === true);
}
{
  const sb = makeSandbox();
  check('display host: a real player with no role given stays player', sb.pflxResolveDisplayHost(false, undefined) === false);
}

// ---- pflxSyncScreenForRoleChange ----
{
  const sb = makeSandbox();
  check('screen sync: a shared-key screen (theater) carries over host->player unchanged', sb.pflxSyncScreenForRoleChange(false, 'theater', false) === 'theater');
}
{
  const sb = makeSandbox();
  check('screen sync: a shared-key screen (theater) carries over player->host unchanged', sb.pflxSyncScreenForRoleChange(true, 'theater', false) === 'theater');
}
{
  const sb = makeSandbox();
  check('screen sync: boards (shared) carries over unchanged', sb.pflxSyncScreenForRoleChange(false, 'boards', false) === 'boards');
}
{
  const sb = makeSandbox();
  check('screen sync: a host-only screen (setup) with no running session falls back to the player home (me)', sb.pflxSyncScreenForRoleChange(false, 'setup', false) === 'me');
}
{
  const sb = makeSandbox();
  check('screen sync: the LIVE tab with an actively running session lands on livenative (the real player view) when switching to player', sb.pflxSyncScreenForRoleChange(false, 'live', true) === 'livenative');
}
{
  const sb = makeSandbox();
  check('screen sync: the LIVE tab with NO running session falls back to the generic player home instead of livenative', sb.pflxSyncScreenForRoleChange(false, 'live', false) === 'me');
}
{
  const sb = makeSandbox();
  check('screen sync: switching to host from a player-only screen (shop) falls back to the host home (class)', sb.pflxSyncScreenForRoleChange(true, 'shop', false) === 'class');
}
{
  const sb = makeSandbox();
  check('screen sync: livenative itself (special screen outside the tab bar) is host-only-falls-back when switching to host', sb.pflxSyncScreenForRoleChange(true, 'livenative', false) === 'class');
}

// ---- nativeSessionAppliesToMe -- host preview bypass ----
{
  const sb = makeSandbox();
  sb.L = {
    me: { id: 'host-1', managedCohorts: [] },
    roster: [],
    realIsHost: true, isHost: false, // previewing as player
    hostCapabilities: { scopedToCohorts: false }, // admin/master -- unscoped
    sessions: [{ id: 's1', status: 'active', cohorts: ['5th Period'], allCohorts: false }]
  };
  const s = sb.nativeSessionAppliesToMe();
  check('preview bypass: an unscoped previewing host (admin/master) sees a cohort-restricted active session even with no roster entry', s && s.id === 's1');
}
{
  const sb = makeSandbox();
  sb.L = {
    me: { id: 'host-1', managedCohorts: ['5th Period'] },
    roster: [],
    realIsHost: true, isHost: false,
    hostCapabilities: { scopedToCohorts: true }, // a scoped Guest/Instructor host
    sessions: [{ id: 's1', status: 'active', cohorts: ['5th Period'], allCohorts: false }]
  };
  const s = sb.nativeSessionAppliesToMe();
  check('preview bypass: a scoped previewing host sees a session inside their OWN managed cohort', s && s.id === 's1');
}
{
  const sb = makeSandbox();
  sb.L = {
    me: { id: 'host-1', managedCohorts: ['3rd Period'] }, // different cohort
    roster: [],
    realIsHost: true, isHost: false,
    hostCapabilities: { scopedToCohorts: true },
    sessions: [{ id: 's1', status: 'active', cohorts: ['5th Period'], allCohorts: false }]
  };
  const s = sb.nativeSessionAppliesToMe();
  check('preview bypass: a scoped previewing host does NOT see a session OUTSIDE their managed cohorts', s === null);
}
{
  // real (non-previewing) player behavior must be completely unchanged
  const sb = makeSandbox();
  sb.L = {
    me: { id: 'p1' },
    roster: [{ id: 'p1', cohort: '5th Period' }],
    realIsHost: false, isHost: false, // a genuine player, not previewing
    hostCapabilities: null,
    sessions: [{ id: 's1', status: 'active', cohorts: ['5th Period'], allCohorts: false }]
  };
  const s = sb.nativeSessionAppliesToMe();
  check('preview bypass: a REAL player (not a previewing host) still resolves by their own roster cohort, unchanged', s && s.id === 's1');
}
{
  const sb = makeSandbox();
  sb.L = {
    me: { id: 'p1' },
    roster: [{ id: 'p1', cohort: '3rd Period' }],
    realIsHost: false, isHost: false,
    hostCapabilities: null,
    sessions: [{ id: 's1', status: 'active', cohorts: ['5th Period'], allCohorts: false }]
  };
  const s = sb.nativeSessionAppliesToMe();
  check('preview bypass: a REAL player in a DIFFERENT cohort still sees nothing, unchanged', s === null);
}
{
  // a genuinely host-mode viewer (not previewing at all) is untouched by this logic path
  const sb = makeSandbox();
  sb.L = {
    me: { id: 'host-1', managedCohorts: [] },
    roster: [],
    realIsHost: true, isHost: true, // actually IN host mode, not previewing
    hostCapabilities: { scopedToCohorts: false },
    sessions: [{ id: 's1', status: 'active', cohorts: ['5th Period'], allCohorts: false }]
  };
  const s = sb.nativeSessionAppliesToMe();
  check('preview bypass: previewingAsHost is false when realIsHost===isHost (actually in host mode) -- falls through to the normal roster check, which correctly finds nothing for an unenrolled host', s === null);
}
{
  // all-cohorts sessions are visible to everyone regardless -- unchanged
  const sb = makeSandbox();
  sb.L = {
    me: { id: 'host-1', managedCohorts: [] },
    roster: [],
    realIsHost: true, isHost: false,
    hostCapabilities: { scopedToCohorts: true },
    sessions: [{ id: 's1', status: 'active', allCohorts: true }]
  };
  const s = sb.nativeSessionAppliesToMe();
  check('preview bypass: an allCohorts session is visible to a previewing host regardless of scope', s && s.id === 's1');
}
{
  // a non-active session is never returned, preview or not
  const sb = makeSandbox();
  sb.L = {
    me: { id: 'host-1', managedCohorts: [] },
    roster: [],
    realIsHost: true, isHost: false,
    hostCapabilities: { scopedToCohorts: false },
    sessions: [{ id: 's1', status: 'ended', allCohorts: true }]
  };
  const s = sb.nativeSessionAppliesToMe();
  check('preview bypass: a non-active session is never returned', s === null);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
