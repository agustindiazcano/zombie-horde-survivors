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
