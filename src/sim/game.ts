import { FIXED_DT } from './constants';
import { spawnerEnemy, type GameConfig } from './config';
import { firstPlayerOf, localPlayer } from './players';
import { createAnimal, updateAnimals } from './animals';
import { createOrbs, updateOrbs } from './orbs';
import { createSky, updateSky } from './sky';
import { updateDrag } from './drag';
import { updateGrenades } from './grenades';
import { updateHazards } from './hazards';
import { updateObjectives } from './objectives';
import { updateRevives } from './revive';
import { resetStructures, updateStructures } from './structures';
import { resetObjects, updateObjects } from './objects';
import { createSquad, updateSoldiers } from './soldiers';
import { createVehicle, updateVehicles } from './vehicles';
import { createRng } from './rng';
import type { GameState, Input } from './types';
import { updatePickups } from './loot';
import { baseMods } from './upgrades';
import { updateWaves } from './waves';
import { spawnZombie, updateZombies } from './zombies';

export function createGame(config: GameConfig, seed = 1, sandbox = false): GameState {
  const humanId = firstPlayerOf(config.players, 'human');
  const soldiers = createSquad(config, humanId);
  const players = config.players.map((p) => ({
    ...p,
    controlledId: p.id === humanId ? (soldiers[0]?.id ?? null) : null,
  }));
  const state: GameState = {
    time: 0,
    status: 'playing',
    sandbox,
    soldiers,
    players,
    localPlayerId: humanId,
    nextSoldierId: soldiers.length + 1,
    vehicles: [],
    animals: [],
    orbs: [],
    skyLights: [],
    nextOrbId: 1,
    civilians: 0,
    casualties: 0,
    nextVehicleId: 1,
    structures: [],
    nextStructureId: 1,
    objects: [],
    nextObjectId: 1,
    fires: [],
    nextFireId: 1,
    grenades: [],
    nextGrenadeId: 1,
    stance: 'normal',
    zombies: [],
    nextZombieId: 1,
    crates: [],
    nextCrateId: 1,
    pickups: [],
    nextPickupId: 1,
    gold: config.startGold,
    xp: 0,
    upgrades: {},
    mods: baseMods(),
    pendingPerks: 0,
    perkOffer: null,
    purchases: {},
    wave: 0,
    kills: 0,
    bossKills: 0,
    objectivesDone: config.objectives.map(() => false),
    spawner: { phase: 'intermission', timer: config.waves.intermission, toSpawn: 0 },
    rng: createRng(seed),
    events: [],
  };
  resetStructures(state, config);
  resetObjects(state, config);
  // Vehicles placed in the editor wait for a driver.
  for (const u of config.placed) {
    if (u.type in config.vehicles) {
      state.vehicles.push(createVehicle(config, state.nextVehicleId++, u.type, u, u.rotation));
    }
  }
  // Animals wander where they were placed.
  for (const u of config.placed) {
    if (u.type in config.animals) {
      state.animals.push(createAnimal(state.animals.length + 1, u.type, u, u.rotation));
    }
  }
  state.civilians = state.animals.filter((a) => config.animals[a.type]?.fearRadius).length;
  createOrbs(state, config);
  createSky(state, config);
  // Enemies placed in the editor stand waiting from the start.
  const aiId = firstPlayerOf(config.players, 'ai');
  for (const u of config.placed) {
    if (u.owner === aiId && (u.type === 'zombie' || u.type in config.enemies)) {
      spawnZombie(state, config, u, u.type, 0, u).facing = u.rotation ?? 0;
    }
    // The editor's preview shows a spawner as the enemy it makes; in play it spawns waves instead.
    const made = spawnerEnemy(u.type);
    if (sandbox && made && (made === 'zombie' || made in config.enemies)) {
      spawnZombie(state, config, u, made, 0, u).facing = u.rotation ?? 0;
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
  if (state.status !== 'playing') return;

  state.time += dt;

  // The squad only changes stance while a soldier is under direct control.
  state.stance =
    localPlayer(state).controlledId === null
      ? 'normal'
      : input.crouch
        ? 'crouch'
        : input.sprint
          ? 'sprint'
          : input.walk
            ? 'walk'
            : 'normal';
  updateSoldiers(state, config, input, dt);
  updateObjects(state, config, dt);
  updateDrag(state, config);
  updateVehicles(state, config, input, dt);
  updateRevives(state, config, dt);
  updateGrenades(state, config, dt);
  updateHazards(state, config, dt);
  updateStructures(state, config, dt);
  updateAnimals(state, config, dt);
  updateOrbs(state, config, dt);
  updateSky(state, config, dt);
  updatePickups(state, config, dt);
  if (!state.sandbox && !config.noWaves) updateWaves(state, config, dt);
  updateZombies(state, config, dt);
  if (!state.sandbox) updateObjectives(state, config);

  // The run ends when no soldier is left on their feet: a downed soldier needs a standing ally.
  if (
    !state.sandbox &&
    state.status === 'playing' &&
    state.soldiers.every((s) => s.dead || s.downed || s.kind === 'drone')
  ) {
    state.status = 'gameover';
    state.events.push({ type: 'gameOver' });
  }
}
