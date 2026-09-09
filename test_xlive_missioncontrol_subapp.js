// Unit tests for adding Mission Control to the PFLX Sub-App picker.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractFunction(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('not found: ' + marker);
  const braceStart = src.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}
function extractConst(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('not found: ' + marker);
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

function makeSandbox() {
  const sandbox = {};
  const body =
    'function esc(s) { return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }\n' +
    'sandbox.esc = esc;\n' +
    extractConst(src, 'var PFLX_SUBAPPS = {') + '\n' +
    'sandbox.PFLX_SUBAPPS = PFLX_SUBAPPS;\n' +
    extractFunction(src, 'function pflxSlideEmbedHtml(') + '\n' +
    'sandbox.pflxSlideEmbedHtml = pflxSlideEmbedHtml;\n';
  new Function('sandbox', 'with (sandbox) {\n' + body + '\n}')(sandbox);
  return sandbox;
}

// ── 1. PFLX_SUBAPPS catalog ───────────────────────────────────────────
(function () {
  const sb = makeSandbox();
  check('all 4 sub-apps present', Object.keys(sb.PFLX_SUBAPPS).length === 4);
  check('the original 3 are untouched (labels/urls unchanged)',
    sb.PFLX_SUBAPPS.pathways.url === 'https://pflx-pathway-portal.vercel.app' &&
    sb.PFLX_SUBAPPS.arena.url === 'https://pflx-battle-arena.vercel.app' &&
    sb.PFLX_SUBAPPS.darkcampus.url === 'https://pflx-darkcampus.vercel.app');
  check('missioncontrol entry exists with the real Console production URL', sb.PFLX_SUBAPPS.missioncontrol && sb.PFLX_SUBAPPS.missioncontrol.url === 'https://www.prototypeflx.com/');
  check('missioncontrol label reads "Mission Control"', sb.PFLX_SUBAPPS.missioncontrol.label === 'Mission Control');
  check('missioncontrol is flagged fullChrome (no dedicated embed mode yet)', sb.PFLX_SUBAPPS.missioncontrol.fullChrome === true);
  check('the original 3 do NOT carry the fullChrome flag', !sb.PFLX_SUBAPPS.pathways.fullChrome && !sb.PFLX_SUBAPPS.arena.fullChrome && !sb.PFLX_SUBAPPS.darkcampus.fullChrome);
})();

// ── 2. pflxSlideEmbedHtml renders a real iframe for the new entry,
//      exactly like the existing three (same technique, no special-case
//      branch needed since it reads PFLX_SUBAPPS generically) ──────────
(function () {
  const sb = makeSandbox();
  const html = sb.pflxSlideEmbedHtml({ type: 'sub_app', subApp: 'missioncontrol' });
  check('renders an iframe', /<iframe/.test(html));
  check('iframe src points at the real Console URL', html.indexOf('src="https://www.prototypeflx.com/"') !== -1);
  const htmlArena = sb.pflxSlideEmbedHtml({ type: 'sub_app', subApp: 'arena' });
  check('regression: Battle Arena embed unaffected', htmlArena.indexOf('src="https://pflx-battle-arena.vercel.app"') !== -1);
  const htmlUnknown = sb.pflxSlideEmbedHtml({ type: 'sub_app', subApp: 'nope' });
  check('unknown subApp key -> empty string, no crash', htmlUnknown === '');
  const htmlNone = sb.pflxSlideEmbedHtml({ type: 'sub_app', subApp: '' });
  check('no subApp selected yet -> empty string, no crash', htmlNone === '');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
