#!/usr/bin/env python3
# PATCH X-LIVE -- Tiered host access, part 1: capability gating
# (Ennis: "The player who receives Host access/privilege should have the
# host mode toggle. However, guest host or instructor host will have
# specified host access."). Answered via clarifying questions Sept 9:
#   - Guest Host: can build AND run sessions, but NOT rewards/scoring,
#     NOT delete a session, NOT Teams or Setup.
#   - Instructor Host: everything except Setup, AND scoped to their own
#     cohort(s) only (cohort scoping is PART 2 -- a separate patch, see
#     patch_xlive_host_cohort_scope.py -- this patch is capability tiers
#     only).
#   - Who grants access: "already exists in the Console's user roles" --
#     confirmed by reading pflx-platform-check/preview.html directly: it
#     already has a complete tier engine (hostTier() / TIER_META / CAP),
#     five tiers (guest/instructor/cohost/admin/master) assignable per
#     account via its Player Manager UI, with session.hostTier and
#     session.managedCohorts[] stored on the account record. Critically,
#     pflxBroadcastIdentity() already sends the FULL activeSession object
#     (hostTier/managedCohorts included) as `user` in the
#     'pflx_identity_broadcast' message every sub-app iframe (X-Live
#     included) already receives -- X-Live was just discarding those
#     fields (only reading id/brand/role). This patch reads them and
#     mirrors the Console's own hostTier() resolution order exactly, so
#     the two apps can never disagree about what tier an account holds.
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

# ── 1. Initial L state -- carries the resolved capability set alongside
#      isHost/realIsHost ──
content = apply_once(
    content,
    "  me: null, isHost: false, realIsHost: false, demo: !inPlatform,",
    "  me: null, isHost: false, realIsHost: false, hostCapabilities: null, demo: !inPlatform,",
    "L_state_hostCapabilities",
)

# ── 2. adoptFromParams() -- direct-SSO path (URL params only carry
#      role/host=1, no hostTier/managedCohorts -- tier resolves from
#      role, with host=1 kept as the existing full-host escape hatch) ──
content = apply_once(
    content,
    "    L.me = { id: p.get('id') || '', brand: p.get('brand') || p.get('user') || 'Host', role: p.get('role') || 'Student' };\n"
    "    L.isHost = /admin|host|teacher|instructor/i.test(L.me.role) || p.get('host') === '1';\n"
    "    L.realIsHost = L.isHost; // PATCH X-LIVE -- role-toggle; see pflxApplyRoleChange\n",
    "    L.me = { id: p.get('id') || '', brand: p.get('brand') || p.get('user') || 'Host', role: p.get('role') || 'Student' };\n"
    "    { // PATCH X-LIVE -- tiered host access; see pflxResolveHostTier/pflxHostCapabilities\n"
    "      var __tier = pflxResolveHostTier(L.me.role, null);\n"
    "      if (!__tier && p.get('host') === '1') __tier = 'admin'; // existing full-host escape hatch, unchanged\n"
    "      L.isHost = !!__tier;\n"
    "      L.hostCapabilities = pflxHostCapabilities(__tier);\n"
    "    }\n"
    "    L.realIsHost = L.isHost; // PATCH X-LIVE -- role-toggle; see pflxApplyRoleChange\n",
    "adoptFromParams_tiered_host",
)

# ── 3. pflx_identity_broadcast/response handler -- Console-embedded path.
#      m.user IS the Console's full activeSession object (per
#      pflxBroadcastIdentity() in preview.html), so hostTier/
#      managedCohorts are already present on it today -- just not read. ──
content = apply_once(
    content,
    "    L.me = { id: m.user.id, brand: m.user.brand || m.user.brandName || m.user.name, role: m.user.role || 'Student' };\n"
    "    L.isHost = /admin|host|teacher|instructor/i.test(L.me.role) || m.user.isHost === true;\n"
    "    L.realIsHost = L.isHost; // PATCH X-LIVE -- role-toggle; see pflxApplyRoleChange\n",
    "    L.me = { id: m.user.id, brand: m.user.brand || m.user.brandName || m.user.name, role: m.user.role || 'Student', hostTier: m.user.hostTier || null, managedCohorts: Array.isArray(m.user.managedCohorts) ? m.user.managedCohorts : [] };\n"
    "    { // PATCH X-LIVE -- tiered host access; see pflxResolveHostTier/pflxHostCapabilities\n"
    "      var __tier2 = pflxResolveHostTier(L.me.role, L.me.hostTier);\n"
    "      if (!__tier2 && m.user.isHost === true) __tier2 = 'admin'; // existing full-host escape hatch, unchanged\n"
    "      L.isHost = !!__tier2;\n"
    "      L.hostCapabilities = pflxHostCapabilities(__tier2);\n"
    "    }\n"
    "    L.realIsHost = L.isHost; // PATCH X-LIVE -- role-toggle; see pflxApplyRoleChange\n",
    "identity_broadcast_tiered_host",
)

