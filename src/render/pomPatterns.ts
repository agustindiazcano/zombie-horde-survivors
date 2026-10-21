import type { PomKind } from '../sim';

/**
 * Procedural surfaces for the texture lab. A pattern gives, for a point (u, v) of a tileable
 * square, a height (0 low to 1 high), a colour and optionally a glow and a roughness. Nothing is
 * a file, so there is nothing to download or license; every pattern wraps at the edges.
 */

export type Texel = {
  h: number;
  rgb: [number, number, number];
  /** Emitted light (r, g, b 0 to 255), for glowing lines. */
  glow?: [number, number, number];
  /** 0 mirror-like to 1 matt; the material's roughness is used when missing. */
  rough?: number;
};
export type Pattern = (u: number, v: number) => Texel;

export type SurfaceDef = {
  pattern: Pattern;
  /** How deep (m) the carving goes at full height difference, and how many metres one repeat covers. */
  depth: number;
  tile: number;
  roughness: number;
  metalness: number;
  /** The pattern gives a glow and / or its own roughness (so the maps are made). */
  glow?: boolean;
  rough?: boolean;
};

// ---------- Tileable noise from a lookup table (fast: no trigonometry per pixel) ----------

const TABLE = new Float32Array(256 * 256);
{
  let seed = 123456789;
  for (let i = 0; i < TABLE.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    TABLE[i] = seed / 4294967296;
  }
}

const cell = (i: number, j: number, seed: number): number =>
  TABLE[(((j + seed * 91) & 255) << 8) | ((i + seed * 37) & 255)]!;

const wrap = (i: number, period: number): number => ((i % period) + period) % period;

/** Value noise on a lattice of `px` by `py` cells that wraps, so the texture tiles. */
function noiseP(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px;
  const y = v * py;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = wrap(x0, px);
  const b = wrap(x0 + 1, px);
  const c = wrap(y0, py);
  const d = wrap(y0 + 1, py);
  const top = cell(a, c, seed) * (1 - sx) + cell(b, c, seed) * sx;
  const bottom = cell(a, d, seed) * (1 - sx) + cell(b, d, seed) * sx;
  return top * (1 - sy) + bottom * sy;
}

const noise = (u: number, v: number, period: number, seed: number): number =>
  noiseP(u, v, period, period, seed);

const fbm = (u: number, v: number, seed: number): number =>
  noise(u, v, 8, seed) * 0.5 + noise(u, v, 16, seed + 1) * 0.3 + noise(u, v, 32, seed + 2) * 0.2;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
/** Distance in the plane; faster than Math.hypot, which matters over a quarter of a million pixels. */
const hyp = (a: number, b: number): number => Math.sqrt(a * a + b * b);
const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);
const frac = (x: number): number => x - Math.floor(x);

type RGB = [number, number, number];
const mix3 = (a: number[], b: number[], t: number): RGB => [
  a[0]! + (b[0]! - a[0]!) * t,
  a[1]! + (b[1]! - a[1]!) * t,
  a[2]! + (b[2]! - a[2]!) * t,
];
const scale3 = (a: number[], k: number): RGB => [a[0]! * k, a[1]! * k, a[2]! * k];

/** Distance to the nearest and second nearest of a jittered grid of points (wrapping). */
function voronoi(u: number, v: number, cells: number, seed: number) {
  const x = u * cells;
  const y = v * cells;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let best = 9;
  let second = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const wx = wrap(cx + i, cells);
      const wy = wrap(cy + j, cells);
      const px = cx + i + 0.15 + 0.7 * cell(wx, wy, seed);
      const py = cy + j + 0.15 + 0.7 * cell(wx, wy, seed + 5);
      const dist = hyp(x - px, y - py);
      if (dist < best) {
        second = best;
        best = dist;
        id = cell(wx, wy, seed + 9);
      } else if (dist < second) second = dist;
    }
  }
  return { best, second, id };
}

// ---------- Patterns ----------

