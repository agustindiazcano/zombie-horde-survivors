import type { GameConfig } from './config';
import { nextFloat } from './rng';
import { skillLevel, weaponDef } from './stats';
import type { AimLine, GameState, HitKind, Soldier, Zombie } from './types';

/** How a hit landed: its kind and the damage multiplier that comes with it. */
export interface HitRoll {
  kind: HitKind;
  multiplier: number;
}

const BODY: HitRoll = { kind: 'body', multiplier: 1 };

/** Whether an enemy has a head to hit. */
const hasHead = (config: GameConfig, z: Zombie): boolean =>
  config.enemies[z.type]?.headshots !== false;

/** The enemy's standing height in metres, scaled by its size (bosses are bigger). */
const heightOf = (config: GameConfig, z: Zombie): number =>
  (config.enemies[z.type]?.height ?? config.hits.bodyHeight) * z.size;

/**
 * True if the line of sight passes through the top fraction of the enemy where the bullet
 * lands (`at`, a point on the ground under the hit). A little above the head still counts.
 */
function lineHitsHead(config: GameConfig, line: AimLine, z: Zombie, at: { x: number; z: number }) {
  const top = heightOf(config, z);
  const reach = Math.hypot(at.x - line.x, at.z - line.z);
  const h = line.height + line.slope * reach;
  return h >= top * (1 - config.hits.headFraction) && h <= top * 1.15;
}

/**
 * Decides what a hit is: a head hit, a critical hit or a plain one. The higher multiplier wins,
 * the two never stack. With a line of sight (third and first person) the head is where the line
 * passes; without one (top-down, the AI) it is a small chance that grows with skill and aiming and
 * shrinks with the aim error. `weaponId` is the item that struck (a gun or a melee weapon).
 */
export function rollHit(
  state: GameState,
  config: GameConfig,
  shooter: Soldier,
  weaponId: string | null,
  target: Zombie,
  /** Aim error of the shot in radians, and where it landed on the ground. */
  error: number,
  at: { x: number; z: number },
  /** False for a blow, which never reaches the head. */
  allowHead = true,
): HitRoll {
  const h = config.hits;
  const item = weaponId === null ? undefined : config.items[weaponId];
  const sheet = item?.type === 'weapon' ? item : undefined;
  const cls = weaponId === null ? 'melee' : weaponDef(config, weaponId).class;
  const level = skillLevel(config, shooter.skills[cls]).level;

  let head = false;
  if (allowHead && hasHead(config, target)) {
    if (shooter.aimLine) head = lineHitsHead(config, shooter.aimLine, target, at);
    else {
      const chance =
        (h.headChance *
          (shooter.aiming ? h.headChanceAim : 1) *
          (1 + h.headChanceSkill * (level - 1))) /
        (1 + h.headErrorPenalty * error);
      head = chance > 0 && nextFloat(state.rng) < chance;
    }
  }
  const critChance = (sheet?.critChance ?? h.critChance) + h.critSkillBonus * (level - 1);
  const crit = critChance > 0 && nextFloat(state.rng) < critChance;

  const headMult = head ? (sheet?.headMultiplier ?? h.headMultiplier) : 1;
  const critMult = crit ? (sheet?.critMultiplier ?? h.critMultiplier) : 1;
  if (headMult <= 1 && critMult <= 1) return BODY;
  // The higher of the two wins; a tie goes to the head.
  return headMult >= critMult
    ? { kind: 'head', multiplier: headMult }
    : { kind: 'crit', multiplier: critMult };
}
