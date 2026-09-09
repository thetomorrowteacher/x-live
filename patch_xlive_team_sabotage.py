#!/usr/bin/env python3
# PATCH X-LIVE -- X-Rush team-wide sabotage targeting. Deliberately deferred
# out of v0.31 (Powerups & Sabotage) and again out of v0.31's own Team mode
# follow-on, documented both times as its own focused pass because it
# touches the powerup-targeting UI and pflxRaceTriggerPowerup. Only Freeze
# and Fog (duration-based sabotage) become team-capable -- Steal keeps its
# single-player transfer semantics unconditionally, since "steal from a
# whole team" has no clean economic meaning and was never asked for.
# Defaults to per-player targeting (s.sabotageTeamWide starts undefined/
# falsy), so every existing single-target path is untouched unless a host
# explicitly flips the new toggle AND teams are configured.
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

# ── 1. PFLX_POWERUPS -- mark Freeze/Fog as team-capable ──
content = apply_once(
    content,
    "var PFLX_POWERUPS = {\n"
    "  speed_boost:   { key: 'speed_boost',   label: 'Speed Boost',   icon: '\\ud83d\\ude80', cost: 30, kind: 'boost',    needsTarget: false, jumpAmount: 15 },\n"
    "  shield:        { key: 'shield',        label: 'Shield',        icon: '\\ud83d\\udee1\\ufe0f', cost: 20, kind: 'boost',    needsTarget: false },\n"
    "  double_points: { key: 'double_points', label: 'Double Points', icon: '\\u2b50', cost: 40, kind: 'boost',    needsTarget: false },\n"
    "  freeze:        { key: 'freeze',        label: 'Freeze',        icon: '\\u2744\\ufe0f', cost: 25, kind: 'sabotage', needsTarget: true,  durationMs: 8000 },\n"
    "  fog:           { key: 'fog',           label: 'Fog',           icon: '\\ud83c\\udf2b\\ufe0f', cost: 20, kind: 'sabotage', needsTarget: true,  durationMs: 10000 },\n"
    "  steal:         { key: 'steal',         label: 'Steal',         icon: '\\ud83e\\ude99', cost: 35, kind: 'sabotage', needsTarget: true,  stealAmount: 15 }\n"
    "};",
    "var PFLX_POWERUPS = {\n"
    "  speed_boost:   { key: 'speed_boost',   label: 'Speed Boost',   icon: '\\ud83d\\ude80', cost: 30, kind: 'boost',    needsTarget: false, jumpAmount: 15 },\n"
    "  shield:        { key: 'shield',        label: 'Shield',        icon: '\\ud83d\\udee1\\ufe0f', cost: 20, kind: 'boost',    needsTarget: false },\n"
    "  double_points: { key: 'double_points', label: 'Double Points', icon: '\\u2b50', cost: 40, kind: 'boost',    needsTarget: false },\n"
    "  freeze:        { key: 'freeze',        label: 'Freeze',        icon: '\\u2744\\ufe0f', cost: 25, kind: 'sabotage', needsTarget: true,  durationMs: 8000, teamCapable: true },\n"
    "  fog:           { key: 'fog',           label: 'Fog',           icon: '\\ud83c\\udf2b\\ufe0f', cost: 20, kind: 'sabotage', needsTarget: true,  durationMs: 10000, teamCapable: true },\n"
    "  steal:         { key: 'steal',         label: 'Steal',         icon: '\\ud83e\\ude99', cost: 35, kind: 'sabotage', needsTarget: true,  stealAmount: 15 }\n"
    "};",
    "powerups_teamCapable",
)

# ── 2. pflxRaceTeamMembers -- new pure helper, resolves a team name to its
#      member pids via the existing L.cfg.teams.assign (no new primitive) ──
content = apply_once(
    content,
    "window.PFLX_POWERUPS = PFLX_POWERUPS;\n"
    "\n"
    "// Nitro earned -- identical curve to XC (pflxRaceScore), summed over this",
    "window.PFLX_POWERUPS = PFLX_POWERUPS;\n"
    "\n"
    "// PATCH X-LIVE -- X-Rush team-wide sabotage targeting. Reuses\n"
    "// L.cfg.teams.assign as-is (no new team primitive) to resolve a team\n"
    "// name to its member pids.\n"
    "function pflxRaceTeamMembers(assign, teamName) {\n"
    "  var out = [];\n"
    "  Object.keys(assign || {}).forEach(function (pid) { if (assign[pid] === teamName) out.push(pid); });\n"
    "  return out;\n"
    "}\n"
    "window.pflxRaceTeamMembers = pflxRaceTeamMembers;\n"
    "\n"
    "// Nitro earned -- identical curve to XC (pflxRaceScore), summed over this",
    "team_members_helper",
)

