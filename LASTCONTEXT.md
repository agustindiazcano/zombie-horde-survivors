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
- 🟡 Modes, map editor, players, stats and equipment: planned, starts with Phase 1 (PENDING §2c, section below).

## Next big work: modes, map editor, players, stats (planned 2026-10-18, no code yet)

Full plan and decisions: [docs/PLAN-modes-and-map-editor.md](docs/PLAN-modes-and-map-editor.md) (section 8 lists what the user decided; PENDING §2c lists the phases). The mobile version is merged (PR #33). The plan, the PENDING entry and the Meshy AI marine model (CC-BY-4.0, credited in `assets.toml` and the README; it replaces the toon soldier in slot 4 of `data/characters.json` and adds the "Infected marine" enemy with a green `tint`) travel together in the PR from branch `feat/marine-model-and-plan`. Check that this PR is merged and pull `main` before branching.

**Phase 1 is done** on branch `feat/map-format` (no PR yet; details in [docs/worklog/2026-10-18-phase-1-map-format.md](docs/worklog/2026-10-18-phase-1-map-format.md)): `MapSchema` in `src/sim/config.ts`, `data/maps/map-1.json`, `parseConfig(raw, map)`. **Next: 1b** (players and ownership). Then (players and ownership), 1c (unit stat sheets), 1d (items and equipment), 1e (downed state), 2 (menu flow), 3 (editor skeleton), 4 (saving maps). No new tests; the 48 must stay green.

**Prompt to paste at the start of the next session:**

```text
Leé CLAUDE.md, LASTCONTEXT.md, PENDING.md y docs/PLAN-modes-and-map-editor.md. Respondeme en español, con tablas y prioridades con semáforo.

Las decisiones están en la sección 8 del plan (no las reabras): Map 1 = la arena de desarrollo actual; Single Player con Historia y Waves; botón Multiplayer que no hace nada; mapas en la app (data/maps/) y en localStorage; varios jugadores con la IA como un jugador más; vehículos neutrales que necesitan un operador humano, pasajeros disparan solo en vehículos militares con torreta, solo el vehículo recibe daño por ahora; fichas de stats por unidad en JSON con atributos RPG mockeados y XP por clase de arma; armas con accesorios, daño explosivo, melee, puños, escudo, mochila de 10 slots, dos manos, casco y chaleco, botiquines, desfibrilador, granadas; fuego como peligro del entorno; levantar objetos según fuerza, escalar, cargar cuerpos; estado herido antes de morir. Orden confirmado: fases 1 a 4 primero. Sin tests nuevos, los 48 siguen verdes, nunca pushear a main.

Empezá por la FASE 1: (1) git status y ramas; si feat/mobile-view no está en main, preguntame cómo seguir antes de ramificar. (2) Rama nueva. (3) Schema zod del mapa y mover la arena de game.json a data/maps/map-1.json; el juego debe jugarse igual que hoy. (4) lint, format:check, typecheck, tests (leé el resultado), build, check:assets; commits chicos en inglés. (5) Actualizá PENDING/LASTCONTEXT, mostrame una tabla de estado y seguí con la fase 1b sin esperar aprobación salvo que haya una decisión mía.

Preguntas abiertas que no bloquean: manejo de vehículos (recomendado arcade), primer vehículo terrestre, nombres de atributos, XP de arma por kills, reglas del estado herido y del desfibrilador, cómo se ven las armas en los modelos.
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
