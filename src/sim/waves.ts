import type { GameConfig } from './config';
import { nextFloat } from './rng';
import type { GameState } from './types';
import { spawnZombie } from './zombies';

export const waveSize = (config: GameConfig, wave: number): number =>
  config.waves.baseCount + config.waves.countPerWave * (wave - 1);

function livingZombies(state: GameState): number {
  let n = 0;
  for (const z of state.zombies) if (z.state !== 'death') n++;
  return n;
}

function spawnAtEdge(state: GameState, config: GameConfig): void {
  const lim = config.arena.halfSize - config.zombie.radius;
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
  spawnZombie(state, config, pos);
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
