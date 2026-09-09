#!/usr/bin/env python3
# PATCH X-LIVE v0.32 -- X-Rush shortcut puzzle challenges. The plan's other
# v0.32 item ("avatars on the track") already shipped in v0.29 -- the track
# view has always rendered each racer via the shared exoAvatarHTML(), the
# same renderer every roster/leaderboard in this file uses, so a future
# character-art redesign needs zero code changes here. This patch is the
# puzzle-template half only.
#
# No real CryptoHack/embeddable puzzle API exists (same finding as the
# earlier Canva/CapCut/Flip research this session) -- so this is a small,
# parameterized template library built natively: each template's
# generate(rand) computes a fresh instance from REAL logic (never a
# hand-authored answer key), and is deterministic when given a seeded
# rand(), so every player at the same shortcut station sees the identical
# puzzle without needing to store it anywhere. Low-stakes by design: a
# station appears every Nth quiz_race slide (host-configurable), solving
# grants a flat track-position jump, missing costs nothing.
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

# ── 1. pflxRacePowerupBonus -- fold in puzzle_solved jump amounts, same
#      pattern as speed_boost/steal/double_points already there ──
content = apply_once(
    content,
    "function pflxRacePowerupBonus(s, pid) {\n"
    "  var bonus = 0;\n"
    "  ((s && s.raceEvents) || []).forEach(function (ev) {\n"
    "    if (ev.key === 'speed_boost' && ev.pid === pid) bonus += (PFLX_POWERUPS.speed_boost.jumpAmount || 0);\n",
    "function pflxRacePowerupBonus(s, pid) {\n"
    "  var bonus = 0;\n"
    "  ((s && s.raceEvents) || []).forEach(function (ev) {\n"
    "    if (ev.key === 'speed_boost' && ev.pid === pid) bonus += (PFLX_POWERUPS.speed_boost.jumpAmount || 0);\n"
    "    // PATCH X-LIVE v0.32 -- shortcut puzzle solve, folded in exactly\n"
    "    // like every other raceEvents-derived bonus above/below.\n"
    "    if (ev.key === 'puzzle_solved' && ev.pid === pid) bonus += (ev.jumpAmount || 0);\n",
    "powerup_bonus_puzzle_foldin",
)

