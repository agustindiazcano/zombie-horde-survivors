//! Rust / WebAssembly copy of `src/sim/ocean.ts`. The TypeScript file stays as the reference and the
//! fallback; `npm run check:ocean-wasm` compares the two. Same formulas, same five seeded draws per
//! wave, same order of operations, so the only differences are in the last bits of `sin`, `exp`, `pow`.
//!
//! The ocean numbers come in as one flat `Float64Array` (see `PARAM_COUNT` and the `P_*` indices);
//! `src/sim/oceanWasm.ts` builds it from the `ocean` block of `game.json`.

use wasm_bindgen::prelude::*;

pub mod kernels;

const WAVE_COUNT: usize = 8;
const MAX_VORTICES: usize = 3;

// Layout of the parameter array.
const P_WAVE_HEIGHT: usize = 0;
const P_FREQUENCY: usize = 1;
const P_SPEED: usize = 2;
const P_PRESSURE: usize = 3;
const P_HOOKE: usize = 4;
const P_SILK: usize = 5;
const P_SHORE_FADE: usize = 6;
const P_CURRENT_SPEED: usize = 7;
const P_CURRENT_ANGLE: usize = 8;
/// 0 golden (the default branch), 1 fibonacci, 2 random, 3 swell, 4 custom, 5 jonswap.
const P_PATTERN: usize = 9;
const P_SEED: usize = 10;
const P_CHAOS: usize = 11;
const P_FROZEN: usize = 12;
const P_WIND: usize = 13;
const P_HEADING: usize = 14;
const P_SPREAD: usize = 15;
const P_SEQ_LEN: usize = 16;
const P_SEQ: usize = 17; // 8 numbers
const P_VORTEX_COUNT: usize = 25;
const P_VORTEX: usize = 26; // x, z, strength, radius, three times
/// How many numbers `set_params` expects.
pub const PARAM_COUNT: usize = P_VORTEX + MAX_VORTICES * 4;

const PATTERN_FIBONACCI: u32 = 1;
const PATTERN_RANDOM: u32 = 2;
const PATTERN_SWELL: u32 = 3;
const PATTERN_CUSTOM: u32 = 4;
const PATTERN_JONSWAP: u32 = 5;

const PI: f64 = std::f64::consts::PI;
const PHI: f64 = 1.618033988749895; // (1 + sqrt(5)) / 2, the same double as in TypeScript
const HEADING: f64 = 0.38;
const FIBONACCI: [f64; 8] = [1.0, 1.0, 2.0, 3.0, 5.0, 8.0, 13.0, 21.0];
const GRAVITY: f64 = 9.81;
const JON_GAMMA: f64 = 3.3;
const JON_SIGMA_LOW: f64 = 0.07;
const JON_SIGMA_HIGH: f64 = 0.09;
const JON_START: f64 = 0.7;
const JON_RATIO: f64 = 1.45;
const WIND_CURRENT: f64 = 3.0;
const VORTEX_SAT: f64 = 0.25;

fn golden_angle() -> f64 {
    2.0 * PI * (1.0 - 1.0 / PHI)
}

fn k_spiral() -> f64 {
    (2.0 * PHI.ln()) / PI
}

fn smooth01(x: f64) -> f64 {
    let t = x.max(0.0).min(1.0);
    t * t * (3.0 - 2.0 * t)
}

/// `Math.hypot` of two numbers.
fn hypot(a: f64, b: f64) -> f64 {
    a.hypot(b)
}

/// The seeded generator of the TypeScript side (`mulberry32`), in wrapping `u32` maths.
struct Mulberry32(u32);

impl Mulberry32 {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6d2b79f5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
}

#[derive(Clone, Copy, Default)]
struct Table {
    dx: [f64; WAVE_COUNT],
    dz: [f64; WAVE_COUNT],
    amp: [f64; WAVE_COUNT],
    freq: [f64; WAVE_COUNT],
    speed: [f64; WAVE_COUNT],
    pressure: [f64; WAVE_COUNT],
    phase: [f64; WAVE_COUNT],
}

#[derive(Clone, Copy)]
struct Vortex {
    x: f64,
    z: f64,
    strength: f64,
    radius: f64,
}

