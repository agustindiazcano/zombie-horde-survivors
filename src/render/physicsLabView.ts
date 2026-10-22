import * as THREE from 'three';
import { NODE_COUNT } from '../sim/physics/ragdoll';
import { KIND_BALL, KIND_BOX, KIND_LIMB, type RapierRagdoll } from '../sim/physics/bodies';
import type { RapierWorld } from '../sim/physics/rapierWorld';
import type { CharacterView } from './characters';
import type { RagdollRig } from './ragdollRig';

const BALL_COLORS = [0x00ffcc, 0xff00aa, 0x00ff66, 0xffcc00, 0x33aaff, 0xff4444];
const BOX_COLORS = [0xc9a26b, 0xb58a52, 0xd8b784, 0xa37c48];
const LIMB_COLOR = 0xff3399;

/** A ragdoll wearing a real model: the bones follow the joints every frame. */
interface Dressed {
  rig: RagdollRig;
  view: CharacterView;
  doll: RapierRagdoll;
  joints: Float32Array;
}

/** A canvas with bold bands, so a rolling ball visibly turns. */
function spinTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#555555';
  g.fillRect(0, 0, 16, 32);
  g.fillRect(32, 0, 16, 32);
  g.fillStyle = '#000000';
  g.fillRect(0, 12, 64, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Draws the physics lab: balls, boxes and ragdoll limbs as instanced meshes (one per kind) that
 * follow the Rapier bodies with their rotation, and the zombie models posed by their ragdolls.
 */
export class PhysicsLabView {
  readonly group = new THREE.Group();
  private readonly balls: THREE.InstancedMesh;
  private readonly boxes: THREE.InstancedMesh;
  private readonly limbs: THREE.InstancedMesh;
  private readonly dressed: Dressed[] = [];
  private readonly dressedGroups = new Set<number>();
  private readonly dummy = new THREE.Object3D();
  private readonly quat = new THREE.Quaternion();
  private readonly align = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly color = new THREE.Color();
  private debug = false;
  /** Bodies whose instance colour is already set. */
  private coloured = 0;

  constructor(capacity: number) {
    const mesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
    ): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geometry, material, capacity);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.count = 0;
      this.group.add(m);
      return m;
    };
    this.balls = mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2, map: spinTexture() }),
    );
    this.boxes = mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 }),
    );
    this.limbs = mesh(
      new THREE.CylinderGeometry(1, 1, 1, 10),
      new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 }),
    );
  }

  /** Shows the capsule bodies of every ragdoll, even the ones wearing a model. */
  setDebug(on: boolean): void {
    this.debug = on;
    this.coloured = 0;
  }

  /** Puts a model in the scene as the skin of `doll` (group: the ragdoll's id in the world). */
  dress(rig: RagdollRig, view: CharacterView, doll: RapierRagdoll, group: number): void {
    view.object.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) o.frustumCulled = false;
    });
    this.group.add(view.object);
    this.dressed.push({ rig, view, doll, joints: new Float32Array(NODE_COUNT * 3) });
    this.dressedGroups.add(group);
  }

  get dressedCount(): number {
    return this.dressed.length;
  }

  /** Removes every model (the bodies are the world's to clear). */
  clear(): void {
    for (const d of this.dressed) this.group.remove(d.view.object);
    this.dressed.length = 0;
    this.dressedGroups.clear();
    for (const m of [this.balls, this.boxes, this.limbs]) m.count = 0;
    this.coloured = 0;
  }

  update(world: RapierWorld): void {
    const d = this.dummy;
    const meshes = [this.balls, this.boxes, this.limbs];
    const next = [0, 0, 0];
    for (let i = 0; i < world.count; i++) {
      const kind = world.kind[i]!;
      if (kind === KIND_LIMB && !this.debug && this.dressedGroups.has(world.group[i]!)) continue;
      const mesh = kind === KIND_BALL ? this.balls : kind === KIND_BOX ? this.boxes : this.limbs;
      const slot = next[kind]!++;
      d.position.set(world.pos[i * 3]!, world.pos[i * 3 + 1]!, world.pos[i * 3 + 2]!);
      this.quat.set(
        world.rot[i * 4]!,
        world.rot[i * 4 + 1]!,
        world.rot[i * 4 + 2]!,
        world.rot[i * 4 + 3]!,
      );
      const s0 = world.size[i * 3]!;
      const s1 = world.size[i * 3 + 1]!;
      const s2 = world.size[i * 3 + 2]!;
      d.quaternion.copy(this.quat);
      if (kind === KIND_BALL) {
        d.scale.setScalar(s0);
      } else if (kind === KIND_BOX) {
        d.scale.set(s0 * 2, s1 * 2, s2 * 2);
      } else {
        // The cylinder lies along the limb's axis inside the body, then follows the body.
        this.axis.set(
          world.limbAxis[i * 4]!,
          world.limbAxis[i * 4 + 1]!,
          world.limbAxis[i * 4 + 2]!,
        );
        this.align.setFromUnitVectors(this.up, this.axis);
        d.quaternion.multiply(this.align);
        d.scale.set(s0, s1 * 2, s0);
      }
      d.updateMatrix();
      mesh.setMatrixAt(slot, d.matrix);
      if (i >= this.coloured) {
        const palette = kind === KIND_BALL ? BALL_COLORS : kind === KIND_BOX ? BOX_COLORS : null;
        mesh.setColorAt(
          slot,
          this.color.setHex(palette ? palette[i % palette.length]! : LIMB_COLOR),
        );
      }
    }
    this.coloured = world.count;
    meshes.forEach((mesh, k) => {
      mesh.count = next[k]!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    for (const m of this.dressed) {
      world.ragdollNodes(m.doll, m.joints);
      m.rig.apply(m.joints);
    }
  }
}
