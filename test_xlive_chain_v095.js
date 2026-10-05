const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 760 } }); await ctx.route(/^https?:/, r => r.abort());
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const ok = (c, m) => { assert.ok(c, m); console.log('PASS', m); };
  await pg.goto('file://' + path.join(__dirname, 'index.html')); await pg.waitForFunction(() => window.xlChain && window.xlSev && typeof L !== 'undefined' && L.cfg, { polling: 100 });
  await pg.evaluate(() => { window.__kv = []; window.kvSave = async (k, v) => { window.__kv.push([k, JSON.parse(JSON.stringify(v))]); return true; };
    const me = L.roster[0]; L.isHost = true; L.realIsHost = true; L.me = { id: me.id, brand: me.brand };
    L.sessions = []; window.saveSession = async s => { const i = L.sessions.findIndex(x => x.id === s.id); if (i < 0) L.sessions.push(s); return s; };
    window.postAward = () => {}; window.liteLog = async () => {}; L.screen = 'live'; render(); });

  // 1. pure plan: defaults and limits
  const p = await pg.evaluate(() => xlChain.buildPlan({}));
  ok(p.blocks.length === 5 && p.totalMin === 5 + 10 + 10 + 40 + 5, 'default chain is five blocks totalling 70 minutes');
  ok(p.blocks.map(b => b.role).join() === 'opening,nexus,refresh,workshop,exit', 'blocks run opening, nexus, refresh, workshop, exit in order');
  ok(p.workMin === 30, 'a 40-minute workshop leaves 30 minutes of work time between the 5-minute states');
  const lim = await pg.evaluate(() => xlChain.buildPlan({ opening: 'mindful', mindfulMin: 99, nexusMin: 99, workshopMin: 99, exitMin: 99 }));
  ok(lim.blocks[0].min === 5 && lim.blocks[1].min === 10 && lim.blocks[3].min === 40 && lim.blocks[4].min === 10, 'minutes are clamped to the stated maxima (mindful 5, nexus 10, workshop 40)');
  const lo = await pg.evaluate(() => xlChain.buildPlan({ opening: 'mindful', mindfulMin: 0 }));
  ok(lo.blocks[0].type === 'mindful' && lo.blocks[0].min >= 1, 'a mindful opening is at least one minute');
  ok((await pg.evaluate(() => xlChain.buildPlan({ opening: 'briefing', mindfulMin: 2 }))).blocks[0].min === 5, 'a Mission Briefing is always five minutes');
  ok(await pg.evaluate(() => xlChain.buildPlan({}).blocks[2].min === 10), 'the Checkpoint Refresh is always ten minutes');

  // 2. session object
  const s = await pg.evaluate(() => { const x = xlChain.buildSession({ title: '', opening: 'mindful', mindfulMin: 2, events: ['xc_boost', 'bogus'] }); return JSON.parse(JSON.stringify(x)); });
  ok(s.title === 'X-Live' && s.strictTimer === 'auto' && s.chain.totalMin === 2 + 10 + 10 + 40 + 5, 'session is titled X-Live, uses the auto-advance timer and records its planned length');
  ok(s.slides.length === 5 && s.slides.every(x => x.duration > 0 && x.duration === x.seconds), 'every slide carries its own duration in seconds');
  ok(s.slides[1].type === 'sub_app' && s.slides[1].subApp === 'arena', 'Nexus Frontiers block embeds the Battle Arena');
  ok(s.slides[3].type === 'project' && s.slides[3].duration === 2400 && s.slides[4].type === 'exit', "workshop is a Project Work slide of 40 minutes and the chain ends on an Exit Ticket");
  ok(s.sevPlan.length === 1 && s.sevPlan[0].type === 'xc_boost', 'unknown event types are dropped from the System Event plan');
  const total = await pg.evaluate((x) => xlRunOfShow(x).totalPlannedMs, s);
  ok(total === 67 * 60000, 'the existing run of show reads the chain as 67 planned minutes');

  // 3. builder UI
  await pg.evaluate(() => xlChain.open());
  ok(await pg.evaluate(() => /X-Live Session/.test(document.getElementById('modalBox').innerHTML) && document.querySelectorAll('.xc-ev input').length >= 8), 'the builder opens with a checkbox for each System Event');
  ok(await pg.evaluate(() => /Total <b>70 min/.test(document.getElementById('modalBox').innerHTML)), 'the builder shows the 70-minute total');
  await pg.selectOption('#xcTpl', 'full-mindful'); await pg.waitForSelector('#xcMind'); await pg.selectOption('#xcMind', '1'); await pg.selectOption('#xcWork', '30');
  await pg.check('.xc-ev input[value="xc_boost"]');
  ok(await pg.evaluate(() => /Total <b>56 min/.test(document.getElementById('modalBox').innerHTML)), 'changing the minutes updates the total (1 + 10 + 10 + 30 + 5 = 56)');
  ok(await pg.evaluate(() => document.querySelector('.xc-ev input[value="xc_boost"]').checked), 'ticked events survive the redraw');
  await pg.click('text=CREATE SESSION'); await pg.waitForFunction(() => !!L.liveEditingSession, { timeout: 6000, polling: 100 });
  ok(await pg.evaluate(() => !!L.liveEditingSession && L.liveEditingSession.chain && L.liveEditingSession.chain.totalMin === 56 && L.liveEditingSession.sevPlan[0].type === 'xc_boost'), 'CREATE opens the session in the editor with the chosen plan');

  // 4. whole-session System Events
  await pg.evaluate(() => { const x = L.liveEditingSession; L.liveEditingSession = null; x.id = 'CH1'; x.liveParticipants = L.roster.slice(0, 3).map(r => ({ id: r.id, brand: r.brand })); L.sessions = [x]; });
  await pg.evaluate(async () => { pflxActivateSession(L.sessions[0]); L.liveRunningSessionId = 'CH1'; xlChain.launchPlan(L.sessions[0]); });
  await pg.waitForFunction(() => (L.sessions[0].sevs || []).length === 1, { timeout: 9000, polling: 100 });
  const ev = await pg.evaluate(() => JSON.parse(JSON.stringify(L.sessions[0].sevs[0])));
  ok(ev.type === 'xc_boost' && ev.whole === true && ev.endsAt - ev.startedAt >= 8 * 3600000 - 1000, 'the planned event starts at GO LIVE and is marked whole-session');
  ok(await pg.evaluate(() => xlSev.activeOf(L.sessions[0]).length === 1), 'it counts as active during the session');
  await pg.evaluate(() => document.getElementById('xsSkip') && document.getElementById('xsSkip').click()); await pg.waitForTimeout(1200);
  ok(await pg.evaluate(() => /SESSION/.test((document.getElementById('xlSevBar') || {}).innerHTML || '')), 'the event bar shows SESSION instead of a countdown');
  await pg.waitForFunction(() => window.__kv.some(x => x[1].events && x[1].events.length === 1), { polling: 100, timeout: 5000 });
  ok(true, 'the game feed publishes the whole-session event');
  ok(await pg.evaluate(() => { const before = L.sessions[0].sevs.length; xlChain.launchPlan(L.sessions[0]); return L.sessions[0].sevs.length === before; }), 'the plan is launched once per session, not on every call');
  await pg.evaluate(() => { L.sessions[0].status = 'ended'; });
  ok(await pg.evaluate(() => xlSev.activeOf(L.sessions[0]).length === 0), 'the whole-session event stops counting when the session ends');
  await pg.evaluate(() => { L.sessions[0].status = 'active'; L.sessions[0].sevs[0].endedAt = null; xlChain.endWhole(L.sessions[0]); });
  ok(await pg.evaluate(() => !!L.sessions[0].sevs[0].endedAt), 'ending the session stamps the event as ended');
  await pg.evaluate(() => { L.sessions[0].sevs = []; L.sessions[0].status = 'active'; xlSev.launch('golden_hour', { mins: 5 }); });
  ok(await pg.evaluate(() => !L.sessions[0].sevs[0].whole && L.sessions[0].sevs[0].endsAt - Date.now() < 10 * 60000), 'a normal timed event is unchanged');
  await pg.evaluate(() => { xlSev.launch('system_tax', { mins: -1 }); });
  ok(await pg.evaluate(() => L.sessions[0].sevs.some(e => e.type === 'system_tax' && e.whole)), 'Length = Whole session works from the run panel');
  ok(await pg.evaluate(() => /Whole session/.test(xlSev.hostHtml())), 'the run panel offers Whole session as a length');

  // 5. hand-off banner
  await pg.evaluate(() => { const x = L.sessions[0]; x.chain = x.chain || { v: 1 }; x.currentSlideIndex = 0; window.xlViewerSession = () => L.sessions[0]; });
  await pg.waitForTimeout(1300); await pg.evaluate(() => { L.sessions[0].currentSlideIndex = 1; });
  await pg.waitForFunction(() => /NOW:/.test((document.getElementById('xlBanner') || {}).textContent || ''), { timeout: 4000, polling: 100 });
  ok(await pg.evaluate(() => /Nexus Frontiers/.test(document.getElementById('xlBanner').textContent)), 'moving to the next block flashes a NOW banner with its title');

  // 6. existing auto-advance engine moves the chain on
  const adv = await pg.evaluate(() => { const x = L.sessions[0]; return xlStrictMode(x) === 'auto' && xlSegSeconds(x.slides[1]) === x.slides[1].duration; });
  ok(adv, 'the chain uses the existing auto-advance engine and per-slide duration');
  // 7. real GO LIVE path launches the plan, button is on the Sessions screen
  await pg.evaluate(() => { L.sessions = []; L.liveRunningSessionId = null; L.liveEditingSession = null; L.screen = 'live'; render(); });
  ok(await pg.evaluate(() => /xlChain\.open\(\)/.test(document.getElementById('app').innerHTML)), 'the Sessions screen has the X-LIVE SESSION button');
  await pg.evaluate(() => { const x = xlChain.buildSession({ events: ['golden_hour'] }); x.id = 'CH2'; L.sessions = [x]; });
  await pg.evaluate(() => liveGoLiveSession('CH2'));
  await pg.waitForFunction(() => (L.sessions[0].sevs || []).some(e => e.type === 'golden_hour' && e.whole), { timeout: 9000, polling: 100 });
  ok(true, 'pressing GO LIVE on a planned session launches its whole-session event');
  ok(await pg.evaluate(() => L.sessions[0].status === 'active' && L.sessions[0].currentSlideIndex === 0 && !!L.sessions[0].showTimer), 'GO LIVE starts block one with its timer running');
  await pg.evaluate(() => liveEndSession());
  ok(await pg.evaluate(() => L.sessions[0].sevs.every(e => !e.whole || e.endedAt)), 'END SESSION stamps the whole-session events as ended');

  // 8. templates, checkpoint base, setups, Mission Control join
  const P = await pg.evaluate(() => xlChain.PRESETS.map(p => p.id).join());
  ok(P === 'full-briefing,full-mindful,workshop,encore', 'four session templates are offered');
  const wk = await pg.evaluate(() => xlChain.buildPlan({ preset: 'workshop' }));
  ok(wk.blocks.map(b => b.role).join() === 'refresh,workshop,exit' && wk.totalMin === 55, 'the workshop-block template is Refresh + Workshop + Exit (55 min)');
  const en = await pg.evaluate(() => { const x = xlChain.buildSession({ preset: 'encore', title: '' }); return JSON.parse(JSON.stringify(x)); });
  ok(en.title === 'Encore' && en.selfPaced === true && en.strictTimer === 'manual' && en.encore.mode === 'optional' && en.slides.length === 2 && en.slides.every(x => !(x.duration > 0)), 'the Encore template is self-paced: no host clock, optional mode, workshop then exit');
  ok(en.sevPlan.length === 0, 'an Encore carries no System Events');
  const cps = await pg.evaluate(() => xlChain.CPS.map(c => c.greek + ':' + c.n).join());
  ok(cps === 'Alpha:1,Beta:2,Gamma:3,Delta:4,Omicron:5,Sigma:6,Zeta:7,Nu:8,Psi:9,Omega:10', 'the locked base has ten checkpoints in Ennis’s order');
  ok(await pg.evaluate(() => xlChain.CPS.filter(c => /PushPoint/.test(c.xgem.join())).map(c => c.key).join() === 'zeta,nu' && xlChain.CPS[0].xgem[0] === 'CharacterForge' && xlChain.CPS[2].xgem[0] === 'ClientCall' && xlChain.CPS[3].xgem[0] === 'ThinkTable'), 'X-Gems match the outline (CharacterForge, ClientCall, ThinkTable, PushPoint at Zeta and Nu)');
  ok(await pg.evaluate(() => xlChain.CPS.every(c => c.act && c.actLabel && c.quests.length)), 'every checkpoint is tied to a campaign act and its quests');
  ok(await pg.evaluate(() => [['https://youtu.be/dQw4w9WgXcQ', 'youtube'], ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5', 'youtube'], ['https://drive.google.com/file/d/1AbC_dEf/view', 'drive'], ['https://example.com/x', 'other'], ['', '']].every(a => xlChain.parseVideo(a[0]).kind === a[1])), 'video links are recognised as YouTube, Drive or other');
  // mocked storage
  await pg.evaluate(() => { window.__db = { pflx_mc_checkpoints: { items: [
      { id: 'round-1', name: 'Checkpoint Alpha', status: 'completed', startDate: '2026-10-04', endDate: '2026-10-11' },
      { id: 'cp-g', name: 'Checkpoint Gamma', status: 'active', startDate: '2026-10-18', endDate: '2026-10-25' },
      { id: 'cp-o', name: 'Checkpoint Omega', status: 'upcoming', startDate: '2026-12-06', endDate: '2026-12-13' }] } };
    window.kvLoad = async k => (window.__db[k] ? JSON.parse(JSON.stringify(window.__db[k])) : null);
    window.kvSave = async (k, v) => { window.__db[k] = JSON.parse(JSON.stringify(v)); return true; }; xlChain.state.setups = null; xlChain.state.mc = null; });
  const mc = await pg.evaluate(async () => xlChain.loadMC(true));
  ok(mc.alpha.id === 'round-1' && mc.gamma.status === 'active' && Object.keys(mc).length === 3, 'Mission Control records are matched to the base by name');
  ok(await pg.evaluate(() => xlChain.activeKey({ alpha: { status: 'completed' }, gamma: { status: 'active' } }) === 'gamma'), 'the active checkpoint is the one Mission Control marks active');
  ok(await pg.evaluate(() => xlChain.activeKey({ alpha: { status: 'upcoming', startDate: '2026-10-11' }, beta: { status: 'upcoming', startDate: '2026-10-04' } }) === 'beta'), 'with nothing active it falls back to the soonest upcoming checkpoint');
  ok(await pg.evaluate(() => xlChain.activeKey({}) === null && xlChain.activeKey(null) === null), 'no records means no checkpoint is guessed');
  // setups editor
  await pg.evaluate(() => xlChain.openSetups('gamma'));
  await pg.waitForSelector('#xsLt');
  ok(await pg.evaluate(() => /Checkpoint Gamma/.test(document.getElementById('modalBox').innerHTML) && /active/.test(document.getElementById('modalBox').innerHTML) && /ClientCall/.test(document.getElementById('modalBox').innerHTML)), 'the editor shows the checkpoint, its X-Gem and the Mission Control status');
  await pg.fill('#xsLt', 'I can build an empathy map from a client interview.'); await pg.fill('#xsRecap', 'https://youtu.be/dQw4w9WgXcQ'); await pg.fill('#xsFull', 'https://drive.google.com/file/d/1AbC_dEf/view'); await pg.fill('#xsGuide', 'https://docs.google.com/document/d/abc');
  await pg.click('text=4 Delta'); await pg.waitForSelector('#xsLt');
  ok(await pg.evaluate(() => document.getElementById('xsLt').value === ''), 'switching checkpoint shows that checkpoint’s own fields');
  await pg.click('text=3 Gamma'); await pg.waitForSelector('#xsLt');
  ok(await pg.evaluate(() => document.getElementById('xsLt').value.startsWith('I can build') && /Google Drive videos play but cannot pause/.test(document.getElementById('modalBox').innerHTML) && /stops supported/.test(document.getElementById('modalBox').innerHTML)), 'edits survive switching tabs and the video notes are shown (YouTube stops, Drive warning)');
  await pg.click('text=SAVE SETUPS'); await pg.waitForFunction(() => window.__db.pflx_xlive_cp_setup, { timeout: 4000, polling: 100 });
  const sv = await pg.evaluate(() => window.__db.pflx_xlive_cp_setup);
  ok(sv.v === 1 && sv.items.gamma.learningTarget.startsWith('I can build') && sv.items.gamma.recap.id === 'dQw4w9WgXcQ' && sv.items.gamma.full.kind === 'drive' && sv.updatedAt > 0, 'setups save to pflx_xlive_cp_setup with parsed video ids');
  ok(await pg.evaluate(() => !window.__db.pflx_mc_checkpoints.items.some(c => c.sessionSetup || c.setup)), 'the Mission Control checkpoint records are untouched');
  ok(await pg.evaluate(() => !('pflx_mc_checkpoints_written' in window) && Object.keys(window.__db).sort().join() === 'pflx_mc_checkpoints,pflx_xlive_cp_setup'), 'only the X-Live setup key was written');
  // building on a checkpoint
  const gs = await pg.evaluate(async () => { xlChain.state.setups = null; const setups = await xlChain.loadSetups(true); const cp = xlChain.merge(setups, await xlChain.loadMC()).find(c => c.key === 'gamma'); const x = xlChain.buildSession({ cpMode: 'gamma' }, null, cp); return JSON.parse(JSON.stringify(x)); });
  ok(gs.checkpoint === 'gamma' && gs.campaign.act === 'act2' && gs.campaign.quests.includes('a2-cp3'), 'a session on Gamma carries Checkpoint Gamma and Act Two’s quests');
  ok(/Learning target: I can build an empathy map/.test(gs.slides[0].prompt) && /Act Two/.test(gs.slides[0].prompt) && /ClientCall/.test(gs.slides[0].prompt), 'the briefing shows the checkpoint, learning target, campaign act and X-Gem');
  ok(/youtu\.be\/dQw4w9WgXcQ/.test(gs.slides[2].prompt) && /drive\.google\.com/.test(gs.slides[2].prompt) && gs.slides[2].refresh.recap.id === 'dQw4w9WgXcQ' && gs.slides[2].cp === 'gamma', 'the Refresh slide lists the guide and both videos and carries them as data');
  ok(/Learning target: I can build an empathy map/.test(gs.slides[4].prompt), 'the Exit Ticket asks about the learning target');
  const again = await pg.evaluate((x) => { const cp = xlChain.merge({}, {}).find(c => c.key === 'omicron'); xlChain.applyCheckpoint(x, cp); xlChain.applyCheckpoint(x, cp); return JSON.parse(JSON.stringify(x)); }, gs);
  ok(again.checkpoint === 'omicron' && !/Gamma/.test(again.slides[0].prompt) && (again.slides[3].prompt.match(/Daily Growth Log/g) || []).length === 1 && /3 or more entries/.test(again.slides[3].prompt), 're-applying a checkpoint replaces the text instead of stacking it, and Omicron asks for 3 growth-log entries');
  ok(await pg.evaluate(() => { const c = xlChain.merge({}, {}); return c.find(x => x.key === 'zeta').feedforward === 3 && c.find(x => x.key === 'alpha').feedforward === 0; }), 'FeedForward defaults to 3 on Zeta and 0 on Alpha');
  // follow Mission Control
  await pg.evaluate(() => { window.__db.pflx_mc_checkpoints.items[1].status = 'completed'; window.__db.pflx_mc_checkpoints.items[2].status = 'active'; window.__db.pflx_mc_checkpoints.items[2].name = 'Checkpoint Omega'; window.__db.pflx_mc_checkpoints.items[0].status = 'completed'; window.__db.pflx_mc_checkpoints.items[2].startDate = '2026-12-06'; });
  const fl = await pg.evaluate(async () => { const x = xlChain.buildSession({ cpMode: 'mc' }, null, null); x.id = 'FM'; L.sessions = [x]; window.saveSession = async s => s; const cp = await xlChain.followMC(x); return { key: cp && cp.key, sess: x.checkpoint, link: x.mcLink, p: x.slides[0].prompt }; });
  ok(fl.key === 'omega' && fl.sess === 'omega' && fl.link === true && /Checkpoint Omega/.test(fl.p), 'a session that follows Mission Control adopts the active checkpoint at GO LIVE time');
  ok(await pg.evaluate(async () => (await xlChain.followMC({ mcLink: false })) === null), 'a session that does not follow Mission Control is left alone');
  // the button and the creation flow with a checkpoint
  await pg.evaluate(() => { L.sessions = []; L.liveEditingSession = null; L.screen = 'live'; render(); });
  ok(await pg.evaluate(() => /xlChain\.openSetups\(\)/.test(document.getElementById('app').innerHTML)), 'the Sessions screen has the CHECKPOINT SETUPS button');
  await pg.evaluate(() => xlChain.open()); await pg.selectOption('#xcCp', 'gamma'); await pg.selectOption('#xcTpl', 'workshop');
  ok(await pg.evaluate(() => /Total <b>55 min/.test(document.getElementById('modalBox').innerHTML) && !document.getElementById('xcNexus')), 'choosing the workshop template hides the game block and shows 55 minutes');
  await pg.click('text=CREATE SESSION'); await pg.waitForFunction(() => !!L.liveEditingSession, { timeout: 6000, polling: 100 });
  ok(await pg.evaluate(() => L.liveEditingSession.checkpoint === 'gamma' && L.liveEditingSession.chain.preset === 'workshop' && L.liveEditingSession.slides.length === 3), 'CREATE builds the chosen template on the chosen checkpoint');
  await pg.evaluate(() => { L.liveEditingSession = null; xlChain.open(); }); await pg.selectOption('#xcTpl', 'encore');
  ok(await pg.evaluate(() => /Self-paced/.test(document.getElementById('modalBox').innerHTML) && !document.querySelector('.xc-ev')), 'the Encore template shows self-paced and no System Events');
  console.log('errors:', errs.length ? errs : 'none'); await br.close(); if (errs.length) process.exit(2); process.exit(0);
})().catch(e => { console.error('CHAIN FAIL', e); process.exit(1); });
