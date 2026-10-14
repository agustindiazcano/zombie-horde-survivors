import * as THREE from 'three';
import type { GameConfig, GameState } from '../sim';

const BLINK_SECONDS = 6;

const coinGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 18);
const orbGeometry = new THREE.SphereGeometry(0.17, 14, 10);
const coinMaterial = new THREE.MeshStandardMaterial({
  color: 0xffc83d,
  metalness: 0.8,
  roughness: 0.3,
  emissive: 0x8a5a00,
  emissiveIntensity: 0.6,
});
const orbMaterial = new THREE.MeshStandardMaterial({
  color: 0x3de0c8,
  emissive: 0x20e0c0,
  emissiveIntensity: 1.4,
});

/** Spinning gold coins and glowing XP orbs for the pickups lying on the ground. */
export class PickupMeshes {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<number, THREE.Object3D>();
  private clock = 0;

  update(state: GameState, config: GameConfig, dt: number): void {
    this.clock += dt;
    const live = new Set<number>();

    for (const p of state.pickups) {
      live.add(p.id);
      let obj = this.meshes.get(p.id);
      if (!obj) {
        obj = new THREE.Group();
        if (p.kind === 'gold') {
          const coin = new THREE.Mesh(coinGeometry, coinMaterial);
          coin.rotation.x = Math.PI / 2; // stand the coin on its edge
          obj.add(coin);
        } else {
          obj.add(new THREE.Mesh(orbGeometry, orbMaterial));
        }
        this.meshes.set(p.id, obj);
        this.group.add(obj);
      }
      const bob = Math.sin(this.clock * 3 + p.id) * 0.06;
      obj.position.set(p.pos.x, 0.5 + bob, p.pos.z);
      obj.rotation.y = this.clock * 3 + p.id;

      const remaining = config.loot.lifetime - p.age;
      obj.visible = remaining > BLINK_SECONDS || Math.floor(this.clock * 6) % 2 === 0;
    }

    for (const [id, obj] of this.meshes) {
      if (live.has(id)) continue;
      this.group.remove(obj);
      this.meshes.delete(id);
    }
  }
}
