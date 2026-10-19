import type { GameConfig, ItemDef } from './config';
import { nextFloat } from './rng';
import { maxHealthOf } from './stats';
import type { Crate, Equipment, GameState, Hand, Soldier, Stack, WeaponState } from './types';
import type { Vec2 } from './vec';

/** Crate entry that is worn as armor instead of carried. */
export const ARMOR_PLATE = 'armor_plate';

/** A place an item can sit: a hand or body slot, or a backpack slot (by index). */
export type SlotRef = keyof Equipment | number;

/** A slot of a given unit. */
export interface Slot {
  unitId: number;
  slot: SlotRef;
}

const isEquipSlot = (slot: SlotRef): slot is keyof Equipment => typeof slot === 'string';
const isHand = (slot: keyof Equipment): slot is Hand => slot !== 'chest';

export const itemDef = (config: GameConfig, id: string): ItemDef => config.items[id]!;

export const backpackFull = (config: GameConfig, s: Soldier): boolean =>
  s.backpack.length >= config.inventory.backpackSlots;

/** Puts rounds of an ammo item into its stacks, topping up before opening a slot. False if they do not all fit. */
function addRounds(config: GameConfig, s: Soldier, item: string, rounds: number): boolean {
  const size = itemDef(config, item).stack;
  const stacks = s.backpack.filter((st) => st.item === item);
  const free = config.inventory.backpackSlots - s.backpack.length;
  const room = stacks.reduce((n, st) => n + size - st.count, 0) + free * size;
  if (room < rounds) return false;
  let left = rounds;
  for (const st of stacks) {
    const put = Math.min(size - st.count, left);
    st.count += put;
    left -= put;
  }
  while (left > 0) {
    const put = Math.min(size, left);
    s.backpack.push({ item, count: put });
    left -= put;
  }
  return true;
}

/**
 * Puts one item (a pack of rounds, for ammo) in the first stack with room, or a free slot.
 * A weapon keeps its `state`. False if the backpack is full.
 */
export function addToBackpack(
  config: GameConfig,
  s: Soldier,
  item: string,
  state?: WeaponState,
): boolean {
  const def = itemDef(config, item);
  if (def.type === 'ammo') return addRounds(config, s, item, def.pack);
  const open = s.backpack.find((st) => st.item === item && st.count < def.stack);
  if (open) {
    open.count++;
    return true;
  }
  if (backpackFull(config, s)) return false;
  s.backpack.push(state ? { item, count: 1, state } : { item, count: 1 });
  return true;
}

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

/** What sits in a slot (equipment slots hold exactly one), or null. Backpack stacks are live. */
export function cellAt(s: Soldier, slot: SlotRef): Stack | null {
  if (isEquipSlot(slot)) {
    const item = s.equipment[slot];
    if (item === null) return null;
    const state = isHand(slot) ? s.weaponStates[slot] : undefined;
    return state ? { item, count: 1, state } : { item, count: 1 };
  }
  return s.backpack[slot] ?? null;
}

function setHandState(s: Soldier, hand: Hand, state: Stack['state']): void {
  if (state) s.weaponStates[hand] = state;
  else delete s.weaponStates[hand];
}

/** Writes a slot. Emptying a backpack slot closes the gap; an index past the end appends. */
function putCell(s: Soldier, slot: SlotRef, stack: Stack | null): void {
  if (isEquipSlot(slot)) {
    s.equipment[slot] = stack?.item ?? null;
    if (isHand(slot)) setHandState(s, slot, stack?.state);
  } else if (stack === null) s.backpack.splice(slot, 1);
  else if (slot < s.backpack.length) s.backpack[slot] = stack;
  else s.backpack.push(stack);
}

/**
 * Whether `item` may sit in `slot` of unit `s`, ignoring what else is held. Hands take
 * weapons only (a two-handed one only in `rightHand`); a drone takes only drone guns, in
 * `rightHand`; the chest takes armor. Fists never leave the unit.
 */
