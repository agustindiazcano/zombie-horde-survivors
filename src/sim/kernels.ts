/**
 * Hot loops of the simulation as pure functions over flat typed arrays: no objects, no closures, no
 * allocation per call. The game gathers the numbers it needs into arrays, calls a kernel and writes the
 * results back. The point is a stable, copy-friendly shape that the Rust copy (`crates/sim-core`) can
 * match bit for bit: only `+ - * /`, `sqrt`, `min`, `max`, `floor` inside, the same order of iteration.
 * See docs/PLAN-rust-architecture.md.
 */

import type { Arena } from './config';
import { OBSTACLE_HEIGHT } from './constants';

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

/**
 * The obstacles of an arena as flat arrays plus a uniform grid in CSR form: the cell `c` holds the
 * obstacle indices `cellItems[cellStart[c] .. cellStart[c + 1]]`, in obstacle order (the same order
 * `obstaclesNear` in grid.ts visits them). `top` is `topOf`: infinite for water and cliffs.
 */
export interface FlatObstacles {
  /** Changes whenever a new set is built, so the Rust side knows when to take a new copy. */
  id: number;
  n: number;
  half: number;
  count: number;
  x: Float64Array;
  z: Float64Array;
  halfW: Float64Array;
  halfD: Float64Array;
  top: Float64Array;
  cellStart: Int32Array;
  cellItems: Int32Array;
  /** The last query that met each obstacle, so a box in several cells is met once (TypeScript only). */
  seen: Uint32Array;
  stamp: number;
}

let flatId = 0;
const flatCache = new WeakMap<Arena['obstacles'], FlatObstacles>();

/** The flat copy of `arena.obstacles`, built once per obstacle list (the sim replaces the list when it changes). */
export function flatObstacles(arena: Arena): FlatObstacles {
  const list = arena.obstacles;
  const cached = flatCache.get(list);
  if (cached && cached.count === list.length && cached.half === arena.halfSize) return cached;
  const half = arena.halfSize;
  const n = Math.ceil((half * 2) / KERNEL_CELL) + 1;
  const count = list.length;
  const o: FlatObstacles = {
    id: ++flatId,
    n,
    half,
    count,
    x: new Float64Array(count),
    z: new Float64Array(count),
    halfW: new Float64Array(count),
    halfD: new Float64Array(count),
    top: new Float64Array(count),
    cellStart: new Int32Array(n * n + 1),
    cellItems: new Int32Array(0),
    seen: new Uint32Array(count),
    stamp: 0,
  };
  const range = new Int32Array(count * 4);
  const perCell = new Int32Array(n * n);
  for (let b = 0; b < count; b++) {
    const box = list[b]!;
    o.x[b] = box.x;
    o.z[b] = box.z;
    o.halfW[b] = box.halfW;
    o.halfD[b] = box.halfD;
    o.top[b] = box.water ? Infinity : (box.height ?? OBSTACLE_HEIGHT);
    const x0 = cellOf(half, n, box.x - box.halfW);
    const x1 = cellOf(half, n, box.x + box.halfW);
    const z0 = cellOf(half, n, box.z - box.halfD);
    const z1 = cellOf(half, n, box.z + box.halfD);
    range[b * 4] = x0;
    range[b * 4 + 1] = x1;
    range[b * 4 + 2] = z0;
    range[b * 4 + 3] = z1;
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) perCell[cz * n + cx]!++;
  }
  for (let c = 0; c < n * n; c++) o.cellStart[c + 1] = o.cellStart[c]! + perCell[c]!;
  o.cellItems = new Int32Array(o.cellStart[n * n]!);
  const fill = o.cellStart.slice(0, n * n);
  for (let b = 0; b < count; b++) {
    for (let cz = range[b * 4 + 2]!; cz <= range[b * 4 + 3]!; cz++)
      for (let cx = range[b * 4]!; cx <= range[b * 4 + 1]!; cx++) {
        const c = cz * n + cx;
        o.cellItems[fill[c]!] = b;
        fill[c]!++;
      }
  }
  flatCache.set(list, o);
  return o;
}

/**
 * `resolveStatic` (collision.ts) for a batch of circles, without dynamic solids: pushes each living body
 * out of every obstacle taller than its feet plus `stepUp`, in the order `obstaclesNear` meets them, then
 * keeps it inside the arena. `feet[i]` is the height of the body's feet (a climber passes over low boxes).
 */
