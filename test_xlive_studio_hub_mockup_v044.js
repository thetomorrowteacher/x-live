// Verifies the Studio Hub mockup-matching pass against the REAL shipped
// index.html source (string-level structural assertions on the actual file,
// not a reimplementation).
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

check('host tab array uses CAMPAIGN label', src.includes("['story', '📖 CAMPAIGN']"));
check('no leftover STORY tab label', !src.includes("['story', '📖 STORY']"));
const campaignCount = (src.match(/\['story', '📖 CAMPAIGN'\]/g) || []).length;
check('CAMPAIGN label appears exactly twice (host + player tabs)', campaignCount === 2);

const hubLogoCssMatch = src.match(/\.hub-logo\{[^}]*\}/);
check('.hub-logo CSS rule exists', !!hubLogoCssMatch);
if (hubLogoCssMatch) {
  const css = hubLogoCssMatch[0];
  check('.hub-logo uses solid brand cyan background-color', css.includes('background-color:#00f0ff'));
  check('.hub-logo uses mask-image sizing (mask-size:contain)', css.includes('mask-size:contain'));
  check('.hub-logo uses drop-shadow filter glow (PFLX-style)', css.includes('filter:drop-shadow') && css.includes('rgba(0,240,255'));
  check('.hub-logo does NOT use box-shadow (old img-based glow)', !css.includes('box-shadow'));
}

check('hub-head renders a masked div.hub-logo (not an <img>)',
  src.includes('<div class="hub-logo" style="-webkit-mask-image:url(\\\'\' + logo + \'\\\')'));

const brandmarkCssMatch = src.match(/\.hub-brandmark\{[^}]*\}/);
check('.hub-brandmark CSS rule exists', !!brandmarkCssMatch);
if (brandmarkCssMatch) {
  check('.hub-brandmark is absolutely positioned (relies on .card{position:relative})',
    brandmarkCssMatch[0].includes('position:absolute'));
}
check('rMe() emits the brandmark markup using XLIVE_LOGO_STACKED',
  src.includes('class="hub-brandmark" title="X-Live"') && src.includes('XLIVE_LOGO_STACKED'));

const rMeStart = src.indexOf('function rMe() {');
check('rMe() function found', rMeStart !== -1);
const ifStIdx = src.indexOf('if (st) {', rMeStart);
const elseIdx = src.indexOf('} else {', ifStIdx);
const brandmarkIdx = src.indexOf('class="hub-brandmark"', ifStIdx);
check('brandmark markup is gated inside if(st) (only shown when player has a Studio)',
  ifStIdx !== -1 && elseIdx !== -1 && brandmarkIdx > ifStIdx && brandmarkIdx < elseIdx);

const rMeSlice = src.slice(rMeStart, rMeStart + 12000);
check('rMe() still builds a separate evo portrait card', /let evo = /.test(rMeSlice));
check('rMe() still builds a separate evo progress/campaign card', /let evoStats = /.test(rMeSlice));
check('rMe() still renders swipeable panes', /<section>/.test(rMeSlice));
check('rMe() still wires the campaign block into evoStats', rMeSlice.includes('xlStoryCampaignBlock'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
