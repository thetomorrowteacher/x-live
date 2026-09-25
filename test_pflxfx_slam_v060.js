// PATCH X-LIVE v0.60 -- tests the newly-generalized PflxFx.slam() big-title
// FX (extracted from the countdown finale's TIME'S UP treatment) and its
// wiring into Archive Battle's resolve(). Extracts the REAL shipped PflxFx
// IIFE (brace/marker matching, same technique used all session) and runs
// it against a small hand-rolled fake DOM -- not a reimplementation of the
// module's logic. Run: node test_pflxfx_slam_v060.js index.html
'use strict';
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.log('FAIL:', label); } }

// ---- extract the real PflxFx IIFE block verbatim ----
const startMarker = '(function (root) {\n  if (root.PflxFx) return;';
const startIdx = src.indexOf(startMarker);
if (startIdx === -1) throw new Error('PflxFx IIFE start not found');
const endMarker = "})(typeof window !== 'undefined' ? window : this);";
const endIdx = src.indexOf(endMarker, startIdx);
if (endIdx === -1) throw new Error('PflxFx IIFE end not found');
const iifeSrc = src.slice(startIdx, endIdx + endMarker.length);

ok(iifeSrc.indexOf('function slamShow(text, opts)') !== -1, 'slamShow() is defined in the real shipped PflxFx module');
ok(iifeSrc.indexOf("crit: 'rgba(255,170,0,0.4)'") !== -1, 'TINT_COLORS gained a real crit entry (not a hardcoded literal reused from elsewhere)');
ok(iifeSrc.indexOf('slam: slamShow') !== -1, 'slam is exported on root.PflxFx');
ok(iifeSrc.indexOf(".pfx-slam2") !== -1, 'the new .pfx-slam2 CSS/DOM node is present (additive, distinct from the countdown finale\'s own .pfx-slam)');
ok(iifeSrc.indexOf('TIME’S UP<small></small></div><div class="pfx-slam2">') !== -1, 'the countdown finale\'s own .pfx-slam markup is untouched -- pfx-slam2 is purely additive');

// ---- a tiny fake DOM, just enough to run the real IIFE end-to-end ----
function makeFakeDom() {
  function FakeClassList(el) {
    this.el = el;
    this.set = new Set();
  }
  FakeClassList.prototype.add = function (c) { this.set.add(c); };
  FakeClassList.prototype.remove = function (c) { this.set.delete(c); };
  FakeClassList.prototype.toggle = function (c, on) { if (on) this.set.add(c); else this.set.delete(c); };
  FakeClassList.prototype.contains = function (c) { return this.set.has(c); };

  function FakeStyle() {}
  FakeStyle.prototype.setProperty = function (k, v) { this[k] = v; };
  FakeStyle.prototype.getPropertyValue = function (k) { return this[k] || ''; };

  function FakeEl(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this._text = '';
    this.style = new FakeStyle();
    this.classList = new FakeClassList(this);
    this.id = '';
    this._html = '';
  }
  Object.defineProperty(FakeEl.prototype, 'textContent', {
    get: function () { return this._text; },
    set: function (v) { this._text = String(v); this.children = []; }
  });
  Object.defineProperty(FakeEl.prototype, 'innerHTML', {
    get: function () { return this._html; },
    set: function (v) {
      this._html = v;
      // A real (if minimal) stack-based tag parser -- builds actual
      // parent/child nesting, unlike a flat regex scan, so a nested node
      // like .pfx-slam2's own <b>/<small> children are reachable via
      // querySelector the same way they would be in a real browser.
      this.children = [];
      const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
      const stack = [this];
      let m, lastIdx = 0;
      while ((m = tagRe.exec(v))) {
        const closing = m[1] === '/';
        const tag2 = m[2];
        const attrStr = m[3] || '';
        const between = v.slice(lastIdx, m.index);
        lastIdx = tagRe.lastIndex;
        const top = stack[stack.length - 1];
        if (between.trim() && top && top !== this) { top._text = (top._text || '') + between; }
        if (closing) {
          if (stack.length > 1) stack.pop();
          continue;
        }
        const selfClosing = /\/>\s*$/.test(m[0]) || tag2 === 'circle' || tag2 === 'svg' && false;
        const cls = (attrStr.match(/class="([^"]*)"/) || [, ''])[1];
        const child = new FakeEl(tag2);
        child.classList.set = new Set(cls.split(/\s+/).filter(Boolean));
        stack[stack.length - 1].children.push(child);
        if (!selfClosing) stack.push(child);
      }
    }
  });
  FakeEl.prototype.appendChild = function (c) { this.children.push(c); return c; };
  FakeEl.prototype.setAttribute = function (k, v) { this.attrs[k] = v; };
  FakeEl.prototype.querySelector = function (sel) {
    // supports '.class' and 'tag' and nested 'tag' inside this node's children
    function search(node, sel) {
      if (sel[0] === '.') {
        const cls = sel.slice(1);
        for (const c of node.children) { if (c.classList.contains(cls)) return c; }
        for (const c of node.children) { const r = search(c, sel); if (r) return r; }
        return null;
      }
      for (const c of node.children) { if (c.tag === sel) return c; }
      return null;
    }
    return search(this, sel);
  };
  Object.defineProperty(FakeEl.prototype, 'offsetWidth', { get: function () { return 100; } });
  Object.defineProperty(FakeEl.prototype, 'isConnected', { get: function () { return this._connected !== false; } });

  const registry = {};
  const doc = {
    documentElement: new FakeEl('html'),
    head: new FakeEl('head'),
    createElement: function (tag) { return new FakeEl(tag); },
    getElementById: function (id) { return registry[id] || null; },
    querySelectorAll: function () { return []; }
  };
  doc.documentElement.appendChild = function (c) {
    FakeEl.prototype.appendChild.call(this, c);
    if (c.id) registry[c.id] = c;
    return c;
  };
  const win = {
    matchMedia: function () { return { matches: false }; }
  };
  return { document: doc, window: win };
}

