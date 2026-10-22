# 2026-10-21 — Physics lab (Map 12) and zombie ragdolls

Branch `feat/physics-lab` (cut from `feat/helicopter` with its uncommitted work still in the tree; nothing committed, not pushed, no PR). Lint, format check, typecheck, the 48 tests, build and check:assets pass. **Nothing was seen in a browser**; the numbers below come from `npm run bench:physics` and `npm run check:ragdoll`.

Plan: [PLAN-physics-lab.md](../PLAN-physics-lab.md). Source of the maths: `game-engine/ai_studio_code (1).html` (the user's prototype), read and corrected (see PHYSICS.md section 5).

- **Solver (`src/sim/physics/`, pure):** `PhysicsWorld` keeps spheres in flat typed arrays (the layout a Rust/WASM port keeps byte for byte). Position-based, in 3 sub-steps of 2 passes per 1/60 s step: predict, push out of ground (with slope), boxes, walls and other spheres (spatial hash, cell 2.6 m), bone constraints, then speed = displacement. The Hooke contact spring is the compliance 1/k; friction is Coulomb on the displacement; bounce is `1 - 0.273` above 1.5 m/s. No `Math.random`, no clock.
- **First version failed and was replaced:** the velocity/impulse contact of the prototype made a 91-ball pyramid slide down (the top ball fell 2.7 m in 10 s) whatever the friction. The position-based scheme holds it (2.6 cm).
- **Ragdoll (`ragdoll.ts`):** 11 joints, 13 bones. `RagdollRig` (`src/render/ragdollRig.ts`) turns the real bones of the model to follow the joints: hips take the pelvis and the body frame, arm and leg bones aim at the next joint. Specs for `enemy-zombie.glb` (Quaternius, feet hang off `Root`) and `soldier-marine-light.glb` (Mixamo). With the joints on the model's own bind pose the mesh is identical to the original (checked).
- **Map 12 "Physics lab":** `scripts/gen-map12.py` (JSON excluded from Prettier like maps 9 and 10), 120 x 120 m, ramp and plateau east, bowl west, three-walled pit north. Rule `logic.physicsLab` (schema, `GameConfig.physicsLab`, `mapRules`). `src/physicsLab.ts` is the panel (drop balls, pyramid, zombie, marine zombie, joints-only ragdoll, blast; sliders for gravity, bounce, friction, k Hooke, sub-steps, passes, bone damping, blast power; pause, one step, reset, joint markers, live numbers). Grenade `explosion` events also push the lab's bodies.

## Measured (this machine, no GPU; timings are noisy, run to run they differ by up to 2x)

| Check                                          | Result                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| 100 / 300 / 600 / 1000 balls, ms per step      | about 0.3 / 1.1 / 2.5 / 4.5 (3 x 2); 1000 balls with 4 x 3 was 7 to 17 ms        |
| Same run twice                                 | identical state hash                                                             |
| Ball pyramid, base 6 (91 balls), 10 s          | top ball moved 2.6 cm                                                            |
| Ragdoll dropped from 3 m                       | at rest after 1.9 s; worst bone length error 4.3 %                               |
| Zombie / marine model on the ragdoll after 6 s | bones finite, joints within 0.1 m of their bones; worst bone error 4.5 % / 7.3 % |

## Changes later the same day

- The Quaternius zombie ragdoll was removed (user decision: only marine zombies). Its rig spec, the panel button and its check are gone; the horde's own `zombie` model is untouched.
- One gravity: `gravity` in `game.json` → `GameState.gravity`, read by jump, fall, climb, grenades and the lab slider (see PHYSICS.md section 2). `stance.gravity` and `grenades.gravity` were removed from the config.

## Not done / guesses (look in the browser)

- The **Quaternius zombie** is hunched and about 1 m thick front to back, and its spine line sits at the edge of that volume: when it lies down the mesh sinks up to about 0.4 m into the floor. `torsoRadius` (`rig.thickness * 0.8`) is a first guess in `physicsLab.ts`.
- Head and spine do not bend (the torso is one rigid frame, the head follows it); no joint limits (knees can bend backwards); no twist along a bone.
- Boxes are not simulated (a sphere cannot be a box): needs oriented boxes, i.e. Rapier (Phase B6). Balls do not spin.
- The lab renders without interpolation (the physics steps at 60 Hz).
- Not hooked to enemy deaths yet (the horde still plays its `Death` clip); shots do not push bodies.
- Rust, Cargo and wasm-pack are **not installed** on this machine: the WASM port (plan phases 6 to 8) cannot start until they are.
