import * as THREE from 'three';
import { NODE, NODE_COUNT } from '../sim/physics/ragdoll';

/**
 * Which bones of a model stand for the ragdoll's eleven joints, and which bones are turned to
 * follow them. Names are matched with everything but letters and digits dropped and lower-cased
 * (the glTF loader strips dots and colons, so "Foot.L" arrives as "FootL").
 */
export interface RigSpec {
  head: string;
  chest: string;
  pelvis: string;
  /** Each pair is [one side, the other]; which one is the model's left or right does not matter. */
  elbow: readonly [string, string];
  hand: readonly [string, string];
  knee: readonly [string, string];
  foot: readonly [string, string];
  /** Bones turned to point at a joint: `bone` aims at `target`; `child` is what the bone points at in the rest pose. */
  aims: readonly {
    bone: readonly [string, string];
    child: readonly [string, string];
    target: 'elbow' | 'hand' | 'knee' | 'foot';
  }[];
  /** The foot bones hang off the root (an IK rig), so they are moved to the foot joint directly. */
  placeFeet: boolean;
}

/** The Mixamo marine used for the horde variants: 66 bones in one chain per limb. */
const MIXAMO: RigSpec = {
  head: 'mixamorighead',
  chest: 'mixamorigspine2',
  pelvis: 'mixamorighips',
  elbow: ['mixamorigleftforearm', 'mixamorigrightforearm'],
  hand: ['mixamoriglefthand', 'mixamorigrighthand'],
  knee: ['mixamorigleftleg', 'mixamorigrightleg'],
  foot: ['mixamorigleftfoot', 'mixamorigrightfoot'],
  aims: [
    {
      bone: ['mixamorigleftarm', 'mixamorigrightarm'],
      child: ['mixamorigleftforearm', 'mixamorigrightforearm'],
      target: 'elbow',
    },
    {
      bone: ['mixamorigleftforearm', 'mixamorigrightforearm'],
      child: ['mixamoriglefthand', 'mixamorigrighthand'],
      target: 'hand',
    },
    {
      bone: ['mixamorigleftupleg', 'mixamorigrightupleg'],
      child: ['mixamorigleftleg', 'mixamorigrightleg'],
      target: 'knee',
    },
    {
      bone: ['mixamorigleftleg', 'mixamorigrightleg'],
      child: ['mixamorigleftfoot', 'mixamorigrightfoot'],
      target: 'foot',
    },
  ],
  placeFeet: false,
};

/** The rig of each enemy id that has a ragdoll (only the marine zombie: the plain zombie is deprecated). */
export const RIGS: Record<string, RigSpec> = {
  marine_zombie: MIXAMO,
};

const norm = (name: string): string => name.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

interface Aim {
  bone: THREE.Object3D;
  /** The direction the bone points at in the rest pose, in the bone's own space. */
  restDir: THREE.Vector3;
  target: number;
}

const V = new THREE.Vector3();
const Q = new THREE.Quaternion();
const Q2 = new THREE.Quaternion();

/** The body frame (x right, y up, z forward) from the pelvis, chest and knees. */
function frameOf(
  out: THREE.Quaternion,
  pelvis: THREE.Vector3,
  chest: THREE.Vector3,
  kneeL: THREE.Vector3,
  kneeR: THREE.Vector3,
): THREE.Quaternion {
  const up = new THREE.Vector3().subVectors(chest, pelvis).normalize();
  const right = new THREE.Vector3().subVectors(kneeR, kneeL);
  right.addScaledVector(up, -right.dot(up)).normalize();
  const forward = new THREE.Vector3().crossVectors(right, up);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
}

/**
 * Drives a model's real bones from a ragdoll: the hips follow the pelvis and the body frame, each
 * limb bone is turned to point at the joint beyond it. It bends the rest pose, never the mesh
 * itself, so the model keeps its own proportions (twist along a bone is not simulated).
 */
