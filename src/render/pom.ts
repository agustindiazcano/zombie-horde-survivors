import * as THREE from 'three';
import type { PomKind, ProceduralKind } from '../sim';
import { SURFACES, type Texel } from './pomPatterns';
import { isReal, loadReal, realDef } from './realSurfaces';

/**
 * Parallax occlusion mapping (POM) for the texture lab: a surface that looks carved. Each material
 * pairs an albedo with a height map (white = the top of the surface); the fragment shader marches
 * a ray through the height field, shifts the texture lookup to where the ray hits, darkens the
 * hollows, lets the high parts shadow the low ones from the sun, and bends the normal to the
 * slope. The textures are drawn here (no files), so nothing is downloaded and they tile.
 */

/** Side (px) of a drawn texture at each texture quality: 0 melted, 1 low, 2 normal, 3 ultra. */
const SIZES = [64, 128, 256, 512] as const;
let textureLevel = 2;
const MAX_STEPS = 72;

type Surface = {
  albedo: THREE.Texture;
  height: THREE.Texture;
  glow: THREE.Texture | null;
  rough: THREE.Texture | null;
  /** Settles once every map is drawn or downloaded, so a quality change can wait for it. */
  ready: Promise<void>;
};
const surfaces = new Map<string, Surface>();

const SLICE_MS = 10;

const put = (out: Uint8ClampedArray, i: number, r: number, g: number, b: number): void => {
  out[i] = r;
  out[i + 1] = g;
  out[i + 2] = b;
  out[i + 3] = 255;
};

type Job = {
  kind: ProceduralKind;
  size: number;
  done: () => void;
  row: number;
  planes: {
    data: Uint8ClampedArray;
    texture: THREE.CanvasTexture;
    canvas: HTMLCanvasElement;
    fill: (t: Texel, out: Uint8ClampedArray, i: number) => void;
  }[];
};
const jobs: Job[] = [];
let running = false;

/** A canvas texture that starts as a flat neutral colour and is filled in later. */
function plane(
  size: number,
  color: boolean,
  neutral: [number, number, number],
  fill: Job['planes'][number]['fill'],
): Job['planes'][number] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = `rgb(${neutral[0]}, ${neutral[1]}, ${neutral[2]})`;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return { data: new Uint8ClampedArray(size * size * 4), texture, canvas, fill };
}

/** Evaluates the patterns a few milliseconds per frame, so a map never freezes while it loads. */
function work(): void {
  const t0 = performance.now();
  while (jobs.length > 0 && performance.now() - t0 < SLICE_MS) {
    const job = jobs[0]!;
    const { pattern } = SURFACES[job.kind];
    const y = job.row++;
    for (let x = 0; x < job.size; x++) {
      const t = pattern((x + 0.5) / job.size, (y + 0.5) / job.size);
      const i = (y * job.size + x) * 4;
      for (const p of job.planes) p.fill(t, p.data, i);
    }
    if (job.row >= job.size) {
      for (const p of job.planes) {
        p.canvas
          .getContext('2d')!
          .putImageData(
            new ImageData(p.data as Uint8ClampedArray<ArrayBuffer>, job.size, job.size),
            0,
            0,
          );
        p.texture.needsUpdate = true;
      }
      jobs.shift()?.done();
    }
  }
  if (jobs.length > 0) requestAnimationFrame(work);
  else running = false;
}

function surfaceOf(kind: PomKind): Surface {
  const key = `${kind}@${textureLevel}`;
  const cached = surfaces.get(key);
  if (cached) return cached;
  if (isReal(kind)) {
    const loaded: Surface = { ...loadReal(kind, textureLevel), glow: null };
    surfaces.set(key, loaded);
    return loaded;
  }
  const size = SIZES[textureLevel] ?? 256;
  const def = SURFACES[kind];
  const albedo = plane(size, true, [128, 128, 128], (t, out, i) =>
    put(out, i, t.rgb[0], t.rgb[1], t.rgb[2]),
  );
  const height = plane(size, false, [128, 128, 128], (t, out, i) =>
    put(out, i, t.h * 255, t.h * 255, t.h * 255),
  );
  const glow = def.glow
    ? plane(size, true, [0, 0, 0], (t, out, i) =>
        put(out, i, t.glow?.[0] ?? 0, t.glow?.[1] ?? 0, t.glow?.[2] ?? 0),
      )
    : null;
  // The roughness is read from the green channel.
  const rough = def.rough
    ? plane(size, false, [0, def.roughness * 255, 0], (t, out, i) =>
        put(out, i, 0, (t.rough ?? def.roughness) * 255, 0),
      )
    : null;
  const planes = [albedo, height, ...(glow ? [glow] : []), ...(rough ? [rough] : [])];
  let done = (): void => {};
  const ready = new Promise<void>((resolve) => (done = resolve));
  jobs.push({ kind, size, done, row: 0, planes });
  if (!running) {
    running = true;
    requestAnimationFrame(work);
  }
  const surface: Surface = {
    albedo: albedo.texture,
    height: height.texture,
    glow: glow?.texture ?? null,
    rough: rough?.texture ?? null,
    ready,
  };
  surfaces.set(key, surface);
  return surface;
}

