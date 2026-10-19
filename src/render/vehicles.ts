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
