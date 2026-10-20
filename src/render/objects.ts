import * as THREE from 'three';
import type { GameConfig, GameState } from '../sim';

const FLAME_COUNT = 5;
const GLOW_OPACITY = 0.28;

/** Geometry per shape, shared by every object of that shape. */
const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
};

/** Draws the objects of the state (barrels, crates, boulders) as plain solids, held or flying. */
export class ObjectViews {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<number, THREE.Mesh>();

  constructor(
    private readonly config: GameConfig,
    private readonly groundAt: (x: number, z: number) => number,
  ) {}

  update(state: GameState): void {
    const live = new Set<number>();
    for (const o of state.objects) {
      live.add(o.id);
      const def = this.config.objects.types[o.type];
      if (!def) continue;
      let mesh = this.meshes.get(o.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          geometries[def.shape],
          new THREE.MeshStandardMaterial({ color: def.color }),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.scale.set(def.radius * 2, def.height, def.radius * 2);
        this.meshes.set(o.id, mesh);
        this.group.add(mesh);
      }
      const base = o.heldBy !== null || o.flight !== null ? o.y : this.groundAt(o.pos.x, o.pos.z);
      mesh.position.set(o.pos.x, base + def.height / 2, o.pos.z);
      if (o.flight) mesh.rotation.x += 0.2;
      else mesh.rotation.set(0, 0, 0);
    }
    for (const [id, mesh] of this.meshes) {
      if (live.has(id)) continue;
      this.group.remove(mesh);
      (mesh.material as THREE.Material).dispose();
      this.meshes.delete(id);
    }
  }

  clear(): void {
    for (const mesh of this.meshes.values()) {
      this.group.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    }
    this.meshes.clear();
  }
}

const glowGeometry = new THREE.CircleGeometry(1, 28);
const flameGeometry = new THREE.ConeGeometry(0.35, 1.3, 7);
const flameMaterials = [
  new THREE.MeshBasicMaterial({ color: 0xff7a1a }),
  new THREE.MeshBasicMaterial({ color: 0xffc93d }),
];
const glowMaterial = new THREE.MeshBasicMaterial({
  color: 0xff5a14,
  transparent: true,
  opacity: GLOW_OPACITY,
  depthWrite: false,
});

/** Draws the fires of the state: a glow on the ground and flickering flames. */
export class FireViews {
  readonly group = new THREE.Group();
  private readonly fires = new Map<number, THREE.Group>();

  constructor(
    private readonly config: GameConfig,
    private readonly groundAt: (x: number, z: number) => number,
  ) {}

  update(state: GameState, clock: number): void {
    const radius = this.config.hazards.fire.radius;
    const live = new Set<number>();
    for (const f of state.fires) {
      live.add(f.id);
      let fire = this.fires.get(f.id);
      if (!fire) {
        fire = new THREE.Group();
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.06;
        glow.scale.set(radius, radius, 1);
        fire.add(glow);
        for (let i = 0; i < FLAME_COUNT; i++) {
          const angle = (i / FLAME_COUNT) * Math.PI * 2;
          const flame = new THREE.Mesh(flameGeometry, flameMaterials[i % 2]!);
          const reach = i === 0 ? 0 : radius * 0.35;
          flame.position.set(Math.cos(angle) * reach, 0.65, Math.sin(angle) * reach);
          flame.userData.phase = i * 1.7;
          fire.add(flame);
        }
        this.fires.set(f.id, fire);
        this.group.add(fire);
      }
      fire.position.set(f.x, this.groundAt(f.x, f.z), f.z);
      // A fire dying out shrinks over its last two seconds.
      const left = Number.isFinite(f.life) ? Math.min(1, (f.life - f.age) / 2) : 1;
      fire.scale.setScalar(0.4 + 0.6 * left);
      for (const flame of fire.children) {
        if (flame.userData.phase === undefined) continue;
        flame.scale.y = 0.8 + 0.35 * Math.sin(clock * 9 + (flame.userData.phase as number));
      }
    }
    for (const [id, fire] of this.fires) {
      if (live.has(id)) continue;
      this.group.remove(fire);
      this.fires.delete(id);
    }
  }

  clear(): void {
    for (const fire of this.fires.values()) this.group.remove(fire);
    this.fires.clear();
  }
}
