# X-Live v0.80: Campaign Mode lives in X-Live. The Console's Story Mode engine
# (Cluster map, Chapters, levels, Issues with graphic audio, Locator Key) is
# embedded here and opens from the CAMPAIGN tab / JOIN buttons in place of the
# old scroll flythrough. One shared record per player (pflx_story_<id>) with
# the Evo care loop; awards go to the Console over the data bus; gates between
# levels keep the Vault pull and the interlude games.
S = '.v080_stage/'
h = open('index.html', encoding='utf-8').read()
def rep(a, b, n=1):
    global h
    c = h.count(a); assert c == n, (a[:80], c); h = h.replace(a, b)
rd = lambda f: open(S + f, encoding='utf-8').read()

# 1. engine + data + css, just before the bridge
eng = ('<style id="xl-cm-css">\n/* PATCH X-LIVE v0.80 -- Campaign Mode (engine from the Console, PFLX_PATCH 256) */\n' + rd('story.css') +
       '\n#xl-cm{position:fixed;inset:0;z-index:8990;overflow-y:auto;overflow-x:hidden;background:#04050d;-webkit-overflow-scrolling:touch}\n'
       '#xl-cm #sm-root{min-height:100%}\n.cm-cut{z-index:9500!important}\n</style>\n'
       '<script id="xl-cm-data">\nwindow.PFLX_STORY_ART = window.PFLX_STORY_ART || "https://prototypeflx.com/public/story-art/";\n' + rd('story_data.js') + '\n</script>\n'
       '<script id="xl-cm-clients">\n' + rd('clients.js') + '\n</script>\n'
       '<script id="xl-cm-issues">\n' + rd('issues.js') + '\n</script>\n'
       '<script id="xl-cm-engine">\n' + rd('story.js') + '\n</script>\n')
rep('<script id="xl-smf-bridge">', eng + '<script id="xl-smf-bridge">')

# 2. the bridge: the flythrough's globals go; routing stays as xlStoryRoute
rep("""  /* state the engine reads */
  window.pflxStoryState = function () {
    var st = myStory() || {};
    return { done: st.done || {}, joined: !!st.joined, xc: st.xc || 0 };
  };
""", """  /* PATCH X-LIVE v0.80 -- window.pflxStoryState / pflxStoryGo now belong to
     Campaign Mode's engine; the flythrough no longer mounts. */
""")
rep("""  window.pflxStoryGo = function (target) {
    target = String(target || '');""", """  function route(target) {
    target = String(target || '');""")
rep("""    L.screen = 'story'; render();
  };
  window.pflxVaultPull = function (lot, cb) { window.pflxStoryGo('vault'); };""",
"""    L.screen = 'story'; render();
  }
  window.xlStoryRoute = route;""")

# 3. host adapter + overlay
i0 = h.index("  /* overlay lifecycle */\n  var mounted = null;\n  window.xlStoryOpen = function () {")
i1 = h.index("  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('xl-smf')")
i1 = h.index('\n', i1) + 1
h = h[:i0] + """  /* PATCH X-LIVE v0.80 -- Campaign Mode host. The engine asks X-Live who the
     player is, where to save, how to award and where Evo Clash lives. */
  function myStudio() {
    var id = myId(), r = (L.roster || []).filter(function (x) { return x.id === id; })[0], ex = L.exo && L.exo[id];
    return (r && r.studioId) || (ex && LINE_STUDIO[ex.line]) || '';
  }
  window.PFLX_STORY_HOST = {
    id: function () { return myId(); },
    name: function () { return (L.me && L.me.brand) || ''; },
    studio: myStudio,
    load: function () { var id = myId(); return (id && L.story && L.story.byId && L.story.byId[id]) || null; },
    bind: function (key, st) { var id = myId(); if (id && L.story && L.story.byId) L.story.byId[id] = st; },
    save: function (key, st) {
      var id = myId(); if (!id) return;
      if (L.story && L.story.byId) L.story.byId[id] = st;
      if (typeof kvSave === 'function') kvSave('pflx_story_' + id, st);
    },
    award: function (xc, xp, reason) {
      var id = myId(); if (!id || !xc) return;
      try { if (inPlatform) window.parent.postMessage(JSON.stringify({ type: 'pflx_award_proposed', playerId: id, source: 'story',
        award: { xc: xc, source: 'story', reason: reason } }), '*'); } catch (e) {}
    },
    close: function () { xlStoryClose(); },
    evoClash: function () { xlStoryClose(); go(L.isHost ? 'play' : 'me'); setTimeout(function () { if (typeof window.xlHubGo === 'function') window.xlHubGo(2); }, 80); },
    route: function (t) { route(t); }
  };

  /* overlay lifecycle: Campaign Mode opens over X-Live */
  window.xlStoryOpen = function () {
    if (document.getElementById('xl-cm')) return;
    var id = myId();
    function mount() {
      if (document.getElementById('xl-cm')) return;
      var root = document.createElement('div'); root.id = 'xl-cm'; root.className = 'story-view';
      root.innerHTML = '<div id="sm-root"></div>';
      document.body.appendChild(root); document.body.style.overflow = 'hidden';
      try { window.pflxStoryBoot(); } catch (e) { console.warn('[X-Live] campaign boot failed', e); }
      try { var st = window.pflxStoryState(); if (st && !st.joined) { st.joined = true; st.joinedAt = Date.now(); } } catch (e) {}
    }
    /* always read the saved record first: the Evo care loop may have made an
       empty stub for this player before the cloud copy arrived */
    if (id && typeof xlStoryLoad === 'function') {
      try { Promise.resolve(xlStoryLoad([id])).then(mount, mount); } catch (e) { mount(); }
    } else mount();
    try { if (typeof xlSfx === 'function') xlSfx('warp'); } catch (e) {}
  };
  window.xlStoryClose = function () {
    ['xl-cm', 'cm-cut'].forEach(function (k) { var n = document.getElementById(k); if (n) n.parentNode.removeChild(n); });
    document.body.style.overflow = '';
    try { render(); } catch (e) {}
  };
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !document.getElementById('xl-cm') || document.getElementById('cm-cut') || document.querySelector('#xl-cm .ir-full')) return;
    if (e.target && e.target.closest && e.target.closest('input,textarea')) return;
    xlStoryClose();
  });
""" + h[i1:]

# 4. labels + players' CAMPAIGN tab opens the campaign itself
rep("""'<button class="bigbtn" onclick="xlStoryOpen()">\\uD83D\\uDE80 ENTER STORY MODE</button></div>' +""",
    """'<button class="bigbtn" onclick="xlStoryOpen()">\\uD83D\\uDE80 ENTER THE CAMPAIGN</button></div>' +""")
rep("""var h = '<div class="card"><div class="cardT">STORY MODE</div>' +""", """var h = '<div class="card"><div class="cardT">CAMPAIGN</div>' +""")
rep("""letter-spacing:.22em;color:#7de9ff">STORY MODE \\u00b7 SEASON ONE</div>' +""", """letter-spacing:.22em;color:#7de9ff">CAMPAIGN \\u00b7 CHAPTER 1</div>' +""")
rep("""function go(s) { if (L.screen === 'tools'""", """function go(s) { if (s === 'story' && !L.isHost && typeof window.xlStoryOpen === 'function') { window.xlStoryOpen(); return; } /* PATCH X-LIVE v0.80 */ if (L.screen === 'tools'""")
open('index.html', 'w', encoding='utf-8').write(h)
print('ok')
