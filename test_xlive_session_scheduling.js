// Unit tests for session scheduling (Start Time / End Time fields).
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

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}

function makeSandbox() {
  const sandbox = {};
  const body =
    extractFunction(src, 'function pflxFormatSessionSchedule(') + '\n' +
    'sandbox.pflxFormatSessionSchedule = pflxFormatSessionSchedule;\n' +
    extractFunction(src, 'function pflxSessionScheduleWarning(') + '\n' +
    'sandbox.pflxSessionScheduleWarning = pflxSessionScheduleWarning;\n' +
    extractFunction(src, 'function newLiveSession(') + '\n' +
    'sandbox.newLiveSession = newLiveSession;\n';
  new Function('sandbox', 'with (sandbox) {\n' + body + '\n}')(sandbox);
  return sandbox;
}

// ── 1. newLiveSession() carries the new fields, empty by default ──────
(function () {
  const sb = makeSandbox();
  const s = sb.newLiveSession();
  check('newLiveSession has scheduledStart, default empty string', s.scheduledStart === '');
  check('newLiveSession has scheduledEnd, default empty string', s.scheduledEnd === '');
  check('unrelated existing fields untouched (title, status)', s.title === '' && s.status === 'scheduled');
})();

// ── 2. pflxFormatSessionSchedule -- pure formatting, no locale/timezone
//      dependency (manual day/month tables + 12h math) ─────────────────
(function () {
  const sb = makeSandbox();
  check('both empty -> null (nothing to show)', sb.pflxFormatSessionSchedule('', '') === null);
  check('both null -> null', sb.pflxFormatSessionSchedule(null, null) === null);

  // Friday Sep 11 2026, 3:00 PM -> 4:00 PM (same day)
  const sameDay = sb.pflxFormatSessionSchedule('2026-09-11T15:00', '2026-09-11T16:00');
  check('same-day start+end renders one date, both times, an en-dash between',
    sameDay === 'Fri, Sep 11 · 3:00 PM – 4:00 PM');

  // Cross-midnight: starts 11:30 PM Fri, ends 12:15 AM Sat
  const crossDay = sb.pflxFormatSessionSchedule('2026-09-11T23:30', '2026-09-12T00:15');
  check('cross-day start+end renders both dates', crossDay === 'Fri, Sep 11 11:30 PM – Sat, Sep 12 12:15 AM');

  // Start only
  const startOnly = sb.pflxFormatSessionSchedule('2026-09-11T09:00', '');
  check('start only -> date + time, no dash', startOnly === 'Fri, Sep 11 · 9:00 AM');

  // End only
  const endOnly = sb.pflxFormatSessionSchedule('', '2026-09-11T09:00');
  check('end only -> "Ends" prefix', endOnly === 'Ends Fri, Sep 11 · 9:00 AM');

  // Midnight (12 AM) and noon (12 PM) 12-hour-clock edge cases
  const midnight = sb.pflxFormatSessionSchedule('2026-09-11T00:00', '');
  check('00:00 renders as 12:00 AM, not 0:00 AM', midnight === 'Fri, Sep 11 · 12:00 AM');
  const noon = sb.pflxFormatSessionSchedule('2026-09-11T12:00', '');
  check('12:00 renders as 12:00 PM, not 0:00 PM', noon === 'Fri, Sep 11 · 12:00 PM');

  // Minute zero-padding
  const padded = sb.pflxFormatSessionSchedule('2026-09-11T09:05', '');
  check('single-digit minute is zero-padded (9:05, not 9:5)', padded === 'Fri, Sep 11 · 9:05 AM');

  // Malformed input fails safe (doesn't throw, treats as unset)
  const garbage = sb.pflxFormatSessionSchedule('not-a-date', '');
  check('malformed start value -> null, no throw', garbage === null);
})();

// ── 3. pflxSessionScheduleWarning -- soft validation only ─────────────
(function () {
  const sb = makeSandbox();
  check('either side unset -> no warning', sb.pflxSessionScheduleWarning('', '2026-09-11T16:00') === null);
  check('both unset -> no warning', sb.pflxSessionScheduleWarning('', '') === null);
  check('end after start -> no warning', sb.pflxSessionScheduleWarning('2026-09-11T15:00', '2026-09-11T16:00') === null);
  check('end equal to start -> warns', typeof sb.pflxSessionScheduleWarning('2026-09-11T15:00', '2026-09-11T15:00') === 'string');
  check('end before start -> warns', typeof sb.pflxSessionScheduleWarning('2026-09-11T16:00', '2026-09-11T15:00') === 'string');
  check('malformed values -> no throw, no false warning', sb.pflxSessionScheduleWarning('garbage', 'also-garbage') === null);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
