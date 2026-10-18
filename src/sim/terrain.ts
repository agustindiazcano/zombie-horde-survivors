import type { Obstacle } from './config';

/** The height grid has one vertex per metre: `heights[row][col]` is at x = col - half, z = row - half. */
export type HeightGrid = number[][];

/** Ground height (metres) at a point, bilinear between the four nearest grid vertices. */
export function heightAt(
  heights: HeightGrid | null,
  halfSize: number,
  x: number,
  z: number,
): number {
  const last = (heights?.length ?? 0) - 1;
  if (!heights || last < 1) return 0;
  const gx = Math.min(Math.max(x + halfSize, 0), last);
  const gz = Math.min(Math.max(z + halfSize, 0), last);
  const ix = Math.min(Math.floor(gx), last - 1);
  const iz = Math.min(Math.floor(gz), last - 1);
  const fx = gx - ix;
  const fz = gz - iz;
  const row0 = heights[iz]!;
  const row1 = heights[iz + 1]!;
  const top = row0[ix]! * (1 - fx) + row0[ix + 1]! * fx;
  const bottom = row1[ix]! * (1 - fx) + row1[ix + 1]! * fx;
  return top * (1 - fz) + bottom * fz;
}

/**
 * Blocking boxes for the ground that lies under the water level: a cell is wet when the average
 * of its four corners is below `level`. Wet cells are merged into as few boxes as possible.
 * Water stops walkers but not bullets (the boxes are flagged `water`).
 */
export function waterObstacles(
  heights: HeightGrid | null,
  level: number | null,
  halfSize: number,
): Obstacle[] {
  const cells = (heights?.length ?? 0) - 1;
  if (!heights || level === null || cells < 1) return [];
  interface Run {
    from: number;
    to: number;
    z0: number;
    z1: number;
  }
  const done: Run[] = [];
  let open = new Map<string, Run>();
  for (let row = 0; row < cells; row++) {
    const next = new Map<string, Run>();
    let col = 0;
    while (col < cells) {
      const wet = (c: number) =>
        (heights[row]![c]! +
          heights[row]![c + 1]! +
          heights[row + 1]![c]! +
          heights[row + 1]![c + 1]!) /
          4 <
        level;
      if (!wet(col)) {
        col++;
        continue;
      }
      const from = col;
      while (col < cells && wet(col)) col++;
      const key = `${from}-${col}`;
      // The same span in the row above grows that box downwards.
      const run = open.get(key) ?? { from, to: col, z0: row, z1: row };
      run.z1 = row + 1;
      next.set(key, run);
      open.delete(key);
    }
    done.push(...open.values());
    open = next;
  }
  done.push(...open.values());
  return done.map((r) => ({
    x: (r.from + r.to) / 2 - halfSize,
    z: (r.z0 + r.z1) / 2 - halfSize,
    halfW: (r.to - r.from) / 2,
    halfD: (r.z1 - r.z0) / 2,
    water: true,
  }));
}
