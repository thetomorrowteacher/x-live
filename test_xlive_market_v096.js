const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/^https?:/, r => r.abort());
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('PASS', m); };
  await pg.goto('file://' + path.join(__dirname, '..', 'index.html')); await pg.waitForFunction(() => window.xlSev && window.PflxMarket && typeof L !== 'undefined' && L.cfg, { polling: 100 });
  await pg.evaluate(() => {
    const MODS = [{ id: 'upg-1', type: 'upgrade', name: 'Chrono Extend Booster', description: 'Extend any task deadline by 72 hours.', costXcoin: 1500, duration: 'single-use', autoApply: true, triggerEvent: 'manual', effectType: 'deadline_extend', effectValue: 72, scope: 'all' }, { id: 'tax-1', type: 'tax', name: 'Task Deviation', description: 'Lack of progress', costXcoin: 100, duration: 'immediate', effectType: 'xc_deduct', effectValue: 100, scope: 'task' }];
    const GAME = { v: 1, items: [{ key: 'aegis', name: 'Aegis Shell', desc: 'Blocks 2 hits', icon: '🛡', price: 20, tier: 1, tierLabel: 'Mk I', fires: true, effect: 'Block hits' }] };
    window.kvLoad = async k => ({ modifiers: MODS, pflx_market_game: GAME }[k] || null);
    L.market = MODS.filter(m => m.type === 'upgrade'); L.cfg.upgrades = [{ id: 'up-1', label: 'Music Picker', desc: 'Pick the class music', cost: 500, icon: '🎵' }, { id: 'up-2', label: 'Front of the Line', desc: '', cost: 300, icon: '🎟' }];
    const me = L.roster[0]; me.xc = 5000; L.me = { id: me.id, brand: me.brand }; L.isHost = false; L.realIsHost = false; window.postAward = () => {}; window.liteLog = async () => {};
    window.__sent = []; Object.defineProperty(window, 'parent', { value: { postMessage: m => window.__sent.push(m) }, configurable: true });
    L.screen = 'shop'; render();
  });
  await pg.waitForFunction(() => document.querySelectorAll('#xm-root .pm-tab').length === 5, { polling: 100 });
  await pg.waitForTimeout(400);
  const txt = () => pg.evaluate(() => document.getElementById('xm-root').innerText); const cnt = s => pg.evaluate(x => document.querySelectorAll(x).length, s);
  ok(await cnt('#xm-root .pm-tab') === 5, 'player Marketplace has the five tabs');
  ok(!(await pg.evaluate(() => document.body.innerText)).includes('GAME UPGRADES'), 'the old "GAME UPGRADES from X-Coin" section is gone');
  ok(await cnt('#xm-root .pm-card') === 2 && await cnt('#xm-root .pm-btn.buy') === 2, 'X-Live opens on the Session tab: 2 session cards, both buyable here');
  await pg.click('#xm-root .pm-btn.buy'); await pg.waitForTimeout(150);
  ok((await pg.evaluate(() => document.getElementById('modalBox').textContent)).includes('Redeem Music Picker?'), 'buying a session upgrade opens the existing redeem confirmation');
  await pg.evaluate(() => modalClose());
  await pg.evaluate(() => document.querySelectorAll('#xm-root .pm-tab')[1].click());
  ok(await cnt('#xm-root .pm-btn.buy') === 1 && (await txt()).includes('Chrono Extend Booster'), 'Platform tab: X-Coin upgrade is buyable from X-Live');
  await pg.click('#xm-root .pm-btn.buy'); await pg.waitForTimeout(150);
  ok((await pg.evaluate(() => document.getElementById('modalBox').textContent)).includes('Buy Chrono Extend Booster?'), 'platform buy uses the existing X-Live confirm flow');
  await pg.evaluate(() => modalClose());
  await pg.evaluate(() => document.querySelectorAll('#xm-root .pm-tab')[2].click());
  ok((await txt()).includes('BUY IN BATTLE ARENA') && await cnt('#xm-root .pm-btn.buy') === 0, 'Game tab: Aegis Shell shows BUY IN BATTLE ARENA, no buy here');
  await pg.click('#xm-root .pm-btn.go');
  ok(await pg.evaluate(() => { const m = JSON.parse(window.__sent[window.__sent.length - 1]); return m.type === 'pflx_open_app' && m.app === 'arena' && m.tab === 'game' && m.itemId === 'aegis'; }), 'jump posts pflx_open_app {arena, game, aegis} to the Console');
  await pg.evaluate(() => document.querySelectorAll('#xm-root .pm-tab')[4].click());
  ok(await cnt('#xm-root .pm-card') === 1 && await cnt('#xm-root .pm-btn') === 0, 'Taxes & Fines: visible, read-only');
  // Market Crash doubles session prices
  await pg.evaluate(() => { document.querySelectorAll('#xm-root .pm-tab')[3].click(); window.priceMult = undefined; });
  const p0 = await txt();
  ok(p0.includes('500 XC'), 'session price shown at base 500 XC');
  // Market Crash still doubles session prices in the shared cards
  await pg.evaluate(() => { window.xlViewerSession = () => window.__crashSess; window.__crashSess = { id: 'S1', status: 'active', sevs: [{ id: 'e1', type: 'market_crash', name: 'Market Crash', icon: '📉', mult: 2, startedAt: Date.now(), endsAt: Date.now() + 300000 }] }; document.querySelectorAll('#xm-root .pm-tab')[3].click(); L.screen = 'shop'; render(); });
  await pg.waitForTimeout(150);
  ok((await txt()).includes('1,000 XC') && (await pg.evaluate(() => document.querySelector('#xm-root .pm-btn.buy').textContent)).includes('1,000'), 'Market Crash doubles session upgrade prices on the shared cards (500 → 1,000 XC)');
  await pg.evaluate(() => { window.__crashSess = null; });
  // message hook
  await pg.evaluate(() => { L.screen = 'me'; render(); window.postMessage(JSON.stringify({ type: 'pflx_market_open', tab: 'tax' }), '*'); });
  await pg.waitForFunction(() => L.screen === 'shop', { polling: 100 }); await pg.waitForTimeout(200);
  ok(await pg.evaluate(() => Object.values(PflxMarket._mounts)[0].tab) === 'tax', 'pflx_market_open opens the Marketplace on the requested tab');
  // local edits show without a reload
  await pg.evaluate(() => { L.cfg.upgrades.push({ id: 'up-3', label: 'Brand New', desc: '', cost: 100, icon: '🆕' }); document.querySelectorAll('#xm-root .pm-tab')[3].click(); L.screen = 'shop'; render(); });
  await pg.waitForTimeout(150);
  ok((await txt()).includes('Brand New'), 'a session upgrade added by the host shows immediately (local state wins over the cached read)');
  // host
  await pg.evaluate(() => { L.isHost = true; L.realIsHost = true; L.hostCapabilities = null; L.screen = 'shop'; render(); });
  await pg.waitForTimeout(200);
  ok((await pg.evaluate(() => document.querySelector('.tabbar').innerText)).includes('MARKETPLACE'), 'the Host Dashboard has a Marketplace tab');
  ok(await cnt('#xm-root .pm-btn.buy') === 0 && await cnt('#xm-root .pm-btn.go') === 0 && await cnt('#xm-root .pm-btn.edit') === 3, 'host: no buy buttons, Edit on each session upgrade');
  await pg.click('#xm-root .pm-btn.edit'); await pg.waitForTimeout(150);
  ok((await pg.evaluate(() => document.getElementById('modalBox').textContent)).includes('Edit session upgrade'), 'host Edit opens the existing session-upgrade editor');
  await pg.evaluate(() => modalClose()); await pg.evaluate(() => document.querySelectorAll('#xm-root .pm-tab')[1].click());
  ok((await txt()).includes('Edit in X-Coin'), 'host sees "Edit in X-Coin" on a platform card');
  await pg.screenshot({ path: '/home/claude/pm/shots_xlive_host.png' });
  console.log(n + ' passed; errors:', errs.length ? errs : 'none'); await br.close(); if (errs.length) process.exit(2);
})().catch(e => { console.error('MARKET_XL FAIL', e.message); process.exit(1); });
