import re

path = "index.html"
with open(path) as f:
    text = f.read()

def replace_once(text, old, new, label):
    c = text.count(old)
    if c != 1:
        raise AssertionError("anchor not unique (%d): %s" % (c, label))
    return text.replace(old, new, 1)

header = """<!-- ═══════════════════════════════════════════════════════════════════
     X-LIVE v0.82, Oct 1 2026 — PATCH X-LIVE v0.82: Next-Show Countdown
     (Task F, part 1 of 5 -- Ennis: "There should be an active counter for
     all users till the next X-Live show. There should be settings in the
     Live Theater for this."). NOTE: renumbered from an original v0.76
     draft after discovering a different Claude session had already
     shipped real, committed, unrelated patches v0.76 through v0.80
     (Nexus Narratives lore, Evo Clash starter hatch, Campaign Mode
     embed) between this session's last recorded checkpoint and now --
     confirmed via git log. v0.82 is the next free number after the real
     v0.80 HEAD; v0.81 is skipped (an abandoned, uncommitted staging
     attempt from that other session sits in the working tree under that
     number and was left untouched). New host-configurable cfg.nextShowAt
     (an ISO datetime-local string) + cfg.nextShowLabel (an optional
     title), stored on the SAME pflx_lite_config row every other piece of
     Setup already lives on (DEFAULT_CFG/loadCfg/saveCfg -- a plain
     merge-safe field addition, no new storage key). A new settings
     sub-card in the Live Theater tab (rTheater(), host-only) lets a host
     set/clear the date+time and an optional label. A live-ticking
     countdown card (pure formatter pflxNextShowCountdownText(iso,
     nowMs), DOM-id-targeted 1s interval pflxEnsureNextShowCountdown() --
     same architecture as the existing
     pflxSessionTimerText/pflxEnsureSessionTimer pair, not a new pattern)
     shows to EVERY user (host and player) at the top of the Theater tab,
     and hides itself automatically once the target time passes (a
     live/active session's own banners take over messaging at that point
     -- this card never shows a negative or "started" state). Confirmed
     with Ennis (AskUserQuestion): the counter should also be visible
     PLATFORM-WIDE, not just inside X-Live -- that half ships as its own
     PATCH PLATFORM patch in preview.html, reading this same
     cfg.nextShowAt/nextShowLabel via the existing xb-2 pflxXBotLoadCfg()
     bridge (zero new cross-app plumbing needed; the Console already has
     direct read access to this exact Supabase row).
     Verified: syntax gate clean; new unit test
     (test_v082_next_show_countdown.js) extracts the real shipped
     pflxNextShowCountdownText/pflxSaveNextShow/pflxClearNextShow via
     brace-counting and runs them in a vm sandbox against realistic
     fixtures (future/past/malformed/empty dates, day/hour/minute
     formatting boundaries, host-only settings-card gating); full
     regression suite re-run against a pre-patch backup, zero new
     regressions. See docs/HANDOFF.md PATCH X-LIVE v0.82 for full detail.
     ═══════════════════════════════════════════════════════════════════ -->
"""
marker_lines = [
    '<!-- ═══════════════════════════════════════════════════════════════════',
    '     X-LIVE v0.75,'
]
marker = "\n".join(marker_lines)
if marker not in text:
    raise AssertionError("expected top-of-file v0.75 header marker not found -- re-check the real current header before patching")
idx = text.index(marker)
text = text[:idx] + header + text[idx:]

old1 = "  cohorts: [], // PATCH X-LIVE v0.26 -- multi-select cohorts; [] = whole roster\n"
new1 = old1 + "  nextShowAt: '', // PATCH X-LIVE v0.82 -- ISO datetime-local string for the Live Theater's platform-wide countdown; '' = no show scheduled\n  nextShowLabel: '', // PATCH X-LIVE v0.82 -- optional title shown next to the countdown, e.g. 'Season Finale'\n"
text = replace_once(text, old1, new1, "DEFAULT_CFG nextShowAt/nextShowLabel")

