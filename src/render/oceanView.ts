import * as THREE from 'three';
import { RAIN_RIPPLES_GLSL, rainFxUniforms } from './rainFx';
import { heightAt, waveTable, WAVE_COUNT, type Environment, type GameConfig } from '../sim';

type WaterLook = Environment['water'];

const PHI = (1 + Math.sqrt(5)) / 2;
/** Vertices per metre of the water plane (the waves are 15 m and longer, so 1 per 2 m is plenty). */
const VERTS_PER_METRE = 0.5;
const MAX_SEGMENTS = 256;
/** Each neon orb is also a real point light (candela and reach in metres), so it lights the ground, the trees and the units. */
const NEON_LIGHT = 450;
const NEON_RANGE = 60;
const NEON_COLORS = [
  0x00ffff, 0xff00aa, 0x00ff66, 0xffaa00, 0xaa00ff, 0xff2255, 0x33ccff, 0xccff00,
];

const COMMON = /* glsl */ `
const float PHI = ${PHI.toFixed(10)};
const float PHI_SQ = ${(PHI * PHI).toFixed(10)};
const int WAVES = ${WAVE_COUNT};
uniform vec2 uDirs[${WAVE_COUNT}];
uniform vec4 uWaveP[${WAVE_COUNT}];  // height, frequency, speed, pressure of each wave
uniform float uPhase[${WAVE_COUNT}];
uniform vec4 uVortex[3];  // x, z, strength, radius of each whirlpool
uniform int uVortexN;
uniform vec3 uShape;    // hooke, silk, shoreFade
uniform vec2 uCurrent;  // m/s
uniform float uLevel;
uniform float uTime;

const float K_SPIRAL = ${((2 * Math.log(PHI)) / Math.PI).toFixed(10)};
// Same maths as vortexHeight() in src/sim/ocean.ts; foam is the bright ring round each funnel.
float vortexH(vec2 p, out float foam) {
  float h = 0.0;
  foam = 0.0;
  for (int v = 0; v < 3; v++) {
    if (v >= uVortexN) break;
    vec4 w = uVortex[v];
    vec2 d = p - w.xy;
    float r = length(d);
    float rn = r * 14.5 / w.w;
    float funnel = -20.0 * w.z / (1.0 + pow(r / w.w, 1.65) + 0.25);
    float phase = 3.0 * atan(d.y, d.x) + rn * K_SPIRAL * 0.85 - uTime * 3.4;
    h += funnel + sin(phase) * 1.2 * w.z * exp(-rn * 0.025) * smoothstep(2.0, 14.0, rn);
    foam += exp(-pow((rn - 12.5) * 0.18, 2.0)) * w.z * 1.35;
  }
  return h;
}
// Same maths as oceanHeight() in src/sim/ocean.ts.
float oceanH(vec2 p, float groundY) {
  float fade = clamp((uLevel + uShape.z - groundY) * 0.15, 0.0, 1.0);
  if (fade <= 0.0) return 0.0;
  vec2 off = uCurrent * uTime * 0.12;
  float sum = 0.0;
  for (int i = 0; i < WAVES; i++) {
    vec4 w = uWaveP[i];
    float amp = w.x, pressure = w.w;
    float phase = dot(p - off, uDirs[i]) * w.y + uTime * w.z + uPhase[i];
    float s = sin(phase);
    float smoothW = s + uShape.y * 0.8 * cos(phase * 2.0);
    float sharpW = (pow(1.0 - abs(s), pressure) - 0.45) * 2.15;
    sum += mix(smoothW, sharpW, uShape.x) * amp;
  }
  float unusedFoam;
  return (sum + vortexH(p, unusedFoam)) * fade;
}
`;

