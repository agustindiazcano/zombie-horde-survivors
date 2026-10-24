/**
 * The simulation's own `sin`, `cos`, `atan2`, `exp`, `log` and `pow`. Each is made only of `+ - * /`,
 * comparisons and the bits of a double, which the IEEE standard fixes exactly, so every browser and the
 * Rust copy (`crates/sim-core/src/dmath.rs`) return the same number for the same input. The engines'
 * own `Math.sin` and friends do not: Firefox, Safari and Chrome use different libraries, and even Rust's
 * differs from V8's in about 1% (`sin`, `cos`) to 10% (`pow`) of the inputs by one bit.
 *
 * The algorithms are the classic FreeBSD / Sun fdlibm ones (the polynomials and constants are theirs),
 * about 1 ulp accurate. `dpow` is `exp(y * log(x))`, a few ulps for the exponents the game uses. They are
 * checked against V8 for accuracy and against Rust bit for bit by `npm run check:kernels`.
 * The sim must call these, never `Math.sin`, `Math.cos`, `Math.atan2`, `Math.exp`, `Math.log`, `Math.pow`.
 */

const view = new DataView(new ArrayBuffer(8));
/** High 32 bits of a double, as a signed integer. */
const hiWord = (x: number): number => {
  view.setFloat64(0, x, true);
  return view.getInt32(4, true);
};
/** Low 32 bits of a double, as an unsigned integer. */
const loWord = (x: number): number => {
  view.setFloat64(0, x, true);
  return view.getUint32(0, true);
};
/** `x` with its high word replaced. */
const withHi = (x: number, hi: number): number => {
  view.setFloat64(0, x, true);
  view.setInt32(4, hi, true);
  return view.getFloat64(0, true);
};
/** The double with these high and low words. */
const fromWords = (hi: number, lo: number): number => {
  view.setInt32(4, hi, true);
  view.setUint32(0, lo, true);
  return view.getFloat64(0, true);
};

// ---------------------------------------------------------------- sin and cos

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.5896909952115501022e-10;
const C1 = 4.1666666666666601904e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

/** sin of `x` on |x| <= pi/4, `y` the tail of x (`iy` 0: no tail). */
function kernelSin(x: number, y: number, iy: number): number {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) return x; // |x| < 2^-27
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

/** cos of `x` on |x| <= pi/4, `y` the tail of x. */
function kernelCos(x: number, y: number): number {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) return 1; // |x| < 2^-27
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y)); // |x| < 0.3
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);
  const iz = 0.5 * z - qx;
  const a = 1 - qx;
  return a - (iz - (z * r - x * y));
}

const INVPIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.0771005063039659766e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.0222662487111664558e-21;
const PIO2_3T = 8.47842766036889956997e-32;

/** The two parts of the reduced argument written by `remPio2`. */
let reduced0 = 0;
let reduced1 = 0;

/**
 * Reduces `x` to `reduced0 + reduced1` in [-pi/4, pi/4] and returns n with x = n * pi/2 + that.
 * Cody-Waite in three rounds (good for |x| up to 2^19 * pi/2, about 8e5); beyond that the result is still
 * deterministic but loses accuracy, and the game never goes there.
 */
function remPio2(x: number): number {
  const hx = hiWord(x);
  const ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    reduced0 = x;
    reduced1 = 0;
    return 0;
  }
  if (ix < 0x4002d97c) {
    // |x| < 3 pi/4: n = +-1
    if (hx > 0) {
      let z = x - PIO2_1;
      if (ix !== 0x3ff921fb) {
        reduced0 = z - PIO2_1T;
        reduced1 = z - reduced0 - PIO2_1T;
      } else {
        z -= PIO2_2;
        reduced0 = z - PIO2_2T;
        reduced1 = z - reduced0 - PIO2_2T;
      }
      return 1;
    }
    let z = x + PIO2_1;
    if (ix !== 0x3ff921fb) {
      reduced0 = z + PIO2_1T;
      reduced1 = z - reduced0 + PIO2_1T;
    } else {
      z += PIO2_2;
      reduced0 = z + PIO2_2T;
      reduced1 = z - reduced0 + PIO2_2T;
    }
    return -1;
  }
  // Medium size: |x| up to 2^19 * pi/2 (and, degraded, beyond).
  const t = Math.abs(x);
  const n = Math.trunc(t * INVPIO2 + 0.5);
  const fn = n;
  let r = t - fn * PIO2_1;
  let w = fn * PIO2_1T; // first round, good to 85 bits
  let y0 = r - w;
  const j = ix >> 20;
  let i = j - ((hiWord(y0) >> 20) & 0x7ff);
  if (i > 16) {
    // second round, good to 118 bits
    const t2 = r;
    w = fn * PIO2_2;
    r = t2 - w;
    w = fn * PIO2_2T - (t2 - r - w);
    y0 = r - w;
    i = j - ((hiWord(y0) >> 20) & 0x7ff);
    if (i > 49) {
      // third round, 151 bits
      const t3 = r;
      w = fn * PIO2_3;
      r = t3 - w;
      w = fn * PIO2_3T - (t3 - r - w);
      y0 = r - w;
    }
  }
  const y1 = r - y0 - w;
  if (hx < 0) {
    reduced0 = -y0;
    reduced1 = -y1;
    return -n;
  }
  reduced0 = y0;
  reduced1 = y1;
  return n;
}

