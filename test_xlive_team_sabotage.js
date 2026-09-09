// Unit tests for the X-Rush team-wide sabotage targeting patch.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractFunction(src, name) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('not found: ' + name);
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

function makeSandbox(teams) {
  const L = { cfg: { teams: teams || { names: [], assign: {} } } };
  const sandbox = { L: L };
  const body =
    extractFunction(src, 'pflxRaceScore') + '\n' +
    extractFunction(src, 'pflxRaceNitroEarned') + '\n' +
    extractFunction(src, 'pflxRaceNitroSpent') + '\n' +
    extractFunction(src, 'pflxRaceNitroBalance') + '\n' +
    extractFunction(src, 'pflxRaceActiveEffects') + '\n' +
    extractFunction(src, 'pflxRacePowerupBonus') + '\n' +
    extractFunction(src, 'pflxRaceTeamMembers') + '\n' +
    extractFunction(src, 'pflxRaceTriggerPowerup') + '\n' +
    'sandbox.pflxRaceScore = pflxRaceScore;\n' +
    'sandbox.pflxRaceNitroEarned = pflxRaceNitroEarned;\n' +
    'sandbox.pflxRaceNitroSpent = pflxRaceNitroSpent;\n' +
    'sandbox.pflxRaceNitroBalance = pflxRaceNitroBalance;\n' +
    'sandbox.pflxRaceActiveEffects = pflxRaceActiveEffects;\n' +
    'sandbox.pflxRacePowerupBonus = pflxRacePowerupBonus;\n' +
    'sandbox.pflxRaceTeamMembers = pflxRaceTeamMembers;\n' +
    'sandbox.pflxRaceTriggerPowerup = pflxRaceTriggerPowerup;\n';
  // PFLX_POWERUPS is a top-level `var`, not inside any function -- pull it
  // out of the real source directly so the test uses the REAL teamCapable
  // flags rather than a hand-copied duplicate.
  const powerupsStart = src.indexOf('var PFLX_POWERUPS = {');
  const powerupsEnd = src.indexOf('};', powerupsStart) + 2;
  const powerupsSrc = src.slice(powerupsStart, powerupsEnd);
  new Function('sandbox', 'with (sandbox) {\n' + powerupsSrc + '\nsandbox.PFLX_POWERUPS = PFLX_POWERUPS;\n' + body + '\n}')(sandbox);
  return sandbox;
}

function raceSession(slides, raceEvents, extra) {
  return Object.assign({ slides: slides || [], raceEvents: raceEvents || [], powerupsEnabled: true, sabotageEnabled: true }, extra || {});
}
function revealedRaceSlide(id, correctIndex, rewardXc, responses) {
  return { id: id, type: 'quiz_race', revealed: true, correctIndex: correctIndex, rewardXc: rewardXc, seconds: 0, responses: responses || {} };
}
function bigEarnSlide(id, pid) {
  // A slide that gives pid plenty of Nitro to spend (score = rewardXc since
  // pflxRaceScore's speed curve maxes near instant answers -- exact value
  // doesn't matter, just needs to comfortably clear every powerup's cost).
  var resp = {}; resp[pid] = { value: 0, at: 0 };
  return revealedRaceSlide(id, 0, 200, resp);
}

// ── 1. pflxRaceTeamMembers -- pure lookup ────────────────────────────
(function () {
  const sb = makeSandbox();
  const assign = { p1: 'Red', p2: 'Red', p3: 'Blue' };
  check('returns exactly the members of the named team', JSON.stringify(sb.pflxRaceTeamMembers(assign, 'Red').sort()) === JSON.stringify(['p1', 'p2']));
  check('returns [] for a team with no members', sb.pflxRaceTeamMembers(assign, 'Green').length === 0);
  check('handles an undefined assign map without throwing', sb.pflxRaceTeamMembers(undefined, 'Red').length === 0);
})();

// ── 2. No teams configured -> team-wide toggle is a no-op, Freeze stays
//      strictly per-player (backward compatible with pre-patch behavior) ──
(function () {
  const sb = makeSandbox({ names: [], assign: {} });
  const s = raceSession([bigEarnSlide('s1', 'p1')], [], { sabotageTeamWide: true });
  const r = sb.pflxRaceTriggerPowerup(s, 'p1', 'freeze', 'p2', 1000);
  check('no teams configured -> single-target event even with sabotageTeamWide:true', r.ok && r.event.targetPid === 'p2' && !r.event.targetPids);
})();

