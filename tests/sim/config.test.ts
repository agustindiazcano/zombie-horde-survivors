import { describe, expect, it } from 'vitest';
import data from '../../data/game.json';
import { parseConfig } from '../../src/sim';

describe('game config schema', () => {
  it('accepts data/game.json', () => {
    const config = parseConfig(data);
    expect(config.zombie.speed).toBeGreaterThan(0);
    expect(config.arena.obstacles.length).toBeGreaterThan(0);
  });

  it('rejects a non-positive zombie speed', () => {
    const bad = { ...data, zombie: { ...data.zombie, speed: -1 } };
    expect(() => parseConfig(bad)).toThrow();
  });

  it('rejects a missing section', () => {
    const { weapon: _weapon, ...bad } = data;
    expect(() => parseConfig(bad)).toThrow();
  });

  it('rejects unknown keys (typos in the data files)', () => {
    const bad = { ...data, weapon: { ...data.weapon, fireRat: 3 } };
    expect(() => parseConfig(bad)).toThrow();
  });
});
