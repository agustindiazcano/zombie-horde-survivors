import { FIXED_DT } from './constants';
import type { GameConfig } from './config';
import { updatePlayer } from './player';
import { createRng } from './rng';
import type { GameState, Input } from './types';
import { tryFire } from './weapon';
import { updateWaves } from './waves';
import { updateZombies } from './zombies';

export function createGame(config: GameConfig, seed = 1): GameState {
  return {
    time: 0,
    status: 'playing',
    player: {
      pos: { x: 0, z: 0 },
      prev: { x: 0, z: 0 },
      facing: 0,
      health: config.player.maxHealth,
      fireCooldown: 0,
    },
    zombies: [],
    nextZombieId: 1,
    wave: 0,
    kills: 0,
    spawner: { phase: 'intermission', timer: config.waves.intermission, toSpawn: 0 },
    rng: createRng(seed),
    events: [],
  };
}

/** Advances the simulation by one fixed step. Mutates `state` in place. */
export function step(
  state: GameState,
  config: GameConfig,
  input: Input,
  dt: number = FIXED_DT,
): void {
  state.events.length = 0;
  if (state.status === 'gameover') return;

  state.time += dt;
  state.player.prev.x = state.player.pos.x;
  state.player.prev.z = state.player.pos.z;

  updatePlayer(state, config, input, dt);
  tryFire(state, config, input);
  updateWaves(state, config, dt);
  updateZombies(state, config, dt);

  if (state.player.health <= 0) {
    state.status = 'gameover';
    state.events.push({ type: 'gameOver' });
  }
}
