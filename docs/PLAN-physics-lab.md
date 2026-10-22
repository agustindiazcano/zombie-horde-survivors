# Plan: physics lab (Map 12), zombie ragdolls and the road to Rust/WASM

Status: phases 1 to 4 built on `feat/physics-lab` (2026-10-21) with the own solver; the lab then moved to Rapier (Phase B6 first step, [worklog](worklog/2026-10-21-rapier-lab.md)) and the own solver stays as the reference for 6 to 8; 5 (look, tune, shots, ragdoll on death) and 6 to 8 open. The longer write-up with the diagram lives in the user's Claude doc "Plan de implementación: motor de física, Map 12 y ragdolls de zombies"; this file is the short version for the repo. What was built and measured: [worklog](worklog/2026-10-21-physics-lab-map-12.md).

## Decision

The game has no physics engine (see [PHYSICS.md](PHYSICS.md)): movement is 2D kinematics in `src/sim`. The new physics is **a separate pure module, `src/sim/physics/`**, for loose bodies and ragdolls, as Phase B6 says of Rapier ("live units stay on the custom 2D collision"). Its maths come from the user's prototype `game-engine/ai_studio_code (1).html` (spatial hash, Hooke contact, saturation 0.25, viscosity 0.273), corrected where it did not hold up.

## Phases

| #    | Phase                                                                                                                                  | Gate                                                    | State         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------- |
| 🔴 1 | Solver: typed arrays, sub-steps, masses, seeded RNG only, `bench:physics`                                                              | same run twice gives the same hash                      | built         |
| 🔴 2 | Map 12 (`gen-map12.py`, `logic.physicsLab`)                                                                                            | it appears in Start → Single Player → Waves             | built, unseen |
| 🟡 3 | Render (one instanced mesh) and the lab panel; grenade blasts push bodies                                                              | 1000 balls drawn                                        | built, unseen |
| 🟡 4 | Ragdoll of 11 joints driving the bones of the Quaternius zombie and the Mixamo marine                                                  | at rest in under 6 s; bones within 15 % of their length | built, unseen |
| 🟢 5 | Experiments in the browser: tune the sliders, the torso radius, the ramp and the pit; shots as impulses; ragdoll on a real enemy death | the user's look                                         | open          |
| ⚪ 6 | Install Rust, `wasm-pack`; a crate with the same flat layout                                                                           | state hash identical to the TypeScript one              | open          |
| ⚪ 7 | `wasm-bindgen`; JS reads `memory.buffer` without copying; keep the TypeScript solver as fallback                                       | faster than TypeScript on `bench:physics`               | open          |
| ⚪ 8 | Rust writes the `InstancedMesh` matrices                                                                                               | no per-body JS loop                                     | open          |

## Rules kept

- `src/sim` stays pure and deterministic: no `Math.random`, no clock, fixed 1/60 s step.
- No new tests (the user's decision): `bench:physics` and `check:ragdoll` are scripts, not Vitest tests.
- WASM does not need COOP/COEP (only `SharedArrayBuffer` does), so it works on GitHub Pages.
- Plan B6/B7 of [PLAN-webgpu-engine.md](PLAN-webgpu-engine.md) (Rapier, ragdoll pool) still stands for oriented boxes and many ragdolls; this lab is the cheap first look at the same idea with the user's own maths.
