import type { Arena, GameConfig, Obstacle } from './config';
import type { GameState } from './types';
import { isOccupied } from './vehicles';
import type { Vec2 } from './vec';

/** Side (metres) of a path cell: fine enough for the gaps between obstacles. */
const FLOW_CELL = 1;
/** Free space kept around every obstacle, so a body walking cell to cell does not scrape it. */
const CLEARANCE = 0.6;
/** Seconds a field stays valid; the squad moves, so it is searched again after this. */
const REFRESH = 0.25;
const SQRT2 = Math.SQRT2;
/** Cell neighbours: dx, dz and the cost of the step. */
const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Which cells of the arena a walker cannot enter, rebuilt when the obstacle list changes. */
interface Blocked {
  source: Obstacle[];
  length: number;
  half: number;
  n: number;
  cells: Uint8Array;
}

/** Walking distance from every cell to the nearest target, and how old it is. */
interface Field {
  blocked: Blocked;
  dist: Float64Array;
  age: number;
}

const blockedGrids = new WeakMap<Obstacle[], Blocked>();
const fields = new WeakMap<GameState, Field>();

const cellIndex = (b: Blocked, v: number): number =>
  Math.min(Math.max(Math.floor((v + b.half) / FLOW_CELL), 0), b.n - 1);
const centre = (b: Blocked, c: number): number => (c + 0.5) * FLOW_CELL - b.half;

/** Forgets the cached grids of an arena; call it when obstacles change without changing the count. */
export function invalidateFlow(arena: Arena): void {
  blockedGrids.delete(arena.obstacles);
}

function blockedOf(arena: Arena): Blocked {
  const cached = blockedGrids.get(arena.obstacles);
  if (cached && cached.source === arena.obstacles && cached.length === arena.obstacles.length) {
    return cached;
  }
  const n = Math.ceil((arena.halfSize * 2) / FLOW_CELL);
  const made: Blocked = {
    source: arena.obstacles,
    length: arena.obstacles.length,
    half: arena.halfSize,
    n,
    cells: new Uint8Array(n * n),
  };
  for (const box of arena.obstacles) {
    const x0 = cellIndex(made, box.x - box.halfW - CLEARANCE);
    const x1 = cellIndex(made, box.x + box.halfW + CLEARANCE);
    const z0 = cellIndex(made, box.z - box.halfD - CLEARANCE);
    const z1 = cellIndex(made, box.z + box.halfD + CLEARANCE);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (
          Math.abs(centre(made, cx) - box.x) <= box.halfW + CLEARANCE &&
          Math.abs(centre(made, cz) - box.z) <= box.halfD + CLEARANCE
        ) {
          made.cells[cz * n + cx] = 1;
        }
      }
    }
  }
  blockedGrids.set(arena.obstacles, made);
  return made;
}

/** True if the straight way from `a` to `b` crosses no blocked cell. */
function lineClear(blocked: Blocked, a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const steps = Math.ceil(Math.hypot(dx, dz) / (FLOW_CELL * 0.75));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const c = cellIndex(blocked, a.z + dz * t) * blocked.n + cellIndex(blocked, a.x + dx * t);
    if (blocked.cells[c]) return false;
  }
  return true;
}

// Scratch space of the search, reused so a refresh allocates nothing once it has grown.
const heapCost: number[] = [];
const heapCell: number[] = [];

function heapPush(cost: number, cell: number): void {
  let i = heapCost.length;
  heapCost.push(cost);
  heapCell.push(cell);
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heapCost[parent]! <= cost) break;
    heapCost[i] = heapCost[parent]!;
    heapCell[i] = heapCell[parent]!;
    i = parent;
  }
  heapCost[i] = cost;
  heapCell[i] = cell;
}

/** Removes the cheapest entry; the caller reads it from `popped` first. */
function heapPop(): void {
  const lastCost = heapCost.pop()!;
  const lastCell = heapCell.pop()!;
  const size = heapCost.length;
  if (size === 0) return;
  let i = 0;
  for (;;) {
    let child = 2 * i + 1;
    if (child >= size) break;
    if (child + 1 < size && heapCost[child + 1]! < heapCost[child]!) child++;
    if (heapCost[child]! >= lastCost) break;
    heapCost[i] = heapCost[child]!;
    heapCell[i] = heapCell[child]!;
    i = child;
  }
  heapCost[i] = lastCost;
  heapCell[i] = lastCell;
}

