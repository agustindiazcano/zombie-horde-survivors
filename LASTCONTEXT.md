# Last Context — Current State (2026-10-14)

Only what is still open: read this first in every session. When an item here is done, move it to `docs/worklog/` and take it out of this file. What was done up to today: [docs/worklog/2026-10-14-snapshot.md](docs/worklog/2026-10-14-snapshot.md). The full list of open work, by priority: [PENDING.md](PENDING.md). Working rules: [CLAUDE.md](CLAUDE.md).

## Where things stand

- **`main`** is at the merge of PR #47 (`a9b8658`) and has everything built so far: the whole stack of phases 1 to 8 and 10, the editor work and the polish. (PRs #36 to #46 were merged into their parent branches instead of `main`, so #47 brought the rest in one go; the stack branches are still on the remote, merged and safe to delete once the user agrees.) No PR or feature branch is open apart from the docs update that refreshed this file.
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

- ⚪ Three plans written on 2026-10-19, nothing built, decisions taken: [online multiplayer](docs/PLAN-multiplayer.md) (relay plus host; gold, XP and perks per player; any player can pause), [build mode](docs/PLAN-build-mode.md) (structures, doors, turrets, Map 2) and [weapons and combat](docs/PLAN-weapons-and-combat.md) (semi-auto pistol, ammo, recoil, accuracy, aim with the right mouse button in third / first person, headshots, crits, melee, accessories). Suggested order: weapons W1, W2, W3 and W5 melee (**built on branch `feat/weapon-instances`, waiting for the user's OK**), flow-field pathfinding, then build mode and multiplayer. The only open blocker is how weapons look on the models (ask the user first).

## Next big work: modes, map editor, players, stats (planned 2026-10-18, no code yet)

Full plan and decisions: [docs/PLAN-modes-and-map-editor.md](docs/PLAN-modes-and-map-editor.md) (section 8 lists what the user decided; PENDING §2c lists the phases). The mobile version is merged (PR #33). The plan, the PENDING entry and the Meshy AI marine model (CC-BY-4.0, credited in `assets.toml` and the README; it replaces the toon soldier in slot 4 of `data/characters.json` and adds the "Infected marine" enemy with a green `tint`) travel together in the PR from branch `feat/marine-model-and-plan`. Check that this PR is merged and pull `main` before branching.

**Phases 1 to 8, 10 and the editor polish are all merged into `main`** (PR #35 and PR #47). Per-phase details are in the worklogs of 2026-10-18 in `docs/worklog/`: [phase 1](docs/worklog/2026-10-18-phase-1-map-format.md), [1b](docs/worklog/2026-10-18-phase-1b-players.md), [1c](docs/worklog/2026-10-18-phase-1c-unit-stats.md), [1d](docs/worklog/2026-10-18-phase-1d-items-equipment.md), [1e](docs/worklog/2026-10-18-phase-1e-downed-state.md), [2](docs/worklog/2026-10-18-phase-2-menu-flow.md), [3](docs/worklog/2026-10-18-phase-3-editor-skeleton.md), [4](docs/worklog/2026-10-18-phase-4-save-maps.md), [5](docs/worklog/2026-10-18-phase-5-place-units.md), [6](docs/worklog/2026-10-18-phase-6-terrain.md), [7](docs/worklog/2026-10-18-phase-7-game-logic.md), [8](docs/worklog/2026-10-18-phase-8-vehicles.md), [10](docs/worklog/2026-10-18-phase-10-story-mode.md) and [the editor polish](docs/worklog/2026-10-18-editor-polish.md) (hills, cliffs, fire, climbing, dragging a body, animals, jeep model, credits, Wylan Engine, spatial grid). **Next: the rest of 8b** (lift and throw objects, carry a body, fire spreading) once the user has seen it all. No new tests; the 48 must stay green. A duplicate `Meshy_AI_Digital_Camo_Soldier_All_Animations.glb` sits uncommitted in the repo root: ignore it, do not commit it. Lesson: with stacked PRs, merge the first and retarget the next to `main` (or delete each branch on merge); otherwise each PR lands in its parent branch.

**Prompt to paste at the start of the next session:**

```text
Leé CLAUDE.md, LASTCONTEXT.md, PENDING.md y docs/PLAN-modes-and-map-editor.md, y los worklogs de docs/worklog/ del 2026-10-18, sobre todo 2026-10-18-editor-polish.md (todo lo de la última rama). Respondeme en español, con tablas y prioridades con semáforo.

Estado: hechas las fases 1 a 8 y 10, el trabajo extra del editor y el pulido posterior, todo mergeado en main (PR #35 y #47). En la raíz hay un GLB duplicado sin commitear (Meshy_AI_Digital_Camo_Soldier_All_Animations.glb): ignoralo, no lo commitees.

Antes de empezar: git status y ramas, y confirmá que main tiene todo. Para una tarea nueva, ramificá desde main.

Las decisiones están en la sección 8 del plan y en LASTCONTEXT (no las reabras). Sin tests nuevos, los 48 siguen verdes, nunca pushear a main, PR solo si lo pido. Licencia: propietaria, todos los derechos reservados (Wylan Studios, motor Wylan Engine); el repo y GitHub Pages siguen públicos por ahora. Assets: solo CC0 o CC-BY, con crédito en assets.toml (corré npm run credits al agregar uno).

Si te cuento que algo se ve o se siente mal, arreglalo primero y avisame; el dev server ya corre en http://127.0.0.1:5173/ (no abras otro).

Si no, proponeme el siguiente paso con tu recomendación y esperá mi elección. Candidatos: el resto de 8b (levantar y tirar objetos, cargar un cuerpo al hombro, que el fuego se propague), más animales o enemigos hostiles de otra familia, animaciones reales para trepar y arrastrar, o lo que me haya parecido mal al mirarlo. Antes de cada commit: lint, format:check, typecheck, tests (leé el resultado), build y check:assets; commits chicos en inglés con Co-Authored-By. Al terminar actualizá PENDING/LASTCONTEXT (lo hecho a docs/worklog/) y esperá mi visto bueno antes de seguir.

Hecho en la última tanda (nada visto en navegador todavía, yo lo miro): pickups en colinas, clic del editor sobre colinas, spawns fuera de obstáculos, números editables de objetivos Story, briefing de misión, barra de vida del jeep, orden de RTS para subir al jeep (clic derecho), precipicios que bloquean el paso (MAX_CELL_RISE), fuego (zonas que dañan, sección Fire en Game logic), título de pestaña y pie del menú con Wylan Engine, pantalla de créditos, trepar cajas con Espacio, jeep con el modelo SUV de Kenney, perro y gato de Quaternius (Units > Animals), arrastrar cuerpos con G, y una grilla espacial en la sim (npm run bench:sim: 1000 zombis bajaron de 9,3 a 2,7 ms por paso).

Pendiente de verificar visualmente (yo lo miro): todo lo anterior más menú y editor, pestaña Game logic, modo Story, el jeep (V), el editor completo, pestaña Environment y la cámara libre. Medir rendimiento en el navegador con F3 y el perfilador de Chrome en una tanda pesada para ver si el cuello es el dibujo o la sim.

Limitaciones conocidas: trepar y arrastrar sin animación propia (usan la pose de salto y de caído); los soldados de la IA no trepan ni arrastran; los zombis no alcanzan al centro de una caja de 3 m; escala (0,6) y orientación de perro y gato son estimaciones y solo tienen Idle y Walking; el modelo del jeep es provisorio; un spawner con vida editada no escala con la oleada; los atributos no los lee ninguna regla; faltan rayos, sonido de clima y estrellas; las constantes de partículas y colores del clima son estimaciones.

Preguntas abiertas que no bloquean: cómo se ven las armas en los modelos (huesos y de dónde salen las mallas: preguntámelo antes de la parte visual), nombre legal para la licencia, y si renombro los atributos (strength, dexterity, constitution, perception, intelligence, charisma).
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
