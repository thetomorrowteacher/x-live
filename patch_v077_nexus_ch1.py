# PATCH X-LIVE v0.77 -- Nexus Narratives 2487, Phase 2: Chapter 1 wiring.
# Mirrors PATCH PLATFORM v253: the Story Mode campaign drops "Pick Your Studio"
# (Studio now comes from the diagnostic), adds "Read the Issue" after "Choose
# Your Client", reframes Act Two as a two-client Chapter, moves Tessera's lines
# to X-Bot, and updates the glossary client cards from 2077 to 2487.
import json, sys
p = 'index.html'
s = open(p, encoding='utf-8').read()
def R(old, new, n=1):
    global s
    c = s.count(old)
    if c != n: raise SystemExit('FAIL %r: expected %d found %d' % (old[:70], n, c))
    s = s.replace(old, new)
if 'PATCH X-LIVE v0.77' in s: raise SystemExit('already applied')

# 1. host panel quest list
R('[["a0-brief","The Nexus Opens"],["a0-studio","Pick Your Studio"]]', '[["a0-brief","The Nexus Opens"]]')
R('["a2-pick","Choose Your Client"],', '["a2-pick","Choose Your Client"],["a2-issue","Read the Issue"],')
R('/* PATCH X-LIVE v0.39 -- Story Mode in the live room', '/* PATCH X-LIVE v0.77 -- quest list follows the Chapter 1 campaign.\n       PATCH X-LIVE v0.39 -- Story Mode in the live room')

# 2. embedded story copy
R('{"id":"a0-brief","title":"The Nexus Opens","xc":50},{"id":"a0-studio","title":"Pick Your Studio","xc":50}', '{"id":"a0-brief","title":"The Nexus Opens","xc":50}')
R('{"id":"a2-pick","title":"Choose Your Client","xc":100},', '{"id":"a2-pick","title":"Choose Your Client","xc":100},{"id":"a2-issue","title":"Read the Issue","xc":150},')

# 3. panel copy
R('lede:"Tessera has one seat left in the Ring. Before you take a client it wants to know who you are.', 'lede:"X-Bot has one seat left at PFLX. Before you take a client it wants to know who you are.')
R('and Tessera writes you into the Ring."', 'and X-Bot writes you into PFLX."')
R('act2:{lede:"Eight clients in eight cities. You take one, and you understand them well enough that the fix becomes obvious. Phase One is a race."',
  'act2:{lede:"This season one Startup Studio opens its files: two Leads, two clients. You take one, read their Issue, and understand them well enough that the fix becomes obvious. Phase One is a race."')

# 4. season spec (JSON on one line)
key = 'window.SMF_SEASON = '
i = s.index(key); j = s.index('\n', i)
line = s[i:j]; body = line[len(key):].rstrip()
semi = body.endswith(';'); body = body[:-1] if semi else body
S = json.loads(body)
for a in S['acts']:
    if a['id'] == 'act0':
        a['quests'] = [q for q in a['quests'] if q['id'] != 'a0-studio']
        a['quests'][0]['blurb'] = 'X-Bot has one seat left at PFLX. It wants to know who is taking it.'
    if a['id'] == 'act1':
        for q in a['quests']:
            if q['id'] == 'a1-mint': q['blurb'] = 'X-Bot writes you into PFLX. Your card is issued.'
    if a['id'] == 'act2':
        qs = a['quests']; k = [x['id'] for x in qs].index('a2-pick')
        qs[0]['blurb'] = 'This season, one Startup Studio opens its files. Two Leads, two clients. You take one.'
        qs[k]['blurb'] = 'Two clients. Pick the person whose problem you actually want to live with for a season.'
        new = dict(qs[k]); new.update({'id': 'a2-issue', 'title': 'Read the Issue', 'kind': 'issue', 'xc': 150, 'xp': 75,
            'mins': 10, 'blurb': "Your client's story, as a graphic novel. When the Archive attacks, ClientCall needs your help to get through.",
            'needs': ['a2-pick'], 'mc': 'job:a2-issue', 'syncXp': 75, 'orbs': 15})
        qs.insert(k + 1, new)
        for x in qs:
            if x['id'] == 'a2-interview': x['needs'] = ['a2-issue']
