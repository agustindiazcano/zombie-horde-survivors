# 2026-11-01 — The physics inside the author's engine demos (`game-engine/`, not in git)

Read to answer "what did the author's earlier versions say, and does `world.ts` match them". Only the parts named below were read; the other demos (`ai_studio_code (2)`, `(3)`, `(4)`, the "motor atmosferico" files and the horde sandboxes) were only searched by keyword. Nothing here changes code.

## 1. The files

| File (in `game-engine/`)                                                | Title                                                         | Physics inside                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `ai_studio_code.html`                                                   | Engine v1.0, golden vortex and beach                          | not read                                                                           |
| `ai_studio_code (1).html`                                               | v2.0, O(1) Hooke collisions and sub-Planckian space           | **Read.** Source of `world.ts` and of technique 8 (map 2: planets and a ship)      |
| `ai_studio_code (2).html` to `(4).html`                                 | v3.0 to v5.0, ocean, POM, SSR, acoustics + "O(1) physics"     | keyword search only                                                                |
| `ai_studio_code (5).html`, `testmar.html`                               | v5.1 and v5.2                                                 | **Read** `stepUnifiedPhysics`: the physics of the latest demo                      |
| `diaz_cano_engine_3d_vfx_toaster_optimization_sandbox*.html`            | SDF powers, 1000-horde lab; 32 768 horde, base defence        | not read (the horde is relevant to the zombie speed question)                      |
| `motor_atmosferico_y_oceano_ligero_3d*.html`, `gemini-code-*.html`      | atmosphere and ocean demos                                    | not read                                                                           |
| `tests/physics-lab-diaz-cano-vs-euler.html` (in git)                    | Physics Lab Benchmark                                         | **Read in full.** The position-based unified solver; see PHYSICS.md section 5      |

## 2. What the earlier demos do (v2.0, `stepMap1Physics`) against the benchmark page

| Point                    | v2.0 demo                                                                                          | Benchmark page (PHYSICS.md section 5)                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Sub-steps                | 2                                                                                                  | 3                                                                       |
| Gravity (name, value)    | `GRAVEDAD_EMPUJE` 24, "pressure of the sub-Planckian sea"; `vy -= g*sDt`                           | `gravity` 24, `v_y -= g h`                                              |
| Air drag                 | `v *= 1 - 0.08 sDt`                                                                                | `airDrag` 0.02                                                          |
| Contact separation       | position push `overlap * 0.52` each, equal split, no masses                                       | `overlap / (w_a + w_b + 1/(k h²))`, mass weighted                       |
| Contact velocity         | **impulse**: `-(1 + e) v_n * 0.5 + K_HOOKE * overlap * sDt * 0.25` with `e = 1 - 0.273`            | none; `v = (x - x_old)/h` plus owed bounce above 1.5 m/s                |
| `K_HOOKE`                | **420**                                                                                            | **100 000** (as compliance `1/(k h²)`)                                  |
| Friction                 | none on contacts; ground multiplies horizontal speed by 0.92                                       | Coulomb on the displacement, `mu` 0.8                                   |
| Ground bounce            | `v_y = -v_y (1 - 0.273 * 1.6)` (0.563)                                                             | `-v_y * 0.727` above 1.5 m/s                                            |
| Walls                    | clamp at 66 m, speed `* -0.6`                                                                      | clamp at 18 m, speed zeroed by the pull-back                            |
| Bones                    | position correction `0.45 * (d - rest)/d` **and** a Hooke velocity `k (d - rest) sDt` on the same bone | position only (the repo noted both together oscillate)               |
| Sleep, pair cache        | none; `headBucket.fill(-1)` every sub-step; hash searched inside the loop                          | dirty buckets, pair cache, sleep                                        |
| Blast                    | `380 (1 - d/24) / (d + 0.25)`, away with `abs(dy)` and `+ 18` lift                                 | `blastPower 320`, `R` 15, lift `18 (1 - d/R)` (scaled by the fall-off)  |

So the benchmark page is a **later formulation** than every demo in `game-engine/` that was read: the demos use impulse hybrids with `K_HOOKE = 420`; the all-position solver with `k = 100 000` appears only in the benchmark page. The repo's `world.ts` came from the v2.0 demo "corrected where it did not hold up" (PLAN-physics-lab.md), and is now closer to the page (PHYSICS.md 5.8).

## 3. The latest demo's physics (v5.1 / v5.2, `stepUnifiedPhysics`)

