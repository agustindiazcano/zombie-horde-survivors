import type { GameConfig } from './config';

/** The numbers of the wave ocean (`ocean` in game.json, overridden by the map). */
export type OceanParams = GameConfig['ocean'];

const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = 2 * Math.PI * (1 - 1 / PHI);
/** How many waves are summed; the render shader uses the same eight. */
export const WAVE_COUNT = 8;
/** Pulls the wave directions towards +z so the swell has a main heading. */
const HEADING = 0.38;
const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21];
/** JONSWAP: gravity, the peak enhancement and the two widths of the peak. */
const GRAVITY = 9.81;
const JON_GAMMA = 3.3;
const JON_SIGMA_LOW = 0.07;
const JON_SIGMA_HIGH = 0.09;
/** The eight components sit on a log scale from 0.7 to about 9 times the peak wavenumber. */
const JON_START = 0.7;
const JON_RATIO = 1.45;

/**
 * Eight components of a JONSWAP spectrum: wavenumbers `k_i = kp * 0.7 * 1.45^i`, `omega = sqrt(g k)`,
 * `S(omega) = omega^-5 exp(-1.25 (omegaP/omega)^4) gamma^r` with `r = exp(-(omega - omegaP)^2 / (2 sigma^2 omegaP^2))`
 * (sigma 0.07 below the peak, 0.09 above), and amplitude `sqrt(S * omega)` (the band is proportional to
 * omega on a log scale). The amplitudes are scaled so the biggest one equals `waveHeight`.
 */
function jonswap(o: OceanParams): { k: number[]; amp: number[] } {
  const wp = Math.sqrt(GRAVITY * o.frequency);
  const k: number[] = [];
  const raw: number[] = [];
  for (let i = 0; i < WAVE_COUNT; i++) {
    const ki = o.frequency * JON_START * Math.pow(JON_RATIO, i);
    const w = Math.sqrt(GRAVITY * ki);
    const sigma = w <= wp ? JON_SIGMA_LOW : JON_SIGMA_HIGH;
    const r = Math.exp(-((w - wp) * (w - wp)) / (2 * sigma * sigma * wp * wp));
    const s = Math.pow(w, -5) * Math.exp(-1.25 * Math.pow(wp / w, 4)) * Math.pow(JON_GAMMA, r);
    k.push(ki);
    raw.push(Math.sqrt(s * w));
  }
  const top = Math.max(...raw);
  return { k, amp: raw.map((a) => (a / top) * o.waveHeight * (1 + 0.9 * o.wind)) };
}

/** The eight waves of an ocean: unit direction, height, frequency, speed, crest pressure and phase. */
export interface WaveTable {
  dx: Float64Array;
  dz: Float64Array;
  amp: Float64Array;
  freq: Float64Array;
  speed: Float64Array;
  pressure: Float64Array;
  phase: Float64Array;
}

/** A small seeded generator (integer maths only, so it gives the same numbers everywhere). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTable(o: OceanParams): WaveTable {
  const table: WaveTable = {
    dx: new Float64Array(WAVE_COUNT),
    dz: new Float64Array(WAVE_COUNT),
    amp: new Float64Array(WAVE_COUNT),
    freq: new Float64Array(WAVE_COUNT),
    speed: new Float64Array(WAVE_COUNT),
    pressure: new Float64Array(WAVE_COUNT),
    phase: new Float64Array(WAVE_COUNT),
  };
  const rnd = mulberry32(o.seed);
  const swell = o.pattern === 'swell';
  const jon = o.pattern === 'jonswap' ? jonswap(o) : null;
  // Swell ridges stay tall and spread out in size; the other patterns shrink fast so small waves ride the big ones.
  const ampStep = swell ? 0.82 : (1 / PHI) * 1.18;
  const freqStep = swell ? 1.18 : PHI * 0.88;
  // Wind raises the waves and speeds them up.
  let amp = o.waveHeight * (1 + 0.9 * o.wind);
  let freq = o.frequency;
  let speed = o.speed * (1 + 0.35 * o.wind);
  let pressure = o.pressure;
  for (let i = 0; i < WAVE_COUNT; i++) {
    // Five draws per wave whatever the pattern, so changing one setting never shifts the others.
    const r1 = rnd();
    const r2 = rnd();
    const r3 = rnd();
    const r4 = rnd();
    const r5 = rnd();
    let angle: number;
    if (o.pattern === 'fibonacci') angle = FIBONACCI[i]! * GOLDEN_ANGLE;
    else if (o.pattern === 'random') angle = r1 * Math.PI * 2;
    else if (swell) angle = o.heading + (r1 - 0.5) * 2 * o.spread;
    // Higher frequencies spread wider round the wind's heading.
    else if (jon)
      angle = o.heading + (r1 - 0.5) * 2 * Math.min(o.spread * (1 + 0.35 * i), Math.PI / 2);
    else if (o.pattern === 'custom' && o.sequence.length > 0)
      angle = (o.sequence[i % o.sequence.length]! * Math.PI) / 180;
    else angle = i * GOLDEN_ANGLE;
    angle += o.chaos * (r2 - 0.5) * (Math.PI / 2);
    // Golden, Fibonacci and random layouts lean towards +z; swell and custom go exactly where told.
    const pull = swell || jon || o.pattern === 'custom' ? 0 : HEADING;
    const x = Math.cos(angle) * (1 - pull);
    const z = Math.sin(angle) * (1 - pull) + pull;
    const len = Math.hypot(x, z);
    table.dx[i] = x / len;
    table.dz[i] = z / len;
    table.amp[i] = (jon ? jon.amp[i]! : amp) * (1 + o.chaos * (r3 - 0.5) * 0.8);
    const f = (jon ? jon.k[i]! : freq) * (1 + o.chaos * (r4 - 0.5) * 0.3);
    table.freq[i] = f;
    // Swell follows deep-water dispersion (speed grows with the square root of the frequency).
    table.speed[i] =
      swell || jon ? o.speed * (1 + 0.35 * o.wind) * Math.sqrt(f / o.frequency) : speed;
    table.pressure[i] = pressure;
    // A spectrum has random phases by nature; the other patterns only when chaos asks for it.
    table.phase[i] = (jon ? 1 : o.chaos) * r5 * Math.PI * 2;
    amp *= ampStep;
    freq *= freqStep;
    speed *= 1.12;
    pressure *= 1.08;
  }
  return table;
}

let snap: OceanParams | null = null;
let cachedTable: WaveTable | null = null;

const sameWaves = (a: OceanParams, b: OceanParams): boolean =>
  a.pattern === b.pattern &&
  a.seed === b.seed &&
  a.chaos === b.chaos &&
  a.heading === b.heading &&
  a.spread === b.spread &&
  a.sequence === b.sequence &&
  a.waveHeight === b.waveHeight &&
  a.frequency === b.frequency &&
  a.speed === b.speed &&
  a.wind === b.wind &&
  a.pressure === b.pressure;

/** The waves of these ocean numbers. Cached: the table is rebuilt only when a number that shapes it changes. */
export function waveTable(o: OceanParams): WaveTable {
  if (cachedTable && snap && sameWaves(snap, o)) return cachedTable;
  snap = { ...o };
  cachedTable = buildTable(o);
  return cachedTable;
}

