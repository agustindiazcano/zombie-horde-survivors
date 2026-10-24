//! Rust copy of `src/sim/dmath.ts`: the simulation's own `sin`, `cos`, `atan2`, `exp`, `log` and `pow`
//! (the FreeBSD / Sun fdlibm algorithms), made only of `+ - * /`, comparisons and the bits of a double.
//! The operations and their order are the TypeScript's, so the results match it bit for bit
//! (`npm run check:dmath`). Never call the standard `sin`, `pow` and friends from simulation code.

use wasm_bindgen::prelude::*;

fn hi(x: f64) -> i32 {
    (x.to_bits() >> 32) as u32 as i32
}
fn lo(x: f64) -> u32 {
    x.to_bits() as u32
}
fn with_hi(x: f64, h: i32) -> f64 {
    f64::from_bits(((h as u32 as u64) << 32) | (x.to_bits() & 0xffff_ffff))
}
fn from_words(h: i32, l: u32) -> f64 {
    f64::from_bits(((h as u32 as u64) << 32) | l as u64)
}
fn with_low0(x: f64) -> f64 {
    f64::from_bits(x.to_bits() & 0xffff_ffff_0000_0000)
}

// ---------------------------------------------------------------- sin and cos

const S1: f64 = -1.66666666666666324348e-1;
const S2: f64 = 8.33333333332248946124e-3;
const S3: f64 = -1.98412698298579493134e-4;
const S4: f64 = 2.75573137070700676789e-6;
const S5: f64 = -2.50507602534068634195e-8;
const S6: f64 = 1.5896909952115501022e-10;
const C1: f64 = 4.1666666666666601904e-2;
const C2: f64 = -1.38888888888741095749e-3;
const C3: f64 = 2.48015872894767294178e-5;
const C4: f64 = -2.75573143513906633035e-7;
const C5: f64 = 2.08757232129817482790e-9;
const C6: f64 = -1.13596475577881948265e-11;

fn kernel_sin(x: f64, y: f64, iy: i32) -> f64 {
    let ix = hi(x) & 0x7fff_ffff;
    if ix < 0x3e40_0000 {
        return x;
    }
    let z = x * x;
    let v = z * x;
    let r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
    if iy == 0 {
        return x + v * (S1 + z * r);
    }
    x - (z * (0.5 * y - v * r) - y - v * S1)
}

fn kernel_cos(x: f64, y: f64) -> f64 {
    let ix = hi(x) & 0x7fff_ffff;
    if ix < 0x3e40_0000 {
        return 1.0;
    }
    let z = x * x;
    let r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
    if ix < 0x3fd3_3333 {
        return 1.0 - (0.5 * z - (z * r - x * y));
    }
    let qx = if ix > 0x3fe9_0000 {
        0.28125
    } else {
        from_words(ix - 0x0020_0000, 0)
    };
    let iz = 0.5 * z - qx;
    let a = 1.0 - qx;
    a - (iz - (z * r - x * y))
}

const INVPIO2: f64 = 6.36619772367581382433e-1;
const PIO2_1: f64 = 1.57079632673412561417;
const PIO2_1T: f64 = 6.07710050650619224932e-11;
const PIO2_2: f64 = 6.07710050630396597660e-11;
const PIO2_2T: f64 = 2.02226624879595063154e-21;
const PIO2_3: f64 = 2.02226624871116645580e-21;
const PIO2_3T: f64 = 8.47842766036889956997e-32;

