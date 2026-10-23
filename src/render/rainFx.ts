import * as THREE from 'three';

/** Shared by the rain streaks, the ground and the ocean: how hard it rains (0 = off) and the clock. */
export const rainFxUniforms = {
  uRainFx: { value: 0 },
  uRainTime: { value: 0 },
};

/** Rings that spread from random points of a grid and fade (the sandbox's `rainRipples`). */
export const RAIN_RIPPLES_GLSL = /* glsl */ `
float rainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rainRipples(vec2 p, float t) {
  vec2 cell = floor(p * 1.1);
  vec2 local = fract(p * 1.1) - 0.5;
  float rnd = rainHash(cell);
  float k = fract(t * 1.6 + rnd * 6.28);
  float dist = length(local - vec2(rnd - 0.5, fract(rnd * 17.3) - 0.5) * 0.4);
  return sin((dist - k * 0.45) * 45.0) * smoothstep(0.45, 0.0, dist) * (1.0 - k);
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
          diffuseColor.rgb = diffuseColor.rgb * (1.0 - 0.3 * uRainFx) + vec3(0.55, 0.66, 0.78) * ring * 0.24 * uRainFx;
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
        vec2 uv = vec2(vUv.x * 160.0, vUv.y * 6.0 + uRainTime * 7.5);
        vec2 id = floor(uv);
        vec2 f = fract(uv);
        float r = hash(id);
        float drop = smoothstep(0.12, 0.0, abs(f.x - 0.5)) * smoothstep(0.0, 0.8, f.y) * step(1.0 - 0.22 * uRainFx, r);
        float fade = sin(vUv.y * 3.14159);
        gl_FragColor = vec4(0.65, 0.82, 1.0, drop * fade * 0.4);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 40, 24, 1, true), material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 5;
  return mesh;
}
