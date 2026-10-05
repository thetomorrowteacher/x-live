const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path'); let NFL = null; try { const h = require('fs').readFileSync(require('path').join(__dirname, '..', 'pflx-arena-check', 'public', 'games', 'nexus-frontiers.html'), 'utf8'); NFL = new Function(h.slice(h.indexOf('/*LOGIC-START*/'), h.indexOf('/*LOGIC-END*/')) + '\nreturn NFLogic;')(); } catch (e) {}
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 760 } }); await ctx.route(/^https?:/, r => r.abort());
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const ok = (c, m) => { assert.ok(c, m); console.log('PASS', m); };
  await pg.goto('file://' + path.join(__dirname, 'index.html')); await pg.waitForFunction(() => window.xlSev && typeof L !== 'undefined' && L.cfg, { polling: 100 });
  await pg.evaluate(() => { window.__kv = []; window.kvSave = async (k, v) => { window.__kv.push([k, JSON.parse(JSON.stringify(v))]); return true; };
    const me = L.roster[0]; L.isHost = true; L.realIsHost = true; L.me = { id: me.id, brand: me.brand };
    L.sessions = [{ id: 'S1', title: 'Show', status: 'active', slides: [{ id: 'a', type: 'poll', question: 'q', options: ['a', 'b'] }], currentSlideIndex: 0, liveParticipants: L.roster.slice(0, 4).map(r => ({ id: r.id })) }];
    L.liveRunningSessionId = 'S1'; window.saveSession = async s => s; window.postAward = () => {}; window.liteLog = async () => {}; L.screen = 'live'; render(); });
  await pg.waitForTimeout(900);
  ok(await pg.evaluate(() => window.__kv.every(x => x[1].events.length === 0) && window.__kv.length <= 1), 'with no System Event running the host publishes at most one empty list (clears stale events)');
  await pg.evaluate(() => xlSev.launch('system_tax', { pct: 20, mins: 2 })); await pg.evaluate(() => document.getElementById('xsSkip') && document.getElementById('xsSkip').click());
  await pg.waitForFunction(() => window.__kv.some(x => x[1].events.length === 1), { polling: 100 });
  const [k, v] = await pg.evaluate(() => window.__kv[window.__kv.length - 1]);
  ok(k === 'pflx_xlive_sev_live' && v.events.length === 1 && v.events[0].type === 'system_tax' && v.events[0].pct === 20 && v.events[0].endAt > v.events[0].startAt && v.session === 'S1', 'a launched System Event is published to pflx_xlive_sev_live with the game\'s field names');
  if (NFL) { const fx = NFL.eventFx(v.events, Date.now() + 1000); ok(fx.taxPct === 20 && fx.names[0] === 'system_tax', 'the cartridge reads that payload as a 20% tax'); }
  await pg.evaluate(() => xlSev.launch('xc_boost', { mult: 3, mins: 1 })); await pg.evaluate(() => document.getElementById('xsSkip') && document.getElementById('xsSkip').click()); await pg.waitForTimeout(900);
  const v2 = await pg.evaluate(() => window.__kv[window.__kv.length - 1][1]); ok(v2.events.length === 2 && (!NFL || NFL.eventFx(v2.events, Date.now() + 1000).mult === 3), 'a second event is added and the multiplier applies');
  await pg.evaluate(() => { const s = L.sessions[0]; xlSev.end(s.sevs[0].id); xlSev.end(s.sevs[1].id); }); await pg.waitForTimeout(900);
  const v3 = await pg.evaluate(() => window.__kv[window.__kv.length - 1][1]); ok(v3.events.length === 0, 'ending the events clears the published list');
  await pg.evaluate(() => { L.sessions[0].sevs = []; xlSev.launch('reality_warp', {}); }); await pg.waitForTimeout(900);
  ok(await pg.evaluate(() => window.__kv[window.__kv.length - 1][1].events.length === 0), 'Reality Warp (look only) is not published as an XC event');
  console.log('errors:', errs.length ? errs : 'none'); await br.close(); if (errs.length) process.exit(2);
})().catch(e => { console.error('SEV3 FAIL', e); process.exit(1); });
