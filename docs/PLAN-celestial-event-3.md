# Plan: Celestial Event III (codename), a hide-and-seek demo for another game on this engine

Status: planned 2026-10-20, nothing built. Branch `feat/celestial-event-3`. It lives in this repo as **Map 6** while it is small; it moves to its own mode or repo when it grows. It replaces section 3 of [PLAN-test-maps.md](PLAN-test-maps.md) (the human vs human map becomes Map 7).

## 1. Story (the user's text, tidied)

In the 21st century the world's governments start a gradual **extraterrestrial declassification**: sightings are real, and there are unknown objects with apparently intelligent behaviour that defy known physics. They move at impossible G forces and leave none of the marks even science-fiction physics predicts: no sonic booms, no gravitational waves, no shock of light, no atmospheric heating (at their speed a normal object would release the energy of a nuclear blast). They could even open the door to new physics.

That the United States leads the disclosure is no accident: the information touches energy, economy, technology and defence of other nations. It does it because **something is coming**.

**UMBRA** is an agency that investigates these events and classifies them as **Celestial Events**. **Level IV** is when extraterrestrial vehicles interact directly with humans: scans, or physical harm. There are no large-scale attacks, out of fear that kilometre-long ships would deploy drones. Special weapons and protocols exist to handle these cases, censor them and eliminate possible biological or other contamination.

"Celestial Event III" is the **codename of the game/demo**; in the fiction the event is classified Level IV. (Ask the user if the codename and the level should match.)

### Opening scene (cinematic, no player input)

The player watches through a **drone** (a UMBRA drone with electromagnetic shielding, which is why it still flies during the blackout). A night in a US suburb, outdoor lights on, neighbours looking at the stars.

| Beat | What happens                                                                                                                         | Sound / HUD                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1    | Calm. Stars. Some stars start to move on trajectories and get closer                                                                 | Crickets, a dog; HUD: `ANOMALY DETECTED`                                                    |
| 2    | Blue and green glowing light orbs pass near the houses. Electric flicker, then a **blackout**                                        | Hum rising, then silence of the grid                                                        |
| 3    | Darkness; the orbs make formations in the sky. People scared: some run, some stand still                                             | HUD: `NO THERMAL SIGNATURE`                                                                 |
| 4    | Moonlight only. **Metal spheres** appear out of nowhere at impossible speed beside people's heads and fire a ray that vaporises them | Total silence while moving; a dry ionising crack on the kill; HUD: `CIVILIAN CASUALTIES: n` |
| 5    | People run harder; the spheres chase and vaporise everyone                                                                           | HUD: `NON-INTERVENTION PROTOCOL ACTIVE`                                                     |
| 6    | A **bigger sphere** abducts people with a beam of light and leaves                                                                   | HUD: `CLASSIFICATION: ESCALATING TO LEVEL IV`                                               |
| 7    | Another metal sphere lands; **grey** aliens step down. A man attacks one with a stick; a grey extends a **staff** and paralyses him  | The scene ends here for now                                                                 |

After the intro the idea is **hide and seek**. Who the player becomes afterwards is open (section 7).

### Threat roles for the playable part (from the user's story)

| Threat                    | Role         | Behaviour                                                                                                                                             |
| ------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light orbs (blue / green) | Seekers      | Drift, pass through walls and windows looking for signs of life; they **mark** whoever they see. Staying still / crouching / cover reduces being seen |
| Metal spheres             | Executioners | When a light orb marks a target a sphere appears beside it with no warning and vaporises it. Silent until the kill                                    |
| Greys                     | Slow hunters | Walk through houses searching for people to take alive; the staff paralyses. They reuse the hunter AI (sight, lose track, search)                     |
| UMBRA (optional)          | Second fear  | Not necessarily the good side: it may want to "clean" scanned survivors                                                                               |

## 2. What the engine already has

| Need                                    | Existing piece                                                                     | Gap                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Hunter that sees, loses track, searches | `src/sim/wander.ts`, `enemies.*.wander.loseTrack`, Map 4 (Stalker), crouch stealth | Several threat types, not one                      |
| Wandering non-hostile units             | `src/sim/animals.ts`                                                               | A civilian family with panic, flee and freeze      |
| Map format, rules, objectives           | `data/maps/*.json`, `noWaves`, story objectives (`objectives.ts`)                  | An event script (timeline)                         |
| Dark lighting, flashlights              | `L` dark mode in `gameRenderer.ts`                                                 | Scripted blackout, flicker, per-house lights, moon |
| Doors, structures                       | `structures.ts`                                                                    | Interiors (later)                                  |
| Drone model                             | `public/models/drone.glb`, `render` hover procedural                               | A cinematic camera with no input                   |
| Kill effects                            | `effects.ts`, gore                                                                 | Vaporise (flash + ash, no corpse), beams           |
| Objects / carry / drag                  | `objects.ts`, `drag.ts`                                                            | Paralysis state                                    |

