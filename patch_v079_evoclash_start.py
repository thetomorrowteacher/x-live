# X-Live v0.79: Evo Clash is open from the start. A player with no Evo yet can
# hatch a Stage 1 starter right inside Evo Clash (or the Evo Bay pane); it
# bonds to their Studio's line, and they go straight to the fight. Before this,
# hatching only happened in the Battle Arena app / host PLAY tab.
h=open('index.html').read()
def rep(a,b):
    global h
    c=h.count(a); assert c==1,(a[:80],c); h=h.replace(a,b)

# 1. Evo Clash: no Evo -> starter hatch card
rep("""    if (!ex || !g) return '<div class="evb-stage"><div class="card"><div class="cardT">⚔️ EVO CLASH</div><div class="xl-hint" style="text-align:left">Hatch your Evo first. The Archive is waiting.</div></div></div>';""",
"""    if (!ex && g) return '<div class="evb-stage">' + xlEvoStarterCard('clash') + '</div>'; // PATCH X-LIVE v0.79 -- Evo Clash open from the start
    if (!ex || !g) return '<div class="evb-stage"><div class="card"><div class="cardT">⚔️ EVO CLASH</div><div class="xl-hint" style="text-align:left">Hatch your Evo first. The Archive is waiting.</div></div></div>';""")

# 2. Evo Bay pane: same card
rep("""    if (!ex || !g) return '<div class="card"><div class="cardT">🧬 EVO BAY</div><div class="xl-hint" style="text-align:left">Hatch your Evo in the EVO Bay on the PLAY tab.""",
"""    if (!ex && g) return xlEvoStarterCard('bay'); // PATCH X-LIVE v0.79
    if (!ex || !g) return '<div class="card"><div class="cardT">🧬 EVO BAY</div><div class="xl-hint" style="text-align:left">Hatch your Evo in the EVO Bay on the PLAY tab.""")

# 3. the starter card + hatch action, next to the Evo Bay pane
rep("""  /* ---------- Evo Bay pane ---------- */
  window.xlEvoBayHTML = function () {""",
"""  /* ---------- Starter hatch (PATCH X-LIVE v0.79) ----------
     Evo Clash is available from the start. The starter is a Stage 1 Evo of the
     player's Studio line, default colorway -- the same row shape the Battle
     Arena's ACTIVATE EXO writes, so the Arena and X-Live agree on it. A player
     with no Studio yet picks one of the four lines. */
  var STUDIO_LINE = { 'studio-gentech': 'ironwright', 'studio-mindforge': 'resonant', 'studio-emagination': 'mythweaver', 'studio-innov8': 'neonborn' };
  function myStudioLine() {
    var me = (L.roster || []).filter(function (r) { return r.id === myId(); })[0] || {};
    return STUDIO_LINE[me.studioId] || '';
  }
  function xlEvoStarterCard(where) {
    var ln = myStudioLine(), ttl = where === 'bay' ? '🧬 EVO BAY' : '⚔️ EVO CLASH';
    var h = '<div class="card" style="text-align:center"><div class="cardT" style="text-align:left">' + ttl + '</div>';
    if (!myId()) return h + '<div class="xl-hint">Sign in to hatch your Evo.</div></div>';
    if (ln) {
      var nm = EXO_LINES[ln] ? EXO_LINES[ln].stages[0] : 'Evo';
      h += '<div class="xl-hint">Your Evo is ready to hatch. A ' + esc(nm) + ', bonded to your Studio. It starts at Stage 1 and grows with every quest.</div>' +
        '<button class="bigbtn gold" onclick="xlEvoHatch(\\'' + ln + '\\',\\'' + where + '\\')">🥚 HATCH ' + esc(nm.toUpperCase()) + (where === 'clash' ? ' &amp; FIGHT' : '') + '</button>';
    } else {
      h += '<div class="xl-hint">Choose the Evo line you want to hatch. Each one belongs to a Startup Studio.</div><div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:8px">' +
        Object.keys(STUDIO_LINE).map(function (sid) { var l = STUDIO_LINE[sid], L2 = EXO_LINES[l]; return L2 ? '<button class="bigbtn ghost xl-sm" onclick="xlEvoHatch(\\'' + l + '\\',\\'' + where + '\\')">' + esc(L2.stages[0]) + ' · ' + esc(L2.name) + '</button>' : ''; }).join('') + '</div>';
    }
    return h + '</div>';
  }
  window.xlEvoStarterCard = xlEvoStarterCard;
  window.xlEvoHatch = function (ln, where) {
    var id = myId(); if (!id || !EXO_LINES[ln] || exoRow()) { render(); return; }
    var row = { player_id: id, line: ln, stage: 1, sync_xp: 0, exo_name: EXO_LINES[ln].stages[0], colorway: 'default',
      equipped: {}, cosmetics: { accent: '' }, stats_cache: {}, updated_at: new Date().toISOString() };
    if (!L.exo) L.exo = {};
    L.exo[id] = row;
    try {
      fetch(SUPABASE_URL + '/rest/v1/player_avatars?on_conflict=player_id', { method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, SB_HEADERS),
        body: JSON.stringify(row) });
    } catch (e) {}
    if (where === 'clash' && typeof window.xlBattleStartSequence === 'function') window.xlBattleStartSequence('fight');
    else render();
  };

  /* ---------- Evo Bay pane ---------- */
  window.xlEvoBayHTML = function () {""")

# 4. hub card copy: point to the Clash tab instead of the host-only PLAY tab
rep("""evoStats += '<div style="font-size:11px;color:#8a93b8;text-align:center">Hatch your Evo in the EVO Bay (PLAY tab) and it bonds to your Studio.</div><div style="text-align:center;margin-top:10px"><button class="bigbtn ghost xl-sm" onclick="go(\\'play\\')">🛠 OPEN EVO BAY</button></div>';""",
"""evoStats += '<div style="font-size:11px;color:#8a93b8;text-align:center">Hatch your Evo and it bonds to your Studio. Evo Clash is open from day one.</div><div style="text-align:center;margin-top:10px"><button class="bigbtn gold xl-sm" onclick="xlHubGo(2)">⚔️ HATCH &amp; FIGHT</button></div>'; // PATCH X-LIVE v0.79""")
open('index.html','w').write(h); print('ok')