/** Fills `dist` with the walking distance from every free cell to the nearest of `targets`. */
function search(blocked: Blocked, dist: Float64Array, targets: Vec2[]): void {
  const { n, cells } = blocked;
  dist.fill(Infinity);
  heapCost.length = 0;
  heapCell.length = 0;
  for (const t of targets) {
    const c = cellIndex(blocked, t.z) * n + cellIndex(blocked, t.x);
    if (dist[c] === 0) continue;
    dist[c] = 0;
    heapPush(0, c);
  }
  while (heapCost.length > 0) {
    const cost = heapCost[0]!;
    const cell = heapCell[0]!;
    heapPop();
    if (cost > dist[cell]!) continue; // a cheaper way to this cell was already found
    const cx = cell % n;
    const cz = (cell - cx) / n;
    for (let k = 0; k < 8; k++) {
      const dx = NEIGHBOURS[k]![0];
      const dz = NEIGHBOURS[k]![1];
      const step = NEIGHBOURS[k]![2];
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const next = nz * n + nx;
      if (cells[next]) continue;
      // No cutting a corner: both cells beside a diagonal step must be free.
      if (dx !== 0 && dz !== 0 && (cells[cz * n + nx] || cells[nz * n + cx])) continue;
      const total = cost + step;
      if (total < dist[next]!) {
        dist[next] = total;
        heapPush(total, next);
      }
    }
  }
}

/** The field for this moment of the game, searched again when it is older than `REFRESH`. */
function fieldOf(state: GameState, config: GameConfig): Field {
  const blocked = blockedOf(config.arena);
  let field = fields.get(state);
  if (field && field.blocked === blocked && field.age < REFRESH) return field;
  if (!field || field.blocked !== blocked) {
    field = { blocked, dist: new Float64Array(blocked.n * blocked.n), age: 0 };
    fields.set(state, field);
  }
  const targets: Vec2[] = [];
  for (const s of state.soldiers) {
    if (!s.dead && s.kind !== 'drone' && s.vehicleId === null) targets.push(s.pos);
  }
  for (const v of state.vehicles) if (isOccupied(v)) targets.push(v.pos);
  search(blocked, field.dist, targets);
  field.age = 0;
  return field;
}

/** Makes the fields age; call once per step with the step length. */
export function ageFlow(state: GameState, dt: number): void {
  const field = fields.get(state);
  if (field) field.age += dt;
}

const waypoint: Vec2 = { x: 0, z: 0 };

/**
 * Where a chasing walker should head to reach `to`. With a free straight way it is `to` itself;
 * if an obstacle is in the way, the centre of the next cell on the shortest walk around it, read
 * from one search that every enemy shares (so the cost grows with the map, not the horde).
 * The returned point is reused by the next call.
 */
export function steerTarget(state: GameState, config: GameConfig, from: Vec2, to: Vec2): Vec2 {
  const blocked = blockedOf(config.arena);
  if (config.arena.obstacles.length === 0 || lineClear(blocked, from, to)) {
    waypoint.x = to.x;
    waypoint.z = to.z;
    return waypoint;
  }
  const { dist } = fieldOf(state, config);
  const { n, cells } = blocked;
  const cx = cellIndex(blocked, from.x);
  const cz = cellIndex(blocked, from.z);
  // From a free cell only a cell closer to the target counts; from a blocked one, any reached cell.
  let best = cells[cz * n + cx] ? Infinity : dist[cz * n + cx]!;
  let bx = -1;
  let bz = -1;
  for (const [dx, dz] of NEIGHBOURS) {
    const nx = cx + dx;
    const nz = cz + dz;
    if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
    const d = dist[nz * n + nx]!;
    if (d < best && !(dx !== 0 && dz !== 0 && (cells[cz * n + nx] || cells[nz * n + cx]))) {
      best = d;
      bx = nx;
      bz = nz;
    }
  }
  if (bx < 0) {
    // Walled in or already on the lowest cell: go straight and let the collision do its best.
    waypoint.x = to.x;
    waypoint.z = to.z;
  } else {
    waypoint.x = centre(blocked, bx);
    waypoint.z = centre(blocked, bz);
  }
  return waypoint;
}
