# 2026-10-18 — Polish of the editor and Story work

Branch `feat/editor-polish`, cut from `feat/story-mode` (twelfth in the stack; PRs go in order). 48 tests and all checks pass; nothing seen in a browser.

- **Pickups on hills:** coins and XP orbs sit on the terrain height (`pickups.ts`), not at height 0.
- **Editor clicks on hills:** `screenToGround` walks the camera ray over the height grid and bisects the first point under the ground, so placing, selecting and painting hit the visible surface.
- **Spawn points:** a point drawn inside an obstacle or water is pushed out to its edge when the enemy spawns (`waves.ts`, `resolveStatic`).
- **Story objectives:** number boxes for kills, mini bosses, wave to clear and ring radius (Game logic tab > Objectives).
- **Jeep:** a health bar over an occupied vehicle; in RTS, right-clicking a vehicle with a free seat sends the selection to climb in (new order `board`, `orderBoard` in `soldiers.ts`).
- **Mission briefing:** `logic.briefing` (story maps, up to 600 characters), a textarea in the Objectives section, shown as a card when the mission starts from the menu or with Play in the editor; a click closes it. `story-1` has one.
- **Cliffs block:** a grid cell whose corners differ by more than `MAX_CELL_RISE` (1.2 m, `sim/terrain.ts`) becomes a blocking box like water (`steepObstacles`; walkers stop, bullets cross). Gentle hills stay walkable. Tune the constant after looking at the hills.
- Still open: a real vehicle model.
- **Fire (8b, first step):** `hazards.fire` in `game.json` (20 dps, 2.5 m), `logic.fires` in the map, `src/sim/hazards.ts` (half-second bursts; soldiers on foot and enemies, not the drone or riders), flames in the renderer, Fire section in the Game logic tab. Not done: spreading, fire grenades, explosive barrels.
- **Wylan Engine / licence:** tab title, a footer on the main menu, `LICENSE` (all rights reserved, Wylan Studios), `"license": "UNLICENSED"`, README License section. Open: an in-game credits screen for the CC-BY assets before Steam.