/** Metres per second of current the wind adds at full strength (towards +x, like the sky's wind). */
const WIND_CURRENT = 3;

/** The steady current (m/s) as (x, z): the map's current plus what the wind pushes. */
export function currentVector(o: OceanParams, out: { x: number; z: number }): void {
  out.x = Math.cos(o.currentAngle) * o.currentSpeed + WIND_CURRENT * o.wind;
  out.z = Math.sin(o.currentAngle) * o.currentSpeed;
}

const currentScratch = { x: 0, z: 0 };

/** Spiral growth of a whirlpool: `2 ln(phi) / pi` (the golden spiral's pitch). */
const K_SPIRAL = (2 * Math.log(PHI)) / Math.PI;
/** Keeps the funnel and the speeds finite at the centre. */
const VORTEX_SAT = 0.25;

const smooth01 = (x: number): number => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * How much the whirlpools of `o` move the surface (m) at (x, z): a funnel `-20 s / (1 + (r/R)^1.65 + 0.25)`
 * plus a three-armed golden spiral wave that turns with the time. `rn` is the distance scaled so
 * a radius of 14.5 m gives the shape of the original demo.
 */
export function vortexHeight(o: OceanParams, x: number, z: number, t: number): number {
  let h = 0;
  for (const v of o.vortices) {
    const dx = x - v.x;
    const dz = z - v.z;
    const r = Math.hypot(dx, dz);
    const rn = (r * 14.5) / v.radius;
    const funnel = (-20 * v.strength) / (1 + Math.pow(r / v.radius, 1.65) + VORTEX_SAT);
    const phase = 3 * Math.atan2(dz, dx) + rn * K_SPIRAL * 0.85 - t * 3.4;
    h +=
      funnel + Math.sin(phase) * 1.2 * v.strength * Math.exp(-rn * 0.025) * smooth01((rn - 2) / 12);
  }
  return h;
}

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
  currentVector(o, currentScratch);
  const cx = currentScratch.x * t * 0.12;
  const cz = currentScratch.z * t * 0.12;
  const w = waveTable(o);
  let sum = 0;
  for (let i = 0; i < WAVE_COUNT; i++) {
    const phase =
      ((x - cx) * w.dx[i]! + (z - cz) * w.dz[i]!) * w.freq[i]! + t * w.speed[i]! + w.phase[i]!;
    const s = Math.sin(phase);
    const smooth = s + o.silk * 0.8 * Math.cos(phase * 2);
    const sharp = (Math.pow(1 - Math.abs(s), w.pressure[i]!) - 0.45) * 2.15;
    sum += (smooth * (1 - o.hooke) + sharp * o.hooke) * w.amp[i]!;
  }
  return level + (sum + vortexHeight(o, x, z, t)) * fade * (1 - o.frozen);
}

/** The speed of the water (m/s) at a point: the steady current. Written into `out` as (x, z). */
export function oceanFlow(o: OceanParams, out: { x: number; z: number }): void {
  currentVector(o, out);
  out.x *= 1 - o.frozen;
  out.z *= 1 - o.frozen;
}

/**
 * The speed of the water (m/s) at (x, z): the steady current plus each whirlpool's swirl
 * (tangential `28 s / sqrt(r)` and an inward radial part `K_SPIRAL * 1.35` times as big). Written into `out`.
 */
export function oceanFlowAt(
  o: OceanParams,
  x: number,
  z: number,
  out: { x: number; z: number },
): void {
  oceanFlow(o, out);
  for (const v of o.vortices) {
    const dx = x - v.x;
    const dz = z - v.z;
    const r = Math.hypot(dx, dz);
    const rn = (r * 14.5) / v.radius;
    if (v.strength <= 0.01 || rn >= 95) continue;
    const rSafe = Math.sqrt(rn * rn + (1 / VORTEX_SAT) * 8);
    const tangential = (28 * v.strength) / Math.sqrt(rSafe);
    const radial = tangential * K_SPIRAL * 1.35;
    const c = dx / (r + 0.001);
    const s = dz / (r + 0.001);
    out.x += (-s * tangential - c * radial) * (1 - o.frozen);
    out.z += (c * tangential - s * radial) * (1 - o.frozen);
  }
}
