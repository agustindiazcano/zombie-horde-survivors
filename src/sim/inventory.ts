import type { GameConfig } from './config';
import { nextFloat } from './rng';
import type { Crate, GameState, Soldier } from './types';
import type { Vec2 } from './vec';

export const backpackFull = (config: GameConfig, s: Soldier): boolean =>
  s.backpack.length >= config.inventory.backpackSlots;

export function getCrate(state: GameState, id: number): Crate | undefined {
  return state.crates.find((c) => c.id === id);
}

/** The closest crate within `range` of a position, if any. */
export function nearestCrate(state: GameState, pos: Vec2, range: number): Crate | undefined {
  let best: Crate | undefined;
  let bestD = range;
  for (const c of state.crates) {
    const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

const unit = (state: GameState, id: number): Soldier | undefined =>
  state.soldiers.find((s) => s.id === id);

function reachableCrate(
  state: GameState,
  config: GameConfig,
  soldier: Soldier,
  crateId: number,
): Crate | undefined {
  const crate = getCrate(state, crateId);
  if (!crate || soldier.dead) return undefined;
  const d = Math.hypot(crate.pos.x - soldier.pos.x, crate.pos.z - soldier.pos.z);
  return d <= config.drops.pickupRange ? crate : undefined;
}

/** A place a weapon can sit: a unit's equipped weapon, or one of its backpack slots. */
export interface Slot {
  unitId: number;
  slot: 'weapon' | number;
}

const itemAt = (s: Soldier, slot: Slot['slot']): string | undefined =>
  slot === 'weapon' ? (s.weapon ?? undefined) : s.backpack[slot];

/**
 * The drone gun can be carried by anyone but only equipped by the drone, and the drone
 * can only equip that gun.
 */
function fits(s: Soldier, slot: Slot['slot'], item: string): boolean {
  const isCannon = item === 'drone_cannon';
  if (slot === 'weapon') return (s.kind === 'drone') === isCannon;
  return !isCannon;
}

/**
 * Drags a weapon from one slot to another, between any two living units (or within one).
 * Dropping on an occupied slot swaps the two; dropping on an empty slot moves the weapon
 * there (so dragging the equipped weapon to an empty backpack slot unequips it).
 * Returns false if the move is refused.
 */
export function moveItem(state: GameState, config: GameConfig, from: Slot, to: Slot): boolean {
  const a = unit(state, from.unitId);
  const b = unit(state, to.unitId);
  if (!a || !b || a.dead || b.dead) return false;
  if (from.unitId === to.unitId && from.slot === to.slot) return false;
  const moving = itemAt(a, from.slot);
  if (moving === undefined || !fits(b, to.slot, moving)) return false;

  const other = itemAt(b, to.slot);
  if (other !== undefined) {
    if (!fits(a, from.slot, other)) return false;
    if (from.slot === 'weapon') a.weapon = other;
    else a.backpack[from.slot] = other;
    if (to.slot === 'weapon') b.weapon = moving;
    else b.backpack[to.slot] = moving;
    return true;
  }

  // An empty slot: the weapon leaves its slot, and joins the equipped slot or the end of the backpack.
  const freesSpace = a === b && from.slot !== 'weapon';
  if (to.slot !== 'weapon' && !freesSpace && backpackFull(config, b)) return false;
  if (from.slot === 'weapon') a.weapon = null;
  else a.backpack.splice(from.slot, 1);
  if (to.slot === 'weapon') b.weapon = moving;
  else b.backpack.push(moving);
  return true;
}

/** Puts the equipped weapon into the backpack, leaving the unit unarmed. */
export function unequipWeapon(state: GameState, config: GameConfig, soldierId: number): boolean {
  const s = unit(state, soldierId);
  if (!s || s.dead || s.weapon === null || backpackFull(config, s)) return false;
  if (!fits(s, 0, s.weapon)) return false;
  s.backpack.push(s.weapon);
  s.weapon = null;
  return true;
}

/** Swaps a backpack weapon with the equipped one. */
export function equipFromBackpack(state: GameState, soldierId: number, index: number): boolean {
  const s = unit(state, soldierId);
  const item = s?.backpack[index];
  if (!s || s.dead || item === undefined || !fits(s, 'weapon', item)) return false;
  if (s.weapon === null) s.backpack.splice(index, 1);
  else s.backpack[index] = s.weapon;
  s.weapon = item;
  return true;
}

/** Moves a weapon from a crate into a unit's backpack. Empty crates disappear. */
export function takeFromCrate(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  crateId: number,
  index: number,
): boolean {
  const s = unit(state, soldierId);
  if (!s) return false;
  const crate = reachableCrate(state, config, s, crateId);
  const item = crate?.items[index];
  if (!crate || item === undefined || backpackFull(config, s)) return false;
  crate.items.splice(index, 1);
  s.backpack.push(item);
  if (crate.items.length === 0) state.crates = state.crates.filter((c) => c !== crate);
  return true;
}

/** Moves a backpack weapon from a unit into a nearby crate. */
export function stashInCrate(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  crateId: number,
  index: number,
): boolean {
  const s = unit(state, soldierId);
  if (!s) return false;
  const crate = reachableCrate(state, config, s, crateId);
  const item = s.backpack[index];
  if (!crate || item === undefined) return false;
  s.backpack.splice(index, 1);
  crate.items.push(item);
  return true;
}

function rollWeapon(state: GameState, config: GameConfig): string {
  const table = config.drops.table;
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  let roll = nextFloat(state.rng) * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll < 0) return entry.weapon;
  }
  return table[table.length - 1]!.weapon;
}

/** Rolls the drop chance for a dead zombie and, on success, creates a crate there. */
export function maybeDropCrate(state: GameState, config: GameConfig, pos: Vec2): void {
  const drops = config.drops;
  if (nextFloat(state.rng) >= drops.chance) return;

  const count =
    drops.minItems + Math.floor(nextFloat(state.rng) * (drops.maxItems - drops.minItems + 1));
  const items = Array.from({ length: count }, () => rollWeapon(state, config));
  const crate: Crate = { id: state.nextCrateId++, pos: { x: pos.x, z: pos.z }, items };
  state.crates.push(crate);
  while (state.crates.length > drops.maxCrates) state.crates.shift();
  state.events.push({ type: 'crateDropped', crateId: crate.id, pos: { ...crate.pos } });
}
