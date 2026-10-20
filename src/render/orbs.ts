import * as THREE from 'three';
import type { GameConfig, GameState, Vec2 } from '../sim';

const FLASH_LIFE = 0.45;
const ASH_COUNT = 28;
const ASH_LIFE = 1.4;
const MAX_FLASHES = 8;
const MAX_ASH = 160;
const RAY_RADIUS = 0.05;
/** Metres a sphere bobs up and down while it hovers. */
const BOB = 0.04;
const UP = new THREE.Vector3(0, 1, 0);

interface OrbView {
  group: THREE.Group;
  ray: THREE.Mesh;
}

/**
 * The celestial orbs: a chrome sphere that hovers without a sound, a thin white ray while it
 * charges, and the vaporising flash and drifting ash where someone stood. All procedural.
 */
export class OrbViews {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, OrbView>();
  private readonly sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
  private readonly rayGeometry = new THREE.CylinderGeometry(RAY_RADIUS, RAY_RADIUS, 1, 8, 1, true);
  private readonly flashes: {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    life: number;
  }[] = [];
  private nextFlash = 0;
  private readonly ash: THREE.InstancedMesh;
  private readonly ashPos = new Float32Array(MAX_ASH * 3);
  private readonly ashVel = new Float32Array(MAX_ASH * 3);
  private readonly ashLife = new Float32Array(MAX_ASH);
  private nextAsh = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly rayDir = new THREE.Vector3();

  constructor(private readonly groundAt: (x: number, z: number) => number) {
    const flashGeometry = new THREE.SphereGeometry(1, 16, 12);
    for (let i = 0; i < MAX_FLASHES; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xbfe9ff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(flashGeometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.flashes.push({ mesh, material, life: 0 });
    }
    this.ash = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x8c8f93 }),
      MAX_ASH,
    );
    this.ash.frustumCulled = false;
    this.ash.count = MAX_ASH;
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < MAX_ASH; i++) this.ash.setMatrixAt(i, this.dummy.matrix);
    this.group.add(this.ash);
  }

  /** A person is vaporised at `pos`: a bright flash that swells and fades, and grey ash that drifts up. */
  vaporise(pos: Vec2): void {
    const flash = this.flashes[this.nextFlash]!;
    this.nextFlash = (this.nextFlash + 1) % MAX_FLASHES;
    flash.mesh.position.set(pos.x, this.groundAt(pos.x, pos.z) + 1, pos.z);
    flash.mesh.visible = true;
    flash.life = FLASH_LIFE;
    for (let i = 0; i < ASH_COUNT; i++) {
      const k = this.nextAsh;
      this.nextAsh = (this.nextAsh + 1) % MAX_ASH;
      this.ashPos.set(
        [
          pos.x + (Math.random() - 0.5) * 0.5,
          this.groundAt(pos.x, pos.z) + Math.random() * 1.8,
          pos.z + (Math.random() - 0.5) * 0.5,
        ],
        k * 3,
      );
      this.ashVel.set(
        [(Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 1.1, (Math.random() - 0.5) * 0.8],
        k * 3,
      );
      this.ashLife[k] = ASH_LIFE * (0.6 + Math.random() * 0.4);
    }
  }

  update(state: GameState, config: GameConfig, alpha: number, dt: number, time: number): void {
    const live = new Set<number>();
    for (const orb of state.orbs) {
      const def = config.orbs[orb.type];
      if (!def) continue;
      live.add(orb.id);
      let view = this.views.get(orb.id);
      if (!view) {
        view = this.makeView(def.radius, def.color);
        this.views.set(orb.id, view);
        this.group.add(view.group);
      }
      const awake = orb.phase !== 'dormant';
      view.group.visible = awake;
      if (!awake) continue;
      const x = orb.prev.x + (orb.pos.x - orb.prev.x) * alpha;
      const z = orb.prev.z + (orb.pos.z - orb.prev.z) * alpha;
      const y = this.groundAt(x, z) + def.height + Math.sin(time * 2 + orb.id) * BOB;
      view.group.position.set(x, y, z);

      // The ray runs from the sphere to the head of whoever it is about to vaporise.
      const aim = orb.aim;
      view.ray.visible = orb.phase === 'charge' && aim !== null;
      if (aim) {
        const tx = aim.x;
        const ty = this.groundAt(aim.x, aim.z) + 1.5;
        const tz = aim.z;
        const length = Math.max(Math.hypot(tx - x, ty - y, tz - z), 0.01);
        view.ray.position.set((tx - x) / 2, (ty - y) / 2, (tz - z) / 2);
        view.ray.scale.set(1, length, 1);
        this.rayDir.set(tx - x, ty - y, tz - z).normalize();
        view.ray.quaternion.setFromUnitVectors(UP, this.rayDir);
      }
    }
    for (const [id, view] of this.views) {
      if (live.has(id)) continue;
      this.group.remove(view.group);
      this.views.delete(id);
    }

    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.visible = false;
        continue;
      }
      const t = 1 - f.life / FLASH_LIFE;
      f.mesh.scale.setScalar(0.4 + t * 1.8);
      f.material.opacity = 1 - t;
    }
    for (let i = 0; i < MAX_ASH; i++) {
      if (this.ashLife[i]! <= 0) continue;
      this.ashLife[i]! -= dt;
      const live = this.ashLife[i]! > 0;
      this.ashPos[i * 3]! += this.ashVel[i * 3]! * dt;
      this.ashPos[i * 3 + 1]! += this.ashVel[i * 3 + 1]! * dt;
      this.ashPos[i * 3 + 2]! += this.ashVel[i * 3 + 2]! * dt;
      this.dummy.position.set(
        this.ashPos[i * 3]!,
        this.ashPos[i * 3 + 1]!,
        this.ashPos[i * 3 + 2]!,
      );
      this.dummy.scale.setScalar(live ? 0.04 + 0.04 * (this.ashLife[i]! / ASH_LIFE) : 0);
      this.dummy.updateMatrix();
      this.ash.setMatrixAt(i, this.dummy.matrix);
    }
    this.ash.instanceMatrix.needsUpdate = true;
  }

  /** Drops the views for a new map. */
  clear(): void {
    for (const view of this.views.values()) this.group.remove(view.group);
    this.views.clear();
  }

  private makeView(radius: number, color: string): OrbView {
    const group = new THREE.Group();
    const sphere = new THREE.Mesh(
      this.sphereGeometry,
      new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.12 }),
    );
    sphere.scale.setScalar(radius);
    group.add(sphere);
    const ray = new THREE.Mesh(
      this.rayGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xe8f6ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ray.visible = false;
    group.add(ray);
    return { group, ray };
  }
}
