import * as THREE from 'three';
import { shipOutline, type ShipShape } from '../sim';

const mat = (color: number, roughness = 0.8, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const HULL_GREY = mat(0x6d7781, 0.7, 0.2);
const HULL_RED = mat(0x5b2a26, 0.9);
const DECK = mat(0x4a5057, 0.95);
const DECK_DARK = mat(0x33383d, 0.95);
const SUPER = mat(0x8a939b, 0.7, 0.2);
const WHITE = mat(0xe8eaec, 0.8);
const YELLOW = mat(0xd9b72a, 0.8);
const BLACK = mat(0x1a1d20, 0.8);
const GLASS_SHIP = new THREE.MeshStandardMaterial({
  color: 0x6f95ad,
  roughness: 0.2,
  metalness: 0.4,
});
const JET_GREY = mat(0x7b8590, 0.6, 0.3);
const BOAT_WHITE = mat(0xdfe3e6, 0.6);
const BOAT_BLUE = mat(0x2d5f8a, 0.7);

/** Where the carrier's landing rings are: metres from the stern along the keel, and across. */
export const CARRIER_PAD_Z = [24, 42, 60];
export const CARRIER_PAD_X = -5;
/** The island tower: metres in from the right edge, and along the keel from the middle. */
export const CARRIER_TOWER_INSET = 4;
export const CARRIER_TOWER_Z = 12;

/** A ship part: the mesh, placed (x, y, z), shadowed. */
function put(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** The hull outline extruded from `bottom` up to `top` (heights above the water). */
function hullSlab(ship: ShipShape, bottom: number, top: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(shipOutline(ship, 0).map((p) => new THREE.Vector2(p.x, -p.z)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false });
  // Shape y becomes -z and the extrusion becomes up.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom, 0);
  return geometry;
}

/** The flat top of the hull (the deck), drawn a hair above `height`. */
function deckPlate(ship: ShipShape, height: number): THREE.Mesh {
  const shape = new THREE.Shape(shipOutline(ship, 0.4).map((p) => new THREE.Vector2(p.x, -p.z)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, DECK);
  mesh.position.y = height + 0.04;
  mesh.receiveShadow = true;
  return mesh;
}

/** A flat marking lying on the deck at (x, z). */
function mark(
  parent: THREE.Object3D,
  material: THREE.Material,
  deck: number,
  x: number,
  z: number,
  geometry: THREE.BufferGeometry,
  turn = 0,
): void {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, deck + 0.07, z);
  mesh.rotation.y = turn;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

/** A small fighter parked on a deck, nose towards +z. */
function jet(): THREE.Group {
  const group = new THREE.Group();
  put(group, box(1.5, 1.1, 9), JET_GREY, 0, 0.9, 0);
  const nose = put(group, new THREE.ConeGeometry(0.75, 3, 10), JET_GREY, 0, 0.9, 6);
  nose.rotation.x = Math.PI / 2;
  put(group, box(0.9, 0.5, 2), GLASS_SHIP, 0, 1.6, 1.8);
  put(group, box(9, 0.15, 3.4), JET_GREY, 0, 0.8, -1);
  put(group, box(3.6, 0.12, 1.6), JET_GREY, 0, 0.9, -4.2);
  for (const x of [-0.6, 0.6]) put(group, box(0.1, 1.5, 1.5), JET_GREY, x, 1.7, -4);
  return group;
}

/** The carrier's island: the tower on the starboard edge of the deck with its mast and radar. */
function carrierTower(parent: THREE.Object3D, deck: number, x: number, z: number): void {
  const tower = new THREE.Group();
  tower.position.set(x, deck, z);
  put(tower, box(8, 9, 14), SUPER, 0, 4.5, 0);
  put(tower, box(6.6, 5, 10.5), SUPER, -0.4, 11.5, 0);
  put(tower, box(6.9, 1.5, 10.8), GLASS_SHIP, -0.4, 12.4, 0);
  put(tower, box(4, 3, 6), SUPER, -0.4, 15.5, 0);
  put(tower, new THREE.CylinderGeometry(0.25, 0.3, 9, 8), BLACK, 0, 21, 0);
  const dish = put(tower, new THREE.CylinderGeometry(2.6, 2.6, 0.2, 18), SUPER, 0, 24, 0);
  dish.rotation.z = 0.5;
  put(tower, box(0.2, 5, 0.2), BLACK, 2.2, 19, 3);
  put(tower, box(2.5, 2.5, 2.5), BLACK, 1.5, 11, -6.6);
  parent.add(tower);
}

/**
 * A huge aircraft carrier: grey hull over a red waterline band, a dark flight deck with a centre
 * line, an angled landing line, landing rings (`pads`), catapult slots, a lift, parked fighters
 * and the island tower at the right edge. Origin at the middle of the hull on the water.
 */
export function createCarrier(ship: ShipShape): THREE.Group {
  const group = new THREE.Group();
  const deck = ship.deck;
  const half = ship.length / 2;
  const wide = ship.width / 2;

  put(group, hullSlab(ship, -7, -1.2), HULL_RED, 0, 0, 0);
  put(group, hullSlab(ship, -1.2, deck), HULL_GREY, 0, 0, 0);
  group.add(deckPlate(ship, deck));

  // Centre line dashes and the angled landing line.
  for (let z = -half + 12; z < half - ship.bow * 0.6; z += 9) {
    mark(group, YELLOW, deck, 0, z, new THREE.PlaneGeometry(0.5, 4.5).rotateX(-Math.PI / 2));
  }
  mark(
    group,
    WHITE,
    deck,
    -wide * 0.38,
    -half * 0.12,
    new THREE.PlaneGeometry(0.6, half * 1.3).rotateX(-Math.PI / 2),
    -0.17,
  );
  // Landing rings for the helicopters, and an 'H' bar in each.
  for (const z of CARRIER_PAD_Z.map((k) => -half + k)) {
    mark(
      group,
      WHITE,
      deck,
      CARRIER_PAD_X,
      z,
      new THREE.RingGeometry(3.3, 3.7, 28).rotateX(-Math.PI / 2),
    );
    mark(
      group,
      WHITE,
      deck,
      CARRIER_PAD_X,
      z,
      new THREE.PlaneGeometry(0.5, 3).rotateX(-Math.PI / 2),
    );
    mark(
      group,
      WHITE,
      deck,
      CARRIER_PAD_X - 0.9,
      z,
      new THREE.PlaneGeometry(0.4, 3).rotateX(-Math.PI / 2),
    );
    mark(
      group,
      WHITE,
      deck,
      CARRIER_PAD_X + 0.9,
      z,
      new THREE.PlaneGeometry(0.4, 3).rotateX(-Math.PI / 2),
    );
  }
  // Catapult slots near the bow and a lift on the port side.
  for (const x of [-4, 4]) {
    mark(
      group,
      BLACK,
      deck,
      x,
      half - ship.bow - 8,
      new THREE.PlaneGeometry(0.5, 30).rotateX(-Math.PI / 2),
    );
  }
  mark(group, DECK_DARK, deck, -wide + 6, -8, new THREE.PlaneGeometry(8, 16).rotateX(-Math.PI / 2));

  carrierTower(group, deck, wide - CARRIER_TOWER_INSET, CARRIER_TOWER_Z);

  // Fighters parked in a loose row on the port side, forward of the lift.
  for (let i = 0; i < 5; i++) {
    const plane = jet();
    plane.position.set(-wide + 5 + (i % 2) * 1.5, deck, 14 + i * 13);
    plane.rotation.y = 0.15 * (i % 3) - 0.1;
    group.add(plane);
  }
  return group;
}

/** A frigate: a slim grey warship with a bow gun, a bridge, a funnel, a mast and an aft helipad. */
export function createFrigate(ship: ShipShape): THREE.Group {
  const group = new THREE.Group();
  const deck = ship.deck;
  const half = ship.length / 2;
  put(group, hullSlab(ship, -4, -0.8), HULL_RED, 0, 0, 0);
  put(group, hullSlab(ship, -0.8, deck), mat(0x7f8890, 0.7, 0.2), 0, 0, 0);
  group.add(deckPlate(ship, deck));

  // Bow gun.
  put(group, new THREE.CylinderGeometry(1.3, 1.5, 1.2, 14), SUPER, 0, deck + 0.6, half - 14);
  put(group, box(0.3, 0.3, 4.2), BLACK, 0, deck + 1.4, half - 11.8);
  // Bridge and its upper deck, a mast and a radar plate.
  put(group, box(6.2, 4, 9), SUPER, 0, deck + 2, 6);
  put(group, box(6.3, 1, 9.1), GLASS_SHIP, 0, deck + 3.2, 6);
  put(group, box(4.4, 2.4, 5), SUPER, 0, deck + 5.2, 5);
  put(group, box(0.35, 9, 0.35), BLACK, 0, deck + 10, 5);
  put(group, box(3, 0.2, 1.4), BLACK, 0, deck + 12.5, 5);
  // Funnel, missile boxes and the aft hangar with a landing ring.
  put(group, box(3.4, 3.6, 3.6), mat(0x565d64, 0.8), 0, deck + 5.5, -4);
  for (const x of [-2.4, 2.4]) put(group, box(1.6, 1.1, 5), BLACK, x, deck + 0.55, 14);
  put(group, box(6, 3.6, 6.5), SUPER, 0, deck + 1.8, -half + 17);
  mark(
    group,
    WHITE,
    deck,
    0,
    -half + 8.5,
    new THREE.RingGeometry(2.4, 2.7, 24).rotateX(-Math.PI / 2),
  );
  mark(group, WHITE, deck, 0, -half + 8.5, new THREE.PlaneGeometry(0.4, 2.6).rotateX(-Math.PI / 2));
  // The hull number on the bow.
  mark(group, WHITE, deck, 0, half - 22, new THREE.PlaneGeometry(1.2, 3).rotateX(-Math.PI / 2));
  return group;
}

/** A speedboat: a white hull with a blue band, a windscreen, a console, seats, a gun and an outboard. */
export function createSpeedboat(ship: ShipShape): THREE.Group {
  const group = new THREE.Group();
  const deck = ship.deck;
  put(group, hullSlab(ship, -0.45, 0.1), BOAT_BLUE, 0, 0, 0);
  put(group, hullSlab(ship, 0.1, deck), BOAT_WHITE, 0, 0, 0);
  group.add(deckPlate(ship, deck));
  const screen = put(group, box(1.9, 0.7, 0.08), GLASS_SHIP, 0, deck + 0.45, 0.9);
  screen.rotation.x = -0.45;
  put(group, box(1.7, 0.7, 0.8), BOAT_WHITE, 0, deck + 0.25, 0.5);
  for (const z of [-0.6, -1.5]) put(group, box(1.6, 0.35, 0.6), BLACK, 0, deck + 0.18, z);
  // A pintle gun, as passengers shoot from a boat.
  put(group, box(0.1, 0.1, 0.9), BLACK, 0, deck + 1.0, -0.3);
  put(group, box(0.12, 0.7, 0.12), BLACK, 0, deck + 0.6, -0.5);
  // Outboard motor over the transom.
  put(group, box(0.5, 0.9, 0.5), BLACK, 0, deck - 0.1, -ship.length / 2 - 0.25);
  return group;
}

/** The ship model for a vehicle type that has a hull outline. */
export function createShip(type: string, ship: ShipShape): THREE.Group {
  if (type === 'carrier') return createCarrier(ship);
  if (type === 'frigate') return createFrigate(ship);
  return createSpeedboat(ship);
}
