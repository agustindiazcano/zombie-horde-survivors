import type { OceanParams } from '../sim/ocean';
import { Ocean, simCoreMemory } from './simCore';

/**
 * The Rust / WebAssembly copy of `src/sim/ocean.ts` (crate `crates/sim-core`). The TypeScript file is the
 * reference and the fallback; `npm run check:ocean-wasm` compares the two. Rebuild with `npm run build:wasm`.
 */

const PATTERNS: Record<OceanParams['pattern'], number> = {
  golden: 0,
  fibonacci: 1,
  random: 2,
  swell: 3,
  custom: 4,
  jonswap: 5,
};

/** Packs the ocean numbers in the order the crate reads them (see the `P_*` constants in lib.rs). */
export function packOceanParams(o: OceanParams, out?: Float64Array): Float64Array {
  const a = out ?? new Float64Array(38);
  a[0] = o.waveHeight;
  a[1] = o.frequency;
  a[2] = o.speed;
  a[3] = o.pressure;
  a[4] = o.hooke;
  a[5] = o.silk;
  a[6] = o.shoreFade;
  a[7] = o.currentSpeed;
  a[8] = o.currentAngle;
  a[9] = PATTERNS[o.pattern];
  a[10] = o.seed;
  a[11] = o.chaos;
  a[12] = o.frozen;
  a[13] = o.wind;
  a[14] = o.heading;
  a[15] = o.spread;
  a[16] = o.sequence.length;
  for (let i = 0; i < 8; i++) a[17 + i] = o.sequence[i] ?? 0;
  const n = Math.min(o.vortices.length, 3);
  a[25] = n;
  for (let i = 0; i < 3; i++) {
    const v = o.vortices[i];
    a[26 + i * 4] = v?.x ?? 0;
    a[27 + i * 4] = v?.z ?? 0;
    a[28 + i * 4] = v?.strength ?? 0;
    a[29 + i * 4] = v?.radius ?? 1;
  }
  return a;
}

/**
 * The batch rows of an `Ocean` as views on the module's memory: write `ground`, `x`, `z` and `t`, call
 * `height_batch(level)`, read `out`. The views are invalid after the memory grows: ask again.
 */
export function oceanBatch(
  ocean: Ocean,
  n: number,
): { ground: Float64Array; x: Float64Array; z: Float64Array; t: Float64Array; out: Float64Array } {
  const ptr = ocean.batch_reserve(n);
  const buf = simCoreMemory().buffer;
  const row = (r: number) => new Float64Array(buf, ptr + r * n * 8, n);
  return { ground: row(0), x: row(1), z: row(2), t: row(3), out: row(4) };
}

export { Ocean };