/** Quality of the parallax: 0 off (a plain textured surface), 1 the cheaper march, 2 the full one. */
let quality = 2;
const materials: {
  uniforms: PomUniforms;
  material: THREE.MeshStandardMaterial;
  kind: PomKind;
}[] = [];

type PomUniforms = {
  pomHeight: { value: THREE.Texture };
  pomDepth: { value: number };
  pomSteps: { value: number };
  pomShadow: { value: number };
};

/** Texture detail: 0 melted, 1 low, 2 normal, 3 ultra. Surfaces already on screen switch over in place. */
export function setTextureQuality(level: number): void {
  const next = Math.min(Math.max(Math.round(level), 0), SIZES.length - 1);
  if (next === textureLevel) return;
  textureLevel = next;
  for (const m of materials) {
    const surface = surfaceOf(m.kind);
    // The old maps stay on screen until the new ones are ready, instead of a grey flash.
    void surface.ready.then(() => {
      if (textureLevel !== next) return;
      m.material.map = surface.albedo;
      m.material.roughnessMap = surface.rough;
      m.material.emissiveMap = surface.glow;
      m.uniforms.pomHeight.value = surface.height;
    });
  }
}

const stepsFor = (q: number): number => (q >= 3 ? 72 : q === 2 ? 40 : q === 1 ? 16 : 0);

export function setPomQuality(next: number): void {
  quality = next;
  for (const m of materials) {
    m.uniforms.pomSteps.value = stepsFor(quality);
    m.uniforms.pomShadow.value = quality >= 2 ? 1 : 0;
  }
}

const VERTEX_DECLARATIONS = /* glsl */ `
attribute vec2 pomExtent;
varying vec2 vPomExtent;
`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
varying vec2 vPomExtent;
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

    // Silhouette: where the carved surface lies beyond the edge of the face, there is no surface,
    // so the corners of a brick or stone wall follow the relief instead of staying straight.
    if (vPomExtent.x > 0.0 &&
        (pomUv.x < 0.0 || pomUv.y < 0.0 || pomUv.x > vPomExtent.x || pomUv.y > vPomExtent.y)) {
      discard;
    }

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
  float e = 1.0 / float(textureSize(pomHeight, 0).x);
  float hx = pomH(pomUv + vec2(e, 0.0)) - pomH(pomUv - vec2(e, 0.0));
  float hy = pomH(pomUv + vec2(0.0, e)) - pomH(pomUv - vec2(0.0, e));
  vec2 slope = vec2(hx, hy) * (pomDepth / (2.0 * e));
  vec3 nt = normalize(vec3(-slope, 1.0));
  normal = normalize(pomT * nt.x + pomB * nt.y + pomN * nt.z);
}
`;

// The roughness and glow maps are read where the carved surface really is, not where the face is.
const FRAGMENT_ROUGHNESS = /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
roughnessFactor *= textureGrad(roughnessMap, pomUv, pomGx, pomGy).g;
#endif
`;
const FRAGMENT_EMISSIVE = /* glsl */ `
#ifdef USE_EMISSIVEMAP
totalEmissiveRadiance *= textureGrad(emissiveMap, pomUv, pomGx, pomGy).rgb;
#endif
`;

/** The carving depth, tile size and material numbers of a surface, procedural or real. */
function defOf(kind: PomKind): {
  depth: number;
  tile: number;
  roughness: number;
  metalness: number;
} {
  return isReal(kind) ? realDef(kind) : SURFACES[kind];
}

export function createPomMaterial(kind: PomKind): THREE.MeshStandardMaterial {
  const { albedo, height, glow, rough } = surfaceOf(kind);
  const def = defOf(kind);
  const material = new THREE.MeshStandardMaterial({
    map: albedo,
    roughness: rough ? 1 : def.roughness,
    roughnessMap: rough,
    metalness: def.metalness,
    emissive: glow ? 0xffffff : 0x000000,
    emissiveMap: glow,
    emissiveIntensity: 1.4,
  });
  const uniforms: PomUniforms = {
    pomHeight: { value: height },
    pomDepth: { value: def.depth / def.tile },
    pomSteps: { value: stepsFor(quality) },
    pomShadow: { value: quality >= 2 ? 1 : 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${VERTEX_DECLARATIONS}\nvoid main() {`)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPomExtent = pomExtent;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${FRAGMENT_DECLARATIONS}\nvoid main() {`)
      .replace('#include <map_fragment>', FRAGMENT_UV)
      .replace('#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS)
      .replace('#include <emissivemap_fragment>', FRAGMENT_EMISSIVE)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\n${FRAGMENT_NORMAL}`,
      );
  };
  material.customProgramCacheKey = () => 'pom';
  materials.push({ uniforms, material, kind });
  return material;
}

/** A box whose faces carry the texture at its real size, so the bricks keep their proportions. */
export function pomBox(
  kind: PomKind,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  const tile = defOf(kind).tile;
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
  const extent = new Float32Array(24 * 2);
  sizes.forEach(([w, h], face) => {
    for (let i = 0; i < 4; i++) {
      const k = face * 4 + i;
      extent[k * 2] = w / tile;
      extent[k * 2 + 1] = h / tile;
      uv.setXY(k, (uv.getX(k) * w) / tile, (uv.getY(k) * h) / tile);
    }
  });
  geometry.setAttribute('pomExtent', new THREE.BufferAttribute(extent, 2));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
