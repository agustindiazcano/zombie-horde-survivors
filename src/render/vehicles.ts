import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BODY = new THREE.MeshStandardMaterial({ color: 0x5b6b3a, roughness: 0.8 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.9 });
const GLASS = new THREE.MeshStandardMaterial({ color: 0x8fb4c9, roughness: 0.2, metalness: 0.3 });
const WHEEL = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 16).rotateZ(Math.PI / 2);

/** The vehicle model file, a CC0 SUV from Kenney's Car Kit (front towards +Z, wheels named wheel-*). */
const MODEL = 'models/vehicle-suv.glb';
/** The SUV is 2.5 m long; the jeep's hull radius is 1.5, so the model is drawn a bit bigger. */
const MODEL_SCALE = 1.35;

/** Loads the vehicle model; null (and the box jeep) when it is missing. */
export async function loadVehicleModel(): Promise<THREE.Object3D | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + MODEL);
    gltf.scene.scale.setScalar(MODEL_SCALE);
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    return gltf.scene;
  } catch (err) {
    console.warn(`Could not load "${MODEL}", using the box jeep`, err);
    return null;
  }
}

/** A copy of the loaded model with the mounted gun a jeep carries; its wheels spin when driving. */
function jeepFromModel(model: THREE.Object3D): { object: THREE.Group; wheels: THREE.Object3D[] } {
  const object = new THREE.Group();
  const body = model.clone(true);
  object.add(body);
  const wheels: THREE.Object3D[] = [];
  body.traverse((o) => {
    if (o.name.startsWith('wheel')) wheels.push(o);
  });
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.1), DARK);
  gun.position.set(0, 1.75, -0.2);
  gun.castShadow = true;
  object.add(gun);
  return { object, wheels };
}

/**
 * A military jeep built from boxes and cylinders (there is no vehicle model yet), facing +Z with
 * its origin on the ground. The `wheels` spin when it drives.
 */
export function createJeep(model?: THREE.Object3D | null): {
  object: THREE.Group;
  wheels: THREE.Object3D[];
} {
  if (model) return jeepFromModel(model);
  const object = new THREE.Group();
  const add = (mesh: THREE.Mesh, x: number, y: number, z: number) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    object.add(mesh);
    return mesh;
  };
  add(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 3.8), BODY), 0, 0.75, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.7), BODY), 0, 1.4, -0.3);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.45, 0.06), GLASS), 0, 1.5, 0.58);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.12, 0.5), DARK), 0, 0.5, 2.0);
  // A mounted gun on the back, as passengers shoot from a jeep.
  add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.1), DARK), 0, 1.95, -0.1);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), DARK), 0, 1.7, -0.8);
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [
    [-1.0, 1.25],
    [1.0, 1.25],
    [-1.0, -1.25],
    [1.0, -1.25],
  ] as const) {
    wheels.push(add(new THREE.Mesh(WHEEL, DARK), x, 0.42, z));
  }
  return { object, wheels };
}

const HULL = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.7 });
const HULL_DARK = new THREE.MeshStandardMaterial({ color: 0x39452d, roughness: 0.75 });
const BLADE = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.6 });

/** A spinning part: it turns about `axis` by the rotor speed times `speed` (negative turns the other way). */
export interface Rotor {
  group: THREE.Object3D;
  axis: 'x' | 'y';
  speed: number;
}

/** What an aircraft builder hands back: the whole machine and the parts the renderer moves. */
export interface HelicopterParts {
  object: THREE.Group;
  /** Pitched forward and banked as it flies; holds every visible part. */
  tilt: THREE.Group;
  rotors: Rotor[];
  /** Pods that swing from pointing up (hover) to pointing forward (fast flight): the V-22's. */
  nacelles: THREE.Object3D[];
  /** Height (metres) above the origin where the health bar floats. */
  height: number;
}

/** Shared bits of every builder: a group with a `tilt` child and an `add` that places meshes. */
function newAircraft(): {
  parts: HelicopterParts;
  add: (mesh: THREE.Mesh, x: number, y: number, z: number, parent?: THREE.Object3D) => THREE.Mesh;
} {
  const object = new THREE.Group();
  const tilt = new THREE.Group();
  object.add(tilt);
  const add = (
    mesh: THREE.Mesh,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = tilt,
  ): THREE.Mesh => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  return { parts: { object, tilt, rotors: [], nacelles: [], height: 4.6 }, add };
}

