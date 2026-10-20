import { describe, expect, it } from 'vitest';
import { spawnZombie } from '../../src/sim';
import { idle, makeGame, run } from './helpers';

describe('zombie AI', () => {
  it('chases the player at zombie speed', () => {
    const { state, config } = makeGame();
    const z = spawnZombie(state, config, { x: 10, z: 0 });
    run(state, config, idle, 1);
    expect(z.pos.x).toBeCloseTo(10 - config.zombie.speed, 3);
    expect(z.state).toBe('walk');
  });

  it('stops and attacks within attack range', () => {
    const { state, config } = makeGame();
    const z = spawnZombie(state, config, { x: 0.9, z: 0 });
    run(state, config, idle, 0.1);
    expect(z.state).toBe('attack');
    expect(z.pos.x).toBeCloseTo(0.9);
  });

  it('deals damage once per attack cooldown', () => {
    const { state, config } = makeGame();
    spawnZombie(state, config, { x: 0.9, z: 0 });
    run(state, config, idle, 0.9);
    expect(state.soldiers[0]!.health).toBe(config.player.maxHealth);
    run(state, config, idle, 0.2);
    expect(state.soldiers[0]!.health).toBe(config.player.maxHealth - config.zombie.damage);
    run(state, config, idle, 1);
    expect(state.soldiers[0]!.health).toBe(config.player.maxHealth - 2 * config.zombie.damage);
  });

  it('resumes walking when the player steps out of range', () => {
    const { state, config } = makeGame();
    const z = spawnZombie(state, config, { x: 0.9, z: 0 });
    run(state, config, idle, 0.1);
    run(state, config, { ...idle, move: { x: -1, z: 0 } }, 0.5);
    expect(z.state).toBe('walk');
  });

  it('plays death, then is removed after the death duration', () => {
    // No corpses kept, so the body goes as soon as the animation ends.
    const { state, config } = makeGame({ zombie: { health: 25, maxCorpses: 0 } });
    spawnZombie(state, config, { x: 0, z: 5 });
    run(state, config, { ...idle, firing: true }, 0.1);
    run(state, config, idle, config.zombie.deathDuration - 0.3);
    expect(state.zombies).toHaveLength(1);
    expect(state.zombies[0]?.state).toBe('death');
    run(state, config, idle, 0.5);
    expect(state.zombies).toHaveLength(0);
  });

  it('a dying zombie neither moves nor attacks', () => {
    const { state, config } = makeGame({ zombie: { health: 25 } });
    const z = spawnZombie(state, config, { x: 0, z: 0.9 });
    run(state, config, { ...idle, firing: true }, 1 / 60);
    const at = { ...z.pos };
    run(state, config, idle, 1);
    expect(state.soldiers[0]!.health).toBe(config.player.maxHealth);
    expect(z.pos).toEqual(at);
  });
});