/// Returns (n, y0, y1): x = n * pi/2 + (y0 + y1) with the rest in [-pi/4, pi/4].
fn rem_pio2(x: f64) -> (i32, f64, f64) {
    let hx = hi(x);
    let ix = hx & 0x7fff_ffff;
    if ix <= 0x3fe9_21fb {
        return (0, x, 0.0);
    }
    if ix < 0x4002_d97c {
        if hx > 0 {
            let mut z = x - PIO2_1;
            if ix != 0x3ff9_21fb {
                let y0 = z - PIO2_1T;
                let y1 = z - y0 - PIO2_1T;
                return (1, y0, y1);
            }
            z -= PIO2_2;
            let y0 = z - PIO2_2T;
            let y1 = z - y0 - PIO2_2T;
            return (1, y0, y1);
        }
        let mut z = x + PIO2_1;
        if ix != 0x3ff9_21fb {
            let y0 = z + PIO2_1T;
            let y1 = z - y0 + PIO2_1T;
            return (-1, y0, y1);
        }
        z += PIO2_2;
        let y0 = z + PIO2_2T;
        let y1 = z - y0 + PIO2_2T;
        return (-1, y0, y1);
    }
    let t = x.abs();
    let n = (t * INVPIO2 + 0.5).trunc() as i32;
    let fn_ = n as f64;
    let mut r = t - fn_ * PIO2_1;
    let mut w = fn_ * PIO2_1T;
    let mut y0 = r - w;
    let j = ix >> 20;
    let mut i = j - ((hi(y0) >> 20) & 0x7ff);
    if i > 16 {
        let t2 = r;
        w = fn_ * PIO2_2;
        r = t2 - w;
        w = fn_ * PIO2_2T - (t2 - r - w);
        y0 = r - w;
        i = j - ((hi(y0) >> 20) & 0x7ff);
        if i > 49 {
            let t3 = r;
            w = fn_ * PIO2_3;
            r = t3 - w;
            w = fn_ * PIO2_3T - (t3 - r - w);
            y0 = r - w;
        }
    }
    let y1 = r - y0 - w;
    if hx < 0 {
        (-n, -y0, -y1)
    } else {
        (n, y0, y1)
    }
}

pub fn dsin(x: f64) -> f64 {
    let ix = hi(x) & 0x7fff_ffff;
    if ix <= 0x3fe9_21fb {
        return kernel_sin(x, 0.0, 0);
    }
    if ix >= 0x7ff0_0000 {
        return x - x;
    }
    let (n, y0, y1) = rem_pio2(x);
    match n & 3 {
        0 => kernel_sin(y0, y1, 1),
        1 => kernel_cos(y0, y1),
        2 => -kernel_sin(y0, y1, 1),
        _ => -kernel_cos(y0, y1),
    }
}

pub fn dcos(x: f64) -> f64 {
    let ix = hi(x) & 0x7fff_ffff;
    if ix <= 0x3fe9_21fb {
        return kernel_cos(x, 0.0);
    }
    if ix >= 0x7ff0_0000 {
        return x - x;
    }
    let (n, y0, y1) = rem_pio2(x);
    match n & 3 {
        0 => kernel_cos(y0, y1),
        1 => -kernel_sin(y0, y1, 1),
        2 => -kernel_cos(y0, y1),
        _ => kernel_sin(y0, y1, 1),
    }
}

// ---------------------------------------------------------------- atan and atan2

const ATAN_HI: [f64; 4] = [
    4.63647609000806093515e-1,
    7.85398163397448278999e-1,
    9.82793723247329054082e-1,
    1.5707963267948965580,
];
const ATAN_LO: [f64; 4] = [
    2.26987774529616870924e-17,
    3.06161699786838301793e-17,
    1.39033110312309984516e-17,
    6.12323399573676603587e-17,
];
const AT: [f64; 11] = [
    3.33333333333329318027e-1,
    -1.99999999998764832476e-1,
    1.42857142725034663711e-1,
    -1.1111110405462355788e-1,
    9.0908871334365065620e-2,
    -7.69187620504482999495e-2,
    6.6610731373875312067e-2,
    -5.83357013379057348645e-2,
    4.97687799461593236017e-2,
    -3.65315727442169155270e-2,
    1.62858201153657823623e-2,
];

fn datan(x_in: f64) -> f64 {
    let mut x = x_in;
    let hx = hi(x);
    let ix = hx & 0x7fff_ffff;
    let id: i32;
    if ix >= 0x4410_0000 {
        if ix > 0x7ff0_0000 || (ix == 0x7ff0_0000 && lo(x) != 0) {
            return x + x;
        }
        return if hx > 0 {
            ATAN_HI[3] + ATAN_LO[3]
        } else {
            -ATAN_HI[3] - ATAN_LO[3]
        };
    }
    if ix < 0x3fdc_0000 {
        if ix < 0x3e20_0000 {
            return x;
        }
        id = -1;
    } else {
        x = x.abs();
        if ix < 0x3ff3_0000 {
            if ix < 0x3fe6_0000 {
                id = 0;
                x = (2.0 * x - 1.0) / (2.0 + x);
            } else {
                id = 1;
                x = (x - 1.0) / (x + 1.0);
            }
        } else if ix < 0x4003_8000 {
            id = 2;
            x = (x - 1.5) / (1.0 + 1.5 * x);
        } else {
            id = 3;
            x = -1.0 / x;
        }
    }
    let mut z = x * x;
    let w = z * z;
    let s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
    let s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
    if id < 0 {
        return x - x * (s1 + s2);
    }
    let idu = id as usize;
    z = ATAN_HI[idu] - (x * (s1 + s2) - ATAN_LO[idu] - x);
    if hx < 0 {
        -z
    } else {
        z
    }
}

