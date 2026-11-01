/* PFLX Gamepad — PS5 DualSense, DualShock, Backbone, Xbox and other standard controllers.
 * One file, no dependencies. Shared by Platform, Battle Arena, Nexus Frontiers, Core Pathways and X-Live.
 * Does nothing until a controller is connected and a button is pressed.
 *
 * Menu mode (default): d-pad / left stick move a highlight between buttons, links and fields,
 *   Cross/A selects, Circle/B goes back (sends Escape), right stick scrolls, L1/R1 = Shift+Tab / Tab.
 * Apps can take over: PFLXPad.menuWhen = () => false  (e.g. while a game is running)
 *   PFLXPad.on('down', (name, pad) => {...})   PFLXPad.stick() -> {x, y, rx, ry}
 *   PFLXPad.glyph('a') -> '✕' or 'A'      PFLXPad.rumble(strong, weak, ms)
 * Button names: a b x y l1 r1 l2 r2 select start l3 r3 up down left right home
 */
(function () {
  'use strict';
  if (window.PFLXPad) return;
  var NAMES = ['a', 'b', 'x', 'y', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'l3', 'r3', 'up', 'down', 'left', 'right', 'home'];
  var GLYPH = {
    ps: { a: '✕', b: '○', x: '□', y: '△', l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', select: 'Create', start: 'Options', up: '↑', down: '↓', left: '←', right: '→', home: 'PS' },
    xbox: { a: 'A', b: 'B', x: 'X', y: 'Y', l1: 'LB', r1: 'RB', l2: 'LT', r2: 'RT', select: 'View', start: 'Menu', up: '↑', down: '↓', left: '←', right: '→', home: 'Home' }
  };
  var DEAD = 0.28, REPEAT_FIRST = 380, REPEAT_NEXT = 130;
  var api = {
    connected: false, family: 'xbox', name: '', active: false,
    menuWhen: null, extraSelector: '', listeners: { down: [], up: [], connect: [], disconnect: [] },
    on: function (ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); return fn; },
    off: function (ev, fn) { var l = this.listeners[ev] || []; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    glyph: function (n) { return (GLYPH[this.family] || GLYPH.xbox)[n] || n.toUpperCase(); },
    stick: function () { return { x: st.lx, y: st.ly, rx: st.rx, ry: st.ry }; },
    held: function (n) { return !!st.held[n]; },
    rumble: function (strong, weak, ms) {
      var p = livePad(); if (!p) return;
      try {
        var a = p.vibrationActuator;
        if (a && a.playEffect) a.playEffect(a.type === 'dual-rumble' || !a.type ? 'dual-rumble' : a.type, { duration: ms || 160, strongMagnitude: Math.min(1, strong || 0.6), weakMagnitude: Math.min(1, weak == null ? 0.4 : weak) }).catch(function () {});
        else if (p.hapticActuators && p.hapticActuators[0]) p.hapticActuators[0].pulse(Math.min(1, strong || 0.6), ms || 160);
      } catch (e) {}
    },
    menuMove: function (dir) { return move(dir); },
    focused: function () { return cur; }
  };
  window.PFLXPad = api;

  var st = { idx: -1, prev: [], held: {}, lx: 0, ly: 0, rx: 0, ry: 0, rep: {}, raf: 0 };
  var cur = null; // element highlighted by menu mode

  function familyOf(id) {
    id = String(id || '');
    if (/054c|dualsense|dualshock|playstation|ps5|ps4|wireless controller/i.test(id)) return 'ps';
    return 'xbox'; // Backbone (standard edition), Xbox, 8BitDo, Switch Pro in standard mode all use A/B/X/Y positions
  }
  function pads() { try { return navigator.getGamepads ? Array.prototype.slice.call(navigator.getGamepads()) : []; } catch (e) { return []; } }
  function livePad() { var l = pads(); return (st.idx >= 0 && l[st.idx]) || l.filter(Boolean)[0] || null; }
  function emit(ev, a, b) { (api.listeners[ev] || []).slice().forEach(function (fn) { try { fn(a, b); } catch (e) { console.warn('[PFLXPad]', e); } }); }
  function dz(v) { v = +v || 0; return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD); }

  function setConnected(p) {
    var was = api.connected, oldId = api.name;
    api.connected = !!p;
    if (p) { st.idx = p.index; api.name = p.id; api.family = familyOf(p.id); }
    var de = document.documentElement;
    if (de) { de.classList.toggle('pflx-pad', api.connected); if (api.connected) de.setAttribute('data-pflx-pad-family', api.family); else de.removeAttribute('data-pflx-pad-family'); }
    if (api.connected && (!was || p.id !== oldId)) { emit('connect', api.family, p); start(); }
    if (!api.connected && was) { emit('disconnect'); clearCur(); }
  }

  addEventListener('gamepadconnected', function (e) { setConnected(e.gamepad); });
  addEventListener('gamepaddisconnected', function () { var l = pads().filter(Boolean); setConnected(l[0] || null); });

  function start() { if (!st.raf) st.raf = requestAnimationFrame(tick); }
  function tick() {
    st.raf = 0;
    var p = livePad();
    if (!p) { if (api.connected) setConnected(null); return; }
    if (!api.connected) setConnected(p);
    var b = p.buttons || [], ax = p.axes || [], now = performance.now();
    var mapped = p.mapping === 'standard' || b.length >= 16;
    st.lx = dz(ax[0]); st.ly = dz(ax[1]); st.rx = dz(ax[2]); st.ry = dz(ax[3]);
    var downNow = {};
    for (var i = 0; i < NAMES.length && i < b.length; i++) { var bt = b[i]; downNow[NAMES[i]] = !!(bt && (bt.pressed || bt.value > 0.5)); }
    if (!mapped && ax.length >= 8) { downNow.left = ax[6] < -0.5; downNow.right = ax[6] > 0.5; downNow.up = ax[7] < -0.5; downNow.down = ax[7] > 0.5; }
    // stick as d-pad for navigation repeats
    var nav = { up: downNow.up || st.ly < -0.55, down: downNow.down || st.ly > 0.55, left: downNow.left || st.lx < -0.55, right: downNow.right || st.lx > 0.55 };
    NAMES.forEach(function (n) {
      var d = downNow[n], was = !!st.held[n];
      if (d && !was) { api.active = true; emit('down', n, p); if (menuOn()) menuPress(n); }
      if (!d && was) emit('up', n, p);
      st.held[n] = d;
    });
    // menu navigation with auto-repeat (d-pad or left stick)
    if (menuOn()) {
      ['up', 'down', 'left', 'right'].forEach(function (dir) {
        var on = nav[dir], r = st.rep[dir];
        if (!on) { st.rep[dir] = 0; return; }
        if (!r) { st.rep[dir] = now + REPEAT_FIRST; api.active = true; move(dir); }
        else if (now >= r) { st.rep[dir] = now + REPEAT_NEXT; move(dir); }
      });
      if (Math.abs(st.ry) > 0 || Math.abs(st.rx) > 0) scrollBy(st.rx * 18, st.ry * 22);
    } else { st.rep = {}; if (cur) clearCur(); }
    st.raf = requestAnimationFrame(tick);
  }

  // ── Menu mode ────────────────────────────────────────────────────────────
  function menuOn() {
    if (!api.connected) return false;
    if (typeof api.menuWhen === 'function') { try { if (!api.menuWhen()) return false; } catch (e) { return false; } }
    if (document.hidden) return false;
    // an app frame covering the screen owns the controller
    var a = document.activeElement; if (a && a.tagName === 'IFRAME' && visible(a)) return false;
    var c = coverFrame(); if (c) { if (document.activeElement !== c) { try { c.focus(); } catch (e) {} } return false; }
    return true;
  }
  function coverFrame() {
    var w = innerWidth, h = innerHeight; if (!w || !h) return null;
    var el = document.elementFromPoint(w / 2, h / 2);
    if (el && el.tagName === 'IFRAME') { var r = el.getBoundingClientRect(); if (r.width * r.height > w * h * 0.5) return el; }
    return null;
  }
  var SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role=button], [role=tab], [role=option], [role=menuitem], [onclick], [data-pad-nav]';
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    var cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0 || cs.pointerEvents === 'none') return false;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-hidden') === 'true') return false;
    return true;
  }
  function onTop(el) { // not covered by an overlay or modal
    var r = el.getBoundingClientRect();
    var x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    var hit = document.elementFromPoint(x, y);
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  }
  function candidates() {
    var sel = SEL + (api.extraSelector ? ', ' + api.extraSelector : '');
    var out = [], seen = new Set(), list = Array.prototype.slice.call(document.querySelectorAll(sel));
    // cards and tiles wired up with el.onclick = … in script (no attribute to select on)
    var all = document.body ? document.body.getElementsByTagName('*') : [];
    for (var i = 0; i < all.length; i++) { var e = all[i]; if (e.hasAttribute('onclick') || /^(BUTTON|A|INPUT|SELECT|TEXTAREA|BODY|HTML|CANVAS|IFRAME|SCRIPT|STYLE)$/.test(e.tagName)) continue; var h = null; try { h = e.onclick; } catch (x) {} if (typeof h === 'function') list.push(e); }
    list.forEach(function (el) {
      if (seen.has(el)) return;
      // skip a child when its clickable parent is already a candidate
      var p = el.parentElement && el.parentElement.closest && el.parentElement.closest('button, a[href], [role=button]'); if (p) return;
      if (visible(el) && onTop(el)) { seen.add(el); out.push(el); }
    });
    return out;
  }
  function centre(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function move(dir) {
    var list = candidates(); if (!list.length) return false;
    if (!cur || !document.contains(cur) || list.indexOf(cur) < 0) {
      var a = document.activeElement; if (a && list.indexOf(a) >= 0) return setCur(a), true;
      list.sort(function (p, q) { var rp = p.getBoundingClientRect(), rq = q.getBoundingClientRect(); return (rp.top - rq.top) * 3 + (rp.left - rq.left); });
      setCur(list[0]); return true;
    }
    var r0 = cur.getBoundingClientRect(), c0 = centre(r0), best = null, bs = Infinity;
    list.forEach(function (el) {
      if (el === cur) return;
      var r = el.getBoundingClientRect(), c = centre(r), dx = c.x - c0.x, dy = c.y - c0.y, main, side;
      if (dir === 'right') { if (r.left < r0.right - 4 && dx <= 4) return; main = dx; side = Math.abs(dy); }
      else if (dir === 'left') { if (r.right > r0.left + 4 && dx >= -4) return; main = -dx; side = Math.abs(dy); }
      else if (dir === 'down') { if (r.top < r0.bottom - 4 && dy <= 4) return; main = dy; side = Math.abs(dx); }
      else { if (r.bottom > r0.top + 4 && dy >= -4) return; main = -dy; side = Math.abs(dx); }
      if (main <= 0) return;
      var s = main + side * 2.2; if (s < bs) { bs = s; best = el; }
    });
    if (best) { setCur(best); return true; }
    // nothing on screen that way: scroll the page a little
    scrollBy(dir === 'left' ? -120 : dir === 'right' ? 120 : 0, dir === 'up' ? -160 : dir === 'down' ? 160 : 0);
    return false;
  }
  function setCur(el) {
    if (cur && cur !== el) cur.classList.remove('pflx-pad-focus');
    cur = el; el.classList.add('pflx-pad-focus');
    try { el.focus({ preventScroll: true }); } catch (e) {}
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
    emit('focus', el);
  }
  function clearCur() { if (cur) cur.classList.remove('pflx-pad-focus'); cur = null; }
  function key(k) {
    var t = document.activeElement || document.body;
    var o = { key: k, code: k === 'Escape' ? 'Escape' : k === 'Tab' ? 'Tab' : k, bubbles: true, cancelable: true };
    t.dispatchEvent(new KeyboardEvent('keydown', o)); t.dispatchEvent(new KeyboardEvent('keyup', o));
  }
  function scrollBy(dx, dy) {
    var el = cur || document.activeElement || document.body, s = el;
    while (s && s !== document.body && s !== document.documentElement) {
      var cs = getComputedStyle(s);
      if ((/(auto|scroll)/.test(cs.overflowY) && s.scrollHeight > s.clientHeight + 2) || (/(auto|scroll)/.test(cs.overflowX) && s.scrollWidth > s.clientWidth + 2)) { s.scrollBy(dx, dy); return; }
      s = s.parentElement;
    }
    window.scrollBy(dx, dy);
  }
  function menuPress(n) {
    if (n === 'a') {
      if (!cur || !document.contains(cur) || !visible(cur)) { move('down'); return; }
      var t = cur.tagName;
      if (t === 'INPUT' && /^(checkbox|radio)$/i.test(cur.type)) cur.click();
      else if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') { cur.focus(); if (t === 'SELECT' && cur.showPicker) try { cur.showPicker(); } catch (e) {} }
      else cur.click();
      api.rumble(0.15, 0.25, 50);
    } else if (n === 'b') back();
    else if (n === 'r1' || n === 'l1') { // next / previous item in reading order
      var l = candidates(); if (!l.length) return;
      l.sort(function (p, q) { var rp = p.getBoundingClientRect(), rq = q.getBoundingClientRect(); return Math.abs(rp.top - rq.top) > 8 ? rp.top - rq.top : rp.left - rq.left; });
      var i = l.indexOf(cur); setCur(l[(i < 0 ? 0 : i + (n === 'r1' ? 1 : l.length - 1)) % l.length]);
    }
  }
  // ○/B: send Escape; if the page did nothing with it, press a visible Back / Close / Cancel button instead
  var BACK_RE = /^\s*(?:[←‹<]\s*)?(back|close|cancel|done|not now|✕|×|x)\s*$/i;
  function back() {
    var before = candidates();
    var o = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    var t = document.activeElement || document.body, ev = new KeyboardEvent('keydown', o);
    t.dispatchEvent(ev); t.dispatchEvent(new KeyboardEvent('keyup', o));
    setTimeout(function () {
      if (ev.defaultPrevented) return;
      var after = candidates();
      var same = after.length === before.length && after.every(function (el, i) { return el === before[i]; });
      if (!same) return; // Escape closed or changed something
      var btn = after.filter(function (el) { return BACK_RE.test(el.getAttribute('aria-label') || el.textContent || ''); })[0];
      if (btn) btn.click();
    }, 120);
  }

  // highlight style + on-screen controller badge
  function css() {
    if (document.getElementById('pflx-pad-css')) return;
    var s = document.createElement('style'); s.id = 'pflx-pad-css';
    s.textContent = '.pflx-pad-focus{outline:3px solid var(--pflx-pad-ring,#00e5ff)!important;outline-offset:3px!important;box-shadow:0 0 0 6px rgba(0,229,255,.18),0 0 22px rgba(0,229,255,.55)!important;transition:outline-color .1s}' +
      '#pflx-pad-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483646;background:rgba(4,8,14,.92);color:#e6faff;border:1px solid rgba(0,229,255,.55);border-radius:12px;padding:10px 16px;font:600 13px/1.3 system-ui,sans-serif;letter-spacing:.02em;box-shadow:0 8px 30px rgba(0,0,0,.5);pointer-events:none;opacity:0;transition:opacity .25s}' +
      '#pflx-pad-toast.on{opacity:1}#pflx-pad-toast b{color:#00e5ff}';
    (document.head || document.documentElement).appendChild(s);
  }
  function toast(html) {
    if (!document.body) return; css();
    var t = document.getElementById('pflx-pad-toast');
    if (!t) { t = document.createElement('div'); t.id = 'pflx-pad-toast'; document.body.appendChild(t); }
    t.innerHTML = html; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 3200);
  }
  api.toast = toast;
  api.on('connect', function (fam) {
    css();
    if (api.quiet) return;
    var g = function (n) { return '<b>' + api.glyph(n) + '</b>'; };
    var nm = fam === 'ps' ? 'PlayStation controller' : /backbone/i.test(api.name) ? 'Backbone' : 'Controller';
    toast('🎮 ' + nm + ' connected — ' + g('a') + ' select · ' + g('b') + ' back · stick or d-pad to move');
  });
  // a controller already paired before the page loaded shows up after any button press (browser privacy rule)
  setTimeout(function () { var l = pads().filter(Boolean); if (l[0]) setConnected(l[0]); }, 0);
})();
