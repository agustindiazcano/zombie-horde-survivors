import * as THREE from 'three';
import type { Vec2 } from '../sim';

const POOL_SIZE = 48;
const TRACER_LIFE = 0.08;
const FLASH_LIFE = 0.05;
const MUZZLE_HEIGHT = 1.0;
/** Gun tip in the soldier's local space (matches the placeholder gun). */
const MUZZLE_LOCAL = { x: 0.3, z: 0.95 };

interface Tracer {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
}

/** Short-lived shot visuals: a fading tracer per bullet and a muzzle flash. */
export class ShotEffects {
  readonly group = new THREE.Group();
  private readonly tracers: Tracer[] = [];
  private next = 0;
  private readonly flash: THREE.Mesh;
  private readonly flashLight = new THREE.PointLight(0xffc266, 0, 6);
  private flashLife = 0;

  constructor() {
    const geometry = new THREE.BoxGeometry(0.04, 0.04, 1);
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.tracers.push({ mesh, material, life: 0 });
    }

    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
    );
    this.flash.visible = false;
    this.group.add(this.flash, this.flashLight);
  }

  /** `facing` is the shooter's yaw, used to find the gun tip. */
  spawnShot(from: Vec2, to: Vec2, facing: number): void {
    const sin = Math.sin(facing);
    const cos = Math.cos(facing);
    const tipX = from.x + MUZZLE_LOCAL.x * cos + MUZZLE_LOCAL.z * sin;
    const tipZ = from.z - MUZZLE_LOCAL.x * sin + MUZZLE_LOCAL.z * cos;

    const tracer = this.tracers[this.next]!;
    this.next = (this.next + 1) % POOL_SIZE;
    const length = Math.max(Math.hypot(to.x - tipX, to.z - tipZ), 0.01);
    tracer.mesh.position.set((tipX + to.x) / 2, MUZZLE_HEIGHT, (tipZ + to.z) / 2);
    tracer.mesh.scale.set(1, 1, length);
    tracer.mesh.lookAt(to.x, MUZZLE_HEIGHT, to.z);
    tracer.mesh.visible = true;
    tracer.material.opacity = 1;
    tracer.life = TRACER_LIFE;

    this.flash.position.set(tipX, MUZZLE_HEIGHT, tipZ);
    this.flashLight.position.set(tipX, MUZZLE_HEIGHT + 0.3, tipZ);
    this.flash.visible = true;
    this.flashLight.intensity = 30;
    this.flashLife = FLASH_LIFE;
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
      else t.material.opacity = t.life / TRACER_LIFE;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) {
        this.flash.visible = false;
        this.flashLight.intensity = 0;
      }
    }
  }
}
