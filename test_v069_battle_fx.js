// PATCH X-LIVE v0.69 -- Ennis, reacting to a live screenshot of Archive
// Battle: (1) the CRITICAL HIT/HIT/MISS popup was staying on screen forever,
// (2) the "official space-like" background was never actually visible,
// (3) card hit/act animations weren't visibly firing on a real fight, plus
// new asks: a vignette matching the popup color, a slight screen vibration
// on every hit (bigger on a crit), the acting card lunging toward its
// target, and a real dodge sidestep + swoosh SFX on a miss.
//
// Extracts the REAL shipped PflxFx IIFE and Archive Battle functions
// (brace/marker matching, same technique as test_pflxfx_slam_v060.js and
// every other test this session) and runs/asserts against them -- never a
// reimplementation. Run: node test_v069_battle_fx.js index.html
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

// ---- 1. Static CSS presence checks (the module string-builds its CSS) ----
ok(iifeSrc.indexOf('pfxSlamInOut 2.1s') !== -1, 'pfx-slam2 now uses the new self-terminating pfxSlamInOut animation');
ok(iifeSrc.indexOf("'#pflx-fx-layer .pfx-slam2.on{display:block;animation:pfxSlam 0.55s cubic-bezier(.2,1.8,.35,1),pfxJitter 0.12s steps(2) 0.55s infinite;}'") === -1,
  'the OLD infinite-jitter rule is gone from .pfx-slam2 specifically (the countdown finale\'s own .pfx-slam is untouched below)');
ok(iifeSrc.indexOf("'#pflx-fx-layer .pfx-slam.on{display:block;animation:pfxSlam 0.55s cubic-bezier(.2,1.8,.35,1),pfxJitter 0.12s steps(2) 0.55s infinite;}'") !== -1,
  "the countdown finale's own .pfx-slam (TIME'S UP) keeps its original working animation -- only .pfx-slam2 was broken/fixed");
ok(iifeSrc.indexOf('@keyframes pfxSlamInOut{0%{transform:translate(-50%,-50%) scale(3.2);opacity:0}') !== -1, 'pfxSlamInOut keyframe pops in and (via 100%) ends at opacity:0 -- self-clearing, no JS timer needed');
ok(iifeSrc.indexOf('pfx-vignette') !== -1, 'a .pfx-vignette layer exists');
ok(iifeSrc.indexOf('@keyframes pfxVignette{0%{opacity:0}') !== -1, 'pfxVignette keyframe fades in then back to 0 -- self-clearing');
ok(iifeSrc.indexOf('<div class="pfx-vignette"></div>') !== -1, 'the vignette div is actually mounted into the FX layer markup');
ok(iifeSrc.indexOf('pfx-bump-soft') !== -1 && iifeSrc.indexOf('pfx-bump-crit') !== -1, 'two new shake intensities exist (soft = always-on vibration, crit = the bigger one)');
ok(iifeSrc.indexOf('@keyframes pfxShakeSoft') !== -1 && iifeSrc.indexOf('@keyframes pfxShakeCrit') !== -1, 'both new shake keyframes are defined');
ok(iifeSrc.indexOf('.pfx-shaking,.pfx-bump,.pfx-bump-soft,.pfx-bump-crit,.pfx-glitching{animation:none !important}') !== -1,
  'prefers-reduced-motion also silences the two new shake classes, not just the original pfx-bump');
ok(iifeSrc.indexOf('.pfx-bump{animation:pfxShake 0.07s linear 5 !important;}') !== -1, 'the original always-crit pfx-bump class (used by playShow\'s boom/alarm effects) is untouched');

// ---- 2. slamShow() source-level checks ----
const slamShowIdx = iifeSrc.indexOf('function slamShow(text, opts) {');
ok(slamShowIdx !== -1, 'slamShow() is still defined');
const slamShowSrc = iifeSrc.slice(slamShowIdx, iifeSrc.indexOf('\n  function playShow', slamShowIdx));
ok(slamShowSrc.indexOf("opts.ms || 2100") !== -1, 'slamShow() defaults the popup duration to 2100ms, overridable via opts.ms (so a caller can sync it to a real voice-clip length)');
ok(slamShowSrc.indexOf('el.style.animationDuration = dur') !== -1, 'slamShow() actually applies the duration to the DOM node, not just a comment');
ok(slamShowSrc.indexOf("setProperty('--vig-c'") !== -1, 'slamShow() sets the vignette color CSS var from the real TINT_COLORS, matching the popup tint');
ok(slamShowSrc.indexOf("bump(opts.shake ? 'pfx-bump-crit' : 'pfx-bump-soft'") !== -1, 'slamShow() ALWAYS bumps the screen now (soft by default, crit only when opts.shake) instead of the old shake-only-on-crit gate');
ok(!/if \(opts\.shake\) bump\('pfx-bump', opts\.ms \|\| 500\);/.test(slamShowSrc), 'the old conditional-only, single-intensity bump call is gone');

