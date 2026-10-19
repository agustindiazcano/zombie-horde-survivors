import * as THREE from 'three';

/** Palette of the held weapons. */
const METAL = new THREE.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.5, roughness: 0.5 });
const GRIP = new THREE.MeshStandardMaterial({ color: 0x3a2f26, roughness: 0.8 });
const BLADE = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.3 });
const HOT = new THREE.MeshStandardMaterial({ color: 0x3b6fb0, roughness: 0.4 });

/** A box of the given size (metres) centred at (x, y, z); barrels run along +Z. */
function part(
  group: THREE.Group,
  material: THREE.Material,
  size: [number, number, number],
  at: [number, number, number],
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...at);
  mesh.castShadow = true;
  group.add(mesh);
}

/** How a held gun is posed: with one hand, or with two (the second on the foregrip). */
export interface WeaponPose {
  /** Where the off hand goes, in the weapon's own space; none for a one-handed weapon. */
  foregrip?: [number, number, number];
  /**
   * The weapon's place in the first-person view (metres in front of the camera, +X right, +Y up,
   * -Z ahead) carried at the hip and raised to the sights, and the hand positions on the weapon.
   */
  hip: [number, number, number];
  ads: [number, number, number];
}

/** Pose data of the weapons that are shown in hand; knives have a hip place only. */
export const WEAPON_POSES: Record<string, WeaponPose> = {
  pistol: { hip: [0.17, -0.17, -0.4], ads: [0, -0.075, -0.3] },
  rifle: { foregrip: [0, -0.03, 0.38], hip: [0.2, -0.2, -0.42], ads: [0, -0.095, -0.3] },
  heavy_mg: { foregrip: [0, -0.04, 0.42], hip: [0.2, -0.23, -0.5], ads: [0, -0.125, -0.38] },
  knife: { hip: [0.22, -0.2, -0.36], ads: [0.22, -0.2, -0.36] },
};

/**
 * A simple procedural model of a weapon, in metres, with the grip at the origin, the muzzle
 * towards +Z and the top towards +Y. Items without a model here are not drawn.
 */
export function createWeaponModel(item: string): THREE.Group | null {
  const g = new THREE.Group();
  switch (item) {
    case 'pistol':
      part(g, METAL, [0.04, 0.05, 0.2], [0, 0.04, 0.08]);
      part(g, GRIP, [0.04, 0.11, 0.05], [0, -0.04, -0.01]);
      break;
    case 'rifle':
      part(g, METAL, [0.05, 0.08, 0.5], [0, 0.04, 0.22]);
      part(g, METAL, [0.025, 0.025, 0.3], [0, 0.05, 0.62]);
      part(g, GRIP, [0.05, 0.1, 0.05], [0, -0.04, 0]);
      part(g, GRIP, [0.045, 0.1, 0.22], [0, 0.02, -0.17]);
      part(g, METAL, [0.04, 0.12, 0.06], [0, -0.06, 0.2]);
      break;
    case 'heavy_mg':
      part(g, METAL, [0.08, 0.12, 0.6], [0, 0.05, 0.25]);
      part(g, METAL, [0.035, 0.035, 0.4], [0, 0.07, 0.78]);
      part(g, GRIP, [0.05, 0.1, 0.05], [0, -0.05, 0]);
      part(g, GRIP, [0.07, 0.1, 0.2], [0, 0.02, -0.2]);
      part(g, HOT, [0.12, 0.16, 0.16], [0, -0.1, 0.25]);
      break;
    case 'knife':
      part(g, GRIP, [0.03, 0.03, 0.1], [0, 0, 0]);
      part(g, BLADE, [0.01, 0.035, 0.2], [0, 0, 0.15]);
      break;
    default:
      return null;
  }
  return g;
}
