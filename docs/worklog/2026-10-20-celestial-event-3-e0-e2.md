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

## E3 (first part): the sky show and a suburb (same day)

The user asked for Map 6 to open as a scene: the player is an unarmed neighbour in first person looking up with 46 other people, at night under street lamps, stars in the sky and blue lights that start to move.

| Piece           | What                                                                                                                                                                                                                                                        | Where                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Start view      | Map rules `startView: first` and `startPitch` (radians up); the marine has empty hands (`equipment` all null)                                                                                                                                               | `logic` in `data/maps/map-6.json`, `main.ts`, `GameRenderer.setLookPitch`                    |
| Suburb          | Generated once by a script (seeded): two streets, 22 houses with lit windows and doors toward their street, 70 trees, 13 street lamps, 7 parked cars; painted lawns, sidewalks, driveways, garden beds                                                      | `data/maps/map-6.json`, `src/render/neighbourhood.ts`, prop `asset` + `facing` on `Obstacle` |
| Street light    | Every lamp has an emissive head and a soft pool on the ground; the 6 nearest lamps to the camera get a real point light (re-picked 2.5 times a second)                                                                                                      | `StreetLights` in `neighbourhood.ts`                                                         |
| Stars           | 1,600 stars on the sky dome at night (white, blue, warm)                                                                                                                                                                                                    | `EnvironmentView` in `src/render/environment.ts`                                             |
| Blue lights     | `skyShow` in `game.json`: 42 lights that stand like stars, drift from 10 s, 1 in 4 crosses the sky like an aircraft from 22 s, and from 32 s four formations of three come down in bursts with sudden stops and hover over houses (all there by about 70 s) | `src/sim/sky.ts`, `src/render/skyLights.ts`                                                  |
| People watching | Civilians stand still and lean back until `skyShow.calmUntil` (90 s)                                                                                                                                                                                        | `src/sim/animals.ts`, `syncAnimals`                                                          |
| Subtitles       | Yellow lines at the bottom (map rule `subtitles`: `at`, `duration`, `text`); the health, wave and gold readouts are hidden while a sky show runs                                                                                                            | `src/hud.ts`, `src/hud.css`                                                                  |

To look at: lamp brightness (`LAMP_INTENSITY`, `LAMP_RANGE`), glow size (`GLOW_SIZE`), the lean (`WATCH_LEAN`), the timeline numbers in `skyShow`, the subtitle times, whether the flashlight cone of the night mode shows on the unarmed marine. The metal sphere is no longer in this map (it comes back after the show). Re-generate the map with the script if the layout changes (it is not kept in the repo).
