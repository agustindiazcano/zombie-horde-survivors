import { dcos, dsin } from './dmath';
/** 2D vector on the ground plane (x, z). */
export interface Vec2 {
  x: number;
  z: number;
}

export const vec = (x = 0, z = 0): Vec2 => ({ x, z });
/**
 * `sqrt(a^2 + b^2)` without overflow: scale by the larger one and add the squares with Kahan summation.
 * It gives the same bits as V8's `Math.hypot` of two arguments (checked on millions of pairs), but it
 * is made only of `+ - * /` and `sqrt`, which the standard rounds exactly, so every browser and the Rust
 * copy (`crates/sim-core`) get the same number. The simulation uses this, never `Math.hypot`.
 */
export function hypot(a: number, b: number): number {
  const x = Math.abs(a);
  const y = Math.abs(b);
  const max = x > y ? x : y;
  if (max === Infinity) return Infinity;
  if (max === 0) return 0;
  if (x !== x || y !== y) return NaN;
  let n = x / max;
  let summand = n * n;
  let sum = summand;
  // The compensation is exactly 0 after the first term, so the second term is a plain sum.
  n = y / max;
  summand = n * n;
  sum = sum + summand;
  return Math.sqrt(sum) * max;
}
/** `hypot` of three numbers (the 3D distances of the sky and the physics): same method, full Kahan summation. */
export function hypot3(a: number, b: number, c: number): number {
  const x = Math.abs(a);
  const y = Math.abs(b);
  const w = Math.abs(c);
  let max = x > y ? x : y;
  if (w > max) max = w;
  if (max === Infinity) return Infinity;
  if (max === 0) return 0;
  if (x !== x || y !== y || w !== w) return NaN;
  let sum = 0;
  let compensation = 0;
  let n = x / max;
  let summand = n * n - compensation;
  let preliminary = sum + summand;
  compensation = preliminary - sum - summand;
  sum = preliminary;
  n = y / max;
  summand = n * n - compensation;
  preliminary = sum + summand;
  compensation = preliminary - sum - summand;
  sum = preliminary;
  n = w / max;
  summand = n * n - compensation;
  preliminary = sum + summand;
  sum = preliminary;
  return Math.sqrt(sum) * max;
}
export const len = (v: Vec2): number => hypot(v.x, v.z);
export const dist = (a: Vec2, b: Vec2): number => hypot(a.x - b.x, a.z - b.z);

export function normalize(v: Vec2): Vec2 {
  const l = len(v);
  return l < 1e-9 ? { x: 0, z: 0 } : { x: v.x / l, z: v.z / l };
}

/** Unit direction for a facing angle (0 = +z, PI/2 = +x). */
export const dirFromAngle = (angle: number): Vec2 => ({ x: dsin(angle), z: dcos(angle) });