# ── 4. New pure resolver/capability/tab-gate functions, inserted right
#      before the existing pflxApplyRoleChange (so they're defined before
#      anything above calls them) ──
content = apply_once(
    content,
    "// PATCH X-LIVE -- Host/Player view toggle. Pure decision function,",
    "// PATCH X-LIVE -- tiered host access. Mirrors the Console's own\n"
    "// hostTier() resolution (pflx-platform-check/preview.html) exactly: an\n"
    "// explicit hostTier field always wins; otherwise fall back to the\n"
    "// legacy role string in the SAME order (admin -> master, host ->\n"
    "// admin, instructor/teacher -> instructor). Returns null for a\n"
    "// non-host (a plain player). Reusing the Console's own resolution\n"
    "// order (rather than inventing a separate one) means the two apps can\n"
    "// never disagree about what tier an account holds.\n"
    "function pflxResolveHostTier(role, hostTier) {\n"
    "  var KNOWN = { guest: 1, instructor: 1, cohost: 1, admin: 1, master: 1 };\n"
    "  if (hostTier && KNOWN[hostTier]) return hostTier;\n"
    "  var r = String(role || '').toLowerCase().trim();\n"
    "  if (r === 'admin') return 'master';\n"
    "  if (r === 'host') return 'admin';\n"
    "  if (r === 'instructor' || r === 'teacher') return 'instructor';\n"
    "  return null;\n"
    "}\n"
    "window.pflxResolveHostTier = pflxResolveHostTier;\n\n"
    "var PFLX_HOST_TIER_RANK = { guest: 1, instructor: 2, cohost: 2, admin: 4, master: 5 };\n"
    "// X-Live's own capability set for a resolved tier, per Ennis's\n"
    "// confirmed scope (Sept 9): Guest Host can build AND run sessions, but\n"
    "// not touch rewards, delete a session, or reach Teams/Setup.\n"
    "// Instructor Host (and Co-Host, treated the same here -- X-Live\n"
    "// doesn't yet distinguish single-cohort Instructor from multi-cohort\n"
    "// Co-Host) gets everything except Setup; cohort SCOPING (which\n"
    "// sessions/roster they can actually see) is a separate patch, see\n"
    "// pflxSessionInCohortScope. Admin/Master (a full host, exactly\n"
    "// today's pre-patch behavior) get everything, unrestricted.\n"
    "function pflxHostCapabilities(tier) {\n"
    "  if (!tier) return null;\n"
    "  var rank = PFLX_HOST_TIER_RANK[tier] || 0;\n"
    "  return {\n"
    "    tier: tier,\n"
    "    buildSessions: rank >= 1,\n"
    "    runSessions: rank >= 1,\n"
    "    editRewards: rank >= 2,\n"
    "    deleteSessions: rank >= 2,\n"
    "    teamsTab: rank >= 2,\n"
    "    setupTab: rank >= 4,\n"
    "    scopedToCohorts: (tier === 'instructor' || tier === 'cohost')\n"
    "  };\n"
    "}\n"
    "window.pflxHostCapabilities = pflxHostCapabilities;\n\n"
    "// Whether a given Host Dashboard tab key should show for the current\n"
    "// capability set. Every tab not explicitly gated here (class/live/\n"
    "// theater/boards/tools/play/feed) stays open to every host tier --\n"
    "// only Teams and Setup were called out as full-admin-only in Ennis's\n"
    "// confirmed scope.\n"
    "function pflxHostTabAllowed(tabKey, caps) {\n"
    "  if (!caps) return true;\n"
    "  if (tabKey === 'setup') return !!caps.setupTab;\n"
    "  if (tabKey === 'teams') return !!caps.teamsTab;\n"
    "  return true;\n"
    "}\n"
    "window.pflxHostTabAllowed = pflxHostTabAllowed;\n\n"
    "// PATCH X-LIVE -- Host/Player view toggle. Pure decision function,",
    "insert_tier_functions",
)

