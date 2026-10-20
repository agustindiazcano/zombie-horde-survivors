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

## E3 (second part): scouts, blackout, abduction and hunters (same day)

The scene now runs about 2.5 minutes in Map 6 (times are seconds into the run):

| Time       | What                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 to 60    | Stars, then the blue lights wander, cross the sky and come down over the houses (first part)                                                                 |
| 61 to 81   | Neighbours: "What are those things?", "Are those drones?", "Is this real?!", "Look, they're everywhere!", "I have no signal on my phone.", "Me neither."     |
| 74         | Four scout spheres (fast metal, short dashes and sudden stops) start crossing the sky                                                                        |
| 84 to 88   | The street lights and windows flicker, then everything goes out; only a little moonlight is left (`skyShow.blackoutLight`)                                   |
| 85 to 101  | "What's going on?!", "I can't see anything!", "Does anyone have a flashlight?", "Use your phones!"; from 98 every third neighbour holds a white glow (phone) |
| 100+       | The scouts come down to hang about 5 m up over the crowd; from 104 the neighbours walk over and stand under them                                             |
| 112 to 124 | An abductor sphere arrives, shines a wide beam on one person and lifts them slowly (1.1 m/s, 7 m); the crowd panics; the sphere leaves straight up at speed  |
| 127+       | Five small hunter spheres appear beside people and vaporise them as they run; subtitles "RUN!!!", "Who's got a gun?!", "Help!"...                            |

Code: `kind` in `orbs` of `game.json` (`metal`, `scout`, `abductor`), `src/sim/orbs.ts`, `lift` and `gathered` on animals, `setStreetPower` / `StreetLights.setPower` / `EnvironmentView.setDim` for the blackout, phone glows in `SkyLightViews.updatePhones`. The soldier's flashlight is off whenever a map runs the sky show.

Checked headlessly (throwaway test, deleted): at 110 s 19 people stand near the crowd point, at 120 s one is lifted, the abductor leaves, and the hunters kill all 46 by about 3 minutes. Nothing seen in a browser. To look at: the darkness of the blackout, the glow and size of the spheres, the abduction beam, the pace of the hunters (`hunter_sphere` delays), the subtitle timing against what happens. The player is not a target yet.

## E3 (third part): the big sphere, paralysed crowd and slow vaporising (same day)

Changes the user asked for after seeing the second part:

| Change              | What                                                                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No grid             | The guide grid over the floor is not drawn on a painted map (`arena.ts`)                                                                                                                                                                                                                         |
| Big abductor        | Radius 3.2 m (bigger than a car), 14 m up. It arrives at 110 s, takes **4 people** one after another (beam 2.5 s, slow lift to 10 m, 1.8 s between), and stays 60 s from arriving. The crowd stands frozen and talks ("Let them go! Please!", "I can't move...", "They're not going to get me!") |
| Cold light          | While the big sphere is there it pours a grey-blue spotlight, a soft cone and a pool on the ground over the crowd (`FLOOD_*` in `src/render/orbs.ts`); it fades when the sphere leaves                                                                                                           |
| Hunters start later | 8 small spheres wake at 162 s, after the last abduction. Each ray holds a person for 2.6 s (`vaporTime`): they stand rigid and glow brighter (sprite and light), crumble, then a big flash, a ring on the ground and a cloud of ash; a rising whine, then a crack                                |
| Metal look          | The spheres are dark metal with a reflection map made up in code (moon, lamp glow, cold sky; without it metal only looks black) and a dark band with a faint cold line round the middle                                                                                                          |
| More people         | 116 neighbours (36 around the meeting point), they hurry to the crowd and push each other apart so they do not overlap (`separateCrowd`)                                                                                                                                                         |

Checked headlessly (throwaway test, deleted): 116 people, the sphere takes 4, leaves at about 175 s and the hunters then kill at roughly one per second; the sim costs 0.3 ms per step with 116 civilians. Nothing seen in a browser: look at the cold light (`FLOOD_INTENSITY`), how metallic the spheres read, the burn glow and flash, and the frame rate with 116 animated people (F3).