# ── 2. The puzzle library itself -- inserted right after
#      pflxRaceTriggerPowerup, before the Quizlet/CSV deck importer ──
content = apply_once(
    content,
    "window.pflxRaceTriggerPowerup = pflxRaceTriggerPowerup;\n"
    "\n",
    "window.pflxRaceTriggerPowerup = pflxRaceTriggerPowerup;\n"
    "\n"
    "// PATCH X-LIVE v0.32 -- X-Rush shortcut puzzle challenges. See the\n"
    "// file-level comment at the top of this patch for the design rationale.\n"
    "function pflxSeededRand(seed) {\n"
    "  var h = 0;\n"
    "  String(seed).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; });\n"
    "  return function () { h = (h * 1103515245 + 12345) >>> 0; return h / 4294967296; };\n"
    "}\n"
    "window.pflxSeededRand = pflxSeededRand;\n"
    "\n"
    "var PFLX_PUZZLE_WORDBANK = ['CODE', 'TEAM', 'QUIZ', 'RUSH', 'TRACK', 'SPARK', 'NITRO', 'SHIELD', 'LAUNCH', 'ORBIT', 'PIXEL', 'VAULT', 'CIPHER', 'ROCKET', 'PLASMA'];\n"
    "var PFLX_PUZZLE_JUMP_AMOUNT = 15;\n"
    "\n"
    "function pflxPuzzleCaesarGenerate(rand) {\n"
    "  rand = rand || Math.random;\n"
    "  var word = PFLX_PUZZLE_WORDBANK[Math.floor(rand() * PFLX_PUZZLE_WORDBANK.length)];\n"
    "  var shift = 1 + Math.floor(rand() * 25);\n"
    "  var encoded = word.split('').map(function (c) {\n"
    "    var code = c.charCodeAt(0) - 65;\n"
    "    return String.fromCharCode(((code + shift) % 26 + 26) % 26 + 65);\n"
    "  }).join('');\n"
    "  return { prompt: 'Caesar cipher, shift ' + shift + ':\\n' + encoded, answer: word };\n"
    "}\n"
    "\n"
    "function pflxPuzzleBase64Generate(rand) {\n"
    "  rand = rand || Math.random;\n"
    "  var word = PFLX_PUZZLE_WORDBANK[Math.floor(rand() * PFLX_PUZZLE_WORDBANK.length)];\n"
    "  return { prompt: 'Decode this Base64:\\n' + btoa(word), answer: word };\n"
    "}\n"
    "\n"
    "function pflxPuzzleBinaryGenerate(rand) {\n"
    "  rand = rand || Math.random;\n"
    "  var short = PFLX_PUZZLE_WORDBANK.filter(function (w) { return w.length <= 5; });\n"
    "  var word = short[Math.floor(rand() * short.length)];\n"
    "  var bin = word.split('').map(function (c) { return c.charCodeAt(0).toString(2).padStart(8, '0'); }).join(' ');\n"
    "  return { prompt: 'Decode this binary (8 digits = 1 letter):\\n' + bin, answer: word };\n"
    "}\n"
    "\n"
    "var PFLX_PUZZLE_CODE_TEMPLATES = [\n"
    "  { min: 3, max: 8, render: function (n) { return 'let total = 0;\\nfor (let i = 1; i <= ' + n + '; i++) { total += i; }\\nconsole.log(total);'; }, compute: function (n) { var t = 0; for (var i = 1; i <= n; i++) t += i; return t; } },\n"
    "  { min: 2, max: 9, render: function (n) { return 'let s = \"\";\\nfor (let i = 0; i < ' + n + '; i++) { s += \"x\"; }\\nconsole.log(s.length);'; }, compute: function (n) { return n; } },\n"
    "  { min: 2, max: 50, render: function (n) { return 'function doubleIt(x) { return x * 2; }\\nconsole.log(doubleIt(' + n + '));'; }, compute: function (n) { return n * 2; } },\n"
    "  { min: 1, max: 5, render: function (n) { return 'let arr = [1, 2, 3].map(x => x + ' + n + ');\\nconsole.log(arr.join(\",\"));'; }, compute: function (n) { return [1, 2, 3].map(function (x) { return x + n; }).join(','); } }\n"
    "];\n"
    "function pflxPuzzleCodeGenerate(rand) {\n"
    "  rand = rand || Math.random;\n"
    "  var tmpl = PFLX_PUZZLE_CODE_TEMPLATES[Math.floor(rand() * PFLX_PUZZLE_CODE_TEMPLATES.length)];\n"
    "  var n = tmpl.min + Math.floor(rand() * (tmpl.max - tmpl.min + 1));\n"
    "  return { prompt: 'What does this code output?\\n' + tmpl.render(n), answer: String(tmpl.compute(n)) };\n"
    "}\n"
    "\n"
    "var PFLX_PUZZLE_TYPES = {\n"
    "  caesar: { key: 'caesar', label: 'Caesar Cipher', icon: '\\ud83d\\udd10', generate: pflxPuzzleCaesarGenerate },\n"
    "  base64: { key: 'base64', label: 'Base64', icon: '\\ud83e\\uddec', generate: pflxPuzzleBase64Generate },\n"
    "  binary: { key: 'binary', label: 'Binary', icon: '\\ud83d\\udcbe', generate: pflxPuzzleBinaryGenerate },\n"
    "  code:   { key: 'code',   label: 'Code Output', icon: '\\ud83d\\udcbb', generate: pflxPuzzleCodeGenerate }\n"
    "};\n"
    "window.PFLX_PUZZLE_TYPES = PFLX_PUZZLE_TYPES;\n"
    "\n"
    "function pflxPuzzleCheckAnswer(correct, given) {\n"
    "  function norm(x) { return String(x == null ? '' : x).trim().toUpperCase().replace(/\\s+/g, ''); }\n"
    "  return norm(correct) === norm(given);\n"
    "}\n"
    "window.pflxPuzzleCheckAnswer = pflxPuzzleCheckAnswer;\n"
    "\n"
    "// Deterministic single instance for a (typeKey, seed) pair -- the same\n"
    "// seed always regenerates the identical puzzle, so nothing needs to be\n"
    "// stored on the slide itself; every player and every re-render derive\n"
    "// it fresh from the same inputs.\n"
    "function pflxPuzzleGenerate(typeKey, seed) {\n"
    "  var def = PFLX_PUZZLE_TYPES[typeKey];\n"
    "  if (!def) return null;\n"
    "  var rand = pflxSeededRand(seed == null ? Math.random() : seed);\n"
    "  var inst = def.generate(rand);\n"
    "  inst.key = typeKey;\n"
    "  return inst;\n"
    "}\n"
    "window.pflxPuzzleGenerate = pflxPuzzleGenerate;\n"
    "\n"
    "// Every Nth quiz_race slide (host-configurable s.puzzleInterval, default\n"
    "// 3) is a shortcut station -- counts quiz_race slides in document order\n"
    "// so other slide types interleaved in the deck don't throw off the\n"
    "// interval.\n"
    "function pflxPuzzleStationSlideIds(s) {\n"
    "  var interval = (s && s.puzzleInterval) || 3;\n"
    "  if (interval < 1) interval = 1;\n"
    "  var out = [];\n"
    "  var count = 0;\n"
    "  ((s && s.slides) || []).forEach(function (sl) {\n"
    "    if (sl.type !== 'quiz_race') return;\n"
    "    count++;\n"
    "    if (count % interval === 0) out.push(sl.id);\n"
    "  });\n"
    "  return out;\n"
    "}\n"
    "window.pflxPuzzleStationSlideIds = pflxPuzzleStationSlideIds;\n"
    "\n"
    "// The puzzle for a given station slide -- null if that slide isn't a\n"
    "// station, puzzles are off, or (in principle) no categories are\n"
    "// enabled. The TYPE picked for a station is itself seeded off the slide\n"
    "// id, so it's stable too.\n"
    "function pflxPuzzleForSlide(s, slideId) {\n"
    "  if (!s || !s.puzzlesEnabled) return null;\n"
    "  if (pflxPuzzleStationSlideIds(s).indexOf(slideId) === -1) return null;\n"
    "  var categories = (s.puzzleCategories && s.puzzleCategories.length) ? s.puzzleCategories : Object.keys(PFLX_PUZZLE_TYPES);\n"
    "  var pickRand = pflxSeededRand(slideId + '_pick');\n"
    "  var typeKey = categories[Math.floor(pickRand() * categories.length)];\n"
    "  return pflxPuzzleGenerate(typeKey, slideId);\n"
    "}\n"
    "window.pflxPuzzleForSlide = pflxPuzzleForSlide;\n"
    "\n"
    "// Validates and constructs a puzzle-solve event -- PURE, does not save,\n"
    "// same shape as pflxRaceTriggerPowerup above. One solve per player per\n"
    "// station slide, checked against the existing raceEvents log (no\n"
    "// separate \"solved\" field to drift out of sync).\n"
    "function pflxPuzzleSolve(s, pid, slideId, answer, now) {\n"
    "  now = now || Date.now();\n"
    "  if (!s || !s.puzzlesEnabled) return { ok: false, reason: 'puzzles-disabled' };\n"
    "  var puzzle = pflxPuzzleForSlide(s, slideId);\n"
    "  if (!puzzle) return { ok: false, reason: 'not-a-station' };\n"
    "  var already = ((s.raceEvents) || []).some(function (ev) { return ev.key === 'puzzle_solved' && ev.pid === pid && ev.slideId === slideId; });\n"
    "  if (already) return { ok: false, reason: 'already-solved' };\n"
    "  if (!pflxPuzzleCheckAnswer(puzzle.answer, answer)) return { ok: false, reason: 'incorrect' };\n"
    "  var event = { id: 'rev_' + now + '_' + Math.random().toString(36).slice(2, 8), pid: pid, key: 'puzzle_solved', at: now, slideId: slideId, puzzleType: puzzle.key, jumpAmount: PFLX_PUZZLE_JUMP_AMOUNT };\n"
    "  return { ok: true, event: event };\n"
    "}\n"
    "window.pflxPuzzleSolve = pflxPuzzleSolve;\n"
    "\n",
    "puzzle_library",
)