function accepts(config: GameConfig, s: Soldier, slot: SlotRef, item: string): boolean {
  const def = itemDef(config, item);
  if (def.type === 'weapon' && def.innate) return false;
  if (!isEquipSlot(slot)) return true;
  if (slot === 'chest') return def.type === 'armor' && s.kind !== 'drone';
  if (def.type !== 'weapon') return false;
  if (s.kind === 'drone') return slot === 'rightHand' && def.droneOnly === true;
  if (def.droneOnly) return false;
  return def.hands === 1 || slot === 'rightHand';
}

/** A two-handed weapon needs the other hand free, and the backpack cannot overflow. */
function consistent(config: GameConfig, s: Soldier): boolean {
  const right = s.equipment.rightHand;
  const def = right === null ? null : itemDef(config, right);
  const twoHanded = def?.type === 'weapon' && def.hands === 2;
  if (twoHanded && s.equipment.leftHand !== null) return false;
  return s.backpack.length <= config.inventory.backpackSlots;
}

const snapshot = (s: Soldier) => ({
  equipment: { ...s.equipment },
  weaponStates: { ...s.weaponStates },
  backpack: s.backpack.map((st) => ({ ...st })),
});

function restore(s: Soldier, saved: ReturnType<typeof snapshot>): void {
  s.equipment = saved.equipment;
  s.weaponStates = saved.weaponStates;
  s.backpack = saved.backpack;
}

/**
 * Drags an item from one slot to another, between any two living units (or within one).
 * Dropping on an occupied slot swaps the two; dropping on an empty slot moves the item
 * there (so dragging a held weapon to an empty backpack slot unequips it); dropping a stack
 * on a stack of the same item merges them. Returns false (and changes nothing) if the move
 * is refused.
 */
export function moveItem(state: GameState, config: GameConfig, from: Slot, to: Slot): boolean {
  const a = unit(state, from.unitId);
  const b = unit(state, to.unitId);
  if (!a || !b || a.dead || b.dead) return false;
  if (from.unitId === to.unitId && from.slot === to.slot) return false;
  const moving = cellAt(a, from.slot);
  if (!moving) return false;
  const target = cellAt(b, to.slot);

  const size = itemDef(config, moving.item).stack;
  if (target && target.item === moving.item && size > 1) {
    const moved = Math.min(size - target.count, moving.count);
    if (moved <= 0) return false;
    target.count += moved;
    moving.count -= moved;
    if (moving.count === 0) putCell(a, from.slot, null);
    return true;
  }

  if (!accepts(config, b, to.slot, moving.item)) return false;
  if (target && !accepts(config, a, from.slot, target.item)) return false;

  const savedA = snapshot(a);
  const savedB = a === b ? null : snapshot(b);
  if (target) {
    putCell(a, from.slot, target);
    putCell(b, to.slot, moving);
  } else {
    putCell(a, from.slot, null);
    putCell(b, to.slot, moving);
  }
  if (consistent(config, a) && consistent(config, b)) return true;
  restore(a, savedA);
  if (savedB) restore(b, savedB);
  return false;
}

/** Puts what a hand or the chest holds into the backpack. */
export function unequipSlot(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  slot: keyof Equipment,
): boolean {
  const s = unit(state, soldierId);
  const item = s?.equipment[slot];
  if (!s || s.dead || item === null || item === undefined) return false;
  const held = isHand(slot) ? s.weaponStates[slot] : undefined;
  if (!addToBackpack(config, s, item, held)) return false;
  if (isHand(slot)) delete s.weaponStates[slot];
  s.equipment[slot] = null;
  return true;
}

/**
 * Equips a backpack weapon in the right hand (or armor on the chest), swapping what was
 * there into its backpack slot. A two-handed weapon also stows the left-hand item.
 */
