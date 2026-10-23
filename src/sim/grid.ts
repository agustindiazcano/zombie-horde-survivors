import type { Arena, Obstacle } from './config';

/** Side (metres) of a grid cell. Bigger than most units, small enough to skip most of the map. */
export const CELL = 4;

const cellsAcross = (arena: Arena): number => Math.ceil((arena.halfSize * 2) / CELL) + 1;

const cellOf = (arena: Arena, n: number, v: number): number =>
  Math.min(Math.max(Math.floor((v + arena.halfSize) / CELL), 0), n - 1);

interface ObstacleIndex {
  /** The array and length it was built from; a different array or a longer / shorter one rebuilds. */
  source: Obstacle[];
  length: number;
  n: number;
  cells: Obstacle[][];
  /** Last query that visited each obstacle, to report a box that spans several cells once. */
  seen: Map<Obstacle, number>;
  query: number;
}

const indexes = new WeakMap<Obstacle[], ObstacleIndex>();
const found: Obstacle[] = [];

function indexOf(arena: Arena): ObstacleIndex {
  const cached = indexes.get(arena.obstacles);
  if (cached && cached.length === arena.obstacles.length && cached.source === arena.obstacles) {
    return cached;
  }
  const n = cellsAcross(arena);
  const cells: Obstacle[][] = Array.from({ length: n * n }, () => []);
  for (const box of arena.obstacles) {
    const x0 = cellOf(arena, n, box.x - box.halfW);
    const x1 = cellOf(arena, n, box.x + box.halfW);
    const z0 = cellOf(arena, n, box.z - box.halfD);
    const z1 = cellOf(arena, n, box.z + box.halfD);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) cells[cz * n + cx]!.push(box);
  }
  const made: ObstacleIndex = {
    source: arena.obstacles,
    length: arena.obstacles.length,
    n,
    cells,
    seen: new Map(),
    query: 0,
  };
  indexes.set(arena.obstacles, made);
  return made;
}

/**
 * The obstacles whose footprint touches the rectangle, each once. The returned array is reused by
 * the next call, so use it before querying again.
 */
export function obstaclesNear(
  arena: Arena,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): readonly Obstacle[] {
  found.length = 0;
  if (arena.obstacles.length === 0) return found;
  const index = indexOf(arena);
  const { n, cells, seen } = index;
  const stamp = ++index.query;
  const x0 = cellOf(arena, n, minX);
  const x1 = cellOf(arena, n, maxX);
  const z0 = cellOf(arena, n, minZ);
  const z1 = cellOf(arena, n, maxZ);
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      for (const box of cells[cz * n + cx]!) {
        if (seen.get(box) === stamp) continue;
        seen.set(box, stamp);
        found.push(box);
      }
    }
  }
  return found;
}
