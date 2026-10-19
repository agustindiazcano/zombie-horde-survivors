import * as THREE from 'three';
import { WEAPON_POSES } from './weaponModels';

/**
 * Raises a rigged soldier's arms onto the weapon it fires: the right hand takes the grip in front
 * of the shoulder with the barrel straight ahead, and for a long gun the left hand takes the
 * foregrip. It runs after the animation and blends the result over the clip's pose by `amount`.
 * Every number here is a guess for the Meshy marine; they are the constants to tune once seen.
 */

/** Where the right hand goes, in the character's own space (+Z ahead, +Y up, metres). */
const RIGHT_HAND_TWO_HANDED = new THREE.Vector3(0.14, 1.36, 0.32);
const RIGHT_HAND_ONE_HANDED = new THREE.Vector3(0.2, 1.4, 0.5);
/** Points the elbows bend towards: outwards, down and a little back. */
const RIGHT_ELBOW_HINT = new THREE.Vector3(0.75, 0.95, -0.15);
const LEFT_ELBOW_HINT = new THREE.Vector3(-0.75, 0.95, -0.15);

interface Chain {
  upper: THREE.Object3D;
  fore: THREE.Object3D;
  hand: THREE.Object3D;
}

/** The bones of one arm of a Mixamo rig (the loader may or may not strip the colon). */
function findChain(model: THREE.Object3D, side: 'Left' | 'Right'): Chain | null {
  const names = [`${side}Arm`, `${side}ForeArm`, `${side}Hand`];
  const found: THREE.Object3D[] = [];
  model.traverse((o) => {
    const i = names.findIndex((n) => o.name === n || o.name === `mixamorig:${n}`);
    if (i >= 0 && !found[i]) found[i] = o;
  });
  const [upper, fore, hand] = found;
  return upper && fore && hand ? { upper, fore, hand } : null;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpPerp = new THREE.Vector3();
const tmpMid = new THREE.Vector3();
const qWorld = new THREE.Quaternion();
const qParent = new THREE.Quaternion();
const qDelta = new THREE.Quaternion();

/** Turns `bone` so the line from its origin to its child's points at `want` (world space). */
function pointBone(bone: THREE.Object3D, child: THREE.Object3D, want: THREE.Vector3): void {
  bone.getWorldPosition(tmpA);
  child.getWorldPosition(tmpB);
  tmpB.sub(tmpA).normalize();
  tmpC.copy(want).sub(tmpA).normalize();
  qDelta.setFromUnitVectors(tmpB, tmpC);
  bone.getWorldQuaternion(qWorld);
  qDelta.multiply(qWorld);
  if (bone.parent) {
    bone.parent.getWorldQuaternion(qParent).invert();
    qDelta.premultiply(qParent);
  }
  bone.quaternion.copy(qDelta);
  bone.updateMatrixWorld(true);
}

/** Two-bone inverse kinematics: puts the end of the arm on `target`, the elbow towards `hint`. */
function solveArm(chain: Chain, target: THREE.Vector3, hint: THREE.Vector3): void {
  const a = chain.upper.getWorldPosition(new THREE.Vector3());
  const b = chain.fore.getWorldPosition(new THREE.Vector3());
  const c = chain.hand.getWorldPosition(new THREE.Vector3());
  const l1 = a.distanceTo(b);
  const l2 = b.distanceTo(c);
  tmpDir.copy(target).sub(a);
  const dist = Math.min(Math.max(tmpDir.length(), 0.05), (l1 + l2) * 0.999);
  tmpDir.normalize();
  // Where the elbow sits: along the line to the target, pushed sideways towards the hint.
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const out = Math.sqrt(Math.max(l1 * l1 - along * along, 0));
  tmpPerp.copy(hint).sub(a);
  tmpPerp.addScaledVector(tmpDir, -tmpPerp.dot(tmpDir)).normalize();
  tmpMid.copy(a).addScaledVector(tmpDir, along).addScaledVector(tmpPerp, out);
  pointBone(chain.upper, chain.fore, tmpMid);
  tmpMid.copy(a).addScaledVector(tmpDir, dist);
  pointBone(chain.fore, chain.hand, tmpMid);
}

export class ArmPose {
  private readonly right: Chain;
  private readonly left: Chain | null;
  private readonly bones: THREE.Object3D[];
  private readonly saved: THREE.Quaternion[];

  constructor(
    private readonly model: THREE.Object3D,
    private readonly root: THREE.Object3D,
    private readonly holder: THREE.Object3D,
    right: Chain,
    left: Chain | null,
  ) {
    this.right = right;
    this.left = left;
    this.bones = [right.upper, right.fore, right.hand];
    if (left) this.bones.push(left.upper, left.fore, left.hand);
    this.saved = this.bones.map(() => new THREE.Quaternion());
  }

  /** The poser for a model, or null when it has no Mixamo arms. */
  static create(model: THREE.Object3D, root: THREE.Object3D, holder: THREE.Object3D) {
    const right = findChain(model, 'Right');
    return right ? new ArmPose(model, root, holder, right, findChain(model, 'Left')) : null;
  }

  /** Poses the arms for the held `item` (an id of data/items.json), `amount` from 0 to 1. */
  apply(amount: number, item: string | null, weapon: THREE.Object3D | null): void {
    const pose = item === null ? undefined : WEAPON_POSES[item];
    if (amount < 0.01 || !pose || !weapon || item === 'knife') return;
    const root = this.root;
    root.updateMatrixWorld(true);
    this.bones.forEach((b, i) => this.saved[i]!.copy(b.quaternion));

    // The right hand takes the grip, turned so the barrel points along the character's heading.
    const twoHanded = pose.foregrip !== undefined;
    const target = root.localToWorld(
      (twoHanded ? RIGHT_HAND_TWO_HANDED : RIGHT_HAND_ONE_HANDED).clone(),
    );
    solveArm(this.right, target, root.localToWorld(RIGHT_ELBOW_HINT.clone()));
    const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
    const handQ = rootQ.multiply(this.holder.quaternion.clone().invert());
    const handParent = this.right.hand.parent!.getWorldQuaternion(new THREE.Quaternion());
    this.right.hand.quaternion.copy(handParent.invert().multiply(handQ));
    this.right.hand.updateMatrixWorld(true);

    // The left hand takes the foregrip of a long gun, wherever the right hand put the weapon.
    if (this.left && pose.foregrip) {
      const grip = weapon.localToWorld(new THREE.Vector3(...pose.foregrip));
      solveArm(this.left, grip, root.localToWorld(LEFT_ELBOW_HINT.clone()));
    }

    // Blend from the clip's pose to the aimed one.
    this.bones.forEach((b, i) => {
      const aimed = b.quaternion.clone();
      b.quaternion.copy(this.saved[i]!).slerp(aimed, amount);
    });
    this.model.updateMatrixWorld(true);
  }
}