# ── 5. Tab list -- filter Teams/Setup by capability ──
content = apply_once(
    content,
    "  const tabs = L.isHost\n"
    "    ? [['class', '🏫 CLASS'], ['live', '🔴 LIVE'], ['theater', '🎬 THEATER'], ['teams', '👥 TEAMS'], ['boards', '🏆 BOARDS'], ['tools', '🎲 TOOLS'], ['play', '🎮 PLAY'], ['feed', '📜 FEED'], ['setup', '⚙️ SETUP']]\n"
    "    : [['me', '🤖 MY EXO'], ['theater', '🎬 THEATER'], ['boards', '🏆 BOARDS'], ['shop', '🎁 UPGRADES'], ['play', '🎮 PLAY']];\n",
    "  const tabs = L.isHost\n"
    "    ? [['class', '🏫 CLASS'], ['live', '🔴 LIVE'], ['theater', '🎬 THEATER'], ['teams', '👥 TEAMS'], ['boards', '🏆 BOARDS'], ['tools', '🎲 TOOLS'], ['play', '🎮 PLAY'], ['feed', '📜 FEED'], ['setup', '⚙️ SETUP']].filter(function (t) { return pflxHostTabAllowed(t[0], L.hostCapabilities); })\n"
    "    : [['me', '🤖 MY EXO'], ['theater', '🎬 THEATER'], ['boards', '🏆 BOARDS'], ['shop', '🎁 UPGRADES'], ['play', '🎮 PLAY']];\n",
    "tabs_capability_filter",
)

# ── 6. sessionRow DELETE button -- Guest Host doesn't get it ──
content = apply_once(
    content,
    "      '<button class=\"bigbtn ghost\" style=\"padding:6px 10px;font-size:9px\" onclick=\"liveEditSession(\\'' + esc(s.id) + '\\')\">EDIT</button>' +\n"
    "      '<button class=\"bigbtn red\" style=\"padding:6px 10px;font-size:9px\" onclick=\"liveDeleteSessionPrompt(\\'' + esc(s.id) + '\\')\">DELETE</button>' +\n"
    "      '</span></div>';",
    "      '<button class=\"bigbtn ghost\" style=\"padding:6px 10px;font-size:9px\" onclick=\"liveEditSession(\\'' + esc(s.id) + '\\')\">EDIT</button>' +\n"
    "      ((L.hostCapabilities && L.hostCapabilities.deleteSessions) ? '<button class=\"bigbtn red\" style=\"padding:6px 10px;font-size:9px\" onclick=\"liveDeleteSessionPrompt(\\'' + esc(s.id) + '\\')\">DELETE</button>' : '') +\n"
    "      '</span></div>';",
    "delete_button_gated",
)

# ── 7. Session Rewards card in rLiveBuilder() -- Guest Host doesn't get it ──
content = apply_once(
    content,
    "    '<div class=\"card\" style=\"margin-top:14px\"><div class=\"cardT\">🎁 Session Rewards</div>' +\n"
    "    '<label>Attendance XC (granted on join)</label><input type=\"number\" value=\"' + (s.rewards.attendanceXc || 0) + '\" onchange=\"L.liveEditingSession.rewards.attendanceXc=parseInt(this.value)||0\"/>' +\n"
    "    '<label style=\"margin-top:8px\">Attendance Badge</label>' + badgeSelectHtml(s.rewards.attendanceBadgeId, 'L.liveEditingSession.rewards.attendanceBadgeId') +\n"
    "    '<label style=\"margin-top:8px\">Completion XC (granted on End)</label><input type=\"number\" value=\"' + (s.rewards.completionXc || 0) + '\" onchange=\"L.liveEditingSession.rewards.completionXc=parseInt(this.value)||0\"/>' +\n"
    "    '<label style=\"margin-top:8px\">Completion Badge</label>' + badgeSelectHtml(s.rewards.completionBadgeId, 'L.liveEditingSession.rewards.completionBadgeId') +\n"
    "    '</div>' +\n",
    "    ((L.hostCapabilities && L.hostCapabilities.editRewards) ? (\n"
    "    '<div class=\"card\" style=\"margin-top:14px\"><div class=\"cardT\">🎁 Session Rewards</div>' +\n"
    "    '<label>Attendance XC (granted on join)</label><input type=\"number\" value=\"' + (s.rewards.attendanceXc || 0) + '\" onchange=\"L.liveEditingSession.rewards.attendanceXc=parseInt(this.value)||0\"/>' +\n"
    "    '<label style=\"margin-top:8px\">Attendance Badge</label>' + badgeSelectHtml(s.rewards.attendanceBadgeId, 'L.liveEditingSession.rewards.attendanceBadgeId') +\n"
    "    '<label style=\"margin-top:8px\">Completion XC (granted on End)</label><input type=\"number\" value=\"' + (s.rewards.completionXc || 0) + '\" onchange=\"L.liveEditingSession.rewards.completionXc=parseInt(this.value)||0\"/>' +\n"
    "    '<label style=\"margin-top:8px\">Completion Badge</label>' + badgeSelectHtml(s.rewards.completionBadgeId, 'L.liveEditingSession.rewards.completionBadgeId') +\n"
    "    '</div>'\n"
    "    ) : '') +\n",
    "rewards_card_gated",
)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("OK -- host tiers (capability gating) patch applied. %d -> %d chars (+%d)" % (orig_len, len(content), len(content) - orig_len))
