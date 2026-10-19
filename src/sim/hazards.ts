import type { GameConfig } from './config';
import { hurtSoldier } from './soldiers';
import type { GameState } from './types';
import { damageZombie } from './zombies';

/** Burn damage lands in bursts this many seconds apart, so hurt effects do not fire every tick. */
const BURN_INTERVAL = 0.5;

/**
 * Fire: every living soldier on foot (the drone is a machine and does not burn) and every enemy
 * inside the radius of a fire takes `dps` damage, applied in half-second bursts.
 */
export function updateHazards(state: GameState, config: GameConfig, dt: number): void {
  if (config.fires.length === 0) return;
  const previous = Math.floor((state.time - dt) / BURN_INTERVAL);
  if (Math.floor(state.time / BURN_INTERVAL) === previous) return;
  const { dps, radius } = config.hazards.fire;
  const amount = dps * BURN_INTERVAL;

  for (const fire of config.fires) {
    for (const s of state.soldiers) {
      if (s.dead || s.kind === 'drone' || s.vehicleId !== null) continue;
      if (Math.hypot(s.pos.x - fire.x, s.pos.z - fire.z) <= radius) {
        hurtSoldier(state, config, s, amount, -1);
      }
    }
    for (const z of state.zombies) {
      if (z.state === 'death') continue;
      if (Math.hypot(z.pos.x - fire.x, z.pos.z - fire.z) <= radius + z.radius) {
        damageZombie(state, config, z, amount);
      }
    }
  }
}
