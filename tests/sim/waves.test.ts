import { describe, expect, it } from 'vitest';
import { idle, makeGame, run } from './helpers';

const waves = { intermission: 1, baseCount: 3, countPerWave: 2, spawnInterval: 0.5, maxAlive: 100 };

describe('wave spawner', () => {
  it('waits for the intermission before wave 1', () => {
    const { state, config } = makeGame({ waves });
    run(state, config, idle, 0.9);
    expect(state.wave).toBe(0);
    expect(state.zombies).toHaveLength(0);
    const events = run(state, config, idle, 0.2);
    expect(state.wave).toBe(1);
    expect(events).toContainEqual({ type: 'waveStarted', wave: 1 });
  });

  it('spawns zombies one at a time until the wave is complete', () => {
    const { state, config } = makeGame({ waves });
    run(state, config, idle, 1.1);
    expect(state.zombies).toHaveLength(1);
    run(state, config, idle, 3);
    expect(state.zombies).toHaveLength(config.waves.baseCount);
  });

  it('spawns at the arena edge', () => {
    const { state, config } = makeGame({ waves });
    while (state.zombies.length === 0) run(state, config, idle, 1 / 60);
    // The zombie already took its first chase step in the tick it spawned.
    const oneStep = config.zombie.speed / 60;
    const { x, z } = state.zombies[0]!.pos;
    expect(Math.max(Math.abs(x), Math.abs(z))).toBeGreaterThan(
      config.arena.halfSize - config.zombie.radius - oneStep - 1e-6,
    );
  });

  it('respects maxAlive', () => {
    const { state, config } = makeGame({ waves: { ...waves, baseCount: 6, maxAlive: 2 } });
    run(state, config, idle, 5);
    expect(state.zombies).toHaveLength(2);
    expect(state.spawner.toSpawn).toBe(4);
  });

  it('starts a larger wave after the previous one is cleared', () => {
    const { state, config } = makeGame({ waves });
    run(state, config, idle, 4);
    expect(state.spawner.toSpawn).toBe(0);
    state.zombies.length = 0;
    const events = run(state, config, idle, 1.2);
    expect(state.wave).toBe(2);
    expect(events).toContainEqual({ type: 'waveStarted', wave: 2 });
    expect(state.spawner.toSpawn + state.zombies.length).toBe(
      config.waves.baseCount + config.waves.countPerWave,
    );
  });

  it('does not clear the wave while zombies are still alive', () => {
    const { state, config } = makeGame({ waves });
    run(state, config, idle, 4);
    run(state, config, idle, 2);
    expect(state.wave).toBe(1);
  });
});
