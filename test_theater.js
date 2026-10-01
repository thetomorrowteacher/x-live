// Unit tests for the X-LIVE Theater tab.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractFunction(src, name) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('not found: ' + name);
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
  const calls = { render: 0 };
  const sandbox = {
    L: { sessions: [], cfg: {}, isHost: false },
    render: function () { calls.render++; },
    esc: function (s) { return String(s == null ? '' : s); },
    // PATCH X-LIVE v0.82 forward-compat stub -- rTheater() now also calls
    // these two (Next-Show Countdown card + its ticking interval), which
    // post-date this test. Both are genuinely out of scope for THIS test
    // file (it covers Theater live-session filtering/watch, not the
    // countdown feature, which has its own dedicated
    // test_v082_next_show_countdown.js), so they're stubbed as safe no-ops
    // rather than extracted for real -- same forward-compatibility pattern
    // already used repeatedly this session (e.g. test_xbot_theater_v174.js
    // needing new stubs when v177 extended the same shared function).
    pflxEnsureNextShowCountdown: function () {},
    pflxNextShowCardHtml: function () { return ''; },
  };
  const names = ['pflxTheaterLiveSessions', 'theaterWatch', 'theaterStopWatching', 'rTheater'];
  let body = '';
  names.forEach(function (n) { body += extractFunction(src, n) + '\n'; });
  body += names.map(function (n) { return 'sandbox.' + n + ' = ' + n + ';'; }).join('\n');
  new Function('sandbox', 'with (sandbox) {\n' + body + '\n}')(sandbox);
  return { sandbox: sandbox, calls: calls };
}

// ── 1. pflxTheaterLiveSessions filters correctly ─────────────────────
(function () {
  const { sandbox } = makeSandbox();
  sandbox.L.sessions = [
    { id: 's1', status: 'active', youtubeEmbedId: 'abc12345678', title: 'Live A' },
    { id: 's2', status: 'active', title: 'Live but no stream' }, // no youtubeEmbedId
    { id: 's3', status: 'scheduled', youtubeEmbedId: 'xyz98765432', title: 'Not started yet' },
    { id: 's4', status: 'ended', youtubeEmbedId: 'end12345678', title: 'Already over' },
    { id: 's5', status: 'active', youtubeEmbedId: 'def45678901', title: 'Live B' },
  ];
  const live = sandbox.pflxTheaterLiveSessions();
  check('only active sessions WITH a youtubeEmbedId are returned', live.length === 2);
  check('excludes an active session with no stream set', !live.some(function (s) { return s.id === 's2'; }));
  check('excludes a scheduled session even with a stream id set', !live.some(function (s) { return s.id === 's3'; }));
  check('excludes an ended session even with a stream id set', !live.some(function (s) { return s.id === 's4'; }));
  check('includes both genuinely-live streaming sessions', live.some(function (s) { return s.id === 's1'; }) && live.some(function (s) { return s.id === 's5'; }));
})();

// ── 2. theaterWatch / theaterStopWatching state + render ─────────────
(function () {
  const { sandbox, calls } = makeSandbox();
  sandbox.theaterWatch('s1');
  check('theaterWatch sets L.theaterWatchingId', sandbox.L.theaterWatchingId === 's1');
  check('theaterWatch triggers a render', calls.render === 1);
  sandbox.theaterStopWatching();
  check('theaterStopWatching clears L.theaterWatchingId', sandbox.L.theaterWatchingId === null);
  check('theaterStopWatching triggers a render', calls.render === 2);
})();

// ── 3. rTheater: list view vs watch view ──────────────────────────────
(function () {
  const { sandbox } = makeSandbox();
  sandbox.L.sessions = [{ id: 's1', status: 'active', youtubeEmbedId: 'abc12345678', title: 'Physics Live' }];
  const listHtml = sandbox.rTheater();
  check('list view shows the streaming session\'s title', listHtml.indexOf('Physics Live') !== -1);
  check('list view has a WATCH button', listHtml.indexOf('theaterWatch(') !== -1);
  check('list view does NOT embed a video iframe yet', listHtml.indexOf('youtube.com/embed') === -1);

  sandbox.L.theaterWatchingId = 's1';
  const watchHtml = sandbox.rTheater();
  check('watch view embeds the correct YouTube video', watchHtml.indexOf('youtube.com/embed/abc12345678') !== -1);
  check('watch view has a way back to the list', watchHtml.indexOf('theaterStopWatching()') !== -1);
})();

// ── 4. rTheater: watching a session that has since ended/stopped
//      streaming falls back to the list instead of an empty video ─────
(function () {
  const { sandbox } = makeSandbox();
  sandbox.L.sessions = [{ id: 's1', status: 'ended', youtubeEmbedId: 'abc12345678', title: 'Was Live' }];
  sandbox.L.theaterWatchingId = 's1';
  const html = sandbox.rTheater();
  check('a session that ended while being watched falls back to the Theater list', html.indexOf('youtube.com/embed') === -1 && html.indexOf('🎬 Theater') !== -1);
})();

// ── 5. rTheater: empty state when nothing is streaming ────────────────
(function () {
  const { sandbox } = makeSandbox();
  sandbox.L.sessions = [];
  const html = sandbox.rTheater();
  check('empty state message shown when nothing is streaming', html.indexOf('Nothing streaming right now') !== -1);
})();

// ── 6. Nav wiring: Theater tab present for both host and player ──────
(function () {
  const idx = src.indexOf("const tabs = L.isHost");
  const chunk = src.slice(idx, idx + 400);
  check('Theater tab present in the host nav array', chunk.indexOf("['theater', '🎬 THEATER']") !== -1 || chunk.indexOf("'theater'") !== -1);
  const dispatchIdx = src.indexOf('({ class: rClass, live: rLive, theater: rTheater');
  check('theater: rTheater wired into the render dispatch map', dispatchIdx !== -1);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
