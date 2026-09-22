// PATCH X-LIVE v0.40 -- Story Mode playable embed inside the existing
// STORY tab. Extracts the real shipped source (never a reimplementation)
// and asserts against it.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

function extractFn(source, startMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error('start marker not found: ' + startMarker);
  let i = source.indexOf('{', start);
  let depth = 0, end = -1;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('unbalanced braces for ' + startMarker);
  return source.slice(start, end);
}
function extractVar(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error('start marker not found: ' + startMarker);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error('end marker not found: ' + endMarker);
  return source.slice(start, end + endMarker.length);
}

// ---- 1. PFLX_SUBAPPS has a real 'story' entry ----
const subappsSrc = extractVar(src, 'var PFLX_SUBAPPS = {', '};');
ok('PFLX_SUBAPPS still has pathways/arena/darkcampus/missioncontrol (untouched)',
  subappsSrc.includes('pathways:') && subappsSrc.includes('arena:') &&
  subappsSrc.includes('darkcampus:') && subappsSrc.includes('missioncontrol:'));
ok('PFLX_SUBAPPS has a new story entry', /story:\s*\{[^}]*label:\s*'Story Mode'/.test(subappsSrc));
ok('story entry points at the real Console URL', /story:\s*\{[^}]*url:\s*'https:\/\/www\.prototypeflx\.com\/'/.test(subappsSrc));
ok('story entry sets fullChrome true (same as missioncontrol)', /story:\s*\{[^}]*fullChrome:\s*true/.test(subappsSrc));
ok('story entry carries targetView: story', /story:\s*\{[^}]*targetView:\s*'story'/.test(subappsSrc));

// ---- 2. pflxOnEmbedFrameLoad generalized ----
const loadFnSrc = extractFn(src, 'function pflxOnEmbedFrameLoad(key) {');
ok('pflxOnEmbedFrameLoad allows both missioncontrol and story keys',
  loadFnSrc.includes("key !== 'missioncontrol' && key !== 'story'"));
ok('pflxOnEmbedFrameLoad posts targetView from app.targetView with a mission-control fallback',
  loadFnSrc.includes("targetView: app.targetView || 'mission-control'"));

// sandbox-run pflxOnEmbedFrameLoad against both keys
function runLoadSandbox(fnSrc, subapps, opts) {
  const posted = [];
  const sandbox = {
    L: { me: { brand: ('brand' in opts) ? opts.brand : 'Kaitlin' } },
    PFLX_SUBAPPS: subapps,
    _pflxEmbedFrame: {
      contentWindow: {
        postMessage: function (msg, origin) { posted.push({ msg: JSON.parse(msg), origin: origin }); }
      }
    },
    console: { warn: function () {} }
  };
  const fn = new Function('L', 'PFLX_SUBAPPS', '_pflxEmbedFrame', 'console',
    fnSrc + '\nreturn pflxOnEmbedFrameLoad;');
  const f = fn(sandbox.L, sandbox.PFLX_SUBAPPS, sandbox._pflxEmbedFrame, sandbox.console);
  return { f, posted };
}
{
  const subapps = { missioncontrol: { url: 'https://www.prototypeflx.com/', fullChrome: true },
                     story: { url: 'https://www.prototypeflx.com/', fullChrome: true, targetView: 'story' } };
  const { f, posted } = runLoadSandbox(loadFnSrc, subapps, {});
  f('story');
  ok('story key: posts exactly one identity message', posted.length === 1);
  ok('story key: message type is pflx_xlive_embed_identity', posted[0] && posted[0].msg.type === 'pflx_xlive_embed_identity');
  ok('story key: message carries brand only (no PIN/balance fields)', posted[0] && posted[0].msg.brand === 'Kaitlin' && !('pin' in posted[0].msg) && !('xc' in posted[0].msg));
  ok('story key: message carries targetView "story"', posted[0] && posted[0].msg.targetView === 'story');
}
{
  const subapps = { missioncontrol: { url: 'https://www.prototypeflx.com/', fullChrome: true } };
  const { f, posted } = runLoadSandbox(loadFnSrc, subapps, {});
  f('missioncontrol');
  ok('missioncontrol key (no targetView set on entry): falls back to mission-control', posted[0] && posted[0].msg.targetView === 'mission-control');
}
{
  const subapps = { missioncontrol: { url: 'https://www.prototypeflx.com/' } };
  const { f, posted } = runLoadSandbox(loadFnSrc, subapps, {});
  f('pathways');
  ok('an unrelated key (pathways) is still ignored, no message posted', posted.length === 0);
}
{
  const subapps = { missioncontrol: { url: 'https://www.prototypeflx.com/' } };
  const { f, posted } = runLoadSandbox(loadFnSrc, subapps, { brand: '' });
  f('missioncontrol');
  ok('no brand available: no message posted', posted.length === 0);
}

// ---- 3. xlStoryToggleEmbed + rStory() markup ----
ok('L.story now initializes embedOpen: false', src.includes("L.story = { byId: {}, at: 0, loading: false, embedOpen: false };"));
const toggleFnSrc = extractFn(src, 'function xlStoryToggleEmbed() {');
ok('xlStoryToggleEmbed flips L.story.embedOpen', toggleFnSrc.includes('L.story.embedOpen = !L.story.embedOpen;'));
ok('xlStoryToggleEmbed re-renders', toggleFnSrc.includes('render();'));
ok('xlStoryToggleEmbed is exported on window', src.includes('window.xlStoryToggleEmbed = xlStoryToggleEmbed;'));

{
  const state = { embedOpen: false };
  const render = function () { state.embedOpen = state.embedOpen; };
  const fn = new Function('L', 'render', toggleFnSrc + '\nreturn xlStoryToggleEmbed;');
  const sandboxL = { story: { embedOpen: false } };
  let renderCalls = 0;
  const f = fn(sandboxL, function () { renderCalls++; });
  f();
  ok('sandbox: first toggle call sets embedOpen true', sandboxL.story.embedOpen === true);
  ok('sandbox: first toggle call triggers a render', renderCalls === 1);
  f();
  ok('sandbox: second toggle call sets embedOpen back to false', sandboxL.story.embedOpen === false);
}

// rStory() markup: the embed slot only appears in the HTML when embedOpen is true
const rStorySrc = extractFn(src, 'function rStory() {');
ok('rStory() references L.story.embedOpen to gate the embed card', rStorySrc.includes('L.story.embedOpen'));
ok('rStory() emits the real data-pflx-embed-slot/key="story" markup when open', rStorySrc.includes('data-pflx-embed-key="story"'));
ok('rStory() OPEN/CLOSE button calls xlStoryToggleEmbed()', rStorySrc.includes('onclick="xlStoryToggleEmbed()"'));
ok('rStory() existing PUSH A STORY BEAT card is still present (unchanged)', rStorySrc.includes('PUSH A STORY BEAT'));
ok('rStory() existing THE ROOM progress list is still present (unchanged)', rStorySrc.includes('THE ROOM'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
