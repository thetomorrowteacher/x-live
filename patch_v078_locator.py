# X-Live v0.78: the Locator Key quest (a6-locator) closes each Chapter. 28 -> 29 quests.
import re
h=open('index.html').read()
def rep(a,b,n=1):
    global h
    c=h.count(a); assert c==n,(a[:70],c); h=h.replace(a,b)
rep('["a6-eval","Self Evaluation and Future Steps"]]}]}','["a6-eval","Self Evaluation and Future Steps"],["a6-locator","The Locator Key"]]}]}')
rep('{"id":"a6-eval","title":"Self Evaluation and Future Steps","xc":250,"needs":["a6-show"]}]}]}',
    '{"id":"a6-eval","title":"Self Evaluation and Future Steps","xc":250,"needs":["a6-show"]},{"id":"a6-locator","title":"The Locator Key","xc":150,"needs":["a6-eval"]}]}]}')
rep('"mc": "job:a6-eval", "node": "", "strand": "PR", "stats": ["POWER", "SPEED"], "syncXp": 125, "orbs": 25, "checkpointGate": true}]}], "interludes"',
    '"mc": "job:a6-eval", "node": "", "strand": "PR", "stats": ["POWER", "SPEED"], "syncXp": 125, "orbs": 25, "checkpointGate": true}, {"id": "a6-locator", "title": "The Locator Key", "kind": "locator", "xc": 150, "xp": 75, "mins": 5, "blurb": "The Expo is over. Your client has something for ClientCall\\u2019s tracker.", "needs": ["a6-eval"], "link": null, "cp": "Chapter complete", "mc": "job:a6-locator", "node": "", "strand": "PR", "stats": ["POWER", "SPEED"], "syncXp": 75, "orbs": 15, "checkpointGate": false}]}], "interludes"')
rep('7 acts \\u00b7 28 quests','7 acts \\u00b7 29 quests')
n=len(re.findall(r'total:\s*28\b|"total":\s*28\b',h)); print('total fields',n)
h=re.sub(r'(total:\s*|"total":\s*)28\b',r'\g<1>29',h)
open('index.html','w').write(h); print('ok')