/** A rotor of `blades` thin blades of the given length, seen from above, at (x, y, z). */
function bladeDisc(
  parts: HelicopterParts,
  at: THREE.Vector3,
  length: number,
  blades: number,
  speed: number,
  parent: THREE.Object3D = parts.tilt,
): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(at);
  if (blades % 2 === 0) {
    // An even count is full-length bars through the hub (2 blades = 1 bar).
    for (let i = 0; i < blades / 2; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(length, 0.05, 0.36), BLADE);
      bar.rotation.y = (i * Math.PI) / (blades / 2);
      bar.castShadow = true;
      group.add(bar);
    }
  } else {
    // An odd count is half-length blades spread round the hub.
    for (let i = 0; i < blades; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = (i * 2 * Math.PI) / blades;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(length / 2, 0.05, 0.4), BLADE);
      blade.position.x = length / 4;
      blade.castShadow = true;
      arm.add(blade);
      group.add(arm);
    }
  }
  parent.add(group);
  parts.rotors.push({ group, axis: 'y', speed });
  return group;
}

/** A small crossed tail rotor turning about X, at (x, y, z). */
function tailRotor(parts: HelicopterParts, x: number, y: number, z: number): void {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  for (const turn of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, 0.12), BLADE);
    blade.rotation.x = turn;
    group.add(blade);
  }
  parts.tilt.add(group);
  parts.rotors.push({ group, axis: 'x', speed: 1.6 });
}

/**
 * A generic helicopter built from primitives, facing +Z with the skids on the ground at the
 * origin: egg fuselage, glass nose, tail boom, door guns, a four-bladed main rotor.
 */
export function createHelicopter(): HelicopterParts {
  const { parts, add } = newAircraft();
  const body = add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), HULL), 0, 1.9, 0);
  body.scale.set(1.1, 1.05, 2.3);
  const glass = add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), GLASS), 0, 2.05, 1.35);
  glass.scale.set(0.9, 0.8, 1.0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 4.2), HULL), 0, 2.25, -3.4);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.8), HULL), 0, 2.85, -5.3);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.5), HULL), 0, 2.4, -5.0);
  for (const x of [-1.05, 1.05]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.4), DARK), x, 0.1, 0.2);
    for (const z of [-0.7, 1.0]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), DARK), x * 0.92, 0.55, z);
    }
  }
  for (const x of [-1.15, 1.15]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.9), DARK), x, 1.6, 0.4);
  }
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 8), DARK), 0, 3.25, 0);
  bladeDisc(parts, new THREE.Vector3(0, 3.65, 0), 9, 4, 1);
  tailRotor(parts, 0.12, 2.95, -5.3);
  return parts;
}

/**
 * The UH-1 Huey: a boxy cabin with a bubble nose and open sides, a long tapering tail boom, a
 * long two-bladed main rotor with a stabiliser bar, and low skids.
 */
export function createHuey(): HelicopterParts {
  const { parts, add } = newAircraft();
  add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.7, 3.0), HULL), 0, 1.75, -0.2);
  const nose = add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), GLASS), 0, 1.7, 1.45);
  nose.scale.set(1.0, 0.85, 1.05);
  // Open cabin sides: dark sliding doors pushed back, with a gun on each.
  for (const x of [-1.07, 1.07]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 1.4), HULL_DARK), x, 1.8, -0.6);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.9), DARK), x * 1.05, 1.5, 0.3);
  }
  // Tail boom tapering with two boxes, a fin and a stabiliser.
  add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 2.4), HULL), 0, 2.15, -2.9);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 2.6), HULL), 0, 2.3, -5.1);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.9), HULL), 0, 3.0, -6.2);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.5), HULL), 0, 2.45, -5.3);
  // Skids, wide and low.
  for (const x of [-1.2, 1.2]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.6), DARK), x, 0.1, 0.1);
    for (const z of [-0.8, 0.9]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), DARK), x * 0.9, 0.5, z);
    }
  }
  // Main rotor: a thick mast, a stabiliser bar and two long blades.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 8), DARK), 0, 2.95, -0.2);
  const rotor = bladeDisc(parts, new THREE.Vector3(0, 3.4, -0.2), 11.5, 2, 1);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 2.2), DARK);
  rotor.add(bar);
  tailRotor(parts, 0.2, 3.2, -6.3);
  parts.height = 4.9;
  return parts;
}

