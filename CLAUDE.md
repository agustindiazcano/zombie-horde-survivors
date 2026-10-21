# CLAUDE.md — Zombie Horde Survivors

Working rules and project reference for any Claude session in this repo. Read this, then [LASTCONTEXT.md](LASTCONTEXT.md) (where things stand and what the user decided) and [PENDING.md](PENDING.md) (what is still open). README.md is the player-facing reference (controls, rules, credits).

## 1. What this is

A browser-based 3D squad shooter prototype: four soldiers and a drone against endless waves of zombies, skeletons, aliens, hounds, brutes and giant worms. Played hands-on (one soldier in top-down, third or first person view, the rest of the squad following and shooting on their own) or from above in RTS mode (select units, send them anywhere). Three.js + Vite + TypeScript, no backend, no accounts: everything runs in the browser and saves only the best score and the settings in localStorage.

- Repo: `agustindiazcano/zombie-horde-survivors` (public). Live: https://agustindiazcano.github.io/zombie-horde-survivors/ (GitHub Pages, redeployed on every push to `main`).
- Stage: a prototype the user plays and tunes. It started as a task-by-task brief (simulation, renderer, input, asset pipeline, HUD) and grew through the user's requests.
- Name: **Zombie Horde Survivors**. It must keep the word "zombie" (the user's call: zombie themes sell better than a purely human one).

## 2. Market and positioning

The user raised the market as a reason for decisions (the name, going public); no market research has been done and no figures are known. What is established:

- **Audience:** casual-to-core PC players who like short action runs ("survivors-like" waves with perks) and a little tactics. It needs a desktop browser with keyboard and mouse; mobile is not supported.
- **Channel and cost:** free to play in the browser, no ads or payments. Shared by link with friends first (the user's stated goal: let acquaintances try it). The longer plan is to ship on **Steam** (the user's call): a desktop wrapper (Electron or Tauri) is not built or decided yet.
- **Genre references (inspiration, not copies):** wave survival with level-up perks and a pause panel in the style of Vampire Survivors; the motion-tracker radar of the film Aliens; RTS-action hybrids (command a squad, or take control of one unit).
- **What makes it different:** the same game plays as a third/first-person shooter _and_ as an RTS; a squad with individual inventories, XP and kill counts; mini bosses that grow each time.
- **Constraints that shape the product:** only CC0 / CC-BY assets (no budget for art), no backend yet (a small relay server is planned for online multiplayer: see [docs/PLAN-multiplayer.md](docs/PLAN-multiplayer.md)), desktop only. **Download size is not a constraint** (the user's decision, because of Steam): do not shrink assets to save weight, and keep the heavy optional ones (ultra textures) loaded only when the player picks that quality. The browser first load is about 16 MB.
- **Open market questions** (not researched): competitors in browser zombie shooters, discoverability, whether to monetize. Do not invent numbers about any of them.

## 3. Gameplay

**Loop:** you start in direct control of soldier 1 with three followers and a drone. Waves of enemies spawn at the arena edge and chase the squad. Between waves an 8 s calm lets you shop. The run ends when every soldier is dead (the drone does not count). The best kill count is saved.

| System                    | How it works                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Squad**                 | 4 soldiers (all use the marine model, start with a pistol) and a drone (unit 5, starts unarmed, needs a Drone gun; flies, ignores cover, cannot be hurt). Uncontrolled units follow the leader, hold, or walk to an order, and shoot the nearest visible enemy                                                                                                                                                                                       |
| **Control modes**         | Direct control of one unit, or RTS (select, box select, orders). `Y` switches; only units selected before taking control follow it                                                                                                                                                                                                                                                                                                                   |
| **Stances**               | The controlled player's keys set the squad's stance: crouch (tighter spread, +10% damage, half speed), sprint (1.6x speed); only the controlled unit jumps                                                                                                                                                                                                                                                                                           |
| **Downed state**          | At zero health a soldier goes down instead of dying: crawls, shoots a one-handed gun badly, bleeds out in 30 s. A standing ally with a medkit revives it automatically (3 s); a defibrillator revives a soldier dead less than 30 s. Enemies prefer standing soldiers. Game over when nobody is on their feet                                                                                                                                        |
| **Enemies**               | Zombie, skeleton (wave 1), alien, hound (wave 2), brute (wave 3), worm (wave 4): multipliers on the base zombie, unlocked by wave. Speed and health also grow every wave. About half burst into blood and gibs when killed                                                                                                                                                                                                                           |
| **Mini boss**             | Every 3rd wave one enemy is a darker copy with glowing red eyes, slower, with health x50 / x70 / x100 / x200 / x500 (then x1.6 each), damage x2 to x8 and a size of 2x up to 5x that grows with its health; much better loot                                                                                                                                                                                                                         |
| **Loot and XP**           | Dead enemies drop gold and blue XP orbs (collected by any unit walking over them) and sometimes a weapon crate. Global XP levels the squad up; each unit also earns its own XP and a kill counter when it lands the killing shot (display only for now)                                                                                                                                                                                              |
| **Perks**                 | Each level-up pauses and offers 3 random squad-wide perks (damage, fire rate, speed, max health, regeneration, loot radius), up to a stack limit                                                                                                                                                                                                                                                                                                     |
| **Shop**                  | `B` between waves: field kit (heal), reinforcement (revive), weapons, drone gun, permanent upgrades; prices grow per purchase. Gold resets every run                                                                                                                                                                                                                                                                                                 |
| **Weapons and inventory** | Each unit has two hands, a vest slot and a 10-slot backpack of stacks. Items are in `data/items.json` (pistol, rifle, heavy machine gun, drone gun, medkits and defibrillator are playable; the grenade, vest and accessories are mocked and not obtainable yet). Weapons come from crates (open with `E`) or the shop and move between units by drag and drop on the squad screen; a held weapon can be unequipped (an unarmed unit does not shoot) |
| **Radar**                 | A round light-blue motion tracker bottom-right: a pulse ring spreads from the squad and enemies appear as blips only when it crosses them; 30 m range                                                                                                                                                                                                                                                                                                |
| **Graphics**              | Presets Toaster, Low, Medium, High and Ultra (Ultra is for a machine with a real GPU: 4K shadows, 1.5x render scale, finest parallax, 1K textures) plus the individual options: shadows, shadow size, resolution (25% to 200%), surface depth (parallax 0 to 3), textures (0 melted, 1 low, 2 normal, 3 ultra) and gore. The user's own PC has no GPU, so FPS on it is not a target; the presets are for others                                      |
| **Lighting**              | Normal by default; a dark mode with a flashlight per soldier on `L`                                                                                                                                                                                                                                                                                                                                                                                  |

## 4. Controls

All controls live in [docs/CONTROLS.md](docs/CONTROLS.md): direct control, views, RTS mode, anywhere, menus, the map editor and mobile. It is the only place that lists them; change it in the same commit whenever a key or mouse action changes.

## 5. Commands

| Command                                                       | What it does                                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run dev -- --host 127.0.0.1 --port 5173`                 | Dev server, http://127.0.0.1:5173/ (usually already running in the background; do not start a second one) |
| `npm run lint` · `npm run format:check` · `npm run typecheck` | The static checks CI runs                                                                                 |
| `npm test`                                                    | The 48 existing sim tests (Vitest)                                                                        |
| `npm run bench:sim`                                           | Stress benchmark of the sim step with 100 to 1000 zombies (ms per step); not a test, prints numbers       |
| `npm run build`                                               | `tsc --noEmit` + Vite build into `dist/`                                                                  |
| `npm run check:assets`                                        | Fails if an asset in `assets.toml` has a license other than CC0-1.0, CC-BY-3.0 or CC-BY-4.0               |
| `npm run credits`                                             | Regenerates the README credits block from `assets.toml`                                                   |

Before every commit run lint, format check, typecheck, tests, build and check:assets, and **read the test result** (a chained command that ends in `grep` once hid failing tests).

## 6. Architecture rules

- **`src/sim`** is the pure simulation: no Three.js, no DOM. ESLint (`no-restricted-imports`) and a test enforce it. Fixed 60 Hz step (`FIXED_DT`); the render interpolates with `prev` fields and `alpha`.
- **`src/render`** is Three.js only (arena, characters, effects, cameras, lighting). Game code talks to characters through the `CharacterView` interface.
- **`src/*.ts`** are input, HUD, audio and the DOM screens (main menu, pause panel, squad screen, shop and perk picker, settings, radar). `src/main.ts` wires everything and owns the pause and modal logic.
- **Data-driven:** every gameplay number lives in `data/game.json`, validated by a strict zod schema in `src/sim/config.ts` (a typo fails loudly). Models and animation clips are mapped in `data/characters.json` (`src/render/characterConfig.ts`).
- Adding a perk, shop item, weapon, enemy or boss rule means editing the JSON (and the schema if a field is new), not the code. The shared test config in `tests/sim/helpers.ts` builds a config by hand: add any new required section there too.
- Player options (graphics, lighting, FPS counter, volume) live in `src/settings.ts` and localStorage; they are not part of the sim.
- Animation: a state machine per character; sim states map to clip names (soldiers `idle` / `run` / `death`, enemies `walk` / `attack` / `death`). Crouch, sprint and jump are procedural (scale and lean), not clips.

## 7. Folder tree

```
test-game/
├── CLAUDE.md                  project rules and reference (this file)
├── LASTCONTEXT.md             current state and the user's decisions: read first
├── PENDING.md                 open work by priority
├── README.md                  player-facing reference and credits
├── docs/CONTROLS.md           every key and mouse action (the only list of controls)
├── assets.toml                every third-party asset: author, source, license, path
├── index.html                 page shell, SEO meta tags, structured data
├── package.json / package-lock.json
├── vite.config.ts             base './' (works on the Pages subpath), Three.js chunk
├── tsconfig.json · eslint.config.js · .prettierrc.json · .prettierignore · .gitignore
├── .github/workflows/
│   ├── ci.yml                 lint, format, typecheck, tests, build, asset check (on PRs)
│   └── pages.yml              build and deploy to GitHub Pages (on push to main)
├── data/
│   ├── game.json              all gameplay numbers (squad, waves, perks, shop, boss...)
│   ├── items.json             item catalog: weapon sheets, armor, medkits, grenades, accessories
│   ├── catalog.json           the editor panel's unit and asset groups (names only for now)
│   └── characters.json        model path, scale, clips and procedural motion per character
├── docs/worklog/              snapshots of what was done (moved out of LASTCONTEXT / PENDING)
├── public/
│   ├── textures/real/         14 ambientCG sets at 512 px (normal textures); real1k/ the same at 1K (ultra)
│   ├── models/                the GLB models (soldiers, enemies, drone) and their license texts
│   ├── robots.txt · sitemap.xml
├── scripts/                   assets.mjs, check-assets.mjs, generate-credits.mjs
├── src/
│   ├── main.ts                entry point: wires loop, input, screens, pause and modals
│   ├── loop.ts                fixed-timestep loop with interpolation
│   ├── sim/                   pure simulation (no Three.js)
│   │   ├── config.ts          zod schema for game.json
│   │   ├── types.ts · index.ts · constants.ts · vec.ts · rng.ts · collision.ts
│   │   ├── game.ts            createGame / step
│   │   ├── soldiers.ts        squad, orders, AI, jump
│   │   ├── zombies.ts         spawn, chase, damage, bosses
│   │   ├── flowfield.ts       pathfinding: blocked grid and a shared flow field the horde follows
│   │   ├── waves.ts           spawner, enemy mix, boss waves
│   │   ├── weapon.ts · stats.ts   shooting, weapon and speed stats
│   │   ├── revive.ts          downed soldiers: medkit and defibrillator revives, rescue walking
│   ├── inventory.ts       crates, typed slots (hands, chest, backpack stacks), moving items
│   │   ├── loot.ts            gold and XP, levels
│   │   └── upgrades.ts        perks, shop, multipliers
│   ├── render/                Three.js rendering
│   │   ├── gameRenderer.ts    scene, cameras, lighting, reflection map, unit sync, bosses, graphics options
│   │   ├── pom.ts · pomPatterns.ts · realSurfaces.ts · glass.ts · sirens.ts   texture lab: parallax occlusion material with silhouette clipping, procedural surfaces, ambientCG sets, glass, police lights
│   │   ├── assetLoader.ts · characterConfig.ts · characters.ts · animationController.ts
│   │   └── arena.ts · effects.ts · gore.ts · healthBars.ts · markers.ts · pickups.ts
│   ├── input.ts · cameraControls.ts · rts.ts      keyboard, mouse, RTS selection and orders
│   ├── audio.ts · fps.ts · settings.ts            procedural SFX, FPS counter, saved options
│   ├── hud.ts/.css · squadPanel.ts                health, wave, kills, XP, game over; bottom squad bar
│   ├── mainMenu.ts/.css · menuModel.ts            title screen, mode / Single Player / map-list menus, 3D soldier viewer
│   ├── maps.ts                                    map store: built-in + localStorage maps, export / import
│   ├── editor.ts/.css                             map editor shell: paused, Play / Stop, five tabs (placeholders; New / Open / Save / Export / Import work)
│   ├── pausePanel.ts/.css · unitsScreen.ts/.css   pause screen: bonuses, stats, squad windows
│   ├── upgradesUi.ts · upgrades.css               level-up perk picker and the shop
│   ├── inventoryUi.ts · inventory.css             crate window (E)
│   ├── itemInfo.ts                                item names, stats and tooltips for the UI
│   ├── settingsPanel.ts/.css                      settings window
│   └── radar.ts                                   motion-tracker minimap
└── tests/
    ├── scaffold.test.ts
    └── sim/                   the 48 sim tests and their shared helpers.ts
```

Not in git: `node_modules/`, `dist/`.

## 8. Workflow rules

- A branch per task, small English conventional commits ending with the `Co-Authored-By` line from the session reminder.
- **Never push to `main`.** Open a PR only when the user asks ("hace pr"). The user merges it, then says "anda a main y pull": check out `main`, pull, and report what is merged and what is next.
- Do not branch a new feature from `main` while an earlier PR is unmerged without checking what `main` is missing.
- **No new tests, no TDD** (the user's decision). Keep the 48 existing tests passing; do not delete them.
- Keep working without stopping for approval between tasks; ask only when a decision is really the user's.
- Reply in Spanish, with tables for options and status; numbered priorities with traffic lights 🔴 🟡 🟢 ⚪ (the user's global CLAUDE.md).
- Keep docs/CONTROLS.md (every key and mouse action), README, LASTCONTEXT.md and PENDING.md up to date: when an item is done, move it to `docs/worklog/` and take it out.

## 9. Assets and licenses

- Only CC0 or CC-BY (3.0 / 4.0) assets, each listed in `assets.toml` (name, author, source, license, path). CI fails otherwise. Currently 31 assets: Quaternius and KayKit models (CC0), the Meshy marine (CC-BY-4.0) and 14 ambientCG surface sets (CC0; 512 px in `public/textures/real/` for normal quality, 1K in `public/textures/real1k/` for ultra, same licences).
- Models are GLB (glTF binary): +Y up, facing +Z, origin at the feet, about 1.7–2 units tall per `scale`, one skeleton, animations inside the file and in place; no Draco/meshopt compression (the loader has no decoders). Clip names are mapped state → name in `data/characters.json` and must match exactly (e.g. `CharacterArmature|Walk`). Soldiers need idle, run, death; enemies walk, attack, death (death plays once). A model without clips can use `procedural: 'wiggle' | 'hover'`.
- After adding a model: copy it to `public/models/`, add it to `assets.toml`, map it in `characters.json`, run `npm run credits`, and check the clip names against the file.

## 10. Working environment gotchas

- There is **no browser tool**: visual work (lighting, models, UI layout, drag and drop) cannot be seen by Claude. Say so in the PR and ask the user to look; tune with the constants named in the code.
- Windows with Git Bash: large heredocs and quote-heavy commands fail with "unexpected EOF". Write scripts with the Write tool into the scratchpad and run them with `python`. Git Bash also mangles `branch:path` arguments.
- Prettier realigns tables and multi-line objects, which breaks anchor-based edit scripts: re-read the file after `prettier --write` before the next edit.
- A script that rewrites a file can leave Vite's dev cache holding an empty module ("does not provide an export named ..."): `touch` the file or restart the dev server.
- Git prints "LF will be replaced by CRLF" warnings on `git add`: harmless.
- CI warns that the `ubuntu-latest` runner label migrates to Ubuntu 26 on 2026-10-19.

## 11. Ask the user first

- Anything outward-facing: pushing, opening or closing PRs beyond what they asked, deleting branches, creating accounts or API keys (analytics), changing the repo's Pages or visibility settings.
- Changing a rule the user already decided (the decisions list in LASTCONTEXT.md).
- Adding third-party assets whose license is unclear, or output of an AI model generator (confirm its terms first).

## 12. Balance knobs (all in `data/game.json`)

`waves` (count, health and speed growth, intermission 8 s), `squad.startWeapon` (pistol), `weapons`, `drops`, `perks`, `shop`, `progress.xpPerLevel` (200) and `growth`, `downed` (bleed-out, revive time and range, enemy preference), `boss` (every 3 waves; health, damage and growth lists; speed; size), `enemies` (per-type multipliers), `arena` (80×80 with obstacles). The numbers come from headless simulations of a passive squad, not from play: expect to retune them after the user plays.
