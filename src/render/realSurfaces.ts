import * as THREE from 'three';
import type { PomKind, RealName } from '../sim';

/**
 * Real photographed surfaces for the texture lab: CC0 sets from ambientCG (colour, height and
 * roughness JPGs). Normal quality reads the 512 px files in public/textures/real, ultra the 1K
 * ones in public/textures/real1k, and the two lower levels shrink the 512 px files to 64 or
 * 128 px. They go through the same parallax material as the procedural ones. The files load
 * when a map first uses them.
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

/** Side (px) the small levels shrink to; the normal and ultra levels use the files as they are. */
const SHRUNK = [64, 128];

function texture(name: RealName, part: 'color' | 'height' | 'rough', level: number): THREE.Texture {
  const folder = level >= 3 ? 'real1k' : 'real';
  const url = `${import.meta.env.BASE_URL}textures/${folder}/${name}_${part}.jpg`;
  const small = SHRUNK[level];
  let tex: THREE.Texture;
  if (small === undefined) {
    tex = loader.load(url);
  } else {
    // Draw the file onto a tiny canvas once it arrives, so the surface really is a few pixels.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = small;
    const canvasTex = new THREE.CanvasTexture(canvas);
    new THREE.ImageLoader().load(url, (image) => {
      canvas.getContext('2d')!.drawImage(image, 0, 0, small, small);
      canvasTex.needsUpdate = true;
    });
    tex = canvasTex;
  }
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = part === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

/** The three maps of a real surface at a texture quality (they fill in when the files arrive). */
export function loadReal(
  kind: RealKind,
  level: number,
): {
  albedo: THREE.Texture;
  height: THREE.Texture;
  rough: THREE.Texture;
} {
  const name = nameOf(kind);
  return {
    albedo: texture(name, 'color', level),
    height: texture(name, 'height', level),
    rough: texture(name, 'rough', level),
  };
}
