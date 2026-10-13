import { describe, expect, it } from 'vitest';
import { FIXED_DT, spawnZombie, step } from '../../src/sim';
import { idle, makeGame, run } from './helpers';

describe('game over', () => {
  it('ends the game when health reaches zero and freezes the simulation', () => {
    const { state, config } = makeGame();
    state.player.health = 5;
    spawnZombie(state, config, { x: 0.9, z: 0 });
    const events = run(state, config, idle, 1.2);
    expect(state.status).toBe('gameover');
    expect(state.player.health).toBe(0);
    expect(events.filter((e) => e.type === 'gameOver')).toHaveLength(1);

    const time = state.time;
    step(state, config, { ...idle, move: { x: 1, z: 0 } }, FIXED_DT);
    expect(state.time).toBe(time);
    expect(state.player.pos.x).toBe(0);
    expect(state.events).toEqual([]);
  });
});

describe('determinism', () => {
  it('produces identical states for the same seed and inputs', () => {
    const waves = { intermission: 0.5, baseCount: 5, spawnInterval: 0.2 };
    const a = makeGame({ waves }, 7);
    const b = makeGame({ waves }, 7);
    const input = { ...idle, move: { x: 0.5, z: 1 }, firing: true };
    run(a.state, a.config, input, 8);
    run(b.state, b.config, input, 8);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
