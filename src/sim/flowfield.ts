import { inShelter } from './shelter';
import type { Arena, GameConfig, Obstacle } from './config';
import { topOf } from './collision';
import { newFlowScratch, runFlowSearch } from './kernels';
import type { GameState } from './types';
import { isOccupied } from './vehicles';
import { hypot } from './vec';
import type { Vec2 } from './vec';

/** Side (metres) of a path cell: fine enough for the gaps between obstacles. */
const FLOW_CELL = 1;
/** Free space kept around every obstacle, so a body walking cell to cell does not scrape it. */
const CLEARANCE = 0.6;
/** Seconds a field stays valid; the squad moves, so it is searched again after this. */
const REFRESH = 0.25;
/** How far (metres) past a door's footprint its passable cells reach: along the door and through it. */
const DOOR_PASS_LONG = 0.3;
const DOOR_PASS_THIN = 0.7;
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

/** The same neighbours as flat arrays (the search loops read these without building arrays). */
const NEIGHBOUR_DX = Int8Array.from(NEIGHBOURS, (n) => n[0]);
const NEIGHBOUR_DZ = Int8Array.from(NEIGHBOURS, (n) => n[1]);

/** Which cells of the arena a walker cannot enter, rebuilt when the obstacle list changes. */
interface Blocked {
  source: Obstacle[];
  length: number;
  half: number;
  n: number;
  /** 0 free, 1 blocked, 2 a structure enemies can break: passable at the cost in `extra`. */
  cells: Uint8Array;
  extra: Float32Array;
}

/** Walking distance from every cell to the nearest target, and how old it is. */
interface Field {
  blocked: Blocked;
  dist: Float64Array;
  age: number;
}

const blockedGrids = new WeakMap<Obstacle[], Blocked>();
/** The same grid with only the obstacles a climber cannot cross, per climbing height. */
const hardGrids = new WeakMap<Obstacle[], Map<number, Blocked>>();
const allyGrids = new WeakMap<Obstacle[], Blocked>();
/** Grids for sight: the same, except that see-through boxes (glass doors) do not block. */
const sightGrids = new WeakMap<Obstacle[], Map<number, Blocked>>();
const fields = new WeakMap<GameState, Field>();
/** A soldier's own walk-to field: where it was searched for, and how old it is. */
interface WalkField {
  blocked: Blocked;
  dist: Float64Array;
  cell: number;
  age: number;
}
const walkFields = new WeakMap<GameState, Map<number, WalkField>>();
/** Seconds before a soldier's field may be searched again for a destination that moved. */
const WALK_REFRESH = 0.3;

const cellIndex = (b: Blocked, v: number): number =>
  Math.min(Math.max(Math.floor((v + b.half) / FLOW_CELL), 0), b.n - 1);
const centre = (b: Blocked, c: number): number => (c + 0.5) * FLOW_CELL - b.half;

/** Forgets the cached grids of an arena; call it when obstacles change without changing the count. */
export function invalidateFlow(arena: Arena): void {
  blockedGrids.delete(arena.obstacles);
  allyGrids.delete(arena.obstacles);
  hardGrids.delete(arena.obstacles);
  sightGrids.delete(arena.obstacles);
}

function blockedOf(arena: Arena, climbHeight = 0): Blocked {
  const cached =
    climbHeight > 0
      ? hardGrids.get(arena.obstacles)?.get(climbHeight)
      : blockedGrids.get(arena.obstacles);
  if (cached && cached.source === arena.obstacles && cached.length === arena.obstacles.length) {
    return cached;
  }
  const made = makeBlocked(arena, climbHeight, false);
  if (climbHeight > 0) {
    const perHeight = hardGrids.get(arena.obstacles) ?? new Map<number, Blocked>();
    perHeight.set(climbHeight, made);
    hardGrids.set(arena.obstacles, perHeight);
  } else {
    blockedGrids.set(arena.obstacles, made);
  }
  return made;
}

/** The grid an ally walks: closed doors are passable (the walker opens them), other structures are walls. */
function allyBlockedOf(arena: Arena): Blocked {
  const cached = allyGrids.get(arena.obstacles);
  if (cached && cached.length === arena.obstacles.length) return cached;
  const made = makeBlocked(arena, 0, true);
  allyGrids.set(arena.obstacles, made);
  return made;
}

function sightOf(arena: Arena, climbHeight: number): Blocked {
  const perHeight = sightGrids.get(arena.obstacles) ?? new Map<number, Blocked>();
  const cached = perHeight.get(climbHeight);
  if (cached && cached.length === arena.obstacles.length) return cached;
  const made = makeBlocked(arena, climbHeight, false, true);
  perHeight.set(climbHeight, made);
  sightGrids.set(arena.obstacles, perHeight);
  return made;
}

function makeBlocked(arena: Arena, climbHeight: number, ally: boolean, sight = false): Blocked {
  const n = Math.ceil((arena.halfSize * 2) / FLOW_CELL);
  const made: Blocked = {
    source: arena.obstacles,
    length: arena.obstacles.length,
    half: arena.halfSize,
    n,
    cells: new Uint8Array(n * n),
    extra: new Float32Array(n * n),
  };
  for (const box of arena.obstacles) {
    if (climbHeight > 0 && topOf(box) <= climbHeight) continue;
    if (ally && box.structure?.door) continue;
    if (sight && box.seeThrough) continue;
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
          const at = cz * n + cx;
          if (box.structure && !ally) {
            // Breakable: a hard block wins over it, otherwise the cheapest break cost counts.
            if (made.cells[at] === 1) continue;
            made.cells[at] = 2;
            made.extra[at] = made.extra[at]
              ? Math.min(made.extra[at]!, box.structure.breakCost)
              : box.structure.breakCost;
          } else {
            made.cells[at] = 1;
          }
        }
      }
    }
  }
  if (ally) {
    // A door's gap can be narrower than the clearance of the walls beside it: open its cells.
    for (const box of arena.doors ?? []) {
      const thinX = box.halfW < box.halfD;
      const mx = box.halfW + (thinX ? DOOR_PASS_THIN : DOOR_PASS_LONG);
      const mz = box.halfD + (thinX ? DOOR_PASS_LONG : DOOR_PASS_THIN);
      for (let cz = cellIndex(made, box.z - mz); cz <= cellIndex(made, box.z + mz); cz++) {
        for (let cx = cellIndex(made, box.x - mx); cx <= cellIndex(made, box.x + mx); cx++) {
          if (Math.abs(centre(made, cx) - box.x) <= mx && Math.abs(centre(made, cz) - box.z) <= mz)
            made.cells[cz * n + cx] = 0;
        }
      }
    }
  }
  return made;
}

