import * as THREE from 'three';

/** Shared by the rain streaks, the ground and the ocean: how hard it rains (0 = off) and the clock. */
export const rainFxUniforms = {
  uRainFx: { value: 0 },
  uRainTime: { value: 0 },
};

/**
 * Rings from drops that land at random: three layers (big slow rings, medium, small quick ones),
 * each cell of each layer holds a drop only some of the time (more at heavier rain), at a random
 * spot, with its own period, start, largest radius and ring spacing. The four nearest cells are
 * summed so a ring may cross into the next cell. `uRainFx` (0 to 1) must be declared before this.
 */
export const RAIN_RIPPLES_GLSL = /* glsl */ `
float rainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rippleLayer(vec2 p, float t, float scale, float seed, float quick) {
  vec2 g = p * scale;
  vec2 base = floor(g - 0.5);
  float sum = 0.0;
  float chance = 0.16 + 0.4 * uRainFx;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 c = base + vec2(float(i), float(j));
      float h1 = rainHash(c + seed);
      if (h1 > chance) continue;
      float h2 = rainHash(c * 1.7 + seed + 3.1);
      float h3 = rainHash(c * 2.3 + seed + 7.7);
      float h4 = rainHash(c * 0.7 + seed + 11.3);
      float period = (0.8 + h2 * 1.8) * quick;
      float k = fract(t / period + h3);
      vec2 centre = c + 0.12 + 0.76 * vec2(h2, h4);
      float d = length(g - centre) / scale;
      float maxR = (0.1 + h4 * 0.5) * (0.5 + 0.5 * quick);
      float r = k * maxR;
      float gap = d - r;
      float spacing = 55.0 - 35.0 * h3;
      sum += sin(gap * spacing) * exp(-pow(gap / (maxR * 0.3), 2.0)) * (1.0 - k) * (1.0 - k);
    }
  }
  return sum;
}
float rainRipples(vec2 p, float t) {
  return rippleLayer(p, t, 0.5, 0.0, 1.0)
    + 0.85 * rippleLayer(p, t, 1.1, 17.0, 0.8)
    + 0.7 * rippleLayer(p, t, 2.4, 41.0, 0.55);
}
`;

/** Wet ground: darkens it and draws rings where drops land. Safe to call again on the same material. */
export function patchGroundRain(material: THREE.MeshStandardMaterial): void {
  if (material.userData.rainFx) return;
  material.userData.rainFx = true;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uRainFx = rainFxUniforms.uRainFx;
    shader.uniforms.uRainTime = rainFxUniforms.uRainTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRainPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvRainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vRainPos;\nuniform float uRainFx;\nuniform float uRainTime;\n${RAIN_RIPPLES_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (uRainFx > 0.0) {
          float ring = max(rainRipples(vRainPos.xz, uRainTime), 0.0);
          diffuseColor.rgb = diffuseColor.rgb * (1.0 - 0.3 * uRainFx) + vec3(0.6, 0.7, 0.82) * ring * 0.3 * uRainFx;
        }`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey()}|rainfx`;
  material.needsUpdate = true;
}

/** A cylinder of falling streaks around the camera: one cheap draw instead of thousands of lines. */
export function makeRainStreaks(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: rainFxUniforms,
    vertexShader: `varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform float uRainFx; uniform float uRainTime; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float col = floor(vUv.x * 160.0);
        float hc = hash(vec2(col, 3.7));
        float speed = 5.5 + hc * 6.0;
        vec2 uv = vec2(vUv.x * 160.0, vUv.y * (4.0 + hc * 4.0) + uRainTime * speed);
        vec2 id = floor(uv);
        vec2 f = fract(uv);
        float r = hash(id + col);
        float len = 0.35 + 0.6 * hash(id + 9.1);
        float width = 0.05 + 0.1 * hash(id + 4.4);
        float drop = smoothstep(width, 0.0, abs(f.x - 0.5)) * smoothstep(0.0, len, f.y) * step(1.0 - 0.18 * uRainFx, r);
        float fade = sin(vUv.y * 3.14159);
        gl_FragColor = vec4(0.65, 0.82, 1.0, drop * fade * (0.22 + 0.3 * hc));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 40, 24, 1, true), material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 5;
  return mesh;
}
