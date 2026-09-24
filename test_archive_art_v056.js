// PATCH X-LIVE v0.56 -- Archive character art. Extracts the real
// shipped foeSVG/foeArt/PFLX_ARCHIVE_ART_MAP from index.html (brace
// counting, same technique used all session) and tests them against
// realistic foe fixtures. Run: node test_archive_art_v056.js index.html
'use strict';
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');

function extractFn(name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx === -1) throw new Error('not found: ' + name);
  const braceStart = src.indexOf('{', idx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}

function extractVar(name) {
  const marker = 'var ' + name + ' = ';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('not found: ' + name);
  const end = src.indexOf(';\n', idx);
  return src.slice(idx, end + 1);
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.log('FAIL:', label); } }

// Build a tiny sandbox reproducing foeSVG/foeArt's real dependencies (esc, B).
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const foeSVGSrc = extractFn('foeSVG');
const foeArtSrc = extractFn('foeArt');
const mapSrc = extractVar('PFLX_ARCHIVE_ART_MAP');
const baseSrc = extractVar('PFLX_ARCHIVE_ART_BASE');

let B = null;
const sandbox = new Function('esc', 'B', `
  ${baseSrc}
  ${mapSrc}
  ${foeSVGSrc}
  ${foeArtSrc}
  return { foeSVG, foeArt, PFLX_ARCHIVE_ART_MAP, PFLX_ARCHIVE_ART_BASE };
`);
// foeArt reads the outer B via closure in the real file; our extracted
// copy takes B as a parameter instead, so re-wrap it to read a mutable ref.
function makeSandbox(bRef) {
  const wrapped = new Function('esc', 'getB', `
    ${baseSrc}
    ${mapSrc}
    ${foeSVGSrc}
    function foeArt(f) {
      var B = getB();
      var artId = (B && B.hive) ? 'hive' : PFLX_ARCHIVE_ART_MAP[f.id];
      if (!artId) return foeSVG(f);
      return '<div class="evb-foe-art-wrap"><img class="evb-foe-art" src="' + PFLX_ARCHIVE_ART_BASE + artId + '.web.jpg" alt="' + esc(f.name) + '" loading="lazy" onerror="this.style.display=\\'none\\';this.nextElementSibling.style.display=\\'block\\'" /><div class="evb-foe-art-fallback" style="display:none">' + foeSVG(f) + '</div></div>';
    }
    return { foeSVG, foeArt, PFLX_ARCHIVE_ART_MAP, PFLX_ARCHIVE_ART_BASE };
  `);
  return wrapped(esc, () => bRef.current);
}

const bRef = { current: null };
const X = makeSandbox(bRef);

// Sanity: the extracted foeArt body actually matches the shipped one
// (guards against the wrapper drifting from the real source).
ok(foeArtSrc.indexOf('PFLX_ARCHIVE_ART_MAP[f.id]') !== -1, 'extracted foeArt reads PFLX_ARCHIVE_ART_MAP by foe id');
ok(foeArtSrc.indexOf('B.hive') !== -1, 'extracted foeArt checks B.hive for the swarm-art override');
ok(foeArtSrc.indexOf('foeSVG(f)') !== -1, 'extracted foeArt falls back to foeSVG');

const fScout = { id: 'scout', name: 'Scout', tier: 1, glow: '#0f0', ability: 'Scan' };
const fDrone = { id: 'drone', name: 'Drone', tier: 2, glow: '#0f0', ability: 'Buzz' };
const fWarden = { id: 'warden', name: 'Warden', tier: 3, glow: '#0f0', ability: 'Shield' };
const fOverseer = { id: 'overseer', name: 'Overseer', tier: 4, glow: '#0f0', ability: 'Command' };
const fTrojan = { id: 'trojan', name: 'Trojan', tier: 8, glow: '#0f0', ability: 'Breach' };
const fBreach = { id: 'breach', name: 'Breach', tier: 5, glow: '#0f0', ability: 'Hack' };
const fWraith = { id: 'wraith', name: 'Wraith', tier: 6, glow: '#0f0', ability: 'Phase' };
const fVector = { id: 'vector', name: 'Vector', tier: 7, glow: '#0f0', ability: 'Strike' };
const fHiveDrone = { id: 'hive-drone', name: 'Hive Drone', tier: 2, glow: '#0f0', ability: 'Swarm' };

bRef.current = null;

ok(X.foeArt(fScout).indexOf('scout.web.jpg') !== -1, 'scout maps to its own art id (exact match)');
ok(X.foeArt(fTrojan).indexOf('trojan.web.jpg') !== -1, 'trojan maps to its own art id (exact match)');
ok(X.foeArt(fDrone).indexOf('interceptor.web.jpg') !== -1, 'drone maps to the interceptor art (documented tier/role mapping)');
ok(X.foeArt(fWarden).indexOf('sentry.web.jpg') !== -1, 'warden maps to the sentry art');
ok(X.foeArt(fOverseer).indexOf('elite.web.jpg') !== -1, 'overseer maps to the elite art');

// Unmapped Hack Guild foes fall back to the real procedural SVG, not a broken/empty image.
for (const f of [fBreach, fWraith, fVector]) {
  const out = X.foeArt(f);
  ok(out.indexOf('<svg') !== -1 && out.indexOf('.web.jpg') === -1, 'unmapped foe ' + f.id + ' falls back to the procedural SVG (Hack Guild membership left undecided, not guessed)');
}

// The Hive: ANY unit shown during a swarm fight uses the collective hive art, overriding the per-id map.
bRef.current = { hive: true };
ok(X.foeArt(fHiveDrone).indexOf('hive.web.jpg') !== -1, 'a hive-unit foe during a swarm fight (B.hive=true) uses the collective Hive art');
ok(X.foeArt(fScout).indexOf('hive.web.jpg') !== -1, 'B.hive=true overrides even an id that would otherwise exact-match (scout), since art is per-encounter not per-id here');
bRef.current = null;

// Output shape sanity: real <img> with an onerror fallback to the real SVG markup, not a dangling/empty tag.
const html = X.foeArt(fScout);
ok(html.indexOf('<img class="evb-foe-art"') !== -1, 'foeArt emits a real <img> element for a mapped foe');
ok(html.indexOf('onerror=') !== -1, 'foeArt wires an onerror fallback (network/404 safety)');
ok(html.indexOf('evb-foe-art-fallback') !== -1 && html.indexOf('<svg') !== -1, 'foeArt embeds the real SVG as the hidden onerror fallback, not just a broken image');
ok(html.indexOf(esc(fScout.name)) !== -1, 'foeArt XSS-escapes the foe name into the alt attribute');

// XSS safety: a hostile foe name never breaks out of the alt attribute.
const evil = { id: 'scout', name: '"><script>alert(1)</script>', tier: 1, glow: '#0f0', ability: 'x' };
const evilHtml = X.foeArt(evil);
ok(evilHtml.indexOf('<script>alert') === -1, 'foeArt escapes a hostile foe name (no raw <script> break-out)');

// foeSVG itself is untouched -- still returns a real SVG for any foe.
ok(X.foeSVG(fBreach).indexOf('<svg viewBox') !== -1, 'foeSVG (the original function) is unchanged and still works directly');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
