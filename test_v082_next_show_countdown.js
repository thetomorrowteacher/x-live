// PATCH X-LIVE v0.82 -- Next-Show Countdown (Task F part 1 of 5). Extracts
// the real shipped pflxNextShowCountdownText/pflxNextShowCardHtml/
// pflxSaveNextShow/pflxClearNextShow from index.html via brace-counting and
// runs them against realistic fixtures -- never a reimplementation.
// Run: node test_v082_next_show_countdown.js index.html
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

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('PASS - ' + label); } else { fail++; console.log('FAIL - ' + label); } }

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

ok(src.indexOf('X-LIVE v0.82, Oct 1 2026') !== -1, 'v0.82 header comment present');
ok(src.indexOf("nextShowAt: '', // PATCH X-LIVE v0.82") !== -1, 'DEFAULT_CFG.nextShowAt added');
ok(src.indexOf("nextShowLabel: '', // PATCH X-LIVE v0.82") !== -1, 'DEFAULT_CFG.nextShowLabel added');

const countdownSrc = extractFn('pflxNextShowCountdownText');
const cardSrc = extractFn('pflxNextShowCardHtml');
const saveSrc = extractFn('pflxSaveNextShow');
const clearSrc = extractFn('pflxClearNextShow');

function loadCountdown() {
  const wrapped = new Function(`
    ${countdownSrc}
    return pflxNextShowCountdownText;
  `);
  return wrapped();
}
const countdownText = loadCountdown();

ok(countdownText('', 1000) === null, 'empty string -> null');
ok(countdownText(null, 1000) === null, 'null -> null');
ok(countdownText('not-a-date', 1000) === null, 'malformed date string -> null');

{
  const now = Date.UTC(2026, 9, 1, 12, 0, 0); // Oct 1 2026, 12:00:00 UTC
  const past = new Date(now - 60000).toISOString();
  ok(countdownText(past, now) === null, 'a target already in the past -> null (hides, no negative countdown)');

  const in90sec = new Date(now + 90 * 1000).toISOString();
  const r1 = countdownText(in90sec, now);
  ok(r1 !== null, '90s out -> non-null');
  ok(r1.label === '1m 30s', '90s out -> "1m 30s" (minutes+seconds form, under 1hr)');
  ok(r1.imminent === true, '90s out -> imminent (<=15min)');

  const in20min = new Date(now + 20 * 60 * 1000).toISOString();
  const r2 = countdownText(in20min, now);
  ok(r2.label === '20m 0s', '20min out -> "20m 0s"');
  ok(r2.imminent === false, '20min out -> not imminent (>15min)');

  const in2h5m = new Date(now + (2 * 60 + 5) * 60 * 1000).toISOString();
  const r3 = countdownText(in2h5m, now);
  ok(r3.label === '2h 5m', '2h5m out -> "2h 5m" (hours+minutes form, drops seconds)');

  const in3d4h10m = new Date(now + ((3 * 24 + 4) * 60 + 10) * 60 * 1000).toISOString();
  const r4 = countdownText(in3d4h10m, now);
  ok(r4.label === '3d 4h 10m', '3d4h10m out -> "3d 4h 10m" (days+hours+minutes form, drops seconds)');

  const inExactly15min = new Date(now + 15 * 60 * 1000).toISOString();
  ok(countdownText(inExactly15min, now).imminent === true, 'exactly 15:00 remaining -> imminent (boundary, <=)');
  const in15min1sec = new Date(now + 15 * 60 * 1000 + 1000).toISOString();
  ok(countdownText(in15min1sec, now).imminent === false, '15:01 remaining -> not imminent (boundary)');

  const farFuture = new Date(Date.now() + 86400000).toISOString();
  const r5 = countdownText(farFuture);
  ok(r5 !== null && typeof r5.label === 'string', 'omitted nowMs falls back to Date.now() safely');
}

function loadCard(cfg, isHost) {
  const wrapped = new Function('esc', `
    var L = { cfg: ${JSON.stringify(cfg)}, isHost: ${!!isHost} };
    ${countdownSrc}
    ${cardSrc}
    return pflxNextShowCardHtml();
  `);
  return wrapped(esc);
}

