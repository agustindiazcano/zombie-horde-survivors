# 2026-10-21 — Swimming, diving and Map 10

Branch `feat/helicopter` (not pushed, no PR). Lint, format, typecheck, build, check:assets and the 48 tests pass. Nothing seen in a browser; a throw-away headless probe (not kept) swam, dived, drowned and surfaced on Map 10.

- **Rule:** map `logic.swim: true` (`MapLogic`, `GameConfig.swim`). `arenaOf` then skips `waterObstacles`, so water no longer blocks walkers. Cliffs still do.
- **Data:** new `swimming` section in `data/game.json` (`swimDepth` 0.9, `speed` 3.2, `fastScale` 1.7, `maxDepth` 8, `diveSpeed` 2.4, `submergedSpeedScale` 0.8, `headDepth` 0.5, `breath` 30 s, `breathRegen` 6/s, `drownDamage` 12/s). `tests/sim/helpers.ts` copies the section and ignores `swim`.
- **Sim (`src/sim/swim.ts`):** `waterDepthAt`, `isSwimming`, `isSubmerged`, `updateBreath`. `Soldier` has `swimming`, `depth`, `oxygen`. Swimmers have no stances or jump; the controlled one dives with C / Ctrl, rises with Space, swims fast with Shift. Depth is capped by `maxDepth` and the sea floor. Submerged (depth over `headDepth`): breath runs down, no shooting, slower. At zero breath a hurt of `drownDamage` lands once a second. AI soldiers swim at the surface at `swimming.speed`.
- **Render:** a swimmer lies almost flat (`SWIM_PITCH`) and floats at `water - SWIM_FLOAT - depth`, never below the ground. The OXYGEN bar (`hud.ts`, `.hud__oxygen`) shows while the focused unit swims and turns red under 25%. The hint line shows the depth.
- **Map 10 "Swim test"** (`scripts/gen-map10.py`, JSON excluded from Prettier): 128 x 128 m, a small island (house, trees), four marines on the south beach, a reef, a shallow rock, a deep plateau and a trench on the east side. No waves.
- **Not done / guesses:** swim animation (the run clip plays, tilted), splash and bubbles, underwater tint and fog, sound, first-person camera depth, vehicles in the swim rule, AI diving, items dropping when swimming. Tune `swimming.*` and `SWIM_*` in `gameRenderer.ts` after looking.
