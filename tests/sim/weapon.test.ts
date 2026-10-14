import { describe, expect, it } from 'vitest';
import { spawnZombie } from '../../src/sim';
import { idle, makeGame, run } from './helpers';

const fire = { ...idle, aim: { x: 0, z: 10 }, firing: true };
const ONE_STEP = 1 / 60;

type Patch = Parameters<typeof makeGame>[0];

function setup(zombieZ = 5, zombieX = 0, patch: Patch = {}) {
  const game = makeGame(patch);
  const zombie = spawnZombie(game.state, game.config, { x: zombieX, z: zombieZ });
  return { ...game, zombie };
}

describe('hitscan shooting', () => {
  it('damages a zombie on the aim line', () => {
    const { state, config, zombie } = setup();
    run(state, config, fire, ONE_STEP);
    expect(zombie.health).toBe(config.zombie.health - config.weapon.damage);
  });

  it('emits a shot event ending at the zombie surface', () => {
    const { state, config, zombie } = setup();
    const events = run(state, config, fire, ONE_STEP);
    const shot = events.find((e) => e.type === 'shot');
    expect(shot).toMatchObject({ hitZombieId: zombie.id });
    if (shot?.type === 'shot') expect(shot.to.z).toBeCloseTo(5 - config.zombie.radius, 1);
  });

  it('misses a zombie off the line', () => {
    const { state, config, zombie } = setup(5, 3);
    const events = run(state, config, fire, ONE_STEP);
    expect(zombie.health).toBe(config.zombie.health);
    expect(events.find((e) => e.type === 'shot')).toMatchObject({ hitZombieId: null });
  });

  it('only hits the nearest zombie', () => {
    const { state, config, zombie } = setup(5);
    const far = spawnZombie(state, config, { x: 0, z: 8 });
    run(state, config, fire, ONE_STEP);
    expect(zombie.health).toBeLessThan(config.zombie.health);
    expect(far.health).toBe(config.zombie.health);
  });

  it('is blocked by obstacles', () => {
    const { state, config, zombie } = setup(5, 0, {
      arena: { obstacles: [{ x: 0, z: 3, halfW: 1, halfD: 0.5 }] },
    });
    const events = run(state, config, fire, ONE_STEP);
    expect(zombie.health).toBe(config.zombie.health);
    const shot = events.find((e) => e.type === 'shot');
    if (shot?.type === 'shot') expect(shot.to.z).toBeCloseTo(2.5);
  });

  it('respects weapon range', () => {
    const { state, config, zombie } = setup(5, 0, { weapon: { range: 4 } });
    run(state, config, fire, ONE_STEP);
    expect(zombie.health).toBe(config.zombie.health);
  });

  it('does not fire without the trigger', () => {
    const { state, config } = setup();
    expect(run(state, config, idle, 0.5).some((e) => e.type === 'shot')).toBe(false);
  });

  it('limits the fire rate', () => {
    const { state, config } = setup(30, 0, { weapon: { fireRate: 4 } });
    const shots = run(state, config, fire, 1).filter((e) => e.type === 'shot');
    expect(shots.length).toBeGreaterThanOrEqual(4);
    expect(shots.length).toBeLessThanOrEqual(5);
  });

  it('kills a zombie once, counting a single kill', () => {
    const { state, config, zombie } = setup(5, 0, { zombie: { health: 25 } });
    const events = run(state, config, fire, 0.5);
    expect(zombie.state).toBe('death');
    expect(state.kills).toBe(1);
    expect(events.filter((e) => e.type === 'zombieKilled')).toHaveLength(1);
  });
});
