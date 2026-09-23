// PATCH X-LIVE v0.55 -- Spar (PvP practice duel). Extracts the REAL shipped
// functions from index.html via brace-counting (never a reimplementation)
// and runs them against fixtures/stubs.
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractFn(name) {
  const reFunc = new RegExp('function ' + name + '\\s*\\(');
  const reAssign = new RegExp('(?:window\\.' + name + '|' + name + ')\\s*=\\s*function\\s*\\(');
  let m = reFunc.exec(SRC) || reAssign.exec(SRC);
  if (!m) throw new Error('not found: ' + name);
  let i = SRC.indexOf('(', m.index);
  // find matching close paren for args
  let depth = 1, j = i + 1;
  while (depth > 0) { if (SRC[j] === '(') depth++; else if (SRC[j] === ')') depth--; j++; }
  // now find the opening brace of the body
  let k = SRC.indexOf('{', j);
  let bd = 1, p = k + 1;
  while (bd > 0) { if (SRC[p] === '{') bd++; else if (SRC[p] === '}') bd--; p++; }
  return SRC.slice(m.index, p) + (reAssign.test(SRC.slice(m.index, m.index + 40)) ? '' : '');
}

function extractConst(re) {
  const m = re.exec(SRC);
  if (!m) throw new Error('not found: ' + re);
  return m[0];
}

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + label); }
}

// ---- assemble sandbox ----
const names = [
  'sparStatsFor', 'sparAbilities', 'sparAbilityById', 'sparHpFor', 'sparOtherSide',
  'sparMySide', 'sparNewId', 'sparStep', 'sparReplay', 'sparRecompute', 'sparResolve',
  'sparCheckReward', 'mergeSparMatch', 'mergeSparMatchList', 'sparMyMatches', 'sparFindMatch'
];
let body = names.map(extractFn).join('\n');

// SPAR_ORB_START / SPAR_REWARD declaration line
const varLine = /var SPAR_ORB_START = 30, SPAR_REWARD = \{ win: 20, lose: 8 \};/.exec(SRC)[0];

const SEASON_FIXTURE = {
  exo: { stats: ['POWER', 'GUARD', 'SPEED', 'HACK', 'LUCK'] },
  cards: {
    baseStats: {
      ironwright: { POWER: 6, GUARD: 7, SPEED: 4, HACK: 5, LUCK: 4 },
      neonborn: { POWER: 5, GUARD: 4, SPEED: 8, HACK: 7, LUCK: 4 }
    }
  },
  abilities: {
    ironwright: {
      BASE: [
        { id: 'gear-bite', name: 'Gear Bite', type: 'strike', power: 12, cost: 0, text: 'A quick bite.' },
        { id: 'plate-up', name: 'Plate Up', type: 'guard', power: 0, cost: 2, text: 'Halve the next hit.' }
      ],
      A: { id: 'hammer-slam', name: 'Hammer Slam', type: 'strike', power: 24, cost: 4, text: 'Slam.' }
    },
    neonborn: {
      BASE: [
        { id: 'glitch-swipe', name: 'Glitch Swipe', type: 'strike', power: 11, cost: 0, text: 'A swipe.' },
        { id: 'phase', name: 'Phase', type: 'hack', power: 0, cost: 2, text: 'Dodge.' }
      ],
      A: { id: 'rift-pounce', name: 'Rift Pounce', type: 'strike', power: 25, cost: 4, text: 'Pounce.' }
    }
  }
};