export function dsin(x: number): number {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelSin(x, 0, 0);
  if (ix >= 0x7ff00000) return x - x; // NaN or infinity
  const n = remPio2(x);
  switch (n & 3) {
    case 0:
      return kernelSin(reduced0, reduced1, 1);
    case 1:
      return kernelCos(reduced0, reduced1);
    case 2:
      return -kernelSin(reduced0, reduced1, 1);
    default:
      return -kernelCos(reduced0, reduced1);
  }
}

export function dcos(x: number): number {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelCos(x, 0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  switch (n & 3) {
    case 0:
      return kernelCos(reduced0, reduced1);
    case 1:
      return -kernelSin(reduced0, reduced1, 1);
    case 2:
      return -kernelCos(reduced0, reduced1);
    default:
      return kernelSin(reduced0, reduced1, 1);
  }
}

// ---------------------------------------------------------------- atan and atan2

const ATAN_HI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
  1.570796326794896558,
];
const ATAN_LO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17,
];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1,
  -1.1111110405462355788e-1, 9.090887133436506562e-2, -7.69187620504482999495e-2,
  6.6610731373875312067e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2,
  -3.6531572744216915527e-2, 1.62858201153657823623e-2,
];

function datan(xIn: number): number {
  let x = xIn;
  const hx = hiWord(x);
  const ix = hx & 0x7fffffff;
  let id: number;
  if (ix >= 0x44100000) {
    // |x| >= 2^66
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && loWord(x) !== 0)) return x + x; // NaN
    return hx > 0 ? ATAN_HI[3]! + ATAN_LO[3]! : -ATAN_HI[3]! - ATAN_LO[3]!;
  }
  if (ix < 0x3fdc0000) {
    // |x| < 0.4375
    if (ix < 0x3e200000) return x; // |x| < 2^-29
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      // |x| < 1.1875
      if (ix < 0x3fe60000) {
        id = 0;
        x = (2 * x - 1) / (2 + x);
      } else {
        id = 1;
        x = (x - 1) / (x + 1);
      }
    } else if (ix < 0x40038000) {
      // |x| < 2.4375
      id = 2;
      x = (x - 1.5) / (1 + 1.5 * x);
    } else {
      id = 3;
      x = -1 / x;
    }
  }
  let z = x * x;
  const w = z * z;
  const s1 = z * (AT[0]! + w * (AT[2]! + w * (AT[4]! + w * (AT[6]! + w * (AT[8]! + w * AT[10]!)))));
  const s2 = w * (AT[1]! + w * (AT[3]! + w * (AT[5]! + w * (AT[7]! + w * AT[9]!))));
  if (id < 0) return x - x * (s1 + s2);
  z = ATAN_HI[id]! - (x * (s1 + s2) - ATAN_LO[id]! - x);
  return hx < 0 ? -z : z;
}

const PI_O_4 = 7.85398163397448279e-1;
const PI_O_2 = 1.570796326794896558;
const PI = 3.141592653589793116;
const PI_LO = 1.2246467991473532e-16;

