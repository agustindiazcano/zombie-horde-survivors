// Compares the flat kernels of src/sim/kernels.ts (TypeScript) with their Rust copy bit for bit, and
// times both on the same data: npm run check:kernels
import { readFileSync } from 'node:fs';
import map1 from '../data/maps/map-1.json';
import { arenaOf, parseMap, resolveStaticReference, type Arena } from '../src/sim';
import { STEP_UP } from '../src/sim/constants';
import { hypot, hypot3 } from '../src/sim/vec';
import {
  flatObstacles,
  flowSearch,
  newFlowScratch,
  newSeparationScratch,
  resolveWalls,
  separate,
} from '../src/sim/kernels';
import {
  FlowSearch,
  Separation,
  Walls,
  loadSimCoreSync,
  sim_hypot,
  sim_hypot3,
  simCoreMemory,
} from '../src/wasm/simCore';

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
for (const n of [100, 300, 1000, 2000, 5000, 10000]) {
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
// The flow field search: walls and breakable cells at random, a few targets.
console.log(
  '\ngrid     bits differ   ts ms/call   rust slices ms   rust in-memory ms   (a search from 5 targets)',
);
for (const n of [80, 160, 320]) {
  const cells = new Uint8Array(n * n);
  const extra = new Float32Array(n * n);
  for (let w = 0; w < n * 2; w++) {
    // Walls: short runs, some horizontal and some vertical; a few breakable cells with a cost.
    const horizontal = rnd() < 0.5;
    const len = 3 + Math.floor(rnd() * 14);
    const cx = Math.floor(rnd() * n);
    const cz = Math.floor(rnd() * n);
    const breakable = rnd() < 0.15;
    for (let k = 0; k < len; k++) {
      const x = horizontal ? Math.min(cx + k, n - 1) : cx;
      const z = horizontal ? cz : Math.min(cz + k, n - 1);
      cells[z * n + x] = breakable ? 2 : 1;
      if (breakable) extra[z * n + x] = 3 + Math.floor(rnd() * 8) * 0.5;
    }
  }
  const targets = new Int32Array(5);
  for (let t = 0; t < 5; t++) {
    let c = Math.floor(rnd() * n * n);
    while (cells[c] === 1) c = Math.floor(rnd() * n * n);
    targets[t] = c;
  }

  const h = newFlowScratch();
  const distTs = new Float64Array(n * n);
  flowSearch(h, n, cells, extra, distTs, targets, 5);

  const fs = new FlowSearch();
  const distSlices = new Float64Array(n * n);
  fs.run_slices(n, cells, extra, distSlices, targets, 5);

  const fm = new FlowSearch();
  fm.reserve(n, 5);
  const mem = () => simCoreMemory().buffer;
  const mCells = () => new Uint8Array(mem(), fm.cells_ptr() as unknown as number, n * n);
  const mExtra = () => new Float32Array(mem(), fm.extra_ptr() as unknown as number, n * n);
  const mDist = () => new Float64Array(mem(), fm.dist_ptr() as unknown as number, n * n);
  const mTargets = () => new Int32Array(mem(), fm.targets_ptr() as unknown as number, 5);
  mCells().set(cells);
  mExtra().set(extra);
  mTargets().set(targets);
  fm.run(n, 5);
  const differ = sameBits(distTs, distSlices) + sameBits(distTs, mDist());
  if (differ > 0) failed = true;

  const reps = n >= 320 ? 20 : 100;
  const best = (run: () => void): number => {
    let b = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      for (let r = 0; r < reps; r++) run();
      b = Math.min(b, (performance.now() - t0) / reps);
    }
    return b;
  };
  const msTs = best(() => flowSearch(h, n, cells, extra, distTs, targets, 5));
  const msSlices = best(() => fs.run_slices(n, cells, extra, distSlices, targets, 5));
  // In memory the walls stay uploaded; each search sets the targets and runs, and reads `dist` in place.
  const msMem = best(() => {
    mTargets().set(targets);
    fm.run(n, 5);
  });
  console.log(
    `${(n + 'x' + n).padStart(7)} ${String(differ).padStart(12)} ${msTs.toFixed(3).padStart(12)} ${msSlices.toFixed(3).padStart(16)} ${msMem.toFixed(3).padStart(19)}`,
  );
}

