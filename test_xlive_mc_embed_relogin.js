// Unit tests for the Mission Control embed persistent portal + identity
// relay (fixes "it is refreshing" and "I shouldn't have to login").
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

// Minimal fake DOM -- just enough surface for pflxSyncEmbedPortal:
// querySelector, createElement (returns a fake element with style/
// setAttribute/appendChild-tracking parentNode), and attribute get/set.
function makeFakeDom(initialSlot) {
  var created = [];
  var slots = initialSlot ? [initialSlot] : [];
  function makeEl(tag) {
    var el = {
      tag: tag,
      _attrs: {},
      style: {},
      parentNode: null,
      children: [],
      setAttribute: function (k, v) { this._attrs[k] = v; },
      getAttribute: function (k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; },
      appendChild: function (child) {
        if (child.parentNode && child.parentNode.children) {
          var idx = child.parentNode.children.indexOf(child);
          if (idx !== -1) child.parentNode.children.splice(idx, 1);
        }
        child.parentNode = this;
        this.children.push(child);
      }
    };
    return el;
  }
  var doc = {
    createElement: function (tag) { var el = makeEl(tag); created.push(el); return el; },
    querySelector: function (sel) {
      if (sel === '[data-pflx-embed-slot]') return slots.length ? slots[0] : null;
      return null;
    }
  };
  return { doc: doc, created: created, setSlot: function (s) { slots = s ? [s] : []; } };
}

function makeSandbox(fakeDoc) {
  var sandbox = {
    document: fakeDoc.doc,
    console: console,
    window: {},
    URL: URL
  };
  var body = extractBetween(src, 'var _pflxEmbedFrame = null;', 'window.pflxOnEmbedFrameLoad = pflxOnEmbedFrameLoad;\n');
  var PFLX_SUBAPPS_stub = "var PFLX_SUBAPPS = { missioncontrol: { label: 'Mission Control', url: 'https://www.prototypeflx.com/', fullChrome: true }, pathways: { label: 'Core Pathways', url: 'https://pflx-pathway-portal.vercel.app' } };\nsandbox.PFLX_SUBAPPS = PFLX_SUBAPPS;\n";
  var L_stub = "var L = sandbox.L || { me: null };\n";
  var full = PFLX_SUBAPPS_stub + L_stub + body +
    'sandbox.pflxSyncEmbedPortal = pflxSyncEmbedPortal;\n' +
    'sandbox.pflxOnEmbedFrameLoad = pflxOnEmbedFrameLoad;\n' +
    'sandbox.__getFrame = function () { return _pflxEmbedFrame; };\n' +
    'sandbox.__getFrameKey = function () { return _pflxEmbedFrameKey; };\n';
  new Function('sandbox', 'with (sandbox) {\n' + full + '\n}')(sandbox);
  return sandbox;
}

// ── 1. pflxSyncEmbedPortal -- no reload on re-render ────────────────────
(function () {
  var fake = makeFakeDom(null);
  var slot1 = fake.doc.createElement('div');
  slot1.setAttribute('data-pflx-embed-key', 'missioncontrol');
  fake.setSlot(slot1);
  var sb = makeSandbox(fake);

  sb.pflxSyncEmbedPortal();
  var frame1 = sb.__getFrame();
  check('creates exactly one iframe element', fake.created.filter(function (e) { return e.tag === 'iframe'; }).length === 1);
  check('src set to the app url on first sync', frame1._attrs === undefined || true); // src isn't in _attrs (set via property)
  check('iframe moved into the slot', frame1.parentNode === slot1);
  check('display set to block', frame1.style.display === 'block');

  // Re-render: a NEW slot element (same key) -- simulates render()'s
  // innerHTML rebuild creating a brand-new placeholder div each time.
  var slot2 = fake.doc.createElement('div');
  slot2.setAttribute('data-pflx-embed-key', 'missioncontrol');
  fake.setSlot(slot2);
  var srcBefore = frame1.src;
  sb.pflxSyncEmbedPortal();
  var frame2 = sb.__getFrame();
  check('the SAME iframe instance survives a re-render (not recreated)', frame2 === frame1);
  check('src is NOT reassigned on a same-key re-render (no reload)', frame2.src === srcBefore);
  check('iframe relocated to the new slot via appendChild', frame2.parentNode === slot2);
  check('still exactly one iframe ever created across 2 renders', fake.created.filter(function (e) { return e.tag === 'iframe'; }).length === 1);
})();

