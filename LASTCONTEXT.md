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
- 🟡 Modes, map editor, players, stats and equipment: phases 1 to 1d are built; 1e is next (PENDING §2c, section below).

## Next big work: modes, map editor, players, stats (planned 2026-10-18, no code yet)

Full plan and decisions: [docs/PLAN-modes-and-map-editor.md](docs/PLAN-modes-and-map-editor.md) (section 8 lists what the user decided; PENDING §2c lists the phases). The mobile version is merged (PR #33). The plan, the PENDING entry and the Meshy AI marine model (CC-BY-4.0, credited in `assets.toml` and the README; it replaces the toon soldier in slot 4 of `data/characters.json` and adds the "Infected marine" enemy with a green `tint`) travel together in the PR from branch `feat/marine-model-and-plan`. Check that this PR is merged and pull `main` before branching.

**Phases 1, 1b, 1c and 1d are done** (three stacked branches, no PR yet, `main` still at `6c7429f`; the PRs must go in order): `feat/map-format` (1 and 1b), `feat/unit-stats` (1c, cut from it) and `feat/items-equipment` (1d, cut from `feat/unit-stats`). Details: [phase 1](docs/worklog/2026-10-18-phase-1-map-format.md), [1b](docs/worklog/2026-10-18-phase-1b-players.md), [1c](docs/worklog/2026-10-18-phase-1c-unit-stats.md), [1d](docs/worklog/2026-10-18-phase-1d-items-equipment.md). In short: `MapSchema` and `data/maps/map-1.json`; players and unit ownership; `data/units.json` stat sheets; `data/items.json` (weapon sheets, armor, medkits, grenade, defibrillator, accessories; weapons live only there), `Soldier.equipment` (right hand, left hand, chest) and a 10-slot backpack of stacks. `parseConfig(raw, map, units, items)`. Anything without a rule is mocked and marked "not active yet". **Next: 1e** (downed state, blocked on the user's rules, see the prompt), then 2 (menu flow), 3 (editor skeleton), 4 (saving maps). No new tests; the 48 must stay green. A duplicate `Meshy_AI_Digital_Camo_Soldier_All_Animations.glb` sits uncommitted in the repo root: ignore it, do not commit it.

**Prompt to paste at the start of the next session:**

```text
Leé CLAUDE.md, LASTCONTEXT.md, PENDING.md y docs/PLAN-modes-and-map-editor.md. Respondeme en español, con tablas y prioridades con semáforo.

Estado: hechas las fases 1, 1b, 1c y 1d, en tres ramas apiladas sin PR: feat/map-format (1 y 1b), feat/unit-stats (1c) y feat/items-equipment (1d, sale de feat/unit-stats). main sigue en 6c7429f. En la raíz hay un GLB duplicado sin commitear (Meshy_AI_Digital_Camo_Soldier_All_Animations.glb): ignoralo, no lo commitees.

Antes de empezar: git status y ramas. Si ya mergeé algo, decime qué falta en main antes de ramificar. Si no, seguí desde feat/items-equipment con una rama nueva (feat/downed-state) y avisame que los PRs deben ir en orden.

Las decisiones están en la sección 8 del plan (no las reabras). Sin tests nuevos, los 48 siguen verdes, nunca pushear a main, PR solo si lo pido.

Empezá por la FASE 1e (estado herido, sección 3g del plan; desfibrilador en 3e). Las reglas del herido y del desfibrilador son mías: si no están escritas en la sección 8 del plan, preguntámelas antes de codear. Después: antes de cada commit lint, format:check, typecheck, tests (leé el resultado), build y check:assets; commits chicos en inglés con Co-Authored-By. Al terminar actualizá PENDING/LASTCONTEXT (lo hecho a docs/worklog/) y seguí con la fase 2 sin esperar aprobación, salvo que haya una decisión mía.

Pendiente de verificar visualmente (yo lo miro): animaciones del marine (Alert, Running, Dead, Unsteady_Walk, Attack), el tinte verde del Infected marine, que Map 1 se vea igual, la ventana de unidad con atributos y habilidades, y la columna de equipo con la mochila de 10 de la fase 1d.

Preguntas abiertas que no bloquean: cómo se ven las armas en los modelos (huesos y de dónde salen las mallas: preguntámelo antes de la parte visual), manejo de vehículos (recomendado arcade), primer vehículo terrestre, y si renombro los atributos (hoy: strength, dexterity, constitution, perception, intelligence, charisma).
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
