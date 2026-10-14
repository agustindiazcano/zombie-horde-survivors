import { FIXED_DT } from './constants';
import type { GameConfig } from './config';
import { createSquad, updateSoldiers } from './soldiers';
import { createRng } from './rng';
import type { GameState, Input } from './types';
import { updateWaves } from './waves';
import { updateZombies } from './zombies';

export function createGame(config: GameConfig, seed = 1): GameState {
  const soldiers = createSquad(config);
  return {
    time: 0,
    status: 'playing',
    soldiers,
    controlledId: soldiers[0]?.id ?? null,
    nextSoldierId: soldiers.length + 1,
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

  updateSoldiers(state, config, input, dt);
  updateWaves(state, config, dt);
  updateZombies(state, config, dt);

  if (state.soldiers.every((s) => s.dead)) {
    state.status = 'gameover';
    state.events.push({ type: 'gameOver' });
  }
}
