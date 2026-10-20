import type { GameConfig, Obstacle } from './config';
import { OBSTACLE_HEIGHT, STEP_UP } from './constants';
import { obstaclesNear } from './grid';
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

/** Height of the surface a unit at `pos` with its feet at `y` would land on (0 = the ground). */
export function supportHeight(arena: GameConfig['arena'], pos: Vec2, y: number): number {
  let best = 0;
  for (const box of arena.obstacles) {
    const top = topOf(box);
    if (top <= y + STEP_UP && top > best && insideBox(pos, box)) best = top;
  }
  return best;
}

/**
 * Keeps a circle inside the arena and out of every obstacle. A unit whose feet are at `y` is
 * only stopped by boxes taller than that, so a climber passes over the boxes beneath it.
 */
export function resolveStatic(pos: Vec2, radius: number, arena: GameConfig['arena'], y = 0): void {
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
  const lim = arena.halfSize - radius;
  pos.x = Math.min(Math.max(pos.x, -lim), lim);
  pos.z = Math.min(Math.max(pos.z, -lim), lim);
}