export function resolveWalls(
  o: FlatObstacles,
  x: Float64Array,
  z: Float64Array,
  radius: Float64Array,
  feet: Float64Array,
  alive: Uint8Array,
  count: number,
  stepUp: number,
): void {
  const { n, half } = o;
  for (let i = 0; i < count; i++) {
    if (alive[i] === 0) continue;
    let px = x[i]!;
    let pz = z[i]!;
    const r = radius[i]!;
    const lift = feet[i]! + stepUp;
    if (o.count > 0) {
      if (o.stamp === 0xffffffff) {
        o.seen.fill(0);
        o.stamp = 0;
      }
      const stamp = ++o.stamp;
      const x0 = cellOf(half, n, px - r);
      const x1 = cellOf(half, n, px + r);
      const z0 = cellOf(half, n, pz - r);
      const z1 = cellOf(half, n, pz + r);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          const c = cz * n + cx;
          for (let k = o.cellStart[c]!; k < o.cellStart[c + 1]!; k++) {
            const b = o.cellItems[k]!;
            if (o.seen[b] === stamp) continue;
            o.seen[b] = stamp;
            if (o.top[b]! <= lift) continue;
            const bx = o.x[b]!;
            const bz = o.z[b]!;
            const hw = o.halfW[b]!;
            const hd = o.halfD[b]!;
            const qx = Math.min(Math.max(px, bx - hw), bx + hw);
            const qz = Math.min(Math.max(pz, bz - hd), bz + hd);
            const dx = px - qx;
            const dz = pz - qz;
            const d2 = dx * dx + dz * dz;
            if (d2 >= r * r) continue;
            if (d2 > 1e-12) {
              const d = Math.sqrt(d2);
              const push = (r - d) / d;
              px += dx * push;
              pz += dz * push;
              continue;
            }
            // The centre is inside the box: leave through the nearest face.
            const ox = hw - Math.abs(px - bx);
            const oz = hd - Math.abs(pz - bz);
            if (ox < oz) px = bx + Math.sign(px - bx || 1) * (hw + r);
            else pz = bz + Math.sign(pz - bz || 1) * (hd + r);
          }
        }
      }
    }
    const lim = half - r;
    x[i] = Math.min(Math.max(px, -lim), lim);
    z[i] = Math.min(Math.max(pz, -lim), lim);
  }
}

const oneX = new Float64Array(1);
const oneZ = new Float64Array(1);
const oneR = new Float64Array(1);
const oneFeet = new Float64Array(1);
const oneAlive = new Uint8Array([1]);

/** `resolveWalls` for one circle, in place (the scalar `resolveStatic` of collision.ts without dynamic solids). */
export function resolveWallsOne(
  o: FlatObstacles,
  pos: { x: number; z: number },
  radius: number,
  feet: number,
  stepUp: number,
): void {
  oneX[0] = pos.x;
  oneZ[0] = pos.z;
  oneR[0] = radius;
  oneFeet[0] = feet;
  resolveWalls(o, oneX, oneZ, oneR, oneFeet, oneAlive, 1, stepUp);
  pos.x = oneX[0]!;
  pos.z = oneZ[0]!;
}

/**
 * The implementation the game runs the kernels with. By default the TypeScript functions above; once
 * the Rust module has loaded (`src/wasm/rustKernels.ts`) it can take over. Both give the same bits
 * (`npm run check:kernels`, `npm run check:sim-hash`), so switching mid-run changes nothing. If the
 * Rust side ever throws, the TypeScript one takes back and stays.
 */
export interface KernelBackend {
  separate(
    x: Float64Array,
    z: Float64Array,
    radius: Float64Array,
    alive: Uint8Array,
    count: number,
    half: number,
    widest: number,
  ): void;
  flowSearch(
    n: number,
    cells: Uint8Array,
    extra: Float32Array,
    dist: Float64Array,
    targets: Int32Array,
    targetCount: number,
  ): void;
  resolveWalls(
    o: FlatObstacles,
    x: Float64Array,
    z: Float64Array,
    radius: Float64Array,
    feet: Float64Array,
    alive: Uint8Array,
    count: number,
    stepUp: number,
  ): void;
}

let backend: KernelBackend | null = null;
/** How many calls the backend served (for the checks: proof that it ran). */
export const backendCalls = { separate: 0, flowSearch: 0, resolveWalls: 0 };

export function useKernelBackend(next: KernelBackend | null): void {
  backend = next;
}

export const kernelBackendName = (): 'rust' | 'typescript' => (backend ? 'rust' : 'typescript');

/** `separate` through the current backend. */
export function runSeparate(
  s: SeparationScratch,
  x: Float64Array,
  z: Float64Array,
  radius: Float64Array,
  alive: Uint8Array,
  count: number,
  half: number,
  widest: number,
): void {
  if (backend) {
    try {
      backend.separate(x, z, radius, alive, count, half, widest);
      backendCalls.separate++;
      return;
    } catch {
      backend = null; // the Rust module failed: TypeScript from now on
    }
  }
  separate(s, x, z, radius, alive, count, half, widest);
}

/** `flowSearch` through the current backend. */
export function runFlowSearch(
  h: FlowScratch,
  n: number,
  cells: Uint8Array,
  extra: Float32Array,
  dist: Float64Array,
  targets: Int32Array,
  targetCount: number,
): void {
  if (backend) {
    try {
      backend.flowSearch(n, cells, extra, dist, targets, targetCount);
      backendCalls.flowSearch++;
      return;
    } catch {
      backend = null;
    }
  }
  flowSearch(h, n, cells, extra, dist, targets, targetCount);
}

/** `resolveWalls` through the current backend. */
export function runResolveWalls(
  o: FlatObstacles,
  x: Float64Array,
  z: Float64Array,
  radius: Float64Array,
  feet: Float64Array,
  alive: Uint8Array,
  count: number,
  stepUp: number,
): void {
  if (backend) {
    try {
      backend.resolveWalls(o, x, z, radius, feet, alive, count, stepUp);
      backendCalls.resolveWalls++;
      return;
    } catch {
      backend = null;
    }
  }
  resolveWalls(o, x, z, radius, feet, alive, count, stepUp);
}