# ── 3. Host toggles -- inserted right after liveToggleSabotageTeamWide ──
content = apply_once(
    content,
    "async function liveToggleSabotageTeamWide(on) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === L.liveRunningSessionId; }); if (!s) return;\n"
    "  s.sabotageTeamWide = !!on;\n"
    "  await saveSession(s);\n"
    "  render();\n"
    "}\n"
    "function hasRaceSlide(s) { return (s && s.slides || []).some(function (x) { return x.type === 'quiz_race'; }); }",
    "async function liveToggleSabotageTeamWide(on) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === L.liveRunningSessionId; }); if (!s) return;\n"
    "  s.sabotageTeamWide = !!on;\n"
    "  await saveSession(s);\n"
    "  render();\n"
    "}\n"
    "// PATCH X-LIVE v0.32 -- Shortcut Puzzles host toggles: on/off, the\n"
    "// question interval, and which puzzle categories are in play. Same\n"
    "// save/render pattern as every other X-Rush toggle above.\n"
    "async function liveTogglePuzzles(on) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === L.liveRunningSessionId; }); if (!s) return;\n"
    "  s.puzzlesEnabled = !!on;\n"
    "  await saveSession(s);\n"
    "  render();\n"
    "}\n"
    "async function liveSetPuzzleInterval(n) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === L.liveRunningSessionId; }); if (!s) return;\n"
    "  var v = parseInt(n, 10);\n"
    "  s.puzzleInterval = (v && v > 0) ? v : 3;\n"
    "  await saveSession(s);\n"
    "  render();\n"
    "}\n"
    "async function liveTogglePuzzleCategory(key, on) {\n"
    "  const s = L.sessions.find(function (x) { return x.id === L.liveRunningSessionId; }); if (!s) return;\n"
    "  var cats = (s.puzzleCategories && s.puzzleCategories.length) ? s.puzzleCategories.slice() : Object.keys(PFLX_PUZZLE_TYPES);\n"
    "  if (on) { if (cats.indexOf(key) === -1) cats.push(key); }\n"
    "  else { cats = cats.filter(function (k) { return k !== key; }); }\n"
    "  s.puzzleCategories = cats;\n"
    "  await saveSession(s);\n"
    "  render();\n"
    "}\n"
    "function hasRaceSlide(s) { return (s && s.slides || []).some(function (x) { return x.type === 'quiz_race'; }); }",
    "host_puzzle_toggles",
)

