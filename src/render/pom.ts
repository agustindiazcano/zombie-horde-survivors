import * as THREE from 'three';

/**
 * Parallax occlusion mapping (POM) for the texture lab: a surface that looks carved. Each material
 * pairs an albedo with a height map (white = the top of the surface); the fragment shader marches
 * a ray through the height field, shifts the texture lookup to where the ray hits, darkens the
 * hollows, lets the high parts shadow the low ones from the sun, and bends the normal to the
 * slope. The textures are drawn here (no files), so nothing is downloaded and they tile.
 */

export type PomKind = 'brick' | 'stone' | 'plates' | 'cobble';

const SIZE = 512;
/** One texture repeat covers this many metres. */
export const POM_TILE = 2;
/** How deep (m) the carving goes at full height difference. */
const DEPTH: Record<PomKind, number> = { brick: 0.1, stone: 0.16, plates: 0.07, cobble: 0.14 };
const MAX_STEPS = 48;

// ---------- Tileable noise ----------

const hash2 = (x: number, y: number, seed: number): number => {
  const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Value noise on a lattice of `period` cells that wraps, so the texture tiles. */
function noise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (i: number, j: number) =>
    hash2(((i % period) + period) % period, ((j % period) + period) % period, seed);
  const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
  const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

const fbm = (u: number, v: number, seed: number): number =>
  noise(u, v, 8, seed) * 0.5 + noise(u, v, 16, seed + 1) * 0.3 + noise(u, v, 32, seed + 2) * 0.2;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// ---------- Patterns: each returns the height (0..1) and an RGB colour at (u, v) ----------

type Texel = { h: number; rgb: [number, number, number] };
type Pattern = (u: number, v: number) => Texel;

const mix3 = (a: number[], b: number[], t: number): [number, number, number] => [
  a[0]! + (b[0]! - a[0]!) * t,
  a[1]! + (b[1]! - a[1]!) * t,
  a[2]! + (b[2]! - a[2]!) * t,
];

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
    // Distance to the nearest joint, in texture units.
    const d = Math.min(Math.min(bx, 1 - bx) / cols, Math.min(by, 1 - by) / rows);
    const edge = smooth(groove * 0.3, groove * 1.6, d);
    const id = hash2(((col % cols) + cols) % cols, row, seed);
    const grain = fbm(u, v, seed);
    const h = (0.12 + 0.88 * edge) * (0.82 + 0.18 * id) * (1 - rough * 0.25 + rough * 0.5 * grain);
    const base = mix3(
      palette[Math.floor(id * palette.length) % palette.length]!,
      palette[0]!,
      0.25,
    );
    const tone = 0.8 + 0.4 * grain;
    const rgb = mix3(
      mortar,
      base.map((c) => c * tone),
      edge,
    );
    return { h: Math.min(Math.max(h, 0), 1), rgb };
  };
}

/** Rounded stones packed together (a jittered grid, with the nearest cell deciding). */
function cobble(cells: number, seed: number): Pattern {
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let best = 9;
    let second = 9;
    let bestId = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const wx = (((cx + i) % cells) + cells) % cells;
        const wy = (((cy + j) % cells) + cells) % cells;
        const px = cx + i + 0.15 + 0.7 * hash2(wx, wy, seed);
        const py = cy + j + 0.15 + 0.7 * hash2(wx, wy, seed + 5);
        const dist = Math.hypot(x - px, y - py);
        if (dist < best) {
          second = best;
          best = dist;
          bestId = hash2(wx, wy, seed + 9);
        } else if (dist < second) second = dist;
      }
    }
    const edge = smooth(0.0, 0.32, second - best);
    const grain = fbm(u, v, seed);
    const h = (0.08 + 0.92 * edge) * (0.85 + 0.15 * bestId) * (0.9 + 0.2 * grain);
    const stone = [95 + bestId * 55, 92 + bestId * 50, 86 + bestId * 45];
    return {
      h: Math.min(Math.max(h, 0), 1),
      rgb: mix3(
        [38, 34, 30],
        stone.map((c) => c * (0.8 + 0.4 * grain)),
        edge,
      ),
    };
  };
}

