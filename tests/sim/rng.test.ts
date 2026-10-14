import { describe, expect, it } from 'vitest';
import { createRng, nextFloat } from '../../src/sim';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([nextFloat(a), nextFloat(a), nextFloat(a)]).toEqual([
      nextFloat(b),
      nextFloat(b),
      nextFloat(b),
    ]);
  });

  it('differs between seeds and stays in [0, 1)', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(nextFloat(a)).not.toBe(nextFloat(b));
    for (let i = 0; i < 1000; i++) {
      const v = nextFloat(a);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
