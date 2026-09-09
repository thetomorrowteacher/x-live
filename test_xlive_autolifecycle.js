// Unit tests for the auto-start / auto-stop session lifecycle patch.
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
function flush() { return new Promise(function (r) { setImmediate(r); }); }

function makeSandbox(overrides) {
  const sandbox = {};
  const body = extractBetween(
    src,
    'function pflxActivateSession(s) {',
    'window.pflxLiveAutoLifecycleCheck = pflxLiveAutoLifecycleCheck;\n'
  );

  sandbox.L = Object.assign({
    isHost: true,
    hostCapabilities: { runSessions: true, scopedToCohorts: false },
    me: { managedCohorts: [] },
    sessions: [],
    liveRunningSessionId: null,
    liveEditingSession: { keepMe: true },
    demo: false
  }, overrides || {});

  sandbox.__saved = [];
  sandbox.saveSession = function (s) { sandbox.__saved.push(s); return Promise.resolve(s); };
  sandbox.__renderCalls = 0;
  sandbox.render = function () { sandbox.__renderCalls++; };
  sandbox.__toasts = [];
  sandbox.toast = function (msg) { sandbox.__toasts.push(msg); };
  sandbox.__markedStarted = [];
  sandbox.liveMarkSlideStarted = function (s, i) { sandbox.__markedStarted.push({ id: s.id, i: i }); };
  sandbox.__awards = [];
  sandbox.grantSessionReward = function (pid, xc, badgeId, reason) { sandbox.__awards.push({ pid: pid, xc: xc, badgeId: badgeId, reason: reason }); };
  sandbox.window = sandbox;
  sandbox.pflxSessionInCohortScope = function (session, managedCohorts) {
    if (!sandbox.__scopeDeny) return true;
    return sandbox.__scopeDeny.indexOf(session.id) === -1;
  };
  sandbox.__stopTimerCalls = 0;
  sandbox.pflxStopSessionTimer = function () { sandbox.__stopTimerCalls++; }; // PATCH X-LIVE Session Timer -- stubbed here, covered by its own test file

  const full = body +
    '\nsandbox.pflxActivateSession = pflxActivateSession;\n' +
    'sandbox.liveGoLiveSession = liveGoLiveSession;\n' +
    'sandbox.pflxGrantCompletionRewards = pflxGrantCompletionRewards;\n' +
    'sandbox.liveEndSession = liveEndSession;\n' +
    'sandbox.pflxLiveAutoStart = pflxLiveAutoStart;\n' +
    'sandbox.pflxLiveAutoEnd = pflxLiveAutoEnd;\n' +
    'sandbox.pflxLiveAutoLifecycleCheck = pflxLiveAutoLifecycleCheck;\n';
  new Function('sandbox', 'with (sandbox) {\n' + full + '\n}')(sandbox);
  return sandbox;
}

function futureIso(msFromNow) { return new Date(Date.now() + msFromNow).toISOString().slice(0, 16); }
function pastIso(msAgo) { return new Date(Date.now() - msAgo).toISOString().slice(0, 16); }

