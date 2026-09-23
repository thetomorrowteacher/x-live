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
check('current-stage deck (deckHTML(n, false)) is inside the unified row',
  /<div class="evb-deckrow">' \+ deckHTML\(n, false\)/.test(slice));
check('next-stage locked deck (deckHTML(n + 1, true)) is inside the SAME row (string-concatenated onto the same div, not a new panel)',
  /deckHTML\(n, false\) \+ \(n < 5 \? '<div class="evb-divider">[\s\S]*?deckHTML\(n \+ 1, true\)/.test(slice));
check('the row closes with a single </div></div> (one deckrow div + one panel div, not two panels)',
  /deckHTML\(n \+ 1, true\) : ''\) \+ '<\/div><\/div>';/.test(slice));

// 3) The inline divider label between the two groups still carries the same
//    real information the old .evb-next label did (stage number, stage name,
//    Sync XP threshold) -- just repositioned, not removed.
check('inline divider still shows the next stage number', /'<div class="evb-divider">STAGE ' \+ \(n \+ 1\)/.test(slice));
check('inline divider still shows the next stage name', /esc\(stageName\(n \+ 1\)\.toUpperCase\(\)\)/.test(slice));
check('inline divider still shows the Sync XP unlock threshold', /unlocks at ' \+ \(nt \|\| 0\)\.toLocaleString\(\) \+ ' Sync XP/.test(slice));

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
check('deckHTML() function is unchanged (still builds .shop > .s cards, locked class driven by the `locked` param)',
  /function deckHTML\(n, locked\) \{[\s\S]*?return '<div class="shop">'/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
