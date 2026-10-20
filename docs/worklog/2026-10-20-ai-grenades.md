# 2026-10-20 — AI soldiers throw grenades

Branch `feat/ai-grenades` (from `main`). Soldiers not under direct control now lob a grenade they carry at a group of enemies.

## Rules (`aiThrowGrenade` in `src/sim/grenades.ts`, called from `updateAi` before the shooting)

- The soldier must carry a grenade, be on foot and standing, and not be recovering from a shot or throw.
- It picks the enemy whose surroundings hold the most enemies inside `aiClusterShare` of the blast radius (a mini boss counts as `aiBossWeight`). The group must score at least `aiMinEnemies`.
- The target must be within the throw range and at least `aiSafeFactor` times the blast radius from the thrower and from every living ally on foot.
- After a throw it waits `aiCooldown` seconds. The direct-control and RTS throws are unchanged.
- Numbers: `grenades.ai*` in `data/game.json` (4 enemies, boss = 6, 8 s, 1.3x, 0.8).

## Checked

A throwaway sim (deleted, no new tests): six stationary enemies 11 m away, one AI soldier with grenades and an ally 4 m away from it. It threw once, killed four of the six and nobody on the squad was hurt. The 48 tests, lint, format, typecheck, build and the asset check pass.

## Known limits

- Not seen in a browser. All numbers are guesses.
- No line-of-sight check for the arc: a grenade can land behind a wall it cannot clear.
- AI soldiers get grenades only from the shop, crates or the squad screen; nothing buys them automatically.
- The ally check ignores a leader who is about to run into the blast.
