import type { GameConfig, WeaponClass } from './config';
import type { Mods, Soldier, Stance } from './types';

export interface WeaponDef {
  id: string;
  name: string;
  class: WeaponClass;
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

export function speedOf(
  config: GameConfig,
  s: Soldier,
  mods: Mods,
  stance: Stance = 'normal',
): number {
  if (isDrone(s)) return config.drone.speed * mods.speed;
  const scale =
    stance === 'crouch'
      ? config.stance.crouchSpeedScale
      : stance === 'sprint'
        ? config.stance.sprintSpeedScale
        : 1;
  return config.player.speed * scale * mods.speed;
}

/** Looks up a weapon by id. Unknown ids fall back to the rifle. */
export function weaponDef(config: GameConfig, id: string): WeaponDef {
  if (id === 'drone_cannon') {
    const { fireRate, damage, range, weaponClass: cls } = config.drone;
    return { id, name: 'Drone gun', class: cls, fireRate, damage, range, spread: 0 };
  }
  const listed = config.weapons[id];
  if (listed) return { id, ...listed };
  const { class: cls, fireRate, damage, range } = config.weapon;
  return { id: 'rifle', name: 'Rifle', class: cls, fireRate, damage, range, spread: 0 };
}

/** Stats of a unit's equipped weapon (null when unarmed), plus how it shoots (height, cover). */
export function weaponOf(
  config: GameConfig,
  s: Soldier,
  mods: Mods,
  stance: Stance = 'normal',
): WeaponStats | null {
  if (s.weapon === null) return null;
  const def = weaponDef(config, s.weapon);
  def.damage *= mods.damage;
  def.fireRate *= mods.fireRate;
  if (isDrone(s)) return { ...def, height: config.drone.height, ignoresCover: true };
  if (stance === 'crouch') {
    // A steadier stance: tighter spread and a bit more punch.
    def.spread *= config.stance.crouchSpreadScale;
    def.damage *= config.stance.crouchDamageScale;
  }
  return { ...def, height: 1 + s.y, ignoresCover: false };
}

/** Weapon-skill level from XP: each level needs `growth` times more than the one before. */
export function skillLevel(
  config: GameConfig,
  xp: number,
): { level: number; into: number; needed: number } {
  let level = 1;
  let needed = config.units.skills.xpPerLevel;
  let rest = xp;
  while (rest >= needed) {
    rest -= needed;
    level++;
    needed = Math.round(needed * config.units.skills.growth);
  }
  return { level, into: rest, needed };
}