## 3. New sim and render pieces

| Piece             | Where                                 | Notes                                                                                                                                                             |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Civilians         | `src/sim/civilians.ts` (from animals) | Unarmed; states `idle`, `watch`, `panic` (run away from the nearest threat), `freeze`, `paralysed`, `abducted`. Counter for the HUD                               |
| Orbs              | `src/sim/orbs.ts`                     | Kinds in `data/game.json` `orbs`: `light` (seeker, flies, marks), `metal` (executioner: teleports beside a target, 0.6 s charge, ray), `mother` (abducts)         |
| Vaporise          | `orbs.ts` + `render/effects.ts`       | Removes the unit instantly, no corpse, additive flash and ash particles; armour does not help                                                                     |
| Abduction         | `orbs.ts`                             | A beam column; units inside rise and are removed; the mother leaves                                                                                               |
| Greys             | enemy in `game.json` + hunter AI      | Slow, search sweeps; `staff` attack applies `paralysed` for N seconds instead of damage                                                                           |
| Event script      | `src/sim/events.ts`                   | A timeline in the map JSON (`script: [{ t, do }]`): `starsMove`, `lightsFlicker`, `blackout`, `spawnOrb`, `hud`, `camera`; deterministic, driven by the sim clock |
| Cinematic camera  | `src/cameraControls.ts`               | A `scripted` mode: drone path keyframes, no input, letterbox; ends by handing control over                                                                        |
| Sky               | `src/render/sky.ts`                   | Star points; a subset follows trajectories toward the camera; orbs as emissive spheres with a point light                                                         |
| Blackout and moon | `gameRenderer.ts`                     | `lighting` rule per map: lamps on / off / flickering, moon intensity, no flashlights for civilians                                                                |
| HUD readout       | `src/hud.ts`                          | A cold clinical text overlay (`ANOMALY DETECTED`, `CIVILIAN CASUALTIES: n`...)                                                                                    |
| Sound             | `src/audio.ts`                        | Procedural: crickets, grid hum, ionising crack, silence on movement. No new files                                                                                 |

