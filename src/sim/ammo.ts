import type { GameConfig } from './config';
import { factor } from './accessoryMods';
import { gunHand, gunMods, gunOf } from './stats';
import type { GameState, Soldier, WeaponState } from './types';
import { handState } from './weaponState';

/** The magazine size and reload time of the gun a unit holds, or null if it never runs dry. */
function gunSheet(config: GameConfig, s: Soldier) {
  const gun = gunOf(config, s);
  const def = gun === null ? undefined : config.items[gun];
  if (def?.type !== 'weapon' || !def.magazine) return null;
  return def;
}

/** Rounds in a full magazine of the unit's gun, with fitted accessories (0 if it never runs dry). */
export function magazineOf(config: GameConfig, s: Soldier): number {
  const def = gunSheet(config, s);
  return def ? def.magazine! + gunMods(config, s).magazine : 0;
}

/** Rounds in the backpack for a gun, or Infinity when its spare magazines never run out. */
export function reserveOf(config: GameConfig, s: Soldier): number {
  const def = gunSheet(config, s);
  if (!def) return 0;
  if (def.infiniteSpare) return Infinity;
  return s.backpack.reduce((n, st) => (st.item === def.ammo ? n + st.count : n), 0);
}

/** The state of the unit's gun, or null when it has none or never runs dry. */
export function gunState(config: GameConfig, s: Soldier): WeaponState | null {
  const hand = gunHand(config, s);
  return hand !== null && gunSheet(config, s) ? handState(config, s, hand) : null;
}

/** Starts reloading the gun in hand; false if it is full, there is nothing to load, or it is busy. */
export function startReload(state: GameState, config: GameConfig, s: Soldier): boolean {
  const def = gunSheet(config, s);
  const hand = gunHand(config, s);
  if (!def || hand === null || s.reload || s.dead) return false;
  const weapon = handState(config, s, hand)!;
  if (weapon.loaded >= magazineOf(config, s) || reserveOf(config, s) <= 0) return false;
  s.reload = {
    hand,
    state: weapon,
    left: (def.reloadTime ?? 0) * factor(gunMods(config, s).reloadTime),
  };
  state.events.push({ type: 'reloadStarted', soldierId: s.id });
  return true;
}

/** Moves rounds from the backpack into the magazine once the reload time has passed. */
export function updateReload(config: GameConfig, s: Soldier, dt: number): void {
  const r = s.reload;
  if (!r) return;
  // Dropped by going down or dying, or by anything that changed what the hand holds.
  if (s.dead || s.downed || s.weaponStates[r.hand] !== r.state || gunHand(config, s) !== r.hand) {
    s.reload = null;
    return;
  }
  r.left -= dt;
  if (r.left > 0) return;
  s.reload = null;
  const def = gunSheet(config, s)!;
  let take = Math.min(magazineOf(config, s) - r.state.loaded, reserveOf(config, s));
  r.state.loaded += take;
  if (def.infiniteSpare) return;
  for (const st of s.backpack) {
    if (st.item !== def.ammo || take <= 0) continue;
    const used = Math.min(st.count, take);
    st.count -= used;
    take -= used;
  }
  s.backpack = s.backpack.filter((st) => st.count > 0);
}

/**
 * What AI soldiers (and touch play) do about ammo: reload an empty gun at once, and top up
 * a part-empty one when there is nothing to shoot at.
 */
export function maintainAmmo(
  state: GameState,
  config: GameConfig,
  s: Soldier,
  engaged: boolean,
): void {
  const def = gunSheet(config, s);
  const weapon = gunState(config, s);
  if (!def || !weapon) return;
  if (weapon.loaded === 0 || (!engaged && weapon.loaded < magazineOf(config, s))) {
    startReload(state, config, s);
  }
}

/** A short HUD text for the gun in hand: rounds loaded, spare rounds, reloading. Empty if none. */
export function ammoLabel(config: GameConfig, s: Soldier): string {
  const def = gunSheet(config, s);
  const weapon = gunState(config, s);
  if (!def || !weapon) return '';
  const spare = reserveOf(config, s);
  const reload = s.reload ? ' · reloading' : '';
  return `${weapon.loaded}/${magazineOf(config, s)} + ${spare === Infinity ? '∞' : spare}${reload}`;
}
