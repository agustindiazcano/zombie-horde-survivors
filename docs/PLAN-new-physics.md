# Plan: the author's physics in the game (and the classic one unplugged, not deleted)

Written 2026-11-01. Goal (the author's words): create the new physics and **unplug the old classic one without deleting it**. Reference for everything: the benchmark page `tests/physics-lab-diaz-cano-vs-euler.html` and the formula register in [PHYSICS.md](PHYSICS.md) section 8. Nothing in this plan is built yet; only phase 0 is done.

## 1. Decisions that shape the plan

| Decision                           | Proposal                                                                                                                                                                                                                         | Status                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| "Unplug without deleting"          | One switch `physics.engine` in `data/game.json` (`"classic"` or `"hooke"`, validated by zod). The classic code (`resolveCircleAabb`, fixed shoves, scalar gravity, `rapierWorld.ts`) stays, reached only when the switch says so | Needs the author's OK |
| Default while building             | `"classic"`, so `check:sim-hash` and the 51 tests keep passing untouched; flip to `"hooke"` only after the acceptance numbers below                                                                                              | Proposed              |
| Which law is technique 8's gravity | Not decided: the page has only flat `v_y -= g h` and the `0.25` blast. Nothing radial is built until PHYSICS.md section 9 row 1 is answered                                                                                      | 🔴 Blocks phase 5     |
| What goes into the solver          | **Not every zombie.** 1000 zombies cost 1.5 to 2.1 ms a step today (BENCHMARKS.md). Only bodies that need mass and rest: crates, gibs and corpses, shoved units, downed aircraft, ragdolls                                       | Proposed              |
| Boxes                              | The solver is spheres only (the page draws spheres as cubes). Real boxes stay on Rapier or wait for an oriented-box step                                                                                                         | Open                  |

## 2. Phases

| #    | Phase                                                                                                                                                                                                   | Depends on | Done when (acceptance)                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟢 0 | The page is the benchmark: file kept in `tests/`, headless runner `npm run bench:physics-html`, formulas in PHYSICS.md 5 and 8 (2026-11-01)                                                             | none       | **Done.** Pyramid 0.5 cm, hash printed                                                                                                                                     |
| 🔴 1 | Author answers: technique 8's law, switch name and default, the full HTML (its slider block is cut off)                                                                                                 | none       | PHYSICS.md section 9 rows closed                                                                                                                                           |
| 🟡 2 | Bring `world.ts` up to the page: clear only used buckets, real sleep skipping (skip integrating and pairing sleeping bodies, counter 6, wake rules); keep bones, slope, props                           | 1          | Same scene as `bench-physics-html` through `world.ts`: pyramid ≤ 1 cm in 10 s, resting pile costs ~0, `bench:physics` and `check:rapier` still run, two runs give one hash |
| 🟡 3 | Map 12 on `world.ts` behind the switch; Rapier chunk loaded only when the lab asks for boxes (or never, if phase 2 gets oriented boxes)                                                                 | 2          | Lab plays with balls and ragdolls, no 4.4 MB chunk in that path; `"classic"` still opens the Rapier lab                                                                    |
| 🟡 4 | Pushes: `melee.ts` shove and vehicle rams become a mass-weighted push through the same `w_a/(w_a+w_b)` rule; blast on bodies uses the page's saturation impulse (PHYSICS 5.6); damage falloff unchanged | 2          | A heavy brute moves a light zombie more than the reverse; a boss barely moves; `engine = classic` gives today's numbers                                                    |
| 🟢 5 | Gravity: `gravityAt(pos)` in place of `state.gravity` (default same constant), then the integrator the author names; aircraft that fall                                                                 | 1          | With a constant field the 51 tests and `check:sim-hash` are unchanged                                                                                                      |
| 🟢 6 | Unit crowd: only if profiling says separation is the cost (TECHNIQUES 7.1 says to skip: it is already a grid pass and a Rust kernel)                                                                    | 2          | Measured gain at 1000 zombies, else skipped                                                                                                                                |
| ⚪ 7 | Rust/WASM port of the solver (plan phases 6 to 8 in PLAN-rust-wasm.md); bit-identical hash with TypeScript, as the other kernels                                                                        | 2, 3       | `check:kernels`-style match and a timing                                                                                                                                   |

## 3. Budget and checks (every phase)

| Check          | Rule                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Frame budget   | The whole sim step stays ≤ 2.1 ms with 1000 zombies on the runners (`bench:sim`); the solver's share is measured, not guessed |
| Determinism    | Same run, same state hash, twice; seeded RNG only; `src/sim` keeps the `dsin` family, no `Math.sin` and the like              |
| Static checks  | lint, format, typecheck, the 51 tests, build, `check:assets` (CLAUDE.md section 5); no new tests (the author's decision)      |
| Classic stays  | Nothing from the classic path is deleted; `git diff` of a phase may add switches but not remove classic functions             |
| Docs           | PHYSICS.md (rules and register), TECHNIQUES.md, CONTROLS.md if a key changes, in the same commit as the code                  |
| Honest numbers | Benchmarks on the same scene and machine for both engines; say when a claim of the page does not reproduce (see PHYSICS 5.9)  |

## 4. Risks

| Risk                                                                                           | Mitigation                                                                                               |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Outside notes (other assistants' summaries) describe `world.ts` wrongly or invent gravity laws | PHYSICS.md section 8 marks the source of every formula; only HTML and code rows are facts                |
| Sleep skipping hides a bug: a sleeping pile that never wakes when shoved                       | Wake rules copied from the page (overlap 0.008, closing speed, blast); a scene that hits a sleeping pile |
| Moving shoves to mass changes the feel of melee                                                | Switch stays; tune `push` constants in `game.json`; the author plays it                                  |
| Spheres cannot stack like boxes                                                                | Keep boxes on Rapier until oriented boxes exist (decision in section 1)                                  |
