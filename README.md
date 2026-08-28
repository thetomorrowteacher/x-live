# PFLX Lite

ONE standalone classroom app (EXO spec v1.1, Phase 4) — ClassDojo speed +
Classcraft game layer, powered by the existing PFLX economy.

- `index.html` — the whole app (host dashboard, leaderboards, tools, player
  view, upgrades shop, projector mode). Same static single-file pattern as
  Battle Arena's preview.html.
- `games/vault-rush.html` — Blooket-style room-code class game (question
  sets power the game; polling-based rooms over Supabase app_data).
- Identity comes from the PFLX Platform (sso URL params / postMessage) —
  standalone opens in Demo Mode.
- XC changes are PROPOSALS over PflxDataBus (`pflx_award_proposed`); the
  Console remains the only balance authority. `lite_activity` (Supabase)
  is the audit feed and powers weekly/most-improved boards.
- Lite-owned cloud keys: `pflx_lite_config`, `pflx_lite_qsets`,
  `pflx_lite_room_*`.
