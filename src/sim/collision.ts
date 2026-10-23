import type { GameConfig, Obstacle } from './config';
import { OBSTACLE_HEIGHT, STEP_UP } from './constants';
import { obstaclesNear } from './grid';
import { flatObstacles, resolveWallsOne } from './kernels';
import type { Vec2 } from './vec';

/** Distance along a ray (unit `dir`) to a circle, or null if it misses. */
export function rayCircle(origin: Vec2, dir: Vec2, center: Vec2, radius: number): number | null {
  const mx = origin.x - center.x;
  const mz = origin.z - center.z;
  const b = mx * dir.x + mz * dir.z;
  const c = mx * mx + mz * mz - radius * radius;
  if (c > 0 && b > 0) return null;
  const disc = b * b - c;
  if (disc < 0) return null;
  return Math.max(0, -b - Math.sqrt(disc));
}

/** Distance along a ray to an axis-aligned box (slab method), or null if it misses. */
export function rayAabb(origin: Vec2, dir: Vec2, box: Obstacle): number | null {
  let tMin = 0;
  let tMax = Infinity;
  const axes: [number, number, number, number][] = [
    [origin.x, dir.x, box.x - box.halfW, box.x + box.halfW],
    [origin.z, dir.z, box.z - box.halfD, box.z + box.halfD],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/** Pushes a circle out of a box in place. */
export function resolveCircleAabb(pos: Vec2, radius: number, box: Obstacle): void {
  const cx = Math.min(Math.max(pos.x, box.x - box.halfW), box.x + box.halfW);
  const cz = Math.min(Math.max(pos.z, box.z - box.halfD), box.z + box.halfD);
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    const push = (radius - d) / d;
    pos.x += dx * push;
    pos.z += dz * push;
    return;
  }
  // Centre is inside the box: leave through the nearest face.
  const ox = box.halfW - Math.abs(pos.x - box.x);
  const oz = box.halfD - Math.abs(pos.z - box.z);
  if (ox < oz) pos.x = box.x + Math.sign(pos.x - box.x || 1) * (box.halfW + radius);
  else pos.z = box.z + Math.sign(pos.z - box.z || 1) * (box.halfD + radius);
}

/** True when a point lies inside the box's footprint. */
export const insideBox = (p: Vec2, box: Obstacle): boolean =>
  Math.abs(p.x - box.x) <= box.halfW && Math.abs(p.z - box.z) <= box.halfD;

/** Top of a box: water and cliffs have no top, so nobody can climb onto them. */
export const topOf = (box: Obstacle): number =>
  box.water ? Infinity : (box.height ?? OBSTACLE_HEIGHT);

/**
 * A free body of the physics lab seen by the sim: a box turned `yaw` about the vertical (or a
 * round ball), from `bottom` to `top` above the ground under it. Units stand on a walkable one,
 * are stopped by the rest, and what they press into it (`pushX`, `pushZ`, metres this tick) is
 * what the lab turns into a shove. Empty outside Map 12.
 */
export interface DynamicSolid {
  x: number;
  z: number;
  /** Half sides in the box's own frame, or the radius of a round solid. */
  halfW: number;
  halfD: number;
  yaw: number;
  bottom: number;
  top: number;
  /** A ball: a circle of radius `halfW`. */
  round: boolean;
  /** Units can stand on it (a box lying flat enough). */
  walkable: boolean;
  /** Which body of the lab it is. */
  body: number;
  pushX: number;
  pushZ: number;
  /** Visited stamp of the current query, so a solid in several cells is met once. */
  mark: number;
}

/** How tall a unit is (m): a solid whose underside is above this does not stop it. */
const UNIT_HEIGHT = 1.8;
const SOLID_CELL = 4;
let solidList: readonly DynamicSolid[] = [];
const solidGrid = new Map<number, DynamicSolid[]>();
let solidStamp = 0;
const cellKey = (cx: number, cz: number): number => (cx + 1024) * 4096 + (cz + 1024);

/** Replaces the dynamic solids (the lab calls it every step). */
export function setDynamicSolids(list: readonly DynamicSolid[]): void {
  solidList = list;
  solidGrid.clear();
  for (const s of list) {
    const r = s.round ? s.halfW : Math.hypot(s.halfW, s.halfD);
    const x0 = Math.floor((s.x - r) / SOLID_CELL);
    const x1 = Math.floor((s.x + r) / SOLID_CELL);
    const z0 = Math.floor((s.z - r) / SOLID_CELL);
    const z1 = Math.floor((s.z + r) / SOLID_CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const key = cellKey(cx, cz);
        const cell = solidGrid.get(key);
        if (cell) cell.push(s);
        else solidGrid.set(key, [s]);
      }
  }
}

export const dynamicSolids = (): readonly DynamicSolid[] => solidList;

/** The dynamic solids whose cells touch the rectangle (each once). */
function solidsNear(x0: number, z0: number, x1: number, z1: number): DynamicSolid[] {
  const out: DynamicSolid[] = [];
  if (solidList.length === 0) return out;
  const stamp = ++solidStamp;
  const cx1 = Math.floor(x1 / SOLID_CELL);
  const cz1 = Math.floor(z1 / SOLID_CELL);
  for (let cx = Math.floor(x0 / SOLID_CELL); cx <= cx1; cx++)
    for (let cz = Math.floor(z0 / SOLID_CELL); cz <= cz1; cz++) {
      const cell = solidGrid.get(cellKey(cx, cz));
      if (!cell) continue;
      for (const s of cell)
        if (s.mark !== stamp) {
          s.mark = stamp;
          out.push(s);
        }
    }
  return out;
}

/** The point of a solid's footprint closest to `p` (world frame). */
export function nearestOnSolid(p: Vec2, s: DynamicSolid): Vec2 {
  const dx = p.x - s.x;
  const dz = p.z - s.z;
  if (s.round) {
    const d = Math.hypot(dx, dz);
    const k = d > s.halfW ? s.halfW / d : 1;
    return { x: s.x + dx * k, z: s.z + dz * k };
  }
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  const lx = Math.min(Math.max(dx * c - dz * n, -s.halfW), s.halfW);
  const lz = Math.min(Math.max(dx * n + dz * c, -s.halfD), s.halfD);
  return { x: s.x + lx * c + lz * n, z: s.z - lx * n + lz * c };
}

const insideSolid = (p: Vec2, s: DynamicSolid): boolean => {
  const dx = p.x - s.x;
  const dz = p.z - s.z;
  if (s.round) return dx * dx + dz * dz <= s.halfW * s.halfW;
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  return Math.abs(dx * c - dz * n) <= s.halfW && Math.abs(dx * n + dz * c) <= s.halfD;
};

/** Pushes a circle out of a dynamic solid and notes how far it had to (the shove it gives). */
function resolveCircleSolid(pos: Vec2, radius: number, s: DynamicSolid): void {
  const near = nearestOnSolid(pos, s);
  let dx = pos.x - near.x;
  let dz = pos.z - near.z;
  const d = Math.hypot(dx, dz);
  if (d >= radius) return;
  let push: number;
  if (d > 1e-6) {
    push = radius - d;
    dx /= d;
    dz /= d;
  } else {
    // The centre is inside: leave away from the solid's centre.
    dx = pos.x - s.x;
    dz = pos.z - s.z;
    const m = Math.hypot(dx, dz) || 1;
    dx /= m;
    dz /= m;
    push = radius + (s.round ? s.halfW : Math.min(s.halfW, s.halfD));
  }
  pos.x += dx * push;
  pos.z += dz * push;
  s.pushX -= dx * push;
  s.pushZ -= dz * push;
}

/** The dynamic solids a unit of `radius` at `pos`, feet at `y`, is in reach of and may hit. */
function solidsInReach(pos: Vec2, radius: number, y: number): DynamicSolid[] {
  return solidsNear(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius).filter(
    (s) => s.top > y + STEP_UP && s.bottom < y + UNIT_HEIGHT,
  );
}

/** Height of the surface a unit at `pos` with its feet at `y` would land on (0 = the ground). */
export function supportHeight(arena: GameConfig['arena'], pos: Vec2, y: number): number {
  let best = 0;
  for (const box of arena.obstacles) {
    const top = topOf(box);
    if (top <= y + STEP_UP && top > best && insideBox(pos, box)) best = top;
  }
  for (const s of solidsNear(pos.x, pos.z, pos.x, pos.z))
    if (s.walkable && s.top <= y + STEP_UP && s.top > best && insideSolid(pos, s)) best = s.top;
  return best;
}

/**
 * Keeps a circle inside the arena and out of every obstacle. A unit whose feet are at `y` is
 * only stopped by boxes taller than that, so a climber passes over the boxes beneath it.
 */
export function resolveStatic(pos: Vec2, radius: number, arena: GameConfig['arena'], y = 0): void {
  // No physics-lab solids (every map but 12): the flat grid does the same, several times faster.
  if (solidList.length === 0) {
    resolveWallsOne(flatObstacles(arena), pos, radius, y, STEP_UP);
    return;
  }
  for (const box of obstaclesNear(
    arena,
    pos.x - radius,
    pos.z - radius,
    pos.x + radius,
    pos.z + radius,
  )) {
    if (topOf(box) <= y + STEP_UP) continue;
    resolveCircleAabb(pos, radius, box);
  }
  for (const s of solidsInReach(pos, radius, y)) resolveCircleSolid(pos, radius, s);
  const lim = arena.halfSize - radius;
  pos.x = Math.min(Math.max(pos.x, -lim), lim);
  pos.z = Math.min(Math.max(pos.z, -lim), lim);
}

/**
 * The per-body version of `resolveStatic` over the object grid of grid.ts. It is the reference the flat
 * kernel is checked against (`npm run check:kernels`); the game calls `resolveStatic`.
 */
export function resolveStaticReference(
  pos: Vec2,
  radius: number,
  arena: GameConfig['arena'],
  y = 0,
): void {
  for (const box of obstaclesNear(
    arena,
    pos.x - radius,
    pos.z - radius,
    pos.x + radius,
    pos.z + radius,
  )) {
    if (topOf(box) <= y + STEP_UP) continue;
    resolveCircleAabb(pos, radius, box);
  }
  for (const s of solidsInReach(pos, radius, y)) resolveCircleSolid(pos, radius, s);
  const lim = arena.halfSize - radius;
  pos.x = Math.min(Math.max(pos.x, -lim), lim);
  pos.z = Math.min(Math.max(pos.z, -lim), lim);
}

/**
 * Like `resolveStatic` for something that flies at height `y`: water and cliffs do not stop it
 * (they have no top), and a prop only does when it is taller than `y`. The arena edge still does.
 */
export function resolveFlying(
  pos: Vec2,
  radius: number,
  arena: GameConfig['arena'],
  y: number,
): void {
  for (const box of obstaclesNear(
    arena,
    pos.x - radius,
    pos.z - radius,
    pos.x + radius,
    pos.z + radius,
  )) {
    if (box.water || topOf(box) <= y + STEP_UP) continue;
    resolveCircleAabb(pos, radius, box);
  }
  const lim = arena.halfSize - radius;
  pos.x = Math.min(Math.max(pos.x, -lim), lim);
  pos.z = Math.min(Math.max(pos.z, -lim), lim);
}
