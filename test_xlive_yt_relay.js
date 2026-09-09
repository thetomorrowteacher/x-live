// Unit tests for the Theater/YouTube API relay (X-Live side).
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error('start marker not found: ' + startMarker);
  const endIdx = src.indexOf(endMarker, start);
  if (endIdx === -1) throw new Error('end marker not found: ' + endMarker);
  return src.slice(start, endIdx + endMarker.length);
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}
function flush() { return new Promise(function (r) { setImmediate(r); }); } // let queued .then() callbacks run

// Minimal fake DOM: enough for document.createElement('iframe') +
// appendChild + dataset, and a fake window.postMessage-carrying frame.
function makeFakeFrame() {
  return {
    tag: 'iframe',
    style: {},
    dataset: {},
    _attrs: {},
    setAttribute: function (k, v) { this._attrs[k] = v; },
    contentWindow: { postMessage: function () {} },
    _pflxOnLoadWaiters: []
  };
}

function makeSandbox() {
  const sandbox = {};
  const relayBody = extractBetween(src, 'var _pflxYtRelayFrame = null;', 'window.pflxYtRelayRequest = pflxYtRelayRequest;\n');
  const statusFn = extractBetween(src, 'var _pflxYtStatusChecked = false;', '}\n');
  const goLiveFn = extractBetween(src, 'async function liveYtCreateAndGoLive()', 'window.liveYtCreateAndGoLive = liveYtCreateAndGoLive;\n');

  var createdFrames = [];
  sandbox.document = {
    createElement: function (tag) { var f = makeFakeFrame(); createdFrames.push(f); return f; },
    body: { appendChild: function (f) { sandbox.__appended = f; } }
  };
  sandbox.PFLX_SUBAPPS = { missioncontrol: { label: 'Mission Control', url: 'https://www.prototypeflx.com/', fullChrome: true } };
  sandbox.L = { me: { brand: 'ROCKETQUEEN' }, sessions: [{ id: 's1', title: 'Test Session' }], liveRunningSessionId: 's1', ytRelayStatus: null };
  sandbox.URL = URL;
  sandbox.setTimeout = setTimeout; // real timers -- 12s timeout never fires within a test
  sandbox.clearTimeout = clearTimeout;
  sandbox.console = console;
  sandbox.toast = function (msg) { sandbox.__toasts = sandbox.__toasts || []; sandbox.__toasts.push(msg); };
  sandbox.render = function () { sandbox.__renderCalls = (sandbox.__renderCalls || 0) + 1; };
  sandbox.saveSession = function (s) { sandbox.__saved = s; return Promise.resolve(true); };
  sandbox.window = {};

  const full =
    relayBody + '\n' +
    'window.pflxYtRelayRequest = pflxYtRelayRequest;\n' +
    statusFn + '\n' +
    'sandbox.pflxYtEnsureStatusChecked = pflxYtEnsureStatusChecked;\n' +
    goLiveFn + '\n' +
    'sandbox.pflxYtRelayRequest = pflxYtRelayRequest;\n' +
    'sandbox.liveYtCreateAndGoLive = liveYtCreateAndGoLive;\n' +
    'sandbox.__getPendingCount = function () { return Object.keys(_pflxYtRelayPending).length; };\n' +
    'sandbox.__resolvePending = function (requestId, result) { if (_pflxYtRelayPending[requestId]) _pflxYtRelayPending[requestId](result); };\n' +
    'sandbox.__pendingIds = function () { return Object.keys(_pflxYtRelayPending); };\n';
  new Function('sandbox', 'with (sandbox) {\n' + full + '\n}')(sandbox);
  sandbox.__frames = createdFrames;
  return sandbox;
}

