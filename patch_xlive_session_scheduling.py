#!/usr/bin/env python3
# PATCH X-LIVE -- Session scheduling: Start Time / End Time with a
# calendar-select + clock UI (Ennis, mid-turn on the Mission Control ask:
# "I should also be able to schedule it as well. Start time and End time
# with calendar select options and clock. I should be able to save
# multiple sessions."). Two screenshots showed the "NEW SESSION" form
# with no date/time fields.
#
# Multiple-session save was ALREADY true before this patch -- L.sessions
# is an array, "+ NEW SESSION" always creates a fresh session object with
# its own id (newLiveSession()), and liveSaveSessionForm() -> saveSession()
# is a merge-safe read-merge-write into that array (per
# pflx-persistence-guardrail), never a single-session overwrite. Nothing
# to fix there; this patch is purely additive (the two new fields).
#
# Native <input type="datetime-local"> is used for both fields -- it IS
# a combined calendar-select + clock control in every modern browser
# (desktop and mobile), matching the ask in one input instead of two, with
# zero new dependencies (same house convention as every other input in
# this file). This maps onto the plan's Phase 1g ("Real session
# scheduling... sess.scheduledStart... via a date/time picker") plus a
# second `scheduledEnd` field the plan hadn't specified but Ennis's
# message asks for directly. Per Phase 1g's own stated distinction: this
# is INFORMATIONAL/plannable only -- it does not auto-start or auto-end a
# session; the host still taps GO LIVE/END SESSION by hand. Auto-start
# raises its own moderation questions (a session going live with no host
# present) that haven't been discussed with Ennis, so this patch
# deliberately does not wire either field into liveGoLiveSession/
# liveEndSession's actual control flow -- it's display + soft validation
# only, staying honest about what it does today.
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

# ── 1. newLiveSession() -- add the two new fields, both empty strings
#      (unset) by default so nothing changes for an existing session
#      loaded before this patch (JS reads undefined/'' the same way) ──
content = apply_once(
    content,
    "function newLiveSession() {\n"
    "  return {\n"
    "    id: 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),\n"
    "    title: '', cohorts: [], allCohorts: true, slides: [],\n"
    "    rewards: { attendanceXc: 0, attendanceBadgeId: '', completionXc: 0, completionBadgeId: '' },\n"
    "    status: 'scheduled', liveParticipants: [], awardedTo: [],\n"
    "    createdAt: Date.now(), updatedAt: Date.now()\n"
    "  };\n"
    "}",
    "// PATCH X-LIVE -- session scheduling (Ennis: \"Start time and End time\n"
    "// with calendar select options and clock\"). Pure formatting/validation\n"
    "// helpers, no DOM/Date.now() dependency -- fully unit-testable given a\n"
    "// fixed pair of <input type=\"datetime-local\"> value strings.\n"
    "//\n"
    "// datetime-local values look like 'YYYY-MM-DDTHH:mm' with no timezone\n"
    "// suffix -- per the ECMAScript Date Time String spec, the `new Date(...)`\n"
    "// constructor parses that exact shape as LOCAL time (only a date-only\n"
    "// string like 'YYYY-MM-DD' is parsed as UTC), so this is reliable across\n"
    "// browsers and Node without any manual offset math.\n"
    "function pflxFormatSessionSchedule(startVal, endVal) {\n"
    "  var start = startVal ? new Date(startVal) : null;\n"
    "  var end = endVal ? new Date(endVal) : null;\n"
    "  if (start && isNaN(start.getTime())) start = null;\n"
    "  if (end && isNaN(end.getTime())) end = null;\n"
    "  if (!start && !end) return null;\n"
    "  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];\n"
    "  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];\n"
    "  function fmtTime(d) {\n"
    "    var h = d.getHours(), m = d.getMinutes();\n"
    "    var ap = h >= 12 ? 'PM' : 'AM';\n"
    "    var h12 = h % 12; if (h12 === 0) h12 = 12;\n"
    "    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;\n"
    "  }\n"
    "  function fmtDate(d) { return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(); }\n"
    "  if (start && end) {\n"
    "    var sameDay = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate();\n"
    "    if (sameDay) return fmtDate(start) + ' · ' + fmtTime(start) + ' – ' + fmtTime(end);\n"
    "    return fmtDate(start) + ' ' + fmtTime(start) + ' – ' + fmtDate(end) + ' ' + fmtTime(end);\n"
    "  }\n"
    "  if (start) return fmtDate(start) + ' · ' + fmtTime(start);\n"
    "  return 'Ends ' + fmtDate(end) + ' · ' + fmtTime(end);\n"
    "}\n"
    "window.pflxFormatSessionSchedule = pflxFormatSessionSchedule;\n"
    "// Soft validation only -- scheduling is informational (see the file\n"
    "// header comment on this patch), so this never blocks Save; it just\n"
    "// warns the host in the builder UI when End is at/before Start.\n"
    "function pflxSessionScheduleWarning(startVal, endVal) {\n"
    "  if (!startVal || !endVal) return null;\n"
    "  var s = new Date(startVal), e = new Date(endVal);\n"
    "  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;\n"
    "  if (e.getTime() <= s.getTime()) return 'End Time is before (or the same as) Start Time';\n"
    "  return null;\n"
    "}\n"
    "window.pflxSessionScheduleWarning = pflxSessionScheduleWarning;\n"
    "function newLiveSession() {\n"
    "  return {\n"
    "    id: 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),\n"
    "    title: '', cohorts: [], allCohorts: true, slides: [],\n"
    "    scheduledStart: '', scheduledEnd: '', // PATCH X-LIVE -- session scheduling; informational only, see comment above\n"
    "    rewards: { attendanceXc: 0, attendanceBadgeId: '', completionXc: 0, completionBadgeId: '' },\n"
    "    status: 'scheduled', liveParticipants: [], awardedTo: [],\n"
    "    createdAt: Date.now(), updatedAt: Date.now()\n"
    "  };\n"
    "}",
    "newLiveSession_add_schedule_fields",
)