export function datan2(y: number, x: number): number {
  const hx = hiWord(x);
  const ix = hx & 0x7fffffff;
  const lx = loWord(x);
  const hy = hiWord(y);
  const iy = hy & 0x7fffffff;
  const ly = loWord(y);
  if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lx !== 0)) return x + y; // x is NaN
  if (iy > 0x7ff00000 || (iy === 0x7ff00000 && ly !== 0)) return x + y; // y is NaN
  if (hx === 0x3ff00000 && lx === 0) return datan(y); // x = 1
  const m = ((hy >> 31) & 1) | ((hx >> 30) & 2); // 2 * sign(x) + sign(y)
  if ((iy | ly) === 0) {
    // y = 0
    if (m === 0 || m === 1) return y;
    return m === 2 ? PI : -PI;
  }
  if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 : PI_O_2; // x = 0
  if (ix === 0x7ff00000) {
    // x is infinite
    if (iy === 0x7ff00000) {
      switch (m) {
        case 0:
          return PI_O_4;
        case 1:
          return -PI_O_4;
        case 2:
          return 3 * PI_O_4;
        default:
          return -3 * PI_O_4;
      }
    }
    switch (m) {
      case 0:
        return 0;
      case 1:
        return -0;
      case 2:
        return PI;
      default:
        return -PI;
    }
  }
  if (iy === 0x7ff00000) return hy < 0 ? -PI_O_2 : PI_O_2; // y is infinite
  const k = (iy - ix) >> 20;
  let z: number;
  let mm = m;
  if (k > 60) {
    z = PI_O_2 + 0.5 * PI_LO; // |y / x| > 2^60
    mm &= 1;
  } else if (hx < 0 && k < -60) {
    z = 0; // |y| / x < -2^60
  } else {
    z = datan(Math.abs(y / x));
  }
  switch (mm) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return PI - (z - PI_LO);
    default:
      return z - PI_LO - PI;
  }
}

// ---------------------------------------------------------------- exp and log

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.9082149292705877e-10;
const INVLN2 = 1.442695040888963387;
const EXP_P1 = 1.66666666666666019037e-1;
const EXP_P2 = -2.77777777770155933842e-3;
const EXP_P3 = 6.61375632143793436117e-5;
const EXP_P4 = -1.6533902205465251539e-6;
const EXP_P5 = 4.13813679705723846039e-8;
const O_THRESHOLD = 7.09782712893383973096e2;
const U_THRESHOLD = -7.4513321910194110842e2;
const TWOM1000 = 9.3326361850321887899e-302;

