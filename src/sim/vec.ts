/** 2D vector on the ground plane (x, z). */
export interface Vec2 {
  x: number;
  z: number;
}

export const vec = (x = 0, z = 0): Vec2 => ({ x, z });
export const len = (v: Vec2): number => Math.hypot(v.x, v.z);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

export function normalize(v: Vec2): Vec2 {
  const l = len(v);
  return l < 1e-9 ? { x: 0, z: 0 } : { x: v.x / l, z: v.z / l };
}

/** Unit direction for a facing angle (0 = +z, PI/2 = +x). */
export const dirFromAngle = (angle: number): Vec2 => ({ x: Math.sin(angle), z: Math.cos(angle) });
