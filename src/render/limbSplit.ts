import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterView } from './characters';

/** The body parts of a marine that can come off. */
export type Part = 'head' | 'armL' | 'armR' | 'legs';

interface PartDef {
  id: Part;
  /** Bones where the part starts; it is every vertex they (and the bones below them) drive. */
  roots: RegExp[];
  /** Radius in metres of the stump that fills the cut. */
  radius: number;
}

// The bone names of a Mixamo rig (the loader may or may not strip the colon).
const bone = (name: string): RegExp => new RegExp(`^(mixamorig:?)?${name}$`);
const PARTS: PartDef[] = [
  { id: 'head', roots: [bone('Head')], radius: 0.09 },
  { id: 'armL', roots: [bone('LeftArm')], radius: 0.07 },
  { id: 'armR', roots: [bone('RightArm')], radius: 0.07 },
  { id: 'legs', roots: [bone('LeftUpLeg'), bone('RightUpLeg')], radius: 0.1 },
];

type Range = [start: number, count: number];

const stumpGeometry = new THREE.SphereGeometry(1, 10, 8);
const stumpMaterial = new THREE.MeshStandardMaterial({ color: 0x6a0a0a, roughness: 0.4 });

/** Which part (index into PARTS plus one; 0 is the body) a bone belongs to. */
function partOfBone(b: THREE.Object3D): number {
  for (let o: THREE.Object3D | null = b; o; o = o.parent) {
    const name = o.name;
    const i = PARTS.findIndex((p) => p.roots.some((r) => r.test(name)));
    if (i >= 0) return i + 1;
  }
  return 0;
}

/**
 * Sorts the triangles of every skinned mesh of a loaded model into body, head, left arm, right
 * arm and legs, by the bones that drive each vertex, and remembers each part's range of the index
 * (`geometry.userData.partRanges`). Done once per model; every clone shares the result and still
 * draws in a single call. Returns true when a part was found.
 */
export function splitParts(scene: THREE.Object3D): boolean {
  let found = false;
  scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || Array.isArray(mesh.material)) return;
    const geometry = mesh.geometry;
    const index = geometry.index;
    const skinIndex = geometry.getAttribute('skinIndex');
    const skinWeight = geometry.getAttribute('skinWeight');
    if (!index || !skinIndex || !skinWeight || geometry.userData.partRanges) return;

    const boneGroup = mesh.skeleton.bones.map(partOfBone);
    const count = geometry.getAttribute('position').count;
    const group = new Uint8Array(count);
    const weights = new Float32Array(PARTS.length + 1);
    for (let v = 0; v < count; v++) {
      weights.fill(0);
      for (let k = 0; k < 4; k++) {
        weights[boneGroup[skinIndex.getComponent(v, k)]!]! += skinWeight.getComponent(v, k);
      }
      let best = 0;
      for (let g = 1; g < weights.length; g++) if (weights[g]! > weights[best]!) best = g;
      group[v] = best;
    }

    // A triangle belongs to the group most of its vertices are in (the body when they all differ).
    const src = index.array;
    const lists: number[][] = Array.from({ length: PARTS.length + 1 }, () => []);
    for (let t = 0; t < src.length; t += 3) {
      const a = src[t]!;
      const b = src[t + 1]!;
      const c = src[t + 2]!;
      const ga = group[a]!;
      const gb = group[b]!;
      const gc = group[c]!;
      const g = ga === gb || ga === gc ? ga : gb === gc ? gb : 0;
      lists[g]!.push(a, b, c);
    }
    if (lists.slice(1).every((l) => l.length === 0)) return;

    const sorted = new (src.constructor as Uint16ArrayConstructor)(src.length);
    const ranges: Record<string, Range> = {};
    let at = 0;
    lists.forEach((list, g) => {
      sorted.set(list, at);
      ranges[g === 0 ? 'body' : PARTS[g - 1]!.id] = [at, list.length];
      at += list.length;
    });
    geometry.setIndex(new THREE.BufferAttribute(sorted, 1));
    geometry.userData.partRanges = ranges;
    found = true;
  });
  return found;
}

/** The order the ranges lie in the index: the body first. */
const ORDER = ['body', ...PARTS.map((p) => p.id)];

/** A geometry that shares `from`'s vertices and index but has its own groups. */
function sharing(from: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(from.attributes)) g.setAttribute(name, attribute);
  g.setIndex(from.index);
  g.userData = from.userData;
  return g;
}

type PartsControl = Pick<CharacterView, 'removePart' | 'restoreParts'>;