/**
 * The CH-47 Chinook: a long boxy fuselage with a rear ramp, two big three-bladed rotors turning
 * in opposite directions (one over the nose on a short mast, one high on a rear pylon) and
 * fixed wheel pods; no tail rotor.
 */
export function createChinook(): HelicopterParts {
  const { parts, add } = newAircraft();
  add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 8.6), HULL), 0, 2.1, -0.4);
  const nose = add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), HULL), 0, 2.2, 3.9);
  nose.scale.set(1.2, 1.05, 1.2);
  const cockpit = add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 0.1), GLASS), 0, 2.75, 4.95);
  cockpit.rotation.x = -0.3;
  // The rear ramp, slightly lowered, and the upswept tail.
  const ramp = add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 1.6), HULL_DARK), 0, 1.15, -5.5);
  ramp.rotation.x = 0.25;
  add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.0), HULL), 0, 2.7, -5.2).rotation.x = -0.3;
  // Rear pylon holding the aft rotor high.
  add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.6, 1.8), HULL), 0, 4.4, -5.6);
  // Wheel pods on both sides, front and rear.
  for (const x of [-1.5, 1.5]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 3.8), HULL_DARK), x, 1.0, -0.6);
    for (const z of [1.8, -2.8]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12), DARK);
      wheel.rotation.z = Math.PI / 2;
      add(wheel, x, 0.4, z);
    }
  }
  // Door guns on the cabin sides.
  for (const x of [-1.25, 1.25]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.0), DARK), x, 2.2, 1.6);
  }
  // Two rotors, opposite directions.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.9, 8), DARK), 0, 3.6, 2.6);
  bladeDisc(parts, new THREE.Vector3(0, 4.1, 2.6), 9.6, 3, 1);
  bladeDisc(parts, new THREE.Vector3(0, 5.85, -5.6), 9.6, 3, -1);
  parts.height = 6.9;
  return parts;
}

/**
 * The V-22 Osprey: a fuselage with a high T-tail, a straight wing and a big three-bladed rotor
 * in a pod at each wingtip. The pods point up to hover and swing forward as it gains speed.
 */
export function createOsprey(): HelicopterParts {
  const { parts, add } = newAircraft();
  add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.0, 8.2), HULL), 0, 2.3, 0);
  const nose = add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), HULL), 0, 2.4, 4.0);
  nose.scale.set(1.05, 1.0, 1.3);
  const cockpit = add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 0.1), GLASS), 0, 2.95, 5.0);
  cockpit.rotation.x = -0.35;
  // Tail: upswept rear, a fin and a high stabiliser (the T).
  add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 2.8), HULL), 0, 2.9, -4.9).rotation.x = -0.2;
  add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 1.6), HULL), 0, 4.4, -5.7);
  add(new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.12, 0.9), HULL), 0, 5.6, -5.8);
  for (const x of [-2.4, 2.4]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.9), HULL_DARK), x, 5.2, -5.8);
  }
  // Wing over the cabin.
  add(new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.25, 2.0), HULL), 0, 3.5, 0.5);
  // Landing gear.
  for (const [x, z] of [
    [-1.1, 2.4],
    [1.1, 2.4],
    [0, -3.2],
  ] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12), DARK);
    wheel.rotation.z = Math.PI / 2;
    add(wheel, x, 0.38, z);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), DARK), x, 0.9, z);
  }
  // A pod at each wingtip: engine and rotor hub turn together about the X axis.
  for (const side of [-1, 1]) {
    const nacelle = new THREE.Group();
    nacelle.position.set(side * 5.6, 3.6, 0.5);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 2.2, 12), HULL_DARK);
    engine.position.y = 0.5;
    engine.castShadow = true;
    nacelle.add(engine);
    bladeDisc(parts, new THREE.Vector3(0, 1.7, 0), 6.2, 3, side, nacelle);
    parts.tilt.add(nacelle);
    parts.nacelles.push(nacelle);
  }
  parts.height = 7.2;
  return parts;
}

/** The builder for an aircraft type id; the plain helicopter for any id without its own model. */
export function createAircraft(type: string): HelicopterParts {
  if (type === 'huey') return createHuey();
  if (type === 'chinook') return createChinook();
  if (type === 'v22') return createOsprey();
  return createHelicopter();
}

/** A soft dark disc on the ground under an aircraft; it grows and fades with the height. */
export function createGroundShadow(radius = 2.6): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  mesh.renderOrder = 1;
  return mesh;
}
