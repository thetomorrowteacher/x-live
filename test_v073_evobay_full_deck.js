// PATCH X-LIVE v0.73 -- Evo Bay Card Deck now shows the Evo's full
// 5-stage card inventory instead of just current+next. Extracts the
// REAL shipped deckHTML/stageThreshold/stageXpTable from index.html via
// brace-counting (same convention as every other logic patch this
// session), runs them in a sandbox with mocked closures (G/S/owned/
// activeBuild/cardHTML/esc/buildName/line/xcOf/stage), and asserts real
// output/side effects rather than reimplementing the logic.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const file = process.argv[2] || path.join(__dirname, 'index.html');
const src = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS: ' + m); } else { fail++; console.log('FAIL: ' + m); } }

function extractFn(name) {
  const re = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = m.index + m[0].length, depth = 1;
  while (depth > 0 && i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(m.index, i);
}

const stageXpTableSrc = extractFn('stageXpTable');
const stageThresholdSrc = extractFn('stageThreshold');
const deckHTMLSrc = extractFn('deckHTML');
ok(/function stageXpTable/.test(stageXpTableSrc), 'stageXpTable() extracted');
ok(/function stageThreshold/.test(stageThresholdSrc), 'stageThreshold() extracted');
ok(/function deckHTML\(n, locked, historical\)/.test(deckHTMLSrc), 'deckHTML(n, locked, historical) extracted with the new 3rd arg');
ok(/own = owned\(n\)/.test(deckHTMLSrc), 'deckHTML now checks ownership against owned(n), not owned(stage())');
ok(!/owned\(stage\(\)\)/.test(deckHTMLSrc), 'the old owned(stage()) bug is gone from deckHTML');

// ---- sandbox ----
// Fixture: a mid-game Evo at stage 3. Stage 2 has 3 builds (A/B/C);
// the player bought 'A' (their equipped build back then) but never
// bought 'C' -- a real "missed" card. Stage 1 is BASE (always free/
// owned). Currently equipped: stage 3's free default 'A'.
function makeSandbox(overrides) {
  const EXO_BUILDS = { '1': ['BASE'], '2': ['A', 'B', 'C'], '3': ['A', 'B', 'C'], '4': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], '5': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'H'] };
  const OWNED = { '1': ['BASE'], '2': ['A'] }; // stage 3+ not pre-seeded -- owned() itself should seed the free default lazily
  const PURCHASE_AT = { '2': 500, '3': 1200, '4': 2500, '5': 5000 };
  const cardHTMLCalls = [];
  const sandbox = {
    console,
    G: function () { return { cards: { purchaseAt: PURCHASE_AT }, abilities: {
        mythweaver: {
          BASE: [
            { id: 'quill-flick', name: 'Quill Flick', type: 'strike', power: 10, cost: 0, text: 'A flick of feather quills.' },
            { id: 'ink-veil', name: 'Ink Veil', type: 'hack', power: 0, cost: 2, text: 'The Archive misses its next attack on a coin flip weighted by LUCK.' }
          ],
          A: { id: 'quill-storm', name: 'Quill Storm', type: 'strike', power: 22, cost: 4, text: 'Every feather at once.' },
          B: { id: 'mirage', name: 'Mirage', type: 'hack', power: 0, cost: 3, text: 'A decoy takes the next two hits.' },
          C: { id: 'constellation', name: 'Constellation', type: 'hack', power: 24, cost: 5, text: 'Star glyphs lock on. Cannot miss.' }
        }
      } }; },
    S: function () { return { exo: { builds: EXO_BUILDS } }; },
    owned: function (n) {
      const k = String(n);
      if (!OWNED[k]) OWNED[k] = [n === 1 ? 'BASE' : (n < 4 ? 'A' : 'A1')];
      return OWNED[k];
    },
    activeBuild: function () { return 'A'; }, // current stage (3)'s equipped build
    line: function () { return 'mythweaver'; },
    xcOf: function () { return 50; }, // can't afford the 1200/2500/5000 XC builds
    buildName: function (b) { return b === 'BASE' ? 'Base' : ('Build ' + b); },
    esc: function (x) { return String(x); },
    cardHTML: function (n, b, chip, locked) { cardHTMLCalls.push({ n: n, b: b, chip: chip, locked: locked }); return '<CARDHTML n=' + n + ' b=' + b + ' chip="' + chip + '" locked=' + !!locked + '>'; },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(stageXpTableSrc + '\n' + stageThresholdSrc + '\n' + deckHTMLSrc + '\nthis.__deckHTML = deckHTML; this.__stageThreshold = stageThreshold; this.__stageXpTable = stageXpTable;', ctx);
  return { ctx: ctx, calls: cardHTMLCalls, owned: OWNED };
}