# ── 4. Player-side solve wrapper -- inserted right after liveTriggerPowerupUi ──
content = apply_once(
    content,
    "  toast((def.icon || '') + ' ' + (def.label || 'Powerup') + blockedNote);\n"
    "}\n"
    "window.liveTriggerPowerupUi = liveTriggerPowerupUi;",
    "  toast((def.icon || '') + ' ' + (def.label || 'Powerup') + blockedNote);\n"
    "}\n"
    "window.liveTriggerPowerupUi = liveTriggerPowerupUi;\n"
    "\n"
    "// PATCH X-LIVE v0.32 -- Player-side shortcut-puzzle solve wrapper --\n"
    "// validates via the pure pflxPuzzleSolve(), then appends the event and\n"
    "// saves, same merge-safe pattern as liveTriggerPowerupUi above.\n"
    "async function liveSolvePuzzleUi(slideId) {\n"
    "  const s = nativeSessionAppliesToMe(); if (!s) return;\n"
    "  const myId = (L.me && L.me.id) || ''; if (!myId) return;\n"
    "  var input = document.getElementById('pflxPuzzleAnswerInput');\n"
    "  var answer = input ? input.value : '';\n"
    "  const result = pflxPuzzleSolve(s, myId, slideId, answer, Date.now());\n"
    "  if (!result.ok) {\n"
    "    toast(result.reason === 'incorrect' ? 'Not quite \\u2014 try again!' : 'Can\\'t solve that: ' + result.reason.replace(/-/g, ' '));\n"
    "    return;\n"
    "  }\n"
    "  s.raceEvents = s.raceEvents || [];\n"
    "  s.raceEvents.push(result.event);\n"
    "  await saveSession(s);\n"
    "  render();\n"
    "  toast('\\ud83e\\udde9 Shortcut solved! +' + PFLX_PUZZLE_JUMP_AMOUNT + ' track jump!');\n"
    "}\n"
    "window.liveSolvePuzzleUi = liveSolvePuzzleUi;",
    "player_puzzle_solve_ui",
)

