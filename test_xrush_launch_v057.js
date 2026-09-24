// PATCH X-LIVE v0.57 -- X-Rush launch/join banner (x-live-check side).
// Extracts the real shipped xlXRushBannerHTML/window.xlXRushJoin from
// index.html and tests them against a sandboxed XL_XRUSH_ACTIVE state.
// Run: node test_xrush_launch_v057.js index.html
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

function extractWindowFn(name) {
  const marker = 'window.' + name + ' = function (';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('not found: ' + name);
  const braceStart = src.indexOf('{', idx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(idx, i + 1) + ';';
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.log('FAIL:', label); } }

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bannerSrc = extractFn('xlXRushBannerHTML');
const joinSrc = extractWindowFn('xlXRushJoin');
const idParamsSrc = extractFn('xlXRushIdParams');

ok(src.indexOf("var XL_XRUSH_BASE = 'https://pflx-battle-arena.vercel.app/xrush';") !== -1, 'the launch base URL points at the real Arena deploy');
ok(src.indexOf('setInterval(xlXRushPollActive, 20000)') !== -1, 'the active-race pointer is polled on a real interval');
ok(src.indexOf("if (L.isHost ? '<button class=\\\"bigbtn gold\\\" onclick=\\\"xlXRushLaunch()\\\">") === -1, 'sanity: the raw source form assumption did not accidentally match (guards the test itself)');
ok(src.indexOf("L.isHost ? '<button class=\"bigbtn gold\" onclick=\"xlXRushLaunch()\">🏁 LAUNCH X-RUSH</button>'") !== -1, 'the LAUNCH button is host-gated (L.isHost) in the real shipped markup');

// The real functions close over module-level XL_XRUSH_ACTIVE/L vars, so
// to test them faithfully without reimplementing their logic, build a
// tiny module scope that declares those as real mutable bindings
// (closer to how the real file behaves than a getter/setter shim).
function run(activeValue, meValue) {
  const wrapped = new Function('esc', 'window', 'activeValue', 'meValue', `
    var XL_XRUSH_ACTIVE = activeValue;
    var XL_XRUSH_BASE = 'https://pflx-battle-arena.vercel.app/xrush';
    var L = { me: meValue };
    ${idParamsSrc}
    ${bannerSrc}
    ${joinSrc}
    return { banner: xlXRushBannerHTML(), join: window.xlXRushJoin };
  `);
  const openedUrls = [];
  const fakeWindow = { open: (u) => openedUrls.push(u) };
  const result = wrapped(esc, fakeWindow, activeValue, meValue);
  result.join();
  return { html: result.banner, openedUrls };
}

const ME = { id: 'p_123', brand: 'Alex' };

const noRace = run(null, ME);
ok(noRace.html === '', 'no active race -> banner is empty (nothing shown)');
ok(noRace.openedUrls.length === 0, 'no active race -> JOIN never opens a window');

const withRace = run({ raceId: 'race_abc123', deckName: 'Photosynthesis Deck' }, ME);
ok(withRace.html.indexOf('X-RUSH IS LIVE') !== -1, 'an active race renders the "X-RUSH IS LIVE" banner');
ok(withRace.html.indexOf(esc('Photosynthesis Deck')) !== -1, 'the banner shows the deck name');
ok(withRace.openedUrls.length === 1, 'JOIN with an active race opens exactly one window');
ok(withRace.openedUrls[0] === 'https://pflx-battle-arena.vercel.app/xrush?race=race_abc123&pid=p_123&pname=Alex', 'JOIN opens the correct race URL WITH the real player id/name attached');

const noDeckName = run({ raceId: 'race_xyz' }, ME);
ok(noDeckName.html.indexOf('Team race') !== -1, 'a missing deckName falls back to a generic label, not "undefined"');

// XSS safety: a hostile deck name never breaks out of the banner markup.
const evil = run({ raceId: 'race_evil', deckName: '</div><script>alert(1)</script>' }, ME);
ok(evil.html.indexOf('<script>alert') === -1, 'a hostile deck name is escaped in the banner');

const malformed = run({ deckName: 'No id here' }, ME);
ok(malformed.html === '', 'a race pointer with no raceId is treated as no active race');

// Identity: a missing L.me never throws, and always yields a usable pid/pname.
const noMe = run({ raceId: 'race_nome', deckName: 'D' }, null);
ok(noMe.openedUrls[0] === 'https://pflx-battle-arena.vercel.app/xrush?race=race_nome&pid=&pname=Player', 'a missing L.me still produces a safe URL (empty pid, "Player" fallback name) rather than throwing');

// Identity: a player name with characters that need URL-encoding survives intact.
const weirdName = run({ raceId: 'race_w', deckName: 'D' }, { id: 'p_9', brand: 'O\'Brien & Co' });
ok(weirdName.openedUrls[0].indexOf(encodeURIComponent("O'Brien & Co")) !== -1, "a player name with special characters (apostrophe, &) is correctly URL-encoded");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