const PI_O_4: f64 = 7.8539816339744827900e-1;
const PI_O_2: f64 = 1.5707963267948965580;
const PI: f64 = 3.1415926535897931160;
const PI_LO: f64 = 1.2246467991473531772e-16;

pub fn datan2(y: f64, x: f64) -> f64 {
    let hx = hi(x);
    let ix = hx & 0x7fff_ffff;
    let lx = lo(x);
    let hy = hi(y);
    let iy = hy & 0x7fff_ffff;
    let ly = lo(y);
    if ix > 0x7ff0_0000 || (ix == 0x7ff0_0000 && lx != 0) {
        return x + y;
    }
    if iy > 0x7ff0_0000 || (iy == 0x7ff0_0000 && ly != 0) {
        return x + y;
    }
    if hx == 0x3ff0_0000 && lx == 0 {
        return datan(y);
    }
    let m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
    if (iy as u32 | ly) == 0 {
        if m == 0 || m == 1 {
            return y;
        }
        return if m == 2 { PI } else { -PI };
    }
    if (ix as u32 | lx) == 0 {
        return if hy < 0 { -PI_O_2 } else { PI_O_2 };
    }
    if ix == 0x7ff0_0000 {
        if iy == 0x7ff0_0000 {
            return match m {
                0 => PI_O_4,
                1 => -PI_O_4,
                2 => 3.0 * PI_O_4,
                _ => -3.0 * PI_O_4,
            };
        }
        return match m {
            0 => 0.0,
            1 => -0.0,
            2 => PI,
            _ => -PI,
        };
    }
    if iy == 0x7ff0_0000 {
        return if hy < 0 { -PI_O_2 } else { PI_O_2 };
    }
    let k = (iy - ix) >> 20;
    let mut mm = m;
    let z = if k > 60 {
        mm &= 1;
        PI_O_2 + 0.5 * PI_LO
    } else if hx < 0 && k < -60 {
        0.0
    } else {
        datan((y / x).abs())
    };
    match mm {
        0 => z,
        1 => -z,
        2 => PI - (z - PI_LO),
        _ => z - PI_LO - PI,
    }
}

// ---------------------------------------------------------------- exp and log

const LN2_HI: f64 = 6.93147180369123816490e-1;
const LN2_LO: f64 = 1.9082149292705877000e-10;
const INVLN2: f64 = 1.44269504088896338700;
const EXP_P1: f64 = 1.66666666666666019037e-1;
const EXP_P2: f64 = -2.77777777770155933842e-3;
const EXP_P3: f64 = 6.61375632143793436117e-5;
const EXP_P4: f64 = -1.65339022054652515390e-6;
const EXP_P5: f64 = 4.13813679705723846039e-8;
const O_THRESHOLD: f64 = 7.09782712893383973096e2;
const U_THRESHOLD: f64 = -7.45133219101941108420e2;
const TWOM1000: f64 = 9.33263618503218878990e-302;

pub fn dexp(x_in: f64) -> f64 {
    let mut x = x_in;
    let hxs = hi(x);
    let xsb = ((hxs as u32) >> 31) as i32 & 1;
    let hx = hxs & 0x7fff_ffff;
    if hx >= 0x4086_2e42 {
        if hx >= 0x7ff0_0000 {
            if (hx & 0xfffff) != 0 || lo(x) != 0 {
                return x + x;
            }
            return if xsb == 0 { x } else { 0.0 };
        }
        if x > O_THRESHOLD {
            return f64::INFINITY;
        }
        if x < U_THRESHOLD {
            return 0.0;
        }
    }
    let mut hi_ = 0.0;
    let mut lo_ = 0.0;
    let mut k: i32 = 0;
    if hx > 0x3fd6_2e42 {
        if hx < 0x3ff0_a2b2 {
            hi_ = x - if xsb == 0 { LN2_HI } else { -LN2_HI };
            lo_ = if xsb == 0 { LN2_LO } else { -LN2_LO };
            k = 1 - xsb - xsb;
        } else {
            k = (INVLN2 * x + if xsb == 0 { 0.5 } else { -0.5 }).trunc() as i32;
            let t = k as f64;
            hi_ = x - t * LN2_HI;
            lo_ = t * LN2_LO;
        }
        x = hi_ - lo_;
    } else if hx < 0x3e30_0000 {
        return 1.0 + x;
    }
    let t = x * x;
    let c = x - t * (EXP_P1 + t * (EXP_P2 + t * (EXP_P3 + t * (EXP_P4 + t * EXP_P5))));
    if k == 0 {
        return 1.0 - (x * c / (c - 2.0) - x);
    }
    let y = 1.0 - (lo_ - x * c / (2.0 - c) - hi_);
    if k >= -1021 {
        return with_hi(y, hi(y).wrapping_add(k.wrapping_shl(20)));
    }
    with_hi(y, hi(y).wrapping_add((k + 1000).wrapping_shl(20))) * TWOM1000
}

