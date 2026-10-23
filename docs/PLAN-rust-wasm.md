# Plan: moving the CPU side to Rust / WebAssembly

Status: **a plan, nothing is built** (written 2026-10-23). The user's call: in the future everything that can goes to Rust so the engine is really optimal. The shaders stay GLSL (WGSL if the engine moves to WebGPU, see [PLAN-webgpu-engine.md](PLAN-webgpu-engine.md)); Rust is for the CPU side. Do not write anything twice: one spec in the docs, one copy in TypeScript (kept as the fallback and the reference), one in Rust, and a check that compares them.

## What is already Rust

`@dimforge/rapier3d-deterministic-compat` (Map 12 and 13 loose bodies, ragdolls) is Rust compiled to WASM and is already in the game. Its determinism hash is `npm run check:rapier` (`65505486`); any change to the Rust side must keep the TypeScript side's numbers (`check:ocean`, `check:rapier`) the same or explain why not.

## Toolchain (installed on the user's PC)

`rustc` and `cargo` 1.99.1, `wasm-pack` 0.15.0, target `wasm32-unknown-unknown`. Windows with Git Bash: long chained commands and big heredocs fail; write scripts with the Write tool and run them. CI (`.github/workflows/ci.yml`, `pages.yml`) has **no Rust yet**: the first crate has to add `dtolnay/rust-toolchain` and `wasm-pack` to both, or commit the built `.wasm` (decide with the user).

## What to port, in order

| #   | Priority | Piece                                                                                                                                                       | Why first / what it needs                                                                                                        |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 🟡       | The ocean: `waveTable`, `oceanHeight`, `vortexHeight`, `oceanFlowAt` (`src/sim/ocean.ts`, 212 lines, pure, numbers only)                                    | Small, pure, called per body and per swimmer every step; the same spec already lives in the shader. A good proof of the pipeline |
| 2   | 🟡       | `floatBodies` (buoyancy) of `rapierWorld.ts`: reads body positions, writes velocities                                                                       | Needs the Rapier handles; either keep it in TypeScript calling the Rust surface function, or use Rapier's Rust API directly      |
| 3   | 🟢       | The own sphere solver `src/sim/physics/world.ts` (618 lines, typed arrays, seeded, `bench:physics`) — the reference of plan phases 6 to 8                   | Flat typed-array layout was written for this; JS reads `memory.buffer` without copying                                           |
| 4   | 🟢       | Hot spots of the main sim named in [PLAN-multiplayer.md](PLAN-multiplayer.md) section 8: zombie separation grid, `nearestTarget`, shot raycasts, flow field | Profile first: the sim step is 2.7 ms with 1000 zombies, so drawing is the likelier bottleneck                                   |
| 5   | ⚪       | Rust fills the `InstancedMesh` matrices (plan phase 8)                                                                                                      | Removes the per-body JavaScript loop                                                                                             |

## How to do piece 1 (suggested)

- A crate `crates/sim-core` (library, `crate-type = ["cdylib"]`), `wasm-bindgen`, build with `wasm-pack build --target web`. Vite loads it with the generated JS glue; `vite.config.ts` has `base: './'` (works on the Pages subpath). WASM needs no COOP/COEP (only `SharedArrayBuffer` does).
- Input: the ocean numbers as a flat `Float64Array` (the fields of `ocean` in `data/game.json`: wave numbers, `pattern` as an integer, `seed`, `chaos`, `heading`, `spread`, the `sequence`, the vortices as 4 numbers each). Output: height and flow written into a caller-owned array. No allocation per call.
- Keep `src/sim/ocean.ts` as the fallback and the reference. Add a script (not a Vitest test, the user dropped new tests) that runs both over thousands of points and times and prints the largest difference.
- Determinism: JavaScript's `Math.sin` and `Math.pow` may differ in the last bits between engines; Rust compiled to WASM uses the same maths library everywhere, which is also what lockstep multiplayer needs ([PLAN-multiplayer.md](PLAN-multiplayer.md)). The GPU copy in the shader can never match to the last bit, so the sim must never read it back.
- The seeded generator (`mulberry32`, integer maths) already ports exactly: use `u32` wrapping arithmetic and the same five draws per wave.

## Rules that stay

- `src/sim` stays pure and deterministic: no `Math.random`, no clock, fixed 1/60 s step.
- No new Vitest tests; keep the 51 existing ones passing; use scripts (`bench:*`, `check:*`).
- Download size is not a constraint (Steam is the target): do not trade speed for WASM size.
- Every formula that is the author's own stays registered in [TECHNIQUES.md](TECHNIQUES.md) with its Rust location added when it moves.

## Open decisions for the user

| Question                                                              | Options                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Build the `.wasm` in CI, or commit it?                                | CI (clean, slower, needs the toolchain in both workflows) / commit (simple) |
| First target: the ocean (small proof) or the own solver (bigger win)? | Recommended: the ocean first                                                |
| Does the Steam wrapper (Electron or Tauri) change anything?           | Tauri is Rust: the same crate could run natively there without WASM         |
