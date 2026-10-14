import type { GameConfig } from './config';
import type { Soldier } from './types';

export interface WeaponStats {
  fireRate: number;
  damage: number;
  range: number;
  /** Height of the muzzle above the ground (for tracer visuals). */
  height: number;
  /** Flying units shoot from above, so obstacles don't block their line of fire. */
  ignoresCover: boolean;
}

export const isDrone = (s: Soldier): boolean => s.kind === 'drone';

export const speedOf = (config: GameConfig, s: Soldier): number =>
  isDrone(s) ? config.drone.speed : config.player.speed;

export function weaponOf(config: GameConfig, s: Soldier): WeaponStats {
  if (isDrone(s)) {
    const d = config.drone;
    return {
      fireRate: d.fireRate,
      damage: d.damage,
      range: d.range,
      height: d.height,
      ignoresCover: true,
    };
  }
  return { ...config.weapon, height: 1, ignoresCover: false };
}