// Wall collisions: the original per-body `resolveStatic`, the flat TypeScript kernel and the Rust one.
console.log(
  '\nwalls   bodies   bits differ (flat TS, Rust vs original)   original ms   flat TS ms   Rust ms',
);
const map1Arena = arenaOf(parseMap(map1)) as Arena;
const boxy = (count: number): Arena => {
  // Boxes of every size, some water, some low and some tall, over a 160 m arena.
  const obstacles = [];
  for (let b = 0; b < count; b++) {
    obstacles.push({
      x: (rnd() - 0.5) * 150,
      z: (rnd() - 0.5) * 150,
      halfW: 0.5 + rnd() * 4,
      halfD: 0.5 + rnd() * 4,
      ...(rnd() < 0.2 ? { height: 0.2 } : {}),
      ...(rnd() < 0.1 ? { water: true } : {}),
    });
  }
  return { ...map1Arena, halfSize: 80, obstacles } as Arena;
};
for (const [name, arena, bodies] of [
  ['map 1', map1Arena, 1000],
  ['60 boxes', boxy(60), 1000],
  ['400 boxes', boxy(400), 1000],
  ['400 boxes', boxy(400), 5000],
] as [string, Arena, number][]) {
  const half = arena.halfSize;
  const flat = flatObstacles(arena);
  const px = new Float64Array(bodies);
  const pz = new Float64Array(bodies);
  const pr = new Float64Array(bodies);
  const pf = new Float64Array(bodies);
  const pa = new Uint8Array(bodies);
  for (let i = 0; i < bodies; i++) {
    px[i] = (rnd() - 0.5) * (half * 2.1); // some start outside the arena
    pz[i] = (rnd() - 0.5) * (half * 2.1);
    pr[i] = 0.35 + (i % 5) * 0.12;
    pf[i] = i % 17 === 0 ? 1.2 : 0; // some climbers
    pa[i] = i % 13 === 5 ? 0 : 1;
  }
  const w = new Walls();
  const ox = px.slice();
  const oz = pz.slice();
  for (let i = 0; i < bodies; i++) {
    if (pa[i] === 0) continue;
    const pos = { x: ox[i]!, z: oz[i]! };
    resolveStaticReference(pos, pr[i]!, arena, pf[i]!);
    ox[i] = pos.x;
    oz[i] = pos.z;
  }
  const tx = px.slice();
  const tz = pz.slice();
  resolveWalls(flat, tx, tz, pr, pf, pa, bodies, STEP_UP);
  const rx = px.slice();
  const rz = pz.slice();
  w.set_obstacles(
    flat.id,
    flat.n,
    flat.half,
    flat.count,
    flat.x,
    flat.z,
    flat.halfW,
    flat.halfD,
    flat.top,
    flat.cellStart,
    flat.cellItems,
  );
  w.run_slices(rx, rz, pr, pf, pa, bodies, STEP_UP);
  const differ = sameBits(ox, tx) + sameBits(oz, tz) + sameBits(tx, rx) + sameBits(tz, rz);
  if (differ > 0) failed = true;

  const reps = 100;
  const best = (run: () => void): number => {
    let b = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      for (let r = 0; r < reps; r++) run();
      b = Math.min(b, (performance.now() - t0) / reps);
    }
    return b;
  };
  const wx = px.slice();
  const wz = pz.slice();
  const msOrig = best(() => {
    wx.set(px);
    wz.set(pz);
    for (let i = 0; i < bodies; i++) {
      if (pa[i] === 0) continue;
      const pos = { x: wx[i]!, z: wz[i]! };
      resolveStaticReference(pos, pr[i]!, arena, pf[i]!);
      wx[i] = pos.x;
      wz[i] = pos.z;
    }
  });
  const msTs = best(() => {
    wx.set(px);
    wz.set(pz);
    resolveWalls(flat, wx, wz, pr, pf, pa, bodies, STEP_UP);
  });
  const msRust = best(() => {
    wx.set(px);
    wz.set(pz);
    w.run_slices(wx, wz, pr, pf, pa, bodies, STEP_UP);
  });
  console.log(
    `${name.padEnd(9)} ${String(bodies).padStart(6)} ${String(differ).padStart(34)} ${msOrig.toFixed(3).padStart(14)} ${msTs.toFixed(3).padStart(12)} ${msRust.toFixed(3).padStart(10)}`,
  );
  w.free();
}

// hypot: the simulation's own against V8's Math.hypot and against Rust, over millions of pairs.
{
  const scales = [1e-9, 1e-3, 1, 7, 50, 300, 1e5, 1e12];
  let diffV8 = 0;
  let diffRust = 0;
  let diff3V8 = 0;
  let diff3Rust = 0;
  const N = 2_000_000;
  for (let i = 0; i < N; i++) {
    const s1 = scales[Math.floor(rnd() * scales.length)]!;
    const s2 = scales[Math.floor(rnd() * scales.length)]!;
    const s3 = scales[Math.floor(rnd() * scales.length)]!;
    const a = (rnd() - 0.5) * 2 * s1;
    const b = (rnd() - 0.5) * 2 * s2;
    const c = (rnd() - 0.5) * 2 * s3;
    if (!Object.is(hypot(a, b), Math.hypot(a, b))) diffV8++;
    if (!Object.is(hypot(a, b), sim_hypot(a, b))) diffRust++;
    if (!Object.is(hypot3(a, b, c), Math.hypot(a, b, c))) diff3V8++;
    if (!Object.is(hypot3(a, b, c), sim_hypot3(a, b, c))) diff3Rust++;
  }
  console.log(
    `
hypot over ${N} samples: differs from Math.hypot ${diffV8}, from Rust ${diffRust}; hypot3: from Math.hypot ${diff3V8}, from Rust ${diff3Rust}`,
  );
  if (diffV8 + diffRust + diff3V8 + diff3Rust > 0) failed = true;
}

console.log(
  failed ? 'FAIL: the Rust kernel differs from the TypeScript' : 'OK: bit for bit identical',
);
if (failed) process.exitCode = 1;
