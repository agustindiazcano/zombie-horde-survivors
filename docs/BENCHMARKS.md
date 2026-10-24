# Benchmarks (Rust against TypeScript, the simulation, the physics)

The numbers of the repo's own benchmarks and checks, in tables. Raw outputs: [docs/benchmarks/](benchmarks/). Method and plans: [PLAN-rust-architecture.md](PLAN-rust-architecture.md), [PLAN-rust-wasm.md](PLAN-rust-wasm.md).

## 1. How these were run

| Run                | Where                                                                                                                                                                                                       | Why it matters                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **GitHub runners** | Branch `bench/rust-vs-ts`, workflow `.github/workflows/bench.yml` (run `40028624488`, 2026-10-23), Linux (AMD EPYC 9V74, 4 cores) and Windows (AMD EPYC 7763, 4 cores), Node 22, each timing script 3 times | Quiet machines: the three runs differ by under 2% (the author's PC varied by up to 40%). The reference |
| The author's PC    | Windows 11, no GPU, other programs open (dev server, editor), Node 24                                                                                                                                       | Noisy; used only as a second opinion                                                                   |

To run again: `git push origin HEAD:bench/<name>` (the workflow runs on pushes to `bench/**`, never on `main`), then `gh run watch` and `gh run download`.

## 2. Determinism: the same numbers on every machine

| Check                                           | Linux runner | Windows runner | Author's PC | Same? |
| ----------------------------------------------- | ------------ | -------------- | ----------- | ----- |
| `check:sim-hash` (whole simulation)             | `02a0a498`   | `02a0a498`     | `02a0a498`  | ✅    |
| `check:rapier` (Rapier lab)                     | `65505486`   | `65505486`     | `65505486`  | ✅    |
| `bench:physics` own solver, same run twice      | `131015085`  | `131015085`    | (not run)   | ✅    |
| `bench:physics` Rapier, same run twice          | `137794019`  | `137794019`    | `137794019` | ✅    |
| `check:ocean-wasm` largest TS / Rust difference | 2.14e-13 m   | 2.14e-13 m     | 2.14e-13 m  | ✅    |

The simulation and the physics are bit-identical across Linux, Windows and the author's PC: the base for lockstep multiplayer.

## 3. Rust against TypeScript: the flat kernels (bit-identical results)

`npm run check:kernels`, ms per call, best of 3 runs of 200 calls. "Rust" is the variant that works in the module's own memory. Every size gave 0 differing bits. The ratio is TypeScript time divided by Rust time (above 1 means Rust is faster).

### Separation of overlapping bodies (a dense crowd)

| Bodies | Linux TS | Linux Rust | Linux ratio | Windows TS | Windows Rust | Windows ratio |
| ------ | -------- | ---------- | ----------- | ---------- | ------------ | ------------- |
| 100    | 0.017    | 0.011      | 1.5x        | 0.022      | 0.013        | 1.7x          |
| 300    | 0.069    | 0.040      | 1.7x        | 0.103      | 0.053        | 1.9x          |
| 1 000  | 0.373    | 0.155      | 2.4x        | 0.481      | 0.351        | 1.4x          |
| 2 000  | 0.925    | 0.697      | 1.3x        | 1.088      | 0.837        | 1.3x          |
| 5 000  | 3.081    | 2.455      | 1.3x        | 3.539      | 2.745        | 1.3x          |
| 10 000 | 9.325    | 7.533      | 1.2x        | 10.800     | 8.060        | 1.3x          |

### Flow field search (Dijkstra with a heap, 5 targets)

| Grid      | Linux TS | Linux Rust | Linux ratio | Windows TS | Windows Rust | Windows ratio |
| --------- | -------- | ---------- | ----------- | ---------- | ------------ | ------------- |
| 80 x 80   | 0.574    | 0.355      | 1.6x        | 0.763      | 0.508        | 1.5x          |
| 160 x 160 | 3.051    | 2.301      | 1.3x        | 3.598      | 2.590        | 1.4x          |
| 320 x 320 | 14.529   | 10.587     | 1.4x        | 17.501     | 12.337       | 1.4x          |

**Does Rust win more as the problem grows?** On quiet machines, **no**: the ratio is between 1.2x and 2.4x and does not grow with the size; if anything it shrinks (separation from about 1.7x at a few hundred bodies to 1.2x to 1.3x at 10 000, where the data stops fitting in the cache and both versions wait for memory). An earlier reading on the author's noisy PC suggested the flow field ratio grew from 1.3x to 1.6x; the runners show it does not. Both versions do the same operations, so the ratio is a constant factor of the code, not of the size. The absolute saving does grow (10 000 bodies: 1.8 ms of 9.3 ms; 320 x 320 grid: 4 ms of 14.5 ms), but a constant 1.3x to 1.5x is the realistic expectation for scalar Rust against V8's JIT on this kind of code; more needs SIMD, threads or a better algorithm.

## 4. Rust against TypeScript: the ocean (`sin` / `pow` heavy)

`npm run check:ocean-wasm`, 20 000 points repeated 20 times, ms (400 000 evaluations), three runs on each runner (they agree within 2%).

| Case                       | Linux TS | Linux Rust | Linux Rust batch | Windows TS | Windows Rust | Windows Rust batch |
| -------------------------- | -------- | ---------- | ---------------- | ---------- | ------------ | ------------------ |
| golden (game.json)         | 320      | 320        | 316              | 441        | 420          | 404                |
| jonswap, wind              | 321      | 308        | 302              | 439        | 415          | 403                |
| golden, whirlpools         | 504      | 535        | 531              | 665        | 717          | 687                |
| jonswap, frozen, whirlpool | 387      | 386        | 381              | 518        | 507          | 498                |

On the runners the Rust ocean is **even with the TypeScript** (within +/- 8%), and slower where the whirlpool maths (`atan2`, `exp`, `pow`) dominates. On the author's noisy PC it looked 1.4x slower; that was noise and load. The conclusion stands: porting a formula that is mostly `sin` / `pow` does not speed it up, it only gives the same numbers everywhere. TypeScript against Rust differ by at most 2.14e-13 m (not bit-identical, because `sin`, `pow` and `exp` differ in the last bits).

## 5. The simulation step (`bench:sim`, ms per step, 60 Hz allows 16.7)

Zombies chasing an unkillable squad on Map 1. The Rust kernels are **not** wired into the game, so this is the TypeScript sim (with the flat kernels in TypeScript).

| Zombies | Linux (3 runs) | Windows (3 runs) | Author's PC (noisy) |
| ------- | -------------- | ---------------- | ------------------- |
| 100     | 0.35 - 0.37    | 0.53 - 0.65      | 0.53 - 0.71         |
| 300     | 0.52 - 0.53    | 0.69 - 0.73      | 0.71 - 1.19         |
| 600     | 0.90 - 0.92    | 1.25 - 1.29      | 1.40 - 1.98         |
| 1 000   | 1.54 - 1.56    | 2.11 - 2.12      | 2.27 - 4.67         |

With 1000 zombies the step takes about 9% (Linux) to 13% (Windows) of a frame. The profile of where it goes is in [PLAN-rust-architecture.md](PLAN-rust-architecture.md) section 1.

## 6. Physics (`bench:physics`, ms per step)

| Bodies | Own solver, balls (Linux) | Own solver, balls (Windows) | Rapier balls (Linux) | Rapier balls (Windows) | Rapier boxes (Linux) | Rapier boxes (Windows) |
| ------ | ------------------------- | --------------------------- | -------------------- | ---------------------- | -------------------- | ---------------------- |
| 100    | 0.14                      | 0.19                        | 0.45                 | 0.46                   | 0.42                 | 0.55                   |
| 300    | 0.43                      | 0.65                        | 0.43                 | 0.65                   | 1.53                 | 1.98                   |
| 600    | 1.07                      | 1.62                        | 0.91                 | 1.34                   | 3.35                 | 4.46                   |
| 1 000  | 2.21                      | 2.93                        | 1.51                 | 2.05                   | 6.43                 | 8.70                   |

Rapier (already Rust compiled to WASM) beats the own TypeScript solver from about 600 balls up, and is the only one with boxes. Ragdoll: 11 joints, 13 bones, at rest after 1.90 s, worst bone stretch 4.3%, the same on both. The Rapier pyramid of 91 boxes holds (top box moved 0.029 m in 10 s).

## 7. What the numbers say

| #   | Finding                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Determinism is solid: the same hashes on Linux, Windows and the author's PC                                                                   |
| 2   | Scalar Rust is a constant 1.2x to 2.4x faster than V8's JIT on pure-arithmetic kernels, bit-identical, and not faster on `sin` / `pow` code   |
| 3   | The ratio does not grow with the problem size (it shrinks when memory becomes the limit)                                                      |
| 4   | A 1000-zombie step is 9% to 13% of a frame; wiring the Rust kernels would save about 0.1 ms. Not wired                                        |
| 5   | The next real gains are structural: SIMD, threads, or fewer cells and bodies searched; and the GPU side, which no CPU benchmark here measures |

## 8. With the Rust kernels in the game (run `40033238294`, branch `bench/rust-wired`, 2026-10-23)

The game now runs the Rust separation and flow field kernels (rule decided by the user: whatever is equal or better in Rust on the GitHub runners moves to Rust). Raw outputs: [benchmarks/2026-10-23-rust-wired/](benchmarks/2026-10-23-rust-wired/).

| Check                                         | Linux                             | Windows                           |
| --------------------------------------------- | --------------------------------- | --------------------------------- |
| `check:sim-hash` with TypeScript kernels      | `02a0a498`                        | `02a0a498`                        |
| `check:sim-hash` with Rust kernels            | `02a0a498`                        | `02a0a498`                        |
| Calls the Rust kernels served in the scenario | 720 separations, 45 flow searches | 720 separations, 45 flow searches |

`bench:sim`, 1000 zombies, ms per step, three runs each, same machine and same run:

| Kernels    | Linux            | Windows          |
| ---------- | ---------------- | ---------------- |
| TypeScript | 2.06, 2.06, 2.10 | 2.72, 2.08, 2.08 |
| Rust       | 2.03, 2.09, 2.06 | 2.09, 2.02, 2.05 |

The full step is **level** (the Rust kernels are faster alone, 1.2x to 2.4x, but separation and flow field are only about 15% of the step), and the result is bit-identical. The ocean stays in TypeScript (section 4: level at best, 6% to 8% slower with whirlpools, not bit-identical).

## 9. Flat obstacles and the wall kernel (run `40042535443`, branch `bench/rust-walls-3`, 2026-10-23)

Layer B of [PLAN-rust-architecture.md](PLAN-rust-architecture.md): the obstacles as flat arrays plus a CSR grid (`flatObstacles`), the wall collision as a batch kernel (`resolveWalls`) in TypeScript and Rust, and the scalar `resolveStatic` running on the same flat grid for every caller. Bit for bit identical to the original per-body version in all four scenes (`check:kernels`) and the simulation hash is unchanged (`02a0a498`, TypeScript and Rust kernels). Raw outputs: [benchmarks/2026-10-23-rust-walls/](benchmarks/2026-10-23-rust-walls/).

### The kernel alone (ms per call, 3 runs agree within 3%)

| Scene                 | Linux original | Linux flat TS | Linux Rust | Windows original | Windows flat TS | Windows Rust |
| --------------------- | -------------- | ------------- | ---------- | ---------------- | --------------- | ------------ |
| Map 1, 1000 bodies    | 0.221          | 0.031         | 0.028      | 0.241            | 0.031           | 0.028        |
| 60 boxes, 1000 bodies | 0.243          | 0.031         | 0.031      | 0.272            | 0.035           | 0.028        |
| 400 boxes, 1000       | 0.420          | 0.044         | 0.041      | 0.447            | 0.045           | 0.040        |
| 400 boxes, 5000       | 2.179          | 0.390         | 0.324      | 2.343            | 0.400           | 0.325        |

The flat layout alone is **5.6x to 9.9x faster** than the original (objects, a `Map` of stamps and arrays of arrays); Rust adds only 1.0x to 1.25x on top. The gain comes from the data layout, not from the language.

### The full step against the code before the Rust work, on the same machine (`bench:sim`, 1000 zombies, ms per step)

| Code                                                        | Linux (3 runs)   | Windows (3 runs) |
| ----------------------------------------------------------- | ---------------- | ---------------- |
| Before the Rust work (`e192428`)                            | 2.21, 2.21, 2.23 | 2.28, 2.39, 2.29 |
| `main` after PR 62 (flat separation and flow field kernels) | 1.98, 1.98, 2.14 | 2.03, 2.12, 2.12 |
| This branch, TypeScript kernels                             | 1.73, 1.76, 1.77 | 1.77, 1.77, 1.79 |
| This branch, Rust kernels                                   | 1.68, 1.70, 1.70 | 1.74, 1.75, 1.77 |

The simulation step is **about 23% (Linux) to 25% (Windows) faster than before the work** (2.2 ms to 1.7 ms with 1000 zombies; 600 zombies 1.23 to 1.02 ms). Almost all of it comes from the flat TypeScript layout; the Rust kernels add 2% to 4% on top. That agrees with the prediction of the architecture plan: the data layout first, Rust second.

### After the flat neighbour loop and the allocation-free `nearestTarget` (run `40043757307`, branch `bench/rust-walls-4`, 2026-10-24)

Two changes with the same bits (hash `02a0a498`): `nextWaypoint` reads flat neighbour arrays instead of destructuring `[dx, dz, step]` arrays (7.7% of the profile down to 1.9%), and `nearestTarget` reuses one result object instead of making one per zombie per step (the garbage collector left the top of the profile). Raw outputs: [benchmarks/2026-10-24-sim-step/](benchmarks/2026-10-24-sim-step/).

`bench:sim`, 1000 zombies, ms per step, same machine per system, three runs:

| Code                             | Linux            | Windows          |
| -------------------------------- | ---------------- | ---------------- |
| Before the Rust work (`e192428`) | 2.24, 2.14, 2.20 | 2.02, 1.99, 2.03 |
| `main` after PR 62               | 2.05, 1.94, 1.98 | 2.08, 2.26, 2.05 |
| This branch, TypeScript kernels  | 1.53, 1.56, 1.52 | 1.50, 1.64, 1.67 |
| This branch, Rust kernels        | 1.50, 1.52, 1.48 | 1.56, 1.61, 1.61 |

Against the code before the Rust work the step is now **31% faster on Linux** and **20% faster on Windows**; the Rust kernels add 2% to 3% over the TypeScript ones. (Absolute times differ between the two runs of the workflow because GitHub gives a different virtual machine each time; compare only inside one run.)

## 10. The simulation's own deterministic maths, and the Rust ocean (run `40048008881`, branch `bench/dmath`, 2026-10-24)

`src/sim/dmath.ts` (and `crates/sim-core/src/dmath.rs`): the sim's own `sin`, `cos`, `atan2`, `exp`, `log` and `pow`, from the fdlibm algorithms, only `+ - * /` and the bits of a double; `hypot` and `hypot3` in `vec.ts`. `src/sim` no longer calls `Math.sin` and friends (a lint rule forbids it). Raw outputs: [benchmarks/2026-10-24-dmath/](benchmarks/2026-10-24-dmath/).

| Function              | Equal to V8's `Math.*` | Worst difference from V8            | TypeScript against Rust |
| --------------------- | ---------------------- | ----------------------------------- | ----------------------- |
| `sin`, `cos`          | 100% of 1 000 000 each | 0 ulps                              | bit for bit identical   |
| `atan2`, `exp`, `log` | 100% of 1 000 000 each | 0 ulps                              | bit for bit identical   |
| `pow`                 | 90% of 1 000 000       | 1 ulp (the rest equal within 1 ulp) | bit for bit identical   |
| `hypot`, `hypot3`     | 100% of 2 000 000      | 0 ulps                              | bit for bit identical   |

Because five of the six reproduce V8's results exactly and `pow` is within one bit, no golden hash changed: simulation `02a0a498`, Rapier `65505486`, own solver `131015085`. The standard Rust maths, for comparison, differs from V8 in 0.9% (`sin`, `cos`), 0.4% (`ln`) and 9.8% (`pow`) of inputs ([PLAN-rust-architecture.md](PLAN-rust-architecture.md) section 8).

### The ocean, now identical in both languages

`npm run check:ocean-wasm`: 8 ocean set-ups x 20 000 points, now **0 difference** (it was 2e-13 m with the standard maths), on both systems. ms for 400 000 evaluations:

| Case               | Linux TypeScript | Linux Rust | Windows TypeScript | Windows Rust |
| ------------------ | ---------------- | ---------- | ------------------ | ------------ |
| golden (game.json) | 920              | 421        | 873                | 380          |

Rust is about **2.2x faster** than the TypeScript with the new maths (the TypeScript got slower than the old native `Math.sin` and `Math.pow`, 320 ms before), and bit-identical, so by the rule (equal or better on the GitHub runners moves to Rust) the ocean is now **wired to Rust** (`useOceanBackend`), with TypeScript as the fallback.

### The full step (`bench:sim`, 1000 zombies, ms per step, same machine, three runs)

| Code                             | Linux            | Windows          |
| -------------------------------- | ---------------- | ---------------- |
| Before the Rust work (`e192428`) | 2.36, 2.26, 2.29 | 2.06, 2.05, 2.06 |
| `main` after PR 62               | 2.07, 2.00, 2.00 | 2.09, 1.99, 1.99 |
| This branch, TypeScript kernels  | 1.54, 1.54, 1.52 | 1.49, 1.46, 1.49 |
| This branch, Rust kernels        | 1.48, 1.51, 1.45 | 1.48, 1.47, 1.52 |

The new maths did not slow the step (the hot paths use `atan2` and `hypot`, which cost the same): **33% to 36% faster than before the work on Linux, 28% on Windows**.