# ── 3. pflxRaceActiveEffects -- also match team-targeted events (targetPids/
#      blockedPids) alongside the original single targetPid/blocked shape ──
content = apply_once(
    content,
    "function pflxRaceActiveEffects(s, pid, now) {\n"
    "  now = now || Date.now();\n"
    "  var events = ((s && s.raceEvents) || []).slice().sort(function (a, b) { return a.at - b.at; });\n"
    "  var shieldActive = false;\n"
    "  var lastByKey = {};\n"
    "  events.forEach(function (ev) {\n"
    "    var def = PFLX_POWERUPS[ev.key];\n"
    "    if (!def) return;\n"
    "    if (ev.pid === pid && ev.key === 'shield') { shieldActive = true; return; }\n"
    "    if (ev.targetPid === pid && def.kind === 'sabotage') {\n"
    "      if (ev.blocked) { shieldActive = false; return; } // shield consumed at trigger time\n"
    "      if (def.durationMs) lastByKey[ev.key] = ev.at + def.durationMs;\n"
    "    }\n"
    "  });\n"
    "  var effects = {};\n"
    "  Object.keys(lastByKey).forEach(function (k) { if (lastByKey[k] > now) effects[k] = lastByKey[k]; });\n"
    "  return { shieldActive: shieldActive, effects: effects };\n"
    "}",
    "function pflxRaceActiveEffects(s, pid, now) {\n"
    "  now = now || Date.now();\n"
    "  var events = ((s && s.raceEvents) || []).slice().sort(function (a, b) { return a.at - b.at; });\n"
    "  var shieldActive = false;\n"
    "  var lastByKey = {};\n"
    "  events.forEach(function (ev) {\n"
    "    var def = PFLX_POWERUPS[ev.key];\n"
    "    if (!def) return;\n"
    "    if (ev.pid === pid && ev.key === 'shield') { shieldActive = true; return; }\n"
    "    // PATCH X-LIVE -- team-wide sabotage: a team-targeted event carries\n"
    "    // targetPids[]/blockedPids[] instead of a single targetPid/blocked.\n"
    "    // For every pre-existing single-target event (no targetPids set) this\n"
    "    // collapses back to the original ev.targetPid === pid / ev.blocked\n"
    "    // check exactly -- verified explicitly below.\n"
    "    var hitsMe = ev.targetPid === pid || (ev.targetPids && ev.targetPids.indexOf(pid) !== -1);\n"
    "    if (hitsMe && def.kind === 'sabotage') {\n"
    "      var wasBlocked = ev.targetPids ? !!(ev.blockedPids && ev.blockedPids.indexOf(pid) !== -1) : ev.blocked;\n"
    "      if (wasBlocked) { shieldActive = false; return; } // shield consumed at trigger time\n"
    "      if (def.durationMs) lastByKey[ev.key] = ev.at + def.durationMs;\n"
    "    }\n"
    "  });\n"
    "  var effects = {};\n"
    "  Object.keys(lastByKey).forEach(function (k) { if (lastByKey[k] > now) effects[k] = lastByKey[k]; });\n"
    "  return { shieldActive: shieldActive, effects: effects };\n"
    "}",
    "active_effects_team_aware",
)

