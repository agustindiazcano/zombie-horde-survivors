# 2026-10-18 — Phase 10: Story mode (first version)

Branch `feat/story-mode`, cut from `feat/vehicles` (eleventh in the stack; PRs go in order). 48 tests and all checks pass; nothing seen in a browser.

- **Map format:** `logic.objectives` (only read when `mode` is `story`): `reach` (x, z, radius), `kills` (count), `survive` (clear wave N), `boss` (kill N mini bosses). A story map needs a human and an AI player like a waves map.
- **Sim:** `src/sim/objectives.ts` (`updateObjectives`, `objectiveProgress`). `GameState` gains `bossKills`, `objectivesDone` and the status `victory` (all objectives done); losing is the old game over. Events `objectiveDone` and `victory`. `GameConfig.objectives` comes from `mapRules`.
- **Menu:** Story lists the maps whose mode is `story`, Waves the others. Built-in mission `data/maps/story-1.json` ("Hold the line", easy: reach a spot, clear wave 3, kill a mini boss).
- **HUD:** objective checklist top-left with progress; the end screen says MISSION COMPLETE on victory. Green rings mark `reach` spots in play and in the editor (`setGoalMarkers`).
- **Editor, Game logic tab:** Mode selector now enables Story; Objectives section lists goals with Remove and adds Reach a spot (click the map), Kill 25, Clear wave 3, Kill a mini boss. "Reset" keeps objectives.
- Not done: objective counts are fixed presets (no number boxes), no mission briefing text, no lose rules beyond the squad dying, no mission order / unlocking, victory has no sound, no per-mission best score.
