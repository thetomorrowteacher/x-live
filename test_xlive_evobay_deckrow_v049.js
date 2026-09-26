// Verifies PATCH X-LIVE v0.49 (Evo Bay "Card deck" unified into one
// horizontally-scrollable row, owned + next-stage-locked cards together)
// against the REAL shipped index.html source.
const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('usage: node test_xlive_evobay_deckrow_v049.js <index.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

// 1) The old two-block layout (a full-width ".evb-next" divider line breaking
//    the owned deck and the locked-next-stage deck into two separate grids)
//    is gone.
check('old .evb-next full-width divider markup is no longer emitted by xlEvoBayHTML',
  !/class="evb-next">STAGE/.test(src));

// 2) The new unified row wrapper is present, wrapping BOTH deckHTML(n,false)
//    (owned/buyable current-stage cards) and deckHTML(n+1,true) (next-stage
//    locked cards) plus an inline divider label between them, inside the
//    Card deck panel.
const xlEvoBayStart = src.indexOf('window.xlEvoBayHTML = function');
check('xlEvoBayHTML() found', xlEvoBayStart !== -1);
const slice = src.slice(xlEvoBayStart, xlEvoBayStart + 6000);
check('Card deck panel wraps deckHTML output in a single .evb-deckrow',
  /<h3>Card deck<\/h3><div class="evb-deckrow">/.test(slice));
// PATCH X-LIVE v0.73 superseded the original 2-stage (current + next-locked)
// row with a full 5-stage loop (deckRow built via `for (var dk = 1; dk <= 5;
// dk++)`, each iteration appending its own divider + deckHTML(dk, ...)) so a
// player can swipe across the Evo's ENTIRE card inventory, not just a preview
// of the next stage. These three checks are updated to match that shipped,
// verified (see test_v073_evobay_full_deck.js) structure -- the v0.49 CSS/
// scroll-row/locked-card-styling checks below are untouched, since v0.73 only
// changed which cards populate the row, not the row mechanism itself.
check('the full 5-stage loop builds deckRow (dk from 1 to 5), not just current+next',
  /for \(var dk = 1; dk <= 5; dk\+\+\)/.test(slice));
check('each loop iteration appends its own divider + deckHTML(dk, dk > n, dk < n) (current/locked/historical all handled per stage)',
  /deckHTML\(dk, dk > n, dk < n\)/.test(slice));
check('the panel wraps the accumulated 5-stage deckRow in the same .evb-deckrow div',
  /<div class="evb-panel"><h3>Card deck<\/h3><div class="evb-deckrow">' \+ deckRow \+ '<\/div><\/div>';/.test(slice));

// 3) The inline divider label between the two groups still carries the same
//    real information the old .evb-next label did (stage number, stage name,
//    Sync XP threshold) -- just repositioned, not removed.
// PATCH X-LIVE v0.73: the divider is now built once per loop iteration (any
// of the 5 stages), not just for "the next stage" -- it shows CURRENT for the
// player's own stage, nothing extra for an already-reached historical stage,
// or the real Sync XP unlock threshold (via the new stageThreshold(dk), see
// test_v073_evobay_full_deck.js) for a still-locked future stage.
check('divider label shows the stage number and name for every stage in the loop', /'<div class="evb-divider">STAGE ' \+ dk \+ '<br>' \+ esc\(stageName\(dk\)\.toUpperCase\(\)\)/.test(slice));
check('divider marks the player\'s own stage as CURRENT', /dk === n \? '<br><span style="color:var\(--cyan\)">CURRENT<\/span>'/.test(slice));
check('divider shows the real Sync XP unlock threshold (stageThreshold(dk)) for a locked future stage', /unlocks at ' \+ stageThreshold\(dk\)\.toLocaleString\(\) \+ ' Sync XP/.test(slice));

// 4) CSS: the row is a real horizontally-scrollable flex row (same pattern
//    as the Studio Hub's .hub-cardrow), and .shop's grid is neutralized
//    inside it via display:contents so its .s children become direct
//    scroll-snap flex items rather than staying in a 3-col grid.
const deckrowCss = src.match(/\.evb \.evb-deckrow\{[^}]*\}/);
check('.evb-deckrow CSS rule exists', !!deckrowCss);
if (deckrowCss) {
  check('.evb-deckrow scrolls horizontally', deckrowCss[0].includes('overflow-x:auto'));
  check('.evb-deckrow uses scroll-snap', deckrowCss[0].includes('scroll-snap-type:x'));
}
check('.evb-deckrow .shop is neutralized with display:contents (so .s cards become direct row items)',
  /\.evb \.evb-deckrow \.shop\{display:contents\}/.test(src));
check('.evb-deckrow .shop .s gets a fixed flex-basis (consistent card width in the scroll row)',
  /\.evb \.evb-deckrow \.shop \.s\{flex:0 0 clamp\(/.test(src));

// 5) "Not obtained" (locked) cards are still greyed out and faded -- this
//    was ALREADY true before this patch (existing .evc.locked / .shop .s.locked
//    rules) and must remain true; this patch only changes layout, not the
//    locked-card visual treatment.
check('locked card art is still greyscaled + dimmed', /\.evb \.evc\.locked img\{filter:grayscale\(1\) brightness\(\.45\)\}/.test(src));
check('locked card panel is still faded (reduced opacity)', /\.evb \.shop \.s\.locked\{opacity:\.75\}/.test(src));
check('locked card text is still dimmed', /\.evb \.shop \.s\.locked \.n,\.evb \.shop \.s\.locked p\{color:var\(--dim\)\}/.test(src));

// 6) deckHTML() itself (the function that actually builds each card, owned
//    or locked) is untouched by this patch -- confirms the fix is purely a
//    layout/wrapper change, not a rewrite of card-generation logic.
// PATCH X-LIVE v0.73 extended deckHTML() with a 3rd `historical` parameter
// (read-only COLLECTED/NOT COLLECTED rendering for a past stage) -- it still
// builds the same .shop > .s cards, just with one more parameter than v0.49
// had. Full behavioral coverage of the new signature lives in
// test_v073_evobay_full_deck.js; this check just confirms the card-building
// shape (.shop > .s) survived the v0.73 extension.
check('deckHTML() still builds .shop > .s cards, now with the v0.73 `historical` 3rd param',
  /function deckHTML\(n, locked, historical\) \{[\s\S]*?return '<div class="shop">'/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
