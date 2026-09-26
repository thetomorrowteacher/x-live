// PATCH X-LIVE v0.75 -- Studio Hub glow (Studio logo + Evo card) strengthened,
// Evo Bay Card Deck scroll containment (min-width:0 on the grid/flex ancestor
// chain so .evb-deckrow's own overflow-x:auto actually takes effect).
// String-presence checks against the REAL shipped file -- this is a pure CSS
// change (no new function to extract/sandbox), matching the house pattern
// already used for other CSS-only patches this session (e.g. the Reality
// Warp skins test, the v248 X-Bot dock glow spot-checks).
'use strict';
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS - ' + name); }
  else { fail++; console.log('FAIL - ' + name); }
}

// ---- version header ----
ok('v0.75 header comment present', /X-LIVE v0\.75, Sept 26 2026/.test(src));

// ---- 1) Studio logo (.hub-logo) glow strengthened ----
ok('.hub-logo has the new 3-layer glow (10px/.8)', /\.hub-logo\{[^}]*drop-shadow\(0 0 10px rgba\(0,240,255,\.8\)\)/.test(src));
ok('.hub-logo has the new 3-layer glow (28px/.6)', /\.hub-logo\{[^}]*drop-shadow\(0 0 28px rgba\(0,240,255,\.6\)\)/.test(src));
ok('.hub-logo has the new 3-layer glow (50px/.35)', /\.hub-logo\{[^}]*drop-shadow\(0 0 50px rgba\(0,240,255,\.35\)\)/.test(src));
ok('.hub-logo old thin single/dual glow (6px/.65 + 16px/.4) is gone', !/drop-shadow\(0 0 6px rgba\(0,240,255,\.65\)\) drop-shadow\(0 0 16px rgba\(0,240,255,\.4\)\)/.test(src));

// ---- 2) Evo card (Studio Hub rMe()) glow strengthened, still keyed off `rgb` ----
ok('Evo card glow: new 16px/.75 layer keyed off the studio rgb var', /drop-shadow\(0 0 16px rgba\(' \+ rgb \+ ',0\.75\)\)/.test(src));
ok('Evo card glow: new 40px/.5 layer keyed off the studio rgb var', /drop-shadow\(0 0 40px rgba\(' \+ rgb \+ ',0\.5\)\)/.test(src));
ok('Evo card glow: new 72px/.28 layer keyed off the studio rgb var', /drop-shadow\(0 0 72px rgba\(' \+ rgb \+ ',0\.28\)\)/.test(src));
ok('Evo card glow: old single 22px/.55 layer is gone', !/drop-shadow\(0 0 22px rgba\(' \+ rgb \+ ',0\.55\)\)/.test(src));

// ---- 3/4) Evo Bay scroll containment ----
ok('.evb-col has min-width:0 (grid-track blowout fix)', /\.evb \.evb-col\{display:flex;flex-direction:column;gap:14px;min-width:0\}/.test(src));
ok('.evb-panel has min-width:0 (belt-and-suspenders)', /\.evb \.evb-panel\{background:rgba\(15,23,48,\.85\);border:1px solid var\(--line\);padding:16px;min-width:0\}/.test(src));
// Regression: the deck row's own pre-existing scroll infra (v0.49) must be untouched.
ok('.evb-deckrow overflow-x:auto (pre-existing, v0.49) is untouched', /\.evb \.evb-deckrow\{display:flex;gap:14px;overflow-x:auto/.test(src));
// Regression: the grid/media-query structure around .evb-col must be untouched.
ok('.evb-grid two-column layout (pre-existing) is untouched', /\.evb \.evb-grid\{display:grid;grid-template-columns:320px 1fr;gap:14px\}/.test(src));
ok('.evb-grid single-column collapse at 820px (pre-existing) is untouched', /@media \(max-width:820px\)\{\.evb \.evb-grid\{grid-template-columns:1fr\}\}/.test(src));

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