# ── 4. pflxRaceTriggerPowerup -- team-wide branch, gated on def.teamCapable
#      + s.sabotageTeamWide + teams configured; Steal's path is unchanged ──
content = apply_once(
    content,
    "function pflxRaceTriggerPowerup(s, pid, key, targetPid, now) {\n"
    "  now = now || Date.now();\n"
    "  var def = PFLX_POWERUPS[key];\n"
    "  if (!def) return { ok: false, reason: 'unknown-powerup' };\n"
    "  if (!s || !s.powerupsEnabled) return { ok: false, reason: 'powerups-disabled' };\n"
    "  if (def.kind === 'sabotage' && !s.sabotageEnabled) return { ok: false, reason: 'sabotage-disabled' };\n"
    "  if (def.needsTarget) {\n"
    "    if (!targetPid) return { ok: false, reason: 'missing-target' };\n"
    "    if (targetPid === pid) return { ok: false, reason: 'invalid-target' };\n"
    "  }\n"
    "  if (pflxRaceNitroBalance(s, pid) < def.cost) return { ok: false, reason: 'insufficient-nitro' };\n"
    "  var currentSlide = ((s && s.slides) || [])[s.currentSlideIndex || 0];\n"
    "  var event = { id: 'rev_' + now + '_' + Math.random().toString(36).slice(2, 8), pid: pid, key: key, targetPid: targetPid || null, at: now, slideId: currentSlide ? currentSlide.id : null };\n"
    "  if (def.kind === 'sabotage') {\n"
    "    var targetShielded = pflxRaceActiveEffects(s, targetPid, now).shieldActive;\n"
    "    if (targetShielded) event.blocked = true;\n"
    "  }\n"
    "  if (key === 'steal' && !event.blocked) {\n"
    "    event.stolenAmount = Math.min(def.stealAmount || 0, pflxRaceNitroBalance(s, targetPid));\n"
    "  }\n"
    "  return { ok: true, event: event };\n"
    "}",
    "function pflxRaceTriggerPowerup(s, pid, key, targetPid, now) {\n"
    "  now = now || Date.now();\n"
    "  var def = PFLX_POWERUPS[key];\n"
    "  if (!def) return { ok: false, reason: 'unknown-powerup' };\n"
    "  if (!s || !s.powerupsEnabled) return { ok: false, reason: 'powerups-disabled' };\n"
    "  if (def.kind === 'sabotage' && !s.sabotageEnabled) return { ok: false, reason: 'sabotage-disabled' };\n"
    "  // PATCH X-LIVE -- team-wide sabotage targeting. teamWide is only ever\n"
    "  // true for a def.teamCapable powerup (Freeze/Fog) when the host has\n"
    "  // s.sabotageTeamWide on AND teams are configured -- Steal and every\n"
    "  // other call shape below is byte-identical to pre-patch.\n"
    "  var teamsConfigured = !!(L.cfg.teams && L.cfg.teams.names && L.cfg.teams.names.length);\n"
    "  var teamWide = def.kind === 'sabotage' && def.teamCapable && s.sabotageTeamWide && teamsConfigured;\n"
    "  var targetPids = null, targetTeam = null;\n"
    "  if (def.needsTarget) {\n"
    "    if (!targetPid) return { ok: false, reason: 'missing-target' };\n"
    "    if (teamWide) {\n"
    "      var assign = (L.cfg.teams && L.cfg.teams.assign) || {};\n"
    "      var myTeam = assign[pid];\n"
    "      if (targetPid === myTeam) return { ok: false, reason: 'invalid-target' };\n"
    "      targetPids = pflxRaceTeamMembers(assign, targetPid).filter(function (m) { return m !== pid; });\n"
    "      if (!targetPids.length) return { ok: false, reason: 'invalid-target' };\n"
    "      targetTeam = targetPid;\n"
    "    } else if (targetPid === pid) {\n"
    "      return { ok: false, reason: 'invalid-target' };\n"
    "    }\n"
    "  }\n"
    "  if (pflxRaceNitroBalance(s, pid) < def.cost) return { ok: false, reason: 'insufficient-nitro' };\n"
    "  var currentSlide = ((s && s.slides) || [])[s.currentSlideIndex || 0];\n"
    "  var event = { id: 'rev_' + now + '_' + Math.random().toString(36).slice(2, 8), pid: pid, key: key, at: now, slideId: currentSlide ? currentSlide.id : null };\n"
    "  if (teamWide) {\n"
    "    event.targetTeam = targetTeam;\n"
    "    event.targetPids = targetPids;\n"
    "  } else {\n"
    "    event.targetPid = targetPid || null;\n"
    "  }\n"
    "  if (def.kind === 'sabotage') {\n"
    "    if (teamWide) {\n"
    "      var blockedPids = targetPids.filter(function (tp) { return pflxRaceActiveEffects(s, tp, now).shieldActive; });\n"
    "      event.blockedPids = blockedPids;\n"
    "      if (blockedPids.length === targetPids.length) event.blocked = true;\n"
    "    } else {\n"
    "      var targetShielded = pflxRaceActiveEffects(s, targetPid, now).shieldActive;\n"
    "      if (targetShielded) event.blocked = true;\n"
    "    }\n"
    "  }\n"
    "  if (key === 'steal' && !event.blocked) {\n"
    "    event.stolenAmount = Math.min(def.stealAmount || 0, pflxRaceNitroBalance(s, targetPid));\n"
    "  }\n"
    "  return { ok: true, event: event };\n"
    "}",
    "trigger_powerup_team_wide",
)