interface SplitMesh {
  mesh: THREE.SkinnedMesh;
  shared: THREE.BufferGeometry;
  material: THREE.Material;
  own?: THREE.BufferGeometry;
}

/**
 * Lets a clone of a split model lose parts: the lost part's range stops being drawn (the rest is
 * drawn in as few calls as there are gaps), a red stump fills each cut and, if asked, a frozen
 * copy of the part is handed back to be thrown. A model with nothing lost draws in one call.
 */
export function createPartsControl(model: THREE.Object3D, root: THREE.Object3D): PartsControl {
  const meshes: SplitMesh[] = [];
  const bones = new Map<Part, THREE.Object3D[]>(PARTS.map((p) => [p.id, []]));
  model.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh && mesh.geometry.userData.partRanges && !Array.isArray(mesh.material)) {
      meshes.push({ mesh, shared: mesh.geometry, material: mesh.material });
    }
    for (const p of PARTS) if (p.roots.some((r) => r.test(o.name))) bones.get(p.id)!.push(o);
  });
  const stumps = new Map<Part, THREE.Mesh[]>();
  const lost = new Set<string>();
  const scale = new THREE.Vector3();

  /** Points every mesh at the geometry that draws what is still attached. */
  const apply = (): void => {
    for (const m of meshes) {
      if (lost.size === 0) {
        m.mesh.geometry = m.shared;
        m.mesh.material = m.material;
        continue;
      }
      const ranges = m.shared.userData.partRanges as Record<string, Range>;
      const own = (m.own ??= sharing(m.shared));
      own.clearGroups();
      let runs = 0;
      let runStart = -1;
      let runEnd = 0;
      for (const name of ORDER) {
        const [start, count] = ranges[name]!;
        if (lost.has(name) || count === 0) continue;
        if (runStart >= 0 && start === runEnd) {
          runEnd += count;
        } else {
          if (runStart >= 0) own.addGroup(runStart, runEnd - runStart, runs++);
          runStart = start;
          runEnd = start + count;
        }
      }
      if (runStart >= 0) own.addGroup(runStart, runEnd - runStart, runs++);
      m.mesh.geometry = own;
      m.mesh.material = Array<THREE.Material>(Math.max(runs, 1)).fill(m.material);
    }
  };

  /** A frozen copy of the model that draws only `part`, hung from a pivot at `at`. */
  const looseCopy = (part: Part, at: THREE.Vector3): THREE.Object3D => {
    const copy = clone(root);
    copy.position.sub(at);
    copy.traverse((o) => {
      if (o.userData.stump) o.visible = false;
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh || !mesh.geometry.userData.partRanges) return;
      const [start, count] = (mesh.geometry.userData.partRanges as Record<string, Range>)[part]!;
      const first = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
      const g = sharing(mesh.geometry);
      g.addGroup(start, count, 0);
      mesh.geometry = g;
      mesh.material = [first.clone()];
      // The pose is frozen at the old place: let the box follow the thrown copy.
      mesh.frustumCulled = false;
    });
    const pivot = new THREE.Group();
    pivot.add(copy);
    pivot.position.copy(at);
    return pivot;
  };

  const showStumps = (part: Part): void => {
    const def = PARTS.find((p) => p.id === part)!;
    const roots = bones.get(part)!;
    let list = stumps.get(part);
    if (!list) {
      list = roots.map((b) => {
        const stump = new THREE.Mesh(stumpGeometry, stumpMaterial);
        stump.userData.stump = true;
        b.add(stump);
        return stump;
      });
      stumps.set(part, list);
    }
    list.forEach((stump, i) => {
      // The bone's world scale is the rig's (centimetres, usually): undo it to size in metres.
      roots[i]!.getWorldScale(scale);
      stump.scale.setScalar(scale.x > 1e-6 ? def.radius / scale.x : def.radius);
      stump.visible = true;
    });
  };

  return {
    removePart(part, { loose, stump }) {
      const roots = bones.get(part)!;
      if (meshes.length === 0 || roots.length === 0 || lost.has(part)) return null;
      root.updateMatrixWorld(true);
      const at = new THREE.Vector3();
      for (const b of roots) at.add(b.getWorldPosition(scale));
      at.divideScalar(roots.length);
      const thrown = loose ? looseCopy(part, at) : null;
      lost.add(part);
      apply();
      if (stump) showStumps(part);
      return { at, loose: thrown };
    },
    restoreParts() {
      if (lost.size === 0) return;
      lost.clear();
      apply();
      for (const list of stumps.values()) for (const s of list) s.visible = false;
    },
  };
}
