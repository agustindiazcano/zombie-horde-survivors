import * as THREE from 'three';
import type { Obstacle } from '../sim';

/** Shapes for the props of a suburb: houses, trees, street lamps and parked cars. All procedural. */

const WALL_COLORS = [0xcfc6b4, 0xb9c4cc, 0xd8c3a5, 0xa9b8a0, 0xc9a9a0, 0xe0dcd0];
const ROOF_COLORS = [0x4a3a35, 0x3b4048, 0x5a4636, 0x2f3a3a];
const CAR_COLORS = [0x8a2b2b, 0x2b4a8a, 0x3a3f45, 0xb8b8b0, 0x2f6a4a];
const LEAF_COLORS = [0x2f5a2c, 0x3a6a30, 0x274d2a, 0x4a6f2a];

const WALL_HEIGHT = 3.2;
const ROOF_RISE = 1.9;
const LAMP_HEIGHT = 5;
/** Height (m) of a lamp's light, for the pool of real lights. */
export const LAMP_LIGHT_HEIGHT = 4.9;

/** A small stable number from a position, so the same map always has the same colours. */
const hash = (x: number, z: number): number => {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const pick = <T>(list: T[], h: number): T => list[Math.floor(h * list.length) % list.length]!;

const windowMaterial = new THREE.MeshStandardMaterial({
  color: 0x2a2418,
  emissive: 0xffc46b,
  emissiveIntensity: 0.9,
});
const darkWindowMaterial = new THREE.MeshStandardMaterial({ color: 0x1b2229 });
const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x4b3425 });
const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3626 });
const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.5 });
const lampHeadMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff1cf,
  emissive: 0xffd9a0,
  emissiveIntensity: 2.2,
});
const glassMaterial = new THREE.MeshStandardMaterial({
  color: 0x1d2630,
  metalness: 0.6,
  roughness: 0.2,
});
const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x14161a });

const shadowed = (mesh: THREE.Mesh): THREE.Mesh => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

/** A house filling the box `o`: walls, a pitched roof, a door toward the street and lit windows. */
export function buildHouse(o: Obstacle): THREE.Group {
  const h = hash(o.x, o.z);
  const group = new THREE.Group();
  // The box is axis-aligned, so a quarter turn swapped its sides: build in the house's own frame.
  const facing = o.facing ?? 0;
  const turned = Math.round(facing / (Math.PI / 2)) % 2 !== 0;
  const halfW = turned ? o.halfD : o.halfW;
  const halfD = turned ? o.halfW : o.halfD;
  const w = halfW * 2;
  const d = halfD * 2;
  const walls = shadowed(
    new THREE.Mesh(
      new THREE.BoxGeometry(w, WALL_HEIGHT, d),
      new THREE.MeshStandardMaterial({ color: pick(WALL_COLORS, h) }),
    ),
  );
  walls.position.y = WALL_HEIGHT / 2;
  group.add(walls);

  // The roof ridge runs along the longer side.
  const roofShape = new THREE.Shape();
  const span = Math.min(w, d) / 2 + 0.5;
  roofShape.moveTo(-span, 0);
  roofShape.lineTo(span, 0);
  roofShape.lineTo(0, ROOF_RISE);
  roofShape.closePath();
  const length = Math.max(w, d) + 1;
  const roof = shadowed(
    new THREE.Mesh(
      new THREE.ExtrudeGeometry(roofShape, { depth: length, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: pick(ROOF_COLORS, h * 7.3) }),
    ),
  );
  roof.position.y = WALL_HEIGHT;
  if (w >= d) {
    roof.rotation.y = Math.PI / 2;
    roof.position.x = -length / 2;
  } else {
    roof.position.z = -length / 2;
  }
  group.add(roof);

  // The door and windows are on the +z side of the house's frame, which is turned toward the street.
  const faceZ = halfD + 0.02;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.1, 0.08), doorMaterial);
  door.position.set((((h * 7) % 1) - 0.5) * (w * 0.4), 1.05, faceZ);
  group.add(door);
  const windows = Math.max(2, Math.floor(w / 3));
  for (let i = 0; i < windows; i++) {
    const wx = -halfW + ((i + 0.5) * w) / windows;
    if (Math.abs(wx - door.position.x) < 1.4) continue;
    const lit = hash(o.x + i, o.z) > 0.25;
    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.0, 0.08),
      lit ? windowMaterial : darkWindowMaterial,
    );
    pane.position.set(wx, 1.8, faceZ);
    group.add(pane);
  }
  group.rotation.y = facing;
  group.position.set(o.x, 0, o.z);
  return group;
}

