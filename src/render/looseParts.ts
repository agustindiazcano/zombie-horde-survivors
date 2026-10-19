import * as THREE from 'three';

const GRAVITY = 22;
const LIFE = 6;
const FADE = 1;
const MAX_PARTS = 12;
/** Height of the floor under a head's pivot (the pivot sits at the base of the neck). */
const REST_HEIGHT = 0.12;

interface Part {
  object: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  size: number;
}

/** Severed body parts flying and tumbling under gravity, then fading away. */
export class LooseParts {
  readonly group = new THREE.Group();
  private readonly parts: Part[] = [];

  /** Throws `object` (already placed at its start) with velocity `vel` and a random tumble. */
  throw(object: THREE.Object3D, vel: THREE.Vector3): void {
    if (this.parts.length >= MAX_PARTS) this.remove(this.parts[0]!);
    this.group.add(object);
    this.parts.push({
      object,
      vel,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 14,
      ),
      life: LIFE,
      size: object.scale.x,
    });
  }

  /** Moves every part; `floorAt` gives the ground height under a point. */
  update(dt: number, floorAt: (x: number, z: number) => number): void {
    for (const p of [...this.parts]) {
      p.life -= dt;
      if (p.life <= 0) {
        this.remove(p);
        continue;
      }
      const o = p.object;
      p.vel.y -= GRAVITY * dt;
      o.position.addScaledVector(p.vel, dt);
      o.rotation.x += p.spin.x * dt;
      o.rotation.y += p.spin.y * dt;
      o.rotation.z += p.spin.z * dt;
      const floor = floorAt(o.position.x, o.position.z) + REST_HEIGHT;
      if (o.position.y < floor) {
        o.position.y = floor;
        p.vel.y = Math.abs(p.vel.y) > 1.5 ? -p.vel.y * 0.35 : 0;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
        p.spin.multiplyScalar(0.5);
      }
      if (p.life < FADE) o.scale.setScalar(Math.max(p.size * (p.life / FADE), 0.001));
    }
  }

  private remove(p: Part): void {
    this.group.remove(p.object);
    this.parts.splice(this.parts.indexOf(p), 1);
  }
}