old2 = "function rTheater() {\n"
new2 = """// PATCH X-LIVE v0.82 -- pure formatter: next-show countdown text. nowMs is
// injectable for testing. Returns null when there's no show scheduled, the
// stored value doesn't parse, or the target time has already passed (once
// it passes, the countdown hides rather than showing a negative/garbage
// value -- a live/active session's own banners take over messaging then).
function pflxNextShowCountdownText(nextShowAtIso, nowMs) {
  if (!nextShowAtIso) return null;
  var target = new Date(nextShowAtIso).getTime();
  if (isNaN(target)) return null;
  var now = nowMs || Date.now();
  var diff = target - now;
  if (diff <= 0) return null;
  var totalMin = Math.floor(diff / 60000);
  var days = Math.floor(totalMin / 1440);
  var hours = Math.floor((totalMin % 1440) / 60);
  var mins = totalMin % 60;
  var secs = Math.floor((diff % 60000) / 1000);
  var label;
  if (days > 0) label = days + 'd ' + hours + 'h ' + mins + 'm';
  else if (hours > 0) label = hours + 'h ' + mins + 'm';
  else label = mins + 'm ' + secs + 's';
  return { label: label, imminent: diff <= 15 * 60000 };
}
window.pflxNextShowCountdownText = pflxNextShowCountdownText;

let _xlNextShowCdIv = null;
function pflxEnsureNextShowCountdown() {
  if (_xlNextShowCdIv) return;
  var draw = function () {
    var el = document.getElementById('xlNextShowVal');
    if (!el) return;
    var info = pflxNextShowCountdownText(L.cfg && L.cfg.nextShowAt, Date.now());
    if (!info) { render(); return; }
    el.textContent = info.label;
    el.style.color = info.imminent ? '#ffd166' : '#5ef2ff';
  };
  draw();
  _xlNextShowCdIv = setInterval(draw, 1000);
}
window.pflxEnsureNextShowCountdown = pflxEnsureNextShowCountdown;

function pflxNextShowCardHtml() {
  var info = pflxNextShowCountdownText(L.cfg.nextShowAt, Date.now());
  var displayCard = info ?
    ('<div class="card" style="margin-bottom:10px;text-align:center;border-color:' + (info.imminent ? 'rgba(255,209,102,0.55)' : 'rgba(0,240,255,0.35)') + '">' +
      '<div style="font-size:10px;letter-spacing:0.08em;color:#8a93b8;text-transform:uppercase">⏱ NEXT X-LIVE SHOW' + (L.cfg.nextShowLabel ? ' — ' + esc(L.cfg.nextShowLabel) : '') + '</div>' +
      '<div id="xlNextShowVal" style="font-family:Audiowide;font-size:20px;color:' + (info.imminent ? '#ffd166' : '#5ef2ff') + ';margin-top:4px">' + esc(info.label) + '</div></div>')
    : '';
  var settingsCard = L.isHost ?
    ('<div class="card" style="margin-bottom:10px"><div class="cardT">⚙️ Next Show Settings</div>' +
      '<label>Date &amp; Time</label><input type="datetime-local" id="xlNextShowAtInput" value="' + esc(L.cfg.nextShowAt || '') + '"/>' +
      '<label style="margin-top:8px;display:block">Title (optional)</label><input type="text" id="xlNextShowLabelInput" placeholder="e.g. Season Finale" value="' + esc(L.cfg.nextShowLabel || '') + '"/>' +
      '<div style="margin-top:10px;display:flex;gap:8px">' +
      '<button class="bigbtn gold" style="padding:8px 14px;font-size:10px" onclick="pflxSaveNextShow()">SAVE</button>' +
      '<button class="bigbtn ghost" style="padding:8px 14px;font-size:10px" onclick="pflxClearNextShow()">CLEAR</button></div></div>')
    : '';
  return displayCard + settingsCard;
}
window.pflxNextShowCardHtml = pflxNextShowCardHtml;
function pflxSaveNextShow() {
  if (!L.isHost) return;
  var atEl = document.getElementById('xlNextShowAtInput'), lblEl = document.getElementById('xlNextShowLabelInput');
  L.cfg.nextShowAt = (atEl && atEl.value) || '';
  L.cfg.nextShowLabel = ((lblEl && lblEl.value) || '').trim();
  saveCfg();
  render();
}
window.pflxSaveNextShow = pflxSaveNextShow;
function pflxClearNextShow() {
  if (!L.isHost) return;
  L.cfg.nextShowAt = ''; L.cfg.nextShowLabel = '';
  saveCfg();
  render();
}
window.pflxClearNextShow = pflxClearNextShow;

function rTheater() {
"""
text = replace_once(text, old2, new2, "pre-rTheater next-show block")

old3 = "  const runningSession = (L.isHost && L.liveRunningSessionId) ? (L.sessions || []).find(function (x) { return x.id === L.liveRunningSessionId; }) : null;\n  const live = pflxTheaterLiveSessions();\n  return (L.isHost ?"
new3 = "  const runningSession = (L.isHost && L.liveRunningSessionId) ? (L.sessions || []).find(function (x) { return x.id === L.liveRunningSessionId; }) : null;\n  const live = pflxTheaterLiveSessions();\n  pflxEnsureNextShowCountdown(); // PATCH X-LIVE v0.82\n  return pflxNextShowCardHtml() + (L.isHost ?"
text = replace_once(text, old3, new3, "rTheater wiring")

with open(path, "w") as f:
    f.write(text)

print("PATCH v0.82 applied OK -- all 4 anchors verified unique (+ header)")