| Rule             | Formula (read in `ai_studio_code (5).html`, lines 1329 to 1440)                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gravity          | `vy -= gravityPush * dt` (explicit Euler), `gravityPush` a slider                                                                                                      |
| Buoyancy         | `submerged = (waterY + 0.35 r) - y`; `subRatio = min(submerged/(2r), 1.6)`; `vy += gravityPush * 2.35 * subRatio * dt`; `vy *= max(0, 1 - 0.273 * 9.5 * dt)`; flow drag `3.8 dt` |
| Out of water     | `v *= 1 - 0.08 dt`                                                                                                                                                     |
| Geyser           | if `vortexStrength > 0.2`, `dx² + dz² < 13` and `y < -8`: `vy = 36 * strength`, sideways `+- 9` from `Math.random`                                                      |
| Beach            | `y = sandY + r`, `vy = -vy * 0.55`, horizontal `* 0.92`                                                                                                                 |
| Bones            | `0.45 * (d - rest)/d` position correction                                                                                                                              |
| Contacts         | `overlap * 0.52` each way, then velocity impulse `-(1 + 0.727) v_n * 0.5 + 140 * overlap * dt` (here the Hooke term is 140, not 420)                                    |
| Blast            | `420 (1 - d/R) / (d + 0.25)`                                                                                                                                           |
| Vortex           | funnel `-20 s / (1 + (r/14.5)^1.65 + 0.25)`; `v_tan = 28 s / sqrt(sqrt(r² + 32))`; `v_rad = v_tan K_SPIRAL 1.35` (the repo's `ocean.ts` repeats these)                     |

Differences from what the repo ported (PHYSICS.md rows 14 to 18 of section 8): the repo's geyser is `(14 + 8 s) geyser` with `rn < 6` and deeper than 5 m, from a different version; the demo's geyser uses `Math.random`, which `src/sim` cannot.

## 4. Technique 8 as the author wrote it (v2.0, `stepMap2Space`, lines 826 to 840)

```
epsSq    = (1 / SATURACION_VL) * 25        = 100          (SATURACION_VL = 0.25)
push_p   = MASS_p / (dist_p² + epsSq)                      (per planet p)
a        = sum_p  unit(planet_p - ship) * push_p           (the "net push")
shipVel += a * dt                                           (explicit Euler)
shipVel *= 1 - 0.08 * dt
```

Comment in the demo: "Ley 3 de Diaz-Cano: Arquimedes inverso, `F_g = -grad(P_ext) * Omega_obj / (r² + eps_VL²)`". Planet 1: radius 42, mass 26 000; planet 2: radius 62, mass 48 000; ship radius 2.2; thrust 48; on touching a planet: put the ship on the crust, reflect the normal speed by `1.35`, then `* 0.92`.

**This is not the law confirmed in the message of 2026-11-01** (`a = sum d_hat G M / (d + 0.25)`). They differ in the denominator: `d² + 100` (a softening length of 10 m, from `25 / 0.25`) against `d + 0.25`. For a ship at 100 m from planet 1 the first gives `26 000 / 10 100` = 2.6 m/s²; the second, with `G = 1`, `26 000 / 100.25` = 259 m/s². The two cannot both be technique 8; PHYSICS.md section 8 (rows 11 and 12) records the confirmed one and this section records the demo's. **Question for the author:** which is the law the engine should use (or one for planets and one for blasts)? Until he answers, `gravityAt` is not built.

The blast (`380 / (d + 0.25)`) uses the 0.25 directly in the denominator, so the "same saturation" idea is true for the blast and the funnel but the planet law in the demo uses `d² + eps²` with `eps² = 100`.

## 5. Gaps this leaves in the plan

| Gap                                                                                                       | Where it goes                                                       |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Which gravity law (demo `M/(d²+100)` or the message's `G M/(d+0.25)`)                                      | PLAN-new-physics.md phase 5, PHYSICS.md section 9                   |
| `ai_studio_code (2)` to `(4)` and the horde sandboxes not read                                             | Read before the Rust port; the horde may hold the zombie speed idea |
| The benchmark page's origin: none of the demos searched has its position-based solver (a keyword search of `(2)` to `(4)` found no `100000`)                       | Ask the author (which tool or session made it)                      |
| `world.ts` bones still use the demo's `0.85` stiffness per pass, not the demo's `0.45`                     | Retune live, or copy the demo; not decided                          |
