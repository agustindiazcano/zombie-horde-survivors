import type { GameConfig } from './config';
import { resolveStatic } from './collision';
import { nextFloat } from './rng';
import type { GameState } from './types';
import { spawnZombie } from './zombies';

export const waveSize = (config: GameConfig, wave: number): number =>
  Math.round(
    (config.waves.baseCount + config.waves.countPerWave * (wave - 1)) * config.level.count,
  );

function livingZombies(state: GameState): number {
  let n = 0;
  for (const z of state.zombies) if (z.state !== 'death') n++;
  return n;
}

/** Picks an enemy variant among those unlocked at the current wave (weighted). */
function pickEnemyType(state: GameState, config: GameConfig): string {
  const options = Object.entries(config.enemies).filter(([, e]) => state.wave >= e.minWave);
  if (options.length === 0) return 'zombie';
  const total = config.waves.baseWeight + options.reduce((sum, [, e]) => sum + e.weight, 0);
  let roll = nextFloat(state.rng) * total;
  roll -= config.waves.baseWeight;
  if (roll < 0) return 'zombie';
  for (const [id, e] of options) {
    roll -= e.weight;
    if (roll < 0) return id;
  }
  return options[options.length - 1]![0];
}

function spawnAtEdge(state: GameState, config: GameConfig, forced?: string, bossNumber = 0): void {
  const type = forced ?? pickEnemyType(state, config);
  const radius = config.zombie.radius * (config.enemies[type]?.radiusScale ?? 1);
  const points = config.spawnPoints;
  if (points.length > 0) {
    const chosen = points[Math.floor(nextFloat(state.rng) * points.length)]!;
    // A point drawn inside an obstacle or water is pushed out to its edge.
    const at = { ...chosen };
    resolveStatic(at, radius, config.arena);
    // A placed spawner makes its own enemy, with what the map gave it; a boss keeps its type.
    const own = at.enemy === 'zombie' || (at.enemy && at.enemy in config.enemies) ? at.enemy : null;
    spawnZombie(
      state,
      config,
      at,
      forced === undefined && own ? own : type,
      bossNumber,
      at.loadout,
    );
    return;
  }
  const lim = config.arena.halfSize - radius;
  const side = Math.floor(nextFloat(state.rng) * 4);
  const t = (nextFloat(state.rng) * 2 - 1) * lim;
  const pos =
    side === 0
      ? { x: t, z: lim }
      : side === 1
        ? { x: t, z: -lim }
        : side === 2
          ? { x: lim, z: t }
          : { x: -lim, z: t };
  spawnZombie(state, config, pos, type, bossNumber);
}

export function updateWaves(state: GameState, config: GameConfig, dt: number): void {
  const sp = state.spawner;
  const wc = config.waves;

  if (sp.phase === 'intermission') {
    sp.timer -= dt;
    if (sp.timer > 0) return;
    state.wave++;
    sp.toSpawn = waveSize(config, state.wave);
    sp.timer = 0;
    sp.phase = 'spawning';
    state.events.push({ type: 'waveStarted', wave: state.wave });
    if (state.wave % config.boss.everyWaves === 0) {
      const { types, everyWaves } = config.boss;
      const enemy = types[(state.wave / everyWaves - 1) % types.length]!;
      spawnAtEdge(state, config, enemy, state.wave / everyWaves);
      state.events.push({ type: 'bossSpawned', wave: state.wave, enemy });
    }
  }

  if (sp.phase === 'spawning') {
    sp.timer = Math.max(0, sp.timer - dt);
    if (sp.timer === 0 && sp.toSpawn > 0 && livingZombies(state) < wc.maxAlive) {
      spawnAtEdge(state, config);
      sp.toSpawn--;
      sp.timer = wc.spawnInterval;
    }
    if (sp.toSpawn === 0) sp.phase = 'clearing';
    return;
  }

  if (sp.phase === 'clearing' && livingZombies(state) === 0) {
    sp.phase = 'intermission';
    sp.timer = wc.intermission;
  }
}
