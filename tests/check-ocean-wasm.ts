// Compares src/sim/ocean.ts (TypeScript) with the Rust / WASM copy over thousands of points: npm run check:ocean-wasm
import { readFileSync } from 'node:fs';
import data from '../data/game.json';
import { oceanFlowAt, oceanHeight, waveTable } from '../src/sim/ocean';
import { loadSimCoreSync } from '../src/wasm/simCore';
import { Ocean, oceanBatch, packOceanParams } from '../src/wasm/oceanWasm';

loadSimCoreSync(readFileSync('src/wasm/sim-core/sim_core_bg.wasm'));

type Params = typeof data.ocean;
const base = data.ocean as Params;
const whirls = [
  { x: 0, z: -30, strength: 1, radius: 14.5 },
  { x: 25, z: 10, strength: 1.6, radius: 30 },
  { x: -40, z: 5, strength: 0.4, radius: 8 },
];
const cases: [string, Record<string, unknown>][] = [
  ['golden (game.json)', {}],
  ['fibonacci', { pattern: 'fibonacci' }],
  ['random, chaos', { pattern: 'random', chaos: 0.7, seed: 4242 }],
  ['swell', { pattern: 'swell', heading: 1.1, spread: 0.4, seed: 99 }],
  ['custom sequence', { pattern: 'custom', sequence: [10, 80, 200], chaos: 0.2 }],
  ['jonswap, wind', { pattern: 'jonswap', wind: 0.8, heading: 0.6, spread: 0.3, seed: 31 }],
  ['golden, whirlpools', { vortices: whirls, silk: 0.6, hooke: 0.2 }],
  ['jonswap, frozen, whirlpool', { pattern: 'jonswap', frozen: 0.4, vortices: [whirls[0]] }],
];

const POINTS = 20000;
let worst = 0;
let failed = false;
console.log('case                           table    height     flow     ts ms  wasm ms  batch ms');
for (const [name, patch] of cases) {
  const o = { ...base, ...patch } as never as Params;
  const wasm = new Ocean();
  wasm.set_params(packOceanParams(o as never));

  // The wave table.
  const t = waveTable(o as never);
  const rows = [t.dx, t.dz, t.amp, t.freq, t.speed, t.pressure, t.phase];
  const wt = wasm.wave_table();
  let dTable = 0;
  rows.forEach((row, r) =>
    row.forEach((v, i) => {
      dTable = Math.max(dTable, Math.abs(v - wt[r * 8 + i]!));
    }),
  );

  // Fixed pseudo-random points (a plain LCG so the run is the same every time).
  let s = 12345;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const xs = new Float64Array(POINTS);
  const zs = new Float64Array(POINTS);
  const ts = new Float64Array(POINTS);
  const gy = new Float64Array(POINTS);
  for (let i = 0; i < POINTS; i++) {
    xs[i] = (rnd() - 0.5) * 200;
    zs[i] = (rnd() - 0.5) * 200;
    ts[i] = rnd() * 300;
    gy[i] = -9 + rnd() * 10; // some points are shallow, some dry
  }

  let dHeight = 0;
  let dFlow = 0;
  const out = { x: 0, z: 0 };
  for (let i = 0; i < POINTS; i++) {
    const a = oceanHeight(o as never, 0, gy[i]!, xs[i]!, zs[i]!, ts[i]!);
    const b = wasm.height(0, gy[i]!, xs[i]!, zs[i]!, ts[i]!);
    dHeight = Math.max(dHeight, Math.abs(a - b));
    oceanFlowAt(o as never, xs[i]!, zs[i]!, out);
    wasm.flow_at(xs[i]!, zs[i]!);
    dFlow = Math.max(dFlow, Math.abs(out.x - wasm.flow_x()), Math.abs(out.z - wasm.flow_z()));
  }

  // Timing: the same loop, nothing else.
  const REPS = 20;
  let sink = 0;
  let t0 = performance.now();
  for (let r = 0; r < REPS; r++)
    for (let i = 0; i < POINTS; i++)
      sink += oceanHeight(o as never, 0, gy[i]!, xs[i]!, zs[i]!, ts[i]!);
  const msTs = performance.now() - t0;
  t0 = performance.now();
  for (let r = 0; r < REPS; r++)
    for (let i = 0; i < POINTS; i++) sink += wasm.height(0, gy[i]!, xs[i]!, zs[i]!, ts[i]!);
  const msWasm = performance.now() - t0;
  // The batch path: rows written in place in the module's memory, one call for all the points.
  const batch = oceanBatch(wasm, POINTS);
  batch.ground.set(gy);
  batch.x.set(xs);
  batch.z.set(zs);
  batch.t.set(ts);
  t0 = performance.now();
  for (let r = 0; r < REPS; r++) wasm.height_batch(0);
  const msBatch = performance.now() - t0;
  let dBatch = 0;
  for (let i = 0; i < POINTS; i++)
    dBatch = Math.max(
      dBatch,
      Math.abs(batch.out[i]! - oceanHeight(o as never, 0, gy[i]!, xs[i]!, zs[i]!, ts[i]!)),
    );
  if (sink === 42) console.log('');

  worst = Math.max(worst, dTable, dHeight, dFlow, dBatch);
  if (dTable > 1e-9 || dHeight > 1e-9 || dFlow > 1e-9 || dBatch > 1e-9) failed = true;
  const f = (v: number) => v.toExponential(1).padStart(8);
  console.log(
    `${name.padEnd(28)} ${f(dTable)} ${f(dHeight)} ${f(dFlow)} ${msTs.toFixed(0).padStart(8)} ${msWasm.toFixed(0).padStart(8)} ${msBatch.toFixed(0).padStart(8)}`,
  );
  wasm.free();
}
console.log(
  `\nlargest difference: ${worst.toExponential(2)} (${POINTS} points per case, height in m, flow in m/s)`,
);
console.log(failed ? 'FAIL: a difference above 1e-9' : 'OK: TypeScript and Rust agree to 1e-9');
if (failed) process.exitCode = 1;