/** Rows of blocks, each row shifted half a block: bricks or stone blocks. */
function blocks(
  cols: number,
  rows: number,
  groove: number,
  palette: number[][],
  mortar: number[],
  rough: number,
  seed: number,
): Pattern {
  return (u, v) => {
    const row = Math.floor(v * rows);
    const shifted = u * cols + (row % 2) * 0.5;
    const col = Math.floor(shifted);
    const bx = shifted - col;
    const by = v * rows - row;
    const d = Math.min(Math.min(bx, 1 - bx) / cols, Math.min(by, 1 - by) / rows);
    const edge = smooth(groove * 0.3, groove * 1.6, d);
    const id = cell(wrap(col, cols), row, seed);
    const grain = fbm(u, v, seed);
    const h = (0.12 + 0.88 * edge) * (0.82 + 0.18 * id) * (1 - rough * 0.25 + rough * 0.5 * grain);
    const base = mix3(
      palette[Math.floor(id * palette.length) % palette.length]!,
      palette[0]!,
      0.25,
    );
    const rgb = mix3(mortar, scale3(base, 0.8 + 0.4 * grain), edge);
    return { h: clamp01(h), rgb };
  };
}

/** Panels split by grooves, with optional corner rivets or tie holes. */
function panels(
  count: number,
  seed: number,
  base: number[],
  mode: 'rivets' | 'holes',
  metal: boolean,
): Pattern {
  return (u, v) => {
    const x = u * count;
    const y = v * count;
    const fx = frac(x);
    const fy = frac(y);
    const d = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)) / count;
    const groove = smooth(0.004, 0.016, d);
    const rx = Math.min(fx, 1 - fx);
    const ry = Math.min(fy, 1 - fy);
    const spot = 1 - smooth(0.02, 0.06, hyp(rx - 0.09, ry - 0.09));
    const grain = fbm(u, v, seed);
    const pores = noise(u, v, 64, seed + 4) > 0.84 ? 0.6 : 1;
    let h: number;
    let shade: number;
    if (mode === 'rivets') {
      const scratch = noiseP(u, v, 3, 40, seed) * 0.5 + noiseP(u, v, 40, 3, seed + 2) * 0.5;
      h = 0.35 + 0.45 * groove + 0.2 * spot + 0.04 * scratch;
      shade = 0.7 + 0.5 * grain + 0.2 * scratch;
    } else {
      h = (0.45 + 0.4 * groove - 0.35 * spot) * pores + 0.1 * grain;
      shade = (0.75 + 0.4 * grain) * (0.8 + 0.2 * pores);
    }
    let rgb = mix3([30, 30, 32], scale3(base, shade), 0.35 + 0.65 * groove);
    if (mode === 'rivets') rgb = mix3(rgb, [rgb[0] + 55, rgb[1] + 55, rgb[2] + 60], spot * 0.5);
    else if (spot > 0.3) rgb = scale3(rgb, 0.45);
    // Rain stains run down the face.
    const stain = smooth(0.55, 0.8, noiseP(u, v, 6, 2, seed + 7));
    return { h: clamp01(h), rgb: scale3(rgb, 1 - 0.25 * stain), rough: metal ? 0.5 : undefined };
  };
}

/** Rounded stones packed together. */
function cobble(cells: number, seed: number): Pattern {
  return (u, v) => {
    const { best, second, id } = voronoi(u, v, cells, seed);
    const edge = smooth(0.0, 0.32, second - best);
    const grain = fbm(u, v, seed);
    const h = (0.08 + 0.92 * edge) * (0.85 + 0.15 * id) * (0.9 + 0.2 * grain);
    const stone = [95 + id * 55, 92 + id * 50, 86 + id * 45];
    return { h: clamp01(h), rgb: mix3([38, 34, 30], scale3(stone, 0.8 + 0.4 * grain), edge) };
  };
}

/** Vertical planks with grain, gaps and nails. */
const wood: Pattern = (u, v) => {
  const n = 6;
  const plank = Math.floor(u * n);
  const fx = u * n - plank;
  const edge = smooth(0.0, 0.07, Math.min(fx, 1 - fx));
  const grainA = noiseP(u + plank * 0.37, v, 24, 3, 40 + plank);
  const ring = 0.5 + 0.5 * Math.sin((grainA * 9 + fx * 2) * Math.PI);
  const tone = 0.7 + 0.25 * grainA + 0.1 * ring;
  const nail = (y: number) => 1 - smooth(0.012, 0.03, hyp((fx - 0.5) * 0.17, v - y));
  const nails = Math.max(nail(0.08), nail(0.92), nail(0.5));
  const h = 0.12 + 0.78 * edge + 0.06 * ring + 0.15 * nails;
  const rgb = mix3([22, 16, 10], scale3([140 + 20 * (plank % 2), 98, 58], tone), edge);
  return { h: clamp01(h), rgb: mix3(rgb, [150, 150, 150], nails * 0.6) };
};

