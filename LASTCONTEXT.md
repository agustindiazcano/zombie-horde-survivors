# Last Context — Current State (2026-10-14)

Only what is still open: read this first in every session. When an item here is done, move it to `docs/worklog/` and take it out of this file. What was done up to today: [docs/worklog/2026-10-14-snapshot.md](docs/worklog/2026-10-14-snapshot.md). The full list of open work, by priority: [PENDING.md](PENDING.md). Working rules: [CLAUDE.md](CLAUDE.md).

## Where things stand

- **`main`** is at the merge of PR #31 (`f5104a9`) and has everything built so far, including `CLAUDE.md`, `PENDING.md`, `LASTCONTEXT.md` and `docs/worklog/`. The only open work is the docs update that refreshed these two files (branch `docs/update-context`); no other PR or feature branch is open.
- **The game is live** at https://agustindiazcano.github.io/zombie-horde-survivors/ (GitHub Pages, redeployed by `.github/workflows/pages.yml` on every push to `main`; the last deploy succeeded). The user tests locally at http://127.0.0.1:5173/ with the dev server, which serves whatever branch is checked out.
- **Nothing has been seen in a browser by Claude.** Lighting, boss eyes, radar, menus, the squad screen, drag and drop and the settings presets are all untested visually, and the balance comes from headless simulations of a passive squad. Expect the user to report visual and feel problems; tune with the constants named in the code (see PENDING §0–1).
- Last verified on `main`: lint, format check, typecheck, the 48 tests, build and the asset check all pass.

## Decisions the user has made (do not re-litigate)

- **No new tests / no TDD** for the prototype; keep the 48 sim tests passing.
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

## Open items (details in PENDING.md)

- 🔴 The user has to look at the live game and report what looks or feels wrong (PENDING §0).
- 🟡 Balance retune after real play: pistol start vs. the first boss (a passive squad dies at wave 3), boss damage and the huge boss health (PENDING §1).
- 🟡 Waiting on the user: the main-menu **carousel** (the request was cut off), what a **soldier's own level** should do, whether **gold persists between runs** (PENDING §2).
- 🟡 Going public: GoatCounter needs a site name; an Open Graph image needs a 1200×630 screenshot; Search Console is the user's (PENDING §3).
- 🟢 Models are ~15 MB: compression is the next performance win (PENDING §4).
- 🟡 Modes, map editor, players, stats and equipment: phases 1 to 3 are built; 4 (save / load maps) is next (PENDING §2c, section below).

## Next big work: modes, map editor, players, stats (planned 2026-10-18, no code yet)