for g in S['interludes']:
    if g['id'] == 'i0': g['unlock'] = [u for u in g['unlock'] if u != 'a0-studio']
    if g['id'] == 'i1': g['cutscene']['caption'] = 'Your Alter Ego is minted. Chapter 1 opens: two clients, one choice.'
s = s[:i] + key + json.dumps(S, ensure_ascii=False) + (';' if semi else '') + s[j:]

# 5. demo state
R("{done:{'a0-brief':1,'a0-studio':1,'a1-traits':1,'a1-forge':1}", "{done:{'a0-brief':1,'a1-traits':1,'a1-forge':1}")

# 6. glossary cards (1b)
G = [
 ('["The Nexus Narratives", "Short stories set in 2077, each following a young innovator in an SDG related crisis; used as simulated clients"]',
  '["The Nexus Narratives", "Graphic-novel Issues set in 2487, each following a young PFLX recruit from one of the last eight cities on Earth; each season\'s two Studio Leads become your clients"]'),
 ('["The Transit Paradox", "Dubai, 2077. Client Aisha Malik, urban planner. A rogue AI called The Paradox overrides the transit grid"]',
  '["The Transit Paradox", "Dubai, 2487. Client Aisha Malik, the teen who beat the city\'s AI at its own route puzzle. A flaw in the transit AI freezes the city"]'),
 ('["Blackout Harvest", "Lagos, 2077. Client Adebayo Onifade, urban farmer. The Harvesters hijack the decentralized power grids"]',
  '["Blackout Harvest", "Lagos, 2487. Client Adebayo \\"Fix-It Bayo\\" Onifade, repair-stall mechanic. The Harvesters hijack the independent power grid"]'),
 ('["Submerged Future", "Bangkok, 2077. Client Rafi, climate activist. A typhoon pushes seawater into the last dry districts"]',
  '["Submerged Future", "Bangkok, 2487. Client Rafi, the boy who builds floating cities. The Surrender Protocol condemns his floating district"]'),
 ('["The Vanishing City", "Amsterdam, 2077. Client Elise, cultural historian. AI generated tourism has hollowed out the city"]',
  '["The Vanishing City", "Amsterdam, 2487. Client Elise, the girl who draws the city back. The Curator replaces real streets with a heritage experience"]'),
 ('["Echoes of the Canopy", "Amazon, 2077. Client Tiago, Indigenous activist. AI deforestation bots clear Indigenous land"]',
  '["Echoes of the Canopy", "The Amazon, 2487. Client Tiago, young documentary filmmaker. The Clearcut Swarm burns the forest where elders told their stories"]'),
 ('["Exiled by the Ocean", "Tuvalu, 2077. Client Koa, environmental scientist. Rising seas leave the people stateless"]',
  '["Exiled by the Ocean", "Tuvalu, 2487. Client Koa, the navigator who codes. Rising seas threaten the last land and the Registry moves to delete the nation"]'),
 ('["The Sound of Silence", "Los Angeles, 2077. Client Aiko, digital wellness activist. Offline Silence Zones are outlawed"]',
  '["The Sound of Silence", "Los Angeles, 2487. Client Aiko, R&B and soul artist and controller builder. The Hum, the city\'s always-on sound feed, is taking people\'s hearing"]'),
 ('["Trash Titans", "Mumbai, 2077. Client Priya, waste innovator. A change to X-Coin makes recycling unprofitable"]',
  '["Trash Titans", "Mumbai, 2487. Client Priya, founder of ReValue. The Appraiser reprices waste to zero and a counterfeit Mirror Coin floods the market"]'),
 ('["The Unwritten Future", "A build your own client option guided by Tessera"]',
  '["The Unwritten Future", "The backdrop of the whole campaign: the future of the last cities is not written yet, and X-Bot\'s challenge is to write it"]'),
]
for o, n in G: R(o, n)
open(p, 'w', encoding='utf-8').write(s)
print('ok', len(s))
# Follow-up in the same patch (27 Sep): Studio Hub (player mode) backdrop =
# story/art/studio_hub_bg.jpg (the station command deck) behind the hub,
# with a 32s "breathe" zoom (scale 1 -> 1.07 -> 1). Applied directly after
# this script ran; see the PATCH X-LIVE v0.77 CSS block after #app.
