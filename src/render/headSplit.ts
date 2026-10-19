import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterView } from './characters';

/** The head bone of a Mixamo rig (the loader may or may not strip the colon). */
const HEAD_BONE = /^(mixamorig:?)?Head$/;

/** Radius in metres of the stump that fills the neck, and its colour. */
const STUMP_RADIUS = 0.09;
const stumpGeometry = new THREE.SphereGeometry(1, 10, 8);
const stumpMaterial = new THREE.MeshStandardMaterial({ color: 0x6a0a0a, roughness: 0.4 });

/** Whether a bone is the head or hangs from it (jaw, eyes, the top of the head). */
function isHeadBone(bone: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = bone; o; o = o.parent)
    if (HEAD_BONE.test(o.name)) return true;
  return false;
}

/**
 * Splits every skinned mesh of a loaded model into a body range and a head range (two geometry
 * groups, so two materials), by the bones that drive each triangle. Done once per model; every
 * clone shares the result. Returns true when a head was found.
 */
export function splitHead(scene: THREE.Object3D): boolean {
  let found = false;
  scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || Array.isArray(mesh.material)) return;
    const geometry = mesh.geometry;
    const index = geometry.index;
    const skinIndex = geometry.getAttribute('skinIndex');
    const skinWeight = geometry.getAttribute('skinWeight');
    if (!index || !skinIndex || !skinWeight) return;

    const headBone = mesh.skeleton.bones.map(isHeadBone);
    const head = new Uint8Array(geometry.getAttribute('position').count);
    for (let v = 0; v < head.length; v++) {
      let weight = 0;
      for (let k = 0; k < 4; k++) {
        if (headBone[skinIndex.getComponent(v, k)]) weight += skinWeight.getComponent(v, k);
      }
      head[v] = weight > 0.5 ? 1 : 0;
    }

    // Body triangles first, then the triangles most of whose vertices are the head's.
    const src = index.array;
    const body: number[] = [];
    const top: number[] = [];
    for (let t = 0; t < src.length; t += 3) {
      const a = src[t]!;
      const b = src[t + 1]!;
      const c = src[t + 2]!;
      (head[a]! + head[b]! + head[c]! >= 2 ? top : body).push(a, b, c);
    }
    if (top.length === 0) return;
    const sorted = new (src.constructor as Uint16ArrayConstructor)(src.length);
    sorted.set(body);
    sorted.set(top, body.length);
    geometry.setIndex(new THREE.BufferAttribute(sorted, 1));
    geometry.clearGroups();
    geometry.addGroup(0, body.length, 0);
    geometry.addGroup(body.length, top.length, 1);
    mesh.material = [mesh.material, mesh.material];
    found = true;
  });
  return found;
}

/** The meshes `splitHead` made two-part. */
function splitMeshes(model: THREE.Object3D): THREE.Mesh[] {
  const list: THREE.Mesh[] = [];
  model.traverse((o) => {
    if (o instanceof THREE.Mesh && Array.isArray(o.material) && o.geometry.groups.length === 2) {
      list.push(o);
    }
  });
  return list;
}

type HeadControl = Pick<CharacterView, 'removeHead' | 'restoreHead'>;

/**
 * Lets a clone of a split model lose its head: the head range stops being drawn, a red stump
 * fills the neck and, if asked, a frozen copy of the head is handed back to be thrown.
 */
export function createHeadControl(model: THREE.Object3D, root: THREE.Object3D): HeadControl {
  let bone: THREE.Object3D | null = null;
  model.traverse((o) => {
    if (!bone && HEAD_BONE.test(o.name)) bone = o;
  });
  const meshes = splitMeshes(model);
  let stump: THREE.Mesh | null = null;
  let off = false;
  const scale = new THREE.Vector3();

  const setHeadVisible = (visible: boolean): void => {
    for (const m of meshes) (m.material as THREE.Material[])[1]!.visible = visible;
  };

  return {
    removeHead({ loose, stump: capped }) {
      const head = bone as THREE.Object3D | null;
      if (!head || off || meshes.length === 0) return null;
      off = true;
      root.updateMatrixWorld(true);
      const at = head.getWorldPosition(new THREE.Vector3());

      let thrown: THREE.Object3D | null = null;
      if (loose) {
        if (stump) stump.visible = false;
        const copy = clone(root);
        copy.position.sub(at);
        copy.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh || !Array.isArray(mesh.material)) return;
          const [body, top] = mesh.material as THREE.Material[];
          mesh.material = [body!.clone(), top!.clone()];
          (mesh.material as THREE.Material[])[0]!.visible = false;
          (mesh.material as THREE.Material[])[1]!.visible = true;
          // The pose is frozen at the old place: let the box follow the thrown copy.
          mesh.frustumCulled = false;
        });
        thrown = new THREE.Group();
        thrown.add(copy);
        thrown.position.copy(at);
      }

      setHeadVisible(false);
      if (capped) {
        if (!stump) {
          stump = new THREE.Mesh(stumpGeometry, stumpMaterial);
          head.add(stump);
        }
        // The bone's world scale is the rig's (centimetres, usually): undo it to size in metres.
        head.getWorldScale(scale);
        stump.scale.setScalar(scale.x > 1e-6 ? STUMP_RADIUS / scale.x : STUMP_RADIUS);
        stump.visible = true;
      }
      return { at, loose: thrown };
    },
    restoreHead() {
      if (!off) return;
      off = false;
      setHeadVisible(true);
      if (stump) stump.visible = false;
    },
  };
}
