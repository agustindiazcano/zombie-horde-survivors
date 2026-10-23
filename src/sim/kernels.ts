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

/** Cell neighbours of the flow field: dx, dz and the cost of the step (flat, same order as flowfield.ts). */
const FLOW_DX = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1]);
const FLOW_DZ = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1]);
const FLOW_STEP = new Float64Array([1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2]);

/** The binary heap of the flow field search (grown when needed, reused between searches). */
export interface FlowScratch {
  cost: Float64Array;
  cell: Int32Array;
  size: number;
}

export const newFlowScratch = (): FlowScratch => ({
  cost: new Float64Array(1024),
  cell: new Int32Array(1024),
  size: 0,
});

function heapPush(h: FlowScratch, cost: number, cell: number): void {
  if (h.size === h.cost.length) {
    const cc = new Float64Array(h.size * 2);
    cc.set(h.cost);
    h.cost = cc;
    const ce = new Int32Array(h.size * 2);
    ce.set(h.cell);
    h.cell = ce;
  }
  let i = h.size++;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (h.cost[parent]! <= cost) break;
    h.cost[i] = h.cost[parent]!;
    h.cell[i] = h.cell[parent]!;
    i = parent;
  }
  h.cost[i] = cost;
  h.cell[i] = cell;
}

/** Removes the cheapest entry; the caller reads it from slot 0 first. */
function heapPop(h: FlowScratch): void {
  const size = --h.size;
  if (size === 0) return;
  const lastCost = h.cost[size]!;
  const lastCell = h.cell[size]!;
  let i = 0;
  for (;;) {
    let child = 2 * i + 1;
    if (child >= size) break;
    if (child + 1 < size && h.cost[child + 1]! < h.cost[child]!) child++;
    if (h.cost[child]! >= lastCost) break;
    h.cost[i] = h.cost[child]!;
    h.cell[i] = h.cell[child]!;
    i = child;
  }
  h.cost[i] = lastCost;
  h.cell[i] = lastCell;
}

/**
 * Fills `dist` (n x n cells) with the walking distance from every free cell to the nearest of the
 * `targets` cells: Dijkstra over 8 neighbours, diagonals cost sqrt 2 and may not cut a corner, a cell
 * of kind 1 is a wall, `extra` is added to the cost of entering a cell (breakable structures).
 */
export function flowSearch(
  h: FlowScratch,
  n: number,
  cells: Uint8Array,
  extra: Float32Array,
  dist: Float64Array,
  targets: Int32Array,
  targetCount: number,
): void {
  dist.fill(Infinity);
  h.size = 0;
  for (let t = 0; t < targetCount; t++) {
    const c = targets[t]!;
    if (dist[c] === 0) continue;
    dist[c] = 0;
    heapPush(h, 0, c);
  }
  while (h.size > 0) {
    const cost = h.cost[0]!;
    const cell = h.cell[0]!;
    heapPop(h);
    if (cost > dist[cell]!) continue; // a cheaper way to this cell was already found
    const cx = cell % n;
    const cz = (cell - cx) / n;
    for (let k = 0; k < 8; k++) {
      const dx = FLOW_DX[k]!;
      const dz = FLOW_DZ[k]!;
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const next = nz * n + nx;
      if (cells[next] === 1) continue;
      // No cutting a corner: both cells beside a diagonal step must be free.
      if (dx !== 0 && dz !== 0 && (cells[cz * n + nx] !== 0 || cells[nz * n + cx] !== 0)) continue;
      const total = cost + FLOW_STEP[k]! + extra[next]!;
      if (total < dist[next]!) {
        dist[next] = total;
        heapPush(h, total, next);
      }
    }
  }
}
