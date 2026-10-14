import * as THREE from 'three';
import type { GameConfig } from '../sim';

const WALL_HEIGHT = 1.5;
const WALL_THICKNESS = 0.5;
const OBSTACLE_HEIGHT = 2;

/** Flat ground, a border wall and the static obstacles from the game config. */
export function buildArena(arena: GameConfig['arena']): THREE.Group {
  const group = new THREE.Group();
  const size = arena.halfSize * 2;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: 0x3a4750 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const grid = new THREE.GridHelper(size, size / 2, 0x56656f, 0x46545d);
  grid.position.y = 0.01;
  group.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36 });
  const edge = arena.halfSize + WALL_THICKNESS / 2;
  const span = size + WALL_THICKNESS * 2;
  const walls: [number, number, number, number][] = [
    [0, edge, span, WALL_THICKNESS],
    [0, -edge, span, WALL_THICKNESS],
    [edge, 0, WALL_THICKNESS, size],
    [-edge, 0, WALL_THICKNESS, size],
  ];
  for (const [x, z, w, d] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat);
    wall.position.set(x, WALL_HEIGHT / 2, z);
    wall.receiveShadow = true;
    group.add(wall);
  }

  const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x8a6d4b });
  for (const o of arena.obstacles) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(o.halfW * 2, OBSTACLE_HEIGHT, o.halfD * 2),
      obstacleMat,
    );
    box.position.set(o.x, OBSTACLE_HEIGHT / 2, o.z);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
  }

  return group;
}