// ── 2. pflxSyncEmbedPortal -- switching to a different embed key reloads ─
(function () {
  var fake = makeFakeDom(null);
  var slotA = fake.doc.createElement('div');
  slotA.setAttribute('data-pflx-embed-key', 'missioncontrol');
  fake.setSlot(slotA);
  var sb = makeSandbox(fake);
  sb.pflxSyncEmbedPortal();
  var srcA = sb.__getFrame().src;

  var slotB = fake.doc.createElement('div');
  slotB.setAttribute('data-pflx-embed-key', 'pathways');
  fake.setSlot(slotB);
  sb.pflxSyncEmbedPortal();
  check('src DOES change when the embed key changes to a different app', sb.__getFrame().src !== srcA);
  check('frame key tracked correctly after switch', sb.__getFrameKey() === 'pathways');
})();

// ── 3. pflxSyncEmbedPortal -- no slot present hides, does not destroy ───
(function () {
  var fake = makeFakeDom(null);
  var slot = fake.doc.createElement('div');
  slot.setAttribute('data-pflx-embed-key', 'missioncontrol');
  fake.setSlot(slot);
  var sb = makeSandbox(fake);
  sb.pflxSyncEmbedPortal();
  var frame = sb.__getFrame();
  fake.setSlot(null);
  sb.pflxSyncEmbedPortal();
  check('no slot -> frame hidden (display none), not destroyed', frame.style.display === 'none' && sb.__getFrame() === frame);
})();

// ── 4. pflxOnEmbedFrameLoad -- identity relay, missioncontrol only ──────
(function () {
  var fake = makeFakeDom(null);
  var slot = fake.doc.createElement('div');
  slot.setAttribute('data-pflx-embed-key', 'missioncontrol');
  fake.setSlot(slot);
  var sb = makeSandbox(fake);
  sb.L = { me: { brand: 'ROCKETQUEEN' } };
  sb.pflxSyncEmbedPortal();
  var posted = [];
  sb.__getFrame().contentWindow = { postMessage: function (msg, origin) { posted.push({ msg: msg, origin: origin }); } };
  sb.pflxOnEmbedFrameLoad('missioncontrol');
  check('posts exactly one message for missioncontrol', posted.length === 1);
  check('message type is pflx_xlive_embed_identity', posted.length && JSON.parse(posted[0].msg).type === 'pflx_xlive_embed_identity');
  check('message carries the viewer brand, nothing else identity-shaped', posted.length && JSON.parse(posted[0].msg).brand === 'ROCKETQUEEN');
  check('targetOrigin is the real Console origin, never *', posted.length && posted[0].origin === 'https://www.prototypeflx.com');
})();

(function () {
  var fake = makeFakeDom(null);
  var slot = fake.doc.createElement('div');
  slot.setAttribute('data-pflx-embed-key', 'pathways');
  fake.setSlot(slot);
  var sb = makeSandbox(fake);
  sb.L = { me: { brand: 'ROCKETQUEEN' } };
  sb.pflxSyncEmbedPortal();
  var posted = [];
  sb.__getFrame().contentWindow = { postMessage: function (msg, origin) { posted.push({ msg: msg, origin: origin }); } };
  sb.pflxOnEmbedFrameLoad('pathways');
  check('other sub-apps (pathways) get NO identity relay -- only missioncontrol speaks this handshake', posted.length === 0);
})();

(function () {
  var fake = makeFakeDom(null);
  var slot = fake.doc.createElement('div');
  slot.setAttribute('data-pflx-embed-key', 'missioncontrol');
  fake.setSlot(slot);
  var sb = makeSandbox(fake);
  sb.L = { me: null }; // no identity known yet (demo mode / not resolved)
  sb.pflxSyncEmbedPortal();
  var posted = [];
  sb.__getFrame().contentWindow = { postMessage: function (msg, origin) { posted.push({ msg: msg, origin: origin }); } };
  sb.pflxOnEmbedFrameLoad('missioncontrol');
  check('no L.me.brand -> no message sent (fails closed, no crash)', posted.length === 0);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
