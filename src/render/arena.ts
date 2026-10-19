import * as THREE from 'three';
import { heightAt, OBSTACLE_HEIGHT, type GameConfig } from '../sim';
import { terrainData, textureColor } from '../terrainData';

const WALL_HEIGHT = 1.5;
const WALL_THICKNESS = 0.5;
/** Road strips float this far above the ground to avoid z-fighting. */
const ROAD_LIFT = 0.04;
/** Spacing (metres) of the samples along a road so it follows the hills. */
const ROAD_STEP = 1;

/** The ground (flat or a height map, painted), water, roads, a border wall and the static obstacles. */
export function buildArena(arena: GameConfig['arena']): THREE.Group {
  const group = new THREE.Group();
  const size = arena.halfSize * 2;
  const { heights, water } = arena.terrain;

  group.add(buildGround(arena));
  if (!heights) {
    const grid = new THREE.GridHelper(size, size / 2, 0x56656f, 0x46545d);
    grid.position.y = 0.01;
    group.add(grid);
  }
  if (water !== null && heights) group.add(buildWater(size, water));
  for (const road of arena.surfaces) group.add(buildRoad(arena, road));

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
    wall.position.set(x, WALL_HEIGHT / 2 + heightAt(heights, arena.halfSize, x, z), z);
    wall.receiveShadow = true;
    group.add(wall);
  }

  const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x8a6d4b });
  for (const o of arena.obstacles) {
    if (o.water) continue;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(o.halfW * 2, OBSTACLE_HEIGHT, o.halfD * 2),
      obstacleMat,
    );
    box.position.set(o.x, OBSTACLE_HEIGHT / 2 + heightAt(heights, arena.halfSize, o.x, o.z), o.z);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
  }

  return group;
}

/** A plane with one vertex per metre: raised by the height grid, coloured by the paint grid. */
function buildGround(arena: GameConfig['arena']): THREE.Mesh {
  const { heights, paint } = arena.terrain;
  const size = arena.halfSize * 2;
  const cells = heights || paint ? size : 1;
  const geometry = new THREE.PlaneGeometry(size, size, cells, cells);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const base = new THREE.Color(textureColor(terrainData.defaultTexture));
  const tint = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, heightAt(heights, arena.halfSize, x, z));
    // A vertex takes the paint of the cell it is the corner of (clamped at the far edges).
    const col = Math.min(Math.round(x + arena.halfSize), size - 1);
    const row = Math.min(Math.round(z + arena.halfSize), size - 1);
    const id = paint?.[row]?.[col];
    (id ? tint.set(textureColor(id)) : tint.copy(base)).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: !!heights }),
  );
  ground.receiveShadow = true;
  return ground;
}

function buildWater(size: number, level: number): THREE.Mesh {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({
      color: terrainData.water.color,
      transparent: true,
      opacity: terrainData.water.opacity,
      depthWrite: false,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = level;
  return water;
}

/** A flat strip along a polyline, sampled every metre so it hugs the terrain. */
function buildRoad(
  arena: GameConfig['arena'],
  road: GameConfig['arena']['surfaces'][number],
): THREE.Mesh {
  const heights = arena.terrain.heights;
  const points: { x: number; z: number }[] = [];
  for (let i = 0; i + 1 < road.path.length; i++) {
    const a = road.path[i]!;
    const b = road.path[i + 1]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / ROAD_STEP));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      points.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  points.push(road.path[road.path.length - 1]!);

  const vertices: number[] = [];
  const index: number[] = [];
  const half = road.width / 2;
  points.forEach((p, i) => {
    const prev = points[Math.max(i - 1, 0)]!;
    const next = points[Math.min(i + 1, points.length - 1)]!;
    const len = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
    // The side vector is the direction turned a quarter.
    const sx = -(next.z - prev.z) / len;
    const sz = (next.x - prev.x) / len;
    for (const side of [-1, 1]) {
      const x = p.x + sx * half * side;
      const z = p.z + sz * half * side;
      vertices.push(x, heightAt(heights, arena.halfSize, x, z) + ROAD_LIFT, z);
    }
    if (i > 0) {
      const k = i * 2;
      index.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: textureColor(road.asset), side: THREE.DoubleSide }),
  );
  mesh.receiveShadow = true;
  return mesh;
}
