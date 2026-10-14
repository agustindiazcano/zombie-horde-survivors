import { describe, expect, it } from 'vitest';
import { FIXED_DT, step } from '../../src/sim';
import { idle, makeGame, run } from './helpers';

describe('createGame', () => {
  it('starts with a full-health player at the origin and nothing else', () => {
    const { state, config } = makeGame();
    expect(state.soldiers[0]!.health).toBe(config.player.maxHealth);
    expect(state.soldiers[0]!.pos).toEqual({ x: 0, z: 0 });
    expect(state).toMatchObject({ wave: 0, kills: 0, status: 'playing', zombies: [] });
  });
});

describe('player movement', () => {
  it('moves at player speed', () => {
    const { state, config } = makeGame();
    run(state, config, { ...idle, move: { x: 1, z: 0 } }, 1);
    expect(state.soldiers[0]!.pos.x).toBeCloseTo(config.player.speed, 4);
    expect(state.soldiers[0]!.pos.z).toBeCloseTo(0, 6);
  });

  it('normalizes diagonal movement', () => {
    const { state, config } = makeGame();
    run(state, config, { ...idle, move: { x: 1, z: 1 } }, 1);
    const { x, z } = state.soldiers[0]!.pos;
    expect(Math.hypot(x, z)).toBeCloseTo(config.player.speed, 4);
    expect(x).toBeCloseTo(z, 6);
  });

  it('does not move without input', () => {
    const { state, config } = makeGame();
    run(state, config, idle, 1);
    expect(state.soldiers[0]!.pos).toEqual({ x: 0, z: 0 });
  });

  it('stays inside the arena', () => {
    const { state, config } = makeGame();
    run(state, config, { ...idle, move: { x: 1, z: 0 } }, 10);
    expect(state.soldiers[0]!.pos.x).toBeCloseTo(config.arena.halfSize - config.player.radius, 6);
  });

  it('is blocked by obstacles', () => {
    const { state, config } = makeGame({
      arena: { obstacles: [{ x: 3, z: 0, halfW: 1, halfD: 1 }] },
    });
    run(state, config, { ...idle, move: { x: 1, z: 0 } }, 2);
    expect(state.soldiers[0]!.pos.x).toBeLessThanOrEqual(2 - config.player.radius + 1e-6);
  });

  it('faces the aim point', () => {
    const { state, config } = makeGame();
    run(state, config, { ...idle, aim: { x: 10, z: 0 } }, 0.1);
    expect(Math.sin(state.soldiers[0]!.facing)).toBeCloseTo(1);
    expect(Math.cos(state.soldiers[0]!.facing)).toBeCloseTo(0);
  });

  it('records the previous position for interpolation', () => {
    const { state, config } = makeGame();
    const input = { ...idle, move: { x: 1, z: 0 } };
    step(state, config, input, FIXED_DT);
    const afterFirst = state.soldiers[0]!.pos.x;
    step(state, config, input, FIXED_DT);
    expect(state.soldiers[0]!.prev.x).toBeCloseTo(afterFirst);
  });
});