/** Riveted metal panels split by grooves. */
function plates(panels: number, seed: number): Pattern {
  return (u, v) => {
    const x = u * panels;
    const y = v * panels;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const d = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)) / panels;
    const groove = smooth(0.004, 0.016, d);
    // A rivet near each corner of a panel.
    const rx = Math.min(fx, 1 - fx);
    const ry = Math.min(fy, 1 - fy);
    const rivet = 1 - smooth(0.02, 0.06, Math.hypot(rx - 0.09, ry - 0.09));
    const scratch = noise(u * 3, v * 40, 40, seed) * 0.5 + noise(u * 40, v * 3, 40, seed + 2) * 0.5;
    const grain = fbm(u, v, seed);
    const h = Math.min(0.35 + 0.45 * groove + 0.2 * rivet + 0.04 * scratch, 1);
    const metal = 120 + 40 * grain + 25 * scratch;
    const rgb = mix3([30, 30, 32], [metal * 0.95, metal, metal * 1.08], 0.35 + 0.65 * groove);
    return { h, rgb: mix3(rgb, [rgb[0] + 55, rgb[1] + 55, rgb[2] + 60], rivet * 0.5) };
  };
}

const PATTERNS: Record<PomKind, Pattern> = {
  brick: blocks(
    4,
    8,
    0.012,
    [
      [150, 62, 46],
      [128, 54, 40],
      [166, 80, 58],
      [112, 48, 38],
    ],
    [150, 146, 138],
    0.7,
    3,
  ),
  stone: blocks(
    2,
    4,
    0.02,
    [
      [150, 148, 140],
      [128, 126, 120],
      [168, 162, 150],
    ],
    [60, 58, 54],
    1,
    11,
  ),
  plates: plates(2, 21),
  cobble: cobble(7, 31),
};

// ---------- Textures and materials ----------

type Surface = { albedo: THREE.CanvasTexture; height: THREE.CanvasTexture };
const surfaces = new Map<PomKind, Surface>();

function surfaceOf(kind: PomKind): Surface {
  const cached = surfaces.get(kind);
  if (cached) return cached;
  const pattern = PATTERNS[kind];
  const albedo = document.createElement('canvas');
  const height = document.createElement('canvas');
  albedo.width = albedo.height = height.width = height.height = SIZE;
  const ca = albedo.getContext('2d')!;
  const ch = height.getContext('2d')!;
  const ia = ca.createImageData(SIZE, SIZE);
  const ih = ch.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = pattern((x + 0.5) / SIZE, (y + 0.5) / SIZE);
      const i = (y * SIZE + x) * 4;
      ia.data[i] = t.rgb[0];
      ia.data[i + 1] = t.rgb[1];
      ia.data[i + 2] = t.rgb[2];
      ia.data[i + 3] = 255;
      ih.data[i] = ih.data[i + 1] = ih.data[i + 2] = Math.round(t.h * 255);
      ih.data[i + 3] = 255;
    }
  }
  ca.putImageData(ia, 0, 0);
  ch.putImageData(ih, 0, 0);
  const make = (canvas: HTMLCanvasElement, color: boolean) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return tex;
  };
  const surface = { albedo: make(albedo, true), height: make(height, false) };
  surfaces.set(kind, surface);
  return surface;
}

/** Quality of the parallax: 0 off (a plain textured surface), 1 the cheaper march, 2 the full one. */
let quality = 2;
const materials: { uniforms: PomUniforms }[] = [];

type PomUniforms = {
  pomHeight: { value: THREE.Texture };
  pomDepth: { value: number };
  pomSteps: { value: number };
  pomShadow: { value: number };
};

const stepsFor = (q: number): number => (q >= 2 ? 40 : q === 1 ? 16 : 0);

export function setPomQuality(next: number): void {
  quality = next;
  for (const m of materials) {
    m.uniforms.pomSteps.value = stepsFor(quality);
    m.uniforms.pomShadow.value = quality >= 2 ? 1 : 0;
  }
}

const FRAGMENT_DECLARATIONS = /* glsl */ `
uniform sampler2D pomHeight;
uniform float pomDepth;
uniform float pomSteps;
uniform float pomShadow;
vec2 pomUv;
vec3 pomT;
vec3 pomB;
vec3 pomN;
float pomLight = 1.0;
vec2 pomGx;
vec2 pomGy;
float pomH(vec2 uv) { return textureGrad(pomHeight, uv, pomGx, pomGy).r; }
`;

