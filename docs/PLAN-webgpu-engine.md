# Plan: WebGPU engine, 1,000+ units, VAT, ragdoll pool (Phase B) and mocap

Status: **Phase B, nothing built** (noted 2026-10-19 from the user's pasted architecture brief and chat notes). The user's stated goal: take the game from a prototype to a **commercial game** that scales to 1,000 units or more depending on the PC. The user expects this plan to **change** as work goes on; treat every number and library below as a first draft. Phase A (the 12-row status table: look at the game, integrate `feat/weapon-instances`, AI grenades, 8b...) comes first; see [PENDING.md](../PENDING.md).

## 1. What the brief proposes

A commercial-grade tactical action / RTS hybrid (Call to Arms / Men of War feel, Half-Life 2 rigid bodies, Skyrim / Fallout stat modifiers, roguelike waves) for **Steam** (Tauri v2 + `steamworks-rs`) and modern browsers.

| Target            | Value                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Baseline hardware | 60 FPS on a 2020 integrated GPU (Iris Xe / Vega)                                                    |
| Units             | 1,000+ live, thousands of shells and particles, active ragdolls                                     |
| Threads           | render on main thread; ECS + physics in Web Workers (Rust/WASM); crowd navigation in compute / WASM |
| Memory            | no GC in hot loops; `SharedArrayBuffer` + typed arrays (SoA), zero-copy                             |

## 2. Stack in the brief

| Area      | Choice                                                                         | Note                                                                        |
| --------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Rendering | three.js `WebGPURenderer`, shaders only in TSL (`three/tsl`)                   | no `WebGLRenderer`, `ShaderMaterial`, `onBeforeCompile` or `EffectComposer` |
| ECS       | `bitecs` or hand-made SoA typed arrays                                         | entity = integer id                                                         |
| Physics   | `@dimforge/rapier3d` in a physics worker                                       | live units are capsules only; ragdoll on death                              |
| Desktop   | Tauri v2 + `steamworks-rs` (achievements, Workshop, leaderboards, cloud saves) | needs COOP / COEP headers for `SharedArrayBuffer`                           |
| Assets    | Meshy AI -> headless Blender (`bpy`) -> `gltf-transform` + meshopt + KTX2      | LODs, vertex-colour masks, texture compression                              |

Shared memory layout: `TransformBuffer` (`[x,y,z,qx,qy,qz,qw,scale]` x 10,000), `RenderStateBuffer` (`[animClipId, animFrame, velocityMagnitude, jigglePhase]`), a lock-free command ring buffer (`Int32Array` + `Atomics`) for impulses, explosions, raycasts, spawns, ragdoll activation.

## 3. Subsystems (technical sketch)

| Subsystem               | Idea                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crowd rendering         | `InstancedMesh` per archetype and LOD (one draw call each); skeletal animation baked to a float `DataTexture` (X = vertex, Y = frame), sampled in a TSL `positionNode` by `instanceIndex`                                                                                                                                       |
| Belly jiggle            | vertex colour `R` as a soft-weight mask; damped oscillator in the vertex node driven by velocity and acceleration; zero CPU cost                                                                                                                                                                                                |
| Tentacles, worms, tails | GPU Verlet or analytic wave along vertex colour `G` (root 0 to tip 1); tails are a spring chain while alive and a Rapier multibody only on death                                                                                                                                                                                |
| Ragdoll pool            | ring buffer of 32 to 48 `SkinnedMesh` ragdolls; on death look up the bone transforms of the current VAT frame (LUT of the 10 to 12 main bones), hide the instance, claim a ragdoll, start the bodies in that pose + the explosion impulse; after about 5 s or low energy freeze, bake or sink the corpse and release the joints |
| Destructibles           | crates and barrels are sleeping Rapier bodies; on a hit swap to pre-fractured debris in an instanced pool + radial impulse                                                                                                                                                                                                      |
| Vehicles                | chassis + 4 wheels in the GLB; Rapier `DynamicRayCastVehicleController`; glass as its own material slot (opacity about 0.4, roughness 0.1); sirens = rotating additive cones + emissive pulse into bloom, at most one pooled real light                                                                                         |
| Doors                   | proximity trigger from the spatial hash + Rapier kinematic collider; sci-fi doors slide with a critically damped spring; the flow-field cost is updated when they open or close                                                                                                                                                 |
| Navigation              | grid vector flow field (cost, Dijkstra integration, gradient) + boid separation through a spatial hash, O(N); **no A\* per unit**                                                                                                                                                                                               |
| Vegetation              | instanced grass / wheat blades with noise wind and a top-down occupancy texture so vehicles flatten them; trees in 3 LODs with GPU culling                                                                                                                                                                                      |
| Terrain                 | splat material with Parallax Occlusion Mapping under 15 m, normal map beyond                                                                                                                                                                                                                                                    |
| Water                   | planar reflector at half resolution, two scrolling normal maps, depth absorption, foam                                                                                                                                                                                                                                          |
| Fog, sand, fire, flares | height fog node in TSL, compute-particle sand streaks, GPU brass casings in one instanced draw, soft particles (depth fade against `viewportDepthTexture`), additive blending                                                                                                                                                   |
| Post-processing         | one fused TSL graph: bloom (luminance threshold) + GTAO / SSAO (half res on iGPU) + ACES tone mapping                                                                                                                                                                                                                           |

Asset pipeline (`scripts/asset-pipeline/`): `process_asset.py` (clean geometry, pivot at the base, LOD0 100% / LOD1 40% / LOD2 15%, vertex-colour bake by tag `zombie_bloated`, `foliage`, `vehicle`) and `optimize_gltf.sh` (textures max 1024 for units and 2048 for terrain, KTX2 UASTC / ETC1S).

## 4. Phased roadmap in the brief

| Phase | Content                                                                                                                                  | Verification gate                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1     | Vite + TS + three WebGPU + bitecs + Rapier; COOP / COEP; `SharedMemoryManager`; physics worker at 60 Hz                                  | 1,000 capsules rendered by `InstancedMesh`, under 2 ms CPU per frame, zero GC allocations              |
| 2     | Flow field + spatial hash boids; VAT loader + TSL `positionNode`; ragdoll ring pool with LUT pose matching; GPU shells; crate fracturing | 1,000 units path around dynamic obstacles; explosive rounds swap hit instances into ragdolls at 60 FPS |
| 3     | TSL jiggle and tentacles; POM terrain; grass with trampling; water, soft particles, fog, bloom + AO                                      | GPU frame time under 14 ms at 1080p on an iGPU profile (`TimestampQuery`)                              |
| 4     | Police car vehicle; sci-fi and hinged doors tied to the flow field; wave director with Skyrim / Fallout style modifiers as bitmasks      | playable vertical slice of the wave loop                                                               |
| 5     | `process_asset.py`, KTX2, Tauri v2 + `steamworks-rs`                                                                                     | packaged build                                                                                         |

Each phase must pass `tsc --noEmit`, unit tests on buffers and math, and headless Playwright WebGPU smoke tests.

## 5. How it collides with what the project already decided

Going commercial is now the user's stated direction for Phase B, so items 2 and 3 become decisions to update in CLAUDE.md (assets policy, "no backend", tests) when Phase B starts. Read this before anything is started; the rows are what must be reconciled.

| #   | Conflict                    | Today                                                                                                                                                                              | Why it matters                                                                                                                                           |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Tests**                   | the user dropped new tests and TDD (the 48 sim tests stay)                                                                                                                         | the brief requires unit and Playwright gates per phase                                                                                                   |
| 2   | **Assets**                  | only CC0 / CC-BY, each in `assets.toml`; AI-generator output needs its license confirmed first                                                                                     | the brief makes Meshy output the main source                                                                                                             |
| 3   | **Steam / Tauri**           | free, no backend, shared by link; going commercial is not decided; outward-facing choices are the user's                                                                           | Steamworks, a store page and money change the whole project                                                                                              |
| 4   | **Rewrite vs. what exists** | `src/sim` is pure TS at a fixed 60 Hz, the 3D layer is WebGL three.js, a flow field already exists (`feat/flow-field`), a procedural-blood and dismemberment system works per unit | WebGPU + TSL + VAT replaces `SkinnedMesh` characters, so dismemberment, per-limb tint and weapon attachment (all built on bones) would have to be redone |
| 5   | **Profile first**           | the sim step is 2.7 ms with 1000 zombies; drawing is the likelier bottleneck ([PLAN-multiplayer.md](PLAN-multiplayer.md) section 8)                                                | do not move to Wasm / workers before F3 and Chrome's profiler say so                                                                                     |
| 6   | **Browser support**         | desktop browser, mobile best effort                                                                                                                                                | WebGPU is not available everywhere; `SharedArrayBuffer` needs COOP / COEP, and GitHub Pages cannot set headers                                           |
| 7   | **Roguelike**               | waves + perks already exist                                                                                                                                                        | the "modifier bitmask" director would be a rewrite of `waves.ts` / `upgrades.ts`                                                                         |

A cheaper path that keeps the current game: first measure; then try `InstancedMesh` + VAT for the horde only (the light marine is already 4,900 triangles); keep the dismemberment variants as separate, non-instanced views.

## 5b. Extra ideas from the chat notes (kept short, not in the brief)

| Topic                  | Note                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Physics engine options | Rapier (Rust, chosen), Ammo.js (Bullet, mature vehicles and ragdolls, rougher API), PhysX to WASM (most complex setup) |
| Scaling by PC          | detect the GPU and set unit cap, shadows, AO and particle counts per profile; high-end uncapped                        |
| Light shafts           | translucent cones with a special material instead of real volumetric light                                             |
| Clouds                 | large soft particles shaded away from the sun, no raymarching on iGPU                                                  |
| Trees                  | Meshy, or Blender add-ons Sapling Tree Gen and MTree; leaves as plane clusters (billboards)                            |
| Doors, wheels, glass   | split into separate objects / material slots in Blender (or the headless script), animate by code                      |
| Hybrid physics         | live units are simple capsules; the detailed ragdoll exists only for the 10 to 15 that just died                       |
| Jiggle: two ways       | extra bones + spring (bosses, few units) or vertex-colour shader (hordes)                                              |

## 6. Questions for the user

| #   | Question                                                              | Recommendation                                        |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Is this a rewrite (new repo) or an incremental migration of this one? | incremental, starting with measurements               |
| 2   | Is Steam a real goal now?                                             | decide after the public link has players              |
| 3   | WebGPU only, or keep a WebGL fallback?                                | fallback while the game is shared by link             |
| 4   | Is the Meshy license acceptable for a paid release?                   | check the terms before any asset enters `assets.toml` |

## 7. Motion capture for the soldier (MediaPipe, webcam, recording)

Asked 2026-10-19: can a rigged soldier move like me, from a video or live from the webcam, can I save the recordings, with which tools, with code and without Blender, and with Blender?

| Question                            | Answer                                                                                                                                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rigged model moves from a video?    | Yes. MediaPipe Pose (BlazePose, Apache 2.0) returns 33 3D body landmarks per frame from a video or a camera. You turn the landmarks into bone rotations and apply them to the skeleton                                                                          |
| Live from the webcam?               | Yes, in the browser (`@mediapipe/tasks-vision`, runs on the GPU / WASM, real time on a normal laptop)                                                                                                                                                           |
| Save the recording as an animation? | Yes. Record the per-frame bone quaternions, smooth them, and store them as JSON or as a three.js `AnimationClip` (`clip.toJSON()`), or export a GLB with `GLTFExporter`. The game then plays it like any clip in `data/characters.json`, or bakes it into a VAT |
| With code only, no Blender?         | Yes. Libraries that already do landmarks -> rig rotations: **Kalidokit** (MIT, made for MediaPipe + three.js / VRM), or your own retargeting (compare each bone's rest direction with the direction between two landmarks)                                      |
| With Blender?                       | Yes. The **BlendArMocap** add-on runs MediaPipe inside Blender and bakes keyframes onto a rig; you then clean the curves, trim loops and export the GLB                                                                                                         |

What to expect, honestly:

| Topic              | Reality                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quality            | webcam pose is noisy: needs smoothing (One Euro filter), no foot planting (feet slide), limited fingers and face; legs hidden by a desk are guessed       |
| Root motion        | position in the world comes out weak; record "in place" loops (run, idle) and let the game move the unit                                                  |
| Different skeleton | the soldier's bones need a mapping (hips, spine, arms, legs); the Meshy marine's armature must be checked first                                           |
| Better results     | Mixamo (free auto-rig + clips), or video-to-mocap services (Rokoko Vision, Move.ai, DeepMotion, Plask); check the license of their output before shipping |
| Licenses           | MediaPipe and Kalidokit are permissive; your own recording is yours; clips from third parties need an `assets.toml` entry like any asset                  |

Suggested small experiment (not scheduled): a standalone page `tools/mocap.html` with MediaPipe + Kalidokit driving the marine, a Record button and a "Download clip JSON" button, kept out of the game bundle.

## 8. Next step if the user wants to start

1. Phase 0 of this plan: profile a heavy wave in the browser (F3, Chrome profiler) and write the numbers down. No code change.
2. Prototype `InstancedMesh` + VAT for one enemy type on a branch, compare against the pooled `SkinnedMesh` views.
3. Only then decide on the rest.

## 9. Audit of the current code (2026-10-19, branch `feat/weapon-instances`)

Method: file sizes, greps for legacy APIs, a read of `types.ts`, `grid.ts`, `flowfield.ts`, the renderer's unit pools and the sky shader. **Not measured**: no profile of a heavy wave exists yet, so every performance claim below is a hypothesis until phase B0 runs.

### 9.1 What exists

| Area                                       | Today                                                                                                                                                                                                                                                     | Fit with Phase B                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Size                                       | about 16,000 lines of TS; `gameRenderer.ts` 1,215, `editor.ts` 1,617, `main.ts` 642, `sim/config.ts` 1,180                                                                                                                                                | `gameRenderer.ts` is the file Phase B rewrites most                                                           |
| three.js                                   | 0.186 (has `three/webgpu` and `three/tsl`), Vite 8, TypeScript 6                                                                                                                                                                                          | the brief's "r170+" is satisfied; no upgrade needed                                                           |
| Renderer                                   | `THREE.WebGLRenderer` in `render/gameRenderer.ts:157` and `menuModel.ts:15`; `viewModel.ts:125` takes a `WebGLRenderer`                                                                                                                                   | swap to `WebGPURenderer`; three places to touch                                                               |
| Legacy shaders                             | one `ShaderMaterial` (sky dome, `render/environment.ts:85`); no `onBeforeCompile`, no `EffectComposer`                                                                                                                                                    | small: one shader to port to TSL, no post-processing exists yet                                               |
| Instancing                                 | only `gore.ts` uses `InstancedMesh` (blood droplets)                                                                                                                                                                                                      | the horde is not instanced                                                                                    |
| Characters                                 | every unit is a `CharacterView` over a cloned `SkinnedMesh` (`SkeletonUtils.clone`), pooled per type in `pools` (`gameRenderer.ts:221`); CPU skinning by `AnimationMixer`; `limbSplit.ts`, `armPose.ts`, `looseParts.ts` work on bones and skinned ranges | the main cost and the main conflict (see 9.3)                                                                 |
| Lights and shadows                         | one sun with a 2048 shadow map, 4 flashlight `SpotLight`s in dark mode, 2 pooled `PointLight`s (muzzle, grenade); presets in `settings.ts`                                                                                                                | already budgeted; fits the brief's "few real lights"                                                          |
| Simulation                                 | pure TS in `src/sim`, fixed 60 Hz, seeded RNG (no `Math.random` in `sim`), state is objects: `Zombie`, `Soldier`, `Vehicle` with `Vec2` fields and `prev` for interpolation                                                                               | deterministic and DOM-free (good for a worker and for multiplayer); but array-of-objects, not typed-array SoA |
| Pathfinding                                | `flowfield.ts` (276 lines): 1 m cells, shared field, Dijkstra, refresh every 0.25 s, `Float64Array` costs                                                                                                                                                 | the brief's flow field already exists in main-thread JS; needs boid separation and obstacle-cost events       |
| Spatial index                              | `grid.ts`: 4 m cells for **obstacles** only                                                                                                                                                                                                               | no spatial hash for units yet (needed for separation and queries)                                             |
| Workers, `SharedArrayBuffer`, Wasm, Rapier | none                                                                                                                                                                                                                                                      | all new                                                                                                       |
| Physics                                    | custom 2D circle and box collision in `collision.ts`; no rigid bodies, no ragdolls (death clips, gibs and loose parts are visual)                                                                                                                         | Rapier would be a new layer, not a replacement of working physics                                             |
| Asset weight                               | `soldier-marine.glb` 16 MB (source), `soldier-marine-light.glb` 1.8 MB (4,900 triangles, used by the horde), enemies about 0.5 to 1 MB each (skeleton 4.8 MB)                                                                                             | already has a light marine; KTX2 / meshopt not applied                                                        |
| Build and hosting                          | `base: './'` for GitHub Pages; no COOP/COEP headers; no Tauri                                                                                                                                                                                             | `SharedArrayBuffer` cannot be enabled on Pages                                                                |
| Tests                                      | 48 sim tests + `bench:sim` (2.7 ms per step at 1000 zombies, headless, no rendering)                                                                                                                                                                      | the one measured number: the sim is probably not the limit                                                    |

### 9.2 Gaps against the brief

| Brief requirement                                              | Gap                                                                                                                                                                            | Size                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `WebGPURenderer` + TSL                                         | renderer swap, sky dome port, check every material, shadows and `SpotLight`s behave differently                                                                                | M                     |
| `SharedArrayBuffer` SoA ECS                                    | sim state is objects with `Vec2`; moving it to typed arrays touches every file in `src/sim` (about 4,500 lines) and every reader in `render/`, `hud`, `radar`, `rts`, `editor` | XL                    |
| Physics worker + Rapier                                        | new package, new worker, new command protocol; the sim is 2D, Rapier is 3D                                                                                                     | L                     |
| VAT instanced crowd                                            | baker script, VAT material in TSL, per-instance state buffer; loses per-unit bones                                                                                             | L                     |
| Ragdoll pool with pose LUT                                     | needs Rapier, a ragdoll-ready rig with colliders per bone, and the bone LUT per VAT frame                                                                                      | L                     |
| Flow field + boids in worker / compute                         | field exists; add unit spatial hash, separation, obstacle-cost events, move it off the main thread                                                                             | M                     |
| GPU shells, grass, water, fog, POM, soft particles, bloom + AO | none exist; `effects.ts` and `gore.ts` are CPU particles                                                                                                                       | L (many small pieces) |
| Vehicles with raycast suspension                               | vehicles are a simple 2D mover (`sim/vehicles.ts`) with seats; the Rapier controller is new                                                                                    | M                     |
| Wave director with modifier bitmasks                           | waves and perks exist as JSON-driven code                                                                                                                                      | M                     |
| Headless Blender pipeline + KTX2                               | only `scripts/make-light-model.mjs` exists                                                                                                                                     | M                     |
| Tauri v2 + Steamworks                                          | nothing                                                                                                                                                                        | L, and outward-facing |

### 9.3 The three structural conflicts

| #   | Conflict                                                                                                       | What breaks if done naively                                | Proposed resolution                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | **VAT has no bones**; dismemberment, loose limbs, armour plates, tint and weapon hand-attachment all use bones | every horde enemy loses heads, limbs, held weapons         | **Tiered rendering**: far or plain units are instanced VAT; a unit that is near the camera, boss-sized, dismembered or hit is promoted to a pooled `SkinnedMesh` "hero" view (what exists now). Promotion cap per frame and in total. Soldiers (4, plus allies) always stay skinned                                      |
| C2  | **SoA rewrite of the sim** is the largest cost and also the one most likely to be unnecessary                  | months of work on a sim that costs 2.7 ms                  | do **not** convert the sim first. Keep objects; publish a per-frame **render snapshot** (typed arrays) from the sim. Convert to SoA only if the profile says the sim is the limit                                                                                                                                        |
| C3  | **No COOP/COEP on GitHub Pages**                                                                               | `SharedArrayBuffer` is undefined in the live browser build | two transports behind one interface: (a) `SharedArrayBuffer` when `crossOriginIsolated` (Tauri, or a host with headers such as Cloudflare Pages `_headers`); (b) transferable `ArrayBuffer` double buffering via `postMessage` (no copies, no headers) as the default. A `coi-serviceworker` is a third option for Pages |

## 10. Detailed plan by phase

Order matters: each phase ships a playable game; nothing is merged that makes the live game worse. "Gate" is the measurable condition to continue. Sizes are rough (S = days, M = 1 to 2 weeks, L = several weeks, XL = months) and are guesses to be replaced after B0. Status of every row: not started.

| Phase | Name                                                 | Depends on                            | Size | Priority |
| ----- | ---------------------------------------------------- | ------------------------------------- | ---- | -------- |
| B0    | Measure and decide                                   | Phase A item 1                        | S    | 🔴       |
| B1    | Render snapshot boundary                             | B0                                    | M    | 🟡       |
| B2    | WebGPU renderer swap + TSL basics                    | B1                                    | M    | 🟡       |
| B3    | Tiered crowd: instanced VAT horde                    | B2                                    | L    | 🟡       |
| B4    | Unit spatial hash + boids + flow-field events        | B1                                    | M    | 🟢       |
| B5    | Sim in a worker (transferable buffers, optional SAB) | B1, B4                                | L    | 🟢       |
| B6    | Rapier physics, destructibles, vehicle upgrade       | B5                                    | L    | 🟢       |
| B7    | Ragdoll pool with pose matching                      | B3, B6                                | L    | 🟢       |
| B8    | GPU VFX and environment                              | B2                                    | L    | ⚪       |
| B9    | Wave director and modifiers                          | B4                                    | M    | ⚪       |
| B10   | Asset pipeline (Blender, LOD, KTX2)                  | B3                                    | M    | ⚪       |
| B11   | Tauri v2 + Steam                                     | everything else, decision on commerce | L    | ⚪       |

### B0: Measure and decide (🔴)

| Step | Detail                                                                                                                                                    | Output                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1    | Build a repeatable heavy scenario: a spawn command or map with 300, 600 and 1000 marines chasing the squad, camera fixed                                  | a saved map or a debug query flag |
| 2    | Record on the user's machine: F3 FPS, Chrome Performance profile (scripting, rendering, GPU), `renderer.info` (draw calls, triangles, geometries), memory | a table in `docs/worklog/`        |
| 3    | Same scenario on a low-end target (an integrated-GPU laptop) and with the presets Low, Medium, High                                                       | numbers per preset                |
| 4    | Decide: if the frame is GPU bound, B2 and B3 first; if the main thread is sim bound, B4 and B5 first; if skinning is the cost, B3 first                   | a written decision here           |
| Gate | numbers exist; the order of B1 to B5 is chosen from them                                                                                                  |                                   |

### B1: Render snapshot boundary (🟡)

Purpose: make the renderer read flat arrays instead of `GameState` objects, so later steps (instancing, worker) do not touch game logic.

| Step | Detail                                                                                                                                                                                                      | Files                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1    | Define `RenderSnapshot`: typed arrays per kind (units, enemies, vehicles, projectiles) with `x, z, y, yaw, prevX, prevZ, prevYaw, animState, animTime, speed, flags (boss, downed, legless...)` and `count` | new `src/sim/snapshot.ts` (still pure) |
| 2    | Fill it once per fixed step from `GameState` into pre-allocated arrays (grow only by doubling)                                                                                                              | `sim/game.ts`, end of `step`           |
| 3    | Make `GameRenderer` interpolate from the snapshot for the horde; keep reading `GameState` for soldiers, HUD, radar and editor                                                                               | `render/gameRenderer.ts`               |
| 4    | Remove per-frame allocations in the render hot path (the `new THREE.Vector3` / `Quaternion` in `gameRenderer.ts` and `armPose.ts`; check which really run per frame); use module-level scratch objects      | `render/*.ts`                          |
| Gate | 48 tests green; same look and behaviour; `bench:sim` unchanged; fewer allocations in the Chrome memory profile                                                                                              |                                        |

### B2: WebGPU renderer swap + TSL basics (🟡)

| Step | Detail                                                                                                                                             | Files                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1    | Feature-detect `navigator.gpu`; create `WebGPURenderer` from `three/webgpu` (it falls back to a WebGL2 backend by itself); await `renderer.init()` | `gameRenderer.ts`, `menuModel.ts`, `viewModel.ts` |
| 2    | Port the sky dome to a TSL node material (gradient from `positionLocal.y`)                                                                         | `environment.ts`                                  |
| 3    | Check every material in the scene: standard materials, vertex colours, skinned meshes, the darken and tint code in `characters.ts`, `limbSplit.ts` | render folder                                     |
| 4    | Re-check shadows (sun), the 4 flashlights and the 2 point lights; keep the presets working                                                         | `gameRenderer.ts`, `settings.ts`                  |
| 5    | Add a setting "Renderer: Auto / WebGPU / WebGL" for debugging and comparing                                                                        | `settings.ts`, `settingsPanel.ts`                 |
| 6    | Update `vite.config.ts` manual chunks for `three/webgpu` (a bigger chunk; check the size limit)                                                    | `vite.config.ts`                                  |
| Gate | the game looks the same on both backends; F3 numbers compared with B0; no console errors on a browser without WebGPU                               |                                                   |
| Risk | WebGPU in Safari and Firefox is newer; keep the WebGL fallback until the player base is known                                                      |                                                   |

### B3: Tiered crowd, instanced VAT horde (🟡)

| Step | Detail                                                                                                                                                                                                                            | Files                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1    | Baker script: sample each enemy clip (walk, attack, death, crawl) at a fixed frame rate, write positions (and normals) per vertex per frame into a `DataTexture` (RGBA16F), store frame counts per clip in `data/characters.json` | new `scripts/bake-vat.mjs` |
| 2    | Loader for the VAT texture + a light geometry; one `InstancedMesh` per enemy type and LOD                                                                                                                                         | new `src/render/crowd.ts`  |
| 3    | TSL `positionNode` that samples the VAT with `instanceIndex` frame offsets from an instanced attribute; tint and boss scale per instance                                                                                          | `crowd.ts`                 |
| 4    | Per-frame fill of the instance attributes (position, yaw, clip id, clip time) from the B1 snapshot; cull by distance and frustum on the CPU first                                                                                 | `crowd.ts`                 |
| 5    | Promotion and demotion between the crowd and the pooled skinned view (hero tier): near the camera, boss, hit, dismembered, climbing or selected; a hard cap and hysteresis so units do not flicker                                | `gameRenderer.ts`          |
| 6    | Optional: belly jiggle and tentacle waves as TSL nodes using vertex colours (needs B10 for the colour bake, or a hand-painted mask)                                                                                               | `crowd.ts`                 |
| Gate | 1000 marines in the B0 scenario: draw calls drop to about the number of types, frame time better than B0 by the agreed margin; promoted units look identical to today                                                             |                            |
| Risk | the look of the VAT crowd must match the skinned one (tint, lighting); animation blending between clips is cheaper to fake with a crossfade in the shader than to bake                                                            |                            |

### B4: Unit spatial hash, boids and flow-field events (🟢)

| Step | Detail                                                                                                                      | Files                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1    | Unit spatial hash (cell size about 2 m), rebuilt each step with pooled arrays                                               | new `src/sim/unitGrid.ts`                  |
| 2    | Replace the current neighbour checks in `zombies.ts` with hash queries; add separation as a force on top of the flow vector | `sim/zombies.ts`                           |
| 3    | Sample the flow field as a per-cell direction (precomputed gradient) instead of searching neighbours per unit               | `sim/flowfield.ts`                         |
| 4    | Invalidate and update cost on events: obstacle destroyed, door opened or closed, vehicle parked                             | `flowfield.ts`, `vehicles.ts`, later doors |
| Gate | 1000 units go around a wall and a destroyed barricade; `bench:sim` not worse; the 48 tests green                            |                                            |

### B5: Sim in a worker (🟢)

Only if B0 shows the main thread is limited by the sim, or by the sim plus the render together.

| Step | Detail                                                                                                                                                                     | Files                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1    | `SimHost` interface with two implementations: in-thread (today) and worker                                                                                                 | new `src/simHost.ts`                      |
| 2    | Worker entry that owns `GameState`, runs the fixed step and writes the snapshot into one of two transferable buffers (or a `SharedArrayBuffer` when `crossOriginIsolated`) | new `src/sim/worker.ts`                   |
| 3    | Input and commands as a small message queue (orders, shop, perks, pause) instead of direct calls; events (`SimEvent`) copied as compact arrays                             | `main.ts`, `input.ts`, `rts.ts`, `hud.ts` |
| 4    | Everything that reads `GameState` outside the renderer (HUD, radar, squad screen, editor) gets a periodic light "UI state" message at about 10 Hz                          | UI files                                  |
| 5    | Keep the in-thread host for the editor Play and for tests                                                                                                                  |                                           |
| Gate | identical gameplay with a fixed seed; lower main-thread CPU; no stutter on pause, level-up or shop                                                                         |                                           |
| Risk | a large refactor of the UI to async state; [PLAN-multiplayer.md](PLAN-multiplayer.md) wants the same boundary, so design it once for both                                  |                                           |

### B6: Rapier, destructibles, vehicles (🟢)

| Step | Detail                                                                                                              | Files              |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1    | Add `@dimforge/rapier3d` (WASM) inside the sim worker (needs B5) or on the main thread behind the same interface    | new `src/physics/` |
| 2    | Props only first: crates and barrels as dynamic bodies, impulses from grenades and heavy hits, sleeping when idle   | `physics/props.ts` |
| 3    | Destructible crate: swap to pre-fractured instanced debris with a pooled cap                                        | render + physics   |
| 4    | Vehicles: Rapier raycast vehicle with suspension; keep seats, driver input and zombie damage from `sim/vehicles.ts` | `sim/vehicles.ts`  |
| Gate | 100 to 200 dynamic bodies stay under the frame budget; a grenade in a crate stack is stable                         |                    |
| Note | live units stay on the custom 2D collision; Rapier does not drive them                                              |                    |

### B7: Ragdoll pool with pose matching (🟢)

| Step | Detail                                                                                                                                                                                | Files                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1    | A ragdoll rig for the light marine: capsule colliders per main bone, joint limits                                                                                                     | `physics/ragdoll.ts`, asset notes |
| 2    | Bone transform LUT per VAT frame of each clip (10 to 12 bones), produced by the baker                                                                                                 | `scripts/bake-vat.mjs`            |
| 3    | Death swap: hide the instance, claim a ragdoll from a ring of 32 to 48, set the bodies from the LUT frame, apply the kill impulse (reuses the dismemberment force by weapon strength) | `crowd.ts`, `ragdoll.ts`          |
| 4    | Release after about 5 s or low energy: freeze, bake the pose into a static corpse batch or fade out                                                                                   |                                   |
| 5    | Make it coexist with the existing dismemberment (heads and limbs flying off are loose parts today)                                                                                    | `looseParts.ts`                   |
| Gate | explosive kills swap into ragdolls without a visible pop at 60 FPS in the B0 scenario                                                                                                 |                                   |

### B8: GPU VFX and environment (⚪)

Independent pieces, each small; order by visible value after B2.

| Item                     | Detail                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Post-processing          | TSL `pass` + bloom (muzzle flash, grenade, sirens) + AO at half resolution on low presets + tone mapping |
| Soft particles           | depth fade for fire, smoke and flares; replace the CPU fire in `effects.ts`                              |
| Shell casings            | compute-shader brass with a heightmap bounce, one instanced draw                                         |
| Height fog and sandstorm | TSL fog node by world Y, compute streaks                                                                 |
| Grass and wheat          | instanced blades, noise wind, trampling texture from units and vehicles                                  |
| Terrain                  | splat material with distance-blended POM, built on the editor's paint layers                             |
| Water                    | planar reflector + normal maps + depth absorption on the editor's water level                            |
| Trees                    | 3 LODs, instanced, wind phase in vertex colour                                                           |
| Gate per item            | frame time on the low preset stays within budget; every effect has a graphics-settings switch            |

### B9: Wave director and modifiers (⚪)

Extend the existing `waves.ts` and `upgrades.ts` (already JSON-driven): wave budgets, elemental damage, armour penetration and mutation buffs as flags on a unit. Do this on the current object-based sim; only convert to bitmasks if B5 forces SoA. Gate: the existing perks and boss rules still work from JSON.

### B10: Asset pipeline (⚪)

| Step | Detail                                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Headless Blender `process_asset.py`: clean, pivot at base, LOD0/1/2 by Decimate, vertex-colour bake by tag (`zombie_bloated`, `foliage`, `vehicle`) |
| 2    | `optimize_gltf.sh`: `gltf-transform` resize, meshopt, KTX2 (UASTC / ETC1S); register the decoders in `GltfAssetLoader` (today there are none)       |
| 3    | Run it on the current assets first; compare the first-load size against today's 16 MB                                                               |
| 4    | Licence gate: nothing from an AI generator enters `assets.toml` until its terms allow a commercial release                                          |
| Gate | first load measurably smaller; models look the same                                                                                                 |

### B11: Tauri v2 and Steam (⚪)

| Step | Detail                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Tauri shell around the Vite build; set COOP/COEP in the custom protocol so `SharedArrayBuffer` works                                           |
| 2    | `steamworks-rs`: achievements, leaderboards for Waves, cloud saves, later Workshop for maps (the map editor already exports and imports files) |
| 3    | Store page, pricing, EULA, privacy, age rating, crash reporting; all outward-facing, **ask the user before each** (CLAUDE.md section 11)       |
| 4    | Update CLAUDE.md: assets policy, "no backend", tests, hosting                                                                                  |

### Cross-cutting rules for every phase

| Rule                                                                                                                                                           | Why                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| A branch per phase, small PRs the user merges                                                                                                                  | project workflow                        |
| The live game stays playable after each merge; the old renderer path stays until the new one matches                                                           | no regressions for people with the link |
| Read the test output; keep the 48 tests green; add benchmarks (`bench:sim`, a render scenario) instead of new unit tests unless the user changes that decision | the user dropped new tests              |
| Graphics settings and presets for every new effect                                                                                                             | integrated-GPU target                   |
| Update CONTROLS.md, README, LASTCONTEXT.md, PENDING.md and a worklog entry per phase                                                                           | project rules                           |
| Performance claims stay labelled as unverified until B0 numbers exist                                                                                          | the sim bench is the only real number   |
