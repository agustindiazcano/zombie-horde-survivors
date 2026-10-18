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

- [ ] 🟡 **Main-menu "carousel":** the request was cut off mid-sentence ("un carousel d..."). Options offered: enemies, soldiers and drone, or how-to-play slides. Ask again.
- [ ] 🟡 **What a soldier's own level does.** Per-soldier XP, level and kills are tracked and shown, but give nothing. Idea: a small damage or health bonus per level, or unlocks.
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
- [ ] 🟢 Follow-ups of 1d and 1e, not built: helmet slot, dual-wield firing, fists and melee combat, grenade throwing, accessory fitting, ammo and reload, a way to obtain grenades, the vest and accessories, a manual revive key, crawl and bleeding visuals.
- [ ] 🟡 Look at phases 2 and 3 in the browser: the menu flow (Start → mode → Single Player → Waves → Map 1), Esc going back, the editor layout (top bar, right panel, tabs, collapsible groups), Play / Stop and WASD panning while editing.
- [ ] 🟡 Look at phase 4 in the browser: New / Open / Save / Export / Import in the editor, saved maps in the Waves list, delete, and that picking a map swaps the arena. Phase 4 is built; here is what it covers: built-in maps in `data/maps/` plus the user's maps in localStorage, listed together.
- [ ] 🟡 Look at phase 5 in the browser: place / select / drag / rotate (R) / delete units and blocks, undo / redo, selection ring, Play spawning the placed squad and enemies (see [worklog](docs/worklog/2026-10-18-phase-5-place-units.md)).
- [ ] 🟡 Look at phase 6 in the browser: raise / lower / flatten / smooth, paint, roads, water level (units should not walk into water; bullets cross it), hills under units, Map 1 unchanged ([worklog](docs/worklog/2026-10-18-phase-6-terrain.md)).
- [ ] 🟡 Look at phase 7 in the browser: the Game logic tab (difficulty, waves, enemy mix, bosses, spawn points as red rings), Play using them ([worklog](docs/worklog/2026-10-18-phase-7-game-logic.md)). Spawn points ignore obstacles and water.
- [ ] 🟡 Look at phase 8 in the browser: place a Jeep in the editor (Units > Vehicles > Military > Land), Play, walk next to it, **V** to climb in, drive with WASD, passengers shooting, zombies biting the hull, **V** to get out ([worklog](docs/worklog/2026-10-18-phase-8-vehicles.md)).
- [ ] 🟡 Look at phase 10 in the browser: Start → Single Player → Story → Mission 1, the objective checklist, the green ring, MISSION COMPLETE; in the editor set Mode to Story and add objectives ([worklog](docs/worklog/2026-10-18-phase-10-story-mode.md)).
- [ ] ⚪ Phases 8b–9: (vehicles first version is built) air and sea vehicles, a real vehicle model, RTS enter orders, interaction mechanics (lift and throw objects by strength, climbing, drag or carry a body, fire hazards), animals.
- [ ] 🟡 Answer the open questions in section 8 of the plan (steering model, first vehicle, attribute names, weapon-class XP source, downed rules, defibrillator, equipment on the models).

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

### 5 — 🟢 Code health

- [ ] 🟢 `InventoryUi.openInventory` (the old single-unit window) is unused since `I` opens the squad screen; remove it or keep it for crates only.
- [ ] 🟢 Zombie steering is a corner heuristic: it fixed a stuck case on long obstacles (corner re-selection) but other layouts may still trap enemies; consider a stuck detector or a simple navmesh.
- [ ] 🟢 The radar ignores obstacles and the squad screen does not refresh while the game runs (it only opens while paused); fine today, revisit if either changes.
- [ ] 🟢 Old merged branches (about 30) remain on the remote and locally; delete them once the user agrees.
- [ ] 🟢 Docs: the README is the player reference; keep the Controls tables in sync whenever a key changes.
- [ ] ⚪ Tests: the user dropped new tests for the prototype; the 48 sim tests stay green. If the project grows beyond a prototype, revisit (settings load/save, `moveItem`, boss stats are the least covered).

### 6 — ⚪ Content ideas (not requested yet)

- [ ] ⚪ **Custom models from the user's AI generator:** the spec was given (GLB, +Z, feet origin, clips idle/run/death for soldiers and walk/attack/death for enemies, no Draco). Waiting for a sample file; the license of its output must be confirmed before it goes into `assets.toml`.
- [ ] ⚪ Real sound assets instead of procedural SFX; music.
- [ ] ⚪ More enemy types and boss attacks (today a boss is a scaled, darker copy with the same behavior).
- [ ] ⚪ Difficulty modes, a leaderboard, gamepad support, a tutorial.
