# 📝 Roadmap: Zombie Horde Survivors

Personal working notes: only what is still open, in priority order. Everything done up to 2026-10-14 (PRs #1–#31, the game live on GitHub Pages): [docs/worklog/2026-10-14-snapshot.md](docs/worklog/2026-10-14-snapshot.md). README.md holds the player-facing reference; [LASTCONTEXT.md](LASTCONTEXT.md) holds the current state and the user's decisions.

## Priority Order

### 0 — 🔴 Look at the live game (nothing has been seen in a browser yet)

Claude has no browser, so every visual and feel decision below is an estimate. The user plays https://agustindiazcano.github.io/zombie-horde-survivors/ (or the dev server) and reports; then tune with the named constants.

- [ ] 🔴 **Models and the arena render at all** (soldiers, six enemy types, drone, 80×80 arena). The first local test showed only the floor until the models loaded; confirm they do now.
- [ ] 🔴 **Lighting:** normal is the default; dark mode (L) with flashlights was reported "too black" at first and was brightened (`AMBIENT_INTENSITY`, `MOON_INTENSITY`, `FLASHLIGHT_*` in `gameRenderer.ts`). Confirm the dark mode now looks right.
- [ ] 🟡 **Mini boss look:** darkening (`BOSS_DARKEN`) and the red eyes are placed from the health-bar height of each model; check the eyes sit on the face for brute and hound, and that size 2×–5× does not clip or block the camera.
- [ ] 🟡 **Radar** (Aliens motion tracker): range 30 m, pulse period 2.4 s, readability, position next to the squad panel.
- [ ] 🟡 **Pause / squad screen:** layout with four open windows at 1080p and smaller, 3D previews, drag and drop of weapons (HTML5 drag events), the drone gun flow.
- [ ] 🟡 **Settings presets** (Low / Medium / High): measure FPS with F3 on the user's machine and retune `PRESETS` in `src/settings.ts`.
- [ ] 🟡 **Revived soldier animation** (shop "Reinforcement"): the clamped death pose should crossfade back to idle; never seen.
- [ ] 🟡 **Third / first person feel** after the 1:1 mouse look (confirm the sensitivity `LOOK_SENSITIVITY`).

### 1 — 🟡 Balance (headless estimates only)

- [ ] 🟡 **Pistol start vs. the first boss:** a passive squad with pistols dies at wave 3 (the first boss, health x50); with rifles at wave 6. An active player does better, but confirm the early game is not too hard. Knobs: `weapons.pistol`, `boss.health`, `waves.healthScalePerWave`.
- [ ] 🟡 **Boss damage x8 and up** (80 per hit vs. 100 health soldiers at the 5th boss); decide whether to cap it.
- [ ] 🟡 **A 50,000-health boss** (5th boss, x500) with a pistol or rifle: confirm it is killable in a sensible time with perks and the shop, or lower the later multipliers.
- [ ] 🟡 **XP per level is 200 and growing 35% per level:** check the perk pace; the first perk comes after about 20 kills.
- [ ] 🟡 **The drone starts unarmed and gold is 0 at the first shop**, so the Drone gun (50 gold, or a crate) arrives late; decide whether to give a free one or leave the drone idle early on.
- [ ] 🟢 Passive-squad probe shows the first wave takes a while to arrive on the 80×80 arena (zombies spawn at the edge); check the pace feels right, maybe a shorter first wave delay.

### 2 — 🟡 Decisions waiting for the user

- [x] Main-menu carousel built (five slides; [worklog](docs/worklog/2026-10-19-interaction-and-training.md)). Look at it and edit the text in `SLIDES` of `src/mainMenu.ts`.
- [x] Soldier level: skill points for attributes, weapon expertise and classes (Assault, Engineer, Medic, Demolitions) are built. Look at it in the squad screen (I) and tune `training` in `game.json`. Open: AI auto-spending, respec, charisma.
- [ ] 🟡 **Gold between runs.** Gold, perks and purchases reset every run (only the best kill count is saved). Option offered: keep some gold in localStorage and add a shop on the main menu for permanent upgrades.
- [ ] 🟢 **Crate contents in the squad screen:** today crates are opened only with E next to them (the old inventory window, crate mode). Decide whether nearby crates should also appear in the squad screen.

### 2b — 🟡 Mobile follow-ups (first version on `feat/mobile-view`, not seen on a real phone)

- Try it on a real phone (landscape) and tune sizes in `src/mobile.css` and `STICK_RADIUS` in `src/mobile.ts`.
- Done in the second pass: crate button, tap an icon to choose the leader, jump/crouch/sprint buttons, pinch zoom, full screen, vibration on damage, low graphics preset by default on phones.
- Not built yet: a RTS mode with tap-to-move; shrinking the ~16 MB first load for mobile data; PWA install.

### 2c — 🟡 Game modes, map list and map editor (planned, not built)

Full plan: [docs/PLAN-modes-and-map-editor.md](docs/PLAN-modes-and-map-editor.md). Start → Single Player (Story / Waves; today's arena is "Map 1"), a disabled Multiplayer button, or Editor (starts paused, Play button, right panel with Units / Assets / Terrain / Game logic / Players tabs). Several players own units and the AI is one of them; vehicles need a human operator to move (Men of War style).

- [ ] 🟡 Play-test of phase 1e: go down, wait for an ally with a medkit, bleed out, defibrillate (the crate odds and the shop prices of medkits and the defibrillator are guesses). Visual check of phase 1d: the equipment column and the 10-slot backpack in the squad screen unit window (layout, drag and drop between hands, vest and backpack). Also still unseen from phases 1 to 1c: the Meshy marine animations, the Infected marine tint, Map 1 looking as before, and the attributes and skills layout.
- [ ] 🟡 Ask the user before the visual part of equipment: how weapons show on the models (bones to attach to, where the meshes come from).
- [ ] 🟢 Follow-ups of 1d and 1e, not built: helmet slot, dual-wield firing, fists and melee combat, accessory fitting, ammo and reload, the vest and accessories, a manual revive key, crawl and bleeding visuals.
- [ ] 🟡 Look at grenades in the browser: **Q** in direct control, **G** in RTS (arc, blast zone, click to throw), the shop entry (30 gold) and crate drops; tune `grenades` in `game.json` and the grenade item in `data/items.json` ([worklog](docs/worklog/2026-10-19-grenades.md)). AI soldiers throw at groups of enemies since 2026-10-20 ([worklog](docs/worklog/2026-10-20-ai-grenades.md); knobs `grenades.ai*`).
- [ ] 🟡 Look at phases 2 and 3 in the browser: the menu flow (Start → mode → Single Player → Waves → Map 1), Esc going back, the editor layout (top bar, right panel, tabs, collapsible groups), Play / Stop and WASD panning while editing.
- [ ] 🟡 Look at phase 4 in the browser: New / Open / Save / Export / Import in the editor, saved maps in the Waves list, delete, and that picking a map swaps the arena. Phase 4 is built; here is what it covers: built-in maps in `data/maps/` plus the user's maps in localStorage, listed together.
- [ ] 🟡 Look at phase 5 in the browser: place / select / drag / rotate (R) / delete units and blocks, undo / redo, selection ring, Play spawning the placed squad and enemies (see [worklog](docs/worklog/2026-10-18-phase-5-place-units.md)).
- [ ] 🟡 Look at phase 6 in the browser: raise / lower / flatten / smooth, paint, roads, water level (units should not walk into water; bullets cross it), hills under units, Map 1 unchanged ([worklog](docs/worklog/2026-10-18-phase-6-terrain.md)).
- [ ] 🟡 Look at phase 7 in the browser: the Game logic tab (difficulty, waves, enemy mix, bosses, spawn points as red rings), Play using them ([worklog](docs/worklog/2026-10-18-phase-7-game-logic.md)). Spawn points ignore obstacles and water.
- [ ] 🟡 Look at phase 8 in the browser: place a Jeep in the editor (Units > Vehicles > Military > Land), Play, walk next to it, **V** to climb in, drive with WASD, passengers shooting, zombies biting the hull, **V** to get out ([worklog](docs/worklog/2026-10-18-phase-8-vehicles.md)).
- [ ] 🟡 Look at phase 10 in the browser: Start → Single Player → Story → Mission 1, the objective checklist, the green ring, MISSION COMPLETE; in the editor set Mode to Story and add objectives ([worklog](docs/worklog/2026-10-18-phase-10-story-mode.md)).
- [ ] ⚪ Phases 8b–9: (vehicles first version is built) air and sea vehicles, a real vehicle model, RTS enter orders, interaction mechanics (lift and throw objects by strength, climbing, drag or carry a body, fire hazards), animals.
- [ ] 🟡 Answer the open questions in section 8 of the plan (steering model, first vehicle, attribute names, weapon-class XP source, downed rules, defibrillator, equipment on the models).

### 2d — ⚪ Online multiplayer (planned 2026-10-19, nothing built)

Full plan: [docs/PLAN-multiplayer.md](docs/PLAN-multiplayer.md). Co-op for 2 to 4 players: a small WebSocket relay (the first backend of the project; the user agreed a backend is allowed for this) and a host browser that runs the sim. Phases 0 to 7 are in the plan. Decided: gold, XP and perks are per player, any player can pause and unpause, and menus do not freeze the run.

- [ ] ⚪ Choose where to host the relay (prices and limits not checked yet). The design questions of section 6 are decided.
- [ ] ⚪ Before any performance work (Wasm, a Web Worker, a flow field for pathfinding): profile in the browser first; the sim step is 2.7 ms with 1000 zombies, so the drawing is the likelier bottleneck (see section 8 of the plan).

### 2e — 🔴 Build mode (first version built on `feat/build-mode`, 2026-10-19)

Full plan: [docs/PLAN-build-mode.md](docs/PLAN-build-mode.md). Structures (watchtower, turret, wire fence, wooden barricade, solid wall, sandbags, doors) with upgrades; soldiers build from the RTS view (more soldiers, faster) and the player quick-builds sandbags and a turret in direct control; a manned machine-gun nest and an automatic "smart turret"; tested on a new Map 2, "Build mode test". Phase 0 is a flow-field pathfinding so zombies can reach and break structures.

- [x] Decisions taken (2026-10-19): the recommendations of section 13 of the plan were accepted.
- [x] Phase 0, the flow-field pathfinding, is built on `feat/flow-field` ([worklog](docs/worklog/2026-10-19-flow-field.md)); look at it in the browser (zombies go around long walls and into the squad's reach).
- [x] Structures, blueprints, builders, doors, turrets, upgrades, repair, the **N** menu, Map 2 ([worklog](docs/worklog/2026-10-19-build-mode.md)).
- [ ] 🔴 Look at it in the browser: open Map 2, press **N**, place a wall / door / turret, watch the soldiers build, open the door with **E**, let a wave hit the base. Tune `structures` in `game.json`.
- [x] Manned machine-gun nest, watchtower and ammo for turrets ([worklog](docs/worklog/2026-10-20-posts-and-turret-ammo.md)); soldier pathing around structures is on `feat/soldier-structure-pathing`.
- [ ] 🔴 Look at them in the browser: Map 2 has a nest and a tower; **E** / **V** to climb in, the mouse aims the nest, turrets run dry and **Resupply**. Tune `post` and `ammo` of the structure types.
- [x] Structures, objects and loose items in the map editor ([worklog](docs/worklog/2026-10-20-editor-structures.md)).
- [ ] 🔴 Try the editor: Assets tab > Structures / Objects / Loose items, place a door, lock it and set its link, Play.
- [ ] 🟡 Next: models and sounds for structures, the AI manning posts and feeding turrets.

### 2l — 🔴 Helicopter and Map 8 (built 2026-10-21, branch `feat/helicopter`)

Procedural helicopter (plus Huey, Chinook, V-22) with its own mechanics ([worklog](docs/worklog/2026-10-21-helicopter.md)); controls in [docs/CONTROLS.md](docs/CONTROLS.md).

- [ ] 🔴 Look at it in the browser: Start > Single Player > Waves > Map 8. Hold W 10 s in the helicopter, Space / C / Shift, V on the ground; in RTS order the second one around (Space, C, H). Tune `vehicles.helicopter.air` in `game.json` and the `HELI_*` look constants (the bank sign is a guess).
- [ ] 🟡 Models for vehicles, police, civilians and military units: ask before downloading (CC0 / CC-BY only; Kenney and Quaternius are the usual candidates, check each licence).
- [ ] 🟢 Next for aircraft: sound, crash damage, AI soldiers boarding by themselves, wreck, a second type (transport / gunship).

### 2m — 🔴 Map 9 "Sea test" (built 2026-10-21, branch `feat/helicopter`)

Carrier you can walk on, frigate, island with beach and houses, drivable speedboats ([worklog](docs/worklog/2026-10-21-map-9-sea.md)).

- [ ] 🔴 Look at it in the browser: Start > Single Player > Waves > Map 9. Walk the deck, take off from it, board a speedboat at the port rail (V), sail to the beach and step out, ram the frigate. Check the hull shape, deck markings, the tower, the parked fighters, the beach colours, FPS with F3 (256 x 256 terrain).
- [ ] 🟡 Next: drivable carrier / frigate, AI boarding boats, wake and swell, sinking, a deck height for aircraft in the sim, editor support for moving the carrier with its deck.

### 2n — 🔴 Swimming and Map 10 (built 2026-10-21, branch `feat/helicopter`)

- [ ] 🔴 Look at it in the browser: Start > Single Player > Waves > Map 10. Walk into the sea, **C** dives, **Space** surfaces, **Shift** swims fast, watch the OXYGEN bar and the drowning. Tune `swimming` in `game.json` and `SWIM_*` in `gameRenderer.ts` ([worklog](docs/worklog/2026-10-21-swimming-map-10.md)).
- [ ] 🟢 Next: swim animation, splash and bubbles, underwater tint, sound, AI that dives.

### 2f — ⚪ Weapons and combat (planned 2026-10-19, nothing built)

Full plan: [docs/PLAN-weapons-and-combat.md](docs/PLAN-weapons-and-combat.md). Semi-automatic pistol, magazines, ammo and reload times, per-weapon recoil in the JSON, accuracy from skill, movement and stance (weapons less precise than now), hold to aim, headshots, critical hits, melee (a key in direct control; the AI strikes enemies that get close and pushes them away), and a weapon workbench where accessories (scope, suppressor...) take slots of the weapon. W1 to W6 are built on `feat/weapon-instances` (worklogs 2026-10-19 `weapons-w1`, `w2`, `w3`, `w4`, `w5`, `w6`, `weapons-in-hand`).

- [x] Decisions taken (2026-10-19): the recommendations of section 14 of the plan were accepted; aim is hold-right-click in third / first person only.
- [ ] 🟡 Look at W1 and W2 in the browser: the pistol fires once per click, R reloads, the HUD shows rounds, AI soldiers reload, rifle and machine gun need ammo from the shop or crates (balance is a guess). W3 (accuracy, recoil, hold-to-aim, dynamic crosshair, new base spreads) is built too: check how aiming and recoil feel and whether the AI now misses too much. Also look at W5: **F** strikes, enemies are shoved and stagger, the AI hits close enemies. Also look at W4: aim at a head in third / first person (orange number, glow, ping), crits (yellow), the small head chance in top-down. Also look at W6: the **⚙** on a weapon in the squad screen opens the workbench (fit, swap and remove accessories, the Bare / Now / With table); accessories come from crates and the shop. Next: M0 of the marine plan.
- [ ] ⚪ Still open, and the only blocker: ask the user before the visual part of weapons (bones, where the meshes come from), as already agreed.

### 2g — ⚪ Marine zombie variants and dismemberment (planned 2026-10-19, nothing built)

Full plan: [docs/PLAN-marine-zombies-and-dismemberment.md](docs/PLAN-marine-zombies-and-dismemberment.md). Enemies become variants of the Meshy marine (brown, bloody, burgundy, bleeder, crawler, runner, wanderer), mini bosses too; heads and limbs come off, shot-off legs make a crawler, some zombies climb. **First measure**: the marine has 61k triangles, so a light copy comes before any replacement. Open questions are in section 11 of the plan.

- [ ] 🟡 Look at the first two steps, built early: the violet **acrobat marine** (runs, hops up and sideways, cartwheels) and the **marine brute** (bigger, burgundy) ([worklog](docs/worklog/2026-10-19-acrobat-and-marine-brute.md)), and the new **weapon poses** (two-handed aim in third person, the first-person gun with aim down the sights; [worklog](docs/worklog/2026-10-19-weapons-poses.md)). Tune `WEAPON_POSES`, `armPose.ts` and `viewModel.ts` constants.
- [x] Decisions of section 11 taken (2026-10-19, recommendations accepted; a head hit only does extra damage, and a killing head hit bursts or flies off by weapon strength).
- [x] Phase M0 built: the light marine (4,900 triangles, 1.8 MB) is used by the horde ([worklog](docs/worklog/2026-10-19-marine-m0.md)).
- [ ] 🟡 Measure with F3 and Chrome's profiler in a heavy wave and compare the light marine's look with a soldier.
- [x] M1 built (variants, procedural blood, bleeder) and M1b built (wanderers that sleep, sense, see and shout; climbers over boxes): [worklog](docs/worklog/2026-10-19-marine-m1b.md). Look at the pale **wanderer** and the orange **climber**.
- [x] M2 built: a killing head hit bursts or knocks off the head by weapon strength ([worklog](docs/worklog/2026-10-19-marine-m2.md)). Look at it in the browser (stump size, flying head, neck spray, `dismember.headBurstDamage`); - [x] M3 built: body zones, arms and legs come off, grenades tear limbs, legless enemies drag themselves ([worklog](docs/worklog/2026-10-19-marine-m3.md)). Look at it in the browser (stump sizes, throw, the pitched-forward crawl, `dismember.*` numbers); next is M4 (real crawl, `marine_crawler`).

### 2j — 🔴 Interaction lab (Map 5) and the rest of 8b

- [x] Lift and throw objects (**E**, click), carry a body (**E**), fire that spreads, explosive and fuel barrels, Map 5 ([worklog](docs/worklog/2026-10-19-interaction-and-training.md)).
- [x] Action key **E** (Half-Life style) and RTS hover labels (Pick / Drag / Open / Close / Enter), click or E sends the closest selected soldier; select-all moved to Ctrl+A. Monster corpses are not draggable yet (they vanish after dying); loose items on the ground do not exist yet (only crates).
- [ ] 🔴 Look at Map 5 in the browser: controls are in [docs/CONTROLS.md](docs/CONTROLS.md) (E lift / put down, click throw, shoot a barrel). Tune `objects` and `hazards.fire` in `game.json`.
- [x] Objects block movement ([worklog](docs/worklog/2026-10-20-objects-block-movement.md)).
- [x] Corpses you can drag, loose items on the ground (Drop / Take) and the AI that drags the wounded ([worklog](docs/worklog/2026-10-20-corpses-and-loose-items.md)). Look at them in the browser: corpse count and look, the Drop button, the AI pulling a downed ally.
- [ ] 🟡 Next: models and sounds, objects and loose items in the editor.

### 2k — 🔴 Celestial Event III (Map 6, demo for another game on this engine; scene built 2026-10-20, branch `feat/celestial-event-3`)

Full plan and story: [docs/PLAN-celestial-event-3.md](docs/PLAN-celestial-event-3.md). A cinematic intro seen through a UMBRA drone (blackout, light orbs, metal spheres that vaporise people, a mother sphere that abducts, greys with a paralysing staff), then hide and seek. Placeholders first (existing models, procedural orbs, box houses); Kenney City Kit and a grey alien only after the licence check.

- [ ] 🟡 Answer section 7 of the plan (who the player is after the intro, codename vs. level IV, civilians, UMBRA as a second threat, asset downloads).
- [x] E0 Map 6 shell, E1 civilians, E2 metal sphere built ([worklog](docs/worklog/2026-10-20-celestial-event-3-e0-e2.md)).
- [ ] 🔴 Look at Map 6 in the browser (Start > Single Player > Waves > Map 6): night light, civilians, the sphere, ray, flash and ash.
- [x] The whole scene is built as one timed script (stars, blue lights, blackout, scouts, abductions, parting ray, hunters, second ship, greys); see the worklog.
- [x] Scene reordered (fifth part of the worklog): calm crowd during the abductions, ring round the greys, panic and hunters only after the greys start killing.
- [ ] 🔴 The user looks at it in the browser and says what to tune: ring and greys, subtitles vs. events (1-3 s drift in the greys part), blackout, dim vs. blue light, parting ray, sphere look, FPS with F3 (116 people), walking backwards with the normal walk clip.
- [x] Plan extended with the Nodes lore and the cosmic horror layer (docs only).
- [ ] 🟡 Change the intro to the remote-projection script (no drone: it ends when a grey looks at the camera and the player wakes in bed at the real blackout) and design the first level inside the house (or close Map 6 first: open question for the user).
- [ ] 🟡 Cinematic camera and cold HUD (E4), the player as a target and hide and seek (E6, Node 10 powers need interiors E8).
- [ ] 🟡 Real models for greys and civilians (E7). Ask before downloading: Kenney City Kit Suburban (CC0), the low-poly alien from OpenGameArt (CC-BY 4.0), Quaternius Ultimate Modular (QAL v1.0: read the licence first).
- [ ] 🟡 PR of `feat/celestial-event-3` only when the user asks (everything is local; offer push and PR).
- [ ] 🟢 WebGPU B0 measurement: waiting for the user's answers (incremental or new repo; keep a WebGL fallback). Recommendation: incremental plus fallback.

### 2i — 🟡 Test maps, doors, interiors, urban maps, engine (planned 2026-10-19)

Plans: [PLAN-test-maps.md](docs/PLAN-test-maps.md) (weapons range, hide and seek, celestial event 4, human vs human with cover AI) and [PLAN-world-and-engine.md](docs/PLAN-world-and-engine.md) (door kinds incl. sci-fi and large gates, interiors, urban maps, the engine for several games).

- [x] Maps 2 to 4 built: Build mode test, Weapons range, Hide and seek (a giant Stalker that hunts by sight, loses track and searches; crouching hides you better).
- [ ] 🟡 Look at maps 3 and 4 in the browser (targets, the Stalker's size, how it searches, crouch stealth).
- [x] W0 soldier pathing built on `feat/soldier-structure-pathing` ([worklog](docs/worklog/2026-10-20-w0-soldier-pathing.md)); look at it in the browser (Map 2: build a wall, order a soldier across, add a door).
- [x] Door system v2 and large gates built ([worklog](docs/worklog/2026-10-20-doors-v2.md)), Map 7 "Door gallery".
- [ ] 🔴 Look at Map 7 in the browser: each door kind, the keycard, the switch and the blast door, the glass door's sight, auto doors with the squad. Tune `doorRules` in `game.json`.
- [ ] 🟡 Next: airlock pair (W3), then celestial event 4, the cover AI map and interiors.
- [ ] ⚪ Answer the questions of section 9 of PLAN-world-and-engine.md and the open questions of PLAN-test-maps.md section 3.

### 2h — ⚪ Phase B: WebGPU engine, VAT crowd, ragdoll pool, mocap (noted 2026-10-19, nothing decided or built)

Full note: [docs/PLAN-webgpu-engine.md](docs/PLAN-webgpu-engine.md). The user's brief for a 1,000+ unit engine (three.js `WebGPURenderer` + TSL, `SharedArrayBuffer`, Rapier worker, VAT animation, ragdoll ring pool, flow fields, Tauri + Steam, Blender asset pipeline). It conflicts with several decisions already taken (no new tests, CC0 / CC-BY assets only, no backend, Steam is outward-facing); section 5 of the note lists them.

- [ ] ⚪ Answer the four questions of section 6 of the note (rewrite or migrate, Steam yes / no, WebGL fallback, Meshy license for a paid release).
- [x] Audit of `src/` against the plan and the detailed plan B0 to B11 are written (sections 9 and 10 of the note, 2026-10-19).
- [ ] 🔴 B0: build the heavy scenario (300 / 600 / 1000 marines), profile it on the user's machine and a low-end laptop, and choose the order of B1 to B5 from the numbers. This also unblocks the performance item in 2d.
- [ ] 🟡 B1 render snapshot boundary, B2 WebGPU renderer swap, B3 tiered instanced VAT crowd (soldiers and dismembered units stay skinned).
- [ ] 🟢 B4 unit spatial hash and boids, B5 sim in a worker (transferable buffers by default; `SharedArrayBuffer` only where COOP/COEP exist), B6 Rapier props and vehicles, B7 ragdoll pool.
- [ ] ⚪ B8 GPU VFX and environment, B9 wave director, B10 asset pipeline and KTX2, B11 Tauri and Steam (ask the user before every outward-facing step).
- [ ] ⚪ Prototype `InstancedMesh` + VAT for one enemy type on a branch and compare with the pooled `SkinnedMesh` views.
- [ ] ⚪ Mocap experiment: a standalone page with MediaPipe + Kalidokit driving the marine, record and download a clip (section 7 of the note); check the marine's bone names first.

### 3 — 🟡 Going public (GitHub Pages is live)

- [ ] 🟡 **Analytics with GoatCounter** (free, no cookies, custom events for waves reached and game over). Needs the user's GoatCounter site name; the script goes in `index.html`.
- [ ] 🟡 **`og:image` for link previews** (WhatsApp, Discord): needs a 1200×630 screenshot from the user; add it to `public/` and the meta tags in `index.html`.
- [ ] 🟡 **Google Search Console:** verify the URL and request indexing (the user does it, 2 minutes).
- [ ] 🟢 If a custom domain is ever used: update `canonical`, `og:url`, `sitemap.xml`, `robots.txt` and the JSON-LD URL in `index.html`.
- [ ] 🟢 Vercel was considered and dropped for now (bandwidth cap on the free plan, no commercial use); Cloudflare Pages is the migration path if the traffic grows.

### 4 — 🟢 Performance and weight

- [ ] 🟢 **Models are ~15 MB** (about 1 MB per enemy); compress textures or use meshopt/Draco (needs decoders registered in `GltfAssetLoader`) to cut first-load time and bandwidth.
- [ ] 🟢 The `three` chunk is ~630 kB (limit raised to 800 in `vite.config.ts`); consider importing less of Three.
- [ ] 🟢 Antialiasing cannot change at runtime; if wanted, add it to the settings with a reload.
- [ ] 🟢 Four dynamic flashlights plus the muzzle flash light in dark mode: measure the cost; the zombie views are pooled, the lights are not.
- [ ] ⚪ Mobile / touch controls (the game needs keyboard and mouse; the menu says so).

### 4b — 🟡 Showcase polish for the Steam / ModDB / indie-site MVP (noted 2026-10-21)

Plan agreed with the user: a polished one-map, one-mission demo plus waves, promoted through the user's popular mod ([[project-launch-strategy]] in memory). Order: the user's visual review, first-person showcase (real weapon models, reload and recoil animations, FX and sound), a few vehicles for the trailer, model and texture compression, then textures, then gameplay polish and the public page. Ask before downloading any asset or opening any account.

- [x] POM test built: procedural brick, stone, plates and cobble, Map 11 "Texture lab", time of day with **,** and **.** ([worklog](docs/worklog/2026-10-21-texture-lab-map-11.md)). 🔴 Look at Map 11 in the browser, move the clock, check FPS with F3, and say if the depth and shadows read well.
- [ ] 🟡 Next for POM: a Low / Medium / High option in Settings (`setPomQuality`), POM on the ground, real CC0 texture sets (ask first).
- [ ] 🟡 **Ground and prop textures with depth.** Today the ground is flat vertex colours (no textures at all). Plan: CC0 PBR sets (albedo, normal, roughness, height) and normal maps first; **parallax occlusion mapping (POM)** as an optional shader on the ground and walls, because three.js 0.186 has no built-in POM (a custom `onBeforeCompile` patch or a TSL node). It costs fragment time, so it needs a quality setting and a distance fade; check FPS with F3.
- [ ] 🟡 Check the Meshy marine's licence for a paid release before aiming at Steam.
- [ ] ⚪ Idea: a mod of the marine for Men of War: Assault Squad 2 or Call to Arms. Pipeline unverified (older sources mention 3ds Max and the GEM 2 human-model export); ask the user which engine their earlier mod used.

### 5 — 🟢 Code health

- [ ] 🟢 `InventoryUi.openInventory` (the old single-unit window) is unused since `I` opens the squad screen; remove it or keep it for crates only.
- [ ] 🟢 The radar ignores obstacles and the squad screen does not refresh while the game runs (it only opens while paused); fine today, revisit if either changes.
- [ ] 🟢 Old merged branches (about 30) remain on the remote and locally; delete them once the user agrees.
- [ ] 🟢 Docs: the README is the player reference; docs/CONTROLS.md lists every key, so update it whenever a key changes.
- [ ] ⚪ Tests: the user dropped new tests for the prototype; the 48 sim tests stay green. If the project grows beyond a prototype, revisit (settings load/save, `moveItem`, boss stats are the least covered).

### 6 — ⚪ Content ideas (not requested yet)

- [ ] ⚪ **Custom models from the user's AI generator:** the spec was given (GLB, +Z, feet origin, clips idle/run/death for soldiers and walk/attack/death for enemies, no Draco). Waiting for a sample file; the license of its output must be confirmed before it goes into `assets.toml`.
- [ ] ⚪ Real sound assets instead of procedural SFX; music.
- [ ] ⚪ More enemy types and boss attacks (today a boss is a scaled, darker copy with the same behavior).
- [ ] ⚪ Difficulty modes, a leaderboard, gamepad support, a tutorial.
