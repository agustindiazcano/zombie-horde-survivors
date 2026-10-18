import type { DamageType, GameConfig, WeaponClass, WeaponItem } from './config';
import type { Mods, Soldier, Stance } from './types';

export interface WeaponDef {
  id: string;
  name: string;
  class: WeaponClass;
  hands: 1 | 2;
  damageType: DamageType;
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
  if (s.downed) return config.player.speed * config.downed.crawlSpeedScale * mods.speed;
  const scale =
    stance === 'crouch'
      ? config.stance.crouchSpeedScale
      : stance === 'sprint'
        ? config.stance.sprintSpeedScale
        : 1;
  return config.player.speed * scale * mods.speed;
}

/** Looks up a weapon by item id. Anything that is not a weapon falls back to the rifle. */
export function weaponDef(config: GameConfig, id: string): WeaponDef {
  const listed = config.items[id];
  const item = listed?.type === 'weapon' ? listed : (config.items['rifle'] as WeaponItem);
  const { name, class: cls, hands, damageType, fireRate, damage, range, spread } = item;
  return {
    id: listed === item ? id : 'rifle',
    name,
    class: cls,
    hands,
    damageType,
    fireRate,
    damage,
    range,
    spread,
  };
}

/** The weapon a unit shoots with: the right hand, else the left; melee weapons do not shoot. */
export function gunOf(config: GameConfig, s: Soldier): string | null {
  for (const id of [s.equipment.rightHand, s.equipment.leftHand]) {
    if (id !== null && weaponDef(config, id).class !== 'melee') return id;
  }
  return null;
}

/** Stats of a unit's equipped weapon (null when unarmed), plus how it shoots (height, cover). */
export function weaponOf(
  config: GameConfig,
  s: Soldier,
  mods: Mods,
  stance: Stance = 'normal',
): WeaponStats | null {
  const gun = gunOf(config, s);
  if (gun === null) return null;
  const def = weaponDef(config, gun);
  // From the floor only a one-handed gun can be used, and badly.
  if (s.downed) {
    if (def.hands === 2) return null;
    def.spread += config.downed.extraSpread;
  }
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
