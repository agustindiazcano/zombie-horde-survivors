import type { DamageType, FireMode, GameConfig, WeaponClass, WeaponItem } from './config';
import { factor, modsOf, type FittedMods } from './accessoryMods';
import { bonus } from './training';
import type { GameState, Hand, Mods, Soldier, Stance } from './types';

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
  fireMode: FireMode;
  /** How loud a shot is (a suppressor lowers it). */
  noise: number;
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
        : stance === 'walk'
          ? config.stance.walkSpeedScale
          : 1;
  const load =
    (s.dragging === null && s.dragCorpse === null ? 1 : config.drag.speedScale) *
    (s.carrying?.speed ?? 1);
  const aim = s.aiming ? config.accuracy.aimSpeedScale : 1;
  return config.player.speed * scale * load * aim * mods.speed;
}

/** Looks up a weapon by item id. Anything that is not a weapon falls back to the rifle. */
export function weaponDef(config: GameConfig, id: string): WeaponDef {
  const listed = config.items[id];
  const item = listed?.type === 'weapon' ? listed : (config.items['rifle'] as WeaponItem);
  const {
    name,
    class: cls,
    hands,
    damageType,
    fireRate,
    damage,
    range,
    spread,
    fireMode,
    noise,
  } = item;
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
    fireMode,
    noise,
  };
}

/** The weapon a unit shoots with: the right hand, else the left; melee weapons do not shoot. */
export function gunOf(config: GameConfig, s: Soldier): string | null {
  const hand = gunHand(config, s);
  return hand === null ? null : s.equipment[hand];
}

/** The hand that holds the gun the unit shoots with, or null. */
export function gunHand(config: GameConfig, s: Soldier): Hand | null {
  for (const hand of ['rightHand', 'leftHand'] as const) {
    const id = s.equipment[hand];
    if (id !== null && weaponDef(config, id).class !== 'melee') return hand;
  }
  return null;
}

/** What the accessories fitted to the unit's gun change (nothing when unarmed or bare). */
export function gunMods(config: GameConfig, s: Soldier): FittedMods {
  const hand = gunHand(config, s);
  return modsOf(config, hand === null ? undefined : s.weaponStates[hand]);
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
  // Both hands are on the body being dragged: only a one-handed gun can be used.
  if ((s.dragging !== null || s.dragCorpse !== null) && def.hands === 2) return null;
  const fitted = gunMods(config, s);
  def.damage *= mods.damage * factor(fitted.damage) * (1 + bonus(config, s, 'damage'));
  def.range *= factor(fitted.range) * (1 + bonus(config, s, 'range'));
  def.spread *= factor(fitted.spread);
  def.noise *= factor(fitted.noise);
  def.fireRate *= mods.fireRate * (1 + bonus(config, s, 'fireRate'));
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

/** Max health with perks; pass a unit to use the base health its map gave it. */
export const maxHealthOf = (
  state: GameState,
  config: GameConfig,
  unit?: { baseHealth: number } | Soldier,
): number =>
  (unit?.baseHealth ?? config.player.maxHealth) *
  state.mods.maxHealth *
  (unit && 'training' in unit ? 1 + bonus(config, unit, 'health') : 1);
