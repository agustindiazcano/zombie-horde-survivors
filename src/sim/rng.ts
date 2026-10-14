/** Seedable mulberry32 PRNG. State is a plain object so game state stays serializable. */
export interface Rng {
  s: number;
}

export const createRng = (seed: number): Rng => ({ s: seed >>> 0 });

export function nextFloat(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