# ── 5. Player-side puzzle bar -- inserted right after pflxRacePowerupBarHtml ──
content = apply_once(
    content,
    "window.pflxRacePowerupBarHtml = pflxRacePowerupBarHtml;\n"
    "\n"
    "\n"
    "function rLiveRun(s) {",
    "window.pflxRacePowerupBarHtml = pflxRacePowerupBarHtml;\n"
    "\n"
    "// PATCH X-LIVE v0.32 -- Player-side shortcut-puzzle bar. Only rendered\n"
    "// while the CURRENT slide is an active station (host-configured\n"
    "// interval), the race slide is still unrevealed, and puzzles are\n"
    "// host-enabled. A solved station shows a simple confirmation instead of\n"
    "// the prompt/input.\n"
    "function pflxPuzzleBarHtml(s, sl, myId) {\n"
    "  if (!s.puzzlesEnabled || !sl || sl.type !== 'quiz_race' || sl.revealed) return '';\n"
    "  var puzzle = pflxPuzzleForSlide(s, sl.id);\n"
    "  if (!puzzle) return '';\n"
    "  var solved = ((s.raceEvents) || []).some(function (ev) { return ev.key === 'puzzle_solved' && ev.pid === myId && ev.slideId === sl.id; });\n"
    "  var typeDef = PFLX_PUZZLE_TYPES[puzzle.key] || {};\n"
    "  if (solved) {\n"
    "    return '<div class=\"card\" style=\"background:rgba(201,167,255,0.08);border-color:rgba(201,167,255,0.3);margin-bottom:8px;padding:10px\">' +\n"
    "      '<span style=\"font-family:Audiowide;font-size:10px;color:#c9a7ff\">\\ud83e\\udde9 Shortcut solved! +' + PFLX_PUZZLE_JUMP_AMOUNT + ' track jump</span></div>';\n"
    "  }\n"
    "  return '<div class=\"card\" style=\"background:rgba(201,167,255,0.08);border-color:rgba(201,167,255,0.3);margin-bottom:8px;padding:10px\">' +\n"
    "    '<div style=\"font-family:Audiowide;font-size:10px;color:#c9a7ff\">\\ud83e\\udde9 Shortcut Station \\u2014 ' + (typeDef.icon || '') + ' ' + (typeDef.label || '') + '</div>' +\n"
    "    '<div style=\"font-size:11px;color:#c9cfe8;margin:6px 0;white-space:pre-wrap;font-family:monospace\">' + esc(puzzle.prompt) + '</div>' +\n"
    "    '<div style=\"display:flex;gap:6px;align-items:center\">' +\n"
    "    '<input type=\"text\" id=\"pflxPuzzleAnswerInput\" placeholder=\"Your answer\" style=\"flex:1;font-size:11px;padding:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#fff\">' +\n"
    "    '<button class=\"bigbtn gold\" style=\"font-size:10px;padding:6px 10px\" onclick=\"liveSolvePuzzleUi(\\'' + esc(sl.id) + '\\')\">SUBMIT</button>' +\n"
    "    '</div></div>';\n"
    "}\n"
    "window.pflxPuzzleBarHtml = pflxPuzzleBarHtml;\n"
    "\n"
    "\n"
    "function rLiveRun(s) {",
    "player_puzzle_bar",
)

# ── 6. Wire pflxPuzzleBarHtml into rLiveNative alongside the powerup bar ──
content = apply_once(
    content,
    "    pflxRacePowerupBarHtml(s, sl, myId) +\n"
    "    body +",
    "    pflxRacePowerupBarHtml(s, sl, myId) +\n"
    "    pflxPuzzleBarHtml(s, sl, myId) +\n"
    "    body +",
    "wire_puzzle_bar_into_rlivenative",
)

