#!/usr/bin/env python3
# PATCH X-LIVE -- add Mission Control to the "PFLX Sub-App" activity type's
# app picker (Ennis: "I need you to create the Mission Control option",
# pointing at the ADD ACTIVITY -> WHICH PFLX APP? dropdown that only had
# Core Pathways/Battle Arena/DarkCampus).
#
# Mission Control has always been deliberately excluded here because it has
# no separate deployed URL -- it's native to preview.html (the Console),
# not a standalone Vercel app like the other three. Verified directly this
# patch: the Console's production URL (https://www.prototypeflx.com/,
# vercel.json's own rewrite of "/" -> preview.html) serves with
# `content-security-policy: frame-ancestors *` -- it is explicitly
# configured to allow being framed from anywhere, so a plain iframe embed
# (the exact same technique already used for the other three) works today,
# with no CSP blocker (unlike the earlier claude.ai artifact investigation,
# which hit a hard frame-ancestors 'self' wall).
#
# This ships the honest v1: the FULL Console (nav, login, everything) in
# the iframe -- not the dedicated chrome-free "just this Project" embed
# mode from the plan's Phase 3 (Host Interactive View), which is a much
# bigger, still-unscoped build (popup mini-activities, live badge-
# awarding, freeze/annotate toolkit). Exactly one place needed touching:
# PFLX_SUBAPPS is the single source every consumer (the dropdown, the
# actual iframe renderer) already reads from.
import sys

PATH = "index.html"

def apply_once(content, old, new, label):
    n = content.count(old)
    if n != 1:
        print("FAIL (%s): expected 1 occurrence, found %d" % (label, n))
        sys.exit(1)
    return content.replace(old, new, 1)

with open(PATH, "r", encoding="utf-8") as f:
    content = f.read()

orig_len = len(content)

# ── 1. SLIDE_TYPES comment -- was listing only the original three ──
content = apply_once(
    content,
    "  // First slice of the Host Interactive View epic (plan Phase 3) --\n"
    "  // embeds a whole PFLX sub-app (Core Pathways / Battle Arena /\n"
    "  // DarkCampus) as a session's focal point, same iframe technique as\n"
    "  // the embeds above. Picks the app from PFLX_SUBAPPS (sl.subApp), not\n"
    "  // a pasted URL/prompt.",
    "  // First slice of the Host Interactive View epic (plan Phase 3) --\n"
    "  // embeds a whole PFLX sub-app (Core Pathways / Battle Arena /\n"
    "  // DarkCampus / Mission Control) as a session's focal point, same\n"
    "  // iframe technique as the embeds above. Picks the app from\n"
    "  // PFLX_SUBAPPS (sl.subApp), not a pasted URL/prompt.",
    "slide_types_comment",
)

