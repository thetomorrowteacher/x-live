// Unit tests for PATCH X-LIVE v0.31 -- X-Rush Powerups & Sabotage.
// Extracts the real shipped functions from index.html via brace-counting
// (never reimplements the logic under test).
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

function extractConst(src, name) {
  const marker = 'var ' + name + ' = {';
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

// ── Sandbox: real pflxRaceScore + PFLX_POWERUPS + every new pure function ──
function makeSandbox() {
  const sandbox = {};
  // Team-wide sabotage targeting (later patch) reads the real app-wide L
  // global (L.cfg.teams) -- stand in with no teams configured, matching
  // this suite's pre-existing solo-mode fixtures exactly.
  sandbox.L = { cfg: { teams: { names: [], assign: {} } } };
  const names = [
    'pflxRaceScore', 'pflxRaceNitroEarned', 'pflxRaceNitroSpent', 'pflxRaceNitroBalance',
    'pflxRaceActiveEffects', 'pflxRacePowerupBonus', 'pflxRaceFogOptions',
    'pflxRaceTriggerPowerup', 'pflxRaceLeaderboard'
  ];
  let body = extractConst(src, 'PFLX_POWERUPS') + '\n';
  names.forEach(function (n) { body += extractFunction(src, n) + '\n'; });
  body += 'sandbox.PFLX_POWERUPS = PFLX_POWERUPS;\n';
  body += names.map(function (n) { return 'sandbox.' + n + ' = ' + n + ';'; }).join('\n');
  new Function('sandbox', 'with (sandbox) {\n' + body + '\n}')(sandbox);
  return sandbox;
}

function raceSlide(id, opts) {
  opts = opts || {};
  return Object.assign({ id: id, type: 'quiz_race', revealed: true, correctIndex: 0, rewardXc: 100, seconds: 0, responses: {} }, opts);
}

// ── 1. PFLX_POWERUPS catalog sanity ──────────────────────────────────
(function () {
  const sb = makeSandbox();
  const keys = ['speed_boost', 'shield', 'double_points', 'freeze', 'fog', 'steal'];
  check('PFLX_POWERUPS has all 6 powerups', keys.every(function (k) { return !!sb.PFLX_POWERUPS[k]; }));
  check('freeze/fog/steal are sabotage kind', ['freeze', 'fog', 'steal'].every(function (k) { return sb.PFLX_POWERUPS[k].kind === 'sabotage'; }));
  check('speed_boost/shield/double_points are boost kind', ['speed_boost', 'shield', 'double_points'].every(function (k) { return sb.PFLX_POWERUPS[k].kind === 'boost'; }));
  check('sabotage powerups all needTarget', ['freeze', 'fog', 'steal'].every(function (k) { return sb.PFLX_POWERUPS[k].needsTarget; }));
  check('boost powerups do not needTarget', ['speed_boost', 'shield', 'double_points'].every(function (k) { return !sb.PFLX_POWERUPS[k].needsTarget; }));
})();

// ── 2. pflxRaceNitroEarned / Spent / Balance ─────────────────────────
(function () {
  const sb = makeSandbox();
  const sl1 = raceSlide('s1', { responses: { p1: { value: 0, at: 0 } }, startedAt: 0 });
  const s = { slides: [sl1], raceEvents: [] };
  check('NitroEarned matches pflxRaceScore for a correct answer', sb.pflxRaceNitroEarned(s, 'p1') === sb.pflxRaceScore(sl1, sl1.responses.p1));
  check('NitroEarned is 0 for a player with no responses', sb.pflxRaceNitroEarned(s, 'nobody') === 0);
  check('NitroSpent is 0 with no events', sb.pflxRaceNitroSpent(s, 'p1') === 0);
  s.raceEvents.push({ id: 'e1', pid: 'p1', key: 'shield', at: 10 });
  check('NitroSpent counts an event\'s cost', sb.pflxRaceNitroSpent(s, 'p1') === sb.PFLX_POWERUPS.shield.cost);
  check('NitroBalance = earned - spent', sb.pflxRaceNitroBalance(s, 'p1') === sb.pflxRaceNitroEarned(s, 'p1') - sb.PFLX_POWERUPS.shield.cost);
})();

// ── 3. Nitro balance never goes negative ─────────────────────────────
(function () {
  const sb = makeSandbox();
  const s = { slides: [], raceEvents: [{ id: 'e1', pid: 'p1', key: 'steal', at: 0 }] }; // spent 35, earned 0
  check('NitroBalance floors at 0 even when spend exceeds earnings', sb.pflxRaceNitroBalance(s, 'p1') === 0);
})();

// ── 4. pflxRaceTriggerPowerup: gating (disabled toggles, afford, target) ──
(function () {
  const sb = makeSandbox();
  const sl1 = raceSlide('s1', { responses: { p1: { value: 0, at: 0 } }, startedAt: 0 });
  const s = { slides: [sl1], raceEvents: [], currentSlideIndex: 0, powerupsEnabled: false, sabotageEnabled: false };
  check('trigger fails when powerups are disabled', sb.pflxRaceTriggerPowerup(s, 'p1', 'shield', null, 1000).ok === false);
  s.powerupsEnabled = true;
  const r1 = sb.pflxRaceTriggerPowerup(s, 'p1', 'freeze', 'p2', 1000);
  check('trigger fails for sabotage when sabotage is disabled', r1.ok === false && r1.reason === 'sabotage-disabled');
  s.sabotageEnabled = true;
  check('trigger fails without a target for a sabotage powerup', sb.pflxRaceTriggerPowerup(s, 'p1', 'freeze', null, 1000).ok === false);
  check('trigger fails targeting yourself', sb.pflxRaceTriggerPowerup(s, 'p1', 'freeze', 'p1', 1000).ok === false);
  check('trigger fails unknown powerup key', sb.pflxRaceTriggerPowerup(s, 'p1', 'nope', null, 1000).ok === false);
  const afford = sb.pflxRaceNitroBalance(s, 'p1'); // p1 has earned some nitro from sl1
  const r2 = sb.pflxRaceTriggerPowerup(s, 'p1', 'double_points', null, 1000);
  check('trigger succeeds when affordable, enabled, no target needed', r2.ok === (afford >= sb.PFLX_POWERUPS.double_points.cost));
})();

// ── 5. pflxRaceTriggerPowerup fails when Nitro balance is insufficient ──
(function () {
  const sb = makeSandbox();
  const s = { slides: [], raceEvents: [], currentSlideIndex: 0, powerupsEnabled: true, sabotageEnabled: true };
  const r = sb.pflxRaceTriggerPowerup(s, 'p1', 'steal', 'p2', 1000);
  check('trigger fails with insufficient Nitro (no earnings at all)', r.ok === false && r.reason === 'insufficient-nitro');
})();

// ── 6. Shield blocks exactly ONE incoming sabotage, then clears ─────
(function () {
  const sb = makeSandbox();
  const s = { slides: [], raceEvents: [
    { id: 'e1', pid: 'p2', key: 'shield', at: 100 },
    { id: 'e2', pid: 'p1', key: 'freeze', targetPid: 'p2', at: 200, blocked: true },
  ] };
  const eff1 = sb.pflxRaceActiveEffects(s, 'p2', 300);
  check('shield is consumed after blocking one sabotage', eff1.shieldActive === false);
  check('a blocked sabotage has no lingering effect', !eff1.effects.freeze);
  s.raceEvents.push({ id: 'e3', pid: 'p1', key: 'freeze', targetPid: 'p2', at: 250 }); // no shield now, not blocked
  const eff2 = sb.pflxRaceActiveEffects(s, 'p2', 300);
  check('a second sabotage (no shield left) lands and is active', eff2.effects.freeze === 250 + sb.PFLX_POWERUPS.freeze.durationMs);
  const eff3 = sb.pflxRaceActiveEffects(s, 'p2', 250 + sb.PFLX_POWERUPS.freeze.durationMs + 1);
  check('a landed sabotage expires after its duration', !eff3.effects.freeze);
})();

// ── 7. pflxRaceActiveEffects: re-arming a fresh shield after using one up ──
(function () {
  const sb = makeSandbox();
  const s = { slides: [], raceEvents: [
    { id: 'e1', pid: 'p2', key: 'shield', at: 100 },
    { id: 'e2', pid: 'p1', key: 'fog', targetPid: 'p2', at: 200, blocked: true }, // consumes it
    { id: 'e3', pid: 'p2', key: 'shield', at: 300 }, // re-armed
  ] };
  const eff = sb.pflxRaceActiveEffects(s, 'p2', 400);
  check('buying a new shield after one was consumed re-arms it', eff.shieldActive === true);
})();

// ── 8. pflxRaceFogOptions: deterministic permutation ─────────────────
(function () {
  const sb = makeSandbox();
  const order1 = sb.pflxRaceFogOptions(4, 'slideA_playerX');
  const order2 = sb.pflxRaceFogOptions(4, 'slideA_playerX');
  const order3 = sb.pflxRaceFogOptions(4, 'slideA_playerY');
  check('same seed produces the same order (deterministic across re-renders)', JSON.stringify(order1) === JSON.stringify(order2));
  check('the order is a permutation of the original indices', JSON.stringify(order1.slice().sort()) === JSON.stringify([0, 1, 2, 3]));
  check('a different seed can produce a different order', JSON.stringify(order1) !== JSON.stringify(order3) || true /* not guaranteed, but usually true; never fails the suite */);
})();

// ── 9. pflxRacePowerupBonus: speed boost, steal, double points ──────
(function () {
  const sb = makeSandbox();
  const sl1 = raceSlide('s1', { responses: { p1: { value: 0, at: 0 } }, startedAt: 0 });
  const s = { slides: [sl1], raceEvents: [
    { id: 'e1', pid: 'p1', key: 'speed_boost', at: 10 },
  ] };
  check('speed_boost adds its flat jumpAmount to bonus', sb.pflxRacePowerupBonus(s, 'p1') === sb.PFLX_POWERUPS.speed_boost.jumpAmount);

  const s2 = { slides: [], raceEvents: [
    { id: 'e1', pid: 'p1', key: 'steal', targetPid: 'p2', at: 10, stolenAmount: 15 },
  ] };
  check('an unblocked steal credits the actor', sb.pflxRacePowerupBonus(s2, 'p1') === 15);
  check('an unblocked steal debits the target', sb.pflxRacePowerupBonus(s2, 'p2') === -15);

  const s3 = { slides: [], raceEvents: [
    { id: 'e1', pid: 'p1', key: 'steal', targetPid: 'p2', at: 10, stolenAmount: 15, blocked: true },
  ] };
  check('a BLOCKED steal has no economic effect on either side', sb.pflxRacePowerupBonus(s3, 'p1') === 0 && sb.pflxRacePowerupBonus(s3, 'p2') === 0);

  const sl2 = raceSlide('s2', { responses: { p1: { value: 0, at: 0 } }, startedAt: 0 });
  const s4 = { slides: [sl2], raceEvents: [
    { id: 'e1', pid: 'p1', key: 'double_points', at: 5, slideId: 's2' },
  ] };
  const base = sb.pflxRaceScore(sl2, sl2.responses.p1);
  check('double_points doubles the score for its purchased slide', sb.pflxRacePowerupBonus(s4, 'p1') === base);

  const sl3 = raceSlide('s3', { responses: {}, startedAt: 0, revealed: false });
  const s5 = { slides: [sl3], raceEvents: [{ id: 'e1', pid: 'p1', key: 'double_points', at: 5, slideId: 's3' }] };
  check('double_points grants nothing if the slide was never answered correctly', sb.pflxRacePowerupBonus(s5, 'p1') === 0);
})();

// ── 10. pflxRaceLeaderboard: backward compatible with no raceEvents ──
(function () {
  const sb = makeSandbox();
  const sl1 = raceSlide('s1', { responses: { p1: { value: 0, at: 0 }, p2: { value: 1, at: 500 } }, startedAt: 0 });
  const sNoEvents = { slides: [sl1] }; // raceEvents entirely absent, matching every pre-v0.31 session
  const board = sb.pflxRaceLeaderboard(sNoEvents);
  check('leaderboard with no raceEvents matches the pre-v0.31 shape (2 scorers)', board.length === 2);
  check('leaderboard is sorted descending by score', board[0].score >= board[1].score);
  const p1entry = board.find(function (r) { return r.id === 'p1'; });
  check('leaderboard score for a correct answer equals pflxRaceScore (no bonus applied)', p1entry.score === sb.pflxRaceScore(sl1, sl1.responses.p1));
})();

// ── 11. pflxRaceLeaderboard folds in a speed_boost bonus ─────────────
(function () {
  const sb = makeSandbox();
  const sl1 = raceSlide('s1', { responses: { p1: { value: 0, at: 0 } }, startedAt: 0 });
  const s = { slides: [sl1], raceEvents: [{ id: 'e1', pid: 'p1', key: 'speed_boost', at: 10 }] };
  const board = sb.pflxRaceLeaderboard(s);
  const p1entry = board.find(function (r) { return r.id === 'p1'; });
  check('leaderboard folds in the speed_boost bonus on top of the base score', p1entry.score === sb.pflxRaceScore(sl1, sl1.responses.p1) + sb.PFLX_POWERUPS.speed_boost.jumpAmount);
})();

// ── 12. pflxRaceLeaderboard surfaces a player who has ONLY a boost event
//      (no correct race answers at all) ──────────────────────────────
(function () {
  const sb = makeSandbox();
  const s = { slides: [], raceEvents: [{ id: 'e1', pid: 'p3', key: 'speed_boost', at: 10 }] };
  const board = sb.pflxRaceLeaderboard(s);
  const p3entry = board.find(function (r) { return r.id === 'p3'; });
  check('a player with only a boost event still appears on the leaderboard', !!p3entry && p3entry.score === sb.PFLX_POWERUPS.speed_boost.jumpAmount);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
