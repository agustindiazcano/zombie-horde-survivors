# Celestial Event III: E0 to E2 (2026-10-20, branch `feat/celestial-event-3`)

Plan: [PLAN-celestial-event-3.md](../PLAN-celestial-event-3.md). Built with placeholders only; no new asset file.

| Step | What                                                                                                                                                                                                | Where                                                                               |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| E0   | Map 6 "Celestial Event III": 130x130, night (`environment`: 01:30, moon, no sun, light fog), two rows of box houses, hedges, parked-car boxes, no waves, one marine, 18 civilians                   | `data/maps/map-6.json`                                                              |
| E1   | Civilians: `animals` entries with `panicSpeed` and `fearRadius` (four variants on the Quaternius male and female soldier models, two tinted); they stroll, then run away from a kill                | `data/game.json`, `data/characters.json`, `data/catalog.json`, `src/sim/animals.ts` |
| E2   | Metal sphere: `orbs` in `game.json`, `logic.orbs` in the map (`type`, `x`, `z`, `at`); it wakes at `at`, jumps beside the nearest civilian, charges 0.7 s, vaporises it (no corpse), rests, repeats | `src/sim/orbs.ts`, `src/render/orbs.ts`, `vaporised` event, HUD line, audio crack   |

Notes:

- The HUD swaps "Kills" for `CIVILIAN CASUALTIES: n / total` when the map has civilians.
- The sphere makes no sound while moving; the kill has a dry crack (procedural).
- Soldiers are **not** targets yet (E6). The run does not end when the civilians are gone.
- Checked headlessly with a throwaway test (deleted): in 60 s of sim more than five civilians are vaporised. Nothing was seen in a browser.
- To look at: the sphere size (`orbs.metal_sphere.radius`), the ray, the flash and ash (`FLASH_LIFE`, `ASH_COUNT` in `src/render/orbs.ts`), civilian model scale (1.0 is a guess), the panic `run` clip, the night light level (the map's `environment`).