// ── 3. Teams configured but host toggle OFF -> still per-player ─────────
(function () {
  const sb = makeSandbox({ names: ['Red', 'Blue'], assign: { p1: 'Red', p2: 'Blue', p3: 'Blue' } });
  const s = raceSession([bigEarnSlide('s1', 'p1')], [], { sabotageTeamWide: false });
  const r = sb.pflxRaceTriggerPowerup(s, 'p1', 'freeze', 'p2', 1000);
  check('toggle off -> single-target event even with teams configured', r.ok && r.event.targetPid === 'p2' && !r.event.targetPids);
})();

// ── 4. Team-wide ON: Freeze against a team hits every OTHER member ──────
(function () {
  const sb = makeSandbox({ names: ['Red', 'Blue'], assign: { p1: 'Red', p2: 'Blue', p3: 'Blue', p4: 'Blue' } });
  const s = raceSession([bigEarnSlide('s1', 'p1')], [], { sabotageTeamWide: true });
  const r = sb.pflxRaceTriggerPowerup(s, 'p1', 'freeze', 'Blue', 1000);
  check('team-wide freeze ok', r.ok);
  check('targetPids covers all 3 Blue members', JSON.stringify(r.event.targetPids.sort()) === JSON.stringify(['p2', 'p3', 'p4']));
  check('targetTeam recorded on the event', r.event.targetTeam === 'Blue');
  check('no legacy targetPid set on a team-wide event', !r.event.targetPid);
})();

// ── 5. Team-wide sabotage against your OWN team is rejected ─────────────
(function () {
  const sb = makeSandbox({ names: ['Red', 'Blue'], assign: { p1: 'Red', p2: 'Red', p3: 'Blue' } });
  const s = raceSession([bigEarnSlide('s1', 'p1')], [], { sabotageTeamWide: true });
  const r = sb.pflxRaceTriggerPowerup(s, 'p1', 'fog', 'Red', 1000);
  check('targeting your own team is rejected', !r.ok && r.reason === 'invalid-target');
})();

// ── 6. Steal NEVER goes team-wide, even with the toggle on -- always a
//      single-player transfer, unconditionally (documented scope choice) ──
(function () {
  const sb = makeSandbox({ names: ['Red', 'Blue'], assign: { p1: 'Red', p2: 'Blue', p3: 'Blue' } });
  const s = raceSession([bigEarnSlide('s1', 'p1'), bigEarnSlide('s1b', 'p2')], [], { sabotageTeamWide: true });
  // NOTE: steal's needsTarget path with teamWide=false requires targetPid
  // !== actor pid; passing a real player id (not a team name) here.
  const r = sb.pflxRaceTriggerPowerup(s, 'p1', 'steal', 'p2', 1000);
  check('steal stays single-target even with sabotageTeamWide on', r.ok && r.event.targetPid === 'p2' && !r.event.targetPids);
})();

// ── 7. pflxRaceActiveEffects: every member of the targeted team is
//      affected, a non-targeted team member is NOT ──────────────────────
(function () {
  const sb = makeSandbox({ names: ['Red', 'Blue'], assign: { p1: 'Red', p2: 'Blue', p3: 'Blue', p4: 'Blue' } });
  const s = raceSession([bigEarnSlide('s1', 'p1')], [], { sabotageTeamWide: true });
  const r = sb.pflxRaceTriggerPowerup(s, 'p1', 'freeze', 'Blue', 1000);
  s.raceEvents.push(r.event);
  check('p2 (targeted team member) is frozen', !!sb.pflxRaceActiveEffects(s, 'p2', 2000).effects.freeze);
  check('p3 (targeted team member) is frozen', !!sb.pflxRaceActiveEffects(s, 'p3', 2000).effects.freeze);
  check('p4 (targeted team member) is frozen', !!sb.pflxRaceActiveEffects(s, 'p4', 2000).effects.freeze);
  check('p1 (the actor, on Red) is NOT frozen', !sb.pflxRaceActiveEffects(s, 'p1', 2000).effects.freeze);
  check('effect expires after durationMs (8000ms for freeze)', !sb.pflxRaceActiveEffects(s, 'p2', 1000 + 8001).effects.freeze);
})();

