#!/usr/bin/env python3
# PATCH X-LIVE -- Tiered host access, part 2: cohort scoping for a
# scoped host (Guest Host / Instructor Host / Co-Host). Part 1
# (capability gating -- guest/instructor/admin/master, Teams/Setup/
# Rewards/Delete gating) shipped already; this patch is the "scoped to
# their own cohort(s)" half, using the managedCohorts[] Part 1 already
# reads off the identity payload.
#
# CORRECTION to Part 1, folded in here (Ennis, mid-build, Sept 9):
# "Guest Host only has host control of a Project in MC and a Cohort
# manager. Instructor can have control of multiple Programs, and
# Projects and cohorts or organizations." Part 1 shipped with
# `scopedToCohorts: (tier === 'instructor' || tier === 'cohost')` --
# Guest was left UNSCOPED for X-Live purposes (any cohort, or even All
# Players). That's wrong per this message: Guest Host is scoped to ONE
# cohort too (alongside their one MC Project, a Console-side dimension
# X-Live doesn't model). Instructor/Co-Host's "multiple cohorts" was
# already correct (managedCohorts[] is an array either way -- the
# difference is only how many entries the Console's Player Manager
# assigns, not a mechanism change). Fixed as step 1 below, before wiring
# the actual scoping logic that depends on it being right.
#
# "An All Players session spans every cohort" is the one remaining real
# judgment call not asked about directly: a scoped host (guest OR
# instructor/cohost) cannot see/manage one, since it isn't scoped to any
# single cohort they could own. Flagged plainly in the Handoff so Ennis
# can correct it if he wants otherwise.
#
# Scoping is enforced at TWO layers, matching the "fail closed" pattern
# used for the earlier role-toggle patch: (1) the session LIST only shows
# in-scope sessions to a scoped host, and (2) every action function that
# looks a session up by id directly (liveEditSession/liveGoLiveSession/
# liveManageSession/liveDeleteSessionPrompt) independently re-checks scope
# -- so a scoped host can't reach an out-of-scope session through a direct
# call (e.g. the Console's 'open_session'-by-code handoff) even though the
# list never showed it to them.
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

# ── 0. CORRECTION -- Guest Host is cohort-scoped too, not just
#      capability-restricted (see the file header comment above) ──
content = apply_once(
    content,
    "    scopedToCohorts: (tier === 'instructor' || tier === 'cohost')\n",
    "    scopedToCohorts: (tier === 'guest' || tier === 'instructor' || tier === 'cohost') // PATCH X-LIVE -- corrected part 2: Guest is cohort-scoped too, see file header\n",
    "guest_scopedToCohorts_correction",
)

# ── 1. Pure scope functions, inserted right before pflxResolveHostTier
#      (Part 1's first new function) so they sit together ──
content = apply_once(
    content,
    "// PATCH X-LIVE -- tiered host access. Mirrors the Console's own\n"
    "// hostTier() resolution (pflx-platform-check/preview.html) exactly:",
    "// PATCH X-LIVE -- tiered host access, part 2: cohort scoping. Pure,\n"
    "// unit-testable without any DOM/session state: given a session and a\n"
    "// scoped host's managedCohorts[], decides whether that session is in\n"
    "// their scope. An 'All Players' session spans every cohort -- treated\n"
    "// as explicitly OUT of a scoped host's reach, not implicitly included\n"
    "// (see the file header comment on this patch). A scoped host with an\n"
    "// empty managedCohorts[] (assigned the tier but no cohort yet) manages\n"
    "// nothing -- strict, matching the Console's own scopeAssigned()\n"
    "// semantics rather than failing open.\n"
    "function pflxSessionInCohortScope(session, managedCohorts) {\n"
    "  if (!session) return false;\n"
    "  if (session.allCohorts) return false;\n"
    "  var mine = (managedCohorts || []).map(function (c) { return String(c).toLowerCase(); });\n"
    "  if (!mine.length) return false;\n"
    "  var theirs = (session.cohorts || []).map(function (c) { return String(c).toLowerCase(); });\n"
    "  return theirs.some(function (c) { return mine.indexOf(c) !== -1; });\n"
    "}\n"
    "window.pflxSessionInCohortScope = pflxSessionInCohortScope;\n\n"
    "// Filters a session list down to what a host may see. An unscoped\n"
    "// tier (admin/master, or a non-cohort-scoped guest) sees everything,\n"
    "// unchanged from before this patch; a cohort-scoped tier\n"
    "// (instructor/cohost) sees only in-scope sessions.\n"
    "function pflxVisibleSessions(sessions, caps, managedCohorts) {\n"
    "  if (!caps || !caps.scopedToCohorts) return sessions || [];\n"
    "  return (sessions || []).filter(function (s) { return pflxSessionInCohortScope(s, managedCohorts); });\n"
    "}\n"
    "window.pflxVisibleSessions = pflxVisibleSessions;\n\n"
    "// PATCH X-LIVE -- tiered host access. Mirrors the Console's own\n"
    "// hostTier() resolution (pflx-platform-check/preview.html) exactly:",
    "insert_cohort_scope_functions",
)