// Runs where the albedo is read: finds where the view ray meets the height field.
const FRAGMENT_UV = /* glsl */ `
{
  vec3 P = -vViewPosition;
  vec3 q0 = dFdx(P);
  vec3 q1 = dFdy(P);
  vec2 st0 = dFdx(vMapUv);
  vec2 st1 = dFdy(vMapUv);
  pomGx = st0;
  pomGy = st1;
  pomN = normalize(cross(q0, q1));
  vec3 q1perp = cross(q1, pomN);
  vec3 q0perp = cross(pomN, q0);
  pomT = normalize(q1perp * st0.x + q0perp * st1.x);
  pomB = normalize(q1perp * st0.y + q0perp * st1.y);
  pomUv = vMapUv;
  if (pomSteps > 0.5) {
    vec3 V = normalize(vViewPosition);
    vec3 vt = vec3(dot(V, pomT), dot(V, pomB), dot(V, pomN));
    float layers = mix(pomSteps, pomSteps * 0.35, clamp(vt.z, 0.0, 1.0));
    layers = max(floor(layers), 4.0);
    // Total shift of the lookup at full depth, away from the viewer.
    vec2 dUv = -vt.xy / max(vt.z, 0.1) * pomDepth;
    float layerD = 1.0 / layers;
    float dPrev = 0.0;
    float dmPrev = 1.0 - pomH(vMapUv);
    float d = 0.0;
    vec2 uvCur = vMapUv;
    float dmCur = dmPrev;
    for (int i = 0; i < ${MAX_STEPS}; i++) {
      if (float(i) >= layers) break;
      d += layerD;
      uvCur = vMapUv + dUv * d;
      dmCur = 1.0 - pomH(uvCur);
      if (d >= dmCur) break;
      dPrev = d;
      dmPrev = dmCur;
    }
    float after = dmCur - d;
    float before = dmPrev - dPrev;
    float w = clamp(after / min(after - before, -1e-4), 0.0, 1.0);
    pomUv = mix(uvCur, vMapUv + dUv * dPrev, w);

    // Hollows are darker; the high parts shadow the low ones from the sun.
    float hHere = pomH(pomUv);
    pomLight = mix(0.5, 1.0, hHere);
    #if NUM_DIR_LIGHTS > 0
    if (pomShadow > 0.5) {
      vec3 L = directionalLights[0].direction;
      vec3 lt = vec3(dot(L, pomT), dot(L, pomB), dot(L, pomN));
      if (lt.z > 0.05) {
        vec2 toLight = lt.xy / lt.z * pomDepth;
        float occ = 0.0;
        for (int k = 1; k <= 8; k++) {
          float f = float(k) / 8.0;
          float level = hHere + (1.0 - hHere) * f;
          float blocker = pomH(pomUv + toLight * (level - hHere)) - level;
          occ = max(occ, blocker * (1.0 - f * 0.6));
        }
        pomLight *= 1.0 - 0.75 * clamp(occ * 5.0, 0.0, 1.0);
      }
    }
    #endif
  }
  vec4 sampledDiffuseColor = textureGrad(map, pomUv, pomGx, pomGy);
  diffuseColor *= sampledDiffuseColor;
  diffuseColor.rgb *= pomLight;
}
`;

// Runs after the normal map step: the slope of the height field tilts the normal.
const FRAGMENT_NORMAL = /* glsl */ `
{
  float e = 1.0 / ${SIZE}.0;
  float hx = pomH(pomUv + vec2(e, 0.0)) - pomH(pomUv - vec2(e, 0.0));
  float hy = pomH(pomUv + vec2(0.0, e)) - pomH(pomUv - vec2(0.0, e));
  vec2 slope = vec2(hx, hy) * (pomDepth / (2.0 * e));
  vec3 nt = normalize(vec3(-slope, 1.0));
  normal = normalize(pomT * nt.x + pomB * nt.y + pomN * nt.z);
}
`;

export function createPomMaterial(kind: PomKind): THREE.MeshStandardMaterial {
  const { albedo, height } = surfaceOf(kind);
  const material = new THREE.MeshStandardMaterial({
    map: albedo,
    roughness: 0.92,
    metalness: kind === 'plates' ? 0.5 : 0,
  });
  const uniforms: PomUniforms = {
    pomHeight: { value: height },
    pomDepth: { value: DEPTH[kind] / POM_TILE },
    pomSteps: { value: stepsFor(quality) },
    pomShadow: { value: quality >= 2 ? 1 : 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${FRAGMENT_DECLARATIONS}\nvoid main() {`)
      .replace('#include <map_fragment>', FRAGMENT_UV)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\n${FRAGMENT_NORMAL}`,
      );
  };
  material.customProgramCacheKey = () => 'pom';
  materials.push({ uniforms });
  return material;
}

/** A box whose faces carry the texture at its real size, so the bricks keep their proportions. */
export function pomBox(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  // Faces in order: +x, -x, +y, -y, +z, -z; four vertices each.
  const sizes: [number, number][] = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];
  sizes.forEach(([w, h], face) => {
    for (let i = 0; i < 4; i++) {
      const k = face * 4 + i;
      uv.setXY(k, (uv.getX(k) * w) / POM_TILE, (uv.getY(k) * h) / POM_TILE);
    }
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