// ---- 3. Behavioral run against a small hand-rolled fake DOM ----
function makeFakeDom() {
  function FakeClassList(el) { this.el = el; this.set = new Set(); }
  FakeClassList.prototype.add = function (c) { this.set.add(c); };
  FakeClassList.prototype.remove = function (c) { this.set.delete(c); };
  FakeClassList.prototype.toggle = function (c, on) { if (on) this.set.add(c); else this.set.delete(c); };
  FakeClassList.prototype.contains = function (c) { return this.set.has(c); };

  function FakeStyle() {}
  FakeStyle.prototype.setProperty = function (k, v) { this[k] = v; };
  FakeStyle.prototype.getPropertyValue = function (k) { return this[k] || ''; };

  function FakeEl(tag) {
    this.tag = tag; this.children = []; this.attrs = {}; this._text = '';
    this.style = new FakeStyle(); this.classList = new FakeClassList(this); this.id = ''; this._html = '';
  }
  Object.defineProperty(FakeEl.prototype, 'textContent', {
    get: function () { return this._text; }, set: function (v) { this._text = String(v); this.children = []; }
  });
  Object.defineProperty(FakeEl.prototype, 'innerHTML', {
    get: function () { return this._html; },
    set: function (v) {
      this._html = v; this.children = [];
      const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
      const stack = [this]; let m, lastIdx = 0;
      while ((m = tagRe.exec(v))) {
        const closing = m[1] === '/'; const tag2 = m[2]; const attrStr = m[3] || '';
        const between = v.slice(lastIdx, m.index); lastIdx = tagRe.lastIndex;
        const top = stack[stack.length - 1];
        if (between.trim() && top && top !== this) { top._text = (top._text || '') + between; }
        if (closing) { if (stack.length > 1) stack.pop(); continue; }
        const selfClosing = /\/>\s*$/.test(m[0]);
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
  const fakeBody = new FakeEl('body'); // stands in for CFG.shakeSelector's 'body' target
  const doc = {
    documentElement: new FakeEl('html'),
    head: new FakeEl('head'),
    createElement: function (tag) { return new FakeEl(tag); },
    getElementById: function (id) { return registry[id] || null; },
    querySelectorAll: function (sel) { return sel === 'body' ? [fakeBody] : []; }
  };
  doc.documentElement.appendChild = function (c) {
    FakeEl.prototype.appendChild.call(this, c);
    if (c.id) registry[c.id] = c;
    return c;
  };
  const win = { matchMedia: function () { return { matches: false }; } };
  return { document: doc, window: win, fakeBody: fakeBody };
}

const fake = makeFakeDom();
const sandboxFactory = new Function('document', 'window', iifeSrc + '\nreturn (typeof window !== "undefined" ? window : this).PflxFx;');
const PflxFx = sandboxFactory(fake.document, fake.window);
ok(!!PflxFx && typeof PflxFx.slam === 'function', 'the real PflxFx module initializes with slam() callable');

// A plain hit: soft vibration, popup shows, defaults to 2100ms duration.
const r1 = PflxFx.slam('HIT', { sub: '100% DMG', tint: 'cyan' });
ok(r1 === true, 'a plain hit slam() succeeds');
const layer = fake.document.getElementById('pflx-fx-layer');
const slam2 = layer.querySelector('.pfx-slam2');
ok(slam2.classList.contains('on'), 'the popup gets the "on" class');
ok(slam2.style.animationDuration === '2100ms', 'a plain hit defaults to the 2100ms popup duration');
ok(fake.fakeBody.classList.contains('pfx-bump-soft'), 'a plain (non-crit) hit still gets a soft screen vibration -- not silent like before');
ok(!fake.fakeBody.classList.contains('pfx-bump-crit'), 'a plain hit does NOT get the crit-intensity shake');
const vig1 = layer.querySelector('.pfx-vignette');
ok(vig1.classList.contains('go'), 'the vignette fires alongside the popup');
ok(vig1.style['--vig-c'] === 'rgba(0,240,255,0.28)', 'the vignette color matches the real cyan TINT_COLORS entry, not a hardcoded value');

// A real crit: harder shake, crit color, custom duration honored.
fake.fakeBody.classList.remove('pfx-bump-soft');
const r2 = PflxFx.slam('CRITICAL HIT', { sub: '150% DMG', tint: 'crit', shake: true, ms: 3000 });
ok(r2 === true, 'a crit slam() succeeds');
ok(slam2.style.animationDuration === '3000ms', 'a caller-supplied opts.ms overrides the default duration (for syncing to a real voice-clip length)');
ok(fake.fakeBody.classList.contains('pfx-bump-crit'), 'a real crit gets the stronger pfx-bump-crit shake');
ok(vig1.style['--vig-c'] === 'rgba(255,170,0,0.4)', 'the vignette re-colors to the real crit tint on a crit call');

// Never throws even if the layer can't be built.
const fakeNoLayer = { document: { documentElement: { appendChild: function () {} }, head: { appendChild: function () {} }, createElement: function () { return { classList: { add: function () {}, remove: function () {} }, appendChild: function () {} }; }, getElementById: function () { return null; }, querySelectorAll: function () { return []; } }, window: fake.window };
let threw = false;
try {
  const f2 = new Function('document', 'window', iifeSrc + '\nreturn (typeof window !== "undefined" ? window : this).PflxFx;')(fakeNoLayer.document, fakeNoLayer.window);
  f2.slam('X');
} catch (e) { threw = true; }
ok(!threw, 'slam() still never throws even when the FX layer cannot be built');

// ---- 4. Archive Battle wiring (source-level, brace-extracted) ----
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

const foeAttackSrc = extractFn('foeAttack');
ok(foeAttackSrc.indexOf("B.dodgeMe = true; flashOff(['dodgeMe'], 560);") !== -1, 'foeAttack() sets a real B.dodgeMe flag (with its own flashOff clear) on a dodge');
ok(foeAttackSrc.indexOf("xlSfx('battleDodge')") !== -1, 'the dodge branch now plays the new dedicated swoosh SFX instead of the generic glitch cue');
ok(foeAttackSrc.indexOf("xlSfx('freeze')") === -1, 'the old glitch-flavored "freeze" cue is gone from the dodge branch');
const dodgeIdx = foeAttackSrc.indexOf('B.dodge > 0');
const dodgeMeIdx = foeAttackSrc.indexOf('B.dodgeMe = true');
ok(dodgeIdx !== -1 && dodgeMeIdx !== -1 && dodgeMeIdx > dodgeIdx, 'B.dodgeMe is set inside the real B.dodge>0 branch, not somewhere unrelated');
ok(foeAttackSrc.indexOf("B.critMe = foeCrit;") !== -1, 'foeAttack() now records B.critMe from the REAL foeCrit flag (Probe-charged etc.), not a guess');
ok(foeAttackSrc.indexOf("foeCrit ? ['hitMe', 'critMe'] : ['hitMe']") !== -1, 'critMe is cleared alongside hitMe only when the hit was actually a crit');
const critIdx = foeAttackSrc.indexOf('var foeCrit = false;');
const critMeIdx = foeAttackSrc.indexOf('B.critMe = foeCrit');
ok(critIdx !== -1 && critMeIdx !== -1 && critMeIdx > critIdx, 'B.critMe is assigned after foeCrit has actually been computed for this attack');

let battleHtmlSrc = ''; try { battleHtmlSrc = extractFn('xlBattleHTML'); } catch (e) { battleHtmlSrc = ''; }
// xlBattleHTML is assigned as window.xlBattleHTML = function... ; try the alt marker if the plain extractor misses it
let battleHtmlAlt = battleHtmlSrc;
if (!battleHtmlSrc || battleHtmlSrc.length < 50) {
  const idx = src.indexOf('window.xlBattleHTML = function () {');
  const braceStart = src.indexOf('{', idx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } }
  battleHtmlAlt = src.slice(idx, i + 1);
}
ok(battleHtmlAlt.indexOf("(B.critMe ? ' crit' : '') + (B.dodgeMe ? ' dodge' : '')") !== -1, 'xlBattleHTML() now folds B.critMe/B.dodgeMe into the player card\'s CSS class string');

// ---- 5. CSS wiring (source-level) ----
ok(src.indexOf('.evb .evb-foe.hit svg,.evb .evb-foe.hit .evb-foe-art-wrap{animation:hit .35s}') !== -1, 'the foe hit rule now also matches .evb-foe-art-wrap (the real per-Archive <img> path), not just the placeholder <svg>');
ok(src.indexOf('.evb .evb-foe.act svg,.evb .evb-foe.act .evb-foe-art-wrap{animation:actLungeFoe .42s ease}') !== -1, 'the foe act rule uses the new directional lunge and also matches the real art wrapper');
ok(src.indexOf('.evb .evb-foe.hit.crit svg,.evb .evb-foe.hit.crit .evb-foe-art-wrap{animation:hitBig .5s, critflash .5s}') !== -1, 'a real foe crit now uses the bigger hitBig shake, and matches the real art wrapper');
ok(src.indexOf(".evb .evc.act{animation:actLungeMe .42s ease}") !== -1, "the player's own acting card lunges toward its target instead of just popping up");
ok(src.indexOf('.evb .evc.hit.crit{animation:hitBig .5s, critflash .5s}') !== -1, 'a real Archive crit against the player now gets its own bigger hitBig+critflash treatment (previously no crit rule existed on the player card at all)');
ok(src.indexOf('.evb .evc.dodge{animation:dodgeShift .55s ease}') !== -1, 'a real dodge plays the new sidestep animation on the player card');
ok(src.indexOf('@keyframes actLungeMe{') !== -1 && src.indexOf('@keyframes actLungeFoe{') !== -1 && src.indexOf('@keyframes hitBig{') !== -1 && src.indexOf('@keyframes dodgeShift{') !== -1, 'all four new keyframes are defined');
ok(/\.evb \.evb-stage\{position:relative;overflow:hidden;background:radial-gradient/.test(src), '.evb-stage now has a real nebula background behind the (already-animating) star-field, instead of nothing');
ok(src.indexOf("battleDodge: 'pflx-library/07_Transitions_Swells/") !== -1, 'a real battleDodge SFX file is registered in XL_SFX');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