# ── 2. PFLX_SUBAPPS -- add Mission Control, pointed at the Console's real
#      production URL (verified this patch: frame-ancestors * allows it) ──
content = apply_once(
    content,
    "// The three PFLX sub-apps that are real, separately-deployed, already-\n"
    "// iframable apps (same URLs preview.html's own APP_BASE_URLS map uses).\n"
    "// Mission Control is NOT here -- it has no separate deployed URL, it's\n"
    "// native to preview.html itself, a different repo; embedding it needs a\n"
    "// dedicated chrome-free embed mode there, not this technique. See the\n"
    "// Handoff entry for this patch.\n"
    "var PFLX_SUBAPPS = {\n"
    "  pathways:   { label: 'Core Pathways', url: 'https://pflx-pathway-portal.vercel.app' },\n"
    "  arena:      { label: 'Battle Arena',   url: 'https://pflx-battle-arena.vercel.app' },\n"
    "  darkcampus: { label: 'DarkCampus',     url: 'https://pflx-darkcampus.vercel.app' }\n"
    "};",
    "// The PFLX sub-apps that are real, iframable apps (same URLs\n"
    "// preview.html's own APP_BASE_URLS map uses for the first three).\n"
    "// Mission Control has no SEPARATE deployed URL -- it's native to\n"
    "// preview.html itself (a different repo), so its entry points at that\n"
    "// same app's own production URL instead of a dedicated sub-app deploy.\n"
    "// Verified directly (PATCH X-LIVE, Mission Control sub-app): that URL\n"
    "// serves with `content-security-policy: frame-ancestors *` (see\n"
    "// pflx-platform/vercel.json), so it iframes cleanly with no CSP\n"
    "// blocker -- this embeds the FULL Console (nav/login and all), not a\n"
    "// dedicated chrome-free \"just this Project\" mode. That richer mode\n"
    "// (popup mini-activities, live badge-awarding, freeze/annotate) is\n"
    "// still the separate, unscoped Phase 3 Host Interactive View epic --\n"
    "// see the plan file. See the Handoff entry for this patch.\n"
    "var PFLX_SUBAPPS = {\n"
    "  pathways:      { label: 'Core Pathways',    url: 'https://pflx-pathway-portal.vercel.app' },\n"
    "  arena:         { label: 'Battle Arena',      url: 'https://pflx-battle-arena.vercel.app' },\n"
    "  darkcampus:    { label: 'DarkCampus',        url: 'https://pflx-darkcampus.vercel.app' },\n"
    "  missioncontrol: { label: 'Mission Control',  url: 'https://www.prototypeflx.com/', fullChrome: true }\n"
    "};",
    "pflx_subapps_add_missioncontrol",
)

# ── 3. subAppHtml editor note -- flag the full-chrome caveat only when
#      Mission Control specifically is the picked app ──
content = apply_once(
    content,
    "  const subAppHtml = (sl.type === 'sub_app') ? (\n"
    "    '<label style=\"margin-top:10px\">Which PFLX app?</label><select onchange=\"L.liveEditingSlide.slide.subApp=this.value\"><option value=\"\">Choose one…</option>' +\n"
    "    Object.keys(PFLX_SUBAPPS).map(function (k) { return '<option value=\"' + k + '\"' + (sl.subApp === k ? ' selected' : '') + '>' + esc(PFLX_SUBAPPS[k].label) + '</option>'; }).join('') +\n"
    "    '</select>' +\n"
    "    '<div style=\"font-size:11px;color:#8a93b8;margin-top:4px\">Embeds the app itself as this activity\\'s focal point. Popup mini-activities and live badge-awarding tied to it are not built yet.</div>'\n"
    "  ) : '';",
    "  const subAppHtml = (sl.type === 'sub_app') ? (\n"
    "    '<label style=\"margin-top:10px\">Which PFLX app?</label><select onchange=\"L.liveEditingSlide.slide.subApp=this.value\"><option value=\"\">Choose one…</option>' +\n"
    "    Object.keys(PFLX_SUBAPPS).map(function (k) { return '<option value=\"' + k + '\"' + (sl.subApp === k ? ' selected' : '') + '>' + esc(PFLX_SUBAPPS[k].label) + '</option>'; }).join('') +\n"
    "    '</select>' +\n"
    "    '<div style=\"font-size:11px;color:#8a93b8;margin-top:4px\">Embeds the app itself as this activity\\'s focal point. Popup mini-activities and live badge-awarding tied to it are not built yet.' +\n"
    "    ((sl.subApp && PFLX_SUBAPPS[sl.subApp] && PFLX_SUBAPPS[sl.subApp].fullChrome) ? ' This embeds the full Console (host signs in inside the frame, same as any other browser tab) -- not a focused, chrome-free view of one Project yet.' : '') +\n"
    "    '</div>'\n"
    "  ) : '';",
    "subapphtml_fullchrome_note",
)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("OK -- Mission Control sub-app patch applied. %d -> %d chars (+%d)" % (orig_len, len(content), len(content) - orig_len))
