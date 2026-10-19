import type { GameConfig } from './config';
import { FIXED_DT } from './constants';
import { factor } from './accessoryMods';
import { gunMods, gunOf, skillLevel, weaponOf, type WeaponStats } from './stats';
import type { GameState, Soldier } from './types';

/** The recoil numbers of the gun in hand, if it has any. */
export function recoilOf(config: GameConfig, s: Soldier) {
  const gun = gunOf(config, s);
  const def = gun === null ? undefined : config.items[gun];
  return def?.type === 'weapon' ? def.recoil : undefined;
}

/**
 * The random aim error (radians, each side) of the next shot: the weapon's spread scaled by
 * movement, weapon skill, standing still and aiming, never below `minError`, plus the kick
 * of the recent shots. A gun with no spread and no recoil is exact.
 */
export function spreadNow(config: GameConfig, s: Soldier, weapon: WeaponStats): number {
  const a = config.accuracy;
  let spread = 0;
  if (weapon.spread > 0) {
    const speed = Math.hypot(s.pos.x - s.prev.x, s.pos.z - s.prev.z) / FIXED_DT;
    const move = 1 + a.movementSpread * Math.min(2, speed / config.player.speed);
    const level = skillLevel(config, s.skills[weapon.class]).level;
    const trained = Math.min(1, (level - 1) / (a.skillMaxLevel - 1));
    const skill = 1 + (a.skillBestScale - 1) * trained;
    const still = s.stillTime >= a.standStillTime ? a.standStillScale : 1;
    const aim = s.aiming ? a.aimSpreadScale * factor(gunMods(config, s).aimSpread) : 1;
    spread = Math.max(a.minError, weapon.spread * move * skill * still * aim);
  }
  return spread + s.recoil;
}

/** The aim error right now for a unit's gun (for the crosshair), or null when unarmed. */
export function aimErrorOf(state: GameState, config: GameConfig, s: Soldier): number | null {
  const weapon = weaponOf(config, s, state.mods, state.stance);
  return weapon ? spreadNow(config, s, weapon) : null;
}

/** Adds the kick of one shot to the shooter's recoil. */
export function kickRecoil(state: GameState, config: GameConfig, s: Soldier): number {
  const r = recoilOf(config, s);
  if (!r) return 0;
  const a = config.accuracy;
  const scale =
    (s.aiming ? a.aimRecoilScale : 1) *
    (state.stance === 'crouch' ? a.crouchRecoilScale : 1) *
    factor(gunMods(config, s).recoil);
  s.recoil = Math.min(r.maxKick, s.recoil + r.kick * scale);
  return r.cameraKick;
}

/** Fades the recoil of a unit by `dt` seconds. */
export function fadeRecoil(config: GameConfig, s: Soldier, dt: number): void {
  if (s.recoil <= 0) return;
  const r = recoilOf(config, s);
  s.recoil = r ? Math.max(0, s.recoil - r.recovery * dt) : 0;
}

/** The view zoom while aiming: the base zoom, narrowed further by a scope or sight. */
export function aimZoomOf(config: GameConfig, s: Soldier): number {
  return config.accuracy.aimZoom * factor(-gunMods(config, s).zoom);
}
