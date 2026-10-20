import type { AccessorySlot, GameConfig, WeaponItem } from './config';
import { factor, modsOf } from './accessoryMods';
import { cellAt, addToBackpack, itemDef, type SlotRef } from './inventory';
import type { GameState, Soldier, WeaponState } from './types';
import { newWeaponState } from './weaponState';

/** What a weapon with these accessories is worth, for the workbench (before or after a change). */
export interface WeaponReport {
  damage: number;
  range: number;
  spread: number;
  aimSpread: number;
  recoil: number;
  noise: number;
  magazine: number | null;
  reloadTime: number | null;
  zoom: number;
}

export function reportOf(
  config: GameConfig,
  weapon: WeaponItem,
  accessories: WeaponState['accessories'],
  aimSpreadScale = config.accuracy.aimSpreadScale,
): WeaponReport {
  const m = modsOf(config, { loaded: 0, accessories });
  return {
    damage: weapon.damage * factor(m.damage),
    range: weapon.range * factor(m.range),
    spread: weapon.spread * factor(m.spread),
    aimSpread: weapon.spread * factor(m.spread) * aimSpreadScale * factor(m.aimSpread),
    recoil: weapon.recoil ? weapon.recoil.kick * factor(m.recoil) : 0,
    noise: weapon.noise * factor(m.noise),
    magazine: weapon.magazine === undefined ? null : weapon.magazine + m.magazine,
    reloadTime: weapon.reloadTime === undefined ? null : weapon.reloadTime * factor(m.reloadTime),
    zoom: config.accuracy.aimZoom * factor(-m.zoom),
  };
}

/** The weapon at a slot of a unit and its state (created if the weapon never had one), or null. */
function weaponAt(
  config: GameConfig,
  s: Soldier,
  slot: SlotRef,
): { item: string; def: WeaponItem; state: WeaponState } | null {
  const cell = cellAt(s, slot);
  if (!cell) return null;
  const def = itemDef(config, cell.item);
  if (def.type !== 'weapon' || def.innate) return null;
  if (!cell.state) {
    const made = newWeaponState(config, cell.item);
    if (typeof slot === 'string') {
      if (slot === 'chest') return null;
      s.weaponStates[slot] = made;
    } else {
      s.backpack[slot]!.state = made;
    }
    return { item: cell.item, def, state: made };
  }
  return { item: cell.item, def, state: cell.state };
}

/** Rounds in the magazine cannot exceed what is left of its size after a change. */
function clampLoaded(config: GameConfig, def: WeaponItem, state: WeaponState): void {
  if (def.magazine === undefined) return;
  const size = def.magazine + modsOf(config, state).magazine;
  state.loaded = Math.min(state.loaded, size);
}

/**
 * Fits the accessory in a backpack slot to the weapon at `weapon` (a hand or another backpack
 * slot of the same unit). If that place of the weapon is taken the two swap. False, and nothing
 * changes, if the item does not fit.
 */
export function fitAccessory(
  state: GameState,
  config: GameConfig,
  unitId: number,
  weapon: SlotRef,
  accessoryIndex: number,
): boolean {
  const s = state.soldiers.find((u) => u.id === unitId);
  const stack = s?.backpack[accessoryIndex];
  if (!s || s.dead || !stack || weapon === accessoryIndex) return false;
  const acc = itemDef(config, stack.item);
  if (acc.type !== 'accessory') return false;
  const target = weaponAt(config, s, weapon);
  if (!target || !target.def.accessorySlots.includes(acc.slot)) return false;

  const old = target.state.accessories[acc.slot];
  target.state.accessories[acc.slot] = stack.item;
  if (old === undefined) {
    if (--stack.count === 0) s.backpack.splice(accessoryIndex, 1);
  } else if (stack.count === 1) {
    s.backpack[accessoryIndex] = { item: old, count: 1 };
  } else {
    // A stack of several: the old one needs a free slot or an open stack.
    stack.count--;
    if (!addToBackpack(config, s, old)) {
      stack.count++;
      target.state.accessories[acc.slot] = old;
      return false;
    }
  }
  clampLoaded(config, target.def, target.state);
  return true;
}

/** Takes the accessory off a weapon into the backpack. False if the backpack has no room. */
export function removeAccessory(
  state: GameState,
  config: GameConfig,
  unitId: number,
  weapon: SlotRef,
  place: AccessorySlot,
): boolean {
  const s = state.soldiers.find((u) => u.id === unitId);
  if (!s || s.dead) return false;
  const target = weaponAt(config, s, weapon);
  const id = target?.state.accessories[place];
  if (!target || id === undefined || !addToBackpack(config, s, id)) return false;
  delete target.state.accessories[place];
  clampLoaded(config, target.def, target.state);
  return true;
}