All numbers go in `data/game.json` (`orbs`, `civilians`, `events`) with the zod schema in `src/sim/config.ts`; the shared test config in `tests/sim/helpers.ts` gets the new required sections. No new tests (the user's rule); the 48 stay green.

## 4. Generic assets to test with

Rule: only CC0 / CC-BY, each one in `assets.toml`, and **ask the user before adding an asset** whose licence is unclear. The first steps need **no new file**.

| Need                        | Placeholder now (no new file)                                                                  | Candidate to add later (to confirm)                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Civilians                   | Existing Quaternius soldier models (`soldier-quaternius-*`) with a civilian tint and no weapon | Quaternius Ultimate Modular Men / Women (10 characters, 24 animations; reported free for commercial use, but Quaternius now has its own licence, QAL v1.0: **read the licence text first**)   |
| Grey alien                  | Existing `enemy-alien.glb` (Quaternius, CC0) scaled thin, tinted grey                          | OpenGameArt "simple lowpol alien basemodel to paint" (low poly, skinned, walk animation, GLB; listed as **CC-BY 4.0**, needs credit); Hyper3D grey alien list (licence per model, unverified) |
| Metal / light / mother orbs | Procedural: emissive spheres, point lights, additive cylinders (no model needed)               | None needed                                                                                                                                                                                   |
| Houses and street           | Boxes from the map editor, flat colours                                                        | Kenney City Kit (Suburban): houses, fences, trees, driveways; **CC0** (glTF files, GLB conversion or use `GLTFLoader` on `.gltf`); Kenney Car Kit already in use (SUV)                        |
| Stick / staff               | A thin cylinder                                                                                | None needed                                                                                                                                                                                   |
| Drone                       | Existing `drone.glb`                                                                           | None needed                                                                                                                                                                                   |

Sources checked on 2026-10-20 (web search; licences not downloaded or confirmed yet): [Kenney City Kit Suburban](https://kenney-assets.itch.io/city-kit-suburban), [OpenGameArt low poly alien](https://opengameart.org/content/simple-lowpol-alien-basemodel-to-paint), [Quaternius Ultimate Modular Women (Blender Nation)](https://bazaar.blendernation.com/listing/ultimate-modular-women-pack/), [Hyper3D grey alien tag](https://hyper3d.ai/tags/grey-alien).

## 5. Implementation plan

| #   | Priority | Step                                                                                                                                           | Done when                                                                          | Depends on                                 |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------ |
| E0  | 🔴       | **Map 6 shell**: `data/maps/map-6.json` (suburb of box houses, street, lamps), `lighting` rule (night, moon, lamps), menu entry, `noWaves`     | The map loads from the menu and looks like a night street                          | none                                       |
| E1  | 🔴       | **Civilians** from `animals.ts`: idle / watch / panic / freeze; placed in the map; HUD counter                                                 | A dozen neighbours stand about and run from a test threat                          | E0                                         |
| E2  | 🔴       | **Metal sphere** (`orbs.ts`): appears beside a target, charges, vaporises (flash + ash); silent movement; casualty counter                     | A sphere kills civilians one by one and chases the runners                         | E1                                         |
| E3  | 🟡       | **Event script** (`events.ts`) + blackout, flicker, light orbs in formations, moving stars (`sky.ts`)                                          | Beats 1 to 5 of the intro run from a JSON timeline                                 | E2                                         |
| E4  | 🟡       | **Cinematic drone camera** (scripted path, letterbox) + clinical HUD text + procedural sound                                                   | The intro plays hands-free from the main menu entry                                | E3                                         |
| E5  | 🟡       | **Mother sphere** abducts a group and leaves; **landing sphere** and **greys** with the staff (`paralysed`); the man with the stick            | Beats 6 and 7: the intro is complete                                               | E4                                         |
| E6  | 🟢       | **Playable hide and seek**: the player controls one civilian or UMBRA agent (section 7); light orbs mark, spheres execute, greys search houses | Surviving to an extraction point or a timer wins; being marked and vaporised loses | E5 + user answers                          |
| E7  | 🟢       | Swap placeholders: Kenney houses, a grey alien and civilians (after the licence check and the user's OK); `npm run credits`                    | Same game, better look                                                             | licences                                   |
| E8  | ⚪       | Interiors, hiding places (wardrobes, basements), UMBRA "cleaners" as a second threat, sound pass                                               | Hiding inside buildings                                                            | interiors plan in PLAN-world-and-engine.md |

Each step is its own small commit; before every commit: lint, format:check, typecheck, tests (read the result), build, check:assets. Update `docs/CONTROLS.md` if a key changes, and `LASTCONTEXT.md` / `PENDING.md`; finished work goes to `docs/worklog/`.

## 6. Risks

| Risk                                                                       | Mitigation                                                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude has no browser: lighting, blackout, beams and camera cannot be seen | Constants named in code; the user looks and reports; keep every look-and-feel number in the JSON   |
| Many dynamic lights in a dark scene cost frame time                        | Orbs share a small light pool; measure with F3 (ties to B0 in PLAN-webgpu-engine.md)               |
| A scripted timeline makes the sim less "pure"                              | The script runs inside the sim from the fixed step clock, no `Date.now`, so it stays deterministic |
| "Another game on this engine" vs. this repo's name and licence             | Starts as Map 6; split into a mode or repo once it grows. The user decides when                    |
| Third-party asset licences (Quaternius QAL v1.0, CC-BY credits)            | Read the licence text and ask the user before adding any file                                      |

## 7. Questions for the user

| #   | Question                                                                                                                                       | Recommendation                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | After the intro, who does the player control? **A** a survivor in a house (the drone is destroyed) or **B** a UMBRA operator entering the zone | **A**: pure hide and seek, no weapons or squad needed               |
| 2   | Is the codename "Celestial Event III" while the in-game level is IV, or should both be the same number?                                        | Keep III as the project name, IV as the in-game classification      |
| 3   | Do civilians fight back or lose the run when many die?                                                                                         | They only flee; the casualty count is a score, not a lose condition |
| 4   | Is UMBRA a second faction to fear (cleans scanned survivors)?                                                                                  | Later (E8)                                                          |
| 5   | OK to download Kenney City Kit (CC0) and the OpenGameArt alien (CC-BY 4.0, credit needed) for E7?                                              | Yes, after I read each licence file                                 |
| 6   | Should it stay as Map 6 or become its own menu entry from the start?                                                                           | Map 6 first                                                         |
