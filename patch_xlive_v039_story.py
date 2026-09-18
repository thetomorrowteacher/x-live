# PATCH X-LIVE v0.39 -- Story Mode in the live room.
#
# Reporter: Ennis. Ask: "build story mode. X-Live will integrate with this
# as well."
#
# Root cause of what this closes: platform v233 shipped Story Mode -- a
# 28-quest campaign whose progress lives in app_data under pflx_story_<id>,
# and which broadcasts pflx_story_progress on every quest completion. X-Live
# ignored all of it, so a host running a live session had no idea where the
# room actually was in the season and no way to move them together.
#
# This adds a host-only STORY tab that reads every joined player's campaign
# row in ONE batched PostgREST call, shows act / percentage / next quest /
# story X-Coin, and lets the host push a story beat -- which rides the exact
# xlStampPush path the slide pusher already uses, so the platform's PiP
# pull-in fires for every joined player with no new plumbing.
#
# There is also a six-button STORY BEAT pad in SHOW CONTROL and in backstage,
# in both places, matching the two-site rule the announcer pad follows.
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else "index.html"

def apply_once(content, old, new, label):
    n = content.count(old)
    if n != 1:
        print("FAIL (%s): expected 1 occurrence, found %d" % (label, n))
        sys.exit(1)
    return content.replace(old, new, 1)

with open(PATH, "r", encoding="utf-8") as f:
    content = f.read()
orig_len = len(content)

if "PATCH X-LIVE v0.39" in content:
    print("OK -- already applied, no change. len=%d" % orig_len)
    sys.exit(0)

JS  = open("xlive_story_js.txt", encoding="utf-8").read()
CSS = open("xlive_story_css.txt", encoding="utf-8").read()

# 1. header note -- newest first, per house convention
content = apply_once(content,
    "     X-LIVE v0.38, Sept 17 2026",
    "     X-LIVE v0.39, Sept 18 2026 — PATCH X-LIVE v0.39: STORY MODE in the live\n"
    "     room. A host-only STORY tab reads every joined player's platform Story\n"
    "     Mode progress (app_data pflx_story_<id>) in one batched call and shows\n"
    "     act, percentage, next quest and story X-Coin; the host can push a story\n"
    "     beat, which rides the same xlStampPush path as a slide push so the\n"
    "     platform pull-in fires. A six-beat pad sits in SHOW CONTROL and backstage.\n"
    "\n"
    "     X-LIVE v0.38, Sept 17 2026",
    "header note")

# 2. the tab tuple, host only, right after TOOLS
content = apply_once(content,
    "['tools', '\U0001F3B2 TOOLS'], ['play', '\U0001F3AE PLAY'], ['feed',",
    "['tools', '\U0001F3B2 TOOLS'], ['story', '\U0001F4D6 STORY'], ['play', '\U0001F3AE PLAY'], ['feed',",
    "story tab tuple")

# 3. the render dispatch
content = apply_once(content,
    "tools: rTools, play: rPlay,",
    "tools: rTools, story: rStory, play: rPlay,",
    "story dispatch")

# 4. the module itself, in front of rTools so host tools stay together
content = apply_once(content,
    "\nfunction rTools() {",
    "\n" + JS + "\nfunction rTools() {",
    "story module")

# 5. styles
content = apply_once(content,
    "\n</style>",
    "\n" + CSS + "\n</style>",
    "story css")

# 6. the beat pad in SHOW CONTROL
content = apply_once(content,
    "xlFxPadHtml() + xlAnnPadHtml(s) + '</div>' +",
    "xlFxPadHtml() + xlAnnPadHtml(s) + xlStoryPadHtml(s) + '</div>' +",
    "story pad in show control")

# 7. and in backstage
content = apply_once(content,
    "xlFxPadHtml() + xlAnnPadHtml(s) + '</div>' : '') +",
    "xlFxPadHtml() + xlAnnPadHtml(s) + xlStoryPadHtml(s) + '</div>' : '') +",
    "story pad in backstage")

with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)
print("OK -- Story Mode applied (7 steps). %d -> %d chars (+%d)"
      % (orig_len, len(content), len(content) - orig_len))
