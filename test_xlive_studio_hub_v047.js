// Verifies the v0.47 pass: bigger logo/type in the studio header, a
// tighter face-crop on the Evo portrait, and a real glow (not just a flat
// ring) on every Evo avatar -- against the REAL shipped index.html source.
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

// exoArtHTML's ring is now a real glow, and this is the SHARED function
// (applies to every Evo avatar rendered anywhere -- Studio Hub, Evo Bay,
// member avatars).
const exoArtMatch = src.match(/box-shadow:0 0 0 1\.5px rgba\(120,220,255,[^"]*\)/);
check('exoArtHTML ring includes a blurred glow, not just a flat 1.5px outline', !!exoArtMatch && /0 0 \d+px rgba\(120,220,255/.test(exoArtMatch[0]));

// .hub-logo is bigger and top-aligned (sits beside the header text, not
// vertically centered against a short 3-line block).
const hubLogoCss = (src.match(/\.hub-logo\{[^}]*\}/) || [''])[0];
check('.hub-logo clamp max grew past 132px', /clamp\(96px,13vw,190px\)/.test(hubLogoCss));
check('.hub-logo top-aligns within the header row (align-self:flex-start)', hubLogoCss.includes('align-self:flex-start'));

// Studio name / tagline / "you" line are scoped bigger, WITHOUT touching
// the shared base .cardT rule used all over the file.
check('base .cardT rule (shared everywhere) is untouched',
  src.includes(".cardT { font-family:'Audiowide'; font-size:11.5px; font-weight:800; letter-spacing:0.14em; color:#9aa3c8; margin-bottom:14px; text-transform:uppercase; }"));
check('a scoped .hub-head .cardT rule makes the studio name bigger, not the global one',
  /\.hub-head \.cardT\{font-size:clamp\(18px,2\.4vw,30px\)/.test(src));
check('.hub-tag (tagline) grew from a fixed 12.5px to a responsive clamp',
  /\.hub-tag\{font-size:clamp\(13px,1\.5vw,19px\)/.test(src));

// Evo portrait: bigger name, and a face-crop wrapper (overflow:hidden +
// scale transform) around exoAvatarHTML's output.
const rMeStart = src.indexOf('function rMe() {');
const rMeSlice = src.slice(rMeStart, rMeStart + 12000);
check('Evo portrait avatar sits in a fixed, overflow-hidden crop circle',
  rMeSlice.includes('width:210px;height:210px;border-radius:50%;overflow:hidden'));
// NOTE: the fixed 50% 30% transform-origin pinned here was superseded by
// PATCH X-LIVE v0.48, which replaced it with a real per-line/per-stage
// exoFaceFocalOrigin(ex) lookup (see test_xlive_studio_hub_facefocal_v048.js)
// -- the same "single fixed crop doesn't work for every Evo" bug the v0.48
// Handoff entry documents. This assertion now checks the scale+wrapper
// structure stayed intact and the origin is computed rather than literal,
// instead of pinning the exact (now-superseded) value.
check('Evo portrait art is scaled up and crop-wrapped (scale 1.35, wrapper intact)',
  rMeSlice.includes("transform:scale(1.35);transform-origin:'"));
check('Evo portrait crop origin is computed (exoFaceFocalOrigin), not the old fixed 50% 30%',
  rMeSlice.includes('exoFaceFocalOrigin(ex)') && !rMeSlice.includes("transform-origin:50% 30%"));
check('exoAvatarHTML is still called with the matching 210px size (no size drift)',
  rMeSlice.includes('exoAvatarHTML(p.id, 210, p.brand, p.image)'));
check('Evo name font size grew to a responsive clamp (was a fixed 17px)',
  /font-size:clamp\(20px,2\.6vw,30px\)/.test(rMeSlice));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