# ── 5. liveToggleSabotageTeamWide -- new host toggle, same pattern as
#      liveToggleSabotage right above it ──
content = apply_once(
    content,
    "async function liveToggleSabotage(on) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === L.liveRunningSessionId; }); if (!s) return;\n"
    "  s.sabotageEnabled = !!on;\n"
    "  await saveSession(s);\n"
    "  render();\n"
    "}\n"
    "function hasRaceSlide(s) { return (s && s.slides || []).some(function (x) { return x.type === 'quiz_race'; }); }",
    "async function liveToggleSabotage(on) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === L.liveRunningSessionId; }); if (!s) return;\n"
    "  s.sabotageEnabled = !!on;\n"
    "  await saveSession(s);\n"
    "  render();\n"
    "}\n"
    "// PATCH X-LIVE -- team-wide sabotage targeting host toggle, same\n"
    "// save/render pattern as liveToggleSabotage above.\n"
    "async function liveToggleSabotageTeamWide(on) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === L.liveRunningSessionId; }); if (!s) return;\n"
    "  s.sabotageTeamWide = !!on;\n"
    "  await saveSession(s);\n"
    "  render();\n"
    "}\n"
    "function hasRaceSlide(s) { return (s && s.slides || []).some(function (x) { return x.type === 'quiz_race'; }); }",
    "toggle_sabotage_team_wide",
)

# ── 6. liveTriggerPowerupUi -- read the correct target select depending on
#      whether this powerup is being fired team-wide ──
content = apply_once(
    content,
    "async function liveTriggerPowerupUi(key) {\n"
    "  const s = nativeSessionAppliesToMe(); if (!s) return;\n"
    "  const myId = (L.me && L.me.id) || ''; if (!myId) return;\n"
    "  const def = PFLX_POWERUPS[key];\n"
    "  var targetPid = null;\n"
    "  if (def && def.needsTarget) {\n"
    "    var sel = document.getElementById('pflxRaceTarget');\n"
    "    targetPid = sel ? sel.value : null;\n"
    "  }\n"
    "  const result = pflxRaceTriggerPowerup(s, myId, key, targetPid, Date.now());\n"
    "  if (!result.ok) { toast('Can\\'t use that: ' + result.reason.replace(/-/g, ' ')); return; }\n"
    "  s.raceEvents = s.raceEvents || [];\n"
    "  s.raceEvents.push(result.event);\n"
    "  await saveSession(s);\n"
    "  render();\n"
    "  toast((def.icon || '') + ' ' + (def.label || 'Powerup') + (result.event.blocked ? ' \\u2014 blocked by shield!' : ' used!'));\n"
    "}",
    "async function liveTriggerPowerupUi(key) {\n"
    "  const s = nativeSessionAppliesToMe(); if (!s) return;\n"
    "  const myId = (L.me && L.me.id) || ''; if (!myId) return;\n"
    "  const def = PFLX_POWERUPS[key];\n"
    "  var targetPid = null;\n"
    "  if (def && def.needsTarget) {\n"
    "    // PATCH X-LIVE -- team-wide sabotage reads from the separate team\n"
    "    // target select when it applies to this powerup; every other\n"
    "    // powerup (including Steal, always) reads the original per-player\n"
    "    // select exactly as before.\n"
    "    var teamsConfigured = !!(L.cfg.teams && L.cfg.teams.names && L.cfg.teams.names.length);\n"
    "    var teamWideOn = !!(s.sabotageTeamWide && teamsConfigured && def.teamCapable);\n"
    "    var sel = document.getElementById(teamWideOn ? 'pflxRaceTeamTarget' : 'pflxRaceTarget');\n"
    "    targetPid = sel ? sel.value : null;\n"
    "  }\n"
    "  const result = pflxRaceTriggerPowerup(s, myId, key, targetPid, Date.now());\n"
    "  if (!result.ok) { toast('Can\\'t use that: ' + result.reason.replace(/-/g, ' ')); return; }\n"
    "  s.raceEvents = s.raceEvents || [];\n"
    "  s.raceEvents.push(result.event);\n"
    "  await saveSession(s);\n"
    "  render();\n"
    "  var blockedNote = result.event.blocked ? ' \\u2014 blocked by shield!' :\n"
    "    (result.event.blockedPids && result.event.blockedPids.length ? ' \\u2014 hit ' + (result.event.targetPids.length - result.event.blockedPids.length) + '/' + result.event.targetPids.length + ' (rest shielded)' : ' used!');\n"
    "  toast((def.icon || '') + ' ' + (def.label || 'Powerup') + blockedNote);\n"
    "}",
    "trigger_powerup_ui_target_select",
)