/** True if the straight way from `a` to `b` crosses no blocked cell. */
function lineClear(blocked: Blocked, a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const steps = Math.ceil(hypot(dx, dz) / (FLOW_CELL * 0.75));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const c = cellIndex(blocked, a.z + dz * t) * blocked.n + cellIndex(blocked, a.x + dx * t);
    if (blocked.cells[c]) return false;
  }
  return true;
}

/** True if nothing blocks the straight way from `a` to `b` (an obstacle a climber crosses does not count). */
export function canSee(config: GameConfig, a: Vec2, b: Vec2, climbHeight = 0): boolean {
  const obstacles = config.arena.obstacles;
  if (obstacles.length === 0) return true;
  const glass = obstacles.some((o) => o.seeThrough);
  return lineClear(
    glass ? sightOf(config.arena, climbHeight) : blockedOf(config.arena, climbHeight),
    a,
    b,
  );
}

/** Fills `dist` with the walking distance from every free cell to the nearest of `targets` (kernel `flowSearch`). */
function search(blocked: Blocked, dist: Float64Array, targets: Vec2[]): void {
  const { n, cells, extra } = blocked;
  if (targetCells.length < targets.length) targetCells = new Int32Array(targets.length * 2);
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    targetCells[i] = cellIndex(blocked, t.z) * n + cellIndex(blocked, t.x);
  }
  runFlowSearch(
    flowScratch,
    n,
    cells,
    extra,
    dist,
    targetCells.subarray(0, targets.length),
    targets.length,
  );
}

// Scratch space of the search, reused so a refresh allocates nothing once it has grown.
const flowScratch = newFlowScratch();
let targetCells = new Int32Array(16);

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
    if (!s.dead && s.kind !== 'drone' && !inShelter(s)) targets.push(s.pos);
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
export function steerTarget(
  state: GameState,
  config: GameConfig,
  from: Vec2,
  to: Vec2,
  /** A climber's reach: obstacles up to this high do not count as blocking the straight way. */
  climbHeight = 0,
): Vec2 {
  const blocked = blockedOf(config.arena);
  if (
    config.arena.obstacles.length === 0 ||
    lineClear(climbHeight > 0 ? blockedOf(config.arena, climbHeight) : blocked, from, to)
  ) {
    waypoint.x = to.x;
    waypoint.z = to.z;
    return waypoint;
  }
  return nextWaypoint(blocked, fieldOf(state, config).dist, from, to);
}

/** The centre of the neighbouring cell nearest the target, or `to` when no cell is better. */
function nextWaypoint(blocked: Blocked, dist: Float64Array, from: Vec2, to: Vec2): Vec2 {
  const { n, cells } = blocked;
  const cx = cellIndex(blocked, from.x);
  const cz = cellIndex(blocked, from.z);
  // From a free cell only a cell closer to the target counts; from a blocked one, any reached cell.
  let best = cells[cz * n + cx] === 1 ? Infinity : dist[cz * n + cx]!;
  let bx = -1;
  let bz = -1;
  for (let k = 0; k < 8; k++) {
    const dx = NEIGHBOUR_DX[k]!;
    const dz = NEIGHBOUR_DZ[k]!;
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

/**
 * Where a soldier on foot should head to reach `to`: `to` itself with a free straight way,
 * otherwise the next cell of the shortest walk around walls and structures. Closed doors count
 * as open ground (see `doorAhead`). Each soldier keeps its own field, searched again when the
 * destination moves to another cell. The returned point is reused by the next call.
 */
export function walkTarget(
  state: GameState,
  config: GameConfig,
  id: number,
  from: Vec2,
  to: Vec2,
): Vec2 {
  const blocked = allyBlockedOf(config.arena);
  if (config.arena.obstacles.length === 0 || lineClear(blocked, from, to)) {
    waypoint.x = to.x;
    waypoint.z = to.z;
    return waypoint;
  }
  let perSoldier = walkFields.get(state);
  if (!perSoldier) walkFields.set(state, (perSoldier = new Map()));
  let field = perSoldier.get(id);
  const cell = cellIndex(blocked, to.z) * blocked.n + cellIndex(blocked, to.x);
  if (!field || field.blocked !== blocked) {
    field = { blocked, dist: new Float64Array(blocked.n * blocked.n), cell: -1, age: 0 };
    perSoldier.set(id, field);
  }
  if (field.cell !== cell && (field.cell < 0 || field.age >= WALK_REFRESH)) {
    search(blocked, field.dist, [to]);
    field.cell = cell;
    field.age = 0;
  }
  return nextWaypoint(blocked, field.dist, from, to);
}

/** Makes the soldiers' fields age; call once per step with the step length. */
export function ageWalk(state: GameState, dt: number): void {
  const perSoldier = walkFields.get(state);
  if (perSoldier) for (const f of perSoldier.values()) f.age += dt;
}
