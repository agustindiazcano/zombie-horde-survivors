# 2026-10-18 — Polish of the editor and Story work

Branch `feat/editor-polish`, cut from `feat/story-mode` (twelfth in the stack; PRs go in order). 48 tests and all checks pass; nothing seen in a browser.

- **Pickups on hills:** coins and XP orbs sit on the terrain height (`pickups.ts`), not at height 0.
- **Editor clicks on hills:** `screenToGround` walks the camera ray over the height grid and bisects the first point under the ground, so placing, selecting and painting hit the visible surface.
- **Spawn points:** a point drawn inside an obstacle or water is pushed out to its edge when the enemy spawns (`waves.ts`, `resolveStatic`).
- **Story objectives:** number boxes for kills, mini bosses, wave to clear and ring radius (Game logic tab > Objectives).
- **Jeep:** a health bar over an occupied vehicle; in RTS, right-clicking a vehicle with a free seat sends the selection to climb in (new order `board`, `orderBoard` in `soldiers.ts`).
- **Mission briefing:** `logic.briefing` (story maps, up to 600 characters), a textarea in the Objectives section, shown as a card when the mission starts from the menu or with Play in the editor; a click closes it. `story-1` has one.
- Still open: slopes do not block.
