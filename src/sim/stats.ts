import type { GameConfig } from './config';
import type { Soldier, Stance } from './types';

export interface WeaponDef {
  id: string;
  name: string;
  fireRate: number;
  damage: number;
  range: number;
  spread: number;
}

export interface WeaponStats extends WeaponDef {
  /** Height of the muzzle above the ground (for tracer visuals). */
  height: number;
  /** Flying units shoot from above, so obstacles don't block their line of fire. */
  ignoresCover: boolean;
}

export const isDrone = (s: Soldier): boolean => s.kind === 'drone';

export function speedOf(config: GameConfig, s: Soldier, stance: Stance = 'normal'): number {
  if (isDrone(s)) return config.drone.speed;
  const scale =
    stance === 'crouch'
      ? config.stance.crouchSpeedScale
      : stance === 'sprint'
        ? config.stance.sprintSpeedScale
        : 1;
  return config.player.speed * scale;
}

/** Looks up a weapon by id. Unknown ids fall back to the rifle. */
export function weaponDef(config: GameConfig, id: string): WeaponDef {
  if (id === 'drone_cannon') {
    const { fireRate, damage, range } = config.drone;
    return { id, name: 'Drone cannon', fireRate, damage, range, spread: 0 };
  }
  const listed = config.weapons[id];
  if (listed) return { id, ...listed };
  const { fireRate, damage, range } = config.weapon;
  return { id: 'rifle', name: 'Rifle', fireRate, damage, range, spread: 0 };
}

/** Stats of a unit's equipped weapon, plus how the unit itself shoots (height, cover). */
export function weaponOf(config: GameConfig, s: Soldier, stance: Stance = 'normal'): WeaponStats {
  const def = weaponDef(config, s.weapon);
  if (isDrone(s)) return { ...def, height: config.drone.height, ignoresCover: true };
  if (stance === 'crouch') {
    // A steadier stance: tighter spread and a bit more punch.
    def.spread *= config.stance.crouchSpreadScale;
    def.damage *= config.stance.crouchDamageScale;
  }
  return { ...def, height: 1 + s.y, ignoresCover: false };
}
