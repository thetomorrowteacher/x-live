#!/usr/bin/env python3
# PATCH X-LIVE -- Host/Player view toggle (Ennis, screenshots of the
# Console's top toolbar circled near "RANK Partner": "I should be able to
# switch to player mode. I should then have a player dashboard with
# player functions. This should be the way that all of Host Dashboard
# works.").
#
# Found by reading pflx-platform-check/preview.html directly: the Console
# ALREADY has a real, working Host View / Player View toggle
# (#toolbar-role-toggle, pflxToggleRole()/pflxSetRole(), gated to
# admin/host/teacher/instructor roles by pflxInjectRolePill's isAdmin
# check) that already broadcasts a 'pflx_role_changed' postMessage to
# every sub-app iframe on every toggle. X-Live (this file) never listened
# for that message -- it only ever computed L.isHost once, at identity
# load, and never again. Meanwhile X-Live ALREADY has a complete, real
# player dashboard (rMe/rTheater/rBoards/rShop/rPlay, the tabs array at
# the `const tabs = L.isHost ? [...] : [...]` split) -- every tab and
# screen in the whole Host Dashboard already branches off this one
# L.isHost boolean, so wiring L.isHost to react to the Console's existing
# broadcast makes the ENTIRE Host Dashboard follow the toggle, with zero
# per-tab changes needed. This is the exact gap Phase 1f of the plan
# already flagged ("needs checking whether the existing mimic/role-toggle
# machinery already re-renders rLiveNative() correctly mid-session or
# needs live-session-specific wiring") -- turns out the gap is X-Live-wide,
# not just the live-session view, and the fix is the same either way.
#
# Deliberately NOT built here (needs Ennis's input, see the Handoff entry
# and the reply to him): a tiered permission model distinguishing "guest
# host" / "instructor host" ("specified host access") from full
# Partner/Owner host access. Today isHost is still a single boolean --
# the Console's own isAdmin gate treats admin/host/teacher/instructor
# identically, so there is no existing tiered-access concept anywhere in
# the real code to extend. Guessing at which specific tabs/actions a
# "guest host" vs "instructor host" should lose is a real access-control
# decision, not a default to assume.
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

# ── 1. Initial L state -- track the REAL (signed-identity-derived) host
#      status separately from the live-toggleable display state ──
content = apply_once(
    content,
    "  me: null, isHost: false, demo: !inPlatform,",
    "  me: null, isHost: false, realIsHost: false, demo: !inPlatform,",
    "L_state_realIsHost",
)

# ── 2. adoptFromParams() -- direct-SSO identity path ──
content = apply_once(
    content,
    "    L.me = { id: p.get('id') || '', brand: p.get('brand') || p.get('user') || 'Host', role: p.get('role') || 'Student' };\n"
    "    L.isHost = /admin|host|teacher|instructor/i.test(L.me.role) || p.get('host') === '1';\n",
    "    L.me = { id: p.get('id') || '', brand: p.get('brand') || p.get('user') || 'Host', role: p.get('role') || 'Student' };\n"
    "    L.isHost = /admin|host|teacher|instructor/i.test(L.me.role) || p.get('host') === '1';\n"
    "    L.realIsHost = L.isHost; // PATCH X-LIVE -- role-toggle; see pflxApplyRoleChange\n",
    "adoptFromParams_realIsHost",
)

# ── 3. pflx_identity_broadcast/response handler -- Console-embedded path ──
content = apply_once(
    content,
    "    L.me = { id: m.user.id, brand: m.user.brand || m.user.brandName || m.user.name, role: m.user.role || 'Student' };\n"
    "    L.isHost = /admin|host|teacher|instructor/i.test(L.me.role) || m.user.isHost === true;\n",
    "    L.me = { id: m.user.id, brand: m.user.brand || m.user.brandName || m.user.name, role: m.user.role || 'Student' };\n"
    "    L.isHost = /admin|host|teacher|instructor/i.test(L.me.role) || m.user.isHost === true;\n"
    "    L.realIsHost = L.isHost; // PATCH X-LIVE -- role-toggle; see pflxApplyRoleChange\n",
    "identity_broadcast_realIsHost",
)

# ── 4. New pure decision function + the 'pflx_role_changed' listener,
#      inserted right before the existing message listener so it's
#      available when the listener body below calls it ──
content = apply_once(
    content,
    "window.addEventListener('message', function (e) {",
    "// PATCH X-LIVE -- Host/Player view toggle. Pure decision function,\n"
    "// unit-testable without a DOM/message event: given the REAL (signed-\n"
    "// identity-derived) host status and an incoming 'pflx_role_changed'\n"
    "// role string from the Console's existing toolbar toggle, returns the\n"
    "// L.isHost value to apply, or null if the event should be ignored.\n"
    "// Fails closed -- a genuine player account can never be switched INTO\n"
    "// host view by this message (even a spoofed one), since only\n"
    "// realIsHost === true can ever move the display state to 'host'.\n"
    "function pflxApplyRoleChange(realIsHost, role) {\n"
    "  if (!realIsHost) return null;\n"
    "  if (role === 'player') return false;\n"
    "  if (role === 'host') return true;\n"
    "  return null;\n"
    "}\n"
    "window.pflxApplyRoleChange = pflxApplyRoleChange;\n\n"
    "window.addEventListener('message', function (e) {",
    "pflxApplyRoleChange_and_listener_anchor",
)

content = apply_once(
    content,
    "  if (m.type === 'pflx_player_changed' && m.player) {\n"
    "    const p = L.roster.find(r => r.id === m.player.id);\n"
    "    if (p) { p.xc = (typeof m.player.xc === 'number') ? m.player.xc : (m.player.xcoin || p.xc); p.totalXc = m.player.totalXcoin || p.totalXc; render(); }\n"
    "  }\n",
    "  if (m.type === 'pflx_player_changed' && m.player) {\n"
    "    const p = L.roster.find(r => r.id === m.player.id);\n"
    "    if (p) { p.xc = (typeof m.player.xc === 'number') ? m.player.xc : (m.player.xcoin || p.xc); p.totalXc = m.player.totalXcoin || p.totalXc; render(); }\n"
    "  }\n"
    "  // PATCH X-LIVE -- the Console's existing toolbar-role-toggle\n"
    "  // (pflxToggleRole()/pflxSetRole() in preview.html) already fans this\n"
    "  // out to every sub-app iframe on every click; this is the first time\n"
    "  // X-Live has listened for it. Since every tab/screen in this whole\n"
    "  // Host Dashboard already branches off L.isHost, reacting here alone\n"
    "  // makes the entire app follow the toggle.\n"
    "  if (m.type === 'pflx_role_changed' && m.role) {\n"
    "    const next = pflxApplyRoleChange(L.realIsHost, m.role);\n"
    "    if (next !== null && next !== L.isHost) {\n"
    "      L.isHost = next;\n"
    "      if (L.screen && !(L.isHost ? ['class', 'live', 'theater', 'teams', 'boards', 'tools', 'play', 'feed', 'setup'] : ['me', 'theater', 'boards', 'shop', 'play']).includes(L.screen)) L.screen = L.isHost ? 'class' : 'me';\n"
    "      render();\n"
    "    }\n"
    "  }\n",
    "pflx_role_changed_listener_body",
)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("OK -- role-toggle patch applied. %d -> %d chars (+%d)" % (orig_len, len(content), len(content) - orig_len))
