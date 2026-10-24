import { KIND_BALL, type PhysicsWorld } from './world';
import { dcos, dsin } from '../dmath';

/** The golden angle (137.5 degrees): successive points of a Vogel spiral never line up. */
export const GOLDEN_ANGLE = 2.3999632297;

/** Radius of the balls the lab drops (metres). */
export const BALL_RADIUS = 0.5;

/**
 * `count` balls falling as a Vogel spiral (golden-angle disc) centred at (x, z), starting
 * `height` metres up and staggered so they do not all arrive at once. Returns how many fitted.
 */
export function vogelRain(
  world: PhysicsWorld,
  count: number,
  x: number,
  z: number,
  height = 14,
): number {
  let made = 0;
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(i) * 0.55;
    const a = i * GOLDEN_ANGLE;
    const id = world.addBody(
      x + dcos(a) * r,
      height + i * 0.03,
      z + dsin(a) * r,
      BALL_RADIUS,
      1,
      KIND_BALL,
    );
    if (id === -1) break;
    world.vy[id] = -6;
    made++;
  }
  return made;
}

/**
 * A square-base pyramid of balls resting in each other's hollows (the stable way to stack
 * spheres): `base` x `base` on the floor (at height `y`), one fewer per side on each layer above.
 * Returns the id of the top ball, or -1 if the pool filled first.
 */
export function pyramid(world: PhysicsWorld, x: number, z: number, base = 6, y = 0): number {
  const d = BALL_RADIUS * 2;
  const rise = BALL_RADIUS * Math.SQRT2;
  let top = -1;
  for (let layer = 0; layer < base; layer++) {
    const side = base - layer;
    const half = ((side - 1) * d) / 2;
    for (let i = 0; i < side; i++) {
      for (let j = 0; j < side; j++) {
        top = world.addBody(
          x - half + i * d,
          y + BALL_RADIUS + 0.01 + layer * rise,
          z - half + j * d,
          BALL_RADIUS,
          1,
          KIND_BALL,
        );
        if (top === -1) return -1;
      }
    }
  }
  return top;
}