/** Corrugated metal sheet with rust. */
const corrugated: Pattern = (u, v) => {
  const wave = 0.5 + 0.5 * Math.sin(v * Math.PI * 16);
  const rust = smooth(0.52, 0.7, fbm(u, v, 61));
  const grain = noise(u, v, 64, 62);
  const metal = scale3([118, 128, 136], 0.75 + 0.35 * wave + 0.15 * grain);
  const rgb = mix3(metal, [128, 66, 32], rust * 0.85);
  return { h: clamp01(0.15 + 0.8 * wave), rgb, rough: 0.45 + 0.4 * rust };
};

/** Sci-fi wall: recessed panels with bevels and a glowing cyan strip. */
const scifiWall: Pattern = (u, v) => {
  const cols = 2;
  const rows = 4;
  const fx = frac(u * cols);
  const fy = frac(v * rows);
  const d = Math.min(Math.min(fx, 1 - fx) / cols, Math.min(fy, 1 - fy) / rows);
  const bevel = smooth(0.003, 0.02, d);
  const inner = smooth(0.03, 0.05, d);
  const strip = 1 - smooth(0.004, 0.012, Math.abs(fy - 0.5) / rows);
  const stripOn = Math.abs(fx - 0.5) < 0.38 ? strip : 0;
  const grain = fbm(u, v, 71);
  const h = 0.2 + 0.4 * bevel + 0.25 * inner - 0.3 * stripOn;
  const rgb = scale3([62, 72, 90], 0.8 + 0.4 * grain + 0.25 * bevel * (1 - inner));
  return {
    h: clamp01(h),
    rgb: mix3(rgb, [140, 230, 255], stripOn * 0.8),
    glow: [0, 190 * stripOn, 255 * stripOn],
    rough: 0.4,
  };
};

/** Alien wall: bulging cells with glowing green veins between them. */
const alienWall: Pattern = (u, v) => {
  const { best, second, id } = voronoi(u, v, 6, 81);
  const gap = second - best;
  const vein = 1 - smooth(0.04, 0.2, gap);
  const bulge = smooth(0.0, 0.6, gap + 0.15 * id);
  const grain = fbm(u, v, 82);
  const h = 0.12 + 0.85 * bulge * (0.9 + 0.1 * grain);
  const skin = mix3([58, 40, 72], [84, 112, 70], id * 0.7 + 0.3 * grain);
  return {
    h: clamp01(h),
    rgb: mix3(skin, [40, 210, 110], vein * 0.6),
    glow: [30 * vein, 255 * vein, 110 * vein],
    rough: 0.28,
  };
};

/** Diamond-plate metal: alternating raised lozenges. */
const metalFloor: Pattern = (u, v) => {
  const n = 8;
  const gx = u * n;
  const gy = v * n;
  const x = frac(gx) - 0.5;
  const y = frac(gy) - 0.5;
  const a = (x + y) * 0.7071;
  const b = (x - y) * 0.7071;
  const flip = (Math.floor(gx) + Math.floor(gy)) % 2 === 0;
  const lozenge = flip ? (a / 0.38) ** 2 + (b / 0.085) ** 2 : (b / 0.38) ** 2 + (a / 0.085) ** 2;
  const bump = 1 - smooth(0.55, 1, lozenge);
  const scratch = noiseP(u, v, 5, 60, 91) * 0.5 + noiseP(u, v, 60, 5, 92) * 0.5;
  const worn = fbm(u, v, 93);
  const metal = 120 + 30 * worn + 35 * bump + 25 * scratch;
  return {
    h: clamp01(0.3 + 0.7 * bump),
    rgb: [metal * 0.96, metal, metal * 1.05],
    rough: 0.4 + 0.3 * worn,
  };
};

