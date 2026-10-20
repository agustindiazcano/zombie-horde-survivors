import type { GameConfig } from './config';
import { weaponDef } from './stats';
import type { Hand, Soldier, WeaponState } from './types';

/** A fresh weapon: a full magazine and nothing fitted. */
export function newWeaponState(config: GameConfig, item: string): WeaponState {
  const def = config.items[item];
  return { loaded: def?.type === 'weapon' ? (def.magazine ?? 0) : 0, accessories: {} };
}

/** The state of the weapon in a hand, created on first use (maps and crates give plain item ids). */
export function handState(config: GameConfig, s: Soldier, hand: Hand): WeaponState | null {
  const item = s.equipment[hand];
  if (item === null) return null;
  return (s.weaponStates[hand] ??= newWeaponState(config, item));
}

/**
 * Whether a trigger pull fires this step. An automatic gun fires while the button is down;
 * a semi-automatic one needs a fresh click, which waits (`triggerQueued`) for the cooldown.
 * `autoTrigger` (touch play, where the auto-aim holds the trigger) treats every gun as automatic.
 */
export function triggerPulled(
  config: GameConfig,
  s: Soldier,
  gun: string | null,
  firing: boolean,
  autoTrigger = false,
): boolean {
  const was = s.triggerHeld;
  s.triggerHeld = firing;
  if (gun === null) {
    s.triggerQueued = false;
    return false;
  }
  if (autoTrigger || weaponDef(config, gun).fireMode === 'auto')
    return firing && s.fireCooldown <= 0;
  if (firing && !was) s.triggerQueued = true;
  if (s.triggerQueued && s.fireCooldown <= 0) {
    s.triggerQueued = false;
    return true;
  }
  return false;
}