const VERTEX = /* glsl */ `
attribute float aGround;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vDepth;
varying float vCrest;
varying float vVortex;
${COMMON}
void main() {
  vec2 p = position.xz;
  float eps = 0.6;
  float h = oceanH(p, aGround);
  float hx = oceanH(p + vec2(eps, 0.0), aGround);
  float hz = oceanH(p + vec2(0.0, eps), aGround);
  vNormal = normalize(vec3(h - hx, eps, h - hz));
  vec3 pos = vec3(p.x, uLevel + h, p.y);
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vDepth = uLevel + h - aGround;
  vCrest = h;
  float vf;
  vortexH(p, vf);
  vVortex = vf;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uSunDir;
uniform int uFresnelMode;
uniform float uSaturationBrake;
uniform float uChromaticFriction;
uniform float uImpedance;
uniform float uReflection;
uniform float uNormalDistortion;
uniform float uCaustics;
uniform int uPomSteps;
uniform float uSimple;
uniform sampler2D tReflect;
uniform mat4 uReflectMatrix;
uniform float uReflectOn;
uniform float uRainFx;
uniform float uRainTime;
uniform float uPomDepth;
uniform vec3 uTint;
uniform float uTintMix;
uniform float uNeonCount;
uniform vec3 uNeonPos[8];
uniform vec3 uNeonCol[8];
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vDepth;
varying float vCrest;
varying float vVortex;
${COMMON}
${RAIN_RIPPLES_GLSL}
const mat2 mGold = mat2(-0.7373688, -0.6754903, 0.6754903, -0.7373688);

// Small ripples with sharp crests, used for the parallax, the normal and the caustics.
float micro(vec2 uv) {
  vec2 p = uv * 0.42 - uCurrent * uTime * 0.08;
  float h = 0.0, amp = 0.5, pressure = 1.2;
  for (int i = 0; i < 4; i++) {
    float wx = 1.0 - abs(sin(p.x + sin(p.y + uTime * 2.1)));
    float wy = 1.0 - abs(cos(p.y + cos(p.x - uTime * 1.7)));
    float sharpM = pow(wx * wy, pressure);
    float smoothM = sin(p.x + uTime * 2.0) * cos(p.y - uTime * 1.6) * 0.5 + 0.5;
    h += amp * mix(smoothM, sharpM, uShape.x);
    p = mGold * p * PHI + vec2(uTime * 0.35, -uTime * 0.25);
    amp /= PHI;
    pressure *= 1.1;
  }
  return clamp(h, 0.0, 1.0);
}

// Parallax occlusion of the ripples: shifts the lookup along the view ray.
vec2 pom(vec2 baseXZ, vec3 V) {
  if (uPomSteps <= 0 || uPomDepth <= 0.001) return baseXZ;
  float n = float(uPomSteps);
  vec2 delta = (V.xz / max(abs(V.y), 0.18)) * uPomDepth * 2.2 / n;
  vec2 cur = baseXZ;
  float layer = 0.0, mapH = 1.0 - micro(cur);
  for (int i = 0; i < 20; i++) {
    if (i >= uPomSteps || layer >= mapH) break;
    cur -= delta;
    mapH = 1.0 - micro(cur);
    layer += 1.0 / n;
  }
  return cur;
}

vec3 skyColor(vec3 dir, vec3 sunDir, float day, float sunset) {
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 zenith = mix(vec3(0.02, 0.03, 0.08), vec3(0.08, 0.35, 0.85), day);
  zenith = mix(zenith, vec3(0.18, 0.10, 0.38), sunset * 0.85);
  vec3 horizon = mix(vec3(0.05, 0.10, 0.22), vec3(0.55, 0.82, 0.98), day);
  horizon = mix(horizon, vec3(0.98, 0.36, 0.14), sunset);
  vec3 c = mix(horizon, zenith, pow(h, 1.0 / PHI));
  float sd = max(dot(dir, sunDir), 0.0);
  return c + vec3(1.0, 0.65, 0.3) * pow(sd, 32.0) * 0.9 * smoothstep(-0.15, 0.1, sunDir.y);
}

void main() {
  if (vDepth < -0.15) discard;
  vec3 V = normalize(cameraPosition - vWorldPos);
  // The flat quality skips every ripple lookup: the big waves' own normal is all it uses.
  vec2 pomXZ = uSimple > 0.5 ? vWorldPos.xz : pom(vWorldPos.xz, V);
  float h0 = 0.5, hx = 0.5, hz = 0.5;
  if (uSimple < 0.5) {
    h0 = micro(pomXZ);
    hx = micro(pomXZ + vec2(0.18, 0.0));
    hz = micro(pomXZ + vec2(0.0, 0.18));
  }
  vec3 N = normalize(vNormal + vec3((h0 - hx) * uNormalDistortion * 4.5, 0.0, (h0 - hz) * uNormalDistortion * 4.5));
  // Rain drops landing on the surface bend the normal into rings.
  if (uRainFx > 0.0 && uSimple < 0.5) {
    float r0 = rainRipples(vWorldPos.xz, uRainTime);
    float rx = rainRipples(vWorldPos.xz + vec2(0.12, 0.0), uRainTime);
    float rz = rainRipples(vWorldPos.xz + vec2(0.0, 0.12), uRainTime);
    N = normalize(N + vec3(r0 - rx, 0.0, r0 - rz) * 2.4 * uRainFx);
  }
  vec3 R = reflect(-V, N);

  vec3 sunDir = normalize(uSunDir);
  float day = smoothstep(-0.15, 0.35, sunDir.y);
  float sunset = clamp(1.0 - abs(sunDir.y * 2.6), 0.0, 1.0);
  float night = smoothstep(0.1, -0.25, sunDir.y);

  // Light slows down the deeper it goes: v = 1 - (S / 0.25)^phi, and red dies faster than blue.
  float S = clamp(clamp(vDepth, 0.0, 26.0) * 0.0085 * uSaturationBrake, 0.001, 0.2492);
  float vLight = 1.0 - pow(S / 0.25, PHI);
  vec3 absorb = mix(vec3(1.0), vec3(1.0, PHI, PHI_SQ), uChromaticFriction * 0.55);
  vec3 shallow = mix(vec3(0.03, 0.14, 0.26), vec3(0.14, 0.90, 0.96), day + sunset * 0.35);
  shallow = mix(shallow, uTint * (0.25 + 0.75 * day), uTintMix);
  vec3 body = shallow * pow(vec3(vLight), absorb);

  // Caustics: ripple pattern bent by the surface, strongest in clear shallows by day.
  vec2 floorXZ = pomXZ - N.xz * (1.0 - vLight) * 3.8;
  float pattern = uCaustics > 0.001 ? pow(micro(floorXZ * 1.35 + uTime * 0.38), PHI_SQ) * 2.8 : 0.0;
  body += vec3(0.25, 0.95, 0.85) * pattern * vLight * smoothstep(-0.1, 1.2, vDepth) * uCaustics * (day * 0.85 + 0.15);

  // Reflectivity: R0 from the impedance step air -> water, then the chosen curve.
  float sAir = 0.082;
  float r0 = pow((uImpedance - sAir) / (uImpedance + sAir), 2.0);
  float cosT = clamp(dot(V, N), 0.001, 1.0);
  float curve;
  if (uFresnelMode == 0) {
    curve = pow(1.0 - cosT, PHI_SQ);
  } else {
    float theta = max(acos(cosT), 0.001);
    curve = pow(PHI, -((3.14159265 * 0.5) / max(theta, 0.01)) * ((3.14159265 * 0.5 - theta) / (3.14159265 * 0.5)) * 2.2);
  }
  float fres = clamp(r0 + (1.0 - r0) * curve, 0.0, 1.0);

  vec3 env = skyColor(R, sunDir, day, sunset);
  // The planar mirror (graphics option): the real scene upside down, bent by the ripples.
  if (uReflectOn > 0.5) {
    vec4 rp = uReflectMatrix * vec4(vWorldPos, 1.0);
    vec2 ruv = rp.xy / rp.w + N.xz * uNormalDistortion * 0.06;
    float inside = step(0.0, ruv.x) * step(ruv.x, 1.0) * step(0.0, ruv.y) * step(ruv.y, 1.0);
    vec3 mirror = pow(texture2D(tReflect, clamp(ruv, 0.002, 0.998)).rgb, vec3(1.0 / 2.2));
    env = mix(env, mirror, 0.9 * inside);
  }
  vec3 H = normalize(sunDir + V);
  float ndh = max(dot(N, H), 0.0);
  float spec = pow(ndh, 220.0) * 4.2 + pow(ndh, 30.0) * 0.45;
  vec3 sunCol = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.96, 0.82), clamp(sunDir.y * 2.0, 0.0, 1.0));
  vec3 lit = sunCol * spec * smoothstep(-0.1, 0.08, sunDir.y);
  vec3 Hm = normalize(-sunDir + V);
  float ndm = max(dot(N, Hm), 0.0);
  lit += vec3(0.6, 0.85, 1.0) * (pow(ndm, 160.0) * 2.5 + pow(ndm, 22.0) * 0.35) * night;

  vec3 neon = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uNeonCount) break;
    vec3 l = uNeonPos[i] - vWorldPos;
    float d = length(l);
    vec3 L = l / max(d, 0.001);
    float atten = 1.0 / (1.0 + 0.015 * d * d);
    float sp = pow(max(dot(N, normalize(L + V)), 0.0), 56.0);
    neon += uNeonCol[i] * (max(dot(N, L), 0.0) * 0.45 + 0.25 + sp * 3.2) * atten * 2.3;
    env += uNeonCol[i] * pow(max(dot(R, L), 0.0), 28.0) * 0.55;
  }

  // Foam on the sharpest crests and along the shore.
  float shore = smoothstep(0.35, 0.0, vDepth);
  float foam = smoothstep(0.24, 0.76, clamp(vCrest * 0.9 + shore * 0.9 + vVortex * 0.7, 0.0, 1.0) + (h0 - 0.5) * 0.24);
  vec3 foamCol = mix(vec3(0.35, 0.50, 0.65), vec3(0.97, 0.99, 1.0), day + 0.3) + neon * 0.65;

  vec3 col = mix(body, env, clamp(fres * 0.86 * uReflection, 0.0, 1.0));
  col += lit + neon;
  col = mix(col, foamCol, foam * 0.88);
  float alpha = clamp(0.48 + (1.0 - vLight) * 0.48 + fres * 0.32 + foam * 0.4, 0.0, 0.98);
  gl_FragColor = vec4(col, smoothstep(-0.15, 0.85, vDepth) * alpha);
}
`;