/** Sci-fi floor: dark tiles with an inset glowing outline and a vent. */
const scifiFloor: Pattern = (u, v) => {
  const n = 3;
  const fx = frac(u * n);
  const fy = frac(v * n);
  const edge = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
  const groove = smooth(0.012, 0.035, edge);
  const line = 1 - smooth(0.006, 0.016, Math.abs(edge - 0.09));
  const ring = hyp(fx - 0.5, fy - 0.5);
  const vent = 1 - smooth(0.1, 0.16, ring);
  const slots = vent > 0.1 && Math.sin(fx * 90) > 0.2 ? 0 : 1;
  const grain = fbm(u, v, 101);
  const h = 0.25 + 0.55 * groove - 0.2 * line + 0.2 * (1 - vent * (1 - slots));
  const rgb = scale3([54, 60, 74], 0.8 + 0.4 * grain + 0.2 * groove);
  return {
    h: clamp01(h),
    rgb: mix3(rgb, [120, 220, 255], line * 0.8),
    glow: [20 * line, 170 * line, 255 * line],
    rough: 0.3,
  };
};

/** Alien floor: slimy ridged flesh with glowing pustules. */
const alienFloor: Pattern = (u, v) => {
  const { best, second, id } = voronoi(u, v, 5, 111);
  const gap = second - best;
  const ridge = smooth(0.0, 0.5, gap);
  const grain = fbm(u, v, 112);
  const pustule = id > 0.78 ? 1 - smooth(0.05, 0.3, best) : 0;
  const h = 0.2 + 0.6 * ridge * (0.85 + 0.15 * grain) + 0.2 * pustule;
  const skin = mix3([46, 34, 58], [70, 104, 60], grain);
  return {
    h: clamp01(h),
    rgb: mix3(skin, [255, 170, 60], pustule * 0.8),
    glow: [255 * pustule, 130 * pustule, 20 * pustule],
    rough: 0.22,
  };
};

/** Packed earth with pebbles. */
const dirt: Pattern = (u, v) => {
  const grain = fbm(u, v, 121);
  const fine = noise(u, v, 128, 122);
  const { best, id } = voronoi(u, v, 14, 123);
  const pebble = id > 0.62 ? 1 - smooth(0.1, 0.3, best) : 0;
  const h = 0.25 + 0.4 * grain + 0.1 * fine + 0.35 * pebble;
  const soil = scale3([112, 82, 56], 0.7 + 0.5 * grain + 0.2 * fine);
  return { h: clamp01(h), rgb: mix3(soil, [128, 124, 116], pebble * 0.8), rough: 0.96 };
};

/** Sand with wind ripples. */
const sand: Pattern = (u, v) => {
  const grain = fbm(u, v, 131);
  const phase = (u * 5 + v * 3) * Math.PI * 2 + grain * 5;
  const ripple = 0.5 + 0.5 * Math.sin(phase);
  const speck = noise(u, v, 128, 132);
  const h = 0.3 + 0.4 * ripple + 0.2 * grain;
  const tone = 0.82 + 0.18 * ripple + 0.08 * speck;
  return { h: clamp01(h), rgb: scale3([218, 192, 142], tone), rough: 0.98 };
};

/** Flagstones with puddles: the water is flat, dark and mirror-like. */
const wet: Pattern = (u, v) => {
  const n = 3;
  const fx = frac(u * n);
  const fy = frac(v * n);
  const edge = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)) / n;
  const joint = smooth(0.004, 0.02, edge);
  const grain = fbm(u, v, 141);
  const stone = noise(u, v, 48, 142);
  const puddle = smooth(0.5, 0.58, fbm(u, v, 143));
  const dry = 0.15 + 0.7 * joint * (0.85 + 0.15 * stone);
  const h = dry * (1 - puddle) + 0.28 * puddle;
  const slab = scale3([96, 98, 100], 0.75 + 0.4 * grain);
  const damp = scale3(slab, 0.7);
  const rgb = mix3(mix3([30, 30, 32], damp, joint), [34, 42, 52], puddle);
  return { h: clamp01(h), rgb, rough: 0.55 * (1 - puddle) + 0.04 * puddle };
};