/// Eight components of a JONSWAP spectrum (see `jonswap` in `ocean.ts`).
fn jonswap(p: &[f64; PARAM_COUNT]) -> ([f64; WAVE_COUNT], [f64; WAVE_COUNT]) {
    let frequency = p[P_FREQUENCY];
    let wp = (GRAVITY * frequency).sqrt();
    let mut k = [0.0; WAVE_COUNT];
    let mut raw = [0.0; WAVE_COUNT];
    for i in 0..WAVE_COUNT {
        let ki = frequency * JON_START * JON_RATIO.powf(i as f64);
        let w = (GRAVITY * ki).sqrt();
        let sigma = if w <= wp {
            JON_SIGMA_LOW
        } else {
            JON_SIGMA_HIGH
        };
        let r = (-((w - wp) * (w - wp)) / (2.0 * sigma * sigma * wp * wp)).exp();
        let s = w.powf(-5.0) * (-1.25 * (wp / w).powf(4.0)).exp() * JON_GAMMA.powf(r);
        k[i] = ki;
        raw[i] = (s * w).sqrt();
    }
    let top = raw.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let mut amp = [0.0; WAVE_COUNT];
    for i in 0..WAVE_COUNT {
        amp[i] = (raw[i] / top) * p[P_WAVE_HEIGHT] * (1.0 + 0.9 * p[P_WIND]);
    }
    (k, amp)
}

fn build_table(p: &[f64; PARAM_COUNT]) -> Table {
    let pattern = p[P_PATTERN] as u32;
    let chaos = p[P_CHAOS];
    let wind = p[P_WIND];
    let heading = p[P_HEADING];
    let spread = p[P_SPREAD];
    let seq_len = p[P_SEQ_LEN] as usize;
    let mut table = Table::default();
    let mut rnd = Mulberry32(p[P_SEED] as u32);
    let swell = pattern == PATTERN_SWELL;
    let jon = if pattern == PATTERN_JONSWAP {
        Some(jonswap(p))
    } else {
        None
    };
    let amp_step = if swell { 0.82 } else { (1.0 / PHI) * 1.18 };
    let freq_step = if swell { 1.18 } else { PHI * 0.88 };
    let mut amp = p[P_WAVE_HEIGHT] * (1.0 + 0.9 * wind);
    let mut freq = p[P_FREQUENCY];
    let mut speed = p[P_SPEED] * (1.0 + 0.35 * wind);
    let mut pressure = p[P_PRESSURE];
    for i in 0..WAVE_COUNT {
        // Five draws per wave whatever the pattern.
        let r1 = rnd.next();
        let r2 = rnd.next();
        let r3 = rnd.next();
        let r4 = rnd.next();
        let r5 = rnd.next();
        let mut angle = if pattern == PATTERN_FIBONACCI {
            FIBONACCI[i] * golden_angle()
        } else if pattern == PATTERN_RANDOM {
            r1 * PI * 2.0
        } else if swell {
            heading + (r1 - 0.5) * 2.0 * spread
        } else if jon.is_some() {
            heading + (r1 - 0.5) * 2.0 * (spread * (1.0 + 0.35 * i as f64)).min(PI / 2.0)
        } else if pattern == PATTERN_CUSTOM && seq_len > 0 {
            (p[P_SEQ + i % seq_len] * PI) / 180.0
        } else {
            i as f64 * golden_angle()
        };
        angle += chaos * (r2 - 0.5) * (PI / 2.0);
        let pull = if swell || jon.is_some() || pattern == PATTERN_CUSTOM {
            0.0
        } else {
            HEADING
        };
        let x = angle.cos() * (1.0 - pull);
        let z = angle.sin() * (1.0 - pull) + pull;
        let len = hypot(x, z);
        table.dx[i] = x / len;
        table.dz[i] = z / len;
        let base_amp = match &jon {
            Some((_, a)) => a[i],
            None => amp,
        };
        table.amp[i] = base_amp * (1.0 + chaos * (r3 - 0.5) * 0.8);
        let base_freq = match &jon {
            Some((k, _)) => k[i],
            None => freq,
        };
        let f = base_freq * (1.0 + chaos * (r4 - 0.5) * 0.3);
        table.freq[i] = f;
        table.speed[i] = if swell || jon.is_some() {
            p[P_SPEED] * (1.0 + 0.35 * wind) * (f / p[P_FREQUENCY]).sqrt()
        } else {
            speed
        };
        table.pressure[i] = pressure;
        let phase_scale = if jon.is_some() { 1.0 } else { chaos };
        table.phase[i] = phase_scale * r5 * PI * 2.0;
        amp *= amp_step;
        freq *= freq_step;
        speed *= 1.12;
        pressure *= 1.08;
    }
    table
}