export function dexp(xIn: number): number {
  let x = xIn;
  const hxs = hiWord(x);
  const xsb = (hxs >>> 31) & 1;
  const hx = hxs & 0x7fffffff;
  if (hx >= 0x40862e42) {
    // |x| >= 709.78
    if (hx >= 0x7ff00000) {
      if ((hx & 0xfffff) !== 0 || loWord(x) !== 0) return x + x; // NaN
      return xsb === 0 ? x : 0;
    }
    if (x > O_THRESHOLD) return Infinity;
    if (x < U_THRESHOLD) return 0;
  }
  let hi = 0;
  let lo = 0;
  let k = 0;
  if (hx > 0x3fd62e42) {
    // |x| > 0.5 ln 2
    if (hx < 0x3ff0a2b2) {
      // |x| < 1.5 ln 2
      hi = x - (xsb === 0 ? LN2_HI : -LN2_HI);
      lo = xsb === 0 ? LN2_LO : -LN2_LO;
      k = 1 - xsb - xsb;
    } else {
      k = Math.trunc(INVLN2 * x + (xsb === 0 ? 0.5 : -0.5));
      const t = k;
      hi = x - t * LN2_HI;
      lo = t * LN2_LO;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    return 1 + x; // |x| < 2^-28
  }
  const t = x * x;
  const c = x - t * (EXP_P1 + t * (EXP_P2 + t * (EXP_P3 + t * (EXP_P4 + t * EXP_P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - (lo - (x * c) / (2 - c) - hi);
  if (k >= -1021) return withHi(y, hiWord(y) + (k << 20));
  return withHi(y, hiWord(y) + ((k + 1000) << 20)) * TWOM1000;
}

const LG1 = 6.66666666666673513e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;
const TWO54 = 1.8014398509481984e16;

export function dlog(xIn: number): number {
  let x = xIn;
  let hx = hiWord(x);
  const lx = loWord(x);
  let k = 0;
  if (hx < 0x00100000) {
    // x < 2^-1022
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= TWO54;
    hx = hiWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHi(x, hx | (i ^ 0x3ff00000)); // normalise x or x / 2
  k += i >> 20;
  const f = x - 1;
  if ((0x000fffff & (2 + hx)) < 3) {
    // |f| < 2^-20
    if (f === 0) {
      if (k === 0) return 0;
      const dk = k;
      return dk * LN2_HI + dk * LN2_LO;
    }
    const R = f * f * (0.5 - 0.3333333333333333 * f);
    if (k === 0) return f - R;
    const dk = k;
    return dk * LN2_HI - (R - dk * LN2_LO - f);
  }
  const s = f / (2 + f);
  const dk = k;
  const z = s * s;
  i = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  i |= j;
  const R = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + R));
    return dk * LN2_HI - (hfsq - (s * (hfsq + R) + dk * LN2_LO) - f);
  }
  if (k === 0) return f - s * (f - R);
  return dk * LN2_HI - (s * (f - R) - dk * LN2_LO - f);
}

const BP = [1, 1.5];
const DP_H = [0, 5.84962487220764160156e-1];
const DP_L = [0, 1.35003920212974897128e-8];
const TWO53 = 9007199254740992;
const POW_L1 = 5.99999999999994648725e-1;
const POW_L2 = 4.28571428578550184252e-1;
const POW_L3 = 3.33333329818377432918e-1;
const POW_L4 = 2.72728123808534006489e-1;
const POW_L5 = 2.30660745775561754067e-1;
const POW_L6 = 2.06975017800338417784e-1;
const POW_LG2 = 6.93147180559945286227e-1;
const POW_LG2_H = 6.93147182464599609375e-1;
const POW_LG2_L = -1.90465429995776804525e-9;
const OVT = 8.008566259537294e-17;
const CP = 9.61796693925975554329e-1;
const CP_H = 9.61796700954437255859e-1;
const CP_L = -7.02846165095275826516e-9;
const IVLN2 = 1.442695040888963387;
const IVLN2_H = 1.44269502162933349609;
const IVLN2_L = 1.92596299112661746887e-8;

/** `x * 2^n` for the exponents `dpow` produces (n between -1100 and 1100), in two exact steps. */
function scale2(x: number, n: number): number {
  const a = n >> 1; // truncates toward minus infinity: a + b = n
  const b = n - a;
  return x * fromWords((a + 1023) << 20, 0) * fromWords((b + 1023) << 20, 0);
}

/**
 * `x` to the power `y`: the fdlibm algorithm (the logarithm in double-double, then 2^(y log x)), the
 * same one V8 used. Special values follow ECMAScript (`pow(1, NaN)` is NaN, `pow(+-1, +-Infinity)` too).
 */
export function dpow(x: number, y: number): number {
  const hx = hiWord(x);
  const lx = loWord(x);
  const hy = hiWord(y);
  const ly = loWord(y);
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  if ((iy | ly) === 0) return 1; // x ** 0
  if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lx !== 0)) return NaN;
  if (iy > 0x7ff00000 || (iy === 0x7ff00000 && ly !== 0)) return NaN;
  if (hx === 0x3ff00000 && lx === 0) return 1; // 1 ** y (y is not NaN here)
  // yisint: 0 y is not an integer, 1 an odd integer, 2 an even integer (only matters when x < 0)
  let yisint = 0;
  if (hx < 0) {
    if (iy >= 0x43400000) yisint = 2;
    else if (iy >= 0x3ff00000) {
      const k = (iy >> 20) - 0x3ff;
      if (k > 20) {
        const j = ly >>> (52 - k);
        if ((j << (52 - k)) >>> 0 === ly) yisint = 2 - (j & 1);
      } else if (ly === 0) {
        const j = iy >> (20 - k);
        if (j << (20 - k) === iy) yisint = 2 - (j & 1);
      }
    }
  }
  if (ly === 0) {
    if (iy === 0x7ff00000) {
      // y is infinite
      if (ix === 0x3ff00000 && lx === 0) return NaN; // (+-1) ** +-Infinity
      if (ix >= 0x3ff00000) return hy >= 0 ? y : 0;
      return hy < 0 ? -y : 0;
    }
    if (iy === 0x3ff00000) return hy < 0 ? 1 / x : x; // y is +-1
    if (hy === 0x40000000) return x * x; // y is 2
    if (hy === 0x3fe00000 && hx >= 0) return Math.sqrt(x); // y is 0.5
  }
  let ax = Math.abs(x);
  if (lx === 0 && (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000)) {
    // x is +-0, +-Infinity or +-1
    let z = ax;
    if (hy < 0) z = 1 / z;
    if (hx < 0) {
      if (((ix - 0x3ff00000) | yisint) === 0)
        z = NaN; // (-1) ** non-integer
      else if (yisint === 1) z = -z; // (x < 0) ** odd = -(|x| ** odd)
    }
    return z;
  }
  const n0 = (hx >> 31) + 1; // 0 for x < 0, 1 otherwise
  if ((n0 | yisint) === 0) return NaN; // (x < 0) ** non-integer
  let s = 1;
  if ((n0 | (yisint - 1)) === 0) s = -1; // (negative) ** odd integer
  let t1: number;
  let t2: number;
  if (iy > 0x41e00000) {
    // |y| > 2^31
    if (iy > 0x43f00000) {
      // |y| > 2^64: must overflow or underflow
      if (ix <= 0x3fefffff) return hy < 0 ? Infinity : 0;
      if (ix >= 0x3ff00000) return hy > 0 ? Infinity : 0;
    }
    if (ix < 0x3fefffff) return hy < 0 ? s * Infinity : s * 0;
    if (ix > 0x3ff00000) return hy > 0 ? s * Infinity : s * 0;
    // |1 - x| <= 2^-20: log(x) from x - x^2/2 + x^3/3 - x^4/4
    const t = ax - 1;
    const w = t * t * (0.5 - t * (0.3333333333333333 - t * 0.25));
    const u = IVLN2_H * t;
    const v = t * IVLN2_L - w * IVLN2;
    t1 = withLow0(u + v);
    t2 = v - (t1 - u);
  } else {
    let n = 0;
    if (ix < 0x00100000) {
      // subnormal x
      ax *= TWO53;
      n -= 53;
      ix = hiWord(ax);
    }
    n += (ix >> 20) - 0x3ff;
    const j = ix & 0x000fffff;
    ix = j | 0x3ff00000; // normalise
    let k: number;
    if (j <= 0x3988e)
      k = 0; // |x| < sqrt(3/2)
    else if (j < 0xbb67a)
      k = 1; // |x| < sqrt(3)
    else {
      k = 0;
      n += 1;
      ix -= 0x00100000;
    }
    ax = withHi(ax, ix);
    // ss = s_h + s_l = (x - 1) / (x + 1) or (x - 1.5) / (x + 1.5)
    let u = ax - BP[k]!;
    let v = 1 / (ax + BP[k]!);
    const ss = u * v;
    const sH = withLow0(ss);
    let tH = fromWords(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0);
    let tL = ax - (tH - BP[k]!);
    const sL = v * (u - sH * tH - sH * tL);
    // log(ax)
    let s2 = ss * ss;
    let r =
      s2 *
      s2 *
      (POW_L1 + s2 * (POW_L2 + s2 * (POW_L3 + s2 * (POW_L4 + s2 * (POW_L5 + s2 * POW_L6)))));
    r += sL * (sH + ss);
    s2 = sH * sH;
    tH = withLow0(3 + s2 + r);
    tL = r - (tH - 3 - s2);
    // u + v = ss * (1 + ...)
    u = sH * tH;
    v = sL * tH + tL * ss;
    // 2 / (3 log 2) * (ss + ...)
    const pH = withLow0(u + v);
    const pL = v - (pH - u);
    const zH = CP_H * pH; // CP_H + CP_L = 2 / (3 log 2)
    const zL = CP_L * pH + pL * CP + DP_L[k]!;
    // log2(ax) = n + DP_H + zH + zL
    const t = n;
    t1 = withLow0(zH + zL + DP_H[k]! + t);
    t2 = zL - (t1 - t - DP_H[k]! - zH);
  }
  // Split y into y1 + y2 and compute (y1 + y2) * (t1 + t2).
  const y1 = withLow0(y);
  const pL = (y - y1) * t1 + y * t2;
  let pH = y1 * t1;
  let z = pL + pH;
  const j = hiWord(z);
  const i = loWord(z);
  if (j >= 0x40900000) {
    // z >= 1024
    if (((j - 0x40900000) | i) !== 0) return s * Infinity;
    if (pL + OVT > z - pH) return s * Infinity;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {
    // z <= -1075
    if (((j - 0xc090cc00) | i) !== 0) return s * 0;
    if (pL <= z - pH) return s * 0;
  }
  // 2 ** (pH + pL)
  const ii = j & 0x7fffffff;
  let k = (ii >> 20) - 0x3ff;
  let n = 0;
  if (ii > 0x3fe00000) {
    // |z| > 0.5: n = [z + 0.5]
    n = j + (0x00100000 >> (k + 1));
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    const t = fromWords(n & ~(0x000fffff >> k), 0);
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    pH -= t;
  }
  let t = pL + pH;
  t = withLow0(t);
  const u = t * POW_LG2_H;
  const v = (pL - (t - pH)) * POW_LG2 + t * POW_LG2_L;
  z = u + v;
  const w = v - (z - u);
  t = z * z;
  const tt = z - t * (EXP_P1 + t * (EXP_P2 + t * (EXP_P3 + t * (EXP_P4 + t * EXP_P5))));
  const r = (z * tt) / (tt - 2) - (w + z * w);
  z = 1 - (r - z);
  let jz = hiWord(z);
  jz += n << 20;
  if (jz >> 20 <= 0)
    z = scale2(z, n); // subnormal result
  else z = withHi(z, jz);
  return s * z;
}

/** `x` with its low word cleared. */
function withLow0(x: number): number {
  view.setFloat64(0, x, true);
  view.setUint32(0, 0, true);
  return view.getFloat64(0, true);
}
