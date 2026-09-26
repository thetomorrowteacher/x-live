// PATCH X-LIVE v0.74 -- Quick Launch: fire an activity at a cohort with no
// live session already running. Extracts the REAL shipped functions from
// index.html via brace-counting (never a reimplementation) and runs them
// in a vm sandbox with mocked closures (L/modal/toast/esc/cohortList/
// saveSession/liveGoLiveSession/render/modalClose/liveAddSlide), asserting
// real state mutations and call sequencing.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const file = process.argv[2] || path.join(__dirname, 'index.html');
const src = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS: ' + m); } else { fail++; console.log('FAIL: ' + m); } }

function extractFn(name) {
  const re = new RegExp('(?:async )?function ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = m.index + m[0].length, depth = 1;
  while (depth > 0 && i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(m.index, i);
}

const fnNames = ['newLiveSession', 'pflxQuickLaunchExpiry', 'xlQuickLaunchOpen', 'xlQuickLaunchToggleCohort',
  'renderQuickLaunchCohortModal', 'xlQuickLaunchNext', 'xlQuickLaunchGoLive', 'liveSaveSlideForm'];
const fnSrcs = {};
fnNames.forEach(function (n) { fnSrcs[n] = extractFn(n); });

ok(/quickLaunch: false/.test(fnSrcs.newLiveSession), 'newLiveSession() now includes quickLaunch: false by default');
ok(/function xlQuickLaunchOpen/.test(fnSrcs.xlQuickLaunchOpen), 'xlQuickLaunchOpen() extracted');
ok(/function xlQuickLaunchNext/.test(fnSrcs.xlQuickLaunchNext), 'xlQuickLaunchNext() extracted');
ok(/xlQuickLaunchGoLive/.test(fnSrcs.xlQuickLaunchGoLive), 'xlQuickLaunchGoLive() extracted');
ok(/L\.quickLaunchPending && s\.quickLaunch/.test(fnSrcs.liveSaveSlideForm), 'liveSaveSlideForm() branches on L.quickLaunchPending && s.quickLaunch');

// ---- sandbox ----
function makeSandbox(overrides) {
  const calls = { modal: [], toast: [], modalClose: 0, render: 0, liveAddSlide: 0, saveSession: [], liveGoLiveSession: [] };
  const L = {
    hostCapabilities: { scopedToCohorts: false },
    me: { id: 'host1', managedCohorts: ['Alpha'] },
    sessions: [],
    liveEditingSession: null,
    quickLaunchDraft: null,
    quickLaunchPending: false,
    liveEditingSlide: null
  };
  const sandbox = {
    console,
    L: L,
    modal: function (html) { calls.modal.push(html); },
    toast: function (msg) { calls.toast.push(msg); },
    modalClose: function () { calls.modalClose++; },
    render: function () { calls.render++; },
    esc: function (x) { return String(x); },
    cohortList: function () { return ['Alpha', 'Beta', 'Gamma']; },
    liveAddSlide: function () { calls.liveAddSlide++; },
    saveSession: function (s) { calls.saveSession.push(s); return Promise.resolve(s); },
    liveGoLiveSession: function (id) { calls.liveGoLiveSession.push(id); return Promise.resolve(); },
    Date: Date,
    JSON: JSON,
    Array: Array,
    String: String,
    Promise: Promise
  };
  if (overrides) Object.assign(sandbox.L, overrides);
  const ctx = vm.createContext(sandbox);
  const body = fnNames.map(function (n) { return fnSrcs[n]; }).join('\n') +
    '\nthis.__newLiveSession = newLiveSession; this.__pflxQuickLaunchExpiry = pflxQuickLaunchExpiry;' +
    ' this.__xlQuickLaunchOpen = xlQuickLaunchOpen; this.__xlQuickLaunchToggleCohort = xlQuickLaunchToggleCohort;' +
    ' this.__renderQuickLaunchCohortModal = renderQuickLaunchCohortModal; this.__xlQuickLaunchNext = xlQuickLaunchNext;' +
    ' this.__xlQuickLaunchGoLive = xlQuickLaunchGoLive; this.__liveSaveSlideForm = liveSaveSlideForm;';
  vm.runInContext(body, ctx);
  return { ctx: ctx, L: L, calls: calls };
}

// ---- pflxQuickLaunchExpiry() ----
{
  const sb = makeSandbox();
  const now = new Date(2026, 0, 1, 10, 30, 0).getTime(); // Jan 1 2026, 10:30
  const result = sb.ctx.__pflxQuickLaunchExpiry(now);
  const expected = new Date(now + 7 * 24 * 60 * 60 * 1000);
  const pad = function (n) { return String(n).padStart(2, '0'); };
  const expectedStr = expected.getFullYear() + '-' + pad(expected.getMonth() + 1) + '-' + pad(expected.getDate()) + 'T' + pad(expected.getHours()) + ':' + pad(expected.getMinutes());
  ok(result === expectedStr, 'pflxQuickLaunchExpiry(now) returns exactly now+7 days in datetime-local format (' + result + ')');
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(result), 'pflxQuickLaunchExpiry() output matches <input type="datetime-local"> value shape');
}

// ---- xlQuickLaunchOpen() -- unscoped host ----
{
  const sb = makeSandbox({ hostCapabilities: { scopedToCohorts: false } });
  sb.ctx.__xlQuickLaunchOpen();
  ok(sb.L.quickLaunchDraft !== null, 'xlQuickLaunchOpen() sets L.quickLaunchDraft');
  ok(sb.L.quickLaunchDraft.allCohorts === true, 'unscoped host defaults to All players');
  ok(Array.isArray(sb.L.quickLaunchDraft.cohorts) && sb.L.quickLaunchDraft.cohorts.length === 0, 'unscoped host starts with an empty cohort list');
  ok(sb.calls.modal.length === 1, 'xlQuickLaunchOpen() opens exactly one modal');
}

// ---- xlQuickLaunchOpen() -- scoped host ----
{
  const sb = makeSandbox({ hostCapabilities: { scopedToCohorts: true }, me: { id: 'host2', managedCohorts: ['Alpha', 'Beta'] } });
  sb.ctx.__xlQuickLaunchOpen();
  ok(sb.L.quickLaunchDraft.allCohorts === false, 'a cohort-scoped host cannot default to All players');
  ok(sb.L.quickLaunchDraft.cohorts.length === 2 && sb.L.quickLaunchDraft.cohorts.indexOf('Alpha') !== -1 && sb.L.quickLaunchDraft.cohorts.indexOf('Beta') !== -1, 'a cohort-scoped host defaults to their own managed cohorts, pre-selected');
}

// ---- xlQuickLaunchToggleCohort() ----
{
  const sb = makeSandbox();
  sb.L.quickLaunchDraft = { allCohorts: false, cohorts: ['Alpha'] };
  sb.ctx.__xlQuickLaunchToggleCohort('Beta', true);
  ok(sb.L.quickLaunchDraft.cohorts.indexOf('Beta') !== -1, 'checking a cohort adds it to the draft');
  sb.ctx.__xlQuickLaunchToggleCohort('Alpha', false);
  ok(sb.L.quickLaunchDraft.cohorts.indexOf('Alpha') === -1, 'unchecking a cohort removes it from the draft');
  ok(sb.calls.modal.length === 2, 'each toggle re-renders the modal');
}

// ---- renderQuickLaunchCohortModal() ----
{
  const sb = makeSandbox({ hostCapabilities: { scopedToCohorts: false } });
  sb.L.quickLaunchDraft = { allCohorts: false, cohorts: ['Alpha'] };
  sb.ctx.__renderQuickLaunchCohortModal();
  const html = sb.calls.modal[sb.calls.modal.length - 1];
  ok(/Quick Launch/.test(html), 'modal renders the Quick Launch title');
  ok(/Alpha/.test(html) && /Beta/.test(html) && /Gamma/.test(html), 'unscoped modal lists every cohort from cohortList()');
  ok(/NEXT: PICK ACTIVITY/.test(html), 'modal has a NEXT: PICK ACTIVITY action');
  ok(/xlQuickLaunchNext\(\)/.test(html), 'NEXT button wires to xlQuickLaunchNext()');

  const sbScoped = makeSandbox({ hostCapabilities: { scopedToCohorts: true }, me: { id: 'h', managedCohorts: ['Alpha'] } });
  sbScoped.L.quickLaunchDraft = { allCohorts: false, cohorts: ['Alpha'] };
  sbScoped.ctx.__renderQuickLaunchCohortModal();
  const scopedHtml = sbScoped.calls.modal[0];
  ok(/Scoped to your assigned cohort/.test(scopedHtml), 'a scoped host sees the locked-cohort message, not an All players checkbox');
}

// ---- xlQuickLaunchNext() -- validation ----
{
  const sb = makeSandbox();
  sb.L.quickLaunchDraft = { allCohorts: false, cohorts: [] };
  sb.ctx.__xlQuickLaunchNext();
  ok(sb.calls.toast.length === 1 && /Pick at least one cohort/.test(sb.calls.toast[0]), 'no cohort and not All players -- blocked with a toast');
  ok(sb.calls.liveAddSlide === 0, 'validation failure never opens the Add Activity flow');
  ok(sb.L.liveEditingSession === null, 'validation failure never creates a session');
}

// ---- xlQuickLaunchNext() -- happy path, specific cohorts ----
{
  const sb = makeSandbox();
  sb.L.quickLaunchDraft = { allCohorts: false, cohorts: ['Alpha', 'Beta'] };
  sb.ctx.__xlQuickLaunchNext();
  ok(sb.L.quickLaunchDraft === null, 'draft is cleared once the session is built');
  ok(sb.L.liveEditingSession !== null, 'a new session is created and staged into L.liveEditingSession');
  const s = sb.L.liveEditingSession;
  ok(s.quickLaunch === true, 'the new session is flagged quickLaunch: true');
  ok(s.title === 'Quick Launch', 'the new session gets a default "Quick Launch" title');
  ok(s.allCohorts === false && s.cohorts.length === 2 && s.cohorts.indexOf('Alpha') !== -1 && s.cohorts.indexOf('Beta') !== -1, 'cohort scope from the draft carries over to the session exactly');
  ok(typeof s.scheduledEnd === 'string' && s.scheduledEnd.length > 0, 'scheduledEnd (the 1-week ceiling) is set on creation');
  ok(sb.L.quickLaunchPending === true, 'L.quickLaunchPending is armed so the next slide save knows to go live immediately');
  ok(sb.calls.liveAddSlide === 1, 'the existing Add Activity flow (liveAddSlide) is opened immediately, exactly once');
  ok(sb.calls.modalClose >= 1, 'the cohort-picker modal is closed before opening Add Activity');
}

// ---- xlQuickLaunchNext() -- All players path ----
{
  const sb = makeSandbox();
  sb.L.quickLaunchDraft = { allCohorts: true, cohorts: [] };
  sb.ctx.__xlQuickLaunchNext();
  ok(sb.L.liveEditingSession.allCohorts === true, 'choosing All players carries through with no cohort list required');
  ok(sb.calls.toast.length === 0, 'All players never triggers the "pick a cohort" validation toast');
}

// ---- liveSaveSlideForm() -- quick-launch branch (async: run and check
// after the microtask queue drains, then print the final report) ----
var quickLaunchBranchCheck = (function () {
  const sb = makeSandbox();
  const qlSession = { id: 'sess-ql-1', quickLaunch: true, slides: [] };
  sb.L.liveEditingSession = qlSession;
  sb.L.quickLaunchPending = true;
  sb.L.liveEditingSlide = { idx: -1, slide: { title: 'Pop Quiz', type: 'text' } };
  sb.ctx.__liveSaveSlideForm();
  // xlQuickLaunchGoLive is async and NOT awaited by liveSaveSlideForm (matching
  // the real shipped code -- a UI action fires it and moves on), so its two
  // internal awaits (saveSession then liveGoLiveSession) resolve a few
  // microtask ticks later. Flush the microtask queue before asserting on them.
  return Promise.resolve().then(function () { return Promise.resolve(); }).then(function () { return Promise.resolve(); }).then(function () {
    ok(qlSession.slides.length === 1 && qlSession.slides[0].title === 'Pop Quiz', 'the slide is still actually added to the session before branching');
    ok(sb.L.quickLaunchPending === false, 'quickLaunchPending is consumed (cleared) so a later normal slide-add never mistakenly re-triggers it');
    ok(sb.L.liveEditingSlide === null, 'liveEditingSlide is cleared same as the normal path');
    ok(sb.calls.saveSession.length === 1 && sb.calls.saveSession[0] === qlSession, 'xlQuickLaunchGoLive saved the session exactly once');
    ok(sb.calls.liveGoLiveSession.length === 1 && sb.calls.liveGoLiveSession[0] === 'sess-ql-1', 'xlQuickLaunchGoLive then called liveGoLiveSession with the new session\'s real id');
    ok(sb.calls.render === 0, 'the quick-launch branch does NOT fall through to the normal render() call (liveGoLiveSession renders on its own in the real app)');
  });
})();

// ---- liveSaveSlideForm() -- normal (non-quick-launch) path is unaffected ----
{
  const sb = makeSandbox();
  const normalSession = { id: 'sess-normal-1', quickLaunch: false, slides: [] };
  sb.L.liveEditingSession = normalSession;
  sb.L.quickLaunchPending = false;
  sb.L.liveEditingSlide = { idx: -1, slide: { title: 'Regular Slide', type: 'text' } };
  sb.ctx.__liveSaveSlideForm();
  ok(normalSession.slides.length === 1, 'a normal (non-quick-launch) slide save still adds the slide');
  ok(sb.calls.saveSession.length === 0 && sb.calls.liveGoLiveSession.length === 0, 'a normal slide save never triggers xlQuickLaunchGoLive');
  ok(sb.calls.render === 1 && sb.calls.modalClose === 1, 'a normal slide save still falls through to modalClose()+render(), unchanged from before this patch');
}

// ---- liveSaveSlideForm() -- quickLaunchPending true but session isn't a quick-launch one ----
{
  const sb = makeSandbox();
  const s = { id: 'sess-x', quickLaunch: false, slides: [] };
  sb.L.liveEditingSession = s;
  sb.L.quickLaunchPending = true; // stray/stale flag -- must not misfire on an unrelated session
  sb.L.liveEditingSlide = { idx: -1, slide: { title: 'Slide', type: 'text' } };
  sb.ctx.__liveSaveSlideForm();
  ok(sb.calls.saveSession.length === 0 && sb.calls.liveGoLiveSession.length === 0, 'the quick-launch branch requires BOTH L.quickLaunchPending AND s.quickLaunch -- a stray pending flag alone never fires it');
  ok(sb.calls.render === 1, 'falls through to the normal path when s.quickLaunch is false');
}

quickLaunchBranchCheck.then(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