export function equipFromBackpack(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  index: number,
): boolean {
  const s = unit(state, soldierId);
  const stack = s?.backpack[index];
  if (!s || s.dead || !stack) return false;
  const def = itemDef(config, stack.item);
  const slot = def.type === 'armor' ? 'chest' : def.type === 'weapon' ? 'rightHand' : null;
  if (slot === null || !accepts(config, s, slot, stack.item)) return false;

  const saved = snapshot(s);
  const old = s.equipment[slot];
  const oldState = slot === 'rightHand' ? s.weaponStates.rightHand : undefined;
  if (old === null) s.backpack.splice(index, 1);
  else
    s.backpack[index] = oldState
      ? { item: old, count: 1, state: oldState }
      : { item: old, count: 1 };
  s.equipment[slot] = stack.item;
  if (slot === 'rightHand') setHandState(s, 'rightHand', stack.state);
  const offHand = s.equipment.leftHand;
  if (def.type === 'weapon' && def.hands === 2 && offHand !== null) {
    if (!addToBackpack(config, s, offHand, s.weaponStates.leftHand)) {
      restore(s, saved);
      return false;
    }
    s.equipment.leftHand = null;
    delete s.weaponStates.leftHand;
  }
  if (consistent(config, s)) return true;
  restore(s, saved);
  return false;
}

/** Uses a backpack item: a medkit heals its unit (the others have no rule yet). */
export function useItem(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  index: number,
): boolean {
  const s = unit(state, soldierId);
  const stack = s?.backpack[index];
  if (!s || s.dead || !stack || s.kind === 'drone') return false;
  const def = itemDef(config, stack.item);
  const max = maxHealthOf(state, config, s);
  if (def.type !== 'medical' || s.health >= max) return false;
  s.health = Math.min(max, s.health + def.heal);
  if (--stack.count === 0) s.backpack.splice(index, 1);
  return true;
}

/** Moves one item from a crate into a unit's backpack (a plate is worn). Empty crates disappear. */
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
  if (!crate || item === undefined) return false;
  if (itemDef(config, item).type === 'plate') {
    // Armor is worn straight away instead of taking a backpack slot.
    if (s.kind === 'drone' || s.armor >= config.player.maxArmor) return false;
    s.armor = Math.min(config.player.maxArmor, s.armor + config.player.armorPlate);
  } else if (!addToBackpack(config, s, item, crate.states?.[index])) {
    return false;
  }
  crate.items.splice(index, 1);
  crate.states?.splice(index, 1);
  if (crate.items.length === 0) state.crates = state.crates.filter((c) => c !== crate);
  return true;
}

/** Moves a whole backpack stack from a unit into a nearby crate (one crate entry per item). */
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
  const stack = s.backpack[index];
  if (!crate || !stack) return false;
  s.backpack.splice(index, 1);
  // Ammo counts rounds, so a stack goes back as whole packs (rounded up).
  const def = itemDef(config, stack.item);
  const entries = def.type === 'ammo' ? Math.ceil(stack.count / def.pack) : stack.count;
  for (let i = 0; i < entries; i++) crate.items.push(stack.item);
  if (stack.state) {
    crate.states ??= [];
    crate.states[crate.items.length - 1] = stack.state;
  }
  return true;
}

function rollItem(state: GameState, config: GameConfig): string {
  const table = config.drops.table;
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  let roll = nextFloat(state.rng) * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll < 0) return entry.item;
  }
  return table[table.length - 1]!.item;
}

/** Rolls the drop chance for a dead zombie and, on success, creates a crate there. */
export function maybeDropCrate(state: GameState, config: GameConfig, pos: Vec2): void {
  const drops = config.drops;
  if (nextFloat(state.rng) >= drops.chance) return;

  const count =
    drops.minItems + Math.floor(nextFloat(state.rng) * (drops.maxItems - drops.minItems + 1));
  const items = Array.from({ length: count }, () => rollItem(state, config));
  const crate: Crate = { id: state.nextCrateId++, pos: { x: pos.x, z: pos.z }, items };
  state.crates.push(crate);
  while (state.crates.length > drops.maxCrates) state.crates.shift();
  state.events.push({ type: 'crateDropped', crateId: crate.id, pos: { ...crate.pos } });
}