# ── 2. rLiveList() -- filter the session list itself ──
content = apply_once(
    content,
    "function rLiveList() {\n"
    "  const active = (L.sessions || []).filter(function (s) { return s.status !== 'archived'; });\n",
    "function rLiveList() {\n"
    "  const active = pflxVisibleSessions((L.sessions || []).filter(function (s) { return s.status !== 'archived'; }), L.hostCapabilities, L.me && L.me.managedCohorts);\n",
    "rLiveList_scope_filter",
)

# ── 3. liveNewSession() -- a scoped host's new session defaults to their
#      own cohort(s), never "All players" ──
content = apply_once(
    content,
    "function liveNewSession() { L.liveEditingSession = newLiveSession(); render(); }",
    "function liveNewSession() {\n"
    "  const s = newLiveSession();\n"
    "  if (L.hostCapabilities && L.hostCapabilities.scopedToCohorts) {\n"
    "    s.allCohorts = false;\n"
    "    s.cohorts = (L.me && Array.isArray(L.me.managedCohorts)) ? L.me.managedCohorts.slice() : [];\n"
    "  }\n"
    "  L.liveEditingSession = s;\n"
    "  render();\n"
    "}",
    "liveNewSession_scoped_default",
)

# ── 4. liveEditSession() -- re-check scope for a direct-by-id call ──
content = apply_once(
    content,
    "function liveEditSession(id) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === id; });\n"
    "  if (!s) return;\n"
    "  L.liveEditingSession = JSON.parse(JSON.stringify(s)); // edit a working copy; only Save commits it\n"
    "  render();\n"
    "}",
    "function liveEditSession(id) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === id; });\n"
    "  if (!s) return;\n"
    "  if (L.hostCapabilities && L.hostCapabilities.scopedToCohorts && !pflxSessionInCohortScope(s, L.me && L.me.managedCohorts)) { toast(\"That session is outside your assigned cohort(s)\"); return; }\n"
    "  L.liveEditingSession = JSON.parse(JSON.stringify(s)); // edit a working copy; only Save commits it\n"
    "  render();\n"
    "}",
    "liveEditSession_scope_check",
)

# ── 5. liveDeleteSessionPrompt() -- re-check both delete capability and
#      scope for a direct-by-id call ──
content = apply_once(
    content,
    "function liveDeleteSessionPrompt(id) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === id; });\n"
    "  if (!s) return;\n"
    "  modal(",
    "function liveDeleteSessionPrompt(id) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === id; });\n"
    "  if (!s) return;\n"
    "  if (!(L.hostCapabilities && L.hostCapabilities.deleteSessions)) { toast(\"You don't have permission to delete sessions\"); return; }\n"
    "  if (L.hostCapabilities.scopedToCohorts && !pflxSessionInCohortScope(s, L.me && L.me.managedCohorts)) { toast(\"That session is outside your assigned cohort(s)\"); return; }\n"
    "  modal(",
    "liveDeleteSessionPrompt_scope_check",
)