const LG1: f64 = 6.666666666666735130e-1;
const LG2: f64 = 3.999999999940941908e-1;
const LG3: f64 = 2.857142874366239149e-1;
const LG4: f64 = 2.222219843214978396e-1;
const LG5: f64 = 1.818357216161805012e-1;
const LG6: f64 = 1.531383769920937332e-1;
const LG7: f64 = 1.479819860511658591e-1;
const TWO54: f64 = 1.80143985094819840000e16;

pub fn dlog(x_in: f64) -> f64 {
    let mut x = x_in;
    let mut hx = hi(x);
    let lx = lo(x);
    let mut k: i32 = 0;
    if hx < 0x0010_0000 {
        if ((hx & 0x7fff_ffff) as u32 | lx) == 0 {
            return f64::NEG_INFINITY;
        }
        if hx < 0 {
            return f64::NAN;
        }
        k -= 54;
        x *= TWO54;
        hx = hi(x);
    }
    if hx >= 0x7ff0_0000 {
        return x + x;
    }
    k += (hx >> 20) - 1023;
    hx &= 0x000f_ffff;
    let mut i = (hx + 0x95f64) & 0x10_0000;
    x = with_hi(x, hx | (i ^ 0x3ff0_0000));
    k += i >> 20;
    let f = x - 1.0;
    if (0x000f_ffff & (2 + hx)) < 3 {
        if f == 0.0 {
            if k == 0 {
                return 0.0;
            }
            let dk = k as f64;
            return dk * LN2_HI + dk * LN2_LO;
        }
        let r = f * f * (0.5 - 0.33333333333333333 * f);
        if k == 0 {
            return f - r;
        }
        let dk = k as f64;
        return dk * LN2_HI - (r - dk * LN2_LO - f);
    }
    let s = f / (2.0 + f);
    let dk = k as f64;
    let z = s * s;
    i = hx - 0x6147a;
    let w = z * z;
    let j = 0x6b851 - hx;
    let t1 = w * (LG2 + w * (LG4 + w * LG6));
    let t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
    i |= j;
    let r = t2 + t1;
    if i > 0 {
        let hfsq = 0.5 * f * f;
        if k == 0 {
            return f - (hfsq - s * (hfsq + r));
        }
        return dk * LN2_HI - (hfsq - (s * (hfsq + r) + dk * LN2_LO) - f);
    }
    if k == 0 {
        return f - s * (f - r);
    }
    dk * LN2_HI - (s * (f - r) - dk * LN2_LO - f)
}

// ---------------------------------------------------------------- pow

const BP: [f64; 2] = [1.0, 1.5];
const DP_H: [f64; 2] = [0.0, 5.84962487220764160156e-1];
const DP_L: [f64; 2] = [0.0, 1.35003920212974897128e-8];
const TWO53: f64 = 9007199254740992.0;
const POW_L1: f64 = 5.99999999999994648725e-1;
const POW_L2: f64 = 4.28571428578550184252e-1;
const POW_L3: f64 = 3.33333329818377432918e-1;
const POW_L4: f64 = 2.72728123808534006489e-1;
const POW_L5: f64 = 2.30660745775561754067e-1;
const POW_L6: f64 = 2.06975017800338417784e-1;
const POW_LG2: f64 = 6.93147180559945286227e-1;
const POW_LG2_H: f64 = 6.93147182464599609375e-1;
const POW_LG2_L: f64 = -1.90465429995776804525e-9;
const OVT: f64 = 8.0085662595372944372e-17;
const CP: f64 = 9.61796693925975554329e-1;
const CP_H: f64 = 9.61796700954437255859e-1;
const CP_L: f64 = -7.02846165095275826516e-9;
const IVLN2: f64 = 1.44269504088896338700;
const IVLN2_H: f64 = 1.44269502162933349609;
const IVLN2_L: f64 = 1.92596299112661746887e-8;

