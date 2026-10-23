import * as THREE from 'three';

/**
 * What the ground shader shares with the rest of the scene. `EnvironmentView` fills the cloud and
 * sun fields every frame; `buildArena` sets the water level of the map being drawn.
 */
export const groundFx = {
  /** Calm water level of the map, or far below the world when it has no water. */
  uWaterLevel: { value: -1e4 },
  /** How dark the clouds' shadows are on the ground (0 off). */
  uCloudShadow: { value: 0 },
  uSunDirG: { value: new THREE.Vector3(0, 1, 0) },
  uCloudTime: { value: 0 },
  uCloudWind: { value: 1 },
  uCloudCover: { value: 0 },
};

/**
 * Detail for the plain vertex-coloured ground, drawn in its shader (no textures): the colour is
 * broken up by value noise at four sizes, steep slopes turn to grey rock, the shore is darker and
 * wet, and the clouds drop moving shadows (the same noise as the volumetric sky, cast along the sun).
 * Painted colours stay: everything here only lightens and darkens them.
 * Safe to call again on the same material; chains with any other `onBeforeCompile` already on it.
 */
export function patchGroundLook(material: THREE.MeshStandardMaterial): void {
  if (material.userData.groundLook) return;
  material.userData.groundLook = true;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, groundFx);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vLookPos;\nvarying float vLookUp;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLookPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvLookUp = normalize(objectNormal).y;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLookPos;
varying float vLookUp;
uniform float uWaterLevel;
uniform float uCloudShadow;
uniform vec3 uSunDirG;
uniform float uCloudTime;
uniform float uCloudWind;
uniform float uCloudCover;
float lookHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lookNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lookHash(i), lookHash(i + vec2(1.0, 0.0)), u.x), mix(lookHash(i + vec2(0.0, 1.0)), lookHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// The sky's cloud noise (golden-angle octaves), three octaves, for the shadows.
float shadowFbm(vec2 p) {
  float a = 0.5, s = 0.0, total = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * lookNoise(p);
    total += a;
    p = mat2(-0.7373688, -0.6754903, 0.6754903, -0.7373688) * p * 1.618 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return s / total;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 q = vLookPos.xz;
          float big = lookNoise(q * 0.09);
          float mid = lookNoise(q * 0.45 + 7.0);
          float fine = lookNoise(q * 2.6 + 3.0);
          float grain = lookNoise(q * 11.0 + 5.0);
          float detail = 0.45 * big + 0.3 * mid + 0.17 * fine + 0.08 * grain;
          diffuseColor.rgb *= 0.62 + 0.78 * detail;
          // A little warmth in the lighter patches, a little cool in the darker ones.
          diffuseColor.rgb *= vec3(0.96 + 0.1 * mid, 1.0, 0.98 - 0.08 * mid);
          float rock = smoothstep(0.9, 0.68, vLookUp);
          vec3 stone = vec3(0.43, 0.41, 0.39) * (0.75 + 0.5 * fine);
          diffuseColor.rgb = mix(diffuseColor.rgb, stone, rock);

          // The shore: wet, darker sand within a metre above the water, bluish ground below it.
          float above = vLookPos.y - uWaterLevel;
          float wet = smoothstep(1.0, 0.0, above) * step(-5000.0, uWaterLevel);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.55, 0.58, 0.62), wet * (0.7 + 0.3 * fine));
          float under = smoothstep(0.0, -1.5, above) * step(-5000.0, uWaterLevel);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.55, 0.8, 0.85), under);

          // Cloud shadows, cast from the ground along the sun to the cloud layer.
          if (uCloudShadow > 0.0) {
            vec3 at = vLookPos + uSunDirG * ((165.0 - vLookPos.y) / max(uSunDirG.y, 0.15));
            vec2 wind = vec2(uCloudTime * 0.77, uCloudTime * 0.32) * uCloudWind;
            vec2 uv = at.xz * 0.0095 + wind;
            float n = mix(shadowFbm(uv), shadowFbm(uv * 2.5 - wind * 0.6), 0.34);
            float thresh = 1.0 - uCloudCover;
            diffuseColor.rgb *= 1.0 - uCloudShadow * smoothstep(thresh, thresh + 0.32, n);
          }
        }`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey()}|groundlook2`;
  material.needsUpdate = true;
}
