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

- ⚪ Three plans written on 2026-10-19, nothing built, decisions taken: [online multiplayer](docs/PLAN-multiplayer.md) (relay plus host; gold, XP and perks per player; any player can pause), [build mode](docs/PLAN-build-mode.md) (structures, doors, turrets, Map 2) and [weapons and combat](docs/PLAN-weapons-and-combat.md) (semi-auto pistol, ammo, recoil, accuracy, aim with the right mouse button in third / first person, headshots, crits, melee, accessories). Suggested order: weapons W1 to W6 (W6 accessories and the workbench: [worklog](docs/worklog/2026-10-19-weapons-w6.md)) and the weapons in hand (**built on branch `feat/weapon-instances`, on top of `main` at `af0733d`, not pushed, no PR, waiting for the user's OK; W4 headshots and crits is the newest commit**), then the flow-field pathfinding (branch from `main`), W6 accessories and workbench, AI grenades, the rest of 8b, and last build mode and multiplayer. A plan for marine zombie variants, dismemberment, runners, wanderers and climbers is in [docs/PLAN-marine-zombies-and-dismemberment.md](docs/PLAN-marine-zombies-and-dismemberment.md) (nothing built; the user answers its section 11). The flow-field pathfinding is built on `feat/flow-field` (from `main`, not pushed). Weapons in hand use procedural meshes on the RightHand bone (`src/render/weaponModels.ts`).

## Next big work: modes, map editor, players, stats (planned 2026-10-18, no code yet)

Full plan and decisions: [docs/PLAN-modes-and-map-editor.md](docs/PLAN-modes-and-map-editor.md) (section 8 lists what the user decided; PENDING §2c lists the phases). The mobile version is merged (PR #33). The plan, the PENDING entry and the Meshy AI marine model (CC-BY-4.0, credited in `assets.toml` and the README; it replaces the toon soldier in slot 4 of `data/characters.json` and adds the "Infected marine" enemy with a green `tint`) travel together in the PR from branch `feat/marine-model-and-plan`. Check that this PR is merged and pull `main` before branching.

**Phases 1 to 8, 10 and the editor polish are all merged into `main`** (PR #35 and PR #47). Per-phase details are in the worklogs of 2026-10-18 in `docs/worklog/`: [phase 1](docs/worklog/2026-10-18-phase-1-map-format.md), [1b](docs/worklog/2026-10-18-phase-1b-players.md), [1c](docs/worklog/2026-10-18-phase-1c-unit-stats.md), [1d](docs/worklog/2026-10-18-phase-1d-items-equipment.md), [1e](docs/worklog/2026-10-18-phase-1e-downed-state.md), [2](docs/worklog/2026-10-18-phase-2-menu-flow.md), [3](docs/worklog/2026-10-18-phase-3-editor-skeleton.md), [4](docs/worklog/2026-10-18-phase-4-save-maps.md), [5](docs/worklog/2026-10-18-phase-5-place-units.md), [6](docs/worklog/2026-10-18-phase-6-terrain.md), [7](docs/worklog/2026-10-18-phase-7-game-logic.md), [8](docs/worklog/2026-10-18-phase-8-vehicles.md), [10](docs/worklog/2026-10-18-phase-10-story-mode.md) and [the editor polish](docs/worklog/2026-10-18-editor-polish.md) (hills, cliffs, fire, climbing, dragging a body, animals, jeep model, credits, Wylan Engine, spatial grid). **Next: the rest of 8b** (lift and throw objects, carry a body, fire spreading) once the user has seen it all. No new tests; the 48 must stay green. A duplicate `Meshy_AI_Digital_Camo_Soldier_All_Animations.glb` sits uncommitted in the repo root: ignore it, do not commit it. Lesson: with stacked PRs, merge the first and retarget the next to `main` (or delete each branch on merge); otherwise each PR lands in its parent branch.

**Prompt to paste at the start of the next session:**

```text
Leé CLAUDE.md, LASTCONTEXT.md, PENDING.md, docs/CONTROLS.md, docs/PLAN-weapons-and-combat.md, docs/PLAN-marine-zombies-and-dismemberment.md, docs/PLAN-build-mode.md y docs/PLAN-multiplayer.md, y los worklogs de docs/worklog/ del 2026-10-19: weapons-w1, w2, w3, w4, w5, weapons-in-hand, weapons-poses, acrobat-and-marine-brute y flow-field. Respondeme en español, con tablas y prioridades con semáforo.

Estado: main está en af0733d (PR #49 granadas, #50 pie de página y #51 planes, mergeados). Hay dos ramas locales sin pushear y sin PR:
- feat/weapon-instances (la que está activa y la que sirve el dev server): W1 a W5, armas en la mano, W4 (cabezazos y críticos), poses de armas (IK de dos manos en tercera persona y arma en primera persona con apuntado), el zombi acrobático violeta, el brute del marine, caminar al bajar la velocidad y el plan de variantes del marine. Último commit d60a35b.
- feat/flow-field (desde main, d084068): el campo de flujo del pathfinding. NO está en feat/weapon-instances; al juntarlas habrá que resolver zombies.ts (el acrobático llama a hop() junto a steerTarget).
Todo pasa lint, formato, typecheck, build, check:assets y los 48 tests. Nada de lo nuevo lo vio Claude en el navegador. En la raíz hay un GLB duplicado sin commitear (Meshy_AI_Digital_Camo_Soldier_All_Animations.glb): ignoralo, no lo commitees.

Antes de empezar: git status y ramas. Si ya mergeé alguna rama (o hice PR), decime qué falta en main antes de ramificar. Si no, seguí en feat/weapon-instances para trabajo que dependa de W1 a W5 y de las poses; para trabajo independiente ramificá desde main y avisame (ojo: cambiar de rama cambia lo que ve el dev server).

Decisiones tomadas (no las reabras): están en LASTCONTEXT y en los planes. Resumen: backend permitido solo para multijugador; oro, XP y perks por jugador; construcción con oro; apuntar solo en control directo en tercera o primera persona; pistola con cargadores infinitos; la IA gasta munición; cuerpo a cuerpo con F, recarga con R; crítico y cabezazo no se suman (gana el mayor); un cabezazo solo hace más daño según el arma, no mata solo ni deja ciego al zombi, y si el cabezazo mata, la cabeza explota o sale volando según la fuerza del arma; los atributos NO se renombran; los modelos viejos de Quaternius se quedan en public/models y assets.toml; la licencia y el pie dicen Agustin Diaz Cano / Wylan Studios. Sin tests nuevos, los 48 siguen verdes, nunca pushear a main, PR solo si lo pido; el repo y GitHub Pages siguen públicos. Assets: solo CC0 o CC-BY con crédito en assets.toml (npm run credits al agregar uno; nada de Mixamo sin preguntarme). Si cambia una tecla o acción del mouse, actualizá docs/CONTROLS.md y el README en el mismo commit.

Si te cuento que algo se ve o se siente mal, arreglalo primero y avisame; el dev server ya corre en http://127.0.0.1:5173/ (no abras otro).

Si no, seguí en este orden (esperá mi visto bueno al terminar cada uno): la fase M0 del plan de marines (medir rendimiento con F3 y el perfilador de Chrome en una tanda pesada, y hacer una copia liviana del marine: tiene 61.272 triángulos y los otros enemigos pesan ~1 MB); luego variantes (M1), comportamientos de corredores, los que deambulan y los que escalan (M1b), desmembramiento (M2 a M4), jefes como marines (M5); que la IA tire granadas; el resto de 8b; y recién al final construcción y multijugador. Antes de cada commit: lint, format:check, typecheck, tests (leé el resultado), build y check:assets; commits chicos en inglés con Co-Authored-By. Al terminar actualizá PENDING/LASTCONTEXT (lo hecho a docs/worklog/).

Pendiente de verificar visualmente (yo lo miro): caminar al bajar la velocidad, las poses (dos manos en tercera persona), el arma en primera persona y al apuntar, el acrobático violeta (salta y da vueltas) y el brute del marine, cabezazos y críticos de W4 (números flotantes, brillo de la mira), el campo de flujo (zombis rodeando paredes), granadas, los cuatro marines, el pie de la app y toda la pila del 18/10 (menú, editor, Game logic, modo Story, jeep con V, colinas, precipicios, fuego, trepar, arrastrar con G, perro y gato) y docs/CONTROLS.md. Medir rendimiento con F3 y el perfilador de Chrome (la sim tarda ~2,8 ms por paso con 1000 zombis, así que el dibujo es el sospechoso, sobre todo con muchos marines).

Limitaciones conocidas: las posiciones de las poses y de la primera persona (armPose.ts, viewModel.ts, WEAPON_POSES) son estimaciones; el clip de caminar no ajusta su velocidad a la real; el acrobático no esquiva balas en el aire; los accesorios no se ven en el modelo del arma y el ruido (noise) no atrae enemigos todavía; los mapas no pueden fijar balas ni accesorios de un arma colocada; no se levanta munición del suelo; sin animación de recarga ni de tajo de cuchillo; el fogonazo sale del soldado, no del cañón; las vistas previas de la pantalla de escuadra y del menú no muestran armas; todos los números de precisión, retroceso, cabezazos y críticos están sin jugar; la altura de impacto ignora las colinas; la IA no tira granadas; trepar y arrastrar sin animación propia; los soldados de la IA no trepan ni arrastran; un solo margen en el campo de flujo para todos los tamaños.

Preguntas abiertas que no bloquean: ninguna por ahora.
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
