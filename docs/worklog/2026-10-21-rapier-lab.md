# 2026-10-21 — Rapier in the physics lab (Phase B6, first step)

Branch `feat/physics-lab`, not committed. Lint, format check, typecheck, the 48 tests, build and check:assets pass. **Nothing was seen in a browser**: the numbers come from `npm run check:rapier`, `npm run bench:physics` and `npm run check:ragdoll`.

Decision (user, 2026-10-21): Rapier replaces the own sphere solver in the lab (ragdoll bones become Rapier joints). The own solver (`world.ts`, `ragdoll.ts`, `scenarios.ts`) stays as the reference for the Rust/WASM port and is still in `bench:physics`. How Rapier bodies meet the 2D unit collision (point 3) is **not decided yet**.

- **Determinism gate:** `@dimforge/rapier3d-deterministic-compat` 0.21.0. Same scene (21 boxes, 120 balls, a ramp, a blast), same hash in 3 runs per process and across 2 processes. Only Node 24 on this machine: other browsers and CPUs are not checked.
- **`rapierWorld.ts`:** heightfield + prop boxes + arena walls, balls, boxes, 10-capsule ragdoll with hinge knees and elbows, `explosion`, `raycast` (for the hitscan, not used yet), flat `pos` / `rot` arrays for the renderer, `stateHash`. `bodies.ts` holds the types and constants without importing Rapier, so the 4.4 MB Rapier chunk loads only when Map 12 opens.
- **Lab:** panel buttons for balls, a box pyramid (91 boxes), 30 loose boxes, marine zombie, ragdoll without a model, blast; sliders for gravity, bounce, friction, both dampings, solver iterations, blast power. Balls carry a banded texture so rolling shows.
- **Rig:** `RagdollRig.apply` now takes the eleven joint positions (`ragdollNodes`), so it no longer depends on any solver; `check:ragdoll` was ported.

## Measured (same machine and run; no GPU; timings are noisy, up to 2x between runs)

| Check                                 | Own solver (spheres)           | Rapier                                      |
| ------------------------------------- | ------------------------------ | ------------------------------------------- |
| 100 / 300 / 600 / 1000 balls, ms/step | 0.24 / 0.84 / 1.93 / 3.50      | 0.42 / 0.72 / 1.63 / 2.35                   |
| 100 / 300 / 600 / 1000 boxes, ms/step | not possible                   | 0.65 / 2.36 / 5.30 / 10.09 (worst 20.7)     |
| Same run twice                        | identical hash                 | identical hash                              |
| Pyramid base 6 (91 bodies), 10 s      | balls: top moved 0.026 m       | boxes: top moved 0.029 m, all 91 asleep     |
| Ragdoll from 3 m                      | rests after 1.9 s (11 spheres) | all 10 bodies asleep after 8.5 s            |
| Heightfield against `heightAt`        | n/a                            | worst difference 0.0000 m                   |
| Ball on a 0.2 slope                   | no spin                        | rolls 17 m, turns 2.67 rad                  |
| Knee hyper-extension (ragdoll)        | no limits                      | worst -4.5 deg (limit works, a little soft) |

## Guesses and open (look in the browser)

- Masses (ball 6 kg, box 25 kg, person 80 kg), friction, bounce, damping, the blast scale (divides by 10, capped at 60 m/s): all first guesses, tune with the sliders.
- Hips and shoulders are spherical joints with no limits; the head and spine do not bend as separate parts of the model (the torso is one capsule).
- The Quaternius ragdoll stays removed. The torso radius (`rig.thickness * 0.8`) is still a guess.
- Rapier takes 8.5 s to put the ragdoll to sleep against 1.9 s for the own solver: it may slide a little longer on screen.
- Boxes 1000 at once cost 10 ms a step on this machine: the 60 Hz budget is 16.7 ms for everything.
