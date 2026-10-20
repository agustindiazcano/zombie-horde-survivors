import * as THREE from 'three';
import type { GameConfig, GameState } from '../sim';

/** Colour of the little marker by item type (weapons dark steel, medical red, ammo brass...). */
const COLORS: Record<string, number> = {
  weapon: 0x3a3f46,
  ammo: 0xc9a227,
  medical: 0xd8352f,
  defibrillator: 0xe8e8e8,
  armor: 0x3d6ea8,
  plate: 0x3d6ea8,
  grenade: 0x4f7a3a,
  accessory: 0x8a5ac8,
};

const geometry = new THREE.BoxGeometry(0.45, 0.14, 0.28);
const materials = new Map<number, THREE.MeshStandardMaterial>();
const materialFor = (color: number): THREE.MeshStandardMaterial => {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    materials.set(color, m);
  }
  return m;
};

/** Single items lying on the ground, drawn as small coloured slabs (a stack is thicker). */
export class GroundItemViews {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<number, THREE.Mesh>();

  constructor(
    private readonly config: GameConfig,
    private readonly groundAt: (x: number, z: number) => number,
  ) {}

  update(state: GameState): void {
    const live = new Set<number>();
    for (const g of state.groundItems) {
      live.add(g.id);
      let mesh = this.meshes.get(g.id);
      if (!mesh) {
        const type = this.config.items[g.item]?.type ?? 'weapon';
        mesh = new THREE.Mesh(geometry, materialFor(COLORS[type] ?? 0x888888));
        mesh.castShadow = true;
        mesh.rotation.y = g.id * 2.3;
        this.meshes.set(g.id, mesh);
        this.group.add(mesh);
      }
      const thick = 1 + Math.min(g.count - 1, 6) * 0.25;
      mesh.scale.y = thick;
      mesh.position.set(g.pos.x, this.groundAt(g.pos.x, g.pos.z) + 0.07 * thick, g.pos.z);
    }
    for (const [id, mesh] of this.meshes) {
      if (live.has(id)) continue;
      this.group.remove(mesh);
      this.meshes.delete(id);
    }
  }
}