# ── 6. liveGoLiveSession() -- re-check scope for a direct-by-id call ──
content = apply_once(
    content,
    "async function liveGoLiveSession(id) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === id; }); if (!s) return;\n"
    "  if (!s.slides || !s.slides.length) { toast('Add at least one slide before going live'); return; }\n",
    "async function liveGoLiveSession(id) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === id; }); if (!s) return;\n"
    "  if (L.hostCapabilities && L.hostCapabilities.scopedToCohorts && !pflxSessionInCohortScope(s, L.me && L.me.managedCohorts)) { toast(\"That session is outside your assigned cohort(s)\"); return; }\n"
    "  if (!s.slides || !s.slides.length) { toast('Add at least one slide before going live'); return; }\n",
    "liveGoLiveSession_scope_check",
)

# ── 7. liveManageSession() -- re-check scope for a direct-by-id call ──
content = apply_once(
    content,
    "function liveManageSession(id) { L.liveRunningSessionId = id; render(); }",
    "function liveManageSession(id) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === id; });\n"
    "  if (L.hostCapabilities && L.hostCapabilities.scopedToCohorts && s && !pflxSessionInCohortScope(s, L.me && L.me.managedCohorts)) { toast(\"That session is outside your assigned cohort(s)\"); return; }\n"
    "  L.liveRunningSessionId = id; render();\n"
    "}",
    "liveManageSession_scope_check",
)

# ── 8. rLiveBuilder() -- restrict the "Who is this for?" picker for a
#      scoped host: their own cohorts only, no "All players" option ──
content = apply_once(
    content,
    "function rLiveBuilder() {\n"
    "  const s = L.liveEditingSession;\n"
    "  const cs = cohortList();\n"
    "  return '<div class=\"card\">' +\n",
    "function rLiveBuilder() {\n"
    "  const s = L.liveEditingSession;\n"
    "  const scoped = !!(L.hostCapabilities && L.hostCapabilities.scopedToCohorts);\n"
    "  const cs = scoped ? ((L.me && Array.isArray(L.me.managedCohorts)) ? L.me.managedCohorts.slice() : []) : cohortList();\n"
    "  return '<div class=\"card\">' +\n",
    "rLiveBuilder_scoped_cohort_list",
)

content = apply_once(
    content,
    "    '<label style=\"margin-top:10px\">Who is this for?</label>' +\n"
    "    '<div style=\"display:flex;gap:14px;align-items:center;margin-top:4px\"><label style=\"display:flex;gap:6px;align-items:center;text-transform:none;font-family:inherit;font-size:13px\"><input type=\"checkbox\" style=\"width:auto\" ' + (s.allCohorts ? 'checked' : '') + ' onchange=\"L.liveEditingSession.allCohorts=this.checked;render()\"/> All players</label></div>' +\n",
    "    '<label style=\"margin-top:10px\">Who is this for?</label>' +\n"
    "    (scoped\n"
    "      ? '<div style=\"font-size:12px;color:#8a93b8;margin-top:4px\">🔒 Scoped to your assigned cohort(s) -- you can\\'t create an All Players session.</div>'\n"
    "      : '<div style=\"display:flex;gap:14px;align-items:center;margin-top:4px\"><label style=\"display:flex;gap:6px;align-items:center;text-transform:none;font-family:inherit;font-size:13px\"><input type=\"checkbox\" style=\"width:auto\" ' + (s.allCohorts ? 'checked' : '') + ' onchange=\"L.liveEditingSession.allCohorts=this.checked;render()\"/> All players</label></div>') +\n",
    "rLiveBuilder_lock_all_players",
)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("OK -- host cohort-scope (part 2, incl. guest correction) patch applied. %d -> %d chars (+%d)" % (orig_len, len(content), len(content) - orig_len))