Full plan and decisions: [docs/PLAN-modes-and-map-editor.md](docs/PLAN-modes-and-map-editor.md) (section 8 lists what the user decided; PENDING §2c lists the phases). The mobile version is merged (PR #33). The plan, the PENDING entry and the Meshy AI marine model (CC-BY-4.0, credited in `assets.toml` and the README; it replaces the toon soldier in slot 4 of `data/characters.json` and adds the "Infected marine" enemy with a green `tint`) travel together in the PR from branch `feat/marine-model-and-plan`. Check that this PR is merged and pull `main` before branching.

**Phases 1, 1b, 1c, 1d and 1e are done** (four stacked branches, no PR yet, `main` still at `6c7429f`; the PRs must go in order): `feat/map-format` (1 and 1b), `feat/unit-stats` (1c, cut from it), `feat/items-equipment` (1d, cut from `feat/unit-stats`) and `feat/downed-state` (1e, cut from `feat/items-equipment`). Details: [phase 1](docs/worklog/2026-10-18-phase-1-map-format.md), [1b](docs/worklog/2026-10-18-phase-1b-players.md), [1c](docs/worklog/2026-10-18-phase-1c-unit-stats.md), [1d](docs/worklog/2026-10-18-phase-1d-items-equipment.md), [1e](docs/worklog/2026-10-18-phase-1e-downed-state.md). In short: `MapSchema` and `data/maps/map-1.json`; players and unit ownership; `data/units.json` stat sheets; `data/items.json` (weapon sheets, armor, medkits, grenade, defibrillator, accessories; weapons live only there), `Soldier.equipment` (right hand, left hand, chest) and a 10-slot backpack of stacks; the downed state (bleed-out 30 s, automatic medkit revive, defibrillator, `src/sim/revive.ts`). `parseConfig(raw, map, units, items)`. Anything without a rule is mocked and marked "not active yet". **Phases 2 and 3 are done too**, on `feat/menu-flow` (cut from `feat/downed-state`, the fifth stacked branch): [phase 2](docs/worklog/2026-10-18-phase-2-menu-flow.md) (Start → mode → Single Player → Story / Waves map list, disabled Multiplayer) and [phase 3](docs/worklog/2026-10-18-phase-3-editor-skeleton.md) (paused editor, Play / Stop, five placeholder tabs, `data/catalog.json`). **Phase 4 is done** on `feat/save-maps` (cut from `feat/menu-flow`, sixth stacked branch): [phase 4](docs/worklog/2026-10-18-phase-4-save-maps.md) (map store in localStorage, export / import, picking a map swaps the arena). **Phase 5 is done** on `feat/place-units` (cut from `feat/save-maps`, seventh stacked branch): [phase 5](docs/worklog/2026-10-18-phase-5-place-units.md) (place, select, move, rotate, delete, undo / redo; Play spawns the placed units). **Phase 6 is done** on `feat/terrain` (cut from `feat/place-units`, eighth stacked branch): [phase 6](docs/worklog/2026-10-18-phase-6-terrain.md) (heights, paint, roads, water). **Phase 7 is done** on `feat/game-logic` (cut from `feat/terrain`, ninth stacked branch): [phase 7](docs/worklog/2026-10-18-phase-7-game-logic.md) (per-map difficulty, waves, enemy mix, bosses, spawn points). **Phase 8 is done** on `feat/vehicles` (cut from `feat/game-logic`, tenth stacked branch): [phase 8](docs/worklog/2026-10-18-phase-8-vehicles.md) (a drivable jeep). **Phase 10 (first version) and the editor work after it are done** (editor fixes, multi-select, marines, unit inventory / stats, enemy spawners, preview mode, environment: see the worklogs of 2026-10-18) on `feat/story-mode` (cut from `feat/vehicles`, eleventh stacked branch): [phase 10](docs/worklog/2026-10-18-phase-10-story-mode.md) (objectives, victory, mission list). **Next: 8b** (interaction mechanics) or 9, once the user has seen 7, 8 and 10. No new tests; the 48 must stay green. A duplicate `Meshy_AI_Digital_Camo_Soldier_All_Animations.glb` sits uncommitted in the repo root: ignore it, do not commit it.

**Prompt to paste at the start of the next session:**

```text
Leé CLAUDE.md, LASTCONTEXT.md, PENDING.md y docs/PLAN-modes-and-map-editor.md, y los worklogs de docs/worklog/ del 2026-10-18 (fases 7, 8, 10, editor-fixes-and-free-camera, editor-units-and-loadouts, environment). Respondeme en español, con tablas y prioridades con semáforo.

Estado: hechas las fases 1 a 8 y 10, más trabajo extra del editor, en trece ramas apiladas sin PR: feat/map-format (1 y 1b), feat/unit-stats (1c), feat/items-equipment (1d), feat/downed-state (1e), feat/menu-flow (2 y 3), feat/save-maps (4), feat/place-units (5), feat/terrain (6), feat/game-logic (7), feat/vehicles (8) y feat/editor-polish (pulido: pickups en colinas, clic del editor en colinas, spawns fuera de obstáculos, números de objetivos; es la última) sobre feat/story-mode (10 + arreglos del editor, multi-selección, marines, inventario y stats por unidad, spawners de enemigos, modo vista previa, ambiente; es la última, cada una sale de la anterior). main sigue en 6c7429f. En la raíz hay un GLB duplicado sin commitear (Meshy_AI_Digital_Camo_Soldier_All_Animations.glb): ignoralo, no lo commitees.

Antes de empezar: git status y ramas. Si ya mergeé algo, decime qué falta en main antes de ramificar. Si no, seguí desde feat/story-mode con una rama nueva y avisame que los PRs deben ir en orden.

Las decisiones están en la sección 8 del plan y en LASTCONTEXT (no las reabras). Sin tests nuevos, los 48 siguen verdes, nunca pushear a main, PR solo si lo pido.

Si te cuento que algo se ve o se siente mal, arreglalo primero y avisame; el dev server ya corre en http://127.0.0.1:5173/ (no abras otro).

Si no, proponeme el siguiente paso entre: 8b (mecánicas de interacción: levantar y tirar objetos, trepar, arrastrar cuerpos, fuego), 9 (animales) o pulir lo hecho (ver abajo), con tu recomendación, y esperá mi elección. Antes de cada commit: lint, format:check, typecheck, tests (leé el resultado), build y check:assets; commits chicos en inglés con Co-Authored-By. Al terminar actualizá PENDING/LASTCONTEXT (lo hecho a docs/worklog/) y esperá mi visto bueno antes de seguir.

Pendiente de verificar visualmente (yo lo miro): menú y editor (fases 2 a 6); pestaña Game logic; modo Story (Mission 1, objetivos, anillo verde, MISSION COMPLETE, objetivos en el editor); el jeep (V para subir/bajar, pasajeros, zombies al casco); el editor: barra de Stop oculta al editar, WASD, Y para manejar una unidad en la vista previa, caja de selección, mover con botón derecho, R + botón derecho para orientar, Ctrl+C/V, Supr, diálogo de mapa nuevo (tamaño y textura), I (inventario) y O (stats) por unidad, spawners de enemigos; marines 1 a 4; pestaña Environment (hora, color de luz, nubes, lluvia, nieve, tormenta de arena, niebla; rendimiento de partículas); cámara libre (mirar al cielo, más zoom).

Limitaciones conocidas: el jeep es de cajas (sin modelo real); un spawner con vida editada no escala con la oleada; los atributos no los lee ninguna regla; faltan rayos, sonido de clima y estrellas; las constantes de partículas y colores del clima son estimaciones.

Preguntas abiertas que no bloquean: cómo se ven las armas en los modelos (huesos y de dónde salen las mallas: preguntámelo antes de la parte visual), modelo real de vehículo, y si renombro los atributos (strength, dexterity, constitution, perception, intelligence, charisma).
```

## Gotchas (they bit before)

- A new feature branch cut from `main` while an earlier PR was unmerged lost that PR's code (the main menu "disappeared" locally). Check what `main` has first.
- Python edit scripts that rewrite a file can leave Vite's dev cache with an empty module; `touch` the file. Prettier realigns tables and breaks anchor-based edits.
- Long shell chains that end in `grep` hide failing tests; read the test summary before committing.
- The Bash tool rejects large heredocs on this Windows setup: use the Write tool for files and scripts.
- The sim's zombie steering got stuck on the corner of long obstacles once; the fix is in `steerTarget` (`CORNER_REACHED`). If enemies ever stall a wave again (a wave only ends when all are dead), look there first.

## How to resume

1. `git checkout main && git pull`, then read this file and PENDING.md.
2. Check the dev server is up: http://127.0.0.1:5173/ (do not start a second one).
3. Ask the user what they saw in the game, or take the next item of PENDING §0–2.
4. Before any commit: lint, format check, typecheck, tests, build, asset check, and read the results.