/// The numbers that shape the eight waves (everything but the current, the shore and the vortices).
fn shapes_waves(a: &[f64; PARAM_COUNT], b: &[f64; PARAM_COUNT]) -> bool {
    let same = |i: usize| a[i] == b[i];
    [
        P_PATTERN,
        P_SEED,
        P_CHAOS,
        P_HEADING,
        P_SPREAD,
        P_SEQ_LEN,
        P_WAVE_HEIGHT,
        P_FREQUENCY,
        P_SPEED,
        P_WIND,
        P_PRESSURE,
    ]
    .iter()
    .all(|&i| same(i))
        && (0..8).all(|i| same(P_SEQ + i))
}

/// One ocean: the parameters, its wave table and the last flow asked for.
#[wasm_bindgen]
pub struct Ocean {
    p: [f64; PARAM_COUNT],
    table: Table,
    ready: bool,
    vortices: Vec<Vortex>,
    flow_x: f64,
    flow_z: f64,
    /// Batch buffer: ground, x, z, t, out (n numbers each), read and written from JavaScript in place.
    batch: Vec<f64>,
    batch_n: usize,
}

#[wasm_bindgen]
impl Ocean {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Ocean {
        let p = [0.0; PARAM_COUNT];
        Ocean {
            p,
            table: Table::default(),
            ready: false,
            vortices: Vec::new(),
            flow_x: 0.0,
            flow_z: 0.0,
            batch: Vec::new(),
            batch_n: 0,
        }
    }

    /// How many numbers `set_params` wants.
    pub fn param_count() -> usize {
        PARAM_COUNT
    }

    /// Loads the ocean numbers. The wave table is rebuilt only when a number that shapes it changed.
    pub fn set_params(&mut self, params: &[f64]) {
        if params.len() < PARAM_COUNT {
            return;
        }
        let mut next = [0.0; PARAM_COUNT];
        next.copy_from_slice(&params[..PARAM_COUNT]);
        if !self.ready || !shapes_waves(&self.p, &next) {
            self.table = build_table(&next);
            self.ready = true;
        }
        self.p = next;
        let n = (self.p[P_VORTEX_COUNT] as usize).min(MAX_VORTICES);
        self.vortices.clear();
        for v in 0..n {
            let o = P_VORTEX + v * 4;
            self.vortices.push(Vortex {
                x: self.p[o],
                z: self.p[o + 1],
                strength: self.p[o + 2],
                radius: self.p[o + 3],
            });
        }
    }

    /// Metres per second of steady current as (x, z): the map's current plus what the wind pushes.
    fn current(&self) -> (f64, f64) {
        let angle = self.p[P_CURRENT_ANGLE];
        let speed = self.p[P_CURRENT_SPEED];
        (
            angle.cos() * speed + WIND_CURRENT * self.p[P_WIND],
            angle.sin() * speed,
        )
    }

    /// How much the whirlpools move the surface (m) at (x, z) and time `t`.
    pub fn vortex_height(&self, x: f64, z: f64, t: f64) -> f64 {
        let mut h = 0.0;
        for v in &self.vortices {
            let dx = x - v.x;
            let dz = z - v.z;
            let r = hypot(dx, dz);
            let rn = (r * 14.5) / v.radius;
            let funnel = (-20.0 * v.strength) / (1.0 + (r / v.radius).powf(1.65) + VORTEX_SAT);
            let phase = 3.0 * dz.atan2(dx) + rn * k_spiral() * 0.85 - t * 3.4;
            h += funnel
                + phase.sin()
                    * 1.2
                    * v.strength
                    * (-rn * 0.025).exp()
                    * smooth01((rn - 2.0) / 12.0);
        }
        h
    }

