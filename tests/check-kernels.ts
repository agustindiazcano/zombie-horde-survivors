// Compares the flat kernels of src/sim/kernels.ts (TypeScript) with their Rust copy bit for bit, and
// times both on the same data: npm run check:kernels
import { readFileSync } from 'node:fs';
import { newSeparationScratch, separate } from '../src/sim/kernels';
import { Separation, loadSimCoreSync, simCoreMemory } from '../src/wasm/simCore';

loadSimCoreSync(readFileSync('src/wasm/sim-core/sim_core_bg.wasm'));

const HALF = 40;
const REPS = 200;

let seed = 987654321;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

/** A crowd packed round the middle, with a few sizes and some dead bodies (alive = 0). */
function crowd(n: number) {
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  const r = new Float64Array(n);
  const alive = new Uint8Array(n);
  const spread = Math.sqrt(n) * 0.55;
  let widest = 0;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * spread;
    x[i] = Math.cos(a) * d;
    z[i] = Math.sin(a) * d;
    r[i] = 0.4 + (i % 7 === 0 ? 0.35 : 0) + (i % 31 === 0 ? 0.9 : 0);
    alive[i] = i % 13 === 5 ? 0 : 1;
    if (alive[i] === 1 && r[i]! > widest) widest = r[i]!;
  }
  return { x, z, r, alive, widest };
}

const sameBits = (a: Float64Array, b: Float64Array): number => {
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) diff++;
  return diff;
};

let failed = false;
console.log(
  'bodies   bits differ   ts ms/call   rust slices ms   rust in-memory ms   (best of 3 runs of ' +
    REPS +
    ' calls)',
);
for (const n of [100, 300, 1000, 3000]) {
  const c = crowd(n);

  // Bit-for-bit: five successive calls, TypeScript against Rust (slices and in-memory).
  const tx = c.x.slice();
  const tz = c.z.slice();
  const scratch = newSeparationScratch();
  const rs = new Separation();
  const sx = c.x.slice();
  const sz = c.z.slice();
  const ms = new Separation();
  ms.reserve(n);
  const view = () => ({
    x: new Float64Array(simCoreMemory().buffer, ms.x_ptr() as unknown as number, n),
    z: new Float64Array(simCoreMemory().buffer, ms.z_ptr() as unknown as number, n),
    r: new Float64Array(simCoreMemory().buffer, ms.radius_ptr() as unknown as number, n),
    alive: new Uint8Array(simCoreMemory().buffer, ms.alive_ptr() as unknown as number, n),
  });
  let v = view();
  v.x.set(c.x);
  v.z.set(c.z);
  v.r.set(c.r);
  v.alive.set(c.alive);
  for (let k = 0; k < 5; k++) {
    separate(scratch, tx, tz, c.r, c.alive, n, HALF, c.widest);
    rs.run_slices(sx, sz, c.r, c.alive, n, HALF, c.widest);
    ms.run(n, HALF, c.widest);
  }
  v = view();
  const differ = sameBits(tx, sx) + sameBits(tz, sz) + sameBits(tx, v.x) + sameBits(tz, v.z);
  if (differ > 0) failed = true;

  // Timing: restore the positions, then one call, REPS times; best of three runs.
  const best = (run: () => void): number => {
    let b = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      for (let r = 0; r < REPS; r++) run();
      b = Math.min(b, (performance.now() - t0) / REPS);
    }
    return b;
  };
  const wx = c.x.slice();
  const wz = c.z.slice();
  const msTs = best(() => {
    wx.set(c.x);
    wz.set(c.z);
    separate(scratch, wx, wz, c.r, c.alive, n, HALF, c.widest);
  });
  const msSlices = best(() => {
    sx.set(c.x);
    sz.set(c.z);
    rs.run_slices(sx, sz, c.r, c.alive, n, HALF, c.widest);
  });
  const msMem = best(() => {
    const w = view();
    w.x.set(c.x);
    w.z.set(c.z);
    ms.run(n, HALF, c.widest);
  });
  console.log(
    `${String(n).padStart(6)} ${String(differ).padStart(12)} ${msTs.toFixed(3).padStart(12)} ${msSlices.toFixed(3).padStart(16)} ${msMem.toFixed(3).padStart(19)}`,
  );
}
console.log(
  failed ? 'FAIL: the Rust kernel differs from the TypeScript' : 'OK: bit for bit identical',
);
if (failed) process.exitCode = 1;
