import * as THREE from 'three';

/** Shared by every standard material while the snow layer is installed. */
export const snowFx = {
  /** How much snow has settled (0 none, 1 buried); set every frame by `EnvironmentView`. */
  uSnowCover: { value: 0 },
};

let installed = false;

/**
 * Snow as a shader layer on every `MeshStandardMaterial` (and so the physical ones too): no
 * particles pile up and no geometry is added. Each pixel looks at which way it faces: what points at
 * the sky turns white and rough, a little noise in world space breaks the edge, and how steep a
 * face may be and still hold snow grows with `uSnowCover`. A faint cold glow at the grazing edges
 * stands in for light passing through the flakes (a fake subsurface scattering, no real SSS).
 * Move an object and its snow stays on top. It runs only while `uSnowCover` is above 0.
 *
 * It is the default `onBeforeCompile` of the material class, so materials that set their own and
 * call the previous one (the ground patches do) keep it; ones that do not (the texture lab) lose it.
 */
export function installSnowLayer(): void {
  if (installed) return;
  installed = true;
  THREE.MeshStandardMaterial.prototype.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, snowFx);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uSnowCover;
float snowHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float snowNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(snowHash(i), snowHash(i + vec3(1, 0, 0)), f.x), mix(snowHash(i + vec3(0, 1, 0)), snowHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(snowHash(i + vec3(0, 0, 1)), snowHash(i + vec3(1, 0, 1)), f.x), mix(snowHash(i + vec3(0, 1, 1)), snowHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uSnowCover > 0.0) {
          vec3 snowUp = inverseTransformDirection(normal, viewMatrix);
          vec3 snowPos = cameraPosition - transpose(mat3(viewMatrix)) * vViewPosition;
          float breakup = snowNoise(snowPos * 2.5) * 0.65 + snowNoise(snowPos * 9.0) * 0.35;
          // The more snow, the steeper a face may be and still hold some.
          float limit = 0.9 - 0.8 * uSnowCover;
          float snowMask = smoothstep(limit, limit + 0.2, snowUp.y + (breakup - 0.5) * 0.4);
          // At low cover only patches hold snow, and they join up as it grows.
          float amount = clamp(uSnowCover * 1.3 + (breakup - 0.5) * 0.9, 0.0, 1.0);
          snowMask *= smoothstep(0.15, 0.55, amount);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), snowMask);
          roughnessFactor = mix(roughnessFactor, 0.92, snowMask);
          metalnessFactor = mix(metalnessFactor, 0.0, snowMask);
          // Fake subsurface scattering: a cold glow where the snow is seen edge on.
          float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += vec3(0.45, 0.62, 0.9) * rim * snowMask * 0.1;
        }`,
      );
  };
}
