// Verifies the "sizes should match proportions exactly / cards scrollable on
// the same row" fix against the REAL shipped index.html source.
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

// .hub-logo / .hub-brandmark now use clamp() so their SIZE STAYS PROPORTIONAL
// to the viewport at every width, instead of a fixed px that only matched the
// reference at one specific screen size.
const hubLogoCss = (src.match(/\.hub-logo\{[^}]*\}/) || [''])[0];
check('.hub-logo width is a responsive clamp() (not a fixed px)', /width:clamp\(/.test(hubLogoCss));
check('.hub-logo flex-basis is the same clamp() (no drift between width and flex)',
  hubLogoCss.includes('flex:0 0 clamp('));

const brandmarkCss = (src.match(/\.hub-brandmark\{[^}]*\}/) || [''])[0];
check('.hub-brandmark width/height is a responsive clamp()', /width:clamp\([^)]*\);height:clamp\(/.test(brandmarkCss));
check('.hub-brandmark corner offset (right/bottom) is also a responsive clamp()',
  /right:clamp\([^)]*\);bottom:clamp\(/.test(brandmarkCss));

const brandmarkSpanCss = (src.match(/\.hub-brandmark span\{[^}]*\}/) || [''])[0];
check('.hub-brandmark span (the masked mark inside the badge) scales with clamp() too',
  /width:clamp\([^)]*\);height:clamp\(/.test(brandmarkSpanCss));

// .hub-cardrow: a fixed-width, horizontally-scrollable row so Evo / Evo
// progress / Badges cards keep IDENTICAL proportions at every screen width.
const cardrowCss = (src.match(/\.hub-cardrow\{[^}]*\}/) || [''])[0];
check('.hub-cardrow CSS rule exists', !!cardrowCss);
check('.hub-cardrow scrolls horizontally', cardrowCss.includes('overflow-x:auto'));
check('.hub-cardrow uses scroll-snap for a clean swipe stop', cardrowCss.includes('scroll-snap-type:x'));

const cardrowChildCss = (src.match(/\.hub-cardrow>\.card\{[^}]*\}/) || [''])[0];
check('.hub-cardrow children have a fixed (non-shrinking) flex-basis', /flex:0 0 clamp\(/.test(cardrowChildCss));
check('.hub-cardrow children snap-align on scroll', cardrowChildCss.includes('scroll-snap-align'));

// grid2 itself must be UNTOUCHED -- it's shared with another, unrelated view.
check('shared .grid2 rule is untouched (still a plain 1fr 1fr grid)',
  src.includes('.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }'));
check('.grid2 responsive collapse rule is untouched', src.includes('.grid2 { grid-template-columns:1fr; }'));
check('the OTHER, unrelated .grid2 call site is still intact',
  src.includes("return '<div class=\"grid2\">' +"));

// rMe(): the evo/evoStats/side row now uses hub-cardrow, not grid2, and
// folds the Badges/Recent card (`side`) INTO the same scrollable row instead
// of stacking it full-width below.
const rMeStart = src.indexOf('function rMe() {');
check('rMe() function found', rMeStart !== -1);
const rMeSlice = src.slice(rMeStart, rMeStart + 12000);
check('Studio Hub evo/evoStats/side row now uses .hub-cardrow',
  rMeSlice.includes('<div class="hub-cardrow">\' + evo + evoStats + side'));
check('Studio Hub no longer wraps that row in the shared .grid2',
  !/hub \+ '<div class="grid2">'/.test(rMeSlice));
check('the Evo portrait avatar was sized up for the new fixed-width card (superseded by v0.47\'s 210px face-crop, still bigger than the original 150px)',
  rMeSlice.includes('exoAvatarHTML(p.id, 210, p.brand, p.image)'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
