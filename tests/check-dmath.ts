// The simulation's own maths (src/sim/dmath.ts) against V8's Math.* for accuracy, and (when the Rust
// module is built) against the Rust copy bit for bit: npm run check:dmath
import { readFileSync } from 'node:fs';
import { dcos, dexp, dlog, dpow, dsin, datan2 } from '../src/sim/dmath';
import { d_atan2, d_cos, d_exp, d_log, d_pow, d_sin, loadSimCoreSync } from '../src/wasm/simCore';

loadSimCoreSync(readFileSync('src/wasm/sim-core/sim_core_bg.wasm'));

let seed = 20261024;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

const f64 = new Float64Array(1);
const i64 = new BigInt64Array(f64.buffer);
/** Distance in units in the last place between two doubles (large for different signs or NaNs). */
function ulps(a: number, b: number): number {
  if (Object.is(a, b)) return 0;
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b) ? 0 : Infinity;
  if (a === b) return 0; // +0 and -0
  f64[0] = a;
  const x = i64[0]!;
  f64[0] = b;
  const y = i64[0]!;
  const d = x > y ? x - y : y - x;
  return Number(d);
}

interface Row {
  name: string;
  equal: number;
  within1: number;
  worst: number;
  n: number;
  rustDiffers: number;
}
const rows: Row[] = [];
function check(
  name: string,
  mine: (...a: number[]) => number,
  ref: (...a: number[]) => number,
  rust: (...a: number[]) => number,
  gen: () => number[],
  n = 1_000_000,
) {
  let equal = 0;
  let within1 = 0;
  let worst = 0;
  let rustDiffers = 0;
  for (let i = 0; i < n; i++) {
    const a = gen();
    const m = mine(...a);
    if (!Object.is(m, rust(...a))) rustDiffers++;
    const u = ulps(m, ref(...a));
    if (u === 0) equal++;
    if (u <= 1) within1++;
    if (u > worst) worst = u;
  }
  rows.push({ name, equal, within1, worst, n, rustDiffers });
}

check('sin small', dsin, Math.sin, d_sin, () => [(rnd() - 0.5) * 6.4]);
check('sin 200', dsin, Math.sin, d_sin, () => [(rnd() - 0.5) * 400]);
check('sin 1e5', dsin, Math.sin, d_sin, () => [(rnd() - 0.5) * 2e5]);
check('cos small', dcos, Math.cos, d_cos, () => [(rnd() - 0.5) * 6.4]);
check('cos 200', dcos, Math.cos, d_cos, () => [(rnd() - 0.5) * 400]);
check('cos 1e5', dcos, Math.cos, d_cos, () => [(rnd() - 0.5) * 2e5]);
check('atan2', datan2, Math.atan2, d_atan2, () => [(rnd() - 0.5) * 100, (rnd() - 0.5) * 100]);
check('atan2 wide', datan2, Math.atan2, d_atan2, () => [
  (rnd() - 0.5) * 1e6 * rnd(),
  (rnd() - 0.5) * 1e-3 * rnd(),
]);
check('exp', dexp, Math.exp, d_exp, () => [(rnd() - 0.5) * 40]);
check('exp small', dexp, Math.exp, d_exp, () => [(rnd() - 0.5) * 0.5]);
check('log', dlog, Math.log, d_log, () => [rnd() * 100 + 1e-9]);
check('log wide', dlog, Math.log, d_log, () => [Math.exp((rnd() - 0.5) * 600)]);
check('pow game', dpow, Math.pow, d_pow, () => [rnd(), 0.3 + rnd() * 3]);
check('pow wide', dpow, Math.pow, d_pow, () => [rnd() * 50, (rnd() - 0.5) * 8]);

console.log('function      equal to V8   within 1 ulp   worst (ulps)   Rust differs');
for (const r of rows) {
  console.log(
    `${r.name.padEnd(12)} ${((r.equal / r.n) * 100).toFixed(2).padStart(9)}% ${((r.within1 / r.n) * 100).toFixed(2).padStart(11)}% ${String(r.worst).padStart(12)} ${String(r.rustDiffers).padStart(14)}`,
  );
}

// Special values.
const specials: [string, number, number][] = [
  ['sin(0)', dsin(0), 0],
  ['sin(-0)', dsin(-0), -0],
  ['cos(0)', dcos(0), 1],
  ['sin(pi/2)', dsin(Math.PI / 2), 1],
  ['cos(pi)', dcos(Math.PI), -1],
  ['atan2(0,-1)', datan2(0, -1), Math.PI],
  ['atan2(-0,-1)', datan2(-0, -1), -Math.PI],
  ['atan2(1,0)', datan2(1, 0), Math.PI / 2],
  ['atan2(Inf,Inf)', datan2(Infinity, Infinity), Math.PI / 4],
  ['exp(0)', dexp(0), 1],
  ['exp(1000)', dexp(1000), Infinity],
  ['exp(-1000)', dexp(-1000), 0],
  ['log(1)', dlog(1), 0],
  ['log(0)', dlog(0), -Infinity],
  ['log(-1)', dlog(-1), NaN],
  ['pow(2,10)', dpow(2, 10), 1024],
  ['pow(0,2)', dpow(0, 2), 0],
  ['pow(-2,3)', dpow(-2, 3), -8],
  ['pow(5,0)', dpow(5, 0), 1],
];
let bad = 0;
for (const [name, got, want] of specials) {
  const tol = ulps(got, want);
  if (tol > 4) {
    bad++;
    console.log(`SPECIAL MISMATCH ${name}: got ${got}, want ${want}`);
  }
}
console.log(bad === 0 ? 'OK: special values' : `FAIL: ${bad} special values`);
if (rows.some((r) => r.rustDiffers > 0))
  console.log('FAIL: the Rust copy differs from the TypeScript');
else console.log('OK: the Rust copy is bit for bit identical to the TypeScript');
if (bad > 0 || rows.some((r) => r.worst > 4 || r.rustDiffers > 0)) process.exitCode = 1;