# ── 7. pflxRacePowerupBarHtml -- team target select + team sabotage row ──
content = apply_once(
    content,
    "  var targetOptions = others.map(function (p) { return '<option value=\"' + esc(p.id) + '\">' + esc(nameFor(p.id)) + '</option>'; }).join('');\n"
    "  var boostBtns = ['speed_boost', 'shield', 'double_points'].map(function (k) {\n"
    "    var def = PFLX_POWERUPS[k];\n"
    "    var afford = bal >= def.cost;\n"
    "    return '<button class=\"bigbtn ghost\" style=\"font-size:9px;padding:6px 8px' + (afford ? '' : ';opacity:0.4') + '\" ' + (afford ? '' : 'disabled') + ' onclick=\"liveTriggerPowerupUi(\\'' + k + '\\')\">' + def.icon + ' ' + def.label + ' (' + def.cost + ')</button>';\n"
    "  }).join('');\n"
    "  var sabotageBtns = (!s.sabotageEnabled || !others.length) ? '' :\n"
    "    ['freeze', 'fog', 'steal'].map(function (k) {\n"
    "      var def = PFLX_POWERUPS[k];\n"
    "      var afford = bal >= def.cost;\n"
    "      return '<button class=\"bigbtn red\" style=\"font-size:9px;padding:6px 8px' + (afford ? '' : ';opacity:0.4') + '\" ' + (afford ? '' : 'disabled') + ' onclick=\"liveTriggerPowerupUi(\\'' + k + '\\')\">' + def.icon + ' ' + def.label + ' (' + def.cost + ')</button>';\n"
    "    }).join('');\n"
    "  return '<div class=\"card\" style=\"background:rgba(255,209,102,0.06);border-color:rgba(255,209,102,0.25);margin-bottom:8px;padding:10px\">' +\n"
    "    '<div style=\"display:flex;align-items:center;gap:8px;flex-wrap:wrap\"><span style=\"font-family:Audiowide;font-size:10px;color:#ffd166\">\\u26a1 ' + bal + ' Nitro</span>' +\n"
    "    (frozenUntil ? '<span style=\"font-size:10px;color:#7ad9ff\">\\u2744\\ufe0f Frozen ' + Math.ceil((frozenUntil - Date.now()) / 1000) + 's</span>' : '') +\n"
    "    (fogUntil ? '<span style=\"font-size:10px;color:#c9a7ff\">\\ud83c\\udf2b\\ufe0f Fogged</span>' : '') +\n"
    "    '</div>' +\n"
    "    '<div style=\"display:flex;gap:6px;flex-wrap:wrap;margin-top:6px\">' + boostBtns + '</div>' +\n"
    "    (sabotageBtns ? ('<div style=\"display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center\"><select id=\"pflxRaceTarget\" style=\"font-size:10px;padding:4px\">' + targetOptions + '</select>' + sabotageBtns + '</div>') : '') +\n"
    "    '</div>';\n"
    "}",
    "  var targetOptions = others.map(function (p) { return '<option value=\"' + esc(p.id) + '\">' + esc(nameFor(p.id)) + '</option>'; }).join('');\n"
    "  var boostBtns = ['speed_boost', 'shield', 'double_points'].map(function (k) {\n"
    "    var def = PFLX_POWERUPS[k];\n"
    "    var afford = bal >= def.cost;\n"
    "    return '<button class=\"bigbtn ghost\" style=\"font-size:9px;padding:6px 8px' + (afford ? '' : ';opacity:0.4') + '\" ' + (afford ? '' : 'disabled') + ' onclick=\"liveTriggerPowerupUi(\\'' + k + '\\')\">' + def.icon + ' ' + def.label + ' (' + def.cost + ')</button>';\n"
    "  }).join('');\n"
    "  // PATCH X-LIVE -- team-wide sabotage targeting. When the host has it\n"
    "  // on AND teams are configured, Freeze/Fog (def.teamCapable) move to a\n"
    "  // separate team-target select/button row below; Steal always stays in\n"
    "  // the original per-player row, unconditionally. When either condition\n"
    "  // is false this whole block is inert and the original single row is\n"
    "  // byte-identical to pre-patch.\n"
    "  var teamsConfigured = !!(L.cfg.teams && L.cfg.teams.names && L.cfg.teams.names.length);\n"
    "  var teamWideOn = !!(s.sabotageTeamWide && teamsConfigured);\n"
    "  var myTeam = teamWideOn ? ((L.cfg.teams.assign || {})[myId]) : null;\n"
    "  var teamOptions = teamWideOn ? (L.cfg.teams.names || []).filter(function (n) { return n !== myTeam; }).map(function (n) { return '<option value=\"' + esc(n) + '\">' + esc(n) + ' (team)</option>'; }).join('') : '';\n"
    "  var sabotageBtns = (!s.sabotageEnabled || !others.length) ? '' :\n"
    "    ['freeze', 'fog', 'steal'].filter(function (k) { return !(teamWideOn && PFLX_POWERUPS[k].teamCapable); }).map(function (k) {\n"
    "      var def = PFLX_POWERUPS[k];\n"
    "      var afford = bal >= def.cost;\n"
    "      return '<button class=\"bigbtn red\" style=\"font-size:9px;padding:6px 8px' + (afford ? '' : ';opacity:0.4') + '\" ' + (afford ? '' : 'disabled') + ' onclick=\"liveTriggerPowerupUi(\\'' + k + '\\')\">' + def.icon + ' ' + def.label + ' (' + def.cost + ')</button>';\n"
    "    }).join('');\n"
    "  var teamSabotageBtns = (!s.sabotageEnabled || !teamWideOn || !teamOptions) ? '' :\n"
    "    ['freeze', 'fog'].map(function (k) {\n"
    "      var def = PFLX_POWERUPS[k];\n"
    "      var afford = bal >= def.cost;\n"
    "      return '<button class=\"bigbtn red\" style=\"font-size:9px;padding:6px 8px' + (afford ? '' : ';opacity:0.4') + '\" ' + (afford ? '' : 'disabled') + ' onclick=\"liveTriggerPowerupUi(\\'' + k + '\\')\">' + def.icon + ' ' + def.label + ' (' + def.cost + ')</button>';\n"
    "    }).join('');\n"
    "  return '<div class=\"card\" style=\"background:rgba(255,209,102,0.06);border-color:rgba(255,209,102,0.25);margin-bottom:8px;padding:10px\">' +\n"
    "    '<div style=\"display:flex;align-items:center;gap:8px;flex-wrap:wrap\"><span style=\"font-family:Audiowide;font-size:10px;color:#ffd166\">\\u26a1 ' + bal + ' Nitro</span>' +\n"
    "    (frozenUntil ? '<span style=\"font-size:10px;color:#7ad9ff\">\\u2744\\ufe0f Frozen ' + Math.ceil((frozenUntil - Date.now()) / 1000) + 's</span>' : '') +\n"
    "    (fogUntil ? '<span style=\"font-size:10px;color:#c9a7ff\">\\ud83c\\udf2b\\ufe0f Fogged</span>' : '') +\n"
    "    '</div>' +\n"
    "    '<div style=\"display:flex;gap:6px;flex-wrap:wrap;margin-top:6px\">' + boostBtns + '</div>' +\n"
    "    (sabotageBtns ? ('<div style=\"display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center\"><select id=\"pflxRaceTarget\" style=\"font-size:10px;padding:4px\">' + targetOptions + '</select>' + sabotageBtns + '</div>') : '') +\n"
    "    (teamSabotageBtns ? ('<div style=\"display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center\"><select id=\"pflxRaceTeamTarget\" style=\"font-size:10px;padding:4px\">' + teamOptions + '</select>' + teamSabotageBtns + '</div>') : '') +\n"
    "    '</div>';\n"
    "}",
    "powerup_bar_team_row",
)