    /// 0 where the ground is at the water level or above, 1 once the water is deep enough.
    pub fn wave_fade(&self, level: f64, ground_y: f64) -> f64 {
        ((level + self.p[P_SHORE_FADE] - ground_y) * 0.15)
            .max(0.0)
            .min(1.0)
    }

    /// Height of the water surface (m) at (x, z) and time `t`.
    pub fn height(&self, level: f64, ground_y: f64, x: f64, z: f64, t: f64) -> f64 {
        let fade = self.wave_fade(level, ground_y);
        if fade <= 0.0 {
            return level;
        }
        let (cvx, cvz) = self.current();
        let cx = cvx * t * 0.12;
        let cz = cvz * t * 0.12;
        let w = &self.table;
        let silk = self.p[P_SILK];
        let hooke = self.p[P_HOOKE];
        let mut sum = 0.0;
        for i in 0..WAVE_COUNT {
            let phase =
                ((x - cx) * w.dx[i] + (z - cz) * w.dz[i]) * w.freq[i] + t * w.speed[i] + w.phase[i];
            let s = phase.sin();
            let smooth = s + silk * 0.8 * (phase * 2.0).cos();
            let sharp = ((1.0 - s.abs()).powf(w.pressure[i]) - 0.45) * 2.15;
            sum += (smooth * (1.0 - hooke) + sharp * hooke) * w.amp[i];
        }
        level + (sum + self.vortex_height(x, z, t)) * fade * (1.0 - self.p[P_FROZEN])
    }

    /// Speed of the water (m/s) at (x, z); read it with `flow_x` and `flow_z`.
    pub fn flow_at(&mut self, x: f64, z: f64) {
        let frozen = self.p[P_FROZEN];
        let (cx, cz) = self.current();
        let mut fx = cx * (1.0 - frozen);
        let mut fz = cz * (1.0 - frozen);
        for v in &self.vortices {
            let dx = x - v.x;
            let dz = z - v.z;
            let r = hypot(dx, dz);
            let rn = (r * 14.5) / v.radius;
            if v.strength <= 0.01 || rn >= 95.0 {
                continue;
            }
            let r_safe = (rn * rn + (1.0 / VORTEX_SAT) * 8.0).sqrt();
            let tangential = (28.0 * v.strength) / r_safe.sqrt();
            let radial = tangential * k_spiral() * 1.35;
            let c = dx / (r + 0.001);
            let s = dz / (r + 0.001);
            fx += (-s * tangential - c * radial) * (1.0 - frozen);
            fz += (c * tangential - s * radial) * (1.0 - frozen);
        }
        self.flow_x = fx;
        self.flow_z = fz;
    }

    pub fn flow_x(&self) -> f64 {
        self.flow_x
    }

    pub fn flow_z(&self) -> f64 {
        self.flow_z
    }

    /// Makes room for `n` points and returns the address of the buffer in the module's memory. It holds
    /// five rows of `n` numbers: ground height, x, z, time (written by the caller) and the result.
    /// The address changes if the memory grows: ask again after any call that may allocate.
    pub fn batch_reserve(&mut self, n: usize) -> *mut f64 {
        self.batch.resize(n * 5, 0.0);
        self.batch_n = n;
        self.batch.as_mut_ptr()
    }

    /// Fills the result row with `height` for each of the `n` points of the batch buffer.
    pub fn height_batch(&mut self, level: f64) {
        let n = self.batch_n;
        for i in 0..n {
            let h = self.height(
                level,
                self.batch[i],
                self.batch[n + i],
                self.batch[2 * n + i],
                self.batch[3 * n + i],
            );
            self.batch[4 * n + i] = h;
        }
    }

    /// The wave table as 7 rows of 8 numbers (dx, dz, amp, freq, speed, pressure, phase), for checks.
    pub fn wave_table(&self) -> Vec<f64> {
        let t = &self.table;
        [
            &t.dx,
            &t.dz,
            &t.amp,
            &t.freq,
            &t.speed,
            &t.pressure,
            &t.phase,
        ]
        .iter()
        .flat_map(|row| row.iter().cloned())
        .collect()
    }
}

impl Default for Ocean {
    fn default() -> Self {
        Ocean::new()
    }
}