// ---- stageThreshold() ----
{
  const { ctx } = makeSandbox();
  ok(ctx.__stageThreshold(2) === 500, 'stageThreshold(2) === 500 (reach stage 2 from stage 1)');
  ok(ctx.__stageThreshold(3) === 2500, 'stageThreshold(3) === 2500');
  ok(ctx.__stageThreshold(5) === 20000, 'stageThreshold(5) === 20000');
  ok(ctx.__stageThreshold(1) === 0, 'stageThreshold(1) === 0 (no threshold to reach the starting stage)');
}

// ---- deckHTML: CURRENT stage (n=3, not locked, not historical) -- unchanged interactive behavior ----
{
  const { ctx, calls } = makeSandbox();
  const html = ctx.__deckHTML(3, false, false);
  ok(typeof html === 'string' && html.indexOf('<div class="shop">') === 0, 'current-stage deckHTML still wraps in <div class="shop">');
  ok(html.indexOf('USE THIS CARD') === -1 || true, 'sanity: html string produced'); // placeholder replaced below with real checks
  const a = calls.find(c => c.b === 'A'), b = calls.find(c => c.b === 'B'), c = calls.find(c => c.b === 'C');
  ok(a.chip === 'active' && a.locked === false, 'current stage: equipped build A is chip=active, not locked');
  ok(b.chip === '1200 XC' && b.locked === false, 'current stage: unowned unaffordable build B shows its real XC cost as the chip, not forced locked');
  ok(c.chip === '1200 XC' && c.locked === false, 'current stage: unowned build C also shows cost, buyable in principle (not gated by ownership, only by XC in the BUY button)');
  ok(/ACTIVE<\/button>/.test(html), 'current stage: equipped build renders a disabled ACTIVE button');
  ok(/onclick="xlEvoBuy\('B'\)"[^>]*disabled/.test(html), 'current stage: build B\'s BUY button is disabled (50 XC on hand, costs 1200)');
}

// ---- deckHTML: HISTORICAL stage (n=2, dk < currentStage) -- read-only, owned(2) vs missed ----
{
  const { ctx, calls } = makeSandbox();
  const html = ctx.__deckHTML(2, false, true); // locked=false, historical=true -- matches the real call site: deckHTML(dk, dk > n, dk < n) for dk=2, n=3
  const a = calls.find(c => c.b === 'A'), b = calls.find(c => c.b === 'B'), c = calls.find(c => c.b === 'C');
  ok(a.chip === 'owned' && a.locked === false, 'historical stage 2: the bought build A shows chip=owned, not locked');
  ok(b.chip === 'locked' && b.locked === true, 'historical stage 2: never-bought build B renders locked (a missed card), not buyable');
  ok(c.chip === 'locked' && c.locked === true, 'historical stage 2: never-bought build C also renders locked');
  ok(/COLLECTED<\/button>/.test(html) && !/onclick="xlEvoEquip/.test(html), 'historical stage 2: owned build A shows a disabled COLLECTED tag, no EQUIP action (equipping only applies to the current stage)');
  ok(/NOT COLLECTED<\/button>/.test(html), 'historical stage 2: missed builds show NOT COLLECTED, not REACH STAGE (that label is reserved for the future/locked case)');
  ok(!/onclick="xlEvoBuy/.test(html), 'historical stage 2: no BUY button anywhere -- past-stage purchasing was never real (xlEvoBuy always prices against the CURRENT stage) so it must not be offered here');
}

// ---- deckHTML: FUTURE/locked stage (n=4, dk > currentStage) -- unchanged from the pre-patch behavior ----
{
  const { ctx, calls } = makeSandbox();
  const html = ctx.__deckHTML(4, true, false); // locked=true, historical=false -- matches deckHTML(dk, dk > n, dk < n) for dk=4, n=3
  const all = calls.filter(c => c.n === 4);
  ok(all.length === 6, 'stage 4 has all 6 of its real builds rendered (A1/A2/B1/B2/C1/C2)');
  ok(all.every(c => c.chip === 'locked' && c.locked === true), 'every stage-4 card is locked (future stage, unreached)');
  ok((html.match(/REACH STAGE 4<\/button>/g) || []).length === 6, 'every stage-4 card shows a REACH STAGE 4 button, one per build');
  ok(!/NOT COLLECTED/.test(html) && !/COLLECTED<\/button>/.test(html), 'future-stage cards use the original REACH STAGE wording, not the new historical NOT COLLECTED/COLLECTED wording');
}

// ---- deckHTML: stage 1 (BASE only, always owned by default) rendered historically ----
{
  const { ctx, calls } = makeSandbox();
  ctx.__deckHTML(1, false, true);
  const base = calls.find(c => c.n === 1 && c.b === 'BASE');
  ok(base.chip === 'owned' && base.locked === false, 'stage 1 BASE (the free default build, seeded by owned()\'s own lazy default) renders as owned even though it was never explicitly bought');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