function buildSandbox(fixtureL) {
  const calls = { earnXc: [], toast: [], render: 0 };
  const factory = new Function('deps', `
    var G = deps.G, S = deps.S, esc = deps.esc, myId = deps.myId, L = deps.L;
    var story = deps.story, exoRow = deps.exoRow, kvLoad = deps.kvLoad, kvSave = deps.kvSave;
    var earnXc = deps.earnXc, myRecord = deps.myRecord, classRoster = deps.classRoster;
    var toast = deps.toast, render = deps.render, ask = deps.ask;
    ${varLine}
    ${body}
    return { sparStatsFor, sparAbilities, sparAbilityById, sparHpFor, sparOtherSide, sparMySide,
      sparNewId, sparStep, sparReplay, sparRecompute, sparResolve, sparCheckReward,
      mergeSparMatch, mergeSparMatchList, sparMyMatches, sparFindMatch,
      getSparView: function(){ return sparView; }, getState: function(){ return { SPAR_ORB_START: SPAR_ORB_START, SPAR_REWARD: SPAR_REWARD }; } };
  `);
  const deps = {
    G: function () { return JSON.parse(JSON.stringify(SEASON_FIXTURE)); },
    S: function () { return { exo: { stats: ['POWER', 'GUARD', 'SPEED', 'HACK', 'LUCK'] } }; },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); },
    myId: function () { return fixtureL.meId; },
    L: fixtureL,
    story: function () { return {}; },
    exoRow: function () { return fixtureL.exo[fixtureL.meId]; },
    kvLoad: async function (key) { return JSON.parse(JSON.stringify(fixtureL.cloud[key] || null)); },
    kvSave: async function (key, val) { fixtureL.cloud[key] = JSON.parse(JSON.stringify(val)); return true; },
    earnXc: function (n, reason) { calls.earnXc.push({ n: n, reason: reason }); },
    myRecord: function () { return { id: fixtureL.meId, brand: 'Me' }; },
    classRoster: function () { return fixtureL.roster; },
    toast: function (t) { calls.toast.push(t); },
    render: function () { calls.render++; },
    ask: function (cb) { cb(true); }
  };
  const sb = factory(deps);
  sb._calls = calls;
  return sb;
}

function freshL(meId) {
  return { meId: meId, exo: {}, roster: [], cloud: {} };
}