/**
 * The wave ocean of a map with the `ocean` rule: a plane whose shader runs the same wave maths as
 * `oceanHeight` (src/sim/ocean.ts), with the optics of the map's `environment.water`: depth colour
 * that slows and reddens with depth, golden-ratio Fresnel, caustics, parallax ripples, sun and moon
 * glints, foam and flying neon orbs. Set the sky with `setSun`, then call `update` every frame.
 */
export class OceanView {
  readonly object: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly orbs = new THREE.Group();
  private orbCount = 0;
  private readonly orbMeshes: THREE.Mesh[] = [];
  private readonly orbLights: THREE.PointLight[] = [];
  private readonly orbPos: THREE.Vector3[] = [];
  private readonly level: number;
  private readonly center = new THREE.Vector2();
  private quality = 3;
  private look: WaterLook | null = null;

  constructor(arena: GameConfig['arena'], level: number, params: GameConfig['ocean']) {
    this.level = level;
    const size = arena.halfSize * 2;
    const seg = Math.min(MAX_SEGMENTS, Math.max(8, Math.round(size * VERTS_PER_METRE)));
    const geometry = new THREE.PlaneGeometry(size, size, seg, seg);
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position!;
    const ground = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++)
      ground[i] = heightAt(arena.terrain.heights, arena.halfSize, pos.getX(i), pos.getZ(i));
    geometry.setAttribute('aGround', new THREE.BufferAttribute(ground, 1));