async function main() {
  // pflxActivateSession
  {
    const sb = makeSandbox();
    const s = { id: 's1', status: 'scheduled', slides: [{}] };
    sb.pflxActivateSession(s);
    check('activate: status -> active', s.status === 'active');
    check('activate: currentSlideIndex reset to 0', s.currentSlideIndex === 0);
    check('activate: hostControls initialized fresh', s.hostControls && s.hostControls.paused === false && s.hostControls.slideFrozen === false);
    check('activate: liveMarkSlideStarted called for slide 0', sb.__markedStarted.some(function (m) { return m.id === 's1' && m.i === 0; }));
  }

  // liveGoLiveSession (manual path unchanged)
  {
    const sb = makeSandbox();
    sb.L.sessions = [{ id: 's1', status: 'scheduled', slides: [] }];
    await sb.liveGoLiveSession('s1');
    check('manual GO LIVE refuses with no slides (no save)', sb.__saved.length === 0 && sb.L.sessions[0].status === 'scheduled');
    check('manual GO LIVE refuses -> toast shown', sb.__toasts.some(function (t) { return t.indexOf('Add at least one slide') !== -1; }));
  }
  {
    const sb = makeSandbox();
    sb.L.sessions = [{ id: 's1', title: 'Friday Live', status: 'scheduled', slides: [{}] }];
    await sb.liveGoLiveSession('s1');
    check('manual GO LIVE happy path -> saves the session', sb.__saved.length === 1 && sb.__saved[0].id === 's1');
    check('manual GO LIVE -> L.liveRunningSessionId set', sb.L.liveRunningSessionId === 's1');
    check('manual GO LIVE -> closes the editor', sb.L.liveEditingSession === null);
    check('manual GO LIVE -> plain "Session is LIVE" toast (not an auto-toast)', sb.__toasts.some(function (t) { return t.indexOf('Session is LIVE') !== -1 && t.indexOf('auto') === -1; }));
  }
  {
    const sb = makeSandbox({ hostCapabilities: { runSessions: true, scopedToCohorts: true } });
    sb.__scopeDeny = ['s1'];
    sb.L.sessions = [{ id: 's1', status: 'scheduled', slides: [{}] }];
    await sb.liveGoLiveSession('s1');
    check('manual GO LIVE respects cohort scope guard', sb.__saved.length === 0 && sb.__toasts.some(function (t) { return t.indexOf('outside your assigned cohort') !== -1; }));
  }

  // pflxGrantCompletionRewards
  {
    const sb = makeSandbox();
    const s = { id: 's1', rewards: { completionXc: 50, completionBadgeId: '' }, liveParticipants: [{ id: 'p1' }, { id: 'p2' }], awardedTo: [] };
    sb.pflxGrantCompletionRewards(s);
    check('completion rewards: grants once per participant', sb.__awards.length === 2);
    check('completion rewards: awardedTo dedup keys recorded', s.awardedTo.indexOf('complete:s1:p1') !== -1 && s.awardedTo.indexOf('complete:s1:p2') !== -1);
    sb.pflxGrantCompletionRewards(s);
    check('completion rewards: never double-grants the same participant', sb.__awards.length === 2);
  }
  {
    const sb = makeSandbox();
    const s = { id: 's1', rewards: { completionXc: 0, completionBadgeId: '' }, liveParticipants: [{ id: 'p1' }], awardedTo: [] };
    sb.pflxGrantCompletionRewards(s);
    check('completion rewards: no-op when no XC/badge configured', sb.__awards.length === 0);
  }

  // liveEndSession (manual path unchanged)
  {
    const sb = makeSandbox();
    sb.L.liveRunningSessionId = 's1';
    sb.L.sessions = [{ id: 's1', rewards: { completionXc: 10, completionBadgeId: '' }, liveParticipants: [{ id: 'p1' }], awardedTo: [] }];
    await sb.liveEndSession();
    check('manual END: status -> ended', sb.L.sessions[0].status === 'ended');
    check('manual END: grants completion rewards', sb.__awards.length === 1);
    check('manual END: clears L.liveRunningSessionId', sb.L.liveRunningSessionId === null);
    check('manual END: plain "Session ended" toast (not an auto-toast)', sb.__toasts.some(function (t) { return t.indexOf('Session ended') !== -1; }));
  }

  // pflxLiveAutoStart
  {
    const sb = makeSandbox();
    sb.L.liveRunningSessionId = null;
    const s = { id: 's1', title: 'Auto Session', status: 'scheduled', slides: [{}] };
    await sb.pflxLiveAutoStart(s);
    check('auto-start: activates + flags autoStarted', s.status === 'active' && s.autoStarted === true);
    check('auto-start: saves the session', sb.__saved.some(function (x) { return x.id === 's1'; }));
    check('auto-start: claims L.liveRunningSessionId when host is idle', sb.L.liveRunningSessionId === 's1');
    check('auto-start: toast names the session and says "auto-started"', sb.__toasts.some(function (t) { return t.indexOf('Auto Session') !== -1 && t.indexOf('auto-started') !== -1; }));
  }
  {
    const sb = makeSandbox();
    sb.L.liveRunningSessionId = 'other-session';
    const s = { id: 's1', status: 'scheduled', slides: [{}] };
    await sb.pflxLiveAutoStart(s);
    check('auto-start: does NOT steal focus from a session the host is already running', sb.L.liveRunningSessionId === 'other-session');
    check('auto-start: still flips the due session to active regardless', s.status === 'active');
  }

  // pflxLiveAutoEnd
  {
    const sb = makeSandbox();
    sb.L.liveRunningSessionId = 's1';
    const s = { id: 's1', title: 'Auto Session', status: 'active', rewards: { completionXc: 5, completionBadgeId: '' }, liveParticipants: [{ id: 'p1' }], awardedTo: [] };
    await sb.pflxLiveAutoEnd(s);
    check('auto-end: status -> ended, flags autoEnded', s.status === 'ended' && s.autoEnded === true);
    check('auto-end: grants completion rewards', sb.__awards.length === 1);
    check('auto-end: clears L.liveRunningSessionId when it was this session', sb.L.liveRunningSessionId === null);
    check('auto-end: toast names the session and says "auto-ended"', sb.__toasts.some(function (t) { return t.indexOf('Auto Session') !== -1 && t.indexOf('auto-ended') !== -1; }));
  }
  {
    const sb = makeSandbox();
    sb.L.liveRunningSessionId = 'other-session';
    const s = { id: 's1', status: 'active', rewards: {}, liveParticipants: [], awardedTo: [] };
    await sb.pflxLiveAutoEnd(s);
    check('auto-end: leaves L.liveRunningSessionId alone when ending a DIFFERENT session than the one running locally', sb.L.liveRunningSessionId === 'other-session');
  }

  // pflxLiveAutoLifecycleCheck
  {
    const sb = makeSandbox({ isHost: false });
    sb.L.sessions = [{ id: 's1', status: 'scheduled', scheduledStart: pastIso(60000), slides: [{}] }];
    sb.pflxLiveAutoLifecycleCheck();
    check('lifecycle check: no-op for a non-host client (never auto-transitions for a player)', sb.__saved.length === 0);
  }
  {
    const sb = makeSandbox({ hostCapabilities: { runSessions: false, scopedToCohorts: false } });
    sb.L.sessions = [{ id: 's1', status: 'scheduled', scheduledStart: pastIso(60000), slides: [{}] }];
    sb.pflxLiveAutoLifecycleCheck();
    check('lifecycle check: no-op for a host tier without runSessions capability', sb.__saved.length === 0);
  }
  {
    const sb = makeSandbox();
    sb.L.sessions = [{ id: 's1', status: 'scheduled', scheduledStart: pastIso(60000), slides: [{}] }];
    sb.pflxLiveAutoLifecycleCheck();
    await flush();
    check('lifecycle check: due scheduled session with slides auto-starts', sb.L.sessions[0].status === 'active' && sb.L.sessions[0].autoStarted === true);
  }
  {
    const sb = makeSandbox();
    sb.L.sessions = [{ id: 's1', status: 'scheduled', scheduledStart: futureIso(600000), slides: [{}] }];
    sb.pflxLiveAutoLifecycleCheck();
    await flush();
    check('lifecycle check: scheduled session with a future start time is left alone', sb.L.sessions[0].status === 'scheduled');
  }
  {
    const sb = makeSandbox();
    sb.L.sessions = [{ id: 's1', status: 'scheduled', scheduledStart: pastIso(60000), slides: [] }];
    sb.pflxLiveAutoLifecycleCheck();
    await flush();
    check('lifecycle check: due session with NO slides is never auto-started (mirrors the manual guard)', sb.L.sessions[0].status === 'scheduled');
  }
  {
    const sb = makeSandbox();
    sb.L.sessions = [{ id: 's1', status: 'active', scheduledEnd: pastIso(60000), rewards: {}, liveParticipants: [], awardedTo: [] }];
    sb.pflxLiveAutoLifecycleCheck();
    await flush();
    check('lifecycle check: active session past its scheduled end auto-ends', sb.L.sessions[0].status === 'ended' && sb.L.sessions[0].autoEnded === true);
  }
  {
    const sb = makeSandbox();
    sb.L.sessions = [{ id: 's1', status: 'active', scheduledEnd: futureIso(600000), rewards: {}, liveParticipants: [], awardedTo: [] }];
    sb.pflxLiveAutoLifecycleCheck();
    await flush();
    check('lifecycle check: active session with a future end time is left alone', sb.L.sessions[0].status === 'active');
  }
  {
    const sb = makeSandbox({ hostCapabilities: { runSessions: true, scopedToCohorts: true } });
    sb.__scopeDeny = ['s1'];
    sb.L.sessions = [{ id: 's1', status: 'scheduled', scheduledStart: pastIso(60000), slides: [{}] }];
    sb.pflxLiveAutoLifecycleCheck();
    await flush();
    check('lifecycle check: skips a session outside this host cohort scope even when due', sb.L.sessions[0].status === 'scheduled');
  }
  {
    const sb = makeSandbox();
    sb.L.sessions = [
      { id: 's-ended', status: 'ended', scheduledEnd: pastIso(60000) },
      { id: 's-active-no-end', status: 'active' }
    ];
    let threw = null;
    try { sb.pflxLiveAutoLifecycleCheck(); await flush(); } catch (e) { threw = e; }
    check('lifecycle check: never throws on already-ended or no-scheduledEnd sessions', threw === null);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main();