export class RagdollRig {
  /** The joints in the model's rest pose, in the order of `NODE` (metres, feet near y = 0). */
  readonly bind: THREE.Vector3[] = [];
  /** How tall the model is against the ragdoll's 1.7 m person: pass it as the ragdoll scale. */
  readonly scale: number;
  /** Half the model's front-to-back depth in the rest pose (m): the torso spheres should be about this wide. */
  thickness = 0;
  private readonly hips: THREE.Object3D;
  private readonly hipsBindPos = new THREE.Vector3();
  private readonly hipsBindQuat = new THREE.Quaternion();
  private readonly frameRest = new THREE.Quaternion();
  private readonly aims: Aim[] = [];
  private readonly feet: [THREE.Object3D, THREE.Object3D] | null;
  private readonly footNodes: [number, number] = [NODE.footL, NODE.footR];
  private readonly nodes: THREE.Vector3[] = Array.from(
    { length: NODE_COUNT },
    () => new THREE.Vector3(),
  );

  private constructor(
    readonly root: THREE.Object3D,
    hips: THREE.Object3D,
    scale: number,
    feet: [THREE.Object3D, THREE.Object3D] | null,
  ) {
    this.hips = hips;
    this.scale = scale;
    this.feet = feet;
  }

  /** Builds the rig for a freshly made character, or null if a bone of the spec is missing. */
  static create(root: THREE.Object3D, spec: RigSpec): RagdollRig | null {
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const bones = new Map<string, THREE.Object3D>();
    root.traverse((o) => {
      if (o instanceof THREE.Bone) bones.set(norm(o.name), o);
    });
    const need = (name: string): THREE.Object3D | null => bones.get(norm(name)) ?? null;
    const at = (o: THREE.Object3D): THREE.Vector3 => o.getWorldPosition(new THREE.Vector3());

    const head = need(spec.head);
    const chest = need(spec.chest);
    const pelvis = need(spec.pelvis);
    const pair = (names: readonly [string, string]): [THREE.Object3D, THREE.Object3D] | null => {
      const a = need(names[0]);
      const b = need(names[1]);
      return a && b ? [a, b] : null;
    };
    const elbow = pair(spec.elbow);
    const hand = pair(spec.hand);
    const knee = pair(spec.knee);
    const foot = pair(spec.foot);
    if (!head || !chest || !pelvis || !elbow || !hand || !knee || !foot) return null;

    // The physics left side is -x. Put the model's lower-x bone there, whatever its name says.
    const swap = at(elbow[0]).x > at(elbow[1]).x ? 1 : 0;
    const side = <T>(p: readonly [T, T], s: 0 | 1): T => p[s === 0 ? swap : 1 - swap]!;

    const bind: THREE.Vector3[] = Array.from({ length: NODE_COUNT }, () => new THREE.Vector3());
    bind[NODE.head]!.copy(at(head));
    bind[NODE.chest]!.copy(at(chest));
    bind[NODE.pelvis]!.copy(at(pelvis));
    bind[NODE.elbowL]!.copy(at(side(elbow, 0)));
    bind[NODE.elbowR]!.copy(at(side(elbow, 1)));
    bind[NODE.handL]!.copy(at(side(hand, 0)));
    bind[NODE.handR]!.copy(at(side(hand, 1)));
    bind[NODE.kneeL]!.copy(at(side(knee, 0)));
    bind[NODE.kneeR]!.copy(at(side(knee, 1)));
    bind[NODE.footL]!.copy(at(side(foot, 0)));
    bind[NODE.footR]!.copy(at(side(foot, 1)));

    const height = bind[NODE.head]!.y - Math.min(bind[NODE.footL]!.y, bind[NODE.footR]!.y);
    // The generic ragdoll stands 1.62 m from its feet to its head joint.
    const rig = new RagdollRig(
      root,
      pelvis,
      Math.max(height / 1.48, 0.3),
      spec.placeFeet ? [side(foot, 0), side(foot, 1)] : null,
    );
    for (const v of bind) rig.bind.push(v.clone());
    const box = new THREE.Box3();
    root.traverse((o) => {
      if (!(o instanceof THREE.SkinnedMesh)) return;
      o.skeleton.update();
      o.computeBoundingBox();
      box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));
    });
    rig.thickness = box.isEmpty() ? 0 : (box.max.z - box.min.z) / 2;
    rig.hipsBindPos.copy(at(pelvis));
    pelvis.getWorldQuaternion(rig.hipsBindQuat);
    frameOf(
      rig.frameRest,
      bind[NODE.pelvis]!,
      bind[NODE.chest]!,
      bind[NODE.kneeL]!,
      bind[NODE.kneeR]!,
    );

    const targetNode = {
      elbow: [NODE.elbowL, NODE.elbowR],
      hand: [NODE.handL, NODE.handR],
      knee: [NODE.kneeL, NODE.kneeR],
      foot: [NODE.footL, NODE.footR],
    } as const;
    for (const a of spec.aims) {
      for (const s of [0, 1] as const) {
        const bone = need(side(a.bone, s));
        const child = need(side(a.child, s));
        if (!bone || !child) return null;
        const bq = bone.getWorldQuaternion(new THREE.Quaternion());
        const dir = at(child).sub(at(bone)).normalize().applyQuaternion(bq.invert());
        rig.aims.push({ bone, restDir: dir, target: targetNode[a.target][s] });
      }
    }
    return rig;
  }

  /**
   * The starting positions of the eleven joints for a model standing at (x, z) turned `yaw`, its
   * lowest joint `lift` metres above `y`. Feed them to `RapierWorld.addRagdoll` as `pose`.
   */
  poseAt(x: number, y: number, z: number, yaw: number, lift = 0): Float32Array {
    const out = new Float32Array(NODE_COUNT * 3);
    let low = Infinity;
    for (const v of this.bind) low = Math.min(low, v.y);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    this.bind.forEach((v, i) => {
      out[i * 3] = x + v.x * cos + v.z * sin;
      out[i * 3 + 1] = y + lift + (v.y - low);
      out[i * 3 + 2] = z - v.x * sin + v.z * cos;
    });
    return out;
  }

  /** Poses the model's bones from the ragdoll's eleven joints (`NODE_COUNT * 3` coordinates, `NODE` order). */
  apply(joints: ArrayLike<number>): void {
    for (let n = 0; n < NODE_COUNT; n++) {
      this.nodes[n]!.set(joints[n * 3]!, joints[n * 3 + 1]!, joints[n * 3 + 2]!);
    }
    const nodes = this.nodes;

    // The hips take the pelvis position and the turn of the whole body frame.
    const cur = frameOf(
      Q,
      nodes[NODE.pelvis]!,
      nodes[NODE.chest]!,
      nodes[NODE.kneeL]!,
      nodes[NODE.kneeR]!,
    );
    const turn = Q2.copy(cur).multiply(this.frameRest.clone().invert());
    const parent = this.hips.parent!;
    parent.updateWorldMatrix(true, false);
    const offset = V.copy(this.hipsBindPos).sub(this.bind[NODE.pelvis]!).applyQuaternion(turn);
    this.hips.position.copy(parent.worldToLocal(offset.add(nodes[NODE.pelvis]!)));
    const worldQuat = turn.clone().multiply(this.hipsBindQuat);
    const parentQuat = parent.getWorldQuaternion(new THREE.Quaternion());
    this.hips.quaternion.copy(parentQuat.invert().multiply(worldQuat));

    for (const a of this.aims) {
      a.bone.updateWorldMatrix(true, false);
      const origin = a.bone.getWorldPosition(new THREE.Vector3());
      const bq = a.bone.getWorldQuaternion(new THREE.Quaternion());
      const now = a.restDir.clone().applyQuaternion(bq);
      const want = nodes[a.target]!.clone().sub(origin);
      if (want.lengthSq() < 1e-8) continue;
      const delta = new THREE.Quaternion().setFromUnitVectors(now, want.normalize());
      const bParent = a.bone.parent!.getWorldQuaternion(new THREE.Quaternion());
      a.bone.quaternion.copy(bParent.invert().multiply(delta.multiply(bq)));
    }

    if (this.feet) {
      this.feet.forEach((bone, s) => {
        bone.parent!.updateWorldMatrix(true, false);
        bone.position.copy(bone.parent!.worldToLocal(nodes[this.footNodes[s]!]!.clone()));
      });
    }
    this.root.updateMatrixWorld(true);
  }
}