// ── 8. Shield blocks only the shielded team member, others still hit ────
(function () {
  const sb = makeSandbox({ names: ['Red', 'Blue'], assign: { p1: 'Red', p2: 'Blue', p3: 'Blue' } });
  const s = raceSession([bigEarnSlide('s1', 'p1'), bigEarnSlide('sB', 'p2')], [], { sabotageTeamWide: true });
  // p2 buys a shield first.
  const shieldR = sb.pflxRaceTriggerPowerup(s, 'p2', 'shield', null, 500);
  check('p2 can buy a shield (no target needed)', shieldR.ok);
  s.raceEvents.push(shieldR.event);
  const r = sb.pflxRaceTriggerPowerup(s, 'p1', 'freeze', 'Blue', 1000);
  check('team-wide freeze against a partially-shielded team still succeeds', r.ok);
  check('p2 (shielded) is recorded in blockedPids', r.event.blockedPids.indexOf('p2') !== -1);
  check('p3 (not shielded) is NOT in blockedPids', r.event.blockedPids.indexOf('p3') === -1);
  check('event.blocked is NOT set (only p2 of 2 targets was shielded, not all)', !r.event.blocked);
  s.raceEvents.push(r.event);
  check('p2 (shielded target) ends up NOT frozen', !sb.pflxRaceActiveEffects(s, 'p2', 2000).effects.freeze);
  check('p3 (unshielded target) ends up frozen', !!sb.pflxRaceActiveEffects(s, 'p3', 2000).effects.freeze);
  check('p2 shield is consumed (no longer active after absorbing the hit)', !sb.pflxRaceActiveEffects(s, 'p2', 2000).shieldActive);
})();

// ── 9. Targeting a team with zero OTHER members (e.g. a 1-person team
//      excluding self) is rejected rather than firing an empty event ────
(function () {
  const sb = makeSandbox({ names: ['Red', 'Solo'], assign: { p1: 'Red', p2: 'Solo' } });
  const s = raceSession([bigEarnSlide('s1', 'p1')], [], { sabotageTeamWide: true });
  const r = sb.pflxRaceTriggerPowerup(s, 'p1', 'fog', 'Solo', 1000);
  check('single-member enemy team still resolves to one valid target', r.ok && r.event.targetPids.length === 1 && r.event.targetPids[0] === 'p2');
})();

// ── 10. Backward compatibility: a pre-existing single-target event (no
//       targetPids field at all, from before this patch) still resolves
//       through the updated pflxRaceActiveEffects exactly as before ──────
(function () {
  const sb = makeSandbox({ names: [], assign: {} });
  const s = raceSession([], [
    { id: 'rev_legacy', pid: 'host', key: 'freeze', targetPid: 'p9', at: 1000 },
  ]);
  check('legacy single-targetPid event still applies to its target', !!sb.pflxRaceActiveEffects(s, 'p9', 2000).effects.freeze);
  check('legacy single-targetPid event does not leak to another player', !sb.pflxRaceActiveEffects(s, 'p10', 2000).effects.freeze);
})();

// ── 11. Regression: powerups/sabotage disabled flags still gate team-wide
//       calls exactly as they gated single-target calls before ───────────
(function () {
  const sb = makeSandbox({ names: ['Red', 'Blue'], assign: { p1: 'Red', p2: 'Blue' } });
  const s1 = raceSession([bigEarnSlide('s1', 'p1')], [], { sabotageTeamWide: true, powerupsEnabled: false });
  check('powerups disabled -> rejected regardless of team-wide', !sb.pflxRaceTriggerPowerup(s1, 'p1', 'freeze', 'Blue', 1000).ok);
  const s2 = raceSession([bigEarnSlide('s1', 'p1')], [], { sabotageTeamWide: true, sabotageEnabled: false });
  const r2 = sb.pflxRaceTriggerPowerup(s2, 'p1', 'freeze', 'Blue', 1000);
  check('sabotage disabled -> rejected regardless of team-wide', !r2.ok && r2.reason === 'sabotage-disabled');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
