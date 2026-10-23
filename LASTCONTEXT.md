# Last Context — Current State (2026-10-14)

Only what is still open: read this first in every session. When an item here is done, move it to `docs/worklog/` and take it out of this file. What was done up to today: [docs/worklog/2026-10-14-snapshot.md](docs/worklog/2026-10-14-snapshot.md). The full list of open work, by priority: [PENDING.md](PENDING.md). Working rules: [CLAUDE.md](CLAUDE.md).

## Where things stand

- **`main`** was at `e192428` on 2026-10-23 (it holds PR #59 and everything merged after it: the helicopter, sea, texture lab and physics-lab branches) and has everything built so far up to the ocean work: the whole stack of phases 1 to 8 and 10, the editor work and the polish. (PRs #36 to #46 were merged into their parent branches instead of `main`, so #47 brought the rest in one go; the stack branches are still on the remote, merged and safe to delete once the user agrees.) No PR or feature branch is open apart from the docs update that refreshed this file.
- **The game is live** at https://agustindiazcano.github.io/zombie-horde-survivors/ (GitHub Pages, redeployed by `.github/workflows/pages.yml` on every push to `main`; the last deploy succeeded). The user tests locally at http://127.0.0.1:5173/ with the dev server, which serves whatever branch is checked out.
- **Nothing has been seen in a browser by Claude.** Lighting, boss eyes, radar, menus, the squad screen, drag and drop and the settings presets are all untested visually, and the balance comes from headless simulations of a passive squad. Expect the user to report visual and feel problems; tune with the constants named in the code (see PENDING §0–1).
- **Branch `feat/ocean-map-13` (2026-10-23): everything built on it is still untested in the real game** (user's note): the settings window, Measure my machine, antialiasing, the new switches and sliders, per-part resolution and the Map 13 look. Only headless Chrome saw it. The user gave the OK for Rust/WASM the same day: first target the ocean maths ([PLAN-rust-wasm.md](docs/PLAN-rust-wasm.md)), `.wasm` committed.
- Last verified on `main`: lint, format check, typecheck, the 51 tests, build and the asset check all pass.

## Merged on 2026-10-20 (PRs #57 to #59, `main` at `54b68c5`)

Everything that was local on 2026-10-20 is now in `main`: the SUV colour texture (#57), AI grenades (#58), and the stack in #59 (W0 soldier pathing, objects block movement, draggable corpses and loose items, door system v2 with Map 7, machine-gun nest and watchtower with turret ammo, structures in the map editor). Worklogs: `w0-soldier-pathing`, `ai-grenades`, `objects-block-movement`, `corpses-and-loose-items`, `doors-v2`, `posts-and-turret-ammo`, `editor-structures` (all 2026-10-20). The old local branches are all merged; do not delete them without asking the user (PENDING §5).

**Still never seen in a browser (the user looks next):** Map 7 (doors), the nest and tower of Map 2, the editor's Assets tab, corpses with Drop / Take, and the AI dragging the wounded. What the user reports as looking or feeling wrong is fixed first.

Known limits: the AI does not use posts, doors or keys; zombies ignore the crew of a post; the editor does not yet validate overlaps or the quantity of loose items.

## Work of 2026-10-21 (branch `feat/helicopter`, 18 commits ahead of `main`, not pushed, no PR)

`feat/helicopter` is cut from `main` (`54b68c5`) and also contains the docs refresh of `docs/refresh-lastcontext-after-59`. Nothing below was seen in a browser; headless probes checked the sim only.

| Commit    | What                                                                             |
| --------- | -------------------------------------------------------------------------------- |
| `25bc92c` | Procedural helicopter (engine start, hover, circles) and Map 8 "Helicopter test" |
| `8f4f8bf` | Huey, Chinook and V-22 (tilting pods) with their own procedural models           |
| `5d288c8` | Map 9 "Sea test": walkable carrier, frigate, island, drivable speedboats         |
| `7914b6b` | Fix: aircraft fly over water and cliffs (`resolveFlying`)                        |

- **Aircraft** (`src/sim/aircraft.ts`, `air` block in `vehicles.*` of `game.json`): hold forward 10 s on the ground to start the engine, Space up, C / Ctrl down, Shift faster; an AI pilot takes off by itself on a move order, then hovers or circles (RTS: Space take off, C land, H hover / circle). Zombies cannot reach it above 2.5 m. Models in `src/render/vehicles.ts`. Worklog: [helicopter](docs/worklog/2026-10-21-helicopter.md).
- **Boats and ships** (`src/sim/naval.ts`, `water` / `fixed` / `ship` in `vehicleType`): speedboats sail only on water and are stopped by the shore and by hulls; stepping out needs dry ground within 8 m. The carrier and the frigate are `fixed` (not drivable yet); the carrier's walkable deck is a plateau baked into the height grid. Models in `src/render/ships.ts`. Worklog: [map-9-sea](docs/worklog/2026-10-21-map-9-sea.md).
- **Swimming (Map 10, `swim` map rule, `src/sim/swim.ts`):** C dives, Space surfaces, Shift swims faster, an oxygen bar runs while the head is under. Worklog: [swimming-map-10](docs/worklog/2026-10-21-swimming-map-10.md). Never seen in a browser.
- **Texture lab (Map 11, `src/render/pom.ts`):** parallax occlusion mapped walls (brick, stone, plates, cobble slab) from procedural textures; **,** and **.** turn the time of day on maps with `timeControl`; the map list now scrolls. Worklog: [texture-lab-map-11](docs/worklog/2026-10-21-texture-lab-map-11.md). The shader was checked in headless Chrome; the map itself was not seen. Later the same day: 14 real CC0 ambientCG surfaces ([worklog](docs/worklog/2026-10-21-real-textures.md)), 16 procedural surfaces, six kinds of glass, a police light bar, a Toaster graphics preset and Map 11 grown to 160 x 160 ([worklog](docs/worklog/2026-10-21-texture-lab-more.md)).
- **Reflections, castle and graphics (later the same day):** a baked reflection map, parallax silhouette clipping (the user says it works), a small castle in Map 11 (wood floor, swing and glass doors, glass windows, torches) with two flights of steps for testing feet, a Textures setting (melted to ultra, 1K sets for ultra) and an Ultra graphics preset. Worklog: [castle-and-graphics](docs/worklog/2026-10-21-castle-and-graphics.md). **Next:** the user looks at the castle, doors, steps, Ultra and the texture levels; then 2K / 4K ultra textures, then procedural IK (quadruped test first).
- **Known problems:** the carrier tower's collider is 2 m high but the model is about 25 m (aircraft clip through it); moving the carrier in the editor does not move its deck; the main bundle grew from 714 kB to 1.5 MB because of Map 9's 800 kB JSON (excluded from Prettier).
- **Waiting on the user:** a look at Maps 7, 8 and 9, the Map 2 nest and tower, the editor's Assets tab, corpses with Drop / Take and the AI dragging the wounded; and an OK before any model download (police, civilians, military, vehicles; CC0 / CC-BY only).

## Physics lab on Rapier (2026-10-21, branch `feat/physics-lab`, uncommitted, mixed with `feat/helicopter` work)

Map 12 runs `@dimforge/rapier3d-deterministic-compat` (balls, boxes, ragdolls); the own sphere solver stays as the Rust/WASM reference ([worklog](docs/worklog/2026-10-21-rapier-lab.md), PENDING §2o). Never seen in a browser. Decided by the user: Rapier instead of the own solver, ragdoll bones as Rapier joints. **Open:** how the 2D units meet Rapier bodies; then shots as impulses, ragdoll on death, grab and throw, loose limbs. `npm run check:rapier` and `bench:physics` print the determinism hash.

## Ocean and Map 13 (2026-10-23, branch `feat/ocean-map-13`, not pushed, no PR)

Wave ocean from the user's HTML demo: `src/sim/ocean.ts`, buoyancy in the Rapier lab, the water shader `src/render/oceanView.ts`, Map 13 "Ocean test" (swim, lab panel, time keys), the water look in `environment.water` and a season in `environment.season`, both editable in the editor's Environment tab together with the wave numbers (`logic.ocean`). Decided by the user: option A (keep Rapier, add buoyancy forces), a playable Map 13, the water look customisable per map, weather and seasons controls. The shader was checked in headless Chrome only; nothing was seen in the game. [Worklog](docs/worklog/2026-10-23-ocean-map-13.md), PENDING 2p. Same day, on top: a shader sky (sun, moon, stars, volumetric clouds), `nightLight`, lightning, rain drops on ground and water, and Water / Sky clouds / Rain drops graphics options, all from the user's HTML demos ([worklog](docs/worklog/2026-10-23-sky-storm-rain.md)). Checked in headless Chrome only. Later that day, on the same branch `feat/ocean-map-13` (about 13 commits, no PR yet): ground detail, wet shore and cloud shadows, filmic tone mapping, wave patterns (golden, Fibonacci, random, parallel swell, custom), whirlpools with the "Law 3" swirl, swimmers and boats on the real waves, a planar water mirror with an oblique clip plane (option Water reflection), neon orbs as real lights, a snow layer on every standard material and a wet ground. All of it is in [GRAPHICS.md](docs/GRAPHICS.md), [PHYSICS.md](docs/PHYSICS.md) and [TECHNIQUES.md](docs/TECHNIQUES.md) (the register of the author's own formulas and the paper plan). Nothing was seen in the game itself, only in headless Chrome. Rust plan: [PLAN-rust-wasm.md](docs/PLAN-rust-wasm.md). Later the same day (about 20 commits on the branch): glass dirt, a frozen sea (ice shader, `ocean.frozen`), rain on the camera lens (`lens` option), the whirlpool geyser, synthesised thunder, a sea wind (`ocean.wind`) and a JONSWAP pattern; the graphics settings redesign is built: a near-full-screen window from an option registry (`src/graphicsOptions.ts`) with GPU / CPU / VRAM cost bars and chips, 11 new options and a Measure-my-machine benchmark (`src/graphicsBench.ts`); plan and rules in [PLAN-graphics-settings.md](docs/PLAN-graphics-settings.md) and GRAPHICS.md sections 1 and 13. Seen only in headless Chrome. Then, at the user's request: a resolution per part (all characters, enemies only, water) in the Performance page, drawn into smaller targets and composited by depth (`src/render/resolutionLayers.ts`, GRAPHICS.md section 14); checked in headless Chrome only (blocky characters and a blurred sea show, colours match the normal path).

## Decisions the user has made (do not re-litigate)

- **Steam is the target and download size is not a constraint** (2026-10-21): do not shrink assets to save weight. Graphics options must also serve people with a real GPU (Ultra preset); the user's own PC has none, so its FPS does not matter.

- **No new tests / no TDD** for the prototype; keep the 51 sim tests passing.
- **Name:** Zombie Horde Survivors; it must contain "zombie".
- **The drone is a machine** (a small spaceship), never a monster. It starts **unarmed** and needs a **Drone gun** (shop or crates) to fire.
- **Soldiers start with a pistol**; the rifle is a crate and shop item.
- **First/third person:** the mouse turns the view 1:1 and instantly (cursor locked, crosshair); the soldier model follows the view with no easing.
- **Controls:** `T` cycles top-down → third → first person; `Y` switches RTS ↔ direct control; `Esc` / `P` / `I` pause and show the squad screen (bonuses, stats, units, inventories); `B` the shop between waves; `O` the settings; `L` dark mode; `F3` the FPS counter.
- **Lighting:** normal lighting is the default. The dark mode with a flashlight per soldier stays in the code (`L`).
- **XP:** the global XP (blue orbs) levels the squad and gives a perk each level; each unit also earns its own XP and a kill count when it lands the killing shot. Level 1 needs 200 XP (doubled on the user's request because levels came too fast).
- **Mini boss every 3rd wave**, cycling zombie, skeleton, alien, brute, hound: darker, red eyes, slower; health x50, x70, x100, x200, x500 then x1.6 each; damage x2 to x8; size 2× to 5× growing with health; better loot.
- **Radar:** a round light-blue motion tracker like the one in Aliens (pulse ring, blips only when crossed), centred on the squad, 30 m range.
- **Arena:** 80×80 with extra cover; the intermission is 8 s so there is time to shop.
- **Deploy:** GitHub Pages now; Vercel was considered and dropped for the moment; the repo is public.
- **Workflow:** branch per task, the user merges PRs and says "anda a main y pull"; Claude opens a PR only when asked.
- **Project docs:** `CLAUDE.md` (rules and reference), `PENDING.md` (open work by priority) and `LASTCONTEXT.md` (current state), in the format the user uses in their other projects; finished items move to `docs/worklog/`.

## Latest work (2026-10-19, branch `feat/build-mode`, not pushed, no PR)

`main` is at `860abc5` (PR #52 merged: the weapons, marines, flow field and everything before). Branch `feat/build-mode` adds, on top of it: build mode (structures, blueprints, doors, turrets, the **N** menu, break cost in the flow field), Map 2 (build test), Map 3 (weapons range), Map 4 (hide and seek with the Stalker hunter), `noWaves` / `build` / `startGold` / `structures` map rules, and crouch stealth. Details: [worklog](docs/worklog/2026-10-19-build-mode.md). Plans written: [test maps](docs/PLAN-test-maps.md) and [world and engine](docs/PLAN-world-and-engine.md). The user's priority order now: build mode first, the engine, graphics and mechanics; balance and going public (GoatCounter, Search Console) come later.

Also on that branch (later the same day): liftable and throwable objects, carrying bodies, spreading fire and barrels (Map 5, the interaction lab), soldier training with classes (the squad screen's Training box) and the title-screen carousel. [Worklog](docs/worklog/2026-10-19-interaction-and-training.md). Decisions the user gave: the carousel as recommended; a soldier's level gives points for stamina, strength, dexterity, weapon expertise and special bonuses, with a class (engineer, medic, demolitions...) chosen per soldier.

Merged since: PR #53 (`feat/build-mode`) is in `main` (`0e14a2e`). Now on branch `feat/celestial-event-3` (not pushed, no PR, last commit `d2e311c`): the plan [PLAN-celestial-event-3.md](docs/PLAN-celestial-event-3.md) and Map 6 "Celestial Event III", a scripted ~5 minute scene: a night suburb, the sky show, blackout, metal scouts, a big abductor with cold light and a parting ray (110-180 s, the crowd stays calm), a second ship with a ring of survivors round the landing point (184-197 s), three grey aliens that freeze one man and vaporise a helper and four more from the ring (198-217 s), and only then the panic and the 8 hunter spheres (217 s+) ([worklog](docs/worklog/2026-10-20-celestial-event-3-e0-e2.md), fifth part). Script times live in `scripts/gen-map6.py` and in `game.json` (`skyShow`, `orbs`, `greys`, `animals`): change both together. The plan now also holds the Nodes lore (Nodes 1-10, the player is Node 10, remote-projection intro) and the cosmic horror layer (open hypotheses that are never confirmed), plus the Node 10 mechanics (psychic signature, 5 s premonition, living geometry) for E6, which need interiors. Placeholders only (existing models, procedural spheres); no new asset was downloaded. The user has not seen it in a browser yet.

W0 (soldier pathing round structures, doors opened on the way) is built on `feat/soldier-structure-pathing` ([worklog](docs/worklog/2026-10-20-w0-soldier-pathing.md)), waiting for the user's look and OK. The SUV colour texture fix is on `fix/suv-colormap`.

## Open items (details in PENDING.md)

- 🔴 The user has to look at the live game and report what looks or feels wrong (PENDING §0).
- 🟡 Balance retune after real play: pistol start vs. the first boss (a passive squad dies at wave 3), boss damage and the huge boss health (PENDING §1).
- 🟡 Waiting on the user: the main-menu **carousel** (the request was cut off), what a **soldier's own level** should do, whether **gold persists between runs** (PENDING §2).
- 🟡 Going public: GoatCounter needs a site name; an Open Graph image needs a 1200×630 screenshot; Search Console is the user's (PENDING §3).
- 🟢 Models are ~15 MB: compression is the next performance win (PENDING §4).
- 🟡 Modes, map editor, players, stats and equipment: phases 1 to 3 are built; 4 (save / load maps) is next (PENDING §2c, section below).

- ⚪ Three plans written on 2026-10-19, nothing built, decisions taken: [online multiplayer](docs/PLAN-multiplayer.md) (relay plus host; gold, XP and perks per player; any player can pause), [build mode](docs/PLAN-build-mode.md) (structures, doors, turrets, Map 2) and [weapons and combat](docs/PLAN-weapons-and-combat.md) (semi-auto pistol, ammo, recoil, accuracy, aim with the right mouse button in third / first person, headshots, crits, melee, accessories). Suggested order: weapons W1 to W6 (W6 accessories and the workbench: [worklog](docs/worklog/2026-10-19-weapons-w6.md)) and the weapons in hand (**built on branch `feat/weapon-instances`, on top of `main` at `af0733d`, not pushed, no PR, waiting for the user's OK; W4 headshots and crits is the newest commit**), then the flow-field pathfinding (branch from `main`), W6 accessories and workbench, AI grenades, the rest of 8b, and last build mode and multiplayer. A plan for marine zombie variants, dismemberment, runners, wanderers and climbers is in [docs/PLAN-marine-zombies-and-dismemberment.md](docs/PLAN-marine-zombies-and-dismemberment.md) (nothing built; the user answers its section 11). **M2 (head dismemberment) is built on the same branch** ([worklog](docs/worklog/2026-10-19-marine-m2.md)); M3 (limbs and zones) is built too ([worklog](docs/worklog/2026-10-19-marine-m3.md)); M4 (procedural crawl, the crawler marine replacing the hound, cut in two) is built too ([worklog](docs/worklog/2026-10-19-marine-m4.md)); M5 (bosses as marines with armour plates, enrage on a lost arm) is built too ([worklog](docs/worklog/2026-10-19-marine-m5.md)); next is the AI throwing grenades, after the user's OK. The flow-field pathfinding (`feat/flow-field`) is merged into `feat/weapon-instances` (no conflict; the acrobat's `hop()` sits next to `steerTarget`). Weapons in hand use procedural meshes on the RightHand bone (`src/render/weaponModels.ts`).

## Next big work: modes, map editor, players, stats (planned 2026-10-18, no code yet)

Full plan and decisions: [docs/PLAN-modes-and-map-editor.md](docs/PLAN-modes-and-map-editor.md) (section 8 lists what the user decided; PENDING §2c lists the phases). The mobile version is merged (PR #33). The plan, the PENDING entry and the Meshy AI marine model (CC-BY-4.0, credited in `assets.toml` and the README; it replaces the toon soldier in slot 4 of `data/characters.json` and adds the "Infected marine" enemy with a green `tint`) travel together in the PR from branch `feat/marine-model-and-plan`. Check that this PR is merged and pull `main` before branching.

**Phases 1 to 8, 10 and the editor polish are all merged into `main`** (PR #35 and PR #47). Per-phase details are in the worklogs of 2026-10-18 in `docs/worklog/`: [phase 1](docs/worklog/2026-10-18-phase-1-map-format.md), [1b](docs/worklog/2026-10-18-phase-1b-players.md), [1c](docs/worklog/2026-10-18-phase-1c-unit-stats.md), [1d](docs/worklog/2026-10-18-phase-1d-items-equipment.md), [1e](docs/worklog/2026-10-18-phase-1e-downed-state.md), [2](docs/worklog/2026-10-18-phase-2-menu-flow.md), [3](docs/worklog/2026-10-18-phase-3-editor-skeleton.md), [4](docs/worklog/2026-10-18-phase-4-save-maps.md), [5](docs/worklog/2026-10-18-phase-5-place-units.md), [6](docs/worklog/2026-10-18-phase-6-terrain.md), [7](docs/worklog/2026-10-18-phase-7-game-logic.md), [8](docs/worklog/2026-10-18-phase-8-vehicles.md), [10](docs/worklog/2026-10-18-phase-10-story-mode.md) and [the editor polish](docs/worklog/2026-10-18-editor-polish.md) (hills, cliffs, fire, climbing, dragging a body, animals, jeep model, credits, Wylan Engine, spatial grid). **Next: the rest of 8b** (lift and throw objects, carry a body, fire spreading) once the user has seen it all. No new tests; the 48 must stay green. A duplicate `Meshy_AI_Digital_Camo_Soldier_All_Animations.glb` sits uncommitted in the repo root: ignore it, do not commit it. Lesson: with stacked PRs, merge the first and retarget the next to `main` (or delete each branch on merge); otherwise each PR lands in its parent branch.

The old paste-in prompt that lived here (for `feat/weapon-instances`) was removed on 2026-10-23: that work is merged. Start a session from CLAUDE.md, this file and PENDING.md.

## Gotchas (they bit before)

- A new feature branch cut from `main` while an earlier PR was unmerged lost that PR's code (the main menu "disappeared" locally). Check what `main` has first.
- Python edit scripts that rewrite a file can leave Vite's dev cache with an empty module; `touch` the file. Prettier realigns tables and breaks anchor-based edits.
- Long shell chains that end in `grep` hide failing tests; read the test summary before committing.
- The Bash tool rejects large heredocs on this Windows setup: use the Write tool for files and scripts.
- Zombie steering used to get stuck on long walls and concave shapes; it now follows a flow field (`src/sim/flowfield.ts`, branch `feat/flow-field`). If enemies ever stall a wave again (a wave only ends when all are dead), look there first (clearance, `invalidateFlow` after obstacles change).

## How to resume

1. `git checkout main && git pull`, then read this file and PENDING.md.
2. Check the dev server is up: http://127.0.0.1:5173/ (do not start a second one).
3. Ask the user what they saw in the game, or take the next item of PENDING §0–2.
4. Before any commit: lint, format check, typecheck, tests, build, asset check, and read the results.