/** Asphalt with a dashed yellow centre line, white edge lines and cracks. */
const road: Pattern = (u, v) => {
  const grain = noise(u, v, 128, 151) * 0.5 + fbm(u, v, 152) * 0.5;
  const speck = noise(u, v, 256, 153) > 0.9 ? 1 : 0;
  const crack = Math.abs(noise(u, v, 12, 154) - 0.5) < 0.012 ? 1 : 0;
  const dash = frac(u * 4) < 0.6 ? 1 : 0;
  const centre = (Math.abs(v - 0.5) < 0.035 ? 1 : 0) * dash;
  const edge = Math.abs(v - 0.06) < 0.02 || Math.abs(v - 0.94) < 0.02 ? 1 : 0;
  const worn = 0.6 + 0.4 * noise(u, v, 24, 155);
  let rgb = scale3([58, 59, 63], 0.75 + 0.5 * grain + 0.25 * speck);
  rgb = mix3(rgb, [226, 178, 30], centre * worn);
  rgb = mix3(rgb, [222, 222, 214], edge * worn);
  rgb = scale3(rgb, 1 - 0.5 * crack);
  const marking = Math.max(centre, edge);
  return { h: clamp01(0.4 + 0.18 * grain + 0.1 * marking - 0.3 * crack), rgb, rough: 0.82 };
};

const BRICKS = [
  [150, 62, 46],
  [128, 54, 40],
  [166, 80, 58],
  [112, 48, 38],
];
const STONES = [
  [150, 148, 140],
  [128, 126, 120],
  [168, 162, 150],
];

export const SURFACES: Record<PomKind, SurfaceDef> = {
  brick: {
    pattern: blocks(4, 8, 0.012, BRICKS, [150, 146, 138], 0.7, 3),
    depth: 0.1,
    tile: 2,
    roughness: 0.92,
    metalness: 0,
  },
  stone: {
    pattern: blocks(2, 4, 0.02, STONES, [60, 58, 54], 1, 11),
    depth: 0.16,
    tile: 2,
    roughness: 0.92,
    metalness: 0,
  },
  plates: {
    pattern: panels(2, 21, [124, 130, 140], 'rivets', true),
    depth: 0.07,
    tile: 2,
    roughness: 0.92,
    metalness: 0.5,
    rough: true,
  },
  concrete: {
    pattern: panels(2, 25, [140, 140, 136], 'holes', false),
    depth: 0.06,
    tile: 2,
    roughness: 0.95,
    metalness: 0,
  },
  wood: { pattern: wood, depth: 0.06, tile: 2, roughness: 0.85, metalness: 0 },
  corrugated: {
    pattern: corrugated,
    depth: 0.12,
    tile: 2,
    roughness: 1,
    metalness: 0.55,
    rough: true,
  },
  scifiwall: {
    pattern: scifiWall,
    depth: 0.09,
    tile: 2,
    roughness: 1,
    metalness: 0.5,
    glow: true,
    rough: true,
  },
  alienwall: {
    pattern: alienWall,
    depth: 0.18,
    tile: 2,
    roughness: 1,
    metalness: 0,
    glow: true,
    rough: true,
  },
  cobble: { pattern: cobble(7, 31), depth: 0.14, tile: 2, roughness: 0.92, metalness: 0 },
  metal: { pattern: metalFloor, depth: 0.05, tile: 2, roughness: 1, metalness: 0.7, rough: true },
  scififloor: {
    pattern: scifiFloor,
    depth: 0.06,
    tile: 3,
    roughness: 1,
    metalness: 0.6,
    glow: true,
    rough: true,
  },
  alienfloor: {
    pattern: alienFloor,
    depth: 0.12,
    tile: 3,
    roughness: 1,
    metalness: 0,
    glow: true,
    rough: true,
  },
  dirt: { pattern: dirt, depth: 0.1, tile: 3, roughness: 0.96, metalness: 0 },
  sand: { pattern: sand, depth: 0.08, tile: 3, roughness: 0.98, metalness: 0 },
  wet: { pattern: wet, depth: 0.08, tile: 3, roughness: 1, metalness: 0, rough: true },
  road: { pattern: road, depth: 0.03, tile: 4, roughness: 0.82, metalness: 0 },
};
