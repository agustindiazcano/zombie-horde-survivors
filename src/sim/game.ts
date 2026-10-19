import { FIXED_DT } from './constants';
import type { GameConfig } from './config';
import { firstPlayerOf, localPlayer } from './players';
import { updateRevives } from './revive';
import { createSquad, updateSoldiers } from './soldiers';
import { createRng } from './rng';
import type { GameState, Input } from './types';
import { updatePickups } from './loot';
import { baseMods } from './upgrades';
import { updateWaves } from './waves';
import { spawnZombie, updateZombies } from './zombies';

export function createGame(config: GameConfig, seed = 1): GameState {
  const humanId = firstPlayerOf(config.players, 'human');
  const soldiers = createSquad(config, humanId);
  const players = config.players.map((p) => ({
    ...p,
    controlledId: p.id === humanId ? (soldiers[0]?.id ?? null) : null,
  }));
  const state: GameState = {
    time: 0,
    status: 'playing',
    soldiers,
    players,
    localPlayerId: humanId,
    nextSoldierId: soldiers.length + 1,
    stance: 'normal',
    zombies: [],
    nextZombieId: 1,
    crates: [],
    nextCrateId: 1,
    pickups: [],
    nextPickupId: 1,
    gold: 0,
    xp: 0,
    upgrades: {},
    mods: baseMods(),
    pendingPerks: 0,
    perkOffer: null,
    purchases: {},
    wave: 0,
    kills: 0,
    spawner: { phase: 'intermission', timer: config.waves.intermission, toSpawn: 0 },
    rng: createRng(seed),
    events: [],
  };
  // Enemies placed in the editor stand waiting from the start.
  const aiId = firstPlayerOf(config.players, 'ai');
  for (const u of config.placed) {
    if (u.owner === aiId && (u.type === 'zombie' || u.type in config.enemies)) {
      spawnZombie(state, config, u, u.type).facing = u.rotation ?? 0;
    }
  }
  return state;
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

  // The squad only changes stance while a soldier is under direct control.
  state.stance =
    localPlayer(state).controlledId === null
      ? 'normal'
      : input.crouch
        ? 'crouch'
        : input.sprint
          ? 'sprint'
          : 'normal';
  updateSoldiers(state, config, input, dt);
  updateRevives(state, config, dt);
  updatePickups(state, config, dt);
  updateWaves(state, config, dt);
  updateZombies(state, config, dt);

  // The run ends when no soldier is left on their feet: a downed soldier needs a standing ally.
  if (state.soldiers.every((s) => s.dead || s.downed || s.kind === 'drone')) {
    state.status = 'gameover';
    state.events.push({ type: 'gameOver' });
  }
}