fn scale2(x: f64, n: i32) -> f64 {
    let a = n >> 1;
    let b = n - a;
    x * from_words((a + 1023).wrapping_shl(20), 0) * from_words((b + 1023).wrapping_shl(20), 0)
}

pub fn dpow(x: f64, y: f64) -> f64 {
    let hx = hi(x);
    let lx = lo(x);
    let hy = hi(y);
    let ly = lo(y);
    let mut ix = hx & 0x7fff_ffff;
    let iy = hy & 0x7fff_ffff;
    if (iy as u32 | ly) == 0 {
        return 1.0;
    }
    if ix > 0x7ff0_0000 || (ix == 0x7ff0_0000 && lx != 0) {
        return f64::NAN;
    }
    if iy > 0x7ff0_0000 || (iy == 0x7ff0_0000 && ly != 0) {
        return f64::NAN;
    }
    if hx == 0x3ff0_0000 && lx == 0 {
        return 1.0;
    }
    let mut yisint: i32 = 0;
    if hx < 0 {
        if iy >= 0x4340_0000 {
            yisint = 2;
        } else if iy >= 0x3ff0_0000 {
            let k = (iy >> 20) - 0x3ff;
            if k > 20 {
                let j = ly >> (52 - k);
                if (j.wrapping_shl((52 - k) as u32)) == ly {
                    yisint = 2 - (j & 1) as i32;
                }
            } else if ly == 0 {
                let j = iy >> (20 - k);
                if j.wrapping_shl((20 - k) as u32) == iy {
                    yisint = 2 - (j & 1);
                }
            }
        }
    }
    if ly == 0 {
        if iy == 0x7ff0_0000 {
            if ix == 0x3ff0_0000 && lx == 0 {
                return f64::NAN;
            }
            if ix >= 0x3ff0_0000 {
                return if hy >= 0 { y } else { 0.0 };
            }
            return if hy < 0 { -y } else { 0.0 };
        }
        if iy == 0x3ff0_0000 {
            return if hy < 0 { 1.0 / x } else { x };
        }
        if hy == 0x4000_0000 {
            return x * x;
        }
        if hy == 0x3fe0_0000 && hx >= 0 {
            return x.sqrt();
        }
    }
    let mut ax = x.abs();
    if lx == 0 && (ix == 0x7ff0_0000 || ix == 0 || ix == 0x3ff0_0000) {
        let mut z = ax;
        if hy < 0 {
            z = 1.0 / z;
        }
        if hx < 0 {
            if ((ix - 0x3ff0_0000) | yisint) == 0 {
                z = f64::NAN;
            } else if yisint == 1 {
                z = -z;
            }
        }
        return z;
    }
    let n0 = (hx >> 31) + 1;
    if (n0 | yisint) == 0 {
        return f64::NAN;
    }
    let mut s = 1.0;
    if (n0 | (yisint - 1)) == 0 {
        s = -1.0;
    }
    let t1: f64;
    let t2: f64;
    if iy > 0x41e0_0000 {
        if iy > 0x43f0_0000 {
            if ix <= 0x3fef_ffff {
                return if hy < 0 { f64::INFINITY } else { 0.0 };
            }
            if ix >= 0x3ff0_0000 {
                return if hy > 0 { f64::INFINITY } else { 0.0 };
            }
        }
        if ix < 0x3fef_ffff {
            return if hy < 0 { s * f64::INFINITY } else { s * 0.0 };
        }
        if ix > 0x3ff0_0000 {
            return if hy > 0 { s * f64::INFINITY } else { s * 0.0 };
        }
        let t = ax - 1.0;
        let w = t * t * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
        let u = IVLN2_H * t;
        let v = t * IVLN2_L - w * IVLN2;
        t1 = with_low0(u + v);
        t2 = v - (t1 - u);
    } else {
        let mut n: i32 = 0;
        if ix < 0x0010_0000 {
            ax *= TWO53;
            n -= 53;
            ix = hi(ax);
        }
        n += (ix >> 20) - 0x3ff;
        let j = ix & 0x000f_ffff;
        ix = j | 0x3ff0_0000;
        let k: usize;
        if j <= 0x3988e {
            k = 0;
        } else if j < 0xbb67a {
            k = 1;
        } else {
            k = 0;
            n += 1;
            ix -= 0x0010_0000;
        }
        ax = with_hi(ax, ix);
        let mut u = ax - BP[k];
        let mut v = 1.0 / (ax + BP[k]);
        let ss = u * v;
        let s_h = with_low0(ss);
        let mut t_h = from_words(
            ((ix >> 1) | 0x2000_0000) + 0x0008_0000 + ((k as i32) << 18),
            0,
        );
        let mut t_l = ax - (t_h - BP[k]);
        let s_l = v * (u - s_h * t_h - s_h * t_l);
        let mut s2 = ss * ss;
        let mut r = s2
            * s2
            * (POW_L1
                + s2 * (POW_L2 + s2 * (POW_L3 + s2 * (POW_L4 + s2 * (POW_L5 + s2 * POW_L6)))));
        r += s_l * (s_h + ss);
        s2 = s_h * s_h;
        t_h = with_low0(3.0 + s2 + r);
        t_l = r - (t_h - 3.0 - s2);
        u = s_h * t_h;
        v = s_l * t_h + t_l * ss;
        let p_h = with_low0(u + v);
        let p_l = v - (p_h - u);
        let z_h = CP_H * p_h;
        let z_l = CP_L * p_h + p_l * CP + DP_L[k];
        let t = n as f64;
        t1 = with_low0(z_h + z_l + DP_H[k] + t);
        t2 = z_l - (t1 - t - DP_H[k] - z_h);
    }
    let y1 = with_low0(y);
    let p_l = (y - y1) * t1 + y * t2;
    let mut p_h = y1 * t1;
    let mut z = p_l + p_h;
    let j = hi(z);
    let i = lo(z);
    if j >= 0x4090_0000 {
        if ((j - 0x4090_0000) as u32 | i) != 0 {
            return s * f64::INFINITY;
        }
        if p_l + OVT > z - p_h {
            return s * f64::INFINITY;
        }
    } else if (j & 0x7fff_ffff) >= 0x4090_cc00 {
        if (j.wrapping_sub(0xc090_cc00_u32 as i32) as u32 | i) != 0 {
            return s * 0.0;
        }
        if p_l <= z - p_h {
            return s * 0.0;
        }
    }
    let ii = j & 0x7fff_ffff;
    let mut k = (ii >> 20) - 0x3ff;
    let mut n: i32 = 0;
    if ii > 0x3fe0_0000 {
        n = j.wrapping_add(0x0010_0000 >> (k + 1));
        k = ((n & 0x7fff_ffff) >> 20) - 0x3ff;
        let t = from_words(n & !(0x000f_ffff >> k), 0);
        n = ((n & 0x000f_ffff) | 0x0010_0000) >> (20 - k);
        if j < 0 {
            n = -n;
        }
        p_h -= t;
    }
    let mut t = p_l + p_h;
    t = with_low0(t);
    let u = t * POW_LG2_H;
    let v = (p_l - (t - p_h)) * POW_LG2 + t * POW_LG2_L;
    z = u + v;
    let w = v - (z - u);
    t = z * z;
    let tt = z - t * (EXP_P1 + t * (EXP_P2 + t * (EXP_P3 + t * (EXP_P4 + t * EXP_P5))));
    let r = (z * tt) / (tt - 2.0) - (w + z * w);
    z = 1.0 - (r - z);
    let mut jz = hi(z);
    jz = jz.wrapping_add(n.wrapping_shl(20));
    if (jz >> 20) <= 0 {
        z = scale2(z, n);
    } else {
        z = with_hi(z, jz);
    }
    s * z
}

// Exports for `npm run check:dmath` (the TypeScript and the Rust must agree to the bit).
#[wasm_bindgen]
pub fn d_sin(x: f64) -> f64 {
    dsin(x)
}
#[wasm_bindgen]
pub fn d_cos(x: f64) -> f64 {
    dcos(x)
}
#[wasm_bindgen]
pub fn d_atan2(y: f64, x: f64) -> f64 {
    datan2(y, x)
}
#[wasm_bindgen]
pub fn d_exp(x: f64) -> f64 {
    dexp(x)
}
#[wasm_bindgen]
pub fn d_log(x: f64) -> f64 {
    dlog(x)
}
#[wasm_bindgen]
pub fn d_pow(x: f64, y: f64) -> f64 {
    dpow(x, y)
}
