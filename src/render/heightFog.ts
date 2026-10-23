import * as THREE from 'three';

let installed = false;

/**
 * Height fog for every material that takes the scene fog: thick near the ground, thinner higher up
 * (the fog of the atmosphere demo: `density * (0.35 + 0.65 * exp(-height * falloff))`, then
 * `1 - exp(-d * depth)`). It replaces three.js's linear fog chunks, so the scene fog is a `THREE.Fog`
 * whose `near` carries the density and whose `far` carries the falloff (nothing else uses them).
 */
export function installHeightFog(): void {
  if (installed) return;
  installed = true;
  const chunks = THREE.ShaderChunk as Record<string, string>;
  chunks.fog_pars_vertex = `
#ifdef USE_FOG
	varying float vFogDepth;
	varying float vFogY;
#endif`;
  chunks.fog_vertex = `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	// World height of the point: the camera's height plus the view-space offset turned back to the world.
	vFogY = cameraPosition.y + viewMatrix[0][1] * mvPosition.x + viewMatrix[1][1] * mvPosition.y + viewMatrix[2][1] * mvPosition.z;
#endif`;
  chunks.fog_pars_fragment = `
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying float vFogY;
	uniform float fogNear;
	uniform float fogFar;
#endif`;
  chunks.fog_fragment = `
#ifdef USE_FOG
	float fogHeight = max(0.0, 0.5 * (cameraPosition.y + vFogY));
	float fogFactor = clamp(1.0 - exp(-vFogDepth * fogNear * (0.35 + 0.65 * exp(-fogHeight * fogFar))), 0.0, 1.0);
	gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;
}