    for (let i = 0; i < NEON_COLORS.length; i++) {
      this.orbPos.push(new THREE.Vector3());
      const color = new THREE.Color(NEON_COLORS[i]);
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 16, 12),
        new THREE.MeshBasicMaterial({ color }),
      );
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 12, 10),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.32,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      orb.add(halo);
      const light = new THREE.PointLight(color, 0, NEON_RANGE, 2);
      orb.add(light);
      this.orbLights.push(light);
      orb.visible = false;
      this.orbMeshes.push(orb);
      this.orbs.add(orb);
    }

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uLevel: { value: level },
        uDirs: { value: Array.from({ length: WAVE_COUNT }, () => new THREE.Vector2()) },
        uWaveP: { value: Array.from({ length: WAVE_COUNT }, () => new THREE.Vector4()) },
        uPhase: { value: new Array<number>(WAVE_COUNT).fill(0) },
        uVortex: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) },
        uVortexN: { value: 0 },
        uShape: { value: new THREE.Vector3() },
        uCurrent: { value: new THREE.Vector2() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uFresnelMode: { value: 0 },
        uSaturationBrake: { value: 1 },
        uChromaticFriction: { value: 1 },
        uImpedance: { value: 0.145 },
        uReflection: { value: 0.95 },
        uNormalDistortion: { value: 0.42 },
        uCaustics: { value: 0.85 },
        uPomSteps: { value: 12 },
        uSimple: { value: 0 },
        tReflect: { value: null },
        uReflectMatrix: { value: new THREE.Matrix4() },
        uReflectOn: { value: 0 },
        ...rainFxUniforms,
        uPomDepth: { value: 0.45 },
        uTint: { value: new THREE.Color() },
        uTintMix: { value: 0 },
        uNeonCount: { value: 0 },
        uNeonPos: { value: this.orbPos },
        uNeonCol: { value: NEON_COLORS.map((c) => new THREE.Color(c)) },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    this.object = new THREE.Mesh(geometry, this.material);
    this.object.frustumCulled = false;
    this.object.add(this.orbs);
    this.setParams(params);
  }

  /** The wave numbers (the map's `ocean` over game.json's). */
  setParams(o: GameConfig['ocean']): void {
    const u = this.material.uniforms;
    const table = waveTable(o);
    for (let i = 0; i < WAVE_COUNT; i++) {
      (u.uDirs!.value as THREE.Vector2[])[i]!.set(table.dx[i]!, table.dz[i]!);
      (u.uWaveP!.value as THREE.Vector4[])[i]!.set(
        table.amp[i]!,
        table.freq[i]!,
        table.speed[i]!,
        table.pressure[i]!,
      );
      (u.uPhase!.value as number[])[i] = table.phase[i]!;
    }
    u.uShape!.value.set(o.hooke, o.silk, o.shoreFade);
    const whirlpools = u.uVortex!.value as THREE.Vector4[];
    o.vortices.forEach((v, i) => whirlpools[i]!.set(v.x, v.z, v.strength, v.radius));
    u.uVortexN!.value = o.vortices.length;
    u.uCurrent!.value.set(
      Math.cos(o.currentAngle) * o.currentSpeed,
      Math.sin(o.currentAngle) * o.currentSpeed,
    );
  }

  /**
   * How much of the look is drawn (the graphics option): 0 flat (no ripples, caustics or orbs),
   * 1 light (ripples only), 2 normal (cheaper parallax, caustics, three orbs), 3 as the map says.
   */
  setQuality(q: number): void {
    this.quality = q;
    if (this.look) this.setLook(this.look);
  }

  /** The planar mirror of the world (null shows only the sky colour in the reflection). */
  setReflection(texture: THREE.Texture | null, matrix: THREE.Matrix4): void {
    const u = this.material.uniforms;
    u.tReflect!.value = texture;
    u.uReflectOn!.value = texture && this.quality > 0 ? 1 : 0;
    (u.uReflectMatrix!.value as THREE.Matrix4).copy(matrix);
  }

  /** The look of the map's water (`environment.water`), held back by the graphics quality. */
  setLook(look: WaterLook): void {
    this.look = look;
    const q = this.quality;
    const w: WaterLook = {
      ...look,
      pomSteps: q >= 3 ? look.pomSteps : q === 2 ? Math.min(look.pomSteps, 6) : 0,
      caustics: q >= 2 ? look.caustics : 0,
      neonOrbs: q >= 3 ? look.neonOrbs : q === 2 ? Math.min(look.neonOrbs, 3) : 0,
      normalDistortion: q >= 1 ? look.normalDistortion : 0,
    };
    const u = this.material.uniforms;
    u.uSimple!.value = q === 0 ? 1 : 0;
    u.uFresnelMode!.value = w.fresnel === 'area' ? 0 : 1;
    u.uSaturationBrake!.value = w.saturationBrake;
    u.uChromaticFriction!.value = w.chromaticFriction;
    u.uImpedance!.value = w.impedance;
    u.uReflection!.value = w.reflection;
    u.uNormalDistortion!.value = w.normalDistortion;
    u.uCaustics!.value = w.caustics;
    u.uPomSteps!.value = w.pomSteps;
    u.uPomDepth!.value = w.pomDepth;
    u.uNeonCount!.value = w.neonOrbs;
    u.uTintMix!.value = w.tint ? 0.6 : 0;
    if (w.tint) u.uTint!.value.set(w.tint);
    this.orbCount = w.neonOrbs;
    this.orbMeshes.forEach((m, i) => (m.visible = i < w.neonOrbs));
    this.orbLights.forEach((l, i) => (l.visible = i < w.neonOrbs));
  }

  /** Per frame: the sim clock (s) drives the waves, `sun` is the direction to the sun. */
  update(time: number, sun: THREE.Vector3): void {
    const u = this.material.uniforms;
    u.uTime!.value = time;
    u.uSunDir!.value.copy(sun);
    // Neon orbs circle the map centre on a golden-angle spiral and ride above the waves.
    for (let i = 0; i < this.orbCount; i++) {
      const r = 14 + Math.sqrt(i + 1) * 15;
      const a = (i + 1) * 2.3999632 + time * (1.5 / Math.sqrt(r)) * 3.5;
      this.center.set(Math.cos(a) * r, Math.sin(a) * r);
      const p = this.orbPos[i]!;
      p.set(this.center.x, this.level + 3.5 + Math.sin(time * 2.2 + i * PHI) * 2, this.center.y);
      this.orbMeshes[i]!.position.copy(p);
    }
    // The orbs' light is strongest at night and a fifth of that by day.
    const t = Math.min(Math.max((sun.y - 0.1) / -0.35, 0), 1);
    const power = NEON_LIGHT * (0.2 + 0.8 * t * t * (3 - 2 * t));
    for (let i = 0; i < this.orbCount; i++) this.orbLights[i]!.intensity = power;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
    for (const m of this.orbMeshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      for (const c of m.children as THREE.Mesh[]) {
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
    }
  }
}
