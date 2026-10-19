import { describe, expect, it } from 'vitest';
import data from '../../data/game.json';
import map1 from '../../data/maps/map-1.json';
import items from '../../data/items.json';
import units from '../../data/units.json';
import { parseConfig as parse, parseMap } from '../../src/sim';

const parseConfig = (raw: unknown) => parse(raw, parseMap(map1), units, items);

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
    const bad: Record<string, unknown> = { ...data };
    delete bad.zombie;
    expect(() => parseConfig(bad)).toThrow();
  });

  it('rejects unknown keys (typos in the data files)', () => {
    const bad = { ...data, zombie: { ...data.zombie, speedd: 3 } };
    expect(() => parseConfig(bad)).toThrow();
  });
});