{
  const future = new Date('2099-01-01T00:00:00Z').toISOString();

  const htmlHostFuture = loadCard({ nextShowAt: future, nextShowLabel: 'Season Finale' }, true);
  ok(htmlHostFuture.indexOf('id="xlNextShowVal"') !== -1, 'host view with a future show: display card renders (xlNextShowVal present)');
  ok(htmlHostFuture.indexOf('Season Finale') !== -1, 'host view: optional label is included in the display card');
  ok(htmlHostFuture.indexOf('id="xlNextShowAtInput"') !== -1, 'host view: settings sub-card renders (datetime input present)');
  ok(htmlHostFuture.indexOf('onclick="pflxSaveNextShow()"') !== -1, 'host view: SAVE button wired');
  ok(htmlHostFuture.indexOf('onclick="pflxClearNextShow()"') !== -1, 'host view: CLEAR button wired');

  const htmlPlayerFuture = loadCard({ nextShowAt: future, nextShowLabel: '' }, false);
  ok(htmlPlayerFuture.indexOf('id="xlNextShowVal"') !== -1, 'player view with a future show: display card still renders');
  ok(htmlPlayerFuture.indexOf('id="xlNextShowAtInput"') === -1, 'player view: settings sub-card is NOT shown (host-gated)');

  const htmlHostNoShow = loadCard({ nextShowAt: '', nextShowLabel: '' }, true);
  ok(htmlHostNoShow.indexOf('id="xlNextShowVal"') === -1, 'host view with no show scheduled: display card hidden');
  ok(htmlHostNoShow.indexOf('id="xlNextShowAtInput"') !== -1, 'host view with no show scheduled: settings sub-card still shown (so host CAN set one)');

  const htmlPlayerNoShow = loadCard({ nextShowAt: '', nextShowLabel: '' }, false);
  ok(htmlPlayerNoShow === '', 'player view with no show scheduled: card is empty (nothing to show, no settings access)');
}

function loadActions(isHost, inputs) {
  const calls = { saveCfg: 0, render: 0 };
  const elements = inputs || {};
  const documentMock = {
    getElementById: function (id) { return elements[id] || null; }
  };
  const wrapped = new Function('document', 'calls', `
    var L = { cfg: { nextShowAt: 'stale', nextShowLabel: 'stale label' }, isHost: ${!!isHost} };
    function saveCfg() { calls.saveCfg++; }
    function render() { calls.render++; }
    ${saveSrc}
    ${clearSrc}
    return { save: pflxSaveNextShow, clear: pflxClearNextShow, L: L };
  `);
  return Object.assign(wrapped(documentMock, calls), { calls: calls });
}

{
  const inputs = {
    xlNextShowAtInput: { value: '2026-12-25T10:00' },
    xlNextShowLabelInput: { value: '  Winter Showcase  ' }
  };
  const a = loadActions(true, inputs);
  a.save();
  ok(a.L.cfg.nextShowAt === '2026-12-25T10:00', 'host save: nextShowAt pulled from the real input element');
  ok(a.L.cfg.nextShowLabel === 'Winter Showcase', 'host save: nextShowLabel pulled and trimmed');
  ok(a.calls.saveCfg === 1 && a.calls.render === 1, 'host save: saveCfg() and render() both called exactly once');

  const b = loadActions(true, inputs);
  b.clear();
  ok(b.L.cfg.nextShowAt === '' && b.L.cfg.nextShowLabel === '', 'host clear: both fields reset to empty string');
  ok(b.calls.saveCfg === 1 && b.calls.render === 1, 'host clear: saveCfg() and render() both called exactly once');

  const c = loadActions(false, inputs);
  c.save();
  ok(c.L.cfg.nextShowAt === 'stale' && c.L.cfg.nextShowLabel === 'stale label', 'non-host save: no-ops, cfg untouched (host-gated)');
  ok(c.calls.saveCfg === 0 && c.calls.render === 0, 'non-host save: saveCfg()/render() never called');

  const d = loadActions(false, inputs);
  d.clear();
  ok(d.L.cfg.nextShowAt === 'stale', 'non-host clear: no-ops, cfg untouched (host-gated)');
  ok(d.calls.saveCfg === 0 && d.calls.render === 0, 'non-host clear: saveCfg()/render() never called');

  const e = loadActions(true, {});
  let threw = false;
  try { e.save(); } catch (err) { threw = true; }
  ok(!threw, 'host save with missing input elements does not throw (falls back to empty strings)');
  ok(e.L.cfg.nextShowAt === '' && e.L.cfg.nextShowLabel === '', 'host save with missing elements: falls back to empty strings, not undefined/crash');
}

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
