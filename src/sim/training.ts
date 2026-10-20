import { WEAPON_CLASSES, type GameConfig, type TrainingStat, type WeaponClass } from './config';
import { levelInfo } from './loot';
import { maxHealthOf, skillLevel } from './stats';
import type { GameState, Soldier } from './types';

/**
 * The fraction a unit's training adds to a stat: for every attribute point above the base and
 * every rank of a perk of the chosen class, `per` of that effect. The drone has no training.
 */
export function bonus(config: GameConfig, s: Soldier, stat: TrainingStat): number {
  if (s.kind === 'drone') return 0;
  const t = config.training;
  let total = 0;
  for (const [name, def] of Object.entries(t.attributes)) {
    const value = s.attributes[name];
    if (value === undefined) continue;
    for (const e of def.effects) if (e.stat === stat) total += (value - t.attributeBase) * e.per;
  }
  const cls = s.training.classId === null ? undefined : t.classes[s.training.classId];
  for (const p of cls?.perks ?? []) {
    if (p.stat === stat) total += (s.training.ranks[p.id] ?? 0) * p.per;
  }
  return total;
}

/** The best bonus any soldier on its feet has: squad-wide effects (a mender's cheaper repairs). */
export function squadBonus(state: GameState, config: GameConfig, stat: TrainingStat): number {
  let best = 0;
  for (const s of state.soldiers) {
    if (s.dead || s.downed || s.kind !== 'soldier') continue;
    best = Math.max(best, bonus(config, s, stat));
  }
  return best;
}

/** Weapon skill level: the level earned by kills plus the levels of expertise bought. */
export const skillOf = (config: GameConfig, s: Soldier, cls: WeaponClass): number =>
  skillLevel(config, s.skills[cls]).level + s.training.expertise[cls];

/** Skill points a soldier has not spent yet. */
export function pointsAvailable(config: GameConfig, s: Soldier): number {
  if (s.kind === 'drone') return 0;
  const earned = (levelInfo(s.xp, config).level - 1) * config.training.pointsPerLevel;
  return earned - s.training.spent;
}

const canSpend = (config: GameConfig, s: Soldier | undefined, cost: number) =>
  s !== undefined && !s.dead && s.kind === 'soldier' && pointsAvailable(config, s) >= cost;

/** Buys one point of an attribute (up to `attributeMax`). */
export function spendAttribute(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  attribute: string,
): boolean {
  const s = state.soldiers.find((u) => u.id === soldierId);
  const t = config.training;
  if (!canSpend(config, s, 1) || !s || !(attribute in t.attributes)) return false;
  const value = s.attributes[attribute] ?? t.attributeBase;
  if (value >= t.attributeMax) return false;
  const oldMax = maxHealthOf(state, config, s);
  s.attributes[attribute] = value + 1;
  s.training.spent += 1;
  // More health also heals by the difference, like a perk.
  const gained = maxHealthOf(state, config, s) - oldMax;
  if (gained > 0 && !s.downed) s.health += gained;
  return true;
}

/** Buys a level of expertise with a weapon class. */
export function spendExpertise(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  cls: WeaponClass,
): boolean {
  const s = state.soldiers.find((u) => u.id === soldierId);
  const t = config.training;
  if (!canSpend(config, s, t.expertiseCost) || !s) return false;
  if (!WEAPON_CLASSES.includes(cls) || s.training.expertise[cls] >= t.expertiseMax) return false;
  s.training.expertise[cls] += 1;
  s.training.spent += t.expertiseCost;
  return true;
}

/** Chooses the soldier's class (once). */
export function chooseClass(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  classId: string,
): boolean {
  const s = state.soldiers.find((u) => u.id === soldierId);
  const t = config.training;
  if (!canSpend(config, s, t.classCost) || !s) return false;
  if (s.training.classId !== null || !(classId in t.classes)) return false;
  s.training.classId = classId;
  s.training.spent += t.classCost;
  return true;
}

/** Buys one rank of a perk of the soldier's class. */
export function buyPerk(
  state: GameState,
  config: GameConfig,
  soldierId: number,
  perkId: string,
): boolean {
  const s = state.soldiers.find((u) => u.id === soldierId);
  const t = config.training;
  if (!canSpend(config, s, t.perkCost) || !s || s.training.classId === null) return false;
  const perk = t.classes[s.training.classId]?.perks.find((p) => p.id === perkId);
  if (!perk || (s.training.ranks[perk.id] ?? 0) >= perk.max) return false;
  s.training.ranks[perk.id] = (s.training.ranks[perk.id] ?? 0) + 1;
  s.training.spent += t.perkCost;
  return true;
}