/** A tree with a trunk and a canopy of two or three blobs, in a few shades of green. */
export function buildTree(o: Obstacle): THREE.Group {
  const h = hash(o.x, o.z);
  const group = new THREE.Group();
  const height = 3.2 + h * 2.4;
  const trunk = shadowed(
    new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, height, 7), trunkMaterial),
  );
  trunk.position.y = height / 2;
  group.add(trunk);
  const leaves = new THREE.MeshStandardMaterial({ color: pick(LEAF_COLORS, h * 3.1) });
  const blobs = 2 + Math.floor(h * 2.9);
  for (let i = 0; i < blobs; i++) {
    const r = 1.3 + hash(o.x + i, o.z - i) * 0.9;
    const blob = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaves));
    blob.position.set(
      (hash(o.x, i) - 0.5) * 1.2,
      height + i * 0.7 - 0.2,
      (hash(i, o.z) - 0.5) * 1.2,
    );
    group.add(blob);
  }
  group.position.set(o.x, 0, o.z);
  return group;
}

/** A street lamp: a pole, an arm over the road and a glowing head. */
export function buildLamp(o: Obstacle): THREE.Group {
  const group = new THREE.Group();
  const pole = shadowed(
    new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, LAMP_HEIGHT, 8), poleMaterial),
  );
  pole.position.y = LAMP_HEIGHT / 2;
  group.add(pole);
  // The arm leans toward the street, the way the lamp faces (+z in its own frame).
  const toStreet = 1;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), poleMaterial);
  arm.position.set(0, LAMP_HEIGHT, toStreet * 0.55);
  group.add(arm);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), lampHeadMaterial);
  head.position.set(0, LAMP_HEIGHT - 0.05, toStreet * 1.05);
  group.add(head);
  // A soft pool on the ground under the head, so the light reads even where no real light reaches.
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(5, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.06, toStreet * 1.05);
  group.add(pool);
  group.rotation.y = o.facing ?? 0;
  group.position.set(o.x, 0, o.z);
  return group;
}

/** A parked car: a body, a cabin and four wheels. */
export function buildCar(o: Obstacle): THREE.Group {
  const h = hash(o.x, o.z);
  const group = new THREE.Group();
  const long = o.halfW >= o.halfD;
  const length = Math.max(o.halfW, o.halfD) * 2;
  const width = Math.min(o.halfW, o.halfD) * 2;
  const paint = new THREE.MeshStandardMaterial({
    color: pick(CAR_COLORS, h),
    metalness: 0.4,
    roughness: 0.45,
  });
  const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(length, 0.65, width), paint));
  body.position.y = 0.6;
  const cabin = shadowed(
    new THREE.Mesh(new THREE.BoxGeometry(length * 0.5, 0.5, width * 0.9), glassMaterial),
  );
  cabin.position.set(-length * 0.05, 1.15, 0);
  group.add(body, cabin);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 12), tireMaterial);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(sx * length * 0.32, 0.3, sz * (width / 2));
      group.add(wheel);
    }
  }
  // The model lies along x; a car whose box is longer in z turns a quarter.
  if (!long) group.rotation.y = Math.PI / 2;
  group.position.set(o.x, 0, o.z);
  return group;
}

/** The shape for a prop asset, or null for the plain block. */
export function buildProp(o: Obstacle): THREE.Group | null {
  switch (o.asset) {
    case 'house':
      return buildHouse(o);
    case 'tree':
      return buildTree(o);
    case 'lamp':
      return buildLamp(o);
    case 'car':
      return buildCar(o);
    default:
      return null;
  }
}

/** The warm lamps' real lights are expensive, so only the few nearest the camera get one. */
const POOL = 6;
const LAMP_INTENSITY = 120;
const LAMP_RANGE = 22;

export class StreetLights {
  private lamps: { x: number; y: number; z: number }[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private clock = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < POOL; i++) {
      const light = new THREE.PointLight(0xffd29a, 0, LAMP_RANGE, 2);
      scene.add(light);
      this.lights.push(light);
    }
  }

  /** The lamps of the map: x, z and the ground height under each. */
  set(lamps: { x: number; y: number; z: number }[]): void {
    this.lamps = lamps;
    this.clock = 1;
  }

  update(camera: THREE.Vector3, dt: number): void {
    // Re-pick the nearest lamps a few times a second, not every frame.
    this.clock += dt;
    if (this.clock < 0.4) return;
    this.clock = 0;
    const nearest = [...this.lamps]
      .sort(
        (a, b) =>
          (a.x - camera.x) ** 2 +
          (a.z - camera.z) ** 2 -
          ((b.x - camera.x) ** 2 + (b.z - camera.z) ** 2),
      )
      .slice(0, POOL);
    this.lights.forEach((light, i) => {
      const lamp = nearest[i];
      light.intensity = lamp ? LAMP_INTENSITY : 0;
      if (lamp) light.position.set(lamp.x, lamp.y + LAMP_LIGHT_HEIGHT, lamp.z);
    });
  }
}
