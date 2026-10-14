import { describe, expect, it } from 'vitest';
import { rayAabb, rayCircle, resolveCircleAabb } from '../../src/sim';

const box = { x: 0, z: 5, halfW: 1, halfD: 1 };

describe('rayCircle', () => {
  it('returns the distance to the near surface', () => {
    const t = rayCircle({ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 0, z: 5 }, 1);
    expect(t).toBeCloseTo(4);
  });
  it('misses when off-axis', () => {
    expect(rayCircle({ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 3, z: 5 }, 1)).toBeNull();
  });
  it('ignores circles behind the origin', () => {
    expect(rayCircle({ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -5 }, 1)).toBeNull();
  });
});

describe('rayAabb', () => {
  it('returns the distance to the near face', () => {
    expect(rayAabb({ x: 0, z: 0 }, { x: 0, z: 1 }, box)).toBeCloseTo(4);
  });
  it('misses when off-axis', () => {
    expect(rayAabb({ x: 3, z: 0 }, { x: 0, z: 1 }, box)).toBeNull();
  });
  it('ignores boxes behind the origin', () => {
    expect(rayAabb({ x: 0, z: 0 }, { x: 0, z: -1 }, box)).toBeNull();
  });
});

describe('resolveCircleAabb', () => {
  it('pushes a penetrating circle out along the contact normal', () => {
    const pos = { x: 0, z: 3.8 };
    resolveCircleAabb(pos, 0.4, box);
    expect(pos.z).toBeCloseTo(3.6);
    expect(pos.x).toBeCloseTo(0);
  });
  it('leaves a non-overlapping circle alone', () => {
    const pos = { x: 0, z: 3 };
    resolveCircleAabb(pos, 0.4, box);
    expect(pos).toEqual({ x: 0, z: 3 });
  });
  it('ejects a circle whose centre is inside the box', () => {
    const pos = { x: 0.1, z: 4.2 };
    resolveCircleAabb(pos, 0.4, box);
    expect(pos.z).toBeCloseTo(3.6);
  });
});
