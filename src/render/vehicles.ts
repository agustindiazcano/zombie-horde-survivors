import * as THREE from 'three';

const BODY = new THREE.MeshStandardMaterial({ color: 0x5b6b3a, roughness: 0.8 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.9 });
const GLASS = new THREE.MeshStandardMaterial({ color: 0x8fb4c9, roughness: 0.2, metalness: 0.3 });
const WHEEL = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 16).rotateZ(Math.PI / 2);

/**
 * A military jeep built from boxes and cylinders (there is no vehicle model yet), facing +Z with
 * its origin on the ground. The `wheels` spin when it drives.
 */
export function createJeep(): { object: THREE.Group; wheels: THREE.Object3D[] } {
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
