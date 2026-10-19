# 2026-10-18 — Polish of the editor and Story work

Branch `feat/editor-polish`, cut from `feat/story-mode` (twelfth in the stack; PRs go in order). 48 tests and all checks pass; nothing seen in a browser.

- **Pickups on hills:** coins and XP orbs sit on the terrain height (`pickups.ts`), not at height 0.
- **Editor clicks on hills:** `screenToGround` walks the camera ray over the height grid and bisects the first point under the ground, so placing, selecting and painting hit the visible surface.
- **Spawn points:** a point drawn inside an obstacle or water is pushed out to its edge when the enemy spawns (`waves.ts`, `resolveStatic`).
- **Story objectives:** number boxes for kills, mini bosses, wave to clear and ring radius (Game logic tab > Objectives).
- Still open: slopes do not block, RTS enter orders and a health bar for the jeep, a briefing text for missions.