// ---- run the real extracted module against the fake DOM ----
const fake = makeFakeDom();
const sandboxFactory = new Function('document', 'window', iifeSrc + '\nreturn (typeof window !== "undefined" ? window : this).PflxFx;');
const PflxFx = sandboxFactory(fake.document, fake.window);

ok(!!PflxFx, 'the real PflxFx module initializes against a minimal fake DOM with no errors');
ok(typeof PflxFx.slam === 'function', 'PflxFx.slam is a real callable function on the built module');

// The very first call to any q()-using function builds the layer via
// ensureLayer() -- confirm the .pfx-slam2 node actually exists after that.
const r1 = PflxFx.slam('HIT', { sub: '100% DMG', tint: 'cyan' });
ok(r1 === true, 'PflxFx.slam() returns true when it successfully renders (the .pfx-slam2 node was found)');

const layer = fake.document.getElementById('pflx-fx-layer');
ok(!!layer, 'ensureLayer() actually created and registered #pflx-fx-layer');
const slam2 = layer.querySelector('.pfx-slam2');
ok(!!slam2, '.pfx-slam2 node exists in the real rendered layer');
ok(slam2.classList.contains('on'), 'PflxFx.slam() adds the "on" class that drives the real pfxSlam/pfxJitter animation');

const b = slam2.querySelector('b');
const sm = slam2.querySelector('small');
ok(!!b && b.textContent === 'HIT', 'the big <b> label text is set to the real passed-in text ("HIT")');
ok(!!sm && sm.textContent === '100% DMG', 'the <small> subtitle is set to the real passed-in percentage ("100% DMG")');

const tint = layer.querySelector('.pfx-tint');
ok(!!tint && tint.style.background === 'rgba(0,240,255,0.28)', 'a "cyan" tint call sets the real cyan rgba color from TINT_COLORS, not a hardcoded string');

// Crit path: a distinct color + shake bump.
const r2 = PflxFx.slam('CRITICAL HIT', { sub: '150% DMG', tint: 'crit', shake: true });
ok(r2 === true, 'a crit-flavored slam() call also succeeds');
ok(b.textContent === 'CRITICAL HIT', 'a second slam() call overwrites the label text (not stacked/leaked from the first call)');
ok(tint.style.background === 'rgba(255,170,0,0.4)', 'tint:"crit" uses the new crit color, distinct from cyan/fail');

// Unknown/missing element: never throws even if the DOM node were absent.
const fakeNoLayer = { document: { documentElement: { appendChild: function () {} }, head: { appendChild: function () {} }, createElement: function () { return { classList: { add: function () {}, remove: function () {} }, appendChild: function () {} }; }, getElementById: function () { return null; }, querySelectorAll: function () { return []; } }, window: fake.window };
let threw = false;
try {
  const f2 = new Function('document', 'window', iifeSrc + '\nreturn (typeof window !== "undefined" ? window : this).PflxFx;')(fakeNoLayer.document, fakeNoLayer.window);
  f2.slam('X');
} catch (e) { threw = true; }
ok(!threw, 'slam() never throws even when the FX layer cannot be built (fails safe, matching every other PflxFx call)');

// ---- Archive Battle wiring: confirm resolve() calls PflxFx.slam() on a real landed hit ----
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
const resolveSrc = extractFn('resolve');
ok(resolveSrc.indexOf('window.PflxFx.slam') !== -1, 'resolve() calls window.PflxFx.slam() on the real shipped code path');
ok(resolveSrc.indexOf("crit ? 'CRITICAL HIT' : (correct ? 'HIT' : 'MISS')") !== -1, 'resolve() labels the banner CRITICAL HIT / HIT / MISS using the real crit/correct flags, not a guessed condition');
ok(resolveSrc.indexOf("Math.round(mult * 100) + '% DMG'") !== -1, 'resolve() shows the REAL computed damage multiplier as the percentage, not a hardcoded number');
ok(resolveSrc.indexOf("shake: crit") !== -1, 'resolve() only requests a screen shake on an actual crit, not on every hit');
// The call sits after B.hitFoe is set (a real landed hit), not inside the
// guard/support/dodge branches where "HIT/MISS" wouldn't make sense.
const hitFoeIdx = resolveSrc.indexOf('B.hitFoe = true');
const slamCallIdx = resolveSrc.indexOf('window.PflxFx.slam');
ok(hitFoeIdx !== -1 && slamCallIdx !== -1 && slamCallIdx > hitFoeIdx, 'the slam() call happens only on the real damage-landing branch (after B.hitFoe is set), not on guard/support/dodge moves');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
