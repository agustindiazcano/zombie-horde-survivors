import type { GameConfig } from './config';

/** The numbers of the wave ocean (`ocean` in game.json, overridden by the map). */
export type OceanParams = GameConfig['ocean'];

const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = 2 * Math.PI * (1 - 1 / PHI);
/** How many waves are summed; the render shader uses the same eight. */
export const WAVE_COUNT = 8;
/** Pulls the wave directions towards +z so the swell has a main heading. */
const HEADING = 0.38;

/** The unit direction (x, z) of each wave: a golden-angle spiral, so none lines up with another. */
export const WAVE_DIRS: readonly (readonly [number, number])[] = Array.from(
  { length: WAVE_COUNT },
  (_, i) => {
    const a = i * GOLDEN_ANGLE;
    const x = Math.cos(a) * (1 - HEADING);
    const z = Math.sin(a) * (1 - HEADING) + HEADING;
    const len = Math.hypot(x, z);
    return [x / len, z / len] as const;
  },
);

/** 0 where the ground is at the water level or above, 1 once the water is deeper than `1 / 0.15 + shoreFade`. */
export function waveFade(o: OceanParams, level: number, groundY: number): number {
  return Math.min(1, Math.max(0, (level + o.shoreFade - groundY) * 0.15));
}

/**
 * Height of the water surface (m) at (x, z) and time `t` (s). `level` is the calm water level and
 * `groundY` the ground under the point: the waves fade out towards the shore. The same formula runs
 * in the water shader (`src/render/oceanView.ts`), so what floats is where the eye sees the surface.
 */
export function oceanHeight(
  o: OceanParams,
  level: number,
  groundY: number,
  x: number,
  z: number,
  t: number,
): number {
  const fade = waveFade(o, level, groundY);
  if (fade <= 0) return level;
  const cx = Math.cos(o.currentAngle) * o.currentSpeed * t * 0.12;
  const cz = Math.sin(o.currentAngle) * o.currentSpeed * t * 0.12;
  let sum = 0;
  let amp = o.waveHeight;
  let freq = o.frequency;
  let speed = o.speed;
  let pressure = o.pressure;
  for (let i = 0; i < WAVE_COUNT; i++) {
    const d = WAVE_DIRS[i]!;
    const phase = ((x - cx) * d[0] + (z - cz) * d[1]) * freq + t * speed;
    const s = Math.sin(phase);
    const smooth = s + o.silk * 0.8 * Math.cos(phase * 2);
    const sharp = (Math.pow(1 - Math.abs(s), pressure) - 0.45) * 2.15;
    sum += (smooth * (1 - o.hooke) + sharp * o.hooke) * amp;
    amp *= (1 / PHI) * 1.18;
    freq *= PHI * 0.88;
    speed *= 1.12;
    pressure *= 1.08;
  }
  return level + sum * fade;
}

/** The speed of the water (m/s) at a point: the steady current. Written into `out` as (x, z). */
export function oceanFlow(o: OceanParams, out: { x: number; z: number }): void {
  out.x = Math.cos(o.currentAngle) * o.currentSpeed;
  out.z = Math.sin(o.currentAngle) * o.currentSpeed;
}
