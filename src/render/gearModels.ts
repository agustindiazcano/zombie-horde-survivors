import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GearSpec } from './characterConfig';

/** Loaded gear models by item id (weapons held in hand, helmets worn on the head), in metres. */
const models = new Map<string, THREE.Object3D>();

/** The box of a model in world space; a skinned mesh is measured vertex by vertex with its bones applied. */
export function measure(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) {
      o.skeleton.update();
      const count = o.geometry.getAttribute('position').count;
      for (let i = 0; i < count; i++) {
        o.getVertexPosition(i, v);
        box.expandByPoint(v.applyMatrix4(o.matrixWorld));
      }
    } else if (o instanceof THREE.Mesh) {
      box.union(new THREE.Box3().setFromObject(o));
    }
  });
  return box;
}

/**
 * Fits a loaded model to the spec: turns it, scales its longest side to `size` metres and moves the
 * `anchor` point (fractions of its box) to the origin, so the game can place it by that point.
 */
export function normalizeGear(scene: THREE.Object3D, spec: GearSpec): THREE.Group {
  const inner = new THREE.Group();
  inner.add(scene);
  const [rx, ry, rz] = spec.rotation ?? [0, 0, 0];
  inner.rotation.set(rx, ry, rz);
  inner.updateMatrixWorld(true);
  const box = measure(inner);
  const dim = box.getSize(new THREE.Vector3());
  const k = spec.size / Math.max(dim.x, dim.y, dim.z, 1e-6);
  const [fx, fy, fz] = spec.anchor;
  const anchor = new THREE.Vector3(
    box.min.x + dim.x * fx,
    box.min.y + dim.y * fy,
    box.min.z + dim.z * fz,
  );
  const outer = new THREE.Group();
  outer.add(inner);
  inner.scale.setScalar(k);
  inner.position.copy(anchor).multiplyScalar(-k);
  const [ox, oy, oz] = spec.offset ?? [0, 0, 0];
  outer.position.set(ox, oy, oz);
  const holder = new THREE.Group();
  holder.add(outer);
  holder.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return holder;
}

export function registerGear(item: string, model: THREE.Object3D): void {
  models.set(item, model);
}

/** A fresh copy of the loaded model of an item (its materials are shared), or null if it has none. */
export function createGearModel(item: string): THREE.Group | null {
  const model = models.get(item);
  if (!model) return null;
  const g = new THREE.Group();
  // SkeletonUtils: a plain clone of a skinned mesh would keep using the original's bones.
  g.add(clone(model));
  return g;
}