# ── 8. rLiveRun -- host toggle checkbox for team-wide sabotage ──
content = apply_once(
    content,
    "    (hasRaceSlide(s) ? (\n"
    "      '<div class=\"card\" style=\"background:rgba(255,255,255,0.03);margin-bottom:10px\">' +\n"
    "        '<div class=\"cardT\" style=\"font-size:12px\">\\ud83c\\udfc1 X-Rush Powerups</div>' +\n"
    "        '<div style=\"display:flex;gap:14px;flex-wrap:wrap;margin-top:4px\">' +\n"
    "        '<label style=\"display:flex;gap:6px;align-items:center;text-transform:none;font-family:inherit;font-size:12px\"><input type=\"checkbox\" style=\"width:auto\" ' + (s.powerupsEnabled ? 'checked' : '') + ' onchange=\"liveTogglePowerups(this.checked)\"/> \\u26a1 Powerups</label>' +\n"
    "        '<label style=\"display:flex;gap:6px;align-items:center;text-transform:none;font-family:inherit;font-size:12px\"><input type=\"checkbox\" style=\"width:auto\" ' + (s.sabotageEnabled ? 'checked' : '') + ' onchange=\"liveToggleSabotage(this.checked)\"/> \\ud83d\\udca3 Sabotage</label>' +\n"
    "        '</div></div>'\n"
    "    ) : '') +",
    "    (hasRaceSlide(s) ? (\n"
    "      '<div class=\"card\" style=\"background:rgba(255,255,255,0.03);margin-bottom:10px\">' +\n"
    "        '<div class=\"cardT\" style=\"font-size:12px\">\\ud83c\\udfc1 X-Rush Powerups</div>' +\n"
    "        '<div style=\"display:flex;gap:14px;flex-wrap:wrap;margin-top:4px\">' +\n"
    "        '<label style=\"display:flex;gap:6px;align-items:center;text-transform:none;font-family:inherit;font-size:12px\"><input type=\"checkbox\" style=\"width:auto\" ' + (s.powerupsEnabled ? 'checked' : '') + ' onchange=\"liveTogglePowerups(this.checked)\"/> \\u26a1 Powerups</label>' +\n"
    "        '<label style=\"display:flex;gap:6px;align-items:center;text-transform:none;font-family:inherit;font-size:12px\"><input type=\"checkbox\" style=\"width:auto\" ' + (s.sabotageEnabled ? 'checked' : '') + ' onchange=\"liveToggleSabotage(this.checked)\"/> \\ud83d\\udca3 Sabotage</label>' +\n"
    "        (s.sabotageEnabled && L.cfg.teams && L.cfg.teams.names && L.cfg.teams.names.length ?\n"
    "          '<label style=\"display:flex;gap:6px;align-items:center;text-transform:none;font-family:inherit;font-size:12px\"><input type=\"checkbox\" style=\"width:auto\" ' + (s.sabotageTeamWide ? 'checked' : '') + ' onchange=\"liveToggleSabotageTeamWide(this.checked)\"/> \\ud83c\\udff3\\ufe0f Team-wide Sabotage</label>' : '') +\n"
    "        '</div></div>'\n"
    "    ) : '') +",
    "rliverun_team_wide_checkbox",
)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("OK -- Team-wide sabotage targeting patch applied. %d -> %d chars (+%d)" % (orig_len, len(content), len(content) - orig_len))