(async function main() {
  // ---- sparStatsFor ----
  {
    const sb = buildSandbox(freshL('p1'));
    const st1 = sb.sparStatsFor('ironwright', 1);
    ok(st1.POWER === 6 && st1.GUARD === 7, 'sparStatsFor stage1 == base stats exactly');
    const st3 = sb.sparStatsFor('ironwright', 3);
    ok(st3.POWER === 8 && st3.GUARD === 9, 'sparStatsFor stage3 == base + 2');
    const stUnknown = sb.sparStatsFor('nope', 1);
    ok(stUnknown.POWER === 5, 'sparStatsFor unknown line falls back to 5-per-stat default');
  }

  // ---- sparAbilities ----
  {
    const sb = buildSandbox(freshL('p1'));
    const a1 = sb.sparAbilities('ironwright', 1);
    ok(a1.length === 2 && a1.every(a => a.id !== 'hammer-slam'), 'sparAbilities stage1 = BASE only, no signature');
    const a3 = sb.sparAbilities('ironwright', 3);
    ok(a3.length === 3 && a3.some(a => a.id === 'hammer-slam'), 'sparAbilities stage>1 adds the A signature move');
    ok(sb.sparAbilities('unknown', 3).length === 0, 'sparAbilities on unknown line returns empty, not a crash');
  }

  // ---- sparAbilityById / sparHpFor / sparOtherSide ----
  {
    const sb = buildSandbox(freshL('p1'));
    ok(sb.sparAbilityById('ironwright', 3, 'hammer-slam').power === 24, 'sparAbilityById finds the signature move');
    ok(sb.sparAbilityById('ironwright', 1, 'hammer-slam') === null, 'sparAbilityById does not find signature move at stage 1');
    ok(sb.sparHpFor({ GUARD: 7 }) === 60 + 7 * 8, 'sparHpFor matches the solo-battle HP formula');
    ok(sb.sparOtherSide('host') === 'opp' && sb.sparOtherSide('opp') === 'host', 'sparOtherSide flips correctly');
  }

  // ---- sparMySide ----
  {
    const sb = buildSandbox(freshL('p1'));
    ok(sb.sparMySide({ hostId: 'p1', oppId: 'p2' }) === 'host', 'sparMySide: host match');
    ok(sb.sparMySide({ hostId: 'p2', oppId: 'p1' }) === 'opp', 'sparMySide: opp match');
    ok(sb.sparMySide({ hostId: 'p2', oppId: 'p3' }) === null, 'sparMySide: not a participant -> null');
  }

  // ---- fixture match builder ----
  function baseMatch() {
    return {
      id: 'spar-1', status: 'active', createdAt: 1000, updatedAt: 1000,
      hostId: 'p1', hostName: 'Host', hostLine: 'ironwright', hostStage: 3, hostMax: 60 + 9 * 8,
      oppId: 'p2', oppName: 'Opp', oppLine: 'neonborn', oppStage: 3, oppMax: 60 + 6 * 8,
      actions: [], log: [], rewardedIds: []
    };
  }

  // ---- sparStep: basic strike damage, correct answer ----
  {
    const sb = buildSandbox(freshL('p1'));
    const m = baseMatch();
    const state0 = sb.sparReplay(m); // initial state, turn='host'
    ok(state0.turn === 'host' && state0.hostHp === m.hostMax && state0.oppHp === m.oppMax, 'sparReplay: empty actions -> fresh initial state');
    const a1 = { by: 'host', abilityId: 'gear-bite', correct: true, at: 2000 };
    const s1 = sb.sparStep(state0, m, a1);
    ok(s1.oppHp < state0.oppHp, 'sparStep: a correct strike damages the OTHER side');
    ok(s1.turn === 'opp', 'sparStep: turn flips to the other side after a valid action');
  }

  // ---- sparStep: out-of-turn action is skipped ----
  {
    const sb = buildSandbox(freshL('p1'));
    const m = baseMatch();
    const state0 = sb.sparReplay(m);
    const badAction = { by: 'opp', abilityId: 'glitch-swipe', correct: true, at: 2000 }; // it's host's turn
    const s1 = sb.sparStep(state0, m, badAction);
    ok(s1.turn === 'host' && s1.hostHp === state0.hostHp && s1.oppHp === state0.oppHp, 'sparStep: out-of-turn action is a silent no-op');
  }

  // ---- sparStep: unknown ability id is skipped, not a crash ----
  {
    const sb = buildSandbox(freshL('p1'));
    const m = baseMatch();
    const state0 = sb.sparReplay(m);
    const s1 = sb.sparStep(state0, m, { by: 'host', abilityId: 'not-a-real-move', correct: true, at: 2000 });
    ok(s1.turn === 'host', 'sparStep: unknown ability id leaves state unchanged (skipped)');
  }

  // ---- sparStep: guard halves the NEXT incoming hit, then clears ----
  {
    const sb = buildSandbox(freshL('p1'));
    const m = baseMatch();
    let state = sb.sparReplay(m);
    state = sb.sparStep(state, m, { by: 'host', abilityId: 'plate-up', correct: true, at: 2000 }); // host guards
    ok(state.hostGuard === true, 'sparStep: guard ability sets the guard flag');
    const oppHpBeforeAttack = state.oppHp;
    // opp attacks host while host's guard is up
    state = sb.sparStep(state, m, { by: 'opp', abilityId: 'glitch-swipe', correct: true, at: 2100 });
    const guardedHostHp = state.hostHp;
    ok(state.hostGuard === false, 'sparStep: guard is consumed by the next incoming hit');
    // compare vs an identical fight with no guard cast
    const m2 = baseMatch();
    let state2 = sb.sparReplay(m2);
    state2 = sb.sparStep(state2, m2, { by: 'host', abilityId: 'gear-bite', correct: true, at: 2000 }); // host attacks instead of guarding
    state2 = sb.sparStep(state2, m2, { by: 'opp', abilityId: 'glitch-swipe', correct: true, at: 2100 });
    ok(guardedHostHp > state2.hostHp, 'sparStep: a guarded hit does less damage than an unguarded one');
  }

  // ---- sparStep: wrong answer costs the ACTOR some HP ----
  {
    const sb = buildSandbox(freshL('p1'));
    const m = baseMatch();
    let state = sb.sparReplay(m);
    const before = state.hostHp;
    state = sb.sparStep(state, m, { by: 'host', abilityId: 'gear-bite', correct: false, at: 2000 });
    ok(state.hostHp < before, 'sparStep: a wrong answer costs the actor HP (their own free-hit penalty)');
    ok(state.hostStreak === 0, 'sparStep: a wrong answer resets the actor streak to 0');
  }

  // ---- sparStep: 3-correct streak crits (1.5x) ----
  {
    const sb = buildSandbox(freshL('p1'));
    const m = baseMatch();
    let state = sb.sparReplay(m);
    let at = 2000, dmgLog = [];
    for (let i = 0; i < 3; i++) {
      const before = state.oppHp;
      state = sb.sparStep(state, m, { by: 'host', abilityId: 'gear-bite', correct: true, at: at });
      dmgLog.push(before - state.oppHp);
      at += 100;
      // give opp a free harmless turn (a strike that misses due to unknown ability skip would break turn order,
      // so use their real strike each time to keep the alternation honest)
      state = sb.sparStep(state, m, { by: 'opp', abilityId: 'glitch-swipe', correct: false, at: at }); // wrong answer, no damage to host's side from opp's miss
      at += 100;
    }
    ok(dmgLog[2] > dmgLog[0] * 1.3, 'sparStep: the 3rd correct-in-a-row hit is a crit (visibly bigger than the 1st)');
  }

  // ---- sparReplay determinism: same action set, any input order, same result ----
  {
    const sb = buildSandbox(freshL('p1'));
    const m = baseMatch();
    m.actions = [
      { id: 'a1', by: 'host', abilityId: 'gear-bite', correct: true, at: 1000 },
      { id: 'a2', by: 'opp', abilityId: 'glitch-swipe', correct: true, at: 2000 },
      { id: 'a3', by: 'host', abilityId: 'gear-bite', correct: true, at: 3000 }
    ];
    const shuffled = Object.assign({}, m, { actions: [m.actions[2], m.actions[0], m.actions[1]] });
    const r1 = sb.sparReplay(m), r2 = sb.sparReplay(shuffled);
    ok(r1.hostHp === r2.hostHp && r1.oppHp === r2.oppHp && r1.turn === r2.turn, 'sparReplay: result is independent of the actions array input order (sorted by at internally)');
  }

  // ---- sparRecompute: sets ended + winnerId when a side's HP hits 0 ----
  {
    const sb = buildSandbox(freshL('p1'));
    const m = baseMatch();
    m.hostMax = 20; // low HP so a couple of real hits can finish it
    m.oppMax = 200;
    let actions = [], at = 1000;
    // host keeps attacking opp (irrelevant), opp keeps hitting host with real strikes until host is dead
    for (let i = 0; i < 6; i++) {
      actions.push({ id: 'h' + i, by: 'host', abilityId: 'gear-bite', correct: false, at: at }); at += 10; // wrong -> self damage too
      actions.push({ id: 'o' + i, by: 'opp', abilityId: 'glitch-swipe', correct: true, at: at }); at += 10;
    }
    m.actions = actions;
    const out = sb.sparRecompute(m);
    ok(out.status === 'ended', 'sparRecompute: sets status=ended once a side is at 0 HP');
    ok(out.winnerId === 'p2' || out.winnerId === null, 'sparRecompute: sets a sane winnerId once ended');
  }

  // ---- sparResolve: pure, appends action+log, never mutates input ----
  {
    const sb = buildSandbox(freshL('p1'));
    const m = baseMatch();
    const ability = SEASON_FIXTURE.abilities.ironwright.BASE[0];
    const before = JSON.stringify(m);
    const out = sb.sparResolve(m, 'host', ability, true);
    ok(JSON.stringify(m) === before, 'sparResolve: never mutates its input match object');
    ok(out.actions.length === 1 && out.log.length === 1, 'sparResolve: appends exactly one action and one log entry');
    ok(out.oppHp < out.oppMax, 'sparResolve: the new state reflects the applied damage');
  }

  // ---- sparCheckReward: grants once, self-caps at one grant per player ----
  {
    const sb = buildSandbox(freshL('p1'));
    const m = Object.assign(baseMatch(), { status: 'ended', winnerId: 'p1' });
    const r1 = sb.sparCheckReward(m);
    ok(r1 !== m, 'sparCheckReward: returns a NEW object on first grant');
    ok(r1.rewardedIds.indexOf('p1') !== -1, 'sparCheckReward: records my id in rewardedIds');
    ok(sb._calls.earnXc.length === 1 && sb._calls.earnXc[0].n === sb.getState().SPAR_REWARD.win, 'sparCheckReward: grants the WIN amount to the winner');
    const r2 = sb.sparCheckReward(r1);
    ok(r2 === r1, 'sparCheckReward: a second call on an already-rewarded match is a no-op (same reference)');
    ok(sb._calls.earnXc.length === 1, 'sparCheckReward: never double-grants');
  }
  {
    const sb = buildSandbox(freshL('p2'));
    const m = Object.assign(baseMatch(), { status: 'ended', winnerId: 'p1' });
    const r1 = sb.sparCheckReward(m);
    ok(sb._calls.earnXc[0].n === sb.getState().SPAR_REWARD.lose, 'sparCheckReward: grants the LOSE amount to the loser');
  }

  // ---- mergeSparMatch: action union by id, no duplicates ----
  {
    const sb = buildSandbox(freshL('p1'));
    const local = baseMatch();
    local.actions = [{ id: 'a1', by: 'host', abilityId: 'gear-bite', correct: true, at: 1000 }];
    local.updatedAt = 1000;
    const incoming = baseMatch();
    incoming.actions = [
      { id: 'a1', by: 'host', abilityId: 'gear-bite', correct: true, at: 1000 },
      { id: 'a2', by: 'opp', abilityId: 'glitch-swipe', correct: true, at: 2000 }
    ];
    incoming.updatedAt = 2000;
    const merged = sb.mergeSparMatch(local, incoming);
    ok(merged.actions.length === 2, 'mergeSparMatch: union by id, no duplicate when both sides have the same action');
  }

  // ---- mergeSparMatch: symmetric regardless of merge direction ----
  {
    const sb = buildSandbox(freshL('p1'));
    const a = baseMatch(); a.updatedAt = 1000;
    a.actions = [{ id: 'a1', by: 'host', abilityId: 'gear-bite', correct: true, at: 1000 }];
    const b = baseMatch(); b.updatedAt = 500; // older, but has a DIFFERENT concurrent action
    b.actions = [{ id: 'a2', by: 'host', abilityId: 'gear-bite', correct: true, at: 1000 }]; // same timestamp different id -- simulate a genuine race; use distinct at to keep ordering sane
    b.actions[0].at = 900;
    const m1 = sb.mergeSparMatch(a, b);
    const m2 = sb.mergeSparMatch(b, a);
    ok(m1.hostHp === m2.hostHp && m1.oppHp === m2.oppHp, 'mergeSparMatch: combat state is identical regardless of which side calls merge first');
    ok(m1.actions.length === 2 && m2.actions.length === 2, 'mergeSparMatch: both concurrent actions survive the merge from either direction');
  }

  // ---- mergeSparMatch: terminal status (ended/declined) always wins ----
  {
    const sb = buildSandbox(freshL('p1'));
    const ended = Object.assign(baseMatch(), { status: 'ended', updatedAt: 1000, winnerId: 'p1' });
    const stalePending = Object.assign(baseMatch(), { status: 'active', updatedAt: 2000 }); // newer but non-terminal
    const merged = sb.mergeSparMatch(ended, stalePending);
    ok(merged.status === 'ended', 'mergeSparMatch: a terminal status is never reverted by a newer non-terminal one');
  }
  {
    const sb = buildSandbox(freshL('p1'));
    const declined = Object.assign(baseMatch(), { status: 'declined', updatedAt: 500 });
    const stalePending = Object.assign(baseMatch(), { status: 'pending', updatedAt: 100 });
    const merged = sb.mergeSparMatch(declined, stalePending);
    ok(merged.status === 'declined', 'mergeSparMatch: declined (terminal) beats an older pending');
  }

  // ---- mergeSparMatch: rewardedIds unions, never shrinks ----
  {
    const sb = buildSandbox(freshL('p1'));
    const a = Object.assign(baseMatch(), { status: 'ended', winnerId: 'p1', updatedAt: 2000, rewardedIds: ['p1'] });
    const b = Object.assign(baseMatch(), { status: 'ended', winnerId: 'p1', updatedAt: 1000, rewardedIds: ['p2'] });
    const merged = sb.mergeSparMatch(a, b);
    ok(merged.rewardedIds.indexOf('p1') !== -1 && merged.rewardedIds.indexOf('p2') !== -1, 'mergeSparMatch: rewardedIds unions across both sides, never drops an id');
  }

  // ---- mergeSparMatchList: union two arrays by id ----
  {
    const sb = buildSandbox(freshL('p1'));
    const localList = [Object.assign(baseMatch(), { id: 'm1' })];
    const incomingList = [Object.assign(baseMatch(), { id: 'm2' })];
    const out = sb.mergeSparMatchList(localList, incomingList);
    ok(out.length === 2, 'mergeSparMatchList: local-only and cloud-only matches both survive the union');
  }

  // ---- sparMyMatches / sparFindMatch ----
  {
    const L1 = freshL('p1');
    L1.sparMatches = [Object.assign(baseMatch(), { id: 'm1', updatedAt: 500 }), Object.assign(baseMatch(), { id: 'm2', hostId: 'other', oppId: 'p1', updatedAt: 900 })];
    const sb = buildSandbox(L1);
    const mine = sb.sparMyMatches();
    ok(mine.length === 2 && mine[0].id === 'm2', 'sparMyMatches: returns only my matches, newest first');
    ok(sb.sparFindMatch('m1').id === 'm1', 'sparFindMatch: finds by id');
    ok(sb.sparFindMatch('nope') === null, 'sparFindMatch: returns null on a missing id');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
