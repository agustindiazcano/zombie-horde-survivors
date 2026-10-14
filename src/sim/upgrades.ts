import type { GameConfig } from './config';
import { backpackFull } from './inventory';
import { nextFloat } from './rng';
import type { GameState, Mods } from './types';

export const baseMods = (): Mods => ({
  damage: 1,
  fireRate: 1,
  speed: 1,
  maxHealth: 1,
  regen: 0,
  pickupRadius: 1,
});

/** Adds up every perk stack taken so far into squad-wide multipliers. */
function computeMods(state: GameState, config: GameConfig): Mods {
  const mods = baseMods();
  for (const perk of config.perks.list) {
    const stacks = state.upgrades[perk.id] ?? 0;
    if (stacks === 0) continue;
    if (perk.stat === 'regen') mods.regen += perk.amount * stacks;
    else mods[perk.stat] += perk.amount * stacks;
  }
  return mods;
}

export const maxHealthOf = (state: GameState, config: GameConfig): number =>
  config.player.maxHealth * state.mods.maxHealth;

/** Takes one stack of a perk, refreshing the multipliers and healing for a max health gain. */
function addStack(state: GameState, config: GameConfig, perkId: string): boolean {
  const perk = config.perks.list.find((p) => p.id === perkId);
  const stacks = state.upgrades[perkId] ?? 0;
  if (!perk || stacks >= perk.maxStacks) return false;

  const oldMax = maxHealthOf(state, config);
  state.upgrades[perkId] = stacks + 1;
  state.mods = computeMods(state, config);
  const gained = maxHealthOf(state, config) - oldMax;
  if (gained > 0) for (const s of state.soldiers) if (!s.dead) s.health += gained;
  return true;
}

/** Rolls the next set of perk choices (random, skipping maxed perks), or clears the offer. */
function rollOffer(state: GameState, config: GameConfig): void {
  const pool = config.perks.list.filter((p) => (state.upgrades[p.id] ?? 0) < p.maxStacks);
  const offer: string[] = [];
  while (offer.length < config.perks.choices && pool.length > 0) {
    const i = Math.floor(nextFloat(state.rng) * pool.length);
    offer.push(pool.splice(i, 1)[0]!.id);
  }
  state.perkOffer = offer.length > 0 ? offer : null;
  if (offer.length === 0) state.pendingPerks = 0;
}

/** Called on level up: one perk pick per level gained. */
export function grantLevels(state: GameState, config: GameConfig, levels: number): void {
  state.pendingPerks += levels;
  if (state.perkOffer === null) rollOffer(state, config);
}

/** Picks one of the offered perks. Returns false if it isn't on offer. */
export function choosePerk(state: GameState, config: GameConfig, perkId: string): boolean {
  if (!state.perkOffer?.includes(perkId)) return false;
  if (!addStack(state, config, perkId)) return false;
  state.pendingPerks = Math.max(0, state.pendingPerks - 1);
  state.perkOffer = null;
  if (state.pendingPerks > 0) rollOffer(state, config);
  return true;
}

/** The shop is open only in the calm between waves. */
export const shopAvailable = (state: GameState): boolean =>
  state.status === 'playing' && state.spawner.phase === 'intermission';

export function shopCost(state: GameState, item: GameConfig['shop']['items'][number]): number {
  return Math.round(item.cost * (item.costGrowth ?? 1) ** (state.purchases[item.id] ?? 0));
}

/**
 * Buys a shop item with gold. `unitId` is the unit that receives weapons. Returns null on
 * success, or a short reason the purchase was refused.
 */
export function buyItem(
  state: GameState,
  config: GameConfig,
  itemId: string,
  unitId: number | null,
): string | null {
  const item = config.shop.items.find((i) => i.id === itemId);
  if (!item) return 'Unknown item';
  if (!shopAvailable(state)) return 'The shop is closed during a wave';
  const cost = shopCost(state, item);
  if (state.gold < cost) return 'Not enough gold';

  if (item.kind === 'heal') {
    const max = maxHealthOf(state, config);
    const hurt = state.soldiers.filter((s) => !s.dead && s.kind === 'soldier' && s.health < max);
    if (hurt.length === 0) return 'Everyone is already at full health';
    for (const s of hurt) s.health = max;
  } else if (item.kind === 'revive') {
    const fallen = state.soldiers.find((s) => s.dead && s.kind === 'soldier');
    const anchor = state.soldiers.find((s) => !s.dead && s.kind === 'soldier');
    if (!fallen) return 'No fallen soldier to bring back';
    fallen.dead = false;
    fallen.health = maxHealthOf(state, config) / 2;
    fallen.armor = 0;
    fallen.order = { type: 'follow' };
    fallen.fireCooldown = 0;
    if (anchor) {
      fallen.pos = { x: anchor.pos.x + 1, z: anchor.pos.z + 1 };
      fallen.prev = { ...fallen.pos };
    }
  } else if (item.kind === 'weapon') {
    // A drone gun goes straight onto an unarmed drone; anything else into the unit's backpack.
    const drone =
      item.target === 'drone_cannon'
        ? state.soldiers.find((s) => s.kind === 'drone' && !s.dead && s.weapon === null)
        : undefined;
    if (drone) {
      drone.weapon = item.target!;
    } else {
      const unit = state.soldiers.find((s) => s.id === unitId && !s.dead);
      if (!unit) return 'Select a living unit first';
      if (backpackFull(config, unit)) return 'That unit’s backpack is full';
      unit.backpack.push(item.target!);
    }
  } else if (!addStack(state, config, item.target!)) {
    return 'Already at the maximum';
  }

  state.gold -= cost;
  state.purchases[item.id] = (state.purchases[item.id] ?? 0) + 1;
  return null;
}