# ── 7. Host card in rLiveRun -- Shortcut Puzzles on/off, interval, categories ──
content = apply_once(
    content,
    "        (s.sabotageEnabled && L.cfg.teams && L.cfg.teams.names && L.cfg.teams.names.length ?\n"
    "          '<label style=\"display:flex;gap:6px;align-items:center;text-transform:none;font-family:inherit;font-size:12px\"><input type=\"checkbox\" style=\"width:auto\" ' + (s.sabotageTeamWide ? 'checked' : '') + ' onchange=\"liveToggleSabotageTeamWide(this.checked)\"/> \\ud83c\\udff3\\ufe0f Team-wide Sabotage</label>' : '') +\n"
    "        '</div></div>'\n"
    "    ) : '') +\n"
    "    (sl ? (",
    "        (s.sabotageEnabled && L.cfg.teams && L.cfg.teams.names && L.cfg.teams.names.length ?\n"
    "          '<label style=\"display:flex;gap:6px;align-items:center;text-transform:none;font-family:inherit;font-size:12px\"><input type=\"checkbox\" style=\"width:auto\" ' + (s.sabotageTeamWide ? 'checked' : '') + ' onchange=\"liveToggleSabotageTeamWide(this.checked)\"/> \\ud83c\\udff3\\ufe0f Team-wide Sabotage</label>' : '') +\n"
    "        '</div></div>'\n"
    "    ) : '') +\n"
    "    (hasRaceSlide(s) ? (\n"
    "      '<div class=\"card\" style=\"background:rgba(255,255,255,0.03);margin-bottom:10px\">' +\n"
    "        '<div class=\"cardT\" style=\"font-size:12px\">\\ud83e\\udde9 Shortcut Puzzles</div>' +\n"
    "        '<div style=\"display:flex;gap:14px;flex-wrap:wrap;margin-top:4px;align-items:center\">' +\n"
    "        '<label style=\"display:flex;gap:6px;align-items:center;text-transform:none;font-family:inherit;font-size:12px\"><input type=\"checkbox\" style=\"width:auto\" ' + (s.puzzlesEnabled ? 'checked' : '') + ' onchange=\"liveTogglePuzzles(this.checked)\"/> \\ud83e\\udde9 Puzzles</label>' +\n"
    "        '<label style=\"display:flex;gap:6px;align-items:center;text-transform:none;font-family:inherit;font-size:12px\">Every <input type=\"number\" min=\"1\" value=\"' + (s.puzzleInterval || 3) + '\" style=\"width:40px;padding:2px 4px\" onchange=\"liveSetPuzzleInterval(this.value)\"/> questions</label>' +\n"
    "        '</div>' +\n"
    "        (s.puzzlesEnabled ? ('<div style=\"display:flex;gap:12px;flex-wrap:wrap;margin-top:6px\">' +\n"
    "          Object.keys(PFLX_PUZZLE_TYPES).map(function (k) {\n"
    "            var def = PFLX_PUZZLE_TYPES[k];\n"
    "            var cats = (s.puzzleCategories && s.puzzleCategories.length) ? s.puzzleCategories : Object.keys(PFLX_PUZZLE_TYPES);\n"
    "            var on = cats.indexOf(k) !== -1;\n"
    "            return '<label style=\"display:flex;gap:5px;align-items:center;text-transform:none;font-family:inherit;font-size:11px\"><input type=\"checkbox\" style=\"width:auto\" ' + (on ? 'checked' : '') + ' onchange=\"liveTogglePuzzleCategory(\\'' + k + '\\', this.checked)\"/> ' + def.icon + ' ' + def.label + '</label>';\n"
    "          }).join('') + '</div>') : '') +\n"
    "        '</div>'\n"
    "    ) : '') +\n"
    "    (sl ? (",
    "rlliverun_puzzle_card",
)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("OK -- v0.32 shortcut puzzles patch applied. %d -> %d chars (+%d)" % (orig_len, len(content), len(content) - orig_len))