async function main() {
  // ── 1. pflxYtRelayRequest -- waits for frame load, then sends ──────────
  {
    const sb = makeSandbox();
    var resolved = null;
    const p = sb.pflxYtRelayRequest('status', {}).then(function (r) { resolved = r; });
    const frame = sb.__frames[0];
    check('creates exactly one relay iframe', sb.__frames.length === 1);
    check('iframe positioned off-screen (not display:none, to avoid throttling)', frame.style.cssText.indexOf('-9999px') !== -1);
    check('request queued as a load-waiter before the frame has loaded', frame._pflxOnLoadWaiters.length === 1);
    check('exactly one pending request tracked', sb.__getPendingCount() === 1);

    frame.onload(); // simulate the iframe firing its real load event
    check('load-waiter (the queued status request) fired after load', frame._pflxOnLoadWaiters.length === 0);

    var reqId = sb.__pendingIds()[0];
    sb.__resolvePending(reqId, { type: 'pflx_yt_relay_response', requestId: reqId, ok: true, connected: true, channelId: 'UCabc' });
    await p; // let the .then() callback actually run before asserting
    check('promise resolves with the relay response', resolved && resolved.ok === true && resolved.connected === true);
  }

  // ── 2. pflxYtRelayRequest -- reuses the same frame across calls ────────
  {
    const sb = makeSandbox();
    sb.pflxYtRelayRequest('status', {}).catch(function () {});
    sb.__frames[0].onload();
    sb.pflxYtRelayRequest('createBroadcast', { title: 'X' }).catch(function () {});
    check('second call reuses the SAME relay iframe (no second one created)', sb.__frames.length === 1);
    check('second call sends immediately since the frame is already loaded', sb.__frames[0]._pflxOnLoadWaiters.length === 0);
  }

  // ── 3. pflxYtEnsureStatusChecked -- fires exactly once, updates L ──────
  {
    const sb = makeSandbox();
    sb.pflxYtEnsureStatusChecked();
    sb.pflxYtEnsureStatusChecked(); // second call should be a no-op (guarded)
    check('only one relay frame created despite calling twice', sb.__frames.length === 1);
    sb.__frames[0].onload();
    var reqId = sb.__pendingIds()[0];
    sb.__resolvePending(reqId, { type: 'pflx_yt_relay_response', requestId: reqId, ok: true, connected: true, channelId: 'UCabc' });
    await flush();
    check('L.ytRelayStatus populated from the response', sb.L.ytRelayStatus && sb.L.ytRelayStatus.connected === true && sb.L.ytRelayStatus.channelId === 'UCabc');
    check('render() called after status resolves', sb.__renderCalls >= 1);
  }

  // ── 4. liveYtCreateAndGoLive -- happy path sets youtubeEmbedId + flag ──
  {
    const sb = makeSandbox();
    const p = sb.liveYtCreateAndGoLive();
    sb.__frames[0].onload();
    var reqId = sb.__pendingIds()[0];
    sb.__resolvePending(reqId, { type: 'pflx_yt_relay_response', requestId: reqId, ok: true, videoId: 'abc123XYZ90', watchUrl: 'https://www.youtube.com/watch?v=abc123XYZ90' });
    await p;
    check('session.youtubeEmbedId set from the relay response', sb.L.sessions[0].youtubeEmbedId === 'abc123XYZ90');
    check('session.youtubeViaRelay flagged true (so STOP later also ends the real broadcast)', sb.L.sessions[0].youtubeViaRelay === true);
    check('saveSession called with the updated session', sb.__saved && sb.__saved.id === 's1');
  }

  // ── 5. liveYtCreateAndGoLive -- relay error surfaces via toast, no crash ─
  {
    const sb = makeSandbox();
    const p = sb.liveYtCreateAndGoLive();
    sb.__frames[0].onload();
    var reqId = sb.__pendingIds()[0];
    sb.__resolvePending(reqId, { type: 'pflx_yt_relay_response', requestId: reqId, ok: false, error: 'not_connected' });
    await p;
    check('relay error -> session left untouched, no crash', !sb.L.sessions[0].youtubeEmbedId);
    check('relay error -> a toast was shown mentioning the error', sb.__toasts && sb.__toasts.some(function (t) { return t.indexOf('not_connected') !== -1; }));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main();
