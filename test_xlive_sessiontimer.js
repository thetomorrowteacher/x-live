// Unit tests for the Prominent Session Timer patch.
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

function makeFakeEl() {
  return { textContent: '', style: {} };
}

function makeSandbox() {
  const sandbox = {};
  const body = extractBetween(
    src,
    'function pflxSessionTimerText(s, nowMs) {',
    'window.pflxStopSessionTimer = pflxStopSessionTimer;\n'
  );
  sandbox.window = sandbox;
  const el = makeFakeEl();
  sandbox.__el = el;
  sandbox.__intervalCalls = [];
  sandbox.__clearedIntervals = [];
  let ivSeq = 0;
  const ivCallbacks = {};
  sandbox.setInterval = function (cb, ms) { const id = ++ivSeq; ivCallbacks[id] = cb; sandbox.__intervalCalls.push({ id: id, ms: ms }); return id; };
  sandbox.clearInterval = function (id) { sandbox.__clearedIntervals.push(id); delete ivCallbacks[id]; };
  sandbox.__fireInterval = function (id) { if (ivCallbacks[id]) ivCallbacks[id](); };
  sandbox.document = { getElementById: function (id) { return id === 'pflxSessionTimerVal' ? el : null; } };
  const full = body + '\nsandbox.pflxSessionTimerText = pflxSessionTimerText;\nsandbox.pflxEnsureSessionTimer = pflxEnsureSessionTimer;\nsandbox.pflxStopSessionTimer = pflxStopSessionTimer;\n';
  new Function('sandbox', 'with (sandbox) {\n' + full + '\n}')(sandbox);
  return sandbox;
}

// pflxSessionTimerText -- pure function
{
  const sb = makeSandbox();
  const now = 1000000000000;
  const s = { id: 's1', scheduledEnd: new Date(now + 5 * 60000).toISOString() };
  const info = sb.pflxSessionTimerText(s, now);
  check('countdown: 5 minutes left renders "5:00 left"', info.label.indexOf('5:00 left') !== -1);
  check('countdown: 5 minutes left is not urgent', info.urgent === false && info.overtime === false);
}
{
  const sb = makeSandbox();
  const now = 1000000000000;
  const s = { id: 's1', scheduledEnd: new Date(now + 90 * 1000).toISOString() };
  const info = sb.pflxSessionTimerText(s, now);
  check('countdown: 90s left is urgent (under the 2-minute threshold)', info.urgent === true);
}
{
  const sb = makeSandbox();
  const now = 1000000000000;
  const s = { id: 's1', scheduledEnd: new Date(now - 3 * 60000 - 12000).toISOString() };
  const info = sb.pflxSessionTimerText(s, now);
  check('countdown: past scheduledEnd -> overtime flag set', info.overtime === true);
  check('countdown: past scheduledEnd -> "+mm:ss over" label', info.label.indexOf('+3:12 over') !== -1);
}
{
  const sb = makeSandbox();
  const now = 1000000000000;
  const s = { id: 's1', liveStartedAt: now - (8 * 60000 + 45000) };
  const info = sb.pflxSessionTimerText(s, now);
  check('elapsed mode (no scheduledEnd): "8:45 elapsed"', info.label.indexOf('8:45 elapsed') !== -1);
  check('elapsed mode: never marked urgent/overtime', info.urgent === false && info.overtime === false);
}
{
  const sb = makeSandbox();
  const s = { id: 's1' };
  const info = sb.pflxSessionTimerText(s, 1000000000000);
  check('neither scheduledEnd nor liveStartedAt -> null (hidden, not a guess)', info === null);
}
{
  const sb = makeSandbox();
  const now = 1000000000000;
  // scheduledEnd takes priority over liveStartedAt when both are present
  const s = { id: 's1', scheduledEnd: new Date(now + 60000).toISOString(), liveStartedAt: now - 600000 };
  const info = sb.pflxSessionTimerText(s, now);
  check('scheduledEnd takes priority over liveStartedAt when both are set', info.label.indexOf('left') !== -1);
}

// pflxEnsureSessionTimer / pflxStopSessionTimer -- DOM/interval wiring
{
  const sb = makeSandbox();
  const s = { id: 's1', liveStartedAt: Date.now() - 5000 };
  sb.pflxEnsureSessionTimer(s);
  check('ensure: draws immediately (element gets a non-empty label before any tick)', sb.__el.textContent.length > 0);
  check('ensure: starts exactly one interval', sb.__intervalCalls.length === 1 && sb.__intervalCalls[0].ms === 1000);
  sb.pflxEnsureSessionTimer(s); // same session again -- must not start a second interval
  check('ensure: calling again for the SAME session id does not start a second interval', sb.__intervalCalls.length === 1);
}
{
  const sb = makeSandbox();
  const s1 = { id: 's1', liveStartedAt: Date.now() - 1000 };
  const s2 = { id: 's2', liveStartedAt: Date.now() - 1000 };
  sb.pflxEnsureSessionTimer(s1);
  const firstIntervalId = sb.__intervalCalls[0].id;
  sb.pflxEnsureSessionTimer(s2); // a DIFFERENT session -- must stop the old interval and start a new one
  check('ensure: switching to a different session clears the previous interval', sb.__clearedIntervals.indexOf(firstIntervalId) !== -1);
  check('ensure: switching to a different session starts a fresh interval', sb.__intervalCalls.length === 2);
}
{
  const sb = makeSandbox();
  const s = { id: 's1', liveStartedAt: Date.now() - 1000 };
  sb.pflxEnsureSessionTimer(s);
  const id = sb.__intervalCalls[0].id;
  sb.pflxStopSessionTimer();
  check('stop: clears the running interval', sb.__clearedIntervals.indexOf(id) !== -1);
  sb.pflxEnsureSessionTimer(s); // after stop, the same session id can start fresh again
  check('stop: after stopping, re-ensuring the same session starts a new interval (tracking was reset)', sb.__intervalCalls.length === 2);
}
{
  const sb = makeSandbox();
  const s = { id: 's1' }; // no scheduledEnd, no liveStartedAt
  sb.pflxEnsureSessionTimer(s);
  check('ensure: a session with neither timing field clears the element text rather than crashing', sb.__el.textContent === '');
}
{
  const sb = makeSandbox();
  sb.pflxStopSessionTimer(); // stopping when nothing is running must not throw
  check('stop: calling with nothing running is a safe no-op', true);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
