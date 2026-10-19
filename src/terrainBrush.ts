import type { HeightGrid, Vec2 } from './sim';

/** What a height brush does to the vertices under it. */
export type SculptMode = 'raise' | 'lower' | 'flatten' | 'smooth';

/** A flat grid of `size + 1` vertices per side (one per metre). */
export const flatHeights = (size: number): HeightGrid =>
  Array.from({ length: size + 1 }, () => new Array<number>(size + 1).fill(0));

/** A grid of `size` x `size` cells all painted with one texture id. */
export const plainPaint = (size: number, id: string): string[][] =>
  Array.from({ length: size }, () => new Array<string>(size).fill(id));

/** 1 at the centre of the brush, easing to 0 at its edge. */
const falloff = (distance: number, radius: number): number => {
  const t = Math.max(0, 1 - distance / radius);
  return t * t * (3 - 2 * t);
};

/**
 * Returns a copy of the grid with the brush applied at `at` (world metres). `amount` is metres per
 * application for raise / lower and a 0..1 blend for flatten / smooth; `target` is the height
 * flatten pulls towards. Heights are clamped to [min, max].
 */
export function sculpt(
  heights: HeightGrid,
  halfSize: number,
  mode: SculptMode,
  at: Vec2,
  radius: number,
  amount: number,
  target: number,
  [min, max]: [number, number],
): HeightGrid {
  const last = heights.length - 1;
  const next = heights.map((row) => row.slice());
  const gx = at.x + halfSize;
  const gz = at.z + halfSize;
  const x0 = Math.max(0, Math.floor(gx - radius));
  const x1 = Math.min(last, Math.ceil(gx + radius));
  const z0 = Math.max(0, Math.floor(gz - radius));
  const z1 = Math.min(last, Math.ceil(gz + radius));
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const k = falloff(Math.hypot(x - gx, z - gz), radius);
      if (k <= 0) continue;
      const h = heights[z]![x]!;
      let value: number;
      if (mode === 'raise') value = h + amount * k;
      else if (mode === 'lower') value = h - amount * k;
      else if (mode === 'flatten') value = h + (target - h) * Math.min(1, amount * k);
      else {
        const around = [
          heights[z - 1]?.[x],
          heights[z + 1]?.[x],
          heights[z]![x - 1],
          heights[z]![x + 1],
        ].filter((v): v is number => v !== undefined);
        const mean = around.reduce((a, b) => a + b, 0) / around.length;
        value = h + (mean - h) * Math.min(1, amount * k);
      }
      next[z]![x] = Math.min(Math.max(value, min), max);
    }
  }
  return next;
}

/** Returns a copy of the paint grid with every cell whose centre is inside the brush set to `id`. */
export function paintCells(
  paint: string[][],
  halfSize: number,
  at: Vec2,
  radius: number,
  id: string,
): string[][] {
  const size = paint.length;
  const next = paint.map((row) => row.slice());
  const gx = at.x + halfSize;
  const gz = at.z + halfSize;
  for (let z = Math.max(0, Math.floor(gz - radius)); z <= Math.min(size - 1, gz + radius); z++) {
    for (let x = Math.max(0, Math.floor(gx - radius)); x <= Math.min(size - 1, gx + radius); x++) {
      if (Math.hypot(x + 0.5 - gx, z + 0.5 - gz) <= radius) next[z]![x] = id;
    }
  }
  return next;
}
