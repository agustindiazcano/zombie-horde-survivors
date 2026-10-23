import type * as THREE from 'three';

/**
 * Detail for the plain vertex-coloured ground, drawn in its shader (no textures): the colour is
 * broken up by value noise at three sizes (big patches, mid tufts, fine grain) and steep slopes
 * turn to grey rock. Painted colours stay: the noise only lightens and darkens them.
 * Safe to call again on the same material; chains with any other `onBeforeCompile` already on it.
 */
export function patchGroundLook(material: THREE.MeshStandardMaterial): void {
  if (material.userData.groundLook) return;
  material.userData.groundLook = true;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
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
float lookHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lookNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lookHash(i), lookHash(i + vec2(1.0, 0.0)), u.x), mix(lookHash(i + vec2(0.0, 1.0)), lookHash(i + vec2(1.0, 1.0)), u.x), u.y);
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
        }`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey()}|groundlook`;
  material.needsUpdate = true;
}
