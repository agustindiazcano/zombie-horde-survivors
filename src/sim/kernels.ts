/**
 * Hot loops of the simulation as pure functions over flat typed arrays: no objects, no closures, no
 * allocation per call. The game gathers the numbers it needs into arrays, calls a kernel and writes the
 * results back. The point is a stable, copy-friendly shape that the Rust copy (`crates/sim-core`) can
 * match bit for bit: only `+ - * /`, `sqrt`, `min`, `max`, `floor` inside, the same order of iteration.
 * See docs/PLAN-rust-architecture.md.
 */

/** Side (metres) of a grid cell; the same as `CELL` in grid.ts. */
export const KERNEL_CELL = 4;

/** Reusable buffers of the separation kernel (grown when the zombie count grows). */
export interface SeparationScratch {
  head: Int32Array;
  next: Int32Array;
}

export const newSeparationScratch = (): SeparationScratch => ({
  head: new Int32Array(0),
  next: new Int32Array(0),
});

const cellOf = (half: number, n: number, v: number): number =>
  Math.min(Math.max(Math.floor((v + half) / KERNEL_CELL), 0), n - 1);

/**
 * Pushes overlapping circles apart. `x`, `z` are positions (updated in place), `radius` the radii and
 * `alive[i] === 0` leaves a body out. Bodies are filed in a grid by their position at the start; each
 * pair (i, j > i) that overlaps is moved half the overlap each, in ascending order, so a body's later
 * pairs see its earlier pushes. `half` is the arena's half size and `widest` the biggest living radius.
 */
export function separate(
  s: SeparationScratch,
  x: Float64Array,
  z: Float64Array,
  radius: Float64Array,
  alive: Uint8Array,
  count: number,
  half: number,
  widest: number,
): void {
  const n = Math.ceil((half * 2) / KERNEL_CELL) + 1;
  if (s.head.length < n * n) s.head = new Int32Array(n * n);
  if (s.next.length < count) s.next = new Int32Array(count);
  const head = s.head;
  const next = s.next;
  head.fill(-1, 0, n * n);
  for (let i = count - 1; i >= 0; i--) {
    if (alive[i] === 0) continue;
    const cell = cellOf(half, n, z[i]!) * n + cellOf(half, n, x[i]!);
    next[i] = head[cell]!;
    head[cell] = i;
  }
  for (let i = 0; i < count; i++) {
    if (alive[i] === 0) continue;
    const ri = radius[i]!;
    const range = Math.ceil((ri + widest) / KERNEL_CELL);
    const cx = cellOf(half, n, x[i]!);
    const cz = cellOf(half, n, z[i]!);
    const z0 = Math.max(cz - range, 0);
    const z1 = Math.min(cz + range, n - 1);
    const x0 = Math.max(cx - range, 0);
    const x1 = Math.min(cx + range, n - 1);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        for (let j = head[gz * n + gx]!; j !== -1; j = next[j]!) {
          if (j <= i) continue;
          const minDist = ri + radius[j]!;
          let dx = x[j]! - x[i]!;
          let dz = z[j]! - z[i]!;
          const d2 = dx * dx + dz * dz;
          if (d2 >= minDist * minDist) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-6) {
            // Exactly stacked: separate along +x so the result stays deterministic.
            dx = 1;
            dz = 0;
            d = 1;
          }
          const push = (minDist - Math.sqrt(d2)) / 2;
          const nx = dx / d;
          const nz = dz / d;
          x[i] = x[i]! - nx * push;
          z[i] = z[i]! - nz * push;
          x[j] = x[j]! + nx * push;
          z[j] = z[j]! + nz * push;
        }
      }
    }
  }
}