# ── 2. rLiveBuilder() -- new "Schedule" card between "Who is this for?"
#      and "Session Rewards", using two datetime-local inputs ──
content = apply_once(
    content,
    "    '</div>' +\n"
    "    '<div class=\"card\" style=\"margin-top:14px\"><div class=\"cardT\">🎁 Session Rewards</div>' +",
    "    '</div>' +\n"
    "    '<div class=\"card\" style=\"margin-top:14px\"><div class=\"cardT\">🗓️ Schedule</div>' +\n"
    "    '<label>Start Time</label><input type=\"datetime-local\" value=\"' + esc(s.scheduledStart || '') + '\" onchange=\"L.liveEditingSession.scheduledStart=this.value;render()\"/>' +\n"
    "    '<label style=\"margin-top:8px\">End Time</label><input type=\"datetime-local\" value=\"' + esc(s.scheduledEnd || '') + '\" onchange=\"L.liveEditingSession.scheduledEnd=this.value;render()\"/>' +\n"
    "    (pflxSessionScheduleWarning(s.scheduledStart, s.scheduledEnd) ? '<div style=\"font-size:11px;color:#ff8a8a;margin-top:6px\">⚠ ' + esc(pflxSessionScheduleWarning(s.scheduledStart, s.scheduledEnd)) + '</div>' : '') +\n"
    "    '<div style=\"font-size:11px;color:#8a93b8;margin-top:6px\">Informational for now -- you still tap GO LIVE yourself when ready. This does not auto-start or auto-end the session.</div>' +\n"
    "    '</div>' +\n"
    "    '<div class=\"card\" style=\"margin-top:14px\"><div class=\"cardT\">🎁 Session Rewards</div>' +",
    "rlivebuilder_schedule_card",
)

# ── 3. rLiveList()'s sessionRow -- show the formatted schedule (if any)
#      under the slide-count line in the session list ──
content = apply_once(
    content,
    "  function sessionRow(s) {\n"
    "    const slideCount = (s.slides || []).length;\n"
    "    const scope = s.allCohorts ? 'All players' : ((s.cohorts || []).join(', ') || 'No cohort set');\n"
    "    const partCount = (s.liveParticipants || []).length;\n"
    "    return '<div class=\"feedrow\" style=\"align-items:center\">' +\n"
    "      '<div style=\"flex:1;min-width:0\"><b>' + esc(s.title || 'Untitled Session') + '</b>' +\n"
    "      '<div style=\"font-size:10px;color:#8a93b8\">' + slideCount + ' slide' + (slideCount === 1 ? '' : 's') + ' · ' + esc(scope) + (s.status === 'active' ? ' · ' + partCount + ' joined' : '') + '</div></div>' +\n"
    "      '<span class=\"t\" style=\"display:flex;gap:6px;flex-wrap:wrap\">' +",
    "  function sessionRow(s) {\n"
    "    const slideCount = (s.slides || []).length;\n"
    "    const scope = s.allCohorts ? 'All players' : ((s.cohorts || []).join(', ') || 'No cohort set');\n"
    "    const partCount = (s.liveParticipants || []).length;\n"
    "    const sched = pflxFormatSessionSchedule(s.scheduledStart, s.scheduledEnd);\n"
    "    return '<div class=\"feedrow\" style=\"align-items:center\">' +\n"
    "      '<div style=\"flex:1;min-width:0\"><b>' + esc(s.title || 'Untitled Session') + '</b>' +\n"
    "      '<div style=\"font-size:10px;color:#8a93b8\">' + slideCount + ' slide' + (slideCount === 1 ? '' : 's') + ' · ' + esc(scope) + (s.status === 'active' ? ' · ' + partCount + ' joined' : '') + '</div>' +\n"
    "      (sched ? '<div style=\"font-size:10px;color:#7dd3fc\">🗓️ ' + esc(sched) + '</div>' : '') +\n"
    "      '</div>' +\n"
    "      '<span class=\"t\" style=\"display:flex;gap:6px;flex-wrap:wrap\">' +",
    "sessionrow_show_schedule",
)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("OK -- session scheduling patch applied. %d -> %d chars (+%d)" % (orig_len, len(content), len(content) - orig_len))
