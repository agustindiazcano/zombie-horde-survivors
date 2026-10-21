import * as THREE from 'three';
import type { PomKind, RealName } from '../sim';

/**
 * Real photographed surfaces for the texture lab: CC0 sets from ambientCG, shrunk to 512 px
 * (colour, height and roughness JPGs in public/textures/real). They go through the same
 * parallax material as the procedural ones. The files load when a map first uses them.
 */

export type RealKind = `real_${RealName}`;

type RealDef = {
  /** Depth (m) of the carving at full height difference, and metres per texture repeat. */
  depth: number;
  tile: number;
  roughness: number;
  metalness: number;
};

const REAL: Record<RealName, RealDef> = {
  bricks: { depth: 0.06, tile: 1.05, roughness: 1, metalness: 0 },
  sandstone: { depth: 0.08, tile: 1.5, roughness: 1, metalness: 0 },
  planks: { depth: 0.05, tile: 1.2, roughness: 1, metalness: 0 },
  concrete: { depth: 0.03, tile: 1.1, roughness: 1, metalness: 0 },
  plaster: { depth: 0.04, tile: 2, roughness: 1, metalness: 0 },
  darkrock: { depth: 0.15, tile: 2, roughness: 1, metalness: 0 },
  darkmetal: { depth: 0.03, tile: 1, roughness: 1, metalness: 0.7 },
  paving: { depth: 0.07, tile: 1.15, roughness: 1, metalness: 0 },
  roadreal: { depth: 0.04, tile: 7.5, roughness: 1, metalness: 0 },
  gravel: { depth: 0.08, tile: 1.5, roughness: 1, metalness: 0 },
  mossground: { depth: 0.1, tile: 2.1, roughness: 1, metalness: 0 },
  clay: { depth: 0.1, tile: 2.8, roughness: 1, metalness: 0 },
  marble: { depth: 0.015, tile: 2, roughness: 1, metalness: 0 },
  tiles: { depth: 0.02, tile: 1, roughness: 1, metalness: 0 },
};

export const isReal = (kind: PomKind): kind is RealKind => kind.startsWith('real_');

const nameOf = (kind: RealKind): RealName => kind.slice(5) as RealName;

export const realDef = (kind: RealKind): RealDef => REAL[nameOf(kind)];

const loader = new THREE.TextureLoader();

function texture(name: RealName, part: 'color' | 'height' | 'rough'): THREE.Texture {
  const tex = loader.load(`${import.meta.env.BASE_URL}textures/real/${name}_${part}.jpg`);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = part === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

/** The three maps of a real surface (they fill in when the files arrive). */
export function loadReal(kind: RealKind): {
  albedo: THREE.Texture;
  height: THREE.Texture;
  rough: THREE.Texture;
} {
  const name = nameOf(kind);
  return {
    albedo: texture(name, 'color'),
    height: texture(name, 'height'),
    rough: texture(name, 'rough'),
  };
}
